import { supabase } from './supabase';

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
 * URL pública do GLB do animal. Os arquivos devem ser enviados para o bucket
 * `uploads` com estes nomes exatos:
 *   monsters/transform/sapo.glb
 *   monsters/transform/coelho.glb
 *   monsters/transform/porco.glb
 *   monsters/transform/rato.glb
 */
export function getTransformModelUrl(animal: TransformAnimal): string {
  const { data } = supabase.storage.from('uploads').getPublicUrl(`monsters/transform/${animal}.glb`);
  return data.publicUrl;
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