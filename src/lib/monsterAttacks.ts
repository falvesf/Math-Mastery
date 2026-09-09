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
  /** Efeito de dano aplicado no jogador ao acertar (none = sem efeito). */
  effect: MonsterEffectType;
}

export interface MonsterRangedAttack {
  enabled: boolean;
  /** Efeito aplicado no jogador quando o projétil atinge. */
  effect: MonsterEffectType;
  /** Tipo de projétil pré-definido. */
  projectileType?: MonsterProjectileType;
  /** Nome/URL do projétil customizado (ex.: bloco .glb). */
  projectile?: string;
}

export interface MonsterSpecialAttack {
  enabled: boolean;
  /** Efeito aplicado no jogador quando o golpe especial acerta. */
  effect: MonsterEffectType;
  /** Nome da animação nativa do GLB (se existir). */
  animation?: string;
  /** Tipo de golpe especial procedural universal (se o GLB não tiver animação ou por escolha). */
  proceduralType?: 'jump_slam' | 'spin_tornado' | 'rush_charge' | 'dance_transform' | 'roar_shockwave' | string;
}

export interface MonsterSupportConfig {
  enabled: boolean;
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
  melee: { effect: 'none' },
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
      effect: raw.melee?.effect || 'none',
    },
    ranged: raw.ranged?.enabled
      ? {
          enabled: true,
          effect: raw.ranged.effect || 'none',
          projectileType: raw.ranged.projectileType || (raw.ranged.projectile ? 'custom' : 'rock'),
          projectile: (raw.ranged.projectile || '').replace(/\\/g, '/'),
        }
      : { enabled: false, effect: 'none', projectileType: 'rock', projectile: '' },
    special: raw.special?.enabled
      ? {
          enabled: true,
          effect: raw.special.effect || 'none',
          animation: (raw.special.animation || '').replace(/\\/g, '/'),
          proceduralType: raw.special.proceduralType || 'jump_slam',
        }
      : { enabled: false, effect: 'none', animation: '', proceduralType: 'jump_slam' },
    heal: rawSupport?.enabled
      ? {
          enabled: true,
          type: rawSupport.type || 'buff_rage',
          amount: Math.max(1, Number(rawSupport.amount) || 1),
          threshold: Math.max(0.05, Math.min(1, Number(rawSupport.threshold) || 0.4)),
        }
      : { enabled: false, type: 'buff_rage', amount: 1, threshold: 0.4 },
    support: rawSupport?.enabled
      ? {
          enabled: true,
          type: rawSupport.type || 'buff_rage',
          amount: Math.max(1, Number(rawSupport.amount) || 1),
          threshold: Math.max(0.05, Math.min(1, Number(rawSupport.threshold) || 0.4)),
        }
      : { enabled: false, type: 'buff_rage', amount: 1, threshold: 0.4 },
  };
}

