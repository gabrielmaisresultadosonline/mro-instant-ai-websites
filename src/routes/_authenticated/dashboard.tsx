import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteSite } from "@/lib/sites.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Meu site — MRO.BIO" }] }),
  component: Dashboard,
});

function Dashboard() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();
  const [formData, setFormData] = useState({ title: "", slug: "" });
  const [isSlugManual, setIsSlugManual] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ title: "", slug: "" });
  const [isEditSlugManual, setIsEditSlugManual] = useState(false);
  const [showAffiliateModal, setShowAffiliateModal] = useState(false);
  const deleteSiteFn = useServerFn(deleteSite);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSiteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Site excluído");
      qc.invalidateQueries({ queryKey: ["my-sites", user.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
        .select("id, slug, title, is_published, gens_this_month, month_started_at, next_provider_idx, edits_this_week, week_started_at, updated_at, created_at, slug_changes_count, last_slug_change_at")
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
      if (slug.length < 3) throw new Error("O link do site deve ter pelo menos 3 caracteres.");

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

  const updateSiteMut = useMutation({
    mutationFn: async (vars: { title: string; slug: string }) => {
      if (!site) return;
      const newSlug = toSiteSlug(vars.slug || vars.title);
      if (newSlug.length < 3) throw new Error("O link deve ter pelo menos 3 caracteres.");

      const isChangingSlug = newSlug !== site.slug;
      if (isChangingSlug && (site.slug_changes_count || 0) >= 1) {
        throw new Error("Você já alterou seu link uma vez. Novas alterações só serão permitidas após 1 ano.");
      }

      const { error } = await supabase
        .from("sites")
        .update({
          title: vars.title.trim().slice(0, 80),
          slug: newSlug,
          slug_changes_count: isChangingSlug ? (site.slug_changes_count || 0) + 1 : (site.slug_changes_count || 0),
          last_slug_change_at: isChangingSlug ? new Date().toISOString() : site.last_slug_change_at
        })
        .eq("id", site.id)
        .eq("owner_id", user.id);

      if (error) {
        if (isDuplicateSlugError(error)) throw new Error("Este link já está em uso.");
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success("Informações atualizadas!");
      setIsEditing(false);
      qc.invalidateQueries({ queryKey: ["my-sites", user.id] });
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

  if (isError) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-20 text-center">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elevate)]">
          <h1 className="font-display text-2xl font-bold">Erro ao carregar dashboard</h1>
          <p className="mt-3 text-sm text-muted-foreground">{error?.message}</p>
          <button onClick={() => refetch()} className="mt-6 rounded-md btn-brand px-5 py-2.5 text-sm font-semibold">
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-6xl px-5 py-20 text-center">
        <p className="text-sm text-muted-foreground">Carregando dashboard...</p>
      </main>
    );
  }

  // Se não tem site, mostra o formulário de criação
  if (!site) {
    return (
      <main className="mx-auto max-w-xl px-5 py-16">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elevate)]">
          <h1 className="font-display text-2xl font-bold text-center">Bem-vindo ao MRO.BIO!</h1>
          <p className="mt-2 text-sm text-muted-foreground text-center">
            Para começar, dê um nome ao seu site e escolha o link de acesso.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              createSiteMut.mutate(formData);
            }}
            className="mt-8 space-y-5"
          >
            <div>
              <label className="block text-sm font-medium mb-1.5">Nome do seu site</label>
              <input
                type="text"
                required
                placeholder="Ex: Minha Empresa"
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-brand"
                value={formData.title}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData(prev => ({
                    ...prev,
                    title: val,
                    slug: isSlugManual ? prev.slug : toSiteSlug(val)
                  }));
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Link do site (slug)</label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  required
                  placeholder="ex-empresa"
                  className="w-full rounded-lg border border-border bg-background pl-4 pr-20 py-2.5 text-sm outline-none focus:border-brand font-mono"
                  value={formData.slug}
                  onChange={(e) => {
                    setIsSlugManual(true);
                    setFormData({ ...formData, slug: toSiteSlug(e.target.value) });
                  }}
                />
                <span className="absolute right-4 text-xs font-mono text-muted-foreground">.mro.bio</span>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Seu link será: <span className="font-mono">{formData.slug || "..."}.mro.bio</span>
              </p>
            </div>

            <button
              type="submit"
              disabled={createSiteMut.isPending}
              className="w-full rounded-lg btn-brand py-3 text-sm font-bold shadow-lg shadow-brand/20 disabled:opacity-50"
            >
              {createSiteMut.isPending ? "Criando site..." : "Criar meu site agora"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  const hasHtml = !!full?.html;
  const createdAt = site.created_at ? new Date(site.created_at).toLocaleDateString("pt-BR") : "—";
  const lastVisit = insights?.last ? new Date(insights.last.created_at).toLocaleString("pt-BR") : "—";
  const lastVisitLoc = insights?.last
    ? [insights.last.country, insights.last.region, insights.last.city].filter(Boolean).join(" — ") || "Localidade desconhecida"
    : "";

  const expiresAt = sub?.subscription_expires_at;
  const daysRemaining = expiresAt 
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex-1">
          {isEditing ? (
            <div className="space-y-3 max-w-md">
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Nome da empresa</label>
                <input
                  type="text"
                  className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm"
                  value={editData.title}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditData(prev => ({
                      ...prev,
                      title: val,
                      slug: isEditSlugManual ? prev.slug : toSiteSlug(val)
                    }));
                  }}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Link do site (slug)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-sm font-mono"
                    value={editData.slug}
                    onChange={(e) => {
                      setIsEditSlugManual(true);
                      setEditData(prev => ({ ...prev, slug: toSiteSlug(e.target.value) }));
                    }}
                  />
                  <span className="text-xs text-muted-foreground">.mro.bio</span>
                </div>
                {(site.slug_changes_count || 0) >= 1 && editData.slug !== site.slug && (
                  <p className="text-[10px] text-amber-500 mt-1">⚠️ Você já alterou seu link uma vez e não poderá mudar novamente por 1 ano.</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => updateSiteMut.mutate(editData)}
                  disabled={updateSiteMut.isPending}
                  className="rounded bg-brand px-3 py-1.5 text-xs font-bold text-brand-foreground"
                >
                  {updateSiteMut.isPending ? "Salvando..." : "Salvar alterações"}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="rounded border border-border px-3 py-1.5 text-xs font-medium"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-3xl font-bold uppercase">{site.title || site.slug}</h1>
                <button 
                  onClick={() => {
                    setEditData({ title: site.title || "", slug: site.slug });
                    setIsEditSlugManual(false);
                    setIsEditing(true);
                  }}
                  className="text-xs text-muted-foreground hover:text-brand underline"
                >
                  Editar nome/link
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono">{site.slug}.mro.bio</span>
                {" · "}
                <span className={site.is_published ? "text-emerald-500 font-medium" : "text-amber-500 font-medium"}>
                  {site.is_published ? "🟢 Publicado" : "🟡 Rascunho"}
                </span>
              </p>
            </>
          )}
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
              <button
                onClick={() => {
                  if (confirm("Deseja realmente excluir seu site? Esta ação é irreversível.")) {
                    deleteMut.mutate(site.id);
                  }
                }}
                className="rounded-md border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/5">
                Excluir
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

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card label="Visitas totais" value={String(insights?.total ?? 0)} />
        <Card label="Site criado em" value={createdAt} />
        <Card label="Último acesso" value={lastVisit} sub={lastVisitLoc} />
        <Card label="Gerações no mês" value={`${(site as { gens_this_month?: number }).gens_this_month ?? 0}/3`} />
        <Card label="Uso restante" value={`${daysRemaining} dias`} />
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
  return clean;
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
