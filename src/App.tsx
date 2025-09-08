// src/App.tsx
import { useEffect, useState } from 'react';
import supabase from './lib/supabaseClient';

type Post = {
  id: string;
  user_id: string;
  caption: string | null;
  media_url: string | null;
  created_at: string;
  profiles?: { full_name: string | null } | null;
};

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  // --- Auth helpers ----------------------------------------------------------
  async function refreshUser() {
    const { data } = await supabase.auth.getUser();
    const user = data.user ?? null;
    console.debug('[DEBUG] user:', user);
    setCurrentEmail(user?.email ?? null);
  }

  async function loginWithGoogle() {
    try {
      // Redireciona de volta para o seu app após o login
      const redirectTo = window.location.origin;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      console.debug('[DEBUG] signInWithOAuth data:', data);
      if (error) {
        alert(error.message);
      }
    } catch (e: any) {
      alert(e.message ?? 'Erro ao iniciar login com Google');
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    await refreshUser();
  }

  // --- Data helpers ----------------------------------------------------------
  async function loadPosts() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('posts')
        .select(
          `
          id,
          user_id,
          caption,
          media_url,
          created_at,
          profiles:profiles!inner ( full_name )
        `
        )
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.debug('[DEBUG] load posts error:', error);
        throw error;
      }
      console.debug('[DEBUG] posts loaded:', data);
      setPosts((data ?? []) as Post[]);
    } catch (e: any) {
      alert(e.message ?? 'Erro ao carregar posts');
    } finally {
      setLoading(false);
    }
  }

  async function createPost() {
    console.debug('[DEBUG] createPost start');
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    console.debug('[DEBUG] current user:', user);

    if (!user) {
      alert('Faça login para postar.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        caption: caption.trim() || null,
        media_url: mediaUrl.trim() || null,
      });

      if (error) {
        throw error;
      }

      setCaption('');
      setMediaUrl('');
      await loadPosts(); // atualiza a lista sem recarregar a página
    } catch (e: any) {
      alert(e.message ?? 'Erro ao criar post');
    } finally {
      setLoading(false);
    }
  }

  // --- Effects ---------------------------------------------------------------
  useEffect(() => {
    refreshUser();
    loadPosts();

    // Se o estado de auth mudar (login/logout), atualiza UI
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refreshUser();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- UI --------------------------------------------------------------------
  return (
    <main className="max-w-xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">LIV</h1>

        <div className="flex items-center gap-2">
          {currentEmail ? (
            <>
              <span className="text-sm opacity-70 hidden sm:inline">
                {currentEmail}
              </span>
              <button
                onClick={logout}
                className="border rounded px-3 py-1 text-sm"
              >
                Sair
              </button>
            </>
          ) : (
            <button
              onClick={loginWithGoogle}
              className="border rounded px-3 py-1 text-sm"
            >
              Login com Google
            </button>
          )}
        </div>
      </header>

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
          onClick={createPost}
          disabled={loading}
          className="border rounded px-4 py-2"
        >
          {loading ? 'Postando…' : 'Postar'}
        </button>
      </section>

      <section className="space-y-4">
        {loading && posts.length === 0 && (
          <p className="text-sm opacity-70">Carregando…</p>
        )}

        {posts.map((p) => (
          <article key={p.id} className="border rounded p-3">
            <div className="text-xs opacity-70">
              <strong>{p.profiles?.full_name ?? 'Usuário'}</strong>
              <br />
              {new Date(p.created_at).toLocaleString('pt-BR')}
            </div>

            {p.media_url && (
              <img
                src={p.media_url}
                alt=""
                className="mt-2 rounded"
                loading="lazy"
              />
            )}

            {p.caption && <p className="mt-2">{p.caption}</p>}
          </article>
        ))}
      </section>
    </main>
  );
}
