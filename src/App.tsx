import { useEffect, useState } from "react";
import supabase from "./lib/supabaseClient";
import Btn from "./components/ui/button";
import Modal from "./components/ui/modal";
import Avatar from "./components/ui/avatar";

type Profile = {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
};

type Post = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  likes_count: number;
  comments_count: number;
  liked_by_me?: boolean;
};

type Comment = {
  id: string;
  content: string;
  user: Profile;
};

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [view, setView] = useState<"home" | "search" | "post" | "profile">("home");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [feed, setFeed] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  // edit profile
  const [editOpen, setEditOpen] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editUsername, setEditUsername] = useState("");

  // comments
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [activePostId, setActivePostId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        loadProfile(data.user.id);
        loadFeed();
      }
    });
  }, []);

  async function signIn() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: "https://liv-app-xx.vercel.app" }, // redirect correto
    });
    if (error) console.error(error);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUserId(null);
    setProfile(null);
  }

  async function loadProfile(id: string) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .eq("id", id)
      .single();
    if (data) {
      setProfile(data);
      setEditFullName(data.full_name);
      setEditUsername(data.username);
    }
  }

  async function saveProfile() {
    if (!userId) return;
    await supabase.from("profiles").upsert({
      id: userId,
      full_name: editFullName,
      username: editUsername,
    });
    setProfile((p) =>
      p ? { ...p, full_name: editFullName, username: editUsername } : p
    );
    setEditOpen(false);
  }

  async function loadFeed() {
    const { data } = await supabase
      .from("posts")
      .select("id, user_id, media_url, media_type, likes_count, comments_count")
      .order("created_at", { ascending: false });
    if (data) setFeed(data);
  }

  async function toggleLike(post: Post) {
    if (!userId) return;
    const liked = post.liked_by_me;
    if (liked) {
      await supabase.from("likes").delete().match({ post_id: post.id, user_id: userId });
      setFeed((f) =>
        f.map((p) =>
          p.id === post.id
            ? { ...p, liked_by_me: false, likes_count: p.likes_count - 1 }
            : p
        )
      );
    } else {
      await supabase.from("likes").insert({ post_id: post.id, user_id: userId });
      setFeed((f) =>
        f.map((p) =>
          p.id === post.id
            ? { ...p, liked_by_me: true, likes_count: p.likes_count + 1 }
            : p
        )
      );
    }
  }

  async function openComments(post: Post) {
    setActivePostId(post.id);
    setCommentsOpen(true);
    const { data } = await supabase
      .from("comments")
      .select("id, content, user:profiles(id, username, avatar_url)")
      .eq("post_id", post.id);
    if (data) setComments(data as any);
  }

  async function submitComment() {
    if (!userId || !newComment || !activePostId) return;
    const { data } = await supabase
      .from("comments")
      .insert({ post_id: activePostId, user_id: userId, content: newComment })
      .select("id, content, user:profiles(id, username, avatar_url)")
      .single();
    if (data) setComments((c) => [...c, data as any]);
    setNewComment("");
  }

  async function deletePost(post: Post) {
    if (!userId || userId !== post.user_id) return;
    await supabase.from("posts").delete().eq("id", post.id);
    setFeed((f) => f.filter((p) => p.id !== post.id));
  }

  function openFilePicker() {
    alert("Implementar upload...");
  }

  return (
    <div className="max-w-3xl mx-auto">
      <header className="flex justify-between items-center p-4 border-b">
        <h1 className="text-lg font-bold">LIVET</h1>
        {userId ? (
          <div className="flex items-center gap-3">
            <button onClick={() => setView("home")}>Home</button>
            <button onClick={() => setView("search")}>Search</button>
            <button onClick={() => setView("post")}>Post</button>
            <button onClick={() => setView("profile")}>Profile</button>
            <Btn onClick={signOut}>Logout</Btn>
          </div>
        ) : (
          <Btn onClick={signIn}>Sign in with Google</Btn>
        )}
      </header>

      <div className="p-4">
        {view === "home" && (
          <>
            {!feed.length && (
              <div className="text-center text-gray-500 py-20">No posts yet.</div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {feed.map((p) => (
                <div key={p.id} className="relative">
                  {p.media_type === "image" ? (
                    <img
                      src={p.media_url}
                      className="w-full h-full object-cover rounded"
                    />
                  ) : (
                    <video
                      src={p.media_url}
                      className="w-full h-full object-cover rounded"
                      controls
                      playsInline
                    />
                  )}

                  {/* Post actions */}
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleLike(p)}
                        className={p.liked_by_me ? "font-semibold" : ""}
                      >
                        ♥️ {p.likes_count ?? 0}
                      </button>
                      <button onClick={() => openComments(p)}>
                        💬 {p.comments_count ?? 0}
                      </button>
                    </div>

                    {userId === p.user_id && (
                      <button
                        onClick={() => deletePost(p)}
                        className="text-red-600"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {view === "search" && (
          <div className="text-center text-gray-500 py-20">
            Search (coming soon).
          </div>
        )}

        {view === "post" && (
          <div className="text-center py-20">
            <div className="mb-3 text-gray-500">
              After selection, the post appears in Home.
            </div>
            <Btn onClick={openFilePicker} disabled={loading}>
              {loading ? "Uploading..." : "Select photo/video"}
            </Btn>
          </div>
        )}

        {view === "profile" && profile && (
          <div className="text-center py-10">
            <Avatar url={profile.avatar_url} size={80} />
            <h2 className="font-semibold mt-2">{profile.full_name}</h2>
            <p className="text-gray-500">@{profile.username}</p>
            <div className="mt-3">
              <Btn onClick={() => setEditOpen(true)}>Edit profile</Btn>
            </div>
          </div>
        )}
      </div>

      {/* Edit profile modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit profile">
        <div className="space-y-3">
          <label className="block">
            <div className="text-sm text-gray-600">Full name</div>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
            />
          </label>
          <label className="block">
            <div className="text-sm text-gray-600">Username</div>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Btn onClick={() => setEditOpen(false)}>Cancel</Btn>
            <Btn onClick={saveProfile}>Save</Btn>
          </div>
        </div>
      </Modal>

      {/* Comments modal */}
      <Modal
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        title="Comments"
      >
        <div className="space-y-3">
          <div className="max-h-64 overflow-auto space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2">
                <img
                  src={c.user.avatar_url || ""}
                  onError={(e) => ((e.currentTarget.style.display = "none"))}
                  className="h-7 w-7 rounded-full object-cover border"
                />
                <div>
                  <div className="text-sm font-medium">@{c.user.username}</div>
                  <div className="text-sm">{c.content}</div>
                </div>
              </div>
            ))}
            {!comments.length && (
              <div className="text-sm text-gray-500">Be the first to comment</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              className="flex-1 rounded-md border px-3 py-2"
              placeholder="Write a comment…"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            <Btn onClick={submitComment}>Send</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
