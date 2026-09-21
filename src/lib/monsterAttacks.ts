import type { EffectAddType } from './damageEffects';

// =====================================================================
// Golpes de MONSTROS (configurados em Entidades(3D) > Monstros).
// 4 tipos possíveis — somente o corpo a corpo é obrigatório; os outros
// 3 são opcionais e cada um pode (ou não) estar associado a um efeito.
//
// Efeitos possíveis: sangramento, veneno, fogo, gelo, raio,
// estrondo (quebrar), transformar (em animal) e cura/vampírico.
// =====================================================================

export type MonsterEffectType = EffectAddType | 'none';

export type MonsterProjectileType =
  | 'rock'
  | 'tnt'
  | 'arrow'
  | 'fireball'
  | 'iceball'
  | 'thunder'
  | 'poison_flask'
  | 'custom';

export type MonsterSupportType =
  | 'buff_rage'
  | 'buff_speed'
  | 'heal_potion'
  | 'heal_magic'
  | 'vampire';

export type MonsterAiStyle = 'hybrid' | 'ranger' | 'berserker' | 'mage' | 'random';

export interface MonsterMeleeAttack {
  /** Se o golpe corpo a corpo está ativado (default: true). */
  enabled?: boolean;
  /** Nível mínimo do monstro para ativar/desbloquear o golpe (default: 1 = sempre ativo). */
  minLevel?: number;
  /** Nome da animação nativa do GLB usada neste golpe (se existir; vazio = animação padrão). */
  animation?: string;
  /** Efeito de dano aplicado no jogador ao acertar (none = sem efeito). */
  effect: MonsterEffectType;
  /** Se o efeito de status está habilitado para ser aplicado (default: true se effect !== 'none'). */
  effectEnabled?: boolean;
  /** Nível mínimo do monstro para começar a aplicar o efeito de status (default: 1 = sempre ativo). */
  effectMinLevel?: number;
  /** Porcentagem base de acerto do efeito (0 a 100%, default: 100). */
  effectChance?: number;
  /** Bônus de acerto por nível do monstro acima do Nv. 1 (+% por nível, default: 3). */
  effectChancePerLevel?: number;
}

export interface MonsterRangedAttack {
  enabled: boolean;
  /** Nível mínimo do monstro para ativar/desbloquear o golpe (default: 1 = sempre ativo quando habilitado). */
  minLevel?: number;
  /** Nome da animação nativa do GLB usada neste golpe (se existir; vazio = animação padrão). */
  animation?: string;
  /** Efeito aplicado no jogador quando o projétil atinge. */
  effect: MonsterEffectType;
  /** Se o efeito de status está habilitado para ser aplicado (default: true se effect !== 'none'). */
  effectEnabled?: boolean;
  /** Nível mínimo do monstro para começar a aplicar o efeito de status (default: 1 = sempre ativo). */
  effectMinLevel?: number;
  /** Porcentagem base de acerto do efeito (0 a 100%, default: 100). */
  effectChance?: number;
  /** Bônus de acerto por nível do monstro acima do Nv. 1 (+% por nível, default: 3). */
  effectChancePerLevel?: number;
  /** Tipo de projétil pré-definido. */
  projectileType?: MonsterProjectileType;
  /** Nome/URL do projétil customizado (ex.: bloco .glb). */
  projectile?: string;
}

export interface MonsterSpecialAttack {
  enabled: boolean;
  /** Nível mínimo do monstro para ativar/desbloquear o golpe (default: 1 = sempre ativo quando habilitado). */
  minLevel?: number;
  /** Efeito aplicado no jogador quando o golpe especial acerta. */
  effect: MonsterEffectType;
  /** Se o efeito de status está habilitado para ser aplicado (default: true se effect !== 'none'). */
  effectEnabled?: boolean;
  /** Nível mínimo do monstro para começar a aplicar o efeito de status (default: 1 = sempre ativo). */
  effectMinLevel?: number;
  /** Porcentagem base de acerto do efeito (0 a 100%, default: 100). */
  effectChance?: number;
  /** Bônus de acerto por nível do monstro acima do Nv. 1 (+% por nível, default: 3). */
  effectChancePerLevel?: number;
  /** Nome da animação nativa do GLB (se existir). */
  animation?: string;
  /** Tipo de golpe especial procedural universal (se o GLB não tiver animação ou por escolha). */
  proceduralType?: 'jump_slam' | 'spin_tornado' | 'rush_charge' | 'dance_transform' | 'roar_shockwave' | string;
}

