/**
 * Sincronização IMAP da caixa catch-all (*@mro.bio).
 *
 * Cada e-mail recebido é distribuído para o site correspondente.
 * Formatos aceitos:
 * - nomedosite@mro.bio
 * - suporte@nomedosite.mro.bio
 *
 * Somente LEITURA: nada é enviado a partir dos endereços dos clientes.
 * Usado tanto pelo cron (/api/public/cron/inbox-sync) quanto pelo botão
 * "Atualizar agora" da aba 📬 E-mails.
 */

const SYNC_ID = "catchall";
const MAX_MESSAGES_PER_RUN = 25;
const RECOVERY_LOOKBACK_UIDS = 100;

type MailboxTarget = {
  path: string;
  stateId: string;
  messagePrefix: string;
};

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

type SiteRecipient = {
  slug: string;
  address: string;
};

/** Resolve os dois formatos públicos de e-mail aceitos por cada site. */
function collectSiteRecipients(values: (string | null | undefined)[]): SiteRecipient[] {
  const domain = mailDomain();
  const escapedDomain = domain.replace(/\./g, "\\.");
  const directPattern = new RegExp(`([a-z0-9][a-z0-9._-]{0,63})@${escapedDomain}`, "gi");
  const supportPattern = new RegExp(`suporte@([a-z0-9][a-z0-9-]{0,62})\\.${escapedDomain}`, "gi");
  const recipients = new Map<string, SiteRecipient>();

  for (const value of values) {
    if (!value) continue;

    for (const match of value.matchAll(directPattern)) {
      const slug = match[1]?.toLowerCase();
      if (!slug || BLOCKED_LOCAL_PARTS.has(slug)) continue;
      recipients.set(`${slug}@${domain}`, { slug, address: `${slug}@${domain}` });
    }

    for (const match of value.matchAll(supportPattern)) {
      const slug = match[1]?.toLowerCase();
      if (!slug) continue;
      recipients.set(`suporte@${slug}.${domain}`, {
        slug,
        address: `suporte@${slug}.${domain}`,
      });
    }
  }

  return [...recipients.values()];
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

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  let inserted = 0;
  let skipped = 0;
  let latestUid = 0;

  try {
    await client.connect();
    const listedMailboxes = await client.list();
    const junkMailbox = listedMailboxes.find(
      (mailbox) => mailbox.specialUse === "\\Junk" || /(^|\.)junk$/i.test(mailbox.path),
    );
    const mailboxes: MailboxTarget[] = [
      { path: "INBOX", stateId: SYNC_ID, messagePrefix: SYNC_ID },
      ...(junkMailbox
        ? [{ path: junkMailbox.path, stateId: `${SYNC_ID}:junk`, messagePrefix: `${SYNC_ID}:junk` }]
        : []),
    ];

    for (const mailbox of mailboxes) {
      // Cada pasta possui UIDs independentes; por isso mantém seu próprio cursor.
      const { data: state } = await supabaseAdmin
        .from("inbox_sync_state")
        .select("last_uid")
        .eq("id", mailbox.stateId)
        .maybeSingle();
      const lastUid = Number(state?.last_uid ?? 0);
      let maxUid = lastUid;
      const lock = await client.getMailboxLock(mailbox.path);

      try {
      // Reexamina uma janela recente para recuperar mensagens que chegaram antes
      // de uma regra de destinatário ser corrigida. A chave única evita duplicatas.
      const rangeStart = Math.max(1, lastUid - RECOVERY_LOOKBACK_UIDS);
      const range = `${rangeStart}:*`;
      const messages: { uid: number; source: Buffer }[] = [];

      for await (const msg of client.fetch({ uid: range }, { uid: true, source: true }, { uid: true })) {
        if (!msg.uid || !msg.source) continue;
        messages.push({ uid: msg.uid, source: msg.source as Buffer });
        if (messages.length > MAX_MESSAGES_PER_RUN) messages.shift();
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

        const siteRecipients = collectSiteRecipients(rawTo);
        const directLocalParts = collectLocalParts(rawTo).filter((local) => !BLOCKED_LOCAL_PARTS.has(local));
        const siteCandidates = [...new Set(siteRecipients.map((recipient) => recipient.slug))];
        if (siteCandidates.length === 0 && directLocalParts.length === 0) {
          skipped++;
          continue;
        }

        // Resolve o primeiro candidato que corresponde a um site existente.
        const { data: matchedSites } = await supabaseAdmin
          .from("sites")
          .select("id, owner_id, slug")
          .in("slug", siteCandidates)
          .limit(siteCandidates.length);

        const site = matchedSites?.[0];
        const siteRecipient = site
          ? siteRecipients.find((recipient) => recipient.slug === site.slug)
          : null;

        // Caixas criadas pelo painel /administracao (não pertencem a nenhum site).
        const { data: matchedInboxes } = site
          ? { data: null }
          : await supabaseAdmin
              .from("admin_inboxes")
              .select("id, local_part")
              .in("local_part", directLocalParts)
              .limit(directLocalParts.length);

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
          message_uid: `${mailbox.messagePrefix}:${message.uid}`,
          received_at: (parsed.date ?? new Date()).toISOString(),
        };

        let insertError: { code?: string; message: string } | null;
        if (site) {
          const result = await supabaseAdmin.from("site_inbox").insert({
            ...common,
            site_id: site.id,
            owner_id: site.owner_id,
            to_address: siteRecipient?.address ?? `${site.slug}@${domain}`,
          });
          insertError = result.error;
        } else if (adminInbox) {
          const result = await supabaseAdmin.from("admin_inbox_messages").insert({
            ...common,
            inbox_id: adminInbox.id,
            to_address: `${adminInbox.local_part}@${domain}`,
          });
          insertError = result.error;
        } else {
          skipped++;
          continue;
        }

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

      latestUid = Math.max(latestUid, maxUid);
      const { error: stateError } = await supabaseAdmin.from("inbox_sync_state").upsert(
        {
          id: mailbox.stateId,
          last_uid: maxUid,
          last_run_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: "id" },
      );
      if (stateError) throw new Error(`Falha ao salvar cursor IMAP: ${stateError.message}`);
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
    await supabaseAdmin.from("inbox_sync_state").upsert(
      {
        id: SYNC_ID,
        last_run_at: new Date().toISOString(),
        last_error: messageText.slice(0, 500),
      },
      { onConflict: "id" },
    );
    return { ok: false, inserted, skipped, error: messageText };
  }

  return { ok: true, inserted, skipped, lastUid: latestUid };
}
