import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getStandardPage, saveStandardPage } from "@/lib/sites.functions";

type StandardPageData = {
  id?: string;
  title: string;
  subtitle: string;
  description: string;
  cta_text: string;
  cta_link: string;
  background_type: "color" | "image" | "gradient";
  background_value: string;
  logo_url: string;
  fb_pixel_id: string;
  slug: string;
};

export function StandardPageEditor({ siteId, userId }: { siteId: string; userId: string }) {
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
    logo_url: "",
    fb_pixel_id: "",
    slug: "oferta",
  });

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

  return (
    <div className="grid gap-8 p-6 lg:grid-cols-2">
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl font-bold">Configurar Modelo Padrão</h2>
          <p className="text-sm text-muted-foreground">Esta página é otimizada para anúncios e captura de leads.</p>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold">Título Principal</span>
            <input 
              value={form.title} 
              onChange={e => setForm({...form, title: e.target.value})}
              className="w-full rounded-md border border-border bg-background p-2 text-sm focus:border-brand" 
              placeholder="Ex: Participe do nosso grupo VIP"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold">Subtítulo</span>
            <input 
              value={form.subtitle} 
              onChange={e => setForm({...form, subtitle: e.target.value})}
              className="w-full rounded-md border border-border bg-background p-2 text-sm focus:border-brand" 
              placeholder="Ex: Receba ofertas exclusivas todos os dias"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold">Descrição / Texto de apoio</span>
            <textarea 
              value={form.description} 
              onChange={e => setForm({...form, description: e.target.value})}
              className="w-full rounded-md border border-border bg-background p-2 text-sm focus:border-brand" 
              rows={3}
              placeholder="Explique por que a pessoa deve clicar no botão abaixo."
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold">Texto do Botão (Grande)</span>
              <input 
                value={form.cta_text} 
                onChange={e => setForm({...form, cta_text: e.target.value})}
                className="w-full rounded-md border border-border bg-background p-2 text-sm focus:border-brand" 
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold">Link do Botão (WhatsApp/Telegram)</span>
              <input 
                value={form.cta_link} 
                onChange={e => setForm({...form, cta_link: e.target.value})}
                className="w-full rounded-md border border-border bg-background p-2 text-sm focus:border-brand" 
                placeholder="https://wa.me/..."
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold">Facebook Pixel ID (Opcional)</span>
            <input 
              value={form.fb_pixel_id} 
              onChange={e => setForm({...form, fb_pixel_id: e.target.value})}
              className="w-full rounded-md border border-border bg-background p-2 text-sm focus:border-brand" 
              placeholder="Apenas o número do ID"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">Dispara evento de "Lead" ao clicar no botão.</p>
          </label>

          <button 
            onClick={() => saveMut.mutate(form)}
            disabled={saveMut.isPending}
            className="w-full rounded-md btn-brand py-2.5 font-bold shadow-lg"
          >
            {saveMut.isPending ? "Salvando..." : "Salvar Configurações"}
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Aparência</h3>
          <div className="space-y-4">
            <div className="flex gap-4">
              {(["color", "gradient", "image"] as const).map(t => (
                <button 
                  key={t}
                  onClick={() => setForm({...form, background_type: t})}
                  className={`flex-1 rounded-md border py-2 text-xs font-semibold ${form.background_type === t ? "border-brand bg-brand/10 text-brand" : "border-border"}`}
                >
                  {t === "color" ? "Cor Sólida" : t === "gradient" ? "Degradê" : "Imagem"}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold">
                {form.background_type === "color" ? "Código Hex (ex: #1a1a2e)" : form.background_type === "gradient" ? "CSS Linear Gradient" : "URL da Imagem"}
              </span>
              <input 
                value={form.background_value} 
                onChange={e => setForm({...form, background_value: e.target.value})}
                className="w-full rounded-md border border-border bg-background p-2 text-sm focus:border-brand" 
              />
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Pré-visualização Mobile</h3>
        <div 
          className="mx-auto aspect-[9/19] w-full max-w-[320px] overflow-hidden rounded-[3rem] border-[8px] border-zinc-800 bg-black shadow-2xl ring-4 ring-zinc-700/50"
          style={{ 
            background: form.background_type === "image" ? `url(${form.background_value}) center/cover` : form.background_value,
            backgroundColor: form.background_type === "color" ? form.background_value : "black"
          }}
        >
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            {form.logo_url && <img src={form.logo_url} className="mb-8 h-16 w-auto" alt="Logo" />}
            <h1 className="font-display text-2xl font-bold text-white drop-shadow-lg">{form.title || "Seu Título Aqui"}</h1>
            <p className="mt-2 text-sm font-medium text-white/90 drop-shadow">{form.subtitle || "Seu subtítulo explicativo"}</p>
            
            <div className="mt-12 w-full space-y-4">
              <button 
                className="w-full rounded-full bg-green-500 py-4 text-sm font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(34,197,94,0.5)] animate-bounce"
                style={{ animationDuration: '3s' }}
              >
                {form.cta_text}
              </button>
            </div>
            
            <p className="mt-8 text-xs text-white/60">{form.description}</p>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground">O link da sua página será:<br/><strong className="text-foreground">mro.bio/{form.slug}</strong> (ou no seu subdomínio)</p>
      </div>
    </div>
  );
}
