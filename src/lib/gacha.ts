import { supabase } from './supabase';
import type { EffectAddType } from './damageEffects';
import { forgeAttributeValueWithConfig } from './forge';

export type ItemCategory = 'attack' | 'defense' | 'support' | 'none';
export type AttributeType = 'attack' | 'defense' | 'xp' | 'coins' | 'vitality' | 'fortitude' | 'persuasion' | 'damage' | 'none';

/** Tipos de item que empilham na mochila (quantidade > 1 na mesma pilha). */
export function isStackableItemType(t?: string): boolean {
  return t === 'consumable' || t === 'other';
}

export interface ItemAdd {
  type: AttributeType | EffectAddType;
  value: number;
  /** Quando true, `value` é a força MÁXIMA do add (alcançada só em +9). Nos níveis
   *  abaixo vale value/(10 - forgeLevel): +0 → 1/10, +1 → 1/9, ... +9 → 1/1 (máximo). */
  maxAtForge9?: boolean;
  /** Modo do atributo dano: 'roll' (sorteado pelo pergaminho e baús entre -25% e +45%) ou 'forge' (escala por nível de forja) */
  damageMode?: 'roll' | 'forge';
  /** Valores inteiros de porcentagem de dano para cada nível de forja de +0 a +9 (índices 0 a 9) */
  damagePerLevel?: number[];
}

/** Força efetiva de um add conforme o nível de forja da arma. */
export function getAddEffectiveValue(add: ItemAdd, forgeLevel = 0): number {
  if (add.type === 'damage') {
    if (add.damageMode === 'forge' && Array.isArray(add.damagePerLevel) && add.damagePerLevel.length > 0) {
      const lvl = Math.max(0, Math.min(9, Math.round(forgeLevel || 0)));
      const val = add.damagePerLevel[lvl];
      return Math.round(typeof val === 'number' ? val : (add.value || 0));
    }
    return Math.round(add.value || 0);
  }
  if (add.maxAtForge9) {
    const divisor = Math.max(1, 10 - (forgeLevel || 0));
    return add.value / divisor;
  }
  return add.value;
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

export function rollItemAdds(
  config?: GachaConfig,
  fixedAttributes?: ItemAdd[],
  globalConfig?: GachaConfig,
  maxAddsLimit?: number,
  options?: { rollDamage?: boolean }
): ItemAdd[] {
  if (fixedAttributes && fixedAttributes.length > 0) {
    return fixedAttributes.slice(0, 4).map(attr => {
      if (attr.type === 'damage') {
        if (attr.damageMode === 'forge') {
          const val = (attr.damagePerLevel && attr.damagePerLevel[0] !== undefined)
            ? Math.round(attr.damagePerLevel[0])
            : Math.round(attr.value || 0);
          return {
            ...attr,
            value: val,
            damagePerLevel: attr.damagePerLevel ? [...attr.damagePerLevel] : undefined
          };
        }
        // Modo roll: se for recompensa de baú/drop de monstro (options?.rollDamage), sorteia entre -25% e +45%
        if (options?.rollDamage) {
          const rolled = Math.floor(Math.random() * (45 - (-25) + 1)) + (-25);
          return { ...attr, value: rolled, damageMode: 'roll' };
        }
        return { ...attr, value: Math.round(attr.value || 0), damageMode: 'roll' };
      }
      return { ...attr };
    });
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
    return fixedAttributes.slice(0, 4).map(a => ({
      ...a,
      damagePerLevel: a.damagePerLevel ? [...a.damagePerLevel] : undefined
    }));
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
  damage: { label: 'Dano', icon: '💥', color: '#F97316' }, // Flame Orange
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
    // Respeita override manual do painel (statsPerLevel) se existir.
    const effBase = forgeAttributeValueWithConfig(item.baseAttributeValue || 0, item.forgeLevel || 0, item.forgeConfig);
    
    let itemAttack = 0;
    if (item.baseAttributeType === 'attack') itemAttack += effBase;

    let itemDefense = 0;
    if (item.baseAttributeType === 'defense') itemDefense += effBase;

    let itemDamagePct = 0;

    // Extra Adds (ou fixedAttributes caso adds ainda não existam no doc)
    const rawAdds: ItemAdd[] = (item.adds && Array.isArray(item.adds) && item.adds.length > 0)
      ? item.adds
      : (item.fixedAttributes && Array.isArray(item.fixedAttributes) ? item.fixedAttributes : []);

    rawAdds.forEach((add: ItemAdd) => {
      const v = getAddEffectiveValue(add, item.forgeLevel || 0);
      if (add.type === 'attack') itemAttack += v;
      else if (add.type === 'defense') itemDefense += v;
      else if (add.type === 'damage') itemDamagePct += v;
      else if (add.type === 'xp') stats.xp += v;
      else if (add.type === 'coins') stats.coins += v;
      else if (add.type === 'vitality') stats.vitality += v;
      else if (add.type === 'fortitude') stats.fortitude += v;
      else if (add.type === 'persuasion') stats.persuasion += v;
    });

    // Se a arma tiver o atributo Dano (porcentagem), aplica diretamente sobre o poder de ataque da arma
    // Exemplo: 5 de ataque com +20% de dano = 6. Com -15% de dano = 4.25 -> 4 (arredondado para baixo como inteiro).
    if (itemDamagePct !== 0 && itemAttack > 0) {
      itemAttack = Math.max(0, Math.floor(itemAttack * (1 + itemDamagePct / 100)));
    }

    stats.attack += itemAttack;
    stats.defense += itemDefense;
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
