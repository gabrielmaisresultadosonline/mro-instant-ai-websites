import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/cadastro")({
  head: () => ({ meta: [{ title: "Criar conta — MRO.BIO" }] }),
  component: Cadastro,
});

const schema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(100),
  email: z.string().trim().email("Email inválido").max(255),
  whatsapp: z.string().trim().min(8, "WhatsApp inválido").max(20),
  cpf: z.string().trim().min(11, "CPF inválido").max(14),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres").max(72),
});

function Cadastro() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", whatsapp: "", cpf: "", password: "" });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        data: { name: parsed.data.name, whatsapp: parsed.data.whatsapp, cpf: parsed.data.cpf },
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Conta criada! Bem-vindo(a) à MRO.BIO");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-10 md:grid-cols-2">
        <div className="hidden md:block">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md btn-brand font-display text-base font-bold">M</span>
            <span className="font-display text-lg font-bold">MRO.BIO</span>
          </Link>
          <h1 className="mt-10 font-display text-5xl font-bold leading-tight">
            Seu site em <span className="bg-brand px-1.5">minutos</span>, não em meses.
          </h1>
          <p className="mt-4 text-muted-foreground">
            Crie sua conta gratuita e ganhe um endereço próprio em <strong>seunome.mro.bio</strong>.
          </p>
          <ul className="mt-6 space-y-2 text-sm">
            <li>✓ Pixels do FB, GA e TikTok</li>
            <li>✓ Insights de visitas</li>
            <li>✓ Edições com I.A — 4× por semana</li>
          </ul>
        </div>
        <div>
          <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-7 shadow-[var(--shadow-elevate)]">
            <h2 className="font-display text-2xl font-bold">Criar conta</h2>
            <p className="text-sm text-muted-foreground">Grátis. Sem cartão de crédito.</p>
            <div className="mt-5 grid gap-3">
              <Field label="Nome completo" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
              <Field label="WhatsApp" value={form.whatsapp} onChange={(v) => setForm({ ...form, whatsapp: v })} placeholder="(11) 99999-9999" />
              <Field label="CPF" value={form.cpf} onChange={(v) => setForm({ ...form, cpf: v })} placeholder="000.000.000-00" />
              <Field label="Senha" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
            </div>
            <button disabled={loading} className="mt-5 w-full rounded-md btn-brand px-5 py-3 text-sm font-semibold disabled:opacity-60">
              {loading ? "Criando conta..." : "Criar conta e começar"}
            </button>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Já tem conta? <Link to="/login" className="font-semibold text-foreground">Entrar</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
      />
    </label>
  );
}
