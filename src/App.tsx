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
  const [externalUrl, setExternalUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // helpers
  const isImage = (url: string) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url.split('?')[0]);
  const isVideo = (url: string) => /\.(mp4|webm|ogg|mov|m4v)$/i.test(url.split('?')[0]);

  // auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user?.id ?? null));
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
    setExternalUrl('');
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
      else if (externalUrl.trim()) media_url = externalUrl.trim();

      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        caption: caption || null,
        media_url,
      });
      if (error) throw error;

      setCaption('');
      setExternalUrl('');
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
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">LIV APP</h1>
        {userId ? (
          <button onClick={logout} className="bg-red-500 text-white px-4 py-2 rounded">
            Logout
          </button>
        ) : (
          <button onClick={signInGoogle} className="bg-black text-white px-4 py-2 rounded">
            Entrar com Google
          </button>
        )}
      </header>

      {/* FORM */}
      <section className="space-y-3">
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="Legenda"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium">Arquivo (imagem ou vídeo)</label>
          <input
            type="file"
            accept="image/*,video/*"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            OU cole uma URL externa (opcional)
          </label>
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="https://…"
            value={externalUrl}
            onChange={(e) => {
              setExternalUrl(e.target.value);
              if (e.target.value) { setFile(null); setPreviewUrl(null); }
            }}
          />
        </div>

        {(previewUrl || externalUrl) && (
          <div className="mt-2">
            {(() => {
              const url = externalUrl || previewUrl!;
              if (isImage(url)) return <img src={url} alt="preview" className="rounded max-h-72" />;
              if (isVideo(url)) return <video src={url} controls className="rounded w-full max-h-80" />;
              return <p className="text-sm text-gray-500">Prévia indisponível para este formato.</p>;
            })()}
          </div>
        )}

        <button
          onClick={createPost}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
        >
          {loading ? 'Postando…' : 'Postar'}
        </button>
      </section>

      {/* LISTA */}
      <section className="space-y-4">
        {posts.map((p) => (
          <article key={p.id} className="border rounded p-3 space-y-2">
            <div className="text-xs opacity-70">
              <strong>{p.profiles?.full_name ?? 'Usuário'}</strong> •{' '}
              {new Date(p.created_at).toLocaleString('pt-BR')}
            </div>

            {p.media_url && (
              <>
                {isImage(p.media_url) && <img src={p.media_url} alt="" className="rounded" />}
                {isVideo(p.media_url) && <video src={p.media_url} controls className="rounded w-full" />}
                {!isImage(p.media_url) && !isVideo(p.media_url) && (
                  <a className="text-blue-600 underline break-all" href={p.media_url} target="_blank" rel="noreferrer">
                    Abrir mídia
                  </a>
                )}
              </>
            )}

            {p.caption && <p>{p.caption}</p>}
          </article>
        ))}
        {posts.length === 0 && <p className="text-sm text-gray-500">Nenhum post ainda.</p>}
      </section>
    </main>
  );
}
