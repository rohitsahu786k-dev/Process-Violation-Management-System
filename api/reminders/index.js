const { ObjectId } = require("mongodb");
const { getDb } = require("../_lib/db");

module.exports = async function handler(req, res) {
  try {
    const db = await getDb();
    const reminders = db.collection("reminders");

    if (req.method === "GET") {
      const docs = await reminders.find({}).sort({ nextReminderAt: 1 }).limit(200).toArray();
      return res.status(200).json({ reminders: docs });
    }

    if (req.method === "POST") {
      const payload = req.body || {};
      const doc = {
        title: payload.title || "PVMS Reminder",
        type: payload.type || "due",
        userId: payload.userId || "",
        email: payload.email,
        violationId: payload.violationId || "",
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        reminderBefore: Number(payload.reminderBefore || 0),
        status: payload.status || "Pending",
        escalationLevel: Number(payload.escalationLevel || 0),
        lastSentAt: null,
        nextReminderAt: payload.nextReminderAt ? new Date(payload.nextReminderAt) : new Date(),
        isActive: payload.isActive !== false,
        createdAt: new Date()
      };
      if (!doc.email) return res.status(400).json({ error: "email is required" });
      const result = await reminders.insertOne(doc);
      return res.status(201).json({ id: result.insertedId, reminder: doc });
    }

    if (req.method === "PUT") {
      const { id, ...updates } = req.body || {};
      if (!id) return res.status(400).json({ error: "id is required" });
      if (updates.dueDate) updates.dueDate = new Date(updates.dueDate);
      if (updates.nextReminderAt) updates.nextReminderAt = new Date(updates.nextReminderAt);
      await reminders.updateOne({ _id: new ObjectId(id) }, { $set: updates });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
