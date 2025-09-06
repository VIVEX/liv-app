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

  // Mostrar status do usuário (debug)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? null);
      console.log('[DEBUG] user:', data.user);
    })();
  }, []);

  // Buscar posts
  useEffect(() => {
    (async () => {
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

    if (error) console.error('[DEBUG] load posts error:', error);
      if (!error && data) setPosts(data as Post[]);
    })();
  }, []);

  // Criar novo post
  const createPost = async () => {
    console.log('[DEBUG] createPost start');
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    console.log('[DEBUG] current user:', user);

    if (!user) {
      window.alert('Faça login para postar.');
      return;
    }

    const { error } = await supabase.from('posts').insert({
      user_id: user.id,
      caption: caption || null,
      media_url: mediaUrl || null,
    });

    if (error) {
      console.error('[DEBUG] insert error:', error);
      window.alert(error.message);
    } else {
      setCaption('');
      setMediaUrl('');
      window.location.reload();
    }
  };

  return (
    <main className="max-w-xl mx-auto p-4 space-y-6">
      {/* Status do usuário (debug) */}
      <div className="text-xs opacity-70">
        {userEmail ? `Logado como: ${userEmail}` : 'Não logado'}
      </div>

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
