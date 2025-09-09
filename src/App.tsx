// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import supabase from "./lib/supabaseClient";
import { v4 as uuid } from "uuid";

// ======== Tipos ========
type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type Post = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string | null;
  created_at: string;
  author?: Profile;
};

// ======== Helpers ========

// Extrai o caminho do objeto no bucket "media" a partir da public URL
// Ex.: https://xxx.supabase.co/storage/v1/object/public/media/user/abc.jpg
// -> retorna "user/abc.jpg"
function storagePathFromPublicUrl(publicUrl: string): string | null {
  // tenta achar "/media/"
  const idx = publicUrl.indexOf("/media/");
  if (idx === -1) return null;
  return publicUrl.slice(idx + "/media/".length);
}

// Faz getPublicUrl seguro (evita erros silenciosos)
function toPublicUrl(path: string) {
  const { data, error } = supabase.storage.from("media").getPublicUrl(path);
  if (error) throw error;
  return data.publicUrl;
}

// ======== UI básica ========
const Tab = {
  FEED: "FEED",
  PROFILE: "PROFILE",
  NEW: "NEW",
} as const;

type TabKey = keyof typeof Tab;

// ======== Componente principal ========
export default function App() {
  const [session, setSession] = useState<Awaited<
    ReturnType<typeof supabase.auth.getSession>
  >["data"]["session"] | null>(null);

  const [active, setActive] = useState<TabKey>("FEED");

  useEffect(() => {
    // carrega sessão atual
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    // escuta mudanças
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!session) return <Login />;

  return (
    <Shell active={active} setActive={setActive} sessionUserId={session.user.id} />
  );
}

function Login() {
  async function signIn() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) alert(error.message);
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="w-[340px] rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-center">LIV</h1>
        <p className="text-center text-sm text-neutral-500 mt-1">
          Compartilhe sua vida saudável
        </p>
        <button
          onClick={signIn}
          className="mt-5 w-full rounded-full bg-black px-4 py-2 text-white"
        >
          Entrar com Google
        </button>
      </div>
    </div>
  );
}

function Shell({
  active,
  setActive,
  sessionUserId,
}: {
  active: TabKey;
  setActive: (t: TabKey) => void;
  sessionUserId: string;
}) {
  const [me, setMe] = useState<Profile | null>(null);

  useEffect(() => {
    async function loadMe() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .eq("id", sessionUserId)
        .maybeSingle();
      if (!error) setMe(data);
    }
    loadMe();
  }, [sessionUserId]);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b">
        <div className="mx-auto max-w-3xl px-4 h-12 flex items-center justify-between">
          <div className="font-semibold">LIV</div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {active === "FEED" && <Feed />}
        {active === "PROFILE" && <ProfileView me={me} sessionUserId={sessionUserId} />}
        {active === "NEW" && <NewPost onPosted={() => setActive("PROFILE")} userId={sessionUserId} />}
      </main>

      <Nav active={active} onChange={setActive} avatarUrl={me?.avatar_url || undefined} />
    </div>
  );
}

function Nav({
  active,
  onChange,
  avatarUrl,
}: {
  active: TabKey;
  onChange: (t: TabKey) => void;
  avatarUrl?: string;
}) {
  const tabs: { key: TabKey; label: string; icon?: React.ReactNode }[] = [
    { key: "FEED", label: "Home" },
    { key: "NEW", label: "Postar" },
    { key: "PROFILE", label: "Perfil" },
  ];
  return (
    <nav className="fixed bottom-0 inset-x-0 border-t bg-white">
      <div className="mx-auto max-w-3xl px-8 h-14 grid grid-cols-3 items-center">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`flex items-center justify-center h-10 rounded-full ${
              active === t.key ? "text-black" : "text-neutral-400"
            }`}
            aria-label={t.label}
          >
            {t.key === "PROFILE" ? (
              <div className="w-7 h-7 rounded-full bg-neutral-200 overflow-hidden">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : null}
              </div>
            ) : t.key === "NEW" ? (
              <span className="text-2xl font-semibold">+</span>
            ) : (
              <span className="text-lg">🏠</span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ======== FEED ========
function Feed() {
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("posts")
        .select(
          "id, user_id, media_url, media_type, caption, created_at, author:profiles(id, username, full_name, avatar_url)"
        )
        .order("created_at", { ascending: false })
        .limit(60);
      if (!error) setPosts((data as any) || []);
    }
    load();
  }, []);

  if (!posts) return <div className="py-10 text-center text-neutral-500">Carregando…</div>;
  if (!posts.length) return <div className="py-10 text-center text-neutral-500">Sem posts por enquanto.</div>;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {posts.map((p) => (
        <MediaTile key={p.id} post={p} />
      ))}
    </div>
  );
}

