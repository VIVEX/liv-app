// src/App.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "./lib/supabaseClient";
import { Camera, Heart, MessageCircle, Trash2, Home, Search, PlusSquare, Film, User } from "lucide-react";

// --------- Tipos ---------
type Profile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  full_name: string | null;
};

type Post = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string | null;
  created_at: string;
  profiles?: Profile; // join
  likes?: { id: string; user_id: string }[];
  comments?: CommentRow[];
};

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: Profile;
};

// --------- Helpers ---------
function isVideoFile(file: File) {
  return file.type.startsWith("video/");
}
function fileExt(file: File) {
  const n = file.name.split(".");
  return n.length > 1 ? n.pop()!.toLowerCase() : "";
}
function mediaTypeFromUrl(url: string): "image" | "video" {
  return /\.(mp4|mov|webm)$/i.test(url) ? "video" : "image";
}

// --------- UI básicos ---------
const Btn = (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...p}
    className={
      "rounded-xl px-4 py-2 text-sm font-medium shadow-sm border border-neutral-200 hover:bg-neutral-50 active:scale-[.99] disabled:opacity-50 " +
      (p.className ?? "")
    }
  />
);

const Avatar = ({ url, size = 40 }: { url?: string | null; size?: number }) => (
  <div
    style={{ width: size, height: size }}
    className="rounded-full bg-neutral-200 overflow-hidden flex items-center justify-center"
  >
    {url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className="w-full h-full object-cover" />
    ) : (
      <div className="text-xs text-neutral-500">AN</div>
    )}
  </div>
);

// --------- App ---------
type Tab = "feed" | "search" | "new" | "reels" | "profile";

