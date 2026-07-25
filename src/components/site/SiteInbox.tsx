import { useState } from "react";
import { toast } from "sonner";
import type { InboxMessage } from "@/lib/inbox.functions";

export interface SiteInboxProps {
  /** Endereço derivado do slug do site (ex.: sadel@mro.bio). */
  address: string;
  messages: InboxMessage[];
  isLoading: boolean;
  onRefresh: () => void;
  onOpen: (id: string) => void;
}

/**
 * Caixa de entrada somente leitura do site.
 * O HTML já chega sanitizado do servidor e ainda é renderizado dentro de um
 * iframe com sandbox vazio — sem scripts, sem formulários, sem navegação.
 */
export function SiteInbox({ address, messages, isLoading, onRefresh, onOpen }: SiteInboxProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = messages.find((m) => m.id === openId) ?? null;

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
