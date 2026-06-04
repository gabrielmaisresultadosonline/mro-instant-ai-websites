// Envia um email da fila imediatamente (sem esperar o cron).
// Usado após enfileirar emails críticos (ativação de revenda, reenvio admin).
// Se falhar, deixa o row como "pending" para o cron tentar novamente.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail } from "@/lib/smtp-sender.server";

export async function flushEmailNow(rowId: string): Promise<void> {
  try {
    const { data: row } = await supabaseAdmin
      .from("email_outbox")
      .select("id, to_email, to_name, subject, body_html, body_text, attempts, status")
      .eq("id", rowId)
      .maybeSingle();
    if (!row || row.status === "sent") return;

    try {
      const messageId = await sendEmail({
        to: row.to_email,
        toName: row.to_name,
        subject: row.subject,
        html: row.body_html,
        text: row.body_text,
      });
      await supabaseAdmin
        .from("email_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempts: (row.attempts ?? 0) + 1,
          provider_message_id: messageId ?? null,
          last_error: null,
        })
        .eq("id", row.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("email_outbox")
        .update({
          attempts: (row.attempts ?? 0) + 1,
          last_error: msg.slice(0, 500),
        })
        .eq("id", row.id);
    }
  } catch (e) {
    console.error("[flushEmailNow] erro:", e instanceof Error ? e.message : e);
  }
}
