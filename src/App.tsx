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
  const [email, setEmail] = useState(''); // para magic link
  const [userId, setUserId] = useState<string | null>(null);

  // Carregar posts e checar usuário
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
          profiles:profiles!posts_user_id_fkey ( full_name )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) setPosts(data);
    };

    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
      console.debug('[DEBUG] user:', data.user?.id ?? null);
    };

    load();
    checkUser();

    // Atualiza estado em mudanças de auth
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Login com Magic Link
  const loginWithMagicLink = async () => {
    if (!email) {
      alert('Digite seu e-mail para receber o link.');
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin, // volta para seu app
      },
    });
    if (error) alert(error.message);
    else alert('Enviamos um link de login para seu e-mail.');
  };

  // (Opcional) Login com Google – só vai funcionar após habilitar o provider
  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) alert(error.message);
  };

  // Logout
  const logout = async () => {
    await supabase.auth.signOut();
    setUserId(null);
    alert('Você saiu.');
  };

  // Criar novo post
  const createPost = async () => {
    console.debug('[DEBUG] createPost start');
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    console.debug('[DEBUG] current user:', user?.id ?? null);

    if (!user) {
      alert('Faça login para postar.');
      return;
    }

    const { error } = await supabase.from('posts').insert({
      user_id: user.id,
      caption: caption || null,
      media_url: mediaUrl || null,
    });

    if (error) {
      alert(error.message);
    } else {
      setCaption('');
      setMediaUrl('');
      window.location.reload(); // simples para ver o novo post
    }
  };

  return (
    <main className="max-w-xl mx-auto p-4 space-y-6">
      {/* Barra de login rápido */}
      <section className="space-y-2 border rounded p-3">
        <div className="text-sm opacity-70">
          {userId ? `Logado: ${userId}` : 'Não logado'}
        </div>

        <div className="flex gap-2 items-center">
          <input
            className="w-full border rounded p-2"
            placeholder="Seu e-mail (Magic Link)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="border rounded px-3 py-2" onClick={loginWithMagicLink}>
            Entrar por e-mail
          </button>
        </div>

        <div className="flex gap-2">
          <button className="border rounded px-3 py-2" onClick={loginWithGoogle}>
            Entrar com Google
          </button>
          <button className="border rounded px-3 py-2" onClick={logout}>
            Sair
          </button>
        </div>
      </section>

      {/* Form de post */}
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
              <strong>{p.profiles?.full_name ?? 'Usuário'}</strong> ·{' '}
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

