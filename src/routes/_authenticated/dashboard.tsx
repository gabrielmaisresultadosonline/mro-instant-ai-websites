import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { listMySites, getSiteInsights, saveSite, getSite } from "@/lib/sites.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Meu site — MRO.BIO" }] }),
  component: Dashboard,
});

function Dashboard() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listMySites);
  const getFn = useServerFn(getSite);
  const insightsFn = useServerFn(getSiteInsights);
  const saveFn = useServerFn(saveSite);

  const { data: list, isLoading } = useQuery({ queryKey: ["my-sites"], queryFn: () => listFn() });
  const site = list?.sites[0];

  useEffect(() => {
    if (!isLoading && list && !site) nav({ to: "/sites/novo", replace: true });
  }, [list, isLoading, site, nav]);

  const { data: full } = useQuery({
    queryKey: ["site", site?.id],
    queryFn: () => getFn({ data: { id: site!.id } }),
    enabled: !!site,
  });
  const { data: insights } = useQuery({
    queryKey: ["insights", site?.id],
    queryFn: () => insightsFn({ data: { id: site!.id } }),
    enabled: !!site,
  });

  const publishMut = useMutation({
    mutationFn: async () => {
      if (!site || !full) throw new Error("Carregando...");
      return saveFn({ data: { id: site.id, html: full.html, is_published: !site.is_published } });
    },
    onSuccess: () => {
      toast.success(site?.is_published ? "Site despublicado" : "Site publicado!");
      qc.invalidateQueries({ queryKey: ["my-sites"] });
      qc.invalidateQueries({ queryKey: ["site", site?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !site) {
    return (
      <main className="mx-auto max-w-6xl px-5 py-20 text-center">
        <p className="text-sm text-muted-foreground">Carregando seu site...</p>
      </main>
    );
  }

  const hasHtml = !!full?.html;
  const createdAt = site.created_at ? new Date(site.created_at).toLocaleDateString("pt-BR") : "—";
  const lastVisit = insights?.last ? new Date(insights.last.created_at).toLocaleString("pt-BR") : "—";
  const lastVisitLoc = insights?.last
    ? [insights.last.country, insights.last.region, insights.last.city].filter(Boolean).join(" — ") || "Localidade desconhecida"
    : "";

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{site.title || site.slug}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{site.slug}.mro.bio</span>
            {" · "}
            <span className={site.is_published ? "text-emerald-500" : "text-amber-500"}>
              {site.is_published ? "🟢 Publicado" : "🟡 Rascunho"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/sites/$id" params={{ id: site.id }}
            className="rounded-md btn-brand px-4 py-2 text-sm font-semibold">
            ✏️ Editar site
          </Link>
          <button
            onClick={() => publishMut.mutate()}
            disabled={!hasHtml || publishMut.isPending}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent/40 disabled:opacity-50">
            {site.is_published ? "Despublicar" : "Publicar"}
          </button>
          {site.is_published && (
            <>
              <a href={`https://${site.slug}.mro.bio`} target="_blank" rel="noreferrer"
                className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent/40">
                Ver site ↗
              </a>
              <button
                onClick={async () => {
                  const url = `https://${site.slug}.mro.bio`;
                  try {
                    await navigator.clipboard.writeText(url);
                    alert(`Link copiado: ${url}`);
                  } catch {
                    window.prompt("Copie o link:", url);
                  }
                }}
                className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent/40">
                📋 Copiar
              </button>
            </>
          )}
        </div>
      </div>

      {!hasHtml && (
        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          Seu site ainda não foi gerado. Clique em <strong>Editar site</strong> para criar a primeira versão.
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Visitas totais" value={String(insights?.total ?? 0)} />
        <Card label="Site criado em" value={createdAt} />
        <Card label="Último acesso" value={lastVisit} sub={lastVisitLoc} />
        <Card label="Gerações no mês" value={`${(site as { gens_this_month?: number }).gens_this_month ?? 0}/3`} />
      </div>

      <section className="mt-8 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 font-display text-lg font-bold">Top regiões</h2>
        {(insights?.topRegions.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem dados ainda. {site.is_published ? "Compartilhe seu link para começar a receber visitas." : "Publique o site para começar a receber visitas."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {insights!.topRegions.map((r) => (
              <li key={r.region} className="flex items-center justify-between py-2 text-sm">
                <span>{r.region}</span>
                <span className="font-mono text-xs text-muted-foreground">{r.count} visita(s)</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
