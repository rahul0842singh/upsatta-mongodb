import nodemailer from 'nodemailer';

let cachedTransport = null;

export async function getTransport() {
  if (cachedTransport) return cachedTransport;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  // If Ethereal creds not provided, create a testing account dynamically
  let user = SMTP_USER;
  let pass = SMTP_PASS;
  if (!user || !pass) {
    const test = await nodemailer.createTestAccount();
    user = test.user;
    pass = test.pass;
    console.log('• Using Ethereal test account:', user);
  }

  cachedTransport = nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.ethereal.email',
    port: Number(SMTP_PORT || 587),
    secure: false,
    auth: { user, pass }
  });

  return cachedTransport;
}

export async function sendOtpEmail(to, otp) {
  const transporter = await getTransport();
  const from = process.env.MAIL_FROM || 'No Reply <no-reply@example.com>';

  const info = await transporter.sendMail({
    from,
    to,
    subject: 'Your password reset OTP',
    text: `Your OTP is: ${otp}\nIt will expire in ${process.env.OTP_EXP_MINUTES || 10} minutes.`,
    html: `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;">
        <h2>Password reset</h2>
        <p>Your one-time code is:</p>
        <div style="font-size: 22px; letter-spacing: 4px; font-weight: bold;">${otp}</div>
        <p style="color:#555;">This code expires in ${process.env.OTP_EXP_MINUTES || 10} minutes.</p>
      </div>
    `
  });

  // If Ethereal, log preview URL
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) {
    console.log('✉︎ Preview URL:', preview);
  } else {
    console.log('✉︎ OTP email sent:', info.messageId);
  }
}
