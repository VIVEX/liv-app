import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Auth from "./components/Auth";

type Session = Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"];

export default function App() {
  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // pega sessão atual
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // escuta mudanças (login/logout)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="p-6">Carregando…</div>;
  }

  if (!session) {
    // não logado → mostra tela de login
    return (
      <div className="min-h-screen grid place-items-center">
        <Auth />
      </div>
    );
  }

  // logado → tela básica
  const user = session.user;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">LIV</h1>
        <button
          onClick={() => supabase.auth.signOut()}
          className="rounded-xl px-3 py-2 border"
        >
          Sair
        </button>
      </header>

      <div className="rounded-2xl border p-4">
        <p className="text-sm text-gray-500">Logado como:</p>
        <p className="font-medium">{user.email}</p>
      </div>

      <div className="rounded-2xl border p-6">
        <h2 className="font-semibold mb-2">Feed (em breve)</h2>
        <p>Agora que o login funciona, vamos conectar o Feed ao Supabase.</p>
      </div>
    </div>
  );
}
