import React, { useEffect, useRef, useState, useMemo } from "react";
import supabase from "./lib/supabaseClient";

/** ================================
 * Types
 * ================================ */
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
  profile?: Profile;
  likeCount?: number;
  commentCount?: number;
  likedByMe?: boolean;
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: Profile;
};

/** ================================
 * Utils
 * ================================ */
function cls(...p: (string | undefined | null | false)[]) {
  return p.filter(Boolean).join(" ");
}
const isVideoFile = (f: File) => f.type.startsWith("video/");
const fileExt = (name: string, fallback = "dat") => (name.split(".").pop() || fallback).toLowerCase();

/** ================================
 * ErrorBoundary (evita tela branca)
 * ================================ */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen grid place-items-center p-6">
          <div className="max-w-md w-full rounded-2xl border bg-white p-6">
            <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-sm text-neutral-700">{this.state.error.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** ================================
 * App
 * ================================ */
export default function App() {
  return (
    <ErrorBoundary>
      <LivetApp />
    </ErrorBoundary>
  );
}

function LivetApp() {
  const [session, setSession] = useState<import("@supabase/supabase-js").Session | null>(null);
  const [tab, setTab] = useState<"home" | "search" | "post" | "profile">("home");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const showAuth = !session;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col">
      {showAuth ? (
        <AuthScreen />
      ) : (
        <>
          <TopBar onLogout={async () => { await supabase.auth.signOut(); }} />
          <main className="flex-1">
            <div className="max-w-4xl mx-auto px-4 py-6">
              {tab === "home" && <HomeFeed />}
              {tab === "search" && <SearchSoon />}
              {tab === "post" && <UploadViaPlus />}
              {tab === "profile" && <ProfileScreen />}
            </div>
          </main>
          <BottomNav tab={tab} onChange={setTab} />
        </>
      )}
    </div>
  );
}

/** ================================
 * Auth
 * ================================ */
function AuthScreen() {
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6">
        <h1 className="text-2xl font-semibold text-center mb-2">LIVET</h1>
        <p className="text-sm text-neutral-600 text-center mb-6">Share your healthy lifestyle.</p>
        <button
          className="w-full rounded-lg bg-black text-white py-2.5 font-medium"
          onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })}
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}

/** ================================
 * TopBar / BottomNav
 * ================================ */
