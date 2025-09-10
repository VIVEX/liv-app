import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "./lib/supabaseClient";

type Profile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

type Post = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string | null;
  created_at: string;
  likes_count?: number;
  comments_count?: number;
  you_liked?: boolean;
  user?: { username: string | null; avatar_url: string | null };
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user?: { username: string | null; avatar_url: string | null };
};

function classNames(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

function extFromName(name: string) {
  const p = name.split(".");
  return p.length > 1 ? p[p.length - 1].toLowerCase() : "jpg";
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [tab, setTab] = useState<"home" | "search" | "create" | "profile">(
    "home"
  );

  // feed
  const [feed, setFeed] = useState<Post[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);

  // profile page
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [counters, setCounters] = useState({ posts: 0, followers: 0, following: 0 });

  // comments modal
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsPost, setCommentsPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // ---------------- Session / Profile ----------------
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      setSessionUserId(uid);

      if (uid) {
        // profile
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .eq("id", uid)
          .single();
        if (!error && data) setMe(data as Profile);

        // contadores do perfil
        await refreshProfileCounters(uid);
      }

      setLoading(false);
    })();

    const sub = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user?.id ?? null;
      setSessionUserId(uid);
    });
    return () => sub.data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshProfileCounters(uid: string) {
    const [{ count: posts }, { count: followers }, { count: following }] = await Promise.all([
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("followed_id", uid),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", uid),
    ]);
    setCounters({
      posts: posts ?? 0,
      followers: followers ?? 0,
      following: following ?? 0,
    });
  }

  // ---------------- Auth ----------------
  async function handleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) alert(error.message);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  // ---------------- Feed ----------------
  useEffect(() => {
    // carrega feed (simples: todos os posts mais recentes)
    (async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id, user_id, media_url, media_type, caption, created_at, profiles(username, avatar_url)")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) return;

      const posts: Post[] = (data || []).map((p: any) => ({
        ...p,
        user: p.profiles,
      }));

      // likes + comments count + você curtiu?
      const ids = posts.map(p => p.id);
      if (ids.length) {
        const [likesAgg, myLikes, commentsAgg] = await Promise.all([
          supabase.from("likes").select("post_id, count:id").in("post_id", ids).group("post_id"),
          sessionUserId ? supabase.from("likes").select("post_id").eq("user_id", sessionUserId).in("post_id", ids) : Promise.resolve({ data: [] as any[], error: null }),
          supabase.from("comments").select("post_id, count:id").in("post_id", ids).group("post_id"),
        ]);

        const likesMap = Object.fromEntries((likesAgg.data || []).map((r: any) => [r.post_id, Number(r.count)]));
        const myLikesSet = new Set((myLikes as any).data?.map((r: any) => r.post_id) || []);
        const commentsMap = Object.fromEntries((commentsAgg.data || []).map((r: any) => [r.post_id, Number(r.count)]));

        posts.forEach(p => {
          p.likes_count = likesMap[p.id] || 0;
          p.comments_count = commentsMap[p.id] || 0;
          p.you_liked = myLikesSet.has(p.id);
        });
      }

      setFeed(posts);
    })();
  }, [sessionUserId]);

  // ---------------- Upload Post ----------------
  async function pickPost() {
    fileInputRef.current?.click();
  }
  async function onPickPost(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !sessionUserId) return;
    setUploadBusy(true);

    try {
      const isImage = f.type.startsWith("image/");
      const isVideo = f.type.startsWith("video/");
      if (!isImage && !isVideo) {
        alert("Only images or videos are allowed.");
        return;
      }

      const path = `posts/${sessionUserId}/${Date.now()}-${f.name}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, f, {
          cacheControl: "3600",
          upsert: true,
          contentType: f.type || (isVideo ? "video/mp4" : "image/jpeg"),
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      const media_url = pub.publicUrl;
      const media_type: "image" | "video" = isVideo ? "video" : "image";

      const { error: insErr } = await supabase
        .from("posts")
        .insert({ user_id: sessionUserId, media_url, media_type, caption: null });
      if (insErr) throw insErr;

      // Atualiza feed e contadores
      await refreshProfileCounters(sessionUserId);
      setTab("home");
      // força reload de feed simples
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      alert("Upload failed.");
    } finally {
      setUploadBusy(false);
      e.target.value = "";
    }
  }

  // ---------------- Avatar ----------------
  function pickAvatar() {
    avatarInputRef.current?.click();
  }
  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !sessionUserId) return;

    try {
      const ext = extFromName(f.name);
      const path = `avatars/${sessionUserId}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, f, {
          upsert: true,
          cacheControl: "3600",
          contentType: f.type || "image/jpeg",
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      const avatar_url = pub.publicUrl;

      const { error: upProfile } = await supabase
        .from("profiles")
        .update({ avatar_url })
        .eq("id", sessionUserId);
      if (upProfile) throw upProfile;

      setMe((m) => (m ? { ...m, avatar_url } : m));
    } catch (err: any) {
      console.error(err);
      alert("Could not update avatar.");
    } finally {
      e.target.value = "";
    }
  }

  // ---------------- Likes ----------------
  async function toggleLike(p: Post) {
    if (!sessionUserId) return;
    if (p.you_liked) {
      const { error } = await supabase.from("likes").delete().eq("post_id", p.id).eq("user_id", sessionUserId);
      if (error) return;
      setFeed((list) =>
        list.map((x) =>
          x.id === p.id ? { ...x, you_liked: false, likes_count: Math.max(0, (x.likes_count || 1) - 1) } : x
        )
      );
    } else {
      const { error } = await supabase.from("likes").insert({ post_id: p.id, user_id: sessionUserId });
      if (error) return;
      setFeed((list) =>
        list.map((x) =>
          x.id === p.id ? { ...x, you_liked: true, likes_count: (x.likes_count || 0) + 1 } : x
        )
      );
    }
  }

  // ---------------- Comments ----------------
  async function openComments(p: Post) {
    setCommentsOpen(true);
    setCommentsPost(p);
    const { data } = await supabase
      .from("comments")
      .select("id, post_id, user_id, content, created_at, profiles(username, avatar_url)")
      .eq("post_id", p.id)
      .order("created_at", { ascending: true });

    const rows: Comment[] =
      (data || []).map((c: any) => ({ ...c, user: c.profiles })) ?? [];
    setComments(rows);
    setNewComment("");
  }

  async function sendComment() {
    if (!sessionUserId || !commentsPost || !newComment.trim()) return;
    const content = newComment.trim();
    const { error } = await supabase.from("comments").insert({
      post_id: commentsPost.id,
      user_id: sessionUserId,
      content,
    });
    if (error) {
      alert("Could not comment.");
      return;
    }
    setNewComment("");
    openComments(commentsPost); // recarrega
  }

  // ---------------- Delete Post ----------------
  async function deletePost(p: Post) {
    if (!sessionUserId || p.user_id !== sessionUserId) return;
    if (!confirm("Delete this post?")) return;

    const { error } = await supabase.from("posts").delete().eq("id", p.id);
    if (error) {
      alert("Could not delete.");
      return;
    }
    setFeed((list) => list.filter((x) => x.id !== p.id));
    await refreshProfileCounters(sessionUserId);
  }

  // ---------------- UI ----------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        Loading…
      </div>
    );
  }

  if (!sessionUserId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="rounded-xl border p-8 max-w-sm w-full text-center">
          <h1 className="text-2xl font-semibold mb-2">LIVET</h1>
          <p className="text-gray-500 mb-6">Share your healthy lifestyle.</p>
          <button
            onClick={handleLogin}
            className="px-4 py-2 rounded-md bg-black text-white w-full"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  function Header() {
    return (
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <div className="font-semibold">LIVET</div>
        <div className="flex items-center gap-4">
          {me && (
            <div className="flex items-center gap-2">
              <img
                src={me.avatar_url || "https://placehold.co/40x40?text=LV"}
                className="w-8 h-8 rounded-full object-cover cursor-pointer"
                onClick={() => setTab("profile")}
                alt="avatar"
              />
              <span className="text-sm text-gray-600">@{me.username || "user"}</span>
            </div>
          )}
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:underline">
            Logout
          </button>
        </div>
      </div>
    );
  }

  function BottomBar() {
    return (
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white">
        <div className="max-w-3xl mx-auto grid grid-cols-4 text-center">
          <button onClick={() => setTab("home")} className={classNames("py-3", tab==="home" && "font-semibold")}>
            Home
          </button>
          <button onClick={() => setTab("search")} className={classNames("py-3", tab==="search" && "font-semibold")}>
            Search
          </button>
          <button onClick={() => setTab("create")} className={classNames("py-3", tab==="create" && "font-semibold")}>
            +
          </button>
          <button onClick={() => setTab("profile")} className={classNames("py-3", tab==="profile" && "font-semibold")}>
            Profile
          </button>
        </div>
      </div>
    );
  }

  function MediaView({ p }: { p: Post }) {
    if (p.media_type === "video") {
      return (
        <video
          src={p.media_url}
          className="w-full h-full object-cover rounded-lg"
          controls
          preload="metadata"
        />
      );
    }
    return <img src={p.media_url} className="w-full h-full object-cover rounded-lg" alt="" />;
  }

  function Feed() {
    return (
      <div className="max-w-3xl mx-auto p-4 pb-24">
        {feed.length === 0 && (
          <div className="text-center text-gray-500 py-16">No posts yet.</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {feed.map((p) => (
            <div key={p.id} className="border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <img
                  src={p.user?.avatar_url || "https://placehold.co/32x32?text=LV"}
                  className="w-8 h-8 rounded-full object-cover"
                  alt=""
                />
                <div className="text-sm font-medium">@{p.user?.username || "user"}</div>
                <div className="ml-auto text-xs text-gray-500">
                  {new Date(p.created_at).toLocaleString()}
                </div>
              </div>

              <div className="aspect-square w-full overflow-hidden mb-3">
                <MediaView p={p} />
              </div>

              <div className="flex items-center gap-4 text-sm">
                <button onClick={() => toggleLike(p)}>
                  {p.you_liked ? "Unlike" : "Like"} ({p.likes_count ?? 0})
                </button>
                <button onClick={() => openComments(p)}>
                  Comments ({p.comments_count ?? 0})
                </button>
                {p.user_id === sessionUserId && (
                  <button onClick={() => deletePost(p)} className="text-red-600 ml-auto">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function Create() {
    return (
      <div className="max-w-xl mx-auto p-6 pb-24">
        <div className="border rounded-xl p-6">
          <div className="text-lg font-semibold mb-4">New post</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={onPickPost}
          />
          <button
            disabled={uploadBusy}
            onClick={pickPost}
            className="px-4 py-2 rounded-md bg-black text-white disabled:opacity-60"
          >
            {uploadBusy ? "Uploading..." : "Select photo / video"}
          </button>
          <p className="text-xs text-gray-500 mt-3">
            After selection, the post appears in Home.
          </p>
        </div>
      </div>
    );
  }

  function ProfilePage() {
    const postsGrid = useMemo(() => myPosts, [myPosts]);

    useEffect(() => {
      (async () => {
        const { data, error } = await supabase
          .from("posts")
          .select("id, user_id, media_url, media_type, caption, created_at")
          .eq("user_id", sessionUserId)
          .order("created_at", { ascending: false })
          .limit(60);
        if (!error) setMyPosts((data || []) as any);
      })();
    }, []);

    return (
      <div className="max-w-3xl mx-auto p-4 pb-24">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <img
              src={me?.avatar_url || "https://placehold.co/96x96?text=LV"}
              className="w-20 h-20 rounded-full object-cover"
              alt=""
            />
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={onPickAvatar}
              className="hidden"
            />
          </div>
          <div className="flex-1">
            <div className="text-xl font-semibold">{me?.username || "user"}</div>
            <div className="text-gray-500">@{me?.username || "user"}</div>
            <div className="flex gap-6 mt-2 text-sm">
              <div><span className="font-semibold">{counters.posts}</span> posts</div>
              <div><span className="font-semibold">{counters.followers}</span> followers</div>
              <div><span className="font-semibold">{counters.following}</span> following</div>
            </div>
          </div>
          <button
            onClick={pickAvatar}
            className="px-3 py-1 rounded-md border"
          >
            Change photo
          </button>
        </div>

        {postsGrid.length === 0 ? (
          <div className="text-center text-gray-500 py-16">No posts yet.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {postsGrid.map((p) => (
              <div key={p.id} className="aspect-square overflow-hidden rounded-lg">
                <MediaView p={p} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function CommentsModal() {
    if (!commentsOpen || !commentsPost) return null;
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl w-full max-w-md p-4">
          <div className="flex items-center mb-2">
            <div className="text-lg font-semibold">Comments</div>
            <button className="ml-auto text-sm" onClick={() => setCommentsOpen(false)}>
              Close
            </button>
          </div>
          <div className="space-y-3 max-h-72 overflow-auto">
            {comments.length === 0 && (
              <div className="text-sm text-gray-500">Be the first to comment</div>
            )}
            {comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2">
                <img
                  src={c.user?.avatar_url || "https://placehold.co/24x24?text=LV"}
                  className="w-6 h-6 rounded-full object-cover"
                  alt=""
                />
                <div className="text-sm">
                  <div className="font-medium">@{c.user?.username || "user"}</div>
                  <div>{c.content}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              className="flex-1 border rounded-md px-3 py-2 text-sm"
            />
            <button onClick={sendComment} className="px-3 py-2 rounded-md bg-black text-white text-sm">
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Header />
      {tab === "home" && <Feed />}
      {tab === "search" && <div className="p-6 pb-24 text-center text-gray-500">Search (coming soon)</div>}
      {tab === "create" && <Create />}
      {tab === "profile" && <ProfilePage />}
      <BottomBar />
      <CommentsModal />
    </div>
  );
}
