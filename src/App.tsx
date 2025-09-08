'use client';

import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

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
  const [user, setUser] = useState<any>(null);

  // Verifica se já existe login
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  // Buscar posts
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          user_id,
          caption,
          media_url,
          created_at,
          profiles ( full_name )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) setPosts(data);
    };
    load();
  }, []);

  // Criar novo post
  const createPost = async () => {
    console.debug('[DEBUG] createPost start');
    const { data: { user } } = await supabase.auth.getUser();
    console.debug('[DEBUG] current user:', user);

    if (!user) {
      alert('Faça login para postar.');
      return;
    }

    const { error } = await supabase.from('posts').insert([
      {
        user_id: user.id,
        caption,
        media_url: mediaUrl,
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      setCaption('');
      setMediaUrl('');
      window.location.reload(); // recarregar para ver o novo post
    }
  };

  // Login com Google
  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  };

  // Logout
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <main className="max-w-xl mx-auto p-4 space-y-6">
      <h1 className="text-xl font-bold">LIV APP</h1>

      {/* Botões de login/logout */}
      {!user ? (
        <button
          onClick={loginWithGoogle}
          className="border px-4 py-2 rounded bg-green-500 text-white"
        >
          Login com Google
        </button>
      ) : (
        <button
          onClick={logout}
          className="border px-4 py-2 rounded bg-red-500 text-white"
        >
          Logout
        </button>
      )}

      {/* Formulário de novo post */}
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
          className="border rounded px-4 py-2 bg-blue-500 text-white"
          onClick={createPost}
        >
          Postar
        </button>
      </section>

      {/* Lista de posts */}
      <section className="space-y-4">
        {posts.map((p) => (
          <article key={p.id} className="border rounded p-3">
            <div className="text-xs opacity-70">
              <strong>{p.profiles?.full_name || 'Usuário'}</strong>
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
