import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { enqueueEmail } from "./email-outbox.server";

export const validateActivationToken = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string }) => z.object({ token: z.string().min(8).max(200) }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("activation_tokens")
      .select("email, profile_id, purpose, expires_at, used_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!row) return { valid: false as const, reason: "Token inválido." };
    if (row.used_at) return { valid: false as const, reason: "Este link já foi usado." };
    if (new Date(row.expires_at).getTime() < Date.now()) return { valid: false as const, reason: "Este link expirou." };
    return { valid: true as const, email: row.email, purpose: row.purpose };
  });

export const completeActivation = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; password: string }) =>
    z.object({ token: z.string().min(8).max(200), password: z.string().min(8).max(120) }).parse(i),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("activation_tokens")
      .select("id, email, profile_id, purpose, expires_at, used_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!row) throw new Error("Token inválido.");
    if (row.used_at) throw new Error("Este link já foi usado.");
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("Este link expirou.");
    if (!row.profile_id) throw new Error("Conta não encontrada.");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(row.profile_id, { password: data.password });
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("activation_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    return { ok: true, email: row.email };
  });

export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((i: { email: string }) => z.object({ email: z.string().email() }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();
    const { data: prof } = await supabaseAdmin.from("profiles").select("id, name").eq("email", email).maybeSingle();
    if (!prof) return { ok: true }; // do not leak existence

    const tokenBuf = new Uint8Array(32);
    crypto.getRandomValues(tokenBuf);
    const token = Array.from(tokenBuf).map((b) => b.toString(16).padStart(2, "0")).join("");
    await supabaseAdmin.from("activation_tokens").insert({
      token,
      email,
      profile_id: prof.id,
      purpose: "reset",
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    await enqueueEmail(supabaseAdmin, { email, name: prof.name }, {
      name: "password_reset",
      data: { name: prof.name, resetUrl: `https://mro.bio/redefinir-senha/${token}` },
    });
    return { ok: true };
  });
