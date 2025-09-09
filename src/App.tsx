import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, Session, User } from "@supabase/supabase-js";
import supabase from "./lib/supabaseClient";

// ====== Tipos ======
type Profile = {
  id: string; // = auth.users.id
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  is_private: boolean | null;
  created_at: string;
};

type PostRow = {
  id: string;
  user_id: string;
  caption: string | null;
  media_url: string | null;
  media_type: "image" | "video" | null;
  created_at: string;
};

type PostWithAuthor = PostRow & {
  author: Pick<Profile, "username" | "avatar_url" | "full_name"> | null;
};

// ====== Helpers ======
const BUCKET = "media";

// Gera um slug de username a partir do email/nome
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20) || "user";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

// Detecta tipo de mídia pelo mime/type do arquivo
const detectMediaType = (file: File): "image" | "video" | null => {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
};

// ====== App ======
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const user = session?.user ?? null;

  // Perfil
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Form de perfil
  const [pfUsername, setPfUsername] = useState("");
  const [pfFullname, setPfFullname] = useState("");
  const [pfBio, setPfBio] = useState("");
  const [pfLocation, setPfLocation] = useState("");
  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  // Post
  const [caption, setCaption] = useState("");
  const postFileRef = useRef<HTMLInputElement | null>(null);
  const [posting, setPosting] = useState(false);

  // Feed
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

  // ---------------------------------------------------
  // Sessão
  // ---------------------------------------------------
  useEffect(() => {
    let ignore = false;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!ignore) setSession(data.session ?? null);

      supabase.auth.onAuthStateChange((_event, s) => {
        setSession(s);
      });
    };

    init();
    return () => {
      ignore = true;
    };
  }, []);

  // ---------------------------------------------------
  // Quando logar: garante que profile existe e carrega
  // ---------------------------------------------------
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    (async () => {
      setLoadingProfile(true);
      try {
        await ensureProfile(user);
        const p = await fetchProfile(user.id);
        setProfile(p);
        fillProfileForm(p);
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [user?.id]);

  // ---------------------------------------------------
  // Carregar feed
  // ---------------------------------------------------
  useEffect(() => {
    (async () => {
      setLoadingFeed(true);
      try {
        const { data, error } = await supabase
          .from("posts")
          .select(
            `
          id, user_id, caption, media_url, media_type, created_at,
          author:profiles ( username, avatar_url, full_name )
        `
          )
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        setPosts((data ?? []) as unknown as PostWithAuthor[]);
      } finally {
        setLoadingFeed(false);
      }
    })();
  }, []);

  // ---------------------------------------------------
  // Ações de Auth
  // ---------------------------------------------------
  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin, // volta pra app
      },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // ---------------------------------------------------
  // Profile: ensure, load, save
  // ---------------------------------------------------
  const ensureProfile = async (u: User) => {
    // tenta buscar
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", u.id)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      // criar um username candidato
      const base =
        u.user_metadata?.preferred_username ||
        (u.email ? slugify(u.email.split("@")[0]) : "user");

      const unique = await findUniqueUsername(base);

      const insert = {
        id: u.id,
        username: unique,
        full_name:
          u.user_metadata?.full_name ||
          u.user_metadata?.name ||
          (u.email ? u.email.split("@")[0] : "User"),
        avatar_url: u.user_metadata?.avatar_url || null,
        bio: null,
        location: null,
      };

      const { error: insErr } = await supabase.from("profiles").insert(insert);
      if (insErr) throw insErr;
    }
  };

  const fetchProfile = async (id: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data as Profile;
  };

  // Garante username único (case-insensitive)
  const findUniqueUsername = async (base: string) => {
    let candidate = base;
    let suffix = 0;
    // checa até achar livre
    // (poucos usuários -> loop curto)
    // usa index lower(username)
    // @ts-ignore
    // biome-ignore lint/suspicious/noConstantCondition
    while (true) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", candidate)
        .maybeSingle();
      if (error) throw error;
      if (!data) return candidate;
      suffix += 1;
      candidate = `${base}${suffix}`;
    }
  };

  const fillProfileForm = (p: Profile | null) => {
    setPfUsername(p?.username ?? "");
    setPfFullname(p?.full_name ?? "");
    setPfBio(p?.bio ?? "");
    setPfLocation(p?.location ?? "");
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    setProfileMsg(null);

    try {
      // 1) Upload do avatar se selecionado
      let avatar_url = profile?.avatar_url ?? null;
      const avatarFile = avatarFileRef.current?.files?.[0] ?? null;
      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop();
        const path = `avatars/${user.id}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, avatarFile, {
            upsert: true,
            contentType: avatarFile.type,
          });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        avatar_url = pub.publicUrl;
      }

      // 2) Se username mudou, validar unicidade (case-insensitive)
      let nextUsername = pfUsername.trim();
      if (!nextUsername) {
        nextUsername = await findUniqueUsername(
          slugify(pfFullname || user.email?.split("@")[0] || "user")
        );
      } else {
        const { data } = await supabase
          .from("profiles")
          .select("id")
          .neq("id", user.id)
          .ilike("username", nextUsername)
          .maybeSingle();
        if (data) {
          throw new Error("Este @username já está em uso.");
        }
      }

      // 3) Upsert
      const { error } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          username: nextUsername,
          full_name: pfFullname || null,
          bio: pfBio || null,
          location: pfLocation || null,
          avatar_url,
        },
        { onConflict: "id" }
      );
      if (error) throw error;

      const updated = await fetchProfile(user.id);
      setProfile(updated);
      fillProfileForm(updated);
      setProfileMsg("Perfil atualizado ✅");
    } catch (e: any) {
      setProfileMsg(e.message || "Erro ao salvar perfil.");
    } finally {
      setSavingProfile(false);
    }
  };

  // ---------------------------------------------------
  // Postar mídia
  // ---------------------------------------------------
  const handleCreatePost = async () => {
    if (!user) return;
    const file = postFileRef.current?.files?.[0] ?? null;
    const hasUrl = !!file;
    if (!caption.trim() && !hasUrl) return;

    setPosting(true);
    try {
      let media_url: string | null = null;
      let media_type: "image" | "video" | null = null;

      if (file) {
        media_type = detectMediaType(file);
        if (!media_type) throw new Error("Arquivo deve ser imagem ou vídeo.");

        const ext = file.name.split(".").pop();
        const path = `posts/${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) throw upErr;

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        media_url = pub.publicUrl;
      }

      const { error } = await supabase.from("posts").insert({
        user_id: user.id,
        caption: caption || null,
        media_url,
        media_type,
      });
      if (error) throw error;

      // limpa form
      setCaption("");
      if (postFileRef.current) postFileRef.current.value = "";

      // atualiza feed
      const { data: newFeed } = await supabase
        .from("posts")
        .select(
          `
        id, user_id, caption, media_url, media_type, created_at,
        author:profiles ( username, avatar_url, full_name )
      `
        )
        .order("created_at", { ascending: false })
        .limit(100);
      setPosts((newFeed ?? []) as unknown as PostWithAuthor[]);
    } catch (e) {
      alert((e as any).message ?? "Erro ao postar.");
    } finally {
      setPosting(false);
    }
  };

  // ---------------------------------------------------
  // UI
  // ---------------------------------------------------
  if (!session) {
    return (
      <Shell>
        <Card>
          <h1 className="title">LIV</h1>
          <p className="muted">Compartilhe sua vida saudável</p>
          <div className="spacer" />
          <button className="btn primary" onClick={signInWithGoogle}>
            Entrar com Google
          </button>
        </Card>
        <Style />
      </Shell>
    );
  }

  return (
    <Shell>
      <Header
        user={user}
        profile={profile}
        onLogout={signOut}
        loadingProfile={loadingProfile}
      />

      <div className="grid">
        {/* Coluna esquerda: criar post */}
        <Card>
          <h2 className="h2">Novo post</h2>
          <div className="vstack">
            <input
              className="input"
              placeholder="Legenda"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />

            <label className="file">
              <input type="file" ref={postFileRef} accept="image/*,video/*" />
              <span>Selecionar mídia</span>
            </label>

            <button
              className="btn primary"
              disabled={posting}
              onClick={handleCreatePost}
            >
              {posting ? "Postando..." : "Postar"}
            </button>
          </div>
        </Card>

        {/* Coluna direita: perfil */}
        <Card>
          <h2 className="h2">Seu perfil</h2>
          {profile ? (
            <>
              <div className="profile-row">
                <Avatar url={profile.avatar_url} size={56} />
                <div>
                  <div className="username">@{profile.username}</div>
                  <div className="muted">{user.email}</div>
                </div>
              </div>

              <div className="vstack">
                <div className="grid2">
                  <div>
                    <label className="label">@username</label>
                    <input
                      className="input"
                      value={pfUsername}
                      onChange={(e) => setPfUsername(e.target.value)}
                      placeholder="@voce"
                    />
                  </div>
                  <div>
                    <label className="label">Nome</label>
                    <input
                      className="input"
                      value={pfFullname}
                      onChange={(e) => setPfFullname(e.target.value)}
                      placeholder="Seu nome"
                    />
                  </div>
                </div>

                <div className="grid2">
                  <div>
                    <label className="label">Local</label>
                    <input
                      className="input"
                      value={pfLocation}
                      onChange={(e) => setPfLocation(e.target.value)}
                      placeholder="Cidade, país"
                    />
                  </div>
                  <div>
                    <label className="label">Avatar</label>
                    <label className="file">
                      <input type="file" ref={avatarFileRef} accept="image/*" />
                      <span>Selecionar imagem</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="label">Bio</label>
                  <textarea
                    className="textarea"
                    rows={3}
                    value={pfBio}
                    onChange={(e) => setPfBio(e.target.value)}
                    placeholder="Fale um pouco sobre você…"
                  />
                </div>

                <button
                  className="btn"
                  disabled={savingProfile}
                  onClick={handleSaveProfile}
                >
                  {savingProfile ? "Salvando..." : "Salvar perfil"}
                </button>
                {profileMsg && <div className="ok">{profileMsg}</div>}
              </div>
            </>
          ) : (
            <div className="muted">Carregando perfil…</div>
          )}
        </Card>
      </div>

      {/* Feed */}
      <Card>
        <h2 className="h2">Feed</h2>
        {loadingFeed && <div className="muted">Carregando…</div>}
        <div className="feed">
          {posts.map((p) => (
            <PostItem key={p.id} post={p} />
          ))}
          {!loadingFeed && posts.length === 0 && (
            <div className="muted">Sem posts ainda. Publique o primeiro! ✨</div>
          )}
        </div>
      </Card>

      <Style />
    </Shell>
  );
}

