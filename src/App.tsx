// src/App.tsx
import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// ---- Supabase client ----
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
const supabaseAnon = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string;
export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: { persistSession: true, flowType: "pkce", detectSessionInUrl: true },
});

// ---- Types ----
type Profile = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  followers_count?: number | null;
  following_count?: number | null;
  posts_count?: number | null;
};

type Post = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string | null;
  created_at: string;
  author?: Pick<Profile, "id" | "full_name" | "username" | "avatar_url">;
  likes_count?: number;
  comments_count?: number;
  liked_by_me?: boolean;
};

// ---- Helpers ----
const isVideo = (file: File) =>
  file.type.startsWith("video/") ||
  /\.(mp4|mov|webm|m4v)$/i.test(file.name || "");

const mediaTypeFromUrl = (url: string): "image" | "video" =>
  /\.(mp4|mov|webm|m4v)$/i.test(url) ? "video" : "image";

// ---- UI ----
function Btn(props: JSX.IntrinsicElements["button"]) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50 ${className}`}
    />
  );
}

function Modal({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-black">
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ---- Main App ----
export default function App() {
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [view, setView] = useState<"home" | "search" | "post" | "profile">("home");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [feed, setFeed] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  // comments
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [activePost, setActivePost] = useState<Post | null>(null);
  const [comments, setComments] = useState<
    { id: string; content: string; user: Pick<Profile, "username" | "avatar_url"> }[]
  >([]);
  const [newComment, setNewComment] = useState("");

  // edit profile
  const [editOpen, setEditOpen] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editUsername, setEditUsername] = useState("");

  // refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // ---- Auth ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setSessionLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUserId(s?.user?.id ?? null);
      setSessionLoaded(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ---- Ensure profile exists ----
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    (async () => {
      await supabase.from("profiles").upsert({ id: userId }, { onConflict: "id" });

      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .eq("id", userId)
        .maybeSingle();
      setProfile(
        data ?? { id: userId, full_name: null, username: null, avatar_url: null }
      );
    })();
  }, [userId]);

  // ---- Feed ----
  useEffect(() => {
    if (!sessionLoaded) return;
    (async () => {
      const { data, error } = await supabase
        .from("posts")
        .select(
          `
          id, user_id, media_url, media_type, caption, created_at,
          author:profiles ( id, full_name, username, avatar_url ),
          likes_count:likes(count),
          comments_count:comments(count)
        `
        )
        .order("created_at", { ascending: false });

      if (!error) {
        const ids = data?.map((p) => p.id) ?? [];
        let liked: Record<string, boolean> = {};
        if (userId && ids.length) {
          const { data: myLikes } = await supabase
            .from("likes")
            .select("post_id")
            .eq("user_id", userId)
            .in("post_id", ids);
          liked = Object.fromEntries((myLikes ?? []).map((l) => [l.post_id, true]));
        }
        setFeed(
          (data ?? []).map((p: any) => ({
            ...p,
            likes_count: p.likes_count?.[0]?.count ?? 0,
            comments_count: p.comments_count?.[0]?.count ?? 0,
            liked_by_me: liked[p.id] ?? false,
          }))
        );
      }
    })();
  }, [sessionLoaded, userId, view]);

  // ---- Actions ----
  async function signIn() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: false,
      },
    });
    if (error) alert(error.message);
    if (data?.url) window.location.href = data.url;
  }
  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) alert(error.message);
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !userId) return;
    setLoading(true);
    try {
      const ext = f.name.split(".").pop() || (isVideo(f) ? "mp4" : "jpg");
      const path = `posts/${userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, f, { upsert: true, contentType: f.type || undefined });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      const media_url = pub.publicUrl;
      const media_type = isVideo(f) ? "video" : "image";

      const { error: insErr } = await supabase
        .from("posts")
        .insert({ user_id: userId, media_url, media_type, caption: null });
      if (insErr) throw insErr;

      setView("home");
    } catch (err: any) {
      alert(err.message || "Upload failed.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function openAvatarPicker() {
    avatarInputRef.current?.click();
  }
  async function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !userId) return;
    setLoading(true);
    try {
      const ext = f.name.split(".").pop() || "jpg";
      const path = `avatars/${userId}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, f, { upsert: true, contentType: f.type || undefined });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      const avatar_url = pub.publicUrl;

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url })
        .eq("id", userId)
        .select()
        .maybeSingle();
      if (updErr) throw updErr;

      setProfile((p) => (p ? { ...p, avatar_url } : p));
    } catch (err: any) {
      alert(err.message || "Could not update avatar.");
    } finally {
      setLoading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function toggleLike(post: Post) {
    if (!userId) return;
    if (post.liked_by_me) {
      await supabase.from("likes").delete().eq("post_id", post.id).eq("user_id", userId);
      setFeed((arr) =>
        arr.map((p) =>
          p.id === post.id
            ? { ...p, liked_by_me: false, likes_count: (p.likes_count ?? 1) - 1 }
            : p
        )
      );
    } else {
      await supabase.from("likes").insert({ post_id: post.id, user_id: userId });
      setFeed((arr) =>
        arr.map((p) =>
          p.id === post.id
            ? { ...p, liked_by_me: true, likes_count: (p.likes_count ?? 0) + 1 }
            : p
        )
      );
    }
  }

  async function openComments(post: Post) {
    setActivePost(post);
    setCommentsOpen(true);
    const { data } = await supabase
      .from("comments")
      .select("id, content, user:profiles(username, avatar_url)")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });
    setComments(
      (data ?? []).map((c: any) => ({
        id: c.id,
        content: c.content,
        user: c.user,
      }))
    );
  }

  async function submitComment() {
    if (!activePost || !userId || !newComment.trim()) return;
    const content = newComment.trim();
    const { error } = await supabase
      .from("comments")
      .insert({ post_id: activePost.id, user_id: userId, content });
    if (error) {
      alert("Could not comment.");
      return;
    }
    setNewComment("");
    openComments(activePost);
    setFeed((arr) =>
      arr.map((p) =>
        p.id === activePost.id
          ? { ...p, comments_count: (p.comments_count ?? 0) + 1 }
          : p
      )
    );
  }

  async function deletePost(post: Post) {
    if (!userId || post.user_id !== userId) return;
    if (!confirm("Delete this post?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) {
      alert("Could not delete.");
      return;
    }
    setFeed((arr) => arr.filter((p) => p.id !== post.id));
  }

  function openEditProfile() {
    if (!profile) return;
    setEditFullName(profile.full_name ?? "");
    setEditUsername(profile.username ?? "");
    setEditOpen(true);
  }

  async function saveProfile() {
    if (!userId) return;
    const payload: Partial<Profile> = {
      full_name: editFullName.trim() || null,
      username: editUsername.trim() || null,
    };
    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId)
      .select()
      .maybeSingle();
    if (error) {
      alert(error.message);
      return;
    }
    setProfile((p) => (p ? { ...p, ...payload } : p));
    setEditOpen(false);
  }

  // ---- Render ----
  const signedIn = !!userId;

  const avatar = (
    <div className="relative h-20 w-20 shrink-0">
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          className="h-20 w-20 rounded-full object-cover border"
          alt="avatar"
        />
      ) : (
        <div className="h-20 w-20 rounded-full bg-gray-200 grid place-items-center text-gray-500 border">
          IMG
        </div>
      )}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatar}
      />
      <button
        onClick={openAvatarPicker}
        className="absolute bottom-0 right-0 text-xs rounded-md bg-black/70 text-white px-2 py-0.5"
      >
        Change
      </button>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="font-bold tracking-wide">LIVET</div>
          <div className="flex items-center gap-2">
            {!signedIn ? (
              <Btn onClick={signIn}>Sign in with Google</Btn>
            ) : (
              <Btn onClick={signOut}>Logout</Btn>
            )}
          </div>
        </div>
      </div>

      {/* Profile header */}
      {signedIn && profile && (
        <div className="px-4 py-4 border-b">
          <div className="flex items-center gap-4">
            {avatar}
            <div className="min-w-0">
              <div className="text-lg font-semibold truncate">
                {profile.full_name || "Your name"}
              </div>
              <div className="text-gray-500 truncate">
                @{profile.username || "username"}
              </div>
              <div className="mt-2 flex gap-6 text-sm">
                <div>
                  <b>{feed.filter((p) => p.user_id === profile.id).length}</b> posts
                </div>
                <div>
                  <b>{profile.followers_count ?? 0}</b> followers
                </div>
                <div>
                  <b>{profile.following_count ?? 0}</b> following
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <Btn onClick={openEditProfile}>Edit profile</Btn>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-around border-b text-sm">
        {(["home", "search", "post", "profile"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setView(t);
              if (t === "post") openFilePicker();
            }}
            className={`py-3 w-full ${view === t ? "font-semibold" : ""}`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleUpload}
      />

      {/* Views */}
      <div className="p-4">
        {(view === "home" || view === "profile") && (
          <>
            {!feed.length && (
              <div className="text-center text-gray-500 py-20">No posts yet.</div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {feed
                .filter((p) => (view === "profile" && userId ? p.user_id === userId : true))
                .map((p) => (
                  <div key={p.id} className="relative">
                    <div className="aspect-square overflow-hidden rounded-xl border">
                      {p.media_type === "image" ? (
                        <img src={p.media_url} className="h-full w-full object-cover" />
                      ) : (
                        <video
                          src={p.media_url}
                          className="h-full w-full object-cover"
                          playsInline
                          muted
                          preload="metadata"
                          controls
                        />
                      )}
                    </div>

                    {/* Post actions */}
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleLike(p)}
                          className={p.liked_by_me
