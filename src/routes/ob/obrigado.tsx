import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { checkResellerOrder } from "@/lib/reseller.functions";
import { z } from "zod";

export const Route = createFileRoute("/ob/obrigado")({
  validateSearch: z.object({ order: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Obrigado — MRO BIO" },
      { name: "description", content: "Compra confirmada. Acesse seu email para receber os dados de acesso." },
    ],
  }),
  component: ObrigadoPage,
});

function ObrigadoPage() {
  const { order } = useSearch({ from: "/ob/obrigado" });
  const checkFn = useServerFn(checkResellerOrder);
  const [status, setStatus] = useState<"pending" | "paid" | "provisioned" | "expired" | "unknown" | null>(order ? "pending" : null);
  const [email, setEmail] = useState<string | undefined>();

  useEffect(() => {
    if (!order) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const r = await checkFn({ data: { orderNsu: order } });
        if (!alive) return;
        setStatus(r.status);
        if ("email" in r && r.email) setEmail(r.email);
        if (r.status !== "provisioned" && r.status !== "expired") timer = setTimeout(tick, 8000);
      } catch {
        if (alive) timer = setTimeout(tick, 8000);
      }
    };
    void tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [order, checkFn]);

  const isProvisioned = status === "provisioned";
  const isPaid = status === "paid";
  const isExpired = status === "expired";

  return (
    <main className="min-h-screen bg-background text-foreground grid place-items-center px-6 py-16">
      <div className="max-w-xl w-full text-center space-y-8">
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full text-4xl font-bold shadow-lg ${isProvisioned ? "bg-green-600 text-white" : isExpired ? "bg-red-600 text-white" : "bg-brand text-brand-foreground"}`}>
          {isProvisioned ? "✓" : isExpired ? "✕" : isPaid ? "⚙" : "⏳"}
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            {isProvisioned ? "Acesso enviado!" : isExpired ? "Pagamento não recebido" : isPaid ? "Pagamento confirmado!" : order ? "Aguardando confirmação…" : "Parabéns, tudo certo!"}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {isProvisioned ? (
              <>Enviamos o link de acesso para <strong className="text-foreground">{email}</strong>. Verifique sua caixa de entrada (e o spam).</>
            ) : isExpired ? (
              <>Não recebemos a confirmação do pagamento em até 15 minutos. Se você já pagou, entre em contato com o suporte. Caso contrário, é só refazer o pedido na página inicial.</>
            ) : isPaid ? (
              <>Pagamento aprovado. Estamos criando seu acesso e enviando para o seu e-mail…</>
            ) : order ? (
              <>Estamos verificando o status do pagamento a cada 8 segundos. Esta página atualiza sozinha — pode deixar aberta.</>
            ) : (
              <>Seu site <span className="font-semibold text-foreground">MRO BIO</span> está pronto. Acesse seu email de compra — enviamos seu acesso por lá!</>
            )}
          </p>
          {order && !isProvisioned && (
            <p className="text-xs text-muted-foreground">Pedido: <code>{order}</code></p>
          )}
        </div>
      </div>
    </main>
  );
}
