import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Meu site — MRO.BIO" }] }),
  component: Dashboard,
});

function Dashboard() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({ title: "", slug: "" });

  const { data: sub } = useQuery({
    queryKey: ["my-subscription", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("subscription_status, subscription_expires_at")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: list, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["my-sites", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("id, slug, title, is_published, gens_this_month, month_started_at, next_provider_idx, edits_this_week, week_started_at, updated_at, created_at")
        .eq("owner_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return { sites: data ?? [] };
    },
    retry: 2,
  });
  const site = list?.sites[0];

  const createSiteMut = useMutation({
    mutationFn: async (vars: { title: string; slug: string }) => {
      const { data: currentUser, error: userError } = await supabase.auth.getUser();
      const uid = currentUser.user?.id;
      if (userError || !uid) throw new Error("Sessão não encontrada.");

      const slug = toSiteSlug(vars.slug || vars.title);
      const { data: created, error: createError } = await supabase
        .from("sites")
        .insert({
          owner_id: uid,
          slug,
          title: vars.title.trim().slice(0, 80) || "Meu site"
        })
        .select("id, slug")
        .single();

      if (createError) {
        if (isDuplicateSlugError(createError)) {
          throw new Error("Este link já está em uso. Escolha outro.");
        }
        throw new Error(createError.message);
      }
      return created;
    },
    onSuccess: (created) => {
      toast.success("Site criado com sucesso!");
      qc.invalidateQueries({ queryKey: ["my-sites", user.id] });
      nav({ to: "/sites/$id", params: { id: created.id }, replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: full } = useQuery({
    queryKey: ["site", site?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .eq("id", site!.id)
        .eq("owner_id", user.id)
        .single();
      if (error || !data) throw new Error("Site não encontrado");
      return data;
    },
    enabled: !!site,
  });
  const { data: insights } = useQuery({
    queryKey: ["insights", site?.id],
    queryFn: async () => {
      const { data: visits, error } = await supabase
        .from("site_visits")
        .select("country, region, city, created_at, referrer")
        .eq("site_id", site!.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      const total = visits?.length ?? 0;
      const last = visits?.[0] ?? null;
      const byRegion: Record<string, number> = {};
      for (const v of visits ?? []) {
        const k = [v.country, v.region].filter(Boolean).join(" — ") || "Desconhecido";
        byRegion[k] = (byRegion[k] ?? 0) + 1;
      }
      const topRegions = Object.entries(byRegion)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([region, count]) => ({ region, count }));
      return { total, last, topRegions };
    },
    enabled: !!site,
  });

  const publishMut = useMutation({
    mutationFn: async () => {
      if (!site || !full) throw new Error("Carregando...");
      const { error } = await supabase
        .from("sites")
        .update({ html: full.html, is_published: !site.is_published })
        .eq("id", site.id)
        .eq("owner_id", user.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    },
    onSuccess: () => {
      toast.success(site?.is_published ? "Site despublicado" : "Site publicado!");
      qc.invalidateQueries({ queryKey: ["my-sites", user.id] });
      qc.invalidateQueries({ queryKey: ["site", site?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isError || ensureSiteMut.isError) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-20 text-center">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elevate)]">
          <h1 className="font-display text-2xl font-bold">Não conseguimos abrir seu editor agora</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Seu pagamento está ativo, mas houve uma falha ao carregar ou preparar o site.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{ensureSiteMut.error?.message ?? error?.message}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button onClick={() => refetch()} className="rounded-md btn-brand px-5 py-2.5 text-sm font-semibold">
              Tentar novamente
            </button>
            <Link to="/sites/novo" className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent/40">
              Criar manualmente
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (isLoading || ensureSiteMut.isPending || !site) {
    return (
      <main className="mx-auto max-w-6xl px-5 py-20 text-center">
        <p className="text-sm text-muted-foreground">Preparando seu editor...</p>
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

function toSiteSlug(value: string) {
  const clean = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  return clean.length >= 3 ? clean : `site-${clean || "mro"}`.slice(0, 30).replace(/-+$/g, "");
}

function fitSlug(base: string, suffix: string) {
  const maxBase = Math.max(3, 30 - suffix.length);
  return `${base.slice(0, maxBase).replace(/-+$/g, "")}${suffix}`;
}

function isDuplicateSlugError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "23505" || message.includes("duplicate") || message.includes("unique");
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
