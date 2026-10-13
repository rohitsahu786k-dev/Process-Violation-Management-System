const EMAIL_EVENTS = ["caseRegistered", "caseClosed", "userInvite", "passwordReset", "due", "escalation", "capaOverdue"];

function normalizeEmailSettings(value = {}) {
  return {
    enabled: value?.enabled !== false,
    events: Object.fromEntries(EMAIL_EVENTS.map(id => [id, value?.events?.[id] !== false]))
  };
}

function isEmailEnabled(state, event) {
  const settings = normalizeEmailSettings(state?.emailSettings);
  return settings.enabled && (!event || settings.events[event] !== false);
}

module.exports = { EMAIL_EVENTS, normalizeEmailSettings, isEmailEnabled };
