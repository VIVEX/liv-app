// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Em produção, se faltar env no Vercel, mostramos uma mensagem clara em vez de "tela branca"
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Faltam variáveis de ambiente: VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY.');
  if (typeof document !== 'undefined') {
    document.body.innerHTML =
      '<pre style="padding:16px;font-family:ui-monospace, SFMono-Regular, Menlo, monospace;">' +
      '⚠️ Faltam variáveis de ambiente.\n\n' +
      'Defina no Vercel (Project → Settings → Environment Variables):\n' +
      '  • VITE_SUPABASE_URL\n' +
      '  • VITE_SUPABASE_ANON_KEY\n\n' +
      'Depois, faça um Redeploy.\n' +
      '</pre>';
  }
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // necessário para OAuth
  },
});

export default supabase;
