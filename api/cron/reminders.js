const { getDb } = require("../_lib/db");
const { sendEmail, renderTemplate, normalizePortalUrl } = require("../_lib/email");

const PVMS_TIME_ZONE = "Asia/Kolkata";
const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED_CASE_STATUSES = new Set(["Closed", "Rejected", "Archived"]);
const CLOSED_CAPA_STATUSES = new Set(["Completed", "Verified", "Closed"]);

const defaultTemplate = {
  id: "due",
  name: "Investigation Due Date Reminder",
  subject: "PVMS Reminder: {{violationId}} investigation due on {{dueDate}}",
  body: "Dear {{userName}},\n\nThis is an automated reminder for the pending PVMS investigation assigned to you.\n\nCase ID: {{violationId}}\nPriority: {{priority}}\nInvestigation Due Date: {{dueDate}}\nCAPA Target Due Date: {{capaDueDate}}\nCurrent Status: {{status}}\nCase Description: {{caseDescription}}\nPVMS Portal: {{portalUrl}}\n\nPlease complete the investigation before the due date. If support is needed, coordinate with your HOD.\n\nRegards,\nPVMS Automation System\nONEPWS Pvt. Ltd."
};

const investigationEscalationTemplate = {
  id: "escalation",
  name: "Escalation Reminder",
  subject: "PVMS Escalation: Investigation due date missed for {{violationId}}",
  body: "Dear Manager,\n\nThe following PVMS case has missed its investigation due date and remains unresolved.\n\nCase ID: {{violationId}}\nAssigned User: {{assignedUser}}\nInvestigation Due Date: {{dueDate}}\nRoot Cause: {{rootCause}}\nPending Since: {{pendingDays}} days\nCase Description: {{caseDescription}}\nPVMS Portal: {{portalUrl}}\n\nPlease review the case and take the necessary action.\n\nRegards,\nPVMS Automation System\nONEPWS Pvt. Ltd."
};

const capaOverdueTemplate = {
  id: "capaOverdue",
  name: "CAPA Target Due Date Missed",
  subject: "PVMS CAPA Escalation: Target due date missed for {{violationId}}",
  body: "Dear Manager,\n\nThe following CAPA action has missed its target due date and remains pending.\n\nCase ID: {{violationId}}\nCAPA Type: {{capaActionType}}\nCAPA Owner: {{capaOwner}}\nTarget Due Date: {{capaDueDate}}\nPending Since: {{pendingDays}} days\nCAPA Description: {{capaActionDescription}}\nCase Description: {{caseDescription}}\nPVMS Portal: {{portalUrl}}\n\nPlease review the CAPA action and ensure closure.\n\nRegards,\nPVMS Automation System\nONEPWS Pvt. Ltd."
};

