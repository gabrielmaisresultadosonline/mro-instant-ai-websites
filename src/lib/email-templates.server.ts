// HTML / text templates for every transactional email MRO.BIO sends.
// All templates are pure functions so the cron + webhook handlers can
// enqueue them into email_outbox; the VPS SMTP worker drains the queue.

const BRAND = "MRO.BIO";
const BASE = "https://mro.bio";

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0a0a0a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;max-width:600px">
<tr><td style="background:#FFD600;padding:22px 28px;font-weight:700;font-size:18px;color:#0a0a0a">${BRAND}</td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
<tr><td style="padding:18px 28px;background:#f5f5f5;font-size:12px;color:#666;text-align:center">
${BRAND} · <a href="${BASE}" style="color:#666">mro.bio</a> · suporte@mro.bio
</td></tr>
</table>
</td></tr></table></body></html>`;
}

export type Template =
  | { name: "activation"; data: { name: string; activationUrl: string } }
  | { name: "renewal_thanks"; data: { name: string; expiresAt: string } }
  | { name: "reminder_2d"; data: { name: string; expiresAt: string; renewUrl: string } }
  | { name: "reminder_1d"; data: { name: string; expiresAt: string; renewUrl: string } }
  | { name: "expired_grace"; data: { name: string; deleteAt: string; renewUrl: string } }
  | { name: "canceled"; data: { name: string } }
  | { name: "refunded"; data: { name: string } }
  | { name: "deleted"; data: { name: string } }
  | { name: "password_reset"; data: { name: string; resetUrl: string } };

export function renderTemplate(t: Template): { subject: string; html: string; text: string } {
  switch (t.name) {
    case "activation": {
      const { name, activationUrl } = t.data;
      const subject = `Bem-vindo ao ${BRAND}! Ative seu acesso.`;
      const html = shell(subject, `
        <p>Olá <strong>${escapeHtml(name)}</strong>,</p>
        <p>Sua compra foi confirmada. Para começar a usar o ${BRAND}, clique no botão abaixo para definir sua senha — o link vale por 7 dias.</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${activationUrl}" style="background:#FFD600;color:#0a0a0a;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:8px;display:inline-block">Ativar minha conta →</a>
        </p>
        <p style="font-size:13px;color:#666">Se o botão não funcionar, copie e cole no navegador:<br><span style="word-break:break-all">${activationUrl}</span></p>
        <p>Seu acesso é válido por <strong>1 ano</strong>. Renove quando quiser direto pela Kiwify.</p>
      `);
      return { subject, html, text: `Olá ${name}, sua compra foi confirmada. Ative sua conta: ${activationUrl}` };
    }
    case "renewal_thanks": {
      const { name, expiresAt } = t.data;
      const subject = `Pagamento confirmado — ${BRAND}`;
      const html = shell(subject, `
        <p>Olá <strong>${escapeHtml(name)}</strong>,</p>
        <p>Recebemos seu pagamento. Seu acesso ao ${BRAND} agora está garantido até <strong>${expiresAt}</strong>.</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${BASE}/dashboard" style="background:#FFD600;color:#0a0a0a;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;display:inline-block">Abrir meu painel</a>
        </p>
      `);
      return { subject, html, text: `Pagamento confirmado. Acesso válido até ${expiresAt}.` };
    }
    case "reminder_2d": {
      const { name, expiresAt, renewUrl } = t.data;
      const subject = `Seu acesso vence em 2 dias — ${BRAND}`;
      const html = shell(subject, `
        <p>Olá <strong>${escapeHtml(name)}</strong>,</p>
        <p>Seu acesso ao ${BRAND} vence em <strong>2 dias</strong> (${expiresAt}). Para evitar interrupção, renove agora.</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${renewUrl}" style="background:#FFD600;color:#0a0a0a;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;display:inline-block">Renovar agora</a>
        </p>
        <p style="font-size:13px;color:#666">Quando o prazo terminar, seu site fica fora do ar até a renovação.</p>
      `);
      return { subject, html, text: `Seu acesso vence em 2 dias (${expiresAt}). Renove: ${renewUrl}` };
    }
    case "reminder_1d": {
      const { name, expiresAt, renewUrl } = t.data;
      const subject = `⚠ Último dia — seu acesso ${BRAND} vence amanhã`;
      const html = shell(subject, `
        <p>Olá <strong>${escapeHtml(name)}</strong>,</p>
        <p>Este é o <strong>último aviso</strong>: seu acesso ao ${BRAND} vence em <strong>${expiresAt}</strong>.</p>
        <p>Sem renovar, seu site sairá do ar amanhã.</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${renewUrl}" style="background:#FFD600;color:#0a0a0a;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;display:inline-block">Renovar antes que expire</a>
        </p>
      `);
      return { subject, html, text: `Último dia: seu acesso vence em ${expiresAt}. Renove: ${renewUrl}` };
    }
    case "expired_grace": {
      const { name, deleteAt, renewUrl } = t.data;
      const subject = `Seu site está fora do ar — você tem 10 dias para regularizar`;
      const html = shell(subject, `
        <p>Olá <strong>${escapeHtml(name)}</strong>,</p>
        <p>Seu acesso ao ${BRAND} expirou e seu site <strong>está fora do ar por falta de pagamento</strong>.</p>
        <p>Você tem até <strong>${deleteAt}</strong> (10 dias) para regularizar. Caso contrário, sua conta será removida automaticamente e não poderá ser recuperada.</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${renewUrl}" style="background:#FFD600;color:#0a0a0a;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;display:inline-block">Reativar agora</a>
        </p>
      `);
      return { subject, html, text: `Site fora do ar. Regularize até ${deleteAt}: ${renewUrl}` };
    }
    case "canceled": {
      const { name } = t.data;
      const subject = `Assinatura cancelada — ${BRAND}`;
      const html = shell(subject, `
        <p>Olá <strong>${escapeHtml(name)}</strong>,</p>
        <p>Sua assinatura foi cancelada e o acesso ao ${BRAND} foi encerrado. Se foi engano, basta refazer a compra na Kiwify.</p>
      `);
      return { subject, html, text: `Assinatura cancelada.` };
    }
    case "refunded": {
      const { name } = t.data;
      const subject = `Reembolso processado — ${BRAND}`;
      const html = shell(subject, `
        <p>Olá <strong>${escapeHtml(name)}</strong>,</p>
        <p>Seu reembolso foi processado e o acesso ao ${BRAND} foi removido.</p>
      `);
      return { subject, html, text: `Reembolso processado, acesso removido.` };
    }
    case "deleted": {
      const { name } = t.data;
      const subject = `Sua conta ${BRAND} foi removida`;
      const html = shell(subject, `
        <p>Olá <strong>${escapeHtml(name)}</strong>,</p>
        <p>Conforme avisado, sua conta foi removida por inatividade de pagamento. Todos os dados do seu site foram excluídos definitivamente.</p>
        <p>Se quiser voltar, é só fazer uma nova compra na Kiwify.</p>
      `);
      return { subject, html, text: `Sua conta foi removida por inatividade de pagamento.` };
    }
    case "password_reset": {
      const { name, resetUrl } = t.data;
      const subject = `Redefinição de senha — ${BRAND}`;
      const html = shell(subject, `
        <p>Olá <strong>${escapeHtml(name)}</strong>,</p>
        <p>Recebemos um pedido para redefinir sua senha. Clique abaixo (o link vale 1 hora):</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${resetUrl}" style="background:#FFD600;color:#0a0a0a;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;display:inline-block">Redefinir senha</a>
        </p>
        <p style="font-size:13px;color:#666">Se não foi você, ignore este e-mail.</p>
      `);
      return { subject, html, text: `Redefinir senha: ${resetUrl}` };
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
