import { supabase } from './supabase';
import { sessionCache } from './sessionCache';

export interface PlayerBattleQuotes {
  /** Chance de falar após responder (em %, de 0 a 100). Padrão: 25 */
  speechChance: number;
  /** Peso para usar fala baseada em estresse da luta vs. HP (em %, de 0 a 100). Padrão: 50 */
  stressModeWeight: number;

  byHp: {
    hp100_80: string[];
    hp79_50: string[];
    hp49_25: string[];
    hp24_0: string[];
  };

  byStress: {
    easy: string[];
    tense: string[];
    epic: string[];
  };

  events: {
    criticalHit: string[];
    hurt: string[];
    victory: string[];
  };
}

export const DEFAULT_PLAYER_BATTLE_QUOTES: PlayerBattleQuotes = {
  speechChance: 25,
  stressModeWeight: 50,
  byHp: {
    hp100_80: [
      'Estou apenas começando!',
      'Você não é páreo para mim!',
      'Vou vencer essa batalha!',
      'Estou com força total!',
      'Minha mente está afiada!',
    ],
    hp79_50: [
      'Ainda tenho muita energia!',
      'Isso não é nada!',
      'Estou no controle!',
      'Vamos lá, mostre o que tem!',
      'Continuo firme!',
    ],
    hp49_25: [
      'Você é um adversário digno, mas eu sou melhor!',
      'Ahhh!!!',
      'Toma essa!',
      'Você não vai me vencer!',
      'Preciso focar na resposta!',
    ],
    hp24_0: [
      'Eu ainda não desisti!',
      'Arghhhhh!!',
      'Eu vou conseguir!',
      'Nada vai me desanimar.',
      'Você é um adversário formidável!',
      'Até o último segundo!',
    ],
  },
  byStress: {
    easy: [
      'Essa foi fácil!',
      'Não deu nem para o começo!',
      'Muito simples!',
      'Próximo!',
      'Sem esforço!',
    ],
    tense: [
      'Deu para suar um pouco!',
      'Foi uma boa luta!',
      'Quase complicou!',
      'Essa foi acirrada!',
      'Boa tentativa!',
    ],
    epic: [
      'Essa foi por pouco!',
      'Não foi fácil, mas venci!',
      'Ufa! Consegui!',
      'Por um triz!',
      'Que luta intensa!',
    ],
  },
  events: {
    criticalHit: [
      'Na mosca!',
      'Golpe crítico!',
      'Em cheio!',
      'Resposta perfeita!',
      'Crítico destruidor!',
    ],
    hurt: [
      'Ai!',
      'Essa doeu!',
      'Vou prestar mais atenção!',
      'Não vai ficar assim!',
      'Preciso me recuperar!',
    ],
    victory: [
      'Vitória merecida!',
      'Mais uma missão concluída!',
      'Incrível! Venci!',
      'Missão cumprida com sucesso!',
    ],
  },
};

const COLLECTION = 'settings';
const DOC_ID = 'player_battle_quotes';

/** Busca as falas do personagem em batalha (por escola ou padrão). */
export async function fetchPlayerBattleQuotes(tenantId?: string | null): Promise<PlayerBattleQuotes> {
  try {
    const cacheKey = `player_battle_quotes_${tenantId || 'global'}`;
    const cached = sessionCache.get<PlayerBattleQuotes>(cacheKey);
    if (cached) return cached;

    let rawData: any = null;
    if (tenantId) {
      const { data: tenantData } = await supabase
        .from('system_collections')
        .select('data')
        .eq('collection_name', COLLECTION)
        .eq('doc_id', DOC_ID)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (tenantData?.data) {
        rawData = tenantData.data;
      }
    }

    if (!rawData) {
      const { data: globalData } = await supabase
        .from('system_collections')
        .select('data')
        .eq('collection_name', COLLECTION)
        .eq('doc_id', DOC_ID)
        .or('is_global.eq.true,tenant_id.is.null')
        .maybeSingle();
      if (globalData?.data) {
        rawData = globalData.data;
      }
    }

    if (rawData) {
      const merged: PlayerBattleQuotes = {
        speechChance: rawData.speechChance ?? DEFAULT_PLAYER_BATTLE_QUOTES.speechChance,
        stressModeWeight: rawData.stressModeWeight ?? DEFAULT_PLAYER_BATTLE_QUOTES.stressModeWeight,
        byHp: {
          hp100_80: rawData.byHp?.hp100_80 || DEFAULT_PLAYER_BATTLE_QUOTES.byHp.hp100_80,
          hp79_50: rawData.byHp?.hp79_50 || DEFAULT_PLAYER_BATTLE_QUOTES.byHp.hp79_50,
          hp49_25: rawData.byHp?.hp49_25 || DEFAULT_PLAYER_BATTLE_QUOTES.byHp.hp49_25,
          hp24_0: rawData.byHp?.hp24_0 || DEFAULT_PLAYER_BATTLE_QUOTES.byHp.hp24_0,
        },
        byStress: {
          easy: rawData.byStress?.easy || DEFAULT_PLAYER_BATTLE_QUOTES.byStress.easy,
          tense: rawData.byStress?.tense || DEFAULT_PLAYER_BATTLE_QUOTES.byStress.tense,
          epic: rawData.byStress?.epic || DEFAULT_PLAYER_BATTLE_QUOTES.byStress.epic,
        },
        events: {
          criticalHit: rawData.events?.criticalHit || DEFAULT_PLAYER_BATTLE_QUOTES.events.criticalHit,
          hurt: rawData.events?.hurt || DEFAULT_PLAYER_BATTLE_QUOTES.events.hurt,
          victory: rawData.events?.victory || DEFAULT_PLAYER_BATTLE_QUOTES.events.victory,
        },
      };
      sessionCache.set(cacheKey, merged, 60 * 1000);
      return merged;
    }

    return DEFAULT_PLAYER_BATTLE_QUOTES;
  } catch (e) {
    console.error('Erro ao buscar falas do personagem em batalha:', e);
    return DEFAULT_PLAYER_BATTLE_QUOTES;
  }
}

