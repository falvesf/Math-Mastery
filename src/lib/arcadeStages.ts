// @ts-ignore
import * as THREE from 'skinview3d/node_modules/three';

export type ArcadeStageId =
  | 'stage1_streets'
  | 'stage2_subway'
  | 'bonus_car'
  | 'stage3_westside'
  | 'stage4_industrial'
  | 'bonus_glass'
  | 'stage5_bay'
  | 'plains'
  | 'nether'
  | 'desert'
  | 'snow'
  | 'end';

export interface StageOrderItem {
  id: ArcadeStageId;
  label: string;
  length: number;
  bossHpMultiplier: number;
  bossDisplayName: string;
  isBonus?: boolean;
  bonusKind?: 'car' | 'glass';
}

export const CAMPAIGN_ORDER: StageOrderItem[] = [
  { id: 'stage1_streets', label: '🌆 Estágio 1: Slum, Galpão, Ferro-Velho & Dande', length: 472, bossHpMultiplier: 7, bossDisplayName: 'Dande' },
  { id: 'stage2_subway', label: '🚇 Estágio 2: Estação, Metrô, Galeria & Ringue (Sodom)', length: 562, bossHpMultiplier: 10, bossDisplayName: 'Sodom' },
  { id: 'bonus_car', label: '🚗 Bônus 1: Posto de Gasolina — Destrua o Carro!', length: 24, bossHpMultiplier: 1, bossDisplayName: 'Carro Sedan', isBonus: true, bonusKind: 'car' },
  { id: 'stage3_westside', label: '🎪 Estágio 3: Restaurante, Arena dos Andores & Festival (Eddie)', length: 554, bossHpMultiplier: 13, bossDisplayName: 'Eddie' },
  { id: 'stage4_industrial', label: '🏭 Estágio 4: Indústria, Elevador & Rolento', length: 300, bossHpMultiplier: 16, bossDisplayName: 'Rolento' },
  { id: 'bonus_glass', label: '🪟 Bônus 2: Quebre as Vidraças!', length: 46, bossHpMultiplier: 1, bossDisplayName: 'Vidraças', isBonus: true, bonusKind: 'glass' },
  { id: 'stage5_bay', label: '⚓ Estágio 5: Bay Area & Chefe Final', length: 360, bossHpMultiplier: 20, bossDisplayName: 'Belger' },
  { id: 'plains', label: '🌿 Bioma: Planícies', length: 160, bossHpMultiplier: 7, bossDisplayName: 'Guardião das Planícies' },
  { id: 'nether', label: '🔥 Bioma: Nether', length: 160, bossHpMultiplier: 10, bossDisplayName: 'Senhor do Nether' },
  { id: 'desert', label: '🏜️ Bioma: Deserto', length: 160, bossHpMultiplier: 8, bossDisplayName: 'Faraó de Areia' },
  { id: 'snow', label: '❄️ Bioma: Neve', length: 160, bossHpMultiplier: 10, bossDisplayName: 'Titã Glacial' },
  { id: 'end', label: '🌌 Bioma: The End', length: 160, bossHpMultiplier: 15, bossDisplayName: 'Lorde do Fim' },
];

export interface StageZoneDef {
  minX: number;
  maxX: number;
  startX: number;
  preBossX?: number;
}

export interface StagePortalDef {
  zoneIdx: number;
  triggerX: number;
  autoOnWaveIdx?: number;
  destZoneIdx: number;
  destX: number;
  banner: string;
}

export function getStageMeta(id: ArcadeStageId): StageOrderItem {
  return CAMPAIGN_ORDER.find(s => s.id === id) || CAMPAIGN_ORDER[0];
}

export function getStageZones(stageId: ArcadeStageId): StageZoneDef[] {
  if (stageId === 'stage1_streets') {
    return [
      { minX: 0, maxX: 82, startX: 2.0 },
      { minX: 200, maxX: 264, startX: 202.0 },
      { minX: 400, maxX: 472, startX: 402.0, preBossX: 444 },
    ];
  }
  if (stageId === 'stage2_subway') {
    return [
      { minX: 0, maxX: 88, startX: 2.2 },
      { minX: 180, maxX: 304, startX: 183.0 },
      { minX: 380, maxX: 452, startX: 383.5, preBossX: 432 },
      { minX: 520, maxX: 562, startX: 521.2, preBossX: 528 },
    ];
  }
  if (stageId === 'stage3_westside') {
    return [
      { minX: 0, maxX: 78, startX: 2.0 },
      { minX: 200, maxX: 246, startX: 212.0 },
      { minX: 400, maxX: 554, startX: 403.0, preBossX: 505 },
    ];
  }
  const len = getStageMeta(stageId).length;
  return [{ minX: 0, maxX: len, startX: 2.0, preBossX: Math.max(20, len - 30) }];
}

export function getStagePortals(stageId: ArcadeStageId): StagePortalDef[] {
  if (stageId === 'stage1_streets') {
    return [
      {
        zoneIdx: 0,
        triggerX: 78.2,
        destZoneIdx: 1,
        destX: 202.0,
        banner: '🚪 ENTRANDO NO GALPÃO DO SLUM...',
      },
      {
        zoneIdx: 1,
        triggerX: 260.2,
        destZoneIdx: 2,
        destX: 402.0,
        banner: '🌆 SAINDO PARA O BECO DO FERRO-VELHO...',
      },
    ];
  }
  if (stageId === 'stage2_subway') {
    return [
      {
        zoneIdx: 0,
        triggerX: 82.5,
        destZoneIdx: 1,
        destX: 183.0,
        banner: '🚇 EMBARCANDO NO METRÔ EM MOVIMENTO...',
      },
      {
        zoneIdx: 1,
        triggerX: 9999,
        autoOnWaveIdx: 7,
        destZoneIdx: 2,
        destX: 383.5,
        banner: '🛤️ TREM PAROU! SAINDO PELA GALERIA SUBTERRÂNEA...',
      },
      {
        zoneIdx: 2,
        triggerX: 447.5,
        destZoneIdx: 3,
        destX: 521.2,
        banner: '🥊 ENTRANDO NA ARENA SUBTERRÂNEA DO SODOM...',
      },
    ];
  }
  if (stageId === 'stage3_westside') {
    return [
      {
        zoneIdx: 0,
        triggerX: 9999,
        autoOnWaveIdx: 2,
        destZoneIdx: 1,
        destX: 212.0,
        banner: '⛓️ CAPTURADO! LEVADO AO RINGUE DOS ANDORES...',
      },
      {
        zoneIdx: 1,
        triggerX: 9999,
        autoOnWaveIdx: 3,
        destZoneIdx: 2,
        destX: 403.0,
        banner: '🚪 SAINDO DO RESTAURANTE PARA AS RUAS...',
      },
    ];
  }
  return [];
}

export function getNextCampaignStage(id: ArcadeStageId): ArcadeStageId | null {
  const mainOrder: ArcadeStageId[] = [
    'stage1_streets',
    'stage2_subway',
    'bonus_car',
    'stage3_westside',
    'stage4_industrial',
    'bonus_glass',
    'stage5_bay',
  ];
  const idx = mainOrder.indexOf(id);
  if (idx >= 0 && idx < mainOrder.length - 1) return mainOrder[idx + 1];
  return null;
}

export function getStagePreBossX(stageId: ArcadeStageId): number {
  const waves = getWavesForStage(stageId);
  const bossWave = waves.find(w => w.isBossWave);
  if (bossWave) return Math.max(20, bossWave.lockMinX - 8);
  return Math.max(20, getStageMeta(stageId).length - 28);
}

export function getCampaignStageNumber(stageId: ArcadeStageId): number {
  if (stageId === 'stage1_streets' || stageId === 'plains') return 1;
  if (stageId === 'stage2_subway' || stageId === 'bonus_car' || stageId === 'desert') return 2;
  if (stageId === 'stage3_westside' || stageId === 'nether') return 3;
  if (stageId === 'stage4_industrial' || stageId === 'bonus_glass' || stageId === 'snow') return 4;
  return 5;
}

export type EnemyMoveProfile = 'punk' | 'agile' | 'slash' | 'giant' | 'rusher' | 'ninja_knife' | 'ninja_fire';

export interface GangEnemyTemplate {
  id: string;
  name: string;
  role: 'agile' | 'brawler' | 'giant' | 'punk';
  tier: 'basic' | 'mid' | 'heavy';
  moveProfile: EnemyMoveProfile;
  isMonster?: boolean;
  isSubBoss?: boolean;
  widthScale?: number;
  modelUrl?: string;
  skinUrl?: string;
  avatarConfig: any;
  drops?: any[];
  attacksConfig?: any;
  scale: number;
  speed: number;
  attack: number;
  defense: number;
  hp: number;
  evasion: number;
  critChance: number;
  damageEffect?: string;
  hasSpecial?: boolean;
}

export interface ArcadeWaveDef {
  triggerX: number;
  lockMinX: number;
  lockMaxX: number;
  label: string;
  isBossWave?: boolean;
  isElevatorWave?: boolean;
  isAmbushWave?: boolean;
  spawns: {
    side: 'front' | 'back' | 'drop' | 'door' | 'seat';
    zOffset: number;
    doorX?: number;
    doorZ?: number;
    seatX?: number;
    seatZ?: number;
    tier?: 'basic' | 'mid' | 'heavy';
    isBoss?: boolean;
    isSubBoss?: boolean;
    isFireSquad?: boolean;
    isAndore?: boolean;
    gangIdx: number;
  }[];
}

// PRNG determinístico por seed para manter o elenco fixo de cada estágio entre partidas
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GANG_ARCHETYPES: {
  name: string;
  role: GangEnemyTemplate['role'];
  tier: GangEnemyTemplate['tier'];
  minStage: number;
  moveProfile: EnemyMoveProfile;
  gender: 'male' | 'female';
  scale: number;
  widthScale?: number;
  speedMul: number;
  hpMul: number;
  atkMul: number;
  defBonus: number;
  hairStyle: string;
  shirt: string;
  pants: string;
  hair: string;
  skin: string;
}[] = [
    { name: 'Bred', role: 'punk', tier: 'basic', minStage: 1, moveProfile: 'punk', gender: 'male', scale: 0.94, speedMul: 0.96, hpMul: 0.9, atkMul: 0.85, defBonus: 6, hairStyle: 'short', shirt: '#dc2626', pants: '#1e3a8a', hair: '#92400e', skin: '#f1c27d' },
    { name: 'Dug', role: 'punk', tier: 'basic', minStage: 1, moveProfile: 'punk', gender: 'male', scale: 0.96, speedMul: 0.98, hpMul: 1.0, atkMul: 0.9, defBonus: 7, hairStyle: 'spiky', shirt: '#16a34a', pants: '#1f2937', hair: '#facc15', skin: '#e0ac69' },
    { name: 'Jake', role: 'punk', tier: 'basic', minStage: 1, moveProfile: 'punk', gender: 'male', scale: 0.98, speedMul: 0.95, hpMul: 1.08, atkMul: 0.95, defBonus: 8, hairStyle: 'short', shirt: '#2563eb', pants: '#1e293b', hair: '#78350f', skin: '#f1c27d' },
    { name: 'Simons', role: 'punk', tier: 'basic', minStage: 1, moveProfile: 'punk', gender: 'male', scale: 1.0, speedMul: 0.94, hpMul: 1.15, atkMul: 1.0, defBonus: 9, hairStyle: 'short', shirt: '#78350f', pants: '#334155', hair: '#1c1917', skin: '#d97706' },
    { name: 'Two-P', role: 'punk', tier: 'basic', minStage: 2, moveProfile: 'punk', gender: 'male', scale: 0.96, speedMul: 1.0, hpMul: 1.05, atkMul: 0.98, defBonus: 8, hairStyle: 'spiky', shirt: '#ea580c', pants: '#15803d', hair: '#f97316', skin: '#e0ac69' },
    { name: 'Roxy (Poison)', role: 'agile', tier: 'mid', minStage: 1, moveProfile: 'agile', gender: 'female', scale: 0.89, speedMul: 1.18, hpMul: 0.95, atkMul: 1.05, defBonus: 7, hairStyle: 'long', shirt: '#ec4899', pants: '#312e81', hair: '#f43f5e', skin: '#ffdbac' },
    { name: 'Slash', role: 'brawler', tier: 'mid', minStage: 1, moveProfile: 'slash', gender: 'male', scale: 1.14, speedMul: 0.92, hpMul: 1.5, atkMul: 1.25, defBonus: 14, hairStyle: 'short', shirt: '#7c3aed', pants: '#18181b', hair: '#e5e7eb', skin: '#8d5524' },
    { name: 'Wong Who (Gordinho)', role: 'brawler', tier: 'mid', minStage: 1, moveProfile: 'rusher', gender: 'male', scale: 1.02, widthScale: 1.38, speedMul: 0.95, hpMul: 1.48, atkMul: 1.22, defBonus: 14, hairStyle: 'short', shirt: '#f59e0b', pants: '#1e293b', hair: '#111827', skin: '#e0ac69' },
    { name: 'Holly Wood (Ninja)', role: 'agile', tier: 'heavy', minStage: 2, moveProfile: 'ninja_knife', gender: 'male', scale: 0.94, speedMul: 1.16, hpMul: 1.1, atkMul: 1.18, defBonus: 10, hairStyle: 'short', shirt: '#1e293b', pants: '#0f172a', hair: '#09090b', skin: '#f1c27d' },
    { name: 'Andore Jr.', role: 'giant', tier: 'heavy', minStage: 2, moveProfile: 'giant', gender: 'male', scale: 1.36, widthScale: 1.24, speedMul: 0.82, hpMul: 2.35, atkMul: 1.55, defBonus: 22, hairStyle: 'long', shirt: '#b91c1c', pants: '#7f1d1d', hair: '#1f2937', skin: '#e0ac69' },
    { name: 'Andore Pai', role: 'giant', tier: 'heavy', minStage: 3, moveProfile: 'giant', gender: 'male', scale: 1.52, widthScale: 1.28, speedMul: 0.78, hpMul: 3.0, atkMul: 1.8, defBonus: 28, hairStyle: 'long', shirt: '#0f766e', pants: '#134e4a', hair: '#27272a', skin: '#c68642' },
    { name: 'Ninja Vermelho (Fogo)', role: 'agile', tier: 'heavy', minStage: 2, moveProfile: 'ninja_fire', gender: 'male', scale: 0.95, speedMul: 1.18, hpMul: 1.12, atkMul: 1.2, defBonus: 10, hairStyle: 'short', shirt: '#dc2626', pants: '#991b1b', hair: '#7f1d1d', skin: '#ef4444' },
  ];

const CUBE_MONSTER_ARCHETYPES: {
  name: string;
  role: GangEnemyTemplate['role'];
  tier: GangEnemyTemplate['tier'];
  minStage: number;
  moveProfile: EnemyMoveProfile;
  scale: number;
  widthScale?: number;
  speedMul: number;
  hpMul: number;
  atkMul: number;
  defBonus: number;
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
  eye: string;
  hairStyle: string;
}[] = [
    { name: 'Goblin Batedor', role: 'agile', tier: 'basic', minStage: 1, moveProfile: 'punk', scale: 0.8, speedMul: 1.06, hpMul: 0.92, atkMul: 0.9, defBonus: 6, skin: '#4ade80', shirt: '#3f6212', pants: '#1a2e05', hair: '#14532d', eye: '#ef4444', hairStyle: 'spiky' },
    { name: 'Zumbi Tóxico', role: 'punk', tier: 'basic', minStage: 1, moveProfile: 'punk', scale: 1.0, speedMul: 0.88, hpMul: 1.18, atkMul: 1.0, defBonus: 10, skin: '#22c55e', shirt: '#0284c7', pants: '#312e81', hair: '#064e3b', eye: '#facc15', hairStyle: 'short' },
    { name: 'Orc Brutamontes', role: 'brawler', tier: 'mid', minStage: 2, moveProfile: 'rusher', scale: 1.22, widthScale: 1.2, speedMul: 0.86, hpMul: 1.75, atkMul: 1.35, defBonus: 18, skin: '#15803d', shirt: '#78350f', pants: '#451a03', hair: '#1c1917', eye: '#fb923c', hairStyle: 'spiky' },
    { name: 'Golem de Ferro', role: 'giant', tier: 'heavy', minStage: 4, moveProfile: 'giant', scale: 1.42, widthScale: 1.25, speedMul: 0.72, hpMul: 2.75, atkMul: 1.65, defBonus: 30, skin: '#94a3b8', shirt: '#64748b', pants: '#475569', hair: '#334155', eye: '#ef4444', hairStyle: 'short' },
  ];

/**
 * Gera o elenco FIXO do estágio respeitando a progressão canônica (sem monstros/inimigos avançados logo de cara)
 * e com velocidades cadenciadas estilo Final Fight!
 */
