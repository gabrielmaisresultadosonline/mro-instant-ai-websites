import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MRO.BIO — Revenda sites profissionais e fature mais de R$ 3.000/mês" },
      {
        name: "description",
        content:
          "Revenda sites profissionais com a MRO.BIO. Empresas pagam um único valor anual e você fatura mais de R$ 3.000 por mês entregando hospedagem, domínio e design em uma única solução.",
      },
      { property: "og:title", content: "Revenda sites profissionais com MRO.BIO" },
      {
        property: "og:description",
        content:
          "Proposta melhor que tudo no mercado: um pagamento anual substitui hospedagem mensal, domínio e designer.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* background layers */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[oklch(0.99_0.06_95)] via-background to-background" />
      <div className="absolute inset-0 -z-10 bg-grid opacity-60" />
      <div className="blob -z-10 left-[-10%] top-[-10%] h-[420px] w-[420px] bg-[oklch(0.92_0.18_95)]" />
      <div className="blob -z-10 right-[-10%] top-[20%] h-[360px] w-[360px] bg-[oklch(0.85_0.15_85)] opacity-40" />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="grid h-9 w-9 place-items-center rounded-lg btn-brand font-display text-base font-bold transition-transform group-hover:rotate-6">
            M
          </span>
          <span className="font-display text-lg font-bold tracking-tight">MRO.BIO</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden rounded-md px-3 py-2 text-sm font-medium hover:bg-accent/30 md:inline-flex"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col items-center px-5 pt-10 pb-24 text-center md:pt-20 md:pb-32">
        <span className="chip mb-6">
          <span
            className="h-1.5 w-1.5 rounded-full bg-brand"
            style={{ animation: "pulseDot 1.6s ease-in-out infinite" }}
          />
          Plano Revendedor MRO.BIO
        </span>

        <h1 className="font-display text-4xl font-bold leading-[1.05] md:text-7xl">
          Revenda sites profissionais
          <br />
          e fature{" "}
          <span className="text-gradient-brand">mais de R$ 3.000</span> por mês.
        </h1>

        <p className="mt-8 max-w-2xl text-lg text-muted-foreground md:text-xl">
          Sua proposta é <strong className="text-foreground">melhor do que tudo no mercado</strong>:
          empresas hoje pagam hospedagem mensal, domínio anual e ainda contratam um designer.
          Com o MRO.BIO, você entrega tudo isso por um único pagamento anual.
        </p>

        <Link
          to="/rendaextra"
          className="group mt-10 inline-flex items-center gap-3 rounded-2xl bg-emerald-500 px-10 py-6 text-xl font-bold text-white shadow-[0_24px_60px_-12px_rgba(16,185,129,0.6)] ring-1 ring-emerald-300/40 transition hover:scale-[1.03] hover:bg-emerald-600 md:text-2xl"
        >
          Saiba como
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </Link>

        <p className="mt-5 text-sm text-muted-foreground">
          Veja o plano completo de revenda, projeções de lucro e como começar hoje.
        </p>
      </main>

      <footer className="border-t border-border/60 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 text-xs text-muted-foreground md:flex-row">
          <span>© {new Date().getFullYear()} MRO.BIO</span>
          <Link to="/rendaextra" className="hover:text-foreground transition-colors">
            Plano Revendedor →
          </Link>
        </div>
      </footer>
    </div>
  );
}
