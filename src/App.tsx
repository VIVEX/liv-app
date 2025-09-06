'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Post = {
  id: string;
  user_id: string;
  caption: string | null;
  media_url: string | null;
  created_at: string;
  profiles?: { full_name: string | null }; // <= aqui
};

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');

  // Buscar posts
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('id,user_id,caption,media_url,created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) setPosts(data);
    };
    load();
  }, []);

  // Criar novo post
  const createPost = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      alert('Faça login para postar.');
      return;
    }

   const { data, error } = await supabase
  .from('posts')
  .select(`
    id, user_id, caption, media_url, created_at,
    profiles!inner ( full_name )
  `)
  .order('created_at', { ascending: false })
  .limit(20);
    
    if (error) {
      alert(error.message);
    } else {
      setCaption('');
      setMediaUrl('');
      window.location.reload(); // recarrega para ver o novo post
    }
  };

  return (
    <main className="max-w-xl mx-auto p-4 space-y-6">
     <section className="space-y-4">
  {posts.map((p) => (
    <article key={p.id} className="border rounded p-3">
      <div className="text-xs opacity-70">
        <strong>{p.profiles?.full_name ?? 'Usuário'}</strong>
  <br />
        {/* nome do autor */}
        {p.profiles?.full_name ?? 'Usuário'} •{' '}
        {/* data formatada */}
        {new Date(p.created_at).toLocaleString('pt-BR')}
      </div>

      {/* imagem opcional */}
      {p.media_url && (
        <img src={p.media_url} alt="" className="mt-2 rounded" />
      )}

      {/* legenda opcional */}
      {p.caption && <p className="mt-2">{p.caption}</p>}
    </article>
  ))}
</section>
  );
}

