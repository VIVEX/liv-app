import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart, Home, PlusCircle } from "lucide-react";

// Supabase adapter (sem SDK)
const supa = {
  get url() { return (typeof localStorage !== 'undefined' && localStorage.getItem('LIV_SUPA_URL')) || ''; },
  get anon() { return (typeof localStorage !== 'undefined' && localStorage.getItem('LIV_SUPA_ANON')) || ''; },
  get access() { return (typeof localStorage !== 'undefined' && localStorage.getItem('LIV_SUPA_ACCESS')) || ''; },
  setAccess(token:string){ if (typeof localStorage !== 'undefined') localStorage.setItem('LIV_SUPA_ACCESS', token || ''); },
  isConfigured() { return !!this.url && /^https?:\/\//i.test(this.url) && !!this.anon; },
  isAuthed() { return this.isConfigured() && !!this.access; },
  ensureHashSession() {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash || '';
    if (hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.replace('#', ''));
      const at = params.get('access_token');
      if (at) this.setAccess(at);
      history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }
  },
  async fetch(path:string, { method = 'GET', body, headers = {}, requireAuth = false }: any = {}) {
    if (!this.isConfigured()) throw new Error('Supabase not configured: set Project URL + Anon key in Settings.');
    const needsAuth = requireAuth || (method !== 'GET' && (/^\/rest\//.test(path) || /^\/storage\//.test(path)));
    if (needsAuth && !this.access) throw new Error('Not authenticated: missing access token.');
    const endpoint = `${this.url}${path}`;
    const res = await fetch(endpoint, {
      method, mode: 'cors',
      headers: {
        'apikey': this.anon as string,
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(this.access ? { 'Authorization': `Bearer ${this.access}` } : {}),
        ...headers,
      },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
    if (!res.ok) {
      let detail = ''; try { detail = await res.text(); } catch {}
      throw new Error(`HTTP ${res.status} ${res.statusText} on ${method} ${path}${detail? ` — ${detail}`:''}`);
    }
    const contentType = res.headers.get('content-type') || '';
    return contentType.includes('application/json') ? res.json() : res.text();
  },
  async getUser() { return this.fetch('/auth/v1/user', { requireAuth: true }); },
  async insertPost(user_id:string, media_url:string, caption:string) {
    return this.fetch('/rest/v1/posts', { method: 'POST', body: [{ user_id, media_url, caption }], requireAuth: true });
  },
  async fetchFeed() {
    const sel = encodeURIComponent('id,media_url,caption,created_at,profiles:profiles!posts_user_id_fkey(id,full_name,city,avatar_url)');
    return this.fetch(`/rest/v1/posts?select=${sel}&order=created_at.desc`);
  },
  publicUrl(path:string){ return `${this.url}/storage/v1/object/public/media/${path}`; }
};

export default function App(){
  const [tab,setTab]=useState<"feed"|"create">("feed");
  const [openSettings,setOpenSettings]=useState(false);
  useEffect(()=>{supa.ensureHashSession();},[]);
  return(
    <div className="min-h-screen bg-white text-black flex flex-col">
      <header className="sticky top-0 z-10 bg-white border-b">
        <div className="max-w-screen-sm mx-auto h-14 flex items-center justify-between px-4">
          <div className="font-bold">LIV</div>
          <button className="text-xs underline" onClick={()=>setOpenSettings(true)}>
            {supa.isConfigured()? 'Supabase: ON' : 'Supabase: OFF'}
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        {tab==="feed"&&<Feed/>}
        {tab==="create"&&<CreatePost/>}
      </main>
      <nav className="sticky bottom-0 bg-white border-t">
        <div className="max-w-screen-sm mx-auto h-14 px-8 flex items-center justify-between">
          <IconBtn onClick={()=>setTab("feed")} active={tab==="feed"} Icon={Home} label="Feed"/>
          <IconBtn onClick={()=>setTab("create")} active={tab==="create"} Icon={PlusCircle} label="Post"/>
        </div>
      </nav>
      {openSettings && <Settings onClose={()=>setOpenSettings(false)} />}
    </div>
  );
}

function Feed(){
  const [posts,setPosts]=useState<any[]>([]);
  const [err,setErr]=useState('');
  useEffect(()=>{
    (async()=>{
      if(!supa.isConfigured()) { setErr('Connect Supabase in Settings to see the live feed.'); return; }
      try{ const rows=await supa.fetchFeed(); setPosts(rows as any[]); }
      catch(e:any){ setErr(e.message||'Failed to load feed'); }
    })();
  },[]);
  return <div className="p-4 space-y-3 max-w-screen-sm mx-auto">
    {err && <p className="text-xs text-red-500">{err}</p>}
    {posts.map(p=>(<PostCard key={p.id} post={p}/>))}
    {supa.isConfigured() && posts.length===0 && !err && <p className="text-sm text-gray-500">No posts yet.</p>}
  </div>;
}

function PostCard({post}:{post:any}){
  const author=post.profiles||{full_name:"Member",city:"-",avatar_url:"https://i.pravatar.cc/150?img=5"};
  return(
    <Card className="rounded-2xl">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Avatar className="w-8 h-8"><AvatarImage src={author.avatar_url}/><AvatarFallback>M</AvatarFallback></Avatar>
          <div>
            <p className="font-semibold text-sm">{author.full_name}</p>
            <p className="text-xs text-gray-500">{author.city}</p>
          </div>
        </div>
        <img src={post.media_url} className="w-full rounded mb-2"/>
        <div className="flex items-center justify-between">
          <p className="text-sm">{post.caption}</p>
          <span className="inline-flex items-center gap-1 text-sm text-gray-600"><Heart className="w-4 h-4"/>0</span>
        </div>
      </CardContent>
    </Card>
  );
}

function CreatePost(){
  const [file,setFile]=useState<File|null>(null);
  const [caption,setCaption]=useState('');
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);
  async function publish(){
    setMsg('');
    if(!file){ setMsg('Select a file'); return; }
    if(!supa.isAuthed()){ setMsg('Login first via magic link (paste access token in Settings).'); return; }
    try{
      setBusy(true);
      const u=await supa.getUser();
      const uid=(u as any)?.id||(u as any)?.user?.id;
      if(!uid) throw new Error('Could not read user id');
      const filename=`${Date.now()}-${file.name}`;
      const path=`uploads/${filename}`;
      await supa.fetch(`/storage/v1/object/media/${encodeURIComponent(path)}`,{ method:'POST', requireAuth:true, headers:{ 'Content-Type': file.type||'application/octet-stream', 'x-upsert':'true' }, body:file });
      const url=supa.publicUrl(path);
      await (supa as any).insertPost(uid,url,caption);
      setMsg('Published! Go to Feed to see it.');
      setFile(null); setCaption('');
    }catch(e:any){ setMsg(e.message||'Failed to publish'); }
    finally{ setBusy(false); }
  }
  return(
    <div className="p-4 space-y-2 max-w-screen-sm mx-auto">
      <Input type="file" accept="image/*,video/*" onChange={e=>setFile((e.target as HTMLInputElement).files?.[0]||null)}/>
      <Textarea placeholder="Write a caption" value={caption} onChange={e=>setCaption((e.target as HTMLTextAreaElement).value)}/>
      <Button onClick={publish} disabled={busy}>{busy?'Publishing…':'Publish'}</Button>
      {msg&&<p className={`text-xs ${msg.startsWith('Published')?'text-emerald-600':'text-red-500'}`}>{msg}</p>}
    </div>
  );
}

function Settings({onClose}:{onClose:()=>void}){
  const [url,setUrl]=useState<string>((typeof localStorage!=='undefined' && localStorage.getItem('LIV_SUPA_URL'))||'');
  const [anon,setAnon]=useState<string>((typeof localStorage!=='undefined' && localStorage.getItem('LIV_SUPA_ANON'))||'');
  const [access,setAccess]=useState<string>((typeof localStorage!=='undefined' && localStorage.getItem('LIV_SUPA_ACCESS'))||'');
  const [hint,setHint]=useState('');
  function validate(){
    const okUrl = /^https?:\/\//i.test(url);
    const okAnon = (anon||'').length>20;
    const okAccess = (access||'').length>10;
    setHint(`${okUrl?'✓':'✗'} URL • ${okAnon?'✓':'✗'} Anon • ${okAccess?'✓':'✗'} Access`);
  }
  function save(){
    if (typeof localStorage !== 'undefined'){
      localStorage.setItem('LIV_SUPA_URL',url.trim());
      localStorage.setItem('LIV_SUPA_ANON',anon.trim());
      localStorage.setItem('LIV_SUPA_ACCESS',access.trim());
    }
    onClose();
  }
  useEffect(()=>{ validate(); },[url,anon,access]);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-4 w-full max-w-md space-y-2">
        <p className="font-semibold">Supabase settings</p>
        <Input placeholder="Project URL (https://xxx.supabase.co)" value={url} onChange={e=>setUrl((e.target as HTMLInputElement).value)} />
        <Input placeholder="Anon public key" value={anon} onChange={e=>setAnon((e.target as HTMLInputElement).value)} />
        <Input placeholder="Access token (from magic link)" value={access} onChange={e=>setAccess((e.target as HTMLInputElement).value)} />
        <p className="text-[11px] text-gray-500">If your magic link opened elsewhere, copy the <code>#access_token=...</code> from the URL and paste here.</p>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-600">{hint}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconBtn({onClick,active,Icon,label}:{onClick:()=>void,active:boolean,Icon:any,label:string}){
  return(
    <button onClick={onClick} className={active?"text-emerald-600":"text-gray-400"}>
      <Icon className="w-6 h-6"/>
      <div className="text-[10px]">{label}</div>
    </button>
  );
}