export default function App() {
  const [tab, setTab] = useState<Tab>("feed");
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [me, setMe] = useState<Profile | null>(null);

  // feed
  const [feed, setFeed] = useState<Post[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);

  // profile screen
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [counts, setCounts] = useState<{ posts: number; followers: number; following: number }>({
    posts: 0,
    followers: 0,
    following: 0,
  });

  // comments modal
  const [openCommentsFor, setOpenCommentsFor] = useState<Post | null>(null);
  const [newComment, setNewComment] = useState("");

  // file picker for +
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------- Session / Me ----------
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setSessionUserId(uid);

      if (!uid) return;

      const { data: p } = await supabase.from("profiles").select("*").eq("id", uid).single();
      if (p) setMe(p as Profile);
    };
    init();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      const uid = s?.user?.id ?? null;
      setSessionUserId(uid);
    });
    return () => sub.subscription?.unsubscribe();
  }, []);

  // ---------- Feed ----------
  useEffect(() => {
    if (!sessionUserId) return;
    const load = async () => {
      setLoadingFeed(true);

      // ids que eu sigo
      const { data: followingRows, error: fErr } = await supabase
        .from("followers")
        .select("following_id")
        .eq("follower_id", sessionUserId);

      if (fErr) console.error(fErr);

      const followingIds = (followingRows ?? []).map((r) => r.following_id);
      const universe = Array.from(new Set([sessionUserId, ...followingIds]));

      // posts das pessoas que sigo + meus
      const { data: posts, error } = await supabase
        .from("posts")
        .select(
          "id,user_id,media_url,media_type,caption,created_at, profiles:profiles!posts_user_id_fkey(id,username,avatar_url), likes(id,user_id), comments(id,post_id,user_id,content,created_at,profiles:profiles(id,username,avatar_url))"
        )
        .in("user_id", universe)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
      } else {
        setFeed((posts as Post[]) || []);
      }
      setLoadingFeed(false);
    };
    load();
  }, [sessionUserId]);

  // ---------- Meu Perfil ----------
  useEffect(() => {
    if (!sessionUserId) return;
    const load = async () => {
      const [{ data: pc }, { data: fc }, { data: ing } ] = await Promise.all([
        supabase.from("posts").select("id", { count: "exact", head: true }),
        supabase.from("followers").select("id", { count: "exact", head: true }).eq("following_id", sessionUserId),
        supabase.from("followers").select("id", { count: "exact", head: true }).eq("follower_id", sessionUserId),
      ]);

      const postsCount = (pc as any)?.count ?? 0;
      const followersCount = (fc as any)?.count ?? 0;
      const followingCount = (ing as any)?.count ?? 0;
      setCounts({ posts: postsCount, followers: followersCount, following: followingCount });

      const { data: posts } = await supabase
        .from("posts")
        .select("id,user_id,media_url,media_type,caption,created_at, likes(id,user_id)")
        .eq("user_id", sessionUserId)
        .order("created_at", { ascending: false });

      setMyPosts((posts as Post[]) || []);
    };
    load();
  }, [sessionUserId]);

  // ---------- Ações ----------
  const iLike = (p: Post) => p.likes?.some((l) => l.user_id === sessionUserId);

  const toggleLike = async (post: Post) => {
    if (!sessionUserId) return;
    try {
      if (iLike(post)) {
        // descurtir
        const like = post.likes!.find((l) => l.user_id === sessionUserId)!;
        await supabase.from("likes").delete().eq("id", like.id);
        // otimista
        setFeed((old) =>
          old.map((x) => (x.id === post.id ? { ...x, likes: (x.likes || []).filter((l) => l.id !== like.id) } : x))
        );
        setMyPosts((old) =>
          old.map((x) => (x.id === post.id ? { ...x, likes: (x.likes || []).filter((l) => l.id !== like.id) } : x))
        );
      } else {
        const { data, error } = await supabase
          .from("likes")
          .insert({ post_id: post.id, user_id: sessionUserId })
          .select()
          .single();
        if (error) throw error;
        setFeed((old) => old.map((x) => (x.id === post.id ? { ...x, likes: [...(x.likes || []), data] } : x)));
        setMyPosts((old) => old.map((x) => (x.id === post.id ? { ...x, likes: [...(x.likes || []), data] } : x)));
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível atualizar a curtida.");
    }
  };

  const deletePost = async (postId: string) => {
    if (!sessionUserId) return;
    if (!confirm("Excluir post?")) return;
    try {
      await supabase.from("posts").delete().eq("id", postId).eq("user_id", sessionUserId);
      setFeed((old) => old.filter((p) => p.id !== postId));
      setMyPosts((old) => old.filter((p) => p.id !== postId));
      setCounts((c) => ({ ...c, posts: Math.max(0, c.posts - 1) }));
    } catch (e) {
      console.error(e);
      alert("Erro ao excluir.");
    }
  };

  const sendComment = async () => {
    if (!openCommentsFor || !newComment.trim() || !sessionUserId) return;
    try {
      const { data, error } = await supabase
        .from("comments")
        .insert({ post_id: openCommentsFor.id, user_id: sessionUserId, content: newComment.trim() })
        .select("id,post_id,user_id,content,created_at,profiles:profiles(id,username,avatar_url)")
        .single();
      if (error) throw error;

      setFeed((old) =>
        old.map((p) => (p.id === openCommentsFor.id ? { ...p, comments: [...(p.comments || []), data as any] } : p))
      );
      setNewComment("");
    } catch (e) {
      console.error(e);
      alert("Não foi possível comentar.");
    }
  };

  // upload pelo botão +
  const onPickFile = () => fileInputRef.current?.click();

  const onFileChosen: React.ChangeEventHandler<HTMLInputElement> = async (ev) => {
    const f = ev.target.files?.[0];
    if (!f || !sessionUserId) return;

    try {
      // nome único
      const path = `${sessionUserId}/${Date.now()}.${fileExt(f) || (isVideoFile(f) ? "mp4" : "jpg")}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, f, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      const media_url = pub.publicUrl;
      const media_type = isVideoFile(f) ? "video" : "image";

      const { data: post, error } = await supabase
        .from("posts")
        .insert({ user_id: sessionUserId, media_url, media_type, caption: null })
        .select()
        .single();
      if (error) throw error;

      // add no topo do feed e do perfil
      const newPost: Post = { ...(post as any), likes: [], comments: [], profiles: me || undefined };
      setFeed((old) => [newPost, ...old]);
      setMyPosts((old) => [newPost, ...old]);
      setCounts((c) => ({ ...c, posts: c.posts + 1 }));
      setTab("profile");
    } catch (e: any) {
      console.error(e);
      alert("Falha ao publicar. " + (e?.message || ""));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // --------- Render ---------
  if (!sessionUserId) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="rounded-2xl border p-10 w-[320px] text-center shadow-sm">
          <h1 className="text-2xl font-bold mb-2">LIV</h1>
          <p className="text-neutral-600 mb-6">Compartilhe sua vida saudável</p>
          <Btn
            onClick={async () => {
              const { error } = await supabase.auth.signInWithOAuth({ provider: "google" });
              if (error) alert(error.message);
            }}
            className="w-full bg-black text-white border-black"
          >
            Entrar com Google
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black">
      {/* topo */}
      <div className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <span className="font-semibold">LIV</span>
          <div className="flex items-center gap-3">
            <Btn
              onClick={async () => {
                await supabase.auth.signOut();
                location.reload();
              }}
            >
              Logout
            </Btn>
          </div>
        </div>
      </div>

      {/* conteúdo */}
      <main className="mx-auto max-w-2xl px-2 pb-24">
        {tab === "feed" && (
          <section className="pt-4">
            {loadingFeed && <p className="text-center text-neutral-500 mt-10">Carregando…</p>}
            {!loadingFeed && feed.length === 0 && (
              <p className="text-center text-neutral-500 mt-10">Sem posts por enquanto.</p>
            )}

            <div className="flex flex-col gap-6">
              {feed.map((p) => (
                <article key={p.id} className="rounded-2xl border overflow-hidden">
                  {/* header do post */}
                  <div className="px-3 py-2 flex items-center gap-3">
                    <Avatar url={p.profiles?.avatar_url} />
                    <div className="text-sm">
                      <div className="font-semibold">@{p.profiles?.username ?? "user"}</div>
                      <div className="text-neutral-500 text-xs">
                        {new Date(p.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="ml-auto">
                      {p.user_id === sessionUserId && (
                        <button
                          onClick={() => deletePost(p.id)}
                          className="p-2 rounded-full hover:bg-neutral-100"
                          title="Excluir post"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* mídia */}
                  <div className="bg-black">
                    {p.media_type === "video" ? (
                      <video src={p.media_url} controls className="w-full max-h-[70vh] object-contain" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.media_url} alt="" className="w-full object-cover max-h-[70vh]" />
                    )}
                  </div>

                  {/* ações */}
                  <div className="px-3 py-2 flex items-center gap-4">
                    <button className="flex items-center gap-1" onClick={() => toggleLike(p)}>
                      <Heart
                        size={22}
                        className={iLike(p) ? "fill-red-500 stroke-red-500" : "stroke-black"}
                      />
                      <span className="text-sm">{p.likes?.length || 0}</span>
                    </button>

                    <button
                      className="flex items-center gap-1"
                      onClick={() => setOpenCommentsFor(p)}
                      title="Comentários"
                    >
                      <MessageCircle size={22} />
                      <span className="text-sm">{p.comments?.length || 0}</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "profile" && me && (
          <section className="pt-4">
            <div className="flex items-center gap-4 px-2">
              <Avatar url={me.avatar_url} size={70} />
              <div>
                <div className="text-xl font-semibold">{me.full_name || "Meu perfil"}</div>
                <div className="text-neutral-500">@{me.username}</div>
              </div>
            </div>

            {/* contadores */}
            <div className="grid grid-cols-3 text-center my-4">
              <div>
                <div className="font-semibold">{counts.posts}</div>
                <div className="text-neutral-500 text-sm">posts</div>
              </div>
              <div>
                <div className="font-semibold">{counts.followers}</div>
                <div className="text-neutral-500 text-sm">seguidores</div>
              </div>
              <div>
                <div className="font-semibold">{counts.following}</div>
                <div className="text-neutral-500 text-sm">seguindo</div>
              </div>
            </div>

            {/* grade de posts */}
            <div className="grid grid-cols-3 gap-2">
              {myPosts.map((p) => (
                <div key={p.id} className="relative group aspect-square overflow-hidden rounded-lg border">
                  {p.media_type === "video" ? (
                    <video src={p.media_url} className="w-full h-full object-cover" muted />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.media_url} className="w-full h-full object-cover" alt="" />
                  )}

                  {/* excluir no hover */}
                  <button
                    onClick={() => deletePost(p.id)}
                    className="absolute top-2 right-2 p-1 rounded-full bg-white/90 opacity-0 group-hover:opacity-100"
                    title="Excluir post"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            {myPosts.length === 0 && (
              <p className="text-center text-neutral-500 mt-10">Você ainda não publicou.</p>
            )}
          </section>
        )}
      </main>

      {/* barra inferior */}
      <nav className="fixed bottom-0 inset-x-0 border-t bg-white">
        <div className="mx-auto max-w-2xl px-6 py-3 flex items-center justify-between">
          <button onClick={() => setTab("feed")} className={tab === "feed" ? "text-black" : "text-neutral-500"}>
            <Home />
          </button>
          <button onClick={() => setTab("search")} className={tab === "search" ? "text-black" : "text-neutral-500"}>
            <Search />
          </button>

          {/* Botão + abre o seletor diretamente */}
          <button onClick={onPickFile} className="text-black">
            <PlusSquare />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={onFileChosen}
          />

          <button onClick={() => setTab("reels")} className={tab === "reels" ? "text-black" : "text-neutral-500"}>
            <Film />
          </button>
          <button onClick={() => setTab("profile")} className={tab === "profile" ? "text-black" : "text-neutral-500"}>
            <User />
          </button>
        </div>
      </nav>

      {/* Modal de comentários */}
      {openCommentsFor && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">Comentários</div>
              <button onClick={() => setOpenCommentsFor(null)} className="text-sm text-neutral-500">
                Fechar
              </button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-3 space-y-3">
              {(openCommentsFor.comments || []).map((c) => (
                <div key={c.id} className="flex items-start gap-3">
                  <Avatar url={c.profiles?.avatar_url} size={28} />
                  <div>
                    <div className="text-sm">
                      <span className="font-semibold">@{c.profiles?.username ?? "user"}</span>{" "}
                      {c.content}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
              {(!openCommentsFor.comments || openCommentsFor.comments.length === 0) && (
                <p className="text-center text-neutral-500 py-6">Seja o primeiro a comentar</p>
              )}
            </div>

            <div className="border-t p-3 flex gap-2">
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Adicionar comentário…"
                className="flex-1 border rounded-lg px-3 py-2"
              />
              <Btn onClick={sendComment} disabled={!newComment.trim()}>
                Enviar
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
