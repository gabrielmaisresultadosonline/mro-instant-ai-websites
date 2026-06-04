import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useReveal } from "@/hooks/use-reveal";
import { fbEvent } from "@/lib/facebook-pixel";
import { createResellerCheckout } from "@/lib/reseller.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/rendaextra")({
  head: () => ({
    meta: [
      { title: "Renda Extra — Revenda Sites com MRO.BIO · R$ 297/ano" },
      { name: "description", content: "Ganhe dinheiro revendendo sites profissionais. Plano revendedor MRO.BIO por R$ 297/ano. Crie até 10 sites, venda por R$ 297 cada e lucre R$ 261 por site." },
    ],
  }),
  component: RendaExtraPage,
});

function RendaExtraPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Header />
      <Hero />
      <MarketComparison />
      <ProfitCalc />
      <Benefits />
      <HowResellerWorks />
      <Checkout />
      <Faq />
      <Footer />
    </div>
  );
}

function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled
          ? "border-b border-border/70 bg-background/85 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="grid h-9 w-9 place-items-center rounded-lg btn-brand font-display text-base font-bold transition-transform group-hover:rotate-6">M</span>
          <span className="font-display text-lg font-bold tracking-tight">MRO.BIO</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#comparativo" className="hover:text-foreground transition-colors">Comparativo</a>
          <a href="#lucro" className="hover:text-foreground transition-colors">Quanto lucra</a>
          <a href="#beneficios" className="hover:text-foreground transition-colors">Benefícios</a>
          <a href="#checkout" className="hover:text-foreground transition-colors">Assinar</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/" className="hidden rounded-md px-3 py-2 text-sm font-medium hover:bg-accent/30 md:inline-flex">Voltar ao site</Link>
          <a
            href="#checkout"
            className="rounded-md btn-brand px-4 py-2 text-sm font-semibold"
            onClick={() => fbEvent("InitiateCheckout", { content_name: "Renda Extra Header CTA" })}
          >
            Quero revender
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pt-8 md:pt-14">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[oklch(0.99_0.06_95)] via-background to-background" />
      <div className="absolute inset-0 -z-10 bg-grid" />
      <div className="blob -z-10 left-[-10%] top-[-10%] h-[420px] w-[420px] bg-[oklch(0.92_0.18_95)]" />
      <div className="blob -z-10 right-[-10%] top-[20%] h-[360px] w-[360px] bg-[oklch(0.85_0.15_85)] opacity-40" />

      <div className="mx-auto max-w-6xl px-5 py-10 md:py-16">
        <Reveal>
          <div className="text-center max-w-4xl mx-auto">
            <span className="chip">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" style={{ animation: "pulseDot 1.6s ease-in-out infinite" }} />
              Plano Revenda — Renda Extra
            </span>
            <h1 className="mt-6 font-display text-5xl font-bold leading-[1.02] md:text-7xl">
              Ganhe dinheiro criando
              <br />
              <span className="text-gradient-brand">sites para empresas.</span>
            </h1>
            <p className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground">
              Empresas pagam caro por site profissional. Com o plano revendedor MRO.BIO, você entrega sites bonitos em <strong className="text-foreground">menos de 5 minutos</strong> e fatura recorrente todos os anos.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a
                href="#checkout"
                className="group inline-flex items-center gap-2 rounded-md btn-brand px-6 py-3.5 text-base font-semibold"
                onClick={() => fbEvent("InitiateCheckout", { content_name: "Renda Extra Hero CTA" })}
              >
                Começar por R$ 297/ano
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </a>
              <a href="#comparativo" className="rounded-md border border-border bg-background px-6 py-3.5 text-base font-medium hover:bg-accent/30 hover:border-foreground/30 transition">
                Ver comparativo
              </a>
            </div>
            <div className="mt-10 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-brand-foreground text-[11px] font-bold">✓</span>
                10 sites inclusos no plano
              </div>
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-brand-foreground text-[11px] font-bold">✓</span>
                Lucro de R$ 261 por site
              </div>
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-brand-foreground text-[11px] font-bold">✓</span>
                Pagamento único anual
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function MarketComparison() {
  return (
    <section id="comparativo" className="relative bg-foreground text-background overflow-hidden">
      <div className="absolute inset-0 bg-grid-dark opacity-50" />
      <div className="blob left-[-5%] top-[10%] h-[300px] w-[300px] bg-[oklch(0.88_0.19_95)] opacity-30" />
      <div className="blob right-[-5%] bottom-[10%] h-[300px] w-[300px] bg-[oklch(0.78_0.15_85)] opacity-25" />

      <div className="relative mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <div className="text-center max-w-3xl mx-auto">
            <span className="chip border-white/20 bg-white/10 text-background">Comparativo de mercado</span>
            <h2 className="mt-4 font-display text-4xl font-bold md:text-5xl leading-[1.05]">
              As empresas pagam muito por site. <span className="text-brand">Você cobra menos e entrega mais.</span>
            </h2>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <Reveal>
            <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-7 backdrop-blur-sm">
              <h3 className="font-display text-xl font-bold">Quanto custa ter um site hoje</h3>
              <p className="mt-1 text-sm text-white/60">Média de gastos que uma empresa tem com presença online:</p>
              <ul className="mt-5 space-y-3 text-sm">
                <li className="flex justify-between gap-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <span>Hospedagem profissional</span>
                  <span className="font-semibold text-red-300">R$ 40/mês</span>
                </li>
                <li className="flex justify-between gap-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <span>Domínio próprio (.com.br)</span>
                  <span className="font-semibold text-red-300">R$ 40/ano</span>
                </li>
                <li className="flex justify-between gap-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <span>Designer / desenvolvedor</span>
                  <span className="font-semibold text-red-300">R$ 700+ uma vez</span>
                </li>
                <li className="flex justify-between gap-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <span>Manutenção e suporte mensal</span>
                  <span className="font-semibold text-red-300">R$ 40/mês recorrente</span>
                </li>
                <li className="flex justify-between gap-3 rounded-lg bg-white/5 border border-white/10 p-3">
                  <span className="font-semibold">Total no primeiro ano</span>
                  <span className="font-bold text-red-300">R$ 1.220+</span>
                </li>
              </ul>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="rounded-2xl border-2 border-brand bg-brand/10 p-7 backdrop-blur-sm relative overflow-hidden">
              <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-brand/40 blur-3xl" />
              <div className="relative">
                <h3 className="font-display text-xl font-bold">Com a MRO.BIO, tudo por R$ 297/ano</h3>
                <p className="mt-1 text-sm text-white/60">Você oferece à empresa um pacote completo:</p>
                <ul className="mt-5 space-y-3 text-sm">
                  <li className="flex justify-between gap-3 rounded-lg bg-brand/15 border border-brand/40 p-3">
                    <span className="font-semibold">Site profissional com I.A</span>
                    <span className="font-bold text-brand">Incluso</span>
                  </li>
                  <li className="flex justify-between gap-3 rounded-lg bg-brand/15 border border-brand/40 p-3">
                    <span className="font-semibold">Subdomínio <code>nomedaempresa.mro.bio</code></span>
                    <span className="font-bold text-brand">Incluso</span>
                  </li>
                  <li className="flex justify-between gap-3 rounded-lg bg-brand/15 border border-brand/40 p-3">
                    <span className="font-semibold">Hospedagem + SSL</span>
                    <span className="font-bold text-brand">Incluso</span>
                  </li>
                  <li className="flex justify-between gap-3 rounded-lg bg-brand/15 border border-brand/40 p-3">
                    <span className="font-semibold">Edição com I.A quando precisar</span>
                    <span className="font-bold text-brand">Incluso</span>
                  </li>
                  <li className="flex justify-between gap-3 rounded-lg bg-white/5 border border-white/10 p-3">
                    <span className="font-semibold">Preço que você cobra</span>
                    <span className="font-bold text-brand">R$ 297/ano</span>
                  </li>
                </ul>
                <p className="mt-4 text-xs text-white/55">
                  A empresa gasta 4× menos. Você fatura. Todo mundo ganha.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function ProfitCalc() {
  const [sites, setSites] = useState(10);
  const pricePerSite = 297;
  const costPerSite = 36;
  const profitPerSite = pricePerSite - costPerSite;
  const totalProfit = sites * profitPerSite;
  const totalRevenue = sites * pricePerSite;

  return (
    <section id="lucro" className="mx-auto max-w-6xl px-5 py-24">
      <Reveal>
        <div className="text-center max-w-3xl mx-auto">
          <span className="chip">Calculadora de lucro</span>
          <h2 className="mt-4 font-display text-4xl font-bold md:text-5xl">
            Quanto você pode <span className="text-gradient-brand">faturar?</span>
          </h2>
          <p className="mt-4 text-muted-foreground text-lg">
            Ajuste a quantidade de sites e veja seu lucro líquido estimado.
          </p>
        </div>
      </Reveal>

      <Reveal delay={60}>
        <div className="mt-10 max-w-2xl mx-auto rounded-3xl border-2 border-brand bg-card p-8 md:p-12 shadow-[var(--shadow-brand)]">
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm font-medium text-muted-foreground">Sites vendidos: <strong className="text-foreground text-lg">{sites}</strong></span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSites((s) => Math.max(1, s - 1))}
                className="w-9 h-9 rounded-full border border-border bg-background text-foreground font-bold hover:bg-accent/30 transition"
              >−</button>
              <button
                onClick={() => setSites((s) => Math.min(100, s + 1))}
                className="w-9 h-9 rounded-full border border-border bg-background text-foreground font-bold hover:bg-accent/30 transition"
              >+</button>
            </div>
          </div>

          <input
            type="range"
            min={1}
            max={50}
            value={sites}
            onChange={(e) => setSites(Number(e.target.value))}
            className="w-full accent-brand cursor-pointer"
          />

          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-xl bg-surface border border-border/50 p-4 text-center">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Faturamento</div>
              <div className="mt-1 font-display text-xl font-bold text-foreground">R$ {totalRevenue.toLocaleString("pt-BR")}</div>
            </div>
            <div className="rounded-xl bg-surface border border-border/50 p-4 text-center">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Custo</div>
              <div className="mt-1 font-display text-xl font-bold text-muted-foreground">R$ {(sites * costPerSite).toLocaleString("pt-BR")}</div>
            </div>
            <div className="rounded-xl border-2 border-brand bg-brand/5 p-4 text-center col-span-2">
              <div className="text-xs uppercase tracking-wide text-brand font-semibold">Lucro líquido estimado</div>
              <div className="mt-1 font-display text-3xl font-bold text-brand">R$ {totalProfit.toLocaleString("pt-BR")}</div>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Vendendo {sites} sites, você lucra <strong className="text-foreground">R$ {totalProfit.toLocaleString("pt-BR")}</strong> em 1 ano. Se renovarem, é recorrente.
          </p>
        </div>
      </Reveal>
    </section>
  );
}

function Benefits() {
  const items = [
    { icon: "💰", title: "Lucro de R$ 261 por site", desc: "Cada site que você vende por R$ 297 custa só R$ 36 no plano. Margem de 88% de lucro." },
    { icon: "⚡", title: "Site pronto em 5 minutos", desc: "Você não precisa saber design ou código. A I.A da MRO gera o site completo. É só entregar o link." },
    { icon: "🌐", title: "Subdomínio + SSL incluso", desc: "Cada cliente recebe nome.mro.bio com certificado SSL e hospedagem — sem cobrar nada a mais." },
    { icon: "📈", title: "Recorrente todo ano", desc: "No ano seguinte, o cliente renova direto com você. Você fatura de novo sem precisar criar nada do zero." },
    { icon: "🎓", title: "Perfeito para iniciantes", desc: "Não precisa de experiência com sites. É só descrever o negócio do cliente e a I.A faz o resto." },
    { icon: "🏆", title: "Selo VIP Revendedor", desc: "No seu painel aparece a tarja VIP, mostrando que você é um revendedor oficial MRO.BIO." },
  ];
  return (
    <section id="beneficios" className="mx-auto max-w-6xl px-5 py-24">
      <Reveal>
        <div className="text-center max-w-2xl mx-auto">
          <span className="chip">Benefícios</span>
          <h2 className="mt-4 font-display text-4xl font-bold md:text-5xl">
            Por que revender <span className="text-gradient-brand">MRO.BIO?</span>
          </h2>
        </div>
      </Reveal>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i, idx) => (
          <Reveal key={i.title} delay={idx * 60}>
            <div className="card-glow group h-full rounded-xl border border-border bg-card p-6">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-brand text-brand-foreground text-xl shadow-[var(--shadow-brand)] group-hover:scale-110 transition">
                {i.icon}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{i.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{i.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function HowResellerWorks() {
  const steps = [
    { n: "01", t: "Assine o plano revendedor", d: "R$ 297/ano. Em 2 minutos seu acesso VIP está liberado automaticamente." },
    { n: "02", t: "Encontre clientes", d: "Pequenos negócios, autônomos, salões, personal trainers — todo mundo precisa de site." },
    { n: "03", t: "Crie o site com I.A", d: "Descreva o negócio do cliente e a I.A gera o site completo em menos de 5 minutos." },
    { n: "04", t: "Entregue e fature", d: "Venda por R$ 297/ano. Custo pra você é R$ 36 por site. Lucro líquido de R$ 261." },
  ];
  return (
    <section className="relative bg-foreground text-background overflow-hidden">
      <div className="absolute inset-0 bg-grid-dark opacity-60" />
      <div className="blob left-[-5%] top-[10%] h-[300px] w-[300px] bg-[oklch(0.88_0.19_95)] opacity-30" />
      <div className="blob right-[-5%] bottom-[10%] h-[300px] w-[300px] bg-[oklch(0.78_0.15_85)] opacity-25" />

      <div className="relative mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <span className="chip border-white/20 bg-white/10 text-background">Como funciona</span>
          <h2 className="mt-4 max-w-2xl font-display text-4xl font-bold md:text-5xl">
            Quatro passos. <span className="text-brand">Sem complicação.</span>
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, idx) => (
            <Reveal key={s.n} delay={idx * 80}>
              <div className="relative h-full rounded-xl border border-white/15 bg-white/[0.04] p-6 backdrop-blur-sm hover:bg-white/[0.08] hover:border-brand/50 transition">
                <div className="font-display text-4xl font-bold text-brand">{s.n}</div>
                <h3 className="mt-3 text-lg font-semibold">{s.t}</h3>
                <p className="mt-1.5 text-sm text-white/70">{s.d}</p>
                {idx < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-9 -right-3 text-brand/60 text-xl">→</div>
                )}
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-12 text-center">
          <a
            href="#checkout"
            className="inline-flex items-center gap-2 rounded-md btn-brand px-6 py-3.5 text-base font-semibold"
            onClick={() => fbEvent("InitiateCheckout", { content_name: "Renda Extra How It Works CTA" })}
          >
            Quero ser revendedor →
          </a>
        </div>
      </div>
    </section>
  );
}

function Checkout() {
  const checkoutFn = useServerFn(createResellerCheckout);
  const [form, setForm] = useState({ name: "", email: "", whatsapp: "" });
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.whatsapp.trim()) {
      toast.error("Preencha nome, email e WhatsApp.");
      return;
    }
    setLoading(true);
    try {
      fbEvent("InitiateCheckout", { content_name: "Plano Revenda Renda Extra", value: 297, currency: "BRL" });
      const { checkoutUrl } = await checkoutFn({ data: form });
      window.location.href = checkoutUrl;
    } catch (err) {
      toast.error((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <section id="checkout" className="mx-auto max-w-6xl px-5 py-24">
      <Reveal>
        <div className="text-center max-w-3xl mx-auto">
          <span className="chip bg-brand text-brand-foreground border-brand">Assine agora</span>
          <h2 className="mt-4 font-display text-4xl font-bold md:text-5xl">
            Comece sua <span className="text-gradient-brand">renda extra hoje.</span>
          </h2>
        </div>
      </Reveal>

      <div className="mt-10 max-w-3xl mx-auto grid gap-6 rounded-3xl border-2 border-brand bg-card p-8 md:p-10 md:grid-cols-[1fr_1fr] shadow-[var(--shadow-brand)]">
        <div>
          <h3 className="font-display text-3xl md:text-4xl font-bold leading-tight">
            Plano Revenda — <span className="text-gradient-brand">10 sites por R$ 297/ano</span>
          </h3>
          <div className="mt-3 flex items-end gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">ou em até</div>
              <div className="font-display text-5xl font-bold leading-none">12× R$ 30</div>
            </div>
            <div className="text-sm text-muted-foreground mb-1">no cartão</div>
          </div>
          <ul className="mt-6 space-y-2 text-sm">
            <li className="flex gap-2"><span className="text-brand font-bold">✓</span> Crie até <strong>10 sites</strong> para seus clientes</li>
            <li className="flex gap-2"><span className="text-brand font-bold">✓</span> Cada site com subdomínio próprio <code>cliente.mro.bio</code></li>
            <li className="flex gap-2"><span className="text-brand font-bold">✓</span> Hospedagem, SSL e edição com I.A inclusos</li>
            <li className="flex gap-2"><span className="text-brand font-bold">✓</span> Tarja <strong>VIP Revendedor</strong> no painel</li>
            <li className="flex gap-2"><span className="text-brand font-bold">✓</span> Acesso liberado automaticamente após pagamento</li>
          </ul>
        </div>

        <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border bg-background p-6">
          <h4 className="font-display text-lg font-bold">Preencha seus dados</h4>
          <p className="text-xs text-muted-foreground">Após o pagamento, enviamos seu acesso por e-mail automaticamente.</p>
          <input
            required
            placeholder="Seu nome completo"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-md border border-border bg-background p-3 text-sm focus:border-brand focus:outline-none"
          />
          <input
            required
            type="email"
            placeholder="Seu melhor e-mail"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-md border border-border bg-background p-3 text-sm focus:border-brand focus:outline-none"
          />
          <input
            required
            placeholder="WhatsApp com DDD"
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            className="w-full rounded-md border border-border bg-background p-3 text-sm focus:border-brand focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-green-600 hover:bg-green-700 px-6 py-4 text-base font-bold text-white shadow-lg transition-transform hover:scale-[1.01] disabled:opacity-60"
          >
            {loading ? "Gerando pagamento…" : "Pagar R$ 297 (ou 12× R$ 30) →"}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            Pagamento seguro via <strong>InfinitePay</strong> · Pix, cartão ou boleto
          </p>
        </form>
      </div>
    </section>
  );
}

function Faq() {
  const items = [
    { q: "Preciso saber programar para revender?", a: "Não. A I.A da MRO cria o site completo. Você só descreve o negócio do cliente e entrega o link." },
    { q: "Quanto eu pago por cada site que crio?", a: "O plano revendedor custa R$ 297/ano e inclui 10 sites. Ou seja, cada site custa R$ 36 para você. Você vende por R$ 297 e lucra R$ 261." },
    { q: "Posso vender por outro preço?", a: "Sim. R$ 297 é o preço sugerido, mas você pode cobrar mais ou menos. Quanto mais cobrar, mais lucra." },
    { q: "E se eu não vender os 10 sites no primeiro ano?", a: "Os sites não usados ficam disponíveis para sempre. Seus créditos não expiram. Vendeu 3 no primeiro ano? Os outros 7 continuam lá." },
    { q: "Como o cliente acessa o site depois?", a: "Você cria o site no painel revendedor e envia o link (ex: restaurante.mro.bio) para o cliente. Pronto." },
    { q: "O plano é recorrente?", a: "Sim, o plano revendedor é anual. E quando seus clientes renovam com você, você fatura de novo." },
  ];
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="mx-auto max-w-3xl px-5 py-24">
      <Reveal>
        <div className="text-center mb-10">
          <span className="chip">Dúvidas frequentes</span>
          <h2 className="mt-4 font-display text-4xl font-bold md:text-5xl">FAQ</h2>
        </div>
      </Reveal>
      <div className="space-y-3">
        {items.map((item, i) => (
          <Reveal key={i} delay={i * 40}>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left font-semibold text-sm md:text-base hover:bg-accent/20 transition"
              >
                {item.q}
                <span className="text-muted-foreground ml-4 text-lg">{open === i ? "−" : "+"}</span>
              </button>
              {open === i && (
                <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </div>
              )}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-5 py-8 text-sm text-muted-foreground md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md btn-brand font-display text-sm font-bold">M</span>
          <span className="font-semibold text-foreground">MRO.BIO</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <div className="flex gap-5">
          <Link to="/">Início</Link>
          <Link to="/login">Entrar</Link>
        </div>
      </div>
    </footer>
  );
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="reveal" style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