export interface MonsterSupportConfig {
  enabled: boolean;
  /** Nível mínimo do monstro para ativar/desbloquear o golpe (default: 1 = sempre ativo quando habilitado). */
  minLevel?: number;
  /** Tipo de suporte (fúria, poção de cura, magia, velocidade, vampírico). */
  type: MonsterSupportType;
  /** Quantidade (HP curado ou corações de bônus de dano de fúria). */
  amount: number;
  /** Fração de vida (0-1) abaixo da qual o monstro tenta usar o suporte. */
  threshold: number;
}

// Mantido alias para compatibilidade com código existente
export type MonsterHealConfig = MonsterSupportConfig;

export interface MonsterAttacksConfig {
  melee: MonsterMeleeAttack;
  ranged?: MonsterRangedAttack;
  special?: MonsterSpecialAttack;
  heal?: MonsterSupportConfig; // Mantém chave heal no banco/JSON para retrocompatibilidade
  support?: MonsterSupportConfig;
  aiStyle?: MonsterAiStyle;
  primaryAttack?: 'melee' | 'ranged';
}

export const DEFAULT_MONSTER_ATTACKS: MonsterAttacksConfig = {
  melee: {
    enabled: true,
    minLevel: 1,
    effect: 'none',
    effectEnabled: true,
    effectMinLevel: 1,
    effectChance: 100,
    effectChancePerLevel: 3,
  },
  aiStyle: 'hybrid',
  primaryAttack: 'melee',
};

export const MONSTER_EFFECT_OPTIONS: { value: MonsterEffectType; label: string; icon: string }[] = [
  { value: 'none', label: 'Nenhum', icon: '—' },
  { value: 'bleed', label: '🩸 Sangramento', icon: '🩸' },
  { value: 'poison', label: '☠️ Envenenamento', icon: '☠️' },
  { value: 'burn', label: '🔥 Fogo (Queimar)', icon: '🔥' },
  { value: 'freeze', label: '❄️ Gelo (Congelar)', icon: '❄️' },
  { value: 'electric', label: '⚡ Raio (Choque)', icon: '⚡' },
  { value: 'impact', label: '💥 Estrondo (Impacto Sísmico)', icon: '💥' },
  { value: 'transform', label: '🐸 Transformar (Metamorfose)', icon: '🐸' },
  { value: 'heal', label: '💚 Cura Vampírica (drena vida)', icon: '💚' },
];

/** Retorna o nome legível com ícone de um efeito de monstro. */
export function getMonsterEffectLabel(effect: MonsterEffectType): string {
  const opt = MONSTER_EFFECT_OPTIONS.find(o => o.value === effect);
  return opt ? opt.label : effect;
}

/** Verifica se o golpe do monstro está habilitado e desbloqueado para o nível atual. */
export function isMonsterAttackUnlocked(
  attack: { enabled?: boolean; minLevel?: number } | undefined,
  monsterLevel: number = 1,
): boolean {
  if (!attack) return false;
  if (attack.enabled === false) return false;
  const req = typeof attack.minLevel === 'number' ? attack.minLevel : 1;
  return monsterLevel >= req;
}

/** Verifica se o efeito de status do golpe está ativo e desbloqueado para o nível atual do monstro. */
export function isMonsterEffectUnlocked(
  attack: { effect?: MonsterEffectType; effectEnabled?: boolean; effectMinLevel?: number } | undefined,
  monsterLevel: number = 1,
): boolean {
  if (!attack || !attack.effect || attack.effect === 'none') return false;
  if (attack.effectEnabled === false) return false;
  const req = typeof attack.effectMinLevel === 'number' ? attack.effectMinLevel : 1;
  return monsterLevel >= req;
}

