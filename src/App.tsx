import { useEffect, useRef, useState } from "react";
import supabase from "./lib/supabaseClient";
import "./index.css";

/* ===================== Tipos ===================== */
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
  author?: Profile;
};

/* ===================== Utils ===================== */
function cls(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
function mediaTypeFromFile(file: File): "image" | "video" {
  return file.type.startsWith("video") ? "video" : "image";
}
async function publicUrl(path: string) {
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}

/* ===================== App ===================== */
export default function App() {
  const [me, setMe] = useState<Profile | null>(null);
  const [tab, setTab] = useState<"home" | "search" | "upload" | "profile">(
    "home"
  );

  useEffect(() => {
    const boot = async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      if (!u) {
        await supabase.auth.signInWithOAuth({ provider: "google" });
        return;
      }
      // garantir profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .eq("id", u.id)
        .maybeSingle();

      if (!prof) {
        const username =
          u.user_metadata?.preferred_username ||
          (u.email ? u.email.split("@")[0] : `user_${u.id.slice(0, 6)}`);
        const full_name =
          u.user_metadata?.full_name || u.user_metadata?.name || username;

        const { data: created } = await supabase
          .from("profiles")
          .upsert({ id: u.id, username, full_name, avatar_url: null })
          .select()
          .single();
        setMe(created as Profile);
      } else {
        setMe(prof as Profile);
      }
    };
    boot();
  }, []);

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-neutral-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-3xl mx-auto">
      <TopBar onLogout={() => supabase.auth.signOut()} />
      {tab === "home" && <HomeFeed me={me} />}
      {tab === "search" && <SearchPlaceholder />}
      {tab === "upload" && <Uploader me={me} onDone={() => setTab("home")} />}
      {tab === "profile" && <ProfileView me={me} onProfileChange={setMe} />}
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

/* ===================== Top/Bottom ===================== */
function TopBar({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
      <div className="mx-auto max-w-3xl flex items-center justify-between px-4 py-3">
        <div className="font-semibold">LIVET</div>
        <button
          onClick={onLogout}
          className="text-xs text-neutral-500 hover:text-neutral-800"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
function BottomNav({
  tab,
  setTab,
}: {
  tab: "home" | "search" | "upload" | "profile";
  setTab: (t: "home" | "search" | "upload" | "profile") => void;
}) {
  const items: { key: typeof tab; label: string }[] = [
    { key: "home", label: "Home" },
    { key: "search", label: "Search" },
    { key: "upload", label: "Post" }, // botão + (abre seletor)
    { key: "profile", label: "Profile" },
  ];
  return (
    <div className="sticky bottom-0 bg-white/80 backdrop-blur border-t">
      <div className="max-w-3xl mx-auto grid grid-cols-4 text-sm">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={() => setTab(it.key)}
            className={cls(
              "py-3",
              tab === it.key ? "text-black font-medium" : "text-neutral-500"
            )}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ===================== Feed ===================== */
function HomeFeed({ me }: { me: Profile }) {
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);

  const load = async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      setPosts([]);
      setLoading(false);
      return;
    }
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: authors } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", userIds);

    const postIds = rows.map((r) => r.id);
    const [{ data: myLikes }, { data: likeAgg }, { data: commentAgg }] =
      await Promise.all([
        supabase
          .from("likes")
          .select("post_id")
          .eq("user_id", me.id)
          .in("post_id", postIds),
        supabase
          .from("likes")
          .select("post_id, count:id", { count: "exact" })
          .in("post_id", postIds),
        supabase
          .from("comments")
          .select("post_id, count:id", { count: "exact" })
          .in("post_id", postIds),
      ]);

    const authorMap = new Map((authors || []).map((a) => [a.id, a]));
    const likedSet = new Set((myLikes || []).map((x) => x.post_id));
    const likeMap = new Map<string, number>();
    (likeAgg || []).forEach((r: any) => likeMap.set(r.post_id, r.count));
    const commentMap = new Map<string, number>();
    (commentAgg || []).forEach((r: any) => commentMap.set(r.post_id, r.count));

    const full: Post[] = rows.map((r: any) => ({
      ...r,
      author: authorMap.get(r.user_id),
      likedByMe: likedSet.has(r.id),
      likeCount: likeMap.get(r.id) || 0,
      commentCount: commentMap.get(r.id) || 0,
    }));

    setPosts(full);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("posts-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts" },
        () => load()
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="p-6 text-sm text-neutral-500">Loading…</div>;
  if (!posts.length)
    return <div className="p-6 text-sm text-neutral-500">No posts yet.</div>;

  return (
    <div className="divide-y">
      {posts.map((p) => (
        <PostCard key={p.id} me={me} post={p} onChanged={load} />
      ))}
    </div>
  );
}

function PostCard({
  me,
  post,
  onChanged,
}: {
  me: Profile;
  post: Post;
  onChanged: () => void;
}) {
  const isOwner = me.id === post.user_id;
  const [busy, setBusy] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const toggleLike = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (post.likedByMe) {
        await supabase
          .from("likes")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", me.id);
      } else {
        await supabase.from("likes").insert({ post_id: post.id, user_id: me.id });
      }
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const deletePost = async () => {
    if (!isOwner) return;
    if (!confirm("Delete this post?")) return;
    await supabase.from("posts").delete().eq("id", post.id);
    onChanged();
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-2">
        <Avatar url={post.author?.avatar_url} size={36} />
        <div>
          <div className="text-sm font-medium">
            {post.author?.full_name || "User"}
          </div>
          <div className="text-xs text-neutral-500">
            @{post.author?.username || "user"}
          </div>
        </div>
        {isOwner && (
          <button
            onClick={deletePost}
            className="ml-auto text-xs text-red-600 hover:underline"
          >
            Delete
          </button>
        )}
      </div>

      <div className="rounded-xl overflow-hidden bg-black">
        {post.media_type === "video" ? (
          <video
            src={post.media_url}
            className="w-full h-auto"
            controls
            preload="metadata"
            playsInline
          />
        ) : (
          <img src={post.media_url} alt="" className="w-full h-auto object-cover" />
        )}
      </div>

      <div className="mt-2 flex items-center gap-4 text-sm">
        <button
          onClick={toggleLike}
          className={cls(
            "hover:underline",
            post.likedByMe ? "text-black" : "text-neutral-600"
          )}
          disabled={busy}
        >
          {post.likedByMe ? "Unlike" : "Like"} ({post.likeCount || 0})
        </button>
        <button
          onClick={() => setShowComments(true)}
          className="text-neutral-600 hover:underline"
        >
          Comment ({post.commentCount || 0})
        </button>
      </div>

      {showComments && (
        <CommentsDialog postId={post.id} onClose={() => setShowComments(false)} />
      )}
    </div>
  );
}

/* ===================== Comments ===================== */
function CommentsDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [list, setList] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    const userIds = Array.from(new Set((data || []).map((c: any) => c.user_id)));
    const { data: authors } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", userIds);

    const map = new Map((authors || []).map((a) => [a.id, a]));
    setList(
      (data || []).map((c: any) => ({
        ...c,
        author: map.get(c.user_id),
      }))
    );
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await supabase.from("comments").insert({ post_id: postId, content: text.trim() });
      setText("");
      await load();
    } catch {
      alert("Could not comment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center sm:justify-center p-4">
      <div className="bg-white w-full sm:max-w-md rounded-2xl shadow-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium">Comments</div>
          <button className="text-sm text-neutral-500 hover:underline" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="space-y-3 max-h-72 overflow-auto">
          {list.length === 0 && (
            <div className="text-sm text-neutral-500">Be the first to comment</div>
          )}
          {list.map((c) => (
            <div key={c.id} className="flex items-start gap-3">
              <Avatar url={c.author?.avatar_url} size={28} />
              <div className="text-sm">
                <div className="font-medium">
                  {c.author?.full_name || "User"}{" "}
                  <span className="text-neutral-500">@{c.author?.username || "user"}</span>
                </div>
                <div>{c.content}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a comment…"
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={send}
            disabled={busy}
            className="px-3 py-2 text-sm rounded-lg bg-black text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===================== Profile ===================== */
function ProfileView({
  me,
  onProfileChange,
}: {
  me: Profile;
  onProfileChange: (p: Profile) => void;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState({ posts: 0, followers: 0, following: 0 });
  const [editOpen, setEditOpen] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [{ data: myPosts }, { count: followers }, { count: following }] =
      await Promise.all([
        supabase.from("posts").select("*").eq("user_id", me.id).order("created_at", { ascending: false }),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", me.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", me.id),
      ]);

    setPosts((myPosts as any) || []);
    setStats({ posts: (myPosts || []).length, followers: followers ?? 0, following: following ?? 0 });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const ext = f.name.split(".").pop();
      const path = `avatars/${me.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, f, { upsert: true });
      if (upErr) throw upErr;
      const url = await publicUrl(path);
      const { data, error } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", me.id)
        .select()
        .single();
      if (error) throw error;
      onProfileChange(data as Profile);
    } catch (err) {
      console.error(err);
      alert("Could not update avatar.");
    } finally {
      if (avatarInput.current) avatarInput.current.value = "";
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Avatar url={me.avatar_url} size={84} />
          <div>
            <div className="text-lg font-semibold">{me.full_name || "User"}</div>
            <div className="text-neutral-500">@{me.username || "user"}</div>
            <div className="mt-2 flex gap-6 text-sm">
              <span>{stats.posts} posts</span>
              <span>{stats.followers} followers</span>
              <span>{stats.following} following</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => avatarInput.current?.click()}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-neutral-50"
          >
            Change photo
          </button>
          <button
            onClick={() => setEditOpen(true)}
            className="px-3 py-2 text-sm rounded-lg bg-black text-white"
          >
            Edit profile
          </button>
          <input
            ref={avatarInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={changeAvatar}
          />
        </div>
      </div>

      {/* Grid de posts */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {posts.map((p) => (
          <div key={p.id} className="aspect-square rounded-xl overflow-hidden bg-neutral-100">
            {p.media_type === "video" ? (
              <video className="w-full h-full object-cover" src={p.media_url} muted playsInline preload="metadata" />
            ) : (
              <img className="w-full h-full object-cover" src={p.media_url} alt="" loading="lazy" />
            )}
          </div>
        ))}
      </div>

      {editOpen && (
        <EditProfileDialog
          me={me}
          onClose={() => setEditOpen(false)}
          onSaved={(p) => {
            onProfileChange(p);
            setEditOpen(false);
          }}
        />
      )}
    </div>
  );
}

function EditProfileDialog({
  me,
  onClose,
  onSaved,
}: {
  me: Profile;
  onClose: () => void;
  onSaved: (p: Profile) => void;
}) {
  const [fullName, setFullName] = useState(me.full_name || "");
  const [username, setUsername] = useState(me.username || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!username.trim()) {
      alert("Username is required.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() || null, username: username.trim() })
        .eq("id", me.id)
        .select()
        .single();
      if (error) throw error;
      onSaved(data as Profile);
    } catch (e: any) {
      alert(e?.message || "Could not save profile.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center sm:justify-center p-4">
      <div className="bg-white w-full sm:max-w-md rounded-2xl shadow-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium">Edit profile</div>
          <button className="text-sm text-neutral-500 hover:underline" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-neutral-500 mb-1">Full name</div>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Your name"
            />
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">Username</div>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="username"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="px-3 py-2 text-sm rounded-lg bg-black text-white disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================== Avatar ===================== */
function Avatar({ url, size = 40 }: { url?: string | null; size?: number }) {
  // Nunca mostra “IMG”. Se não tiver url, mostra apenas um círculo neutro.
  if (!url) {
    return (
      <div
        className="rounded-full bg-neutral-200"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}

/* ===================== Upload (+) ===================== */
function Uploader({ me, onDone }: { me: Profile; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    inputRef.current?.click(); // abre direto ao entrar na aba “Post”
  }, []);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return onDone();

    setBusy(true);
    try {
      const type = mediaTypeFromFile(f);
      const ext = f.name.split(".").pop();
      const path = `posts/${me.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, f, { upsert: false });
      if (upErr) throw upErr;

      const url = await publicUrl(path);
      const { error: insErr } = await supabase
        .from("posts")
        .insert({ media_url: url, media_type: type, caption: null });
      if (insErr) throw insErr;

      onDone();
    } catch (err) {
      console.error(err);
      alert("Upload failed.");
      onDone();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="p-6">
      <div className="text-sm text-neutral-500 mb-2">
        After selecting a photo/video, it will appear in Home.
      </div>
      <input ref={inputRef} type="file" accept="image/*,video/*" onChange={onPick} />
      {busy && <div className="mt-2 text-sm">Uploading…</div>}
    </div>
  );
}

/* ===================== Search placeholder ===================== */
function SearchPlaceholder() {
  return <div className="p-6 text-sm text-neutral-500">Search is coming soon.</div>;
}
