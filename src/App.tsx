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
  const [userId, setUserId] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // helpers
  const isImage = (url: string) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url.split('?')[0]);
  const isVideo = (url: string) => /\.(mp4|webm|ogg|mov|m4v)$/i.test(url.split('?')[0]);

  // auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setUserId(s?.user?.id ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // load posts
  const loadPosts = async () => {
    const { data, error } = await supabase
      .from('posts')
      .select(
        'id,user_id,caption,media_url,created_at,profiles:profiles!posts_user_id_fkey(full_name)'
      )
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error) setPosts((data as unknown as Post[]) ?? []);
  };
  useEffect(() => { loadPosts(); }, []);

  // login/logout
  const signInGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) alert(error.message);
  };
  const logout = () => supabase.auth.signOut();

  // file input
  const onPickFile = (f: File | null) => {
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  // upload to storage
  const uploadToMediaBucket = async (uid: string, f: File) => {
    const path = `${uid}/${Date.now()}_${f.name}`;
    const { error } = await supabase.storage.from('media').upload(path, f, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('media').getPublicUrl(path);
    return data.publicUrl;
  };

  // create post
  const createPost = async () => {
    try {
      setLoading(true);
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return alert('Faça login para postar.');

      let media_url: string | null = null;
      if (file) media_url = await uploadToMediaBucket(user.id, file);

      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        caption: caption || null,
        media_url,
      });
      if (error) throw error;

      setCaption('');
      setFile(null);
      setPreviewUrl(null);
      await loadPosts();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? 'Erro ao postar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-xl mx-auto p-4 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <h1 className="text-2xl tracking-tight font-extrabold">LIV APP</h1>
        {userId ? (
          <button
            onClick={logout}
            className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-xl shadow-sm transition"
          >
            Logout
          </button>
        ) : (
          <button
            onClick={signInGoogle}
            className="bg-black hover:bg-gray-900 text-white px-4 py-2 rounded-xl shadow-sm transition"
          >
            Entrar com Google
          </button>
        )}
      </header>

      {/* Card do formulário */}
      <section className="rounded-2xl border bg-white/60 backdrop-blur p-4 shadow-sm space-y-3">
        <input
          className="w-full border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Escreva uma legenda…"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />

        {/* Botão de mídia + input escondido */}
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 cursor-pointer bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl border transition">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5v14m7-7H5"/></svg>
            <span>Adicionar mídia</span>
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {file && (
            <span className="text-sm text-gray-600 truncate">
              {file.name}
            </span>
          )}
        </div>

        {/* Preview */}
        {(previewUrl) && (
          <div className="rounded-xl overflow-hidden border">
            {(() => {
              const url = previewUrl!;
              if (isImage(url)) return <img src={url} alt="preview" className="w-full" />;
              if (isVideo(url)) return <video src={url} controls className="w-full" />;
              return null;
            })()}
          </div>
        )}

        <div className="pt-2">
          <button
            onClick={createPost}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded-xl shadow-sm transition"
          >
            {loading ? 'Postando…' : 'Postar'}
          </button>
        </div>
      </section>

      {/* Lista de posts */}
      <section className="space-y-4">
        {posts.map((p) => (
          <article key={p.id} className="border rounded-2xl p-3 shadow-sm bg-white/70 backdrop-blur">
            <div className="text-xs text-gray-600 mb-2">
              <strong>{p.profiles?.full_name ?? 'Usuário'}</strong> •{' '}
              {new Date(p.created_at).toLocaleString('pt-BR')}
            </div>

            {p.media_url && (
              <div className="rounded-xl overflow-hidden mb-2">
                {isImage(p.media_url) && <img src={p.media_url} alt="" className="w-full" />}
                {isVideo(p.media_url) && <video src={p.media_url} controls className="w-full" />}
              </div>
            )}

            {p.caption && <p className="text-[15px] leading-relaxed">{p.caption}</p>}
          </article>
        ))}
        {posts.length === 0 && <p className="text-sm text-gray-500">Nenhum post ainda.</p>}
      </section>
    </main>
  );
}
