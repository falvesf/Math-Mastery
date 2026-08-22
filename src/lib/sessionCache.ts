/**
 * sessionCache — Cache leve baseado em sessionStorage para reduzir leituras no Firestore.
 * 
 * - Os dados persistem durante toda a sessão do navegador (mesma aba).
 * - Dados expiram automaticamente pelo TTL definido.
 * - Podem ser invalidados manualmente quando o dado mudar no banco.
 * 
 * O onSnapshot do Firestore (AuthContext) ainda atualiza dados críticos em tempo real.
 * Este cache é apenas para dados "frios" que raramente mudam.
 */

const CACHE_PREFIX = 'mm_cache_';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds. 0 = sem expiração
}

export const sessionCache = {
  /**
   * Busca um valor do cache. Retorna null se não existir ou se estiver expirado.
   */
  get<T>(key: string): T | null {
    try {
      const raw = sessionStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (!raw) return null;

      const entry: CacheEntry<T> = JSON.parse(raw);

      if (entry.ttl > 0 && Date.now() - entry.timestamp > entry.ttl) {
        sessionStorage.removeItem(`${CACHE_PREFIX}${key}`);
        return null;
      }

      return entry.data;
    } catch {
      return null;
    }
  },

  /**
   * Grava um valor no cache.
   * @param key - chave única
   * @param data - dado a armazenar (deve ser serializável em JSON)
   * @param ttlMs - tempo de vida em milissegundos. 0 = nunca expira automaticamente.
   */
  set<T>(key: string, data: T, ttlMs: number = 0): void {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: ttlMs
      };
      sessionStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
    } catch {
      // Pode falhar se sessionStorage estiver cheio ou indisponível. Silencioso.
    }
  },

  /**
   * Remove uma entrada específica do cache (invalidação manual).
   */
  invalidate(key: string): void {
    sessionStorage.removeItem(`${CACHE_PREFIX}${key}`);
  },

  /**
   * Remove todas as entradas cujas chaves começam com o prefixo dado.
   * Útil para invalidar tudo relacionado a um usuário de uma vez.
   */
  invalidateByPrefix(prefix: string): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(`${CACHE_PREFIX}${prefix}`)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => sessionStorage.removeItem(k));
  },
};

// ─── TTLs centralizados ────────────────────────────────────────────────────────

export const CACHE_TTL = {
  /** Histórico de XP — 2 min. Invalidado manualmente ao concluir missão. */
  XP_HISTORY: 2 * 60 * 1000,

  /** Missões ativas — 5 min. Raramente mudam durante o uso. */
  QUESTS: 5 * 60 * 1000,

  /** IDs de missões completadas — 2 min. Invalidado ao concluir missão. */
  QUEST_ATTEMPTS: 2 * 60 * 1000,

  /** Itens equipados dos Top 10 para o ranking — 3 min. */
  RANKING_ITEMS: 3 * 60 * 1000,

  /** Skins pré-definidas — 30 min. Só muda quando admin edita. */
  PRESET_SKINS: 30 * 60 * 1000,

  /** Modelos 3D — 30 min. Só muda quando admin edita. */
  MODELS_3D: 30 * 60 * 1000,

  /** Dicas do companheiro — 30 min. Só muda quando superadmin edita. */
  COMPANION_TIPS: 30 * 60 * 1000,
};

// ─── Chaves de cache centralizadas ────────────────────────────────────────────

export const CACHE_KEYS = {
  xpHistory: (uid: string) => `xp_history_${uid}`,
  quests: (classId: string) => `quests_${classId}`,
  questAttempts: (uid: string) => `quest_attempts_${uid}`,
  rankingItems: () => `ranking_items`,
  presetSkins: (tenantId?: string | null) => tenantId ? `preset_skins_${tenantId}` : `preset_skins`,
  models3d: (tenantId?: string | null) => tenantId ? `3d_models_${tenantId}` : `3d_models`,
  companionTips: () => `companion_tips`,
};
