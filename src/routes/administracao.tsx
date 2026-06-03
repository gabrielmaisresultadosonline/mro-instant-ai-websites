import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { adminLogin, adminListUsers, adminListSites, adminDeleteUser, adminGetSettings, adminSaveSettings, adminResetUserGenerations, adminListSubscriptions, adminListEmailOutbox, adminListKiwifyLog, adminGrantSubscription, adminRevokeSubscription, adminRetryEmail, adminDashboardStats, adminGetKiwifyWebhookUrl, adminSendTestEmail } from "@/lib/admin.functions";

export const Route = createFileRoute("/administracao")({
  ssr: false,
  head: () => ({ meta: [{ title: "Administração — MRO.BIO" }] }),
  component: AdminPage,
});

const STORAGE_KEY = "mrobio.admin.token";

function AdminPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (t) setToken(t);
  }, []);

  function handleLogin(t: string) {
    window.localStorage.setItem(STORAGE_KEY, t);
    setToken(t);
  }
  function handleLogout() {
    window.localStorage.removeItem(STORAGE_KEY);
    setToken(null);
  }

  return (
    <div className="min-h-screen bg-foreground text-background">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md btn-brand font-display text-sm font-bold text-brand-foreground">M</span>
            <span className="font-display text-base font-bold">MRO.BIO · Admin</span>
          </div>
          {token && (
            <button onClick={handleLogout} className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/10">Sair</button>
          )}
        </div>
      </header>
      {token ? <AdminDashboard token={token} onLogout={handleLogout} /> : <AdminLogin onLogin={handleLogin} />}
    </div>
  );
}

