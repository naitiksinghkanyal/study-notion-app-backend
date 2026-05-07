/**
 * sendEmail.js
 * Falls back to console logging if SMTP is not configured or fails.
 * This means forgot-password ALWAYS works in dev — link prints to terminal.
 */

const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, html }) => {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  // ── Dev mode: no credentials set → just log the link ─────────────────────
  const isConfigured =
    smtpUser &&
    smtpPass &&
    smtpUser !== 'your_email@gmail.com' &&
    smtpPass !== 'your_app_password';

  if (!isConfigured) {
    logEmail(to, subject, html);
    return; // success — no error thrown
  }

  // ── Try to send real email ────────────────────────────────────────────────
  try {
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth:   { user: smtpUser, pass: smtpPass },
      // Shorter timeout so it fails fast in dev
      connectionTimeout: 8000,
      greetingTimeout:   8000,
    });

    await transporter.sendMail({
      from:    `"EduPlatform" <${process.env.FROM_EMAIL || smtpUser}>`,
      to,
      subject,
      html,
    });

    console.log(`📧 Email sent to ${to}`);
  } catch (err) {
    // ── SMTP failed → fall back to console log, never crash the API ──────────
    console.error(`⚠️  SMTP failed (${err.message}) — falling back to console log:`);
    logEmail(to, subject, html);
    // Do NOT re-throw — let the API call succeed even if email fails
  }
};

function logEmail(to, subject, html) {
  const linkMatch = html.match(/href="([^"]+reset-password[^"]+)"/);
  const link = linkMatch ? linkMatch[1] : '(no link found)';

  console.log('\n' + '═'.repeat(55));
  console.log('📧  EMAIL (not sent — copy the link below)');
  console.log('═'.repeat(55));
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`\nReset link (paste into browser):\n${link}`);
  console.log('═'.repeat(55) + '\n');
}

module.exports = sendEmail;