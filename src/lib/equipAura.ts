// =====================================================================
// Aura de CONJUNTO: aparece quando o jogador usa o SET COMPLETO de
// armadura (cabeça, corpo, pernas e pés) com a MESMA raridade e TODAS as
// peças em +9. A cor da aura é a cor da RARIDADE do conjunto.
// Compartilhado entre AvatarCharacter, rankings e perfil público.
// =====================================================================

export const ARMOR_SET_SLOTS = ['head', 'body', 'legs', 'feet'] as const;

// Cores das raridades (espelha ItemTooltip.RARITY_COLORS)
export const SET_RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#10b981',
  rare: '#3b82f6',
  epic: '#8b5cf6',
  legendary: '#f59e0b',
  mestre: '#ef4444',
};

export interface EquipSetAura {
  active: boolean;
  color: string;
  rarity: string;
  /** Nível de brilho do item mais forte equipado (0-9) — usado para as estrelas. */
  forgeGlow: number;
}

/** Nível de brilho pela forja: 0 (=<6), 1 (+7), 2 (+8), 3 (+9). */
export function forgeGlowTier(level: number): number {
  if (level >= 9) return 3;
  if (level >= 8) return 2;
  if (level >= 7) return 1;
  return 0;
}

export function getEquippedSetAura(equippedItems: any[]): EquipSetAura {
  const items = equippedItems || [];
  const armor = items.filter(i => (ARMOR_SET_SLOTS as readonly string[]).includes(i?.avatarPart));
  const forgeGlow = items.reduce((max, i) => Math.max(max, Number(i?.forgeLevel) || 0), 0);
  const empty: EquipSetAura = { active: false, color: '', rarity: '', forgeGlow };
  if (armor.length < ARMOR_SET_SLOTS.length) return empty;
  if (!ARMOR_SET_SLOTS.every(s => armor.some(i => i.avatarPart === s))) return empty;
  if (!armor.every(i => (Number(i.forgeLevel) || 0) >= 9)) return empty;
  const rarity = armor[0].rarity || 'common';
  if (!armor.every(i => (i.rarity || 'common') === rarity)) return empty;
  return { active: true, color: SET_RARITY_COLORS[rarity] || '#9ca3af', rarity, forgeGlow };
}

/** Converte HEX (#rrggbb) em rgba(r,g,b,alpha). */
export function hexToRgba(hex: string, alpha: number): string {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(156,163,175,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}