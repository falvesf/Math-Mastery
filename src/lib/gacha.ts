import { supabase } from './supabase';
import type { EffectAddType } from './damageEffects';
import { forgeAttributeValue } from './forge';

export type ItemCategory = 'attack' | 'defense' | 'support' | 'none';
export type AttributeType = 'attack' | 'defense' | 'xp' | 'coins' | 'vitality' | 'fortitude' | 'persuasion' | 'none';

export interface ItemAdd {
  type: AttributeType | EffectAddType;
  value: number;
}

export function rollValue(weights: { value: number, weight: number }[]): number {
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  let random = Math.random() * totalWeight;
  for (const w of weights) {
    if (random < w.weight) return w.value;
    random -= w.weight;
  }
  return weights[0].value;
}

export interface GachaConfig {
  chances: {
    xp: number;
    persuasion: number;
    coins: number;
    vitality: number;
    fortitude: number;
  };
  weights: {
    xp: { value: number; weight: number }[];
    coins: { value: number; weight: number }[];
    vitality: { value: number; weight: number }[];
    fortitude: { value: number; weight: number }[];
    persuasion: { value: number; weight: number }[];
  };
}

export const DEFAULT_GACHA_CONFIG: GachaConfig = {
  chances: {
    xp: 0.0025,
    persuasion: 0.02,
    coins: 0.05,
    vitality: 0.08,
    fortitude: 0.08
  },
  weights: {
    xp: [
      { value: 1, weight: 80 },
      { value: 2, weight: 15 },
      { value: 3, weight: 3 },
      { value: 4, weight: 1.5 },
      { value: 5, weight: 0.5 },
    ],
    coins: [
      { value: 2, weight: 50 },
      { value: 4, weight: 30 },
      { value: 6, weight: 12 },
      { value: 8, weight: 6 },
      { value: 10, weight: 2 },
    ],
    vitality: [
      { value: 5, weight: 60 },
      { value: 8, weight: 25 },
      { value: 10, weight: 10 },
      { value: 12, weight: 4 },
      { value: 15, weight: 1 },
    ],
    fortitude: [
      { value: 5, weight: 60 },
      { value: 8, weight: 25 },
      { value: 10, weight: 10 },
      { value: 12, weight: 4 },
      { value: 15, weight: 1 },
    ],
    persuasion: [
      { value: 1, weight: 60 },
      { value: 2, weight: 25 },
      { value: 3, weight: 10 },
      { value: 4, weight: 4 },
      { value: 5, weight: 1 },
    ]
  }
};

export async function fetchGlobalGachaConfig(): Promise<GachaConfig> {
  try {
    const { data: snap, error } = await supabase.from('system_collections').select('*').eq('collection_name', 'settings').eq('doc_id', 'gacha').single();
    if (!error && snap) {
      return snap.data as GachaConfig;
    }
  } catch (err) {
    console.error("Error fetching global gacha config:", err);
  }
  return DEFAULT_GACHA_CONFIG;
}

export function rollItemAdds(config?: GachaConfig, fixedAttributes?: ItemAdd[], globalConfig?: GachaConfig, maxAddsLimit?: number): ItemAdd[] {
  if (fixedAttributes && fixedAttributes.length > 0) {
    return [...fixedAttributes].slice(0, 4);
  }

  const cfg = config || globalConfig || DEFAULT_GACHA_CONFIG;
  const adds: ItemAdd[] = [];
  const limit = maxAddsLimit ?? 4;
  
  if (adds.length < limit && Math.random() < cfg.chances.xp) adds.push({ type: 'xp', value: rollValue(cfg.weights.xp) });
  if (adds.length < limit && Math.random() < cfg.chances.persuasion) adds.push({ type: 'persuasion', value: rollValue(cfg.weights.persuasion) });
  if (adds.length < limit && Math.random() < cfg.chances.coins) adds.push({ type: 'coins', value: rollValue(cfg.weights.coins) });
  if (adds.length < limit && Math.random() < cfg.chances.vitality) adds.push({ type: 'vitality', value: rollValue(cfg.weights.vitality) });
  if (adds.length < limit && Math.random() < cfg.chances.fortitude) adds.push({ type: 'fortitude', value: rollValue(cfg.weights.fortitude) });
  
  return adds;
}

