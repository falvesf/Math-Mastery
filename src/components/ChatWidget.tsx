import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, X, Send, Users, UserPlus, ShieldCheck, User, Loader2, ArrowLeft, Pin, PinOff, Settings2, Mail, Minus, UserMinus, Swords, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import {
  fetchContacts, fetchConversation, sendMessage,
  // @ts-ignore
  markRead, addFriend, removeFriend, fetchTotalUnread, fetchPendingSenders, isOnlineTimestamp,
  sendFriendRequest, respondFriendRequest, isFriendMarker, FRIEND_ACCEPT, FRIEND_REJECT,
  getLocalChatSettings, saveLocalChatSettings, fetchChatSettings, saveChatSettings,
  type ChatSettings, type ChatMessage, type ChatContact,
} from '../lib/chat';
import { sanitizeMessage } from '../lib/chatFilter';
import { useDialog } from '../contexts/DialogContext';
import {
  loadSpamState, saveSpamState, penaltyLevel, formatCountdown, DAY_BLOCK_MS,
  SPAM_WINDOW_MS, SPAM_THRESHOLD, SPAM_STEP_MS, BLOCK_TRIGGER_COUNT,
  type SpamState,
} from '../lib/chatSpam';
import { subscribePresence } from '../lib/onlinePresence';
import PvpChallengeModal from './PvpChallengeModal';
import { subscribeIncomingChallenges, fetchPendingChallenge, declinePvpMatch, acceptPvpChallenge, getPvpBlockMs, fetchActivePvpMap, getRankIndex, ranksWithinTwo, type PvpMatch } from '../lib/pvp';

interface ChatWidgetProps {
  onOpenProfile?: (uid: string) => void;
  translucent?: boolean; // no painel master: ícone translúcido para não atrapalhar
}

const POLL_INTERVAL = 4000;
/** Tolerância antes de mostrar um usuário como offline (evita flutuação de foco) */
const ONLINE_GRACE_MS = 15000;

// ─── Helpers de data (separador de dia, estilo WhatsApp) ───
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = startOfDay(now);
  const start = startOfDay(d);
  if (start === today) return 'Hoje';
  if (start === today - 86400000) return 'Ontem';
  return d.toLocaleDateString('pt-BR');
}
function DayChip({ date }: { date: string }) {
  return (
    <div style={{ alignSelf: 'center', background: 'rgba(255,255,255,0.09)', color: 'var(--text-secondary)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0.15rem 0.7rem', borderRadius: '10px', margin: '0.2rem 0' }}>
      {dayLabel(date)}
    </div>
  );
}

// Aviso de penalidade por spam — visível apenas para o próprio usuário.
function SpamNotice({ spam, nowTick }: { spam: SpamState; nowTick: number }) {
  const blockedRemaining = spam.blockedUntil - nowTick;
  const penaltyRemaining = spam.penaltyUntil - nowTick;
  const isBlocked = blockedRemaining > 0;
  const isPenalized = !isBlocked && penaltyRemaining > 0;
  const isWarning = !isBlocked && !isPenalized && spam.count >= BLOCK_TRIGGER_COUNT - 1;
  if (!isBlocked && !isPenalized && !isWarning) return null;
  const level = penaltyLevel(spam.count);
  const color = isBlocked ? 'var(--accent-red)' : (level === 'red' ? 'var(--accent-red)' : level === 'orange' ? '#f97316' : '#eab308');
  const nearBlock = spam.count >= BLOCK_TRIGGER_COUNT - 1;
  return (
    <div className={isWarning ? 'spam-notice-blink' : ''} style={{ margin: '0.4rem 0.75rem', padding: '0.45rem 0.7rem', borderRadius: '10px', border: '1px solid currentColor', background: 'color-mix(in srgb, currentColor 12%, transparent)', color, fontSize: '0.72rem', fontWeight: 700, textAlign: 'center' }}>
      {isBlocked && <span>Chat bloqueado por spam por <b>{formatCountdown(blockedRemaining)}</b>. Você não pode enviar mensagens.</span>}
      {isPenalized && <span>Você foi silenciado por spam por <b>{formatCountdown(penaltyRemaining)}</b>.</span>}
      {isWarning && <span>Atenção: se cometer mais um ato de spam, seu chat ficará bloqueado por <b>1 dia</b>!</span>}
      {isPenalized && nearBlock && (
        <div style={{ marginTop: '0.25rem', color: 'var(--accent-red)' }}>Se cometer mais um ato de spam, seu chat ficará bloqueado por 1 dia!</div>
      )}
    </div>
  );
}

interface MiniChat {
  contact: ChatContact;
  minimized: boolean;
  pos: { x: number; y: number };
  msgs: ChatMessage[];
}

// Se é aluno (ou sem role → assume aluno). Não-alunos têm badge de função e NÃO exibem turma.
function isStudentContact(role?: string): boolean {
  return !role || role === 'student' || role === 'pending_student';
}
function getRoleLabel(role?: string): string {
  switch (role) {
    case 'admin':
    case 'superadmin': return 'Admin';
    case 'teacher': return 'Professor';
    case 'coordinator': return 'Coord.';
    default: return role || 'Equipe';
  }
}

