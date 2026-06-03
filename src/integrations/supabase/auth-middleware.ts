import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    
    const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
    const SUPABASE_PUBLISHABLE_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      console.warn(`[Supabase] Missing variable(s): ${!SUPABASE_URL ? "SUPABASE_URL" : ""} ${!SUPABASE_PUBLISHABLE_KEY ? "SUPABASE_PUBLISHABLE_KEY" : ""}`);
    }
    
    const request = getRequest();

    if (!request?.headers) {
      throw new Error('Unauthorized: No request headers available');
    }

    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      throw new Error('Unauthorized: No authorization header provided');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new Error('Unauthorized: Only Bearer tokens are supported');
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      throw new Error('Unauthorized: No token provided');
    }

    // Em ambientes VPS com erro de "Legacy API keys", o cliente comum falha ao validar o JWS.
    // Usamos o supabaseAdmin no servidor para validar o token diretamente.
    const { supabaseAdmin } = await import('./client.server');
    
    let user;
    let authError;
    try {
      // Validating token via getUser is the standard way.
      // If this fails with "Unregistered API key", the SERVICE_ROLE_KEY in app.env is WRONG.
      const res = await supabaseAdmin.auth.getUser(token);
      user = res.data.user;
      authError = res.error;
    } catch (err: any) {
      console.error("[AuthMiddleware] Exception during getUser:", err);
      authError = err;
    }

    if (authError || !user) {
      const errorMsg = authError?.message || "Usuário não encontrado";
      console.error("[AuthMiddleware] Erro ao validar token:", errorMsg);
      
      // Se for "Unregistered API key", o erro é 100% no app.env da VPS.
      if (errorMsg.includes("Unregistered API key")) {
        throw new Error(`ERRO DE CONFIGURAÇÃO NA VPS: Sua chave SERVICE_ROLE_KEY no arquivo app.env está incorreta ou não pertence a este projeto Supabase. Por favor, rode o comando de correção no terminal da Hostinger.`);
      }

      throw new Error(`Sessão inválida ou expirada. Por favor, SAIA (logout) e ENTRE novamente no painel. Detalhes: ${errorMsg}`);
    }

    return next({
      context: {
        supabase: supabaseAdmin, // Usamos o admin client para garantir acesso ao Storage/DB sem erros de RLS/Key
        userId: user.id,
        user,
      },
    });
  },
);