import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — MRO.BIO" }] }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-5">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-[var(--shadow-elevate)]">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md btn-brand font-display text-base font-bold">M</span>
          <span className="font-display text-lg font-bold">MRO.BIO</span>
        </Link>
        <h2 className="mt-5 font-display text-2xl font-bold">Entrar</h2>
        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-brand focus:ring-2 focus:ring-brand/30 outline-none" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Senha</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-brand focus:ring-2 focus:ring-brand/30 outline-none" />
          </label>
        </div>
        <button disabled={loading} className="mt-5 w-full rounded-md btn-brand px-5 py-3 text-sm font-semibold disabled:opacity-60">
          {loading ? "Entrando..." : "Entrar"}
        </button>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Ainda não tem conta? <Link to="/cadastro" className="font-semibold text-foreground">Criar agora</Link>
        </p>
      </form>
    </div>
  );
}
