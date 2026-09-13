/**
 * consumableEffects.ts
 * Sistema modular e extensível de efeitos visuais e sonoros para itens consumíveis.
 * Estilo RPG Maker / JRPG com suporte a presets, cores personalizadas e sons customizáveis.
 */

export type ConsumableAnimPreset = 
  | 'aura_rosy'       // Poção de Cura (Aura mágica rosada)
  | 'aura_gold'       // Elixir da Vida (Aura dourada majestosa com escala ampliada)
  | 'eat_food'        // Comer Carne / Alimento (tirar do bolso, mordidas e migalhas)
  | 'tea_strike'      // Chá Calmante + Raio Eliminador na alternativa da questão
  | 'shield_burst'    // Barreira / Escudo protetor expansivo
  | 'hourglass_spin'  // Ampulheta mágica temporal
  | 'cleanse_cure'    // Purificação / Antídoto de veneno e debuffs
  | 'custom_aura';    // Aura com cor 100% personalizada

export interface ConsumableEffectConfig {
  id: ConsumableAnimPreset;
  name: string;
  category: 'aura' | 'eating' | 'projectile_strike' | 'special';
  defaultColor: string;
  secondaryColor: string;
  glowColor: string;
  soundType: 'potion' | 'elixir' | 'eat' | 'tea_strike' | 'shield' | 'hourglass' | 'cleanse';
  description: string;
  scale?: number;
  durationMs: number;
}

export const CONSUMABLE_EFFECT_PRESETS: Record<ConsumableAnimPreset, ConsumableEffectConfig> = {
  aura_rosy: {
    id: 'aura_rosy',
    name: '🧪 Aura Rosada (Poção de Cura)',
    category: 'aura',
    defaultColor: '#f43f5e',
    secondaryColor: '#fb7185',
    glowColor: '#fda4af',
    soundType: 'potion',
    description: 'Círculos concêntricos e coluna de luz rosada suave, combinando com o líquido da poção.',
    scale: 1.0,
    durationMs: 2000,
  },
  aura_gold: {
    id: 'aura_gold',
    name: '🌟 Elixir Dourado (Cura Total Radiante)',
    category: 'aura',
    defaultColor: '#eab308',
    secondaryColor: '#facc15',
    glowColor: '#fef08a',
    soundType: 'elixir',
    description: 'Aura majestosa em tons dourados brilhantes com escala ampliada e raios celestiais.',
    scale: 1.35,
    durationMs: 2500,
  },
  eat_food: {
    id: 'eat_food',
    name: '🍖 Comer Alimento (Carne / Comida)',
    category: 'eating',
    defaultColor: '#22c55e',
    secondaryColor: '#86efac',
    glowColor: '#bbf7d0',
    soundType: 'eat',
    description: 'Personagem puxa o alimento, mastiga com migalhas saltitando e recupera vida.',
    scale: 1.0,
    durationMs: 1800,
  },
  tea_strike: {
    id: 'tea_strike',
    name: '🍵 Chá Calmante + Raio Eliminador',
    category: 'projectile_strike',
    defaultColor: '#38bdf8',
    secondaryColor: '#2dd4bf',
    glowColor: '#99f6e4',
    soundType: 'tea_strike',
    description: 'Xícara de chá fumegante seguida de um projétil telecinético que estilhaça uma opção incorreta.',
    scale: 1.0,
    durationMs: 2200,
  },
  shield_burst: {
    id: 'shield_burst',
    name: '🛡️ Barreira Protetora (Escudo)',
    category: 'aura',
    defaultColor: '#3b82f6',
    secondaryColor: '#60a5fa',
    glowColor: '#93c5fd',
    soundType: 'shield',
    description: 'Domo de energia expansivo que protege o jogador contra o próximo erro.',
    scale: 1.15,
    durationMs: 2000,
  },
  hourglass_spin: {
    id: 'hourglass_spin',
    name: '⏳ Ampulheta Temporal (+Tempo)',
    category: 'special',
    defaultColor: '#f59e0b',
    secondaryColor: '#fbbf24',
    glowColor: '#fde68a',
    soundType: 'hourglass',
    description: 'Ampulheta dourada giratória com areias mágicas e partículas de tempo.',
    scale: 1.1,
    durationMs: 2000,
  },
  cleanse_cure: {
    id: 'cleanse_cure',
    name: '🧪 Purificação & Cura de Efeitos',
    category: 'aura',
    defaultColor: '#a855f7',
    secondaryColor: '#c084fc',
    glowColor: '#e9d5ff',
    soundType: 'cleanse',
    description: 'Vórtice purificador que dissipa venenos, queimaduras e sangramentos.',
    scale: 1.05,
    durationMs: 1900,
  },
  custom_aura: {
    id: 'custom_aura',
    name: '🔮 Aura Personalizada (Cor Livre)',
    category: 'aura',
    defaultColor: '#8b5cf6',
    secondaryColor: '#a78bfa',
    glowColor: '#c4b5fd',
    soundType: 'potion',
    description: 'Aura mágica totalmente customizável pelo seletor de cores da loja.',
    scale: 1.0,
    durationMs: 2000,
  },
};

