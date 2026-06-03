import nodemailer from "nodemailer";

// Hostinger SMTP — credenciais fixas conforme solicitado pelo dono do projeto.
// Podem ser sobrescritas por env vars no VPS se desejado.
const SMTP_HOST = process.env.SMTP_HOST ?? "smtp.hostinger.com";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 465);
const SMTP_USER = process.env.SMTP_USER ?? "suporte@mro.bio";
const SMTP_PASS = process.env.SMTP_PASS ?? "29041997Ga@@";
const SMTP_FROM = process.env.SMTP_FROM ?? '"MRO.bio" <suporte@mro.bio>';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendEmail(opts: {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text?: string | null;
}) {
  const t = getTransporter();
  const to = opts.toName ? `"${opts.toName.replace(/"/g, "")}" <${opts.to}>` : opts.to;
  const info = await t.sendMail({
    from: SMTP_FROM,
    to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? undefined,
  });
  return info.messageId;
}