export function rollExactAttributes(count: number, existingTypes: AttributeType[] = [], config?: GachaConfig, fixedAttributes?: ItemAdd[], globalConfig?: GachaConfig, maxAddsLimit?: number): ItemAdd[] {
  if (fixedAttributes && fixedAttributes.length > 0) {
    return [...fixedAttributes].slice(0, 4);
  }

  let adds: ItemAdd[] = [];
  let safety = 0;
  const excludedTypes = new Set<AttributeType>(existingTypes);

  while (adds.length < count && adds.length < (maxAddsLimit ?? 4) && safety < 1000) {
    const rolled = rollItemAdds(config, undefined, globalConfig, maxAddsLimit);
    for (const r of rolled) {
      if (adds.length < count && !excludedTypes.has(r.type as AttributeType)) {
        adds.push(r);
        excludedTypes.add(r.type as AttributeType);
      }
    }
    safety++;
  }
  return adds;
}

export const ATTRIBUTE_LABELS: Record<AttributeType, { label: string, icon: string, color: string }> = {
  attack: { label: 'Poder de Ataque', icon: '⚔️', color: '#94A3B8' }, // Slate Gray
  defense: { label: 'Poder de Defesa', icon: '🛡️', color: '#3B82F6' },
  xp: { label: 'Bônus de XP', icon: '⭐', color: '#FBBF24' },
  coins: { label: 'Bônus de Moedas', icon: '🪙', color: '#FCD34D' },
  vitality: { label: 'Vitalidade', icon: '❤️', color: '#F43F5E' },
  fortitude: { label: 'Fortitude', icon: '🎒', color: '#EC4899' }, // Rose/Red
  persuasion: { label: 'Persuasão', icon: '🗣️', color: '#8B5CF6' }, // Purple
  none: { label: 'Nenhum', icon: '', color: '#9CA3AF' }
};

export function calculateTotalStats(equippedItems: any[], distributedStats?: Record<string, number>) {
  const stats = {
    attack: 0,
    defense: 0,
    xp: 0,
    coins: 0,
    vitality: 0,
    fortitude: 0,
    persuasion: 0
  };

  equippedItems.forEach(item => {
    // Força forjada: o item comprado (+0) tem 90% menos do atributo base; forjado +9 atinge 100%.
    const effBase = forgeAttributeValue(item.baseAttributeValue || 0, item.forgeLevel || 0);
    // Base Attributes
    if (item.baseAttributeType === 'attack') stats.attack += effBase;
    if (item.baseAttributeType === 'defense') stats.defense += effBase;

    // Extra Adds
    if (item.adds && Array.isArray(item.adds)) {
      item.adds.forEach((add: ItemAdd) => {
        if (add.type === 'attack') stats.attack += add.value;
        if (add.type === 'defense') stats.defense += add.value;
        if (add.type === 'xp') stats.xp += add.value;
        if (add.type === 'coins') stats.coins += add.value;
        if (add.type === 'vitality') stats.vitality += add.value;
        if (add.type === 'fortitude') stats.fortitude += add.value;
        if (add.type === 'persuasion') stats.persuasion += add.value;
      });
    }
  });

  if (distributedStats) {
    if (distributedStats.attack) stats.attack += distributedStats.attack;
    if (distributedStats.defense) stats.defense += distributedStats.defense;
    if (distributedStats.xp) stats.xp += distributedStats.xp;
    if (distributedStats.coins) stats.coins += distributedStats.coins;
    if (distributedStats.vitality) stats.vitality += distributedStats.vitality;
    if (distributedStats.fortitude) stats.fortitude += distributedStats.fortitude;
    if (distributedStats.persuasion) stats.persuasion += distributedStats.persuasion;
  }

  return stats;
}
