import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  getSite, saveSite, deleteSite, generateSiteHtml, getSiteInsights,
  listGenerations, getGenerationHtml, activateGeneration, deleteGeneration,
  editGeneration, getEditQuota,
} from "@/lib/sites.functions";

export const Route = createFileRoute("/_authenticated/sites/$id")({
  head: () => ({ meta: [{ title: "Editor — MRO.BIO" }] }),
  component: SiteEditor,
});

type Pixels = { ga4?: string; gtm?: string; meta?: string; tiktok?: string };
type LocalImage = { id: string; public_url: string; label: string | null; created_at?: string };

const PROVIDER_LABEL: Record<string, string> = {
  deepseek: "Modelo 1",
  claude: "Modelo 2",
  openai: "Modelo 3",
};

function SiteEditor() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [selectedGenId, setSelectedGenId] = useState<string | null>(null);

  const getSiteFn = useServerFn(getSite);
  const saveFn = useServerFn(saveSite);
  const deleteFn = useServerFn(deleteSite);
  const genFn = useServerFn(generateSiteHtml);
  const insightsFn = useServerFn(getSiteInsights);
  const listGensFn = useServerFn(listGenerations);
  const getGenHtmlFn = useServerFn(getGenerationHtml);
  const activateGenFn = useServerFn(activateGeneration);
  const deleteGenFn = useServerFn(deleteGeneration);
  const editGenFn = useServerFn(editGeneration);
  const getEditQuotaFn = useServerFn(getEditQuota);

  const { data: site, isLoading } = useQuery({
    queryKey: ["site", id],
    queryFn: () => getSiteFn({ data: { id } }),
  });
  const { data: imgs } = useQuery<{ images: LocalImage[] }>({
    queryKey: ["my-images", id, user.id],
    queryFn: async () => {
      const res = await fetch(`/api/public/local-images?siteId=${encodeURIComponent(id)}&ownerId=${encodeURIComponent(user.id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao carregar imagens.");
      return json;
    },
  });
  const { data: insights } = useQuery({
    queryKey: ["insights", id],
    queryFn: () => insightsFn({ data: { id } }),
  });
  const { data: gens } = useQuery({
    queryKey: ["generations", id],
    queryFn: () => listGensFn({ data: { siteId: id } }),
  });
  const activeGen = (gens?.generations ?? []).find((g) => g.is_active) ?? null;
  const { data: editQuota } = useQuery({
    queryKey: ["edit-quota", selectedGenId || activeGen?.id],
    queryFn: () => getEditQuotaFn({ data: { generationId: (selectedGenId || activeGen?.id)! } }),
    enabled: !!(selectedGenId || activeGen?.id),
  });
  const editsUsed = editQuota?.used ?? 0;
  const editsLimit = editQuota?.limit ?? 5;
  const editsLeft = Math.max(0, editsLimit - editsUsed);

  const [prompt, setPrompt] = useState("");
  const [html, setHtml] = useState("");
  const [pixels, setPixels] = useState<Pixels>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState<"preview" | "edit" | "history" | "settings" | "insights">("preview");
  const [preview, setPreview] = useState<{ id: string; provider: string; html: string } | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmInfo, setConfirmInfo] = useState(false);   // popup pre-generate (info check)
  const [confirmRules, setConfirmRules] = useState(false); // popup mensal explanation
  const [rulesSeen, setRulesSeen] = useState(false);
  const [cleanup, setCleanup] = useState<null | { historyLimit: number; inactives: { id: string; provider: string; created_at: string }[]; selected: Set<string> }>(null);
  const [uploadQueue, setUploadQueue] = useState<null | { file: File; previewUrl: string; label: string }[]>(null);
  const [renameTarget, setRenameTarget] = useState<null | { id: string; label: string }>(null);
  const [viewer, setViewer] = useState<null | { url: string; label: string }>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const prevImgsRef = useRef<string[]>([]);

  useEffect(() => {
    if (imgs?.images) {
      const currentIds = imgs.images.map(im => im.id);
      const newImgs = imgs.images.filter(im => !prevImgsRef.current.includes(im.id));
      
      if (newImgs.length > 0) {
        setSelected(prev => {
          const next = new Set(prev);
          newImgs.forEach(im => next.add(im.public_url));
          return next;
        });
      }
      prevImgsRef.current = currentIds;
    }
  }, [imgs?.images]);

  useEffect(() => {
    if (site) {
      setPrompt(site.last_prompt ?? "");
      setHtml(site.html ?? "");
      setPixels((site.pixels ?? {}) as Pixels);
    }
  }, [site]);

  useEffect(() => {
    if (activeGen && !selectedGenId) {
      setSelectedGenId(activeGen.id);
    }
  }, [activeGen, selectedGenId]);

  const monthlyUsed = (site?.gens_this_month as number | undefined) ?? 0;
  const monthlyLimit = 3;
  const monthlyLeft = Math.max(0, monthlyLimit - monthlyUsed);

  const saveMut = useMutation({
    mutationFn: async (payload: { html?: string; pixels?: Pixels; is_published?: boolean; title?: string; slug?: string }) => {
      return saveFn({ data: { id, ...payload, pixels: payload.pixels ?? pixels } });
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

  function openGenerateFlow() {
    if (prompt.trim().length < 5) { toast.error("Descreva o site com mais detalhes."); return; }
    const chosen = (imgs?.images ?? []).filter((im) => selected.has(im.public_url));
    const missing = chosen.filter((im) => !im.label || !im.label.trim());
    if (missing.length > 0) { toast.error("Defina uma tag (ex.: logo, banner) para cada imagem selecionada."); return; }
    if (monthlyLeft <= 0) {
      toast.error("Você já usou suas 3 gerações deste mês. Aguarde a renovação.");
      return;
    }
    if (!rulesSeen) { setConfirmRules(true); return; }
    setConfirmInfo(true);
  }

  async function runGenerate(confirmDeleteIds?: string[]) {
    setGenerating(true);
    try {
      const chosen = (imgs?.images ?? []).filter((im) => selected.has(im.public_url));
      console.log("[DEBUG_EDITOR] Imagens selecionadas no front:", chosen);
      
      // No servidor, processamos o domínio real. Aqui enviamos o path relativo ou absoluto se já tiver.
      const images = chosen.map((im) => ({
        url: im.public_url, // O servidor cuidará de completar com o domínio correto se necessário
        label: im.label!.trim(),
      }));
      console.log("[DEBUG_EDITOR] Payload de imagens formatado:", images);
      const res = await genFn({ data: { id, prompt, images, confirmDeleteIds } });
      if (res.needsCleanup) {
        setCleanup({ historyLimit: res.historyLimit, inactives: res.inactives, selected: new Set() });
        toast.message("Histórico cheio — escolha quais gerações antigas remover.");
        return;
      }
      setPreview({ id: res.generationId, provider: res.provider, html: res.html });
      setSelectedGenId(res.generationId);
      setTab("preview");
      qc.invalidateQueries({ queryKey: ["site", id] });
      qc.invalidateQueries({ queryKey: ["generations", id] });
      toast.success(`${PROVIDER_LABEL[res.provider]} pronta — ${res.gensUsed}/${res.monthlyLimit} no mês`);
    } catch (e) {
      const msg = (e as Error).message;
      toast.error(msg);
      if (msg.includes("Sessão inválida") || msg.includes("Unauthorized")) {
        // Se a sessão expirou ou as chaves mudaram, oferecemos logout
        if (confirm("Sua sessão parece ter expirado ou as chaves do servidor foram alteradas. Deseja sair e entrar novamente para sincronizar?")) {
          await Route.useRouteContext().supabase.auth.signOut();
          window.location.href = "/login";
        }
      }
    } finally {
      setGenerating(false);
    }
  }

  const activateMut = useMutation({
    mutationFn: (genId: string) => activateGenFn({ data: { id: genId } }),
    onSuccess: () => {
      toast.success("Versão ativada — agora é o site publicado.");
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["site", id] });
      qc.invalidateQueries({ queryKey: ["generations", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteGenMut = useMutation({
    mutationFn: (genId: string) => deleteGenFn({ data: { id: genId } }),
    onSuccess: () => {
      toast.success("Geração removida");
      qc.invalidateQueries({ queryKey: ["generations", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function runEdit() {
    const finalTarget = selectedGenId || activeGen?.id;
    if (!finalTarget) { toast.error("Você precisa escolher uma versão para editar."); return; }
    if (editPrompt.trim().length < 5) { toast.error("Descreva o que deseja editar."); return; }
    if (editsLeft <= 0) { toast.error(`Você usou as ${editsLimit} edições deste modelo no mês.`); return; }
    setEditing(true);
    try {
      const res = await editGenFn({ data: { generationId: finalTarget, prompt: editPrompt } });
      setPreview({ id: res.generationId, provider: res.provider, html: res.html });
      setEditPrompt("");
      setTab("preview");
      qc.invalidateQueries({ queryKey: ["generations", id] });
      qc.invalidateQueries({ queryKey: ["edit-quota", finalTarget] });
      toast.success(`Edição pronta — ${res.editsUsed}/${res.editsLimit} no mês deste modelo.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEditing(false);
    }
  }

  async function openHistoryItem(genId: string) {
    try {
      const row = await getGenHtmlFn({ data: { id: genId } });
      setPreview({ id: row.id, provider: row.provider, html: row.html });
      setTab("preview");
    } catch (e) { toast.error((e as Error).message); }
  }

  function queueUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const items = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      label: file.name.replace(/\.[^.]+$/, "").slice(0, 60),
    }));
    setUploadQueue(items);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function confirmUploadQueue() {
    if (!uploadQueue) return;
    const missing = uploadQueue.filter((i) => !i.label.trim());
    if (missing.length > 0) {
      toast.error("Defina uma etiqueta para cada imagem antes de salvar.");
      return;
    }

    let successCount = 0;
    for (const item of uploadQueue) {
      try {
        const form = new FormData();
        form.append("siteId", id);
        form.append("ownerId", user.id);
        form.append("label", item.label.trim().slice(0, 80));
        form.append("file", item.file);
        const res = await fetch("/api/public/local-images", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Erro ao salvar imagem no servidor.");
        }
        successCount++;
      } catch (e) {
        toast.error(`${item.file.name}: ${(e as Error).message}`);
      }
    }
    
    // Auto-select newly uploaded images
    qc.invalidateQueries({ queryKey: ["my-images", id, user.id] }).then(() => {
      // We don't have the new URLs yet from the query, so we'll rely on the next render
      // or we can optimistically add the public_urls if we had them.
      // Since we refresh the query, let's use a small trick: 
      // the user wants them marked "when uploading".
    });

    uploadQueue.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setUploadQueue(null);
    
    if (successCount > 0) {
      toast.success(successCount === uploadQueue.length 
        ? "Imagens salvas no seu servidor com sucesso." 
        : `${successCount} de ${uploadQueue.length} imagens salvas.`);
    }
  }

  function cancelUploadQueue() {
    uploadQueue?.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setUploadQueue(null);
  }

  async function saveRename() {
    if (!renameTarget) return;
    const v = renameTarget.label.trim();
    if (!v) { toast.error("Etiqueta não pode ficar vazia."); return; }
    try {
      const res = await fetch("/api/public/local-images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: id, ownerId: user.id, id: renameTarget.id, label: v.slice(0, 80) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao atualizar etiqueta.");
      qc.invalidateQueries({ queryKey: ["my-images", id, user.id] });
      setRenameTarget(null);
      toast.success("Etiqueta atualizada");
    } catch (e) { toast.error((e as Error).message); }
  }

  async function removeLocalImage(imageId: string) {
    const res = await fetch("/api/public/local-images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: id, ownerId: user.id, id: imageId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erro ao excluir imagem.");
    qc.invalidateQueries({ queryKey: ["my-images", id, user.id] });
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
      {generating && <LoadingOverlay message="Gerando com I.A..." />}
      {editing && <LoadingOverlay message="Editando modelo..." />}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/70 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 transition-colors"
          >
            ← Voltar
          </Link>
          <h1 className="mt-1 font-display text-2xl font-bold">{site.title || site.slug}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{site.slug}.mro.bio</span>
            {" · "}
            <span>{monthlyUsed}/{monthlyLimit} gerações no mês</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => saveMut.mutate({ is_published: !site.is_published })}
            className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent/40">
            {site.is_published ? "🟢 Despublicar" : "🟡 Publicar"}
          </button>
          <a href={`https://${site.slug}.mro.bio`} target="_blank" rel="noreferrer"
            className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent/40">Ver site ↗</a>
          <button
            onClick={async () => {
              const url = `https://${site.slug}.mro.bio`;
              try { await navigator.clipboard.writeText(url); alert(`Link copiado: ${url}`); }
              catch { window.prompt("Copie o link:", url); }
            }}
            className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent/40">
            📋 Copiar link
          </button>
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
              placeholder="Ex.: Quero um site de coach de emagrecimento para mulheres 30+, tom amigável, com depoimentos e botão de WhatsApp. Inclua nome, endereço, telefone e principais serviços."
              className="w-full rounded-md border border-border bg-background p-3 text-sm focus:border-brand focus:outline-none" />
            <button onClick={openGenerateFlow} disabled={generating || monthlyLeft <= 0}
              className="mt-3 w-full rounded-md btn-brand py-2.5 text-sm font-semibold disabled:opacity-60 relative overflow-hidden">
              {generating ? "Gerando com I.A…" : monthlyLeft <= 0 ? "Limite mensal atingido" : "✨ Gerar com I.A"}
              {generating && (
                <div className="absolute bottom-0 left-0 h-1 bg-white/30 animate-[progress_15s_ease-in-out_infinite]" style={{ width: '100%' }} />
              )}
            </button>
            <style>{`
              @keyframes progress {
                0% { width: 0%; }
                100% { width: 100%; }
              }
            `}</style>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Você tem <strong>{monthlyLeft}</strong> de {monthlyLimit} gerações disponíveis este mês. Cada geração usa uma versão diferente da nossa <strong>I.A MRO</strong> e fica salva no histórico.
            </p>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold">Imagens</h2>
              <label className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/40">
                + Enviar
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => queueUpload(e.target.files)} />
              </label>
            </div>
            <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Sempre salve uma etiqueta</strong> ao enviar (ex.: <em>logo</em>, <em>banner</em>, <em>foto-equipe</em>, <em>produto-1</em>).
              A etiqueta diz à I.A MRO <strong>o que cada imagem é</strong> — isso faz o site sair muito melhor. Tudo fica salvo no seu servidor.
            </div>
            {imgs?.images.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma imagem ainda. Clique em <strong>+ Enviar</strong> e dê uma etiqueta para cada uma.</p>
            ) : (
              <>
                <p className="mb-2 text-[10px] text-muted-foreground">Clique na imagem para ver em tamanho grande. Use o ✓ para selecionar quais entram na geração.</p>
                <div className="grid grid-cols-3 gap-1.5 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-5">
                  {imgs?.images.map((im) => {
                    const isSel = selected.has(im.public_url);
                    const hasTag = !!(im.label && im.label.trim());
                    return (
                      <div key={im.id} className={`group relative overflow-hidden rounded-md border ${isSel ? "border-brand ring-1 ring-brand" : "border-border"}`}>
                        <button type="button" onClick={() => setViewer({ url: im.public_url, label: im.label ?? "" })}
                          className="block w-full" title="Ver maior">
                          <img src={im.public_url} alt={im.label ?? ""} loading="lazy" className="aspect-square w-full object-cover" />
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleSelected(im.public_url); }}
                          aria-label={isSel ? "Desmarcar" : "Selecionar"}
                          className={`absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full border text-[10px] font-bold shadow ${isSel ? "border-brand bg-brand text-brand-foreground" : "border-white/70 bg-black/40 text-white"}`}>
                          {isSel ? "✓" : ""}
                        </button>
                        <button type="button" onClick={async () => { if (confirm("Excluir imagem?")) { try { await removeLocalImage(im.id); } catch (e) { toast.error((e as Error).message); } } }}
                          aria-label="Excluir"
                          className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/50 text-[11px] leading-none text-white hover:bg-destructive">×</button>
                        <button type="button" onClick={() => setRenameTarget({ id: im.id, label: im.label ?? "" })}
                          className={`block w-full truncate border-t border-border bg-background/70 px-1 py-0.5 text-left text-[9px] font-semibold ${hasTag ? "text-foreground" : "text-amber-500"}`}>
                          {hasTag ? `#${im.label}` : "+ etiqueta"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </aside>

        {/* RIGHT: tabs */}
        <section className="rounded-xl border border-border bg-card">
          <div className="sticky top-0 z-20 -mt-px flex flex-wrap gap-1 rounded-t-xl border-b border-border bg-card/95 p-1.5 backdrop-blur">
            {(["preview", "edit", "history", "settings", "insights"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${tab === t ? "bg-foreground text-background" : "hover:bg-accent/40"}`}>
                {t === "preview" ? "Pré-visualização"
                  : t === "edit" ? `✏️ Editar modelo${(selectedGenId || activeGen) ? ` (${editsLeft}/${editsLimit})` : ""}`
                  : t === "history" ? `Histórico (${gens?.generations.length ?? 0}/4)`
                  : t === "settings" ? "Configurações"
                  : "Insights"}
              </button>
            ))}
          </div>


          {tab === "preview" && (
            <div className="p-2">
              {preview ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                    <div className="text-xs">
                      <span className="rounded-md bg-foreground px-2 py-1 font-semibold text-background">
                        I.A: {PROVIDER_LABEL[preview.provider] ?? preview.provider}
                      </span>
                      <span className="ml-2 text-muted-foreground">Gostou? Ative para usar como seu site. Quer outra ideia? Gere de novo (usa outro modelo).</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setPreview(null)}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/40">
                        Fechar
                      </button>
                      <button onClick={openGenerateFlow} disabled={generating || monthlyLeft <= 0}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/40 disabled:opacity-60">
                        🔄 Gerar outra ({monthlyLeft} restantes)
                      </button>
                      <button onClick={() => { setSelectedGenId(preview.id); setTab("edit"); }}
                        className="rounded-md border border-brand/50 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/20">
                        ✏️ Editar
                      </button>
                      <button onClick={() => activateMut.mutate(preview.id)} disabled={activateMut.isPending}
                        className="rounded-md btn-brand px-3 py-1.5 text-xs font-semibold">
                        ✓ Ativar esta versão
                      </button>
                    </div>
                  </div>
                  <iframe title="Preview" srcDoc={preview.html} sandbox="allow-scripts allow-same-origin"
                    className="h-[70vh] w-full rounded-md border border-border bg-white" />
                </div>
              ) : html ? (
                <iframe title="Preview" srcDoc={html} sandbox="allow-scripts allow-same-origin"
                  className="h-[70vh] w-full rounded-md border border-border bg-white" />
              ) : (
                <div className="grid h-[70vh] place-items-center text-center text-sm text-muted-foreground">
                  Descreva o site e clique em <strong className="mx-1">Gerar com I.A</strong>.
                </div>
              )}
            </div>
          )}

          {tab === "edit" && (
            <div className="space-y-4 p-5">
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed">
                <strong>Editar modelo</strong> mantém o mesmo modelo já ativo e aplica só as mudanças que você descrever
                (trocar textos, cores, ajustar seções, etc.). Você tem <strong>{editsLimit} edições por modelo, por mês</strong>.
                Cada modelo novo (das suas 3 gerações mensais) ganha o próprio contador de 5 edições.
              </div>

              {(gens?.generations.length ?? 0) === 0 ? (
                <div className="rounded-lg border border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
                  Você ainda não tem nenhuma geração. Vá em <strong>Pré-visualização</strong> e gere seu site com a I.A primeiro.
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="font-semibold text-muted-foreground uppercase tracking-wider">Escolha a versão para editar:</div>
                      <div className="text-muted-foreground">
                        Edições deste modelo: <strong className="text-foreground">{editsUsed}/{editsLimit}</strong> no mês
                      </div>
                    </div>
                    
                    <select 
                      value={selectedGenId || ""} 
                      onChange={(e) => setSelectedGenId(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
                    >
                      {gens?.generations.map((g) => (
                        <option key={g.id} value={g.id}>
                          {PROVIDER_LABEL[g.provider] || g.provider} — {new Date(g.created_at).toLocaleString("pt-BR")} {g.is_active ? "(Ativa)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    rows={6}
                    maxLength={2000}
                    placeholder="Ex.: Troque o título do hero para 'Bem-vindo à Essência'. Mude a cor dos botões para roxo. Adicione um depoimento da Maria abaixo da seção de serviços. Mantenha o resto igual."
                    className="w-full rounded-md border border-border bg-background p-3 text-sm focus:border-brand focus:outline-none"
                  />

                  <button
                    onClick={runEdit}
                    disabled={editing || editsLeft <= 0 || editPrompt.trim().length < 5}
                    className="w-full rounded-md btn-brand py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    {editing ? "Editando modelo…" : editsLeft <= 0 ? "Limite de edições atingido neste mês" : `✨ Aplicar edição (${editsLeft} restantes)`}
                  </button>

                  <p className="text-[11px] text-muted-foreground">
                    A edição vai gerar uma <strong>nova versão</strong> baseada no modelo atual (sem recriar do zero). Você poderá
                    pré-visualizar e clicar em <strong>Ativar</strong> para publicar — ou descartar e tentar de novo.
                  </p>
                </>
              )}
            </div>
          )}


          {tab === "history" && (
            <div className="space-y-2 p-4">
              <p className="text-xs text-muted-foreground">
                Até <strong>4 versões</strong> ficam salvas em nuvem. As inativas são apagadas automaticamente após 45 dias. A versão ativa é a que está publicada.
              </p>
              {(gens?.generations.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma geração ainda.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {gens!.generations.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="text-sm">
                        <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold">{PROVIDER_LABEL[g.provider] ?? g.provider}</span>
                        {g.is_active && <span className="ml-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500">ATIVA</span>}
                        <span className="ml-2 text-xs text-muted-foreground">{new Date(g.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openHistoryItem(g.id)}
                          className="rounded border border-border px-2 py-1 text-[11px] hover:bg-accent/40">👁 Ver</button>
                        {!g.is_active && (
                          <>
                            <button onClick={() => activateMut.mutate(g.id)} disabled={activateMut.isPending}
                              className="rounded btn-brand px-2 py-1 text-[11px] font-semibold">Ativar</button>
                            <button onClick={() => { if (confirm("Excluir esta geração?")) deleteGenMut.mutate(g.id); }}
                              className="rounded border border-destructive/40 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10">×</button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "settings" && (
            <div className="space-y-6 p-5">
              <section>
                <h3 className="mb-3 font-display text-base font-bold">Identidade do site</h3>
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold">Nome do site</span>
                    <input 
                      value={site.title ?? ""} 
                      onChange={(e) => saveMut.mutate({ title: e.target.value })} 
                      placeholder="Ex: Minha Empresa"
                      className="w-full rounded-md border border-border bg-background p-2.5 text-sm focus:border-brand focus:outline-none" 
                    />
                  </label>

                  <div>
                    <span className="mb-1.5 block text-xs font-semibold">Link do site (slug)</span>
                    <div className="relative flex items-center">
                      <input 
                        value={site.slug} 
                        readOnly
                        disabled
                        className="w-full rounded-md border border-border bg-accent/20 p-2.5 text-sm font-mono opacity-70 outline-none" 
                      />
                      <span className="absolute right-3 text-xs font-mono text-muted-foreground">.mro.bio</span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-amber-500">
                      O link é gerado automaticamente na criação. Para alterar o link, entre em contato com o suporte (limite de 1 alteração por ano).
                    </p>
                  </div>
                </div>
              </section>

              <section className="border-t border-border pt-6">
                <h3 className="mb-1 font-display text-base font-bold">Pixels de rastreio</h3>
                <p className="mb-4 text-xs text-muted-foreground">Cole os IDs dos pixels — eles serão injetados automaticamente no <code>&lt;head&gt;</code> do site.</p>
                <div className="space-y-4">
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
              </section>
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

      {/* POPUP — Regras mensais (mostrado na 1ª vez) */}
      {confirmRules && (
        <Modal onClose={() => setConfirmRules(false)}>
          <h3 className="font-display text-lg font-bold">Como funcionam as gerações com a I.A MRO</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>• Você tem <strong className="text-foreground">3 gerações por mês</strong>. Após 30 dias, libera mais 3 (sempre 3 disponíveis no total — não acumula).</li>
            <li>• Cada geração usa uma versão diferente da nossa <strong>I.A MRO</strong> em sequência (<strong>MRO v1 → MRO v2 → MRO v3</strong>), para que você possa comparar estilos e escolher a melhor.</li>
            <li>• Todas as gerações ficam salvas no <strong>Histórico</strong> (máx. 4). Você pode ativar qualquer uma a qualquer momento — só a ativa fica publicada.</li>
            <li>• As versões inativas são apagadas automaticamente após <strong>45 dias</strong> para não pesar nossa hospedagem.</li>
            <li>• <strong>Não desperdice</strong>: quanto mais detalhes você der no texto, melhor o resultado e menos tentativas você precisa.</li>
          </ul>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirmRules(false)} className="rounded-md border border-border px-3 py-2 text-sm">Cancelar</button>
            <button onClick={() => { setRulesSeen(true); setConfirmRules(false); setConfirmInfo(true); }}
              className="rounded-md btn-brand px-4 py-2 text-sm font-semibold">Entendi, continuar</button>
          </div>
        </Modal>
      )}

      {/* POPUP — Checklist de informações */}
      {confirmInfo && (
        <Modal onClose={() => setConfirmInfo(false)}>
          <h3 className="font-display text-lg font-bold">Antes de gerar — uma última conferida</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Quanto mais informação você passar, melhor a I.A entrega. Releia sua descrição e confirme que ela responde:
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>✓ <strong>Nome / marca</strong> do site ou negócio</li>
            <li>✓ <strong>O que você faz / vende / oferece</strong> (conteúdo)</li>
            <li>✓ <strong>Para quem</strong> é o site (público)</li>
            <li>✓ <strong>Qual é a sua ideia</strong> — tom, estilo, o que deve aparecer</li>
            <li>✓ <strong>Contato</strong> (WhatsApp, endereço, redes — se quiser)</li>
          </ul>
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            Você tem <strong>{monthlyLeft}</strong> geraç{monthlyLeft === 1 ? "ão" : "ões"} restante{monthlyLeft === 1 ? "" : "s"} este mês. Esta vai usar <strong>{PROVIDER_LABEL[(["deepseek", "claude", "openai"] as const)[(site.next_provider_idx as number) % 3]]}</strong>.
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirmInfo(false)} className="rounded-md border border-border px-3 py-2 text-sm">Voltar e editar</button>
            <button onClick={() => { setConfirmInfo(false); runGenerate(); }}
              className="rounded-md btn-brand px-4 py-2 text-sm font-semibold">Sim, gerar agora</button>
          </div>
        </Modal>
      )}

      {/* POPUP — Histórico cheio */}
      {cleanup && (
        <Modal onClose={() => setCleanup(null)}>
          <h3 className="font-display text-lg font-bold">Histórico cheio ({cleanup.historyLimit}/{cleanup.historyLimit})</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Para gerar uma nova versão, escolha quais gerações antigas (inativas) podem ser removidas. Isso libera espaço sem afetar o site publicado.
          </p>
          {cleanup.inactives.length === 0 ? (
            <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              Todas as suas versões estão ativas — não dá para remover nenhuma. Aguarde 45 dias ou desative manualmente no histórico.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-md border border-border">
              {cleanup.inactives.map((g) => {
                const sel = cleanup.selected.has(g.id);
                return (
                  <li key={g.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={sel} onChange={() => {
                        const next = new Set(cleanup.selected);
                        if (sel) next.delete(g.id); else next.add(g.id);
                        setCleanup({ ...cleanup, selected: next });
                      }} />
                      <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold">{PROVIDER_LABEL[g.provider] ?? g.provider}</span>
                      <span className="text-xs text-muted-foreground">{new Date(g.created_at).toLocaleString("pt-BR")}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setCleanup(null)} className="rounded-md border border-border px-3 py-2 text-sm">Cancelar</button>
            <button onClick={() => { const ids = Array.from(cleanup.selected); setCleanup(null); runGenerate(ids); }}
              disabled={cleanup.selected.size === 0}
              className="rounded-md btn-brand px-4 py-2 text-sm font-semibold disabled:opacity-50">
              Remover {cleanup.selected.size} e gerar
            </button>
          </div>
        </Modal>
      )}

      {uploadQueue && (
        <Modal onClose={cancelUploadQueue}>
          <h3 className="font-display text-lg font-bold">Dê uma etiqueta para cada imagem</h3>
          <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed">
            A <strong>etiqueta</strong> identifica o que é a imagem (ex.: <em>logo</em>, <em>banner</em>, <em>foto-equipe</em>, <em>produto-1</em>, <em>fundo-hero</em>).
            Isso é <strong>essencial</strong>: é com ela que a nossa I.A MRO sabe onde colocar cada imagem ao gerar o seu site.
            Tudo fica salvo no <strong>seu servidor</strong>.
          </div>
          <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {uploadQueue.map((it, idx) => (
              <div key={idx} className="flex items-start gap-3 rounded-md border border-border p-2">
                <img src={it.previewUrl} alt="" className="h-16 w-16 flex-shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-muted-foreground">{it.file.name}</p>
                  <input
                    autoFocus={idx === 0}
                    value={it.label}
                    onChange={(e) => {
                      const v = e.target.value;
                      setUploadQueue((q) => q ? q.map((x, i) => i === idx ? { ...x, label: v } : x) : q);
                    }}
                    placeholder="Etiqueta (ex.: logo, banner)"
                    maxLength={80}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-brand focus:outline-none" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={cancelUploadQueue} className="rounded-md border border-border px-3 py-2 text-sm">Cancelar</button>
            <button onClick={confirmUploadQueue} className="rounded-md btn-brand px-4 py-2 text-sm font-semibold">
              Salvar {uploadQueue.length} imagem{uploadQueue.length === 1 ? "" : "s"} no servidor
            </button>
          </div>
        </Modal>
      )}

      {renameTarget && (
        <Modal onClose={() => setRenameTarget(null)}>
          <h3 className="font-display text-lg font-bold">Editar etiqueta</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            A etiqueta diz à I.A MRO o que é essa imagem (ex.: <em>logo</em>, <em>banner</em>, <em>produto-1</em>). Quanto melhor a etiqueta, melhor o site.
          </p>
          <input
            autoFocus
            value={renameTarget.label}
            onChange={(e) => setRenameTarget({ ...renameTarget, label: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") saveRename(); }}
            placeholder="Ex.: logo, banner, foto-equipe"
            maxLength={80}
            className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none" />
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setRenameTarget(null)} className="rounded-md border border-border px-3 py-2 text-sm">Cancelar</button>
            <button onClick={saveRename} className="rounded-md btn-brand px-4 py-2 text-sm font-semibold">Salvar etiqueta</button>
          </div>
        </Modal>
      )}

      {viewer && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85 p-3 sm:p-6" onClick={() => setViewer(null)}>
          <button onClick={() => setViewer(null)} aria-label="Fechar"
            className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20">×</button>
          <div className="flex max-h-full max-w-full flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <img src={viewer.url} alt={viewer.label} className="max-h-[85vh] max-w-[95vw] rounded-lg object-contain shadow-2xl" />
            {viewer.label && <p className="rounded bg-black/50 px-3 py-1 text-xs font-semibold text-white">#{viewer.label}</p>}
          </div>
        </div>
      )}
    </main>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function LoadingOverlay({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm text-white p-6 text-center">
      <div className="relative h-24 w-24 mb-6">
        <div className="absolute inset-0 rounded-full border-4 border-white/20"></div>
        <div className="absolute inset-0 rounded-full border-4 border-brand border-t-transparent animate-spin"></div>
        <div className="absolute inset-2 rounded-full border-4 border-white/10"></div>
        <div className="absolute inset-2 rounded-full border-4 border-brand/50 border-b-transparent animate-spin-slow"></div>
        <div className="absolute inset-0 flex items-center justify-center text-3xl">
          ✨
        </div>
      </div>
      <h2 className="text-2xl font-bold font-display mb-2 animate-pulse">{message}</h2>
      <p className="text-white/60 text-sm max-w-xs leading-relaxed">
        Nossa I.A está construindo cada detalhe do seu site.<br />Isso pode levar alguns segundos...
      </p>
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </div>
  );
}