/** Calcula a chance efetiva de acerto do efeito (%) com base no nível do monstro. */
export function calculateMonsterEffectChance(
  attack: { effect?: MonsterEffectType; effectEnabled?: boolean; effectMinLevel?: number; effectChance?: number; effectChancePerLevel?: number } | undefined,
  monsterLevel: number = 1,
): { effectiveChance: number; baseChance: number; bonusPerLevel: number; isUnlocked: boolean; minLevel: number } {
  const minLevel = typeof attack?.effectMinLevel === 'number' ? attack.effectMinLevel : 1;
  const isUnlocked = isMonsterEffectUnlocked(attack, monsterLevel);
  if (!attack || !attack.effect || attack.effect === 'none') {
    return { effectiveChance: 0, baseChance: 0, bonusPerLevel: 0, isUnlocked: false, minLevel: 1 };
  }
  const baseChance = typeof attack.effectChance === 'number'
    ? Math.max(0, Math.min(100, attack.effectChance))
    : 100;
  const bonusPerLevel = typeof attack.effectChancePerLevel === 'number'
    ? Math.max(0, attack.effectChancePerLevel)
    : 3;
  if (!isUnlocked) {
    return { effectiveChance: 0, baseChance, bonusPerLevel, isUnlocked: false, minLevel };
  }
  const lvl = Math.max(1, monsterLevel);
  const effectiveChance = Math.min(100, Math.max(0, Math.round((baseChance + (lvl - 1) * bonusPerLevel) * 10) / 10));
  return { effectiveChance, baseChance, bonusPerLevel, isUnlocked: true, minLevel };
}

export interface MonsterEffectRollResult {
  effect: MonsterEffectType;
  proc: boolean;
  isUnlocked: boolean;
  minLevel: number;
  baseChance: number;
  bonusPerLevel: number;
  effectiveChance: number;
  roll: number;
}

/** Executa o sorteio para determinar se o efeito de status pega no golpe atual. */
export function rollMonsterEffectProc(
  attack: { effect?: MonsterEffectType; effectEnabled?: boolean; effectMinLevel?: number; effectChance?: number; effectChancePerLevel?: number } | undefined,
  monsterLevel: number = 1,
): MonsterEffectRollResult {
  const { effectiveChance, baseChance, bonusPerLevel, isUnlocked, minLevel } = calculateMonsterEffectChance(attack, monsterLevel);
  if (!attack || !attack.effect || attack.effect === 'none' || !isUnlocked || effectiveChance <= 0) {
    return {
      effect: attack?.effect || 'none',
      proc: false,
      isUnlocked,
      minLevel,
      baseChance,
      bonusPerLevel,
      effectiveChance: 0,
      roll: 100,
    };
  }
  if (effectiveChance >= 100) {
    return {
      effect: attack.effect,
      proc: true,
      isUnlocked: true,
      minLevel,
      baseChance,
      bonusPerLevel,
      effectiveChance: 100,
      roll: 0,
    };
  }
  const roll = Math.random() * 100;
  const proc = roll < effectiveChance;
  return {
    effect: attack.effect,
    proc,
    isUnlocked: true,
    minLevel,
    baseChance,
    bonusPerLevel,
    effectiveChance,
    roll: Math.round(roll * 10) / 10,
  };
}

export const MONSTER_PROJECTILE_OPTIONS: { id: MonsterProjectileType; label: string; icon: string; defaultEffect: MonsterEffectType }[] = [
  { id: 'rock', label: 'Rocha do Golem', icon: '🪨', defaultEffect: 'impact' },
  { id: 'tnt', label: 'Dinamite (TNT)', icon: '🧨', defaultEffect: 'burn' },
  { id: 'arrow', label: 'Flecha de Ranger', icon: '🏹', defaultEffect: 'bleed' },
  { id: 'fireball', label: 'Esfera de Fogo', icon: '🔥', defaultEffect: 'burn' },
  { id: 'iceball', label: 'Orbe de Gelo', icon: '❄️', defaultEffect: 'freeze' },
  { id: 'thunder', label: 'Esfera Elétrica', icon: '⚡', defaultEffect: 'electric' },
  { id: 'poison_flask', label: 'Frasco de Veneno', icon: '☠️', defaultEffect: 'poison' },
  { id: 'custom', label: 'Objeto .GLB Customizado', icon: '📦', defaultEffect: 'none' },
];

