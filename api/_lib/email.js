const nodemailer = require("nodemailer");

function renderTemplate(template, variables = {}) {
  const replace = value => String(value || "").replace(/{{\s*([\w]+)\s*}}/g, (_, key) => variables[key] ?? "");
  return {
    subject: replace(template.subject),
    html: replace(template.body).replace(/\n/g, "<br>")
  };
}

function createTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("Email environment variables are not configured");
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

async function sendEmail({ to, cc, subject, html }) {
  const transporter = createTransporter();
  return transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    cc,
    subject,
    html
  });
}

module.exports = { renderTemplate, sendEmail };
