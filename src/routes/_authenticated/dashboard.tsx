import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMySites } from "@/lib/sites.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Meus sites — MRO.BIO" }] }),
  component: Dashboard,
});

function Dashboard() {
  const fn = useServerFn(listMySites);
  const { data, isLoading } = useQuery({ queryKey: ["my-sites"], queryFn: () => fn() });

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Seus sites</h1>
          <p className="text-sm text-muted-foreground">Crie, edite e acompanhe os insights de cada site.</p>
        </div>
        <Link to="/sites/novo" className="rounded-md btn-brand px-5 py-2.5 text-sm font-semibold">+ Criar novo site</Link>
      </div>

      <div className="mt-8">
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-muted/40" />)}
          </div>
        ) : (data?.sites.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <div className="font-display text-2xl font-bold">Você ainda não tem nenhum site.</div>
            <p className="mt-2 text-sm text-muted-foreground">Crie seu primeiro site em menos de 5 minutos.</p>
            <Link to="/sites/novo" className="mt-5 inline-flex rounded-md btn-brand px-5 py-2.5 text-sm font-semibold">Criar agora</Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data!.sites.map((s) => (
              <Link key={s.id} to="/sites/$id" params={{ id: s.id }}
                className="group rounded-xl border border-border bg-card p-5 transition hover:border-brand">
                <div className="flex items-center justify-between">
                  <span className="chip">{s.is_published ? "🟢 publicado" : "🟡 rascunho"}</span>
                  <span className="text-xs text-muted-foreground">{s.edits_this_week}/4 edições/sem</span>
                </div>
                <div className="mt-3 truncate font-display text-xl font-bold">{s.title || s.slug}</div>
                <div className="mt-1 truncate text-sm text-muted-foreground">{s.slug}.mro.bio</div>
                <div className="mt-4 text-xs text-muted-foreground">
                  Atualizado em {new Date(s.updated_at).toLocaleString("pt-BR")}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
