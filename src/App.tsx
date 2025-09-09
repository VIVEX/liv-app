
// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Home,
  Search,
  PlusSquare,
  Film,
  LogOut,
  Trash2,
} from "lucide-react";

// ----- Supabase client (usa suas variáveis do Vite) -----
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

if (!supabaseUrl || !supabaseAnon) {
  // Em dev mostra instrução no navegador. Em produção o build passa normalmente.
  // Só aparece na tela se rodar sem variáveis.
  throw new Error("Faltam VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY");
}

const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
});

// ----- Tipos -----
type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
};

type Post = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video" | null;
  caption: string | null;
  created_at: string;
  user?: { username?: string | null };
};

// Util: formar URL pública do Storage (bucket "media" público)
const publicMediaUrl = (path: string) =>
  `${supabaseUrl}/storage/v1/object/public/media/${path}`;

// Util: iniciais para avatar fake
const initials = (name?: string | null) =>
  (name || "?")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

// -------- Componentes UI básicos --------
const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }
> = ({ className = "", variant = "primary", ...props }) => {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition";
  const styles =
    variant === "primary"
      ? "bg-black text-white hover:bg-neutral-800 disabled:opacity-60"
      : "bg-transparent hover:bg-neutral-100";
  return <button className={`${base} ${styles} ${className}`} {...props} />;
};

const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = "",
  ...props
}) => (
  <div
    className={`rounded-2xl border border-neutral-200 bg-white ${className}`}
    {...props}
  />
);

// ------------- Auth -------------
const AuthView: React.FC = () => {
  const login = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <Card className="w-[360px] p-6 text-center shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight">LIV</h1>
        <p className="text-neutral-500 mt-2">Compartilhe sua vida saudável</p>
        <Button onClick={login} className="mt-6 w-full">
          Entrar com Google
        </Button>
      </Card>
    </div>
  );
};

