'use client';

import { useEffect, useState, useMemo } from 'react';
import supabase from '@/lib/supabaseClient';

type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type Post = {
  id: string;
  user_id: string;
  caption: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  created_at: string;
  profiles?: { full_name: string | null } | null;
};

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const isLogged = useMemo(() => Boolean(userId), [userId]);

  // ===== Helpers =====
  async function fetchUserAndProfile() {
    const { data: userData } = await supabase.auth.getUser();
    const u = userData?.user ?? null;
    setUserId(u?.id ?? null);

    if (u) {
      // garante que existe um perfil com full_name/avatar
      const full_name =
        (u.user_metadata?.full_name as string | undefined) ??
        (u.user_metadata?.name as string | undefined) ??
        null;
      const avatar_url =
        (u.user_metadata?.avatar_url as string | undefined) ??
        (u.user_metadata?.picture as string | undefined) ??
        null;

      await supabase
        .from('profiles')
        .upsert({ id: u.id, full_name, avatar_url }, { onConflict: 'id' });

      const { data: p } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('id', u.id)
        .single();

      if (p) setProfile(p as Profile);
    } else {
      setProfile(null);
    }
  }

  async function loadPosts() {
    const { data, error } = await supabase
      .from('posts')
      .select(
        `
        id,
        user_id,
        caption,
        media_url,
        media_type,
        created_at,
        profiles:profiles!inner(full_name)
      `
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) setPosts(data as Post[]);
  }

  // ===== Efeitos =====
  useEffect(() => {
    fetchUserAndProfile();
    loadPosts();

    // atualiza ao logar/deslogar
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async () => {
      await fetchUserAndProfile();
      await loadPosts();
    });

    return () => subscription.unsubscribe();
  }, []);

  // ===== Auth =====
  async function loginWithGoogle() {
    // redireciona de volta para o seu site após login
    const redirectTo =
      typeof window !== 'undefined' ? window.location.origin : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) alert(error.message);
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  // ===== Upload para Storage + criar post =====
  async function createPost() {
    if (!isLogged) {
      alert('Faça login para postar.');
      return;
    }

    let media_url: string | null = null;
    let media_type: 'image' | 'video' | null = null;

    if (file) {
      const isVideo = file.type.startsWith('video');
      media_type = isVideo ? 'video' : 'image';

      // caminho: media/{userId}/{timestamp}-{filename}
      const path = ⁠ media/${userId}/${Date.now()}-${file.name} ⁠;

      // faz upload
      const { error: upErr } = await supabase.storage
        .from('media')
        .upload(path, file, { upsert: false });

      if (upErr) {
        alert(⁠ Erro no upload: ${upErr.message} ⁠);
        return;
      }

      // pega URL pública
      const { data: pub } = supabase.storage.from('media').getPublicUrl(path);
      media_url = pub.publicUrl;
    }

    const { error: insertErr } = await supabase.from('posts').insert({
      user_id: userId!,
      caption: caption || null,
      media_url,
      media_type,
    });

    if (insertErr) {
      alert(insertErr.message);
      return;
    }

    setCaption('');
    setFile(null);
    await loadPosts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ===== UI =====
  return (
    <main className="max-w-xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">LIV APP</h1>

        {isLogged ? (
          <div className="flex items-center gap-3">
            {profile?.avatar_url && (
              <img
                src={profile.avatar_url}
                alt="avatar"
                className="w-8 h-8 rounded-full object-cover"
              />
            )}
            <span className="text-sm opacity-80">
              {profile?.full_name ?? 'Usuário'}
            </span>
            <button
              onClick={logout}
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded"
            >
              Logout
            </button>
          </div>
        ) : (
          <button
            onClick={loginWithGoogle}
            className="bg-black text-white px-3 py-1 rounded hover:opacity-90"
          >
            Entrar com Google
          </button>
        )}
      </header>

      {/* Criar post */}
      <section className="space-y-3">
        <input
          className="w-full border rounded p-2"
          placeholder="Legenda"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />

        <label className="block border rounded p-3 cursor-pointer">
          <span className="text-sm opacity-70">
            Foto ou vídeo (arraste aqui ou clique)
          </span>
          <input
            type="file"
            accept="image/,video/"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {file && (
          <div className="text-sm opacity-80">
            Selecionado: <strong>{file.name}</strong>
          </div>
        )}

        <button
          onClick={createPost}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Postar
        </button>
      </section>

      {/* Feed */}
      <section className="space-y-4">
        {posts.map((p) => (
          <article key={p.id} className="border rounded p-3">
            <div className="text-xs opacity-70">
              <strong>{p.profiles?.full_name ?? 'Usuário'}</strong>
              <br />
              {new Date(p.created_at).toLocaleString('pt-BR')}
            </div>

            {/* mídia (imagem/vídeo) */}
            {p.media_url && p.media_type === 'image' && (
              <img src={p.media_url} alt="" className="mt-3 rounded" />
            )}

            {p.media_url && p.media_type === 'video' && (
              <video
                src={p.media_url}
                className="mt-3 rounded w-full"
                controls
                preload="metadata"
              />
            )}

            {/* legenda */}
            {p.caption && <p className="mt-2">{p.caption}</p>}
          </article>
        ))}
      </section>
    </main>
  );
}
