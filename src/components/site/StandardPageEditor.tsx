import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getStandardPage, saveStandardPage } from "@/lib/sites.functions";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Image as ImageIcon, Loader2 } from "lucide-react";

type StandardPageData = {
  id?: string;
  title: string;
  subtitle: string;
  description: string;
  cta_text: string;
  cta_link: string;
  background_type: "color" | "image" | "gradient";
  background_value: string;
  background_gradient_colors?: string[];
  background_gradient_direction?: string;
  logo_url: string;
  fb_pixel_id: string;
  slug: string;
};

export function StandardPageEditor({ siteId, userId, activeTab = "standard" }: { siteId: string; userId: string; activeTab?: string }) {
  const qc = useQueryClient();
  const getPageFn = useServerFn(getStandardPage);
  const savePageFn = useServerFn(saveStandardPage);

  const { data: page, isLoading } = useQuery({
    queryKey: ["standard-page", siteId],
    queryFn: () => getPageFn({ data: { siteId } }),
  });

  const [form, setForm] = useState<StandardPageData>({
    title: "",
    subtitle: "",
    description: "",
    cta_text: "Quero entrar no grupo",
    cta_link: "",
    background_type: "gradient",
    background_value: "linear-gradient(135deg, #1e1e2f 0%, #000000 100%)",
    background_gradient_colors: ["#1e1e2f", "#000000"],
    background_gradient_direction: "135deg",
    logo_url: "",
    fb_pixel_id: "",
    slug: "oferta",
  });

  const [isUploading, setIsUploading] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logo_url' | 'background_value') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Limite de 10MB.");
      return;
    }

    setIsUploading(field);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${siteId}/${field}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('site-assets-v2')
        .upload(fileName, file, { upsert: true });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('site-assets-v2')
        .getPublicUrl(data.path);

      // If we're uploading a background and it's currently an image, update the value
      setForm(prev => ({ 
        ...prev, 
        [field]: publicUrl,
        // Also ensure background_type is set to image if we upload a background
        ...(field === 'background_value' ? { background_type: 'image' as const } : {})
      }));
      toast.success("Upload concluído!");
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Erro no upload: " + error.message);
    } finally {
      setIsUploading(null);
    }
  };

  useEffect(() => {

    if (page) {
      setForm({
        id: page.id,
        title: page.title || "",
        subtitle: page.subtitle || "",
        description: page.description || "",
        cta_text: page.cta_text || "Quero entrar no grupo",
        cta_link: page.cta_link || "",
        background_type: (page.background_type as any) || "gradient",
        background_value: page.background_value || "",
        background_gradient_colors: (page as any).background_gradient_colors || ["#1e1e2f", "#000000"],
        background_gradient_direction: (page as any).background_gradient_direction || "135deg",
        logo_url: page.logo_url || "",
        fb_pixel_id: page.fb_pixel_id || "",
        slug: page.slug || "oferta",
      });
    }
  }, [page]);

  const saveMut = useMutation({
    mutationFn: (data: StandardPageData) => savePageFn({ data: { siteId, ...data } }),
    onSuccess: () => {
      toast.success("Página padrão salva com sucesso!");
      qc.invalidateQueries({ queryKey: ["standard-page", siteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-10 text-center">Carregando configurações...</div>;

  if (activeTab === "standard_settings") {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <header className="mb-6">
          <h2 className="font-display text-2xl font-bold tracking-tight">Configurações do Modelo Padrão</h2>
          <p className="text-sm text-muted-foreground">Gerencie pixels e integrações desta página.</p>
        </header>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h3 className="mb-4 font-display text-base font-bold">Pixels de Rastreio</h3>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase text-muted-foreground/70">Facebook Pixel ID</span>
                <input 
                  value={form.fb_pixel_id} 
                  onChange={e => setForm({...form, fb_pixel_id: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-brand focus:ring-1 focus:ring-brand/20" 
                  placeholder="ID Numérico"
                />
              </label>
              <p className="text-[11px] text-muted-foreground">
                O evento de <strong>Lead</strong> será disparado automaticamente quando o usuário clicar no botão principal.
              </p>
            </div>
          </section>

          <button 
            onClick={() => saveMut.mutate(form)}
            disabled={saveMut.isPending}
            className="w-full rounded-xl btn-brand py-3 text-sm font-bold uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50"
          >
            {saveMut.isPending ? "Salvando..." : "Salvar Configurações"}
          </button>
        </div>
      </div>
    );
  }

  if (activeTab === "standard_insights") {
    return (
      <div className="mx-auto w-full max-w-4xl p-6 text-center">
        <header className="mb-10">
          <h2 className="font-display text-2xl font-bold tracking-tight">Insights do Modelo Padrão</h2>
          <p className="text-sm text-muted-foreground">Desempenho da sua página otimizada.</p>
        </header>
        <div className="rounded-2xl border border-border bg-accent/20 p-12">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand/10 text-brand">
            <ImageIcon className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold">Em breve</h3>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            Estamos preparando métricas específicas de conversão para o Modelo Padrão.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-col gap-6 p-4 lg:flex-row lg:items-start lg:gap-8">
        {/* CONFIGURATION SIDE */}
        <div className="flex-1 space-y-6">
          <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">Modelo Padrão</h2>
              <p className="text-sm text-muted-foreground">Página otimizada para anúncios e captura de leads.</p>
            </div>
            {saveMut.isPending && <span className="text-xs font-medium text-brand animate-pulse">Salvando...</span>}
          </header>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {/* TEXT CONTENT CARD */}
            <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 border-b border-border pb-3 mb-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">1</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Conteúdo do Site</h3>
              </div>
              
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase text-muted-foreground/70">Título Principal</span>
                <input 
                  value={form.title} 
                  onChange={e => setForm({...form, title: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-brand focus:ring-1 focus:ring-brand/20" 
                  placeholder="Ex: Participe do nosso grupo VIP"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase text-muted-foreground/70">Subtítulo</span>
                <input 
                  value={form.subtitle} 
                  onChange={e => setForm({...form, subtitle: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-brand focus:ring-1 focus:ring-brand/20" 
                  placeholder="Ex: Receba ofertas exclusivas todos os dias"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase text-muted-foreground/70">Descrição / Rodapé</span>
                <textarea 
                  value={form.description} 
                  onChange={e => setForm({...form, description: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-brand focus:ring-1 focus:ring-brand/20" 
                  rows={3}
                  placeholder="Explique por que a pessoa deve clicar no botão abaixo."
                />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase text-muted-foreground/70">Texto do Botão</span>
                  <input 
                    value={form.cta_text} 
                    onChange={e => setForm({...form, cta_text: e.target.value})}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-brand focus:ring-1 focus:ring-brand/20" 
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase text-muted-foreground/70">WhatsApp / Telegram</span>
                  <input 
                    value={form.cta_link} 
                    onChange={e => setForm({...form, cta_link: e.target.value})}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-brand focus:ring-1 focus:ring-brand/20" 
                    placeholder="https://wa.me/..."
                  />
                </label>
              </div>
            </div>

            {/* DESIGN & APPEARANCE CARD */}
            <div className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 border-b border-border pb-3 mb-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">2</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Design & Identidade</h3>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase text-muted-foreground/70">Tipo de Fundo</span>
                  <div className="flex overflow-hidden rounded-lg border border-border">
                    {(["color", "gradient", "image"] as const).map(t => (
                      <button 
                        key={t}
                        type="button"
                        onClick={() => setForm({...form, background_type: t})}
                        className={`flex-1 px-2 py-2 text-[10px] font-bold uppercase transition-colors ${form.background_type === t ? "bg-brand text-brand-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
                      >
                        {t === "color" ? "Cor" : t === "gradient" ? "Degradê" : "Imagem"}
                      </button>
                    ))}
                  </div>
                </label>
                
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase text-muted-foreground/70">
                    {form.background_type === "color" ? "Cor Sólida" : form.background_type === "gradient" ? "Cores do Degradê" : "Fundo (Upload ou Link)"}
                  </span>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2">
                      {form.background_type === "color" && (
                        <div className="flex w-full gap-2">
                          <input 
                            type="color"
                            value={form.background_value.startsWith("#") ? form.background_value : "#000000"} 
                            onChange={e => setForm({...form, background_value: e.target.value})}
                            className="h-10 w-10 cursor-pointer overflow-hidden rounded-lg border border-border bg-background p-0"
                          />
                          <input 
                            value={form.background_value} 
                            onChange={e => setForm({...form, background_value: e.target.value})}
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-brand focus:ring-1 focus:ring-brand/20" 
                            placeholder="#000000"
                          />
                        </div>
                      )}

                      {form.background_type === "gradient" && (
                        <div className="flex w-full flex-col gap-3">
                          <div className="flex flex-wrap gap-3">
                            {(form.background_gradient_colors || ["#1e1e2f", "#000000"]).map((color, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <input 
                                  type="color"
                                  value={color} 
                                  onChange={e => {
                                    const newColors = [...(form.background_gradient_colors || ["#1e1e2f", "#000000"])];
                                    newColors[idx] = e.target.value;
                                    const gradient = `linear-gradient(${form.background_gradient_direction || "135deg"}, ${newColors.join(", ")})`;
                                    setForm({...form, background_gradient_colors: newColors, background_value: gradient});
                                  }}
                                  className="h-10 w-10 cursor-pointer overflow-hidden rounded-lg border border-border bg-background p-0"
                                />
                                {idx > 1 && (
                                  <button 
                                    onClick={() => {
                                      const newColors = (form.background_gradient_colors || []).filter((_, i) => i !== idx);
                                      const gradient = `linear-gradient(${form.background_gradient_direction || "135deg"}, ${newColors.join(", ")})`;
                                      setForm({...form, background_gradient_colors: newColors, background_value: gradient});
                                    }}
                                    className="text-[10px] font-bold text-destructive hover:underline"
                                  >
                                    Remover
                                  </button>
                                )}
                              </div>
                            ))}
                            {(form.background_gradient_colors?.length || 0) < 3 && (
                              <button 
                                onClick={() => {
                                  const newColors = [...(form.background_gradient_colors || ["#1e1e2f", "#000000"]), "#ffffff"];
                                  const gradient = `linear-gradient(${form.background_gradient_direction || "135deg"}, ${newColors.join(", ")})`;
                                  setForm({...form, background_gradient_colors: newColors, background_value: gradient});
                                }}
                                className="flex h-10 items-center justify-center rounded-lg border border-dashed border-border px-3 text-[10px] font-bold uppercase hover:bg-accent"
                              >
                                + Adicionar Cor
                              </button>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">Direção:</span>
                            <select 
                              value={form.background_gradient_direction}
                              onChange={e => {
                                const dir = e.target.value;
                                const colors = form.background_gradient_colors || ["#1e1e2f", "#000000"];
                                const gradient = `linear-gradient(${dir}, ${colors.join(", ")})`;
                                setForm({...form, background_gradient_direction: dir, background_value: gradient});
                              }}
                              className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-bold"
                            >
                              <option value="to right">Horizontal</option>
                              <option value="to bottom">Vertical</option>
                              <option value="135deg">Diagonal 1</option>
                              <option value="45deg">Diagonal 2</option>
                            </select>
                          </div>

                          <input 
                            value={form.background_value} 
                            readOnly
                            className="w-full rounded-lg border border-border bg-accent/30 px-3 py-2 text-[10px] font-mono text-muted-foreground" 
                          />
                        </div>
                      )}

                      {form.background_type === "image" && (
                        <div className="flex w-full gap-2">
                          <input 
                            value={form.background_value} 
                            onChange={e => setForm({...form, background_value: e.target.value})}
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-brand focus:ring-1 focus:ring-brand/20" 
                            placeholder="Link da imagem..."
                          />
                          <input type="file" ref={bgInputRef} onChange={e => handleFileUpload(e, 'background_value')} accept="image/*" className="hidden" />
                          <button 
                            onClick={() => bgInputRef.current?.click()}
                            disabled={!!isUploading}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background hover:bg-accent transition-colors disabled:opacity-50"
                            title="Fazer upload de imagem"
                          >
                            {isUploading === 'background_value' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase text-muted-foreground/70">Logo (Upload ou Link)</span>
                  <div className="flex gap-2">
                    {form.logo_url && (
                      <div className="h-10 w-10 flex-shrink-0 rounded-lg border border-border bg-background p-1">
                        <img src={form.logo_url} alt="Logo preview" className="h-full w-full object-contain" />
                      </div>
                    )}
                    <input 
                      value={form.logo_url} 
                      onChange={e => setForm({...form, logo_url: e.target.value})}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-brand focus:ring-1 focus:ring-brand/20" 
                      placeholder="https://..."
                    />
                    <input type="file" ref={logoInputRef} onChange={e => handleFileUpload(e, 'logo_url')} accept="image/*" className="hidden" />
                    <button 
                      onClick={() => logoInputRef.current?.click()}
                      disabled={!!isUploading}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background hover:bg-accent transition-colors disabled:opacity-50"
                      title="Fazer upload da logo"
                    >
                      {isUploading === 'logo_url' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </button>
                  </div>
                </label>


                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase text-muted-foreground/70">Facebook Pixel ID</span>
                  <input 
                    value={form.fb_pixel_id} 
                    onChange={e => setForm({...form, fb_pixel_id: e.target.value})}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-brand focus:ring-1 focus:ring-brand/20" 
                    placeholder="ID Numérico"
                  />
                </label>
              </div>
            </div>
          </div>

          <button 
            onClick={() => saveMut.mutate(form)}
            disabled={saveMut.isPending}
            className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl btn-brand py-4 text-sm font-black uppercase tracking-widest shadow-xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            {saveMut.isPending ? "Sincronizando..." : (
              <>
                <span>Salvar & Publicar</span>
                <span className="opacity-50">→</span>
              </>
            )}
          </button>
        </div>

        {/* PREVIEW SIDE */}
        <div className="w-full lg:w-[360px] lg:flex-shrink-0">
          <div className="sticky top-6 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pré-visualização Mobile</h3>
            <div 
              className="mx-auto aspect-[9/19] w-full max-w-[300px] overflow-hidden rounded-[3rem] border-[8px] border-zinc-800 bg-black shadow-2xl ring-4 ring-zinc-700/50"
              style={{ 
                background: form.background_type === "image" ? `url(${form.background_value}) center/cover` : form.background_value,
                backgroundColor: form.background_type === "color" ? form.background_value : "black"
              }}
            >
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                {form.logo_url && <img src={form.logo_url} className="mb-8 h-12 w-auto object-contain" alt="Logo" />}
                <h1 className="font-display text-2xl font-bold text-white drop-shadow-lg leading-tight">{form.title || "Seu Título Aqui"}</h1>
                <p className="mt-2 text-xs font-medium text-white/90 drop-shadow line-clamp-3">{form.subtitle || "Seu subtítulo explicativo"}</p>
                
                <div className="mt-8 w-full">
                  <div 
                    className="w-full rounded-full bg-green-500 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(34,197,94,0.4)] animate-bounce text-center"
                    style={{ animationDuration: '3s' }}
                  >
                    {form.cta_text || "QUERO ENTRAR"}
                  </div>
                </div>
                
                <p className="mt-6 text-[10px] text-white/50 line-clamp-3 leading-relaxed">{form.description}</p>
              </div>
            </div>
            <div className="rounded-lg bg-accent/30 p-3 text-center">
              <p className="text-[10px] text-muted-foreground leading-tight">Link da página pública:</p>
              <code className="mt-1 block text-[11px] font-bold text-brand">mro.bio/{form.slug || "oferta"}</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
