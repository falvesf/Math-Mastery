import { supabase } from './supabase';
import { sessionCache, CACHE_KEYS, CACHE_TTL } from './sessionCache';
import type { Model3D } from '../components/Admin3DModelsManager';

export type Model3DCategory = 'skin' | 'chest' | 'coin' | 'door' | 'scenery' | 'animal' | 'key';

/**
 * Busca os modelos 3D de uma categoria específica (skin/chest/coin/scenery/animal).
 * Usa o cache de models3d e filtra localmente para evitar chamadas extras.
 */
export async function fetchModelsByCategory(
  category: Model3DCategory,
  _tenantId?: string | null
): Promise<Model3D[]> {
  try {
    const cacheKey = CACHE_KEYS.models3d();
    let models = sessionCache.get<Model3D[]>(cacheKey);

    if (!models) {
      // Moldes 3D são COMPARTILHADOS entre as escolas → carrega TODOS (qualquer tenant) + globais.
      const { data, error } = await supabase.from('3d_models').select('*');
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
        coinSoundUrl: m.coin_sound_url || '',
        kind: m.kind || undefined,
        soundUrl: m.sound_url || '',
        lines: m.lines || '',
        renderScale: m.render_scale ?? 1,
        renderHeight: m.render_height ?? 1,
        config: m.config || undefined,
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

function pickActiveModel(items: Model3D[], tenantId?: string | null): Model3D | null {
  if (tenantId) {
    const tenantItem = items.find(m => m.is_active && (m as any).tenant_id === tenantId);
    if (tenantItem) return tenantItem;
  }
  const globalItem = items.find(m => m.is_active && (m._isGlobal || !(m as any).tenant_id));
  if (globalItem) return globalItem;
  const defaultTenantItem = items.find(m => m.is_active && (m as any).tenant_id === '00000000-0000-0000-0000-000000000001');
  if (defaultTenantItem) return defaultTenantItem;
  return items.find(m => m.is_active) || null;
}

/**
 * Busca a moeda ativa (marca is_active) usada nos drops de batalha.
 */
export async function fetchActiveCoin(tenantId?: string | null): Promise<Model3D | null> {
  const coins = await fetchModelsByCategory('coin', tenantId);
  return pickActiveModel(coins, tenantId);
}

/**
 * Busca o baú de recompensa PADRÃO (marca is_active).
 * Usado como fallback quando uma missão não define um baú específico
 * (chestConfig.chestModelId vazio) — substitui o /models/minecraft_chest.glb fixo.
 */
export async function fetchActiveChest(tenantId?: string | null): Promise<Model3D | null> {
  const chests = await fetchModelsByCategory('chest', tenantId);
  return pickActiveModel(chests, tenantId);
}

/** Busca a PORTA de calabouço PADRÃO (marca is_active). */
export async function fetchActiveDoor(tenantId?: string | null): Promise<Model3D | null> {
  const doors = await fetchModelsByCategory('door', tenantId);
  return pickActiveModel(doors, tenantId);
}

/** Busca a CHAVE PADRÃO (marca is_active) para drops de boss e portas. */
export async function fetchActiveKey(tenantId?: string | null): Promise<Model3D | null> {
  const keys = await fetchModelsByCategory('key', tenantId);
  return pickActiveModel(keys, tenantId);
}

/**
 * Busca um modelo por id (usado para o baú selecionado na missão).
 */
export async function fetchModel3DById(id: string, _tenantId?: string | null): Promise<Model3D | null> {
  try {
    const cacheKey = CACHE_KEYS.models3d();
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
      coinSoundUrl: m.coin_sound_url || '',
      kind: m.kind || undefined,
      soundUrl: m.sound_url || '',
      lines: m.lines || '',
      renderScale: m.render_scale ?? 1,
      renderHeight: m.render_height ?? 1,
      config: m.config || undefined,
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

/** Modelos de CENÁRIO (árvores, arbustos, flores, pedras, água, chão). */
export async function fetchSceneryModels(tenantId?: string | null): Promise<Model3D[]> {
  return fetchModelsByCategory('scenery', tenantId);
}

/** Modelos de ANIMAIS (bichinhos com som e falas em balão). */
export async function fetchAnimalModels(tenantId?: string | null): Promise<Model3D[]> {
  return fetchModelsByCategory('animal', tenantId);
}