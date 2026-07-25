import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Caixa de entrada do site (nomedosite@mro.bio).
 * Somente leitura para o cliente — o recebimento é feito pelo cron interno.
 * O RLS garante que cada usuário só alcança os e-mails dos próprios sites.
 */

export type InboxMessage = {
  id: string;
  from_address: string;
  from_name: string | null;
  to_address: string;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  verification_code: string | null;
  received_at: string;
  is_read: boolean;
};

export const listSiteInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { siteId: string }) => z.object({ siteId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: rows, error } = await supabase
      .from("site_inbox")
      .select(
        "id, from_address, from_name, to_address, subject, body_text, body_html, verification_code, received_at, is_read",
      )
      .eq("site_id", data.siteId)
      .order("received_at", { ascending: false })
      .limit(50);

    if (error) throw new Error(`Não foi possível carregar os e-mails: ${error.message}`);

    return { messages: (rows ?? []) as InboxMessage[] };
  });

export const markInboxRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("site_inbox")
      .update({ is_read: true })
      .eq("id", data.id);

    if (error) throw new Error(`Não foi possível marcar como lido: ${error.message}`);
    return { ok: true };
  });
