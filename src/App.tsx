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
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState(''); // opcional: colar URL já hospedada
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [creating, setCreating] = useState(false);

  // --------- helpers ----------
  const isImage = (url: string) =>
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url.split('?')[0] || '');
  const isVideo = (url: string) =>
    /\.(mp4|webm|ogg|mov|m4v)$/i.test(url.split('?')[0] || '');

  // --------- sessão ----------
  useEffect(() => {
    // pega usuário atual
    supabase.auth.getUser().then(({ data }) => {
      setSessionUserId(data.user?.id ?? null);
    });
    // escuta mudanças de auth
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSessionUserId(sess?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // --------- carregar posts ----------
  const loadPosts = async () => {
    setLoadingList(true);
    const { data, error } = await supabase
      .from('posts')
      .select(
        'id,user_id,caption,media_url,created_at,profiles:profiles!posts_user_id_fkey(full_name)'
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[load posts] error:', error);
      alert('Erro ao carregar posts');
    } else {
      setPosts(data as unknown as Post[]);
    }
    setLoadingList(false);
  };

  useEffect(() => {
    loadPosts();
  }, []);

  // --------- auth ----------
  const signInGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin, // volta para o app
      },
    });
    if (error) alert(error.message);
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  // --------- upload ----------
  const handleFileChange = (f: File | null) => {
    setFile(f);
    setExternalUrl('');
    // preview local
    if (f) {
      const blobUrl = URL.createObjectURL(f);
      setUploadPreview(blobUrl);
    } else {
      setUploadPreview(null);
    }
  };

  const uploadToStorage = async (userId: string, f: File) => {
    const path = ⁠ ${userId}/${Date.now()}_${f.name} ⁠;
    const { error: upErr } = await supabase.storage.from('media').upload(path, f, {
      upsert: false,
      cacheControl: '3600',
    });
    if (upErr) throw upErr;

    // gerar URL pública
    const { data } = supabase.storage.from('media').getPublicUrl(path);
    return data.publicUrl;
  };

  // --------- criar post ----------
  const createPost = async () => {
    setCreating(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        alert('Faça login para postar.');
        setCreating(false);
        return;
      }

      let mediaUrl: string | null = null;

      if (file) {
        mediaUrl = await uploadToStorage(user.id, file);
      } else if (externalUrl.trim()) {
        mediaUrl = externalUrl.trim();
      }

      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        caption: caption || null,
        media_url: mediaUrl,
      });

      if (error) throw error;

      // limpar formulário e recarregar
      setCaption('');
      setExternalUrl('');
      setFile(null);
      setUploadPreview(null);
      await loadPosts();
    } catch (err: any) {
      console.error('[createPost] error:', err);
      alert(err?.message ?? 'Erro ao criar post');
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="max-w-xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">LIV APP</h1>

        {sessionUserId ? (
          <button
            onClick={logout}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
          >
            Logout
          </button>
        ) : (
          <button
            onClick={signInGoogle}
            className="bg-black hover:bg-gray-800 text-white px-4 py-2 rounded"
          >
            Entrar com Google
          </button>
        )}
      </header>

      {/* Formulário de post */}
      <section className="space-y-3">
        <input
          placeholder="Legenda"
          className="w-full border rounded px-3 py-2"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium">Arquivo (imagem ou vídeo)</label>
          <input
            type="file"
            accept="image/,video/"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            URL externa (opcional) — preenche em vez do arquivo
          </label>
          <input
            placeholder="https://..."
            className="w-full border rounded px-3 py-2"
            value={externalUrl}
            onChange={(e) => {
              setExternalUrl(e.target.value);
              if (e.target.value) {
                setFile(null);
                setUploadPreview(null);
              }
            }}
          />
        </div>

        {/* Preview */}
        {(uploadPreview || externalUrl) && (
          <div className="mt-2">
            {(() => {
              const url = externalUrl || uploadPreview!;
              if (isImage(url)) {
                return <img src={url} alt="preview" className="rounded max-h-72" />;
              }
              if (isVideo(url)) {
                return (
                  <video src={url} controls className="rounded w-full max-h-80" />
                );
              }
              return (
                <p className="text-sm text-gray-500">
                  Pré-visualização indisponível para este formato.
                </p>
              );
            })()}
          </div>
        )}

        <button
          onClick={createPost}
          disabled={creating}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-60"
        >
          {creating ? 'Postando…' : 'Postar'}
        </button>
      </section>

      {/* Lista de posts */}
      <section className="space-y-4">
        {loadingList && <p className="text-sm text-gray-500">Carregando…</p>}

        {posts.map((p) => (
          <article key={p.id} className="border rounded p-3 space-y-2">
            <div className="text-xs opacity-70">
              <strong>{p.profiles?.full_name ?? 'Usuário'}</strong> •{' '}
              {new Date(p.created_at).toLocaleString('pt-BR')}
            </div>

            {p.media_url && (
              <>
                {isImage(p.media_url) && (
                  <img src={p.media_url} alt="" className="mt-2 rounded" />
                )}
                {isVideo(p.media_url) && (
                  <video src={p.media_url} controls className="mt-2 rounded w-full" />
                )}
                {!isImage(p.media_url) && !isVideo(p.media_url) && (
                  <a
                    href={p.media_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline break-all"
                  >
                    Abrir mídia
                  </a>
                )}
              </>
            )}

            {p.caption && <p className="mt-2">{p.caption}</p>}
          </article>
        ))}

        {!loadingList && posts.length === 0 && (
          <p className="text-sm text-gray-500">Nenhum post ainda.</p>
        )}
      </section>
    </main>
  );
}
