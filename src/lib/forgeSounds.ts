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
    const { data } = await supabase
      .from('system_collections')
      .select('data')
      .eq('collection_name', COLLECTION)
      .eq('doc_id', DOC)
      .maybeSingle();
    return (data?.data || {}) as ForgeSoundsConfig;
  } catch (e) {
    console.error('Erro ao buscar sons da forja:', e);
    return {};
  }
}

/** Salva a config de sons da forja/transmutação (por escola). */
export async function saveForgeSounds(tenantId: string | null, config: ForgeSoundsConfig): Promise<boolean> {
  try {
    const { data: existing } = await supabase
      .from('system_collections')
      .select('id')
      .eq('collection_name', COLLECTION)
      .eq('doc_id', DOC)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase.from('system_collections').update({ data: config }).eq('id', existing.id);
      return !error;
    }
    const { error } = await supabase.from('system_collections').insert({
      collection_name: COLLECTION,
      doc_id: DOC,
      data: config,
      tenant_id: tenantId,
    });
    return !error;
  } catch (e) {
    console.error('Erro ao salvar sons da forja:', e);
    return false;
  }
}