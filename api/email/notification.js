const { sendEmail, renderTemplate } = require("../_lib/email");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { to, cc, template, variables } = req.body || {};
    if (!to || !template) return res.status(400).json({ error: "Missing recipient or template" });
    
    const rendered = renderTemplate(template, variables || {});
    await sendEmail({ to, cc, ...rendered });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