export function buildFixedStageGang(
  stageId: ArcadeStageId,
  cubeMonsterPresets: any[]
): { regularRoster: GangEnemyTemplate[]; subBossRoster: GangEnemyTemplate[] } {
  const stageNum = getCampaignStageNumber(stageId);
  const rand = mulberry32(stageNum * 977 + 1337);
  const diffScale = 1 + (stageNum - 1) * 0.25;

  const humans: GangEnemyTemplate[] = GANG_ARCHETYPES
    .filter(arch => stageNum >= arch.minStage)
    .map((arch, idx) => {
      const hpVar = 0.94 + rand() * 0.12;
      const sizeBoost = arch.scale >= 1.25 ? 1.15 : arch.scale <= 0.9 ? 0.94 : 1.0;
      return {
        id: `${stageId}_gang_${idx}`,
        name: stageNum >= 4 && arch.role === 'giant' ? `${arch.name} Mk.${stageNum - 2}` : arch.name,
        role: arch.role,
        tier: arch.tier,
        moveProfile: arch.moveProfile,
        isMonster: false,
        widthScale: arch.widthScale,
        scale: arch.scale,
        // Velocidade mais tranquila e cadenciada como no Final Fight clássico!
        speed: Number((1.54 * arch.speedMul + (stageNum - 1) * 0.05).toFixed(2)),
        attack: Math.round(28 * arch.atkMul * diffScale * sizeBoost),
        defense: Math.round((arch.defBonus + stageNum * 3) * sizeBoost),
        hp: Math.round(185 * arch.hpMul * diffScale * hpVar),
        evasion: arch.role === 'agile' ? 10 : 0,
        critChance: arch.role === 'brawler' || arch.role === 'giant' ? 12 : 6,
        hasSpecial: arch.moveProfile !== 'punk',
        damageEffect: arch.moveProfile === 'ninja_fire' ? 'burn' : 'none',
        avatarConfig: {
          gender: arch.gender,
          skinColor: arch.skin,
          hairStyle: arch.hairStyle,
          hairColor: arch.hair,
          shirtColor: arch.shirt,
          pantsColor: arch.pants,
          shoesColor: '#111827',
          eyeColor: '#0f172a',
          expression: 'angry',
        },
      };
    });

  const blockMonsters: GangEnemyTemplate[] = [];
  const subBossRoster: GangEnemyTemplate[] = [];
  const subProfiles: EnemyMoveProfile[] = ['slash', 'giant', 'agile', 'rusher', 'ninja_knife'];

  // Ordena monstros customizados da base do mais simples ao mais forte para liberar gradualmente por estágio
  const sortedPresets = [...cubeMonsterPresets].sort(
    (a, b) => ((Number(a.hp) || 100) + (Number(a.attack) || 20) * 4) - ((Number(b.hp) || 100) + (Number(b.attack) || 20) * 4)
  );
  const nonGlbPresets = sortedPresets.filter(m => !m.skinUrl);
  const glbPresets = sortedPresets.filter(m => !!m.skinUrl);

  glbPresets.forEach((m, i) => {
    const baseHp = Math.max(95, Number(m.hp) || 120);
    const baseAtk = Math.max(18, Number(m.attack) || 26);
    const baseDef = Math.max(6, Number(m.defense) || 10);
    const prof = subProfiles[(i + stageNum) % subProfiles.length];
    subBossRoster.push({
      id: `subboss_${stageId}_${m.id}_${i}`,
      name: `⭐ Sub-Chefe: ${m.name}`,
      role: 'giant',
      tier: 'heavy',
      moveProfile: prof,
      isMonster: true,
      isSubBoss: true,
      skinUrl: m.skinUrl,
      avatarConfig: m.avatarConfig || {},
      drops: m.drops || [],
      scale: Number(Math.max(1.22, Math.min(1.4, (m.scale || 1.0) * 1.25)).toFixed(2)),
      speed: Number((1.58 + (i % 2) * 0.12).toFixed(2)),
      attack: Math.round(baseAtk * (1.2 + (stageNum - 1) * 0.16)),
      defense: Math.round((baseDef + 12 + stageNum * 4) * 1.15),
      hp: Math.round(Math.max(400, baseHp * 3.0) * diffScale),
      evasion: Math.max(5, Number(m.evasion) || 4),
      critChance: Math.max(10, Number(m.critChance) || 12),
      damageEffect: m.damageEffect || 'none',
      hasSpecial: true,
    });
  });

  nonGlbPresets.forEach((m, i) => {
    // Libera monstros customizados mais fortes apenas nos estágios seguintes
    const unlockStage = nonGlbPresets.length <= 2
      ? (i === 0 ? 1 : 2)
      : Math.min(5, 1 + Math.floor((i / nonGlbPresets.length) * 4));
    if (stageNum < unlockStage) return;

    const baseHp = Math.max(95, Number(m.hp) || 120);
    const baseAtk = Math.max(18, Number(m.attack) || 26);
    const baseDef = Math.max(6, Number(m.defense) || 10);
    const isHeavy = unlockStage >= 3 || (i % 2 === 1 && stageNum >= 2);
    blockMonsters.push({
      id: `sys_block_mon_${stageId}_${m.id}_${i}`,
      name: m.name,
      role: isHeavy ? 'brawler' : 'punk',
      tier: unlockStage >= 4 ? 'heavy' : isHeavy ? 'mid' : 'basic',
      moveProfile: isHeavy ? 'rusher' : 'punk',
      isMonster: true,
      avatarConfig: m.avatarConfig || {},
      drops: m.drops || [],
      scale: Number(Math.max(0.84, Math.min(1.22, m.scale || (isHeavy ? 1.14 : 0.92))).toFixed(2)),
      speed: isHeavy ? 1.46 : 1.65,
      // Respeita diretamente o ataque configurado do monstro
      attack: Math.round(baseAtk * (1 + (stageNum - 1) * 0.12)),
      defense: Math.round(baseDef + stageNum * 3),
      hp: Math.round(Math.max(175, baseHp * 1.7) * diffScale),
      evasion: Number(m.evasion) || (isHeavy ? 2 : 8),
      critChance: Number(m.critChance) || 7,
      damageEffect: m.damageEffect || 'none',
      hasSpecial: isHeavy,
    });
  });

  CUBE_MONSTER_ARCHETYPES
    .filter(cm => stageNum >= cm.minStage)
    .forEach((cm, ci) => {
      const sizeBoost = cm.scale >= 1.25 ? 1.15 : cm.scale <= 0.85 ? 0.92 : 1.0;
      blockMonsters.push({
        id: `cube_arch_${stageId}_${ci}`,
        name: cm.name,
        role: cm.role,
        tier: cm.tier,
        moveProfile: cm.moveProfile,
        isMonster: true,
        widthScale: cm.widthScale,
        scale: cm.scale,
        speed: Number((1.54 * cm.speedMul + (stageNum - 1) * 0.05).toFixed(2)),
        attack: Math.round(30 * cm.atkMul * diffScale * sizeBoost),
        defense: Math.round((cm.defBonus + stageNum * 3) * sizeBoost),
        hp: Math.round(195 * cm.hpMul * diffScale),
        evasion: cm.role === 'agile' ? 8 : 0,
        critChance: cm.role === 'giant' || cm.role === 'brawler' ? 12 : 6,
        hasSpecial: cm.tier !== 'basic',
        avatarConfig: {
          gender: 'male',
          skinColor: cm.skin,
          hairStyle: cm.hairStyle,
          hairColor: cm.hair,
          shirtColor: cm.shirt,
          pantsColor: cm.pants,
          shoesColor: '#0f172a',
          eyeColor: cm.eye,
          expression: 'angry',
        },
      });
    });

  const regularRoster: GangEnemyTemplate[] = [];
  const maxLen = Math.max(humans.length, blockMonsters.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < humans.length) regularRoster.push(humans[i]);
    if (i < blockMonsters.length) regularRoster.push(blockMonsters[i]);
  }
  return { regularRoster, subBossRoster };
}

