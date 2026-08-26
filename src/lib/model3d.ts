import { supabase } from './supabase';
import { sessionCache, CACHE_KEYS, CACHE_TTL } from './sessionCache';
import type { Model3D } from '../components/Admin3DModelsManager';

/**
 * Busca os modelos 3D de uma categoria específica (skin/chest/coin).
 * Usa o cache de models3d e filtra localmente para evitar chamadas extras.
 */
export async function fetchModelsByCategory(
  category: 'skin' | 'chest' | 'coin',
  tenantId?: string | null
): Promise<Model3D[]> {
  try {
    const cacheKey = CACHE_KEYS.models3d(tenantId);
    let models = sessionCache.get<Model3D[]>(cacheKey);

    if (!models) {
      let query = supabase.from('3d_models').select('*');
      if (tenantId) {
        query = query.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
      }
      const { data, error } = await query;
      if (error) {
        console.error('Erro ao buscar modelos 3D:', error);
        return [];
      }
      models = ((data as any[]) || []).map((m: any) => ({
        ...m,
        category: m.category || 'skin',
        rarity: m.rarity || undefined,
        open_url: m.open_url || undefined,
        slot_count: m.slot_count ?? 4,
        is_active: m.is_active ?? false,
        chestScale: m.chest_scale ?? 1,
        chestZoom: m.chest_zoom ?? 1,
        chestOffsetX: m.chest_offset_x ?? 0,
        chestOffsetY: m.chest_offset_y ?? 0,
        chestRotY: m.chest_rot_y ?? 0,
        chestOpenOffsetX: m.chest_open_offset_x ?? 0,
        chestOpenOffsetY: m.chest_open_offset_y ?? 0,
        chestSwapSides: m.chest_swap_sides ?? false,
        chestAudioUrl: m.chest_audio_url || '',
        chestAudioRate: m.chest_audio_rate ?? 1,
        chestAudioStart: m.chest_audio_start ?? 0,
        chestAudioDuration: m.chest_audio_duration ?? 0,
        _isGlobal: m.is_global ?? false,
      }));
      sessionCache.set(cacheKey, models, CACHE_TTL.MODELS_3D);
    }

    return models.filter(m => (m.category || 'skin') === category);
  } catch (e) {
    console.error('Erro ao buscar modelos por categoria:', e);
    return [];
  }
}

/**
 * Busca a moeda ativa (marca is_active) usada nos drops de batalha.
 */
export async function fetchActiveCoin(tenantId?: string | null): Promise<Model3D | null> {
  const coins = await fetchModelsByCategory('coin', tenantId);
  return coins.find(c => c.is_active) || null;
}

/**
 * Busca o baú de recompensa PADRÃO (marca is_active).
 * Usado como fallback quando uma missão não define um baú específico
 * (chestConfig.chestModelId vazio) — substitui o /models/minecraft_chest.glb fixo.
 */
export async function fetchActiveChest(tenantId?: string | null): Promise<Model3D | null> {
  const chests = await fetchModelsByCategory('chest', tenantId);
  return chests.find(c => c.is_active) || null;
}

/**
 * Busca um modelo por id (usado para o baú selecionado na missão).
 */
export async function fetchModel3DById(id: string, tenantId?: string | null): Promise<Model3D | null> {
  try {
    const cacheKey = CACHE_KEYS.models3d(tenantId);
    let models = sessionCache.get<Model3D[]>(cacheKey);
    if (models) {
      return models.find(m => m.id === id) || null;
    }
    const { data, error } = await supabase.from('3d_models').select('*').eq('id', id).maybeSingle();
    if (error || !data) {
      console.error('Erro ao buscar modelo 3D por id:', error);
      return null;
    }
    const m: any = data;
    return {
      ...m,
      category: m.category || 'skin',
      rarity: m.rarity || undefined,
      open_url: m.open_url || undefined,
      slot_count: m.slot_count ?? 4,
      is_active: m.is_active ?? false,
      chestScale: m.chest_scale ?? 1,
      chestZoom: m.chest_zoom ?? 1,
      chestOffsetX: m.chest_offset_x ?? 0,
      chestOffsetY: m.chest_offset_y ?? 0,
      chestRotY: m.chest_rot_y ?? 0,
      chestOpenOffsetX: m.chest_open_offset_x ?? 0,
      chestOpenOffsetY: m.chest_open_offset_y ?? 0,
      chestSwapSides: m.chest_swap_sides ?? false,
      chestAudioUrl: m.chest_audio_url || '',
      chestAudioRate: m.chest_audio_rate ?? 1,
      chestAudioStart: m.chest_audio_start ?? 0,
      chestAudioDuration: m.chest_audio_duration ?? 0,
      _isGlobal: m.is_global ?? false,
    };
  } catch (e) {
    console.error('Erro ao buscar modelo 3D por id:', e);
    return null;
  }
}

/**
 * Verifica se a URL é uma imagem (png/jpg/webp/gif).
 */
export function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('.png') || lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.webp') || lower.includes('.gif') || lower.startsWith('data:image/');
}