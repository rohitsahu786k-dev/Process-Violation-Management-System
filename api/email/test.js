const { sendEmail, renderTemplate } = require("../_lib/email");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { to, template } = req.body || {};
    if (!to || !template) return res.status(400).json({ error: "Missing recipient or template" });
    const rendered = renderTemplate(template, {
      userName: "PVMS User",
      employeeName: "PVMS User",
      violationId: "PVMS-TEST-0001",
      caseId: "PVMS-TEST-0001",
      department: "PWS Floor",
      category: "Process Non-Adherence",
      severity: "Major",
      priority: "Major",
      dueDate: new Date().toISOString().slice(0, 10),
      incidentDate: `${new Date().getDate()}/${new Date().getMonth() + 1}/${new Date().getFullYear()}`,
      closureDate: `${new Date().getDate()}/${new Date().getMonth() + 1}/${new Date().getFullYear()}`,
      status: "Submitted",
      assignedUser: "PVMS User",
      assignedHOD: "Department HOD",
      assignedInvestigator: "PVMS Investigator",
      pendingDays: "2",
      summaryDate: `${new Date().getDate()}/${new Date().getMonth() + 1}/${new Date().getFullYear()}`,
      summaryMonth: `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][new Date().getMonth()]} ${new Date().getFullYear()}`,
      openCount: "0",
      pendingCount: "0",
      overdueCount: "0",
      closedCount: "0",
      email: "pvms.user@example.com",
      temporaryPassword: "password123",
      resetRequestedBy: "Master Admin",
      resetTime: `${new Date().getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][new Date().getMonth()]} ${new Date().getFullYear()}, ${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
    });
    await sendEmail({ to, ...rendered });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
