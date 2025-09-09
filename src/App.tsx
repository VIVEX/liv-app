// src/App.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "./lib/supabaseClient";
import {
  Home,
  Search,
  PlusSquare,
  Clapperboard,
  User2,
  LogOut,
  Camera,
  Heart,
  MessageCircle,
} from "lucide-react";

// ===== Tipos =====
type Post = {
  id: string;
  user_id: string;
  media_url: string;
  caption: string | null;
  media_type: "image" | "video";
  created_at: string;
  profiles?: Profile;
};

type Profile = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

// ===== Helpers =====
async function ensureProfile(sessionUserId: string, email?: string | null) {
  const { data } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("id", sessionUserId)
    .maybeSingle();

  if (!data) {
    const base = (email ?? "user").split("@")[0].replace(/[^a-z0-9_]/gi, "").toLowerCase() || "user";
    // tenta @base, @base1, @base2...
    let username = base;
    for (let i = 0; i < 50; i++) {
      const check = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (!check.data) break;
      username = `${base}${i + 1}`;
    }
    await supabase.from("profiles").insert({ id: sessionUserId, username });
  }
}

function cn(...cls: (string | false | null | undefined)[]) {
  return cls.filter(Boolean).join(" ");
}

async function uploadToStorage(opts: {
  file: File;
  path: string; // dentro do bucket
  bucket?: string; // default "media"
}) {
  const bucket = opts.bucket ?? "media";
  const { error } = await supabase.storage.from(bucket).upload(opts.path, opts.file, {
    upsert: true, // permite trocar avatar
    cacheControl: "3600",
  });
  if (error) throw error;
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(opts.path);
  return pub.publicUrl;
}

function isVideoFile(f: File) {
  return /^video\//.test(f.type) || /\.(mp4|mov|webm)$/i.test(f.name);
}

// ====== App ======
export default function App() {
  const [tab, setTab] = useState<"home" | "search" | "create" | "reels" | "profile">("home");
  const [session, setSession] = useState<import("@supabase/supabase-js").Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);

  useEffect(() => {
    // sessão atual + listener
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });
    const sub = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  // carrega/garante profile
  useEffect(() => {
    (async () => {
      if (!session?.user) return;
      await ensureProfile(session.user.id, session.user.email);
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      setMe(data as Profile);
    })();
  }, [session?.user?.id]);

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <TopBar onLogout={async () => supabase.auth.signOut()} />

      {tab === "home" && <Feed me={me} />}
      {tab === "search" && <SearchPage />}
      {tab === "create" && <CreatePost onDone={() => setTab("home")} me={me} />}
      {tab === "reels" && <ReelsPage />}
      {tab === "profile" && <ProfilePage me={me} refreshMe={setMe} />}

      <BottomNav current={tab} onChange={setTab} />
    </div>
  );
}

// ===== Login =====
function LoginScreen() {
  return (
    <div className="min-h-screen grid place-items-center bg-neutral-50">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-center tracking-tight">LIV</h1>
        <p className="text-center text-neutral-500 mt-2">
          Compartilhe sua vida saudável
        </p>
        <button
          className="mt-8 w-full rounded-xl bg-neutral-900 text-white py-3 font-medium hover:bg-black"
          onClick={async () => {
            await supabase.auth.signInWithOAuth({
              provider: "google",
              options: { queryParams: { prompt: "select_account" } },
            });
          }}
        >
          Entrar com Google
        </button>
      </div>
    </div>
  );
}

