import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/ob/obrigado")({
  head: () => ({
    meta: [
      { title: "Obrigado — MRO BIO" },
      { name: "description", content: "Compra confirmada. Acesse seu email para receber os dados de acesso." },
      { property: "og:title", content: "Obrigado — MRO BIO" },
      { property: "og:description", content: "Compra confirmada. Acesse seu email para receber os dados de acesso." },
    ],
  }),
  component: ObrigadoPage,
});

function ObrigadoPage() {
  return (
    <main className="min-h-screen bg-background text-foreground grid place-items-center px-6 py-16">
      <div className="max-w-xl w-full text-center space-y-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary text-primary-foreground text-4xl font-bold shadow-lg">
          ✓
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Parabéns, tudo certo!
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Seu site <span className="font-semibold text-foreground">MRO BIO</span> está pronto.
            Acesse seu email de compra — enviamos seu acesso por lá!
          </p>
          <p className="text-base text-muted-foreground">
            Qualquer dúvida, não deixe de nos contatar.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-3 font-medium hover:opacity-90 transition"
          >
            Acessar minha conta
          </Link>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-6 py-3 font-medium hover:bg-accent transition"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </main>
  );
}