export interface MonsterProceduralMove {
  id: string;
  name: string;
  icon: string;
  description: string;
  defaultEffect: MonsterEffectType;
}

export const MONSTER_PROCEDURAL_SPECIALS: MonsterProceduralMove[] = [
  {
    id: 'jump_slam',
    name: 'Pulo Esmagador (Estrondo)',
    icon: '💥',
    description: 'O monstro salta alto no ar e cai esmagando o chão na frente do oponente com tremor sísmico.',
    defaultEffect: 'impact',
  },
  {
    id: 'spin_tornado',
    name: 'Giro Furacão (Redemoinho)',
    icon: '🌪️',
    description: 'O monstro gira 360° em alta rotação com rajada de choque cortante.',
    defaultEffect: 'bleed',
  },
  {
    id: 'rush_charge',
    name: 'Investida Furiosa (Charge)',
    icon: '⚡',
    description: 'O monstro recua e dá uma arrancada rasante com rastro veloz contra o jogador.',
    defaultEffect: 'electric',
  },
  {
    id: 'dance_transform',
    name: 'Dança Encantada (Metamorfose)',
    icon: '🕺',
    description: 'O monstro dança ritmadamente conjurando feitiço misterioso que pode transformar o oponente.',
    defaultEffect: 'transform',
  },
  {
    id: 'roar_shockwave',
    name: 'Rugido e Onda de Choque',
    icon: '📢',
    description: 'O monstro estufa e solta um rugido expansivo que varre a arena.',
    defaultEffect: 'burn',
  },
];

export const MONSTER_SUPPORT_OPTIONS: { id: MonsterSupportType; label: string; icon: string; desc: string }[] = [
  { id: 'buff_rage', label: 'Fúria Monstruosa', icon: '💢', desc: 'Ruge e entra em fúria ao ficar ferido; o próximo golpe causa dano massivo (+1 coração extra)!' },
  { id: 'heal_potion', label: 'Poção de Cura', icon: '🧪', desc: 'Bebe uma poção mágica e recupera vida quando estiver em perigo.' },
  { id: 'heal_magic', label: 'Magia de Cura Divina', icon: '✨', desc: 'Emite brilho sagrado e regenera corações.' },
  { id: 'buff_speed', label: 'Agilidade Relâmpago', icon: '⚡', desc: 'Ganha aura veloz e esquiva ágil.' },
  { id: 'vampire', label: 'Dreno Vampírico', icon: '🧛', desc: 'Ataque sombrio que suga vida do oponente para regenerar o monstro.' },
];

export const MONSTER_AI_STYLES: { id: MonsterAiStyle; label: string; icon: string; desc: string }[] = [
  { id: 'hybrid', label: 'Inteligente / Híbrido', icon: '🧠', desc: 'Alterna com sabedoria entre golpes de perto, à distância e especiais.' },
  { id: 'ranger', label: 'Atirador (Ranger)', icon: '🏹', desc: 'Prefere atacar à distância na maior parte dos turnos.' },
  { id: 'berserker', label: 'Berserker (Agressivo)', icon: '⚔️', desc: 'Prioriza corpo a corpo violento, especiais e ativa fúria imediatamente.' },
  { id: 'mage', label: 'Mago Feiticeiro', icon: '🔮', desc: 'Usa projéteis mágicos, feitiços especiais e cura quando necessário.' },
  { id: 'random', label: 'Aleatório', icon: '🎲', desc: 'Sorteia qualquer um dos golpes ativos com igual chance.' },
];

