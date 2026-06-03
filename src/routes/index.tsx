import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useReveal } from "@/hooks/use-reveal";
import { fbEvent } from "@/lib/facebook-pixel";
const sitesShowcase = { url: "/images/sites-showcase.png" };

const KIWIFY_URL = "https://pay.kiwify.com.br/1mMYvVU";
const KIWIFY_TEST_URL = "https://pay.kiwify.com.br/o3pIOC8";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MRO.BIO — Site completo com I.A em menos de 5 minutos · R$67/ano" },
      { name: "description", content: "Crie um site profissional com I.A generativa. R$67 no ano à vista, ou 12x de R$6,97. Sem hospedagem, sem domínio." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Header />
      <Hero />
      <VideoPresentation />
      <Marquee />
      <Features />
      <HowItWorks />
      <Showcase />
      <Pricing />
      <FaqCta />
      <Footer />
      <StickyBuyCta />
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
          <a href="#recursos" className="hover:text-foreground transition-colors">Recursos</a>
          <a href="#como-funciona" className="hover:text-foreground transition-colors">Como funciona</a>
          <a href="#planos" className="hover:text-foreground transition-colors">Planos</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className="hidden rounded-md px-3 py-2 text-sm font-medium hover:bg-accent/30 md:inline-flex">Entrar</Link>
          <a 
            href="#planos" 
            className="rounded-md btn-brand px-4 py-2 text-sm font-semibold"
            onClick={() => fbEvent("InitiateCheckout", { content_name: "Header CTA" })}
          >
            Site por R$6,97
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pt-4 md:pt-6">
      {/* background layers */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[oklch(0.99_0.06_95)] via-background to-background" />
      <div className="absolute inset-0 -z-10 bg-grid" />
      <div className="blob -z-10 left-[-10%] top-[-10%] h-[420px] w-[420px] bg-[oklch(0.92_0.18_95)]" />
      <div className="blob -z-10 right-[-10%] top-[20%] h-[360px] w-[360px] bg-[oklch(0.85_0.15_85)] opacity-40" />

      <div className="mx-auto max-w-6xl px-5 py-6 md:py-10">
        <div className="grid items-center gap-12 md:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="chip animate-fade-in">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" style={{ animation: "pulseDot 1.6s ease-in-out infinite" }} />
              I.A generativa para sites • novo
            </span>
            <h1 className="mt-5 font-display text-5xl font-bold leading-[1.02] md:text-7xl animate-fade-in">
              Seu site completo
              <br />
              <span className="text-gradient-brand">em 5 minutos.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Sem hospedagem. Sem comprar domínio. Sem código.
              Você descreve, a I.A da MRO cria, e seu site vai ao ar em
              <span className="font-semibold text-foreground"> seunome.mro.bio</span> com um único comando.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a 
                href="#planos" 
                className="group inline-flex items-center gap-2 rounded-md btn-brand px-6 py-3.5 text-base font-semibold"
                onClick={() => fbEvent("InitiateCheckout", { content_name: "Hero CTA" })}
              >
                Quero meu site por R$6,97
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </a>
              <a href="#como-funciona" className="rounded-md border border-border bg-background px-6 py-3.5 text-base font-medium hover:bg-accent/30 hover:border-foreground/30 transition">
                Ver como funciona
              </a>
            </div>
            <ul className="mt-8 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {[
                "Subdomínio próprio incluso",
                "Edita até 4× por semana",
                "1 ano de acesso a partir da compra",
                "Pixels do Facebook, Google e TikTok",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-brand-foreground text-[11px] font-bold">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <HeroShowcase />
        </div>
      </div>
    </section>
  );
}

function HeroShowcase() {
  return (
    <div className="relative">
      <div className="floaty relative">
        <img
          src={sitesShowcase.url}
          alt="Exemplos de sites criados com a I.A da MRO em notebook, monitor e celular"
          className="w-full h-auto drop-shadow-[0_30px_60px_rgba(0,0,0,0.18)]"
          loading="eager"
        />
      </div>
      <div className="absolute right-0 -top-3 md:-right-2 md:-top-4 rotate-3 rounded-full bg-foreground px-3 py-1.5 text-xs md:text-sm font-semibold text-background shadow-lg">
        gerado por I.A ✦
      </div>
      <div className="absolute left-0 -bottom-3 md:-left-2 md:-bottom-4 -rotate-3 rounded-full bg-brand px-3 py-1.5 text-xs md:text-sm font-semibold text-brand-foreground shadow-lg">
        ⚡ em 5 minutos
      </div>
    </div>
  );
}


