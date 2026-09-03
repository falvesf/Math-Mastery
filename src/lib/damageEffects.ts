// Efeitos especiais de dano para itens de ataque (definidos na edição de itens).
// Desde a nova regra, o efeito entra como um ADD exclusivo com uma chance (2%-50%)
// sorteada na compra. O pergaminho de aprimoramento altera a chance, mas NUNCA
// remove/troca o efeito (o add é sempre o mesmo).

export type EffectAddType = 'burn' | 'freeze' | 'impact' | 'electric' | 'poison' | 'bleed';

export const DAMAGE_EFFECTS: { id: string; label: string; desc: string }[] = [
  { id: 'none', label: 'Nenhum', desc: 'Dano normal (blocos ficam vermelhos)' },
  { id: 'burn', label: '🔥 Fogo (queima)', desc: 'Add "Queimar": chance de incendiar e derreter o inimigo' },
  { id: 'freeze', label: '❄️ Gelo (congela)', desc: 'Add "Congelar": chance de congelar o inimigo' },
  { id: 'impact', label: '💥 Estrondo (martelo)', desc: 'Add "Quebrar": chance de desmontar o inimigo' },
  { id: 'electric', label: '⚡ Elétrico', desc: 'Add "Eletrocutar": chance de causar choques elétricos' },
  { id: 'poison', label: '☠️ Veneno', desc: 'Add "Envenenar": chance de envenenar e drenar a vida' },
  { id: 'bleed', label: '🩸 Sangramento', desc: 'Add "Perfurar": chance de sangrar o inimigo' },
];

// Rótulos/ícones dos ADDS de efeito (exibidos no tooltip igual aos atributos)
export const EFFECT_ADD_LABELS: Record<EffectAddType, { label: string; icon: string; color: string }> = {
  burn: { label: 'Queimar', icon: '🔥', color: '#fb923c' },
  impact: { label: 'Quebrar', icon: '💥', color: '#c4b5fd' },
  poison: { label: 'Envenenar', icon: '☠️', color: '#4ade80' },
  bleed: { label: 'Perfurar', icon: '🩸', color: '#f87171' },
  freeze: { label: 'Congelar', icon: '❄️', color: '#60a5fa' },
  electric: { label: 'Eletrocutar', icon: '⚡', color: '#fbbf24' },
};

export function isEffectAddType(t?: string): t is EffectAddType {
  return !!t && t in EFFECT_ADD_LABELS;
}

/** Chance do efeito (2% a 50%), sorteada na compra. */
export function rollEffectChance(): number {
  return 2 + Math.floor(Math.random() * 49);
}

export function getDamageEffectLabel(id?: string): string {
  const e = DAMAGE_EFFECTS.find(x => x.id === (id || 'none'));
  return e ? e.label : 'Nenhum';
}

// Nº de acertos para congelar com o efeito de gelo
export const FREEZE_HITS_TO_FREEZE = 3;

/** Adiciona o add de efeito (se ainda não existir) aos adds de um item. Retorna os novos adds.
 *  O add de efeito fica SEMPRE no TOPO (é o mais importante da essência da arma). */
export function applyEffectAdd(adds: any, damageEffect: string): any[] {
  if (!damageEffect || damageEffect === 'none') return toAddsArray(adds);
  if (!isEffectAddType(damageEffect)) return toAddsArray(adds);
  const arr = toAddsArray(adds);
  const existing = arr.find((a: any) => a.type === damageEffect);
  if (existing) return orderEffectFirst(arr);
  return [{ type: damageEffect, value: rollEffectChance() }, ...arr];
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