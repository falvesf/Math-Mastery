// Anti-spam do chat com penalidades progressivas.
// Regras:
// - 5+ mensagens em menos de 5 segundos = spam.
// - Penalidade de 10s por spam, aumentando +10s a cada spam, até 2 minutos.
// - Acima de 2 minutos acumulados, o chat fica bloqueado por 1 dia.

export interface SpamState {
  count: number;
  penaltyUntil: number;
  blockedUntil: number;
}

export const EMPTY_SPAM: SpamState = { count: 0, penaltyUntil: 0, blockedUntil: 0 };
export const SPAM_WINDOW_MS = 5000;
export const SPAM_THRESHOLD = 5;
export const SPAM_STEP_MS = 10 * 1000;
export const MAX_PENALTY_MS = 120 * 1000;
export const DAY_BLOCK_MS = 24 * 60 * 60 * 1000;
/** count 13+ (penalidade > 2min) → bloqueio de 1 dia */
export const BLOCK_TRIGGER_COUNT = 13;

/** Nível de cor do aviso conforme o tempo acumulado de penalidade (s) */
export function penaltyLevel(count: number): 'yellow' | 'orange' | 'red' {
  const sec = count * (SPAM_STEP_MS / 1000);
  if (sec >= 90) return 'red';
  if (sec >= 60) return 'orange';
  return 'yellow';
}

export function loadSpamState(uid?: string): SpamState {
  try {
    const raw = localStorage.getItem(`chat_spam_state_${uid || 'x'}`);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        count: Number(p.count) || 0,
        penaltyUntil: Number(p.penaltyUntil) || 0,
        blockedUntil: Number(p.blockedUntil) || 0,
      };
    }
  } catch (e) { /* ignore */ }
  return { ...EMPTY_SPAM };
}

export function saveSpamState(uid: string | undefined, s: SpamState) {
  try {
    localStorage.setItem(`chat_spam_state_${uid || 'x'}`, JSON.stringify(s));
  } catch (e) { /* ignore */ }
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}