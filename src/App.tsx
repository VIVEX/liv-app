
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Post = {
  id: string;
  user_id: string;
  caption: string | null;
  media_url: string | null;
  created_at: string;
  profiles?: { full_name: string | null } | null;
};

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [emailForMagicLink, setEmailForMagicLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Ler usuário atual e carregar posts
  useEffect(() => {
    const init = async () => {
      // usuário atual
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user ?? null;
      setCurrentUserEmail(user?.email ?? null);

      // carregar posts
      await loadPosts();
    };
    init();

    // Atualizar quando mudar sessão
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async () => {
      const { data: userData } = await supabase.auth.getUser();
      setCurrentUserEmail(userData.user?.email ?? null);
      await loadPosts();
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          user_id,
          caption,
          media_url,
          created_at,
          profiles:profiles ( full_name )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setPosts(data || []);
      console.debug('[DEBUG] posts:', data);
    } catch (err) {
      console.debug('[DEBUG] load posts error:', err);
      alert('Erro ao carregar posts. Veja o console.');
    }
  };

  const createPost = async () => {
    console.debug('[DEBUG] createPost start');
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      console.debug('[DEBUG] current user:', user);

      if (!user) {
        alert('Faça login para postar.');
        return;
      }

      // garante que existe profile (full_name) para este usuário
      // (caso o trigger não tenha criado)
      await supabase
        .from('profiles')
        .upsert({ id: user.id, full_name: user.user_metadata?.full_name || 'Usuário' });

      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        caption: caption || null,
        media_url: mediaUrl || null,
      });

      if (error) throw error;

      setCaption('');
      setMediaUrl('');
      await loadPosts();
    } catch (err: any) {
      alert(err?.message ?? 'Erro ao criar post.');
    } finally {
      setLoading(false);
    }
  };

  // Login com Google (recomendado)
  const signInWithGoogle = async () => {
    const redirectTo = window.location.origin; // volta pro app após login
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) alert(error.message);
  };

  // Magic Link por e-mail (alternativa rápida)
  const signInWithEmail = async () => {
    if (!emailForMagicLink) {
      alert('Digite um e-mail.');
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: emailForMagicLink,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) alert(error.message);
    else alert('Enviamos um link de login para seu e-mail ✔️');
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setCurrentUserEmail(null);
    await loadPosts();
  };

  return (
    <main className="max-w-xl mx-auto p-4 space-y-6">
      {/* Barra de login/logout */}
      <section className="space-y-3">
        <div className="text-sm">
          {currentUserEmail ? (
            <span>Logado como <strong>{currentUserEmail}</strong></span>
          ) : (
            <span>Não logado</span>
          )}
        </div>

        {!currentUserEmail ? (
          <div className="flex flex-col gap-2">
            <button className="border rounded px-4 py-2" onClick={signInWithGoogle}>
              Entrar com Google
            </button>

            <div className="flex gap-2">
              <input
                className="w-full border rounded p-2"
                placeholder="Seu e-mail (magic link)"
                value={emailForMagicLink}
                onChange={(e) => setEmailForMagicLink(e.target.value)}
              />
              <button className="border rounded px-4 py-2" onClick={signInWithEmail}>
                Entrar por e-mail
              </button>
            </div>
          </div>
        ) : (
          <button className="border rounded px-4 py-2" onClick={signOut}>
            Sair
          </button>
        )}
      </section>

      {/* Form de novo post */}
      <section className="space-y-2">
        <input
          className="w-full border rounded p-2"
          placeholder="Legenda"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
        <input
          className="w-full border rounded p-2"
          placeholder="URL da imagem (opcional)"
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.target.value)}
        />
        <button
          className="border rounded px-4 py-2"
          onClick={createPost}
          disabled={loading}
        >
          {loading ? 'Postando…' : 'Postar'}
        </button>
      </section>

      {/* Lista de posts */}
      <section className="space-y-4">
        {posts.map((p) => (
          <article key={p.id} className="border rounded p-3">
            <div className="text-xs opacity-70">
              <strong>{p.profiles?.full_name ?? 'Usuário'}</strong>
              <br />
              {new Date(p.created_at).toLocaleString('pt-BR')}
            </div>

            {p.media_url && (
              <img src={p.media_url} alt="" className="mt-2 rounded" />
            )}

            {p.caption && <p className="mt-2">{p.caption}</p>}
          </article>
        ))}
      </section>
    </main>
  );
}
Observações importantes:

Seu supabaseClient.ts já deve estar assim (com Vite) e persistSession: true:

ts
Copiar código
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true },
});
