const { getDb } = require("../_lib/db");
const { sendEmail, renderTemplate } = require("../_lib/email");

const defaultTemplate = {
  subject: "PVMS Reminder: {{violationId}} requires action",
  body: "Dear {{userName}},\n\nThis is an automated reminder for {{violationId}}.\n\nDue Date: {{dueDate}}\nStatus: {{status}}\n\nRegards,\nPVMS Automation System"
};

module.exports = async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const db = await getDb();
    const now = new Date();
    const reminders = await db.collection("reminders").find({
      isActive: true,
      nextReminderAt: { $lte: now }
    }).limit(50).toArray();

    let sent = 0;
    for (const reminder of reminders) {
      try {
        const rendered = renderTemplate(reminder.template || defaultTemplate, {
          userName: reminder.userName || "PVMS User",
          violationId: reminder.violationId || "PVMS",
          dueDate: reminder.dueDate ? new Date(reminder.dueDate).toLocaleDateString("en-IN") : "",
          status: reminder.status || "Pending"
        });
        await sendEmail({ to: reminder.email, ...rendered });
        sent++;
        await db.collection("reminders").updateOne(
          { _id: reminder._id },
          { $set: { lastSentAt: now, nextReminderAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) } }
        );
        await db.collection("emailLogs").insertOne({
          reminderId: reminder._id,
          to: reminder.email,
          subject: rendered.subject,
          status: "sent",
          createdAt: now
        });
      } catch (error) {
        await db.collection("emailLogs").insertOne({
          reminderId: reminder._id,
          to: reminder.email,
          status: "failed",
          error: error.message,
          createdAt: now
        });
      }
    }
    return res.status(200).json({ checked: reminders.length, sent });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
