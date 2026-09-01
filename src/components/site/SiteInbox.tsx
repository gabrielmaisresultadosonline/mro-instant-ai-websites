import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { InboxMessage } from "@/lib/inbox.functions";

export interface SiteInboxProps {
  /** Endereço derivado do slug do site (ex.: sadel@mro.bio). */
  address: string;
  messages: InboxMessage[];
  isLoading: boolean;
  /** Busca imediata no servidor (IMAP) + recarga da lista. */
  onRefresh: () => void | Promise<void>;
  onOpen: (id: string) => void;
}

/** Remetentes reconhecidos em cada modo de espera de código. */
const PROVIDER_SENDER: Record<"meta" | "lovable", RegExp> = {
  meta: /(facebook|facebookmail|instagram|meta)\./i,
  lovable: /lovable/i,
};

type Provider = keyof typeof PROVIDER_SENDER;

/**
 * Caixa de entrada somente leitura do site.
 * O HTML já chega sanitizado do servidor e ainda é renderizado dentro de um
 * iframe com sandbox vazio — sem scripts, sem formulários, sem navegação.
 */
export function SiteInbox({ address, messages, isLoading, onRefresh, onOpen }: SiteInboxProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = messages.find((m) => m.id === openId) ?? null;

  // ----- Modo "aguardando código" (Facebook/Meta ou Lovable) ----------------
  const [waiting, setWaiting] = useState<Provider | null>(null);
  const [checking, setChecking] = useState(false);
  const startedAtRef = useRef<number>(0);

  /** Código do provedor que chegou DEPOIS que o cliente clicou em "aguardar". */
  const waitingCode = useMemo(() => {
    if (!waiting) return null;
    const sender = PROVIDER_SENDER[waiting];
    const found = messages.find(
      (m) =>
        m.verification_code &&
        sender.test(`${m.from_address || ""} ${m.from_name || ""} ${m.subject || ""}`) &&
        new Date(m.received_at).getTime() >= startedAtRef.current - 120_000,
    );
    return found ?? null;
  }, [messages, waiting]);

  // Enquanto aguarda, consulta o servidor a cada 6s (máx. 10 min).
  useEffect(() => {
    if (!waiting || waitingCode) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - startedAtRef.current > 10 * 60_000) {
        setWaiting(null);
        toast.info("Parei de aguardar. Clique de novo se o código ainda não chegou.");
        return;
      }
      setChecking(true);
      try {
        await onRefresh();
      } catch {
        /* falha de rede pontual: tentamos de novo no próximo ciclo */
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    void tick();
    const timer = setInterval(tick, 6000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [waiting, waitingCode, onRefresh]);

  useEffect(() => {
    if (waitingCode) toast.success(`Código recebido: ${waitingCode.verification_code}`);
  }, [waitingCode]);



  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Endereço copiado.");
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Código ${code} copiado.`);
    } catch {
      toast.error("Não foi possível copiar o código.");
    }
  }

  return (
    <div className="space-y-4 p-5">
      <div className="rounded-lg border border-border bg-accent/20 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          E-mail deste site
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="rounded bg-background px-2 py-1 font-mono text-sm font-semibold">{address}</code>
          <button
            onClick={copyAddress}
            className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-accent/40"
          >
            Copiar
          </button>
          <button
            onClick={onRefresh}
            className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-accent/40"
          >
            Atualizar
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Use este endereço para receber códigos de verificação (Facebook, Instagram, Google e outros).
          A caixa é <strong>somente leitura</strong>: não é possível responder ou enviar mensagens por aqui.
          Novas mensagens aparecem em até 1 minuto.
        </p>
      </div>

      {/* Campos dedicados: códigos de autenticação (Facebook/Meta e Lovable) */}
      {([
        {
          key: "meta" as Provider,
          title: "📘 Receber código de autenticação do Facebook",
          badge: "Meta Portfolio",
          description: (
            <>
              Este e-mail é direcionado à <strong>Meta Portfolio de Negócios</strong> para receber o código de
              verificação do Facebook. Cadastre{" "}
              <span className="font-mono font-semibold text-foreground">{address}</span> na Meta, clique em "Aguardar
              código" e peça o envio.
            </>
          ),
        },
        {
          key: "lovable" as Provider,
          title: "💜 Receber código de acesso do Lovable",
          badge: "Lovable",
          description: (
            <>
              Use <span className="font-mono font-semibold text-foreground">{address}</span> para criar ou entrar na sua
              conta do <strong>Lovable</strong>. Clique em "Aguardar código", peça o envio no Lovable e o código
              aparecerá aqui.
            </>
          ),
        },
      ]).map((provider) => (
        <div
          key={provider.key}
          className="rounded-lg border border-border bg-accent/10 p-4 ring-1 ring-border/60"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{provider.title}</span>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-black uppercase text-primary">
                  {provider.badge}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{provider.description}</p>
            </div>

            {waiting !== provider.key ? (
              <button
                onClick={() => {
                  startedAtRef.current = Date.now();
                  setWaiting(provider.key);
                }}
                className="shrink-0 rounded-md btn-brand px-4 py-2 text-sm font-semibold"
              >
                Aguardar código
              </button>
            ) : (
              <button
                onClick={() => setWaiting(null)}
                className="shrink-0 rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-accent/40"
              >
                Cancelar
              </button>
            )}
          </div>

          {waiting === provider.key && (
            <div className="mt-4 rounded-md border border-border bg-accent/20 p-4 text-center">
              {waitingCode?.verification_code ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Código recebido
                  </p>
                  <button
                    onClick={() => copyCode(waitingCode.verification_code!)}
                    className="mt-2 rounded-lg bg-primary/15 px-5 py-2 font-mono text-3xl font-black tracking-widest text-primary"
                    title="Clique para copiar"
                  >
                    {waitingCode.verification_code}
                  </button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    De {waitingCode.from_address} — clique no código para copiar.
                  </p>
                </>
              ) : (
                <>
                  <span
                    className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
                    aria-hidden
                  />
                  <p className="mt-3 text-sm font-semibold">Aguardando o código…</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {checking ? "Verificando a caixa de entrada…" : "Verificamos a cada 6 segundos."} Mantenha esta
                    aba aberta.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      ))}




      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando mensagens…</p>
      ) : messages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-semibold">Nenhuma mensagem ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cadastre <span className="font-mono">{address}</span> no serviço desejado e o código aparecerá aqui.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {messages.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => {
                  setOpenId(m.id === openId ? null : m.id);
                  if (!m.is_read) onOpen(m.id);
                }}
                className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left hover:bg-accent/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!m.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Não lido" />}
                    <span className="truncate text-sm font-semibold">{m.subject || "(sem assunto)"}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {m.from_name ? `${m.from_name} — ` : ""}
                    {m.from_address}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {m.verification_code && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        copyCode(m.verification_code!);
                      }}
                      className="mb-1 block cursor-pointer rounded bg-primary/15 px-2 py-0.5 font-mono text-sm font-bold text-primary"
                      title="Clique para copiar o código"
                    >
                      {m.verification_code}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(m.received_at).toLocaleString("pt-BR")}
                  </span>
                </div>
              </button>

              {open?.id === m.id && (
                <div className="border-t border-border bg-background/50 p-3">
                  {open.body_html ? (
                    <iframe
                      title={`Mensagem: ${open.subject || "sem assunto"}`}
                      sandbox=""
                      referrerPolicy="no-referrer"
                      srcDoc={open.body_html}
                      className="h-[420px] w-full rounded-md border border-border bg-white"
                    />
                  ) : (
                    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border border-border p-3 text-xs">
                      {open.body_text || "(mensagem vazia)"}
                    </pre>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
