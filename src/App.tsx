// src/App.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "./lib/supabaseClient";
import {
  Home, Search, PlusSquare, Clapperboard, User2, LogOut,
  Camera, Heart, MessageCircle, Trash2
} from "lucide-react";

/* ================= Types ================= */
type Profile = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

type Post = {
  id: string;
  user_id: string;
  media_url: string;
  caption: string | null;
  media_type: "image" | "video";
  created_at: string;
  profiles?: Profile;
  likes_count?: number;
  comments_count?: number;
  liked_by_me?: boolean;
};

/* ================ Helpers ================ */
function cn(...v: (string | null | false | undefined)[]) {
  return v.filter(Boolean).join(" ");
}

function isVideoFile(f: File) {
  return /^video\//.test(f.type) || /\.(mp4|mov|webm)$/i.test(f.name);
}

async function ensureProfile(userId: string, email?: string | null) {
  const { data } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("id", userId)
    .maybeSingle();
  if (!data) {
    const base = (email ?? "user").split("@")[0].replace(/[^a-z0-9_]/gi, "").toLowerCase() || "user";
    let username = base;
    for (let i = 0; i < 50; i++) {
      const exists = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
      if (!exists.data) break;
      username = `${base}${i + 1}`;
    }
    await supabase.from("profiles").insert({ id: userId, username });
  }
}

async function uploadToStorage(file: File, path: string, bucket = "media") {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, cacheControl: "3600" });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function storagePathFromPublicUrl(url: string) {
  // pega tudo depois de /object/public/<bucket>/
  const m = url.match(/\/object\/public\/[^/]+\/(.+)$/);
  return m?.[1] ?? null;
}

/* =================== App =================== */
export default function App() {
  const [tab, setTab] = useState<"home" | "search" | "create" | "reels" | "profile">("home");
  const [session, setSession] = useState<import("@supabase/supabase-js").Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const sub = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      if (!session?.user) return;
      await ensureProfile(session.user.id, session.user.email);
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      setMe(data as Profile);
    })();
  }, [session?.user?.id]);

  if (!session) return <LoginScreen />;

  return (
    <div className="min-h-screen bg-neutral-50">
      <TopBar onLogout={() => supabase.auth.signOut()} />
      {tab === "home" && <Feed me={me} />}
      {tab === "search" && <SearchPage />}
      {tab === "create" && <CreatePost me={me} onDone={() => setTab("home")} />}
      {tab === "reels" && <ReelsPage />}
      {tab === "profile" && <ProfilePage me={me} refreshMe={setMe} />}
      <BottomNav current={tab} onChange={setTab} />
    </div>
  );
}

/* ================ Login ================ */
function LoginScreen() {
  return (
    <div className="min-h-screen grid place-items-center bg-neutral-50">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-center tracking-tight">LIV</h1>
        <p className="text-center text-neutral-500 mt-2">Compartilhe sua vida saudável</p>
        <button
          className="mt-8 w-full rounded-xl bg-neutral-900 text-white py-3 font-medium hover:bg-black"
          onClick={() =>
            supabase.auth.signInWithOAuth({ provider: "google", options: { queryParams: { prompt: "select_account" } } })
          }
        >
          Entrar com Google
        </button>
      </div>
    </div>
  );
}

/* ============== Layout Pieces ============== */
function TopBar({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="sticky top-0 z-10 bg-white border-b border-neutral-200">
      <div className="max-w-3xl mx-auto h-14 flex items-center justify-between px-4">
        <div className="font-extrabold tracking-tight">LIV</div>
        <button onClick={onLogout} className="text-neutral-500 hover:text-neutral-800 rounded-lg px-2 py-1" title="Sair">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}

function BottomNav({
  current,
  onChange,
}: {
  current: "home" | "search" | "create" | "reels" | "profile";
  onChange: (t: typeof current) => void;
}) {
  const Item = ({ id, icon }: { id: typeof current; icon: JSX.Element }) => (
    <button
      className={cn("flex-1 py-3 flex items-center justify-center", current === id ? "text-neutral-900" : "text-neutral-400")}
      onClick={() => onChange(id)}
    >
      {icon}
    </button>
  );
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200">
      <div className="max-w-3xl mx-auto flex">
        <Item id="home" icon={<Home />} />
        <Item id="search" icon={<Search />} />
        <Item id="create" icon={<PlusSquare />} />
        <Item id="reels" icon={<Clapperboard />} />
        <Item id="profile" icon={<User2 />} />
      </div>
    </nav>
  );
}

function Avatar({ url, size = 64 }: { url?: string | null; size?: number }) {
  return url ? (
    <img src={url} style={{ width: size, height: size }} className="rounded-full object-cover border border-neutral-200" />
  ) : (
    <div style={{ width: size, height: size }} className="rounded-full bg-neutral-200 grid place-items-center text-neutral-600 font-semibold">
      AN
    </div>
  );
}

