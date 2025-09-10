// src/App.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, User, Session } from "@supabase/supabase-js";
import {
  Home,
  Search,
  PlusSquare,
  Film,
  User2,
  LogOut,
  Heart,
  MessageSquare,
  Trash2,
  Camera,
} from "lucide-react";

// -------- Supabase client (usa suas envs do Vite) ----------
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
}
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { headers: { "x-application-name": "livet" } },
});

// ----------------- Tipos -----------------
type DBPost = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string | null;
  created_at: string;
};

type DBProfile = {
  id: string; // user id
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  followers_count: number;
  following_count: number;
  posts_count?: number;
};

type DBLike = {
  post_id: string;
  user_id: string;
};

type DBComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: DBProfile; // if joined
};

// ----------------- UI Helpers -----------------
function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={
        "rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium hover:bg-neutral-50 " +
        "disabled:cursor-not-allowed disabled:opacity-50 " +
        className
      }
    />
  );
}

function IconButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button
      {...rest}
      className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-neutral-100"
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="w-full max-w-3xl px-4 py-4">
      {title ? <h2 className="mb-3 text-lg font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}

// -------------- Auth Gate ---------------
function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, session, loading };
}

// -------------- Upload helpers ---------------
async function uploadToStorage(opts: {
  file: File;
  folder: "posts" | "avatars";
  userId: string;
}) {
  const { file, folder, userId } = opts;

  // nome único
  const ext = file.name.split(".").pop() || (file.type.includes("png") ? "png" : "jpg");
  const path = `${folder}/${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from("media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("media").getPublicUrl(path);
  return data.publicUrl;
}

function getMediaType(file: File): "image" | "video" {
  if (file.type.startsWith("video")) return "video";
  return "image";
}

// -------------- Views -----------------
type Tab = "home" | "search" | "create" | "reels" | "profile";

export default function App() {
  const { user, loading } = useAuth();
  const [active, setActive] = useState<Tab>("home");

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center text-sm text-neutral-600">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Topbar */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <div className="text-xl font-semibold tracking-tight">LIVET</div>
          <UserHeader userId={user.id} />
          <Button
            onClick={async () => {
              await supabase.auth.signOut();
              location.reload();
            }}
          >
            <div className="flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </div>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-5xl pb-20">
        {active === "home" && <HomeFeed currentUser={user} />}
        {active === "search" && <SearchView />}
        {active === "create" && <CreatePost currentUser={user} />}
        {active === "reels" && <ReelsView />}
        {active === "profile" && <ProfileView currentUser={user} />}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-neutral-200 bg-white">
        <div className="mx-auto grid max-w-5xl grid-cols-5 px-2 py-2">
          <NavItem icon={<Home />} label="Home" active={active === "home"} onClick={() => setActive("home")} />
          <NavItem icon={<Search />} label="Search" active={active === "search"} onClick={() => setActive("search")} />
          <NavItem
            icon={<PlusSquare />}
            label="Create"
            active={active === "create"}
            onClick={() => setActive("create")}
          />
          <NavItem icon={<Film />} label="Reels" active={active === "reels"} onClick={() => setActive("reels")} />
          <NavItem
            icon={<User2 />}
            label="Profile"
            active={active === "profile"}
            onClick={() => setActive("profile")}
          />
        </div>
      </nav>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-1 text-xs ${active ? "text-black" : "text-neutral-500"}`}
    >
      <div className={`h-6 w-6 ${active ? "" : "opacity-70"}`}>{icon}</div>
      <span className="hidden sm:block">{label}</span>
    </button>
  );
}

// -------------- Auth Screen --------------
function AuthScreen() {
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) alert(error.message);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 p-6 shadow-sm">
        <h1 className="mb-2 text-center text-2xl font-bold tracking-tight">LIVET</h1>
        <p className="mb-6 text-center text-sm text-neutral-600">Share your healthy lifestyle.</p>
        <Button className="w-full" onClick={signIn} disabled={loading}>
          Sign in with Google
        </Button>
      </div>
    </div>
  );
}

