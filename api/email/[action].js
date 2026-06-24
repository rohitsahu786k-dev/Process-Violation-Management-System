const { getDb } = require("../_lib/db");
const { sendEmail, renderTemplate, normalizePortalUrl } = require("../_lib/email");
const crypto = require("crypto");

const passwordResetTemplate = {
  id: "passwordReset",
  name: "Password Reset",
  subject: "PVMS Password Reset Instructions",
  body: "Dear {{userName}},\n\nA password reset was requested for your PVMS account.\n\nLogin Email: {{email}}\nRequested By: {{resetRequestedBy}}\nRequested At: {{resetTime}}\nReset Link: {{resetLink}}\nPVMS Portal: {{portalUrl}}\n\nPlease open the reset link above and create a new password. This link will expire in 60 minutes.\n\nIf this request was not initiated by you, please contact the PVMS Administrator immediately.\n\nRegards,\nPVMS Automation System\nONEPWS Pvt. Ltd."
};

const userInviteTemplate = {
  id: "userInvite",
  name: "New User Welcome",
  subject: "Welcome to ONEPWS Process Violation Management System (PVMS Portal)",
  body: "Dear {{userName}},\n\nWelcome to ONEPWS's online Process Violation Management System (PVMS Portal).\n\nYour account has been successfully created by Admin. Please login to the portal using below mentioned credentials:\n\nPVMS Portal: {{portalUrl}}\nLogin Email: {{email}}\nLogin Password: {{temporaryPassword}}\nAccount Created By: {{resetRequestedBy}}\nAccount Created On: {{resetTime}}\n\nPlease log in using the above credentials and explore the portal for further actions.\n\nFor any support or queries, kindly contact the PVMS Administrator.\n\nRegards,\nPVMS Automation System\nONEPWS Pvt. Ltd."
};

function routeAction(req) {
  const queryAction = Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action;
  if (queryAction) return queryAction;
  const url = new URL(req.url || "", "http://localhost");
  return url.pathname.split("/").filter(Boolean).pop();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generateTemporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let value = "PVMS-";
  for (let i = 0; i < 8; i++) value += chars[Math.floor(Math.random() * chars.length)];
  return value;
}

function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function appendPortalParams(portalUrl, params) {
  const url = new URL(normalizePortalUrl(portalUrl));
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  return url.toString();
}

function getTemplate(state, id, fallback, requiredVariable) {
  const saved = Array.isArray(state.emailTemplates)
    ? state.emailTemplates.find(t => t && t.id === id)
    : null;
  if (saved && (!requiredVariable || String(saved.body || "").includes(requiredVariable))) return saved;
  return fallback;
}

const PVMS_TIME_ZONE = "Asia/Kolkata";