function VideoPresentation() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-12 md:py-20">
      <Reveal>
        <div className="text-center mb-10">
          <span className="chip mb-4">Apresentação</span>
          <h2 className="font-display text-4xl font-bold md:text-5xl">
            Veja o <span className="text-gradient-brand">MRO.BIO</span> em ação
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
            Descubra como criar seu site completo em menos de 5 minutos com nossa tecnologia de I.A.
          </p>
        </div>
        <div className="group relative aspect-video w-full overflow-hidden rounded-[2rem] border-4 border-muted/30 bg-card shadow-[0_32px_80px_-20px_rgba(0,0,0,0.2)] transition-all hover:border-brand/50">
          <div className="absolute inset-0 bg-brand/5 group-hover:bg-transparent transition-colors pointer-events-none" />
          <iframe
            src="https://www.youtube.com/embed/AvNxM8QH7Iw"
            title="Apresentação MRO.BIO"
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </Reveal>
    </section>
  );
}

function Marquee() {
  const items = [
    "criadores", "lojinhas", "infoprodutores", "salões", "personal trainers",
    "restaurantes", "fotógrafos", "freelancers", "consultórios", "lançamentos",
  ];
  const loop = [...items, ...items];
  return (
    <section className="border-y border-border/70 bg-surface/60 py-5">
      <div className="marquee">
        <div className="marquee-track">
          {loop.map((t, i) => (
            <span key={i} className="text-sm font-medium text-muted-foreground whitespace-nowrap flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" /> {t}
            </span>
          ))}
        </div>
        <div className="marquee-track" aria-hidden="true">
          {loop.map((t, i) => (
            <span key={i} className="text-sm font-medium text-muted-foreground whitespace-nowrap flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" /> {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { icon: "✨", title: "I.A da MRO", desc: "Você escreve o que quer. A I.A da MRO gera o site completo, responsivo e bonito." },
    { icon: "🌐", title: "Subdomínio incluso", desc: "Cada site recebe um endereço próprio em nome.mro.bio. Sem comprar domínio." },
    { icon: "📈", title: "Insights em tempo real", desc: "Veja total de visitas, última visita e qual região mais acessa." },
    { icon: "🎯", title: "Pixel próprio", desc: "Cadastre seu Pixel do Facebook, Google Ads ou TikTok e rode tráfego direto." },
    { icon: "🖼️", title: "Biblioteca de imagens", desc: "Suba sua logo e fotos. Clique para inserir no comando do site." },
    { icon: "♻️", title: "Edição quando precisar", desc: "Refaça o comando, veja o preview e salve só quando ficar perfeito." },
  ];
  return (
    <section id="recursos" className="relative mx-auto max-w-6xl px-5 py-24">
      <Reveal>
        <div className="max-w-2xl">
          <span className="chip">Recursos</span>
          <h2 className="mt-4 font-display text-4xl font-bold md:text-5xl">
            Tudo que você precisa, <span className="text-gradient-brand">nada que atrapalha.</span>
          </h2>
          <p className="mt-3 text-muted-foreground text-lg">
            O MRO.BIO foi feito para quem precisa de presença online agora.
          </p>
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

function HowItWorks() {
  const steps = [
    { n: "01", t: "Cadastre-se em 30 segundos", d: "Nome, email, WhatsApp e CPF. É só." },
    { n: "02", t: "Escolha o nome do seu site", d: "delulu, marialeite, joaopiscina — vira nome.mro.bio." },
    { n: "03", t: "Dê o comando para a I.A", d: "“Site para meu salão com agenda e WhatsApp.” Pronto." },
    { n: "04", t: "Edite, salve, publique", d: "Veja o preview em tempo real, ajuste até 4× por semana." },
  ];
  return (
    <section id="como-funciona" className="relative bg-foreground text-background overflow-hidden">
      <div className="absolute inset-0 bg-grid-dark opacity-60" />
      <div className="blob left-[-5%] top-[10%] h-[300px] w-[300px] bg-[oklch(0.88_0.19_95)] opacity-30" />
      <div className="blob right-[-5%] bottom-[10%] h-[300px] w-[300px] bg-[oklch(0.78_0.15_85)] opacity-25" />

      <div className="relative mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <span className="chip border-white/20 bg-white/10 text-background">Como funciona</span>
          <h2 className="mt-4 max-w-2xl font-display text-4xl font-bold md:text-5xl">
            Quatro passos. <span className="text-brand">Nenhum técnico.</span>
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
        <div className="mt-12">
          <a 
            href="#planos" 
            className="inline-flex items-center gap-2 rounded-md btn-brand px-6 py-3.5 text-base font-semibold"
            onClick={() => fbEvent("InitiateCheckout", { content_name: "How It Works CTA" })}
          >
            Quero meu site por R$6,97 <span>→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function Showcase() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24">
      <Reveal>
        <div className="grid items-center gap-10 rounded-3xl border border-border bg-gradient-to-br from-surface/80 to-background p-8 md:grid-cols-2 md:p-14 relative overflow-hidden">
          <div className="blob right-[-10%] top-[-30%] h-[300px] w-[300px] bg-brand opacity-30" />
          <div className="relative">
            <span className="chip">Insights</span>
            <h2 className="mt-4 font-display text-4xl font-bold md:text-5xl">
              Veja quem visita, <span className="text-gradient-brand">de onde e quando.</span>
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Para cada site, mostramos total de visitas, última visita e a região com mais acessos. Sem precisar instalar nada.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm">
              <li className="flex items-start gap-2"><span className="text-brand">●</span> Pixel próprio MRO instalado automaticamente</li>
              <li className="flex items-start gap-2"><span className="text-brand">●</span> Cadastre Facebook Pixel, GA4 e TikTok Pixel</li>
              <li className="flex items-start gap-2"><span className="text-brand">●</span> Tudo na dashboard, de qualquer lugar</li>
            </ul>
          </div>
          <div className="relative rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow-elevate)]">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Visitas hoje</div>
                <CountUp value={312} className="font-display text-5xl font-bold" />
              </div>
              <div className="chip">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" style={{ animation: "pulseDot 1.4s ease-in-out infinite" }} /> ao vivo
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-surface p-3 border border-border/50">
                <div className="text-muted-foreground text-xs">Última visita</div>
                <div className="font-semibold">há 12s · São Paulo</div>
              </div>
              <div className="rounded-lg bg-surface p-3 border border-border/50">
                <div className="text-muted-foreground text-xs">Região top</div>
                <div className="font-semibold">Sudeste (61%)</div>
              </div>
            </div>
            <SparkBar />
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function SparkBar() {
  const bars = [40, 60, 35, 80, 55, 90, 70, 95, 65, 88, 75, 100];
  return (
    <div className="mt-5 flex items-end gap-1.5 h-24">
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-gradient-to-t from-brand/30 to-brand"
          style={{ height: `${h}%`, animation: `floaty ${2 + (i % 4) * 0.4}s ease-in-out infinite`, animationDelay: `${i * 0.05}s` }}
        />
      ))}
    </div>
  );
}

function CountUp({ value, className }: { value: number; className?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 1400;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <div className={className}>{n}</div>;
}

function Pricing() {
  return (
    <section id="planos" className="mx-auto max-w-6xl px-5 py-24">
      <Reveal>
        <div className="text-center">
          <span className="chip">Oferta única</span>
          <h2 className="mt-4 font-display text-4xl font-bold md:text-5xl">
            Seu site por <span className="text-gradient-brand">R$ 6,97</span> por mês.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
            Um pagamento. 1 ano inteiro de acesso. Sem mensalidade surpresa, sem assinatura recorrente.
          </p>
        </div>
      </Reveal>

      <div className="mt-12 grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
        <Reveal>
          <div className="relative w-full overflow-hidden rounded-3xl border-2 border-brand bg-card p-8 md:p-10 shadow-[var(--shadow-brand)] h-full">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-brand/30 blur-3xl" />
            <div className="absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-brand/20 blur-3xl" />

            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip bg-brand text-brand-foreground border-brand">MRO.BIO Anual</span>
                <span className="chip">1 ano de acesso</span>
              </div>

              <div className="mt-6 flex items-end gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">12x de</div>
                  <div className="font-display text-6xl md:text-7xl font-bold leading-none">
                    R$ <span className="text-gradient-brand">6,97</span>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                ou <span className="font-semibold text-foreground">R$ 67,00</span> à vista (1 ano completo)
              </p>

              <ul className="mt-7 space-y-2.5 text-sm">
                <li className="flex gap-2"><span className="text-brand font-bold">✓</span> 1 site em <span className="font-semibold">seunome.mro.bio</span></li>
                <li className="flex gap-2"><span className="text-brand font-bold">✓</span> Geração e edição com I.A</li>
                <li className="flex gap-2"><span className="text-brand font-bold">✓</span> Insights de visitas em tempo real</li>
                <li className="flex gap-2"><span className="text-brand font-bold">✓</span> Pixel próprio + Facebook, Google e TikTok</li>
                <li className="flex gap-2"><span className="text-brand font-bold">✓</span> Biblioteca de imagens com sua logo</li>
                <li className="flex gap-2"><span className="text-brand font-bold">✓</span> SSL e hospedagem inclusos por 1 ano</li>
              </ul>

              <a
                href={KIWIFY_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => fbEvent("AddToCart", { content_name: "Plano Anual", value: 67.00, currency: "BRL" })}
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-md bg-green-600 hover:bg-green-700 px-6 py-4 text-base md:text-lg font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
              >
                Comprar agora — R$ 6,97/mês
                <span>→</span>
              </a>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Pagamento seguro via Kiwify · Pix, cartão ou boleto
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="relative w-full overflow-hidden rounded-3xl border-2 border-dashed border-muted-foreground/40 bg-card p-8 md:p-10 h-full">
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">⚠️ Plano de Teste</span>
                <span className="chip">Uso interno</span>
              </div>

              <div className="mt-6">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Pagamento simbólico</div>
                <div className="font-display text-5xl md:text-6xl font-bold leading-none">
                  R$ <span className="text-gradient-brand">1,00</span>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Plano para validar o fluxo de pagamento, webhook da Kiwify, ativação automática e envio de e-mails.
              </p>

              <ul className="mt-7 space-y-2.5 text-sm">
                <li className="flex gap-2"><span className="text-brand font-bold">✓</span> Testar webhook de compra aprovada</li>
                <li className="flex gap-2"><span className="text-brand font-bold">✓</span> Validar criação de conta + e-mail</li>
                <li className="flex gap-2"><span className="text-brand font-bold">✓</span> Confirmar acesso ao painel</li>
                <li className="flex gap-2"><span className="text-muted-foreground">•</span> <span className="text-muted-foreground">Não é o produto final — apenas teste</span></li>
              </ul>

              <a
                href={KIWIFY_TEST_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-md border-2 border-foreground bg-background hover:bg-foreground hover:text-background px-6 py-4 text-base font-bold transition-colors"
              >
                Pagar plano de teste
                <span>→</span>
              </a>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Use apenas para verificar a integração
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function FaqCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl bg-foreground p-10 text-background md:p-16">
          <div className="absolute inset-0 bg-grid-dark opacity-50" />
          <div className="blob left-[10%] top-[20%] h-[260px] w-[260px] bg-brand opacity-50" />
          <div className="blob right-[5%] bottom-[-30%] h-[300px] w-[300px] bg-[oklch(0.78_0.15_85)] opacity-40" />
          <div className="relative">
            <span className="chip border-white/20 bg-white/10 text-background">Pronto pra começar?</span>
            <h2 className="mt-5 font-display text-4xl font-bold md:text-6xl leading-[1.05]">
              Seu site no ar em <span className="text-brand">5 minutos.</span>
              <br /> Por R$ 6,97 por mês.
            </h2>
            <p className="mt-4 max-w-2xl text-base md:text-lg text-white/75">
              R$ 67,00 à vista ou 12x de R$ 6,97. 1 ano inteiro de acesso, sem mensalidade recorrente.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href={KIWIFY_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => fbEvent("AddToCart", { content_name: "Plano Anual CTA Final", value: 67.00, currency: "BRL" })}
                className="rounded-md bg-green-600 hover:bg-green-700 px-6 py-3.5 text-base font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
              >
                Comprar agora — R$ 6,97
              </a>
              <Link to="/login" className="rounded-md border border-white/25 px-6 py-3.5 text-base font-semibold hover:bg-white/10 transition">
                Já comprei · Entrar
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border pb-24 md:pb-8">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-5 py-8 text-sm text-muted-foreground md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md btn-brand font-display text-sm font-bold">M</span>
          <span className="font-semibold text-foreground">MRO.BIO</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <div className="flex gap-5">
          <Link to="/login">Entrar</Link>
          <a href="#planos">Comprar</a>
          <Link to="/administracao">Administração</Link>
        </div>
      </div>
    </footer>
  );
}

function StickyBuyCta() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 md:hidden ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="m-3 rounded-2xl border border-border bg-background/95 p-3 shadow-2xl backdrop-blur">
        <a
          href="#planos"
          onClick={() => fbEvent("InitiateCheckout", { content_name: "Sticky CTA" })}
          className="flex items-center justify-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 px-5 py-3.5 text-base font-bold text-white"
        >
          Site por R$ 6,97 → comprar
        </a>
      </div>
    </div>
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