// ====== Componentes de UI básicos ======
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="page">{children}</div>;
}

function Header({
  user,
  profile,
  onLogout,
  loadingProfile,
}: {
  user: User;
  profile: Profile | null;
  onLogout: () => void;
  loadingProfile: boolean;
}) {
  return (
    <div className="header">
      <div className="brand">LIV APP</div>
      <div className="spacer" />
      {loadingProfile ? (
        <div className="muted">Carregando…</div>
      ) : (
        <>
          <div className="me">
            <Avatar url={profile?.avatar_url} size={28} />
            <span>@{profile?.username ?? "..."}</span>
          </div>
          <button className="btn danger" onClick={onLogout}>
            Logout
          </button>
        </>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="card">{children}</div>;
}

function Avatar({ url, size = 40 }: { url: string | null | undefined; size?: number }) {
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        backgroundImage: url ? `url(${url})` : undefined,
      }}
    />
  );
}

function PostItem({ post }: { post: PostWithAuthor }) {
  const author = post.author;
  return (
    <div className="post">
      <div className="post-head">
        <Avatar url={author?.avatar_url} size={40} />
        <div>
          <div className="username">@{author?.username ?? "user"}</div>
          <div className="muted">{formatDate(post.created_at)}</div>
        </div>
      </div>
      {post.caption && <div className="caption">{post.caption}</div>}

      {post.media_url && post.media_type === "image" && (
        <img className="media" src={post.media_url} alt="" />
      )}
      {post.media_url && post.media_type === "video" && (
        <video className="media" src={post.media_url} controls playsInline />
      )}
    </div>
  );
}

