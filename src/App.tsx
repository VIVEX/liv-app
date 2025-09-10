// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import supabase from "./lib/supabaseClient";
import { LogOut, Heart, MessageCircle, Trash2, Plus, Home, Search, Film, User as UserIcon } from "lucide-react";

/** ===== Tipos ===== */
type Profile = {
  id: string;           // = auth.users.id
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type Post = {
  id: string;
  user_id: string;
  media_url: string;    // URL pública do Storage
  caption: string | null;
  media_type: "image" | "video";
  created_at: string;
  profile?: Profile;    // joined
  likes_count?: number;
  comments_count?: number;
  liked_by_me?: boolean;
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: Profile;
};

/** Util */
const formatDate = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });

/** ====== App ====== */
export default function App() {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<"home" | "search" | "add" | "reels" | "me">("home");

  // Feed
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Comentários (modal simples)
  const [commentsOpenFor, setCommentsOpenFor] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const commentsLoading = useRef(false);

  /** ---------- Sessão & Perfil ---------- */
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      setSessionUserId(uid);

      if (!uid) return;

      // Busca/Cria profile mínimo
      const { data: existing } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .maybeSingle();

      if (existing) {
        setProfile(existing as Profile);
      } else {
        const emailUser = session!.user!.email?.split("@")[0] ?? "user";
        const username = emailUser.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) || `u${uid.slice(0, 6)}`;
        const { data: created } = await supabase
          .from("profiles")
          .insert({ id: uid, username, full_name: session!.user!.user_metadata?.full_name ?? null })
          .select("*")
          .single();
        if (created) setProfile(created as Profile);
      }
    })();
  }, []);

  /** ---------- Feed ---------- */
  const fetchFeed = async () => {
    setLoadingFeed(true);
    // Para já: todos os posts (depois filtramos por “seguindo”)
    const { data, error } = await supabase
      .from("posts")
      .select(`
        id, user_id, media_url, caption, media_type, created_at,
        profiles:profiles!posts_user_id_fkey ( id, username, full_name, avatar_url ),
        likes:likes(count),
        comments:comments(count)
      `)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const normalized: Post[] = (data as any[]).map((r) => {
        const likes_count = r.likes?.[0]?.count ?? 0;
        const comments_count = r.comments?.[0]?.count ?? 0;
        return {
          id: r.id,
          user_id: r.user_id,
          media_url: r.media_url,
          caption: r.caption,
          media_type: r.media_type,
          created_at: r.created_at,
          profile: r.profiles,
          likes_count,
          comments_count,
          liked_by_me: false, // ajustamos abaixo
        };
      });

      // marca quais eu curti
      if (sessionUserId && normalized.length) {
        const ids = normalized.map((p) => p.id);
        const { data: myLikes } = await supabase
          .from("likes")
          .select("post_id")
          .eq("user_id", sessionUserId)
          .in("post_id", ids);
        const likedSet = new Set((myLikes ?? []).map((x) => x.post_id));
        normalized.forEach((p) => (p.liked_by_me = likedSet.has(p.id)));
      }

      setPosts(normalized);
    }
    setLoadingFeed(false);
  };

  useEffect(() => {
    if (sessionUserId) fetchFeed();
  }, [sessionUserId]);

  /** ---------- Upload (abre pelo +) ---------- */
  const openPicker = () => fileInputRef.current?.click();

  const handleFile = async (file: File | null) => {
    if (!file || !sessionUserId) return;
    setUploading(true);
    try {
      const isVideo = file.type.startsWith("video");
      const safeName = file.name.replace(/\s+/g, "_");
      const path = `${sessionUserId}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage.from("media").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      const media_url = pub.publicUrl;

      const { error: insErr } = await supabase.from("posts").insert({
        user_id: sessionUserId,
        media_url,
        media_type: isVideo ? "video" : "image",
        caption: null,
      });
      if (insErr) throw insErr;

      await fetchFeed();
      setActiveTab("home");
    } catch (e) {
      alert("Falha ao publicar. Verifique as policies do bucket e a tabela posts.");
      console.error(e);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /** ---------- Curtir ---------- */
  const toggleLike = async (post: Post) => {
    if (!sessionUserId) return;
    // UI otimista
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              liked_by_me: !p.liked_by_me,
              likes_count: (p.likes_count ?? 0) + (p.liked_by_me ? -1 : 1),
            }
          : p
      )
    );
    if (post.liked_by_me) {
      await supabase.from("likes").delete().eq("post_id", post.id).eq("user_id", sessionUserId);
    } else {
      await supabase.from("likes").insert({ post_id: post.id, user_id: sessionUserId });
    }
  };

  /** ---------- Comentários ---------- */
  const openComments = async (post: Post) => {
    setCommentsOpenFor(post);
    await loadComments(post.id);
  };

  const loadComments = async (postId: string) => {
    if (commentsLoading.current) return;
    commentsLoading.current = true;
    const { data } = await supabase
      .from("comments")
      .select(
        `id, post_id, user_id, content, created_at,
         profiles:profiles!comments_user_id_fkey ( id, username, full_name, avatar_url )`
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    setComments((data as any[]) ?? []);
    commentsLoading.current = false;
  };

  const sendComment = async () => {
    if (!sessionUserId || !commentsOpenFor) return;
    const content = commentText.trim();
    if (!content) return;

    const postId = commentsOpenFor.id;
    const { error } = await supabase
      .from("comments")
      .insert({ post_id: postId, user_id: sessionUserId, content });

    if (error) {
      alert("Não foi possível comentar.");
      console.error(error);
      return;
    }
    setCommentText("");
    await loadComments(postId);
    // atualiza contador no feed
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, comments_count: (p.comments_count ?? 0) + 1 } : p))
    );
  };

  /** ---------- Excluir post ---------- */
  const deletePost = async (post: Post) => {
    if (!sessionUserId || post.user_id !== sessionUserId) return;
    if (!confirm("Excluir este post?")) return;

    // tenta apagar o arquivo do Storage (opcional; se falhar, ignoramos)
    try {
      const url = new URL(post.media_url);
      // public URL pattern: https://<proj>.supabase.co/storage/v1/object/public/media/<path>
      const idx = url.pathname.indexOf("/media/");
      const rel = url.pathname.slice(idx + "/media/".length);
      await supabase.storage.from("media").remove([rel]);
    } catch {}

    const { error } = await supabase.from("posts").delete().eq("id", post.id).eq("user_id", sessionUserId);
    if (error) {
      alert("Não foi possível excluir.");
      console.error(error);
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
  };

  /** ---------- UI ---------- */
  if (!sessionUserId) {
    return (
      <div className="min-h-screen grid place-items-center bg-neutral-50">
        <div className="w-[90%] max-w-sm rounded-2xl border p-8 bg-white shadow-sm text-center">
          <h1 className="text-2xl font-semibold mb-2">LIV</h1>
          <p className="text-neutral-500 mb-6">Compartilhe sua vida saudável</p>
          <button
            onClick={() => supabase.auth.signInWithOAuth({ provider: "google" })}
            className="w-full rounded-xl bg-black text-white py-3"
          >
            Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  const isMe = (uid: string) => uid === sessionUserId;
  const myPosts = useMemo(() => posts.filter((p) => p.user_id === sessionUserId), [posts]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* topo */}
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b px-4 py-3 flex items-center justify-between">
        <span className="font-semibold">LIV</span>
        <button
          onClick={() => supabase.auth.signOut().then(() => window.location.reload())}
          className="text-neutral-500 hover:text-neutral-800"
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>

      {/* conteúdo */}
      {activeTab === "home" && (
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          {loadingFeed && <p className="text-center text-neutral-500">Carregando…</p>}
          {!loadingFeed && posts.length === 0 && (
            <p className="text-center text-neutral-500 mt-16">Sem posts por enquanto.</p>
          )}
          {posts.map((post) => (
            <article key={post.id} className="bg-white border rounded-2xl overflow-hidden">
              {/* Cabeçalho autor */}
              <div className="px-4 py-3 flex items-center gap-3">
                <Avatar url={post.profile?.avatar_url} name={post.profile?.full_name || post.profile?.username || "User"} size={36} />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{post.profile?.full_name || post.profile?.username || "User"}</div>
                  <div className="text-xs text-neutral-500">@{post.profile?.username} · {formatDate(post.created_at)}</div>
                </div>
                {isMe(post.user_id) && (
                  <button onClick={() => deletePost(post)} className="text-red-500 hover:text-red-600" title="Excluir post">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              {/* Mídia */}
              <MediaBlock post={post} />

              {/* Ações */}
              <div className="px-4 py-3 flex items-center gap-6">
                <button
                  onClick={() => toggleLike(post)}
                  className={`flex items-center gap-2 ${post.liked_by_me ? "text-rose-600" : "text-neutral-700"} hover:opacity-80`}
                >
                  <Heart size={18} fill={post.liked_by_me ? "currentColor" : "none"} />
                  <span className="text-sm">{post.likes_count ?? 0}</span>
                </button>
                <button
                  onClick={() => openComments(post)}
                  className="flex items-center gap-2 text-neutral-700 hover:opacity-80"
                >
                  <MessageCircle size={18} />
                  <span className="text-sm">{post.comments_count ?? 0}</span>
                </button>
              </div>

              {/* Legenda (se existir) */}
              {post.caption && <div className="px-4 pb-4 text-sm">{post.caption}</div>}
            </article>
          ))}
        </div>
      )}

      {activeTab === "me" && (
        <div className="max-w-4xl mx-auto p-4">
          {/* Header do perfil */}
          <div className="flex items-center gap-4 mb-6">
            <Avatar url={profile?.avatar_url} name={profile?.full_name || profile?.username || "Eu"} size={64} />
            <div className="flex-1">
              <div className="text-xl font-semibold">{profile?.full_name || profile?.username}</div>
              <div className="text-neutral-500">@{profile?.username}</div>
              <div className="flex gap-6 mt-2 text-sm">
                <div><span className="font-semibold">{myPosts.length}</span> posts</div>
                <div><span className="font-semibold">0</span> seguidores</div>
                <div><span className="font-semibold">0</span> seguindo</div>
              </div>
            </div>
          </div>

          {/* Grade */}
          <div className="grid grid-cols-3 gap-3">
            {myPosts.map((p) => (
              <div key={p.id} className="relative aspect-square bg-neutral-200 rounded-xl overflow-hidden">
                <MediaTile post={p} />
                <button
                  onClick={() => deletePost(p)}
                  className="absolute top-2 right-2 bg-white/80 rounded-full p-1 shadow hover:bg-white"
                  title="Excluir post"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs inferiores */}
      <nav className="sticky bottom-0 bg-white border-t">
        <div className="max-w-3xl mx-auto grid grid-cols-5">
          <Tab icon={<Home size={22} />} active={activeTab === "home"} onClick={() => setActiveTab("home")} />
          <Tab icon={<Search size={22} />} active={activeTab === "search"} onClick={() => setActiveTab("search")} />
          <Tab
            icon={<Plus size={22} />}
            active={false}
            onClick={() => {
              setActiveTab("add");
              openPicker();
            }}
          />
          <Tab icon={<Film size={22} />} active={activeTab === "reels"} onClick={() => setActiveTab("reels")} />
          <Tab icon={<UserIcon size={22} />} active={activeTab === "me"} onClick={() => setActiveTab("me")} />
        </div>
      </nav>

      {/* input de arquivo oculto (abre pelo +) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] || null)}
        disabled={uploading}
      />

      {/* Modal de comentários */}
      {commentsOpenFor && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-20">
          <div className="w-full max-w-lg bg-white rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">Comentários</div>
              <button className="text-sm text-neutral-500" onClick={() => setCommentsOpenFor(null)}>Fechar</button>
            </div>
            <div className="max-h-[50vh] overflow-auto divide-y">
              {comments.length === 0 && <div className="p-4 text-sm text-neutral-500">Seja o primeiro a comentar</div>}
              {comments.map((c) => (
                <div key={c.id} className="p-3 flex items-start gap-3">
                  <Avatar url={c.profile?.avatar_url} name={c.profile?.full_name || c.profile?.username || "User"} size={28} />
                  <div className="flex-1">
                    <div className="text-sm">
                      <span className="font-semibold mr-2">{c.profile?.username || "user"}</span>
                      {c.content}
                    </div>
                    <div className="text-xs text-neutral-500">{formatDate(c.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t flex items-center gap-2">
              <input
                className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none"
                placeholder="Escreva um comentário…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <button onClick={sendComment} className="rounded-xl bg-black text-white px-4 py-2 text-sm">Enviar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** --------- Componentes auxiliares --------- */
function Tab({ icon, active, onClick }: { icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`py-3 grid place-items-center ${active ? "text-black" : "text-neutral-500"}`}
    >
      {icon}
    </button>
  );
}

function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  const initials = (name || "U")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover border"
        style={{ width: size, height: size }}
        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
      />
    );
  }
  return (
    <div
      className="rounded-full grid place-items-center bg-neutral-200 border text-neutral-700"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}

function MediaBlock({ post }: { post: Post }) {
  if (post.media_type === "video") {
    return (
      <video
        className="w-full max-h-[70vh] bg-black"
        src={post.media_url}
        controls
        preload="metadata"
        playsInline
      />
    );
  }
  return (
    <img
      src={post.media_url}
      alt={post.caption ?? "post"}
      className="w-full max-h-[70vh] object-contain bg-black"
      onError={(e) => {
        // evita “branco”: se não carregar, mostra uma caixa cinza
        (e.currentTarget as HTMLImageElement).style.display = "none";
        const parent = (e.currentTarget.parentElement as HTMLElement);
        if (parent) parent.innerHTML = '<div style="background:#eee;height:320px"></div>';
      }}
    />
  );
}

function MediaTile({ post }: { post: Post }) {
  if (post.media_type === "video") {
    return <video className="w-full h-full object-cover" src={post.media_url + "#t=0.1"} muted playsInline />;
  }
  return <img className="w-full h-full object-cover" src={post.media_url} alt="" />;
}