/** Lê a config de ataques do monstro (pode vir nula/incompleta). */
export function normalizeMonsterAttacks(raw: any): MonsterAttacksConfig {
  if (!raw || typeof raw !== 'object') return JSON.parse(JSON.stringify(DEFAULT_MONSTER_ATTACKS));
  const rawSupport = raw.support || raw.heal;
  return {
    aiStyle: raw.aiStyle || 'hybrid',
    primaryAttack: raw.primaryAttack || 'melee',
    melee: {
      enabled: raw.melee?.enabled !== false,
      minLevel: Math.max(1, Number(raw.melee?.minLevel) || 1),
      animation: (raw.melee?.animation || '').replace(/\\/g, '/'),
      effect: raw.melee?.effect || 'none',
      effectEnabled: raw.melee?.effectEnabled !== false,
      effectMinLevel: Math.max(1, Number(raw.melee?.effectMinLevel) || 1),
      effectChance: typeof raw.melee?.effectChance === 'number' ? Math.max(0, Math.min(100, Number(raw.melee.effectChance))) : 100,
      effectChancePerLevel: typeof raw.melee?.effectChancePerLevel === 'number' ? Math.max(0, Number(raw.melee.effectChancePerLevel)) : 3,
    },
    ranged: {
      enabled: !!raw.ranged?.enabled,
      minLevel: Math.max(1, Number(raw.ranged?.minLevel) || 1),
      animation: (raw.ranged?.animation || '').replace(/\\/g, '/'),
      effect: raw.ranged?.effect || 'none',
      effectEnabled: raw.ranged?.effectEnabled !== false,
      effectMinLevel: Math.max(1, Number(raw.ranged?.effectMinLevel) || 1),
      effectChance: typeof raw.ranged?.effectChance === 'number' ? Math.max(0, Math.min(100, Number(raw.ranged.effectChance))) : 100,
      effectChancePerLevel: typeof raw.ranged?.effectChancePerLevel === 'number' ? Math.max(0, Number(raw.ranged.effectChancePerLevel)) : 3,
      projectileType: raw.ranged?.projectileType || (raw.ranged?.projectile ? 'custom' : 'rock'),
      projectile: (raw.ranged?.projectile || '').replace(/\\/g, '/'),
    },
    special: {
      enabled: !!raw.special?.enabled,
      minLevel: Math.max(1, Number(raw.special?.minLevel) || 1),
      effect: raw.special?.effect || 'none',
      effectEnabled: raw.special?.effectEnabled !== false,
      effectMinLevel: Math.max(1, Number(raw.special?.effectMinLevel) || 1),
      effectChance: typeof raw.special?.effectChance === 'number' ? Math.max(0, Math.min(100, Number(raw.special.effectChance))) : 100,
      effectChancePerLevel: typeof raw.special?.effectChancePerLevel === 'number' ? Math.max(0, Number(raw.special.effectChancePerLevel)) : 3,
      animation: (raw.special?.animation || '').replace(/\\/g, '/'),
      proceduralType: raw.special?.proceduralType || 'jump_slam',
    },
    heal: {
      enabled: !!rawSupport?.enabled,
      minLevel: Math.max(1, Number(rawSupport?.minLevel) || 1),
      type: rawSupport?.type || 'buff_rage',
      amount: Math.max(1, Number(rawSupport?.amount) || 1),
      threshold: Math.max(0.05, Math.min(1, Number(rawSupport?.threshold) || 0.4)),
    },
    support: {
      enabled: !!rawSupport?.enabled,
      minLevel: Math.max(1, Number(rawSupport?.minLevel) || 1),
      type: rawSupport?.type || 'buff_rage',
      amount: Math.max(1, Number(rawSupport?.amount) || 1),
      threshold: Math.max(0.05, Math.min(1, Number(rawSupport?.threshold) || 0.4)),
    },
  };
}

export interface MonsterAttackDecision {
  type: 'melee' | 'ranged' | 'special' | 'support';
  /** O efeito original configurado no golpe */
  effect: MonsterEffectType;
  /** Se o efeito está desbloqueado para o nível atual do monstro */
  isEffectUnlocked?: boolean;
  /** Se o efeito foi aplicado com sucesso após o teste de chance (%) */
  effectProc?: boolean;
  /** Porcentagem calculada de chance de acerto no nível do monstro */
  effectiveChance?: number;
  /** Efeito efetivamente aplicado ('none' se effectProc for false ou se bloqueado) */
  appliedEffect?: MonsterEffectType;
  projectileType?: MonsterProjectileType;
  projectileUrl?: string;
  animation?: string;
  proceduralType?: string;
  supportType?: MonsterSupportType;
  supportAmount?: number;
  isRagedHit?: boolean;
}

