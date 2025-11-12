// Simple mailer wrapper. Uses nodemailer if available and SMTP env vars provided.
let transporter = null;
try {
  const nodemailer = require('nodemailer');
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
      secure: process.env.SMTP_SECURE === '1' || false,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    // verify transporter but don't throw on failure
    transporter.verify().then(()=> console.log('✅ Mailer ready')).catch(err=> console.warn('Mailer verify failed:', err.message));
  } else {
    console.log('✉️ SMTP not configured - mailer will only log.');
  }
} catch (e) {
  console.log('✉️ nodemailer not installed - mailer disabled. Install nodemailer to enable emails.');
}

async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    console.log('Mailer disabled - would send to:', to, 'subject:', subject, 'text:', text);
    return;
  }
  try {
    await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text, html });
  } catch (e) {
    console.warn('Mailer send failed:', e.message);
    throw e;
  }
}

module.exports = { sendMail };
