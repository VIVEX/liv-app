// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { User } from "@supabase/supabase-js";
import supabase from "./lib/supabaseClient";

/* ======================== Tipos ======================== */
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

/* ===================== Ícones simples ===================== */
function IconHeart({ filled }: { filled?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className="inline-block align-[-2px]">
      <path
        d="M12 21s-6.716-4.534-9.192-7.01A5.5 5.5 0 1 1 12 6.235 5.5 5.5 0 1 1 21.192 13.99C18.716 16.466 12 21 12 21z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}
function IconComment() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className="inline-block align-[-2px]">
      <path
        d="M21 12a8.96 8.96 0 0 1-1.8 5.4c-.7.94-1.6 1.7-2.6 2.26-1.5.83-3.2 1.24-4.9 1.24-1.3 0-2.6-.25-3.8-.73L3 21l.83-4.8A9 9 0 1 1 21 12z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
function IconHome({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className={active ? "text-black" : "text-gray-500"}>
      <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-6v-6H10v6H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.6"/>
    </svg>
  );
}
function IconSearch({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className={active ? "text-black" : "text-gray-500"}>
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.6"/>
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.6"/>
    </svg>
  );
}
function IconPlus({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className={active ? "text-black" : "text-gray-500"}>
      <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.6"/>
    </svg>
  );
}
function IconUser({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className={active ? "text-black" : "text-gray-500"}>
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M4 20c1.8-3.4 5.1-5 8-5s6.2 1.6 8 5" fill="none" stroke="currentColor" strokeWidth="1.6"/>
    </svg>
  );
}

/* ======================= Modal base ======================= */
function Modal({ open, children, onClose }: { open: boolean; children: React.ReactNode; onClose: () => void }) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-[min(900px,95vw)] max-h-[90vh] overflow-auto rounded-2xl bg-white p-4 shadow-xl">
        {children}
      </div>
    </div>,
    document.body
  );
}

