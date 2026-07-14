const CAPA_RECIPIENT_GROUP_IDS = [
  "employee",
  "managerHod",
  "capaOwner",
  "management",
  "defaultCc"
];

const DEFAULT_CAPA_OVERDUE_RECIPIENT_RULE = {
  to: ["employee", "managerHod"],
  cc: ["capaOwner", "management", "defaultCc"],
  customTo: "",
  customCc: ""
};

function parseEmails(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[;,]/);
  return values.map(item => String(item || "").trim()).filter(Boolean);
}

function uniqueEmails(values) {
  const seen = new Set();
  const result = [];
  values.flatMap(parseEmails).forEach(email => {
    const key = email.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(email);
    }
  });
  return result;
}

function normalizeGroups(groups, fallback) {
  if (!Array.isArray(groups)) return [...fallback];
  return [...new Set(groups.filter(group => CAPA_RECIPIENT_GROUP_IDS.includes(group)))];
}

function normalizeCapaOverdueRecipientRule(value) {
  const saved = value && typeof value === "object" ? value : {};
  const to = normalizeGroups(saved.to, DEFAULT_CAPA_OVERDUE_RECIPIENT_RULE.to);
  const cc = normalizeGroups(saved.cc, DEFAULT_CAPA_OVERDUE_RECIPIENT_RULE.cc)
    .filter(group => !to.includes(group));
  return {
    to,
    cc,
    customTo: String(saved.customTo || "").trim(),
    customCc: String(saved.customCc || "").trim()
  };
}

function resolveCapaOverdueRecipients({
  rule,
  violation,
  action,
  employee,
  hod,
  owner,
  managementEmails = [],
  defaultCc = []
}) {
  const normalizedRule = normalizeCapaOverdueRecipientRule(rule);
  const groups = {
    employee: [employee?.email, violation?.email],
    managerHod: [employee?.reportingToEmail, employee?.hodBuhEmail, hod?.email],
    capaOwner: [action?.ownerEmail, owner?.email],
    management: [employee?.managementEmail, ...managementEmails],
    defaultCc
  };
  const addressesFor = groupIds => uniqueEmails(groupIds.flatMap(group => groups[group] || []));
  let to = uniqueEmails([addressesFor(normalizedRule.to), normalizedRule.customTo]);

  // SMTP requires a primary recipient. Fall back only when the configured To sources
  // do not resolve to an address for this particular case.
  if (!to.length) {
    to = addressesFor(["employee", "managerHod", "capaOwner", "management", "defaultCc"]).slice(0, 1);
  }

  const toKeys = new Set(to.map(email => email.toLowerCase()));
  const cc = uniqueEmails([addressesFor(normalizedRule.cc), normalizedRule.customCc])
    .filter(email => !toKeys.has(email.toLowerCase()));
  return { to, cc, rule: normalizedRule };
}

module.exports = {
  CAPA_RECIPIENT_GROUP_IDS,
  DEFAULT_CAPA_OVERDUE_RECIPIENT_RULE,
  normalizeCapaOverdueRecipientRule,
  resolveCapaOverdueRecipients
};