export function getWavesForStage(stageId: ArcadeStageId): ArcadeWaveDef[] {
  if (stageId === 'bonus_car' || stageId === 'bonus_glass') return [];

  if (stageId === 'stage1_streets') {
    return [
      {
        triggerX: 11, lockMinX: 3, lockMaxX: 22, label: 'SLUM — RUA INICIAL & GANGUE MAD GEAR!',
        spawns: [
          { side: 'front', zOffset: -0.6, tier: 'basic', gangIdx: 0 },
          { side: 'door', doorX: 18, doorZ: -3.9, zOffset: 0.4, tier: 'basic', gangIdx: 1 },
          { side: 'front', zOffset: 0.9, tier: 'basic', gangIdx: 2 },
        ],
      },
      {
        triggerX: 39, lockMinX: 30, lockMaxX: 51, label: 'BECO DA CABINE TELEFÔNICA & LATA DE LIXO!',
        spawns: [
          { side: 'front', zOffset: -1.0, tier: 'basic', gangIdx: 2 },
          { side: 'front', zOffset: 0.8, tier: 'basic', gangIdx: 3 },
          { side: 'back', zOffset: -0.2, tier: 'mid', gangIdx: 0 },
          { side: 'front', zOffset: 1.1, tier: 'basic', gangIdx: 0 },
        ],
      },
      {
        triggerX: 64, lockMinX: 55, lockMaxX: 76, label: 'GUARDA NA ENTRADA DO GALPÃO!',
        spawns: [
          { side: 'door', doorX: 55, doorZ: -3.9, zOffset: 0.2, tier: 'mid', gangIdx: 1 },
          { side: 'front', zOffset: -0.9, tier: 'basic', gangIdx: 3 },
          { side: 'front', zOffset: 0.9, tier: 'mid', gangIdx: 0 },
          { side: 'back', zOffset: -0.4, tier: 'basic', gangIdx: 1 },
        ],
      },
      {
        triggerX: 209, lockMinX: 202, lockMaxX: 222, label: '📦 GALPÃO DO SLUM — EMBOSCADA NO DEPÓSITO!', isAmbushWave: true,
        spawns: [
          { side: 'front', zOffset: -0.7, tier: 'basic', gangIdx: 0 },
          { side: 'front', zOffset: 0.8, tier: 'mid', gangIdx: 1 },
          { side: 'back', zOffset: 0.0, tier: 'basic', gangIdx: 2 },
          { side: 'back', zOffset: 1.0, tier: 'basic', gangIdx: 3 },
        ],
      },
      {
        triggerX: 229, lockMinX: 220, lockMaxX: 241, label: '📦 GALPÃO — ROXY, SLASH & CAPANGAS!',
        spawns: [
          { side: 'front', zOffset: -1.0, tier: 'mid', gangIdx: 0 },
          { side: 'front', zOffset: 0.9, tier: 'mid', gangIdx: 1 },
          { side: 'back', zOffset: -0.1, tier: 'basic', gangIdx: 2 },
          { side: 'front', zOffset: 0.3, tier: 'basic', gangIdx: 1 },
        ],
      },
      {
        triggerX: 247, lockMinX: 238, lockMaxX: 259, label: '💪 GALPÃO — WONG WHO (GORDINHO) & SUB-CHEFE!',
        spawns: [
          { side: 'front', zOffset: -0.3, tier: 'mid', gangIdx: 2 },
          { side: 'front', zOffset: 0.9, isSubBoss: true, gangIdx: 0 },
          { side: 'back', zOffset: -0.9, tier: 'basic', gangIdx: 0 },
        ],
      },
      {
        triggerX: 416, lockMinX: 406, lockMaxX: 428, label: '🚗 FERRO-VELHO DOS CARROS DESTRUÍDOS!',
        spawns: [
          { side: 'front', zOffset: -0.9, tier: 'mid', gangIdx: 1 },
          { side: 'front', zOffset: 0.8, tier: 'mid', gangIdx: 0 },
          { side: 'back', zOffset: 0.1, tier: 'basic', gangIdx: 2 },
          { side: 'front', zOffset: -0.1, tier: 'basic', gangIdx: 3 },
        ],
      },
      {
        triggerX: 438, lockMinX: 429, lockMaxX: 450, label: '🚪 ANTESALA DA PORTA DO DANDE!',
        spawns: [
          { side: 'front', zOffset: -1.0, isSubBoss: true, gangIdx: 1 },
          { side: 'front', zOffset: 0.9, tier: 'mid', gangIdx: 2 },
          { side: 'back', zOffset: -0.2, tier: 'basic', gangIdx: 1 },
        ],
      },
      {
        triggerX: 453, lockMinX: 444, lockMaxX: 465, label: '💥 DANDE ARROMBOU A PORTA DUPLA!', isBossWave: true,
        spawns: [
          { side: 'door', doorX: 455.5, doorZ: -3.5, zOffset: 0.1, isBoss: true, gangIdx: 0 },
          { side: 'front', zOffset: -1.0, tier: 'basic', gangIdx: 0 },
          { side: 'back', zOffset: 1.0, tier: 'basic', gangIdx: 2 },
        ],
      },
    ];
  }

  if (stageId === 'stage2_subway') {
    return [
      {
        triggerX: 17, lockMinX: 8, lockMaxX: 30, label: 'ESTAÇÃO DO METRÔ — CABINE TELEFÔNICA & PUNKS!',
        spawns: [
          { side: 'front', zOffset: -0.7, tier: 'basic', gangIdx: 0 },
          { side: 'front', zOffset: 0.9, tier: 'basic', gangIdx: 4 },
          { side: 'back', zOffset: 0.1, tier: 'mid', gangIdx: 1 },
          { side: 'front', zOffset: -0.1, tier: 'basic', gangIdx: 1 },
        ],
      },
      {
        triggerX: 40, lockMinX: 31, lockMaxX: 52, label: 'PLATAFORMA CENTRAL — PUNKS & WONG WHO!',
        spawns: [
          { side: 'front', zOffset: -1.0, tier: 'mid', gangIdx: 2 },
          { side: 'front', zOffset: 0.8, tier: 'basic', gangIdx: 2 },
          { side: 'back', zOffset: -0.4, tier: 'mid', gangIdx: 0 },
          { side: 'back', zOffset: 1.1, tier: 'basic', gangIdx: 3 },
        ],
      },
      {
        triggerX: 58, lockMinX: 49, lockMaxX: 69, label: 'VAGÕES ESTACIONADOS — POISON & HOLLY WOOD!',
        spawns: [
          { side: 'front', zOffset: -1.0, tier: 'mid', gangIdx: 0 },
          { side: 'front', zOffset: 0.6, tier: 'heavy', gangIdx: 0 },
          { side: 'back', zOffset: 0.2, tier: 'basic', gangIdx: 4 },
          { side: 'back', zOffset: -1.1, tier: 'basic', gangIdx: 1 },
        ],
      },
      {
        triggerX: 74, lockMinX: 65, lockMaxX: 84, label: 'ÚLTIMO VAGÃO — ESTREIA DO ANDORE JR.!',
        spawns: [
          { side: 'front', zOffset: -0.3, isAndore: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, tier: 'basic', gangIdx: 0 },
          { side: 'back', zOffset: -0.8, tier: 'mid', gangIdx: 1 },
        ],
      },
      {
        triggerX: 190, lockMinX: 182, lockMaxX: 205, label: '🚇 VAGÃO 1 — GANGUE SENTADA NOS BANCOS!', isAmbushWave: true,
        spawns: [
          { side: 'seat', seatX: 196.5, seatZ: -2.15, zOffset: -0.6, tier: 'basic', gangIdx: 0 },
          { side: 'seat', seatX: 198.2, seatZ: -2.15, zOffset: 0.4, tier: 'basic', gangIdx: 4 },
          { side: 'seat', seatX: 200.0, seatZ: -2.15, zOffset: 0.9, tier: 'basic', gangIdx: 1 },
          { side: 'front', zOffset: -0.2, tier: 'mid', gangIdx: 0 },
        ],
      },
      {
        triggerX: 218, lockMinX: 210, lockMaxX: 235, label: '🚇 VAGÃO 2 — ANDORE JR. & ACROBATAS!',
        spawns: [
          { side: 'front', zOffset: -0.5, isAndore: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.8, tier: 'mid', gangIdx: 0 },
          { side: 'back', zOffset: 0.2, tier: 'basic', gangIdx: 2 },
        ],
      },
      {
        triggerX: 249, lockMinX: 241, lockMaxX: 266, label: '🚇 VAGÃO 3 — SLASH & SUB-CHEFE!',
        spawns: [
          { side: 'front', zOffset: -0.8, tier: 'mid', gangIdx: 1 },
          { side: 'front', zOffset: 0.9, tier: 'heavy', gangIdx: 0 },
          { side: 'back', zOffset: -0.2, isSubBoss: true, gangIdx: 0 },
        ],
      },
      {
        triggerX: 280, lockMinX: 272, lockMaxX: 299, label: '🚇 PONTA ABERTA DO TREM — BARRIS, EL GADO & ANDORE!',
        spawns: [
          { side: 'front', zOffset: -0.3, isAndore: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, tier: 'heavy', gangIdx: 0 },
          { side: 'back', zOffset: -0.8, tier: 'mid', gangIdx: 2 },
        ],
      },
      {
        triggerX: 396, lockMinX: 386, lockMaxX: 412, label: '🛤️ GALERIA DE TIJOLOS VERDES — SAÍDA DOS TRILHOS!',
        spawns: [
          { side: 'front', zOffset: -1.0, tier: 'basic', gangIdx: 4 },
          { side: 'front', zOffset: 0.7, tier: 'mid', gangIdx: 1 },
          { side: 'back', zOffset: 0.1, tier: 'basic', gangIdx: 2 },
          { side: 'front', zOffset: -0.3, tier: 'mid', gangIdx: 0 },
        ],
      },
      {
        triggerX: 425, lockMinX: 415, lockMaxX: 442, label: '🔥 GALERIA FINAL — NINJAS VERMELHOS & GUARDA DO RINGUE!',
        spawns: [
          { side: 'front', zOffset: -1.0, isFireSquad: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, isSubBoss: true, gangIdx: 1 },
          { side: 'back', zOffset: -0.3, tier: 'mid', gangIdx: 1 },
        ],
      },
      {
        triggerX: 527, lockMinX: 525, lockMaxX: 557, label: '⚔️ RINGUE SUBTERRÂNEO — SODOM!', isBossWave: true,
        spawns: [
          { side: 'front', zOffset: 0.0, isBoss: true, gangIdx: 0 },
        ],
      },
    ];
  }

  if (stageId === 'stage3_westside') {
    return [
      {
        triggerX: 12, lockMinX: 3, lockMaxX: 22, label: 'WEST SIDE — CALÇADÃO DE NEON!',
        spawns: [
          { side: 'front', zOffset: -0.8, tier: 'basic', gangIdx: 0 },
          { side: 'front', zOffset: 0.9, tier: 'basic', gangIdx: 4 },
          { side: 'back', zOffset: 0.2, tier: 'mid', gangIdx: 0 },
          { side: 'front', zOffset: -0.1, tier: 'basic', gangIdx: 2 },
        ],
      },
      {
        triggerX: 39, lockMinX: 30, lockMaxX: 49, label: 'DENTRO DO RESTAURANTE — EMBOSCADA!', isAmbushWave: true,
        spawns: [
          { side: 'front', zOffset: -1.0, tier: 'mid', gangIdx: 2 },
          { side: 'front', zOffset: 0.8, tier: 'mid', gangIdx: 1 },
          { side: 'back', zOffset: -0.4, tier: 'basic', gangIdx: 1 },
          { side: 'back', zOffset: 1.2, tier: 'basic', gangIdx: 3 },
        ],
      },
      {
        triggerX: 62, lockMinX: 53, lockMaxX: 73, label: 'SALÃO DOS FUNDOS — ANDORE TE CERCOU!',
        spawns: [
          { side: 'front', zOffset: -0.4, isAndore: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, tier: 'mid', gangIdx: 0 },
          { side: 'back', zOffset: 0.1, isSubBoss: true, gangIdx: 0 },
        ],
      },
      {
        triggerX: 212, lockMinX: 204, lockMaxX: 240, label: '🤼 RINGUE RÚSTICO — ARENA DOS ANDORES!', isAmbushWave: true,
        spawns: [
          { side: 'front', zOffset: -0.7, isAndore: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.8, isAndore: true, gangIdx: 1 },
        ],
      },
      {
        triggerX: 416, lockMinX: 407, lockMaxX: 427, label: 'SAÍDA DO RESTAURANTE — RUAS DE WEST SIDE!',
        spawns: [
          { side: 'front', zOffset: -1.0, tier: 'basic', gangIdx: 4 },
          { side: 'front', zOffset: 0.7, tier: 'mid', gangIdx: 2 },
          { side: 'back', zOffset: -0.2, tier: 'mid', gangIdx: 1 },
          { side: 'back', zOffset: 1.1, tier: 'basic', gangIdx: 2 },
        ],
      },
      {
        triggerX: 448, lockMinX: 439, lockMaxX: 459, label: '🔥 BECO DE NEON — BANDO DE FOGO!',
        spawns: [
          { side: 'front', zOffset: -1.0, isFireSquad: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, isFireSquad: true, gangIdx: 0 },
          { side: 'back', zOffset: 0.0, tier: 'heavy', gangIdx: 0 },
        ],
      },
      {
        triggerX: 484, lockMinX: 475, lockMaxX: 495, label: 'FESTIVAL CHINATOWN — ACROBATAS & ANDORE!',
        spawns: [
          { side: 'front', zOffset: -1.0, tier: 'mid', gangIdx: 0 },
          { side: 'front', zOffset: 0.8, isAndore: true, gangIdx: 0 },
          { side: 'back', zOffset: 0.0, isSubBoss: true, gangIdx: 1 },
        ],
      },
      {
        triggerX: 530, lockMinX: 520, lockMaxX: 548, label: '⚠️ FESTIVAL — CHEFE EDDIE!', isBossWave: true,
        spawns: [
          { side: 'front', zOffset: -1.2, tier: 'basic', gangIdx: 0 },
          { side: 'back', zOffset: 1.2, tier: 'mid', gangIdx: 1 },
          { side: 'front', zOffset: 0.1, isBoss: true, gangIdx: 0 },
        ],
      },
    ];
  }

  if (stageId === 'stage4_industrial') {
    return [
      {
        triggerX: 12, lockMinX: 3, lockMaxX: 22, label: 'ÁREA INDUSTRIAL — PORTÃO DA FÁBRICA!',
        spawns: [
          { side: 'front', zOffset: -0.8, tier: 'basic', gangIdx: 2 },
          { side: 'front', zOffset: 1.0, tier: 'basic', gangIdx: 4 },
          { side: 'back', zOffset: 0.2, tier: 'mid', gangIdx: 1 },
          { side: 'front', zOffset: -0.1, tier: 'mid', gangIdx: 0 },
        ],
      },
      {
        triggerX: 44, lockMinX: 35, lockMaxX: 54, label: 'FORNALHAS — CUIDADO COM AS ARMADILHAS!',
        spawns: [
          { side: 'front', zOffset: -1.1, tier: 'mid', gangIdx: 2 },
          { side: 'front', zOffset: 0.6, tier: 'mid', gangIdx: 1 },
          { side: 'back', zOffset: -0.3, tier: 'heavy', gangIdx: 0 },
          { side: 'back', zOffset: 1.2, tier: 'basic', gangIdx: 3 },
        ],
      },
      {
        triggerX: 78, lockMinX: 69, lockMaxX: 88, label: '🔥 SALÃO DAS CALDEIRAS — BANDO DE FOGO!',
        spawns: [
          { side: 'front', zOffset: -1.1, isFireSquad: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, isFireSquad: true, gangIdx: 0 },
          { side: 'back', zOffset: 0.3, isSubBoss: true, gangIdx: 0 },
        ],
      },
      {
        triggerX: 112, lockMinX: 103, lockMaxX: 122, label: 'ENGRENAGENS GIGANTES — ANDORES & GOLEM!',
        spawns: [
          { side: 'front', zOffset: -1.0, tier: 'heavy', gangIdx: 1 },
          { side: 'front', zOffset: 0.9, tier: 'heavy', gangIdx: 3 },
          { side: 'back', zOffset: -1.1, tier: 'mid', gangIdx: 0 },
        ],
      },
      {
        triggerX: 152, lockMinX: 143, lockMaxX: 162, label: 'ELEVADOR SUBINDO — ONDA 1 (NINJAS!)', isElevatorWave: true,
        spawns: [
          { side: 'drop', zOffset: -1.0, tier: 'heavy', gangIdx: 0 },
          { side: 'drop', zOffset: 0.8, tier: 'mid', gangIdx: 0 },
          { side: 'drop', zOffset: -0.1, tier: 'basic', gangIdx: 4 },
        ],
      },
      {
        triggerX: 192, lockMinX: 183, lockMaxX: 202, label: 'ELEVADOR — ONDA 2 (SUB-CHEFE & SLASH!)', isElevatorWave: true,
        spawns: [
          { side: 'drop', zOffset: -1.1, isSubBoss: true, gangIdx: 1 },
          { side: 'drop', zOffset: 0.9, tier: 'mid', gangIdx: 1 },
          { side: 'drop', zOffset: 0.0, tier: 'basic', gangIdx: 2 },
        ],
      },
      {
        triggerX: 234, lockMinX: 225, lockMaxX: 245, label: 'ELEVADOR — ONDA 3 (GUARDA DO ROLENTO!)', isElevatorWave: true, isAmbushWave: true,
        spawns: [
          { side: 'drop', zOffset: -1.0, tier: 'heavy', gangIdx: 2 },
          { side: 'drop', zOffset: 0.8, isSubBoss: true, gangIdx: 2 },
          { side: 'drop', zOffset: -0.2, tier: 'heavy', gangIdx: 0 },
        ],
      },
      {
        triggerX: 274, lockMinX: 264, lockMaxX: 292, label: '⚠️ TOPO DO ELEVADOR — ROLENTO!', isBossWave: true, isElevatorWave: true,
        spawns: [
          { side: 'drop', zOffset: -1.1, tier: 'heavy', gangIdx: 0 },
          { side: 'drop', zOffset: 1.1, tier: 'mid', gangIdx: 1 },
          { side: 'drop', zOffset: 0.1, isBoss: true, gangIdx: 0 },
        ],
      },
    ];
  }

  if (stageId === 'stage5_bay') {
    return [
      {
        triggerX: 12, lockMinX: 3, lockMaxX: 22, label: 'BAY AREA — CAIS NORTE!',
        spawns: [
          { side: 'front', zOffset: -0.8, tier: 'basic', gangIdx: 3 },
          { side: 'front', zOffset: 1.0, tier: 'basic', gangIdx: 4 },
          { side: 'back', zOffset: 0.2, tier: 'mid', gangIdx: 0 },
          { side: 'front', zOffset: -0.2, tier: 'mid', gangIdx: 1 },
        ],
      },
      {
        triggerX: 46, lockMinX: 37, lockMaxX: 56, label: 'DOCAS DOS CONTÊINERES!',
        spawns: [
          { side: 'front', zOffset: -1.0, tier: 'mid', gangIdx: 1 },
          { side: 'front', zOffset: 0.7, tier: 'heavy', gangIdx: 0 },
          { side: 'back', zOffset: -0.3, tier: 'mid', gangIdx: 2 },
          { side: 'back', zOffset: 1.1, tier: 'basic', gangIdx: 2 },
        ],
      },
      {
        triggerX: 82, lockMinX: 73, lockMaxX: 92, label: '🔥 EMBOSCADA PORTUÁRIA — BANDO DE FOGO!', isAmbushWave: true,
        spawns: [
          { side: 'front', zOffset: -1.1, isFireSquad: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.8, isFireSquad: true, gangIdx: 0 },
          { side: 'back', zOffset: 0.4, tier: 'mid', gangIdx: 2 },
          { side: 'back', zOffset: -0.9, tier: 'basic', gangIdx: 4 },
        ],
      },
      {
        triggerX: 122, lockMinX: 113, lockMaxX: 132, label: 'PÁTIO DOS GUINDASTES — SUB-CHEFE & GOLEM!',
        spawns: [
          { side: 'front', zOffset: -1.1, tier: 'heavy', gangIdx: 3 },
          { side: 'front', zOffset: 0.7, isSubBoss: true, gangIdx: 0 },
          { side: 'back', zOffset: -0.3, tier: 'heavy', gangIdx: 0 },
        ],
      },
      {
        triggerX: 164, lockMinX: 155, lockMaxX: 174, label: 'ARMAZÉM PESADO — DUPLA DE GORDINHOS!',
        spawns: [
          { side: 'front', zOffset: -1.0, tier: 'mid', gangIdx: 2 },
          { side: 'front', zOffset: 0.9, tier: 'mid', gangIdx: 2 },
          { side: 'back', zOffset: 0.0, tier: 'mid', gangIdx: 1 },
        ],
      },
      {
        triggerX: 206, lockMinX: 197, lockMaxX: 216, label: 'PASSARELA DO PÍER — ACROBATAS & NINJAS!',
        spawns: [
          { side: 'front', zOffset: -1.1, tier: 'mid', gangIdx: 0 },
          { side: 'front', zOffset: 0.8, tier: 'heavy', gangIdx: 0 },
          { side: 'back', zOffset: 1.0, isSubBoss: true, gangIdx: 1 },
        ],
      },
      {
        triggerX: 248, lockMinX: 239, lockMaxX: 258, label: '🔥 CONVESES — SEGUNDO BANDO DE FOGO!',
        spawns: [
          { side: 'front', zOffset: -1.0, isFireSquad: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, isFireSquad: true, gangIdx: 0 },
          { side: 'back', zOffset: 0.1, tier: 'heavy', gangIdx: 1 },
        ],
      },
      {
        triggerX: 292, lockMinX: 283, lockMaxX: 304, label: 'ESCOLTA REAL DO BELGER — IRMÃOS ANDORE & SUB-CHEFE!',
        spawns: [
          { side: 'front', zOffset: -1.1, isAndore: true, gangIdx: 1 },
          { side: 'front', zOffset: 0.8, isSubBoss: true, gangIdx: 2 },
          { side: 'back', zOffset: -0.2, isAndore: true, gangIdx: 0 },
        ],
      },
      {
        triggerX: 334, lockMinX: 324, lockMaxX: 352, label: '⚠️ IATE DO CHEFE FINAL — BELGER!', isBossWave: true,
        spawns: [
          { side: 'front', zOffset: -1.2, tier: 'mid', gangIdx: 1 },
          { side: 'back', zOffset: 1.2, isSubBoss: true, gangIdx: 1 },
          { side: 'front', zOffset: 0.0, isBoss: true, gangIdx: 0 },
        ],
      },
    ];
  }

  const len = getStageMeta(stageId).length;
  return [
    {
      triggerX: 12, lockMinX: 3, lockMaxX: 22, label: 'ONDA 1 — AVANÇO NO BIOMA!',
      spawns: [
        { side: 'front', zOffset: -0.8, tier: 'basic', gangIdx: 0 },
        { side: 'front', zOffset: 1.0, tier: 'basic', gangIdx: 1 },
        { side: 'back', zOffset: 0.2, tier: 'basic', gangIdx: 2 },
      ],
    },
    {
      triggerX: Math.round(len * 0.34), lockMinX: Math.round(len * 0.26), lockMaxX: Math.round(len * 0.42), label: 'ONDA 2 — CERCO INTERMEDIÁRIO!',
      spawns: [
        { side: 'front', zOffset: -1.2, tier: 'mid', gangIdx: 0 },
        { side: 'front', zOffset: 0.6, tier: 'mid', gangIdx: 1 },
        { side: 'back', zOffset: -0.4, tier: 'basic', gangIdx: 2 },
      ],
    },
    {
      triggerX: Math.round(len * 0.60), lockMinX: Math.round(len * 0.52), lockMaxX: Math.round(len * 0.68), label: 'ONDA 3 — SUB-CHEFE DO BIOMA!',
      spawns: [
        { side: 'front', zOffset: -1.0, isSubBoss: true, gangIdx: 1 },
        { side: 'front', zOffset: 0.7, tier: 'heavy', gangIdx: 0 },
        { side: 'back', zOffset: 0.1, tier: 'mid', gangIdx: 1 },
      ],
    },
    {
      triggerX: Math.round(len * 0.84), lockMinX: Math.round(len * 0.76), lockMaxX: len - 4, label: `⚠️ ${getStageMeta(stageId).bossDisplayName.toUpperCase()} — CHEFE!`, isBossWave: true,
      spawns: [
        { side: 'front', zOffset: -1.2, tier: 'mid', gangIdx: 1 },
        { side: 'back', zOffset: 1.2, isSubBoss: true, gangIdx: 2 },
        { side: 'front', zOffset: 0.1, isBoss: true, gangIdx: 0 },
      ],
    },
  ];
}

// ---- TEXTURAS PROCEDURAIS ----
function makeCanvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  if (repeatX > 1 || repeatY > 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  return tex;
}

export function makeCrateTexture(): THREE.CanvasTexture {
  return makeCanvasTex(64, 64, (ctx) => {
    ctx.fillStyle = '#9a5b25'; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#7c4316';
    for (let y = 0; y < 64; y += 16) ctx.fillRect(0, y, 64, 2);
    ctx.strokeStyle = '#5c2e0a'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 56, 56);
    ctx.fillStyle = '#b46f32';
    ctx.beginPath(); ctx.moveTo(8, 52); ctx.lineTo(52, 8); ctx.lineTo(56, 12); ctx.lineTo(12, 56); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    [[6, 6], [54, 6], [6, 54], [54, 54]].forEach(([px, py]) => ctx.fillRect(px, py, 4, 4));
  });
}

export function makeBarrelTexture(): THREE.CanvasTexture {
  return makeCanvasTex(64, 64, (ctx) => {
    ctx.fillStyle = '#b91c1c'; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#facc15'; ctx.fillRect(0, 24, 64, 14);
    ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 6, 64, 4); ctx.fillRect(0, 54, 64, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(10, 0, 8, 64);
  });
}

function makeAsphaltTexture(): THREE.CanvasTexture {
  return makeCanvasTex(128, 128, (ctx) => {
    ctx.fillStyle = '#1f2532'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#283042' : '#161b24';
      ctx.fillRect((i * 37) % 128, (i * 53) % 128, 3, 2);
    }
    ctx.fillStyle = '#eab308'; ctx.fillRect(8, 60, 44, 6); ctx.fillRect(72, 60, 44, 6);
  }, 24, 1);
}

function makeSidewalkTexture(): THREE.CanvasTexture {
  return makeCanvasTex(64, 64, (ctx) => {
    ctx.fillStyle = '#4b5563'; ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 30, 30); ctx.strokeRect(33, 1, 30, 30);
    ctx.strokeRect(1, 33, 30, 30); ctx.strokeRect(33, 33, 30, 30);
  }, 30, 2);
}

function makeCheckerFloorTexture(): THREE.CanvasTexture {
  return makeCanvasTex(64, 64, (ctx) => {
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillRect(32, 32, 32, 32);
  }, 16, 4);
}

function makeBrickTexture(baseHex: string, mortarHex: string): THREE.CanvasTexture {
  return makeCanvasTex(64, 64, (ctx) => {
    ctx.fillStyle = mortarHex; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = baseHex;
    for (let row = 0; row < 4; row++) {
      const y = row * 16 + 1;
      const offset = (row % 2) * 16;
      for (let col = -1; col < 3; col++) ctx.fillRect(col * 32 + offset + 1, y, 29, 13);
    }
  }, 2, 3);
}

function makeNeonSignTexture(label: string, bgHex: string, textHex: string): THREE.CanvasTexture {
  return makeCanvasTex(160, 36, (ctx) => {
    ctx.fillStyle = '#090d16'; ctx.fillRect(0, 0, 160, 36);
    ctx.strokeStyle = bgHex; ctx.lineWidth = 3; ctx.strokeRect(2, 2, 156, 32);
    ctx.fillStyle = textHex; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 80, 19);
  });
}

