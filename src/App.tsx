import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient, User, Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabaseClient";

// -----------------------------
// Tipos
// -----------------------------
type Profile = {
  id: string;
  full_name: string | null;
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
  author?: Profile;
  likes_count?: number;
  comments_count?: number;
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author?: Profile;
};

// -----------------------------
// Helpers visuais
// -----------------------------
const IconHeart = ({ filled = false }: { filled?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor">
    <path d="M20.8 4.6c-1.9-1.8-5-1.8-6.9.1l-.9.9-.9-.9c-1.9-1.9-5-1.9-6.9-.1-2.1 2-2.1 5.3 0 7.3l7.8 7.5 7.8-7.5c2.1-2 2.1-5.3 0-7.3z"/>
  </svg>
);

const IconChat = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V5a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10z"/>
  </svg>
);

const IconHome = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ opacity: active ? 1 : 0.6 }}>
    <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V9.5z"/>
  </svg>
);
const IconSearch = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ opacity: active ? 1 : 0.6 }}>
    <circle cx="11" cy="11" r="7"/><path d="m21 21-3.5-3.5"/>
  </svg>
);
const IconPlus = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ opacity: active ? 1 : 0.6 }}>
    <path d="M12 5v14M5 12h14"/>
  </svg>
);
const IconUser = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ opacity: active ? 1 : 0.6 }}>
    <path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

