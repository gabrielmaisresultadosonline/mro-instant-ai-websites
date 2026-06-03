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
    
    // In VPS environment, the user client might have issues with session validation.
    // We use the admin client to validate the token directly against Supabase.
    let user;
    let authError;
    try {
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
      
      // If we are in production/VPS, there might be a key mismatch.
      // Instruct the user to logout and login again to sync the session.
      throw new Error(`Sessão inválida ou expirada. Por favor, SAIA (logout) e ENTRE novamente no painel para atualizar suas chaves. Detalhes: ${errorMsg}`);
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