import { supabase } from './supabase';

/** Sons configuráveis da Forja & Transmutação (config por escola). */
export interface ForgeSoundsConfig {
  forgeMusicUrl?: string;        // música de fundo da guia Forja (loop)
  transmuteMusicUrl?: string;    // música de fundo da guia Transmutação (loop)
  forgeAnvilSoundUrl?: string;   // som do martelo batendo na bigorna (forja)
  transmuteEffectUrl?: string;   // efeito sonoro do ritual de transmutação
  successSoundUrl?: string;      // sucesso (comum à forja e transmutação)
  failSoundUrl?: string;         // falha (comum à forja e transmutação)
}

const COLLECTION = 'settings';
const DOC = 'forge_sounds';

/** Busca a config de sons da forja/transmutação. */
export async function fetchForgeSounds(tenantId?: string | null): Promise<ForgeSoundsConfig> {
  try {
    // 1. Tenta buscar configuração específica da escola atual
    if (tenantId) {
      const { data: tenantData } = await supabase
        .from('system_collections')
        .select('data')
        .eq('collection_name', COLLECTION)
        .eq('doc_id', DOC)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (tenantData?.data && Object.keys(tenantData.data).length > 0) {
        return tenantData.data as ForgeSoundsConfig;
      }
    }

    // 2. Tenta buscar configuração global (tenant_id nulo)
    const { data: globalData } = await supabase
      .from('system_collections')
      .select('data')
      .eq('collection_name', COLLECTION)
      .eq('doc_id', DOC)
      .is('tenant_id', null)
      .maybeSingle();
    if (globalData?.data && Object.keys(globalData.data).length > 0) {
      return globalData.data as ForgeSoundsConfig;
    }

    // 3. Fallback de resiliência: se houver qualquer configuração de sons da forja cadastrada, herda-a
    const { data: anyData } = await supabase
      .from('system_collections')
      .select('data')
      .eq('collection_name', COLLECTION)
      .eq('doc_id', DOC)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (anyData?.data || {}) as ForgeSoundsConfig;
  } catch (e) {
    console.error('Erro ao buscar sons da forja:', e);
    return {};
  }
}

/** Salva a config de sons da forja/transmutação (por escola). */
export async function saveForgeSounds(tenantId: string | null | undefined, config: ForgeSoundsConfig): Promise<boolean> {
  try {
    let q = supabase
      .from('system_collections')
      .select('id')
      .eq('collection_name', COLLECTION)
      .eq('doc_id', DOC);

    if (tenantId) {
      q = q.eq('tenant_id', tenantId);
    } else {
      q = q.is('tenant_id', null);
    }

    const { data: existing } = await q.maybeSingle();
    if (existing?.id) {
      const { error } = await supabase.from('system_collections').update({ data: config }).eq('id', existing.id);
      return !error;
    }
    const { error } = await supabase.from('system_collections').insert({
      collection_name: COLLECTION,
      doc_id: DOC,
      data: config,
      tenant_id: tenantId || null,
    });
    return !error;
  } catch (e) {
    console.error('Erro ao salvar sons da forja:', e);
    return false;
  }
}