// -----------------------------
// App
// -----------------------------
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const user = session?.user ?? null;

  const [me, setMe] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<"home" | "search" | "post" | "profile">("home");

  // Feed e modal
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [openPost, setOpenPost] = useState<Post | null>(null);

  // Comentários no modal
  const [comments, setComments] = useState<Comment[]>([]);
  const [sendingComment, setSendingComment] = useState(false);
  const commentInput = useRef<HTMLInputElement>(null);

  // Upload post
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");

  // ------------- Auth -------------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const siteUrl = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteUrl}/`,
        queryParams: { prompt: "select_account" },
      },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setMe(null);
    setPosts([]);
  };

  // ------------- Perfil (me) -------------
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (error) console.error(error);
      setMe(data ?? null);
    })();
  }, [user?.id]);

  const ensureUsername = async () => {
    if (!user || !me) return;
    if (me.username && me.username.trim().length > 0) return;
    // gera um @username simples baseado no email
    const base = (user.email ?? "user").split("@")[0].replace(/[^a-z0-9_]/gi, "");
    const candidate = base.length ? base : "user";
    const wanted = candidate.slice(0, 18);
    await supabase.from("profiles").update({ username: wanted }).eq("id", user.id);
    setMe((m) => (m ? { ...m, username: wanted } : m));
  };

  useEffect(() => { ensureUsername(); }, [me?.username, user?.id]);

  // ------------- Feed -------------
  const fetchFeed = async () => {
    setLoadingFeed(true);
    // busca posts + contadores
    const { data: rows, error } = await supabase
      .from("posts")
      .select("id, user_id, media_url, media_type, caption, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error(error);
      setLoadingFeed(false);
      return;
    }

    const ids = rows.map((r) => r.user_id);
    const uniqueIds = Array.from(new Set(ids));
    const { data: authors } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .in("id", uniqueIds.length ? uniqueIds : ["00000000-0000-0000-0000-000000000000"]);

    // contadores
    const { data: likesAgg } = await supabase
      .from("likes")
      .select("post_id")
      .limit(1_000_000);
    const { data: commentsAgg } = await supabase
      .from("comments")
      .select("post_id")
      .limit(1_000_000);

    const likeCountMap = new Map<string, number>();
    likesAgg?.forEach((l: any) => likeCountMap.set(l.post_id, (likeCountMap.get(l.post_id) ?? 0) + 1));
    const commentCountMap = new Map<string, number>();
    commentsAgg?.forEach((c: any) => commentCountMap.set(c.post_id, (commentCountMap.get(c.post_id) ?? 0) + 1));

    const byId = new Map((authors ?? []).map((a) => [a.id, a]));
    const merged: Post[] = rows.map((r) => ({
      ...r,
      author: byId.get(r.user_id) ?? undefined,
      likes_count: likeCountMap.get(r.id) ?? 0,
      comments_count: commentCountMap.get(r.id) ?? 0,
    }));
    setPosts(merged);
    setLoadingFeed(false);
  };

  useEffect(() => { fetchFeed(); }, [user?.id]);

  // ------------- Likes -------------
  const toggleLike = async (post: Post) => {
    if (!user) return signInWithGoogle();
    // checa se já existe like
    const { data: current } = await supabase
      .from("likes")
      .select("id")
      .eq("post_id", post.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (current) {
      await supabase.from("likes").delete().eq("id", current.id);
      setPosts((arr) =>
        arr.map((p) => (p.id === post.id ? { ...p, likes_count: Math.max((p.likes_count ?? 1) - 1, 0) } : p)),
      );
    } else {
      await supabase.from("likes").insert({ post_id: post.id, user_id: user.id });
      setPosts((arr) => arr.map((p) => (p.id === post.id ? { ...p, likes_count: (p.likes_count ?? 0) + 1 } : p)));
    }
  };

  // ------------- Comentários -------------
  const loadComments = async (postId: string) => {
    const { data, error } = await supabase
      .from("comments")
      .select("id, post_id, user_id, content, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      setComments([]);
      return;
    }

    const uids = Array.from(new Set(data.map((c) => c.user_id)));
    const { data: authors } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .in("id", uids.length ? uids : ["00000000-0000-0000-0000-000000000000"]);

    const byId = new Map((authors ?? []).map((a) => [a.id, a]));
    setComments(data.map((c) => ({ ...c, author: byId.get(c.user_id) })));
  };

  const sendComment = async () => {
    if (!user || !openPost) return;
    const text = (commentInput.current?.value ?? "").trim();
    if (!text) return;

    setSendingComment(true);
    const { error } = await supabase.from("comments").insert({
      post_id: openPost.id,
      user_id: user.id,
      content: text,
    });
    setSendingComment(false);

    if (!error) {
      commentInput.current!.value = "";
      await loadComments(openPost.id);
      // atualiza contador no feed
      setPosts((arr) =>
        arr.map((p) => (p.id === openPost.id ? { ...p, comments_count: (p.comments_count ?? 0) + 1 } : p)),
      );
    } else {
      alert("Erro ao comentar.");
      console.error(error);
    }
  };

  // ------------- Upload Post -------------
  const onUploadPost = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return signInWithGoogle();
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      const media_type = file.type.startsWith("video") ? "video" : "image";

      const { error: insErr } = await supabase.from("posts").insert({
        user_id: user.id,
        media_url: pub.publicUrl,
        media_type,
        caption: caption || null,
      });
      if (insErr) throw insErr;

      setCaption("");
      await fetchFeed();
      setActiveTab("home");
    } catch (err) {
      console.error(err);
      alert("Erro ao publicar.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // ------------- Avatar -------------
  const onUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return signInWithGoogle();
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `avatars/${user.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);

      const { error: upProf } = await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", user.id);
      if (upProf) throw upProf;
      setMe((m) => (m ? { ...m, avatar_url: pub.publicUrl } : m));
    } catch (err) {
      console.error(err);
      alert("Erro ao trocar avatar.");
    }
  };

  // ------------- Delete Post -------------
  const deletePost = async (postId: string) => {
    if (!confirm("Delete this post?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) {
      console.error(error);
      alert("Erro ao deletar.");
      return;
    }
    setPosts((arr) => arr.filter((p) => p.id !== postId));
    if (openPost?.id === postId) setOpenPost(null);
  };

  // ---------------- UI helpers ----------------
  const isLikedByMe = async (postId: string): Promise<boolean> => {
    if (!user) return false;
    const { data } = await supabase
      .from("likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .maybeSingle();
    return !!data;
  };

  // ---------------- Render ----------------
  const Header = () => (
    <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200">
          {me?.avatar_url ? (
            <img src={me.avatar_url} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full grid place-content-center text-sm text-gray-500">?</div>
          )}
        </div>
        <div>
          <div className="font-semibold">{me?.full_name || "Andrex"}</div>
          <div className="text-sm text-gray-500">@{me?.username || "username"}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!user ? (
          <button onClick={signInWithGoogle} className="px-3 py-1.5 border rounded-md">
            Sign in with Google
          </button>
        ) : (
          <button onClick={signOut} className="px-3 py-1.5 border rounded-md">
            Logout
          </button>
        )}
      </div>
    </div>
  );

  const GridPost = ({ post }: { post: Post }) => {
    const open = () => {
      setOpenPost(post);
      loadComments(post.id);
    };
    return (
      <div className="relative">
        <button onClick={open} className="block w-full">
          {post.media_type === "video" ? (
            <video src={post.media_url} className="w-full h-64 object-cover rounded-xl" controls preload="metadata" />
          ) : (
            <img src={post.media_url} className="w-full h-64 object-cover rounded-xl" />
          )}
        </button>
        <div className="mt-2 flex items-center gap-4 text-gray-700 text-sm">
          <div className="flex items-center gap-1">
            <IconHeart /> {post.likes_count ?? 0}
          </div>
          <div className="flex items-center gap-1">
            <IconChat /> {post.comments_count ?? 0}
          </div>
          {user?.id === post.user_id && (
            <button onClick={() => deletePost(post.id)} className="ml-auto text-red-500 text-sm">
              Delete
            </button>
          )}
        </div>
      </div>
    );
  };

  const ModalPost = () =>
    openPost ? (
      <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setOpenPost(null)}>
        <div className="bg-white w-full max-w-3xl rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="grid md:grid-cols-2 gap-0">
            <div className="bg-black/5">
              {openPost.media_type === "video" ? (
                <video src={openPost.media_url} className="w-full h-[420px] object-contain bg-black" controls />
              ) : (
                <img src={openPost.media_url} className="w-full h-[420px] object-cover" />
              )}
            </div>
            <div className="p-4 flex flex-col h-[420px]">
              {/* topo */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200">
                    {openPost.author?.avatar_url ? (
                      <img src={openPost.author.avatar_url} className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="text-sm font-medium">@{openPost.author?.username || "user"}</div>
                </div>
                {user?.id === openPost.user_id && (
                  <button onClick={() => deletePost(openPost.id)} className="text-red-500 text-sm">
                    Delete
                  </button>
                )}
              </div>

              {/* ações */}
              <div className="flex items-center gap-5 text-gray-700">
                <button
                  onClick={() => toggleLike(openPost)}
                  className="flex items-center gap-1 hover:opacity-80 transition"
                >
                  <IconHeart /> {openPost.likes_count ?? 0}
                </button>
                <div className="flex items-center gap-1">
                  <IconChat /> {openPost.comments_count ?? 0}
                </div>
              </div>

              {/* comentários */}
              <div className="mt-3 flex-1 overflow-auto space-y-3">
                {comments.length === 0 ? (
                  <div className="text-sm text-gray-500">Be the first to comment</div>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="text-sm">
                      <span className="font-medium">@{c.author?.username || "user"}</span>{" "}
                      <span className="text-gray-700">{c.content}</span>
                    </div>
                  ))
                )}
              </div>

              {/* form comentário */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  ref={commentInput}
                  type="text"
                  placeholder="Write a comment..."
                  className="flex-1 border rounded-md px-3 py-2 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendComment();
                  }}
                />
                <button
                  onClick={sendComment}
                  disabled={sendingComment}
                  className="px-3 py-2 text-sm rounded-md bg-black text-white disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : null;

  // ------------- Screens -------------
  const ScreenHome = () => (
    <div className="max-w-4xl mx-auto px-4 pb-28">
      {loadingFeed ? (
        <div className="py-20 text-center text-gray-500">Loading…</div>
      ) : posts.length === 0 ? (
        <div className="py-20 text-center text-gray-500">No posts yet</div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {posts.map((p) => (
            <GridPost key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );

  const ScreenSearch = () => (
    <div className="max-w-3xl mx-auto px-4 pb-28">
      <div className="text-center text-gray-500 py-16">Search coming soon…</div>
    </div>
  );

  const ScreenPost = () => (
    <div className="max-w-md mx-auto px-4 pb-28">
      {!user ? (
        <div className="py-16 text-center">
          <button onClick={signInWithGoogle} className="px-4 py-2 border rounded-md">
            Sign in with Google
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Caption (optional)</span>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="mt-1 w-full border rounded-md px-3 py-2"
              placeholder="Write something…"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Select image or video</span>
            <input
              type="file"
              accept="image/*,video/*"
              className="mt-1 block"
              onChange={onUploadPost}
              disabled={uploading}
            />
          </label>

          {uploading && <div className="text-sm text-gray-500">Uploading…</div>}
        </div>
      )}
    </div>
  );

  const ScreenProfile = () => (
    <div className="max-w-4xl mx-auto px-4 pb-28">
      {/* header do perfil */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-200">
            {me?.avatar_url ? (
              <img src={me.avatar_url} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full grid place-content-center text-gray-500">IMG</div>
            )}
          </div>
          {user && (
            <label className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-xs px-2 py-0.5 rounded bg-black text-white cursor-pointer">
              Change
              <input type="file" accept="image/*" className="hidden" onChange={onUploadAvatar} />
            </label>
          )}
        </div>
        <div>
          <div className="text-xl font-semibold">{me?.full_name || "Your name"}</div>
          <div className="text-gray-500">@{me?.username || "username"}</div>
        </div>
      </div>

      {/* meus posts */}
      <div className="grid md:grid-cols-3 gap-6">
        {posts.filter((p) => p.user_id === me?.id).map((p) => (
          <div key={p.id}>
            <GridPost post={p} />
          </div>
        ))}
      </div>
    </div>
  );

  const BottomNav = () => (
    <div className="fixed bottom-0 left-0 right-0 border-t bg-white">
      <div className="max-w-4xl mx-auto px-8 h-14 flex items-center justify-between">
        <button aria-label="Home" onClick={() => setActiveTab("home")}><IconHome active={activeTab === "home"} /></button>
        <button aria-label="Search" onClick={() => setActiveTab("search")}><IconSearch active={activeTab === "search"} /></button>
        <button aria-label="Post" onClick={() => setActiveTab("post")}><IconPlus active={activeTab === "post"} /></button>
        <button aria-label="Profile" onClick={() => setActiveTab("profile")}><IconUser active={activeTab === "profile"} /></button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-black">
      <Header />

      {activeTab === "home" && <ScreenHome />}
      {activeTab === "search" && <ScreenSearch />}
      {activeTab === "post" && <ScreenPost />}
      {activeTab === "profile" && <ScreenProfile />}

      <BottomNav />
      <ModalPost />
    </div>
  );
}
