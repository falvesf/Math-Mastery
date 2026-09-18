// Efeitos especiais de dano para itens de ataque (definidos na edição de itens).
// Desde a nova regra, o efeito entra como um ADD exclusivo com uma chance (2%-50%)
// sorteada na compra. O pergaminho de aprimoramento altera a chance, mas NUNCA
// remove/troca o efeito (o add é sempre o mesmo).

export type EffectAddType = 'burn' | 'freeze' | 'impact' | 'electric' | 'poison' | 'bleed' | 'transform' | 'heal';

export const DAMAGE_EFFECTS: { id: string; label: string; desc: string }[] = [
  { id: 'none', label: 'Nenhum', desc: 'Dano normal (blocos ficam vermelhos)' },
  { id: 'burn', label: '🔥 Fogo (queima)', desc: 'Add "Queimar": chance de incendiar e derreter o inimigo' },
  { id: 'freeze', label: '❄️ Gelo (congela)', desc: 'Add "Congelar": chance de congelar o inimigo' },
  { id: 'impact', label: '💥 Estrondo (martelo)', desc: 'Add "Quebrar": chance de desmontar o inimigo' },
  { id: 'electric', label: '⚡ Elétrico', desc: 'Add "Eletrocutar": chance de causar choques elétricos' },
  { id: 'poison', label: '☠️ Veneno', desc: 'Add "Envenenar": chance de envenenar e drenar a vida' },
  { id: 'bleed', label: '🩸 Sangramento', desc: 'Add "Perfurar": chance de sangrar o inimigo' },
  { id: 'transform', label: '🐸 Transformar', desc: 'Add "Transformar": chance de transformar o monstro em Sapo, Coelho, Porco ou Rato (3 turnos)' },
  { id: 'heal', label: '💚 Cura', desc: 'Add "Cura": chance de ativar uma aura que cura 0,5 coração por turno (3 turnos)' },
];

// Rótulos/ícones dos ADDS de efeito (exibidos no tooltip igual aos atributos)
export const EFFECT_ADD_LABELS: Record<EffectAddType, { label: string; icon: string; color: string }> = {
  burn: { label: 'Queimar', icon: '🔥', color: '#fb923c' },
  impact: { label: 'Quebrar', icon: '💥', color: '#c4b5fd' },
  poison: { label: 'Envenenar', icon: '☠️', color: '#4ade80' },
  bleed: { label: 'Perfurar', icon: '🩸', color: '#f87171' },
  freeze: { label: 'Congelar', icon: '❄️', color: '#60a5fa' },
  electric: { label: 'Eletrocutar', icon: '⚡', color: '#fbbf24' },
  transform: { label: 'Transformar', icon: '🐸', color: '#a78bfa' },
  heal: { label: 'Cura', icon: '💚', color: '#34d399' },
};

export function isEffectAddType(t?: string): t is EffectAddType {
  return !!t && t in EFFECT_ADD_LABELS;
}

/** Chance do efeito (mínimo a máximo), configurável por arma. */
export function rollEffectChance(min = 1, max = 25): number {
  const safeMin = Math.max(1, Number(min) || 1);
  const safeMax = Math.max(safeMin, Number(max) || 25);
  return safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1));
}

export function getDamageEffectLabel(id?: string): string {
  const e = DAMAGE_EFFECTS.find(x => x.id === (id || 'none'));
  return e ? e.label : 'Nenhum';
}

// Nº de acertos para congelar com o efeito de gelo (1-3 = fica azul/lento; 4 = congela)
export const FREEZE_HITS_TO_FREEZE = 4;

/**
 * Resultado do aprimoramento de efeito via pergaminho.
 */
export interface EnhanceEffectResult {
  newValue: number;
  isSuccess: boolean;
  delta: number;
  oldValue: number;
  min: number;
  max: number;
}

/**
 * Aprimora a força do atributo de efeito de dano especial.
 * - Chance de sucesso: 90% (ganha força aleatoriamente até o máximo da arma).
 * - Chance de falha: 10% (perde força aleatoriamente até o mínimo da arma).
 * - Respeita rigorosamente o range [minChance, maxChance] configurado na arma.
 */
