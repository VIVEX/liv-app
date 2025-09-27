/* src/App.tsx */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import supabase from "./lib/supabaseClient";

/* ----------------------------- Tipagens básicas ---------------------------- */
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
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: Profile; // join para exibir @username e avatar
};

/* --------------------------------- ÍCONES --------------------------------- */
const Heart = ({ filled = false, className = "" }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-.99-1.06a5.5 5.5 0 1 0-7.78 7.78l.99.99L12 21.23l7.78-7.85.99-.99a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const Chat = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 11.5a8.38 8.38 0 0 1-9 8.35A8.5 8.5 0 1 1 21 11.5Z" />
    <path d="M8 13h8M8 9h8" />
  </svg>
);

const HomeIcon = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <path d="M9 22V12h6v10" />
  </svg>
);
const SearchIcon = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
const PlusIcon = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const UserIcon = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M20 21a8 8 0 1 0-16 0" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

/* ------------------------------ Componente App ----------------------------- */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<"home" | "search" | "post" | "profile">("home");

  // modal de post
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [modalPost, setModalPost] = useState<Post | null>(null);
  const [modalLiked, setModalLiked] = useState(false);
  const [modalLikeCount, setModalLikeCount] = useState(0);
  const [modalComments, setModalComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");

  // inputs ocultos para upload
  const postPickerRef = useRef<HTMLInputElement>(null);
  const avatarPickerRef = useRef<HTMLInputElement>(null);

  /* --------------------------- Autenticação / Perfil --------------------------- */
  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setLoading(false);
        return;
      }
      setUid(auth.user.id);

      // perfil
      const { data: p } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .eq("id", auth.user.id)
        .single();
      setProfile(p as Profile);

      // posts do usuário
      await fetchMyPosts(auth.user.id);

      setLoading(false);
    };

    // também reage a mudanças de auth
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        setUid(session.user.id);
        fetchMyPosts(session.user.id);
        // perfil
        supabase
          .from("profiles")
          .select("id, full_name, username, avatar_url")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => setProfile(data as Profile));
      } else {
        setUid(null);
        setProfile(null);
        setPosts([]);
      }
    });

    load();
    return () => {
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMyPosts = async (userId: string) => {
    const { data } = await supabase
      .from("posts")
      .select("id, user_id, media_url, media_type, caption, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setPosts((data || []) as Post[]);
  };

  /* --------------------------------- Login --------------------------------- */
  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };
  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  /* ------------------------------ Upload avatar ----------------------------- */
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    const path = `avatars/${uid}/${Date.now()}-${file.name}`;
    const up = await supabase.storage.from("media").upload(path, file, { upsert: true, contentType: file.type });
    if (up.error) {
      alert("Upload failed");
      return;
    }
    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
    const avatar_url = pub.publicUrl;
    await supabase.from("profiles").update({ avatar_url }).eq("id", uid);
    setProfile((p) => (p ? { ...p, avatar_url } : p));
  };

  /* --------------------------- Upload do post ( + ) -------------------------- */
  const handlePostPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;

    const isVideo = file.type.startsWith("video/");
    const media_type: "image" | "video" = isVideo ? "video" : "image";
    const path = `posts/${uid}/${Date.now()}-${file.name}`;

    const up = await supabase.storage.from("media").upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (up.error) {
      alert("Upload failed");
      return;
    }
    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
    const media_url = pub.publicUrl;

    const { data: inserted, error } = await supabase
      .from("posts")
      .insert({ user_id: uid, media_url, media_type, caption: null })
      .select()
      .single();

    if (error) {
      alert(error.message);
      return;
    }
    setPosts((prev) => [inserted as Post, ...prev]);
    setActiveTab("home");
  };

  /* ------------------------------- Modal Post ------------------------------- */
  const openPost = async (post: Post) => {
    setOpenPostId(post.id);
    setModalPost(post);
    await refreshModalData(post.id);
  };

  const refreshModalData = async (postId: string) => {
    // likes
    const [{ data: likeRows }, { data: myLike }] = await Promise.all([
      supabase.from("likes").select("id").eq("post_id", postId),
      uid
        ? supabase.from("likes").select("id").eq("post_id", postId).eq("user_id", uid).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);
    setModalLikeCount((likeRows || []).length);
    setModalLiked(!!myLike);

    // comments + join com profiles (para @ e avatar)
    const { data: c } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, profiles:profiles(id, username, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    setModalComments((c || []) as Comment[]);
  };

  const toggleLike = async () => {
    if (!uid || !modalPost) return;
    if (modalLiked) {
      await supabase.from("likes").delete().eq("post_id", modalPost.id).eq("user_id", uid);
    } else {
      await supabase.from("likes").insert({ post_id: modalPost.id, user_id: uid });
    }
    await refreshModalData(modalPost.id);
  };

  const addComment = async () => {
    if (!uid || !modalPost || !commentText.trim()) return;
    await supabase.from("comments").insert({
      post_id: modalPost.id,
      user_id: uid,
      content: commentText.trim(),
    });
    setCommentText("");
    await refreshModalData(modalPost.id);
  };

  const deleteComment = async (commentId: string) => {
    if (!modalPost) return;
    await supabase.from("comments").delete().eq("id", commentId);
    await refreshModalData(modalPost.id);
  };

  const deletePost = async (postId: string) => {
    if (!uid) return;
    await supabase.from("posts").delete().eq("id", postId).eq("user_id", uid);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    closeModal();
  };

  const closeModal = () => {
    setOpenPostId(null);
    setModalPost(null);
    setModalComments([]);
    setModalLiked(false);
    setModalLikeCount(0);
  };

  /* ------------------------------- Renderizações ------------------------------ */
  const avatar = useMemo(() => {
    return profile?.avatar_url || "https://placehold.co/120x120?text=IMG&font=inter";
  }, [profile]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  if (!uid) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <button
          onClick={signInWithGoogle}
          className="rounded-full border px-5 py-2 text-sm hover:bg-neutral-50"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-neutral-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="font-semibold tracking-wide">LIVET</div>
          <button
            onClick={logout}
            className="text-sm rounded-md border px-3 py-1 hover:bg-neutral-50"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Perfil */}
      <section className="mx-auto max-w-5xl px-4 pt-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <img
              src={avatar}
              className="h-16 w-16 rounded-full object-cover border"
              alt="avatar"
            />
            <button
              onClick={() => avatarPickerRef.current?.click()}
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] bg-black text-white px-2 py-[2px] rounded-full"
            >
              Change
            </button>
            <input
              ref={avatarPickerRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div>
            <div className="text-lg font-semibold">{profile?.full_name || "Andrex"}</div>
            <div className="text-sm text-neutral-500">@{profile?.username || "andrexvive"}</div>
            <div className="mt-1 text-xs text-neutral-500">
              <span className="mr-4">{posts.length} posts</span>
              <span className="mr-4">0 followers</span>
              <span>0 following</span>
            </div>
          </div>
        </div>
      </section>

      {/* Grade de posts do usuário */}
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6">
        {posts.length === 0 ? (
          <div className="text-sm text-neutral-500">No posts yet.</div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <article key={p.id} className="group">
                <button
                  onClick={() => openPost(p)}
                  className="block w-full overflow-hidden rounded-xl border"
                >
                  {p.media_type === "video" ? (
                    <video src={p.media_url} className="w-full h-[280px] object-cover" controls />
                  ) : (
                    <img src={p.media_url} className="w-full h-[280px] object-cover" />
                  )}
                </button>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-neutral-500 text-sm">
                    <Heart className="h-4 w-4" />
                    {/* O número exato aparece dentro do modal; aqui é apenas ícone */}
                  </div>
                  {p.user_id === uid && (
                    <button
                      onClick={() => deletePost(p.id)}
                      className="text-[13px] text-rose-600 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* Barra inferior */}
      <nav className="fixed bottom-0 left-0 right-0 border-t bg-white">
        <div className="mx-auto max-w-5xl px-6 py-3 grid grid-cols-4">
          <button
            className="mx-auto"
            onClick={() => setActiveTab("home")}
            aria-label="Home"
            title="Home"
          >
            <HomeIcon className="h-6 w-6" />
          </button>
          <button
            className="mx-auto"
            onClick={() => setActiveTab("search")}
            aria-label="Search"
            title="Search"
          >
            <SearchIcon className="h-6 w-6" />
          </button>
          <button
            className="mx-auto"
            onClick={() => postPickerRef.current?.click()}
            aria-label="New post"
            title="New post"
          >
            <PlusIcon className="h-6 w-6" />
          </button>
          <button
            className="mx-auto"
            onClick={() => setActiveTab("profile")}
            aria-label="Profile"
            title="Profile"
          >
            <UserIcon className="h-6 w-6" />
          </button>
        </div>

        {/* input oculto só para o + */}
        <input
          ref={postPickerRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handlePostPick}
        />
      </nav>

      {/* Modal do post */}
      {openPostId && modalPost && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white w-full max-w-5xl rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-2"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mídia */}
            <div className="bg-black/5">
              {modalPost.media_type === "video" ? (
                <video
                  src={modalPost.media_url}
                  className="w-full h-[70vh] object-contain bg-black"
                  controls
                />
              ) : (
                <img
                  src={modalPost.media_url}
                  className="w-full h-[70vh] object-contain bg-black"
                />
              )}
            </div>

            {/* Lateral direita */}
            <div className="p-4 flex flex-col">
              {/* header mini */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img
                    src={avatar}
                    className="h-7 w-7 rounded-full object-cover border"
                    alt=""
                  />
                  <div className="text-sm font-medium">
                    @{profile?.username || "andrexvive"}
                  </div>
                </div>
                {modalPost.user_id === uid && (
                  <button
                    onClick={() => deletePost(modalPost.id)}
                    className="text-sm text-rose-600 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>

              {/* ações */}
              <div className="mt-4 flex items-center gap-5">
                <button
                  onClick={toggleLike}
                  className="flex items-center gap-1 text-neutral-700"
                >
                  <Heart className={`h-6 w-6 ${modalLiked ? "text-rose-600" : ""}`} filled={modalLiked} />
                  <span className="text-sm">{modalLikeCount}</span>
                </button>
                <div className="flex items-center gap-1 text-neutral-700">
                  <Chat className="h-6 w-6" />
                  <span className="text-sm">{modalComments.length}</span>
                </div>
              </div>

              {/* lista de comentários (sem data/hora) */}
              <div className="mt-3 flex-1 overflow-auto pr-1 space-y-3">
                {modalComments.length === 0 ? (
                  <div className="text-sm text-neutral-500">Be the first to comment</div>
                ) : (
                  modalComments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2">
                      <img
                        src={c.profiles?.avatar_url || avatar}
                        className="h-7 w-7 rounded-full object-cover border mt-[2px]"
                        alt=""
                      />
                      <div className="flex-1 text-sm">
                        <span className="font-medium">@{c.profiles?.username || "user"}</span>{" "}
                        <span>{c.content}</span>
                      </div>
                      {c.user_id === uid && (
                        <button
                          onClick={() => deleteComment(c.id)}
                          className="text-[12px] text-rose-600 hover:underline"
                          title="Delete"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* nova mensagem */}
              <div className="mt-4 flex items-center gap-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-300"
                />
                <button
                  onClick={addComment}
                  className="rounded-md bg-neutral-900 text-white px-4 py-2 text-sm hover:bg-neutral-800"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
