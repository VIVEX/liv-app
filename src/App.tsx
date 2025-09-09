// src/App.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "./lib/supabaseClient";

type Profile = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type Post = {
  id: string;
  caption: string | null;
  media_url: string | null;
  media_type: "image" | "video" | null;
  created_at: string;
  user_id: string;
  profiles: Profile | null;
};

export default function App() {
  const [session, setSession] = useState<null | { user: { id: string } }>(null);
  const [loading, setLoading] = useState(false);

  // Form
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Feed
  const [posts, setPosts] = useState<Post[]>([]);

  // ===== Auth lifecycle =====
  useEffect(() => {
    // sessão atual
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ? { user: { id: data.session.user.id } } : null);
    });

    // escuta mudanças
    const { data: sub } = supabase.auth.onAuthStateChange((_event, authSession) => {
      setSession(authSession ? { user: { id: authSession.user.id } } : null);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  // ===== Carrega feed =====
  useEffect(() => {
    fetchPosts();
  }, [session]); // recarrega quando loga/desloga

  async function fetchPosts() {
    setLoading(true);
    // Requer FK posts.user_id -> profiles.id
    const { data, error } = await supabase
      .from("posts")
      .select(
        "id, caption, media_url, media_type, created_at, user_id, profiles(id, full_name, username, avatar_url)"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
    } else {
      setPosts((data as Post[]) ?? []);
    }
    setLoading(false);
  }

  // ===== Upload + criar post =====
  function guessMediaType(f: File | null): "image" | "video" | null {
    if (!f) return null;
    if (f.type.startsWith("video")) return "video";
    if (f.type.startsWith("image")) return "image";
    return null;
  }

  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();
    if (!session) {
      alert("Faça login para postar.");
      return;
    }
    if (!file && !caption.trim()) {
      alert("Adicione uma imagem/vídeo ou escreva uma legenda.");
      return;
    }

    setLoading(true);

    let mediaUrl: string | null = null;
    let mediaType: "image" | "video" | null = guessMediaType(file);

    try {
      // 1) Upload opcional
      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${session.user.id}/${Date.now()}.${ext}`;
        const up = await supabase.storage.from("media").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });
        if (up.error) throw up.error;

        const pub = supabase.storage.from("media").getPublicUrl(path);
        if (!pub?.data?.publicUrl) throw new Error("Falha ao obter URL público.");
        mediaUrl = pub.data.publicUrl;
      }

      // 2) Insere post
      const { error: insertErr } = await supabase.from("posts").insert({
        user_id: session.user.id,
        caption: caption || null,
        media_url: mediaUrl,
        media_type: mediaType,
      });
      if (insertErr) throw insertErr;

      // 3) Reset + recarrega feed
      setCaption("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await fetchPosts();
    } catch (err: any) {
      console.error(err);
      alert(err.message ?? "Erro ao postar.");
    } finally {
      setLoading(false);
    }
  }

  // ===== Helpers UI =====
  function signInGoogle() {
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }

  function signOut() {
    supabase.auth.signOut();
  }

  const uploading = loading;

  const canPost = useMemo(() => {
    const hasMedia = !!file;
    const hasText = caption.trim().length > 0;
    return session && (hasMedia || hasText);
  }, [session, file, caption]);

  // ===== Render =====
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="text-xl font-extrabold tracking-tight">LIV</div>
          <div>
            {session ? (
              <button
                onClick={signOut}
                className="rounded-full border px-4 py-1.5 text-sm font-medium hover:bg-neutral-100"
              >
                Logout
              </button>
            ) : (
              <button
                onClick={signInGoogle}
                className="rounded-full bg-black px-4 py-1.5 text-sm font-semibold text-white hover:bg-neutral-800"
              >
                Entrar com Google
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        {/* Composer */}
        {session && (
          <section className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
            <form onSubmit={handleCreatePost} className="space-y-3">
              <input
                type="text"
                placeholder="Legenda"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:border-neutral-400"
              />

              {/* Botão de arquivo clean */}
              <div className="flex items-center justify-between">
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                    id="file-input"
                  />
                  <label
                    htmlFor="file-input"
                    className="cursor-pointer rounded-full border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
                  >
                    {file ? "Trocar arquivo" : "Escolher arquivo"}
                  </label>
                  {file && (
                    <span className="ml-3 text-sm text-neutral-600">
                      {file.name}{" "}
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                        {guessMediaType(file) ?? "arquivo"}
                      </span>
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!canPost || uploading}
                  className={`rounded-full px-5 py-2 text-sm font-semibold text-white ${
                    !canPost || uploading
                      ? "bg-neutral-300"
                      : "bg-black hover:bg-neutral-800"
                  }`}
                >
                  {uploading ? "Publicando..." : "Postar"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Feed */}
        <section className="space-y-4">
          {loading && posts.length === 0 && (
            <div className="text-center text-sm text-neutral-500">Carregando…</div>
          )}

          {posts.map((p) => (
            <article
              key={p.id}
              className="overflow-hidden rounded-2xl border bg-white shadow-sm"
            >
              {/* Cabeçalho do post */}
              <div className="flex items-center gap-3 px-4 py-3">
                <img
                  src={
                    p.profiles?.avatar_url ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      p.profiles?.full_name || p.profiles?.username || "User"
                    )}&background=eee&color=111`
                  }
                  alt=""
                  className="h-9 w-9 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold truncate">
                      {p.profiles?.full_name || "Usuário"}
                    </span>
                    {p.profiles?.username && (
                      <span className="truncate text-neutral-500">@{p.profiles.username}</span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {new Date(p.created_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Mídia */}
              {p.media_url && (
                <div className="bg-black">
                  {p.media_type === "video" ? (
                    <video
                      src={p.media_url}
                      controls
                      className="max-h-[70vh] w-full object-contain"
                    />
                  ) : (
                    <img
                      src={p.media_url}
                      alt={p.caption ?? ""}
                      className="w-full object-contain"
                    />
                  )}
                </div>
              )}

              {/* Legenda */}
              {(p.caption || !p.media_url) && (
                <div className="px-4 py-3 text-[15px]">
                  {p.caption ? (
                    <p>{p.caption}</p>
                  ) : (
                    <p className="text-neutral-500">— sem legenda —</p>
                  )}
                </div>
              )}
            </article>
          ))}

          {!loading && posts.length === 0 && (
            <div className="text-center text-sm text-neutral-500">
              Nenhuma publicação ainda.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