export interface BreakablePropDef {
  id: number;
  kind: 'crate' | 'barrel' | 'wood_barrel' | 'fire_barrel' | 'cone' | 'phone_booth' | 'trash_can' | 'tire_stack';
  x: number;
  z: number;
  y: number;
  mesh: THREE.Object3D;
  hp?: number;
  solidTop?: number;
  isPreBoss?: boolean;
  guaranteedDrop?: 'pipe' | 'knife' | 'sword' | 'meat' | 'potion';
}

export interface StageEnvironmentRefs {
  trainLightsGroup?: THREE.Group | null;
  elevatorBeamsGroup?: THREE.Group | null;
  fireTraps: { x: number; z: number; mesh: THREE.Mesh; flameMesh: THREE.Mesh }[];
  breakableProps: BreakablePropDef[];
  customPropsOnly?: boolean;
  bossDoor?: { triggerBreak: () => void; x: number; z: number } | null;
  bossSeatPos?: { x: number; y: number; z: number } | null;
  stageExitWalkTo?: { x: number; z: number; descendY?: number } | null;
  floorHeightAt: (x: number) => number;
  isElevatorAt: (x: number) => boolean;
  updateAnimations?: (elapsedSec: number, dt: number) => void;
}

export function buildArcadeScenario(scene: THREE.Scene, stageId: ArcadeStageId): StageEnvironmentRefs {
  const meta = getStageMeta(stageId);
  const len = meta.length;
  const animCallbacks: ((elapsedSec: number, dt: number) => void)[] = [];
  let propSeq = 5000;

  const refs: StageEnvironmentRefs = {
    fireTraps: [],
    breakableProps: [],
    floorHeightAt: () => 0,
    isElevatorAt: () => false,
    updateAnimations: (t, dt) => { animCallbacks.forEach(fn => fn(t, dt)); },
  };

  // Helper para vapor subindo (bueiros/caldeiras) e chamas decorativas
  const addSteamVent = (x: number, y: number, z: number) => {
    const puffs: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.45, 0.45),
        new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.35 })
      );
      p.position.set(x + (i % 2 === 0 ? -0.1 : 0.1), y + i * 0.55, z);
      scene.add(p);
      puffs.push(p);
    }
    animCallbacks.push((t) => {
      puffs.forEach((p, idx) => {
        const phase = ((t * 0.8 + idx * 0.25) % 1);
        p.position.y = y + 0.15 + phase * 2.2;
        p.scale.setScalar(0.5 + phase * 0.9);
        (p.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.42 * (1 - phase));
      });
    });
  };

  const addFireBarrel = (x: number, y: number, z: number) => {
    const grp = new THREE.Group();
    const b = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.98, 10),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 })
    );
    b.position.y = 0.49; grp.add(b);
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.39, 0.39, 0.18, 10),
      new THREE.MeshStandardMaterial({ color: 0xdc2626 })
    );
    band.position.y = 0.52; grp.add(band);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.7, 6),
      new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.9 })
    );
    flame.position.y = 1.22; grp.add(flame);
    grp.position.set(x, y, z);
    scene.add(grp);
    animCallbacks.push((t) => {
      flame.scale.set(0.85 + Math.sin(t * 14 + x) * 0.2, 0.85 + Math.cos(t * 18 + x) * 0.25, 0.9);
      flame.rotation.y += 0.08;
    });
    refs.breakableProps.push({ id: propSeq++, kind: 'fire_barrel', x, z, y, mesh: grp });
  };

  const addTrafficCone = (x: number, y: number, z: number) => {
    const grp = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 0.52), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
    base.position.y = 0.04; grp.add(base);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.68, 8), new THREE.MeshStandardMaterial({ color: 0xf97316 }));
    cone.position.y = 0.4; grp.add(cone);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.15, 8), new THREE.MeshBasicMaterial({ color: 0xf8fafc }));
    stripe.position.y = 0.42; grp.add(stripe);
    grp.position.set(x, y, z);
    scene.add(grp);
    refs.breakableProps.push({ id: propSeq++, kind: 'cone', x, z, y, mesh: grp });
  };

  const crateTexShared = makeCrateTexture();

  const addCitySkylineStrip = (startX: number, endX: number, baseZ: number) => {
    for (let sx = startX, si = 0; sx <= endX; sx += 4.6, si++) {
      const bh = 9 + (si % 4) * 3.5;
      const bw = 3.8 + (si % 2) * 0.8;
      const bMat = new THREE.MeshStandardMaterial({
        color: si % 3 === 0 ? 0x1e3a8a : si % 3 === 1 ? 0x334155 : 0x0f274d,
        roughness: 0.85,
      });
      const tower = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 2.5), bMat);
      tower.position.set(sx, bh / 2 - 0.5, baseZ - (si % 2) * 2.2);
      scene.add(tower);
      const winStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(bw * 0.72, bh * 0.78),
        new THREE.MeshBasicMaterial({ color: si % 2 === 0 ? 0x38bdf8 : 0x93c5fd, transparent: true, opacity: 0.28 })
      );
      winStrip.position.set(sx, bh / 2 - 0.5, baseZ - (si % 2) * 2.2 + 1.28);
      scene.add(winStrip);
    }
  };

  const addRustMetalBarrelProp = (x: number, z: number, guaranteedDrop?: BreakablePropDef['guaranteedDrop'], isPreBoss?: boolean) => {
    const grp = new THREE.Group();
    const barrelTexRust = makeCanvasTex(64, 64, (ctx) => {
      ctx.fillStyle = '#7c2d12'; ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#9a3412'; ctx.fillRect(4, 0, 14, 64);
      ctx.fillStyle = '#451a03'; ctx.fillRect(0, 18, 64, 4); ctx.fillRect(0, 44, 64, 4);
    });
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 1.05, 14),
      new THREE.MeshStandardMaterial({ map: barrelTexRust, roughness: 0.72, metalness: 0.25 })
    );
    cyl.position.y = 0.525; grp.add(cyl);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 14), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    rim.position.y = 1.02; grp.add(rim);
    grp.position.set(x, 0, z);
    scene.add(grp);
    refs.breakableProps.push({ id: propSeq++, kind: 'barrel', x, z, y: 0, mesh: grp, hp: 35, solidTop: 1.05, guaranteedDrop, isPreBoss });
  };

  const addWoodBarrelProp = (x: number, z: number, scaleXZ = 1.0, guaranteedDrop?: BreakablePropDef['guaranteedDrop'], isPreBoss?: boolean) => {
    const grp = new THREE.Group();
    const woodTex = makeCanvasTex(64, 64, (ctx) => {
      ctx.fillStyle = '#92400e'; ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#78350f';
      for (let px = 0; px < 64; px += 8) ctx.fillRect(px, 0, 2, 64);
      ctx.fillStyle = '#334155'; ctx.fillRect(0, 10, 64, 6); ctx.fillRect(0, 48, 64, 6);
    });
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46 * scaleXZ, 0.42 * scaleXZ, 1.15, 12),
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 })
    );
    cyl.position.y = 0.575; grp.add(cyl);
    grp.position.set(x, 0, z);
    scene.add(grp);
    refs.breakableProps.push({ id: propSeq++, kind: 'wood_barrel', x, z, y: 0, mesh: grp, hp: 38, solidTop: 1.15, guaranteedDrop, isPreBoss });
  };

  const addBigCrateProp = (x: number, z: number, guaranteedDrop?: BreakablePropDef['guaranteedDrop'], isPreBoss?: boolean) => {
    const grp = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.45, 1.3), new THREE.MeshStandardMaterial({ map: crateTexShared, roughness: 0.78 }));
    box.position.y = 0.725; grp.add(box);
    grp.position.set(x, 0, z);
    scene.add(grp);
    refs.breakableProps.push({ id: propSeq++, kind: 'crate', x, z, y: 0, mesh: grp, hp: 42, solidTop: 1.45, guaranteedDrop, isPreBoss });
  };

  const addPhoneBoothProp = (x: number, z: number, guaranteedDrop: BreakablePropDef['guaranteedDrop'] = 'potion') => {
    const grp = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.25, 0.95), new THREE.MeshStandardMaterial({ color: 0xca8a04, roughness: 0.5 }));
    frame.position.y = 1.125; grp.add(frame);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 1.55, 0.99),
      new THREE.MeshBasicMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.55 })
    );
    glass.position.y = 1.15; grp.add(glass);
    const topSign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 0.28),
      new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('TELEPHONE', '#eab308', '#fef08a') })
    );
    topSign.position.set(0, 2.08, 0.49); grp.add(topSign);
    grp.position.set(x, 0, z);
    scene.add(grp);
    refs.breakableProps.push({ id: propSeq++, kind: 'phone_booth', x, z, y: 0, mesh: grp, hp: 42, guaranteedDrop });
  };

  const addTrashCanProp = (x: number, z: number, guaranteedDrop: BreakablePropDef['guaranteedDrop'] = 'meat') => {
    const grp = new THREE.Group();
    const canTex = makeCanvasTex(64, 64, (ctx) => {
      ctx.fillStyle = '#94a3b8'; ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#64748b';
      for (let px = 4; px < 64; px += 10) ctx.fillRect(px, 6, 4, 52);
      ctx.fillStyle = '#475569'; ctx.fillRect(0, 0, 64, 6);
    });
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.42, 1.05, 14),
      new THREE.MeshStandardMaterial({ map: canTex, metalness: 0.45, roughness: 0.45 })
    );
    body.position.y = 0.525; grp.add(body);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.1, 14), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.5 }));
    lid.position.y = 1.07; grp.add(lid);
    grp.position.set(x, 0, z);
    scene.add(grp);
    refs.breakableProps.push({ id: propSeq++, kind: 'trash_can', x, z, y: 0, mesh: grp, hp: 34, solidTop: 1.12, guaranteedDrop });
  };

  const addTireStackProp = (x: number, z: number, guaranteedDrop?: BreakablePropDef['guaranteedDrop']) => {
    const grp = new THREE.Group();
    for (let ti = 0; ti < 4; ti++) {
      const tire = new THREE.Mesh(
        new THREE.TorusGeometry(0.38, 0.14, 8, 16),
        new THREE.MeshStandardMaterial({ color: ti % 2 === 0 ? 0x18181b : 0x27272a, roughness: 0.9 })
      );
      tire.rotation.x = Math.PI / 2;
      tire.position.set((ti % 2) * 0.04, 0.14 + ti * 0.25, 0);
      grp.add(tire);
    }
    grp.position.set(x, 0, z);
    scene.add(grp);
    refs.breakableProps.push({ id: propSeq++, kind: 'tire_stack', x, z, y: 0, mesh: grp, hp: 36, solidTop: 1.08, guaranteedDrop });
  };

  if (stageId === 'stage1_streets') {
    scene.background = new THREE.Color(0x0d1b38);
    scene.fog = new THREE.FogExp2(0x0d1b38, 0.0045);
    refs.customPropsOnly = true;

    // 3 CENAS ISOLADAS DO ESTÁGIO 1 (igual ao Final Fight - Slum -> Galpão -> Ferro-Velho & Boate do Dande):
    // CENA 1A (x = 0..82): Cerca com arame farpado + skyline -> 5 tambores iniciais -> Prédio tijolos (porta com degraus + Cabine Telefônica + Lata de Lixo) -> Entrada do Galpão
    // CENA 1B (x = 200..264): Galpão interno verde-industrial com luminárias fluorescentes, pilhas de caixotes ao fundo, Caixote Grande (Cano), Barris de Madeira (Faca/Carne), saída
    // CENA 1C (x = 400..472): Ferro-Velho com carros destruídos + pilhas de pneus (Katana + Churrasco) -> Fachada da Porta Dupla do Dande -> Placa e escada SUBWAY!

    refs.floorHeightAt = (x: number) => {
      if (x >= 464.5) return -1.5 * Math.min(1, (x - 464.5) / 5.5);
      return 0;
    };

    const roadTex = makeAsphaltTexture();
    const sidewalkTex = makeSidewalkTexture();
    const slumbgMat = new THREE.MeshBasicMaterial({ color: 0x1d4ed8 });

    const addTrashBagsCluster = (x: number, z: number) => {
      const grp = new THREE.Group();
      [[0, 0, 0.42], [0.48, 0.08, 0.35], [-0.42, 0.15, 0.32]].forEach(([ox, oz, r]) => {
        const bag = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 }));
        bag.scale.set(1.1, 0.85, 0.95);
        bag.position.set(ox, r * 0.65, oz);
        grp.add(bag);
      });
      grp.position.set(x, 0, z);
      scene.add(grp);
    };

    const addSlumDoorFacade = (centerX: number) => {
      const doorGrp = new THREE.Group();
      const hole = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.75, 0.3), new THREE.MeshBasicMaterial({ color: 0x05070e }));
      hole.position.set(0, 1.55, 0); doorGrp.add(hole);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.0, 0.2), new THREE.MeshStandardMaterial({ color: 0x7c2d12 }));
      frame.position.set(0, 1.65, -0.08); doorGrp.add(frame);
      // Dois degraus de concreto + corrimão prateado nos dois lados (00:11 do vídeo!)
      const step1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.75), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
      step1.position.set(0, 0.11, 0.42); doorGrp.add(step1);
      const step2 = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.42, 0.45), new THREE.MeshStandardMaterial({ color: 0x64748b }));
      step2.position.set(0, 0.21, 0.22); doorGrp.add(step2);
      [-1.05, 1.05].forEach((rx) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 8), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.6 }));
        post.position.set(rx, 0.55, 0.68); doorGrp.add(post);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.65), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.6 }));
        bar.position.set(rx, 0.98, 0.42); bar.rotation.x = 0.28; doorGrp.add(bar);
      });
      doorGrp.position.set(centerX, 0.1, -4.45);
      scene.add(doorGrp);
    };

    const addBrokenWindow = (wx: number, wy: number, wz: number) => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.9, 0.12), new THREE.MeshBasicMaterial({ color: 0x1e293b }));
      win.position.set(wx, wy, wz); scene.add(win);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.16, 0.28), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
      sill.position.set(wx, wy - 0.98, wz + 0.06); scene.add(sill);
      const board1 = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.22, 0.06), new THREE.MeshStandardMaterial({ color: 0x78350f }));
      board1.position.set(wx, wy + 0.2, wz + 0.09); board1.rotation.z = 0.22; scene.add(board1);
      const board2 = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.22, 0.06), new THREE.MeshStandardMaterial({ color: 0x78350f }));
      board2.position.set(wx, wy - 0.35, wz + 0.09); board2.rotation.z = -0.18; scene.add(board2);
    };

    // =========================================================================
    // CENA 1A (x = -8 .. 85): RUA DO SLUM (EXTERNA)
    // =========================================================================
    const r1a = new THREE.Mesh(new THREE.PlaneGeometry(98, 7.6), new THREE.MeshStandardMaterial({ map: roadTex }));
    r1a.rotation.x = -Math.PI / 2; r1a.position.set(39, 0, 0.5); scene.add(r1a);
    const sw1a = new THREE.Mesh(new THREE.BoxGeometry(98, 0.24, 4.4), new THREE.MeshStandardMaterial({ map: sidewalkTex }));
    sw1a.position.set(39, 0.12, -5.0); scene.add(sw1a);
    const fw1a = new THREE.Mesh(new THREE.BoxGeometry(98, 0.2, 5.5), new THREE.MeshStandardMaterial({ map: sidewalkTex }));
    fw1a.position.set(39, -0.45, 7.1); scene.add(fw1a);

    addCitySkylineStrip(-8, 48, -12.5);

    // Cerca metálica vermelha inicial + arame farpado + mureta de tijolos cinza + poste SLUM (00:05 do vídeo!)
    for (let fx = -4; fx <= 8; fx += 2.0) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.2, 8), new THREE.MeshStandardMaterial({ color: 0xdc2626 }));
      post.position.set(fx, 2.1, -4.6); scene.add(post);
      const wire = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x94a3b8 }));
      wire.position.set(fx + 1.0, 4.0, -4.6); scene.add(wire);
    }
    const fenceRailTop = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0xef4444 }));
    fenceRailTop.position.set(2, 3.3, -4.6); scene.add(fenceRailTop);
    const lowWall = new THREE.Mesh(new THREE.BoxGeometry(13, 2.1, 0.8), new THREE.MeshStandardMaterial({ map: makeBrickTexture('#64748b', '#334155') }));
    lowWall.position.set(2, 1.05, -6.2); scene.add(lowWall);

    // Poste branco vertical com cartaz SLUM
    const slumPole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 5.4, 10), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
    slumPole.position.set(6.2, 2.7, -3.5); scene.add(slumPole);
    const slumSign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.6), new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('SLUM', '#f43f5e', '#ffffff') }));
    slumSign.position.set(6.2, 3.9, -3.28); scene.add(slumSign);

    // Grupo inicial de 5 barris metálicos enferrujados (exatamente como no frame 00:05!)
    [
      [4.5, -1.2], [5.4, 0.2], [6.4, -0.9], [6.8, 1.1], [7.8, -0.2],
    ].forEach(([bx, bz], i) => addRustMetalBarrelProp(bx, bz, i === 2 ? 'potion' : undefined));

    // Prédio tijolos 1 (x = 9..31): Porta 1 com corrimão + janelas quebradas + sacos de lixo + Cabine Telefônica!
    const b1Wall = new THREE.Mesh(new THREE.BoxGeometry(22, 8.2, 3.6), new THREE.MeshStandardMaterial({ map: makeBrickTexture('#6d3832', '#3f1f1b') }));
    b1Wall.position.set(20, 4.2, -6.3); scene.add(b1Wall);
    addSlumDoorFacade(18);
    addBrokenWindow(13.5, 2.6, -4.45);
    addBrokenWindow(22.2, 2.6, -4.45);
    addBrokenWindow(27.8, 2.6, -4.45);
    addTrashBagsCluster(22.0, -3.3);
    addPhoneBoothProp(25.8, -1.7);

    // Vão entre prédios (x = 31..40) mostrando escombros e skyline azul
    for (let di = 0; di < 5; di++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.22, 0.45), new THREE.MeshStandardMaterial({ color: 0x92400e }));
      plank.position.set(32.5 + di * 1.4, 0.4 + (di % 2) * 0.35, -5.2);
      plank.rotation.z = (di % 2 === 0 ? 0.3 : -0.25);
      scene.add(plank);
    }

    // Prédio tijolos 2 (x = 40..72): Lata de lixo prateada (DUSTBIN) + Porta 2 com degraus + sacos de lixo
    const b2Wall = new THREE.Mesh(new THREE.BoxGeometry(32, 8.4, 3.6), new THREE.MeshStandardMaterial({ map: makeBrickTexture('#64352f', '#381c18') }));
    b2Wall.position.set(56, 4.3, -6.3); scene.add(b2Wall);
    addBrokenWindow(45.5, 2.6, -4.45);
    addBrokenWindow(50.2, 2.6, -4.45);
    addSlumDoorFacade(55);
    addBrokenWindow(60.5, 2.6, -4.45);
    addBrokenWindow(66.5, 2.6, -4.45);
    addTrashBagsCluster(47.2, -3.3);
    addTrashBagsCluster(61.5, -3.3);
    addTrashCanProp(49.5, -0.4); // Lata de lixo metálica prateada no meio da rua/calçada!
    addRustMetalBarrelProp(68.5, 0.8);

    // Final da Cena 1A (x = 72..83): Tapume amarelo/madeira + Entrada do Galpão!
    const gateFence = new THREE.Mesh(new THREE.BoxGeometry(6.5, 4.6, 0.35), new THREE.MeshStandardMaterial({ color: 0x78350f }));
    gateFence.position.set(74.8, 2.3, -4.6); scene.add(gateFence);
    const wareEntryWall = new THREE.Mesh(new THREE.BoxGeometry(8, 8.5, 5.0), new THREE.MeshStandardMaterial({ color: 0x3f4f42 }));
    wareEntryWall.position.set(82.5, 4.2, -4.5); scene.add(wareEntryWall);
    const wareDoorOpen = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.0), new THREE.MeshBasicMaterial({ color: 0x030712 }));
    wareDoorOpen.position.set(78.4, 2.0, -2.0); wareDoorOpen.rotation.y = -Math.PI / 2; scene.add(wareDoorOpen);
    const wareSign = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.75), new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('DEPÓSITO ➔', '#22c55e', '#dcfce7') }));
    wareSign.position.set(77.2, 4.3, -3.6); scene.add(wareSign);

    // =========================================================================
    // CENA 1B (x = 194 .. 268): GALPÃO / DEPÓSITO INTERNO (00:44 - 01:04)
    // =========================================================================
    const wareFloor = new THREE.Mesh(new THREE.PlaneGeometry(76, 8.4), new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 }));
    wareFloor.rotation.x = -Math.PI / 2; wareFloor.position.set(231, 0, 0.4); scene.add(wareFloor);
    const wareBackWall = new THREE.Mesh(new THREE.BoxGeometry(76, 8.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x4d5d4e, roughness: 0.78 }));
    wareBackWall.position.set(231, 4.1, -5.2); scene.add(wareBackWall);
    const wareRoof = new THREE.Mesh(new THREE.BoxGeometry(76, 0.6, 12), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
    wareRoof.position.set(231, 8.3, -0.5); scene.add(wareRoof);

    // Vigas de aço + janelas basculantes + luminárias fluorescentes suspensas + pilhas de caixas no fundo!
    for (let gx = 200; gx <= 264; gx += 7.5) {
      const girder = new THREE.Mesh(new THREE.BoxGeometry(0.45, 8.2, 0.5), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.4 }));
      girder.position.set(gx, 4.1, -4.65); scene.add(girder);
      const topWin = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.28 }));
      topWin.position.set(gx + 3.7, 6.4, -4.75); scene.add(topWin);

      // Luminária fluorescente suspensa (exatamente igual ao 00:44!)
      const lampBar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, 0.55), new THREE.MeshBasicMaterial({ color: 0x99f6e4 }));
      lampBar.position.set(gx + 3.2, 5.2, -1.8); scene.add(lampBar);
      const wireL = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.0, 4), new THREE.MeshBasicMaterial({ color: 0x334155 }));
      wireL.position.set(gx + 2.1, 6.7, -1.8); scene.add(wireL);
      const wireR = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.0, 4), new THREE.MeshBasicMaterial({ color: 0x334155 }));
      wireR.position.set(gx + 4.3, 6.7, -1.8); scene.add(wireR);
    }

    // Pilhas de caixotes de papelão/madeira e tonéis azuis ao fundo do galpão
    [208, 217, 229, 240, 252].forEach((px, pi) => {
      const stackH = 1.6 + (pi % 3) * 0.9;
      const bgBox = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, stackH, 1.6),
        new THREE.MeshStandardMaterial({ color: pi % 2 === 0 ? 0xa8a29e : 0xb45309, roughness: 0.85 })
      );
      bgBox.position.set(px, stackH / 2, -3.9); scene.add(bgBox);
      if (pi % 2 === 1) {
        const bgDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), new THREE.MeshStandardMaterial({ color: 0x1d4ed8 }));
        bgDrum.position.set(px + 2.1, 0.55, -3.8); scene.add(bgDrum);
      }
    });

    // Quebráveis canônicos do Galpão (Cena 1B):
    addBigCrateProp(211.5, -1.4, 'pipe');       // 00:47 - Caixote Grande -> Cano de ferro!
    addWoodBarrelProp(221.5, -0.9, 1.15);        // 00:48 - Barris de madeira duplos
    addWoodBarrelProp(224.0, 0.7, 1.15, 'meat');
    addWoodBarrelProp(236.5, -0.3, 1.1, 'knife'); // 00:53 - Barril de madeira -> Faca!
    addRustMetalBarrelProp(250.5, 1.2, 'potion');

    // Porta de saída iluminada do galpão à direita (x = 260.2)
    const wareExitSign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.72), new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('SAÍDA ➔', '#f59e0b', '#fef08a') }));
    wareExitSign.position.set(259.2, 4.1, -3.5); scene.add(wareExitSign);
    const wareExitDoor = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.6), new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.85 }));
    wareExitDoor.position.set(262.0, 1.8, -1.5); wareExitDoor.rotation.y = -Math.PI / 2; scene.add(wareExitDoor);

    // =========================================================================
    // CENA 1C (x = 394 .. 480): FERRO-VELHO -> PORTA DUPLA DO DANDE -> SUBWAY!
    // =========================================================================
    const r1c = new THREE.Mesh(new THREE.PlaneGeometry(86, 7.6), new THREE.MeshStandardMaterial({ map: roadTex }));
    r1c.rotation.x = -Math.PI / 2; r1c.position.set(434, 0, 0.5); scene.add(r1c);
    const sw1c = new THREE.Mesh(new THREE.BoxGeometry(86, 0.24, 4.4), new THREE.MeshStandardMaterial({ map: sidewalkTex }));
    sw1c.position.set(434, 0.12, -5.0); scene.add(sw1c);
    const fw1c = new THREE.Mesh(new THREE.BoxGeometry(86, 0.2, 5.5), new THREE.MeshStandardMaterial({ map: sidewalkTex }));
    fw1c.position.set(434, -0.45, 7.1); scene.add(fw1c);

    addCitySkylineStrip(398, 442, -13.0);

    // Mureta e Carros Destruídos ao fundo (Azul + Vermelho — frame 01:05..01:10!)
    const junkWall = new THREE.Mesh(new THREE.BoxGeometry(30, 1.3, 0.6), new THREE.MeshStandardMaterial({ map: makeBrickTexture('#57534e', '#292524') }));
    junkWall.position.set(416, 0.65, -4.8); scene.add(junkWall);
    [
      { x: 413.5, color: 0x2563eb, rot: 0.14 },
      { x: 422.5, color: 0xdc2626, rot: -0.18 },
    ].forEach((vc) => {
      const wreck = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.1, 2.2), new THREE.MeshStandardMaterial({ color: vc.color, roughness: 0.55, metalness: 0.3 }));
      body.position.y = 0.7; wreck.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.85, 2.0), new THREE.MeshStandardMaterial({ color: vc.color, roughness: 0.5 }));
      cabin.position.set(-0.2, 1.55, 0); wreck.add(cabin);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 2.05), new THREE.MeshStandardMaterial({ color: 0x334155 }));
      hood.position.set(1.9, 1.25, 0); hood.rotation.z = 0.28; wreck.add(hood);
      wreck.position.set(vc.x, 0.6, -6.2);
      wreck.rotation.z = vc.rot;
      scene.add(wreck);
    });

    // Pilhas de Pneus (01:06 - Katana + Churrasco!)
    addTireStackProp(410.5, -0.7, 'sword');
    addTireStackProp(413.5, 1.1, 'meat');

    // Prédio elegante final do Dande (x = 434..472) com grande Porta Dupla de Madeira!
    const dandeWall = new THREE.Mesh(new THREE.BoxGeometry(36, 9.2, 3.8), new THREE.MeshStandardMaterial({ map: makeBrickTexture('#85684e', '#453528') }));
    dandeWall.position.set(452, 4.6, -6.3); scene.add(dandeWall);
    addBrokenWindow(438.5, 2.8, -4.38);
    addBrokenWindow(445.5, 2.8, -4.38);
    addBrokenWindow(462.5, 2.8, -4.38);

    // PORTA DUPLA DO DANDE (x = 455.5, z = -4.2) que explode quando o chefe entra!
    const dandeDoorGroup = new THREE.Group();
    const doorVoid = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), new THREE.MeshBasicMaterial({ color: 0x03050a }));
    doorVoid.position.set(0, 2.2, -0.05); dandeDoorGroup.add(doorVoid);
    const doorTrim = new THREE.Mesh(new THREE.BoxGeometry(5.2, 4.9, 0.32), new THREE.MeshStandardMaterial({ color: 0xd6c7b2 }));
    doorTrim.position.set(0, 2.45, -0.18); dandeDoorGroup.add(doorTrim);
    const dLeft = new THREE.Mesh(new THREE.BoxGeometry(2.1, 4.3, 0.22), new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.75 }));
    dLeft.position.set(-1.08, 2.15, 0.08); dandeDoorGroup.add(dLeft);
    const dRight = new THREE.Mesh(new THREE.BoxGeometry(2.1, 4.3, 0.22), new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.75 }));
    dRight.position.set(1.08, 2.15, 0.08); dandeDoorGroup.add(dRight);
    dandeDoorGroup.position.set(455.5, 0.15, -4.2);
    scene.add(dandeDoorGroup);

    const doorSplinters: { mesh: THREE.Mesh; vx: number; vy: number; vz: number }[] = [];
    let doorBroken = false;
    refs.bossDoor = {
      x: 455.5,
      z: -3.5,
      triggerBreak: () => {
        if (doorBroken) return;
        doorBroken = true;
        dLeft.visible = false;
        dRight.visible = false;
        for (let si = 0; si < 12; si++) {
          const sp = new THREE.Mesh(
            new THREE.BoxGeometry(0.55 + (si % 3) * 0.22, 0.35, 0.16),
            new THREE.MeshStandardMaterial({ color: si % 2 === 0 ? 0x78350f : 0x92400e })
          );
          sp.position.set(455.5 + (si - 6) * 0.3, 1.4 + (si % 4) * 0.6, -4.0);
          scene.add(sp);
          doorSplinters.push({
            mesh: sp,
            vx: (Math.random() - 0.5) * 6.5,
            vy: 4.5 + Math.random() * 5.0,
            vz: 3.5 + Math.random() * 4.5,
          });
        }
      },
    };
    animCallbacks.push((t, dt) => {
      for (let i = doorSplinters.length - 1; i >= 0; i--) {
        const s = doorSplinters[i];
        s.mesh.position.x += s.vx * dt;
        s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt;
        s.vy -= 14 * dt;
        s.mesh.rotation.x += 5 * dt;
        s.mesh.rotation.z += 4 * dt;
        if (s.mesh.position.y < -0.5) {
          scene.remove(s.mesh);
          doorSplinters.splice(i, 1);
        }
      }
      void t;
    });

    // Placa SUBWAY branca + mureta onde o Dande senta rindo + escada descendo pro Estágio 2 (01:28..01:51!)
    const subwayWallBox = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.55, 1.2), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
    subwayWallBox.position.set(467.2, 0.78, -3.55); scene.add(subwayWallBox);
    const subwayPoleSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 2.7, 0.35),
      new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('SUBWAY', '#0f172a', '#ffffff') })
    );
    subwayPoleSign.position.set(464.7, 1.95, -3.35); scene.add(subwayPoleSign);
    for (let st = 0; st < 6; st++) {
      const stepM = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 6.2), new THREE.MeshStandardMaterial({ color: 0x64748b }));
      stepM.position.set(465.0 + st * 0.95, -0.25 * st, 0.2); scene.add(stepM);
    }

    // Posição onde Dande senta/descansa na mureta SUBWAY chamando reforços & saída automática pro Metrô!
    addWoodBarrelProp(442.5, -1.1, 1.0, 'potion', true);
    refs.bossSeatPos = { x: 465.8, y: 1.55, z: -3.5 };
    refs.stageExitWalkTo = { x: 469.5, z: -0.2, descendY: -1.5 };

    void slumbgMat;
    return refs;
  }

  if (stageId === 'stage2_subway') {
    scene.background = new THREE.Color(0x070b16);
    scene.fog = new THREE.FogExp2(0x070b16, 0.0055);
    refs.customPropsOnly = true;

    // 4 CENAS ISOLADAS DO ESTÁGIO 2 FIÉIS AO VÍDEO "stage 2.mp4":
    // CENA 2A (x = 0..88): Entrada com catracas + relógio + 2º trem grafitado ao fundo + trem principal prateado com Cabine Telefônica, Lata de Lixo e último vagão aberto
    // CENA 2B (x = 180..304): Dentro de 4 vagões em movimento (bancos azuis, alças balançando, divisórias sanfonadas, frente aberta do trem com 3 barris de madeira!)
    // CENA 2C (x = 380..452): Galeria subterrânea de tijolos verdes iluminados + tubulações em "U" + faixa zebrada + trilhos + tambor e lata de lixo (Muramasa!)
    // CENA 2D (x = 520..562): Passarela metálica elevada à esquerda (pulo pro ringue!) + Ringue Subterrâneo do Sodom com caveiras nos cantos, 4 postes verdes e multidão roxa!

    refs.floorHeightAt = (x: number) => {
      // Na Cena 2D (Ringue), o jogador inicia na passarela elevada à esquerda (x = 519..523.8) e salta para o tablado!
      if (x >= 518 && x <= 523.8) return 1.65;
      return 0;
    };

    // =========================================================================
    // CENA 2A (x = -6 .. 92): PLATAFORMA DA ESTAÇÃO DO METRÔ (sheet_01..sheet_02)
    // =========================================================================
    const stationTileTex = makeCanvasTex(64, 64, (ctx) => {
      ctx.fillStyle = '#7c8ba1'; ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = '#5b687d'; ctx.lineWidth = 2;
      for (let gx = 0; gx < 64; gx += 16) ctx.strokeRect(gx, 0, 16, 64);
      for (let gy = 0; gy < 64; gy += 16) ctx.strokeRect(0, gy, 64, 16);
    }, 36, 4);

    const platFloor = new THREE.Mesh(new THREE.PlaneGeometry(104, 8.2), new THREE.MeshStandardMaterial({ map: stationTileTex, roughness: 0.7 }));
    platFloor.rotation.x = -Math.PI / 2; platFloor.position.set(44, 0, 0.5); scene.add(platFloor);
    const platCurb = new THREE.Mesh(new THREE.BoxGeometry(102, 0.12, 0.36), new THREE.MeshStandardMaterial({ color: 0xcbd5e1 }));
    platCurb.position.set(44, 0.04, -3.15); scene.add(platCurb);
    const yellowLine = new THREE.Mesh(new THREE.BoxGeometry(100, 0.03, 0.22), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
    yellowLine.position.set(44, 0.02, -2.75); scene.add(yellowLine);
    const platFrontDark = new THREE.Mesh(new THREE.PlaneGeometry(108, 6), new THREE.MeshStandardMaterial({ color: 0x090d16 }));
    platFrontDark.rotation.x = -Math.PI / 2; platFrontDark.position.set(44, 0.01, 7.2); scene.add(platFrontDark);

    // Parede esquerda de entrada da estação + Catracas prateadas em primeiro plano (sheet_01 frame 1!)
    const entryBlockWall = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 6.2, 4.8),
      new THREE.MeshStandardMaterial({ map: makeBrickTexture('#52605c', '#2c3532') })
    );
    entryBlockWall.position.set(-2.2, 3.1, -3.6); scene.add(entryBlockWall);
    [-1.4, 0.1, 1.6].forEach((tz) => {
      const gate = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.05, 0.36), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.65, roughness: 0.3 }));
      gate.position.set(0.45, 0.52, tz); scene.add(gate);
      const gateTop = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.14, 0.4), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.7 }));
      gateTop.position.set(0.45, 1.08, tz); scene.add(gateTop);
    });

    // Vão aberto inicial (x = 0..22): trilhos escuros, plataforma oposta com bancos laranjas, relógio redondo e 2º trem grafitado ao fundo!
    const railPit = new THREE.Mesh(new THREE.PlaneGeometry(104, 7.5), new THREE.MeshStandardMaterial({ color: 0x0b0f19 }));
    railPit.rotation.x = -Math.PI / 2; railPit.position.set(44, -0.65, -6.5); scene.add(railPit);
    const farPlatform = new THREE.Mesh(new THREE.BoxGeometry(40, 0.85, 2.6), new THREE.MeshStandardMaterial({ color: 0x475569 }));
    farPlatform.position.set(14, -0.1, -6.8); scene.add(farPlatform);
    const farBackWall = new THREE.Mesh(new THREE.BoxGeometry(106, 7.2, 0.8), new THREE.MeshStandardMaterial({ map: makeBrickTexture('#3b2f4a', '#1f1729') }));
    farBackWall.position.set(44, 3.2, -9.8); scene.add(farBackWall);

    // 2º Trem cinza estacionado nos trilhos de fundo com grafites roxos (sheet_01 frames 2-3!)
    const bgTrain = new THREE.Group();
    const bgCar = new THREE.Mesh(new THREE.BoxGeometry(18, 2.85, 1.6), new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.35, roughness: 0.55 }));
    bgCar.position.set(9.5, 1.5, -8.1); bgTrain.add(bgCar);
    for (let bwx = 2.5; bwx <= 16.5; bwx += 2.6) {
      const bwin = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.95), new THREE.MeshBasicMaterial({ color: 0x1e293b }));
      bwin.position.set(bwx, 1.85, -7.28); bgTrain.add(bwin);
      const graf = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.55), new THREE.MeshBasicMaterial({ color: bwx % 5 < 2 ? 0x9333ea : 0xdb2777, transparent: true, opacity: 0.65 }));
      graf.position.set(bwx, 0.75, -7.27); bgTrain.add(graf);
    }
    scene.add(bgTrain);

    // Bancos laranjas na plataforma oposta + pilares azuis + Relógio branco redondo da estação (sheet_01 frame 3!)
    [13.5, 19.5].forEach((bx) => {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.48, 0.55), new THREE.MeshStandardMaterial({ color: 0xea580c }));
      bench.position.set(bx, 0.55, -6.2); scene.add(bench);
    });
    [10.2, 16.8].forEach((px) => {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.65, 5.8, 0.65), new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.4 }));
      pil.position.set(px, 2.9, -4.6); scene.add(pil);
    });
    const clockFaceTex = makeCanvasTex(64, 64, (ctx) => {
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(32, 32, 27, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(32, 32); ctx.lineTo(32, 14); ctx.moveTo(32, 32); ctx.lineTo(45, 34); ctx.stroke();
    });
    const stationClock = new THREE.Mesh(new THREE.CircleGeometry(0.62, 20), new THREE.MeshBasicMaterial({ map: clockFaceTex }));
    stationClock.position.set(19.6, 4.15, -5.2); scene.add(stationClock);

    // TREM PRINCIPAL PRATEADO/AZULADO PARADO NA PLATAFORMA (x = 20 .. 87, sheet_01 frames 4-12 & sheet_02 frames 1-6!)
    const trainCarTex = makeCanvasTex(128, 128, (ctx) => {
      ctx.fillStyle = '#cbd5e1'; ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#94a3b8';
      for (let ry = 82; ry < 126; ry += 6) ctx.fillRect(0, ry, 128, 2);
      ctx.fillStyle = '#4c1d95'; ctx.fillRect(0, 10, 128, 12);
      ctx.fillStyle = '#64748b'; ctx.fillRect(0, 0, 128, 8);
    });
    const brokenSubwayWinTex = makeCanvasTex(64, 64, (ctx) => {
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, 60, 60);
      // Cartaz branco "SOU" / estilhaços como no vídeo!
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(16, 12, 32, 40);
      ctx.fillStyle = '#1e293b'; ctx.font = 'bold 11px monospace'; ctx.fillText('METRO', 18, 30);
      ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(6, 56); ctx.lineTo(24, 34); ctx.lineTo(48, 54); ctx.stroke();
    });

    [26.5, 38.5, 50.5, 62.5, 74.5, 84.5].forEach((cx, ci) => {
      const isLastCar = ci === 5;
      const carW = isLastCar ? 9.2 : 11.6;
      const carBody = new THREE.Mesh(
        new THREE.BoxGeometry(carW, 3.85, 2.35),
        new THREE.MeshStandardMaterial({ map: trainCarTex, metalness: 0.42, roughness: 0.38 })
      );
      carBody.position.set(cx, 1.95, -4.45); scene.add(carBody);
      const roofArch = new THREE.Mesh(
        new THREE.CylinderGeometry(1.16, 1.16, carW, 12, 1, false, 0, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.45 })
      );
      roofArch.rotation.z = Math.PI / 2;
      roofArch.scale.set(0.32, 1, 1);
      roofArch.position.set(cx, 3.86, -4.45); scene.add(roofArch);

      if (!isLastCar) {
        // Porta dupla marrom-avermelhada fechada no centro + 2 janelas com cartazes nas laterais!
        [-0.58, 0.58].forEach((dx) => {
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.08, 2.72, 0.08), new THREE.MeshStandardMaterial({ color: 0x6b3e46, roughness: 0.55 }));
          leaf.position.set(cx + dx, 1.42, -3.25); scene.add(leaf);
          const dWin = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.95), new THREE.MeshBasicMaterial({ color: 0x1e293b }));
          dWin.position.set(cx + dx, 2.12, -3.2); scene.add(dWin);
        });
        [-3.6, 3.6].forEach((wx) => {
          const winM = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.45), new THREE.MeshBasicMaterial({ map: brokenSubwayWinTex }));
          winM.position.set(cx + wx, 2.22, -3.24); scene.add(winM);
        });
      } else {
        // ÚLTIMO VAGÃO COM A PORTA ABERTA PARA EMBARCAR!
        const winLeft = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.45), new THREE.MeshBasicMaterial({ map: brokenSubwayWinTex }));
        winLeft.position.set(cx - 2.6, 2.22, -3.24); scene.add(winLeft);
        const openVoid = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.85), new THREE.MeshBasicMaterial({ color: 0x020617 }));
        openVoid.position.set(cx + 0.8, 1.45, -3.23); scene.add(openVoid);
        const glowFrame = new THREE.Mesh(new THREE.BoxGeometry(2.65, 2.95, 0.1), new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true }));
        glowFrame.position.set(cx + 0.8, 1.48, -3.2); scene.add(glowFrame);
        const enterSign = new THREE.Mesh(
          new THREE.PlaneGeometry(3.8, 0.76),
          new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('ENTRAR NO TREM ➔', '#22d3ee', '#fef08a') })
        );
        enterSign.position.set(cx + 0.8, 3.38, -3.16); scene.add(enterSign);
      }
    });

    const endStationWall = new THREE.Mesh(new THREE.BoxGeometry(8, 6.5, 9), new THREE.MeshStandardMaterial({ color: 0x090d16 }));
    endStationWall.position.set(91.5, 3.0, -1.2); scene.add(endStationWall);

    // Quebráveis da Plataforma (fiéis ao vídeo + suporte de vida equilibrado!):
    addPhoneBoothProp(23.8, 0.85, 'sword');       // TELEPHONE amarelo logo no começo do trem! (sheet_01 frames 4-5)
    addRustMetalBarrelProp(42.5, -1.35, 'potion'); // Cura no meio da plataforma
    addTrashCanProp(55.5, 0.65, 'meat');          // DUSTBIN prateada com hambúrguer/carne! (sheet_01 frames 10-11)
    addWoodBarrelProp(70.2, -1.2, 1.0, 'potion', true); // Cura antes do Andore Jr. na porta do trem!

    // =========================================================================
    // CENA 2B (x = 176 .. 308): DENTRO DOS 4 VAGÕES EM MOVIMENTO + FRENTE ABERTA!
    // =========================================================================
    const trainCabinGroup = new THREE.Group();
    const carFloorMat = new THREE.MeshStandardMaterial({ color: 0x4a3b39, roughness: 0.72 });
    const trainFloor = new THREE.Mesh(new THREE.PlaneGeometry(132, 7.2), carFloorMat);
    trainFloor.rotation.x = -Math.PI / 2; trainFloor.position.set(242, 0, 0.4); trainCabinGroup.add(trainFloor);
    const trainFrontDark = new THREE.Mesh(new THREE.PlaneGeometry(136, 6), new THREE.MeshStandardMaterial({ color: 0x020617 }));
    trainFrontDark.rotation.x = -Math.PI / 2; trainFrontDark.position.set(242, 0.01, 7.0); trainCabinGroup.add(trainFrontDark);

    const interiorWallTex = makeCanvasTex(128, 128, (ctx) => {
      ctx.fillStyle = '#9aa899'; ctx.fillRect(0, 0, 128, 72);
      ctx.fillStyle = '#5c4d5d'; ctx.fillRect(0, 72, 128, 56);
      // Grafites rabiscados na metade inferior como no vídeo (sheet_02..sheet_05)
      ctx.strokeStyle = '#c084fc'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(8, 110); ctx.lineTo(28, 82); ctx.lineTo(44, 114); ctx.lineTo(66, 86); ctx.stroke();
      ctx.strokeStyle = '#38bdf8';
      ctx.beginPath(); ctx.moveTo(74, 112); ctx.lineTo(95, 84); ctx.lineTo(118, 108); ctx.stroke();
    });
    const shatteredDarkWinTex = makeCanvasTex(64, 64, (ctx) => {
      ctx.fillStyle = '#050816'; ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, 60, 60);
      // Pontas de vidro quebrado na borda inferior!
      ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(4, 60); ctx.lineTo(14, 42); ctx.lineTo(24, 58); ctx.lineTo(36, 38); ctx.lineTo(49, 57); ctx.lineTo(60, 44);
      ctx.stroke();
    });

    const rearTrainWall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.6, 8.2), new THREE.MeshStandardMaterial({ color: 0x0f4c5c }));
    rearTrainWall.position.set(177.5, 2.3, 0.2); trainCabinGroup.add(rearTrainWall);

    const straps: THREE.Group[] = [];
    for (let x = 182; x <= 286; x += 5.2) {
      const isCarJoint = Math.abs(x - 208) < 2.5 || Math.abs(x - 239) < 2.5 || Math.abs(x - 270) < 2.5;
      if (isCarJoint) {
        // Divisória azul-petróleo entre vagões + passadeira metálica no chão + grade sanfonada ("X")! (sheet_03 frames 4-11)
        const stripFloor = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 7.1), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6 }));
        stripFloor.rotation.x = -Math.PI / 2; stripFloor.position.set(x, 0.02, 0.4); trainCabinGroup.add(stripFloor);
        const bulkheadBack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.3, 1.8), new THREE.MeshStandardMaterial({ color: 0x155e75 }));
        bulkheadBack.position.set(x, 2.15, -2.55); trainCabinGroup.add(bulkheadBack);
        const pantograph = new THREE.Mesh(
          new THREE.PlaneGeometry(1.1, 2.5, 3, 6),
          new THREE.MeshBasicMaterial({ color: 0xcbd5e1, wireframe: true })
        );
        pantograph.position.set(x, 1.3, -3.05); trainCabinGroup.add(pantograph);
        continue;
      }

      const wallSeg = new THREE.Mesh(new THREE.BoxGeometry(5.05, 4.25, 0.28), new THREE.MeshStandardMaterial({ map: interiorWallTex }));
      wallSeg.position.set(x, 2.12, -3.15); trainCabinGroup.add(wallSeg);

      const isDoorSlot = Math.round(x) % 10 === 0;
      if (isDoorSlot) {
        [-0.55, 0.55].forEach((dx) => {
          const dLeaf = new THREE.Mesh(new THREE.BoxGeometry(1.02, 2.85, 0.08), new THREE.MeshStandardMaterial({ color: 0x6b4c57 }));
          dLeaf.position.set(x + dx, 1.45, -2.98); trainCabinGroup.add(dLeaf);
          const dWin = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 1.0), new THREE.MeshBasicMaterial({ map: shatteredDarkWinTex }));
          dWin.position.set(x + dx, 2.18, -2.92); trainCabinGroup.add(dWin);
        });
      } else {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.6), new THREE.MeshBasicMaterial({ map: shatteredDarkWinTex, transparent: true, opacity: 0.88 }));
        win.position.set(x, 2.42, -2.98); trainCabinGroup.add(win);
        // Banco estofado azul-turquesa com apoios cromados nas pontas! (sheet_02..sheet_05)
        const seatBase = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.46, 0.92), new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.45 }));
        seatBase.position.set(x, 0.34, -2.48); trainCabinGroup.add(seatBase);
        const seatBack = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.62, 0.22), new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.45 }));
        seatBack.position.set(x, 0.82, -2.86); trainCabinGroup.add(seatBack);
        [-1.92, 1.92].forEach((ax) => {
          const armRail = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8 }));
          armRail.rotation.y = Math.PI / 2;
          armRail.position.set(x + ax, 0.58, -2.48); trainCabinGroup.add(armRail);
        });
      }

      // Alças brancas duplas penduradas no trilho superior!
      [-1.1, 1.1].forEach((sx) => {
        const strapGrp = new THREE.Group();
        const cord = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.48, 0.06), new THREE.MeshBasicMaterial({ color: 0xcbd5e1 }));
        cord.position.y = -0.24; strapGrp.add(cord);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 10), new THREE.MeshBasicMaterial({ color: 0xf8fafc }));
        ring.position.y = -0.55; strapGrp.add(ring);
        strapGrp.position.set(x + sx, 3.82, -1.75);
        trainCabinGroup.add(strapGrp);
        straps.push(strapGrp);
      });
    }

    // CABINE DIANTEIRA RASGADA / ABERTA NA PONTA DO TREM (x = 289 .. 304, sheet_05 frames 9-12 & sheet_06 frames 1-6!)
    const frontCabWall = new THREE.Mesh(new THREE.BoxGeometry(14, 4.3, 0.35), new THREE.MeshStandardMaterial({ color: 0x0e7490, metalness: 0.35 }));
    frontCabWall.position.set(295.5, 2.15, -3.12); trainCabinGroup.add(frontCabWall);
    const controlBox = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.25, 0.9), new THREE.MeshStandardMaterial({ color: 0x155e75 }));
    controlBox.position.set(294.5, 0.62, -2.55); trainCabinGroup.add(controlBox);
    const tornFrontEdge = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.3, 2.6), new THREE.MeshStandardMaterial({ color: 0x0891b2 }));
    tornFrontEdge.position.set(302.5, 2.15, -1.9); trainCabinGroup.add(tornFrontEdge);

    const overheadBar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 122, 8), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8 }));
    overheadBar.rotation.z = Math.PI / 2; overheadBar.position.set(240, 3.84, -1.75); trainCabinGroup.add(overheadBar);
    const trainRoof = new THREE.Mesh(new THREE.BoxGeometry(126, 0.25, 2.6), new THREE.MeshStandardMaterial({ color: 0x14532d }));
    trainRoof.position.set(240, 4.2, -2.1); trainCabinGroup.add(trainRoof);
    scene.add(trainCabinGroup);

    // Barris de madeira dentro do trem (exatamente como em sheet_04 frame 3 e sheet_05 frames 10-12!)
    addWoodBarrelProp(236.5, -0.4, 1.0, 'potion');        // Barril na junção do Vagão 2->3 (cura estilo Soft Drink!)
    addWoodBarrelProp(295.2, 0.95, 1.0, 'pipe');          // Trio de barris na ponta aberta do trem: Cano + Katana + Cura!
    addWoodBarrelProp(296.8, -0.15, 1.0, 'meat', true);
    addWoodBarrelProp(298.1, 0.85, 1.0, 'sword');

    // Luzes azuis/brancas e vigas do túnel passando rápido pelas janelas quebradas e pela frente aberta!
    const lightsGroup = new THREE.Group();
    for (let lx = 172; lx < 316; lx += 5.2) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.24, 0.18), new THREE.MeshBasicMaterial({ color: lx % 10 < 5 ? 0x60a5fa : 0xe0f2fe }));
      tl.position.set(lx, 2.65, -4.6); lightsGroup.add(tl);
      const tunnelPost = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.8, 0.32), new THREE.MeshBasicMaterial({ color: 0x1e1b4b }));
      tunnelPost.position.set(lx + 2.5, 2.1, -4.8); lightsGroup.add(tunnelPost);
    }
    scene.add(lightsGroup);

    animCallbacks.push((t, dt) => {
      trainCabinGroup.position.y = Math.sin(t * 15) * 0.025;
      straps.forEach((st, i) => { st.rotation.z = Math.sin(t * 7.2 + i * 0.7) * 0.24; });
      lightsGroup.children.forEach((c: any) => {
        c.position.x -= 30 * dt;
        if (c.position.x < 172) c.position.x = 316;
      });
    });

    // =========================================================================
    // CENA 2C (x = 376 .. 456): GALERIA SUBTERRÂNEA DE TIJOLOS VERDES & TRILHOS (sheet_06..sheet_07)
    // =========================================================================
    const galleryTrackTex = makeCanvasTex(128, 128, (ctx) => {
      // Faixa zebrada amarela/marrom no topo + brita e dormentes de trilho embaixo!
      ctx.fillStyle = '#5c4d3c'; ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#eab308';
      for (let zx = -32; zx < 160; zx += 24) {
        ctx.beginPath();
        ctx.moveTo(zx, 0); ctx.lineTo(zx + 12, 0); ctx.lineTo(zx + 28, 26); ctx.lineTo(zx + 16, 26);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#94a3b8'; ctx.fillRect(0, 26, 128, 4); ctx.fillRect(0, 56, 128, 5); ctx.fillRect(0, 108, 128, 5);
      ctx.fillStyle = '#3f2e21';
      for (let sx = 6; sx < 128; sx += 22) ctx.fillRect(sx, 50, 10, 68);
    }, 18, 1);

    const galFloor = new THREE.Mesh(new THREE.PlaneGeometry(84, 7.8), new THREE.MeshStandardMaterial({ map: galleryTrackTex, roughness: 0.85 }));
    galFloor.rotation.x = -Math.PI / 2; galFloor.position.set(416, 0, 0.5); scene.add(galFloor);
    const galFrontDark = new THREE.Mesh(new THREE.PlaneGeometry(88, 6), new THREE.MeshStandardMaterial({ color: 0x090d16 }));
    galFrontDark.rotation.x = -Math.PI / 2; galFrontDark.position.set(416, 0.01, 7.1); scene.add(galFrontDark);

    // Parede de tijolos verdes subterrâneos + feixes de luz esverdeados + tubulações industriais em "U"!
    const greenBrickWall = new THREE.Mesh(
      new THREE.BoxGeometry(82, 7.4, 0.8),
      new THREE.MeshStandardMaterial({ map: makeBrickTexture('#2f5e4e', '#173329'), roughness: 0.8 })
    );
    greenBrickWall.position.set(417, 3.7, -3.65); scene.add(greenBrickWall);

    // Parede azul quebrada/arrebentada à esquerda de onde o jogador saiu dos trilhos! (sheet_06 frame 7)
    const brokenTunnelOpening = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.8), new THREE.MeshBasicMaterial({ color: 0x0c1938 }));
    brokenTunnelOpening.position.set(380.2, 2.9, -3.18); scene.add(brokenTunnelOpening);
    for (let j = 0; j < 7; j++) {
      const shard = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.35), new THREE.MeshStandardMaterial({ color: 0xcbd5e1 }));
      shard.position.set(382.6 + (j % 2) * 0.35, 0.5 + j * 0.82, -3.12);
      shard.rotation.z = 0.4;
      scene.add(shard);
    }

    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x86efac, metalness: 0.55, roughness: 0.35 });
    for (let gx = 388; gx <= 446; gx += 12) {
      // Luminária superior esverdeada
      const glowCone = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 3.2),
        new THREE.MeshBasicMaterial({ color: 0xbbf7d0, transparent: true, opacity: 0.22 })
      );
      glowCone.position.set(gx, 5.2, -3.2); scene.add(glowCone);
      // Tubulação industrial em "U" na parede (sheet_06..sheet_07!)
      const pHorizL = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 4.2, 8), pipeMat);
      pHorizL.rotation.z = Math.PI / 2; pHorizL.position.set(gx - 3.6, 1.35, -3.15); scene.add(pHorizL);
      const pVertL = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.6, 8), pipeMat);
      pVertL.position.set(gx - 1.5, 2.15, -3.15); scene.add(pVertL);
      const pTop = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 3.0, 8), pipeMat);
      pTop.rotation.z = Math.PI / 2; pTop.position.set(gx, 2.95, -3.15); scene.add(pTop);
      const pVertR = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.6, 8), pipeMat);
      pVertR.position.set(gx + 1.5, 2.15, -3.15); scene.add(pVertR);
      const pHorizR = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 4.8, 8), pipeMat);
      pHorizR.rotation.z = Math.PI / 2; pHorizR.position.set(gx + 3.9, 1.35, -3.15); scene.add(pHorizR);
    }

    const ringGateSign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 0.78),
      new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('ARENA DO SODOM ➔', '#22c55e', '#fef08a') })
    );
    ringGateSign.position.set(447.5, 3.6, -3.12); scene.add(ringGateSign);

    // Quebráveis da Galeria Subterrânea (sheet_06 frames 9-11: Tambor enferrujado + Lata de Lixo DUSTBIN com MURAMASA + Barril pré-chefe!)
    addRustMetalBarrelProp(395.5, 1.45, 'potion');
    addTrashCanProp(414.0, -1.25, 'sword'); // Lata de lixo dropando Katana MURAMASA!
    addWoodBarrelProp(434.5, 0.35, 1.0, 'meat', true); // Cura garantida logo antes do Ringue do Sodom!

    // =========================================================================
    // CENA 2D (x = 518 .. 564): PASSARELA ELEVADA + RINGUE SUBTERRÂNEO DO SODOM (sheet_07..sheet_08)
    // =========================================================================
    const arenaVoid = new THREE.Mesh(new THREE.PlaneGeometry(60, 12), new THREE.MeshStandardMaterial({ color: 0x07040d }));
    arenaVoid.rotation.x = -Math.PI / 2; arenaVoid.position.set(542, -0.35, 0.4); scene.add(arenaVoid);

    // Passarela metálica elevada no canto superior esquerdo de onde o jogador salta pro ringue! (sheet_07 frame 6)
    const catwalkPlat = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.32, 3.4), new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6 }));
    catwalkPlat.position.set(521.0, 1.5, -1.1); scene.add(catwalkPlat);
    const catwalkRail = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.05, 0.1), new THREE.MeshStandardMaterial({ color: 0x94a3b8, wireframe: true }));
    catwalkRail.position.set(521.0, 2.15, -2.65); scene.add(catwalkRail);

    // Tablado do Ringue do Sodom com emblemas brancos nos cantos + saia lateral bordô!
    const sodomMatTex = makeCanvasTex(128, 128, (ctx) => {
      ctx.fillStyle = '#9ca38f'; ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = '#6b7260'; ctx.lineWidth = 4; ctx.strokeRect(4, 4, 120, 120);
      // Emblemas brancos estilizados nos 4 cantos do tablado (igual sheet_07 frames 7-8!)
      ctx.fillStyle = '#e5e7eb';
      [[18, 22], [110, 22], [18, 106], [110, 106]].forEach(([cx, cy]) => {
        ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#57534e';
        ctx.fillRect(cx - 5, cy - 3, 3, 3); ctx.fillRect(cx + 2, cy - 3, 3, 3);
        ctx.fillStyle = '#e5e7eb';
      });
    });
    const ringApron = new THREE.Mesh(new THREE.BoxGeometry(35.2, 0.65, 6.4), new THREE.MeshStandardMaterial({ color: 0x581c87 }));
    ringApron.position.set(541.5, -0.32, 0.25); scene.add(ringApron);
    const ringCanvas = new THREE.Mesh(new THREE.PlaneGeometry(34.6, 6.1), new THREE.MeshStandardMaterial({ map: sodomMatTex, roughness: 0.68 }));
    ringCanvas.rotation.x = -Math.PI / 2; ringCanvas.position.set(541.5, 0.02, 0.25); scene.add(ringCanvas);

    // 4 Postes acolchoados verdes nos 4 cantos + Banquinhos verdes + 3 Cordas!
    [
      [524.5, -2.65],
      [558.5, -2.65],
      [524.5, 3.15],
      [558.5, 3.15],
    ].forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 2.35, 12), new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.45 }));
      post.position.set(px, 1.15, pz); scene.add(post);
      [0.82, 1.34, 1.86].forEach((py) => {
        const turnbuckle = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.24, 0.54), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
        turnbuckle.position.set(px, py, pz); scene.add(turnbuckle);
      });
    });
    // Banquinhos verdes nos cantos internos do ringue (sheet_07 frame 8 & 12!)
    [[525.8, -2.1], [557.2, -2.1]].forEach(([sx, sz]) => {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.52, 10), new THREE.MeshStandardMaterial({ color: 0x166534 }));
      stool.position.set(sx, 0.26, sz); scene.add(stool);
    });
    [0.82, 1.34, 1.86].forEach((ry) => {
      const ropeBack = new THREE.Mesh(new THREE.BoxGeometry(34.2, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: 0xa3a380 }));
      ropeBack.position.set(541.5, ry, -2.65); scene.add(ropeBack);
      const ropeFront = new THREE.Mesh(new THREE.BoxGeometry(34.2, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xa3a380, transparent: true, opacity: 0.55 }));
      ropeFront.position.set(541.5, ry, 3.15); scene.add(ropeFront);
      [-1, 1].forEach((side) => {
        const ropeSide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 5.8), new THREE.MeshBasicMaterial({ color: 0xa3a380 }));
        ropeSide.position.set(side < 0 ? 524.5 : 558.5, ry, 0.25); scene.add(ropeSide);
      });
    });

    // Arquibancada escura com multidão roxa/lilás vibrando + refletores vermelhos no alto (sheet_07..sheet_08!)
    const standWall = new THREE.Mesh(new THREE.BoxGeometry(52, 6.2, 1.5), new THREE.MeshStandardMaterial({ color: 0x090514 }));
    standWall.position.set(541.5, 3.0, -7.6); scene.add(standWall);
    [531, 542, 553].forEach((lx) => {
      const redSpot = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.6), new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.35 }));
      redSpot.position.set(lx, 5.3, -6.6); scene.add(redSpot);
    });
    const crowdGroup = new THREE.Group();
    const crowdColors = [0x6b21a8, 0x7e22ce, 0x581c87, 0x86198f, 0x4c1d95];
    for (let cx = 523, ci = 0; cx <= 560; cx += 1.25, ci++) {
      for (let row = 0; row < 2; row++) {
        const spec = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.35), new THREE.MeshBasicMaterial({ color: crowdColors[(ci + row) % crowdColors.length] }));
        body.position.y = 0.36; spec.add(body);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), new THREE.MeshBasicMaterial({ color: 0xd97706 }));
        head.position.y = 0.92; spec.add(head);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.52, 0.18), new THREE.MeshBasicMaterial({ color: 0xd97706 }));
        arm.position.set(0.36, 0.94, 0); spec.add(arm);
        spec.position.set(cx + row * 0.4, 0.45 + row * 1.05, -4.5 - row * 1.05);
        crowdGroup.add(spec);
      }
    }
    scene.add(crowdGroup);
    animCallbacks.push((t) => {
      crowdGroup.children.forEach((sp, i) => {
        sp.position.y = (i % 2 === 0 ? 0.45 : 1.5) + Math.abs(Math.sin(t * 6.5 + i * 0.7)) * 0.26;
      });
    });

    const ringFrontDark = new THREE.Mesh(new THREE.PlaneGeometry(60, 6), new THREE.MeshStandardMaterial({ color: 0x05030a }));
    ringFrontDark.rotation.x = -Math.PI / 2; ringFrontDark.position.set(542, 0.01, 6.9); scene.add(ringFrontDark);
    return refs;
  }

  if (stageId === 'stage3_westside') {
    scene.background = new THREE.Color(0x160f29);
    scene.fog = new THREE.FogExp2(0x160f29, 0.0085);

    // 3 CENAS ISOLADAS COM TRANSIÇÕES DE FADE OUT / FADE IN:
    // CENA 3A (x=0..78): Calçadão West Side -> Interior do Restaurante (captura no final!)
    // CENA 3B (x=200..246): Ringue Rústico de Luta Livre dos Andores!
    // CENA 3C (x=400..554): Saída do Restaurante -> Ruas de West Side -> Festival Chinatown (Eddie)

    // ---- CENA 3A: CALÇADÃO & RESTAURANTE (x=-6..86) ----
    const rStreet = new THREE.Mesh(new THREE.PlaneGeometry(38, 7.6), new THREE.MeshStandardMaterial({ map: makeAsphaltTexture() }));
    rStreet.rotation.x = -Math.PI / 2; rStreet.position.set(13, 0, 0.5); scene.add(rStreet);
    const rRest = new THREE.Mesh(new THREE.PlaneGeometry(58, 7.6), new THREE.MeshStandardMaterial({ map: makeCheckerFloorTexture() }));
    rRest.rotation.x = -Math.PI / 2; rRest.position.set(57, 0, 0.5); scene.add(rRest);
    const front3A = new THREE.Mesh(new THREE.PlaneGeometry(96, 6), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
    front3A.rotation.x = -Math.PI / 2; front3A.position.set(38, 0.01, 7.0); scene.add(front3A);

    for (let x = -2; x <= 80; x += 6.2) {
      const isRest = x >= 30;
      const bldg = new THREE.Mesh(
        new THREE.BoxGeometry(5.8, 7.0, 3.6),
        new THREE.MeshStandardMaterial({ color: isRest ? 0x7f1d1d : 0x334155 })
      );
      bldg.position.set(x, 3.2, -8.0); scene.add(bldg);
      const neon = new THREE.Mesh(
        new THREE.PlaneGeometry(3.1, 0.65),
        new THREE.MeshBasicMaterial({ map: makeNeonSignTexture(isRest ? 'RESTAURANTE' : 'WEST SIDE', '#f43f5e', '#fff') })
      );
      neon.position.set(x, 3.2, -6.15); scene.add(neon);
      if (isRest) {
        // Mesas/balcões vermelhos ao fundo do restaurante
        const booth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.75, 1.1), new THREE.MeshStandardMaterial({ color: 0xb91c1c }));
        booth.position.set(x, 0.38, -2.9); scene.add(booth);
      }
    }
    addFireBarrel(16, 0, -1.9);
    addTrafficCone(24, 0, 1.55);
    addSteamVent(10, 0, -2.6);

    // ---- CENA 3B: RINGUE RÚSTICO DOS ANDORES (x=200..246, isolado!) ----
    const rusticOuter = new THREE.Mesh(new THREE.PlaneGeometry(58, 8.2), new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.95 }));
    rusticOuter.rotation.x = -Math.PI / 2; rusticOuter.position.set(223, 0, 0.4); scene.add(rusticOuter);
    // Tatame / tablado de madeira desgastada estilo luta livre clandestina
    const rusticMat = new THREE.Mesh(
      new THREE.PlaneGeometry(38, 5.8),
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 })
    );
    rusticMat.rotation.x = -Math.PI / 2; rusticMat.position.set(222, 0.02, 0.2); scene.add(rusticMat);
    const rusticFront = new THREE.Mesh(new THREE.PlaneGeometry(62, 6), new THREE.MeshStandardMaterial({ color: 0x09090b }));
    rusticFront.rotation.x = -Math.PI / 2; rusticFront.position.set(223, 0.01, 7.0); scene.add(rusticFront);

    // Cordas grossas rústicas (vermelho/âmbar) + postes metálicos enferrujados!
    [
      { y: 0.85, col: 0xb91c1c },
      { y: 1.38, col: 0xd97706 },
      { y: 1.9, col: 0xb91c1c },
    ].forEach(({ y, col }) => {
      const ropeBack = new THREE.Mesh(new THREE.BoxGeometry(38, 0.09, 0.09), new THREE.MeshBasicMaterial({ color: col }));
      ropeBack.position.set(222, y, -2.65); scene.add(ropeBack);
      const ropeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 5.8), new THREE.MeshBasicMaterial({ color: col }));
      ropeLeft.position.set(203, y, 0.2); scene.add(ropeLeft);
      const ropeRight = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 5.8), new THREE.MeshBasicMaterial({ color: col }));
      ropeRight.position.set(241, y, 0.2); scene.add(ropeRight);
    });
    [[203, -2.65], [241, -2.65], [203, 3.05], [241, 3.05]].forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 2.35, 10), new THREE.MeshStandardMaterial({ color: 0x78716c, metalness: 0.6 }));
      post.position.set(px, 1.18, pz); scene.add(post);
    });
    // Grade rústica + placas e latões acesos iluminando a jaula clandestina
    const cageBack = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 5.4, 18, 5),
      new THREE.MeshBasicMaterial({ color: 0x57534e, wireframe: true })
    );
    cageBack.position.set(222, 2.7, -4.6); scene.add(cageBack);
    const andoreSign = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 1.0),
      new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('ARENA LUTA LIVRE — ANDORES', '#ef4444', '#fde047') })
    );
    andoreSign.position.set(222, 4.4, -4.5); scene.add(andoreSign);
    addFireBarrel(205, 0, -2.2);
    addFireBarrel(239, 0, -2.2);

    // ---- CENA 3C: SAÍDA DO RESTAURANTE -> RUAS -> FESTIVAL CHINATOWN (x=400..554) ----
    const rExitStreet = new THREE.Mesh(new THREE.PlaneGeometry(82, 7.6), new THREE.MeshStandardMaterial({ map: makeAsphaltTexture() }));
    rExitStreet.rotation.x = -Math.PI / 2; rExitStreet.position.set(438, 0, 0.5); scene.add(rExitStreet);
    const rFest = new THREE.Mesh(new THREE.PlaneGeometry(92, 7.6), new THREE.MeshStandardMaterial({ map: makeSidewalkTexture(), color: 0xc084fc }));
    rFest.rotation.x = -Math.PI / 2; rFest.position.set(524, 0, 0.5); scene.add(rFest);
    const front3C = new THREE.Mesh(new THREE.PlaneGeometry(176, 6), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
    front3C.rotation.x = -Math.PI / 2; front3C.position.set(482, 0.01, 7.0); scene.add(front3C);

    const restExitSign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 0.72),
      new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('SAÍDA RESTAURANTE ➔', '#22d3ee', '#fef08a') })
    );
    restExitSign.position.set(403, 3.3, -4.2); scene.add(restExitSign);

    const lanterns: THREE.Mesh[] = [];
    for (let x = 400, idx = 0; x <= 564; x += 6.2, idx++) {
      const isFest = x >= 478;
      const bldg = new THREE.Mesh(
        new THREE.BoxGeometry(5.8, isFest ? 5.2 : 7.0, 3.6),
        new THREE.MeshStandardMaterial({ color: isFest ? 0x6d28d9 : 0x334155 })
      );
      bldg.position.set(x, 3.2, -8.0); scene.add(bldg);
      const neon = new THREE.Mesh(
        new THREE.PlaneGeometry(3.1, 0.65),
        new THREE.MeshBasicMaterial({ map: makeNeonSignTexture(isFest ? 'FESTIVAL!' : 'WEST SIDE', isFest ? '#facc15' : '#f43f5e', '#fff') })
      );
      neon.position.set(x, 3.2, -6.15); scene.add(neon);

      if (isFest) {
        const lan = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), new THREE.MeshBasicMaterial({ color: idx % 2 === 0 ? 0xfacc15 : 0xf43f5e }));
        lan.position.set(x, 4.2, -3.5); scene.add(lan);
        lanterns.push(lan);
      }
    }
    [418, 456, 496].forEach(vx => addSteamVent(vx, 0, -2.7));
    [412, 444, 488, 526].forEach((bx, bi) => addFireBarrel(bx, 0, bi % 2 === 0 ? -1.9 : 1.7));
    [428, 466, 510].forEach(cx => addTrafficCone(cx, 0, -1.65));
    // Barris extras de cura antes da emboscada dos Andores e antes do Chefe Eddie!
    addWoodBarrelProp(55.5, 0.9, 1.0, 'meat', true);
    addWoodBarrelProp(472.5, -0.9, 1.0, 'potion', true);
    addWoodBarrelProp(516.0, 0.85, 1.0, 'meat', true);

    // Varanda/sacada elevada do Festival Chinatown fora do alcance do jogador onde Eddie sai do campo para convocar reforços!
    const eddieBalcony = new THREE.Mesh(new THREE.BoxGeometry(6.8, 1.35, 2.2), new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.75 }));
    eddieBalcony.position.set(545.5, 0.68, -3.95); scene.add(eddieBalcony);
    const eddieRail = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.25, 0.18), new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.4 }));
    eddieRail.position.set(545.5, 1.48, -2.92); scene.add(eddieRail);
    refs.bossSeatPos = { x: 545.5, y: 1.38, z: -3.75 };

    animCallbacks.push((t) => {
      lanterns.forEach((l, i) => { l.position.y = 4.2 + Math.sin(t * 4 + i) * 0.18; });
    });
    return refs;
  }

  if (stageId === 'stage4_industrial') {
    scene.background = new THREE.Color(0x140c08);
    scene.fog = new THREE.FogExp2(0x140c08, 0.009);

    const indFloor = new THREE.Mesh(new THREE.PlaneGeometry(148, 7.6), new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.45, roughness: 0.7 }));
    indFloor.rotation.x = -Math.PI / 2; indFloor.position.set(68, 0, 0.5); scene.add(indFloor);

    const frontDark = new THREE.Mesh(new THREE.PlaneGeometry(len + 46, 6), new THREE.MeshStandardMaterial({ color: 0x18181b }));
    frontDark.rotation.x = -Math.PI / 2; frontDark.position.set(len / 2, 0.01, 7.0); scene.add(frontDark);

    [18, 32, 48, 62, 88, 108, 124].forEach((fx, i) => {
      const fz = i % 2 === 0 ? -0.6 : 1.0;
      const grate = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 1.6), new THREE.MeshStandardMaterial({ color: 0x7f1d1d }));
      grate.position.set(fx, 0.04, fz); scene.add(grate);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.9, 6), new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.85 }));
      flame.position.set(fx, 0.95, fz); flame.visible = false; scene.add(flame);
      refs.fireTraps.push({ x: fx, z: fz, mesh: grate, flameMesh: flame });
    });

    const gears: THREE.Mesh[] = [];
    [10, 28, 46, 66, 92, 118].forEach((gx) => {
      const gear = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.25, 6, 10), new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.65 }));
      gear.position.set(gx, 3.2, -5.8); scene.add(gear);
      gears.push(gear);
    });
    [20, 52, 98].forEach(vx => addSteamVent(vx, 0, -2.9));
    [14, 56, 102, 174, 218, 258].forEach((bx, bi) => addFireBarrel(bx, 0, bi % 2 === 0 ? -1.9 : 1.7));
    [36, 84, 158, 238].forEach(cx => addTrafficCone(cx, 0, -1.65));
    addWoodBarrelProp(98.5, 0.85, 1.0, 'meat', true);
    addWoodBarrelProp(136.5, -0.8, 1.0, 'potion', true);
    addWoodBarrelProp(254.0, 0.75, 1.0, 'meat', true);
    animCallbacks.push((_t, dt) => { gears.forEach((g, idx) => { g.rotation.z += (idx % 2 === 0 ? 1.4 : -1.4) * dt; }); });

    refs.isElevatorAt = (x: number) => x >= 138;
    const elevPlatform = new THREE.Mesh(new THREE.BoxGeometry(176, 0.4, 7.6), new THREE.MeshStandardMaterial({ color: 0x78350f, metalness: 0.5 }));
    elevPlatform.position.set(226, -0.15, 0.5); scene.add(elevPlatform);

    const beamsGroup = new THREE.Group();
    for (let bx = 140; bx < len + 18; bx += 7) {
      for (let by = -2; by <= 14; by += 4) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.35, 0.4), new THREE.MeshStandardMaterial({ color: 0x52525b, metalness: 0.7 }));
        beam.position.set(bx, by, -3.5);
        beamsGroup.add(beam);
      }
    }
    scene.add(beamsGroup);
    refs.elevatorBeamsGroup = beamsGroup;

    // Plataforma metálica superior inalcançável + escada industrial onde Rolento salta para chamar reforços!
    const rolentoCatwalk = new THREE.Mesh(
      new THREE.BoxGeometry(7.4, 0.36, 2.3),
      new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.72, roughness: 0.38 })
    );
    rolentoCatwalk.position.set(284.5, 3.25, -2.95); scene.add(rolentoCatwalk);
    const rolentoGuardRail = new THREE.Mesh(
      new THREE.BoxGeometry(7.4, 0.22, 0.16),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.5 })
    );
    rolentoGuardRail.position.set(284.5, 4.05, -1.88); scene.add(rolentoGuardRail);
    [-3.4, 0, 3.4].forEach((ox) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, 0.16), new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.7 }));
      post.position.set(284.5 + ox, 3.65, -1.88); scene.add(post);
    });
    for (let ly = 0.4; ly <= 3.1; ly += 0.45) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.1), new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.6 }));
      rung.position.set(287.8, ly, -3.15); scene.add(rung);
    }
    refs.bossSeatPos = { x: 284.5, y: 3.45, z: -2.85 };

    for (let x = -2; x < 138; x += 6.5) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(6.0, 7.2, 2.5), new THREE.MeshStandardMaterial({ map: makeBrickTexture('#451a03', '#271206') }));
      wall.position.set(x, 3.6, -7.2); scene.add(wall);
    }
    return refs;
  }

  if (stageId === 'bonus_car') {
    // POSTO DE GASOLINA DE METRO CITY FIEL AO VÍDEO "stage 2.mp4" (sheet_08 frames 7-12 & sheet_09 frames 1-3!)
    scene.background = new THREE.Color(0x60a5fa);
    refs.customPropsOnly = true;

    const stationPavement = new THREE.Mesh(new THREE.PlaneGeometry(44, 10.5), new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.85 }));
    stationPavement.rotation.x = -Math.PI / 2; stationPavement.position.set(11, 0, 0.3); scene.add(stationPavement);
    // Faixas brancas de estacionamento sob o carro!
    [-1, 1].forEach((s) => {
      const pLine = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 3.8), new THREE.MeshBasicMaterial({ color: 0xe5e7eb }));
      pLine.rotation.x = -Math.PI / 2; pLine.rotation.z = s * 0.25;
      pLine.position.set(11.5 + s * 3.6, 0.02, 0.6); scene.add(pLine);
    });

    // Skyline diurno de Metro City + arbustos verdes ao fundo!
    addCitySkylineStrip(-4, 28, -14.5);
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(36, 1.35, 1.2), new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.9 }));
    hedge.position.set(12, 0.68, -7.8); scene.add(hedge);

    // Cobertura grande cinza do Posto de Gasolina no topo!
    const canopyRoof = new THREE.Mesh(new THREE.BoxGeometry(32, 0.9, 9.5), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 }));
    canopyRoof.position.set(9.5, 5.15, -1.2); scene.add(canopyRoof);
    const canopyTrim = new THREE.Mesh(new THREE.BoxGeometry(32.2, 0.22, 9.6), new THREE.MeshBasicMaterial({ color: 0xcbd5e1 }));
    canopyTrim.position.set(9.5, 4.65, -1.2); scene.add(canopyTrim);

    // Loja de conveniência à esquerda + pilhas de pneus decorativas! (sheet_08 frame 7)
    const shopWall = new THREE.Mesh(new THREE.BoxGeometry(9.5, 4.5, 3.6), new THREE.MeshStandardMaterial({ color: 0x78716c }));
    shopWall.position.set(2.2, 2.25, -4.4); scene.add(shopWall);
    const shopAwning = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.35, 1.2), new THREE.MeshStandardMaterial({ color: 0xb91c1c }));
    shopAwning.position.set(2.2, 3.85, -2.45); scene.add(shopAwning);
    const shopWin = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 1.8), new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.55 }));
    shopWin.position.set(2.4, 2.35, -2.58); scene.add(shopWin);
    addTireStackProp(0.8, -1.65);

    // Ilha quadriculada + 2 Bombas de Gasolina brancas/verdes à direita + Táxi amarelo lá atrás!
    const pumpIsland = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.32, 2.8), new THREE.MeshStandardMaterial({ map: makeCheckerFloorTexture() }));
    pumpIsland.position.set(17.8, 0.16, -1.5); scene.add(pumpIsland);
    [16.8, 18.7].forEach((px) => {
      const pumpBody = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.15, 0.65), new THREE.MeshStandardMaterial({ color: 0xf1f5f9 }));
      pumpBody.position.set(px, 1.38, -1.5); scene.add(pumpBody);
      const pumpMeter = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.48), new THREE.MeshBasicMaterial({ color: 0x0f172a }));
      pumpMeter.position.set(px, 1.78, -1.16); scene.add(pumpMeter);
      const pumpTop = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.7), new THREE.MeshStandardMaterial({ color: 0x15803d }));
      pumpTop.position.set(px, 2.52, -1.5); scene.add(pumpTop);
    });
    const bgTaxi = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.15, 1.6), new THREE.MeshStandardMaterial({ color: 0xeab308 }));
    bgTaxi.position.set(22.2, 0.65, -4.8); scene.add(bgTaxi);

    const frontBonus = new THREE.Mesh(new THREE.PlaneGeometry(44, 6), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    frontBonus.rotation.x = -Math.PI / 2; frontBonus.position.set(11, 0.01, 7.6); scene.add(frontBonus);
    return refs;
  }

  if (stageId === 'bonus_glass') {
    scene.background = new THREE.Color(0x0a192f);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(66, 8), new THREE.MeshStandardMaterial({ map: makeCheckerFloorTexture() }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(23, 0, 0.4); scene.add(floor);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(66, 6), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
    front.rotation.x = -Math.PI / 2; front.position.set(23, 0.01, 7.4); scene.add(front);
    for (let x = -2; x < 54; x += 6.5) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(6.0, 6.8, 2.5), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
      w.position.set(x, 3.4, -7.4); scene.add(w);
    }
    return refs;
  }

  if (stageId === 'stage5_bay') {
    scene.background = new THREE.Color(0x09152b);
    scene.fog = new THREE.FogExp2(0x09152b, 0.008);
    const pier = new THREE.Mesh(new THREE.PlaneGeometry(len + 46, 7.8), new THREE.MeshStandardMaterial({ map: makeSidewalkTexture(), color: 0x78716c }));
    pier.rotation.x = -Math.PI / 2; pier.position.set(len / 2, 0, 0.5); scene.add(pier);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(len + 46, 6), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
    front.rotation.x = -Math.PI / 2; front.position.set(len / 2, 0.01, 7.2); scene.add(front);

    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(len + 56, 26), new THREE.MeshBasicMaterial({ color: 0x0c4a6e }));
    ocean.rotation.x = -Math.PI / 2; ocean.position.set(len / 2, -0.5, -16); scene.add(ocean);
    const waves: THREE.Mesh[] = [];
    for (let wx = 0; wx < len + 25; wx += 6) {
      const wv = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 0.6), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 }));
      wv.position.set(wx, -0.35, -7.5 - (wx % 12) * 0.4); scene.add(wv);
      waves.push(wv);
    }
    for (let x = -2; x < len - 32; x += 8) {
      const container = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.8, 2.4), new THREE.MeshStandardMaterial({ color: x % 16 === 0 ? 0xb91c1c : 0x0369a1 }));
      container.position.set(x, 1.4, -5.2); scene.add(container);
    }
    const yacht = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(28, 2.8, 4.4), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
    hull.position.y = 1.4; yacht.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(18, 2.4, 3.4), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
    deck.position.set(1, 3.6, 0); yacht.add(deck);
    yacht.position.set(len - 22, -0.3, -8.2); scene.add(yacht);
    const yachtBridge = new THREE.Mesh(new THREE.BoxGeometry(6.8, 2.2, 2.2), new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.25 }));
    yachtBridge.position.set(346.5, 1.1, -3.7); scene.add(yachtBridge);
    refs.bossSeatPos = { x: 346.5, y: 2.25, z: -3.45 };

    [16, 54, 98, 148, 196, 246, 298].forEach((bx, bi) => addFireBarrel(bx, 0, bi % 2 === 0 ? -1.9 : 1.7));
    [32, 76, 128, 174, 224, 274, 316].forEach(cx => addTrafficCone(cx, 0, -1.65));
    [40, 116, 188, 266].forEach(vx => addSteamVent(vx, 0, -2.8));
    addWoodBarrelProp(112.0, 0.85, 1.0, 'potion', true);
    addWoodBarrelProp(280.0, -0.8, 1.0, 'meat', true);
    addWoodBarrelProp(320.0, 0.75, 1.0, 'potion', true);
    animCallbacks.push((t) => {
      waves.forEach((w, i) => { w.position.y = -0.35 + Math.sin(t * 3 + i) * 0.12; });
      yacht.position.y = -0.3 + Math.sin(t * 2) * 0.12;
    });
    return refs;
  }

  // Biomas 3D com partículas flutuantes vivas
  const palettes: Record<'plains' | 'nether' | 'desert' | 'snow' | 'end', { sky: number; road: number; side: number; prop: number; accent: number; mote: number }> = {
    plains: { sky: 0x38bdf8, road: 0x6b4f35, side: 0x22c55e, prop: 0x15803d, accent: 0x78350f, mote: 0xfef08a },
    nether: { sky: 0x2a0808, road: 0x3b1313, side: 0x5c1818, prop: 0xf97316, accent: 0x7c2d12, mote: 0xfb923c },
    desert: { sky: 0xfde68a, road: 0xd9b372, side: 0xe7c68b, prop: 0x16a34a, accent: 0xb45309, mote: 0xfef9c3 },
    snow: { sky: 0xbae6fd, road: 0xcbd5e1, side: 0xf1f5f9, prop: 0x0ea5e9, accent: 0x334155, mote: 0xffffff },
    end: { sky: 0x090514, road: 0x2e1f3d, side: 0x1e132b, prop: 0xa855f7, accent: 0x581c87, mote: 0xd8b4fe },
  };
  const p = palettes[stageId];
  scene.background = new THREE.Color(p.sky);
  scene.fog = new THREE.FogExp2(p.sky, 0.013);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(len + 30, 8.2), new THREE.MeshStandardMaterial({ color: p.road }));
  road.rotation.x = -Math.PI / 2; road.position.set(len / 2, 0, 0.8); scene.add(road);
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(len + 30, 6), new THREE.MeshStandardMaterial({ color: p.side }));
  fg.rotation.x = -Math.PI / 2; fg.position.set(len / 2, 0.01, 7.6); scene.add(fg);
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(len + 30, 16), new THREE.MeshStandardMaterial({ color: p.side }));
  bg.rotation.x = -Math.PI / 2; bg.position.set(len / 2, 0.01, -10.8); scene.add(bg);
  const motes: THREE.Mesh[] = [];
  for (let x = -3, idx = 0; x < len + 16; x += 4.5, idx++) {
    const tr = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.6 + (idx % 2) * 0.9, 0.75), new THREE.MeshStandardMaterial({ color: p.accent }));
    tr.position.set(x, 1.3, -4.6 - (idx % 2) * 1.6); scene.add(tr);
    const tp = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.9, 2.1), new THREE.MeshStandardMaterial({ color: p.prop }));
    tp.position.set(x, 3.2 + (idx % 2) * 0.6, -4.6 - (idx % 2) * 1.6); scene.add(tp);
    const mote = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.MeshBasicMaterial({ color: p.mote }));
    mote.position.set(x + 1.5, 2.5 + (idx % 3) * 0.7, -3.0); scene.add(mote);
    motes.push(mote);
  }
  animCallbacks.push((t) => {
    motes.forEach((m, i) => { m.position.y = 2.5 + (i % 3) * 0.6 + Math.sin(t * 2.5 + i) * 0.5; });
  });
  return refs;
}
