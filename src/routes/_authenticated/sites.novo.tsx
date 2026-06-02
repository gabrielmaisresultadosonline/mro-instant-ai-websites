import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createSite } from "@/lib/sites.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sites/novo")({
  head: () => ({ meta: [{ title: "Criar novo site — MRO.BIO" }] }),
  component: NovoSite,
});

function NovoSite() {
  const nav = useNavigate();
  const fn = useServerFn(createSite);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fn({ data: { slug, title } });
      toast.success("Site criado! Agora descreva como ele deve ser.");
      nav({ to: "/sites/$id", params: { id: r.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar site");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">← Voltar</Link>
      <h1 className="mt-4 font-display text-3xl font-bold">Criar novo site</h1>
      <p className="text-sm text-muted-foreground">Escolha um nome curto. Esse será seu endereço.</p>
      <form onSubmit={submit} className="mt-6 rounded-2xl border border-border bg-card p-6">
        <label className="block">
          <span className="text-sm font-medium">Nome do site</span>
          <div className="mt-1 flex overflow-hidden rounded-md border border-input bg-background focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="delulu"
              maxLength={30}
              className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
            />
            <span className="grid place-items-center bg-muted px-3 text-sm font-semibold text-muted-foreground">.mro.bio</span>
          </div>
          <span className="mt-1 block text-xs text-muted-foreground">Apenas letras minúsculas, números e hífen. 3 a 30 caracteres.</span>
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-medium">Título inicial</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Delulu Café"
            maxLength={80}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </label>
        <button disabled={loading} className="mt-6 w-full rounded-md btn-brand px-5 py-3 text-sm font-semibold disabled:opacity-60">
          {loading ? "Criando..." : "Criar e ir para o editor"}
        </button>
      </form>
    </main>
  );
}
