import { supabase } from './supabase';
import { sessionCache, CACHE_KEYS } from './sessionCache';

export interface AudioBankEntry {
  id: string;
  name: string;
  url: string;
  category?: string; // 'music' | 'effect' | 'voice'
  gender?: string;   // 'male' | 'female' | '' | null
  _isGlobal?: boolean;
}

export const AUDIO_CATEGORIES = [
  { value: 'music', label: '🎵 Música' },
  { value: 'effect', label: '💥 Efeito' },
  { value: 'voice', label: '🗣️ Voz' },
];

export async function fetchAudioBank(tenantId?: string | null): Promise<AudioBankEntry[]> {
  try {
    const cacheKey = CACHE_KEYS.audioBank(tenantId);
    let entries = sessionCache.get<AudioBankEntry[]>(cacheKey);
    if (entries) return entries;
    let query = supabase.from('audio_bank').select('*');
    if (tenantId) {
      query = query.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
    }
    const { data, error } = await query.order('name');
    if (error) {
      console.error('Erro ao buscar banco de áudio:', error);
      return [];
    }
    entries = ((data as any[]) || []).map((m: any) => ({
      id: m.id,
      name: m.name,
      url: m.url,
      category: m.category || 'effect',
      gender: m.gender || '',
      _isGlobal: m.is_global ?? false,
    }));
    sessionCache.set(cacheKey, entries, 60 * 1000);
    return entries;
  } catch (e) {
    console.error('Erro ao buscar banco de áudio:', e);
    return [];
  }
}

/** Guarda referências dos áudios em reprodução para o navegador NÃO coletá-los (GC)
 * antes de tocar — senão sons avulsos (soco, moeda, vitória...) não saem. */
const activeAudios = new Set<HTMLAudioElement>();

/** Toca um som de efeito (one-shot) com volume. */
export function playSound(url?: string | null, volume = 0.8) {
  if (!url) return;
  try {
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume));
    const cleanup = () => {
      activeAudios.delete(audio);
      audio.removeEventListener('ended', cleanup);
      audio.removeEventListener('error', cleanup);
    };
    audio.addEventListener('ended', cleanup);
    audio.addEventListener('error', cleanup);
    activeAudios.add(audio);
    audio.play().catch(() => activeAudios.delete(audio));
  } catch (e) {
    console.error('Erro ao tocar som:', e);
  }
}

/** Cria a URL já com prefixo de base, se relativa. */
export function resolveAudioUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return import.meta.env.BASE_URL + url.replace(/^\//, '');
}