function TopBar({ onLogout }: { onLogout: () => void | Promise<void> }) {
  const [me, setMe] = useState<Profile | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
      setMe((prof as Profile) ?? null);
    })();
  }, []);

  return (
    <header className="sticky top-0 z-10 bg-white border-b">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="font-semibold">LIVET</div>
        <div className="flex items-center gap-3">
          {me && (
            <>
              <img
                src={me.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(me.full_name || me.username || "User")}`}
                alt="avatar"
                className="w-8 h-8 rounded-full object-cover"
              />
              <div className="text-sm text-neutral-700">{me.username ? `@${me.username}` : ""}</div>
            </>
          )}
          <button onClick={onLogout} className="text-sm text-neutral-600 hover:text-black">Logout</button>
        </div>
      </div>
    </header>
  );
}

function BottomNav({
  tab,
  onChange,
}: {
  tab: "home" | "search" | "post" | "profile";
  onChange: (t: "home" | "search" | "post" | "profile") => void;
}) {
  const items = [
    { key: "home", label: "Home" },
    { key: "search", label: "Search" },
    { key: "post", label: "Post" },
    { key: "profile", label: "Profile" },
  ] as const;

  return (
    <nav className="sticky bottom-0 bg-white border-t">
      <div className="max-w-4xl mx-auto grid grid-cols-4 h-14">
        {items.map((i) => (
          <button
            key={i.key}
            onClick={() => onChange(i.key)}
            className={cls(
              "text-sm font-medium flex items-center justify-center",
              tab === i.key ? "text-black" : "text-neutral-500"
            )}
          >
            {i.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

/** ================================
 * Feed
 * ================================ */
function HomeFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("posts")
        .select("*, profiles!posts_user_id_fkey(id, username, full_name, avatar_url)")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) console.error(error);
      const raw = (data as any[]) || [];
      // hydrate counts + likedByMe
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;

      const hydrated: Post[] = await Promise.all(
        raw.map(async (r) => {
          const base: Post = {
            id: r.id,
            user_id: r.user_id,
            media_url: r.media_url,
            media_type: r.media_type,
            caption: r.caption,
            created_at: r.created_at,
            profile: r.profiles as Profile,
          };
          const [{ count: likeCount }, { count: commentCount }] = await Promise.all([
            supabase.from("likes").select("*", { count: "exact", head: true }).eq("post_id", base.id),
            supabase.from("comments").select("*", { count: "exact", head: true }).eq("post_id", base.id),
          ]);
          let likedByMe = false;
          if (uid) {
            const { data: liked } = await supabase
              .from("likes")
              .select("id")
              .eq("post_id", base.id)
              .eq("user_id", uid)
              .maybeSingle();
            likedByMe = Boolean(liked);
          }
          return { ...base, likeCount: likeCount || 0, commentCount: commentCount || 0, likedByMe };
        })
      );

      if (alive) {
        setPosts(hydrated);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <p className="text-sm text-neutral-600">Loading…</p>;
  if (!posts.length) return <p className="text-sm text-neutral-600">No posts yet.</p>;

  return (
    <div className="grid sm:grid-cols-2 gap-6">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} onLocalChange={(patch) => {
          setPosts(prev => prev.map(x => x.id === p.id ? { ...x, ...patch } : x));
        }} />
      ))}
    </div>
  );
}

function PostCard({ post, onLocalChange }: { post: Post; onLocalChange: (patch: Partial<Post>) => void; }) {
  const [meId, setMeId] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMeId(data.session?.user.id || null));
  }, []);

  async function toggleLike() {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    if (post.likedByMe) {
      await supabase.from("likes").delete().eq("post_id", post.id).eq("user_id", uid);
      onLocalChange({ likedByMe: false, likeCount: Math.max(0, (post.likeCount ?? 1) - 1) });
    } else {
      const { error } = await supabase.from("likes").insert({ post_id: post.id, user_id: uid });
      if (!error) onLocalChange({ likedByMe: true, likeCount: (post.likeCount ?? 0) + 1 });
    }
  }

  async function deletePost() {
    if (!meId || meId !== post.user_id) return;
    if (!confirm("Delete this post?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (!error) onLocalChange({ id: post.id } as any); // caller removes card
  }

  return (
    <article className="rounded-xl border bg-white overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3">
        <img
          src={
            post.profile?.avatar_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(post.profile?.full_name || post.profile?.username || "User")}`
          }
          alt=""
          className="w-8 h-8 rounded-full object-cover"
        />
        <div className="text-sm">
          <div className="font-medium">{post.profile?.full_name || post.profile?.username || "User"}</div>
          <div className="text-neutral-500">@{post.profile?.username || ""}</div>
        </div>
        <div className="ml-auto text-xs text-neutral-500">
          {new Date(post.created_at).toLocaleDateString()}
        </div>
      </header>

      <div className="bg-black">
        {post.media_type === "video" ? (
          <video src={post.media_url} controls className="w-full h-auto" />
        ) : (
          <img
            src={post.media_url}
            alt=""
            className="w-full h-auto object-cover"
            onError={(e) => ((e.currentTarget as HTMLImageElement).src = "https://placehold.co/1200x800?text=media")}
          />
        )}
      </div>

      <footer className="px-4 py-3 flex items-center gap-4">
        <button
          onClick={toggleLike}
          className={cls("text-sm font-medium", post.likedByMe ? "text-black" : "text-neutral-600")}
        >
          {post.likedByMe ? "Unlike" : "Like"} ({post.likeCount ?? 0})
        </button>
        <button onClick={() => setShowComments(true)} className="text-sm text-neutral-600">
          Comment ({post.commentCount ?? 0})
        </button>
        {meId === post.user_id && (
          <button onClick={deletePost} className="ml-auto text-sm text-red-600">
            Delete
          </button>
        )}
      </footer>

      {showComments && (
        <CommentsModal
          postId={post.id}
          onClose={() => setShowComments(false)}
          onCommentAdded={() => onLocalChange({ commentCount: (post.commentCount ?? 0) + 1 })}
        />
      )}
    </article>
  );
}

/** ================================
 * Comments Modal
 * ================================ */
