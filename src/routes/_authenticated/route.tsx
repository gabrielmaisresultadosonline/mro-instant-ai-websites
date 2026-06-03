import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const RENEW_URL = "https://pay.kiwify.com.br/1mMYvVU";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
    return { user: data.user };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const fn = useServerFn(getMySubscription);
  const { data: sub, isLoading, isError } = useQuery({ queryKey: ["my-subscription"], queryFn: () => fn(), retry: 2 });

  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  const status = sub?.subscription_status ?? "none";
  const blocked = !isLoading && !isError && (status === "grace" || status === "expired" || status === "canceled" || status === "refunded" || status === "none");

  return (
    <div className="min-h-screen bg-surface/60">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md btn-brand font-display text-sm font-bold">M</span>
            <span className="font-display text-base font-bold">MRO.BIO</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{user.email}</span>
            <button onClick={logout} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/40">Sair</button>
          </div>
        </div>
      </header>
      {isLoading ? <SubscriptionChecking /> : isError ? <SubscriptionCheckError /> : blocked ? <BlockedScreen status={status} sub={sub} /> : <Outlet />}
    </div>
  );
}

function SubscriptionChecking() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--shadow-elevate)]">
        <h1 className="font-display text-2xl font-bold">Confirmando seu acesso…</h1>
        <p className="mt-3 text-sm text-muted-foreground">Estamos verificando a assinatura vinculada à sua conta.</p>
      </div>
    </main>
  );
}

function SubscriptionCheckError() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--shadow-elevate)]">
        <h1 className="font-display text-2xl font-bold">Não conseguimos confirmar seu acesso agora</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Atualize a página em alguns segundos. Se o pagamento já foi aprovado, seu acesso será liberado automaticamente.
        </p>
        <button onClick={() => window.location.reload()} className="mt-6 rounded-md btn-brand px-6 py-3 text-sm font-semibold">
          Tentar novamente
        </button>
      </div>
    </main>
  );
}

function BlockedScreen({ status, sub }: { status: string; sub: { grace_period_ends_at: string | null; subscription_expires_at: string | null } | undefined }) {
  const title =
    status === "grace" ? "Seu site está fora do ar"
    : status === "expired" ? "Seu acesso expirou"
    : status === "canceled" ? "Assinatura cancelada"
    : status === "refunded" ? "Reembolso processado"
    : "Acesso não ativado";
  const deleteDate = sub?.grace_period_ends_at ? new Date(sub.grace_period_ends_at).toLocaleDateString("pt-BR") : null;
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <div className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-8 text-center dark:bg-amber-950/30">
        <h1 className="font-display text-3xl font-bold text-amber-900 dark:text-amber-200">⚠ {title}</h1>
        {status === "grace" && deleteDate && (
          <p className="mt-3 text-sm text-amber-900 dark:text-amber-200">
            Seu site está fora do ar por falta de pagamento. Você tem até <strong>{deleteDate}</strong> para regularizar.
            Caso contrário, sua conta será <strong>removida automaticamente</strong>.
          </p>
        )}
        {status === "none" && (
          <p className="mt-3 text-sm text-amber-900 dark:text-amber-200">
            Sua conta ainda não tem assinatura ativa. Adquira na Kiwify para liberar.
          </p>
        )}
        <a href={RENEW_URL} target="_blank" rel="noreferrer"
          className="mt-6 inline-block rounded-md btn-brand px-6 py-3 text-sm font-semibold">
          {status === "none" ? "Comprar acesso" : "Renovar agora"}
        </a>
      </div>
    </main>
  );
}