export default function ChatWidget({ onOpenProfile, translucent = false }: ChatWidgetProps) {
  const { userData } = useAuth();
  const { tenantId } = useTenant();
  const { showToast } = useDialog();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [activeContact, setActiveContact] = useState<ChatContact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [blockedWarning, setBlockedWarning] = useState('');
  const [showFriendsOnly, setShowFriendsOnly] = useState(false);
  const [unreadByPeer, setUnreadByPeer] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<ChatSettings>(() => getLocalChatSettings(userData?.uid));
  const [showSettings, setShowSettings] = useState(false);
  const [pendingFriendReq, setPendingFriendReq] = useState<{ uid: string; name: string } | null>(null);
  const [minis, setMinis] = useState<MiniChat[]>([]);
  const minisRef = useRef<MiniChat[]>([]);
  minisRef.current = minis;
  // Anti-spam: estado persistente + relógio para a contagem regressiva
  const [spam, setSpam] = useState<SpamState>(() => loadSpamState(userData?.uid));
  const spamRef = useRef(spam);
  spamRef.current = spam;
  const sendTimesRef = useRef<number[]>([]);
  const [nowTick, setNowTick] = useState(Date.now());
  const messageEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  const uid = userData?.uid;
  const totalUnread = Object.values(unreadByPeer).reduce((a, b) => a + b, 0);

  // ---- PvP Duelos ----
  const navigate = useNavigate();
  const [pvpOpen, setPvpOpen] = useState<'challenger' | 'opponent' | null>(null);
  const [pvpContact, setPvpContact] = useState<{ uid: string; name: string; avatarConfig?: any; equippedItems?: any[] } | null>(null);
  const [pvpIncoming, setPvpIncoming] = useState<PvpMatch | null>(null);
  // Modal de CONFIRMAÇÃO antes das apostas (desafiado decide Aceitar/Recusar)
  const [pvpConfirm, setPvpConfirm] = useState<PvpMatch | null>(null);
  // uid -> matchId de partidas ATIVAS (para desabilitar duelo / oferecer modo espectador)
  const [pvpActiveMap, setPvpActiveMap] = useState<Record<string, { matchId: string; status: string }>>({});
  const pvpActiveRef = useRef<Record<string, { matchId: string; status: string }>>({});
  pvpActiveRef.current = pvpActiveMap;

  // Refresca as partidas ativas envolvendo eu e os contatos (realtime + polling)
  useEffect(() => {
    if (!uid) return;
    const refresh = () => {
      const contactUids = contactsRef.current.map(c => c.uid);
      fetchActivePvpMap(uid, contactUids).then(map => setPvpActiveMap(map));
    };
    refresh();
    const iv = setInterval(refresh, 3000);
    // Atualiza também quando abre/fecha modais de duelo
    window.addEventListener('pvp-state-change', refresh);
    // Realtime: qualquer mudança em pvp_matches que envolva eu/meus contatos -> refresh na hora
    const channel = supabase
      .channel(`pvp_active_${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pvp_matches' }, (payload: any) => {
        const row = payload.new || payload.old || {};
        const involved = [row.challenger_id, row.opponent_id].filter(Boolean);
        const mine = involved.includes(uid);
        const anyContact = involved.some(cid => contactsRef.current.some(c => c.uid === cid));
        if (mine || anyContact) refresh();
      })
      .subscribe();
    return () => { clearInterval(iv); window.removeEventListener('pvp-state-change', refresh); supabase.removeChannel(channel); };
  }, [uid]);

  // Recebe desafios em tempo real (quando alguém me desafia pelo chat)
  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeIncomingChallenges(uid, (m) => {
      // Nunca abre as apostas direto: fecha o modal de apostas e mostra a CONFIRMAÇÃO
      setPvpOpen(null);
      setPvpIncoming(null);
      setPvpConfirm(m);
    });
    // Se havia um desafio pendente antes de abrir o chat
    fetchPendingChallenge(uid).then(m => {
      if (m && !pvpConfirm && !pvpOpen) {
        setPvpConfirm(m);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const openPvpChallenge = async (contact: ChatContact) => {
    if (!contact || !contact.online) return;
    // Verificação FRESCA: o contato pode ter bloqueado duelos desde a última lista de contatos
    try {
      const { data: cd } = await supabase.from('users').select('inventory_preferences').eq('id', contact.uid).single();
      if ((cd?.inventory_preferences as any)?.chatSettings?.blockDuelRequests) {
        showToast(`${contact.name.split(' ')[0]} bloqueou pedidos de duelo (PvP).`);
        return;
      }
    } catch (e) { /* segue mesmo se falhar a leitura */ }
    // Bloqueio por recusas persistentes (1min, +1min a cada nova recusa)
    const blockMs = getPvpBlockMs(contact.uid);
    if (blockMs > 0) {
      const secs = Math.ceil(blockMs / 1000);
      showToast(`Você não pode desafiar ${contact.name.split(' ')[0]} por mais ${Math.floor(secs / 60)}m ${secs % 60}s (recusas anteriores).`);
      return;
    }
    // Nova: limite de patente (máx 2 de diferença) — toast, sem travar
    try {
      const [ri, riOpp] = await Promise.all([getRankIndex(userData?.uid || ''), getRankIndex(contact.uid)]);
      if (!ranksWithinTwo(ri, riOpp)) {
        showToast('A diferença de patentes é maior que 2. Não é possível duelar (duelo desequilibrado).');
        return;
      }
    } catch (e) { /* segue mesmo se falhar a leitura */ }
    setPvpContact({ uid: contact.uid, name: contact.name, avatarConfig: (contact as any).avatarConfig, equippedItems: (contact as any).equippedItems });
    setPvpIncoming(null);
    setPvpOpen('challenger');
  };

  // Atualiza o mapa de partidas ativas quando o estado de duelo muda
  useEffect(() => {
    window.dispatchEvent(new Event('pvp-state-change'));
  }, [pvpOpen, pvpConfirm, pvpIncoming]);

  const uidRef = useRef(uid);
  uidRef.current = uid;
  const activeContactRef = useRef(activeContact);
  activeContactRef.current = activeContact;
  const openConversationRef = useRef<(c: ChatContact) => void>(() => {});
  // Abre um contato: janela individual (modo individual) OU conversa fixa.
  // No modo individual, se já existir envelope minimizado, restaura em vez de criar outro.
  const handleOpenContact = (contact: ChatContact) => {
    if (settings.autoOpen) {
      const existing = minis.find(w => w.contact.uid === contact.uid);
      if (existing) {
        if (existing.minimized) restoreMini(contact.uid);
      } else {
        openMini(contact);
      }
    } else {
      openConversation(contact);
    }
  };
  const seenIdsRef = useRef<Set<string>>(new Set());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;
  // Última vez que cada contato foi visto online (para a tolerância de 15s)
  const lastSeenOnlineRef = useRef<Record<string, number>>({});

  // Fecha o chat ao clicar fora (a menos que esteja fixado)
  useEffect(() => {
    if (!open || pinned) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, pinned]);

  // Carregar contatos + não-lidas (heartbeat agora é global no AuthContext)
  useEffect(() => {
    if (!uid) return;
    loadContacts();
    loadUnreadMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, tenantId]);

  // Presença online em tempo real: atualiza o status dos contatos.
  // NUNCA força offline instantâneo: aplica uma tolerância de 15s a partir da
  // última vez que o contato foi visto online (evita flutuação por foco/WS).
  useEffect(() => {
    if (!uid) return;
    const unsub = subscribePresence(state => {
      const now = Date.now();
      setContacts(prev => prev.map(c => {
        const isNowOnline = (state.connected && state.onlineUids.has(c.uid)) || isOnlineTimestamp(c.last_seen_at);
        if (isNowOnline) lastSeenOnlineRef.current[c.uid] = now;
        return { ...c, online: isNowOnline || (now - (lastSeenOnlineRef.current[c.uid] || 0)) < ONLINE_GRACE_MS };
      }));
    });
    return unsub;
  }, [uid]);

  // Refresh periódico do last_seen_at dos contatos: mantém o indicador estável
  // mesmo quando a presença cai (aba em segundo plano suspende o WebSocket).
  useEffect(() => {
    if (!uid) return;
    const refreshLastSeen = async () => {
      try {
        const uids = contactsRef.current.map(c => c.uid);
        if (uids.length === 0) return;
        const { data } = await supabase
          .from('users')
          .select('id, last_seen_at')
          .in('id', uids);
        const map: Record<string, string | null> = {};
        (data || []).forEach((u: any) => { map[u.id] = u.last_seen_at || null; });
        const now = Date.now();
        setContacts(prev => prev.map(c => {
          const ts = map[c.uid] !== undefined ? map[c.uid] : c.last_seen_at;
          const isNowOnline = isOnlineTimestamp(ts);
          if (isNowOnline) lastSeenOnlineRef.current[c.uid] = now;
          return { ...c, last_seen_at: ts, online: isNowOnline || (now - (lastSeenOnlineRef.current[c.uid] || 0)) < ONLINE_GRACE_MS };
        }));
      } catch (e) { /* silencioso */ }
    };
    const int = setInterval(refreshLastSeen, 30000);
    return () => clearInterval(int);
  }, [uid]);

  const loadContacts = useCallback(async (silent = false) => {
    if (!uidRef.current) return;
    if (!silent) setContactsLoading(true);
    const [list, pending] = await Promise.all([
      fetchContacts(uidRef.current, userData?.classId, tenantId, userData?.role),
      fetchPendingSenders(uidRef.current),
    ]);
    // Mesclar: remetentes pendentes sempre aparecem (mesmo fora da série/amizade)
    const pendingIds = new Set(pending.map(p => p.uid));
    const merged = [...list.filter(c => !pendingIds.has(c.uid)), ...pending];
    // Registra quem estava online no momento do carregamento (tolerância 15s)
    const now = Date.now();
    merged.forEach(c => { if (c.online) lastSeenOnlineRef.current[c.uid] = now; });
    setContacts(merged);
    if (!silent) setContactsLoading(false);
  }, [userData?.classId, tenantId, userData?.role]);

  // Refresh periódico dos contatos (status online + prefs do outro usuário, ex. bloqueio de duelo)
  useEffect(() => {
    if (!uid) return;
    const int = setInterval(() => { loadContacts(true); }, 30000);
    return () => clearInterval(int);
  }, [uid, loadContacts]);

  const loadUnreadMap = useCallback(async () => {
    const currentUid = uidRef.current;
    if (!currentUid) return;
    const { data } = await supabase
      .from('chat_conversations')
      .select('peer_id, unread_count')
      .eq('user_id', currentUid)
      .gt('unread_count', 0);

    const map: Record<string, number> = {};
    (data || []).forEach((r: any) => {
      if (r.unread_count > 0) map[r.peer_id] = r.unread_count;
    });
    setUnreadByPeer(map);
  }, []);

  // Carrega as configurações de chat do banco e aplica o status à presença
  useEffect(() => {
    if (!uid) return;
    fetchChatSettings(uid).then(s => {
      setSettings(s);
      window.dispatchEvent(new CustomEvent('chat-status-change', { detail: { status: s.status } }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Relógio para atualizar a contagem regressiva de penalidades a cada segundo
  useEffect(() => {
    const int = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(int);
  }, []);

  const updateSettings = async (patch: Partial<ChatSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveLocalChatSettings(uid, next);
    if (uid) await saveChatSettings(uid, next);
    // Modo individual substitui a janela fixa: fecha a conversa fixa aberta
    if (patch.autoOpen === true) setActiveContact(null);
    // Avisa o AuthContext para aplicar o status (offline/invisible = sem presença)
    window.dispatchEvent(new CustomEvent('chat-status-change', { detail: { status: next.status } }));
  };

  const markUnreadFrom = useCallback((senderId: string) => {
    setUnreadByPeer(prev => ({ ...prev, [senderId]: (prev[senderId] || 0) + 1 }));
    // Garantir que o remetente apareça na lista (recarrega contatos com pendentes)
    loadContacts();
    setContacts(prev => prev.map(c => c.uid === senderId ? { ...c, hasUnread: true } : c));
  }, [loadContacts]);

  // Realtime + polling
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    const processMessage = (m: ChatMessage) => {
      const currentUid = uidRef.current;
      if (!currentUid) return;
      const activeNow = activeContactRef.current;

      // Mensagens de sistema (convite de amizade / resposta)
      if (isFriendMarker(m.body)) {
        handleSystemMessage(m);
        markRead(currentUid, m.sender_id);
        setUnreadByPeer(prev => ({ ...prev, [m.sender_id]: 0 }));
        return;
      }

      // Mini-janela exclusiva já existe para esse contato?
      const mini = minisRef.current.find(w => w.contact.uid === m.sender_id);
      if (mini) {
        if (mini.minimized) {
          // Minimizada: acumula como não-lida (o envelope mostra o badge)
          markUnreadFrom(m.sender_id);
        } else {
          setMinis(prev => prev.map(w => w.contact.uid === m.sender_id ? { ...w, msgs: [...w.msgs, m] } : w));
          markRead(currentUid, m.sender_id);
          setUnreadByPeer(prev => ({ ...prev, [m.sender_id]: 0 }));
        }
        return;
      }

      // Janela de chat individual: ao receber mensagem, cria o ENVELOPE (piscando),
      // independente de conversa fixa aberta — a pessoa escolhe qual atender.
      if (settingsRef.current.autoOpen && m.sender_id !== currentUid) {
        const contact = contactsRef.current.find(c => c.uid === m.sender_id)
          || { uid: m.sender_id, name: 'Contato', online: true, isFriend: false } as ChatContact;
        openMiniRef.current(contact, m, true);
        return;
      }

      if (activeNow && m.sender_id === activeNow.uid) {
        setMessages(prev => prev.some(p => p.id === m.id) ? prev : [...prev, m]);
        markRead(currentUid, m.sender_id);
        setUnreadByPeer(prev => ({ ...prev, [m.sender_id]: 0 }));
      } else {
        markUnreadFrom(m.sender_id);
      }
    };

    const pollNewMessages = async () => {
      const currentUid = uidRef.current;
      if (!currentUid) return;
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('recipient_id', currentUid)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (cancelled || !data || data.length === 0) return;

      const fresh = (data as ChatMessage[]).filter(m => !seenIdsRef.current.has(m.id));
      if (fresh.length === 0) return;
      fresh.forEach(m => seenIdsRef.current.add(m.id));

      const ordered = fresh.slice().reverse();
      ordered.forEach(processMessage);
    };

    const channel = supabase
      .channel(`chat_${uid}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `recipient_id=eq.${uid}`,
      }, async (payload: any) => {
        const m = payload.new as ChatMessage;
        seenIdsRef.current.add(m.id);
        processMessage(m);
      })
      .subscribe();

    const poll = setInterval(() => { if (!cancelled) pollNewMessages(); }, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, activeContact?.uid]);

  // Rolagem automática + foco no campo de mensagem ao abrir o chat ou conversa
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (open && activeContact) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, open, activeContact]);

  const openConversation = useCallback(async (contact: ChatContact) => {
    const currentUid = uidRef.current;
    if (!currentUid) return;
    // Ao abrir no chat principal, fecha a mini-janela do mesmo contato (evita duplicação)
    setMinis(prev => prev.filter(w => w.contact.uid !== contact.uid));
    setActiveContact(contact);
    const conv = await fetchConversation(currentUid, contact.uid);
    // Registrar todas as mensagens carregadas como vistas (evita re-processamento)
    conv.forEach(m => seenIdsRef.current.add(m.id));
    setMessages(conv);
    markRead(currentUid, contact.uid);
    setUnreadByPeer(prev => {
      const next = { ...prev };
      delete next[contact.uid];
      return next;
    });
    setContacts(prev => prev.map(c => c.uid === contact.uid ? { ...c, hasUnread: false } : c));
  }, []);
  openConversationRef.current = openConversation;

  // ─── Mini-janelas exclusivas (por contato) ───
  const openMini = useCallback(async (contact: ChatContact, incoming?: ChatMessage, startMinimized = false) => {
    const currentUid = uidRef.current;
    if (!currentUid) return;
    setMinis(prev => {
      if (prev.some(w => w.contact.uid === contact.uid)) return prev;
      const n = prev.length;
      return [...prev, { contact, minimized: startMinimized, pos: { x: Math.max(8, window.innerWidth - 330 - (n % 5) * 24), y: 70 + (n % 5) * 28 }, msgs: [] }];
    });
    if (startMinimized) {
      // Cria o envelope (minimizado) sem marcar como lido: pisca até abrir.
      // Restaura a conversa quando o usuário clicar no envelope.
      markUnreadFrom(contact.uid);
      return;
    }
    const conv = await fetchConversation(currentUid, contact.uid);
    conv.forEach(m => seenIdsRef.current.add(m.id));
    if (incoming && !conv.some(m => m.id === incoming.id)) conv.push(incoming);
    setMinis(prev => prev.map(w => w.contact.uid === contact.uid ? { ...w, msgs: conv } : w));
    markRead(currentUid, contact.uid);
    setUnreadByPeer(prev => { const n = { ...prev }; delete n[contact.uid]; return n; });
    setContacts(prev => prev.map(c => c.uid === contact.uid ? { ...c, hasUnread: false } : c));
  }, []);
  const openMiniRef = useRef(openMini);
  openMiniRef.current = openMini;

  const closeMini = (uid: string) => setMinis(prev => prev.filter(w => w.contact.uid !== uid));

  const minimizeMini = (uid: string) => setMinis(prev => prev.map(w => w.contact.uid === uid ? { ...w, minimized: true } : w));

  const restoreMini = async (uid: string) => {
    const currentUid = uidRef.current;
    if (!currentUid) return;
    setMinis(prev => prev.map(w => w.contact.uid === uid ? { ...w, minimized: false } : w));
    const conv = await fetchConversation(currentUid, uid);
    conv.forEach(m => seenIdsRef.current.add(m.id));
    setMinis(prev => prev.map(w => w.contact.uid === uid ? { ...w, msgs: conv } : w));
    markRead(currentUid, uid);
    setUnreadByPeer(prev => { const n = { ...prev }; delete n[uid]; return n; });
    setContacts(prev => prev.map(c => c.uid === uid ? { ...c, hasUnread: false } : c));
  };

  const sendFromMini = async (uid: string, text: string): Promise<boolean> => {
    const currentUid = uidRef.current;
    if (!currentUid || !text.trim()) return false;
    if (settings.status === 'offline') return false;
    const win = minisRef.current.find(w => w.contact.uid === uid);
    if (win && !isContactAvailable(win.contact)) {
      showToast(`${win.contact.characterName || win.contact.name} não está disponível`);
      return false;
    }
    if (!guardSend()) return false;
    const sent = await sendMessage(currentUid, uid, text);
    if (sent) {
      setMinis(prev => prev.map(w => w.contact.uid === uid ? { ...w, msgs: [...w.msgs, sent] } : w));
      return true;
    }
    return false;
  };

  const startDrag = (e: React.PointerEvent, index: number) => {
    e.preventDefault();
    const win = minis[index];
    const startX = e.clientX - win.pos.x;
    const startY = e.clientY - win.pos.y;
    const onMove = (ev: PointerEvent) => {
      setMinis(prev => prev.map((w, i) => i === index ? { ...w, pos: { x: ev.clientX - startX, y: ev.clientY - startY } } : w));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Mensagens de sistema: convites de amizade e respostas
  const handleSystemMessage = (m: ChatMessage) => {
    const senderName = contactsRef.current.find(c => c.uid === m.sender_id)?.name || 'Alguém';
    if (m.body.startsWith('[FRIEND_REQUEST]')) {
      const name = m.body.split('|')[1]?.trim() || senderName;
      setPendingFriendReq({ uid: m.sender_id, name });
    } else if (m.body === FRIEND_ACCEPT) {
      // Quem recebeu a aceitação adiciona o contato no próprio cliente (mútua)
      const me = uidRef.current;
      if (me) addFriend(me, m.sender_id);
      showToast(`${senderName} aceitou seu convite de contato!`);
      loadContacts();
    } else if (m.body === FRIEND_REJECT) {
      showToast(`${senderName} recusou seu convite de contato.`);
    }
  };

  const handleAcceptFriendReq = async () => {
    if (!pendingFriendReq || !uid) return;
    const ok = await respondFriendRequest(uid, pendingFriendReq.uid, true);
    setPendingFriendReq(null);
    if (ok) {
      showToast(`${pendingFriendReq.name} adicionado aos contatos!`);
      loadContacts();
    }
  };

  const handleRejectFriendReq = async () => {
    if (!pendingFriendReq || !uid) return;
    await respondFriendRequest(uid, pendingFriendReq.uid, false);
    setPendingFriendReq(null);
  };

  // Abrir conversa por evento externo (ex: clicar "Enviar mensagem" no professor visitante)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.uid) return;
      const contact = contacts.find(c => c.uid === detail.uid) || {
        uid: detail.uid,
        name: detail.name || 'Professor(a)',
        online: true,
        isFriend: false,
        classId: detail.classId,
      } as ChatContact;
      if (settings.autoOpen) {
        openMini(contact);
      } else {
        setOpen(true);
        openConversation(contact);
      }
    };
    window.addEventListener('open-chat-with', handler);
    return () => window.removeEventListener('open-chat-with', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts]);

  // Avisa o professor visitante quando um chat abre/fecha (para o boneco parar de andar)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('teacher-visit-chat', {
      detail: { open: open && !!activeContact, teacherUid: activeContact?.uid || null },
    }));
  }, [open, activeContact]);

  // Verifica/bloqueia envio por spam e aplica penalidades progressivas.
  // Retorna true se o envio pode prosseguir.
  const guardSend = (): boolean => {
    const now = Date.now();
    const s = spamRef.current;
    // Bloqueado (1 dia) ou em penalidade: não envia
    if (s.blockedUntil > now || s.penaltyUntil > now) return false;
    sendTimesRef.current = sendTimesRef.current.filter(t => now - t < SPAM_WINDOW_MS);
    if (sendTimesRef.current.length >= SPAM_THRESHOLD) {
      const next: SpamState = { ...s, count: s.count + 1 };
      if (next.count >= BLOCK_TRIGGER_COUNT) {
        next.blockedUntil = now + DAY_BLOCK_MS;
        next.penaltyUntil = 0;
      } else {
        next.penaltyUntil = now + next.count * SPAM_STEP_MS;
      }
      spamRef.current = next;
      setSpam(next);
      saveSpamState(uid, next);
      return false;
    }
    sendTimesRef.current.push(now);
    return true;
  };

  const handleSend = async () => {
    if (!uid || !activeContact || !draft.trim()) return;
    if (settings.status === 'offline') {
      setBlockedWarning('Você está offline e não pode conversar.');
      return;
    }
    if (activeContact && !isContactAvailable(activeContact)) {
      setBlockedWarning(`${activeContact.characterName || activeContact.name} não está disponível`);
      return;
    }
    if (!guardSend()) return;
    const { text, containsBlocked } = sanitizeMessage(draft);
    if (!text) return;
    setBlockedWarning(containsBlocked ? 'Sua mensagem continha palavras ou links bloqueados e foi ajustada.' : '');
    setSending(true);
    const sent = await sendMessage(uid, activeContact.uid, draft);
    setSending(false);
    if (sent) {
      setMessages(prev => [...prev, sent]);
      setDraft('');
    }
  };

  const handleAddFriend = async (contact: ChatContact) => {
    // Envia um convite; o outro lado precisa aceitar.
    const ok = await sendFriendRequest(uid!, contact.uid);
    if (ok) {
      showToast(`Convite de contato enviado para ${contact.name}!`);
    }
  };

  const handleRemoveFriend = async (contact: ChatContact) => {
    const ok = await removeFriend(uid!, contact.uid);
    if (ok) {
      setContacts(prev => prev.map(c => c.uid === contact.uid ? { ...c, isFriend: false } : c));
      setMinis(prev => prev.map(w => w.contact.uid === contact.uid ? { ...w, contact: { ...w.contact, isFriend: false } } : w));
      if (activeContact?.uid === contact.uid) setActiveContact({ ...activeContact, isFriend: false });
      showToast(`${contact.characterName || contact.name} removido dos contatos`);
    }
  };

  const isStudent = userData?.role === 'student' || !!userData?.studentViewActive;
  const isStudentWithoutClass = isStudent && (!userData?.classId || !userData?.classId.trim());
  const isChatDisabled = isStudentWithoutClass;

  const isSelfOffline = settings.status === 'offline';
  // Conversas ativas: quem conversa comigo (invisível) me vê online
  const chattingUids = new Set([
    ...(activeContact ? [activeContact.uid] : []),
    ...minis.filter(w => !w.minimized).map(w => w.contact.uid),
  ]);
  // O contato está disponível para conversar agora? (online, ou invisível em conversa ativa)
  const isContactAvailable = (c: ChatContact): boolean => {
    if (isSelfOffline) return false;
    return c.online || (c.status === 'invisible' && chattingUids.has(c.uid));
  };
  const baseContacts = showFriendsOnly ? contacts.filter(c => c.isFriend) : contacts;
  const onlineList = baseContacts.filter(c => isSelfOffline ? false : c.online).sort((a, b) => a.name.localeCompare(b.name));
  const offlineList = baseContacts.filter(c => isSelfOffline ? true : !c.online).sort((a, b) => a.name.localeCompare(b.name));
  const hasAnyOnline = isSelfOffline ? false : contacts.some(c => c.online);

