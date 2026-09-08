import type { EffectAddType } from './damageEffects';

// =====================================================================
// Golpes de MONSTROS (configurados em Entidades(3D) > Monstros).
// 4 tipos possíveis — somente o corpo a corpo é obrigatório; os outros
// 3 são opcionais e cada um pode (ou não) estar associado a um efeito.
//
// Efeitos que o monstro pode aplicar NO JOGADOR: sangramento, envenenamento,
// fogo, gelo, raio e "cura" (o monstro se cura ao atacar — vampírico).
// =====================================================================

export type MonsterEffectType = EffectAddType | 'heal' | 'none';

export interface MonsterMeleeAttack {
  /** Efeito de dano aplicado no jogador ao acertar (none = sem efeito). */
  effect: MonsterEffectType;
}

export interface MonsterRangedAttack {
  enabled: boolean;
  /** Efeito aplicado no jogador quando o projétil atinge. */
  effect: MonsterEffectType;
  /** Nome/URL do projétil (ex.: bloco .glb). Vazio = usa um projétil padrão. */
  projectile?: string;
}

export interface MonsterSpecialAttack {
  enabled: boolean;
  /** Efeito aplicado no jogador quando o golpe especial acerta. */
  effect: MonsterEffectType;
  /** Nome da animação do GLB para este golpe (ex.: 'jump', 'dance'). Vazio = qualquer. */
  animation?: string;
}

export interface MonsterHealConfig {
  enabled: boolean;
  /** 'potion' | 'magic' | 'vampire' */
  type: 'potion' | 'magic' | 'vampire';
  /** Quantidade de corações/HP que o monstro recupera. */
  amount: number;
  /** Fração de vida (0-1) abaixo da qual o monstro pode tentar se curar. */
  threshold: number;
}

export interface MonsterAttacksConfig {
  melee: MonsterMeleeAttack;
  ranged?: MonsterRangedAttack;
  special?: MonsterSpecialAttack;
  heal?: MonsterHealConfig;
}

export const DEFAULT_MONSTER_ATTACKS: MonsterAttacksConfig = {
  melee: { effect: 'none' },
};

export const MONSTER_EFFECT_OPTIONS: { value: MonsterEffectType; label: string; icon: string }[] = [
  { value: 'none', label: 'Nenhum', icon: '—' },
  { value: 'bleed', label: '🩸 Sangramento', icon: '🩸' },
  { value: 'poison', label: '☠️ Envenenamento', icon: '☠️' },
  { value: 'burn', label: '🔥 Fogo', icon: '🔥' },
  { value: 'freeze', label: '❄️ Gelo', icon: '❄️' },
  { value: 'electric', label: '⚡ Raio', icon: '⚡' },
  { value: 'heal', label: '💚 Cura (vampírico)', icon: '💚' },
];

/** Lê a config de ataques do monstro (pode vir nula/incompleta). */
export function normalizeMonsterAttacks(raw: any): MonsterAttacksConfig {
  if (!raw || typeof raw !== 'object') return JSON.parse(JSON.stringify(DEFAULT_MONSTER_ATTACKS));
  return {
    melee: {
      effect: raw.melee?.effect || 'none',
    },
    ranged: raw.ranged?.enabled
      ? {
          enabled: true,
          effect: raw.ranged.effect || 'none',
          projectile: raw.ranged.projectile || '',
        }
      : { enabled: false, effect: 'none', projectile: '' },
    special: raw.special?.enabled
      ? {
          enabled: true,
          effect: raw.special.effect || 'none',
          animation: raw.special.animation || '',
        }
      : { enabled: false, effect: 'none', animation: '' },
    heal: raw.heal?.enabled
      ? {
          enabled: true,
          type: raw.heal.type || 'magic',
          amount: Math.max(0, Number(raw.heal.amount) || 0),
          threshold: Math.max(0, Math.min(1, Number(raw.heal.threshold) || 0.25)),
        }
      : { enabled: false, type: 'magic', amount: 0, threshold: 0.25 },
  };
}

/** Aplica o efeito do golpe do monstro no jogador (bleed/poison já existem;
 *  burn/freeze/electric são status do jogador; heal = cura o MONSTRO). */
export function applyMonsterAttackEffect(
  effect: MonsterEffectType,
  callbacks: {
    onBleed: () => void;
    onPoison: () => void;
    onBurn: () => void;
    onFreeze: () => void;
    onElectric: () => void;
    onMonsterHeal: () => void;
  },
): void {
  switch (effect) {
    case 'bleed': callbacks.onBleed(); break;
    case 'poison': callbacks.onPoison(); break;
    case 'burn': callbacks.onBurn(); break;
    case 'freeze': callbacks.onFreeze(); break;
    case 'electric': callbacks.onElectric(); break;
    case 'heal': callbacks.onMonsterHeal(); break;
    default: break;
  }
}