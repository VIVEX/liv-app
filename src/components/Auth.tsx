import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setMsg(null);
    setErr(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // para onde o usuário será redirecionado após clicar no link
        emailRedirectTo: window.location.origin,
      },
    });

    setSending(false);
    if (error) {
      setErr(error.message);
    } else {
      setMsg("Pronto! Verifique seu e-mail e clique no Magic Link para entrar.");
    }
  }

  return (
    <div className="max-w-sm mx-auto p-6 border rounded-2xl">
      <h2 className="text-xl font-semibold mb-4">Entrar com Magic Link</h2>
      <form onSubmit={handleMagicLink} className="space-y-3">
        <input
          type="email"
          required
          placeholder="seuemail@exemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded-lg px-3 py-2"
        />
        <button
          disabled={sending}
          className="w-full rounded-xl px-4 py-2 border bg-black text-white disabled:opacity-60"
        >
          {sending ? "Enviando..." : "Enviar Magic Link"}
        </button>
      </form>

      {msg && <p className="text-green-600 mt-3">{msg}</p>}
      {err && <p className="text-red-600 mt-3">{err}</p>}
    </div>
  );
}
