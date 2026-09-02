import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  adminCreateInbox,
  adminDeleteInbox,
  adminListInboxMessages,
  adminListInboxes,
} from "@/lib/admin.functions";

export interface AdminInboxesProps {
  /** Token JWT do painel administrativo. */
  token: string;
}

interface Inbox {
  id: string;
  local_part: string;
  label: string | null;
  address: string;
  created_at: string;
}

interface Message {
  id: string;
  from_address: string;
  from_name: string | null;
  subject: string;
  body_text: string | null;
  verification_code: string | null;
  received_at: string;
}

/**
 * Gestão das caixas de e-mail do domínio direto pelo painel:
 * criar endereço, aguardar o código (Facebook, Lovable, etc.) e ver mensagens.
 */
export function AdminInboxes({ token }: AdminInboxesProps) {
  const listFn = useServerFn(adminListInboxes);
  const createFn = useServerFn(adminCreateInbox);
  const deleteFn = useServerFn(adminDeleteInbox);
  const messagesFn = useServerFn(adminListInboxMessages);

  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [domain, setDomain] = useState("mro.bio");
  const [localPart, setLocalPart] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Inbox | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [checking, setChecking] = useState(false);
  const startedAtRef = useRef(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);


  const reload = useCallback(async () => {
    try {
      const r = await listFn({ data: { token } });
      setInboxes(r.inboxes as Inbox[]);
      setDomain(r.domain);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [listFn, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMessages = useCallback(
    async (inbox: Inbox, sync: boolean) => {
      setChecking(sync);
      try {
        const r = await messagesFn({ data: { token, inboxId: inbox.id, sync } });
        setMessages(r.messages as Message[]);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setChecking(false);
      }
    },
    [messagesFn, token],
  );

  // Enquanto "aguardando código", consulta o IMAP a cada 8s (máx. 10 min).
  useEffect(() => {
    if (!waiting || !selected) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - startedAtRef.current > 10 * 60_000) {
        setWaiting(false);
        toast.info("Parei de aguardar. Clique de novo se o código ainda não chegou.");
        return;
      }
      await loadMessages(selected, true);
    };
    void tick();
    const timer = setInterval(tick, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [waiting, selected, loadMessages]);

  /** Extrai todos os links de verificação do corpo do e-mail (Lovable envia link, não código). */
  function extractLinks(text: string | null): string[] {
    if (!text) return [];
    const found = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
    const unique = Array.from(new Set(found.map((u) => u.replace(/[.,;]+$/, ""))));
    // Prioriza links de verificação/autenticação.
    return unique.sort((a, b) => Number(/auth|verify|confirm|login|magic|oobCode|token/i.test(b)) - Number(/auth|verify|confirm|login|magic|oobCode|token/i.test(a)));
  }

  const fresh = waiting
    ? messages.find(
        (m) =>
          (m.verification_code || extractLinks(m.body_text).length > 0) &&
          new Date(m.received_at).getTime() >= startedAtRef.current - 120_000,
      ) ?? null
    : null;
  const freshCode = fresh;

  useEffect(() => {
    if (fresh) {
      setWaiting(false);
      toast.success(fresh.verification_code ? `Código recebido: ${fresh.verification_code}` : "E-mail recebido: veja o link abaixo.");
    }
  }, [fresh]);


  async function handleCreate() {
    if (!localPart.trim()) return;
    setCreating(true);
    try {
      await createFn({ data: { token, localPart: localPart.trim(), label: label.trim() || undefined } });
      toast.success("Caixa criada");
      setLocalPart("");
      setLabel("");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(inbox: Inbox) {
    if (!confirm(`Excluir a caixa ${inbox.address} e suas mensagens?`)) return;
    try {
      await deleteFn({ data: { token, inboxId: inbox.id } });
      if (selected?.id === inbox.id) {
        setSelected(null);
        setMessages([]);
      }
      toast.success("Caixa excluída");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="font-display text-lg font-bold">Criar caixa de e-mail</h2>
        <p className="mt-1 text-xs text-white/60">
          Endereços em <span className="font-mono">@{domain}</span> para receber códigos (Facebook/Meta, Lovable,
          Google e outros). A caixa é somente leitura.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-white/10 bg-black/30 px-2">
            <input
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value)}
              placeholder="ex: lovable-teste"
              className="bg-transparent py-2 text-sm outline-none"
            />
            <span className="text-sm text-white/50">@{domain}</span>
          </div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Rótulo (opcional)"
            className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60"
          >
            {creating ? "Criando…" : "Criar caixa"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10">
        {inboxes.length === 0 ? (
          <p className="p-4 text-sm text-white/60">Nenhuma caixa criada ainda.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {inboxes.map((inbox) => (
              <li key={inbox.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <button onClick={() => copy(inbox.address)} className="font-mono text-sm font-semibold hover:underline">
                    {inbox.address}
                  </button>
                  {inbox.label && <div className="text-xs text-white/50">{inbox.label}</div>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelected(inbox);
                      setMessages([]);
                      setWaiting(false);
                      void loadMessages(inbox, false);
                    }}
                    className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
                  >
                    Ver mensagens
                  </button>
                  <button
                    onClick={() => {
                      setSelected(inbox);
                      setMessages([]);
                      startedAtRef.current = Date.now();
                      setWaiting(true);
                    }}
                    className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground"
                  >
                    Receber código
                  </button>
                  <button
                    onClick={() => handleDelete(inbox)}
                    className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base font-bold">
              Mensagens de <span className="font-mono">{selected.address}</span>
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => void loadMessages(selected, true)}
                className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
              >
                Atualizar agora
              </button>
              {waiting && (
                <button
                  onClick={() => setWaiting(false)}
                  className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
                >
                  Cancelar espera
                </button>
              )}
            </div>
          </div>

          {waiting && !freshCode && (
            <div className="mt-3 rounded-md border border-white/10 bg-black/30 p-4 text-center">
              <span
                className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-brand border-t-transparent"
                aria-hidden
              />
              <p className="mt-2 text-sm font-semibold">Aguardando o código…</p>
              <p className="mt-1 text-xs text-white/60">
                {checking ? "Consultando a caixa…" : "Verificamos a cada 8 segundos."} Peça o envio agora.
              </p>
            </div>
          )}

          <ul className="mt-3 divide-y divide-white/10">
            {messages.length === 0 && <li className="py-3 text-sm text-white/60">Nenhuma mensagem.</li>}
            {messages.map((m) => {
              const links = extractLinks(m.body_text);
              const isOpen = expandedId === m.id;
              return (
                <li key={m.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{m.subject || "(sem assunto)"}</div>
                      <div className="truncate text-xs text-white/50">
                        {m.from_name ? `${m.from_name} — ` : ""}
                        {m.from_address}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {m.verification_code && (
                        <button
                          onClick={() => copy(m.verification_code!)}
                          className="mb-1 block rounded bg-brand/20 px-2 py-0.5 font-mono text-sm font-bold text-brand"
                          title="Clique para copiar"
                        >
                          {m.verification_code}
                        </button>
                      )}
                      <span className="text-[11px] text-white/50">
                        {new Date(m.received_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>

                  {links.length > 0 && (
                    <div className="mt-2 space-y-2 rounded-md border border-white/10 bg-black/30 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
                        Links do e-mail
                      </div>
                      {links.map((url) => (
                        <div key={url} className="space-y-1">
                          <p className="break-all font-mono text-[11px] leading-relaxed text-brand">{url}</p>
                          <div className="flex gap-2">
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="rounded-md bg-brand px-3 py-1 text-[11px] font-semibold text-brand-foreground"
                            >
                              Abrir link
                            </a>
                            <button
                              onClick={() => copy(url)}
                              className="rounded-md border border-white/15 px-3 py-1 text-[11px] font-semibold hover:bg-white/10"
                            >
                              Copiar link
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {m.body_text && (
                    <>
                      <button
                        onClick={() => setExpandedId(isOpen ? null : m.id)}
                        className="mt-2 text-[11px] font-semibold text-white/60 underline hover:text-white"
                      >
                        {isOpen ? "Ocultar e-mail completo" : "Ver e-mail completo"}
                      </button>
                      <pre
                        className={
                          isOpen
                            ? "mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-md border border-white/10 bg-black/30 p-3 text-xs text-white/70"
                            : "mt-1 line-clamp-3 whitespace-pre-wrap break-all text-xs text-white/60"
                        }
                      >
                        {m.body_text}
                      </pre>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

