import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase"; // <<< ajuste se necessário

// ---------- Tipos ----------
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
  likes_count: number;
  comments_count: number;
  user?: { username: string | null; avatar_url: string | null };
};

type LikeRow = { id: string; post_id: string; user_id: string };

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  content: string; // se sua coluna chama "text", mude para "text"
  created_at: string;
  profile?: { username: string | null; avatar_url: string | null };
};

// ---------- Helpers ----------
const cls = (...xs: (string | false | null | undefined)[]) =>
  xs.filter(Boolean).join(" ");

function fmt(n: number) {
  return new Intl.NumberFormat().format(n);
}

// ---------- App ----------
export default function App() {
  // auth
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);

  // ui
  const [tab, setTab] = useState<"home" | "search" | "post" | "profile">(
    "home"
  );
  const [loading, setLoading] = useState(true);

  // feed
  const [feed, setFeed] = useState<Post[]>([]);
  const [myPosts, setMyPosts] = useState<Post[]>([]);

  // upload refs
  const postInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // modal post
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  // comentários
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);

  // ---------- Auth bootstrap ----------
  useEffect(() => {
    let ignore = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!ignore) setSession(data.session ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => {
      setSession(s ?? null);
    });
    return () => {
      ignore = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ---------- Carrega meu perfil / garante criação ----------
  useEffect(() => {
    if (!session) {
      setMe(null);
      return;
    }
    (async () => {
      // garante row em profiles
      await supabase.rpc("ensure_profile_exists", {
        // opcional: crie essa RPC no seu projeto, senão ignore
      });

      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .eq("id", session.user.id)
        .single();
      if (data) setMe(data as Profile);
    })();
  }, [session]);

  // ---------- Carrega feed e meus posts ----------
  useEffect(() => {
    (async () => {
      // feed (todos)
      const { data: posts } = await supabase
        .from("posts")
        .select(
          "id, user_id, media_url, media_type, caption, created_at, likes_count, comments_count, profiles:profiles(username, avatar_url)"
        )
        .order("created_at", { ascending: false })
        .limit(100);

      if (posts) {
        setFeed(
          (posts as any).map((p: any) => ({
            ...p,
            user: p.profiles || null,
          }))
        );
      }

      // meus posts
      if (session) {
        const { data: mine } = await supabase
          .from("posts")
          .select(
            "id, user_id, media_url, media_type, caption, created_at, likes_count, comments_count"
          )
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false });
        if (mine) setMyPosts(mine as any);
      } else {
        setMyPosts([]);
      }
    })();
  }, [session]);

  // ---------- Login / Logout ----------
  async function signInWithGoogle() {
    const redirectTo =
      window.location.origin; // precisa estar liberado nos Redirect URLs
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) alert(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMe(null);
    setMyPosts([]);
  }

  // ---------- Upload de Post (foto/vídeo) ----------
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!session) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith("video/");
    const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
    const path = `posts/${session.user.id}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("media")
      .upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
      });

    if (upErr) {
      alert(upErr.message);
      return;
    }

    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
    const mediaUrl = pub?.publicUrl;

    if (!mediaUrl) {
      alert("Erro ao gerar URL pública.");
      return;
    }

    const { error: insErr, data } = await supabase
      .from("posts")
      .insert({
        user_id: session.user.id,
        media_url: mediaUrl,
        media_type: isVideo ? "video" : "image",
        caption: null,
      })
      .select(
        "id, user_id, media_url, media_type, caption, created_at, likes_count, comments_count"
      )
      .single();

    if (insErr) {
      alert(insErr.message);
      return;
    }

    // Atualiza listas
    setFeed((prev) => [
      {
        ...(data as any),
        user: { username: me?.username ?? null, avatar_url: me?.avatar_url ?? null },
      },
      ...prev,
    ]);
    if (session?.user.id === data!.user_id) {
      setMyPosts((prev) => [data as any, ...prev]);
    }
    if (postInputRef.current) postInputRef.current.value = "";
    setTab("home");
  }

  // ---------- Upload de Avatar ----------
  async function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    if (!session) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop() || "jpg";
    const path = `avatars/${session.user.id}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("media")
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
      });

    if (upErr) {
      alert(upErr.message);
      return;
    }

    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
    const avatar_url = pub?.publicUrl;

    const { error: upProfile } = await supabase
      .from("profiles")
      .update({ avatar_url })
      .eq("id", session.user.id);

    if (upProfile) {
      alert(upProfile.message);
      return;
    }

    setMe((p) => (p ? { ...p, avatar_url } : p));
  }

  // ---------- Like / Unlike ----------
  async function toggleLike(p: Post) {
    if (!session) return;

    // existe like?
    const { data: existing } = await supabase
      .from("likes")
      .select("id")
      .eq("post_id", p.id)
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (existing) {
      await supabase.from("likes").delete().eq("id", existing.id);
      setFeed((prev) =>
        prev.map((x) =>
          x.id === p.id ? { ...x, likes_count: Math.max(0, x.likes_count - 1) } : x
        )
      );
      setMyPosts((prev) =>
        prev.map((x) =>
          x.id === p.id ? { ...x, likes_count: Math.max(0, x.likes_count - 1) } : x
        )
      );
    } else {
      await supabase
        .from("likes")
        .insert({ post_id: p.id, user_id: session.user.id });
      setFeed((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, likes_count: x.likes_count + 1 } : x))
      );
      setMyPosts((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, likes_count: x.likes_count + 1 } : x))
      );
    }
  }

  // ---------- Comentários ----------
  async function loadComments(postId: string) {
    setLoadingComments(true);

    const { data, error } = await supabase
      .from("comments")
      .select(
        "id, post_id, user_id, content, created_at, profiles:profiles(id, username, avatar_url)"
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("loadComments:", error);
      setComments([]);
    } else {
      const list =
        (data as any)?.map((c: any) => ({
          id: c.id,
          post_id: c.post_id,
          user_id: c.user_id,
          content: c.content, // se sua coluna for "text": c.text
          created_at: c.created_at,
          profile: c.profiles
            ? {
                username: c.profiles.username,
                avatar_url: c.profiles.avatar_url,
              }
            : undefined,
        })) ?? [];
      setComments(list);
    }

    setLoadingComments(false);
  }

  async function handleSendComment() {
    if (!session || !selectedPost || !commentText.trim()) return;

    const text = commentText.trim();

    const { data, error } = await supabase
      .from("comments")
      .insert({
        post_id: selectedPost.id,
        user_id: session.user.id,
        content: text, // se sua coluna chama "text": text: text
      })
      .select(
        "id, post_id, user_id, content, created_at, profiles:profiles(id, username, avatar_url)"
      )
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    // adiciona imediatamente na UI
    setComments((prev) => [
      ...prev,
      {
        id: (data as any).id,
        post_id: (data as any).post_id,
        user_id: (data as any).user_id,
        content: (data as any).content, // ou .text
        created_at: (data as any).created_at,
        profile: (data as any).profiles
          ? {
              username: (data as any).profiles.username,
              avatar_url: (data as any).profiles.avatar_url,
            }
          : undefined,
      },
    ]);

    // atualiza contador
    setFeed((prev) =>
      prev.map((p) =>
        p.id === selectedPost.id ? { ...p, comments_count: p.comments_count + 1 } : p
      )
    );
    setMyPosts((prev) =>
      prev.map((p) =>
        p.id === selectedPost.id ? { ...p, comments_count: p.comments_count + 1 } : p
      )
    );

    setCommentText("");
  }

  // ---------- Abrir/fechar modal ----------
  function openPost(p: Post) {
    setSelectedPost(p);
    loadComments(p.id);
    setIsPostModalOpen(true);
  }

  function closePost() {
    setIsPostModalOpen(false);
    setSelectedPost(null);
    setComments([]);
    setCommentText("");
  }

  // ---------- Excluir post (dono) ----------
  async function deletePost(p: Post) {
    if (!session || p.user_id !== session.user.id) return;
    if (!confirm("Delete this post?")) return;

    await supabase.from("posts").delete().eq("id", p.id);

    // tenta remover arquivo (best effort)
    try {
      const marker = "/storage/v1/object/public/media/";
      const idx = p.media_url.indexOf(marker);
      if (idx !== -1) {
        const key = p.media_url.slice(idx + marker.length);
        await supabase.storage.from("media").remove([key]);
      }
    } catch {}

    setFeed((prev) => prev.filter((x) => x.id !== p.id));
    setMyPosts((prev) => prev.filter((x) => x.id !== p.id));
    if (selectedPost?.id === p.id) closePost();
  }

  // ---------- Views ----------
  const grid = (posts: Post[]) => (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {posts.map((p) => (
        <div key={p.id} className="relative">
          <div
            className="aspect-square overflow-hidden rounded-xl border cursor-pointer"
            onClick={() => openPost(p)}
          >
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
          <div className="mt-2 flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <button
                className="flex items-center gap-1"
                onClick={() => toggleLike(p)}
                title="Like"
              >
                <span>❤️</span>
                <span>{fmt(p.likes_count)}</span>
              </button>
              <div className="flex items-center gap-1" title="Comments">
                <span>💬</span>
                <span>{fmt(p.comments_count)}</span>
              </div>
            </div>

            {session?.user.id === p.user_id && (
              <button
                className="text-rose-500 hover:underline"
                onClick={() => deletePost(p)}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const Home = () => (
    <div className="space-y-6">{grid(feed)}</div>
  );

  const Search = () => (
    <div className="text-center text-sm text-gray-500">
      (Search virá depois)
    </div>
  );

  const PostTab = () => (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-gray-600">
        Selecione uma foto ou vídeo. Após o upload, o post aparece no Home.
      </p>
      <input
        ref={postInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleUpload}
      />
    </div>
  );

  const ProfileTab = () => (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center gap-4">
        <label className="relative inline-block">
          <img
            src={me?.avatar_url || "/avatar-placeholder.png"}
            className="h-20 w-20 rounded-full object-cover border"
          />
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={handleAvatar}
          />
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-xs rounded bg-black/70 px-2 py-0.5 text-white">
            Change
          </span>
        </label>

        <div>
          <div className="font-semibold text-xl">
            {me?.full_name || "Your name"}
          </div>
          <div className="text-gray-600">@{me?.username || "username"}</div>
          <div className="mt-1 text-sm text-gray-500">
            {myPosts.length} posts
          </div>
        </div>

        <div className="ml-auto">
          <button
            onClick={signOut}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Logout
          </button>
        </div>
      </div>

      {grid(myPosts)}
    </div>
  );

  // ---------- Render principal ----------
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-gray-500">
        Carregando…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen grid place-items-center">
        <button
          onClick={signInWithGoogle}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Top profile summary */}
      <div className="mb-6 flex items-center gap-3">
        <img
          src={me?.avatar_url || "/avatar-placeholder.png"}
          className="h-12 w-12 rounded-full object-cover border"
        />
        <div>
          <div className="font-semibold">{me?.full_name || "Your name"}</div>
          <div className="text-gray-600 text-sm">@{me?.username || "username"}</div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="min-h-[50vh]">
        {tab === "home" && <Home />}
        {tab === "search" && <Search />}
        {tab === "post" && <PostTab />}
        {tab === "profile" && <ProfileTab />}
      </div>

      {/* Navbar inferior */}
      <div className="sticky bottom-0 left-0 right-0 z-10 mt-10 border-t bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto flex max-w-2xl items-center justify-around py-3">
          <NavBtn active={tab === "home"} onClick={() => setTab("home")} label="Home">
            <HomeIcon />
          </NavBtn>
          <NavBtn
            active={tab === "search"}
            onClick={() => setTab("search")}
            label="Search"
          >
            <SearchIcon />
          </NavBtn>
          <NavBtn active={tab === "post"} onClick={() => setTab("post")} label="Post">
            <PlusIcon />
          </NavBtn>
          <NavBtn
            active={tab === "profile"}
            onClick={() => setTab("profile")}
            label="Profile"
          >
            <UserIcon />
          </NavBtn>
        </div>
      </div>

      {/* Modal do Post */}
      {isPostModalOpen && selectedPost && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closePost}
          />
          <div className="absolute inset-0 grid place-items-center p-4">
            <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
              <div className="flex items-start gap-4 p-4 md:p-6">
                <div className="w-1/2">
                  <div className="aspect-square overflow-hidden rounded-xl border">
                    {selectedPost.media_type === "image" ? (
                      <img
                        src={selectedPost.media_url}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <video
                        src={selectedPost.media_url}
                        className="h-full w-full object-cover"
                        controls
                        playsInline
                        preload="metadata"
                      />
                    )}
                  </div>
                </div>

                <div className="w-1/2">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img
                        src={
                          selectedPost.user?.avatar_url || "/avatar-placeholder.png"
                        }
                        className="h-8 w-8 rounded-full object-cover"
                      />
                      <div className="font-medium">
                        @{selectedPost.user?.username || "user"}
                      </div>
                    </div>

                    <button
                      className="text-gray-400 hover:text-black"
                      onClick={closePost}
                      title="Close"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex items-center gap-5 text-sm">
                    <button
                      className="flex items-center gap-1"
                      onClick={() => toggleLike(selectedPost)}
                    >
                      <span>❤️</span>
                      <span>{fmt(selectedPost.likes_count)}</span>
                    </button>
                    <div className="flex items-center gap-1">
                      <span>💬</span>
                      <span>{fmt(selectedPost.comments_count)}</span>
                    </div>

                    {session?.user.id === selectedPost.user_id && (
                      <button
                        className="ml-auto text-rose-500 hover:underline"
                        onClick={() => deletePost(selectedPost)}
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  {/* Lista de comentários */}
                  <div className="mt-3 max-h-72 overflow-auto pr-2">
                    {loadingComments ? (
                      <p className="text-sm text-gray-500">
                        Carregando comentários…
                      </p>
                    ) : comments.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Be the first to comment
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {comments.map((c) => (
                          <div key={c.id} className="flex items-start gap-3">
                            <img
                              src={c.profile?.avatar_url || "/avatar-placeholder.png"}
                              className="h-7 w-7 rounded-full object-cover"
                            />
                            <div className="text-sm leading-5">
                              <span className="font-medium">
                                @{c.profile?.username ?? "user"}
                              </span>{" "}
                              <span>{c.content}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* escrever comentário */}
                  <div className="mt-4 flex items-center gap-2">
                    <input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Write a comment..."
                      className="flex-1 rounded border px-3 py-2 text-sm"
                    />
                    <button
                      onClick={handleSendComment}
                      className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
                      disabled={!commentText.trim()}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- UI bits ----------
function NavBtn({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cls(
        "flex flex-col items-center gap-1 text-xs",
        active ? "text-black" : "text-gray-500"
      )}
      aria-label={label}
      title={label}
    >
      <div className="h-6 w-6">{children}</div>
    </button>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 21a7 7 0 0 1 14 0"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}