/* ================ Feed ================ */
function Feed({ me }: { me: Profile | null }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  async function load() {
    const u = (await supabase.auth.getUser()).data.user;
    setUserId(u?.id ?? null);

    // posts + profile
    const { data: p } = await supabase
      .from("posts")
      .select("*, profiles!posts_user_id_fkey(id, username, avatar_url)")
      .order("created_at", { ascending: false })
      .limit(50);

    const posts = (p ?? []) as Post[];

    // likes count + liked_by_me + comments count
    const ids = posts.map((x) => x.id);
    if (ids.length > 0) {
      const [{ data: likes }, { data: myLikes }, { data: comms }] = await Promise.all([
        supabase.from("likes").select("post_id, count:id").in("post_id", ids).group("post_id"),
        u ? supabase.from("likes").select("post_id").eq("user_id", u!.id).in("post_id", ids) : Promise.resolve({ data: [] as any }),
        supabase.from("comments").select("post_id, count:id").in("post_id", ids).group("post_id"),
      ]);

      const likeCountMap = new Map<string, number>();
      likes?.forEach((r: any) => likeCountMap.set(r.post_id, Number(r.count)));

      const myLikeSet = new Set<string>((myLikes ?? []).map((r: any) => r.post_id));

      const commentCountMap = new Map<string, number>();
      comms?.forEach((r: any) => commentCountMap.set(r.post_id, Number(r.count)));

      posts.forEach((x) => {
        x.likes_count = likeCountMap.get(x.id) ?? 0;
        x.liked_by_me = myLikeSet.has(x.id);
        x.comments_count = commentCountMap.get(x.id) ?? 0;
      });
    }

    setPosts(posts);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleLike(post: Post) {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    if (post.liked_by_me) {
      await supabase.from("likes").delete().eq("post_id", post.id).eq("user_id", user.id);
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, liked_by_me: false, likes_count: (p.likes_count ?? 1) - 1 } : p))
      );
    } else {
      // upsert via unique(post_id,user_id)
      await supabase.from("likes").insert({ post_id: post.id, user_id: user.id }).catch(() => {});
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, liked_by_me: true, likes_count: (p.likes_count ?? 0) + 1 } : p))
      );
    }
  }

  async function addComment(postId: string, content: string) {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    if (!content.trim()) return;
    await supabase.from("comments").insert({ post_id: postId, user_id: user.id, content: content.trim() });
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, comments_count: (p.comments_count ?? 0) + 1 } : p))
    );
  }

  async function deletePost(post: Post) {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user || user.id !== post.user_id) return;
    await supabase.from("posts").delete().eq("id", post.id);
    // tenta remover o arquivo (opcional)
    const path = storagePathFromPublicUrl(post.media_url);
    if (path) await supabase.storage.from("media").remove([path]).catch(() => {});
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
  }

  return (
    <main className="max-w-3xl mx-auto px-4 pb-24">
      {posts.map((p) => (
        <article key={p.id} className="bg-white border border-neutral-200 rounded-2xl mt-4">
          {/* header */}
          <div className="flex items-center gap-3 px-4 py-3">
            <Avatar url={p.profiles?.avatar_url} size={36} />
            <div className="font-medium">@{p.profiles?.username ?? "user"}</div>
            {userId === p.user_id && (
              <button
                title="Excluir post"
                className="ml-auto text-neutral-500 hover:text-red-600"
                onClick={() => deletePost(p)}
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>

          {/* mídia */}
          {p.media_type === "video" ? (
            <video src={p.media_url} controls className="w-full aspect-[4/5] object-cover rounded-b-2xl" />
          ) : (
            <img src={p.media_url} className="w-full aspect-[4/5] object-cover rounded-b-2xl" />
          )}

          {/* ações */}
          <div className="px-4 py-3 flex gap-4 text-neutral-700">
            <button
              className={cn("flex items-center gap-2 hover:opacity-80", p.liked_by_me && "text-red-600")}
              onClick={() => toggleLike(p)}
            >
              <Heart size={20} /> {p.likes_count ?? 0}
            </button>
            <div className="flex items-center gap-2 text-neutral-600">
              <MessageCircle size={20} /> {p.comments_count ?? 0}
            </div>
          </div>

          {/* legenda */}
          {p.caption && <div className="px-4 pb-2 text-sm">{p.caption}</div>}

          {/* novo comentário */}
          <CommentBox onSend={(txt) => addComment(p.id, txt)} />
        </article>
      ))}
      {posts.length === 0 && (
        <div className="text-center text-neutral-500 py-12">Sem posts por enquanto.</div>
      )}
    </main>
  );
}

function CommentBox({ onSend }: { onSend: (text: string) => void }) {
  const [txt, setTxt] = useState("");
  return (
    <div className="px-4 pb-4">
      <div className="flex gap-2">
        <input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-900"
          placeholder="Adicionar comentário…"
        />
        <button
          onClick={() => {
            if (txt.trim()) onSend(txt), setTxt("");
          }}
          className="rounded-xl bg-neutral-900 text-white px-3"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}

/* ============== Create Post ============== */
function CreatePost({ me, onDone }: { me: Profile | null; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const kind: "image" | "video" | null = file ? (isVideoFile(file) ? "video" : "image") : null;

  async function handlePublish() {
    if (!file) return;
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const ext = file.name.split(".").pop() ?? (kind === "video" ? "mp4" : "jpg");
    const path = `${user.id}/posts/${Date.now()}.${ext}`;
    const publicUrl = await uploadToStorage(file, path, "media");

    await supabase.from("posts").insert({
      user_id: user.id,
      media_url: publicUrl,
      caption: caption || null,
      media_type: kind ?? "image",
    });

    onDone();
  }

  return (
    <main className="max-w-3xl mx-auto px-4 pb-24">
      <div className="bg-white border border-neutral-200 rounded-2xl mt-4 p-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Nova publicação</div>
          <button
            className="rounded-lg px-3 py-1.5 bg-neutral-900 text-white disabled:opacity-40"
            disabled={!file}
            onClick={handlePublish}
          >
            Publicar
          </button>
        </div>

        {!file ? (
          <div className="mt-6 border-2 border-dashed border-neutral-300 rounded-2xl p-10 grid place-items-center">
            <button
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 rounded-xl bg-neutral-900 text-white px-4 py-2"
            >
              <Camera size={18} /> Selecionar foto/vídeo
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="w-full">
              {kind === "video" ? (
                <video src={previewUrl!} controls className="w-full rounded-2xl" />
              ) : (
                <img src={previewUrl!} className="w-full rounded-2xl object-cover" />
              )}
            </div>
            <div>
              <label className="text-sm text-neutral-600">Legenda</label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={6}
                className="mt-2 w-full rounded-xl border border-neutral-300 p-3 outline-none focus:ring-2 focus:ring-neutral-900"
                placeholder="Escreva algo… (opcional)"
              />
              <div className="mt-4 flex gap-2">
                <button className="px-3 py-2 rounded-xl border border-neutral-300" onClick={() => setFile(null)}>
                  Trocar arquivo
                </button>
                <button className="px-3 py-2 rounded-xl" onClick={onDone}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/* ================ Profile ================ */
function ProfilePage({ me, refreshMe }: { me: Profile | null; refreshMe: (p: Profile | null) => void }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const { data } = await supabase
      .from("posts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setPosts((data ?? []) as Post[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function changeAvatar(file: File) {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatars/avatar.${ext}`;
    const publicUrl = await uploadToStorage(file, path, "media");
    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    refreshMe(data as Profile);
  }

  async function deletePost(post: Post) {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user || user.id !== post.user_id) return;
    await supabase.from("posts").delete().eq("id", post.id);
    const path = storagePathFromPublicUrl(post.media_url);
    if (path) await supabase.storage.from("media").remove([path]).catch(() => {});
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
  }

  return (
    <main className="max-w-3xl mx-auto px-4 pb-24">
      <div className="bg-white border border-neutral-200 rounded-2xl mt-4 p-4">
        <div className="flex items-center gap-4">
          <Avatar url={me?.avatar_url} size={72} />
          <div>
            <div className="text-xl font-semibold">{me?.full_name ?? " "}</div>
            <div className="text-neutral-600">@{me?.username}</div>
            <div className="text-neutral-500 text-sm mt-1">295 followers</div>
          </div>
          <div className="ml-auto">
            <label className="cursor-pointer text-sm rounded-xl border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50">
              Trocar foto
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && changeAvatar(e.target.files[0])}
              />
            </label>
          </div>
        </div>

        <div className="mt-6">
          <div className="font-semibold">Highlights</div>
          <div className="flex gap-4 mt-3">
            {["Running", "Cycling", "Workouts", "Food"].map((h) => (
              <div key={h} className="text-center">
                <div className="size-14 rounded-full bg-neutral-200" />
                <div className="text-xs text-neutral-600 mt-1">{h}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="font-semibold">Posts</div>
          {loading ? (
            <div className="text-neutral-500 mt-4">Carregando…</div>
          ) : (
            <div className="grid grid-cols-3 gap-2 mt-4">
              {posts.map((p) => (
                <div key={p.id} className="relative group">
                  {p.media_type === "video" ? (
                    <video src={p.media_url} className="w-full aspect-square object-cover rounded-lg" muted playsInline />
                  ) : (
                    <img src={p.media_url} className="w-full aspect-square object-cover rounded-lg" />
                  )}
                  <button
                    title="Excluir post"
                    onClick={() => deletePost(p)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition rounded-full bg-white/90 p-1 text-red-600"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/* ============ Placeholders ============ */
function SearchPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 pb-24">
      <div className="bg-white border border-neutral-200 rounded-2xl mt-4 p-8 text-center text-neutral-500">
        Busca de usuários (em breve)
      </div>
    </main>
  );
}
function ReelsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 pb-24">
      <div className="bg-white border border-neutral-200 rounded-2xl mt-4 p-8 text-center text-neutral-500">
        Reels (em breve)
      </div>
    </main>
  );
}
