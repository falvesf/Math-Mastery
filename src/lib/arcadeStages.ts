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
  { id: 'stage2_subway', label: '🚇 Estágio 2: Estação, Metrô & Ringue (Sodom)', length: 520, bossHpMultiplier: 10, bossDisplayName: 'Sodom' },
  { id: 'bonus_car', label: '🚗 Bônus 1: Destrua o Carro!', length: 22, bossHpMultiplier: 1, bossDisplayName: 'Carro Turbo', isBonus: true, bonusKind: 'car' },
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
      { minX: 0, maxX: 84, startX: 0.6 },
      { minX: 200, maxX: 294, startX: 202.5 },
      { minX: 400, maxX: 520, startX: 402.5, preBossX: 472 },
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
        triggerX: 79.5,
        destZoneIdx: 1,
        destX: 202.5,
        banner: '🚇 EMBARCANDO NO ÚLTIMO VAGÃO...',
      },
      {
        zoneIdx: 1,
        triggerX: 290.5,
        destZoneIdx: 2,
        destX: 402.5,
        banner: '🏃 SAINDO NA ESTAÇÃO SUBTERRÂNEA...',
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

export type EnemyMoveProfile = 'punk' | 'agile' | 'slash' | 'giant' | 'rusher' | 'ninja_knife' | 'ninja_fire';

export interface GangEnemyTemplate {
  id: string;
  name: string;
  role: 'agile' | 'brawler' | 'giant' | 'punk';
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
  spawns: {
    side: 'front' | 'back' | 'drop' | 'door';
    zOffset: number;
    doorX?: number;
    doorZ?: number;
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
    { name: 'Bred', role: 'punk', moveProfile: 'punk', gender: 'male', scale: 0.94, speedMul: 1.08, hpMul: 0.9, atkMul: 0.95, defBonus: 8, hairStyle: 'short', shirt: '#dc2626', pants: '#1e3a8a', hair: '#92400e', skin: '#f1c27d' },
    { name: 'Roxy (Poison)', role: 'agile', moveProfile: 'agile', gender: 'female', scale: 0.89, speedMul: 1.35, hpMul: 0.92, atkMul: 1.08, defBonus: 7, hairStyle: 'long', shirt: '#ec4899', pants: '#312e81', hair: '#f43f5e', skin: '#ffdbac' },
    { name: 'Wong Who (Gordinho)', role: 'brawler', moveProfile: 'rusher', gender: 'male', scale: 1.02, widthScale: 1.38, speedMul: 1.18, hpMul: 1.5, atkMul: 1.32, defBonus: 16, hairStyle: 'short', shirt: '#f59e0b', pants: '#1e293b', hair: '#111827', skin: '#e0ac69' },
    { name: 'Holly Wood (Ninja)', role: 'agile', moveProfile: 'ninja_knife', gender: 'male', scale: 0.94, speedMul: 1.34, hpMul: 1.08, atkMul: 1.25, defBonus: 10, hairStyle: 'short', shirt: '#1e293b', pants: '#0f172a', hair: '#09090b', skin: '#f1c27d' },
    { name: 'Slash', role: 'brawler', moveProfile: 'slash', gender: 'male', scale: 1.16, speedMul: 1.05, hpMul: 1.6, atkMul: 1.4, defBonus: 18, hairStyle: 'short', shirt: '#7c3aed', pants: '#18181b', hair: '#e5e7eb', skin: '#8d5524' },
    { name: 'Dug', role: 'punk', moveProfile: 'punk', gender: 'male', scale: 0.98, speedMul: 1.06, hpMul: 1.05, atkMul: 1.05, defBonus: 10, hairStyle: 'spiky', shirt: '#16a34a', pants: '#1f2937', hair: '#facc15', skin: '#e0ac69' },
    { name: 'Andore Jr.', role: 'giant', moveProfile: 'giant', gender: 'male', scale: 1.36, widthScale: 1.24, speedMul: 0.92, hpMul: 2.45, atkMul: 1.7, defBonus: 24, hairStyle: 'long', shirt: '#b91c1c', pants: '#7f1d1d', hair: '#1f2937', skin: '#e0ac69' },
    { name: 'Andore Pai', role: 'giant', moveProfile: 'giant', gender: 'male', scale: 1.52, widthScale: 1.28, speedMul: 0.86, hpMul: 3.2, atkMul: 2.0, defBonus: 32, hairStyle: 'long', shirt: '#0f766e', pants: '#134e4a', hair: '#27272a', skin: '#c68642' },
    { name: 'Ninja Vermelho (Fogo)', role: 'agile', moveProfile: 'ninja_fire', gender: 'male', scale: 0.95, speedMul: 1.36, hpMul: 1.12, atkMul: 1.32, defBonus: 11, hairStyle: 'short', shirt: '#dc2626', pants: '#991b1b', hair: '#7f1d1d', skin: '#ef4444' },
  ];

const CUBE_MONSTER_ARCHETYPES: {
  name: string;
  role: GangEnemyTemplate['role'];
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
    { name: 'Goblin Batedor', role: 'agile', moveProfile: 'agile', scale: 0.78, speedMul: 1.34, hpMul: 0.92, atkMul: 0.98, defBonus: 8, skin: '#4ade80', shirt: '#3f6212', pants: '#1a2e05', hair: '#14532d', eye: '#ef4444', hairStyle: 'spiky' },
    { name: 'Zumbi Tóxico', role: 'punk', moveProfile: 'punk', scale: 1.0, speedMul: 1.02, hpMul: 1.22, atkMul: 1.18, defBonus: 12, skin: '#22c55e', shirt: '#0284c7', pants: '#312e81', hair: '#064e3b', eye: '#facc15', hairStyle: 'short' },
    { name: 'Orc Brutamontes', role: 'brawler', moveProfile: 'rusher', scale: 1.24, widthScale: 1.22, speedMul: 0.94, hpMul: 1.9, atkMul: 1.52, defBonus: 20, skin: '#15803d', shirt: '#78350f', pants: '#451a03', hair: '#1c1917', eye: '#fb923c', hairStyle: 'spiky' },
    { name: 'Golem de Ferro', role: 'giant', moveProfile: 'giant', scale: 1.44, widthScale: 1.25, speedMul: 0.8, hpMul: 2.95, atkMul: 1.9, defBonus: 34, skin: '#94a3b8', shirt: '#64748b', pants: '#475569', hair: '#334155', eye: '#ef4444', hairStyle: 'short' },
  ];

/**
 * Gera o elenco FIXO do estágio separando:
 * - `regularRoster`: humanos da gangue (Bred, Poison/Roxy, Slash, Andores, Gordinho, Ninjas) + monstros em blocos/cubos
 * - `subBossRoster`: bonecos com SKIN própria (`preset_skins` sem GLB) promovidos a SUB-CHEFES com atributos altos e golpes variados
 * OBS: Modelos `.glb` NÃO entram aqui — permanecem exclusivos como CHEFES finais!
 */
export function buildFixedStageGang(
  stageId: ArcadeStageId,
  cubeMonsterPresets: any[]
): { regularRoster: GangEnemyTemplate[]; subBossRoster: GangEnemyTemplate[] } {
  const stageIdx = Math.max(1, CAMPAIGN_ORDER.findIndex(s => s.id === stageId) + 1);
  const rand = mulberry32(stageIdx * 977 + 1337);
  const diffScale = 1 + (stageIdx - 1) * 0.42;

  const humans: GangEnemyTemplate[] = GANG_ARCHETYPES.map((arch, idx) => {
    const hpVar = 0.94 + rand() * 0.14;
    const sizeBoost = arch.scale >= 1.25 ? 1.22 : arch.scale <= 0.9 ? 0.92 : 1.0;
    return {
      id: `${stageId}_gang_${idx}`,
      name: stageIdx >= 3 && arch.role === 'giant' ? `${arch.name} Mk.${stageIdx - 1}` : arch.name,
      role: arch.role,
      moveProfile: arch.moveProfile,
      isMonster: false,
      widthScale: arch.widthScale,
      scale: arch.scale,
      speed: Number((2.45 * arch.speedMul + (stageIdx - 1) * 0.12).toFixed(2)),
      attack: Math.round(58 * arch.atkMul * diffScale * sizeBoost),
      defense: Math.round((arch.defBonus + stageIdx * 4) * sizeBoost),
      hp: Math.round(210 * arch.hpMul * diffScale * hpVar),
      evasion: arch.role === 'agile' ? 12 : 0,
      critChance: arch.role === 'brawler' || arch.role === 'giant' ? 16 : 8,
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

  cubeMonsterPresets.forEach((m, i) => {
    const baseHp = Math.max(100, Number(m.hp) || 125);
    const baseAtk = Math.max(24, Number(m.attack) || 30);
    const baseDef = Math.max(8, Number(m.defense) || 10);

    if (m.skinUrl) {
      // Bonecos com SKIN 2D própria viram SUB-CHEFES raros com atributos elevados e escala imponente!
      const prof = subProfiles[(i + stageIdx) % subProfiles.length];
      subBossRoster.push({
        id: `subboss_${stageId}_${m.id}_${i}`,
        name: `⭐ Sub-Chefe: ${m.name}`,
        role: 'giant',
        moveProfile: prof,
        isMonster: true,
        isSubBoss: true,
        skinUrl: m.skinUrl,
        avatarConfig: m.avatarConfig || {},
        drops: m.drops || [],
        scale: Number(Math.max(1.24, Math.min(1.42, (m.scale || 1.0) * 1.28)).toFixed(2)),
        speed: Number((2.6 + (i % 2) * 0.25).toFixed(2)),
        attack: Math.round(Math.max(88, baseAtk * 2.8) * diffScale),
        defense: Math.round((baseDef + 16 + stageIdx * 5) * 1.3),
        hp: Math.round(Math.max(520, baseHp * 3.8) * diffScale),
        evasion: Math.max(6, Number(m.evasion) || 4),
        critChance: Math.max(14, Number(m.critChance) || 14),
        damageEffect: m.damageEffect || 'none',
        hasSpecial: true,
      });
    } else {
      // Sem skinUrl (apenas config de blocos) -> integra grupos comuns como monstro de cubo
      const isHeavy = i % 2 === 1;
      blockMonsters.push({
        id: `sys_block_mon_${stageId}_${m.id}_${i}`,
        name: m.name,
        role: isHeavy ? 'brawler' : 'agile',
        moveProfile: isHeavy ? 'rusher' : 'agile',
        isMonster: true,
        avatarConfig: m.avatarConfig || {},
        drops: m.drops || [],
        scale: Number(Math.max(0.84, Math.min(1.28, m.scale || (isHeavy ? 1.18 : 0.92))).toFixed(2)),
        speed: isHeavy ? 2.3 : 2.85,
        attack: Math.round(Math.max(54, baseAtk * 2.0) * diffScale),
        defense: Math.round(baseDef + stageIdx * 4),
        hp: Math.round(Math.max(210, baseHp * 2.1) * diffScale),
        evasion: Number(m.evasion) || (isHeavy ? 2 : 10),
        critChance: Number(m.critChance) || 9,
        damageEffect: m.damageEffect || 'none',
        hasSpecial: true,
      });
    }
  });

  // Complementa com monstros temáticos em cubo (Goblin, Zumbi, Orc, Golem)
  CUBE_MONSTER_ARCHETYPES.forEach((cm, ci) => {
    const sizeBoost = cm.scale >= 1.25 ? 1.22 : cm.scale <= 0.85 ? 0.92 : 1.0;
    blockMonsters.push({
      id: `cube_arch_${stageId}_${ci}`,
      name: cm.name,
      role: cm.role,
      moveProfile: cm.moveProfile,
      isMonster: true,
      widthScale: cm.widthScale,
      scale: cm.scale,
      speed: Number((2.45 * cm.speedMul + (stageIdx - 1) * 0.1).toFixed(2)),
      attack: Math.round(62 * cm.atkMul * diffScale * sizeBoost),
      defense: Math.round((cm.defBonus + stageIdx * 4) * sizeBoost),
      hp: Math.round(225 * cm.hpMul * diffScale),
      evasion: cm.role === 'agile' ? 10 : 0,
      critChance: cm.role === 'giant' || cm.role === 'brawler' ? 15 : 8,
      hasSpecial: true,
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

  // Mescla alternada: humano -> monstro em cubo -> humano -> monstro em cubo
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
          { side: 'front', zOffset: -0.6, gangIdx: 0 },
          { side: 'door', doorX: 18, doorZ: -3.9, zOffset: 0.4, gangIdx: 5 },
          { side: 'front', zOffset: 0.9, gangIdx: 1 },
          { side: 'back', zOffset: 0.1, gangIdx: 2 },
        ],
      },
      {
        triggerX: 39, lockMinX: 30, lockMaxX: 51, label: 'BECO DA CABINE TELEFÔNICA & LATA DE LIXO!',
        spawns: [
          { side: 'front', zOffset: -1.0, gangIdx: 2 },
          { side: 'front', zOffset: 0.8, gangIdx: 4 },
          { side: 'back', zOffset: -0.2, gangIdx: 3 },
          { side: 'front', zOffset: 1.1, gangIdx: 6 },
        ],
      },
      {
        triggerX: 64, lockMinX: 55, lockMaxX: 76, label: 'GUARDA NA ENTRADA DO GALPÃO!',
        spawns: [
          { side: 'door', doorX: 55, doorZ: -3.9, zOffset: 0.2, gangIdx: 8 },
          { side: 'front', zOffset: -0.9, isSubBoss: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, gangIdx: 7 },
          { side: 'back', zOffset: -0.4, gangIdx: 5 },
        ],
      },
      {
        triggerX: 209, lockMinX: 202, lockMaxX: 222, label: '📦 GALPÃO DO SLUM — EMBOSCADA NO DEPÓSITO!',
        spawns: [
          { side: 'front', zOffset: -0.7, gangIdx: 6 },
          { side: 'front', zOffset: 0.8, gangIdx: 8 },
          { side: 'front', zOffset: 0.0, gangIdx: 0 },
          { side: 'back', zOffset: 1.0, gangIdx: 3 },
        ],
      },
      {
        triggerX: 229, lockMinX: 220, lockMaxX: 241, label: '🔥 GALPÃO — NINJAS DO FOGO & ACROBATAS!',
        spawns: [
          { side: 'front', zOffset: -1.0, isFireSquad: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, isFireSquad: true, gangIdx: 0 },
          { side: 'back', zOffset: -0.1, gangIdx: 2 },
          { side: 'front', zOffset: 0.3, gangIdx: 1 },
        ],
      },
      {
        triggerX: 247, lockMinX: 238, lockMaxX: 259, label: '💪 GALPÃO — BILL BULL (GORDINHO) & SUB-CHEFE!',
        spawns: [
          { side: 'front', zOffset: -0.3, gangIdx: 4 },
          { side: 'front', zOffset: 0.9, isSubBoss: true, gangIdx: 1 },
          { side: 'back', zOffset: -0.9, gangIdx: 6 },
          { side: 'front', zOffset: 1.1, gangIdx: 9 },
        ],
      },
      {
        triggerX: 416, lockMinX: 406, lockMaxX: 428, label: '🚗 FERRO-VELHO DOS CARROS DESTRUÍDOS!',
        spawns: [
          { side: 'front', zOffset: -0.9, gangIdx: 8 },
          { side: 'front', zOffset: 0.8, gangIdx: 6 },
          { side: 'back', zOffset: 0.1, gangIdx: 2 },
          { side: 'front', zOffset: -0.1, gangIdx: 5 },
        ],
      },
      {
        triggerX: 438, lockMinX: 429, lockMaxX: 450, label: '🚪 ANTESALA DA PORTA DO DANDE!',
        spawns: [
          { side: 'front', zOffset: -1.0, isSubBoss: true, gangIdx: 2 },
          { side: 'front', zOffset: 0.9, gangIdx: 4 },
          { side: 'back', zOffset: -0.2, gangIdx: 2 },
          { side: 'front', zOffset: 0.2, gangIdx: 7 },
        ],
      },
      {
        triggerX: 453, lockMinX: 444, lockMaxX: 465, label: '💥 DANDE ARROMBOU A PORTA DUPLA!', isBossWave: true,
        spawns: [
          { side: 'door', doorX: 455.5, doorZ: -3.5, zOffset: 0.1, isBoss: true, gangIdx: 0 },
          { side: 'front', zOffset: -1.0, gangIdx: 0 },
          { side: 'back', zOffset: 1.0, gangIdx: 6 },
        ],
      },
    ];
  }

  if (stageId === 'stage2_subway') {
    return [
      {
        triggerX: 12, lockMinX: 3, lockMaxX: 23, label: 'ESTAÇÃO DO METRÔ — DESÇA À PLATAFORMA!',
        spawns: [
          { side: 'front', zOffset: -0.7, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, gangIdx: 1 },
          { side: 'back', zOffset: 0.1, gangIdx: 2 },
          { side: 'front', zOffset: -0.1, gangIdx: 4 },
        ],
      },
      {
        triggerX: 34, lockMinX: 25, lockMaxX: 45, label: 'PLATAFORMA CENTRAL — PUNKS & GORDINHOS!',
        spawns: [
          { side: 'front', zOffset: -1.0, gangIdx: 4 },
          { side: 'front', zOffset: 0.8, gangIdx: 7 },
          { side: 'back', zOffset: -0.4, gangIdx: 3 },
          { side: 'back', zOffset: 1.2, gangIdx: 6 },
        ],
      },
      {
        triggerX: 55, lockMinX: 46, lockMaxX: 66, label: 'VAGÕES ESTACIONADOS — NINJAS & BRUTAMONTES!',
        spawns: [
          { side: 'front', zOffset: -1.1, gangIdx: 9 },
          { side: 'front', zOffset: 0.6, gangIdx: 6 },
          { side: 'back', zOffset: 0.2, gangIdx: 8 },
          { side: 'back', zOffset: -1.2, gangIdx: 2 },
        ],
      },
      {
        triggerX: 73, lockMinX: 64, lockMaxX: 82, label: 'ÚLTIMO VAGÃO — ANDORE GUARDA A PORTA ABERTA!',
        spawns: [
          { side: 'front', zOffset: -0.3, isAndore: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, isSubBoss: true, gangIdx: 0 },
          { side: 'back', zOffset: -0.9, gangIdx: 5 },
        ],
      },
      {
        triggerX: 212, lockMinX: 203, lockMaxX: 223, label: 'DENTRO DO TREM — VAGÃO 1!',
        spawns: [
          { side: 'front', zOffset: -0.9, gangIdx: 2 },
          { side: 'front', zOffset: 0.8, gangIdx: 4 },
          { side: 'back', zOffset: -0.2, gangIdx: 5 },
          { side: 'front', zOffset: 0.1, gangIdx: 0 },
        ],
      },
      {
        triggerX: 237, lockMinX: 228, lockMaxX: 248, label: 'DENTRO DO TREM — VAGÃO DO MEIO (ANDORE!)',
        spawns: [
          { side: 'front', zOffset: -0.5, isAndore: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.8, gangIdx: 8 },
          { side: 'back', zOffset: 0.2, gangIdx: 6 },
          { side: 'back', zOffset: -1.0, gangIdx: 3 },
        ],
      },
      {
        triggerX: 263, lockMinX: 254, lockMaxX: 274, label: '🔥 TREM — BANDO DE NINJAS DO FOGO!',
        spawns: [
          { side: 'front', zOffset: -1.0, isFireSquad: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, isFireSquad: true, gangIdx: 0 },
          { side: 'back', zOffset: -0.2, isSubBoss: true, gangIdx: 1 },
          { side: 'back', zOffset: 1.0, gangIdx: 7 },
        ],
      },
      {
        triggerX: 284, lockMinX: 275, lockMaxX: 292, label: 'VAGÃO FINAL — ANDORE NA PORTA DE SAÍDA!',
        spawns: [
          { side: 'front', zOffset: 0.0, isAndore: true, gangIdx: 1 },
          { side: 'front', zOffset: 0.9, gangIdx: 6 },
          { side: 'back', zOffset: -0.8, gangIdx: 4 },
        ],
      },
      {
        triggerX: 416, lockMinX: 407, lockMaxX: 427, label: 'VIELA DA SAÍDA DO METRÔ!',
        spawns: [
          { side: 'front', zOffset: -1.1, gangIdx: 5 },
          { side: 'front', zOffset: 0.7, gangIdx: 8 },
          { side: 'back', zOffset: 0.1, isSubBoss: true, gangIdx: 2 },
          { side: 'back', zOffset: -1.2, gangIdx: 2 },
        ],
      },
      {
        triggerX: 448, lockMinX: 439, lockMaxX: 460, label: 'CORREDOR DO RINGUE — GUARDA PESADA!',
        spawns: [
          { side: 'front', zOffset: -1.0, isAndore: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, gangIdx: 4 },
          { side: 'back', zOffset: -0.3, gangIdx: 11 },
          { side: 'back', zOffset: 1.1, gangIdx: 6 },
        ],
      },
      {
        triggerX: 492, lockMinX: 482, lockMaxX: 514, label: '⚠️ RINGUE SUBTERRÂNEO — SODOM!', isBossWave: true,
        spawns: [
          { side: 'front', zOffset: -1.2, gangIdx: 6 },
          { side: 'back', zOffset: 1.2, isSubBoss: true, gangIdx: 0 },
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
          { side: 'front', zOffset: -0.8, gangIdx: 2 },
          { side: 'front', zOffset: 0.9, gangIdx: 4 },
          { side: 'back', zOffset: 0.2, gangIdx: 3 },
          { side: 'front', zOffset: -0.1, gangIdx: 0 },
        ],
      },
      {
        triggerX: 39, lockMinX: 30, lockMaxX: 49, label: 'DENTRO DO RESTAURANTE — EMBOSCADA!',
        spawns: [
          { side: 'front', zOffset: -1.0, gangIdx: 4 },
          { side: 'front', zOffset: 0.8, gangIdx: 8 },
          { side: 'back', zOffset: -0.4, gangIdx: 1 },
          { side: 'back', zOffset: 1.2, gangIdx: 7 },
        ],
      },
      {
        triggerX: 62, lockMinX: 53, lockMaxX: 73, label: 'SALÃO DOS FUNDOS — ANDORE TE CERCOU!',
        spawns: [
          { side: 'front', zOffset: -0.4, isAndore: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, gangIdx: 6 },
          { side: 'back', zOffset: 0.1, isSubBoss: true, gangIdx: 0 },
          { side: 'back', zOffset: -1.0, gangIdx: 2 },
        ],
      },
      {
        triggerX: 212, lockMinX: 204, lockMaxX: 240, label: '🤼 RINGUE RÚSTICO — ARENA DOS ANDORES!',
        spawns: [
          { side: 'front', zOffset: -0.7, isAndore: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.8, isAndore: true, gangIdx: 1 },
          { side: 'back', zOffset: 0.0, isSubBoss: true, gangIdx: 1 },
        ],
      },
      {
        triggerX: 416, lockMinX: 407, lockMaxX: 427, label: 'SAÍDA DO RESTAURANTE — RUAS DE WEST SIDE!',
        spawns: [
          { side: 'front', zOffset: -1.0, gangIdx: 5 },
          { side: 'front', zOffset: 0.7, gangIdx: 4 },
          { side: 'back', zOffset: -0.2, gangIdx: 8 },
          { side: 'back', zOffset: 1.1, gangIdx: 3 },
        ],
      },
      {
        triggerX: 448, lockMinX: 439, lockMaxX: 459, label: '🔥 BECO DE NEON — BANDO DE FOGO!',
        spawns: [
          { side: 'front', zOffset: -1.0, isFireSquad: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, isFireSquad: true, gangIdx: 0 },
          { side: 'back', zOffset: 0.0, gangIdx: 6 },
          { side: 'back', zOffset: -1.0, gangIdx: 7 },
        ],
      },
      {
        triggerX: 484, lockMinX: 475, lockMaxX: 495, label: 'FESTIVAL CHINATOWN — ACROBATAS & ANDORE!',
        spawns: [
          { side: 'front', zOffset: -1.0, gangIdx: 2 },
          { side: 'front', zOffset: 0.8, isAndore: true, gangIdx: 0 },
          { side: 'back', zOffset: 0.0, isSubBoss: true, gangIdx: 2 },
          { side: 'back', zOffset: -1.2, gangIdx: 6 },
        ],
      },
      {
        triggerX: 530, lockMinX: 520, lockMaxX: 548, label: '⚠️ FESTIVAL — CHEFE EDDIE!', isBossWave: true,
        spawns: [
          { side: 'front', zOffset: -1.2, gangIdx: 6 },
          { side: 'back', zOffset: 1.2, isSubBoss: true, gangIdx: 0 },
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
          { side: 'front', zOffset: -0.8, gangIdx: 4 },
          { side: 'front', zOffset: 1.0, gangIdx: 5 },
          { side: 'back', zOffset: 0.2, gangIdx: 3 },
          { side: 'front', zOffset: -0.1, gangIdx: 2 },
        ],
      },
      {
        triggerX: 44, lockMinX: 35, lockMaxX: 54, label: 'FORNALHAS — CUIDADO COM AS ARMADILHAS!',
        spawns: [
          { side: 'front', zOffset: -1.1, gangIdx: 7 },
          { side: 'front', zOffset: 0.6, gangIdx: 8 },
          { side: 'back', zOffset: -0.3, gangIdx: 6 },
          { side: 'back', zOffset: 1.2, gangIdx: 4 },
        ],
      },
      {
        triggerX: 78, lockMinX: 69, lockMaxX: 88, label: '🔥 SALÃO DAS CALDEIRAS — BANDO DE FOGO!',
        spawns: [
          { side: 'front', zOffset: -1.1, isFireSquad: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, isFireSquad: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.0, isFireSquad: true, gangIdx: 0 },
          { side: 'back', zOffset: 0.3, isSubBoss: true, gangIdx: 0 },
        ],
      },
      {
        triggerX: 112, lockMinX: 103, lockMaxX: 122, label: 'ENGRENAGENS GIGANTES — ANDORES & GOLEM!',
        spawns: [
          { side: 'front', zOffset: -1.0, gangIdx: 10 },
          { side: 'front', zOffset: 0.9, gangIdx: 11 },
          { side: 'back', zOffset: 0.0, gangIdx: 12 },
          { side: 'back', zOffset: -1.1, gangIdx: 2 },
        ],
      },
      {
        triggerX: 152, lockMinX: 143, lockMaxX: 162, label: 'ELEVADOR SUBINDO — ONDA 1 (NINJAS!)', isElevatorWave: true,
        spawns: [
          { side: 'drop', zOffset: -1.0, gangIdx: 6 },
          { side: 'drop', zOffset: 0.8, gangIdx: 2 },
          { side: 'drop', zOffset: -0.1, gangIdx: 4 },
          { side: 'drop', zOffset: 1.3, gangIdx: 8 },
        ],
      },
      {
        triggerX: 192, lockMinX: 183, lockMaxX: 202, label: 'ELEVADOR — ONDA 2 (SUB-CHEFES & SLASH!)', isElevatorWave: true,
        spawns: [
          { side: 'drop', zOffset: -1.1, isSubBoss: true, gangIdx: 1 },
          { side: 'drop', zOffset: 0.9, gangIdx: 8 },
          { side: 'drop', zOffset: 0.0, gangIdx: 10 },
          { side: 'drop', zOffset: 1.2, gangIdx: 7 },
        ],
      },
      {
        triggerX: 234, lockMinX: 225, lockMaxX: 245, label: 'ELEVADOR — ONDA 3 (GUARDA DO ROLENTO!)', isElevatorWave: true,
        spawns: [
          { side: 'drop', zOffset: -1.0, gangIdx: 12 },
          { side: 'drop', zOffset: 0.8, isSubBoss: true, gangIdx: 2 },
          { side: 'drop', zOffset: -0.2, gangIdx: 6 },
          { side: 'drop', zOffset: 1.1, gangIdx: 4 },
        ],
      },
      {
        triggerX: 274, lockMinX: 264, lockMaxX: 292, label: '⚠️ TOPO DO ELEVADOR — ROLENTO!', isBossWave: true, isElevatorWave: true,
        spawns: [
          { side: 'drop', zOffset: -1.1, gangIdx: 6 },
          { side: 'drop', zOffset: 1.1, isSubBoss: true, gangIdx: 2 },
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
          { side: 'front', zOffset: -0.8, gangIdx: 3 },
          { side: 'front', zOffset: 1.0, gangIdx: 4 },
          { side: 'back', zOffset: 0.2, gangIdx: 5 },
          { side: 'front', zOffset: -0.2, gangIdx: 2 },
        ],
      },
      {
        triggerX: 46, lockMinX: 37, lockMaxX: 56, label: 'DOCAS DOS CONTÊINERES!',
        spawns: [
          { side: 'front', zOffset: -1.0, gangIdx: 8 },
          { side: 'front', zOffset: 0.7, gangIdx: 10 },
          { side: 'back', zOffset: -0.3, gangIdx: 6 },
          { side: 'back', zOffset: 1.1, gangIdx: 9 },
        ],
      },
      {
        triggerX: 82, lockMinX: 73, lockMaxX: 92, label: '🔥 EMBOSCADA PORTUÁRIA — BANDO DE FOGO!',
        spawns: [
          { side: 'front', zOffset: -1.1, isFireSquad: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.8, isFireSquad: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.0, isFireSquad: true, gangIdx: 0 },
          { side: 'back', zOffset: 0.4, gangIdx: 4 },
          { side: 'back', zOffset: -0.9, gangIdx: 7 },
        ],
      },
      {
        triggerX: 122, lockMinX: 113, lockMaxX: 132, label: 'PÁTIO DOS GUINDASTES — SUB-CHEFE & GOLEM!',
        spawns: [
          { side: 'front', zOffset: -1.1, gangIdx: 11 },
          { side: 'front', zOffset: 0.7, isSubBoss: true, gangIdx: 0 },
          { side: 'back', zOffset: -0.3, gangIdx: 12 },
          { side: 'back', zOffset: 1.1, gangIdx: 6 },
        ],
      },
      {
        triggerX: 164, lockMinX: 155, lockMaxX: 174, label: 'ARMAZÉM PESADO — DUPLA DE GORDINHOS!',
        spawns: [
          { side: 'front', zOffset: -1.0, gangIdx: 4 },
          { side: 'front', zOffset: 0.9, gangIdx: 4 },
          { side: 'back', zOffset: 0.0, gangIdx: 8 },
          { side: 'back', zOffset: -1.1, gangIdx: 5 },
        ],
      },
      {
        triggerX: 206, lockMinX: 197, lockMaxX: 216, label: 'PASSARELA DO PÍER — ACROBATAS & NINJAS!',
        spawns: [
          { side: 'front', zOffset: -1.1, gangIdx: 2 },
          { side: 'front', zOffset: 0.8, gangIdx: 6 },
          { side: 'back', zOffset: -0.2, gangIdx: 6 },
          { side: 'back', zOffset: 1.0, isSubBoss: true, gangIdx: 1 },
        ],
      },
      {
        triggerX: 248, lockMinX: 239, lockMaxX: 258, label: '🔥 CONVESES — SEGUNDO BANDO DE FOGO!',
        spawns: [
          { side: 'front', zOffset: -1.0, isFireSquad: true, gangIdx: 0 },
          { side: 'front', zOffset: 0.9, isFireSquad: true, gangIdx: 0 },
          { side: 'back', zOffset: 0.1, gangIdx: 10 },
          { side: 'back', zOffset: -1.1, gangIdx: 9 },
        ],
      },
      {
        triggerX: 292, lockMinX: 283, lockMaxX: 304, label: 'ESCOLTA REAL DO BELGER — IRMÃOS ANDORE & SUB-CHEFES!',
        spawns: [
          { side: 'front', zOffset: -1.1, gangIdx: 12 },
          { side: 'front', zOffset: 0.8, isSubBoss: true, gangIdx: 2 },
          { side: 'back', zOffset: -0.2, gangIdx: 10 },
          { side: 'back', zOffset: 1.2, isSubBoss: true, gangIdx: 0 },
        ],
      },
      {
        triggerX: 334, lockMinX: 324, lockMaxX: 352, label: '⚠️ IATE DO CHEFE FINAL — BELGER!', isBossWave: true,
        spawns: [
          { side: 'front', zOffset: -1.2, gangIdx: 8 },
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
        { side: 'front', zOffset: -0.8, gangIdx: 3 },
        { side: 'front', zOffset: 1.0, gangIdx: 5 },
        { side: 'back', zOffset: 0.2, gangIdx: 4 },
      ],
    },
    {
      triggerX: Math.round(len * 0.34), lockMinX: Math.round(len * 0.26), lockMaxX: Math.round(len * 0.42), label: 'ONDA 2 — CERCO PESADO!',
      spawns: [
        { side: 'front', zOffset: -1.2, gangIdx: 7 },
        { side: 'front', zOffset: 0.6, gangIdx: 4 },
        { side: 'back', zOffset: -0.4, gangIdx: 5 },
      ],
    },
    {
      triggerX: Math.round(len * 0.60), lockMinX: Math.round(len * 0.52), lockMaxX: Math.round(len * 0.68), label: 'ONDA 3 — SUB-CHEFE DO BIOMA!',
      spawns: [
        { side: 'front', zOffset: -1.0, isSubBoss: true, gangIdx: 1 },
        { side: 'front', zOffset: 0.7, gangIdx: 9 },
        { side: 'back', zOffset: 0.1, gangIdx: 8 },
      ],
    },
    {
      triggerX: Math.round(len * 0.84), lockMinX: Math.round(len * 0.76), lockMaxX: len - 4, label: `⚠️ ${getStageMeta(stageId).bossDisplayName.toUpperCase()} — CHEFE!`, isBossWave: true,
      spawns: [
        { side: 'front', zOffset: -1.2, gangIdx: 8 },
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
    const crateTexShared = makeCrateTexture();
    const slumbgMat = new THREE.MeshBasicMaterial({ color: 0x1d4ed8 });

    // Helpers de objetos de cenário detalhados do Stage 1
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

    const addRustMetalBarrelProp = (x: number, z: number, guaranteedDrop?: BreakablePropDef['guaranteedDrop']) => {
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
      refs.breakableProps.push({ id: propSeq++, kind: 'barrel', x, z, y: 0, mesh: grp, hp: 35, solidTop: 1.05, guaranteedDrop });
    };

    const addWoodBarrelProp = (x: number, z: number, scaleXZ = 1.0, guaranteedDrop?: BreakablePropDef['guaranteedDrop']) => {
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
      refs.breakableProps.push({ id: propSeq++, kind: 'wood_barrel', x, z, y: 0, mesh: grp, hp: 38, solidTop: 1.15, guaranteedDrop });
    };

    const addBigCrateProp = (x: number, z: number, guaranteedDrop?: BreakablePropDef['guaranteedDrop']) => {
      const grp = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.45, 1.3), new THREE.MeshStandardMaterial({ map: crateTexShared, roughness: 0.78 }));
      box.position.y = 0.725; grp.add(box);
      grp.position.set(x, 0, z);
      scene.add(grp);
      refs.breakableProps.push({ id: propSeq++, kind: 'crate', x, z, y: 0, mesh: grp, hp: 42, solidTop: 1.45, guaranteedDrop });
    };

    const addPhoneBoothProp = (x: number, z: number) => {
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
      refs.breakableProps.push({ id: propSeq++, kind: 'phone_booth', x, z, y: 0, mesh: grp, hp: 42, guaranteedDrop: 'potion' });
    };

    const addTrashCanProp = (x: number, z: number) => {
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
      // Igual no vídeo (00:18-00:26): dá pra pular em cima da lata de lixo prateada e também quebrar!
      refs.breakableProps.push({ id: propSeq++, kind: 'trash_can', x, z, y: 0, mesh: grp, hp: 34, solidTop: 1.12, guaranteedDrop: 'meat' });
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
    refs.bossSeatPos = { x: 465.8, y: 1.55, z: -3.5 };
    refs.stageExitWalkTo = { x: 469.5, z: -0.2, descendY: -1.5 };

    void slumbgMat;
    return refs;
  }

  if (stageId === 'stage2_subway') {
    scene.background = new THREE.Color(0x060a14);
    scene.fog = new THREE.FogExp2(0x060a14, 0.008);

    // 3 CENAS COMPLETAMENTE ISOLADAS (transição por Fade Out -> Fade In!):
    // CENA A (x=0..84): Descida pela escada SUBWAY + longa plataforma com trem de 6 vagões parado (porta aberta SÓ no último vagão em x~79.5)
    // CENA B (x=200..294): DENTRO dos 3 vagões do trem em movimento (totalmente separada da estação!)
    // CENA C (x=400..520): Viela de saída do metrô -> Corredor -> Ringue Subterrâneo do Sodom

    refs.floorHeightAt = (x: number) => {
      if (x <= 1.2) return 1.45;
      if (x > 1.2 && x < 5.2) return 1.45 * (1 - (x - 1.2) / 4);
      return 0;
    };

    // ---- CENA A: ESCADA SUBWAY + PLATAFORMA EXTERNA LONGA (x=-6..96) ----
    const stairsWall = new THREE.Mesh(
      new THREE.BoxGeometry(8, 3.6, 0.5),
      new THREE.MeshStandardMaterial({ map: makeBrickTexture('#334155', '#1e293b') })
    );
    stairsWall.position.set(1.2, 1.8, -3.6); scene.add(stairsWall);
    const subwayPillar = new THREE.Mesh(new THREE.BoxGeometry(0.65, 4.2, 0.65), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
    subwayPillar.position.set(5.4, 2.1, -2.9); scene.add(subwayPillar);
    const subwaySign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 0.7),
      new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('SUBWAY ▼', '#38bdf8', '#f8fafc') })
    );
    subwaySign.position.set(1.6, 3.1, -3.3); scene.add(subwaySign);
    for (let st = 0; st < 6; st++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.28, 7.2), new THREE.MeshStandardMaterial({ color: 0x64748b }));
      step.position.set(1.2 + st * 0.7, 1.32 - st * 0.24, 0.4); scene.add(step);
    }

    const platFloor = new THREE.Mesh(new THREE.PlaneGeometry(102, 7.6), new THREE.MeshStandardMaterial({ map: makeSidewalkTexture() }));
    platFloor.rotation.x = -Math.PI / 2; platFloor.position.set(45, 0, 0.4); scene.add(platFloor);
    const platFrontDark = new THREE.Mesh(new THREE.PlaneGeometry(108, 6), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
    platFrontDark.rotation.x = -Math.PI / 2; platFrontDark.position.set(45, 0.01, 6.8); scene.add(platFrontDark);
    const yellowEdge = new THREE.Mesh(new THREE.BoxGeometry(98, 0.03, 0.28), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
    yellowEdge.position.set(47, 0.02, -2.55); scene.add(yellowEdge);

    const trackBg = new THREE.Mesh(new THREE.PlaneGeometry(106, 6.5), new THREE.MeshStandardMaterial({ color: 0x090d16 }));
    trackBg.rotation.x = -Math.PI / 2; trackBg.position.set(46, -0.5, -6.2); scene.add(trackBg);
    const stationBackWall = new THREE.Mesh(
      new THREE.BoxGeometry(108, 6.5, 0.8),
      new THREE.MeshStandardMaterial({ map: makeBrickTexture('#1e293b', '#0f172a') })
    );
    stationBackWall.position.set(46, 3.0, -7.2); scene.add(stationBackWall);
    const endTunnelBlock = new THREE.Mesh(new THREE.BoxGeometry(12, 6.5, 9), new THREE.MeshStandardMaterial({ color: 0x090d16 }));
    endTunnelBlock.position.set(90, 3.0, -1.5); scene.add(endTunnelBlock);

    // 1) Locomotiva dianteira (x=11.5) + Faróis
    const locoBody = new THREE.Mesh(new THREE.BoxGeometry(10.2, 3.65, 2.3), new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5, roughness: 0.35 }));
    locoBody.position.set(11.5, 1.88, -4.4); scene.add(locoBody);
    const locoNose = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 2.2), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.55 }));
    locoNose.position.set(6.2, 1.35, -4.4); scene.add(locoNose);
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), new THREE.MeshBasicMaterial({ color: 0x020617 }));
    windshield.position.set(7.4, 2.45, -3.22); scene.add(windshield);
    [-0.5, 0.5].forEach(hz => {
      const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.35), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
      headlight.position.set(5.48, 1.0, -4.4 + hz); scene.add(headlight);
    });
    const locoStripe = new THREE.Mesh(new THREE.BoxGeometry(10.3, 0.36, 2.34), new THREE.MeshBasicMaterial({ color: 0x2563eb }));
    locoStripe.position.set(11.5, 1.15, -4.4); scene.add(locoStripe);

    // 2) 6 Vagões ao longo da plataforma (portas fechadas nos vagões 2..5; ABERTA SÓ no último vagão em x~79.5!)
    [22.5, 33.5, 44.5, 55.5, 66.5, 76.5].forEach((cx, ci) => {
      const isLastCar = ci === 5;
      const carBody = new THREE.Mesh(
        new THREE.BoxGeometry(10.6, 3.65, 2.3),
        new THREE.MeshStandardMaterial({ color: isLastCar ? 0x64748b : 0x475569, metalness: 0.45, roughness: 0.4 })
      );
      carBody.position.set(cx, 1.88, -4.4); scene.add(carBody);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(10.64, 0.36, 2.34), new THREE.MeshBasicMaterial({ color: 0x2563eb }));
      stripe.position.set(cx, 1.15, -4.4); scene.add(stripe);

      [-3.2, 0.0, 3.5].forEach((ox, wi) => {
        const isDoorOpenHere = isLastCar && wi === 2;
        const winOrDoor = new THREE.Mesh(
          new THREE.PlaneGeometry(isDoorOpenHere ? 2.1 : 2.2, isDoorOpenHere ? 2.65 : 1.15),
          new THREE.MeshBasicMaterial({ color: isDoorOpenHere ? 0x38bdf8 : 0x090d16 })
        );
        winOrDoor.position.set(cx + ox, isDoorOpenHere ? 1.38 : 2.38, -3.22);
        scene.add(winOrDoor);
        if (isDoorOpenHere) {
          const innerDark = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 2.4), new THREE.MeshBasicMaterial({ color: 0x020617 }));
          innerDark.position.set(cx + ox, 1.32, -3.2);
          scene.add(innerDark);
          const portalSign = new THREE.Mesh(
            new THREE.PlaneGeometry(3.6, 0.78),
            new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('ENTRAR NO TREM ➔', '#22d3ee', '#fef08a') })
          );
          portalSign.position.set(cx + ox, 3.35, -3.16); scene.add(portalSign);
        }
      });
    });

    for (let px = 8; px <= 82; px += 12) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.4, 0.45), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
      col.position.set(px, 2.2, -3.0); scene.add(col);
      const stSign = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.65), new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('METRO STATION', '#3b82f6', '#dbeafe') }));
      stSign.position.set(px + 2, 4.2, -6.65); scene.add(stSign);
    }
    [18, 42, 68].forEach(cx => addTrafficCone(cx, 0, -1.7));
    [28, 58].forEach(bx => addFireBarrel(bx, 0, 1.75));

    // ---- CENA B: DENTRO DE 3 VAGÕES EM MOVIMENTO (x=200..294, isolada!) ----
    const trainCabinGroup = new THREE.Group();
    const trainFloor = new THREE.Mesh(new THREE.PlaneGeometry(102, 6.8), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.4, roughness: 0.55 }));
    trainFloor.rotation.x = -Math.PI / 2; trainFloor.position.set(247, 0, 0.4); trainCabinGroup.add(trainFloor);
    const trainFrontDark = new THREE.Mesh(new THREE.PlaneGeometry(106, 6), new THREE.MeshStandardMaterial({ color: 0x020617 }));
    trainFrontDark.rotation.x = -Math.PI / 2; trainFrontDark.position.set(247, 0.01, 6.8); trainCabinGroup.add(trainFrontDark);
    [197.5, 297.5].forEach(wx => {
      const endWall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.6, 8.2), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
      endWall.position.set(wx, 2.3, 0.2); trainCabinGroup.add(endWall);
    });

    const straps: THREE.Mesh[] = [];
    for (let x = 200, idx = 0; x <= 294; x += 4.5, idx++) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x475569 }));
      wall.position.set(x, 2.1, -3.1); trainCabinGroup.add(wall);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.55), new THREE.MeshBasicMaterial({ color: 0x020617 }));
      win.position.set(x, 2.45, -2.93); trainCabinGroup.add(win);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.55, 0.85), new THREE.MeshStandardMaterial({ color: 0x1d4ed8 }));
      seat.position.set(x, 0.35, -2.55); trainCabinGroup.add(seat);

      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.65, 0.14), new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }));
      strap.position.set(x - 0.8, 3.45, -1.6); trainCabinGroup.add(strap);
      straps.push(strap);

      if (idx === 6 || idx === 13) {
        const carDiv = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.8, 1.2), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
        carDiv.position.set(x + 2.2, 1.9, -2.7); trainCabinGroup.add(carDiv);
      }
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(102, 0.25, 2.4), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
    roof.position.set(247, 4.15, -2.1); trainCabinGroup.add(roof);
    const exitDoorTrain = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.7), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
    exitDoorTrain.position.set(291.5, 1.4, -2.88); trainCabinGroup.add(exitDoorTrain);
    const exitSignTrain = new THREE.Mesh(
      new THREE.PlaneGeometry(3.3, 0.72),
      new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('SAÍDA DO TREM ➔', '#22d3ee', '#fef08a') })
    );
    exitSignTrain.position.set(291.5, 3.25, -2.85); trainCabinGroup.add(exitSignTrain);
    scene.add(trainCabinGroup);

    const lightsGroup = new THREE.Group();
    for (let lx = 192; lx < 308; lx += 5.5) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.32, 0.2), new THREE.MeshBasicMaterial({ color: lx % 11 === 0 ? 0xfacc15 : 0x38bdf8 }));
      tl.position.set(lx, 2.5, -4.6); lightsGroup.add(tl);
      const tunnelPost = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.5, 0.3), new THREE.MeshBasicMaterial({ color: 0x1e293b }));
      tunnelPost.position.set(lx + 2.7, 2.0, -4.8); lightsGroup.add(tunnelPost);
    }
    scene.add(lightsGroup);

    animCallbacks.push((t, dt) => {
      trainCabinGroup.position.y = Math.sin(t * 14) * 0.025;
      straps.forEach((st, i) => { st.rotation.z = Math.sin(t * 7 + i * 0.8) * 0.22; });
      lightsGroup.children.forEach((c: any) => {
        c.position.x -= 28 * dt;
        if (c.position.x < 190) c.position.x = 308;
      });
    });

    // ---- CENA C: VIELA + CORREDOR + RINGUE SUBTERRÂNEO DO SODOM (x=400..520) ----
    const alleyFloor = new THREE.Mesh(new THREE.PlaneGeometry(76, 7.6), new THREE.MeshStandardMaterial({ map: makeAsphaltTexture() }));
    alleyFloor.rotation.x = -Math.PI / 2; alleyFloor.position.set(434, 0, 0.4); scene.add(alleyFloor);
    for (let x = 398; x < 468; x += 6) {
      const bldg = new THREE.Mesh(new THREE.BoxGeometry(5.6, 7.2, 3.2), new THREE.MeshStandardMaterial({ map: makeBrickTexture('#334155', '#1e293b') }));
      bldg.position.set(x, 3.6, -7.8); scene.add(bldg);
    }
    [410, 442, 464].forEach((bx, bi) => addFireBarrel(bx, 0, bi % 2 === 0 ? -1.9 : 1.75));
    [426, 456].forEach(cx => addTrafficCone(cx, 0, -1.65));
    addSteamVent(422, 0, -2.5);
    addSteamVent(452, 0, -2.5);

    const ringFloor = new THREE.Mesh(new THREE.PlaneGeometry(58, 7.8), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 }));
    ringFloor.rotation.x = -Math.PI / 2; ringFloor.position.set(498, 0, 0.4); scene.add(ringFloor);
    const ringMat = new THREE.Mesh(new THREE.PlaneGeometry(34, 5.4), new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.65 }));
    ringMat.rotation.x = -Math.PI / 2; ringMat.position.set(497, 0.02, 0.2); scene.add(ringMat);

    [0.85, 1.35, 1.85].forEach(ry => {
      const rope = new THREE.Mesh(new THREE.BoxGeometry(34, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
      rope.position.set(497, ry, -2.45); scene.add(rope);
    });
    [480.5, 513.5].forEach(px => {
      const cornerPost = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 2.25, 10), new THREE.MeshStandardMaterial({ color: 0x16a34a }));
      cornerPost.position.set(px, 1.12, -2.45); scene.add(cornerPost);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), new THREE.MeshStandardMaterial({ color: 0xf5f5f4 }));
      pad.position.set(px, 1.35, -2.45); scene.add(pad);
    });

    const standWall = new THREE.Mesh(new THREE.BoxGeometry(58, 5.2, 1.5), new THREE.MeshStandardMaterial({ color: 0x1e1b4b }));
    standWall.position.set(498, 2.4, -7.2); scene.add(standWall);
    const crowdGroup = new THREE.Group();
    const crowdColors = [0x9333ea, 0x3b82f6, 0xec4899, 0xeab308, 0x14b8a6];
    for (let cx = 474, ci = 0; cx <= 520; cx += 1.4, ci++) {
      for (let row = 0; row < 2; row++) {
        const spec = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.35), new THREE.MeshBasicMaterial({ color: crowdColors[(ci + row) % crowdColors.length] }));
        body.position.y = 0.36; spec.add(body);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshBasicMaterial({ color: 0xf1c27d }));
        head.position.y = 0.94; spec.add(head);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), new THREE.MeshBasicMaterial({ color: 0xf1c27d }));
        arm.position.set(0.36, 0.95, 0); spec.add(arm);
        spec.position.set(cx + row * 0.45, 0.65 + row * 1.15, -4.6 - row * 1.1);
        crowdGroup.add(spec);
      }
    }
    scene.add(crowdGroup);
    const ringSign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.9), new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('SODOM RING ARENA', '#ef4444', '#fef08a') }));
    ringSign.position.set(497, 4.3, -6.2); scene.add(ringSign);

    animCallbacks.push((t) => {
      crowdGroup.children.forEach((sp, i) => {
        sp.position.y = (i % 2 === 0 ? 0.65 : 1.8) + Math.abs(Math.sin(t * 6.5 + i * 0.7)) * 0.28;
      });
    });

    const backFrontDark = new THREE.Mesh(new THREE.PlaneGeometry(136, 6), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
    backFrontDark.rotation.x = -Math.PI / 2; backFrontDark.position.set(460, 0.01, 6.8); scene.add(backFrontDark);
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

    for (let x = -2; x < 138; x += 6.5) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(6.0, 7.2, 2.5), new THREE.MeshStandardMaterial({ map: makeBrickTexture('#451a03', '#271206') }));
      wall.position.set(x, 3.6, -7.2); scene.add(wall);
    }
    return refs;
  }

  if (stageId === 'bonus_car') {
    scene.background = new THREE.Color(0x0c1428);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), new THREE.MeshStandardMaterial({ map: makeAsphaltTexture() }));
    road.rotation.x = -Math.PI / 2; road.position.set(10, 0, 0.4); scene.add(road);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), new THREE.MeshStandardMaterial({ map: makeSidewalkTexture() }));
    front.rotation.x = -Math.PI / 2; front.position.set(10, 0.01, 7.4); scene.add(front);
    for (let x = -2; x < 26; x += 6.5) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(5.8, 7.0, 3.2), new THREE.MeshStandardMaterial({ map: makeBrickTexture('#334155', '#1e293b') }));
      b.position.set(x, 3.5, -7.8); scene.add(b);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.65), new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('BÔNUS!', '#facc15', '#fff') }));
      sg.position.set(x, 3.2, -6.15); scene.add(sg);
    }
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

    [16, 54, 98, 148, 196, 246, 298].forEach((bx, bi) => addFireBarrel(bx, 0, bi % 2 === 0 ? -1.9 : 1.7));
    [32, 76, 128, 174, 224, 274, 316].forEach(cx => addTrafficCone(cx, 0, -1.65));
    [40, 116, 188, 266].forEach(vx => addSteamVent(vx, 0, -2.8));
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
