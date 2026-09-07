// =====================================================================
// Efeitos de batalha especiais para itens mágicos:
//  - Transformar: transforma o monstro em Sapo, Coelho, Porco ou Rato.
//  - Cura: aura que cura o jogador 0,5 coração por turno (3 turnos).
// =====================================================================

export type TransformAnimal = 'sapo' | 'coelho' | 'porco' | 'rato';

export interface TransformState {
  animal: TransformAnimal;
  /** Turnos restantes da transformação (começa em 3). */
  turnsLeft: number;
  /** Golpes CERTOS seguidos do jogador (usado para o porco enfurecer). */
  consecutiveCorrect: number;
  /** Porco enfurecido (vermelho, dano em dobro, sem drop de moedas). */
  enraged: boolean;
  /** Rato aplicou sangramento no JOGADOR. */
  ratBleeding: boolean;
}

export const TRANSFORM_TURNS = 3;
/** Golpes certos seguidos para o porco enfurecer. */
export const TRANSFORM_ENRAGE_HITS = 2;

export const TRANSFORM_ANIMALS: TransformAnimal[] = ['sapo', 'coelho', 'porco', 'rato'];

export const TRANSFORM_LABELS: Record<TransformAnimal, string> = {
  sapo: 'Sapo',
  coelho: 'Coelho',
  porco: 'Porco',
  rato: 'Rato',
};

export function rollTransformAnimal(): TransformAnimal {
  return TRANSFORM_ANIMALS[Math.floor(Math.random() * TRANSFORM_ANIMALS.length)];
}

/**
 * URL do GLB do animal (pasta pública local). Os arquivos devem estar em
 *   public/models/monster/{sapo,coelho,porco,rato}.glb
 */
export function getTransformModelUrl(animal: TransformAnimal): string {
  // Caminho com barra inicial: o CustomModelViewer prefixa o BASE_URL (/Math-Mastery/)
  return `/models/monster/${animal}.glb`;
}

/** Tempo de resposta efetivo da pergunta (Coelho: -30%). */
export function effectiveTimeLimit(baseSeconds: number, transform?: TransformState | null): number {
  if (transform?.animal === 'coelho') return Math.max(3, Math.round(baseSeconds * 0.7));
  return baseSeconds;
}

/**
 * Dano que o monstro causa ao jogador conforme a transformação:
 *  - Sapo: 0,5 coração SEMPRE (nunca fatal, mesmo em Hardcore).
 *  - Porco enfurecido: 2 corações de uma vez.
 *  - Caso contrário: 1 coração (ou 2 em crítico do monstro) / Hardcore letal.
 */
export function computeMonsterDamageToPlayer(
  currentHearts: number,
  isHardcore: boolean,
  transform?: TransformState | null,
  monsterCrit = false,
): number {
  if (transform?.animal === 'sapo') {
    // Nunca fatal: se o jogador estiver com 0,5 ou menos, não tira mais.
    return currentHearts <= 0.5 ? 0 : 0.5;
  }
  if (transform?.animal === 'porco' && transform.enraged) return 2;
  if (isHardcore) return currentHearts; // Hardcore normal: perde tudo
  return monsterCrit ? 2 : 1;
}

/** O dano do monstro é fatal para o jogador? (Sapo nunca é.) */
export function isMonsterDamageFatal(damage: number, currentHearts: number): boolean {
  return currentHearts - damage <= 0.001;
}

/** Mostra o coração como meios corações na UI do jogador (0.5 = metade cheia). */
export function heartIsHalf(hp: number): boolean {
  return Math.abs(hp - Math.floor(hp) - 0.5) < 0.001;
}

// ---- Aura de cura ----
export const HEAL_AURA_TURNS = 3;
export const HEAL_AURA_PER_TURN = 0.5;
export const HEAL_MAX_ACTIVATIONS = 3;

// ---- Sangramento do jogador (mordida) ----
// Retorna a posição (%) do ferimento no corpo do jogador. Inimigos pequenos
// (rato) só alcançam partes BAIXAS; inimigos maiores podem acertar qualquer parte.
export function rollBleedWound(attacker: 'rato' | 'monstro'): { x: number; y: number } {
  if (attacker === 'rato') {
    // Partes baixas: barriga baixa / pernas / pés (62%–94% da altura)
    return { x: 30 + Math.random() * 40, y: 62 + Math.random() * 32 };
  }
  // Monstro grande: cabeça, tronco, barriga, pernas (10%–94%)
  return { x: 20 + Math.random() * 60, y: 10 + Math.random() * 84 };
}