// ------------- Feed -------------
const Feed: React.FC<{
  posts: Post[];
  me?: Profile | null;
  onDelete: (id: string) => void;
}> = ({ posts, me, onDelete }) => {
  if (posts.length === 0) {
    return (
      <div className="py-16 text-center text-neutral-500">
        Sem posts por enquanto.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {posts.map((p) => {
        const isMine = me?.id === p.user_id;
        const isVideo = p.media_type === "video" || /\.mp4|\.mov|\.webm$/i.test(p.media_url);
        return (
          <div key={p.id} className="relative group overflow-hidden rounded-2xl">
            {isVideo ? (
              <video
                controls
                className="w-full h-full object-cover aspect-square bg-black"
                src={p.media_url}
              />
            ) : (
              <img
                src={p.media_url}
                alt={p.caption || "post"}
                className="w-full h-full object-cover aspect-square"
                onError={(e) => {
                  // evita "quadro em branco": se a URL quebrar, some o item
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            {isMine && (
              <button
                title="Excluir post"
                onClick={() => onDelete(p.id)}
                className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs shadow"
              >
                <Trash2 size={14} />
                Excluir
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ------------- Nova Publicação -------------
const NewPostInline: React.FC<{
  me: Profile;
  onCreated: () => void;
}> = ({ me, onCreated }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = () => inputRef.current?.click();

  const handleFile = (f: File | null) => setFile(f);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);

  const publish = async () => {
    if (!file) return;
    setUploading(true);
    try {
      // caminho: userId/timestamp-nome.ext
      const safeName = file.name.replace(/\s+/g, "_");
      const path = `${me.id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, file, {
        upsert: false,
      });
      if (upErr) throw upErr;

      const url = publicMediaUrl(path);
      const media_type = /\.(mp4|mov|webm)$/i.test(file.name) ? "video" : "image";

      const { error: insErr } = await supabase.from("posts").insert({
        user_id: me.id,
        media_url: url,
        caption: null,
        media_type,
      });
      if (insErr) throw insErr;

      setFile(null);
      onCreated();
    } catch (e) {
      alert("Falha ao publicar. Tente de novo.");
      // console.error(e);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium">Nova publicação</div>
        <Button onClick={publish} disabled={!file || uploading}>
          {uploading ? "Publicando..." : "Publicar"}
        </Button>
      </div>

      <div
        onClick={openPicker}
        className="cursor-pointer rounded-xl border border-dashed border-neutral-300 p-6 text-center hover:bg-neutral-50"
      >
        {file ? (
          /\.(mp4|mov|webm)$/i.test(file.name) ? (
            <video className="mx-auto rounded-lg max-h-80" src={previewUrl} controls />
          ) : (
            <img
              src={previewUrl}
              alt="preview"
              className="mx-auto rounded-lg max-h-80 object-contain"
            />
          )
        ) : (
          <div className="text-neutral-600">Selecionar foto/vídeo</div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] || null)}
      />
    </Card>
  );
};

// ------------- Perfil -------------
const ProfileHeader: React.FC<{ me: Profile; onLogout: () => void }> = ({
  me,
  onLogout,
}) => {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        {me.avatar_url ? (
          <img
            src={me.avatar_url}
            className="w-14 h-14 rounded-full object-cover"
            alt="avatar"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-700 font-semibold">
            {initials(me.full_name || me.username)}
          </div>
        )}
        <div>
          <div className="font-semibold text-lg">{me.full_name || "Sem nome"}</div>
          <div className="text-neutral-500">@{me.username || "usuario"}</div>
        </div>
      </div>
      <Button variant="ghost" onClick={onLogout}>
        <LogOut className="mr-2" size={16} />
        Sair
      </Button>
    </div>
  );
};

// ------------- App -------------
const App: React.FC = () => {
  const [session, setSession] = useState<Awaited<
    ReturnType<typeof supabase.auth.getSession>
  >["data"]["session"] | null>(null);

  const [me, setMe] = useState<Profile | null>(null);
  const [tab, setTab] = useState<"home" | "search" | "create" | "reels" | "profile">(
    "home"
  );

  const [feed, setFeed] = useState<Post[]>([]);
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

  // Sessão
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Carrega perfil do usuário logado
  useEffect(() => {
    const loadMe = async () => {
      if (!session?.user) return setMe(null);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (!error && data) setMe(data as Profile);
      else {
        // cria perfil se não existir
        const usernameBase = (session.user.email || "user")
          .split("@")[0]
          .replace(/[^a-z0-9_]/gi, "")
          .toLowerCase();
        await supabase.from("profiles").insert({
          id: session.user.id,
          username: usernameBase,
          full_name: session.user.user_metadata?.name || usernameBase,
          avatar_url: session.user.user_metadata?.avatar_url || null,
          bio: null,
        });
        const { data: again } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (again) setMe(again as Profile);
      }
    };
    loadMe();
  }, [session]);

  // Carrega feed e meus posts
  const reloadFeed = async () => {
    setLoadingFeed(true);
    const { data } = await supabase
      .from("posts")
      .select("*, user:profiles(username)")
      .order("created_at", { ascending: false })
      .limit(60);
    setFeed((data as Post[]) || []);
    setLoadingFeed(false);
  };

  const reloadMine = async () => {
    if (!me) return;
    const { data } = await supabase
      .from("posts")
      .select("*")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false });
    setMyPosts((data as Post[]) || []);
  };

  useEffect(() => {
    if (session) reloadFeed();
  }, [session]);

  useEffect(() => {
    if (me) reloadMine();
  }, [me]);

  const deletePost = async (id: string) => {
    if (!confirm("Excluir este post?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (!error) {
      setFeed((f) => f.filter((p) => p.id !== id));
      setMyPosts((f) => f.filter((p) => p.id !== id));
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setTab("home");
  };

  if (!session) return <AuthView />;

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <div className="h-14 flex items-center justify-between px-4 border-b">
        <div className="font-semibold">LIV</div>
        <div className="text-sm text-neutral-500">
          {tab === "home"
            ? "Feed"
            : tab === "profile"
            ? "Perfil"
            : tab === "create"
            ? "Nova publicação"
            : tab === "search"
            ? "Buscar"
            : "Reels"}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {tab === "home" && (
          <>
            <NewPostInline
              me={me!}
              onCreated={async () => {
                await reloadFeed();
                await reloadMine();
              }}
            />
            {loadingFeed ? (
              <div className="py-8 text-center text-neutral-500">Carregando…</div>
            ) : (
              <Feed posts={feed} me={me} onDelete={deletePost} />
            )}
          </>
        )}

        {tab === "profile" && me && (
          <>
            <ProfileHeader me={me} onLogout={logout} />
            <Feed posts={myPosts} me={me} onDelete={deletePost} />
          </>
        )}

        {tab === "create" && (
          <NewPostInline
            me={me!}
            onCreated={async () => {
              setTab("home");
              await reloadFeed();
              await reloadMine();
            }}
          />
        )}

        {tab === "search" && (
          <div className="text-neutral-500">Busca de usuários (em breve)</div>
        )}
        {tab === "reels" && (
          <div className="text-neutral-500">Reels/Stories (em breve)</div>
        )}
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 h-14 border-t bg-white">
        <div className="max-w-4xl mx-auto h-full px-8 flex items-center justify-between">
          <button onClick={() => setTab("home")}>
            <Home strokeWidth={tab === "home" ? 2.5 : 1.5} />
          </button>
          <button onClick={() => setTab("search")}>
            <Search strokeWidth={tab === "search" ? 2.5 : 1.5} />
          </button>
          <button onClick={() => setTab("create")}>
            <PlusSquare strokeWidth={tab === "create" ? 2.5 : 1.5} />
          </button>
          <button onClick={() => setTab("reels")}>
            <Film strokeWidth={tab === "reels" ? 2.5 : 1.5} />
          </button>
          <button onClick={() => setTab("profile")}>
            {/* avatar mini */}
            {me?.avatar_url ? (
              <img src={me.avatar_url} className="w-6 h-6 rounded-full" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center text-[10px]">
                {initials(me?.full_name || me?.username)}
              </div>
            )}
          </button>
        </div>
      </nav>
    </div>
  );
};

export default App;