/** Salva as falas do personagem em batalha. */
export async function savePlayerBattleQuotes(quotes: PlayerBattleQuotes): Promise<boolean>;
export async function savePlayerBattleQuotes(tenantId: string | null | undefined, quotes: PlayerBattleQuotes): Promise<boolean>;
export async function savePlayerBattleQuotes(
  arg1: string | null | undefined | PlayerBattleQuotes,
  arg2?: PlayerBattleQuotes
): Promise<boolean> {
  let tenantId: string | null | undefined = null;
  let quotes: PlayerBattleQuotes;

  if (typeof arg1 === 'object' && arg1 !== null && 'byHp' in arg1) {
    quotes = arg1 as PlayerBattleQuotes;
    tenantId = null;
  } else {
    tenantId = arg1 as string | null | undefined;
    quotes = arg2 || DEFAULT_PLAYER_BATTLE_QUOTES;
  }
  try {
    let del = supabase.from('system_collections').delete().eq('collection_name', COLLECTION).eq('doc_id', DOC_ID);
    if (tenantId) {
      del = del.eq('tenant_id', tenantId);
    } else {
      del = del.or('is_global.eq.true,tenant_id.is.null');
    }
    await del;

    const { error } = await supabase.from('system_collections').insert({
      collection_name: COLLECTION,
      doc_id: DOC_ID,
      data: quotes,
      tenant_id: tenantId || null,
      is_global: !tenantId,
    });

    if (error) {
      console.error('Erro ao salvar falas do personagem:', error);
      return false;
    }

    sessionCache.invalidate(`player_battle_quotes_${tenantId || 'global'}`);
    return true;
  } catch (e) {
    console.error('Erro ao salvar falas do personagem:', e);
    return false;
  }
}

/** Sorteia uma fala do jogador conforme o contexto da luta. */
export function pickPlayerBattleQuote(
  quotes: PlayerBattleQuotes,
  hpPercentage: number,
  stressLevel: number,
  event?: 'critical' | 'hurt' | 'victory' | null
): string | null {
  if (event === 'critical') {
    const arr = quotes.events?.criticalHit || [];
    return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  }
  if (event === 'victory') {
    const arr = quotes.events?.victory || [];
    return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  }
  if (event === 'hurt') {
    const arr = quotes.events?.hurt || [];
    return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  }

  const chance = quotes.speechChance ?? 25;
  if (Math.random() * 100 > chance) return null;

  const stressWeight = (quotes.stressModeWeight ?? 50) / 100;
  const useStress = Math.random() < stressWeight;

  let pool: string[] = [];

  if (useStress) {
    if (stressLevel >= 0.65) pool = quotes.byStress?.epic || [];
    else if (stressLevel >= 0.35) pool = quotes.byStress?.tense || [];
    else pool = quotes.byStress?.easy || [];
  } else {
    if (hpPercentage >= 80) pool = quotes.byHp?.hp100_80 || [];
    else if (hpPercentage >= 50) pool = quotes.byHp?.hp79_50 || [];
    else if (hpPercentage >= 25) pool = quotes.byHp?.hp49_25 || [];
    else pool = quotes.byHp?.hp24_0 || [];
  }

  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
