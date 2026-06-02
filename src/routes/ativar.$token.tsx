import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { validateActivationToken, completeActivation } from "@/lib/activation.functions";

export const Route = createFileRoute("/ativar/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Ativar conta — MRO.BIO" }] }),
  component: ActivatePage,
});

function ActivatePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const validateFn = useServerFn(validateActivationToken);
  const completeFn = useServerFn(completeActivation);

  const { data, isLoading } = useQuery({
    queryKey: ["activation-token", token],
    queryFn: () => validateFn({ data: { token } }),
  });

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("A senha precisa de pelo menos 8 caracteres.");
    if (password !== confirm) return toast.error("As senhas não conferem.");
    setSubmitting(true);
    try {
      await completeFn({ data: { token, password } });
      toast.success("Conta ativada! Redirecionando…");
      setTimeout(() => navigate({ to: "/login" }), 800);
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setSubmitting(false); }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-foreground px-5 text-background">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-7">
        <h1 className="font-display text-2xl font-bold">Ative sua conta MRO.BIO</h1>
        {isLoading ? (
          <p className="mt-4 text-sm text-white/60">Validando link…</p>
        ) : !data?.valid ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-red-300">{data?.reason ?? "Link inválido."}</p>
            <Link to="/login" className="inline-block text-sm text-brand hover:underline">Ir para o login →</Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <p className="text-sm text-white/70">Crie a senha para <strong>{data.email}</strong>.</p>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/60">Nova senha</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={8} className="w-full rounded-md border border-white/20 bg-white/10 p-2.5 text-sm focus:border-brand focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/60">Confirmar senha</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                required minLength={8} className="w-full rounded-md border border-white/20 bg-white/10 p-2.5 text-sm focus:border-brand focus:outline-none" />
            </label>
            <button disabled={submitting} className="w-full rounded-md btn-brand py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-60">
              {submitting ? "Ativando…" : "Ativar conta"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
