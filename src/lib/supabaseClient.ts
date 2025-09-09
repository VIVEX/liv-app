// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";
// se você não gerou tipos do banco, pode remover o "<Database>" e o import abaixo.
// import type { Database } from "../types/supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltam variáveis de ambiente: VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY"
  );
}

// Se não usa tipos gerados, troque para: createClient(supabaseUrl, supabaseAnonKey, { ... })
export const supabase = createClient/*<Database>*/(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE é o padrão recomendado p/ apps SPA
    flowType: "pkce",
  },
  global: {
    headers: { "x-application-name": "liv-app" },
  },
});

export default supabase;