function MediaTile({ post }: { post: Post }) {
  const isVideo = post.media_type === "video";
  return (
    <div className="aspect-square rounded-xl overflow-hidden bg-neutral-100">
      {isVideo ? (
        <video
          src={post.media_url}
          className="w-full h-full object-cover"
          muted
          playsInline
          controls={false}
          onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
          onMouseLeave={(e) => (e.currentTarget as HTMLVideoElement).pause()}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.media_url}
          alt={post.caption || ""}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
    </div>
  );
}

// ======== PERFIL ========
function ProfileView({ me, sessionUserId }: { me: Profile | null; sessionUserId: string }) {
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("posts")
        .select("id, user_id, media_url, media_type, caption, created_at")
        .eq("user_id", sessionUserId)
        .order("created_at", { ascending: false });
      if (!error) setPosts((data as any) || []);
    }
    load();
  }, [sessionUserId]);

  async function deletePost(post: Post) {
    if (!confirm("Excluir post?")) return;

    // 1) Remover do Storage (se conseguirmos extrair o path)
    const path = storagePathFromPublicUrl(post.media_url);
    if (path) {
      const { error: delErr } = await supabase.storage.from("media").remove([path]);
      // se já não existir, seguimos
      if (delErr && !/Not Found|does not exist/i.test(delErr.message)) {
        console.warn("Falha ao remover do storage:", delErr.message);
      }
    }

    // 2) Remover da tabela
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    setPosts((cur) => (cur ? cur.filter((p) => p.id !== post.id) : cur));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-neutral-200 overflow-hidden">
          {me?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : null}
        </div>
        <div>
          <div className="text-lg font-semibold">{me?.full_name || "Usuário"}</div>
          <div className="text-neutral-500">@{me?.username || "usuario"}</div>
        </div>
      </div>

      {!posts?.length && (
        <div className="py-10 text-center text-neutral-500">Sem posts por enquanto.</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {posts?.map((p) => (
          <div key={p.id} className="relative group">
            {p.media_type === "video" ? (
              <video src={p.media_url} className="aspect-square w-full object-cover rounded-xl bg-neutral-100" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.media_url}
                alt=""
                className="aspect-square w-full object-cover rounded-xl bg-neutral-100"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
              />
            )}

            <button
              onClick={() => deletePost(p)}
              title="Excluir post"
              className="absolute top-2 right-2 hidden group-hover:flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow"
            >
              🗑️
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ======== NOVO POST ========
function NewPost({ onPosted, userId }: { onPosted: () => void; userId: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Abre a galeria imediatamente
  useEffect(() => {
    inputRef.current?.click();
  }, []);

  const canPublish = !!file && !uploading;

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
  }

  async function publish() {
    if (!file) return;
    try {
      setUploading(true);

      const ext = file.name.split(".").pop()?.toLowerCase() || "dat";
      const id = uuid();
      const path = `${userId}/${id}.${ext}`;

      // Upload com contentType
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, {
          upsert: false,
          cacheControl: "3600",
          contentType: file.type || undefined,
        });
      if (upErr) throw upErr;

      const publicUrl = toPublicUrl(path);

      const media_type: "image" | "video" =
        /video/i.test(file.type) || /\.(mp4|mov|webm)$/i.test(path) ? "video" : "image";

      const { error: insErr } = await supabase.from("posts").insert({
        user_id: userId,
        media_url: publicUrl,
        media_type,
        caption: null,
      });
      if (insErr) throw insErr;

      onPosted();
      alert("Publicação criada!");
    } catch (err: any) {
      console.error(err);
      alert("Falha ao publicar: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-2xl border p-4">
        <div className="text-sm font-medium mb-3">Nova publicação</div>

        <div className="relative border-2 border-dashed rounded-xl h-56 flex items-center justify-center">
          {!file ? (
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-full bg-black text-white px-4 py-2"
            >
              Selecionar foto/vídeo
            </button>
          ) : (
            <Preview file={file} />
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={onSelect}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            disabled={!canPublish}
            onClick={publish}
            className={`rounded-full px-4 py-2 ${
              canPublish ? "bg-black text-white" : "bg-neutral-200 text-neutral-400"
            }`}
          >
            {uploading ? "Publicando..." : "Publicar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Preview({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const isVideo = /video/i.test(file.type);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return isVideo ? (
    <video src={url} className="absolute inset-0 w-full h-full object-cover rounded-xl" muted />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover rounded-xl" />
  );
}
