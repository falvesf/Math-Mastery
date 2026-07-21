export type ItemCategory = 'attack' | 'defense' | 'support' | 'none';
export type AttributeType = 'attack' | 'defense' | 'xp' | 'coins' | 'vitality' | 'fortitude' | 'persuasion' | 'none';

export interface ItemAdd {
  type: AttributeType;
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

const XP_WEIGHTS = [
  { value: 1, weight: 80 },
  { value: 2, weight: 15 },
  { value: 3, weight: 3 },
  { value: 4, weight: 1.5 },
  { value: 5, weight: 0.5 },
];

const COINS_WEIGHTS = [
  { value: 2, weight: 50 },
  { value: 4, weight: 30 },
  { value: 6, weight: 12 },
  { value: 8, weight: 6 },
  { value: 10, weight: 2 },
];

const VITALITY_FORTITUDE_WEIGHTS = [
  { value: 5, weight: 60 },
  { value: 8, weight: 25 },
  { value: 10, weight: 10 },
  { value: 12, weight: 4 },
  { value: 15, weight: 1 },
];

const PERSUASION_WEIGHTS = [
  { value: 1, weight: 60 },
  { value: 2, weight: 25 },
  { value: 3, weight: 10 },
  { value: 4, weight: 4 },
  { value: 5, weight: 1 },
];

export function rollItemAdds(): ItemAdd[] {
  const adds: ItemAdd[] = [];
  
  // XP Roll (0.25% chance)
  if (Math.random() < 0.0025) adds.push({ type: 'xp', value: rollValue(XP_WEIGHTS) });
  
  // Persuasion Roll (2% chance)
  if (adds.length < 2 && Math.random() < 0.02) adds.push({ type: 'persuasion', value: rollValue(PERSUASION_WEIGHTS) });
  
  // Coins Roll (5% chance)
  if (adds.length < 2 && Math.random() < 0.05) adds.push({ type: 'coins', value: rollValue(COINS_WEIGHTS) });
  
  // Vitality Roll (8% chance)
  if (adds.length < 2 && Math.random() < 0.08) adds.push({ type: 'vitality', value: rollValue(VITALITY_FORTITUDE_WEIGHTS) });
  
  // Fortitude Roll (8% chance)
  if (adds.length < 2 && Math.random() < 0.08) adds.push({ type: 'fortitude', value: rollValue(VITALITY_FORTITUDE_WEIGHTS) });
  
  return adds;
}

export const ATTRIBUTE_LABELS: Record<AttributeType, { label: string, icon: string, color: string }> = {
  attack: { label: 'Poder de Ataque', icon: '⚔️', color: '#EF4444' },
  defense: { label: 'Poder de Defesa', icon: '🛡️', color: '#3B82F6' },
  xp: { label: 'Bônus de XP', icon: '⭐', color: '#FBBF24' },
  coins: { label: 'Bônus de Moedas', icon: '🪙', color: '#FCD34D' },
  vitality: { label: 'Vitalidade', icon: '❤️', color: '#EC4899' },
  fortitude: { label: 'Fortitude', icon: '🎒', color: '#8B5CF6' },
  persuasion: { label: 'Persuasão', icon: '🗣️', color: '#10B981' },
  none: { label: 'Nenhum', icon: '', color: '#9CA3AF' }
};
