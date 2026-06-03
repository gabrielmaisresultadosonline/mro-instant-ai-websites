/**
 * MRO.BIO — Email Outbox Worker
 *
 * Lê emails pendentes da tabela `email_outbox` no Supabase e envia
 * via SMTP da Hostinger (smtp.hostinger.com:465) usando suporte@mro.bio.
 *
 * Roda em loop infinito (polling a cada POLL_INTERVAL_MS).
 *
 * Variáveis de ambiente (opcionais — defaults embutidos):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *   BATCH_SIZE, POLL_INTERVAL_MS, MAX_ATTEMPTS, LOCK_TIMEOUT_MIN
 */

const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

// ---------- Config ----------
const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://tahoolxlxznllijnwitk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'COLE_AQUI_SUA_SERVICE_ROLE_KEY';

// SMTP Hostinger — credenciais embutidas conforme solicitado.
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.hostinger.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_USER = process.env.SMTP_USER || 'suporte@mro.bio';
const SMTP_PASS = process.env.SMTP_PASS || '29041997Ga@@';
const SMTP_FROM = process.env.SMTP_FROM || 'MRO.BIO <suporte@mro.bio>';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '15000', 10);
const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS || '5', 10);
const LOCK_TIMEOUT_MIN = parseInt(process.env.LOCK_TIMEOUT_MIN || '10', 10);

if (SUPABASE_SERVICE_ROLE_KEY.startsWith('COLE_AQUI')) {
  console.error(
    '[email-worker] ERRO: defina SUPABASE_SERVICE_ROLE_KEY no app.env antes de iniciar.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // true para 465 (SSL), false para 587 (STARTTLS)
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

// ---------- Helpers ----------
function log(...args) {
  console.log(`[email-worker ${new Date().toISOString()}]`, ...args);
}

async function verifySmtp() {
  try {
    await transporter.verify();
    log('SMTP OK:', SMTP_HOST + ':' + SMTP_PORT, 'as', SMTP_USER);
  } catch (err) {
    log('SMTP FALHOU:', err.message);
  }
}

/**
 * Reivindica até BATCH_SIZE emails pendentes marcando-os como `sending`
 * com locked_at = now(). Faz polling simples — para evitar dupla entrega
 * usamos uma janela de lock (LOCK_TIMEOUT_MIN minutos).
 */
async function claimBatch() {
  const lockCutoff = new Date(
    Date.now() - LOCK_TIMEOUT_MIN * 60 * 1000
  ).toISOString();

  // Busca: pending OU sending travado há muito tempo (retry)
  const { data, error } = await supabase
    .from('email_outbox')
    .select('id, to_email, to_name, subject, body_html, body_text, attempts')
    .or(`status.eq.pending,and(status.eq.sending,locked_at.lt.${lockCutoff})`)
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    log('Erro ao buscar fila:', error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  const ids = data.map((r) => r.id);
  const { error: lockErr } = await supabase
    .from('email_outbox')
    .update({ status: 'sending', locked_at: new Date().toISOString() })
    .in('id', ids);

  if (lockErr) {
    log('Erro ao travar batch:', lockErr.message);
    return [];
  }
  return data;
}

async function markSent(id) {
  await supabase
    .from('email_outbox')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      last_error: null,
      locked_at: null,
    })
    .eq('id', id);
}

async function markFailed(id, attempts, errMsg) {
  const next = (attempts || 0) + 1;
  const finalStatus = next >= MAX_ATTEMPTS ? 'failed' : 'pending';
  await supabase
    .from('email_outbox')
    .update({
      status: finalStatus,
      attempts: next,
      last_error: String(errMsg).slice(0, 1000),
      locked_at: null,
    })
    .eq('id', id);
}

async function sendOne(row) {
  const to = row.to_name
    ? `"${row.to_name}" <${row.to_email}>`
    : row.to_email;
  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: row.subject,
      text: row.body_text || undefined,
      html: row.body_html || undefined,
    });
    log('Enviado', row.id, '→', row.to_email, '(', info.messageId, ')');
    await markSent(row.id);
  } catch (err) {
    log('FALHA', row.id, '→', row.to_email, ':', err.message);
    await markFailed(row.id, row.attempts, err.message);
  }
}

async function tick() {
  try {
    const batch = await claimBatch();
    if (batch.length === 0) return;
    log('Processando', batch.length, 'email(s)');
    for (const row of batch) {
      await sendOne(row);
    }
  } catch (err) {
    log('Erro no tick:', err.message);
  }
}

async function main() {
  log('Iniciando worker. Polling a cada', POLL_INTERVAL_MS, 'ms');
  await verifySmtp();
  // loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick();
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

process.on('SIGTERM', () => {
  log('SIGTERM recebido, saindo.');
  process.exit(0);
});
process.on('SIGINT', () => {
  log('SIGINT recebido, saindo.');
  process.exit(0);
});

main().catch((err) => {
  log('Fatal:', err);
  process.exit(1);
});