// ====== Estilos inline (clean) ======
function Style() {
  return (
    <style>{`
    :root{
      --bg:#0b0b0c;
      --card:#121316;
      --muted:#a6adbb;
      --text:#e7e9ee;
      --primary:#5b8cff;
      --danger:#ff6b6b;
      --border:#24262b;
      --ring:#2b303a;
    }
    *{box-sizing:border-box}
    body, #root { background:var(--bg); color:var(--text); margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial }
    .page{max-width:980px; margin:24px auto; padding:0 16px}
    .header{display:flex; align-items:center; gap:12px; margin-bottom:16px}
    .brand{font-weight:800; letter-spacing:1px}
    .spacer{flex:1}
    .me{display:flex; align-items:center; gap:8px; color:var(--muted)}
    .card{background:var(--card); border:1px solid var(--border); border-radius:14px; padding:16px; margin-bottom:16px; box-shadow: 0 0 0 1px var(--ring) inset}
    .title{font-size:28px; font-weight:800; margin:0}
    .h2{font-size:18px; margin:0 0 12px 0}
    .muted{color:var(--muted); font-size:14px}
    .ok{color:#3ddc84; font-size:14px}
    .grid{display:grid; grid-template-columns:1fr 1fr; gap:16px}
    @media (max-width:880px){ .grid{ grid-template-columns: 1fr } }
    .grid2{display:grid; grid-template-columns:1fr 1fr; gap:12px}
    .vstack{display:flex; flex-direction:column; gap:12px}
    .input,.textarea{width:100%; border:1px solid var(--border); border-radius:10px; padding:10px 12px; background:#0c0d10; color:var(--text); outline:none}
    .textarea{resize:vertical}
    .label{display:block; font-size:13px; color:var(--muted); margin-bottom:6px}
    .file input{display:none}
    .file span{display:inline-block; border:1px dashed var(--border); border-radius:10px; padding:10px 12px; color:var(--muted); cursor:pointer}
    .btn{background:#191b20; border:1px solid var(--border); color:var(--text); padding:10px 14px; border-radius:10px; cursor:pointer}
    .btn.primary{background:var(--primary); border-color:transparent; color:white}
    .btn.danger{background:var(--danger); border-color:transparent; color:white}
    .btn:disabled{opacity:.6; cursor:not-allowed}
    .profile-row{display:flex; align-items:center; gap:12px; margin-bottom:12px}
    .username{font-weight:600}
    .post{border-top:1px solid var(--border); padding-top:14px; margin-top:14px}
    .post-head{display:flex; gap:10px; align-items:center; margin-bottom:8px}
    .caption{margin:8px 0 10px}
    .media{width:100%; border-radius:12px; border:1px solid var(--border); display:block; max-height:65vh; object-fit:cover; background:#0c0d10}
    .avatar{border-radius:50%; background:#1b1d22 center/cover no-repeat; border:1px solid var(--border)}
    `}</style>
  );
}
