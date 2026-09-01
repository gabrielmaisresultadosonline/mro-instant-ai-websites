/**
 * Sincronização IMAP da caixa catch-all (*@mro.bio).
 *
 * Cada e-mail recebido é distribuído para o site correspondente
 * (nomedosite@mro.bio -> sites.slug = nomedosite).
 *
 * Somente LEITURA: nada é enviado a partir dos endereços dos clientes.
 * Usado tanto pelo cron (/api/public/cron/inbox-sync) quanto pelo botão
 * "Atualizar agora" da aba 📬 E-mails.
 */

const SYNC_ID = "catchall";
const MAX_MESSAGES_PER_RUN = 25;

function mailDomain() {
  return (process.env.INBOX_DOMAIN || "mro.bio").toLowerCase();
}

/** Endereços que nunca podem ser entregues a um cliente. */
const BLOCKED_LOCAL_PARTS = new Set([
  "postmaster",
  "abuse",
  "admin",
  "administrador",
  "administracao",
  "root",
  "webmaster",
  "hostmaster",
  "suporte",
  "support",
  "contato",
  "contact",
  "no-reply",
  "noreply",
  "inbox",
  "mail",
  "email",
  "billing",
  "financeiro",
  "security",
  "seguranca",
  "www",
  "api",
  "app",
]);

export type InboxSyncResult = {
  ok: boolean;
  inserted: number;
  skipped: number;
  lastUid?: number;
  error?: string;
};

/** Extrai todos os endereços @dominio de uma lista de cabeçalhos. */
function collectLocalParts(values: (string | null | undefined)[]): string[] {
  const domain = mailDomain();
  const out: string[] = [];
  const re = new RegExp(`([a-z0-9][a-z0-9._-]{0,63})@${domain.replace(/\./g, "\\.")}`, "gi");
  for (const value of values) {
    if (!value) continue;
    for (const match of value.matchAll(re)) {
      const local = match[1]?.toLowerCase();
      if (local && !out.includes(local)) out.push(local);
    }
  }
  return out;
}

export async function runInboxSync(): Promise<InboxSyncResult> {
  const host = process.env.IMAP_HOST || "imap.hostinger.com";
  const port = Number(process.env.IMAP_PORT || 993);
  const user = process.env.IMAP_USER || process.env.SMTP_USER || "";
  const pass = process.env.IMAP_PASS || process.env.SMTP_PASS || "";
  const domain = mailDomain();

  if (!user || !pass) {
    return { ok: false, inserted: 0, skipped: 0, error: "IMAP_USER/IMAP_PASS não configurados" };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sanitizeEmailHtml, extractVerificationCode } = await import("@/lib/inbox-sanitize.server");
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");

  // Ponto de retomada: só lemos mensagens com UID acima do último processado.
  const { data: state } = await supabaseAdmin
    .from("inbox_sync_state")
    .select("last_uid")
    .eq("id", SYNC_ID)
    .maybeSingle();

  const lastUid = Number(state?.last_uid ?? 0);

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  let inserted = 0;
  let skipped = 0;
  let maxUid = lastUid;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const range = `${lastUid + 1}:*`;
      const messages: { uid: number; source: Buffer }[] = [];

      for await (const msg of client.fetch({ uid: range }, { uid: true, source: true }, { uid: true })) {
        // O IMAP pode devolver a última mensagem mesmo quando não há novidade.
        if (!msg.uid || msg.uid <= lastUid || !msg.source) continue;
        messages.push({ uid: msg.uid, source: msg.source as Buffer });
        if (messages.length >= MAX_MESSAGES_PER_RUN) break;
      }

      for (const message of messages) {
        maxUid = Math.max(maxUid, message.uid);

        let parsed: Awaited<ReturnType<typeof simpleParser>>;
        try {
          parsed = await simpleParser(message.source);
        } catch (err) {
          console.error("[INBOX_SYNC] falha ao parsear mensagem", message.uid, err);
          skipped++;
          continue;
        }

        const headers = parsed.headers;
        const rawTo = [
          (parsed.to as { text?: string } | undefined)?.text,
          (parsed.cc as { text?: string } | undefined)?.text,
          String(headers.get("delivered-to") ?? ""),
          String(headers.get("x-original-to") ?? ""),
          String(headers.get("envelope-to") ?? ""),
        ];

        const candidates = collectLocalParts(rawTo).filter((l) => !BLOCKED_LOCAL_PARTS.has(l));
        if (candidates.length === 0) {
          skipped++;
          continue;
        }

        // Resolve o primeiro candidato que corresponde a um site existente.
        const { data: matchedSites } = await supabaseAdmin
          .from("sites")
          .select("id, owner_id, slug")
          .in("slug", candidates)
          .limit(candidates.length);

        const site = matchedSites?.[0];

        // Caixas criadas pelo painel /administracao (não pertencem a nenhum site).
        const { data: matchedInboxes } = site
          ? { data: null }
          : await supabaseAdmin
              .from("admin_inboxes")
              .select("id, local_part")
              .in("local_part", candidates)
              .limit(candidates.length);

        const adminInbox = matchedInboxes?.[0] ?? null;

        if (!site && !adminInbox) {
          skipped++;
          continue;
        }

        const subject = (parsed.subject || "").slice(0, 500);
        const bodyText = (parsed.text || "").slice(0, 100_000);
        const bodyHtml = sanitizeEmailHtml(typeof parsed.html === "string" ? parsed.html : null);
        const fromAddress =
          (parsed.from as { value?: { address?: string }[] } | undefined)?.value?.[0]?.address ?? "desconhecido";
        const fromName = (parsed.from as { value?: { name?: string }[] } | undefined)?.value?.[0]?.name || null;

        const common = {
          from_address: fromAddress,
          from_name: fromName,
          subject,
          body_text: bodyText,
          body_html: bodyHtml || null,
          verification_code: extractVerificationCode(subject, bodyText || bodyHtml || ""),
          message_uid: `${SYNC_ID}:${message.uid}`,
          received_at: (parsed.date ?? new Date()).toISOString(),
        };

        const { error: insertError } = site
          ? await supabaseAdmin.from("site_inbox").insert({
              ...common,
              site_id: site.id,
              owner_id: site.owner_id,
              to_address: `${site.slug}@${domain}`,
            })
          : await supabaseAdmin.from("admin_inbox_messages").insert({
              ...common,
              inbox_id: adminInbox!.id,
              to_address: `${adminInbox!.local_part}@${domain}`,
            });

        if (insertError) {
          // 23505 = duplicado (mensagem já sincronizada): não é erro real.
          if (insertError.code === "23505") skipped++;
          else console.error("[INBOX_SYNC] falha ao gravar e-mail", message.uid, insertError.message);
        } else {
          inserted++;
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    console.error("[INBOX_SYNC] erro", messageText);
    try {
      await client.close();
    } catch {
      /* conexão já encerrada */
    }
    await supabaseAdmin
      .from("inbox_sync_state")
      .update({ last_run_at: new Date().toISOString(), last_error: messageText.slice(0, 500) })
      .eq("id", SYNC_ID);
    return { ok: false, inserted, skipped, error: messageText };
  }

  await supabaseAdmin
    .from("inbox_sync_state")
    .update({ last_uid: maxUid, last_run_at: new Date().toISOString(), last_error: null })
    .eq("id", SYNC_ID);

  return { ok: true, inserted, skipped, lastUid: maxUid };
}