const handleOpenWidget = () => {
    if (isChatDisabled) return;
    const next = !open;
    setOpen(next);
    if (next) {
      // Modo individual: o ícone é só a lista de contatos (quem está online/offline).
      // Clicar numa pessoa abre a janela individual; não abre conversa fixa.
      if (settings.autoOpen) {
        setActiveContact(null);
        return;
      }
      const withUnread = contacts
        .filter(c => (unreadByPeer[c.uid] || 0) > 0)
        .sort((a, b) => (unreadByPeer[b.uid] || 0) - (unreadByPeer[a.uid] || 0));
      if (withUnread.length > 0 && !activeContact) {
        openConversation(withUnread[0]);
      }
    }
  };

  const getFabClass = () => {
    if (isChatDisabled) return 'chat-fab disabled-state';
    if (!hasAnyOnline) return 'chat-fab offline-state';
    return 'chat-fab';
  };

  const getFabTitle = () => {
    if (isChatDisabled) return 'Chat bloqueado: você ainda não possui uma turma cadastrada.';
    if (!hasAnyOnline) return 'Chat (Nenhum contato online no momento)';
    return 'Chat';
  };

  const renderContactRow = (contact: ChatContact) => {
    const contactUnread = unreadByPeer[contact.uid] || 0;
    const hasUnread = contactUnread > 0;
    // Status "Offline" meu: ninguém parece online e não posso conversar.
    // Invisível (outro): aparece online apenas para quem está conversando com ele.
    const effOnline = settings.status === 'offline'
      ? false
      : (contact.online || (contact.status === 'invisible' && chattingUids.has(contact.uid)));
    return (
      <div
        key={contact.uid}
        onClick={() => handleOpenContact(contact)}
        className={`chat-contact-row${hasUnread ? ' has-unread' : ''}`}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.6rem',
          borderRadius: '8px', cursor: 'pointer', transition: 'background 0.15s',
          borderBottom: '1px solid var(--border-glass)',
          opacity: effOnline ? 1 : 0.6,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = hasUnread ? 'var(--gold-glow)' : 'rgba(255,255,255,0.06)')}
        onMouseLeave={e => (e.currentTarget.style.background = hasUnread ? 'var(--gold-glow)' : 'transparent')}
      >
        <div style={{ position: 'relative' }}>
          <div className={`chat-contact-avatar${hasUnread && settings.pulse && !settings.autoOpen ? ' has-unread-pulse' : ''}`} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--btn-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)' }}>
            <User size={20} />
          </div>
          {contact.photoURL && (
            <img
              src={contact.photoURL}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <span style={{
            position: 'absolute', bottom: '0', right: '0', width: '12px', height: '12px',
            borderRadius: '50%', background: effOnline ? 'var(--accent-green)' : 'rgba(100,116,139,0.55)',
            border: '2px solid var(--bg-dark)'
          }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="chat-contact-name" style={{
            fontSize: '0.85rem', color: 'var(--text-primary)',
            fontWeight: hasUnread ? 800 : 'normal',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {contact.characterName || contact.name}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            {effOnline ? <span style={{ color: 'var(--accent-green)' }}>● Online</span> : <span>○ Offline</span>}
            {contact.isFriend && <span style={{ marginLeft: '0.4rem', color: 'var(--gold-primary)' }}>★ Contato</span>}
            {/* Função (não-aluno) com badge discreto; turma só aparece para alunos */}
            {!isStudentContact(contact.role) && (
              <span style={{ marginLeft: '0.4rem', padding: '0.05rem 0.4rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', fontWeight: 'bold', fontSize: '0.62rem', textTransform: 'uppercase' }}>
                {getRoleLabel(contact.role)}
              </span>
            )}
            {isStudentContact(contact.role) && contact.classId && <span style={{ marginLeft: '0.4rem' }}>· {contact.classId}</span>}
          </div>
        </div>
        {settings.notifications && !settings.autoOpen && hasUnread && (
          <span style={{
            minWidth: '20px', height: '20px', borderRadius: '50%', background: 'var(--accent-red)',
            color: '#fff', fontSize: '0.7rem', fontWeight: 'bold', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '0 4px'
          }}>
            {contactUnread}
          </span>
        )}
        {!contact.isFriend && effOnline && !contact.restricted && (
          <button
            onClick={e => { e.stopPropagation(); handleAddFriend(contact); }}
            style={{ background: 'color-mix(in srgb, var(--accent-green, #10b981) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-green, #10b981) 40%, transparent)', color: 'var(--accent-green, #10b981)', cursor: 'pointer', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
            title="Adicionar aos contatos"
          >
            <UserPlus size={12} /> +Contato
          </button>
        )}
        {effOnline && !settings.blockDuelRequests && !contact.blockDuelRequests && (() => {
          const myActive = pvpActiveMap[userData?.uid];
          const contactActive = pvpActiveMap[contact.uid];
          if (myActive) {
            // EU estou em um duelo -> botão desabilitado
            return (
              <button disabled style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', color: '#64748b', cursor: 'not-allowed', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }} title="Você já está em um duelo">
                <Swords size={12} /> Em duelo
              </button>
            );
          }
          if (contactActive && contactActive.status === 'playing') {
            // O contato está DUELANDO na arena -> botão de ESPECTADOR (olho + arena)
            return (
              <button
                onClick={e => { e.stopPropagation(); navigate(`/pvp/${contactActive.matchId}?watch=${contact.uid}`); }}
                style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', cursor: 'pointer', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                title={`Ver o duelo de ${contact.name.split(' ')[0]} (espectador)`}
              >
                <Eye size={12} /> Assistir
              </button>
            );
          }
          if (contactActive) {
            // O contato está na PREPARAÇÃO/aposta -> duelo indisponível para os outros
            return (
              <button disabled style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', color: '#64748b', cursor: 'not-allowed', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }} title="O jogador está se preparando para um duelo">
                <Swords size={12} /> Em duelo
              </button>
            );
          }
          return (
            <button
              onClick={e => { e.stopPropagation(); openPvpChallenge(contact); }}
              style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa', cursor: 'pointer', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
              title="Desafiar para Duelo PvP"
            >
              <Swords size={12} /> Duelo
            </button>
          );
        })()}
      </div>
    );
  };

  return (
    <div ref={widgetRef} style={{ position: 'fixed', bottom: 0, right: 0, zIndex: 9999, pointerEvents: 'none' }}>
      {/* Botão flutuante com badge */}
      <button
        onClick={handleOpenWidget}
        disabled={isChatDisabled}
        className={`${getFabClass()}${!open && totalUnread > 0 && settings.pulse && !settings.autoOpen ? ' has-unread-pulse' : ''}`}
        style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem',
          width: translucent ? '44px' : '56px', height: translucent ? '44px' : '56px',
          borderRadius: '50%',
          border: 'none', cursor: isChatDisabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.25s ease',
          pointerEvents: 'auto', zIndex: 10000,
          opacity: translucent ? (open ? 1 : 0.35) : 1,
          transform: translucent ? 'scale(0.9)' : 'scale(1)',
          boxShadow: translucent ? '0 0 0 rgba(0,0,0,0)' : undefined
        }}
        onMouseEnter={translucent ? (e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)'; } : undefined}
        onMouseLeave={translucent ? (e) => { if (!open) { e.currentTarget.style.opacity = '0.35'; e.currentTarget.style.transform = 'scale(0.9)'; } } : undefined}
        title={getFabTitle()}
      >
        {open ? <X size={26} /> : <MessageCircle size={26} />}
        {!open && totalUnread > 0 && !isChatDisabled && settings.notifications && !settings.autoOpen && (
          <span style={{
            position: 'absolute', top: '-4px', right: '-4px', minWidth: '20px', height: '20px',
            borderRadius: '50%', background: 'var(--accent-red)', color: '#fff', fontSize: '0.7rem',
            fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', border: '2px solid var(--bg-dark)'
          }}>
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* Janela flutuante */}
      {open && (
        <div className="chat-window" style={{
          position: 'fixed', bottom: '5.5rem', right: '1.5rem',
          width: 'min(340px, calc(100vw - 2rem))', height: 'min(460px, calc(100dvh - 9rem))',
          borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)', pointerEvents: 'auto', zIndex: 9999
        }}>
          {/* Header */}
          <div className="chat-header" style={{
            padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {activeContact && (
                <button onClick={() => setActiveContact(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', marginRight: '0.25rem' }}>
                  <ArrowLeft size={18} />
                </button>
              )}
              <MessageCircle size={18} /> {activeContact ? activeContact.characterName || activeContact.name : 'Chat'}
              {activeContact && !isStudentContact(activeContact.role) && (
                <span style={{ padding: '0.05rem 0.4rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', fontWeight: 'bold', fontSize: '0.62rem', textTransform: 'uppercase', marginLeft: '0.3rem' }}>
                  {getRoleLabel(activeContact.role)}
                </span>
              )}
              {!activeContact && totalUnread > 0 && !settings.autoOpen && (
                <span style={{ background: 'var(--accent-red)', color: '#fff', borderRadius: '10px', padding: '0 0.4rem', fontSize: '0.7rem', fontWeight: 'bold' }}>
                  {totalUnread}
                </span>
              )}
            </strong>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              {!activeContact && (
                <button
                  onClick={() => setShowFriendsOnly(!showFriendsOnly)}
                  style={{ background: showFriendsOnly ? 'rgba(0,0,0,0.2)' : 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0.25rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}
                  title={showFriendsOnly ? 'Mostrando apenas contatos' : 'Mostrar todos os contatos'}
                >
                  <Users size={16} /> {showFriendsOnly ? 'Contatos' : 'Todos'}
                </button>
              )}
              <button
                onClick={() => setPinned(prev => !prev)}
                style={{
                  background: pinned ? 'rgba(0,0,0,0.25)' : 'transparent', border: 'none',
                  color: 'inherit', cursor: 'pointer', padding: '0.25rem', borderRadius: '6px',
                  display: 'flex', alignItems: 'center', fontSize: '0.75rem'
                }}
                title={pinned ? 'Chat fixado (não fecha ao clicar fora). Clique para soltar.' : 'Fixar chat (não fecha ao clicar fora)'}
              >
                {pinned ? <PinOff size={15} /> : <Pin size={15} />}
              </button>
              <button
                onClick={() => setShowSettings(v => !v)}
                style={{ background: showSettings ? 'rgba(0,0,0,0.25)' : 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0.25rem', borderRadius: '6px', display: 'flex', alignItems: 'center', fontSize: '0.75rem' }}
                title="Configurações do chat"
              >
                <Settings2 size={15} />
              </button>
            </div>
          </div>

          {/* Menu de configurações */}
          {showSettings && (
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.78rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>Status</span>
                <select value={settings.status} onChange={e => updateSettings({ status: e.target.value as ChatSettings['status'] })} style={{ background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', borderRadius: '6px', padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="invisible">Invisível</option>
                </select>
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '-0.3rem' }}>
                Online: visível e disponível. Offline: ninguém o vê (nem conversa). Invisível: conversa, mas ninguém vê que está online.
              </div>
              {[
                { key: 'notifications' as const, label: 'Notificações (bolinhas vermelhas com contagem)' },
                { key: 'pulse' as const, label: 'Notificações por pulso (glow no ícone)' },
                { key: 'autoOpen' as const, label: 'Janela de chat individual (envelope ao receber mensagem)' },
                { key: 'restricted' as const, label: 'Contato restrito (ninguém pode te adicionar)' },
                { key: 'blockDuelRequests' as const, label: 'Bloquear pedidos de duelo (PvP)' },
              ].map(t => (
                <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!settings[t.key]} onChange={e => updateSettings({ [t.key]: e.target.checked })} style={{ width: '15px', height: '15px', accentColor: 'var(--gold-primary)' }} />
                  {t.label}
                </label>
              ))}
            </div>
          )}

          {activeContact ? (
            /* Conversa aberta */
            <>
              <SpamNotice spam={spam} nowTick={nowTick} />
              <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{activeContact.characterName || activeContact.name}</strong>
                  <div style={{ fontSize: '0.7rem', color: activeContact.online ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                    {activeContact.online ? '● Online agora' : '○ Offline'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <button onClick={() => onOpenProfile?.(activeContact.uid)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue, #8b5cf6)', cursor: 'pointer', padding: '0.25rem' }} title="Ver histórico">
                    <User size={16} />
                  </button>
                  {activeContact.isFriend ? (
                    <button onClick={() => handleRemoveFriend(activeContact)} style={{ background: 'color-mix(in srgb, var(--accent-red, #ef4444) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red, #ef4444) 40%, transparent)', color: 'var(--accent-red, #ef4444)', cursor: 'pointer', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem' }}>
                      Remover contato
                    </button>
                  ) : (
                    <button onClick={() => handleAddFriend(activeContact)} style={{ background: 'color-mix(in srgb, var(--accent-green, #10b981) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-green, #10b981) 40%, transparent)', color: 'var(--accent-green, #10b981)', cursor: 'pointer', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <UserPlus size={12} /> Adicionar
                    </button>
                  )}
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {messages.filter(m => !isFriendMarker(m.body)).length === 0 && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', marginTop: '2rem' }}>
                    Nenhuma mensagem ainda. Envie a primeira!
                  </p>
                )}
                {messages.filter(m => !isFriendMarker(m.body)).map((msg, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showDay = !prev || new Date(prev.created_at).toDateString() !== new Date(msg.created_at).toDateString();
                  const mine = msg.sender_id === uid;
                  return (
                    <Fragment key={msg.id}>
                      {showDay && <DayChip date={msg.created_at} />}
                      <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                      <div className={mine ? 'chat-msg-mine' : 'chat-msg-theirs'} style={{
                        maxWidth: '80%', padding: '0.45rem 0.7rem', borderRadius: '10px',
                        fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                      }}>
                        {msg.body}
                        <div style={{ fontSize: '0.6rem', opacity: 0.6, marginTop: '0.15rem', textAlign: 'right' }}>
                          {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                    </Fragment>
                  );
                })}
                <div ref={messageEndRef} />
              </div>

              {blockedWarning && (
                <div style={{ padding: '0.35rem 0.75rem', fontSize: '0.7rem', color: 'var(--gold-primary)', background: 'color-mix(in srgb, var(--gold-primary) 10%, transparent)' }}>
                  {blockedWarning}
                </div>
              )}
              <div style={{ padding: '0.6rem', borderTop: '1px solid var(--border-glass)', display: 'flex', gap: '0.5rem' }}>
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Escreva sua mensagem... (Enter envia)"
                  rows={1}
                  className="chat-input"
                  style={{ flex: 1, resize: 'none', padding: '0.5rem', borderRadius: '8px', fontSize: '0.85rem' }}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                  style={{
                    background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)',
                    border: 'none', borderRadius: '8px',
                    width: '42px', cursor: sending ? 'default' : 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
            </>
          ) : (
            /* Lista de contatos com divisor online/offline */
            <>
              <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={16} color="var(--accent-green, #10b981)" />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Amigos, colegas de turma e professores. Quem te enviou mensagem aparece em destaque.
                </span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
                {contactsLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                ) : baseContacts.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', marginTop: '2rem', padding: '0 1rem' }}>
                    Nenhum contato disponível. Adicione colegas pelo ranking ou espere professores ficarem online.
                  </p>
                ) : (
                  <>
                    {onlineList.length > 0 && (
                      <>
                        <div className="chat-divider" style={{
                          padding: '0.4rem 0.6rem', fontSize: '0.7rem', fontWeight: 'bold',
                          color: 'var(--accent-green)'
                        }}>
                          ● Online ({onlineList.length})
                        </div>
                        {onlineList.map(renderContactRow)}
                      </>
                    )}
                    {offlineList.length > 0 && (
                      <>
                        <div className="chat-divider" style={{
                          padding: '0.6rem 0.6rem 0.4rem', fontSize: '0.7rem', fontWeight: 'bold',
                          color: 'var(--text-secondary)',
                          borderTop: '1px solid var(--border-glass)', marginTop: onlineList.length > 0 ? '0.5rem' : 0
                        }}>
                          ○ Offline ({offlineList.length})
                        </div>
                        {offlineList.map(renderContactRow)}
                      </>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Mini-janelas exclusivas (por contato, arrastáveis) */}
      {minis.filter(w => !w.minimized).map((w) => {
        const mi = minis.findIndex(x => x.contact.uid === w.contact.uid);
        return (
          <div key={w.contact.uid} style={{ position: 'fixed', left: w.pos.x, top: w.pos.y, width: 300, height: 280, background: 'rgba(13, 20, 36, 0.98)', border: '1px solid var(--border-glass)', borderRadius: '12px', boxShadow: '0 12px 40px rgba(0,0,0,0.7)', zIndex: 10004, display: 'flex', flexDirection: 'column', overflow: 'hidden', pointerEvents: 'auto' }}>
            <div onPointerDown={e => startDrag(e, mi)} style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'grab', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000)', userSelect: 'none', touchAction: 'none' }}>
              <strong style={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.contact.characterName || w.contact.name}</strong>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                {w.contact.isFriend && (
                  <button onClick={() => handleRemoveFriend(w.contact)} title="Remover dos contatos" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: '0.15rem' }}><UserMinus size={14} /></button>
                )}
                <button onClick={() => minimizeMini(w.contact.uid)} title="Minimizar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: '0.15rem' }}><Minus size={14} /></button>
                <button onClick={() => closeMini(w.contact.uid)} title="Fechar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: '0.15rem' }}><X size={14} /></button>
              </div>
            </div>
            <SpamNotice spam={spam} nowTick={nowTick} />
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {w.msgs.filter(m => !isFriendMarker(m.body)).map((m, idx, arr) => {
                const prev = arr[idx - 1];
                const showDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                const mine = m.sender_id === uid;
                return (
                  <Fragment key={m.id}>
                    {showDay && <DayChip date={m.created_at} />}
                    <div style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '0.4rem 0.6rem', borderRadius: '8px', fontSize: '0.78rem', background: mine ? 'var(--accent-blue, #8b5cf6)' : 'rgba(255,255,255,0.08)', color: '#fff', wordBreak: 'break-word' }}>
                      {m.body}
                    </div>
                  </Fragment>
                );
              })}
            </div>
            <MiniInput contactUid={w.contact.uid} onSend={sendFromMini} />
          </div>
        );
      })}

      {/* Pilha de envelopes (mini-janelas minimizadas) — no canto direito */}
      {(() => {
        const envs = minis.filter(w => w.minimized);
        if (envs.length === 0) return null;
        const ENV = 44, GAP = 8, RIGHT = 16, TOP_MIN = 12;
        const vh = window.innerHeight;
        const cols = Math.min(3, envs.length);
        const rows = Math.ceil(envs.length / cols);
        const clusterH = rows * (ENV + GAP) - GAP;
        const top = Math.max(TOP_MIN, (vh - clusterH) / 2);
        return (
          <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10005 }}>
            {envs.map((w, i) => {
              const c = Math.floor(i / rows);
              const r = i % rows;
              const x = window.innerWidth - RIGHT - ENV - c * (ENV + GAP);
              const y = top + r * (ENV + GAP);
              const unread = unreadByPeer[w.contact.uid] || 0;
              return (
                <button key={w.contact.uid} onClick={() => restoreMini(w.contact.uid)} title={w.contact.characterName || w.contact.name}
                  className={unread > 0 ? 'env-unread-blink' : ''}
                  style={{ position: 'fixed', left: x, top: y, width: ENV, height: ENV, borderRadius: '10px', background: '#fff', border: '1px solid rgba(0,0,0,0.15)', boxShadow: '0 4px 14px rgba(0,0,0,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
                  <Mail size={22} color="#334155" />
                  {unread > 0 && (
                    <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: '50%', background: 'var(--accent-red)', color: '#fff', fontSize: '0.65rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Confirmação de convite de amizade (flutuante) */}
      {pendingFriendReq && (
        <div style={{ position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10001, background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '1rem 1.25rem', boxShadow: '0 12px 40px rgba(0,0,0,0.6)', maxWidth: 'min(340px, 90vw)', pointerEvents: 'auto' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
            <b>{pendingFriendReq.name}</b> quer adicionar você ao contato. Deseja aceitar?
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleAcceptFriendReq} style={{ flex: 1, padding: '0.5rem', background: 'var(--accent-green, #10b981)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Sim</button>
            <button onClick={handleRejectFriendReq} style={{ flex: 1, padding: '0.5rem', background: 'var(--accent-red)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Não</button>
          </div>
        </div>
      )}

      {/* Confirmação de desafio PvP (antes das apostas) */}
      {pvpConfirm && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 200010, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--bg-dark)', border: '1px solid var(--gold-primary)', borderRadius: '16px', padding: '1.5rem', width: 'min(400px, 100%)', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: '2rem' }}>⚔️</div>
            <div style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--text-primary)', margin: '0.5rem 0' }}>
              {pvpConfirm.challenger_name} chamou você para um duelo!
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              {pvpConfirm.question_count} perguntas · Aposta: {pvpConfirm.bet?.challenger?.type === 'coins' ? `${pvpConfirm.bet.challenger.coins} moedas` : pvpConfirm.bet?.challenger?.type === 'item' ? 'item' : 'sem aposta'}
            </div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button
                onClick={async () => {
                  // Aceita de fato (status -> accepted) e abre o modal de apostas sem aceitação dupla
                  const m = uid ? await acceptPvpChallenge(pvpConfirm.id, { type: 'none' }) : null;
                  setPvpIncoming(m || pvpConfirm);
                  setPvpOpen('opponent');
                  setPvpConfirm(null);
                }}
                style={{ flex: 1, padding: '0.7rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                ✔ Aceitar
              </button>
              <button
                onClick={async () => {
                  if (uid) await declinePvpMatch(pvpConfirm.id, uid);
                  setPvpConfirm(null);
                }}
                style={{ flex: 1, padding: '0.7rem', background: 'var(--btn-bg)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                ✖ Recusar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* PvP Duelo */}
      <PvpChallengeModal
        open={pvpOpen !== null}
        mode={pvpOpen}
        userData={userData}
        contact={pvpContact}
        incomingMatch={pvpIncoming}
        onClose={() => { setPvpOpen(null); setPvpContact(null); setPvpIncoming(null); }}
        onStartMatch={(matchId) => { setPvpOpen(null); setPvpContact(null); setPvpIncoming(null); navigate(`/pvp/${matchId}`); }}
      />
    </div>
  );
}

function MiniInput({ contactUid, onSend }: { contactUid: string; onSend: (uid: string, text: string) => boolean | Promise<boolean> }) {
  const [draft, setDraft] = useState('');
  const send = () => {
    if (!draft.trim()) return;
    const res = onSend(contactUid, draft);
    if (res && typeof (res as any).then === 'function') {
      (res as Promise<boolean>).then(ok => { if (ok) setDraft(''); });
    } else if (res) {
      setDraft('');
    }
  };
  return (
    <div style={{ display: 'flex', gap: '0.3rem', padding: '0.4rem', borderTop: '1px solid var(--border-glass)' }}>
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
        placeholder="Responder..."
        style={{ flex: 1, background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', borderRadius: '8px', padding: '0.4rem 0.6rem', fontSize: '0.78rem', outline: 'none' }}
      />
      <button onClick={send} style={{ background: 'var(--gold-primary)', border: 'none', borderRadius: '8px', color: 'var(--text-on-gold, #000)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.3rem 0.5rem' }} title="Enviar">
        <Send size={14} />
      </button>
    </div>
  );
}