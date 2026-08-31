import { supabase } from './supabase';
import { sanitizeMessage } from './chatFilter';

export interface ChatMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface ChatContact {
  uid: string;
  name: string;
  photoURL?: string;
  online: boolean;
  isFriend: boolean;
  classId?: string;
  characterName?: string;
  role?: string;
  last_seen_at?: string | null;
  hasUnread?: boolean;
  /** Usuário marcou "Contato restrito": ninguém pode adicioná-lo */
  restricted?: boolean;
  /** Usuário bloqueou pedidos de duelo (PvP) contra o seu personagem */
  blockDuelRequests?: boolean;
  /** Status de chat do outro usuário ('online' | 'offline' | 'invisible') */
  status?: string;
}

export interface ChatSettings {
  status: 'online' | 'offline' | 'invisible';
  notifications: boolean;
  pulse: boolean;
  autoOpen: boolean;
  restricted: boolean;
  /** Bloqueia pedidos de duelo (PvP) contra o seu personagem */
  blockDuelRequests?: boolean;
}

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  status: 'online',
  notifications: true,
  pulse: true,
  autoOpen: false,
  restricted: false,
  blockDuelRequests: false,
};

/** Lê as configurações de chat do usuário (users.inventory_preferences.chatSettings + localStorage) */
export function getLocalChatSettings(uid?: string): ChatSettings {
  try {
    const key = `chat_settings_${uid || 'x'}`;
    const raw = localStorage.getItem(key);
    if (raw) return { ...DEFAULT_CHAT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) { /* ignore */ }
  return { ...DEFAULT_CHAT_SETTINGS };
}

export function saveLocalChatSettings(uid: string | undefined, s: ChatSettings) {
  try { localStorage.setItem(`chat_settings_${uid || 'x'}`, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

/** Carrega as configurações do banco e mescla com localStorage */
export async function fetchChatSettings(uid: string): Promise<ChatSettings> {
  const local = getLocalChatSettings(uid);
  try {
    const { data } = await supabase.from('users').select('inventory_preferences').eq('id', uid).single();
    const cs = (data?.inventory_preferences as any)?.chatSettings;
    if (cs) return { ...DEFAULT_CHAT_SETTINGS, ...local, ...cs };
  } catch (e) { /* ignore */ }
  return local;
}

/** Salva as configurações no banco e localStorage */
export async function saveChatSettings(uid: string, s: ChatSettings): Promise<boolean> {
  saveLocalChatSettings(uid, s);
  try {
    const { data } = await supabase.from('users').select('inventory_preferences').eq('id', uid).single();
    const prefs = (data?.inventory_preferences as any) || {};
    const { error } = await supabase.from('users').update({ inventory_preferences: { ...prefs, chatSettings: s } }).eq('id', uid);
    return !error;
  } catch (e) {
    return false;
  }
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 min (abas em background podem atrasar o heartbeat) // considera online quem atualizou há <90s

export function isOnlineTimestamp(ts?: string | null): boolean {
  if (!ts) return false;
  const t = new Date(ts).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t < ONLINE_WINDOW_MS;
}

export function getPresenceKey(uid: string) {
  return `chat_presence_${uid}`;
}

/** Atualiza o last_seen_at do usuário (heartbeat de presença) */
export async function heartbeatPresence(uid: string | undefined) {
  if (!uid) return;
  try {
    await supabase.from('users').update({ last_seen_at: new Date().toISOString() }).eq('id', uid);
  } catch (e) {
    // silencioso — não bloquear o chat por falha de heartbeat
  }
}

/** Extrai a série de uma turma (ex: "6º Ano A" -> "6º ano"; "8º ano" -> "8º ano") */
export function extractSeries(classId?: string | null): string {
  if (!classId) return '';
  return classId
    .trim()
    .replace(/[\s_-]*[A-Za-z]$/, '') // remove a última letra (A, B, C...)
    .toLowerCase()
    .trim();
}

/** Busca amigos + colegas da mesma turma + professores, para a lista de contatos.
 *  Staff (admin/teacher/coordinator) vê TODOS os alunos da escola. */
export async function fetchContacts(uid: string, classId?: string, tenantId?: string | null, myRole?: string): Promise<ChatContact[]> {
  const isStaff = myRole !== 'student' && myRole !== 'pending_student';

  // Aluno sem turma não tem contatos no chat
  if (!isStaff && (!classId || !classId.trim())) {
    return [];
  }

  // 1. Amigos explícitos + quem me adicionou (amizade mútua)
  const { data: friendRows } = await supabase
    .from('user_friends')
    .select('friend_id')
    .eq('user_id', uid);

  const friendIds = (friendRows || []).map(r => r.friend_id);

  // Quem me adicionou também conta como contato (a amizade é mútua),
  // mesmo que eu ainda não tenha processado a aceitação no meu cliente.
  const { data: backRows } = await supabase
    .from('user_friends')
    .select('user_id')
    .eq('friend_id', uid);
  const backFriendIds = (backRows || []).map(r => r.user_id);

  // Auto-reconciliação: se alguém me adicionou mas eu ainda não adicionei de volta,
  // gravo a minha linha (no meu próprio cliente, respeitando RLS). Garante a mútua
  // mesmo que a mensagem de aceitação não tenha sido processada.
  const toReconcile = backFriendIds.filter(id => !friendIds.includes(id));
  if (toReconcile.length > 0) {
    const { error: recError } = await supabase
      .from('user_friends')
      .upsert(toReconcile.map(id => ({ user_id: uid, friend_id: id })), { onConflict: 'user_id,friend_id' });
    if (!recError) {
      friendIds.push(...toReconcile);
    }
  }

  // 2. Colegas (usuários com mesmo tenant)
  // Alguns usuários existem apenas em tenant_users (sem users.tenant_id preenchido)
  // e ficavam invisíveis aqui. Buscamos também os membros do tenant e usamos .or().
  let usersQuery = supabase
    .from('users')
    .select('id, name, photo_url, class_id, character_name, last_seen_at, role, inventory_preferences');

  if (tenantId) {
    const { data: memberRows } = await supabase
      .from('tenant_users')
      .select('user_id')
      .eq('tenant_id', tenantId);
    const memberIds = (memberRows || []).map(r => r.user_id).filter(Boolean);
    if (memberIds.length > 0) {
      usersQuery = usersQuery.or(`tenant_id.eq.${tenantId},id.in.(${memberIds.join(',')})`);
    } else {
      usersQuery = usersQuery.eq('tenant_id', tenantId);
    }
  }

  const { data: users } = await usersQuery;

  const contacts: ChatContact[] = (users || [])
    .filter((u: any) => u.id !== uid)
    .map((u: any) => {
      const isFriend = friendIds.includes(u.id) || backFriendIds.includes(u.id);
      const otherIsStaff = u.role !== 'student' && u.role !== 'pending_student';
      const sameClass = !!classId && u.class_id === classId;
      // Configurações de chat do outro usuário (status/restrito)
      const otherPrefs = (u.inventory_preferences as any)?.chatSettings || {};
      const otherStatus = otherPrefs.status || 'online';
      // Status "offline" do outro: ele não aparece para ninguém
      if (otherStatus === 'offline') return null;
      // Status "invisible" do outro: aparece, mas sempre offline
      const online = otherStatus === 'invisible' ? false : isOnlineTimestamp(u.last_seen_at);

      // Regra: Staff vê todos os usuários; Aluno com turma vê apenas contatos da sua própria turma (e staff)
      const show = isStaff ? true : (sameClass || otherIsStaff);
      return {
        uid: u.id,
        name: u.name || 'Sem nome',
        photoURL: u.photo_url || '',
        online,
        isFriend,
        classId: u.class_id,
        characterName: u.character_name,
        role: u.role,
        last_seen_at: u.last_seen_at,
        restricted: !!otherPrefs.restricted,
        status: otherStatus,
        blockDuelRequests: !!otherPrefs.blockDuelRequests,
        _show: show,
      } as ChatContact & { _show: boolean };
    })
    .filter((c: any): c is ChatContact & { _show: boolean } => !!c && c._show)
    .sort((a: any, b: any) => (b.online ? 1 : 0) - (a.online ? 1 : 0));

  return contacts;
}

/** Adiciona aos contatos */
export async function addFriend(uid: string, friendId: string): Promise<boolean> {
  if (!uid || !friendId || uid === friendId) return false;
  const { error } = await supabase
    .from('user_friends')
    .upsert({ user_id: uid, friend_id: friendId }, { onConflict: 'user_id,friend_id' });
  if (error) {
    console.error('Erro ao adicionar contato:', error);
    return false;
  }
  return true;
}

/** Remove dos contatos */
export async function removeFriend(uid: string, friendId: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_friends')
    .delete()
    .eq('user_id', uid)
    .eq('friend_id', friendId);
  if (error) {
    console.error('Erro ao remover contato:', error);
    return false;
  }
  return true;
}

// ─── Convites de amizade (via mensagens marcadas) ───
export const FRIEND_REQ = '[FRIEND_REQUEST]';
export const FRIEND_ACCEPT = '[FRIEND_ACCEPT]';
export const FRIEND_REJECT = '[FRIEND_REJECT]';
export function isFriendMarker(body?: string): boolean {
  return !!body && body.startsWith('[FRIEND_');
}

/** Envia um convite de amizade (X → Y) */
export async function sendFriendRequest(senderId: string, recipientId: string): Promise<boolean> {
  return !!(await sendMessage(senderId, recipientId, FRIEND_REQ));
}

/** Responde ao convite (Y → X). Se aceitar, vira amizade mútua:
 *  quem responde adiciona o remetente; tenta também o lado do remetente
 *  (best-effort) — se o RLS bloquear, a reconciliação no fetchContacts completa. */
export async function respondFriendRequest(responderId: string, requesterId: string, accept: boolean): Promise<boolean> {
  const ok = !!(await sendMessage(responderId, requesterId, accept ? FRIEND_ACCEPT : FRIEND_REJECT));
  if (ok && accept) {
    await addFriend(responderId, requesterId);
    await addFriend(requesterId, responderId);
  }
  return ok;
}

/** Envia uma mensagem (com filtro de palavras/links) */
export async function sendMessage(senderId: string, recipientId: string, rawBody: string): Promise<ChatMessage | null> {
  if (!senderId || !recipientId) return null;
  const { text } = sanitizeMessage(rawBody);
  if (!text) return null;

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      sender_id: senderId,
      recipient_id: recipientId,
      body: text,
    })
    .select()
    .single();

  if (error) {
    console.error('Erro ao enviar mensagem:', error);
    return null;
  }

  // Atualizar conversas (remetente e destinatário)
  const now = new Date().toISOString();
  await supabase
    .from('chat_conversations')
    .upsert(
      {
        user_id: recipientId,
        peer_id: senderId,
        last_message: text,
        last_message_at: now,
        updated_at: now,
      },
      { onConflict: 'user_id,peer_id' }
    );
  await supabase
    .from('chat_conversations')
    .upsert(
      {
        user_id: senderId,
        peer_id: recipientId,
        last_message: text,
        last_message_at: now,
        updated_at: now,
      },
      { onConflict: 'user_id,peer_id' }
    );

  // Incrementar não-lidos do destinatário (busca atual + 1)
  const { data: conv } = await supabase
    .from('chat_conversations')
    .select('unread_count')
    .eq('user_id', recipientId)
    .eq('peer_id', senderId)
    .maybeSingle();
  const currentUnread = conv?.unread_count || 0;
  await supabase
    .from('chat_conversations')
    .update({ unread_count: currentUnread + 1 })
    .eq('user_id', recipientId)
    .eq('peer_id', senderId);

  return data as ChatMessage;
}

/** Marca mensagens como lidas */
export async function markRead(uid: string, peerId: string) {
  try {
    await supabase
      .from('chat_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', peerId)
      .eq('recipient_id', uid)
      .is('read_at', null);

    await supabase
      .from('chat_conversations')
      .update({ unread_count: 0 })
      .eq('user_id', uid)
      .eq('peer_id', peerId);
  } catch (e) {
    console.error('Erro ao marcar lido:', e);
  }
}

/** Busca o histórico de uma conversa */
export async function fetchConversation(uid: string, peerId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .or(`sender_id.eq.${uid},recipient_id.eq.${uid}`)
    .or(`sender_id.eq.${peerId},recipient_id.eq.${peerId}`)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    console.error('Erro ao buscar conversa:', error);
    return [];
  }

  return (data || []).filter(
    (m: any) =>
      (m.sender_id === uid && m.recipient_id === peerId) ||
      (m.sender_id === peerId && m.recipient_id === uid)
  ) as ChatMessage[];
}

/** Soma os não-lidos de todas as conversas */
export async function fetchTotalUnread(uid: string): Promise<number> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('unread_count')
    .eq('user_id', uid);

  if (error) return 0;
  return (data || []).reduce((sum: number, r: any) => sum + (r.unread_count || 0), 0);
}

/** Busca remetentes de mensagens não-lidas (para exibi-los na lista mesmo sem amizade/série) */
export async function fetchPendingSenders(uid: string): Promise<ChatContact[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('sender_id')
    .eq('recipient_id', uid)
    .is('read_at', null);

  if (error) return [];
  const senderIds = [...new Set((data || []).map((m: any) => m.sender_id))];
  if (senderIds.length === 0) return [];

  const { data: users } = await supabase
    .from('users')
    .select('id, name, photo_url, class_id, character_name, last_seen_at, role')
    .in('id', senderIds);

  return (users || []).map((u: any) => ({
    uid: u.id,
    name: u.name || 'Sem nome',
    photoURL: u.photo_url || '',
    online: isOnlineTimestamp(u.last_seen_at),
    isFriend: false,
    classId: u.class_id,
    characterName: u.character_name,
    role: u.role,
    last_seen_at: u.last_seen_at,
    hasUnread: true,
  }));
}