export interface ResolvedConsumableEffect {
  presetId: ConsumableAnimPreset;
  category: 'aura' | 'eating' | 'projectile_strike' | 'special';
  primaryColor: string;
  secondaryColor: string;
  glowColor: string;
  soundType: 'potion' | 'elixir' | 'eat' | 'tea_strike' | 'shield' | 'hourglass' | 'cleanse';
  customSoundUrl?: string;
  scale: number;
  durationMs: number;
  itemTitle?: string;
  itemImageUrl?: string;
}

/**
 * Resolve o efeito audiovisual completo do consumível.
 * Prioriza configurações explícitas do item (definidas no AdminStoreManager)
 * e faz fallback inteligente baseado no gameEffect ou nome do item.
 */
export function resolveConsumableEffect(item: {
  gameEffect?: string;
  itemTitle?: string;
  title?: string;
  itemImageUrl?: string;
  imageUrl?: string;
  consumableAnimPreset?: string;
  consumableEffectColor?: string;
  useSoundUrl?: string;
}): ResolvedConsumableEffect {
  const title = (item.itemTitle || item.title || '').toLowerCase();
  const effect = item.gameEffect || '';
  const explicitPreset = item.consumableAnimPreset as ConsumableAnimPreset;

  // 1. Determina o preset base
  let presetId: ConsumableAnimPreset = 'aura_rosy';

  if (explicitPreset && CONSUMABLE_EFFECT_PRESETS[explicitPreset]) {
    presetId = explicitPreset;
  } else if (title.includes('carne') || title.includes('comida') || title.includes('pão') || title.includes('fruta') || title.includes('food')) {
    presetId = 'eat_food';
  } else if (effect === 'restore_hp' || title.includes('elixir')) {
    presetId = 'aura_gold';
  } else if (effect === 'heal_1_hp') {
    presetId = 'aura_rosy';
  } else if (effect === 'remove_wrong' || title.includes('calmante') || title.includes('chá')) {
    presetId = 'tea_strike';
  } else if (effect === 'extra_life' || title.includes('escudo') || title.includes('capa')) {
    presetId = 'shield_burst';
  } else if (effect === 'add_time' || title.includes('ampulheta') || title.includes('universo')) {
    presetId = 'hourglass_spin';
  } else if (effect.startsWith('cure_') || title.includes('antídoto') || title.includes('bandagem') || title.includes('pomada')) {
    presetId = 'cleanse_cure';
  }

  const preset = CONSUMABLE_EFFECT_PRESETS[presetId];

  // 2. Cor personalizada ou cor do preset
  let primaryColor = preset.defaultColor;
  let secondaryColor = preset.secondaryColor;
  let glowColor = preset.glowColor;

  if (item.consumableEffectColor && /^#[0-9A-Fa-f]{6}$/.test(item.consumableEffectColor)) {
    primaryColor = item.consumableEffectColor;
    secondaryColor = lightenColor(item.consumableEffectColor, 20);
    glowColor = lightenColor(item.consumableEffectColor, 40);
  }

  return {
    presetId,
    category: preset.category,
    primaryColor,
    secondaryColor,
    glowColor,
    soundType: preset.soundType,
    customSoundUrl: item.useSoundUrl || undefined,
    scale: preset.scale ?? 1.0,
    durationMs: preset.durationMs,
    itemTitle: item.itemTitle || item.title || '',
    itemImageUrl: item.itemImageUrl || item.imageUrl || '',
  };
}

/** Clareia uma cor hexadecimal */
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
  const B = Math.min(255, (num & 0x0000ff) + amt);
  return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
}
