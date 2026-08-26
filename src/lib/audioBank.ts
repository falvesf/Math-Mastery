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

/** Toca um som de efeito (one-shot) com volume. Resolve URLs relativas com o BASE_URL. */
export function playSound(url?: string | null, volume = 0.8) {
  if (!url) return;
  try {
    const audio = new Audio(resolveAudioUrl(url));
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

/** Para gradualmente (fade-out) TODOS os sons em reprodução, incluindo os
 * avulsos longos (ex.: música de vitória) que não passam pelo musicAudioRef. */
export function fadeOutAllSounds(durationMs = 1200) {
  if (activeAudios.size === 0) return;
  activeAudios.forEach(audio => {
    const startVol = audio.volume;
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      audio.volume = Math.max(0, startVol * (1 - t));
      if (t < 1) requestAnimationFrame(step);
      else {
        audio.pause();
        activeAudios.delete(audio);
      }
    };
    requestAnimationFrame(step);
  });
}

/** Blip de moeda gerado via Web Audio (sem depender de arquivo configurado). */
export function playCoinBlip() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const tone = (freq: number, start: number, dur: number, vol = 0.18) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.linearRampToValueAtTime(vol, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    };
    tone(1318.5, 0, 0.12);   // E6
    tone(1760, 0.08, 0.2);   // A6
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch (e) { /* ignore */ }
}

/** Som de coleta de moeda: usa o coinSoundUrl configurado, senão o blip padrão. */
export function playCoinCollect(coinSoundUrl?: string | null) {
  if (coinSoundUrl) {
    playSound(coinSoundUrl, 0.7);
  } else {
    playCoinBlip();
  }
}