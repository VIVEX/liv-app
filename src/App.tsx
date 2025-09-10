// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import supabase from "./lib/supabaseClient";

// ---------- Error Boundary para não dar tela branca ----------
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("App crash:", error);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "Inter, system-ui, sans-serif" }}>
          <h1>Algo deu errado 😬</h1>
          <p>
            {this.state.error.message ||
              "Erro inesperado. Veja o Console do navegador para detalhes."}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------- Tipos ----------
type Post = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string | null;
  created_at: string;
};

type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

// ---------- App raiz: decide "login" vs "app" sem alterar ordem de Hooks ----------
export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}

// Mantemos os Hooks aqui (sempre na mesma ordem).
function AppShell() {
  const [session, setSession] = useState<Awaited<
    ReturnType<typeof supabase.auth.getSession>
  >["data"]["session"] | null>(null);
  const [tab, setTab] = useState<"home" | "search" | "new" | "reels" | "profile">("home");

  // Pega sessão uma vez e escuta mudanças
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
    });
    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, []);

  // Se não logado, renderiza a tela de login (nenhum outro hook condicional aqui)
  if (!session) {
    return <Login />;
  }

  // Logado: render normal
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="font-bold">LIV</div>
          <button
            className="text-sm text-neutral-600 hover:text-black"
            onClick={async () => {
              await supabase.auth.signOut();
              location.reload();
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        {tab === "home" && <HomeFeed />}
        {tab === "search" && <SearchPlaceholder />}
        {tab === "new" && <NewPost />}
        {tab === "reels" && <ReelsPlaceholder />}
        {tab === "profile" && <ProfileView />}
      </main>

      <nav className="sticky bottom-0 bg-white/80 backdrop-blur border-t">
        <div className="max-w-3xl mx-auto h-14 px-6 flex items-center justify-between">
          <IconBtn active={tab === "home"} onClick={() => setTab("home")} title="Home">🏠</IconBtn>
          <IconBtn active={tab === "search"} onClick={() => setTab("search")} title="Buscar">🔍</IconBtn>
          <IconBtn active={tab === "new"} onClick={() => setTab("new")} title="Novo">➕</IconBtn>
          <IconBtn active={tab === "reels"} onClick={() => setTab("reels")} title="Reels">🎞️</IconBtn>
          <IconBtn active={tab === "profile"} onClick={() => setTab("profile")} title="Perfil">👤</IconBtn>
        </div>
      </nav>
    </div>
  );
}

// ---------- Componentes de tela (cada um tem seus próprios Hooks no topo) ----------
function Login() {
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="rounded-2xl border p-8 w-full max-w-sm bg-white">
        <h1 className="text-2xl font-bold text-center mb-2">LIV</h1>
        <p className="text-center text-neutral-600 mb-6">
          Compartilhe sua vida saudável
        </p>
        <button
          className="w-full rounded-lg bg-black text-white py-3"
          onClick={() => supabase.auth.signInWithOAuth({ provider: "google" })}
        >
          Entrar com Google
        </button>
      </div>
    </div>
  );
}

function HomeFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      // Exemplo simples: pega posts recentes (você pode filtrar por quem eu sigo depois)
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!mounted) return;
      if (error) console.error(error);
      setPosts((data as Post[]) || []);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <p className="text-center text-neutral-500">Carregando…</p>;
  if (!posts.length) return <p className="text-center text-neutral-500">Sem posts por enquanto.</p>;

  return (
    <div className="grid grid-cols-1 gap-4">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  );
}

function ProfileView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [myPosts, setMyPosts] = useState<Post[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user.id;
      if (!userId) return;

      const [{ data: prof }, { data: posts }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase
          .from("posts")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ]);

      if (!mounted) return;
      setProfile(prof as Profile);
      setMyPosts((posts as Post[]) || []);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!profile) return <p>Carregando…</p>;

  return (
    <section>
      <div className="flex items-center gap-4 mb-6">
        <Avatar url={profile.avatar_url} />
        <div>
          <h2 className="text-xl font-semibold">{profile.full_name || "Sem nome"}</h2>
          <p className="text-neutral-500">@{profile.username || "sem-usuario"}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {myPosts.map((p) => (
          <MediaThumb key={p.id} post={p} />
        ))}
      </div>
    </section>
  );
}

function NewPost() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handlePick() {
    // abre o seletor de arquivo nativo
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.onchange = () => {
      const f = input.files?.[0] || null;
      setFile(f);
    };
    input.click();
  }

  async function handlePublish() {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "dat";
      const isVideo = ["mp4", "mov", "webm"].includes(ext);
      const mediaType: "image" | "video" = isVideo ? "video" : "image";

      // Upload para storage
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user.id!;
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      const media_url = pub.publicUrl;

      // Insere post
      const { error: insErr } = await supabase.from("posts").insert({
        user_id: userId,
        media_url,
        media_type: mediaType,
        caption: null,
      });
      if (insErr) throw insErr;

      alert("Publicado!");
      setFile(null);
    } catch (e: any) {
      console.error(e);
      alert("Falha ao publicar.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="grid gap-4">
      {!file ? (
        <button className="rounded-xl border px-4 py-8" onClick={handlePick}>
          Selecionar foto/vídeo
        </button>
      ) : (
        <div className="rounded-xl border p-4 grid gap-3">
          <p className="text-sm text-neutral-600">{file.name}</p>
          <div className="flex gap-2">
            <button
              className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-50"
              disabled={uploading}
              onClick={handlePublish}
            >
              {uploading ? "Publicando…" : "Publicar"}
            </button>
            <button
              className="rounded-lg border px-4 py-2"
              disabled={uploading}
              onClick={() => setFile(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- UI helpers ----------
function IconBtn({
  children,
  active,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      aria-label={title}
      title={title}
      onClick={onClick}
      className={`text-2xl ${active ? "opacity-100" : "opacity-60"} hover:opacity-100`}
    >
      {children}
    </button>
  );
}

function Avatar({ url }: { url: string | null }) {
  const src = url || "https://placehold.co/80x80?text=AN";
  return (
    <img
      src={src}
      alt="avatar"
      className="h-16 w-16 rounded-full object-cover border"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).src = "https://placehold.co/80x80?text=AN";
      }}
    />
  );
}

function MediaThumb({ post }: { post: Post }) {
  if (post.media_type === "video") {
    return (
      <video
        src={post.media_url}
        className="w-full aspect-square object-cover rounded-lg"
        muted
        playsInline
        onError={(e) => {
          console.warn("Falha ao carregar vídeo", post.media_url);
        }}
      />
    );
  }
  return (
    <img
      src={post.media_url}
      alt=""
      className="w-full aspect-square object-cover rounded-lg"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).src = "https://placehold.co/300x300?text=erro";
      }}
    />
  );
}

function PostCard({ post }: { post: Post }) {
  return (
    <article className="rounded-2xl border overflow-hidden bg-white">
      <MediaThumb post={post} />
      {/* aqui depois você coloca curtir/comentar */}
      <div className="p-3 text-sm text-neutral-600">
        {post.caption || ""}
      </div>
    </article>
  );
}

function SearchPlaceholder() {
  return <p className="text-neutral-500">Busca (em breve)</p>;
}
function ReelsPlaceholder() {
  return <p className="text-neutral-500">Reels (em breve)</p>;
}
