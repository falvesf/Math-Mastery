import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, Users, UserPlus, ShieldCheck, Accessibility, Loader2, ArrowLeft, Pin, PinOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import {
  fetchContacts, fetchConversation, sendMessage,
  markRead, addFriend, removeFriend, fetchTotalUnread, fetchPendingSenders, isOnlineTimestamp,
  type ChatContact, type ChatMessage,
} from '../lib/chat';
import { sanitizeMessage } from '../lib/chatFilter';
import { subscribePresence } from '../lib/onlinePresence';

interface ChatWidgetProps {
  onOpenProfile?: (uid: string) => void;
}

const POLL_INTERVAL = 4000;

export default function ChatWidget({ onOpenProfile }: ChatWidgetProps) {
  const { userData } = useAuth();
  const { tenantId } = useTenant();
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
  const messageEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  const uid = userData?.uid;
  const totalUnread = Object.values(unreadByPeer).reduce((a, b) => a + b, 0);

  const uidRef = useRef(uid);
  uidRef.current = uid;
  const activeContactRef = useRef(activeContact);
  activeContactRef.current = activeContact;
  const openConversationRef = useRef<(c: ChatContact) => void>(() => {});
  const seenIdsRef = useRef<Set<string>>(new Set());

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
  // NUNCA força offline: combina presence (se conectado) com last_seen_at recente.
  useEffect(() => {
    if (!uid) return;
    const unsub = subscribePresence(state => {
      setContacts(prev => prev.map(c => ({
        ...c,
        online: (state.connected && state.onlineUids.has(c.uid)) || isOnlineTimestamp(c.last_seen_at),
      })));
    });
    return unsub;
  }, [uid]);

  const loadContacts = useCallback(async () => {
    if (!uidRef.current) return;
    setContactsLoading(true);
    const [list, pending] = await Promise.all([
      fetchContacts(uidRef.current, userData?.classId, tenantId, userData?.role),
      fetchPendingSenders(uidRef.current),
    ]);
    // Mesclar: remetentes pendentes sempre aparecem (mesmo fora da série/amizade)
    const pendingIds = new Set(pending.map(p => p.uid));
    const merged = [...list.filter(c => !pendingIds.has(c.uid)), ...pending];
    setContacts(merged);
    setContactsLoading(false);
  }, [userData?.classId, tenantId, userData?.role]);

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
      setOpen(true);
      openConversation(contact);
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

  const handleSend = async () => {
    if (!uid || !activeContact || !draft.trim()) return;
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
    const ok = await addFriend(uid!, contact.uid);
    if (ok) {
      setContacts(prev => prev.map(c => c.uid === contact.uid ? { ...c, isFriend: true } : c));
      if (activeContact?.uid === contact.uid) setActiveContact({ ...activeContact, isFriend: true });
    }
  };

  const handleRemoveFriend = async (contact: ChatContact) => {
    const ok = await removeFriend(uid!, contact.uid);
    if (ok) {
      setContacts(prev => prev.map(c => c.uid === contact.uid ? { ...c, isFriend: false } : c));
      if (activeContact?.uid === contact.uid) setActiveContact({ ...activeContact, isFriend: false });
    }
  };

  const isStudent = userData?.role === 'student' || !!userData?.studentViewActive;
  const isStudentWithoutClass = isStudent && (!userData?.classId || !userData?.classId.trim());
  const isChatDisabled = isStudentWithoutClass;

  const baseContacts = showFriendsOnly ? contacts.filter(c => c.isFriend) : contacts;
  const onlineList = baseContacts.filter(c => c.online).sort((a, b) => a.name.localeCompare(b.name));
  const offlineList = baseContacts.filter(c => !c.online).sort((a, b) => a.name.localeCompare(b.name));
  const hasAnyOnline = contacts.some(c => c.online);

  const handleOpenWidget = () => {
    if (isChatDisabled) return;
    const next = !open;
    setOpen(next);
    if (next) {
      const withUnread = contacts
        .filter(c => (unreadByPeer[c.uid] || 0) > 0)
        .sort((a, b) => (unreadByPeer[b.uid] || 0) - (unreadByPeer[a.uid] || 0));
      if (withUnread.length > 0 && !activeContact) {
        openConversation(withUnread[0]);
      } else if (!activeContact) {
        setActiveContact(null);
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
    return (
      <div
        key={contact.uid}
        onClick={() => openConversation(contact)}
        className={`chat-contact-row${hasUnread ? ' has-unread' : ''}`}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.6rem',
          borderRadius: '8px', cursor: 'pointer', transition: 'background 0.15s',
          borderBottom: '1px solid var(--border-glass)',
          opacity: contact.online ? 1 : 0.6,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = hasUnread ? 'var(--gold-glow)' : 'rgba(255,255,255,0.06)')}
        onMouseLeave={e => (e.currentTarget.style.background = hasUnread ? 'var(--gold-glow)' : 'transparent')}
      >
        <div style={{ position: 'relative' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--btn-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)' }}>
            <Accessibility size={20} />
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
            borderRadius: '50%', background: contact.online ? 'var(--accent-green)' : 'rgba(100,116,139,0.55)',
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
            {contact.online ? <span style={{ color: 'var(--accent-green)' }}>● Online</span> : <span>○ Offline</span>}
            {contact.isFriend && <span style={{ marginLeft: '0.4rem', color: 'var(--gold-primary)' }}>★ Contato</span>}
            {contact.classId && <span style={{ marginLeft: '0.4rem' }}>· {contact.classId}</span>}
          </div>
        </div>
        {hasUnread && (
          <span style={{
            minWidth: '20px', height: '20px', borderRadius: '50%', background: 'var(--accent-red)',
            color: '#fff', fontSize: '0.7rem', fontWeight: 'bold', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '0 4px'
          }}>
            {contactUnread}
          </span>
        )}
        {!contact.isFriend && (
          <button
            onClick={e => { e.stopPropagation(); handleAddFriend(contact); }}
            style={{ background: 'color-mix(in srgb, var(--accent-green, #10b981) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-green, #10b981) 40%, transparent)', color: 'var(--accent-green, #10b981)', cursor: 'pointer', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
            title="Adicionar aos contatos"
          >
            <UserPlus size={12} /> +Contato
          </button>
        )}
      </div>
    );
  };

  return (
    <div ref={widgetRef} style={{ position: 'fixed', bottom: 0, right: 0, zIndex: 9999, pointerEvents: 'none' }}>
      {/* Botão flutuante com badge */}
      <button
        onClick={handleOpenWidget}
        disabled={isChatDisabled}
        className={getFabClass()}
        style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem',
          width: '56px', height: '56px', borderRadius: '50%',
          border: 'none', cursor: isChatDisabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.25s ease',
          pointerEvents: 'auto', zIndex: 10000
        }}
        title={getFabTitle()}
      >
        {open ? <X size={26} /> : <MessageCircle size={26} />}
        {!open && totalUnread > 0 && !isChatDisabled && (
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
          width: '360px', maxWidth: 'calc(100vw - 1.5rem)', height: '520px', maxHeight: 'calc(100dvh - 7rem)',
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
              {!activeContact && totalUnread > 0 && (
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
            </div>
          </div>

          {activeContact ? (
            /* Conversa aberta */
            <>
              <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{activeContact.characterName || activeContact.name}</strong>
                  <div style={{ fontSize: '0.7rem', color: activeContact.online ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                    {activeContact.online ? '● Online agora' : '○ Offline'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <button onClick={() => onOpenProfile?.(activeContact.uid)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue, #8b5cf6)', cursor: 'pointer', padding: '0.25rem' }} title="Ver histórico">
                    <Accessibility size={16} />
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
                {messages.length === 0 && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', marginTop: '2rem' }}>
                    Nenhuma mensagem ainda. Envie a primeira!
                  </p>
                )}
                {messages.map(msg => {
                  const mine = msg.sender_id === uid;
                  return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
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
    </div>
  );
}