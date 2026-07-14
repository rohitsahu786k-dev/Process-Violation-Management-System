const assert = require("assert");
const {
  DEFAULT_CAPA_OVERDUE_RECIPIENT_RULE,
  normalizeCapaOverdueRecipientRule,
  resolveCapaOverdueRecipients
} = require("../api/_lib/recipient-rules");

const context = {
  violation: { email: "employee@onepws.com" },
  action: { ownerEmail: "owner@onepws.com" },
  employee: {
    email: "employee@onepws.com",
    reportingToEmail: "manager@onepws.com",
    hodBuhEmail: "hod@onepws.com",
    managementEmail: "management@onepws.com"
  },
  hod: { email: "hod@onepws.com" },
  owner: { email: "owner@onepws.com" },
  managementEmails: ["management@onepws.com", "director@onepws.com"],
  defaultCc: ["process@onepws.com", "hod@onepws.com"]
};

const defaults = resolveCapaOverdueRecipients({
  ...context,
  rule: DEFAULT_CAPA_OVERDUE_RECIPIENT_RULE
});
assert.deepStrictEqual(defaults.to, [
  "employee@onepws.com",
  "manager@onepws.com",
  "hod@onepws.com"
]);
assert.deepStrictEqual(defaults.cc, [
  "owner@onepws.com",
  "management@onepws.com",
  "director@onepws.com",
  "process@onepws.com"
]);

const custom = resolveCapaOverdueRecipients({
  ...context,
  rule: {
    to: ["capaOwner"],
    cc: ["employee", "managerHod"],
    customTo: "extra@onepws.com; OWNER@onepws.com",
    customCc: "audit@onepws.com, extra@onepws.com"
  }
});
assert.deepStrictEqual(custom.to, ["owner@onepws.com", "extra@onepws.com"]);
assert.deepStrictEqual(custom.cc, [
  "employee@onepws.com",
  "manager@onepws.com",
  "hod@onepws.com",
  "audit@onepws.com"
]);

const normalized = normalizeCapaOverdueRecipientRule({
  to: ["employee", "employee", "invalid"],
  cc: ["employee", "management", "invalid"]
});
assert.deepStrictEqual(normalized.to, ["employee"]);
assert.deepStrictEqual(normalized.cc, ["management"]);

const fallback = resolveCapaOverdueRecipients({
  rule: { to: [], cc: [] },
  violation: {},
  action: { ownerEmail: "fallback@onepws.com" }
});
assert.deepStrictEqual(fallback.to, ["fallback@onepws.com"]);
assert.deepStrictEqual(fallback.cc, []);

console.log("CAPA recipient rule tests passed.");
