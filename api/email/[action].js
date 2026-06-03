const { getDb } = require("../_lib/db");
const { sendEmail, renderTemplate, normalizePortalUrl } = require("../_lib/email");

const passwordResetTemplate = {
  id: "passwordReset",
  name: "Password Reset",
  subject: "PVMS Password Reset Instructions",
  body: "Dear {{userName}},\n\nA password reset was requested for your PVMS account.\n\nLogin Email: {{email}}\nTemporary Password: {{temporaryPassword}}\nRequested By: {{resetRequestedBy}}\nRequested At: {{resetTime}}\nPVMS Portal: {{portalUrl}}\n\nPlease sign in using the temporary password above.\n\nRegards,\nPVMS Automation System\nONEPWS Pvt. Ltd."
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

function formatLocalTime(date) {
  const pad = n => String(n).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

    const savedTemplate = Array.isArray(state.emailTemplates)
      ? state.emailTemplates.find(t => t && t.id === "passwordReset")
      : null;
    const template = savedTemplate || passwordResetTemplate;
    const temporaryPassword = generateTemporaryPassword();
    const updatedUsers = users.map(u => normalizeEmail(u.email) === email
      ? { ...u, password: temporaryPassword, passwordUpdatedAt: Date.now(), mustChangePassword: true }
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
      temporaryPassword,
      resetRequestedBy: requestedBy || "PVMS Admin",
      resetTime: formatLocalTime(new Date()),
      portalUrl
    });

    try {
      await sendEmail({ to: email, ...rendered, skipCc: true });
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

async function handleTest(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { to, template } = req.body || {};
    if (!to || !template) return res.status(400).json({ error: "Missing recipient or template" });
    const now = new Date();
    const rendered = renderTemplate(template, {
      userName: "PVMS User",
      employeeName: "PVMS User",
      violationId: "PVMS-TEST-0001",
      caseId: "PVMS-TEST-0001",
      department: "PWS Floor",
      category: "Process Non-Adherence",
      severity: "Major",
      priority: "Major",
      dueDate: now.toISOString().slice(0, 10),
      incidentDate: `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`,
      closureDate: `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`,
      status: "Submitted",
      assignedUser: "PVMS User",
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
  if (action === "test") return handleTest(req, res);

  return res.status(404).json({ error: "Email action not found" });
};
