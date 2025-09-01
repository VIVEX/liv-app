import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function signInWithMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setMsg(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });

    setSending(false);
    if (error) setMsg(error.message);
    else setMsg("Enviamos um link de login para seu e-mail. 🎉");
  }

  return (
    <div className="max-w-sm mx-auto p-6 rounded-2xl border">
      <h2 className="text-xl font-semibold mb-4">Entrar</h2>
      <form onSubmit={signInWithMagicLink} className="space-y-3">
        <input
          type="email"
          required
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border px-3 py-2"
        />
        <button
          type="submit"
          disabled={sending}
          className="w-full rounded-xl border px-3 py-2"
        >
          {sending ? "Enviando..." : "Entrar com link mágico"}
        </button>
      </form>
      {msg && <p className="text-sm mt-3">{msg}</p>}
    </div>
  );
}
