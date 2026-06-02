import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { adminLogin, adminListUsers, adminListSites, adminDeleteUser, adminGetSettings, adminSaveSettings, adminResetUserGenerations } from "@/lib/admin.functions";

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

  const [tab, setTab] = useState<"users" | "sites" | "settings">("users");
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string; whatsapp: string; cpf: string; created_at: string; site_count: number }>>([]);
  const [sites, setSites] = useState<Array<{ id: string; slug: string; title: string; owner_id: string; is_published: boolean; updated_at: string; visits: number }>>([]);
  const [settings, setSettings] = useState<{ openai_configured: boolean; deepseek_configured: boolean; claude_configured: boolean; openai_mask: string; deepseek_mask: string; claude_mask: string } | null>(null);
  const [openaiInput, setOpenaiInput] = useState("");
  const [deepseekInput, setDeepseekInput] = useState("");
  const [claudeInput, setClaudeInput] = useState("");

  async function reload() {
    try {
      if (tab === "users") {
        const r = await usersFn({ data: { token } });
        setUsers(r.users);
      } else if (tab === "sites") {
        const r = await sitesFn({ data: { token } });
        setSites(r.sites);
      } else {
        const r = await getSettingsFn({ data: { token } });
        setSettings(r);
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("autorizado")) { toast.error("Sessão expirada"); onLogout(); }
      else toast.error(msg);
    }
  }

  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [tab]);

  async function handleDeleteUser(uid: string, email: string) {
    if (!confirm(`Excluir o usuário ${email}? Essa ação não pode ser desfeita.`)) return;
    try {
      await delUserFn({ data: { token, userId: uid } });
      toast.success("Usuário excluído");
      void reload();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function handleResetGen(uid: string, email: string) {
    if (!confirm(`Renovar as gerações da semana de ${email}? Ele poderá gerar mais 3 versões.`)) return;
    try {
      await resetGenFn({ data: { token, userId: uid } });
      toast.success("Gerações renovadas");
    } catch (e) { toast.error((e as Error).message); }
  }

  async function handleSaveTokens() {
    try {
      const payload: { token: string; openai_token?: string; deepseek_token?: string; claude_token?: string } = { token };
      if (openaiInput.trim()) payload.openai_token = openaiInput.trim();
      if (deepseekInput.trim()) payload.deepseek_token = deepseekInput.trim();
      if (claudeInput.trim()) payload.claude_token = claudeInput.trim();
      if (!payload.openai_token && !payload.deepseek_token && !payload.claude_token) {
        toast.error("Cole pelo menos uma chave."); return;
      }
      await saveSettingsFn({ data: payload });
      toast.success("Chaves salvas");
      setOpenaiInput(""); setDeepseekInput(""); setClaudeInput("");
      void reload();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6 flex gap-1 rounded-lg border border-white/10 p-1 sm:w-fit">
        {(["users", "sites", "settings"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === t ? "bg-brand text-brand-foreground" : "text-white/70 hover:bg-white/10"}`}>
            {t === "users" ? "Usuários" : t === "sites" ? "Sites" : "Configurações"}
          </button>
        ))}
      </div>

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
        </div>
      )}
    </main>
  );
}
