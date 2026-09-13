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

/** Som de explosão de fumaça / balão estourado ("PUFT!") gerado via Web Audio */
export function playTransformPuffSound(kind: 'appear' | 'revert' = 'appear') {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // 1. Pop tonal (estouro de bexiga / desenho animado)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = kind === 'appear' ? 'sine' : 'triangle';
    const startFreq = kind === 'appear' ? 520 : 340;
    const endFreq = kind === 'appear' ? 120 : 80;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.12);
    oscGain.gain.setValueAtTime(0.35, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);

    // 2. Ruído de ar ("FSHHH / PUFT" - nuvem de fumaça expandindo)
    const bufferSize = Math.floor(ctx.sampleRate * 0.22);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(kind === 'appear' ? 1400 : 900, now);
    filter.frequency.exponentialRampToValueAtTime(250, now + 0.2);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);

    setTimeout(() => ctx.close().catch(() => {}), 550);
  } catch (e) {
    /* ignore audio errors */
  }
}

/** Som de beber poção (gole + tilintar mágico) gerado via Web Audio */
export function playPotionDrinkSound() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // 1. Gole / bolha líquida (2 tons borbulhantes)
    [0, 0.12].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const startF = idx === 0 ? 320 : 380;
      const endF = idx === 0 ? 180 : 220;
      osc.frequency.setValueAtTime(startF, now + offset);
      osc.frequency.exponentialRampToValueAtTime(endF, now + offset + 0.09);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.25, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.1);
    });

    // 2. Tilintar mágico ascendente (arpeggio de cura)
    const sparkleNotes = [1046.5, 1318.5, 1567.98, 2093.0]; // C6, E6, G6, C7
    sparkleNotes.forEach((freq, idx) => {
      const start = 0.22 + idx * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0.001, now + start);
      gain.gain.linearRampToValueAtTime(0.18, now + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + 0.3);
    });

    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch (e) {}
}

/** Som majestoso de Elixir (acorde celestial brilhante) gerado via Web Audio */
export function playElixirChimeSound() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // Acorde ressonante divino: D5, F#5, A5, D6, F#6
    const chord = [587.33, 739.99, 880.0, 1174.66, 1479.98, 1760.0];
    chord.forEach((freq, idx) => {
      const delay = idx * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(0.001, now + delay);
      gain.gain.linearRampToValueAtTime(0.16, now + delay + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 1.25);
    });

    setTimeout(() => ctx.close().catch(() => {}), 1600);
  } catch (e) {}
}

/** Som de mastigar alimento (mordidas crocantes e engolir) gerado via Web Audio */
export function playEatFoodSound() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // 2 mordidas ("CHOMP, CHOMP")
    [0, 0.22].forEach((offset) => {
      // Ruído de mordida (crocância)
      const bufferSize = Math.floor(ctx.sampleRate * 0.08);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now + offset);
      filter.Q.setValueAtTime(3, now + offset);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.08);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now + offset);

      // Pop tonal de mastigação
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, now + offset);
      osc.frequency.exponentialRampToValueAtTime(140, now + offset + 0.07);
      oscGain.gain.setValueAtTime(0.3, now + offset);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.08);
    });

    // Engolir suave no final
    setTimeout(() => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const t = ctx.currentTime;
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(110, t + 0.12);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.13);
      } catch(e){}
    }, 450);

    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch (e) {}
}

/** Som de bebericar chá quente gerado via Web Audio */
export function playTeaDrinkSound() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // Sorvo / slurp suave
    const bufferSize = Math.floor(ctx.sampleRate * 0.28);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.linearRampToValueAtTime(2200, now + 0.22);
    filter.Q.setValueAtTime(4, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);

    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch (e) {}
}

/** Som de raio / disparo mágico telecinético gerado via Web Audio */
export function playMagicZapSound() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2400, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.25);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);

    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch (e) {}
}

/** Som de impacto estilhaçador (eliminar opção errada) gerado via Web Audio */
export function playImpactShatterSound() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // Impacto grave
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.18);
    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);

    // Estilhaço agudo
    const bufferSize = Math.floor(ctx.sampleRate * 0.2);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2800, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);

    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch (e) {}
}

/** Toca o efeito sonoro de um consumível com fallback nativo instantâneo */
export function playConsumableSound(soundType: string, customUrl?: string) {
  if (customUrl) {
    playSound(customUrl, 0.85);
    return;
  }

  switch (soundType) {
    case 'potion':
      playPotionDrinkSound();
      break;
    case 'elixir':
      playElixirChimeSound();
      break;
    case 'eat':
      playEatFoodSound();
      break;
    case 'tea_strike':
      playTeaDrinkSound();
      break;
    case 'shield':
    case 'hourglass':
    case 'cleanse':
    default:
      playPotionDrinkSound();
      break;
  }
}