// src/features/profile/updateAvatar.ts
import { supabase } from '@/lib/supabaseClient';

const BUCKET = 'media';

function keyFor(userId: string, file: File) {
  const ts = Date.now();
  const ext = file.name.split('.').pop() || 'jpg';
  return `avatars/${userId}/${ts}.${ext}`;
}

export async function updateAvatar(file: File) {
  // 1) pegar usuário logado
  const { data: u, error: eUser } = await supabase.auth.getUser();
  if (eUser || !u?.user) throw new Error('Not authenticated');
  const userId = u.user.id;

  // 2) subir arquivo no Storage (respeitando as policies)
  const key = keyFor(userId, file);
  const { error: eUp } = await supabase
    .storage
    .from(BUCKET)
    .upload(key, file, { contentType: file.type || 'image/jpeg', upsert: false });
  if (eUp) throw eUp;

  // 3) obter URL pública
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(key);
  const publicUrl = pub.publicUrl;

  // 4) atualizar o profiles (ESSENCIAL: filtrar por id = userId)
  const { error: eUpd } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', userId)
    .select('id')
    .single();
  if (eUpd) throw eUpd;

  return publicUrl;
}
