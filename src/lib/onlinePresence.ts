import { supabase } from './supabase';

/**
 * Presença online via Supabase Realtime (presence channel).
 * NÃO depende de timers do navegador (que são pausados em abas em background).
 * O cliente conecta no canal e faz .track({ uid }); o Supabase mantém a presença
 * enquanto a conexão está ativa e remove automaticamente quando ela cai.
 */

const CHANNEL = 'online_presence';

export interface PresenceState {
  onlineUids: Set<string>;
  /** uids + metadados (name, role, classId) para exibição */
  onlineUsers: Record<string, { uid: string; name?: string; role?: string; classId?: string }>;
  /** verdadeiro enquanto a conexão ao canal estiver ativa */
  connected: boolean;
}

const listeners = new Set<(state: PresenceState) => void>();

let currentState: PresenceState = {
  onlineUids: new Set<string>(),
  onlineUsers: {},
  connected: false,
};

let channel: any = null;
let trackedUid: string | null = null;

function emit() {
  const snapshot: PresenceState = {
    onlineUids: new Set(currentState.onlineUids),
    onlineUsers: { ...currentState.onlineUsers },
    connected: currentState.connected,
  };
  listeners.forEach(l => l(snapshot));
}

function applyPresence() {
  if (!channel) return;
  const newUids = new Set<string>();
  const newUsers: PresenceState['onlineUsers'] = {};
  // presenceState() retorna um objeto Record<key, Presence[]> — iterar pelos valores
  const states = channel.presenceState() as Record<string, any[]>;
  Object.values(states || {}).forEach((entries: any[]) => {
    (entries || []).forEach((entry: any) => {
      const p = entry.presence || entry;
      if (p.uid) {
        newUids.add(p.uid);
        newUsers[p.uid] = { uid: p.uid, name: p.name, role: p.role, classId: p.classId };
      }
    });
  });
  currentState = { ...currentState, onlineUids: newUids, onlineUsers: newUsers };
  emit();
}

/**
 * Conecta ao presence channel e faz track do meu uid.
 * Idempotente: chamadas repetidas não criam canais duplicados.
 */
export function connectPresence(uid: string, meta?: { name?: string; role?: string; classId?: string }) {
  if (channel) {
    // Atualizar track se o uid mudou
    if (trackedUid !== uid) {
      trackedUid = uid;
      channel.track({ uid, name: meta?.name, role: meta?.role, classId: meta?.classId }).catch(() => {});
    }
    return;
  }

  channel = supabase.channel(CHANNEL, { config: { presence: { key: uid } } });

  channel
    .on('presence', { event: 'sync' }, applyPresence)
    .on('presence', { event: 'join' }, applyPresence)
    .on('presence', { event: 'leave' }, applyPresence)
    .subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        currentState = { ...currentState, connected: true };
        trackedUid = uid;
        await channel.track({ uid, name: meta?.name, role: meta?.role, classId: meta?.classId }).catch(() => {});
        applyPresence();
        emit();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        currentState = { ...currentState, connected: false };
        emit();
      }
    });
}

/** Desconecta (logout) */
export function disconnectPresence() {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
    trackedUid = null;
    currentState = { onlineUids: new Set(), onlineUsers: {}, connected: false };
    emit();
  }
}

/** Inscreve um componente para receber o estado de presença. Retorna unsubscriber. */
export function subscribePresence(cb: (state: PresenceState) => void): () => void {
  listeners.add(cb);
  cb(currentState); // envia estado atual imediatamente
  return () => {
    listeners.delete(cb);
  };
}

/** Estado atual (para leitura síncrona) */
export function getPresenceState(): PresenceState {
  return currentState;
}