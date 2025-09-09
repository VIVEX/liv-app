// src/App.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "./lib/supabaseClient";

// ====== Tipos ======
type Session = Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"];

type Profile = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
};

type Post = {
  id: string;
  user_id: string;
  media_url: string | null;
  caption: string | null;
  media_type: "image" | "video";
  created_at: string;
  author?: Pick<Profile, "id" | "full_name" | "username" | "avatar_url">;
};

// ====== Util ======
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString([], { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

const classNames = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

const getFileMediaType = (file: File): "image" | "video" => {
  return file.type.startsWith("video") ? "video" : "image";
};

// ====== Componentes pequenos ======
function Avatar({ src, alt, size = 72 }: { src?: string | null; alt: string; size?: number }) {
  const url = src || `https://ui-avatars.com/api/?name=${encodeURIComponent(alt || "U")}&background=eee&color=555&bold=true`;
  return (
    <img
      src={url}
      alt={alt}
      width={size}
      height={size}
      className="rounded-full object-cover border border-zinc-200"
      style={{ width: size, height: size }}
    />
  );
}

function BottomNav({ tab, onTab }: { tab: "feed" | "profile"; onTab: (t: "feed" | "profile") => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 backdrop-blur bg-white/80 border-t">
      <div className="mx-auto max-w-xl grid grid-cols-2">
        <button
          onClick={() => onTab("feed")}
          className={classNames(
            "py-3 text-sm font-medium",
            tab === "feed" ? "text-black" : "text-zinc-500"
          )}
        >
          Feed
        </button>
        <button
          onClick={() => onTab("profile")}
          className={classNames(
            "py-3 text-sm font-medium",
            tab === "profile" ? "text-black" : "text-zinc-500"
          )}
        >
          Perfil
        </button>
      </div>
    </nav>
  );
}

// ====== Upload de mídia ======
async function uploadToBucket(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || (file.type.startsWith("video") ? "mp4" : "jpg");
  const path = `posts/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage.from("media").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from("media").getPublicUrl(path);
  return data.publicUrl;
}

// ====== App ======
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<"feed" | "profile">("feed");
  const [profile, setProfile] = useState<Profile | null>(null);

  // Feed
  const [posts, setPosts] = useState<Post[]>([]);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [posting, setPosting] = useState(false);

  // ====== Auth ======
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);

      supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    })();
  }, []);

  // Cria/Carrega perfil do usuário logado
  useEffect(() => {
    if (!session?.user) return;

    (async () => {
      // tenta buscar
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();

      if (!data) {
        // criar básico
        const baseUsername =
          session.user.user_metadata?.user_name ||
          (session.user.email ? session.user.email.split("@")[0] : "user") +
            Math.floor(Math.random() * 10000);

        const insert: Partial<Profile> = {
          id: session.user.id,
          full_name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || "User",
          username: baseUsername.toLowerCase(),
          avatar_url: session.user.user_metadata?.avatar_url || null,
          bio: null,
        };

        const { data: created, error } = await supabase.from("profiles").insert(insert).select("*").single();
        if (!error) setProfile(created);
      } else {
        setProfile(data);
      }
    })();
  }, [session]);

  // Carrega feed (posts mais recentes)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id,user_id,media_url,caption,media_type,created_at, author:profiles(id,full_name,username,avatar_url)")
        .order("created_at", { ascending: false })
        .limit(40);

      if (!error && data) {
        // @ts-ignore - mapeando alias "author"
        setPosts(data as Post[]);
      }
    })();
  }, []);

  const myPosts = useMemo(
    () => posts.filter((p) => p.user_id === profile?.id),
    [posts, profile?.id]
  );

  // ====== Ações ======
  const signIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const handlePublish = async () => {
    if (!session?.user) return;
    if (!file && !externalUrl) return;

    try {
      setPosting(true);

      let mediaUrl = externalUrl.trim();
      let mediaType: "image" | "video" = "image";

      if (!mediaUrl && file) {
        mediaType = getFileMediaType(file);
        mediaUrl = await uploadToBucket(file);
      } else if (mediaUrl) {
        // heurística simples pela extensão
        mediaType = /\.(mp4|mov|webm)$/i.test(mediaUrl) ? "video" : "image";
      }

      const { data, error } = await supabase
        .from("posts")
        .insert({
          user_id: session.user.id,
          caption: caption.trim() || null,
          media_url: mediaUrl,
          media_type: mediaType,
        })
        .select(
          "id,user_id,media_url,caption,media_type,created_at, author:profiles(id,full_name,username,avatar_url)"
        )
        .single();

      if (error) throw error;

      // adiciona no topo do feed
      setPosts((prev) => [data as Post, ...prev]);
      // limpa formulário
      setCaption("");
      setFile(null);
      setExternalUrl("");
    } catch (e: any) {
      alert(e.message || "Falha ao publicar.");
    } finally {
      setPosting(false);
    }
  };

  // ====== UI ======
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="w-full max-w-sm p-6 bg-white border rounded-2xl shadow-sm text-center">
          <h1 className="text-2xl font-bold mb-2">LIV</h1>
          <p className="text-zinc-600 mb-6">Compartilhe sua vida saudável 🌿</p>
          <button
            onClick={signIn}
            className="w-full py-3 rounded-xl bg-black text-white font-semibold"
          >
            Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-16">
      {/* Cabeçalho */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-xl px-4 py-3 flex items-center justify-between">
          <h1 className="font-bold tracking-tight">LIV</h1>
          <button
            onClick={signOut}
            className="text-sm text-zinc-500 hover:text-zinc-800"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="mx-auto max-w-xl px-4">
        {tab === "feed" ? (
          <>
            {/* Composer - mais limpo */}
            <div className="mt-4 mb-3 rounded-2xl border p-3">
              <textarea
                placeholder="Legenda"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full resize-none outline-none placeholder:text-zinc-400 text-sm"
                rows={2}
              />
              <div className="mt-2 flex items-center gap-2">
                <label className="inline-flex items-center px-3 py-2 rounded-xl border cursor-pointer text-sm">
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  {file ? "Arquivo selecionado" : "Escolher arquivo"}
                </label>
                <span className="text-xs text-zinc-400">ou</span>
                <input
                  type="url"
                  placeholder="URL externa (opcional)"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border text-sm"
                />
                <button
                  onClick={handlePublish}
                  disabled={posting || (!file && !externalUrl)}
                  className="px-4 py-2 rounded-xl bg-black text-white text-sm font-semibold disabled:opacity-50"
                >
                  {posting ? "Publicando..." : "Postar"}
                </button>
              </div>
            </div>

            {/* Feed */}
            <section className="space-y-4">
              {posts.map((p) => (
                <article key={p.id} className="border rounded-2xl p-3">
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar src={p.author?.avatar_url} alt={p.author?.full_name || "User"} size={36} />
                    <div className="leading-tight">
                      <div className="text-sm font-medium">
                        {p.author?.full_name || "Usuário"}
                      </div>
                      <div className="text-xs text-zinc-500">
                        @{p.author?.username || "user"} • {fmtDate(p.created_at)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl overflow-hidden border bg-black/5">
                    {p.media_type === "video" ? (
                      <video src={p.media_url || ""} controls playsInline className="w-full h-auto" />
                    ) : (
                      <img src={p.media_url || ""} alt="" className="w-full h-auto object-cover" />
                    )}
                  </div>

                  {p.caption && (
                    <p className="mt-2 text-sm">{p.caption}</p>
                  )}
                </article>
              ))}
            </section>
          </>
        ) : (
          // ====== PERFIL ======
          <section className="mt-4 pb-8">
            <div className="flex items-start gap-4">
              <Avatar src={profile?.avatar_url} alt={profile?.full_name || "User"} size={72} />
              <div className="flex-1">
                <h2 className="text-xl font-bold leading-tight">
                  {profile?.full_name || "User"}
                </h2>
                <div className="text-zinc-500">@{profile?.username || "user"}</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-zinc-100 text-xs">
                    295 followers
                  </span>
                  <button className="px-4 py-1.5 rounded-full bg-black text-white text-sm font-semibold">
                    Follow
                  </button>
                </div>
              </div>
            </div>

            {profile?.bio && (
              <p className="mt-3 text-sm text-zinc-700">{profile.bio}</p>
            )}

            {/* Highlights fake */}
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Highlights</h3>
              <div className="flex gap-3">
                {["Running", "Cycling", "Workouts", "Food"].map((x) => (
                  <div key={x} className="w-16">
                    <div className="w-16 h-16 rounded-full border bg-zinc-50" />
                    <div className="text-xs text-center mt-1 text-zinc-600">{x}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Posts em grade */}
            <div className="mt-5">
              <h3 className="font-semibold mb-2">Posts</h3>
              {myPosts.length === 0 ? (
                <div className="text-sm text-zinc-500">Você ainda não publicou nada.</div>
              ) : (
                <div className="grid grid-cols-3 gap-1">
                  {myPosts.map((p) => (
                    <div key={p.id} className="relative aspect-square bg-zinc-100 overflow-hidden">
                      {p.media_type === "video" ? (
                        <video src={p.media_url || ""} className="w-full h-full object-cover" muted playsInline />
                      ) : (
                        <img src={p.media_url || ""} className="w-full h-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <BottomNav tab={tab} onTab={setTab} />
    </div>
  );
}