function CommentsModal({
  postId,
  onClose,
  onCommentAdded,
}: {
  postId: string;
  onClose: () => void;
  onCommentAdded: () => void;
}) {
  const [items, setItems] = useState<Comment[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("*, profiles!comments_user_id_fkey(id, username, full_name, avatar_url)")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      if (error) console.error(error);
      const mapped =
        (data as any[])?.map((r) => ({
          id: r.id,
          post_id: r.post_id,
          user_id: r.user_id,
          content: r.content,
          created_at: r.created_at,
          profile: r.profiles as Profile,
        })) ?? [];
      setItems(mapped);
    })();
  }, [postId]);

  async function send() {
    const v = text.trim();
    if (!v) return;
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return;
    const { error } = await supabase.from("comments").insert({ post_id: postId, user_id: uid, content: v });
    if (!error) {
      setText("");
      onCommentAdded();
      // reload
      const { data } = await supabase
        .from("comments")
        .select("*, profiles!comments_user_id_fkey(id, username, full_name, avatar_url)")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      const mapped =
        (data as any[])?.map((r) => ({
          id: r.id,
          post_id: r.post_id,
          user_id: r.user_id,
          content: r.content,
          created_at: r.created_at,
          profile: r.profiles as Profile,
        })) ?? [];
      setItems(mapped);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4 z-20" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Comments</div>
          <button className="text-sm text-neutral-600" onClick={onClose}>Close</button>
        </div>
        <div className="max-h-64 overflow-auto space-y-3 mb-3">
          {items.length === 0 ? (
            <div className="text-sm text-neutral-600">Be the first to comment.</div>
          ) : (
            items.map((c) => (
              <div key={c.id} className="flex gap-3">
                <img
                  src={
                    c.profile?.avatar_url ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(c.profile?.full_name || c.profile?.username || "User")}`
                  }
                  className="w-7 h-7 rounded-full object-cover"
                />
                <div className="text-sm">
                  <div className="font-medium">{c.profile?.username ? `@${c.profile.username}` : "user"}</div>
                  <div className="text-neutral-800">{c.content}</div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a comment…"
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button onClick={send} className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

/** ================================
 * Upload (via botão +)
 * ================================ */
function UploadViaPlus() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // abre seletor ao entrar
    const t = setTimeout(() => inputRef.current?.click(), 50);
    return () => clearTimeout(t);
  }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id!;
      const ext = fileExt(f.name, isVideoFile(f) ? "mp4" : "jpg");
      const path = `${uid}/${Date.now()}.${ext}`;

      const up = await supabase.storage.from("posts").upload(path, f, { upsert: false, cacheControl: "3600" });
      if (up.error) throw up.error;
      const { data } = supabase.storage.from("posts").getPublicUrl(path);
      const publicUrl = data.publicUrl;

      const { error: insErr } = await supabase.from("posts").insert({
        user_id: uid,
        media_url: publicUrl,
        media_type: isVideoFile(f) ? "video" : "image",
        caption: null,
      });
      if (insErr) throw insErr;

      alert("Posted!");
    } catch (e) {
      console.error(e);
      alert("Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="py-16 grid place-items-center">
      <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={onPick} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-lg bg-black text-white px-5 py-2.5 font-medium disabled:opacity-60"
      >
        {busy ? "Uploading…" : "Select photo/video"}
      </button>
      <p className="text-xs text-neutral-500 mt-2">After selection, the post appears in Home.</p>
    </section>
  );
}

/** ================================
 * Profile
 * ================================ */
function ProfileScreen() {
  const [me, setMe] = useState<Profile | null>(null);
  const [counts, setCounts] = useState({ posts: 0, followers: 0, following: 0 });
  const [mine, setMine] = useState<Post[]>([]);
  const avatarInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id!;
      const [{ data: prof }, { count: cPosts }, myPosts, f1, f2] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase.from("posts").select("*", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("posts").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(60),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", uid),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", uid),
      ]);
      if (!alive) return;
      setMe((prof as Profile) ?? null);
      setCounts({
        posts: cPosts || 0,
        followers: f1.count || 0,
        following: f2.count || 0,
      });
      setMine((myPosts.data as Post[]) || []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function changeAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !me) return;
    try {
      const ext = fileExt(f.name, "jpg");
      const path = `${me.id}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("avatars").upload(path, f, { upsert: true });
      if (up.error) throw up.error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", me.id);
      setMe({ ...me, avatar_url: data.publicUrl });
    } catch (e) {
      console.error(e);
      alert("Could not update avatar.");
    } finally {
      if (avatarInput.current) avatarInput.current.value = "";
    }
  }

  async function deleteMine(p: Post) {
    if (!me || p.user_id !== me.id) return;
    if (!confirm("Delete this post?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", p.id);
    if (!error) setMine((prev) => prev.filter((x) => x.id !== p.id));
  }

  if (!me) return <p className="text-sm text-neutral-600">Loading…</p>;

  return (
    <section className="grid gap-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <img
            src={me.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(me.full_name || me.username || "User")}`}
            className="w-20 h-20 rounded-full object-cover border"
          />
          <button
            onClick={() => avatarInput.current?.click()}
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-xs bg-black text-white px-2 py-0.5 rounded"
          >
            Change
          </button>
          <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={changeAvatar} />
        </div>
        <div>
          <div className="text-xl font-semibold">{me.full_name || me.username || "Profile"}</div>
          <div className="text-neutral-600">@{me.username || ""}</div>
          <div className="flex gap-6 mt-2 text-sm">
            <div><span className="font-semibold">{counts.posts}</span> Posts</div>
            <div><span className="font-semibold">{counts.followers}</span> Followers</div>
            <div><span className="font-semibold">{counts.following}</span> Following</div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-neutral-700 mb-3">Your posts</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {mine.map((p) => (
            <div key={p.id} className="relative rounded-lg overflow-hidden border bg-white">
              {p.media_type === "video" ? (
                <video src={p.media_url} className="w-full aspect-square object-cover" />
              ) : (
                <img src={p.media_url} className="w-full aspect-square object-cover" />
              )}
              <button
                onClick={() => deleteMine(p)}
                className="absolute top-2 right-2 text-xs bg-white/90 border rounded px-2 py-0.5"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** ================================
 * Search placeholder
 * ================================ */
function SearchSoon() {
  return (
    <div className="text-sm text-neutral-600">Search and discovery coming soon.</div>
  );
}