export function enhanceEffectAdd(
  currentValue: number,
  minChance: number = 1,
  maxChance: number = 25
): EnhanceEffectResult {
  const min = Math.max(1, Number(minChance) || 1);
  const max = Math.max(min, Number(maxChance) || 25);
  const oldVal = Math.max(min, Math.min(max, Number(currentValue) || min));

  // 90% de chance de sucesso, 10% de chance de falha
  const isSuccess = Math.random() < 0.90;
  const rangeSpan = Math.max(1, max - min);

  if (isSuccess) {
    const maxGain = rangeSpan <= 10 ? 1 : (rangeSpan <= 25 ? 3 : 5);
    const gain = Math.max(1, Math.floor(Math.random() * maxGain) + 1);
    const newValue = Math.min(max, oldVal + gain);
    const delta = newValue - oldVal;
    return { newValue, isSuccess: true, delta, oldValue: oldVal, min, max };
  } else {
    const maxLoss = rangeSpan <= 10 ? 1 : (rangeSpan <= 25 ? 2 : 4);
    const loss = Math.max(1, Math.floor(Math.random() * maxLoss) + 1);
    const newValue = Math.max(min, oldVal - loss);
    const delta = oldVal - newValue;
    return { newValue, isSuccess: false, delta, oldValue: oldVal, min, max };
  }
}

/** Adiciona o add de efeito (se ainda não existir) aos adds de um item. Retorna os novos adds.
 *  O valor inicial começa no mínimo configurado na arma (ex: 1%), ou rollEffectChance.
 *  O add de efeito fica SEMPRE no TOPO (é o mais importante da essência da arma). */
// @ts-ignore
export function applyEffectAdd(adds: any, damageEffect: string, min?: number, max?: number): any[] {
  if (!damageEffect || damageEffect === 'none') return toAddsArray(adds);
  if (!isEffectAddType(damageEffect)) return toAddsArray(adds);
  const arr = toAddsArray(adds);
  const existing = arr.find((a: any) => a.type === damageEffect);
  if (existing) return orderEffectFirst(arr);

  const safeMin = min !== undefined && min !== null && !isNaN(Number(min)) ? Number(min) : 1;
  const initialValue = Math.max(1, safeMin);
  return [{ type: damageEffect, value: initialValue }, ...arr];
}

/** Garante que os adds de efeito fiquem no topo (ordena os existentes). */
export function orderEffectFirst(adds: any): any[] {
  const arr = toAddsArray(adds);
  return [...arr.filter((a: any) => isEffectAddType(a.type)), ...arr.filter((a: any) => !isEffectAddType(a.type))];
}

/** Converte adds (array ou string JSON) em array. */
export function toAddsArray(adds: any): any[] {
  if (!adds) return [];
  if (Array.isArray(adds)) return adds;
  if (typeof adds === 'string') {
    try { return JSON.parse(adds) || []; } catch (e) { return []; }
  }
  return [];
}

/**
 * Lê a info de efeito da arma equipada a partir do ADD de efeito (a primeira com efeito).
 * Retorna { effect, chance }. Sem add de efeito, cai no campo legado damageEffect com chance 100.
 */
export function getEquippedDamageEffectInfo(equippedItems: any[]): { effect: string; chance: number } {
  const weapons = (equippedItems || []).filter(i =>
    (i.avatarPart === 'hand' || i.avatarPart === 'two_handed' || i.avatarPart === 'rightHand' || i.avatarPart === 'leftHand')
  );
  for (const w of weapons) {
    const effectAdd = (w.adds || []).find((a: any) => isEffectAddType(a.type));
    if (effectAdd) {
      return { effect: effectAdd.type, chance: Math.max(0, Math.min(100, Number(effectAdd.value) || 0)) };
    }
  }
  // Legado: item com damageEffect definido mas sem o add de efeito
  for (const w of weapons) {
    if (w.damageEffect && w.damageEffect !== 'none') return { effect: w.damageEffect, chance: 100 };
  }
  return { effect: 'none', chance: 0 };
}

/** Retorna o efeito (sem chance) da arma equipada — para o render/overlay. */
export function getEquippedDamageEffect(equippedItems: any[]): string {
  return getEquippedDamageEffectInfo(equippedItems).effect;
}
