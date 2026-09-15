import { supabase } from './supabase';
import { sessionCache, CACHE_KEYS } from './sessionCache';

export interface BlacksmithMilestones {
  firstForge?: {
    itemTitle: string;
    level: number;
    timestamp: number;
    dateStr: string;
    imageUrl?: string;
  };
  firstPlusNine?: {
    itemTitle: string;
    timestamp: number;
    dateStr: string;
    imageUrl?: string;
  };
  firstTransmute?: {
    sourceTitle: string;
    resultTitle: string;
    timestamp: number;
    dateStr: string;
    sourceImageUrl?: string;
    resultImageUrl?: string;
  };
}

const COLLECTION = 'blacksmith_achievements';

/**
 * Busca os marcos históricos do Ferreiro (Primeira Forja, Primeiro +9, Primeira Transmutação)
 */
export async function fetchBlacksmithMilestones(uid: string): Promise<BlacksmithMilestones | null> {
  try {
    const { data } = await supabase
      .from('system_collections')
      .select('data')
      .eq('collection_name', COLLECTION)
      .eq('doc_id', uid)
      .limit(1);
    return (data?.[0]?.data as BlacksmithMilestones) || null;
  } catch (e) {
    console.error('Erro ao buscar conquistas do ferreiro:', e);
    return null;
  }
}

/**
 * Registra o marco da primeira forja com sucesso e/ou primeiro item +9
 */
export async function recordForgeMilestone(
  uid: string,
  event: { itemTitle: string; level: number; imageUrl?: string; timestamp?: number; dateStr?: string }
): Promise<void> {
  try {
    const current = (await fetchBlacksmithMilestones(uid)) || {};
    let updated = false;

    // 1. Primeira forja com sucesso
    if (!current.firstForge) {
      current.firstForge = {
        itemTitle: event.itemTitle,
        level: event.level,
        timestamp: event.timestamp || Date.now(),
        dateStr: event.dateStr || new Date().toISOString(),
        imageUrl: event.imageUrl || '',
      };
      updated = true;
    }

    // 2. Primeiro item +9 na forja
    if (event.level >= 9 && !current.firstPlusNine) {
      current.firstPlusNine = {
        itemTitle: event.itemTitle,
        timestamp: event.timestamp || Date.now(),
        dateStr: event.dateStr || new Date().toISOString(),
        imageUrl: event.imageUrl || '',
      };
      updated = true;
    }

    if (updated) {
      await saveBlacksmithMilestones(uid, current);
      sessionCache.invalidate(CACHE_KEYS.xpHistory(uid));
    }
  } catch (e) {
    console.error('Erro ao registrar marco de forja:', e);
  }
}

/**
 * Registra o marco da primeira transmutação com sucesso (arma X transformada em arma Y)
 */
export async function recordTransmuteMilestone(
  uid: string,
  event: {
    sourceTitle: string;
    resultTitle: string;
    sourceImageUrl?: string;
    resultImageUrl?: string;
    timestamp?: number;
    dateStr?: string;
  }
): Promise<void> {
  try {
    const current = (await fetchBlacksmithMilestones(uid)) || {};
    if (!current.firstTransmute) {
      current.firstTransmute = {
        sourceTitle: event.sourceTitle,
        resultTitle: event.resultTitle,
        timestamp: event.timestamp || Date.now(),
        dateStr: event.dateStr || new Date().toISOString(),
        sourceImageUrl: event.sourceImageUrl || '',
        resultImageUrl: event.resultImageUrl || '',
      };
      await saveBlacksmithMilestones(uid, current);
      sessionCache.invalidate(CACHE_KEYS.xpHistory(uid));
    }
  } catch (e) {
    console.error('Erro ao registrar marco de transmutação:', e);
  }
}

/**
 * Salva os marcos no Supabase (system_collections)
 */
export async function saveBlacksmithMilestones(uid: string, data: BlacksmithMilestones): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('system_collections')
      .select('id')
      .eq('collection_name', COLLECTION)
      .eq('doc_id', uid)
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from('system_collections')
        .update({ data })
        .eq('id', existing[0].id);
    } else {
      await supabase
        .from('system_collections')
        .insert({
          collection_name: COLLECTION,
          doc_id: uid,
          data,
        });
    }
  } catch (e) {
    console.error('Erro ao salvar marcos do ferreiro no banco:', e);
  }
}
