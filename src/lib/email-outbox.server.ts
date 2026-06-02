import type { SupabaseClient } from "@supabase/supabase-js";
import { renderTemplate, type Template } from "./email-templates.server";

export async function enqueueEmail(
  admin: SupabaseClient,
  to: { email: string; name?: string | null },
  template: Template,
): Promise<void> {
  const rendered = renderTemplate(template);
  const { error } = await admin.from("email_outbox").insert({
    to_email: to.email,
    to_name: to.name ?? null,
    subject: rendered.subject,
    body_html: rendered.html,
    body_text: rendered.text,
    template: template.name,
    status: "pending",
  });
  if (error) console.error("[email-outbox] enqueue failed:", error.message);
}