// -------------- User Header (avatar + username) --------------
function UserHeader({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<DBProfile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      // garante que há profile
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, followers_count, following_count")
        .eq("id", userId)
        .maybeSingle();
      if (data) setProfile(data as DBProfile);
    })();
  }, [userId]);

  const onPickAvatar = () => fileRef.current?.click();

  const onChangeAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const publicUrl = await uploadToStorage({ file, folder: "avatars", userId });
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);
      if (error) throw error;
      setProfile((p) => (p ? { ...p, avatar_url: publicUrl } : p));
    } catch (err: any) {
      alert("Could not update avatar.");
      console.error(err);
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-9 w-9 overflow-hidden rounded-full ring-1 ring-neutral-200">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="avatar" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-xs">IMG</div>
        )}
        <button
          title="Change avatar"
          onClick={onPickAvatar}
          className="absolute -right-1 -bottom-1 rounded-full bg-white p-0.5 shadow ring-1 ring-neutral-200"
        >
          <Camera className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold leading-none">{profile?.display_name || profile?.username}</span>
        <span className="text-xs text-neutral-500">@{profile?.username}</span>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onChangeAvatar} />
    </div>
  );
}

// -------------- Home Feed --------------
function HomeFeed({ currentUser }: { currentUser: User }) {
  const [posts, setPosts] = useState<DBPost[]>([]);
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [openCommentsFor, setOpenCommentsFor] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error(error);
      return;
    }
    setPosts(data as DBPost[]);

    // user likes map
    const ids = (data || []).map((p) => p.id);
    if (ids.length) {
      const { data: mylikes } = await supabase.from("likes").select("post_id").in("post_id", ids).eq("user_id", currentUser.id);
      const map: Record<string, boolean> = {};
      (mylikes || []).forEach((l) => (map[l.post_id] = true));
      setLikes(map);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleLike = async (postId: string) => {
    try {
      if (likes[postId]) {
        const { error } = await supabase.from("likes").delete().match({ post_id: postId, user_id: currentUser.id });
        if (error) throw error;
        setLikes((m) => ({ ...m, [postId]: false }));
      } else {
        const { error } = await supabase.from("likes").insert({ post_id: postId, user_id: currentUser.id });
        if (error) throw error;
        setLikes((m) => ({ ...m, [postId]: true }));
      }
    } catch (e) {
      alert("Could not update like.");
      console.error(e);
    }
  };

  const onDelete = async (postId: string) => {
    if (!confirm("Delete this post?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", postId).eq("user_id", currentUser.id);
    if (error) {
      alert("Could not delete.");
      console.error(error);
    } else {
      setPosts((p) => p.filter((x) => x.id !== postId));
    }
  };

  return (
    <>
      <Section>
        {posts.length === 0 ? (
          <div className="py-24 text-center text-sm text-neutral-500">No posts yet.</div>
        ) : (
          <ul className="flex flex-col gap-10">
            {posts.map((p) => (
              <li key={p.id} className="rounded-2xl border border-neutral-200">
                {/* media */}
                <div className="aspect-[4/5] w-full overflow-hidden bg-neutral-100">
                  {p.media_type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.media_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <video
                      src={p.media_url}
                      controls
                      playsInline
                      className="h-full w-full object-cover"
                      preload="metadata"
                    />
                  )}
                </div>

                {/* actions */}
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <IconButton onClick={() => toggleLike(p.id)}>
                      <Heart className={`h-5 w-5 ${likes[p.id] ? "fill-red-500 text-red-500" : ""}`} />
                    </IconButton>
                    <IconButton onClick={() => setOpenCommentsFor(p.id)}>
                      <MessageSquare className="h-5 w-5" />
                    </IconButton>
                  </div>
                  {p.user_id === currentUser.id && (
                    <IconButton onClick={() => onDelete(p.id)}>
                      <Trash2 className="h-5 w-5 text-neutral-700" />
                    </IconButton>
                  )}
                </div>

                {/* caption */}
                {p.caption ? (
                  <div className="px-3 pb-3 text-sm text-neutral-800">{p.caption}</div>
                ) : null}

                {openCommentsFor === p.id && (
                  <CommentsSheet postId={p.id} onClose={() => setOpenCommentsFor(null)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

// -------------- Comments --------------
function CommentsSheet({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [items, setItems] = useState<DBComment[]>([]);
  const [text, setText] = useState("");

  const load = async () => {
    const { data, error } = await supabase
      .from("comments")
      .select("id, post_id, user_id, content, created_at, profiles(id,username,display_name,avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (!error) setItems(data as any);
  };

  useEffect(() => {
    load();
  }, [postId]);

  const onSend = async () => {
    if (!text.trim()) return;
    const { error } = await supabase.from("comments").insert({ post_id: postId, content: text });
    if (error) {
      alert("Could not comment.");
      console.error(error);
      return;
    }
    setText("");
    load();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="font-medium">Comments</div>
          <Button onClick={onClose}>Close</Button>
        </div>
        <div className="max-h-[50vh] space-y-3 overflow-y-auto px-4 py-3">
          {items.length === 0 ? (
            <div className="py-8 text-center text-sm text-neutral-500">Be the first to comment</div>
          ) : (
            items.map((c) => (
              <div key={c.id} className="flex items-start gap-3">
                <div className="h-7 w-7 overflow-hidden rounded-full bg-neutral-100" />
                <div className="rounded-2xl bg-neutral-100 px-3 py-2 text-sm">{c.content}</div>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2 border-t p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-400"
          />
          <Button onClick={onSend}>Send</Button>
        </div>
      </div>
    </div>
  );
}

// -------------- Create Post --------------
function CreatePost({ currentUser }: { currentUser: User }) {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaType = useMemo(() => (file ? getMediaType(file) : null), [file]);

  const pick = () => inputRef.current?.click();

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
  };

  const onPublish = async () => {
    if (!file) return;
    try {
      const url = await uploadToStorage({ file, folder: "posts", userId: currentUser.id });
      const { error } = await supabase
        .from("posts")
        .insert({
          media_url: url,
          media_type: mediaType,
          caption: caption || null,
        } as any);
      if (error) throw error;
      alert("Your post is live in Home.");
      setFile(null);
      setCaption("");
    } catch (e: any) {
      alert("Upload failed.");
      console.error(e);
    }
  };

  return (
    <Section title="Create new post">
      <div className="rounded-2xl border border-neutral-200 p-4">
        {!file ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-sm text-neutral-600">Select a photo or video to share</p>
            <Button onClick={pick}>Select photo / video</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="aspect-[4/5] w-full overflow-hidden rounded-lg bg-neutral-100">
              {mediaType === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={URL.createObjectURL(file)} alt="" className="h-full w-full object-cover" />
              ) : (
                <video
                  src={URL.createObjectURL(file)}
                  controls
                  playsInline
                  className="h-full w-full object-cover"
                  preload="metadata"
                />
              )}
            </div>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption (optional)"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-400"
            />
            <div className="flex items-center justify-end gap-2">
              <Button onClick={() => setFile(null)} className="border-neutral-300">
                Clear
              </Button>
              <Button onClick={onPublish}>Publish</Button>
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={onChange}
        />
      </div>
    </Section>
  );
}

// -------------- Profile --------------
function ProfileView({ currentUser }: { currentUser: User }) {
  const [profile, setProfile] = useState<DBProfile | null>(null);
  const [posts, setPosts] = useState<DBPost[]>([]);

  const load = async () => {
    const [{ data: prof }, { data: postsData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, followers_count, following_count")
        .eq("id", currentUser.id)
        .maybeSingle(),
      supabase.from("posts").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: false }),
    ]);
    if (prof) {
      const p = prof as DBProfile;
      p.posts_count = (postsData || []).length;
      setProfile(p);
    }
    setPosts((postsData as DBPost[]) || []);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <Section>
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full ring-1 ring-neutral-200">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-sm">IMG</div>
            )}
          </div>
          <div className="flex flex-col">
            <div className="text-xl font-semibold leading-tight">
              {profile?.display_name || profile?.username}
            </div>
            <div className="text-sm text-neutral-500">@{profile?.username}</div>
            <div className="mt-3 flex gap-6 text-sm">
              <div>
                <span className="font-semibold">{profile?.posts_count ?? 0}</span> posts
              </div>
              <div>
                <span className="font-semibold">{profile?.followers_count ?? 0}</span> followers
              </div>
              <div>
                <span className="font-semibold">{profile?.following_count ?? 0}</span> following
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section>
        {posts.length === 0 ? (
          <div className="py-24 text-center text-sm text-neutral-500">No posts yet.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {posts.map((p) => (
              <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg bg-neutral-100">
                {p.media_type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.media_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <video src={p.media_url} className="h-full w-full object-cover" controls playsInline preload="metadata" />
                )}
                <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/20 group-hover:flex" />
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

// -------------- Other tabs --------------
function SearchView() {
  return (
    <Section title="Search">
      <div className="rounded-2xl border border-neutral-200 p-6 text-sm text-neutral-600">
        Coming soon.
      </div>
    </Section>
  );
}

function ReelsView() {
  return (
    <Section title="Reels">
      <div className="rounded-2xl border border-neutral-200 p-6 text-sm text-neutral-600">
        Coming soon.
      </div>
    </Section>
  );
}
