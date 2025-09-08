'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Post = {
  id: string;
  user_id: string;
  caption: string | null;
  media_url: string | null;
  created_at: string;
  profiles?: { full_name: string | null };
};

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // ---- auth state + primeira carga
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email ?? null;
      setUserEmail(email);
      await loadPosts();
    };
    init();

    // atualiza estado quando loga/desloga
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ---- buscar posts (com nome do autor)
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
          profiles!inner ( full_name )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setPosts(data || []);
    } catch (err) {
      console.debug('[DEBUG] load posts error:', err);
      alert('Erro ao carregar posts.');
    }
  };

  // ---- criar post
  const createPost = async () => {
    console.debug('[DEBUG] createPost start');
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    console.debug('[DEBUG] current user:', user?.email ?? null);
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
      await loadPosts(); // recarrega lista sem refresh
    } catch (err: any) {
      alert(err.message ?? 'Erro ao criar post.');
    }
  };

  // ---- login/logout
  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin, // precisa estar na lista de Redirect URLs
      },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUserEmail(null);
  };

  return (
    <main className="max-w-xl mx-auto p-4 space-y-6">
      {/* topo / estado do usuário */}
      <header className="flex items-center justify-between">
        <div className="text-sm opacity-70">
          {userEmail ? (
            <>Logado: <strong>{userEmail}</strong></>
          ) : (
            <>Não logado</>
          )}
        </div>

        <div className="space-x-2">
          {!userEmail ? (
            <button
              className="border rounded px-3 py-1"
              onClick={signInWithGoogle}
            >
              Entrar com Google
            </button>
          ) : (
            <button
              className="border rounded px-3 py-1"
              onClick={signOut}
            >
              Sair
            </button>
          )}
        </div>
      </header>

      {/* form de post */}
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

      {/* feed */}
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
