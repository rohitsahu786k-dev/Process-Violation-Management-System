const { sendEmail, renderTemplate } = require("../_lib/email");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { to, template } = req.body || {};
    if (!to || !template) return res.status(400).json({ error: "Missing recipient or template" });
    const rendered = renderTemplate(template, {
      userName: "PVMS User",
      violationId: "PVMS-TEST-0001",
      priority: "Major",
      dueDate: new Date().toISOString().slice(0, 10),
      status: "Submitted",
      assignedUser: "PVMS User",
      pendingDays: "2",
      summaryDate: new Date().toLocaleDateString("en-IN"),
      openCount: "0",
      pendingCount: "0",
      overdueCount: "0",
      closedCount: "0"
    });
    await sendEmail({ to, ...rendered });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