function formatLocalTime(date) {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: PVMS_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${Number(parts.day)} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} IST`;
}

async function logEmail(entry) {
  try {
    const db = await getDb();
    await db.collection("emailLogs").insertOne({ ...entry, createdAt: new Date() });
  } catch (error) {
    console.error("Email log failed:", error.message);
  }
}

async function handleNotification(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { to, cc, template, variables } = req.body || {};
    if (!to || !template) return res.status(400).json({ error: "Missing recipient or template" });

    const rendered = renderTemplate(template, variables || {});
    try {
      await sendEmail({ to, cc, ...rendered });
      await logEmail({ type: "notification", to, cc, subject: rendered.subject, status: "sent" });
    } catch (sendError) {
      await logEmail({ type: "notification", to, cc, subject: rendered.subject, status: "failed", error: sendError.message });
      throw sendError;
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handlePasswordReset(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const email = normalizeEmail(req.body?.email);
  const requestedBy = String(req.body?.requestedBy || "Forgot Password").trim();
  const portalUrl = normalizePortalUrl(req.body?.portalUrl);
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const db = await getDb();
    const state = await db.collection("appState").findOne({ _id: "global" }) || {};
    const users = Array.isArray(state.users) ? state.users : [];
    const user = users.find(u => normalizeEmail(u.email) === email && u.active !== false);

    if (!user) {
      await logEmail({ type: "password-reset", to: email, status: "skipped", error: "Registered active user not found" });
      return res.status(200).json({ ok: true, sent: false });
    }

    const template = getTemplate(state, "passwordReset", passwordResetTemplate, "{{resetLink}}");
    const resetToken = generateResetToken();
    const resetLink = appendPortalParams(portalUrl, { resetToken, email });
    const resetTokenExpiresAt = Date.now() + 60 * 60 * 1000;
    const updatedUsers = users.map(u => normalizeEmail(u.email) === email
      ? { ...u, resetTokenHash: hashToken(resetToken), resetTokenExpiresAt, resetRequestedAt: Date.now(), resetRequestedBy: requestedBy }
      : u
    );
    await db.collection("appState").updateOne(
      { _id: "global" },
      { $set: { users: updatedUsers } },
      { upsert: true }
    );

    const rendered = renderTemplate(template, {
      userName: user.name || "PVMS User",
      email,
      temporaryPassword: "",
      resetRequestedBy: requestedBy || "PVMS Admin",
      resetTime: formatLocalTime(new Date()),
      resetLink,
      portalUrl
    });

    try {
      await sendEmail({ to: email, cc: ["jatin.chouhan@onepws.com"], ...rendered, skipCc: true });
      await logEmail({ type: "password-reset", to: email, subject: rendered.subject, status: "sent", requestedBy });
      return res.status(200).json({ ok: true, sent: true });
    } catch (sendError) {
      await logEmail({ type: "password-reset", to: email, subject: rendered.subject, status: "failed", error: sendError.message, requestedBy });
      throw sendError;
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleCompletePasswordReset(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const email = normalizeEmail(req.body?.email);
  const token = String(req.body?.token || "").trim();
  const password = String(req.body?.password || "");
  if (!email || !token || !password) return res.status(400).json({ error: "Email, reset token, and password are required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  try {
    const db = await getDb();
    const state = await db.collection("appState").findOne({ _id: "global" }) || {};
    const users = Array.isArray(state.users) ? state.users : [];
    const tokenHash = hashToken(token);
    const now = Date.now();
    const user = users.find(u =>
      normalizeEmail(u.email) === email &&
      u.active !== false &&
      u.resetTokenHash === tokenHash &&
      Number(u.resetTokenExpiresAt || 0) > now
    );

    if (!user) return res.status(400).json({ error: "Reset link is invalid or expired" });

    const updatedUsers = users.map(u => normalizeEmail(u.email) === email
      ? {
          ...u,
          password,
          passwordUpdatedAt: now,
          passwordResetAt: now,
          mustChangePassword: false,
          resetTokenHash: null,
          resetTokenExpiresAt: null,
          resetRequestedAt: null,
          resetRequestedBy: null
        }
      : u
    );
    await db.collection("appState").updateOne(
      { _id: "global" },
      { $set: { users: updatedUsers } },
      { upsert: true }
    );
    await logEmail({ type: "password-reset-complete", to: email, status: "completed" });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleUserInvite(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const email = normalizeEmail(req.body?.email);
  const requestedBy = String(req.body?.requestedBy || "PVMS Admin").trim();
  const portalUrl = normalizePortalUrl(req.body?.portalUrl);
  const userData = req.body?.user && typeof req.body.user === "object" ? req.body.user : {};
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const db = await getDb();
    const state = await db.collection("appState").findOne({ _id: "global" }) || {};
    const users = Array.isArray(state.users) ? state.users : [];
    const existingIndex = users.findIndex(u => normalizeEmail(u.email) === email);
    const existingUser = existingIndex >= 0 ? users[existingIndex] : null;
    const temporaryPassword = String(req.body?.temporaryPassword || existingUser?.password || generateTemporaryPassword()).trim();
    const now = Date.now();
    const invitedUser = {
      ...(existingUser || {}),
      ...userData,
      email,
      name: userData.name || existingUser?.name || "PVMS User",
      active: userData.active ?? existingUser?.active ?? true,
      password: temporaryPassword,
      passwordUpdatedAt: now,
      inviteSentAt: now,
      inviteSentBy: requestedBy,
      mustChangePassword: true
    };
    const updatedUsers = existingIndex >= 0
      ? users.map((u, index) => index === existingIndex ? invitedUser : u)
      : [...users, { id: userData.id || `u${now}`, role: userData.role || "User/Employee", complianceScore:100, violations:0, ...invitedUser }];

    await db.collection("appState").updateOne(
      { _id: "global" },
      { $set: { users: updatedUsers } },
      { upsert: true }
    );

    const template = getTemplate(state, "userInvite", userInviteTemplate);
    const rendered = renderTemplate(template, {
      userName: invitedUser.name || "PVMS User",
      email,
      temporaryPassword,
      resetRequestedBy: requestedBy || "PVMS Admin",
      resetTime: formatLocalTime(new Date(now)),
      resetLink: "",
      portalUrl
    });

    try {
      await sendEmail({ to: email, cc: ["jatin.chouhan@onepws.com"], ...rendered, skipCc: true });
      await logEmail({ type: "user-invite", to: email, subject: rendered.subject, status: "sent", requestedBy });
      return res.status(200).json({ ok: true, sent: true });
    } catch (sendError) {
      await logEmail({ type: "user-invite", to: email, subject: rendered.subject, status: "failed", error: sendError.message, requestedBy });
      throw sendError;
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleTest(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { to, template } = req.body || {};
    if (!to || !template) return res.status(400).json({ error: "Missing recipient or template" });
    const now = new Date();
    const rendered = renderTemplate(template, {
      userName: "All",
      employeeName: "PVMS User",
      violationId: "PVMS-TEST-0001",
      caseId: "PVMS-TEST-0001",
      department: "PWS Floor",
      category: "Process Non-Adherence",
      severity: "Major",
      priority: "Major",
      dueDate: now.toISOString().slice(0, 10),
      rootCause: "Bypassed standard operating procedure during shift changeover.",
      incidentDate: `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`,
      closureDate: `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`,
      status: "Submitted",
      assignedUser: "PVMS User",
      capaActionType: "Corrective",
      capaActionDescription: "Repair leakage points and verify waterproofing integrity.",
      capaOwner: "PVMS User",
      capaDueDate: "12 Jun 2026",
      assignedHOD: "Department HOD",
      assignedInvestigator: "PVMS Investigator",
      pendingDays: "2",
      summaryDate: `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`,
      summaryMonth: `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][now.getMonth()]} ${now.getFullYear()}`,
      openCount: "0",
      pendingCount: "0",
      overdueCount: "0",
      closedCount: "0",
      email: "pvms.user@example.com",
      temporaryPassword: "password123",
      resetRequestedBy: "Master Admin",
      resetTime: formatLocalTime(now),
      resetLink: appendPortalParams(normalizePortalUrl(req.body?.portalUrl), { resetToken:"sample-token", email:"pvms.user@example.com" }),
      portalUrl: normalizePortalUrl(req.body?.portalUrl)
    });
    await sendEmail({ to, ...rendered });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = async function handler(req, res) {
  const action = routeAction(req);

  if (action === "notification") return handleNotification(req, res);
  if (action === "password-reset") return handlePasswordReset(req, res);
  if (action === "complete-password-reset") return handleCompletePasswordReset(req, res);
  if (action === "user-invite") return handleUserInvite(req, res);
  if (action === "test") return handleTest(req, res);

  return res.status(404).json({ error: "Email action not found" });
};
