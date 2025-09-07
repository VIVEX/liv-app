'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Post = {
  id: string;
  user_id: string;
  caption: string | null;
  media_url: string | null;
  created_at: string;
  profiles?: { full_name: string | null }; // vem do join com profiles
};

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // ---- Auth: mostrar email/logado e permitir login/logout
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? null);
    })();

    // atualiza estado quando a sessão mudar
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserEmail(null);
  };

  // ---- Carregar posts
  const load = async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(
          `
          id,
          user_id,
          caption,
          media_url,
          created_at,
          profiles!inner ( full_name )
        `
        )
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setPosts(data as Post[]);
      console.debug('[DEBUG] loaded posts:', data);
    } catch (err) {
      console.error('[DEBUG] load posts error:', err);
      alert('Erro ao carregar posts.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ---- Criar novo post
  const createPost = async () => {
    console.debug('[DEBUG] createPost start');
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      alert('Faça login para postar.');
      return;
    }

    try {
      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        caption: caption || null,
        media_url: mediaUrl || null,
      });

      if (error) throw error;

      setCaption('');
      setMediaUrl('');
      await load(); // recarrega lista sem refresh da página
    } catch (err: any) {
      console.error('[DEBUG] createPost error:', err);
      alert(err.message ?? 'Erro ao criar post.');
    }
  };

  return (
    <main className="max-w-xl mx-auto p-4 space-y-6">
      {/* Header com login/logout */}
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">LIV</h1>
        <div className="text-sm">
          {userEmail ? (
            <div className="flex items-center gap-2">
              <span className="opacity-70">{userEmail}</span>
              <button className="border rounded px-3 py-1" onClick={handleLogout}>
                Sair
              </button>
            </div>
          ) : (
            <button className="border rounded px-3 py-1" onClick={handleLogin}>
              Entrar com Google
            </button>
          )}
        </div>
      </header>

      {/* Formulário */}
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

        <button className="border rounded px-4 py-2" onClick={createPost}>
          Postar
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

            {p.media_url && <img src={p.media_url} alt="" className="mt-2 rounded" />}

            {p.caption && <p className="mt-2">{p.caption}</p>}
          </article>
        ))}
      </section>
    </main>
  );
}