export interface MonsterAttackDecision {
  type: 'melee' | 'ranged' | 'special' | 'support';
  effect: MonsterEffectType;
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
 * Avalia vida restante do monstro, fúria ativa e estilo de combate.
 */
export function decideMonsterAttackAction(
  attacks: MonsterAttacksConfig,
  monsterHpRatio: number, // 0 a 1 (vida atual / vida total do monstro)
  isCurrentlyRaged = false,
): MonsterAttackDecision {
  const cfg = normalizeMonsterAttacks(attacks);
  const sup = cfg.heal || cfg.support;

  // 1. Suporte: Se configurado e a vida estiver abaixo do threshold, alta chance de ativar
  // (a menos que já esteja em fúria)
  if (sup?.enabled && monsterHpRatio <= sup.threshold) {
    const isAlreadyRaged = isCurrentlyRaged && sup.type === 'buff_rage';
    if (!isAlreadyRaged) {
      // Berserker ativa fúria quase garantido (90%); outros estilos têm 55% de chance
      const supportChance = cfg.aiStyle === 'berserker' ? 0.9 : 0.55;
      if (Math.random() < supportChance) {
        return {
          type: 'support',
          effect: 'none',
          supportType: sup.type,
          supportAmount: sup.amount,
        };
      }
    }
  }

  // Se o monstro já está em fúria, ele quer desferir seu golpe mais poderoso!
  if (isCurrentlyRaged) {
    if (cfg.special?.enabled && Math.random() < 0.65) {
      return {
        type: 'special',
        effect: cfg.special.effect || 'none',
        animation: cfg.special.animation,
        proceduralType: cfg.special.proceduralType || 'jump_slam',
        isRagedHit: true,
      };
    }
    if (cfg.primaryAttack === 'ranged' && cfg.ranged?.enabled) {
      return {
        type: 'ranged',
        effect: cfg.ranged.effect || 'none',
        projectileType: cfg.ranged.projectileType || 'rock',
        projectileUrl: cfg.ranged.projectile,
        isRagedHit: true,
      };
    }
    return {
      type: 'melee',
      effect: cfg.melee.effect || 'none',
      isRagedHit: true,
    };
  }

  // 2. Estilo de Combate da IA
  const style = cfg.aiStyle || 'hybrid';
  const hasRanged = !!cfg.ranged?.enabled;
  const hasSpecial = !!cfg.special?.enabled;

  if (style === 'ranger') {
    // 75% ranged, 15% special, 10% melee
    const r = Math.random();
    if (hasRanged && r < 0.75) {
      return {
        type: 'ranged',
        effect: cfg.ranged!.effect || 'none',
        projectileType: cfg.ranged!.projectileType || 'rock',
        projectileUrl: cfg.ranged!.projectile,
      };
    }
    if (hasSpecial && r < 0.90) {
      return {
        type: 'special',
        effect: cfg.special!.effect || 'none',
        animation: cfg.special!.animation,
        proceduralType: cfg.special!.proceduralType || 'jump_slam',
      };
    }
    return { type: 'melee', effect: cfg.melee.effect || 'none' };
  }

  if (style === 'berserker') {
    // 45% especial brutal, 40% melee feroz, 15% ranged
    const r = Math.random();
    if (hasSpecial && r < 0.45) {
      return {
        type: 'special',
        effect: cfg.special!.effect || 'none',
        animation: cfg.special!.animation,
        proceduralType: cfg.special!.proceduralType || 'jump_slam',
      };
    }
    if (hasRanged && r < 0.60) {
      return {
        type: 'ranged',
        effect: cfg.ranged!.effect || 'none',
        projectileType: cfg.ranged!.projectileType || 'rock',
        projectileUrl: cfg.ranged!.projectile,
      };
    }
    return { type: 'melee', effect: cfg.melee.effect || 'none' };
  }

  if (style === 'mage') {
    // 55% ranged (feitiço), 35% special (magia), 10% melee
    const r = Math.random();
    if (hasRanged && r < 0.55) {
      return {
        type: 'ranged',
        effect: cfg.ranged!.effect || 'none',
        projectileType: cfg.ranged!.projectileType || 'fireball',
        projectileUrl: cfg.ranged!.projectile,
      };
    }
    if (hasSpecial && r < 0.90) {
      return {
        type: 'special',
        effect: cfg.special!.effect || 'none',
        animation: cfg.special!.animation,
        proceduralType: cfg.special!.proceduralType || 'dance_transform',
      };
    }
    return { type: 'melee', effect: cfg.melee.effect || 'none' };
  }

  if (style === 'random') {
    // Sorteia igualmente entre os habilitados
    const pool: ('melee' | 'ranged' | 'special')[] = ['melee'];
    if (hasRanged) pool.push('ranged');
    if (hasSpecial) pool.push('special');
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (picked === 'ranged') {
      return {
        type: 'ranged',
        effect: cfg.ranged!.effect || 'none',
        projectileType: cfg.ranged!.projectileType || 'rock',
        projectileUrl: cfg.ranged!.projectile,
      };
    }
    if (picked === 'special') {
      return {
        type: 'special',
        effect: cfg.special!.effect || 'none',
        animation: cfg.special!.animation,
        proceduralType: cfg.special!.proceduralType || 'jump_slam',
      };
    }
    return { type: 'melee', effect: cfg.melee.effect || 'none' };
  }

  // Estilo 'hybrid' inteligente: equilibra respeitando primaryAttack
  const isPrimaryRanged = cfg.primaryAttack === 'ranged';
  const r = Math.random();

  if (isPrimaryRanged && hasRanged) {
    if (r < 0.55) {
      return {
        type: 'ranged',
        effect: cfg.ranged!.effect || 'none',
        projectileType: cfg.ranged!.projectileType || 'rock',
        projectileUrl: cfg.ranged!.projectile,
      };
    }
    if (hasSpecial && r < 0.80) {
      return {
        type: 'special',
        effect: cfg.special!.effect || 'none',
        animation: cfg.special!.animation,
        proceduralType: cfg.special!.proceduralType || 'jump_slam',
      };
    }
    return { type: 'melee', effect: cfg.melee.effect || 'none' };
  }

  // Padrão melee primary
  if (r < 0.40 && hasSpecial) {
    return {
      type: 'special',
      effect: cfg.special!.effect || 'none',
      animation: cfg.special!.animation,
      proceduralType: cfg.special!.proceduralType || 'jump_slam',
    };
  }
  if (r < 0.70 && hasRanged) {
    return {
      type: 'ranged',
      effect: cfg.ranged!.effect || 'none',
      projectileType: cfg.ranged!.projectileType || 'rock',
      projectileUrl: cfg.ranged!.projectile,
    };
  }
  return { type: 'melee', effect: cfg.melee.effect || 'none' };
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