/* ========================= App ========================= */
export default function App() {
  // auth/profile
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // follow
  const [followingIds, setFollowingIds] = useState<string[]>([]);

  // feed
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedView, setFeedView] = useState<"following" | "all">("following"); // padrão Instagram

  // UI state
  const [tab, setTab] = useState<"home" | "search" | "post" | "profile">("home");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Post modal
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [savingComment, setSavingComment] = useState(false);

  // Composer (abre após escolher arquivo)
  const [composerOpen, setComposerOpen] = useState(false);
  the: const [composerFile, setComposerFile] = useState<File | null>(null);
  const [composerPreview, setComposerPreview] = useState<string | null>(null);
  const [composerCaption, setComposerCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  /* ============ Auth boot ============ */
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
    };
    init();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /* ============ Carrega profile + followingIds + feed ============ */
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setPosts([]);
      setFollowingIds([]);
      return;
    }
    const load = async () => {
      // profile
      const { data: p } = await supabase.from("profiles").select("id, full_name, username, avatar_url").eq("id", user.id).maybeSingle();
      if (!p) {
        await supabase.from("profiles").upsert({ id: user.id, username: null, full_name: null, avatar_url: null }, { onConflict: "id" });
      }
      const me = p ?? (await supabase.from("profiles").select("id, full_name, username, avatar_url").eq("id", user.id).maybeSingle()).data ?? null;
      setProfile(me);

      // followingIds
      if (me) {
        const { data: fRows } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", me.id);
        setFollowingIds((fRows ?? []).map((r: any) => r.following_id));
      }

      // feed inicial (Following)
      await refreshFeed("following");
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /* ============ Feed Loader ============ */
  const refreshFeed = async (scope: "following" | "all" = feedView, ownerId?: string) => {
    setLoadingFeed(true);
    try {
      let query = supabase
        .from("posts")
        .select("id,user_id,media_url,media_type,caption,created_at")
        .order("created_at", { ascending: false });

      if (ownerId) {
        query = query.eq("user_id", ownerId);
      } else if (scope === "following") {
        if (followingIds.length === 0) {
          setPosts([]);
          setLoadingFeed(false);
          return;
        }
        query = query.in("user_id", followingIds);
      }

      const { data: rows, error } = await query;
      if (error) throw error;
      const list: Post[] = rows ?? [];

      // autores
      const userIds = Array.from(new Set(list.map((p) => p.user_id)));
      const { data: authors } = await supabase
        .from("profiles")
        .select("id,username,avatar_url")
        .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
      const mapAuth = new Map<string, Profile>();
      (authors ?? []).forEach((a) => mapAuth.set(a.id, a as Profile));
      list.forEach((p) => (p.author = mapAuth.get(p.user_id) ?? null));

      // likes
      const postIds = list.map((p) => p.id);
      const { data: likeRows } = await supabase
        .from("likes")
        .select("post_id,user_id")
        .in("post_id", postIds.length ? postIds : ["00000000-0000-0000-0000-000000000000"]);
      const likeCount = new Map<string, number>();
      const likedByMe = new Set<string>();
      (likeRows ?? []).forEach((r) => {
        likeCount.set(r.post_id, (likeCount.get(r.post_id) ?? 0) + 1);
        if (r.user_id === profile?.id) likedByMe.add(r.post_id);
      });

      // comments count
      const { data: commentRows } = await supabase
        .from("comments")
        .select("post_id")
        .in("post_id", postIds.length ? postIds : ["00000000-0000-0000-0000-000000000000"]);
      const commentCount = new Map<string, number>();
      (commentRows ?? []).forEach((r) => {
        commentCount.set(r.post_id, (commentCount.get(r.post_id) ?? 0) + 1);
      });

      list.forEach((p) => {
        p.likeCount = likeCount.get(p.id) ?? 0;
        p.commentCount = commentCount.get(p.id) ?? 0;
        p.likedByMe = likedByMe.has(p.id);
      });

      setPosts(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFeed(false);
    }
  };

  /* ============ Auth actions ============ */
  const handleLogin = async () => {
    const redirectTo = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  };
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setTab("home");
  };

  /* ============ Avatar ============ */
  const handleAvatarButton = () => {
    if (!user) return;
    avatarInputRef.current?.click();
  };
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !profile) return;
    try {
      const path = `avatars/${profile.id}-${Date.now()}-${f.name}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, f);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
      const nextUrl = urlData.publicUrl;
      const { error: upProf } = await supabase.from("profiles").update({ avatar_url: nextUrl }).eq("id", profile.id);
      if (upProf) throw upProf;
      setProfile({ ...profile, avatar_url: nextUrl });
      setPosts((prev) =>
        prev.map((p) => (p.author?.id === profile.id ? { ...p, author: { ...(p.author as Profile), avatar_url: nextUrl } } : p))
      );
    } catch (err) {
      alert("Erro ao trocar avatar");
      console.error(err);
    } finally {
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  /* ============ Upload de post ============ */
  const handlePlusClick = () => {
    if (!user) {
      handleLogin();
      return;
    }
    fileInputRef.current?.click();
  };
  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    const url = URL.createObjectURL(f);
    setComposerFile(f);
    setComposerPreview(url);
    setComposerCaption("");
    setComposerOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const handleCreatePost = async () => {
    if (!composerFile || !profile) return;
    setUploading(true);
    try {
      const ext = composerFile.name.split(".").pop() ?? "bin";
      const name = `${Date.now()}.${ext}`;
      const path = `posts/${profile.id}/${name}`;

      const { error: upErr } = await supabase.storage.from("media").upload(path, composerFile, { cacheControl: "3600" });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      const kind: "image" | "video" = composerFile.type.startsWith("video") ? "video" : "image";

      const { data: newRows, error: insErr } = await supabase
        .from("posts")
        .insert({ user_id: profile.id, media_url: publicUrl, media_type: kind, caption: composerCaption || null })
        .select()
        .limit(1);
      if (insErr) throw insErr;

      const created = newRows?.[0] as Post;
      created.author = { ...profile };
      created.likeCount = 0;
      created.commentCount = 0;
      created.likedByMe = false;

      // se estiver vendo "following", só aparece se você segue você mesmo (normalmente não). Então forçamos inserir no topo do ALL também.
      setPosts((p) => [created, ...p]);
      setComposerOpen(false);
      setComposerFile(null);
      setComposerPreview(null);
      setComposerCaption("");
      setTab("home");
    } catch (err) {
      alert("Erro ao publicar");
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  /* ============ Likes ============ */
  const toggleLike = async (postId: string) => {
    if (!profile) return;
    const target = posts.find((p) => p.id === postId);
    if (!target) return;

    const liked = !target.likedByMe;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, likedByMe: liked, likeCount: (p.likeCount ?? 0) + (liked ? 1 : -1) } : p
      )
    );

    try {
      if (liked) {
        const { error } = await supabase.from("likes").insert({ post_id: postId, user_id: profile.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", profile.id);
        if (error) throw error;
      }
    } catch (err) {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, likedByMe: !liked, likeCount: (p.likeCount ?? 0) + (liked ? -1 : 1) } : p
        )
      );
      console.error(err);
      alert("Não foi possível atualizar like");
    }
  };

  /* ============ Comments ============ */
  const openPostModal = async (post: Post) => {
    setOpenPost(post);
    setComments([]);
    setNewComment("");
    try {
      const { data: rows, error } = await supabase
        .from("comments")
        .select("id,post_id,user_id,content,created_at")
        .eq("post_id", post.id)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const uids = Array.from(new Set(rows?.map((r) => r.user_id) ?? []));
      const { data: ppl } = await supabase
        .from("profiles")
        .select("id,username,avatar_url")
        .in("id", uids.length ? uids : ["00000000-0000-0000-0000-000000000000"]);
      const map = new Map<string, Profile>();
      (ppl ?? []).forEach((p) => map.set(p.id, p as Profile));

      const withAuthor: Comment[] = (rows ?? []).map((r) => ({ ...r, author: map.get(r.user_id) }));
      setComments(withAuthor);
    } catch (err) {
      console.error(err);
    }
  };
  const sendComment = async () => {
    if (!openPost || !profile || !newComment.trim() || savingComment) return;
    setSavingComment(true);
    const text = newComment.trim();
    setNewComment("");
    try {
      const { data: rows, error } = await supabase
        .from("comments")
        .insert({ post_id: openPost.id, user_id: profile.id, content: text })
        .select()
        .limit(1);
      if (error) throw error;

      const created = rows?.[0] as Comment;
      created.author = { ...profile };
      setComments((prev) => [...prev, created]);
      setPosts((prev) => prev.map((p) => (p.id === openPost.id ? { ...p, commentCount: (p.commentCount ?? 0) + 1 } : p)));
    } catch (err) {
      console.error(err);
      alert("Não foi possível comentar");
    } finally {
      setSavingComment(false);
    }
  };
  const deleteComment = async (commentId: string) => {
    if (!profile || !openPost) return;
    const c = comments.find((x) => x.id === commentId);
    if (!c || c.user_id !== profile.id) return;

    // otimista
    setComments((prev) => prev.filter((x) => x.id !== commentId));
    setPosts((prev) => prev.map((p) => (p.id === openPost.id ? { ...p, commentCount: Math.max((p.commentCount ?? 1) - 1, 0) } : p)));

    try {
      const { error } = await supabase.from("comments").delete().eq("id", commentId).eq("user_id", profile.id);
      if (error) throw error;
    } catch (err) {
      alert("Failed to delete comment");
      console.error(err);
      openPostModal(openPost);
    }
  };

  /* ============ Delete post ============ */
  const deletePost = async (postId: string) => {
    if (!profile) return;
    const p = posts.find((x) => x.id === postId);
    if (!p || p.user_id !== profile.id) return;
    const ok = confirm("Delete this post?");
    if (!ok) return;

    setPosts((prev) => prev.filter((x) => x.id !== postId));
    setOpenPost(null);

    try {
      const { error } = await supabase.from("posts").delete().eq("id", postId).eq("user_id", profile.id);
      if (error) throw error;
    } catch (err) {
      alert("Não foi possível apagar");
      console.error(err);
      refreshFeed();
    }
  };

  /* ============ Search & Follow ============ */
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);

  const runSearch = async (term: string) => {
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id,username,avatar_url")
      .ilike("username", `%${term}%`)
      .limit(20);
    setSearchResults((data ?? []).filter((p) => p.id !== profile?.id));
  };

  useEffect(() => {
    const id = setTimeout(() => runSearch(searchTerm), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const toggleFollow = async (targetId: string) => {
    if (!profile || targetId === profile.id) return;
    const isFollowing = followingIds.includes(targetId);

    // otimista
    setFollowingIds((prev) => (isFollowing ? prev.filter((id) => id !== targetId) : [...prev, targetId]));

    try {
      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", profile.id)
          .eq("following_id", targetId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("follows").insert({ follower_id: profile.id, following_id: targetId });
        if (error) throw error;
      }
      // se estiver no feed Following, recarrega
      if (tab === "home" && feedView === "following") {
        refreshFeed("following");
      }
    } catch (err) {
      // rollback
      setFollowingIds((prev) => (isFollowing ? [...prev, targetId] : prev.filter((id) => id !== targetId)));
      alert("Não foi possível atualizar follow");
      console.error(err);
    }
  };

  /* ============ Header profile ============ */
  const headerProfile = useMemo(() => {
    if (!profile) return null;
    return (
      <div className="flex items-center gap-3">
        <img
          src={profile.avatar_url || "https://unavatar.io/github/placeholder"}
          alt="avatar"
          className="h-10 w-10 rounded-full object-cover"
        />
        <div className="leading-tight">
          <div className="font-semibold">{profile.full_name || (profile.username ? profile.username : "Your name")}</div>
          <div className="text-sm text-gray-500">@{profile.username || "username"}</div>
        </div>
      </div>
    );
  }, [profile]);

  /* ======================= Render ======================= */
  return (
    <div className="mx-auto max-w-4xl px-4 pb-20">
      <header className="flex items-center justify-between py-4">
        <div className="text-xl font-bold">LIVET</div>
        <div className="flex items-center gap-3">
          {headerProfile}
          {!user ? (
            <button onClick={handleLogin} className="rounded-lg border px-3 py-1.5 hover:bg-gray-50">
              Sign in with Google
            </button>
          ) : (
            <button onClick={handleLogout} className="rounded-lg border px-3 py-1.5 hover:bg-gray-50">
              Logout
            </button>
          )}
        </div>
      </header>

      {/* HOME */}
      {tab === "home" && (
        <section>
          {/* Toggle Following | All */}
          <div className="mb-4 flex items-center gap-2">
            <button
              className={`rounded-full border px-3 py-1 text-sm ${feedView === "following" ? "bg-black text-white" : "hover:bg-gray-50"}`}
              onClick={() => {
                setFeedView("following");
                refreshFeed("following");
              }}
            >
              Following
            </button>
            <button
              className={`rounded-full border px-3 py-1 text-sm ${feedView === "all" ? "bg-black text-white" : "hover:bg-gray-50"}`}
              onClick={() => {
                setFeedView("all");
                refreshFeed("all");
              }}
            >
              All
            </button>
          </div>

          {loadingFeed && <div className="py-6 text-center text-gray-500">Loading…</div>}

          {!loadingFeed && posts.length === 0 && feedView === "following" && (
            <div className="py-8 text-center text-gray-500">
              Follow people to see posts here.
            </div>
          )}
          {!loadingFeed && posts.length === 0 && feedView === "all" && (
            <div className="py-8 text-center text-gray-500">No posts yet.</div>
          )}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
            {posts.map((post) => (
              <div key={post.id} className="group">
                <div
                  className="aspect-square w-full cursor-pointer overflow-hidden rounded-xl bg-gray-100"
                  onClick={() => openPostModal(post)}
                >
                  {post.media_type === "video" ? (
                    <video src={post.media_url} className="h-full w-full object-cover" muted playsInline />
                  ) : (
                    <img src={post.media_url} className="h-full w-full object-cover" alt="post" />
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between text-sm text-gray-700">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleLike(post.id)}
                      title={post.likedByMe ? "Unlike" : "Like"}
                      className={post.likedByMe ? "text-red-500" : ""}
                    >
                      <IconHeart filled={post.likedByMe} /> {post.likeCount ?? 0}
                    </button>
                    <div className="text-gray-500">
                      <IconComment /> {post.commentCount ?? 0}
                    </div>
                  </div>
                  {profile?.id === post.user_id && (
                    <button className="text-xs text-red-500 hover:underline" onClick={() => deletePost(post.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SEARCH */}
      {tab === "search" && (
        <section className="max-w-2xl">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users…"
            className="mb-4 w-full rounded-lg border px-3 py-2 outline-none focus:ring"
          />
          <div className="space-y-3">
            {searchResults.map((u) => {
              const isFollowing = followingIds.includes(u.id);
              return (
                <div key={u.id} className="flex items-center justify-between rounded-xl border p-3">
                  <div className="flex items-center gap-3">
                    <img src={u.avatar_url || "https://unavatar.io/github/placeholder"} className="h-10 w-10 rounded-full object-cover" />
                    <div>
                      <div className="font-medium">@{u.username || "user"}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleFollow(u.id)}
                    className={`rounded-md px-3 py-1 text-sm ${isFollowing ? "border" : "bg-black text-white"}`}
                  >
                    {isFollowing ? "Following" : "Follow"}
                  </button>
                </div>
              );
            })}
            {searchTerm && searchResults.length === 0 && (
              <div className="text-center text-gray-500">No users found.</div>
            )}
          </div>
        </section>
      )}

      {/* PROFILE */}
      {tab === "profile" && (
        <section className="max-w-2xl">
          <div className="mb-6 flex items-center gap-4">
            <div className="relative">
              <img
                src={profile?.avatar_url || "https://unavatar.io/github/placeholder"}
                className="h-24 w-24 rounded-full object-cover"
                alt="avatar"
              />
              <button
                onClick={handleAvatarButton}
                className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-2 py-0.5 text-xs text-white"
              >
                Change
              </button>
            </div>
            <div>
              <div className="text-xl font-semibold">{profile?.full_name || "Your name"}</div>
              <div className="text-gray-500">@{profile?.username || "username"}</div>
              <button
                className="mt-2 rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
                onClick={() => alert("Profile edit screen coming soon")}
              >
                Edit profile
              </button>
            </div>
          </div>

          {/* seus posts – garantidos pelo refreshFeed(profileId) ao entrar no Profile */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
            {posts
              .filter((p) => p.user_id === profile?.id)
              .map((post) => (
                <div key={post.id} className="group">
                  <div
                    className="aspect-square w-full cursor-pointer overflow-hidden rounded-xl bg-gray-100"
                    onClick={() => openPostModal(post)}
                  >
                    {post.media_type === "video" ? (
                      <video src={post.media_url} className="h-full w-full object-cover" muted playsInline />
                    ) : (
                      <img src={post.media_url} className="h-full w-full object-cover" alt="post" />
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-gray-700">
                    <button
                      onClick={() => toggleLike(post.id)}
                      className={post.likedByMe ? "text-red-500" : ""}
                      title={post.likedByMe ? "Unlike" : "Like"}
                    >
                      <IconHeart filled={post.likedByMe} /> {post.likeCount ?? 0}
                    </button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => deletePost(post.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            {posts.filter((p) => p.user_id === profile?.id).length === 0 && (
              <div className="py-8 text-center text-gray-500">You haven’t posted yet.</div>
            )}
          </div>
        </section>
      )}

      {/* Bottom Nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-4xl border-t bg-white">
        <div className="flex items-center justify-around py-3">
          <button
            onClick={() => {
              setTab("home");
              refreshFeed(feedView);
            }}
            aria-label="Home"
          >
            <IconHome active={tab === "home"} />
          </button>
          <button
            onClick={() => {
              setTab("search");
              setSearchTerm("");
              setSearchResults([]);
            }}
            aria-label="Search"
          >
            <IconSearch active={tab === "search"} />
          </button>
          <button onClick={handlePlusClick} aria-label="New post">
            <IconPlus active={false} />
          </button>
          <button
            onClick={() => {
              if (!profile) return handleLogin();
              setTab("profile");
              refreshFeed(feedView, profile.id); // carrega somente os meus posts
            }}
            aria-label="Profile"
          >
            <IconUser active={tab === "profile"} />
          </button>
        </div>
      </nav>

      {/* FILE PICKERS */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,video/*"
        capture="environment"
        onChange={handlePickFile}
      />
      <input
        ref={avatarInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={handleAvatarChange}
      />

      {/* Composer */}
      <Modal open={composerOpen} onClose={() => !uploading && setComposerOpen(false)}>
        <div className="flex flex-col gap-4">
          <div className="text-lg font-semibold">New post</div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border p-2">
              {composerPreview &&
                (composerFile?.type.startsWith("video") ? (
                  <video src={composerPreview} controls className="mx-auto max-h-[60vh] rounded-md" />
                ) : (
                  <img src={composerPreview} alt="preview" className="mx-auto max-h-[60vh] rounded-md" />
                ))}
            </div>
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium">Caption (optional)</label>
              <textarea
                value={composerCaption}
                onChange={(e) => setComposerCaption(e.target.value)}
                className="min-h-[120px] w-full rounded-lg border p-2 outline-none focus:ring"
                placeholder="Say something..."
              />
              <div className="mt-auto flex items-center justify-end gap-2">
                <button
                  className="rounded-lg border px-3 py-1.5 disabled:opacity-50"
                  disabled={uploading}
                  onClick={() => setComposerOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="rounded-lg bg-black px-4 py-1.5 text-white disabled:opacity-50"
                  onClick={handleCreatePost}
                  disabled={uploading}
                >
                  {uploading ? "Posting…" : "Post"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Post Modal */}
      <Modal open={!!openPost} onClose={() => setOpenPost(null)}>
        {openPost && (
          <div className="grid gap-4 md:grid-cols-[1fr,380px]">
            <div className="rounded-xl bg-black/5 p-2">
              {openPost.media_type === "video" ? (
                <video src={openPost.media_url} controls className="mx-auto max-h-[70vh] rounded-md" />
              ) : (
                <img src={openPost.media_url} className="mx-auto max-h-[70vh] rounded-md" alt="post" />
              )}
            </div>
            <div className="flex min-h-[300px] flex-col">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={openPost.author?.avatar_url || "https://unavatar.io/github/placeholder"}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                  <div className="font-medium">@{openPost.author?.username || "username"}</div>
                </div>
                {profile?.id === openPost.user_id && (
                  <button className="text-sm text-red-500 hover:underline" onClick={() => deletePost(openPost.id)}>
                    Delete
                  </button>
                )}
              </div>

              <div className="mb-3 flex items-center gap-4">
                <button
                  onClick={() => toggleLike(openPost.id)}
                  className={`text-lg ${openPost.likedByMe ? "text-red-500" : ""}`}
                >
                  <IconHeart filled={openPost.likedByMe} /> {openPost.likeCount ?? 0}
                </button>
                <div className="text-gray-600">
                  <IconComment /> {openPost.commentCount ?? 0}
                </div>
              </div>

              <div className="grow space-y-3 overflow-auto rounded-md border p-2">
                {comments.length === 0 && <div className="text-sm text-gray-500">Be the first to comment</div>}
                {comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <img
                      src={c.author?.avatar_url || "https://unavatar.io/github/placeholder"}
                      className="mt-0.5 h-7 w-7 rounded-full object-cover"
                    />
                    <div className="flex-1">
                      <div className="text-sm">
                        <span className="mr-1 font-medium">@{c.author?.username || "user"}</span>
                        {c.content}
                      </div>
                    </div>
                    {c.user_id === profile?.id && (
                      <button
                        className="text-xs text-red-500 hover:underline"
                        onClick={() => deleteComment(c.id)}
                        title="Delete comment"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="w-full rounded-lg border px-3 py-2 outline-none focus:ring"
                />
                <button
                  onClick={sendComment}
                  disabled={savingComment || !newComment.trim()}
                  className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