// ===== Layout Pieces =====
function TopBar({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="sticky top-0 z-10 bg-white border-b border-neutral-200">
      <div className="max-w-3xl mx-auto h-14 flex items-center justify-between px-4">
        <div className="font-extrabold tracking-tight">LIV</div>
        <button
          onClick={onLogout}
          className="text-neutral-500 hover:text-neutral-800 rounded-lg px-2 py-1"
          title="Sair"
        >
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
  const Item = ({
    id,
    icon,
    label,
  }: {
    id: typeof current;
    icon: JSX.Element;
    label: string;
  }) => (
    <button
      className={cn(
        "flex-1 py-3 flex items-center justify-center gap-2 text-sm",
        current === id ? "text-neutral-900" : "text-neutral-400"
      )}
      onClick={() => onChange(id)}
      aria-label={label}
    >
      {icon}
    </button>
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200">
      <div className="max-w-3xl mx-auto flex">
        <Item id="home" icon={<Home />} label="Home" />
        <Item id="search" icon={<Search />} label="Buscar" />
        <Item id="create" icon={<PlusSquare />} label="Criar" />
        <Item id="reels" icon={<Clapperboard />} label="Reels" />
        <Item id="profile" icon={<User2 />} label="Perfil" />
      </div>
    </nav>
  );
}

// ===== Feed =====
function Feed({ me }: { me: Profile | null }) {
  const [posts, setPosts] = useState<Post[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("posts")
        .select("*, profiles!posts_user_id_fkey(id, username, avatar_url)")
        .order("created_at", { ascending: false })
        .limit(50);
      setPosts((data ?? []) as any);
    })();
  }, []);

  return (
    <main className="max-w-3xl mx-auto px-4 pb-24">
      {posts.map((p) => (
        <article key={p.id} className="bg-white border border-neutral-200 rounded-2xl mt-4">
          <div className="flex items-center gap-3 px-4 py-3">
            <Avatar url={p.profiles?.avatar_url} size={36} />
            <div className="font-medium">@{p.profiles?.username ?? "user"}</div>
          </div>
          <MediaView url={p.media_url} type={p.media_type} />
          {p.caption && <div className="px-4 py-3 text-sm">{p.caption}</div>}
          <div className="px-4 py-3 flex gap-4 text-neutral-600">
            <button className="hover:text-neutral-900 flex items-center gap-2">
              <Heart size={20} /> Curtir
            </button>
            <button className="hover:text-neutral-900 flex items-center gap-2">
              <MessageCircle size={20} /> Comentar
            </button>
          </div>
        </article>
      ))}
      {posts.length === 0 && (
        <div className="text-center text-neutral-500 py-12">Sem posts por enquanto.</div>
      )}
    </main>
  );
}

function MediaView({ url, type }: { url: string; type: "image" | "video" }) {
  return type === "video" ? (
    <video src={url} controls className="w-full aspect-[4/5] object-cover rounded-b-2xl" />
  ) : (
    <img src={url} className="w-full aspect-[4/5] object-cover rounded-b-2xl" />
  );
}

function Avatar({ url, size = 64 }: { url?: string | null; size?: number }) {
  return url ? (
    <img
      src={url}
      style={{ width: size, height: size }}
      className="rounded-full object-cover border border-neutral-200"
    />
  ) : (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-neutral-200 grid place-items-center text-neutral-600 font-semibold"
    >
      AN
    </div>
  );
}

// ===== Create Post (modal screen) =====
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
    const publicUrl = await uploadToStorage({ file, path, bucket: "media" });

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
                placeholder="Escreva algo…"
              />
              <div className="mt-4 flex gap-2">
                <button
                  className="px-3 py-2 rounded-xl border border-neutral-300"
                  onClick={() => setFile(null)}
                >
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

// ===== Profile =====
function ProfilePage({
  me,
  refreshMe,
}: {
  me: Profile | null;
  refreshMe: (p: Profile | null) => void;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      const { data } = await supabase
        .from("posts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setPosts((data ?? []) as any);
      setLoading(false);
    })();
  }, []);

  async function changeAvatar(file: File) {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatars/avatar.${ext}`;
    const publicUrl = await uploadToStorage({ file, path, bucket: "media" });
    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    refreshMe(data as Profile);
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
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) changeAvatar(f);
                }}
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
              {posts.map((p) =>
                p.media_type === "video" ? (
                  <video
                    key={p.id}
                    src={p.media_url}
                    className="w-full aspect-square object-cover rounded-lg"
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    key={p.id}
                    src={p.media_url}
                    className="w-full aspect-square object-cover rounded-lg"
                  />
                )
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ===== Placeholders =====
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
