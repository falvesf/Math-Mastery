// Cálculos centrais do sistema de Forja e Transmutação.

// ============ Força do item por nível de forja ============
// O atributo base (ex: Poder de Ataque 175) é o poder MÁXIMO do item quando forjado a +9.
// No +0 o item tem 90% menos (10% do base); a cada nível ganha 10% do base até 100% no +9.
// Fração do atributo base para cada nível: +0->0.10, +1->0.20, ... +9->1.00
export function forgeStrengthFraction(level: number): number {
  const n = Math.max(0, Math.min(9, Math.floor(level || 0)));
  return 0.1 + 0.1 * n;
}

/** Força real do atributo em um dado nível de forja. */
export function forgeAttributeValue(base: number, level: number): number {
  return Math.round((base || 0) * forgeStrengthFraction(level));
}

/** Força efetiva: usa o valor configurado no painel (se houver) ou o cálculo automático. */
export function forgeAttributeValueWithConfig(base: number, level: number, config: any): number {
  const override = config?.statsPerLevel?.[Math.max(0, Math.min(9, Math.floor(level || 0)))];
  if (typeof override === 'number' && !isNaN(override)) return override;
  return forgeAttributeValue(base, level);
}

// ============ Custo da forja (moedas) ============
// Regra: o item é comprado enfraquecido por `buyPrice`. Para forjar ao próximo nível:
//   custo = (valorAcumuladoAtual / 2) + (grauN * 10% do valorAcumuladoAtual)
// onde valorAcumuladoAtual = buyPrice + custos de todos os níveis anteriores (o "valor" do item atual).
// Simplificando: para ir de (n-1) para n:
//   valorAtual = buyPrice + soma(custos 1..n-1)
//   custo(n)   = round(valorAtual/2 + valorAtual * (n*0.10)) = round(valorAtual * (0.5 + n*0.1))
// Ex: buy=1000: +1: 1000*(0.5+0.1)=600 ... (o exemplo do usuário deu 550 no +1 e 930 no +2; usamos a regra dele exata abaixo)

// NOTE: Seguindo literalmente o exemplo do usuário:
//   +1: 1000/2 + 10% = 500 + 100 = 600 (o usuário disse 550 = metade do valor + 10% do GRAU +1 = 50 → 550).
// Reinterpretação do usuário: "metade do seu valor + 10% do grau +1" => metade de 1000 = 500, +10% de 500? Não.
// "a metade do seu valor + 10% do grau +1, ou seja, neste caso 550" => 500 + 50 = 550 => os 50 = 10% da metade (500*0.10).
// Para +2: "metade de 1550 ... dividido por 2 + 20% do grau +2, ou 775 + 20% = 930" => 775*1.20 = 930 (aqui 20% de 775, não do grau).
// Então a regra real é:
//   valorAtual = buyPrice + soma(custos anteriores)   [para +2: 1000 + 550 = 1550]
//   custo(n)   = round(valorAtual/2 * (1 + n*0.10))   [n = grau]
//   +1: (1000/2)*(1.10) = 500*1.10 = 550 ✓
//   +2: (1550/2)*(1.20) = 775*1.20 = 930 ✓
export const MAX_FORGE_LEVEL = 9;

export function forgeValueAt(level: number, buyPrice: number, cache: Record<number, number> = {}): number {
  let v = buyPrice || 0;
  for (let i = 1; i <= Math.max(0, Math.min(MAX_FORGE_LEVEL, level)); i++) {
    v += forgeCostForLevel(i, buyPrice, cache);
  }
  return v;
}

export function forgeCostForLevel(level: number, buyPrice: number, cache: Record<number, number> = {}): number {
  const n = Math.max(1, Math.min(MAX_FORGE_LEVEL, Math.floor(level || 0)));
  const currentValue = n === 1 ? (buyPrice || 0) : forgeValueAt(n - 1, buyPrice, cache);
  return Math.round((currentValue / 2) * (1 + n * 0.10));
}

/** Custo de forja do item atual (já no nível `level`) até o próximo nível. */
export function nextForgeCost(level: number, buyPrice: number): number {
  return forgeCostForLevel(level + 1, buyPrice);
}

/** Custo efetivo: usa o valor configurado no painel (se houver) ou o cálculo automático. */
export function nextForgeCostWithConfig(level: number, buyPrice: number, config: any): number {
  const n = Math.max(1, Math.min(MAX_FORGE_LEVEL, Math.floor((level || 0) + 1)));
  const override = config?.coinsCostPerLevel?.[n];
  if (typeof override === 'number' && !isNaN(override)) return override;
  return nextForgeCost(level, buyPrice);
}

// ============ Chances de forja (fallback padrão) ============
// Fallback: +1..+9 com chances decrescentes (90% → 10%), aplicado quando o item
// não tem successChancePerLevel configurado no painel.
export const DEFAULT_FORGE_SUCCESS: Record<number, number> = {
  1: 90, 2: 80, 3: 70, 4: 60, 5: 50, 6: 40, 7: 30, 8: 20, 9: 10,
};

export function forgeSuccessChance(level: number, config: any): number {
  const n = Math.max(1, Math.min(MAX_FORGE_LEVEL, Math.floor(level || 0)));
  const perLevel = config?.successChancePerLevel;
  if (perLevel && typeof perLevel[n] === 'number') return perLevel[n];
  return DEFAULT_FORGE_SUCCESS[n] ?? 50;
}

// ============ Fracionamento (mais resistência por nível) ============
// (opcional, para uso futuro)

export function formatForgeLevel(level: number): string {
  const n = Math.max(0, Math.floor(level || 0));
  return n > 0 ? `+${n}` : '+0';
}

/** Nome do item sempre com o nível de forja (ex: "Armadura de couro +1"). */
export function forgeItemName(title: string, level: number): string {
  return `${(title || 'Item').trim()} ${formatForgeLevel(level)}`;
}