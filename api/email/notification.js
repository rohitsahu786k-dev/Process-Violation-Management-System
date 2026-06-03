const { sendEmail, renderTemplate } = require("../_lib/email");
const { getDb } = require("../_lib/db");

async function logNotification(entry) {
  try {
    const db = await getDb();
    await db.collection("emailLogs").insertOne({ ...entry, createdAt: new Date() });
  } catch (error) {
    console.error("Email log failed:", error.message);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { to, cc, template, variables } = req.body || {};
    if (!to || !template) return res.status(400).json({ error: "Missing recipient or template" });
    
    const rendered = renderTemplate(template, variables || {});
    try {
      await sendEmail({ to, cc, ...rendered });
      await logNotification({ type: "notification", to, cc, subject: rendered.subject, status: "sent" });
    } catch (sendError) {
      await logNotification({ type: "notification", to, cc, subject: rendered.subject, status: "failed", error: sendError.message });
      throw sendError;
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
