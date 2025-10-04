// scripts/smtp-test.js
require('dotenv').config();
const nodemailer = require('nodemailer');

(async () => {
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_PORT) === '465', // true only for 465
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  const info = await t.sendMail({
    from: process.env.MAIL_FROM,                   // must be verified/allowed sender
    to: 'your.real.inbox@yourdomain.com',         // where to receive
    subject: 'SendGrid SMTP test',
    text: 'If you can read this, SendGrid SMTP works 🎉'
  });

  console.log('Sent:', info.messageId);
})();
