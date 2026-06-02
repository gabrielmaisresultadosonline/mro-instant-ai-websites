import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MRO.BIO — Site completo com I.A em menos de 5 minutos" },
      { name: "description", content: "Crie um site profissional com I.A generativa. Sem hospedagem, sem domínio. Apenas um comando." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      <Logos />
      <Features />
      <HowItWorks />
      <Showcase />
      <Pricing />
      <FaqCta />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md btn-brand font-display text-base font-bold">M</span>
          <span className="font-display text-lg font-bold tracking-tight">MRO.BIO</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#recursos" className="hover:text-foreground">Recursos</a>
          <a href="#como-funciona" className="hover:text-foreground">Como funciona</a>
          <a href="#planos" className="hover:text-foreground">Planos</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className="hidden rounded-md px-3 py-2 text-sm font-medium hover:bg-accent/30 md:inline-flex">Entrar</Link>
          <Link to="/cadastro" className="rounded-md btn-brand px-4 py-2 text-sm font-semibold">Criar grátis</Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[oklch(0.99_0.05_95)] via-background to-background" />
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <div className="grid items-center gap-12 md:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="chip"><span className="h-1.5 w-1.5 rounded-full bg-brand" /> I.A generativa para sites</span>
            <h1 className="mt-5 font-display text-5xl font-bold leading-[1.02] md:text-6xl">
              Seu site completo
              <span className="ml-2 inline-block rounded-md bg-brand px-2 py-1 text-brand-foreground">em 5 minutos</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Sem hospedagem. Sem comprar domínio. Sem código.
              Você descreve, a I.A da MRO cria, e seu site vai ao ar em
              <span className="font-semibold text-foreground"> seunome.mro.bio</span> com um único comando.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/cadastro" className="rounded-md btn-brand px-6 py-3 text-base font-semibold">Criar meu site grátis</Link>
              <a href="#como-funciona" className="rounded-md border border-border px-6 py-3 text-base font-medium hover:bg-accent/30">Ver como funciona</a>
            </div>
            <ul className="mt-6 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <li>✓ Subdomínio próprio incluso</li>
              <li>✓ Edita até 4× por semana</li>
              <li>✓ Insights de visitas em tempo real</li>
              <li>✓ Pixels do Facebook, Google e TikTok</li>
            </ul>
          </div>
          <div className="relative">
            <div className="rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-elevate)]">
              <div className="flex items-center gap-1.5 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                <span className="ml-3 truncate text-xs text-muted-foreground">delulu.mro.bio</span>
              </div>
              <div className="overflow-hidden rounded-xl bg-surface">
                <div className="bg-[oklch(0.12_0_0)] p-6 text-[oklch(1_0_0)]">
                  <div className="font-display text-2xl font-bold">Delulu Café</div>
                  <p className="mt-1 text-sm text-white/60">O café mais delulu da cidade — 24h, açúcar opcional.</p>
                  <button className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">Pedir agora</button>
                </div>
                <div className="grid grid-cols-3 gap-3 p-4">
                  <div className="aspect-square rounded-md bg-brand" />
                  <div className="aspect-square rounded-md bg-foreground/90" />
                  <div className="aspect-square rounded-md bg-muted" />
                </div>
                <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                  Pronto em 4 min · 312 visitas hoje
                </div>
              </div>
            </div>
            <div className="absolute -right-4 -top-4 rotate-3 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background">
              gerado por I.A
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Logos() {
  return (
    <section className="border-y border-border/70 bg-surface/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 py-6 text-sm font-medium text-muted-foreground">
        <span>Usado por criadores, lojinhas, infoprodutores e prestadores de serviço</span>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { title: "I.A da MRO", desc: "Você escreve o que quer. A I.A da MRO gera o site completo, responsivo e bonito." },
    { title: "Subdomínio incluso", desc: "Cada site recebe um endereço próprio em nome.mro.bio. Sem comprar domínio." },
    { title: "Insights em tempo real", desc: "Veja total de visitas, última visita e qual região mais acessa." },
    { title: "Pixel próprio", desc: "Cadastre seu Pixel do Facebook, Google Ads ou TikTok e rode tráfego direto." },
    { title: "Biblioteca de imagens", desc: "Suba sua logo e fotos. Clique para inserir no comando do site." },
    { title: "Edição quantas vezes precisar", desc: "Refaça o comando, veja o preview e salve só quando ficar perfeito." },
  ];
  return (
    <section id="recursos" className="mx-auto max-w-6xl px-5 py-20">
      <div className="max-w-2xl">
        <span className="chip">Recursos</span>
        <h2 className="mt-4 font-display text-4xl font-bold">Tudo que você precisa, nada que atrapalha.</h2>
        <p className="mt-3 text-muted-foreground">
          O MRO.BIO foi feito para quem precisa de presença online agora.
        </p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <div key={i.title} className="rounded-xl border border-border bg-card p-6 transition hover:border-brand">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-brand text-brand-foreground font-bold">★</div>
            <h3 className="mt-4 text-lg font-semibold">{i.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{i.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "Cadastre-se em 30 segundos", d: "Nome, email, WhatsApp e CPF. É só." },
    { n: "02", t: "Escolha o nome do seu site", d: "delulu, marialeite, joaopiscina — vira automaticamente nome.mro.bio." },
    { n: "03", t: "Dê o comando para a I.A", d: "“Site para meu salão com agenda e WhatsApp.” Pronto." },
    { n: "04", t: "Edite, salve, publique", d: "Veja o preview em tempo real, ajuste até 4× por semana." },
  ];
  return (
    <section id="como-funciona" className="bg-foreground text-background">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <span className="chip border-white/20 bg-white/10 text-background">Como funciona</span>
        <h2 className="mt-4 max-w-2xl font-display text-4xl font-bold">Quatro passos. Nenhum técnico.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n} className="rounded-xl border border-white/15 bg-white/5 p-6">
              <div className="font-display text-3xl font-bold text-brand">{s.n}</div>
              <h3 className="mt-3 text-lg font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-white/70">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-10">
          <Link to="/cadastro" className="rounded-md btn-brand px-6 py-3 text-base font-semibold">Começar agora — é grátis</Link>
        </div>
      </div>
    </section>
  );
}

function Showcase() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="grid items-center gap-10 rounded-2xl border border-border bg-surface/60 p-8 md:grid-cols-2 md:p-12">
        <div>
          <span className="chip">Insights</span>
          <h2 className="mt-4 font-display text-4xl font-bold">Você vê quem visita, de onde, e quando.</h2>
          <p className="mt-3 text-muted-foreground">
            Para cada site, mostramos total de visitas, última visita e a região com mais acessos. Sem precisar instalar nada.
          </p>
          <ul className="mt-5 space-y-2 text-sm">
            <li>• Pixel próprio MRO instalado automaticamente</li>
            <li>• Cadastre Facebook Pixel, GA4 e TikTok Pixel a qualquer momento</li>
            <li>• Tudo disponível pela dashboard, de qualquer lugar</li>
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-background p-5">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Visitas hoje</div>
              <div className="font-display text-4xl font-bold">312</div>
            </div>
            <div className="chip"><span className="h-1.5 w-1.5 rounded-full bg-green-500" /> ao vivo</div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-surface p-3"><div className="text-muted-foreground">Última visita</div><div className="font-semibold">há 12s · São Paulo</div></div>
            <div className="rounded-md bg-surface p-3"><div className="text-muted-foreground">Região top</div><div className="font-semibold">Sudeste (61%)</div></div>
          </div>
          <div className="mt-4 h-24 rounded-md bg-gradient-to-r from-brand/30 to-brand" />
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="planos" className="mx-auto max-w-6xl px-5 py-20">
      <div className="text-center">
        <span className="chip">Planos</span>
        <h2 className="mt-4 font-display text-4xl font-bold">Começa grátis. Quando precisar, é simples.</h2>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-7">
          <div className="font-display text-2xl font-bold">Free</div>
          <p className="mt-1 text-sm text-muted-foreground">Para validar sua ideia agora.</p>
          <div className="mt-5 font-display text-4xl font-bold">R$ 0</div>
          <ul className="mt-5 space-y-2 text-sm">
            <li>✓ 1 site em seunome.mro.bio</li>
            <li>✓ 4 edições por semana</li>
            <li>✓ Insights básicos</li>
            <li>✓ Pixels (FB, GA, TikTok)</li>
          </ul>
          <Link to="/cadastro" className="mt-6 inline-flex rounded-md btn-dark px-5 py-2.5 text-sm font-semibold">Começar grátis</Link>
        </div>
        <div className="rounded-2xl border-2 border-brand bg-card p-7 shadow-[var(--shadow-brand)]">
          <div className="flex items-center gap-2">
            <div className="font-display text-2xl font-bold">PRO</div>
            <span className="chip bg-brand text-brand-foreground">em breve</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Mais sites, edições ilimitadas, domínio próprio.</p>
          <div className="mt-5 font-display text-4xl font-bold">—</div>
          <ul className="mt-5 space-y-2 text-sm">
            <li>✓ Sites ilimitados</li>
            <li>✓ Edições ilimitadas</li>
            <li>✓ Domínio próprio conectado</li>
            <li>✓ Insights avançados</li>
          </ul>
          <button disabled className="mt-6 inline-flex cursor-not-allowed rounded-md bg-muted px-5 py-2.5 text-sm font-semibold text-muted-foreground">Aviso quando lançar</button>
        </div>
      </div>
    </section>
  );
}

function FaqCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="rounded-2xl bg-brand p-10 text-brand-foreground md:p-14">
        <h2 className="font-display text-4xl font-bold md:text-5xl">Seu site no ar em 5 minutos. Sério.</h2>
        <p className="mt-3 max-w-2xl text-base">Sem hospedagem, sem domínio, sem código. Só um comando.</p>
        <Link to="/cadastro" className="mt-6 inline-flex rounded-md btn-dark px-6 py-3 text-base font-semibold">Criar meu site agora</Link>
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
          <Link to="/login">Entrar</Link>
          <Link to="/cadastro">Criar conta</Link>
          <Link to="/administracao">Administração</Link>
        </div>
      </div>
    </footer>
  );
}
