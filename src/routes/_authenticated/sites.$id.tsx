import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { getSite, saveSite, deleteSite, generateSiteHtml, getSiteInsights } from "@/lib/sites.functions";
import { listMyImages, registerImage, deleteImage } from "@/lib/images.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/sites/$id")({
  head: () => ({ meta: [{ title: "Editor — MRO.BIO" }] }),
  component: SiteEditor,
});

type Pixels = { ga4?: string; gtm?: string; meta?: string; tiktok?: string };

function SiteEditor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const getSiteFn = useServerFn(getSite);
  const saveFn = useServerFn(saveSite);
  const deleteFn = useServerFn(deleteSite);
  const genFn = useServerFn(generateSiteHtml);
  const insightsFn = useServerFn(getSiteInsights);
  const listImagesFn = useServerFn(listMyImages);
  const registerImageFn = useServerFn(registerImage);
  const deleteImageFn = useServerFn(deleteImage);

  const { data: site, isLoading } = useQuery({
    queryKey: ["site", id],
    queryFn: () => getSiteFn({ data: { id } }),
  });
  const { data: imgs } = useQuery({
    queryKey: ["my-images"],
    queryFn: () => listImagesFn(),
  });
  const { data: insights } = useQuery({
    queryKey: ["insights", id],
    queryFn: () => insightsFn({ data: { id } }),
  });

  const [prompt, setPrompt] = useState("");
  const [html, setHtml] = useState("");
  const [pixels, setPixels] = useState<Pixels>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState<"preview" | "pixels" | "insights">("preview");
  const [versions, setVersions] = useState<{ a: string; b: string } | null>(null);
  const [activeVersion, setActiveVersion] = useState<"a" | "b">("a");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (site) {
      setPrompt(site.last_prompt ?? "");
      setHtml(site.html ?? "");
      setPixels((site.pixels ?? {}) as Pixels);
    }
  }, [site]);

  const saveMut = useMutation({
    mutationFn: async (payload: { html?: string; pixels?: Pixels; is_published?: boolean }) => {
      return saveFn({ data: { id, html: payload.html ?? html, pixels: payload.pixels ?? pixels, is_published: payload.is_published } });
    },
    onSuccess: () => {
      toast.success("Alterações salvas");
      qc.invalidateQueries({ queryKey: ["site", id] });
      qc.invalidateQueries({ queryKey: ["my-sites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Site excluído");
      qc.invalidateQueries({ queryKey: ["my-sites"] });
      window.location.href = "/dashboard";
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleGenerate() {
    if (prompt.trim().length < 5) {
      toast.error("Descreva o site com mais detalhes.");
      return;
    }
    setGenerating(true);
    try {
      const urls = Array.from(selected);
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const absoluteUrls = urls.map((u) => (u.startsWith("http") ? u : `${base}${u}`));
      const res = await genFn({ data: { id, prompt, imageUrls: absoluteUrls } });
      setVersions({ a: res.versionA, b: res.versionB });
      setActiveVersion(res.versionA ? "a" : "b");
      setTab("preview");
      toast.success(`Duas versões geradas! Usos: ${res.editsUsed}/${res.weeklyLimit} esta semana`);
      qc.invalidateQueries({ queryKey: ["site", id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function applyVersion(which: "a" | "b") {
    if (!versions) return;
    const chosen = which === "a" ? versions.a : versions.b;
    if (!chosen) { toast.error("Esta versão não foi gerada."); return; }
    setHtml(chosen);
    await saveFn({ data: { id, html: chosen } });
    setVersions(null);
    toast.success(`Versão ${which === "a" ? "1" : "2"} aplicada ao seu site`);
    qc.invalidateQueries({ queryKey: ["site", id] });
  }


  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("site-images").upload(path, file, { upsert: false, contentType: file.type });
      if (error) { toast.error(error.message); continue; }
      try {
        await registerImageFn({ data: { path, label: file.name.slice(0, 60) } });
      } catch (e) { toast.error((e as Error).message); }
    }
    qc.invalidateQueries({ queryKey: ["my-images"] });
    if (fileRef.current) fileRef.current.value = "";
    toast.success("Imagens enviadas");
  }

  function toggleSelected(url: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  }

  if (isLoading || !site) {
    return <div className="mx-auto max-w-6xl p-10 text-center text-muted-foreground">Carregando…</div>;
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/dashboard" className="text-xs text-muted-foreground hover:underline">← Voltar</Link>
          <h1 className="mt-1 font-display text-2xl font-bold">{site.title || site.slug}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{site.slug}.mro.bio</span>
            {" · "}
            <span>{site.edits_this_week}/4 edições/sem</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => saveMut.mutate({ is_published: !site.is_published })}
            className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent/40">
            {site.is_published ? "🟢 Despublicar" : "🟡 Publicar"}
          </button>
          <a href={`/api/public/site/${site.slug}`} target="_blank" rel="noreferrer"
            className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent/40">Ver site</a>
          <button onClick={() => { if (confirm("Excluir este site para sempre?")) deleteMut.mutate(); }}
            className="rounded-md border border-destructive/40 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10">Excluir</button>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* LEFT: prompt + images */}
        <aside className="space-y-5">
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-base font-bold">Descrição do site</h2>
              <span className="chip">I.A da MRO</span>
            </div>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6}
              placeholder="Ex.: Quero um site de coach de emagrecimento para mulheres 30+, tom amigável, com depoimentos e botão de WhatsApp."
              className="w-full rounded-md border border-border bg-background p-3 text-sm focus:border-brand focus:outline-none" />
            <button onClick={handleGenerate} disabled={generating}
              className="mt-3 w-full rounded-md btn-brand py-2.5 text-sm font-semibold disabled:opacity-60">
              {generating ? "Gerando…" : "✨ Gerar site com I.A"}
            </button>
            <p className="mt-2 text-[11px] text-muted-foreground">As imagens selecionadas abaixo serão usadas pela I.A.</p>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-bold">Imagens</h2>
              <label className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/40">
                + Enviar
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => handleUpload(e.target.files)} />
              </label>
            </div>
            {imgs?.images.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma imagem ainda. Faça upload para a I.A poder usá-las.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {imgs?.images.map((im) => {
                  const isSel = selected.has(im.public_url);
                  return (
                    <button key={im.id} type="button" onClick={() => toggleSelected(im.public_url)}
                      className={`group relative aspect-square overflow-hidden rounded-md border-2 ${isSel ? "border-brand" : "border-border"}`}>
                      <img src={im.public_url} alt={im.label ?? ""} className="h-full w-full object-cover" />
                      {isSel && <span className="absolute right-1 top-1 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-brand-foreground">✓</span>}
                      <span onClick={async (e) => { e.stopPropagation(); if (confirm("Excluir imagem?")) { await deleteImageFn({ data: { id: im.id } }); qc.invalidateQueries({ queryKey: ["my-images"] }); } }}
                        className="absolute left-1 top-1 hidden cursor-pointer rounded bg-black/70 px-1 text-[10px] text-white group-hover:block">×</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </aside>

        {/* RIGHT: tabs */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex gap-1 border-b border-border p-2">
            {(["preview", "pixels", "insights"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === t ? "bg-foreground text-background" : "hover:bg-accent/40"}`}>
                {t === "preview" ? "Pré-visualização" : t === "pixels" ? "Pixels" : "Insights"}
              </button>
            ))}
          </div>

          {tab === "preview" && (
            <div className="p-2">
              {html ? (
                <iframe title="Preview" srcDoc={html} sandbox="allow-scripts allow-same-origin"
                  className="h-[70vh] w-full rounded-md border border-border bg-white" />
              ) : (
                <div className="grid h-[70vh] place-items-center text-center text-sm text-muted-foreground">
                  Descreva o site e clique em <strong className="mx-1">Gerar site com I.A</strong>.
                </div>
              )}
            </div>
          )}

          {tab === "pixels" && (
            <div className="space-y-3 p-5">
              <p className="text-xs text-muted-foreground">Cole os IDs dos pixels — eles serão injetados automaticamente no <code>&lt;head&gt;</code> do site.</p>
              {([
                ["meta", "Meta Pixel (Facebook/Instagram)", "ex.: 1234567890"],
                ["ga4", "Google Analytics 4", "ex.: G-XXXXXXX"],
                ["gtm", "Google Tag Manager", "ex.: GTM-XXXXXX"],
                ["tiktok", "TikTok Pixel", "ex.: C4XXXXXX"],
              ] as const).map(([k, label, ph]) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-xs font-semibold">{label}</span>
                  <input value={pixels[k] ?? ""} onChange={(e) => setPixels((p) => ({ ...p, [k]: e.target.value }))} placeholder={ph}
                    className="w-full rounded-md border border-border bg-background p-2.5 text-sm focus:border-brand focus:outline-none" />
                </label>
              ))}
              <button onClick={() => saveMut.mutate({ pixels })}
                className="mt-2 rounded-md btn-brand px-4 py-2 text-sm font-semibold">Salvar pixels</button>
            </div>
          )}

          {tab === "insights" && (
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border p-4">
                  <div className="text-xs text-muted-foreground">Visitas totais</div>
                  <div className="font-display text-3xl font-bold">{insights?.total ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <div className="text-xs text-muted-foreground">Última visita</div>
                  <div className="text-sm font-semibold">
                    {insights?.last ? new Date(insights.last.created_at).toLocaleString("pt-BR") : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {insights?.last ? [insights.last.country, insights.last.region, insights.last.city].filter(Boolean).join(" — ") || "Localidade desconhecida" : ""}
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top regiões</div>
                {(insights?.topRegions.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados ainda. Publique e divulgue o link.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {insights!.topRegions.map((r) => (
                      <li key={r.region} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span>{r.region}</span>
                        <span className="font-mono text-xs">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