/**
 * Inteligência e sorteio tático do próximo golpe do monstro.
 * Avalia vida restante do monstro, fúria ativa, estilo de combate e nível do monstro.
 */
export function decideMonsterAttackAction(
  attacks: MonsterAttacksConfig,
  monsterHpRatio: number, // 0 a 1 (vida atual / vida total do monstro)
  isCurrentlyRaged = false,
  monsterLevel = 1,
): MonsterAttackDecision {
  const cfg = normalizeMonsterAttacks(attacks);
  const sup = cfg.heal || cfg.support;

  const canMelee = isMonsterAttackUnlocked(cfg.melee, monsterLevel);
  const canRanged = isMonsterAttackUnlocked(cfg.ranged, monsterLevel);
  const canSpecial = isMonsterAttackUnlocked(cfg.special, monsterLevel);
  const canSupport = isMonsterAttackUnlocked(sup, monsterLevel);

  const buildDecision = (type: 'melee' | 'ranged' | 'special', isRagedHit = false): MonsterAttackDecision => {
    if (type === 'special' && canSpecial && cfg.special) {
      const roll = rollMonsterEffectProc(cfg.special, monsterLevel);
      return {
        type: 'special',
        effect: cfg.special.effect || 'none',
        isEffectUnlocked: roll.isUnlocked,
        effectProc: roll.proc,
        effectiveChance: roll.effectiveChance,
        appliedEffect: roll.proc ? (cfg.special.effect || 'none') : 'none',
        animation: cfg.special.animation,
        proceduralType: cfg.special.proceduralType || 'jump_slam',
        isRagedHit,
      };
    }
    if (type === 'ranged' && canRanged && cfg.ranged) {
      const roll = rollMonsterEffectProc(cfg.ranged, monsterLevel);
      return {
        type: 'ranged',
        effect: cfg.ranged.effect || 'none',
        isEffectUnlocked: roll.isUnlocked,
        effectProc: roll.proc,
        effectiveChance: roll.effectiveChance,
        appliedEffect: roll.proc ? (cfg.ranged.effect || 'none') : 'none',
        projectileType: cfg.ranged.projectileType || 'rock',
        projectileUrl: cfg.ranged.projectile,
        animation: cfg.ranged.animation,
        isRagedHit,
      };
    }
    if (canMelee && cfg.melee) {
      const roll = rollMonsterEffectProc(cfg.melee, monsterLevel);
      return {
        type: 'melee',
        effect: cfg.melee.effect || 'none',
        isEffectUnlocked: roll.isUnlocked,
        effectProc: roll.proc,
        effectiveChance: roll.effectiveChance,
        appliedEffect: roll.proc ? (cfg.melee.effect || 'none') : 'none',
        animation: cfg.melee.animation,
        isRagedHit,
      };
    }
    // Se o golpe solicitado estiver bloqueado, busca qualquer outro disponível
    if (canRanged && cfg.ranged) {
      return buildDecision('ranged', isRagedHit);
    }
    if (canSpecial && cfg.special) {
      return buildDecision('special', isRagedHit);
    }
    // Fallback absoluto: ataque físico básico desarmado sem efeito
    return {
      type: 'melee',
      effect: 'none',
      effectProc: false,
      effectiveChance: 0,
      appliedEffect: 'none',
      isRagedHit,
    };
  };

  // 1. Suporte: Se desbloqueado, configurado e a vida estiver abaixo do threshold
  if (canSupport && sup && monsterHpRatio <= sup.threshold) {
    const isAlreadyRaged = isCurrentlyRaged && sup.type === 'buff_rage';
    if (!isAlreadyRaged) {
      // Berserker ativa fúria quase garantido (90%); outros estilos têm 55% de chance
      const supportChance = cfg.aiStyle === 'berserker' ? 0.9 : 0.55;
      if (Math.random() < supportChance) {
        return {
          type: 'support',
          effect: 'none',
          effectProc: true,
          effectiveChance: 100,
          appliedEffect: 'none',
          supportType: sup.type,
          supportAmount: sup.amount,
        };
      }
    }
  }

  // Se o monstro já está em fúria, ele desfere seu golpe mais poderoso!
  if (isCurrentlyRaged) {
    if (canSpecial && Math.random() < 0.65) {
      return buildDecision('special', true);
    }
    if (cfg.primaryAttack === 'ranged' && canRanged) {
      return buildDecision('ranged', true);
    }
    if (canMelee) {
      return buildDecision('melee', true);
    }
    if (canRanged) {
      return buildDecision('ranged', true);
    }
    if (canSpecial) {
      return buildDecision('special', true);
    }
    return buildDecision('melee', true);
  }

  // 2. Estilo de Combate da IA
  const style = cfg.aiStyle || 'hybrid';

  if (style === 'ranger') {
    // 75% ranged, 15% special, 10% melee
    const r = Math.random();
    if (canRanged && r < 0.75) {
      return buildDecision('ranged');
    }
    if (canSpecial && r < 0.90) {
      return buildDecision('special');
    }
    return buildDecision('melee');
  }

  if (style === 'berserker') {
    // 45% especial brutal, 40% melee feroz, 15% ranged
    const r = Math.random();
    if (canSpecial && r < 0.45) {
      return buildDecision('special');
    }
    if (canRanged && r < 0.60) {
      return buildDecision('ranged');
    }
    return buildDecision('melee');
  }

  if (style === 'mage') {
    // 55% ranged (feitiço), 35% special (magia), 10% melee
    const r = Math.random();
    if (canRanged && r < 0.55) {
      return buildDecision('ranged');
    }
    if (canSpecial && r < 0.90) {
      return buildDecision('special');
    }
    return buildDecision('melee');
  }

  if (style === 'random') {
    // Sorteia igualmente entre os desbloqueados
    const pool: ('melee' | 'ranged' | 'special')[] = [];
    if (canMelee) pool.push('melee');
    if (canRanged) pool.push('ranged');
    if (canSpecial) pool.push('special');
    if (pool.length === 0) pool.push('melee');
    const picked = pool[Math.floor(Math.random() * pool.length)];
    return buildDecision(picked);
  }

  // Estilo 'hybrid' inteligente: equilibra respeitando primaryAttack
  const isPrimaryRanged = cfg.primaryAttack === 'ranged';
  const r = Math.random();

  if (isPrimaryRanged && canRanged) {
    if (r < 0.55) {
      return buildDecision('ranged');
    }
    if (canSpecial && r < 0.80) {
      return buildDecision('special');
    }
    return buildDecision('melee');
  }

  // Padrão melee primary
  if (r < 0.40 && canSpecial) {
    return buildDecision('special');
  }
  if (r < 0.70 && canRanged) {
    return buildDecision('ranged');
  }
  return buildDecision('melee');
}

/** Aplica o efeito do golpe do monstro no jogador. */
export function applyMonsterAttackEffect(
  effect: MonsterEffectType,
  callbacks: {
    onBleed: () => void;
    onPoison: () => void;
    onBurn: () => void;
    onFreeze: () => void;
    onElectric: () => void;
    onImpact?: () => void;
    onTransform?: () => void;
    onMonsterHeal: () => void;
  },
): void {
  switch (effect) {
    case 'bleed': callbacks.onBleed(); break;
    case 'poison': callbacks.onPoison(); break;
    case 'burn': callbacks.onBurn(); break;
    case 'freeze': callbacks.onFreeze(); break;
    case 'electric': callbacks.onElectric(); break;
    case 'impact': callbacks.onImpact ? callbacks.onImpact() : callbacks.onElectric(); break;
    case 'transform': callbacks.onTransform ? callbacks.onTransform() : callbacks.onPoison(); break;
    case 'heal': callbacks.onMonsterHeal(); break;
    default: break;
  }
}