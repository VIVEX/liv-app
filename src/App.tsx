// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { User } from "@supabase/supabase-js";
import supabase from "./lib/supabaseClient";

// --------- Tipos ----------
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

// --------- Icons ----------
function IconHeart({ filled }: { filled?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
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
    <svg width="20" height="20" viewBox="0 0 24 24">
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
    <svg width="22" height="22" viewBox="0 0 24 24">
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

// --------- Modal ----------
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

// =====================================================
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

  const [tab, setTab] = useState<"home" | "search" | "profile">("home");
  const [feedMode, setFeedMode] = useState<"all" | "following">("all");

  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [savingComment, setSavingComment] = useState(false);

  const [followingIds, setFollowingIds] = useState<string[]>([]);

  // === Composer (erro corrigido) ===
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerFile, setComposerFile] = useState<File | null>(null);
  const [composerPreview, setComposerPreview] = useState<string | null>(null);
  const [composerCaption, setComposerCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // =====================================================
  // AUTH
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
    };
    init();

    const { data: listener } = supabase.auth.onAuthStateChange((_ev, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // =====================================================
  // LOAD PROFILE + FEED + FOLLOWING LIST
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setPosts([]);
      setFollowingIds([]);
      return;
    }

    const load = async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("id,full_name,username,avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (!p) {
        await supabase.from("profiles").upsert(
          { id: user.id, full_name: null, username: null, avatar_url: null },
          { onConflict: "id" }
        );
      }

      setProfile(p);

      await loadFollowing();
      await refreshFeed();
    };

    load();
  }, [user]);

  const loadFollowing = async () => {
    if (!user) return;

    const { data } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id);

    setFollowingIds((data ?? []).map((x: any) => x.following_id));
  };

  // =====================================================
  // FEED
  const refreshFeed = async () => {
    setLoadingFeed(true);

    try {
      let query = supabase.from("posts").select("*").order("created_at", { ascending: false });

      if (feedMode === "following" && followingIds.length > 0) {
        query = query.in("user_id", followingIds);
      }

      const { data: rows } = await query;

      const list: Post[] = rows ?? [];

      // Load authors
      const userIds = Array.from(new Set(list.map((p) => p.user_id)));
      const { data: authors } = await supabase
        .from("profiles")
        .select("id,username,avatar_url")
        .in("id", userIds);

      const map = new Map<string, Profile>();
      (authors ?? []).forEach((p) => map.set(p.id, p));

      list.forEach((p) => (p.author = map.get(p.user_id) ?? null));

      // Likes
      const postIds = list.map((p) => p.id);
      const { data: likes } = await supabase
        .from("likes")
        .select("post_id,user_id")
        .in("post_id", postIds);

      const likesMap = new Map<string, number>();
      const likedByMe = new Set<string>();

      (likes ?? []).forEach((l) => {
        likesMap.set(l.post_id, (likesMap.get(l.post_id) ?? 0) + 1);
        if (l.user_id === profile?.id) likedByMe.add(l.post_id);
      });

      // Comments count
      const { data: comm } = await supabase
        .from("comments")
        .select("post_id")
        .in("post_id", postIds);

      const commMap = new Map<string, number>();
      (comm ?? []).forEach((c) => {
        commMap.set(c.post_id, (commMap.get(c.post_id) ?? 0) + 1);
      });

      list.forEach((p) => {
        p.likeCount = likesMap.get(p.id) ?? 0;
        p.commentCount = commMap.get(p.id) ?? 0;
        p.likedByMe = likedByMe.has(p.id);
      });

      setPosts(list);
    } catch (err) {
      console.error(err);
    }

    setLoadingFeed(false);
  };

  // =====================================================
  // LOGIN / LOGOUT
  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setTab("home");
  };

  // =====================================================
  // AVATAR
  const handleAvatarButton = () => avatarInputRef.current?.click();

  const handleAvatarChange = async (e: any) => {
    const f = e.target.files?.[0];
    if (!f || !profile) return;

    const path = `avatars/${profile.id}-${Date.now()}-${f.name}`;
    await supabase.storage.from("media").upload(path, f);

    const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
    const newUrl = urlData.publicUrl;

    await supabase.from("profiles").update({ avatar_url: newUrl }).eq("id", profile.id);

    setProfile({ ...profile, avatar_url: newUrl });
  };

  // =====================================================
  // UPLOAD POST
  const handlePlusClick = () => fileInputRef.current?.click();

  const handlePickFile = (e: any) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setComposerFile(f);
    setComposerPreview(URL.createObjectURL(f));
    setComposerCaption("");
    setComposerOpen(true);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCreatePost = async () => {
    if (!composerFile || !profile) return;

    setUploading(true);

    try {
      const ext = composerFile.name.split(".").pop();
      const path = `posts/${profile.id}/${Date.now()}.${ext}`;

      await supabase.storage.from("media").upload(path, composerFile);
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);

      const kind = composerFile.type.startsWith("video") ? "video" : "image";

      const { data: rows } = await supabase
        .from("posts")
        .insert({
          user_id: profile.id,
          media_url: urlData.publicUrl,
          media_type: kind,
          caption: composerCaption || null
        })
        .select()
        .limit(1);

      const created = rows?.[0];
      created.author = profile;
      created.likeCount = 0;
      created.commentCount = 0;
      created.likedByMe = false;

      setPosts([created, ...posts]);
      setComposerOpen(false);
      setComposerFile(null);
      setComposerPreview(null);
      setComposerCaption("");

    } finally {
      setUploading(false);
    }
  };

  // =====================================================
  // LIKE
  const toggleLike = async (postId: string) => {
    if (!profile) return;

    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const liked = !post.likedByMe;

    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, likedByMe: liked, likeCount: (p.likeCount ?? 0) + (liked ? 1 : -1) }
          : p
      )
    );

    try {
      if (liked) {
        await supabase.from("likes").insert({ post_id: postId, user_id: profile.id });
      } else {
        await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", profile.id);
      }
    } catch (err) {
      alert("Não foi possível atualizar like");
    }
  };

  // =====================================================
  // COMMENTS
  const openPostModal = async (post: Post) => {
    setOpenPost(post);
    setComments([]);

    const { data: rows } = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });

    const ids = Array.from(new Set(rows?.map((r) => r.user_id)));
    const { data: ppl } = await supabase
      .from("profiles")
      .select("id,username,avatar_url")
      .in("id", ids);

    const map = new Map();
    (ppl ?? []).forEach((p) => map.set(p.id, p));

    const final = rows?.map((c) => ({
      ...c,
      author: map.get(c.user_id)
    }));

    setComments(final ?? []);
  };

  const sendComment = async () => {
    if (!newComment.trim() || !openPost || !profile) return;

    const text = newComment.trim();
    setNewComment("");

    const { data } = await supabase
      .from("comments")
      .insert({
        post_id: openPost.id,
        user_id: profile.id,
        content: text
      })
      .select()
      .limit(1);

    const created = data?.[0];
    created.author = profile;

    setComments((prev) => [...prev, created]);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === openPost.id ? { ...p, commentCount: (p.commentCount ?? 0) + 1 } : p
      )
    );
  };

  const deleteComment = async (id: string) => {
    if (!profile || !openPost) return;

    setComments((prev) => prev.filter((c) => c.id !== id));
    setPosts((prev) =>
      prev.map((p) =>
        p.id === openPost.id ? { ...p, commentCount: (p.commentCount ?? 1) - 1 } : p
      )
    );

    await supabase.from("comments").delete().eq("id", id).eq("user_id", profile.id);
  };

  // =====================================================
  // FOLLOW
  const toggleFollow = async (userId: string) => {
    if (!profile) return;

    const isFollowing = followingIds.includes(userId);

    try {
      if (isFollowing) {
        await supabase
          .from("follows")
          .delete()
          .eq("follower_id", profile.id)
          .eq("following_id", userId);

        setFollowingIds(followingIds.filter((id) => id !== userId));
      } else {
        await supabase.from("follows").insert({
          follower_id: profile.id,
          following_id: userId
        });

        setFollowingIds([...followingIds, userId]);
      }
    } catch (err) {
      alert("Não foi possível atualizar follow");
    }
  };

  // =====================================================
  // SEARCH USERS
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Profile[]>([]);

  const handleSearch = async (value: string) => {
    setSearch(value);

    if (!value.trim()) {
      setResults([]);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("id,username,full_name,avatar_url")
      .ilike("username", `%${value}%`)
      .limit(10);

    setResults(data ?? []);
  };

  // =====================================================
  // RENDER
  const headerProfile = useMemo(() => {
    if (!profile) return null;

    return (
      <div className="flex items-center gap-3">
        <img
          src={profile.avatar_url || "https://unavatar.io/github/placeholder"}
          className="w-10 h-10 rounded-full object-cover"
        />
        <div className="leading-tight">
          <div className="font-semibold">{profile.full_name || profile.username}</div>
          <div className="text-gray-500">@{profile.username}</div>
        </div>
      </div>
    );
  }, [profile]);


  // =====================================================
  return (
    <div className="mx-auto max-w-4xl px-4 pb-20">

      {/* HEADER */}
      <header className="flex items-center justify-between py-4">
        <div className="text-xl font-bold">LIVET</div>

        <div className="flex items-center gap-4">
          {headerProfile}

          {!profile ? (
            <button onClick={handleLogin} className="border px-3 py-1.5 rounded-lg">
              Sign in with Google
            </button>
          ) : (
            <button onClick={handleLogout} className="border px-3 py-1.5 rounded-lg">
              Logout
            </button>
          )}
        </div>
      </header>

      {/* HOME */}
      {tab === "home" && (
        <>
          {/* Toggle ALL / FOLLOWING */}
          <div className="flex gap-3 mb-4">
            <button
              className={`px-3 py-1 rounded-full border ${feedMode === "following" ? "bg-black text-white" : ""}`}
              onClick={() => {
                setFeedMode("following");
                refreshFeed();
              }}
            >
              Following
            </button>

            <button
              className={`px-3 py-1 rounded-full border ${feedMode === "all" ? "bg-black text-white" : ""}`}
              onClick={() => {
                setFeedMode("all");
                refreshFeed();
              }}
            >
              All
            </button>
          </div>

          {loadingFeed ? (
            <div className="text-gray-500 py-6">Loading…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {posts.map((post) => (
                <div key={post.id}>
                  <div
                    className="aspect-square rounded-xl bg-gray-100 overflow-hidden cursor-pointer"
                    onClick={() => openPostModal(post)}
                  >
                    {post.media_type === "video" ? (
                      <video src={post.media_url} className="h-full w-full object-cover" />
                    ) : (
                      <img src={post.media_url} className="h-full w-full object-cover" />
                    )}
                  </div>

                  <div className="flex justify-between mt-2 text-sm">
                    <button
                      onClick={() => toggleLike(post.id)}
                      className={post.likedByMe ? "text-red-500" : ""}
                    >
                      <IconHeart filled={post.likedByMe} /> {post.likeCount}
                    </button>

                    {profile?.id === post.user_id && (
                      <button
                        className="text-red-500 text-xs"
                        onClick={async () => {
                          await supabase.from("posts").delete().eq("id", post.id);
                          refreshFeed();
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* SEARCH */}
      {tab === "search" && (
        <section>
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full p-2 border rounded-lg mb-4"
            placeholder="Search users…"
          />

          {results.map((u) => (
            <div key={u.id} className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-3">
                <img
                  src={u.avatar_url || "https://unavatar.io/github/placeholder"}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div>
                  <div className="font-medium">@{u.username}</div>
                </div>
              </div>

              {profile?.id !== u.id && (
                <button
                  className="border px-3 py-1.5 rounded-lg"
                  onClick={() => toggleFollow(u.id)}
                >
                  {followingIds.includes(u.id) ? "Following" : "Follow"}
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {/* PROFILE */}
      {tab === "profile" && (
        <section>
          <div className="flex gap-4 mb-6">
            <div className="relative">
              <img
                src={profile?.avatar_url || "https://unavatar.io/github/placeholder"}
                className="w-24 h-24 rounded-full object-cover"
              />
              <button
                className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-0.5 rounded-full"
                onClick={handleAvatarButton}
              >
                Change
              </button>
            </div>

            <div>
              <div className="text-xl font-semibold">{profile?.full_name}</div>
              <div className="text-gray-500">@{profile?.username}</div>
              <button className="mt-2 border px-3 py-1 rounded-md">Edit Profile</button>
            </div>
          </div>

          {/* USER POSTS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {posts.filter((p) => p.user_id === profile?.id).map((post) => (
              <div key={post.id}>
                <div
                  className="aspect-square rounded-xl bg-gray-100 overflow-hidden cursor-pointer"
                  onClick={() => openPostModal(post)}
                >
                  {post.media_type === "video" ? (
                    <video src={post.media_url} className="h-full w-full object-cover" />
                  ) : (
                    <img src={post.media_url} className="h-full w-full object-cover" />
                  )}
                </div>

                <div className="flex justify-between mt-2 text-sm">
                  <button
                    onClick={() => toggleLike(post.id)}
                    className={post.likedByMe ? "text-red-500" : ""}
                  >
                    <IconHeart filled={post.likedByMe} /> {post.likeCount}
                  </button>

                  <button
                    className="text-red-500 text-xs"
                    onClick={async () => {
                      await supabase.from("posts").delete().eq("id", post.id);
                      refreshFeed();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* NAV BAR */}
      <nav className="fixed bottom-0 inset-x-0 border-t bg-white py-3 flex justify-around">
        <button onClick={() => setTab("home")}>
          <IconHome active={tab === "home"} />
        </button>

        <button onClick={() => setTab("search")}>
          <IconSearch active={tab === "search"} />
        </button>

        <button onClick={handlePlusClick}>
          <IconPlus />
        </button>

        <button onClick={() => setTab("profile")}>
          <IconUser active={tab === "profile"} />
        </button>
      </nav>

      {/* FILE PICKERS */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,video/*"
        onChange={handlePickFile}
      />

      <input
        ref={avatarInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={handleAvatarChange}
      />

      {/* COMPOSER */}
      <Modal open={composerOpen} onClose={() => !uploading && setComposerOpen(false)}>
        <div className="flex flex-col gap-4">
          <div className="font-semibold text-lg">New Post</div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="border rounded-xl p-2">
              {composerPreview && (
                <>
                  {composerFile?.type.startsWith("video") ? (
                    <video src={composerPreview} controls className="rounded-md max-h-[60vh] mx-auto" />
                  ) : (
                    <img src={composerPreview} className="rounded-md max-h-[60vh] mx-auto" />
                  )}
                </>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <textarea
                value={composerCaption}
                onChange={(e) => setComposerCaption(e.target.value)}
                className="w-full border rounded-lg p-2 min-h-[120px]"
                placeholder="Write a caption…"
              />

              <div className="flex justify-end gap-2 mt-auto">
                <button
                  className="border px-3 py-1.5 rounded-lg"
                  disabled={uploading}
                  onClick={() => setComposerOpen(false)}
                >
                  Cancel
                </button>

                <button
                  className="bg-black text-white px-4 py-1.5 rounded-lg disabled:opacity-50"
                  disabled={uploading}
                  onClick={handleCreatePost}
                >
                  {uploading ? "Posting…" : "Post"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* POST MODAL */}
      <Modal open={!!openPost} onClose={() => setOpenPost(null)}>
        {openPost && (
          <div className="grid md:grid-cols-[1fr,380px] gap-4">
            <div className="bg-black/5 rounded-xl p-2">
              {openPost.media_type === "video" ? (
                <video src={openPost.media_url} controls className="rounded-md max-h-[70vh] mx-auto" />
              ) : (
                <img src={openPost.media_url} className="rounded-md max-h-[70vh] mx-auto" />
              )}
            </div>

            <div className="flex flex-col min-h-[300px]">
              <div className="flex justify-between mb-2">
                <div className="flex items-center gap-3">
                  <img
                    src={openPost.author?.avatar_url || "https://unavatar.io/github/placeholder"}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <div className="font-medium">@{openPost.author?.username}</div>
                </div>

                {profile?.id === openPost.user_id && (
                  <button
                    className="text-red-500 text-sm"
                    onClick={async () => {
                      await supabase.from("posts").delete().eq("id", openPost.id);
                      setOpenPost(null);
                      refreshFeed();
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>

              <div className="flex items-center gap-4 mb-3">
                <button
                  onClick={() => toggleLike(openPost.id)}
                  className={openPost.likedByMe ? "text-red-500" : ""}
                >
                  <IconHeart filled={openPost.likedByMe} /> {openPost.likeCount}
                </button>

                <div className="text-gray-600">
                  <IconComment /> {openPost.commentCount}
                </div>
              </div>

              <div className="border rounded-md p-2 grow overflow-auto space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-2 items-start">
                    <img
                      src={c.author?.avatar_url || "https://unavatar.io/github/placeholder"}
                      className="w-7 h-7 rounded-full object-cover"
                    />

                    <div className="flex-1">
                      <div className="text-sm">
                        <span className="font-medium mr-1">@{c.author?.username}</span>
                        {c.content}
                      </div>
                    </div>

                    {c.user_id === profile?.id && (
                      <button
                        className="text-red-500 text-xs"
                        onClick={() => deleteComment(c.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-3">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment…"
                  className="flex-1 border rounded-lg px-3 py-2"
                />

                <button
                  onClick={sendComment}
                  disabled={!newComment.trim()}
                  className="bg-black text-white px-4 py-2 rounded-lg disabled:opacity-40"
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
