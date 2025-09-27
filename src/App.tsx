import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";

/** ===========================
 * Types
 * =========================== */
type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
};

type Post = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string; // "image/jpeg" | "video/mp4" | ...
  caption: string | null;
  created_at: string;
  profile?: Profile; // joined
  likesCount?: number;
  commentsCount?: number;
  likedByMe?: boolean;
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author?: Profile; // joined
};

/** ===========================
 * Small UI helpers
 * =========================== */
const IconHeart = ({ filled }: { filled?: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);
const IconChat = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V5a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10z" />
  </svg>
);

/** ===========================
 * Main App
 * =========================== */
export default function App() {
  const [me, setMe] = useState<Profile | null>(null);
  const [tab, setTab] = useState<"home" | "search" | "post" | "profile">("home");

  const [feed, setFeed] = useState<Post[]>([]);
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");

  // modal
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");

  // file inputs (hidden)
  const postPickerRef = useRef<HTMLInputElement>(null);
  const avatarPickerRef = useRef<HTMLInputElement>(null);

  /** ---------------------------
   * Auth & my profile
   * --------------------------- */
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // fetch my profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .eq("id", user.id)
        .single();

      if (prof) setMe(prof);

      // initial loads
      await Promise.all([loadFeed(), loadMyPosts()]);
    })();
  }, []);

  /** ---------------------------
   * Load feed (with counts + likedByMe)
   * --------------------------- */
  const attachCountsAndFlags = async (rawPosts: any[]): Promise<Post[]> => {
    if (!me) return rawPosts as Post[];

    const posts: Post[] = rawPosts.map((p) => ({
      ...p,
      profile: p.profiles as Profile,
      likesCount: 0,
      commentsCount: 0,
      likedByMe: false,
    }));

    // For small scale it's OK to do per-post queries for counts/flags
    await Promise.all(
      posts.map(async (p) => {
        const [{ data: likes }, { data: cmts }, { data: myLike }] = await Promise.all([
          supabase.from("likes").select("id").eq("post_id", p.id),
          supabase.from("comments").select("id").eq("post_id", p.id),
          supabase.from("likes").select("id").eq("post_id", p.id).eq("user_id", me.id).maybeSingle(),
        ]);
        p.likesCount = likes?.length || 0;
        p.commentsCount = cmts?.length || 0;
        p.likedByMe = !!myLike;
      })
    );
    return posts;
  };

  const loadFeed = async () => {
    const { data, error } = await supabase
      .from("posts")
      .select("id, user_id, media_url, media_type, caption, created_at, profiles(id, username, avatar_url)")
      .order("created_at", { ascending: false });

    if (!error && data) {
      const withExtras = await attachCountsAndFlags(data);
      setFeed(withExtras);
    }
  };

  /** ---------------------------
   * Load my posts
   * --------------------------- */
  const loadMyPosts = async () => {
    if (!me) return;
    const { data, error } = await supabase
      .from("posts")
      .select("id, user_id, media_url, media_type, caption, created_at, profiles(id, username, avatar_url)")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const withExtras = await attachCountsAndFlags(data);
      setMyPosts(withExtras);
    }
  };

  /** ---------------------------
   * Open post modal + load comments
   * --------------------------- */
  const showPost = async (post: Post) => {
    setOpenPost(post);
    await loadComments(post.id);
  };

  const loadComments = async (postId: string) => {
    const { data, error } = await supabase
      .from("comments")
      .select("id, post_id, user_id, content, created_at, profiles(id, username, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      const items: Comment[] = data.map((c: any) => ({
        ...c,
        author: c.profiles as Profile,
      }));
      setComments(items);
    }
  };

  /** ---------------------------
   * Likes
   * --------------------------- */
  const toggleLike = async (post: Post) => {
    if (!me) return;
    if (post.likedByMe) {
      await supabase.from("likes").delete().eq("post_id", post.id).eq("user_id", me.id);
    } else {
      await supabase.from("likes").insert([{ post_id: post.id, user_id: me.id }]);
    }
    await Promise.all([loadFeed(), loadMyPosts(), openPost ? loadComments(openPost.id) : Promise.resolve()]);
  };

  /** ---------------------------
   * Comments (no timestamp rendering + button text "Delete")
   * --------------------------- */
  const addComment = async () => {
    if (!me || !openPost) return;
    const content = newComment.trim();
    if (!content) return;

    const { error } = await supabase
      .from("comments")
      .insert([{ post_id: openPost.id, user_id: me.id, content }]);

    if (!error) {
      setNewComment("");
      await Promise.all([loadComments(openPost.id), loadFeed(), loadMyPosts()]);
    }
  };

  const deleteComment = async (id: string) => {
    if (!openPost) return;
    await supabase.from("comments").delete().eq("id", id);
    await Promise.all([loadComments(openPost.id), loadFeed(), loadMyPosts()]);
  };

  /** ---------------------------
   * Posts: upload via "+"
   * (opens file picker immediately; supports image/video)
   * --------------------------- */
  const onPlus = () => {
    postPickerRef.current?.click();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!me) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop() || "bin";
    const isImage = file.type.startsWith("image");
    const isVideo = file.type.startsWith("video");
    if (!isImage && !isVideo) {
      alert("Selecione uma imagem ou vídeo.");
      return;
    }

    const path = `${me.id}/posts/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (upErr) {
      alert("Erro ao enviar arquivo.");
      return;
    }

    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
    const media_url = pub?.publicUrl;
    const media_type = file.type;

    const { error: insErr } = await supabase.from("posts").insert([
      { user_id: me.id, media_url, media_type, caption: null },
    ]);
    if (insErr) {
      alert("Erro ao criar post.");
      return;
    }

    await Promise.all([loadFeed(), loadMyPosts()]);
    setTab("home");
  };

  /** ---------------------------
   * Delete my post
   * --------------------------- */
  const deletePost = async (postId: string) => {
    await supabase.from("posts").delete().eq("id", postId);
    if (openPost?.id === postId) setOpenPost(null);
    await Promise.all([loadFeed(), loadMyPosts()]);
  };

  /** ---------------------------
   * Avatar change
   * --------------------------- */
  const changeAvatarClick = () => avatarPickerRef.current?.click();

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!me) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${me.id}/avatars/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, file, {
      upsert: true,
    });
    if (upErr) {
      alert("Erro ao enviar avatar.");
      return;
    }
    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
    const avatar_url = pub?.publicUrl;

    await supabase.from("profiles").update({ avatar_url }).eq("id", me.id);
    setMe((m) => (m ? { ...m, avatar_url } : m));
    await Promise.all([loadFeed(), loadMyPosts()]);
  };

  /** ---------------------------
   * Search users (simple)
   * --------------------------- */
  useEffect(() => {
    let active = true;
    (async () => {
      if (tab !== "search") return;
      const q = search.trim();
      if (!q) {
        setProfiles([]);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .ilike("username", `%${q}%`)
        .limit(20);
      if (active) setProfiles(data || []);
    })();
    return () => {
      active = false;
    };
  }, [tab, search]);

  /** ---------------------------
   * Render helpers
   * --------------------------- */
  const Grid = ({ posts }: { posts: Post[] }) => (
    <div className="grid grid-cols-3 gap-3">
      {posts.map((p) => (
        <button key={p.id} onClick={() => showPost(p)} className="relative rounded-lg overflow-hidden bg-gray-100">
          {p.media_type?.startsWith("image") ? (
            <img src={p.media_url} className="w-full h-40 object-cover" />
          ) : (
            <video src={p.media_url} className="w-full h-40 object-cover" />
          )}
        </button>
      ))}
    </div>
  );

  const TopBar = useMemo(
    () => (
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <img
            src={me?.avatar_url || "https://unavatar.io/placeholder"}
            className="h-12 w-12 rounded-full object-cover cursor-pointer"
            onClick={changeAvatarClick}
          />
          <div>
            <div className="font-semibold text-lg">{me?.username || "..."}</div>
            <div className="text-sm text-gray-500">@{me?.username}</div>
          </div>
        </div>

        <button
          className="px-3 py-1.5 text-sm rounded-md border"
          onClick={async () => {
            await supabase.auth.signOut();
            location.reload();
          }}
        >
          Logout
        </button>

        {/* hidden inputs */}
        <input ref={postPickerRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleUpload} />
        <input ref={avatarPickerRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
      </div>
    ),
    [me]
  );

  /** ---------------------------
   * Main render
   * --------------------------- */
  return (
    <div className="max-w-3xl mx-auto px-4 pb-24">
      {TopBar}

      {/* Tabs content (guided by bottom bar) */}
      {tab === "home" && (
        <section className="space-y-6">
          <Grid posts={feed} />
        </section>
      )}

      {tab === "search" && (
        <section className="space-y-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by @username"
            className="w-full border rounded-md px-3 py-2"
          />
          <ul className="divide-y">
            {profiles.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <img src={p.avatar_url || "https://unavatar.io/placeholder"} className="h-10 w-10 rounded-full object-cover" />
                  <div className="font-medium">@{p.username}</div>
                </div>
              </li>
            ))}
            {profiles.length === 0 && search && <li className="text-sm text-gray-500 py-3">No users</li>}
          </ul>
        </section>
      )}

      {tab === "post" && (
        <section className="pt-6">
          {/* Intencionalmente vazio — o "+" abre o seletor de arquivo direto */}
          <p className="text-center text-sm text-gray-500">Tap “+” below to create a post.</p>
        </section>
      )}

      {tab === "profile" && (
        <section className="space-y-6">
          <Grid posts={myPosts} />
        </section>
      )}

      {/* Bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 border-t bg-white py-2">
        <div className="max-w-3xl mx-auto flex items-center justify-around text-2xl">
          <button aria-label="Home" onClick={() => setTab("home")}>🏠</button>
          <button aria-label="Search" onClick={() => setTab("search")}>🔍</button>
          <button aria-label="New post" onClick={onPlus}>➕</button>
          <button aria-label="Profile" onClick={() => setTab("profile")}>👤</button>
        </div>
      </nav>

      {/* Post modal */}
      {openPost && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-3xl rounded-xl overflow-hidden shadow-xl">
            {/* header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <img
                  src={openPost.profile?.avatar_url || "https://unavatar.io/placeholder"}
                  className="h-8 w-8 rounded-full object-cover"
                />
                <span className="font-medium">@{openPost.profile?.username}</span>
              </div>
              <div className="flex items-center gap-4">
                {openPost.user_id === me?.id && (
                  <button className="text-red-500 text-sm" onClick={() => deletePost(openPost.id)}>
                    Delete
                  </button>
                )}
                <button className="text-gray-500" onClick={() => setOpenPost(null)}>✕</button>
              </div>
            </div>

            {/* media */}
            <div className="p-4">
              {openPost.media_type?.startsWith("image") ? (
                <img src={openPost.media_url} className="w-full rounded-lg" />
              ) : (
                <video src={openPost.media_url} className="w-full rounded-lg" controls />
              )}
              {openPost.caption && <p className="mt-2 text-sm text-gray-700">{openPost.caption}</p>}
            </div>

            {/* actions */}
            <div className="px-4 pb-3 flex items-center gap-4">
              <button
                className={`flex items-center gap-1 ${openPost.likedByMe ? "text-red-600" : ""}`}
                onClick={() => toggleLike(openPost)}
              >
                <IconHeart filled={openPost.likedByMe} />
                <span className="text-sm">{openPost.likesCount ?? 0}</span>
              </button>
              <div className="flex items-center gap-1 text-gray-700">
                <IconChat />
                <span className="text-sm">{openPost.commentsCount ?? comments.length}</span>
              </div>
            </div>

            {/* comments */}
            <div className="px-4 pb-4">
              <div className="rounded-lg border p-3 max-h-64 overflow-auto">
                {comments.length === 0 ? (
                  <p className="text-sm text-gray-500">Be the first to comment</p>
                ) : (
                  <ul className="space-y-3">
                    {comments.map((c) => (
                      <li key={c.id} className="flex items-start gap-2">
                        <img
                          src={c.author?.avatar_url || "https://unavatar.io/placeholder"}
                          className="h-7 w-7 rounded-full object-cover"
                        />
                        <div className="flex-1">
                          <p className="text-sm">
                            <span className="font-medium mr-1">@{c.author?.username || "user"}</span>
                            {c.content}
                          </p>
                          {/* intentionally no timestamp here */}
                        </div>
                        {c.user_id === me?.id && (
                          <button onClick={() => deleteComment(c.id)} className="text-xs text-red-500 hover:underline">
                            Delete
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* add comment */}
              <div className="mt-3 flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addComment()}
                  placeholder="Write a comment..."
                  className="flex-1 border rounded-md px-3 py-2 text-sm"
                />
                <button onClick={addComment} className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm">
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