function AdminLogin({ onLogin }: { onLogin: (t: string) => void }) {
  const loginFn = useServerFn(adminLogin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { token } = await loginFn({ data: { email, password } });
      onLogin(token);
      toast.success("Bem-vindo, admin.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setLoading(false); }
  }

  return (
    <main className="mx-auto grid min-h-[80vh] max-w-md place-items-center px-5">
      <form onSubmit={onSubmit} className="w-full space-y-4 rounded-2xl border border-white/10 bg-white/5 p-7">
        <h1 className="font-display text-2xl font-bold">Entrar como admin</h1>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/60">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-white/20 bg-white/10 p-2.5 text-sm focus:border-brand focus:outline-none" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/60">Senha</span>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-white/20 bg-white/10 p-2.5 text-sm focus:border-brand focus:outline-none" />
        </label>
        <button disabled={loading} className="w-full rounded-md btn-brand py-2.5 text-sm font-semibold disabled:opacity-60">
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}

function AdminDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const usersFn = useServerFn(adminListUsers);
  const sitesFn = useServerFn(adminListSites);
  const delUserFn = useServerFn(adminDeleteUser);
  const resetGenFn = useServerFn(adminResetUserGenerations);
  const getSettingsFn = useServerFn(adminGetSettings);
  const saveSettingsFn = useServerFn(adminSaveSettings);
  const subsFn = useServerFn(adminListSubscriptions);
  const outboxFn = useServerFn(adminListEmailOutbox);
  const kiwifyFn = useServerFn(adminListKiwifyLog);
  const grantFn = useServerFn(adminGrantSubscription);
  const revokeFn = useServerFn(adminRevokeSubscription);
  const retryFn = useServerFn(adminRetryEmail);
  const statsFn = useServerFn(adminDashboardStats);
  const kiwifyUrlFn = useServerFn(adminGetKiwifyWebhookUrl);
  const sendTestFn = useServerFn(adminSendTestEmail);

  type Tab = "dashboard" | "users" | "sites" | "subscriptions" | "outbox" | "kiwify" | "settings";
  const [tab, setTab] = useState<Tab>("dashboard");
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string; whatsapp: string; cpf: string; created_at: string; site_count: number }>>([]);
  const [sites, setSites] = useState<Array<{ id: string; slug: string; title: string; owner_id: string; is_published: boolean; updated_at: string; visits: number }>>([]);
  const [subs, setSubs] = useState<Array<{ id: string; name: string; email: string; subscription_status: string; subscription_expires_at: string | null; grace_period_ends_at: string | null; kiwify_order_id: string | null; last_payment_at: string | null }>>([]);
  const [outbox, setOutbox] = useState<Array<{ id: string; to_email: string; subject: string; template: string; status: string; attempts: number; last_error: string | null; created_at: string; sent_at: string | null }>>([]);
  const [kiwify, setKiwify] = useState<Array<{ id: string; event: string | null; order_id: string | null; email: string | null; status: string; error: string | null; created_at: string }>>([]);
  const [settings, setSettings] = useState<{ openai_configured: boolean; deepseek_configured: boolean; claude_configured: boolean; openai_mask: string; deepseek_mask: string; claude_mask: string } | null>(null);
  const [openaiInput, setOpenaiInput] = useState("");
  const [deepseekInput, setDeepseekInput] = useState("");
  const [claudeInput, setClaudeInput] = useState("");
  const [stats, setStats] = useState<{ totals: { users: number; active: number; grace: number; canceled: number; expiringSoon: number; expiringIn2d: number; paymentsLast30: number; cancelsLast30: number }; nextExpirations: Array<{ id: string; name: string; email: string; subscription_expires_at: string | null }> } | null>(null);
  const [kiwifyUrl, setKiwifyUrl] = useState<{ url: string; configured: boolean } | null>(null);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testTemplate, setTestTemplate] = useState("activation");
  const [sendingTest, setSendingTest] = useState(false);

  async function reload() {
    try {
      if (tab === "dashboard") { const r = await statsFn({ data: { token } }); setStats(r); }
      else if (tab === "users") { const r = await usersFn({ data: { token } }); setUsers(r.users); }
      else if (tab === "sites") { const r = await sitesFn({ data: { token } }); setSites(r.sites); }
      else if (tab === "subscriptions") { const r = await subsFn({ data: { token } }); setSubs(r.rows); }
      else if (tab === "outbox") { const r = await outboxFn({ data: { token, status: "all" } }); setOutbox(r.rows); }
      else if (tab === "kiwify") { const r = await kiwifyFn({ data: { token } }); setKiwify(r.rows); }
      else {
        const r = await getSettingsFn({ data: { token } }); setSettings(r);
        const k = await kiwifyUrlFn({ data: { token } }); setKiwifyUrl(k);
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("autorizado")) { toast.error("Sessão expirada"); onLogout(); }
      else toast.error(msg);
    }
  }

  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [tab]);

  async function handleSendTest() {
    if (!testEmailTo.trim()) { toast.error("Informe o e-mail destino"); return; }
    setSendingTest(true);
    try {
      await sendTestFn({ data: { token, to: testEmailTo.trim(), template: testTemplate } });
      toast.success("E-mail de teste enfileirado");
      if (tab === "outbox") void reload();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSendingTest(false); }
  }


  async function handleDeleteUser(uid: string, email: string) {
    if (!confirm(`Excluir o usuário ${email}? Essa ação não pode ser desfeita.`)) return;
    try { await delUserFn({ data: { token, userId: uid } }); toast.success("Usuário excluído"); void reload(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function handleResetGen(uid: string, email: string) {
    if (!confirm(`Renovar as gerações da semana de ${email}? Ele poderá gerar mais 3 versões.`)) return;
    try { await resetGenFn({ data: { token, userId: uid } }); toast.success("Gerações renovadas"); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function handleGrant(uid: string, email: string) {
    const d = prompt(`Quantos dias de acesso conceder para ${email}?`, "365");
    if (!d) return;
    const days = parseInt(d, 10);
    if (!days || days < 1) return toast.error("Número inválido.");
    try { const r = await grantFn({ data: { token, userId: uid, days } }); toast.success(`Acesso até ${new Date(r.expires_at).toLocaleDateString("pt-BR")}`); void reload(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function handleRevoke(uid: string, email: string) {
    if (!confirm(`Revogar o acesso de ${email}? O site sairá do ar.`)) return;
    try { await revokeFn({ data: { token, userId: uid } }); toast.success("Acesso revogado"); void reload(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function handleRetryEmail(id: string) {
    try { await retryFn({ data: { token, emailId: id } }); toast.success("Email reenfileirado"); void reload(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function handleSaveTokens() {
    try {
      const payload: { token: string; openai_token?: string; deepseek_token?: string; claude_token?: string } = { token };
      if (openaiInput.trim()) payload.openai_token = openaiInput.trim();
      if (deepseekInput.trim()) payload.deepseek_token = deepseekInput.trim();
      if (claudeInput.trim()) payload.claude_token = claudeInput.trim();
      if (!payload.openai_token && !payload.deepseek_token && !payload.claude_token) { toast.error("Cole pelo menos uma chave."); return; }
      await saveSettingsFn({ data: payload });
      toast.success("Chaves salvas");
      setOpenaiInput(""); setDeepseekInput(""); setClaudeInput("");
      void reload();
    } catch (e) { toast.error((e as Error).message); }
  }

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: "dashboard", label: "Dashboard" },
    { key: "users", label: "Usuários" },
    { key: "sites", label: "Sites" },
    { key: "subscriptions", label: "Assinaturas" },
    { key: "outbox", label: "Fila de e-mails" },
    { key: "kiwify", label: "Webhooks Kiwify" },
    { key: "settings", label: "Configurações" },
  ];

  const TEMPLATES: Array<{ value: string; label: string }> = [
    { value: "activation", label: "Compra aprovada — criar senha (ativação)" },
    { value: "renewal_thanks", label: "Pagamento confirmado / renovação" },
    { value: "reminder_2d", label: "Lembrete: vence em 2 dias" },
    { value: "reminder_1d", label: "Lembrete: vence amanhã" },
    { value: "expired_grace", label: "Expirado — período de carência (10 dias)" },
    { value: "canceled", label: "Assinatura cancelada" },
    { value: "refunded", label: "Reembolso processado" },
    { value: "deleted", label: "Acesso excluído" },
    { value: "password_reset", label: "Recuperação de senha" },
  ];

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6 flex flex-wrap gap-1 rounded-lg border border-white/10 p-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === t.key ? "bg-brand text-brand-foreground" : "text-white/70 hover:bg-white/10"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Usuários", value: stats?.totals.users ?? 0, color: "text-white" },
              { label: "Assinantes ativos", value: stats?.totals.active ?? 0, color: "text-emerald-400" },
              { label: "Em carência", value: stats?.totals.grace ?? 0, color: "text-amber-400" },
              { label: "Cancelados", value: stats?.totals.canceled ?? 0, color: "text-red-400" },
              { label: "Pagamentos (30d)", value: stats?.totals.paymentsLast30 ?? 0, color: "text-emerald-400" },
              { label: "Cancelamentos (30d)", value: stats?.totals.cancelsLast30 ?? 0, color: "text-red-400" },
              { label: "Vencem em ≤7d", value: stats?.totals.expiringSoon ?? 0, color: "text-amber-400" },
              { label: "Vencem em ≤2d", value: stats?.totals.expiringIn2d ?? 0, color: "text-amber-400" },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-[11px] uppercase tracking-wide text-white/60">{c.label}</div>
                <div className={`mt-1 font-display text-2xl font-bold ${c.color}`}>{c.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/10">
            <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Próximos vencimentos</div>
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/60">
                <tr><th className="px-4 py-3">Usuário</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Vence em</th><th className="px-4 py-3">Dias restantes</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {(stats?.nextExpirations ?? []).length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-white/50">Sem assinaturas ativas.</td></tr>
                ) : stats!.nextExpirations.map((x) => {
                  const exp = x.subscription_expires_at ? new Date(x.subscription_expires_at) : null;
                  const days = exp ? Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86400000)) : 0;
                  return (
                    <tr key={x.id}>
                      <td className="px-4 py-3">{x.name}</td>
                      <td className="px-4 py-3 text-xs">{x.email}</td>
                      <td className="px-4 py-3 text-xs">{exp ? exp.toLocaleDateString("pt-BR") : "—"}</td>
                      <td className={`px-4 py-3 text-xs ${days <= 2 ? "text-red-400" : days <= 7 ? "text-amber-400" : "text-white/70"}`}>{days}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}




      {tab === "users" && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/60">
              <tr><th className="px-4 py-3">Nome</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">WhatsApp</th><th className="px-4 py-3">CPF</th><th className="px-4 py-3">Sites</th><th className="px-4 py-3">Cadastro</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {users.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-white/50">Nenhum usuário ainda.</td></tr>
              ) : users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">{u.name}</td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3 font-mono text-xs">{u.whatsapp}</td>
                  <td className="px-4 py-3 font-mono text-xs">{u.cpf}</td>
                  <td className="px-4 py-3">{u.site_count}</td>
                  <td className="px-4 py-3 text-xs text-white/60">{new Date(u.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleResetGen(u.id, u.email)}
                        className="rounded-md border border-brand/40 px-2 py-1 text-xs text-brand hover:bg-brand/10">Renovar gerações</button>
                      <button onClick={() => handleDeleteUser(u.id, u.email)}
                        className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10">Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "sites" && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/60">
              <tr><th className="px-4 py-3">Slug</th><th className="px-4 py-3">Título</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Visitas</th><th className="px-4 py-3">Atualizado</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {sites.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-white/50">Nenhum site ainda.</td></tr>
              ) : sites.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-mono text-xs">{s.slug}.mro.bio</td>
                  <td className="px-4 py-3">{s.title || "—"}</td>
                  <td className="px-4 py-3">{s.is_published ? "🟢 publicado" : "🟡 rascunho"}</td>
                  <td className="px-4 py-3">{s.visits}</td>
                  <td className="px-4 py-3 text-xs text-white/60">{new Date(s.updated_at).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 text-right">
                    <a href={`https://${s.slug}.mro.bio`} target="_blank" rel="noreferrer"
                      className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/10">Ver ↗</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "settings" && (
        <div className="max-w-xl space-y-5 rounded-xl border border-white/10 bg-white/5 p-6">
          <div>
            <h2 className="font-display text-lg font-bold">Chaves da I.A da MRO</h2>
            <p className="mt-1 text-xs text-white/60">Essas chaves ficam armazenadas no banco e são usadas para gerar os sites dos usuários. Nunca são expostas ao navegador.</p>
          </div>

          <div className="rounded-lg border border-white/10 p-4">
            <div className="text-xs uppercase tracking-wide text-white/60">OpenAI (etapa de ideias)</div>
            <div className="mt-1 text-sm font-semibold">
              {settings?.openai_configured ? `✅ Configurada (${settings.openai_mask})` : "❌ Não configurada"}
            </div>
            <input type="password" value={openaiInput} onChange={(e) => setOpenaiInput(e.target.value)}
              placeholder="sk-..." className="mt-3 w-full rounded-md border border-white/20 bg-white/10 p-2.5 text-sm focus:border-brand focus:outline-none" />
          </div>

          <div className="rounded-lg border border-white/10 p-4">
            <div className="text-xs uppercase tracking-wide text-white/60">DeepSeek (gera a Versão 1)</div>
            <div className="mt-1 text-sm font-semibold">
              {settings?.deepseek_configured ? `✅ Configurada (${settings.deepseek_mask})` : "❌ Não configurada"}
            </div>
            <input type="password" value={deepseekInput} onChange={(e) => setDeepseekInput(e.target.value)}
              placeholder="sk-..." className="mt-3 w-full rounded-md border border-white/20 bg-white/10 p-2.5 text-sm focus:border-brand focus:outline-none" />
          </div>

          <div className="rounded-lg border border-white/10 p-4">
            <div className="text-xs uppercase tracking-wide text-white/60">Claude / Anthropic (gera a Versão 2)</div>
            <div className="mt-1 text-sm font-semibold">
              {settings?.claude_configured ? `✅ Configurada (${settings.claude_mask})` : "❌ Não configurada"}
            </div>
            <input type="password" value={claudeInput} onChange={(e) => setClaudeInput(e.target.value)}
              placeholder="sk-ant-..." className="mt-3 w-full rounded-md border border-white/20 bg-white/10 p-2.5 text-sm focus:border-brand focus:outline-none" />
          </div>

          <button onClick={handleSaveTokens} className="rounded-md btn-brand px-5 py-2.5 text-sm font-semibold">Salvar chaves</button>

          <div className="mt-6 rounded-lg border border-white/10 p-4">
            <div className="text-xs uppercase tracking-wide text-white/60">URL do Webhook da Kiwify</div>
            <p className="mt-1 text-xs text-white/50">Cole esta URL no painel da Kiwify (Configurações → Webhooks). Ela já inclui o token de segurança.</p>
            <div className="mt-3 flex gap-2">
              <input readOnly value={kiwifyUrl?.url ?? "Carregando…"}
                className="flex-1 rounded-md border border-white/20 bg-white/10 p-2.5 font-mono text-xs" />
              <button
                onClick={() => { if (kiwifyUrl?.url) { navigator.clipboard.writeText(kiwifyUrl.url); toast.success("URL copiada"); } }}
                className="rounded-md btn-brand px-4 py-2 text-xs font-semibold">Copiar</button>
            </div>
            {kiwifyUrl && !kiwifyUrl.configured && (
              <p className="mt-2 text-xs text-red-300">⚠ KIWIFY_WEBHOOK_TOKEN não configurado no servidor.</p>
            )}
          </div>
        </div>
      )}


      {tab === "subscriptions" && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/60">
              <tr><th className="px-4 py-3">Usuário</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Expira em</th><th className="px-4 py-3">Pedido Kiwify</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {subs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-white/50">Sem assinaturas ainda.</td></tr>
              ) : subs.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3"><div>{s.name}</div><div className="text-xs text-white/50">{s.email}</div></td>
                  <td className="px-4 py-3">
                    <span className={
                      s.subscription_status === "active" ? "text-emerald-400" :
                      s.subscription_status === "grace" ? "text-amber-400" :
                      s.subscription_status === "none" ? "text-white/50" : "text-red-400"
                    }>{s.subscription_status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {s.subscription_expires_at ? new Date(s.subscription_expires_at).toLocaleDateString("pt-BR") : "—"}
                    {s.grace_period_ends_at && <div className="text-amber-400">apagar em {new Date(s.grace_period_ends_at).toLocaleDateString("pt-BR")}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{s.kiwify_order_id ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleGrant(s.id, s.email)} className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10">+ Dias</button>
                      <button onClick={() => handleRevoke(s.id, s.email)} className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10">Revogar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "outbox" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold">Enviar e-mail de teste</div>
            <p className="mt-1 text-xs text-white/60">Enfileira um e-mail real (com prefixo <code>[TESTE]</code>) usando o template escolhido. Os dados são fictícios.</p>
            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_2fr_auto]">
              <input type="email" value={testEmailTo} onChange={(e) => setTestEmailTo(e.target.value)} placeholder="destino@exemplo.com"
                className="rounded-md border border-white/20 bg-white/10 p-2.5 text-sm focus:border-brand focus:outline-none" />
              <select value={testTemplate} onChange={(e) => setTestTemplate(e.target.value)}
                className="rounded-md border border-white/20 bg-white/10 p-2.5 text-sm focus:border-brand focus:outline-none">
                {TEMPLATES.map((t) => <option key={t.value} value={t.value} className="bg-foreground">{t.label}</option>)}
              </select>
              <button onClick={handleSendTest} disabled={sendingTest}
                className="rounded-md btn-brand px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
                {sendingTest ? "Enviando…" : "Enviar teste"}
              </button>
            </div>
          </div>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-sm">

            <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/60">
              <tr><th className="px-4 py-3">Para</th><th className="px-4 py-3">Assunto</th><th className="px-4 py-3">Template</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Tent.</th><th className="px-4 py-3">Criado</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {outbox.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-white/50">Fila vazia.</td></tr>
              ) : outbox.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-xs">{m.to_email}</td>
                  <td className="px-4 py-3 text-xs">{m.subject}</td>
                  <td className="px-4 py-3 font-mono text-xs">{m.template}</td>
                  <td className="px-4 py-3">
                    <span className={m.status === "sent" ? "text-emerald-400" : m.status === "failed" ? "text-red-400" : "text-amber-400"}>{m.status}</span>
                    {m.last_error && <div className="text-xs text-red-300">{m.last_error}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs">{m.attempts}</td>
                  <td className="px-4 py-3 text-xs text-white/60">{new Date(m.created_at).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 text-right">
                    {m.status !== "sent" && <button onClick={() => handleRetryEmail(m.id)} className="rounded-md border border-brand/40 px-2 py-1 text-xs text-brand hover:bg-brand/10">Reenviar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-white/10 p-3 text-xs text-white/50">
            ℹ Os e-mails ficam aqui até o worker SMTP no VPS Ubuntu lê-los e enviar via <code>suporte@mro.bio</code>.
          </p>
        </div>
        </div>
      )}

      {tab === "kiwify" && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/60">
              <tr><th className="px-4 py-3">Quando</th><th className="px-4 py-3">Evento</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Pedido</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {kiwify.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-white/50">Nenhum webhook recebido ainda.</td></tr>
              ) : kiwify.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-3 text-xs text-white/60">{new Date(k.created_at).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 font-mono text-xs">{k.event ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{k.email ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{k.order_id ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={k.status === "processed" ? "text-emerald-400" : k.status === "error" ? "text-red-400" : "text-white/60"}>{k.status}</span>
                    {k.error && <div className="text-xs text-red-300">{k.error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>

  );
}
