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
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');

  // === Sessão / auth listener ===
  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    };
    loadSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // === Buscar posts (requer login com suas políticas atuais) ===
  const loadPosts = async () => {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        id,
        user_id,
        caption,
        media_url,
        created_at,
        profiles:profiles!posts_user_id_fkey ( full_name )
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.debug('[DEBUG] load posts error:', error);
      return;
    }
    setPosts(data ?? []);
  };

  useEffect(() => {
    // só tenta carregar se estiver logado (com suas políticas)
    if (userId) loadPosts();
  }, [userId]);

  // === Login via magic link (OTP) ===
  const login = async () => {
    if (!email) {
      alert('Informe seu email');
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) alert(error.message);
    else alert('Enviamos um link/OTP para seu email. Verifique sua caixa de entrada.');
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setPosts([]);
  };

  // === Criar Post ===
  const createPost = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      alert('Faça login para postar.');
      return;
    }
    const { error } = await supabase.from('posts').insert({
      user_id: user.id,
      caption: caption || null,
      media_url: mediaUrl || null,
    });
    if (error) alert(error.message);
    else {
      setCaption('');
      setMediaUrl('');
      loadPosts(); // recarrega feed
    }
  };

  return (
    <main className="max-w-xl mx-auto p-4 space-y-6">
      {/* Header Auth */}
      <section className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">LIV Feed</h1>
        {userId ? (
          <button className="border rounded px-3 py-1" onClick={logout}>
            Sair
          </button>
        ) : null}
      </section>

      {/* Login (se não logado) */}
      {!userId && (
        <section className="space-y-2 border rounded p-3">
          <p className="text-sm">Entre para ver e postar no feed</p>
          <input
            className="w-full border rounded p-2"
            type="email"
            placeholder="Seu email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="border rounded px-4 py-2" onClick={login}>
            Entrar com email
          </button>
        </section>
      )}

      {/* Form de novo post (somente logado) */}
      {userId && (
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
      )}

      {/* Feed (mostra após login com suas políticas atuais) */}
      {userId && (
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
      )}
    </main>
  );
}
