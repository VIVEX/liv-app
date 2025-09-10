import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "./lib/supabaseClient";

// -------------------- Types --------------------
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
  profile?: Profile; // joined
  likeCount?: number;
  commentCount?: number;
  likedByMe?: boolean;
};

// -------------------- Helpers --------------------
function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

function isVideo(file: File) {
  return file.type.startsWith("video/");
}

async function getPublicURL(bucket: string, path: string): Promise<string> {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// Safe counter if table is missing
async function safeCount(sql: string, params: any[]): Promise<number> {
  try {
    const { data, error } = await supabase.rpc("exec_sql_count", {
      sql_text: sql,
      sql_params: params,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  } catch {
    // Fallback if RPC not exists or table missing
    return 0;
  }
}

// -------------------- Main --------------------
export default function App() {
  const [session, setSession] = useState<import("@supabase/supabase-js").Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);

  const [tab, setTab] = useState<"home" | "search" | "upload" | "profile">("home");

  // Feed
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

  // Upload
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  // Comments modal
  const [openCommentsFor, setOpenCommentsFor] = useState<Post | null>(null);
  const [comments, setComments] = useState<{ id: string; user_id: string; content: string; created_at: string; profile?: Profile }[]>([]);
  const [commentInput, setCommentInput] = useState("");

  // ---- Auth bootstrap
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load my profile
  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      setMe((data as Profile) ?? null);
    })();
  }, [session?.user]);

  // Load feed posts (global feed for now; when follows existir, trocamos a query)
  useEffect(() => {
    if (!session) return;
    void loadFeed();
  }, [session]);

  async function loadFeed() {
    setLoadingFeed(true);
    try {
      // Posts + profile (author) + like/comment counts + likedByMe
      const { data: rows, error } = await supabase
        .from("posts")
        .select("*, profiles!posts_user_id_fkey(id, username, full_name, avatar_url)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;

      const posts = (rows as any[]).map((r) => ({
        id: r.id,
        user_id: r.user_id,
        media_url: r.media_url,
        media_type: r.media_type,
        caption: r.caption,
        created_at: r.created_at,
        profile: r.profiles as Profile,
      })) as Post[];

      // Parallel counts + likedByMe
      const withCounts = await Promise.all(
        posts.map(async (p) => {
          const [{ count: likeCount }, { count: commentCount }, likedRow] = await Promise.all([
            supabase.from("likes").select("*", { count: "exact", head: true }).eq("post_id", p.id),
            supabase.from("comments").select("*", { count: "exact", head: true }).eq("post_id", p.id),
            session?.user
              ? supabase.from("likes").select("id").eq("post_id", p.id).eq("user_id", session.user.id).maybeSingle()
              : Promise.resolve({ data: null }),
          ]);
          return {
            ...p,
            likeCount: likeCount ?? 0,
            commentCount: commentCount ?? 0,
            likedByMe: Boolean((likedRow as any)?.data),
          } as Post;
        })
      );

      setPosts(withCounts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFeed(false);
    }
  }

  // ---- Auth UI
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-200 p-6 bg-white shadow-sm">
          <h1 className="text-2xl font-semibold text-center mb-2">LIVET</h1>
          <p className="text-sm text-neutral-600 text-center mb-6">Share your healthy lifestyle.</p>
          <button
            onClick={async () => {
              await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
            }}
            className="w-full rounded-lg bg-black text-white py-2.5 font-medium"
          >
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  // ---- Top bar
  const TopBar = (
    <div className="sticky top-0 z-10 bg-white border-b border-neutral-200">
      <div className="mx-auto max-w-4xl px-4 h-14 flex items-center justify-between">
        <div className="text-lg font-semibold">LIVET</div>
        {me && (
          <div className="flex items-center gap-3">
            <img
              src={me.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(me.full_name || me.username || "User")}`}
              alt="avatar"
              className="w-8 h-8 rounded-full object-cover"
            />
            <div className="text-sm">{me.username ? `@${me.username}` : ""}</div>
            <button
              className="text-sm text-neutral-600 hover:text-black"
              onClick={async () => {
                await supabase.auth.signOut();
              }}
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ---- Bottom nav (no emojis)
  const BottomNav = (
    <div className="sticky bottom-0 bg-white border-t border-neutral-200">
      <div className="mx-auto max-w-4xl h-14 grid grid-cols-4">
        {[
          { key: "home", label: "Home" },
          { key: "search", label: "Search" },
          { key: "upload", label: "Post" },
          { key: "profile", label: "Profile" },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key as any)}
            className={cls(
              "text-sm font-medium",
              "flex items-center justify-center",
              tab === (item.key as any) ? "text-black" : "text-neutral-500"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );

  // ---- Like/Unlike
  async function toggleLike(p: Post) {
    if (!session?.user) return;
    try {
      if (p.likedByMe) {
        const { error } = await supabase.from("likes").delete().eq("post_id", p.id).eq("user_id", session.user.id);
        if (error) throw error;
        updatePostLocal(p.id, { likedByMe: false, likeCount: (p.likeCount ?? 1) - 1 });
      } else {
        const { error } = await supabase.from("likes").insert({ post_id: p.id, user_id: session.user.id });
        if (error) throw error;
        updatePostLocal(p.id, { likedByMe: true, likeCount: (p.likeCount ?? 0) + 1 });
      }
    } catch (e) {
      alert("Unable to like.");
      console.error(e);
    }
  }

  function updatePostLocal(id: string, patch: Partial<Post>) {
    setPosts((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  // ---- Comments
  async function openComments(p: Post) {
    setOpenCommentsFor(p);
    try {
      const { data, error } = await supabase
        .from("comments")
        .select("*, profiles!comments_user_id_fkey(id, username, full_name, avatar_url)")
        .eq("post_id", p.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const mapped =
        (data as any[])?.map((r) => ({
          id: r.id,
          user_id: r.user_id,
          content: r.content,
          created_at: r.created_at,
          profile: r.profiles as Profile,
        })) ?? [];
      setComments(mapped);
    } catch (e) {
      console.error(e);
      setComments([]);
    }
  }

  async function sendComment() {
    if (!openCommentsFor || !commentInput.trim()) return;
    try {
      const { error } = await supabase
        .from("comments")
        .insert({ post_id: openCommentsFor.id, user_id: session!.user.id, content: commentInput.trim() });
      if (error) throw error;
      setCommentInput("");
      await openComments(openCommentsFor);
      updatePostLocal(openCommentsFor.id, { commentCount: (openCommentsFor.commentCount ?? 0) + 1 });
    } catch (e) {
      alert("Unable to comment.");
      console.error(e);
    }
  }

  // ---- Delete post
  async function deletePost(p: Post) {
    if (!session?.user || session.user.id !== p.user_id) return;
    if (!confirm("Delete this post?")) return;
    try {
      const { error } = await supabase.from("posts").delete().eq("id", p.id);
      if (error) throw error;
      setPosts((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      alert("Unable to delete.");
      console.error(e);
    }
  }

  // ---- Upload flow (triggered by bottom + only)
  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTab("home"); // volta para o feed
    setUploading(true);
    try {
      // 1) upload to storage
      const ext = file.name.split(".").pop() || (isVideo(file) ? "mp4" : "jpg");
      const path = `${session!.user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("posts").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;

      const publicUrl = await getPublicURL("posts", path);

      // 2) insert post
      const { error: insErr } = await supabase.from("posts").insert({
        user_id: session!.user.id,
        media_url: publicUrl,
        media_type: isVideo(file) ? "video" : "image",
        caption: null,
      });
      if (insErr) throw insErr;

      await loadFeed();
    } catch (e) {
      alert("Upload failed.");
      console.error(e);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ---- Profile counts (safe if follows table not ready)
  const [counts, setCounts] = useState({ posts: 0, followers: 0, following: 0 });
  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      try {
        // posts
        const { count } = await supabase
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("user_id", session.user.id);
        // followers/following (try; if table missing, result 0)
        let followers = 0;
        let following = 0;
        try {
          const f1 = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", session.user.id);
          followers = f1.count ?? 0;
          const f2 = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", session.user.id);
          following = f2.count ?? 0;
        } catch {}

        setCounts({ posts: count ?? 0, followers, following });
      } catch {
        setCounts({ posts: 0, followers: 0, following: 0 });
      }
    })();
  }, [session?.user, posts.length]);

  // ---- Change avatar
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !me) return;
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${me.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (error) throw error;
      const publicUrl = await getPublicURL("avatars", path);
      const { error: upErr } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", me.id);
      if (upErr) throw upErr;
      setMe({ ...me, avatar_url: publicUrl });
    } catch (e) {
      alert("Unable to update avatar.");
      console.error(e);
    } finally {
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  // ---- Views
  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      {TopBar}

      <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={onFileChosen} />
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={onAvatarChange} />

      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-6">
          {tab === "home" && (
            <section>
              {loadingFeed ? (
                <div className="text-sm text-neutral-500">Loading…</div>
              ) : posts.length === 0 ? (
                <div className="text-sm text-neutral-500 text-center py-20">No posts yet.</div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-6">
                  {posts.map((p) => (
                    <article key={p.id} className="rounded-xl bg-white border border-neutral-200 overflow-hidden shadow-sm">
                      <header className="flex items-center gap-3 px-4 py-3">
                        <img
                          src={
                            p.profile?.avatar_url ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(p.profile?.full_name || p.profile?.username || "User")}`
                          }
                          alt=""
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div className="text-sm">
                          <div className="font-medium">{p.profile?.full_name || p.profile?.username || "User"}</div>
                          <div className="text-neutral-500">@{p.profile?.username}</div>
                        </div>
                        <div className="ml-auto text-xs text-neutral-500">
                          {new Date(p.created_at).toLocaleDateString()}
                        </div>
                      </header>

                      <div className="bg-black">
                        {p.media_type === "video" ? (
                          <video src={p.media_url} controls className="w-full h-auto" />
                        ) : (
                          <img src={p.media_url} alt="" className="w-full h-auto object-cover" />
                        )}
                      </div>

                      <footer className="px-4 py-3 flex items-center gap-4">
                        <button
                          onClick={() => toggleLike(p)}
                          className={cls("text-sm font-medium", p.likedByMe ? "text-black" : "text-neutral-600")}
                        >
                          {p.likedByMe ? "Unlike" : "Like"} ({p.likeCount ?? 0})
                        </button>
                        <button onClick={() => openComments(p)} className="text-sm text-neutral-600">
                          Comment ({p.commentCount ?? 0})
                        </button>
                        {session.user.id === p.user_id && (
                          <button onClick={() => deletePost(p)} className="ml-auto text-sm text-red-600">
                            Delete
                          </button>
                        )}
                      </footer>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "search" && (
            <section>
              <h2 className="text-lg font-semibold mb-2">Search</h2>
              <p className="text-sm text-neutral-600">Coming soon: user search and discovery.</p>
            </section>
          )}

          {tab === "upload" && (
            <section className="flex flex-col items-center justify-center py-20">
              <button
                onClick={openFilePicker}
                disabled={uploading}
                className="rounded-lg bg-black text-white px-5 py-2.5 font-medium disabled:opacity-60"
              >
                {uploading ? "Uploading…" : "Select photo/video"}
              </button>
              <p className="text-xs text-neutral-500 mt-3">After selection, your post will appear in Home.</p>
            </section>
          )}

          {tab === "profile" && me && (
            <section>
              {/* Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  <img
                    src={
                      me.avatar_url ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(me.full_name || me.username || "User")}`
                    }
                    alt=""
                    className="w-20 h-20 rounded-full object-cover border border-neutral-200"
                  />
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-xs bg-black text-white px-2 py-0.5 rounded"
                  >
                    Change
                  </button>
                </div>
                <div>
                  <div className="text-xl font-semibold">{me.full_name || me.username || "Profile"}</div>
                  <div className="text-neutral-600">@{me.username}</div>
                  <div className="flex gap-6 mt-2 text-sm">
                    <div><span className="font-medium">{counts.posts}</span> Posts</div>
                    <div><span className="font-medium">{counts.followers}</span> Followers</div>
                    <div><span className="font-medium">{counts.following}</span> Following</div>
                  </div>
                </div>
              </div>

              {/* Grid of my posts */}
              <h3 className="text-sm font-medium text-neutral-700 mb-3">Posts</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {posts.filter(p => p.user_id === me.id).map((p) => (
                  <div key={p.id} className="relative rounded-lg overflow-hidden border border-neutral-200 bg-white">
                    {p.media_type === "video" ? (
                      <video src={p.media_url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={p.media_url} alt="" className="w-full h-full object-cover" />
                    )}
                    {session.user.id === p.user_id && (
                      <button
                        onClick={() => deletePost(p)}
                        className="absolute top-2 right-2 text-xs bg-white/90 border border-neutral-300 rounded px-2 py-0.5"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      {BottomNav}

      {/* Comments modal */}
      {openCommentsFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20" onClick={() => setOpenCommentsFor(null)}>
          <div className="w-full max-w-lg bg-white rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Comments</div>
              <button className="text-sm text-neutral-600" onClick={() => setOpenCommentsFor(null)}>Close</button>
            </div>

            <div className="max-h-64 overflow-auto space-y-3 mb-3">
              {comments.length === 0 ? (
                <div className="text-sm text-neutral-500">Be the first to comment.</div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-3">
                    <img
                      src={
                        c.profile?.avatar_url ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(c.profile?.full_name || c.profile?.username || "U")}`
                      }
                      className="w-7 h-7 rounded-full object-cover"
                    />
                    <div className="text-sm">
                      <div className="font-medium">{c.profile?.username ? `@${c.profile.username}` : "user"}</div>
                      <div className="text-neutral-700">{c.content}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder="Write a comment…"
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <button onClick={sendComment} className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium">
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
