const assert = require("assert");
const { EMAIL_EVENTS, normalizeEmailSettings } = require("../api/_lib/email-settings");

// Exercise the real API handlers and cron job with isolated MongoDB and SMTP doubles.
let state = {};
let sends = [];
let failWrites = false;
let reminders = [];
const logs = [];
const db = { collection(name) {
  return {
    async findOne() { return name === "appState" ? structuredClone(state) : null; },
    async updateOne(filter, update) {
      if (failWrites) throw new Error("Database write failed");
      if (name !== "appState") return;
      for (const [path, value] of Object.entries(update.$set)) {
        const keys = path.split(".");
        let target = state;
        for (const key of keys.slice(0, -1)) target = target[key] ||= {};
        target[keys.at(-1)] = structuredClone(value);
      }
    },
    async insertOne(value) { logs.push(value); },
    find() { return { limit() { return { async toArray() { return reminders; } }; } }; }
  };
} };
require.cache[require.resolve("../api/_lib/db")] = { exports: { getDb: async () => db } };
const emailPath = require.resolve("../api/_lib/email");
const realEmail = require(emailPath);
require.cache[emailPath].exports = { ...realEmail, sendEmail: async mail => { sends.push(mail); } };
const handler = require("../api/email/[action]");
const cron = require("../api/cron/reminders");

async function call(action, body = {}, method = "POST") {
  const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
  const req = { method, query: { action }, body, headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } };
  await (action === "cron" ? cron : handler)(req, res);
  return res;
}

async function main() {
  assert(EMAIL_EVENTS.every(id => normalizeEmailSettings().events[id]));
  assert.equal((await call("settings", {}, "GET")).data.settings.enabled, true);
  assert.equal((await call("settings", { enabled: "false" })).statusCode, 400);
  assert.equal((await call("settings", { enabled: false, event: "$invalid" })).statusCode, 400);
  await call("settings", { enabled: false, event: "due" });
  await call("settings", { enabled: false });
  await call("settings", { enabled: true });
  assert.equal(state.emailSettings.events.due, false, "Global switch must preserve individual choices");
  failWrites = true;
  assert.equal((await call("settings", { enabled: false })).statusCode, 500);
  assert.equal(state.emailSettings.enabled, true);
  failWrites = false;

  const user = { id: "u2", name: "Test User", email: "test@example.com", active: true, password: "original-password", role: "HOD" };
  const payload = { to: user.email, email: user.email, user, template: { id: "caseRegistered", subject: "Test", body: "Test" } };
  for (const [event, action] of [["caseRegistered", "notification"], ["caseClosed", "notification"], ["passwordReset", "password-reset"], ["userInvite", "user-invite"]]) {
    state = { users: [structuredClone(user)], emailSettings: { events: { [event]: false } } };
    sends = [];
    payload.template.id = event;
    const result = await call(action, payload);
    assert.equal(result.data.disabled, true, event);
    assert.equal(sends.length, 0, event);
    assert.deepStrictEqual(state.users, [user], "Disabled account emails must not change credentials or reset tokens");
    await call("settings", { event, enabled: true });
    assert.equal((await call(action, payload)).statusCode, 200);
    assert.equal(sends.length, 1, `${event} must resume after enabling`);
  }

  state = { users: [user], emailSettings: { enabled: false } };
  sends = [];
  payload.template.id = "caseRegistered";
  for (const action of ["notification", "password-reset", "user-invite", "test", "cron"]) {
    await call(action, payload);
    assert.equal(sends.length, 0, `Global disable must block ${action}`);
  }
  await call("settings", { enabled: true });
  assert.equal((await call("test", payload)).statusCode, 200);
  assert.equal(sends.length, 1);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  state = {
    users: [user],
    violations: [{ id: "VMS-TEST", status: "Open", assignedHOD: user.name, assignedInvestigator: user.name,
      capaActions: [{ id: "overdue", ownerEmail: user.email }, { id: "due", ownerEmail: user.email, dueDate: today }] }],
    emailSettings: { events: { due: false, escalation: false, capaOverdue: false } }
  };
  reminders = [{ _id: "r1", type: "due", email: user.email, capaDueDate: today }];
  sends = [];
  await call("cron");
  assert.equal(sends.length, 0, "Disabled scheduled and automatic reminders must not send");
  for (const event of ["due", "escalation", "capaOverdue"]) {
    await call("settings", { event, enabled: true });
    sends = [];
    const result = await call("cron");
    assert.equal(result.statusCode, 200);
    assert(sends.length > 0, `${event} reminders must resume`);
    await call("settings", { event, enabled: false });
  }
  console.log("Email settings API and cron tests passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
