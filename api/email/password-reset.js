const { getDb } = require("../_lib/db");
const { sendEmail, renderTemplate } = require("../_lib/email");

const defaultTemplate = {
  id: "passwordReset",
  name: "Password Reset",
  subject: "PVMS Password Reset Instructions",
  body: "Dear {{userName}},\n\nA password reset was requested for your PVMS account.\n\nLogin Email: {{email}}\nTemporary Password: {{temporaryPassword}}\nRequested By: {{resetRequestedBy}}\nRequested At: {{resetTime}}\n\nPlease sign in and contact the PVMS administrator if this request was not initiated by you.\n\nRegards,\nPVMS Automation System\nONEPWS Pvt. Ltd."
};

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function defaultPasswordFor(user) {
  if (user.role === "Master Admin") return "admin123";
  return "password123";
}

async function logEmail(db, entry) {
  try {
    await db.collection("emailLogs").insertOne({ ...entry, createdAt: new Date() });
  } catch (error) {
    console.error("Password reset email log failed:", error.message);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const email = normalizeEmail(req.body?.email);
  const requestedBy = String(req.body?.requestedBy || "Forgot Password").trim();
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const db = await getDb();
    const state = await db.collection("appState").findOne({ _id: "global" }) || {};
    const users = Array.isArray(state.users) ? state.users : [];
    const user = users.find(u => normalizeEmail(u.email) === email && u.active !== false);

    if (!user) {
      await logEmail(db, { type: "password-reset", to: email, status: "skipped", error: "Registered active user not found" });
      return res.status(200).json({ ok: true, sent: false });
    }

    const savedTemplate = Array.isArray(state.emailTemplates)
      ? state.emailTemplates.find(t => t && t.id === "passwordReset")
      : null;
    const template = savedTemplate || defaultTemplate;
    const rendered = renderTemplate(template, {
      userName: user.name || "PVMS User",
      email,
      temporaryPassword: defaultPasswordFor(user),
      resetRequestedBy: requestedBy || "PVMS Admin",
      resetTime: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    });

    try {
      await sendEmail({ to: email, ...rendered });
      await logEmail(db, { type: "password-reset", to: email, subject: rendered.subject, status: "sent", requestedBy });
      return res.status(200).json({ ok: true, sent: true });
    } catch (sendError) {
      await logEmail(db, { type: "password-reset", to: email, subject: rendered.subject, status: "failed", error: sendError.message, requestedBy });
      throw sendError;
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