function normalizeStatus(status) {
  const value = String(status || "Open").trim();
  if (value === "Submitted" || value === "Under Review") return "Open";
  return value || "Open";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function uniqueEmails(values) {
  const seen = new Set();
  const result = [];
  values.flat().forEach(value => {
    const email = String(value || "").trim();
    const key = email.toLowerCase();
    if (email && !seen.has(key)) {
      seen.add(key);
      result.push(email);
    }
  });
  return result;
}

function activeUsers(users) {
  return Array.isArray(users) ? users.filter(user => user && user.active !== false) : [];
}

function findUserByIdNameOrEmail(users, value) {
  const raw = String(value || "").trim();
  const email = normalizeEmail(raw);
  return activeUsers(users).find(user =>
    user.id === raw ||
    user.name === raw ||
    normalizeEmail(user.email) === email
  );
}

function findCaseEmployee(violation, users) {
  return activeUsers(users).find(user => user.id === violation.empId)
    || activeUsers(users).find(user => normalizeEmail(user.email) === normalizeEmail(violation.email))
    || activeUsers(users).find(user => user.name === violation.empName);
}

function findCaseHod(violation, employee, users) {
  const hodEmail = normalizeEmail(employee?.hodBuhEmail);
  return activeUsers(users).find(user => user.name === violation.assignedHOD)
    || activeUsers(users).find(user => user.role === "HOD" && user.dept === violation.dept)
    || activeUsers(users).find(user => normalizeEmail(user.email) === hodEmail);
}

function managementEmails(users) {
  return activeUsers(users)
    .filter(user => user.role === "Management")
    .map(user => user.email);
}

function localDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PVMS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function dateKey(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : localDateKey(date);
}

function isMissedDate(value, todayKey) {
  const key = dateKey(value);
  return key && key < todayKey;
}

function pendingDays(value, todayKey) {
  const dueKey = dateKey(value);
  if (!dueKey) return "";
  const due = new Date(`${dueKey}T00:00:00Z`).getTime();
  const today = new Date(`${todayKey}T00:00:00Z`).getTime();
  return String(Math.max(1, Math.floor((today - due) / DAY_MS)));
}

function formatEmailDate(value) {
  const key = dateKey(value);
  if (!key) return "";
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}

function templateFromState(state, id, fallback) {
  const saved = Array.isArray(state.emailTemplates)
    ? state.emailTemplates.find(template => template && template.id === id)
    : null;
  if (!saved) return fallback;
  if (id === "escalation" && (/crossed its due date/i.test(String(saved.body || "")) || /\{\{violationId\}\}\s+is overdue/i.test(String(saved.subject || "")))) {
    return fallback;
  }
  if (id === "capaOverdue" && !String(saved.body || "").includes("{{capaDueDate}}")) {
    return fallback;
  }
  const merged = { ...fallback, ...saved };
  let body = String(merged.body || "");
  if (id === "due" && !body.includes("{{capaDueDate}}")) {
    body = body.replace("Investigation Due Date: {{dueDate}}", "Investigation Due Date: {{dueDate}}\nCAPA Target Due Date: {{capaDueDate}}");
  }
  if (id === "escalation" && !body.includes("{{rootCause}}")) {
    body = body.replace("Investigation Due Date: {{dueDate}}", "Investigation Due Date: {{dueDate}}\nRoot Cause: {{rootCause}}");
  }
  merged.body = body;
  return merged;
}

async function logReminderEmail(db, entry) {
  await db.collection("emailLogs").insertOne({ ...entry, createdAt: new Date() });
}

async function sendOncePerDay(db, { reminderKey, reminderDate, type, to, cc, template, variables }) {
  const toList = uniqueEmails(to);
  if (!toList.length) return { sent: false, skipped: true };

  const existing = await db.collection("emailLogs").findOne({
    reminderKey,
    reminderDate,
    status: "sent"
  });
  if (existing) return { sent: false, skipped: true };

  const rendered = renderTemplate(template, variables);
  try {
    await sendEmail({ to: toList, cc: uniqueEmails(cc), ...rendered });
    await logReminderEmail(db, {
      type,
      reminderKey,
      reminderDate,
      to: toList,
      cc: uniqueEmails(cc),
      subject: rendered.subject,
      status: "sent"
    });
    return { sent: true, skipped: false };
  } catch (error) {
    await logReminderEmail(db, {
      type,
      reminderKey,
      reminderDate,
      to: toList,
      cc: uniqueEmails(cc),
      subject: rendered.subject,
      status: "failed",
      error: error.message
    });
    return { sent: false, skipped: false };
  }
}

async function processScheduledReminders(db, state, now) {
  const reminders = await db.collection("reminders").find({
    isActive: true,
    nextReminderAt: { $lte: now }
  }).limit(50).toArray();

  let sent = 0;
  const violations = Array.isArray(state.violations) ? state.violations : [];

  for (const reminder of reminders) {
    try {
      const type = reminder.type || "due";
      const template = templateFromState(state, type, defaultTemplate);
      
      const violation = violations.find(v => v.id === reminder.violationId);
      let capaDueDateStr = "";
      let priorityStr = "";
      if (violation) {
        priorityStr = violation.severity || "";
        const pendingCapa = (violation.capaActions || [])
          .filter(a => !CLOSED_CAPA_STATUSES.has(normalizeStatus(a.status)));
        if (pendingCapa.length > 0) {
          const sorted = pendingCapa.filter(a => a.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
          if (sorted.length > 0) {
            capaDueDateStr = formatEmailDate(sorted[0].dueDate);
          }
        }
      }

      const rendered = renderTemplate(reminder.template || template, {
        userName: reminder.userName || "PVMS User",
        violationId: reminder.violationId || "PVMS",
        caseDescription: reminder.caseDescription || reminder.description || "",
        dueDate: formatEmailDate(reminder.dueDate),
        status: reminder.status || "Pending",
        portalUrl: normalizePortalUrl(reminder.portalUrl),
        capaDueDate: capaDueDateStr,
        priority: priorityStr
      });
      await sendEmail({ to: reminder.email, ...rendered });
      sent++;
      await db.collection("reminders").updateOne(
        { _id: reminder._id },
        { $set: { lastSentAt: now, nextReminderAt: new Date(now.getTime() + DAY_MS) } }
      );
      await logReminderEmail(db, {
        reminderId: reminder._id,
        to: reminder.email,
        subject: rendered.subject,
        status: "sent"
      });
    } catch (error) {
      await logReminderEmail(db, {
        reminderId: reminder._id,
        to: reminder.email,
        status: "failed",
        error: error.message
      });
    }
  }

  return { checked: reminders.length, sent };
}

async function processInvestigationDueMissed(db, state, now) {
  const todayKey = localDateKey(now);
  const users = activeUsers(state.users);
  const violations = Array.isArray(state.violations) ? state.violations : [];
  const template = templateFromState(state, "escalation", investigationEscalationTemplate);
  const portalUrl = normalizePortalUrl(state.portalUrl);
  let checked = 0;
  let sent = 0;

  for (const violation of violations) {
    const status = normalizeStatus(violation.status);
    if (CLOSED_CASE_STATUSES.has(status) || !isMissedDate(violation.dueDate, todayKey)) continue;

    checked++;
    const employee = findCaseEmployee(violation, users);
    const hod = findCaseHod(violation, employee, users);
    const investigator = findUserByIdNameOrEmail(users, violation.assignedInvestigator);
    const management = managementEmails(users);
    const to = uniqueEmails([investigator?.email, hod?.email, ...management]);
    const cc = uniqueEmails([
      employee?.reportingToEmail,
      employee?.hodBuhEmail,
      employee?.managementEmail,
      hod?.email,
      ...management
    ]).filter(email => !to.some(item => normalizeEmail(item) === normalizeEmail(email)));

    const result = await sendOncePerDay(db, {
      reminderKey: `investigation-overdue:${violation.id}:${dateKey(violation.dueDate)}`,
      reminderDate: todayKey,
      type: "investigation-overdue",
      to,
      cc,
      template,
      variables: {
        userName: investigator?.name || hod?.name || "PVMS User",
        employeeName: employee?.name || violation.empName || "Employee",
        violationId: violation.id || "",
        assignedUser: investigator?.name || violation.assignedInvestigator || hod?.name || "Unassigned",
        dueDate: formatEmailDate(violation.dueDate),
        rootCause: violation.rootCause || "Pending Investigation",
        pendingDays: pendingDays(violation.dueDate, todayKey),
        status,
        caseDescription: violation.description || "",
        portalUrl
      }
    });
    if (result.sent) sent++;
  }

  return { checked, sent };
}

async function processCapaTargetMissed(db, state, now) {
  const todayKey = localDateKey(now);
  const users = activeUsers(state.users);
  const violations = Array.isArray(state.violations) ? state.violations : [];
  const template = templateFromState(state, "capaOverdue", capaOverdueTemplate);
  const portalUrl = normalizePortalUrl(state.portalUrl);
  let checked = 0;
  let sent = 0;

  for (const violation of violations) {
    const caseStatus = normalizeStatus(violation.status);
    if (CLOSED_CASE_STATUSES.has(caseStatus)) continue;

    const employee = findCaseEmployee(violation, users);
    const hod = findCaseHod(violation, employee, users);
    const management = managementEmails(users);
    const actions = Array.isArray(violation.capaActions) ? violation.capaActions : [];

    for (const [index, action] of actions.entries()) {
      const actionStatus = normalizeStatus(action.status);
      if (CLOSED_CAPA_STATUSES.has(actionStatus) || !isMissedDate(action.dueDate, todayKey)) continue;

      checked++;
      const owner = findUserByIdNameOrEmail(users, action.ownerId || action.owner || action.ownerEmail);
      const to = uniqueEmails([action.ownerEmail, owner?.email, hod?.email, ...management]);
      const cc = uniqueEmails([
        employee?.reportingToEmail,
        employee?.hodBuhEmail,
        employee?.managementEmail,
        hod?.email,
        ...management
      ]).filter(email => !to.some(item => normalizeEmail(item) === normalizeEmail(email)));

      const result = await sendOncePerDay(db, {
        reminderKey: `capa-overdue:${violation.id}:${action.id || index}:${dateKey(action.dueDate)}`,
        reminderDate: todayKey,
        type: "capa-overdue",
        to,
        cc,
        template,
        variables: {
          userName: owner?.name || action.owner || "PVMS User",
          employeeName: employee?.name || violation.empName || "Employee",
          violationId: violation.id || "",
          assignedUser: owner?.name || action.owner || "Unassigned",
          dueDate: formatEmailDate(violation.dueDate),
          capaActionType: action.type || "CAPA",
          capaActionDescription: action.description || "",
          capaOwner: owner?.name || action.owner || "Unassigned",
          capaDueDate: formatEmailDate(action.dueDate),
          pendingDays: pendingDays(action.dueDate, todayKey),
          status: actionStatus,
          caseDescription: violation.description || "",
          portalUrl
        }
      });
      if (result.sent) sent++;
    }
  }

  return { checked, sent };
}

module.exports = async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const db = await getDb();
    const now = new Date();
    const state = await db.collection("appState").findOne({ _id: "global" }) || {};

    const scheduled = await processScheduledReminders(db, state, now);
    const investigationDueMissed = await processInvestigationDueMissed(db, state, now);
    const capaTargetMissed = await processCapaTargetMissed(db, state, now);

    return res.status(200).json({
      scheduled,
      investigationDueMissed,
      capaTargetMissed,
      checked: scheduled.checked + investigationDueMissed.checked + capaTargetMissed.checked,
      sent: scheduled.sent + investigationDueMissed.sent + capaTargetMissed.sent
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
