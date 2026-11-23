import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore - Mesma versão do Three usada pelo skinview3d (0.156)
import * as THREE from 'skinview3d/node_modules/three';
// @ts-ignore
import { GLTFLoader } from 'skinview3d/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
// @ts-ignore
import { DRACOLoader } from 'skinview3d/node_modules/three/examples/jsm/loaders/DRACOLoader.js';
// @ts-ignore
import { WalkingAnimation, PlayerObject } from 'skinview3d';
import { ChevronLeft, Heart, Shield, Swords, Coins, Sparkles, RotateCcw, Trophy, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getSafeUrl } from '../lib/utils';
import { fetchModelsByCategory, fetchActiveCoin, isImageUrl } from '../lib/model3d';
import { loadGlobalItemTransforms } from '../lib/itemTransforms';
import { generateMinecraftSkinUrl } from '../lib/SkinGenerator';
import { calculateTotalStats, fetchGlobalGachaConfig, rollItemAdds } from '../lib/gacha';
import { getEquippedDamageEffectInfo, FREEZE_HITS_TO_FREEZE } from '../lib/damageEffects';
import {
  rollTransformAnimal,
  getTransformModelUrl,
  TRANSFORM_LABELS,
  type TransformAnimal,
} from '../lib/transformEffects';
import { normalizeMonsterAttacks, type MonsterAttacksConfig } from '../lib/monsterAttacks';
import { RANKS, getRankForXp, getMinRankIndex, getMaxAddsLimit } from '../lib/ranks';
import { playCoinCollect, playPotionDrinkSound, playElixirChimeSound, playEatFoodSound } from '../lib/audioBank';
import { calculateMonsterHitDamage, calculatePlayerHitDamage } from '../lib/combatDamage';
import { attachEquippedItemsToPlayer } from './VoxelArena3D';
import { safeParseAvatarConfig } from './AvatarCharacter';
import { attachHeadAddonsToPlayer } from '../lib/avatarHeadAddons';
import {
  type ArcadeStageId,
  type EnemyMoveProfile,
  CAMPAIGN_ORDER,
  getStageMeta,
  getNextCampaignStage,
  getStagePreBossX,
  getStageZones,
  getStagePortals,
  buildFixedStageGang,
  getWavesForStage,
  makeCrateTexture,
  makeBarrelTexture,
  buildArcadeScenario,
} from '../lib/arcadeStages';
import {
  type ArcadeWeaponKind,
  WEAPON_META,
  buildArcadeWeaponMesh,
  attachArcadeWeaponToPlayerObj,
  sheathPlayerMainWeapon,
} from '../lib/arcadeWeapons';
import type { UserData } from '../contexts/AuthContext';

export interface ArcadeBeatEmUpProps {
  userData: UserData;
  initialStage?: ArcadeStageId;
  onExit: () => void;
}

interface BossTemplate {
  id: string;
  name: string;
  modelUrl: string;
  skinUrl?: string;
  modelForward?: string;
  drops?: any[];
  scale: number;
  attack: number;
  defense: number;
  hp: number;
  evasion: number;
  critChance: number;
  damageEffect?: string;
  attacksConfig: MonsterAttacksConfig;
}

interface HealItemTemplate {
  id?: string;
  title: string;
  tier: 'potion' | 'meat' | 'elixir';
  minRankIndex: number;
  imageUrl?: string;
  soundUrl?: string;
  healAmount: number;
}

interface FloatingText {
  id: number;
  text: string;
  color: string;
  x: number;
  y: number;
}

interface EnemyHudBar {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  barSize: number;
  x: number;
  y: number;
  isBoss: boolean;
  statusLabel?: string;
}

const HP_PER_HEART = 20;
const HP_PER_BAR = 100; // 5 corações = 1 barra cheia

const BAR_COLORS = [
  '#22c55e', // Barra 1 do jogador: Verde
  '#06b6d4', // Barra 2 do jogador: Ciano
  '#a855f7', // Barra 3 do jogador: Roxo
  '#f59e0b', // Barra 4 do jogador: Dourado
  '#ef4444', // Barra 5+: Carmesim
];

// Paleta estilo Final Fight para barras sobrepostas dos inimigos/chefes:
// Última barra (camada 0) é AMARELA sobre fundo VERMELHO; camadas extras vão mudando de cor!
const ENEMY_LAYER_COLORS = [
  '#facc15', // Camada 0 (última): Amarelo (vazio fica Vermelho #dc2626!)
  '#2dd4bf', // Camada 1: Ciano/Verde-água (estilo barra do Sodom)
  '#22c55e', // Camada 2: Verde
  '#3b82f6', // Camada 3: Azul
  '#a855f7', // Camada 4: Roxo
  '#ec4899', // Camada 5: Rosa
  '#f97316', // Camada 6+: Laranja
];

function computeLayeredBar(hp: number, maxHp: number, barSize: number) {
  const safeSize = Math.max(50, barSize || 120);
  const totalLayers = Math.max(1, Math.ceil(maxHp / safeSize));
  if (hp <= 0) {
    return { layerIdx: 0, totalLayers, fillPct: 0, fgColor: ENEMY_LAYER_COLORS[0], bgColor: '#dc2626' };
  }
  const layerIdx = Math.max(0, Math.ceil(hp / safeSize) - 1);
  const fillInLayer = hp - layerIdx * safeSize;
  const fillPct = Math.max(0, Math.min(100, (fillInLayer / safeSize) * 100));
  const fgColor = ENEMY_LAYER_COLORS[layerIdx % ENEMY_LAYER_COLORS.length];
  const bgColor = layerIdx === 0
    ? '#dc2626' // Vermelho clássico Final Fight quando a última barra (amarela) está acabando
    : ENEMY_LAYER_COLORS[(layerIdx - 1) % ENEMY_LAYER_COLORS.length];
  return { layerIdx, totalLayers, fillPct, fgColor, bgColor };
}

const STREET_Z_MIN = -2.4;
const STREET_Z_MAX = 2.6;

function applyGlbSkinTexture(root: THREE.Object3D, skinUrl: string | null | undefined, done: () => void) {
  if (!skinUrl) { done(); return; }
  const safe = getSafeUrl(skinUrl) || skinUrl;
  const texLoader = new THREE.TextureLoader();
  texLoader.crossOrigin = 'anonymous';
  texLoader.load(safe, (texture: any) => {
    texture.flipY = false;
    texture.colorSpace = (THREE as any).SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    root.traverse((child: any) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat: any) => {
          const newMat = mat.clone();
          newMat.map = texture;
          if (newMat.color) newMat.color.setHex(0xffffff);
          newMat.transparent = Boolean(mat.transparent);
          newMat.alphaTest = 0.5;
          newMat.needsUpdate = true;
          child.material = newMat;
        });
      }
    });
    done();
  }, undefined, () => done());
}

type CombatPoseKind =
  | 'idle'
  | 'crouch'
  | 'hurt'
  | 'knockdown'
  | 'getup'
  | 'punch'
  | 'hook'
  | 'high_kick'
  | 'flying_kick'
  | 'side_kick'
  | 'acro_kick'
  | 'double_smash'
  | 'belly_charge'
  | 'headbutt'
  | 'acro_dive'
  | 'weapon_swing'
  | 'throw';

function applyCombatPose(playerObj: any, kind: CombatPoseKind, p: number) {
  if (!playerObj?.skin) return;
  const { head, body, leftArm, rightArm, leftLeg, rightLeg } = playerObj.skin;
  const resetLimbs = () => {
    [head, body, leftArm, rightArm, leftLeg, rightLeg].forEach(node => {
      if (node) node.rotation.set(0, 0, 0);
    });
  };
  resetLimbs();
  if (kind === 'idle') return;
  if (kind === 'crouch') {
    if (body) body.rotation.x = 0.25;
    if (leftLeg) leftLeg.rotation.x = -1.15;
    if (rightLeg) rightLeg.rotation.x = -1.15;
    if (leftArm) { leftArm.rotation.x = -0.6; leftArm.rotation.z = -0.25; }
    if (rightArm) { rightArm.rotation.x = -0.6; rightArm.rotation.z = 0.25; }
    return;
  }

  const t = Math.max(0, Math.min(1, p));
  const swing = Math.sin(t * Math.PI);

  if (kind === 'hurt') {
    if (body) body.rotation.x = -0.28 * swing;
    if (head) head.rotation.x = -0.35 * swing;
    if (leftArm) leftArm.rotation.x = 0.4 * swing;
    if (rightArm) rightArm.rotation.x = 0.4 * swing;
    return;
  }
  if (kind === 'knockdown') {
    if (body) body.rotation.x = -0.35;
    if (leftArm) leftArm.rotation.z = 0.65;
    if (rightArm) rightArm.rotation.z = -0.65;
    if (leftLeg) leftLeg.rotation.z = 0.25;
    if (rightLeg) rightLeg.rotation.z = -0.25;
    return;
  }
  if (kind === 'getup') {
    const rem = 1 - t;
    if (body) body.rotation.x = 0.45 * rem;
    if (leftArm) leftArm.rotation.x = -0.8 * rem;
    if (rightArm) rightArm.rotation.x = -0.8 * rem;
    if (leftLeg) leftLeg.rotation.x = 0.6 * rem;
    if (rightLeg) rightLeg.rotation.x = -0.5 * rem;
    return;
  }
  if (kind === 'flying_kick' || kind === 'side_kick') {
    if (rightLeg) { rightLeg.rotation.x = -1.48 * swing; rightLeg.rotation.z = -0.18 * swing; }
    if (leftLeg) leftLeg.rotation.x = 0.65 * swing;
    if (body) body.rotation.x = -0.28 * swing;
    if (rightArm) rightArm.rotation.x = -0.85 * swing;
    if (leftArm) leftArm.rotation.x = 0.55 * swing;
    return;
  }
  if (kind === 'high_kick') {
    if (rightLeg) rightLeg.rotation.x = -1.65 * swing;
    if (body) { body.rotation.x = -0.22 * swing; body.rotation.y = 0.42 * swing; }
    if (leftArm) leftArm.rotation.z = 0.55 * swing;
    if (rightArm) rightArm.rotation.z = -0.45 * swing;
    return;
  }
  if (kind === 'acro_kick') {
    if (rightLeg) rightLeg.rotation.x = -1.55 * swing;
    if (leftLeg) leftLeg.rotation.x = -0.8 * swing;
    if (leftArm) leftArm.rotation.z = 1.1 * swing;
    if (rightArm) rightArm.rotation.z = -1.1 * swing;
    return;
  }
  if (kind === 'double_smash') {
    // Slash juntando os dois braços e mãos para dar uma porrada dupla!
    const raise = Math.sin(Math.min(1, t * 1.15) * Math.PI);
    if (leftArm) { leftArm.rotation.x = -2.35 * raise; leftArm.rotation.z = -0.35 * raise; }
    if (rightArm) { rightArm.rotation.x = -2.35 * raise; rightArm.rotation.z = 0.35 * raise; }
    if (body) body.rotation.x = 0.38 * swing;
    return;
  }
  if (kind === 'belly_charge') {
    // Andore correndo com a barriga projetada para frente e braços abertos
    if (body) body.rotation.x = -0.28;
    if (head) head.rotation.x = 0.15;
    if (leftArm) { leftArm.rotation.z = 0.85; leftArm.rotation.x = -0.35; }
    if (rightArm) { rightArm.rotation.z = -0.85; rightArm.rotation.x = -0.35; }
    if (leftLeg) leftLeg.rotation.x = Math.sin(t * Math.PI * 3) * 0.65;
    if (rightLeg) rightLeg.rotation.x = -Math.sin(t * Math.PI * 3) * 0.65;
    return;
  }
  if (kind === 'headbutt') {
    // Gordinhos correndo com a cabeça baixa para dar cabeçada!
    if (body) body.rotation.x = 0.52 * Math.max(0.4, swing);
    if (head) head.rotation.x = 0.65 * Math.max(0.5, swing);
    if (leftArm) leftArm.rotation.x = 0.55;
    if (rightArm) rightArm.rotation.x = 0.55;
    return;
  }
  if (kind === 'acro_dive') {
    // Ninja saltando por cima com a faca para baixo
    if (body) body.rotation.x = 0.45 * swing;
    if (rightArm) { rightArm.rotation.x = -2.1 * swing; rightArm.rotation.z = 0.2; }
    if (leftArm) leftArm.rotation.x = 0.7 * swing;
    if (leftLeg) leftLeg.rotation.x = -0.95 * swing;
    return;
  }
  if (kind === 'weapon_swing') {
    if (rightArm) { rightArm.rotation.x = -Math.PI * 1.05 * swing; rightArm.rotation.z = 0.22 * swing; }
    if (body) body.rotation.y = -0.45 * swing;
    return;
  }
  if (kind === 'throw') {
    if (rightArm) rightArm.rotation.x = -Math.PI * 0.92 * swing;
    if (body) body.rotation.y = -0.32 * swing;
    return;
  }
  if (kind === 'hook') {
    if (leftArm) { leftArm.rotation.x = -Math.PI * 0.8 * swing; leftArm.rotation.z = -0.22 * swing; }
    if (rightArm) rightArm.rotation.x = 0.35 * swing;
    if (body) body.rotation.y = 0.38 * swing;
    return;
  }
  // punch padrão
  if (rightArm) { rightArm.rotation.x = -Math.PI * 0.78 * swing; rightArm.rotation.z = 0.16 * swing; }
  if (body) body.rotation.y = -0.32 * swing;
}

function playSoundSafe(url?: string) {
  if (!url) return;
  try {
    const a = new Audio(getSafeUrl(url));
    a.volume = 0.65;
    a.play().catch(() => {});
  } catch { /* noop */ }
}

function makeSportsCarMesh(): { group: THREE.Group; bodyMesh: THREE.Mesh; hoodMesh: THREE.Mesh } {
  const group = new THREE.Group();
  const bodyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.75, 2.0),
    new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.45, roughness: 0.35 })
  );
  bodyMesh.position.y = 0.62;
  group.add(bodyMesh);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.65, 1.75),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75, metalness: 0.6 })
  );
  cabin.position.set(0.1, 1.25, 0);
  group.add(cabin);

  const hoodMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.12, 1.85),
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, metalness: 0.5 })
  );
  hoodMesh.position.set(-1.35, 1.0, 0);
  group.add(hoodMesh);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
  [[-1.3, -0.95], [-1.3, 0.95], [1.3, -0.95], [1.3, 0.95]].forEach(([wx, wz]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    group.add(w);
  });

  // Faróis
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  [-0.65, 0.65].forEach(hz => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.35), hlMat);
    hl.position.set(-2.21, 0.65, hz);
    group.add(hl);
  });

  return { group, bodyMesh, hoodMesh };
}

export default function ArcadeBeatEmUp({ userData, initialStage = 'stage1_streets', onExit }: ArcadeBeatEmUpProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageId, setStageId] = useState<ArcadeStageId>(initialStage);

  const [equippedItems, setEquippedItems] = useState<any[]>([]);
  const [bossTemplates, setBossTemplates] = useState<BossTemplate[]>([]);
  const [humanoidPresets, setHumanoidPresets] = useState<any[]>([]);
  const [activeCoinModel, setActiveCoinModel] = useState<any>(null);
  const [activeCoinsPool, setActiveCoinsPool] = useState<any[]>([]);
  const [healItemsPool, setHealItemsPool] = useState<HealItemTemplate[]>([]);
  const storeCatalogRef = useRef<Map<string, any>>(new Map());
  const [loadingData, setLoadingData] = useState(true);

  const [playerHp, setPlayerHp] = useState(100);
  const [playerMaxHp, setPlayerMaxHp] = useState(100);
  const [coinsCollected, setCoinsCollected] = useState(0);
  const [killsCount, setKillsCount] = useState(0);
  const [waveBanner, setWaveBanner] = useState<string>('');
  const [goArrow, setGoArrow] = useState(false);
  const [bossHud, setBossHud] = useState<{ name: string; hp: number; maxHp: number; barSize: number } | null>(null);
  const [bonusTimerSec, setBonusTimerSec] = useState<number | null>(null);
  const [enemyBars, setEnemyBars] = useState<EnemyHudBar[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [groundWeaponLabel, setGroundWeaponLabel] = useState<string>('');
  const [fadeOpacity, setFadeOpacity] = useState<number>(1);
  const [roundClearInfo, setRoundClearInfo] = useState<{
    completedStageId: ArcadeStageId;
    nextStageId: ArcadeStageId | null;
    roundNum: number;
  } | null>(null);
  const [gameState, setGameState] = useState<'playing' | 'victory' | 'defeat'>('playing');
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [specialCooldownPct, setSpecialCooldownPct] = useState(0);
  const [runSeed, setRunSeed] = useState(1);

  const keysRef = useRef<Record<string, boolean>>({});
  const attackQueuedRef = useRef(false);
  const kickQueuedRef = useRef(false);
  const specialQueuedRef = useRef(false);
  const jumpQueuedRef = useRef(false);

  const totalStats = calculateTotalStats(equippedItems, userData?.distributedStats);
  const currentRankObj = getRankForXp(userData?.xp || 0, (userData as any)?.classId);
  const calculatedRankIndex = Math.max(0, RANKS.findIndex(r => r.name === currentRankObj.name));
  const maxHearts = Math.max(3, 3 + Math.floor(calculatedRankIndex / 2)) + Math.floor(totalStats.vitality / 30);
  const computedMaxHp = maxHearts * HP_PER_HEART;
  const playerAttackPower = Math.max(18, 18 + totalStats.attack);
  const playerDefensePower = Math.max(0, totalStats.defense);
  const equippedEffectInfo = getEquippedDamageEffectInfo(equippedItems);

  // Carrega:
  // 1) Calibrações globais de itens + user_items enriquecidos com store_items (corrige calças e botas!)
  // 2) Moeda 3D ativa + som configurado
  // 3) Itens reais de cura (poções/carnes) do store_items
  // 4) Monstros GLB (exclusivos para Chefes) vs Monstros Humanoides (gangue)
  useEffect(() => {
    let active = true;
    async function load() {
      setLoadingData(true);
      try {
        await loadGlobalItemTransforms().catch(() => {});

        // Loja completa (enriquecimento de equipamentos + pool de poções/carnes)
        let storeQ = supabase.from('store_items').select('*');
        if ((userData as any)?.tenantId) {
          storeQ = storeQ.or(`is_global.eq.true,tenant_id.eq.${(userData as any).tenantId}`);
        }
        const { data: storeData } = await storeQ;
        const storeMap = new Map<string, any>();
        const heals: HealItemTemplate[] = [];
        (storeData || []).forEach((s: any) => {
          const sd = { ...(s.data || {}), id: s.id, title: s.name || s.data?.title || 'Item', imageUrl: s.image_url || s.data?.imageUrl };
          storeMap.set(s.id, sd);
          const titleStr = String(sd.title || '');
          const isPetOrJunk = /cocho|ra[çc][ãa]o|pet|coleira|brinquedo|casinha|cama|cobre|min[eé]rio|fragmento|osso|vela|coroa|colar|membrana/i.test(titleStr);
          const isConsumable = (sd.type === 'consumable' || s.type === 'consumable');
          const isHealEffect = sd.gameEffect === 'restore_hp' || sd.gameEffect === 'heal_1_hp' || sd.gameEffect === 'heal';
          const isHealName = /\b(po[çc][ãa]o da vida|po[çc][ãa]o|carne|elixir|bife|ma[çc][ãa])\b/i.test(titleStr);
          if (isConsumable && !isPetOrJunk && (isHealEffect || isHealName)) {
            const isElixir = /elixir/i.test(titleStr);
            const isMeat = /carne|bife|frango|ma[çc][ãa]/i.test(titleStr);
            const tier: 'elixir' | 'meat' | 'potion' = isElixir ? 'elixir' : isMeat ? 'meat' : 'potion';
            heals.push({
              id: s.id,
              title: sd.title,
              tier,
              minRankIndex: getMinRankIndex(sd.minRankRequired ?? s.min_rank_required ?? 0),
              imageUrl: sd.imageUrl || sd.itemImageUrl,
              soundUrl: sd.useSoundUrl,
              healAmount: isElixir
                ? computedMaxHp
                : isMeat
                  ? Math.max(45, Math.round(computedMaxHp * 0.35))
                  : Math.max(25, (Number(sd.healAmount) || 2) * 18),
            });
          }
        });
        storeCatalogRef.current = storeMap;
        if (active) setHealItemsPool(heals);

        // Itens equipados do jogador (mesma lógica do QuestGameplayMobile.tsx!)
        if (userData?.uid) {
          const { data: uItems } = await supabase
            .from('user_items')
            .select('*')
            .eq('student_id', userData.uid)
            .eq('equipped', true);
          if (active && uItems) {
            const enriched = uItems.map((d: any) => {
              const data = d.data || {};
              const sData = storeMap.get(d.item_id) || storeMap.get(data.itemId) || {};
              return {
                ...sData,
                ...data,
                id: d.id,
                docId: d.id,
                itemId: d.item_id || data.itemId,
                imageUrl: data.itemImageUrl || data.imageUrl || sData.imageUrl || '',
                avatarPart: data.avatarPart || sData.avatarPart,
                itemTitle: data.itemTitle || data.title || sData.title,
                itemCategory: data.itemCategory || sData.itemCategory,
                baseAttributeType: data.baseAttributeType || sData.baseAttributeType,
                baseAttributeValue: data.baseAttributeValue || sData.baseAttributeValue,
                forgeLevel: data.forgeLevel || 0,
                forgeConfig: data.forgeConfig || sData.forgeConfig || null,
                gameModelUrl: data.gameModelUrl || sData.gameModelUrl,
                keepMetal: data.keepMetal ?? sData.keepMetal ?? false,
                modelTextureUrl: data.modelTextureUrl || sData.modelTextureUrl,
                minecraftHeadValue: data.minecraftHeadValue || sData.minecraftHeadValue,
                modelTransforms: data.modelTransforms || sData.modelTransforms || null,
                backColor: data.backColor || sData.backColor || '',
                damageEffect: data.damageEffect || sData.damageEffect || 'none',
              };
            });
            setEquippedItems(enriched);
          }
        }

        // Moeda(s) 3D configuradas e ativas (modelo + som configurado)
        const allCoins = await fetchModelsByCategory('coin', (userData as any)?.tenantId).catch(() => []);
        const activeCoins = (allCoins || []).filter((c: any) => c.is_active);
        const primaryCoin = await fetchActiveCoin((userData as any)?.tenantId).catch(() => null);
        if (active) {
          setActiveCoinModel(primaryCoin || activeCoins[0] || null);
          setActiveCoinsPool(activeCoins.length > 0 ? activeCoins : (primaryCoin ? [primaryCoin] : []));
        }

        // Monstros configurados em preset_skins (compartilhados entre escolas — humanoides + monstros 3D GLB + drops exatos!)
        const modelsList = await fetchModelsByCategory('skin', (userData as any)?.tenantId);
        const modelsMap = new Map<string, any>();
        modelsList.forEach(m => modelsMap.set(m.id, m));

        const { data: mData } = await supabase
          .from('preset_skins')
          .select('*')
          .eq('type', 'monster')
          .order('name', { ascending: true });
        if (active && mData) {
          const glbBosses: BossTemplate[] = [];
          const humanoids: any[] = [];
          mData.forEach((row: any, idx: number) => {
            const cfg = safeParseAvatarConfig(row.config) || {};
            const st = cfg.stats || {};
            const linkedModel = (row.baseModelId && row.baseModelId !== 'default') ? modelsMap.get(row.baseModelId) : null;
            const resolvedModelUrl = cfg.modelUrl || cfg.customModelUrl || linkedModel?.url || undefined;
            const resolvedSkinUrl = cfg.skinUrl || cfg.customSkinUrl || row.url || undefined;
            const rawZoom = Number(cfg.battleZoom) || Number(cfg.scale) || 1.0;
            const cfgDrops = Array.isArray(cfg.drops) ? cfg.drops : [];

            if (resolvedModelUrl) {
              // GLB -> Reservado EXCLUSIVAMENTE para os CHEFES de estágio!
              glbBosses.push({
                id: row.id,
                name: row.name || 'Chefe',
                modelUrl: resolvedModelUrl,
                skinUrl: resolvedSkinUrl,
                modelForward: cfg.modelForward || 'z',
                drops: cfgDrops,
                scale: Math.max(1.35, Math.min(1.85, rawZoom * 1.35)),
                attack: Math.max(45, Number(st.attack) || 55),
                defense: Math.max(12, Number(st.defense) || 18),
                hp: Math.max(140, Number(st.hp) || 180),
                evasion: Math.max(0, Number(st.evasion) || 5),
                critChance: Math.max(8, Number(st.critChance) || 12),
                damageEffect: cfg.damageEffect || cfg.stats?.damageEffect || 'none',
                attacksConfig: normalizeMonsterAttacks(cfg.attacks),
              });
            } else {
              // Sem GLB -> Monstro em blocos/cubos para grupos comuns e escolta do chefe
              humanoids.push({
                id: row.id,
                name: row.name || `Lutador ${idx + 1}`,
                skinUrl: resolvedSkinUrl,
                drops: cfgDrops,
                avatarConfig: cfg,
                scale: Math.max(0.85, Math.min(1.3, rawZoom)),
                attack: Math.max(22, Number(st.attack) || 28),
                defense: Math.max(5, Number(st.defense) || 8),
                hp: Math.max(95, Number(st.hp) || 120),
                evasion: Math.max(0, Number(st.evasion) || 2),
                critChance: Math.max(5, Number(st.critChance) || 8),
                damageEffect: cfg.damageEffect || cfg.stats?.damageEffect || 'none',
              });
            }
          });
          setBossTemplates(glbBosses);
          setHumanoidPresets(humanoids);
        }
      } catch (e) {
        console.warn('[ArcadeBeatEmUp] Erro ao carregar dados:', e);
      } finally {
        if (active) setLoadingData(false);
      }
    }
    load();
    return () => { active = false; };
  }, [userData?.uid]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysRef.current[k] = true;
      if (k === 'j' || k === 'z') attackQueuedRef.current = true;
      if (k === 'l' || k === 'c') kickQueuedRef.current = true;
      if (k === 'k' || k === 'x') specialQueuedRef.current = true;
      if (k === ' ' || k === 'spacebar') {
        e.preventDefault();
        jumpQueuedRef.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    if (loadingData) return;
    const container = containerRef.current;
    if (!container) return;

    const stageMeta = getStageMeta(stageId);
    const stageLen = stageMeta.length;
    const stageWaves = getWavesForStage(stageId);
    const stageZones = getStageZones(stageId);
    const stagePortals = getStagePortals(stageId);
    let activeZoneIdx = 0;
    let activeZone = stageZones[0];
    let transitionBusy = false;
    const { regularRoster, subBossRoster } = buildFixedStageGang(stageId, humanoidPresets);
    const stageIdxNum = Math.max(0, CAMPAIGN_ORDER.findIndex(s => s.id === stageId));
    const preBossX = getStagePreBossX(stageId);
    setGroundWeaponLabel('');
    setRoundClearInfo(null);
    setFadeOpacity(1);

    let disposed = false;
    setTimeout(() => { if (!disposed) setFadeOpacity(0); }, 90);

    const ROUND_MAP_NUMBERS: Partial<Record<ArcadeStageId, number>> = {
      stage1_streets: 1,
      stage2_subway: 2,
      stage3_westside: 3,
      stage4_industrial: 4,
      stage5_bay: 5,
    };

    let autoWalkExitTo: { x: number; z: number } | null = null;

    const advanceToNextStageWithMap = (completedId: ArcadeStageId, nextId: ArcadeStageId | null) => {
      if (!nextId) {
        if (ROUND_MAP_NUMBERS[completedId]) {
          setRoundClearInfo({ completedStageId: completedId, nextStageId: null, roundNum: ROUND_MAP_NUMBERS[completedId]! });
          setTimeout(() => {
            if (disposed) return;
            setRoundClearInfo(null);
            setGameState('victory');
          }, 2600);
        } else {
          setGameState('victory');
        }
        return;
      }
      const roundNum = ROUND_MAP_NUMBERS[completedId];
      if (roundNum) {
        // Continuidade fiel ao Final Fight: se há saída (ex: escada SUBWAY no Estágio 1), caminha até lá durante o ROUND CLEAR!
        if (envRefs.stageExitWalkTo) {
          autoWalkExitTo = { x: envRefs.stageExitWalkTo.x, z: envRefs.stageExitWalkTo.z };
        }
        // Pausa dramática mostrando ROUND CLEAR + Mapa de Metro City estilo Final Fight + Fade-Out!
        setRoundClearInfo({ completedStageId: completedId, nextStageId: nextId, roundNum });
        setTimeout(() => {
          if (disposed) return;
          setFadeOpacity(1);
          setTimeout(() => {
            if (disposed) return;
            setRoundClearInfo(null);
            setStageId(nextId);
          }, 520);
        }, envRefs.stageExitWalkTo ? 2800 : 2500);
      } else {
        // Bônus -> Fade-Out direto para o próximo estágio
        setTimeout(() => {
          if (disposed) return;
          setFadeOpacity(1);
          setTimeout(() => { if (!disposed) setStageId(nextId); }, 480);
        }, 1100);
      }
    };
    let nextFloatId = 1;
    const spawnFloat = (text: string, color: string, worldPos: THREE.Vector3, cam: THREE.PerspectiveCamera) => {
      const v = worldPos.clone().project(cam);
      const sx = Math.max(8, Math.min(92, (v.x * 0.5 + 0.5) * 100));
      const sy = Math.max(8, Math.min(86, (-v.y * 0.5 + 0.5) * 100));
      const fid = nextFloatId++;
      setFloatingTexts(prev => [...prev.slice(-12), { id: fid, text, color, x: sx, y: sy }]);
      setTimeout(() => {
        if (!disposed) setFloatingTexts(prev => prev.filter(p => p.id !== fid));
      }, 850);
    };

    setPlayerMaxHp(computedMaxHp);
    setPlayerHp(computedMaxHp);
    setBossHud(null);
    setEnemyBars([]);
    setGoArrow(false);
    setBonusTimerSec(stageMeta.isBonus ? 40 : null);
    setWaveBanner(stageMeta.label.toUpperCase());
    setTimeout(() => { if (!disposed) setWaveBanner(''); }, 2300);
    setGameState('playing');

    const scene = new THREE.Scene();
    const envRefs = buildArcadeScenario(scene, stageId);

    const width = Math.max(320, container.clientWidth);
    const height = Math.max(240, container.clientHeight);
    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 140);
    const initCamX = Math.max(activeZone.minX + 4.5, activeZone.startX + 1.8);
    camera.position.set(initCamX, envRefs.floorHeightAt(activeZone.startX) + 3.85, 9.6);
    camera.lookAt(initCamX, envRefs.floorHeightAt(activeZone.startX) + 1.35, -0.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xdbeafe, 0x334155, 0.95));
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const dirLight = new THREE.DirectionalLight(0xfffbeb, 0.95);
    dirLight.position.set(16, 22, 14);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-4, 5, 18);
    scene.add(fillLight);

    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(draco);

    // Pré-carrega textura de imagem para sprites de poção/carne e modelo 3D da moeda
    const texLoader = new THREE.TextureLoader();
    texLoader.crossOrigin = 'anonymous';
    const skinTexCache = new Map<string, THREE.Texture>();
    const loadSkinTexture = (url: string): Promise<THREE.Texture | null> => {
      if (!url) return Promise.resolve(null);
      const cached = skinTexCache.get(url);
      if (cached) return Promise.resolve(cached);
      return new Promise((resolve) => {
        texLoader.load(url, (tex: any) => {
          tex.colorSpace = (THREE as any).SRGBColorSpace;
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          skinTexCache.set(url, tex);
          resolve(tex);
        }, undefined, () => resolve(null));
      });
    };
    const coinTemplates: { obj: THREE.Object3D; soundUrl?: string }[] = [];
    const coinsToBuild = activeCoinsPool.length > 0 ? activeCoinsPool : (activeCoinModel ? [activeCoinModel] : []);
    coinsToBuild.forEach((cm: any) => {
      const cUrl = cm?.url || cm?.open_url || '';
      if (!cUrl) return;
      if (isImageUrl(cUrl)) {
        const tex = texLoader.load(getSafeUrl(cUrl));
        tex.colorSpace = (THREE as any).SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        const g = new THREE.Group();
        const faceMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
        const m1 = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), faceMat); m1.position.z = 0.035;
        const m2 = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), faceMat.clone()); m2.rotation.y = Math.PI; m2.position.z = -0.035;
        const edge = new THREE.Mesh(
          new THREE.CylinderGeometry(0.275, 0.275, 0.07, 20, 1, true),
          new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.65, roughness: 0.35, side: THREE.DoubleSide })
        );
        edge.rotation.x = Math.PI / 2;
        g.add(edge, m1, m2);
        coinTemplates.push({ obj: g, soundUrl: cm.coinSoundUrl });
      } else {
        loader.load(getSafeUrl(cUrl), (gltf: any) => {
          if (disposed) return;
          const m = gltf.scene;
          m.updateMatrixWorld(true);
          const b = new THREE.Box3().setFromObject(m);
          const s = new THREE.Vector3(); b.getSize(s);
          const sc = 0.58 / Math.max(0.01, Math.max(s.x, s.y, s.z));
          m.scale.setScalar(sc);
          coinTemplates.push({ obj: m, soundUrl: cm.coinSoundUrl });
        });
      }
    });

    // ---- JOGADOR 3D ----
    const startPlayerX = activeZone.startX;
    const startPlayerY = envRefs.floorHeightAt(startPlayerX);
    const playerState = {
      x: startPlayerX,
      y: startPlayerY,
      vy: 0,
      z: 0.2,
      facing: 1,
      hp: computedMaxHp,
      maxHp: computedMaxHp,
      attackCd: 0,
      specialCd: 0,
      attackAnimStart: 0,
      attackAnimUntil: 0,
      attackDuration: 190,
      attackPose: 'punch' as CombatPoseKind,
      isAirAttack: false,
      specialUntil: 0,
      comboStep: 1,
      lastAttackTime: 0,
      hurtUntil: 0,
      knockdownUntil: 0,
      getupUntil: 0,
      invulnUntil: 0,
      burnUntil: 0,
      nextBurnTick: 0,
      bleedUntil: 0,
      nextBleedTick: 0,
      poisonUntil: 0,
      nextPoisonTick: 0,
      freezeStacks: 0,
      freezeUntil: 0,
      freezeMesh: null as THREE.Object3D | null,
      webStacks: 0,
      webUntil: 0,
      webBreakHits: 0,
      webMesh: null as THREE.Object3D | null,
      grabbedByPiledriverUntil: 0,
      tempWeapon: null as ArcadeWeaponKind | null,
      tempWeaponUses: 0,
      isLeftHanded: (userData?.avatarConfig as any)?.handedness === 'left',
      group: new THREE.Group(),
      viewer: null as any,
      playerObj: null as any,
      walkAnim: new WalkingAnimation(),
    };
    playerState.group.position.set(playerState.x, playerState.y, playerState.z);
    scene.add(playerState.group);

    const playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.48, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 })
    );
    playerShadow.rotation.x = -Math.PI / 2;
    playerShadow.position.set(playerState.x, startPlayerY + 0.02, playerState.z);
    scene.add(playerShadow);

    const shockwaveMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 2.8, 24),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0 })
    );
    shockwaveMesh.rotation.x = -Math.PI / 2;
    shockwaveMesh.visible = false;
    scene.add(shockwaveMesh);

    (async () => {
      try {
        const cfg = userData?.avatarConfig || {};
        const rawSkin = (cfg as any)?.customSkinUrl || await generateMinecraftSkinUrl(cfg as any);
        const skinUrl = (rawSkin && !/^(https?:|data:|blob:)/i.test(rawSkin)) ? `https://${rawSkin}` : rawSkin;
        const po: any = new PlayerObject();
        if (po.cape) { po.cape.visible = false; po.remove(po.cape); }
        if (po.elytra) { po.elytra.visible = false; po.remove(po.elytra); }
        if (po.ears) { po.ears.visible = false; po.skin?.head?.remove?.(po.ears); }
        po.skin.modelType = (cfg as any)?.gender === 'female' ? 'slim' : 'default';
        const tex = await loadSkinTexture(skinUrl);
        if (disposed) return;
        if (tex) po.skin.map = tex;
        const sc = 1.85 / 32.25;
        po.scale.setScalar(sc);
        po.position.y = 16.25 * sc;
        po.rotation.y = Math.PI / 2;
        po.updateMatrixWorld(true);
        attachEquippedItemsToPlayer(po, cfg, equippedItems, loader);
        playerState.group.add(po);
        playerState.playerObj = po;
      } catch (e) {
        console.warn('[ArcadeBeatEmUp] Erro ao carregar avatar 3D:', e);
      }
    })();

    // ---- PROPS DESTRUTÍVEIS + ALVOS DAS FASES BÔNUS ----
    interface CrateEntity {
      id: number;
      kind: 'crate' | 'barrel' | 'wood_barrel' | 'fire_barrel' | 'cone' | 'phone_booth' | 'trash_can' | 'tire_stack' | 'car' | 'glass_thin' | 'glass_thick';
      x: number;
      z: number;
      hp: number;
      maxHp: number;
      mesh: THREE.Object3D;
      broken: boolean;
      isPreBoss?: boolean;
      solidTop?: number;
      guaranteedDrop?: 'pipe' | 'knife' | 'sword' | 'meat' | 'potion';
    }
    const crates: CrateEntity[] = [];
    const crateTex = makeCrateTexture();
    const barrelTex = makeBarrelTexture();
    const crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.05, 14);

    if (stageId === 'bonus_car') {
      const car = makeSportsCarMesh();
      car.group.position.set(11, 0, 0.1);
      scene.add(car.group);
      const carMaxHp = Math.max(280, playerAttackPower * 14);
      crates.push({ id: 9001, kind: 'car', x: 11, z: 0.1, hp: carMaxHp, maxHp: carMaxHp, mesh: car.group, broken: false });
      setBossHud({ name: '🚗 Carro Turbo (Bônus)', hp: carMaxHp, maxHp: carMaxHp, barSize: carMaxHp });
    } else if (stageId === 'bonus_glass') {
      // Sequência de vidraças finas (1-2 golpes) e vidros reforçados (3-5 golpes)
      [8, 15, 22, 29, 36, 42].forEach((gx, idx) => {
        const isThick = idx % 2 === 1;
        [-1.1, 0.2, 1.5].forEach((gz, gi) => {
          const panel = new THREE.Mesh(
            new THREE.BoxGeometry(isThick ? 0.32 : 0.14, 2.2, 1.15),
            new THREE.MeshStandardMaterial({
              color: isThick ? 0x2563eb : 0x38bdf8,
              transparent: true,
              opacity: isThick ? 0.78 : 0.55,
              metalness: 0.4,
              roughness: 0.15,
            })
          );
          panel.position.set(gx, 1.1, gz);
          scene.add(panel);
          const gHp = isThick ? playerAttackPower * 3 : playerAttackPower;
          crates.push({ id: 8000 + idx * 10 + gi, kind: isThick ? 'glass_thick' : 'glass_thin', x: gx, z: gz, hp: gHp, maxHp: gHp, mesh: panel, broken: false });
        });
      });
    } else {
      if (!envRefs.customPropsOnly) {
        let crateIdSeq = 1;
        stageZones.forEach((zDef) => {
          const zonePreBossX = zDef.preBossX ?? preBossX;
          for (let px = zDef.minX + 8; px < zDef.maxX - 7; px += 15) {
            const pz = crateIdSeq % 2 === 0 ? -1.45 : 1.45;
            const kind = crateIdSeq % 2 === 0 ? 'crate' : 'barrel';
            const m = new THREE.Mesh(
              kind === 'crate' ? crateGeo : barrelGeo,
              new THREE.MeshStandardMaterial({ map: kind === 'crate' ? crateTex : barrelTex, roughness: 0.75 })
            );
            m.position.set(px, envRefs.floorHeightAt(px) + (kind === 'crate' ? 0.45 : 0.525), pz);
            scene.add(m);
            const isPreBoss = px >= zonePreBossX - 16 && px <= zonePreBossX + 8;
            crates.push({ id: crateIdSeq++, kind, x: px, z: pz, hp: 35, maxHp: 35, mesh: m, broken: false, isPreBoss });
          }
        });
      }
      // Props específicos do cenário (Cabine Telefônica, Lata de Lixo, Barris de Madeira, Pilhas de Pneus, Cones, Latões de Fogo!)
      (envRefs.breakableProps || []).forEach((bp) => {
        const bpHp = bp.hp || (bp.kind === 'cone' ? 20 : 38);
        crates.push({
          id: bp.id,
          kind: bp.kind,
          x: bp.x,
          z: bp.z,
          hp: bpHp,
          maxHp: bpHp,
          mesh: bp.mesh,
          broken: false,
          isPreBoss: bp.isPreBoss,
          solidTop: bp.solidTop,
          guaranteedDrop: bp.guaranteedDrop,
        });
      });
    }

    const sparks: { mesh: THREE.Mesh; until: number }[] = [];
    const spawnSpark = (x: number, y: number, z: number, colorHex: number) => {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.32, 0),
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.92 })
      );
      m.position.set(x, y, z);
      scene.add(m);
      sparks.push({ mesh: m, until: performance.now() + 150 });
    };

    // Partículas 3D de Sangramento (gotas vermelhas caindo no chão), Fogo e Zonas em chamas!
    const fxParticles: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; floorY: number; until: number; isFlame?: boolean }[] = [];
    const spawnBloodDroplet = (x: number, y: number, z: number) => {
      for (let i = 0; i < 3; i++) {
        const drop = new THREE.Mesh(
          new THREE.BoxGeometry(0.11, 0.16, 0.11),
          new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.95 })
        );
        drop.position.set(x + (Math.random() - 0.5) * 0.45, y + Math.random() * 0.5, z + (Math.random() - 0.5) * 0.35);
        scene.add(drop);
        fxParticles.push({
          mesh: drop,
          vx: (Math.random() - 0.5) * 1.4,
          vy: -0.6 - Math.random() * 1.8,
          vz: (Math.random() - 0.5) * 1.0,
          floorY: envRefs.floorHeightAt(x) + 0.04,
          until: performance.now() + 950,
        });
      }
    };
    const spawnFlamePuff = (x: number, y: number, z: number) => {
      const fl = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.52, 5),
        new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xf97316 : 0xfacc15, transparent: true, opacity: 0.88 })
      );
      fl.position.set(x + (Math.random() - 0.5) * 0.45, y + 0.3, z + (Math.random() - 0.5) * 0.35);
      scene.add(fl);
      fxParticles.push({
        mesh: fl,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 1.9 + Math.random() * 1.2,
        vz: (Math.random() - 0.5) * 0.6,
        floorY: -99,
        until: performance.now() + 480,
        isFlame: true,
      });
    };

    const buildIceCubeGroup = (scaleMul = 1.0): THREE.Group => {
      const ice = new THREE.Group();
      const iceMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.58, roughness: 0.2, metalness: 0.1 });
      const mainBox = new THREE.Mesh(new THREE.BoxGeometry(1.15 * scaleMul, 1.95 * scaleMul, 1.15 * scaleMul), iceMat);
      mainBox.position.y = 0.98 * scaleMul;
      const side1 = new THREE.Mesh(new THREE.BoxGeometry(0.7 * scaleMul, 1.1 * scaleMul, 0.7 * scaleMul), iceMat);
      side1.position.set(0.55 * scaleMul, 0.55 * scaleMul, 0.25 * scaleMul);
      const puddle = new THREE.Mesh(
        new THREE.CircleGeometry(0.95 * scaleMul, 18),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.y = 0.03;
      ice.add(mainBox, side1, puddle);
      return ice;
    };

    const buildWebCageGroup = (): THREE.Group => {
      const grp = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, wireframe: true, transparent: true, opacity: 0.85 });
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.72, 1.85, 8, 4), mat);
      cage.position.y = 0.95;
      grp.add(cage);
      return grp;
    };

    const groundFires: { x: number; z: number; until: number; nextTick: number; mesh: THREE.Group }[] = [];
    const spawnGroundFirePatch = (x: number, z: number) => {
      const grp = new THREE.Group();
      const fMat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.82 });
      [-0.25, 0.0, 0.25].forEach((ox, i) => {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.85, 6), fMat);
        c.position.set(ox, 0.42, (i - 1) * 0.15);
        grp.add(c);
      });
      grp.position.set(x, envRefs.floorHeightAt(x), z);
      scene.add(grp);
      groundFires.push({ x, z, until: performance.now() + 4200, nextTick: 0, mesh: grp });
    };

    // ---- PROJÉTEIS (Teias, Tiros, Granadas, Facas Ninjas e Molotovs Inflamáveis) ----
    interface ProjectileEntity {
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      damage: number;
      effect: string;
      projKind: 'orb' | 'grenade' | 'knife' | 'molotov';
      fromPlayer?: boolean;
      mesh: THREE.Object3D;
      dead: boolean;
    }
    const projectiles: ProjectileEntity[] = [];
    const spawnProjectile = (
      x: number,
      y: number,
      z: number,
      vx: number,
      damage: number,
      effect: string,
      projKind: 'orb' | 'grenade' | 'knife' | 'molotov' = 'orb',
      fromPlayer = false
    ) => {
      let mesh: THREE.Object3D;
      if (projKind === 'knife') {
        const km = buildArcadeWeaponMesh('knife', false);
        km.scale.setScalar(1.2);
        km.rotation.set(0, 0, vx >= 0 ? -Math.PI / 2 : Math.PI / 2);
        mesh = km;
      } else if (projKind === 'molotov') {
        const grp = new THREE.Group();
        const bottle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.14, 0.36, 8),
          new THREE.MeshStandardMaterial({ color: 0x15803d, transparent: true, opacity: 0.9 })
        );
        const flame = new THREE.Mesh(
          new THREE.ConeGeometry(0.13, 0.25, 7),
          new THREE.MeshBasicMaterial({ color: 0xf97316 })
        );
        flame.position.y = 0.26;
        grp.add(bottle, flame);
        mesh = grp;
      } else {
        const isGrenade = projKind === 'grenade';
        const color = effect === 'burn' ? 0xf97316 : effect === 'freeze' ? 0x38bdf8 : effect === 'poison' ? 0x22c55e : isGrenade ? 0x16a34a : 0xe2e8f0;
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(isGrenade ? 0.24 : 0.2, 8, 8),
          new THREE.MeshBasicMaterial({ color })
        );
      }
      mesh.position.set(x, y, z);
      scene.add(mesh);
      const initVy = (projKind === 'grenade' || projKind === 'molotov') ? 5.2 : 0;
      projectiles.push({ x, y, z, vx, vy: initVy, damage, effect, projKind, fromPlayer, mesh, dead: false });
    };

    // ---- DROPS REAIS NO CHÃO (Moeda 3D Ativa + Poções/Carnes/Elixir + Armas de Rua + Drops do Monstro) ----
    interface DropEntity {
      id: number;
      kind: 'coin' | 'heal' | 'item' | 'weapon';
      healTier?: 'potion' | 'meat' | 'elixir';
      weaponKind?: ArcadeWeaponKind;
      value: number;
      label: string;
      soundUrl?: string;
      itemData?: any;
      sourceMonsterName?: string;
      x: number;
      y: number;
      vy: number;
      z: number;
      obj: THREE.Object3D;
      collected: boolean;
    }
    const drops: DropEntity[] = [];
    let dropSeq = 1;
    let potionDropsUsed = 0;
    let meatDropsUsed = 0;
    let elixirDropsUsed = 0;

    const spawnDrop = (
      kind: 'coin' | 'heal' | 'item' | 'weapon',
      value: number,
      x: number,
      z: number,
      opts?: { healItem?: HealItemTemplate; itemData?: any; sourceMonsterName?: string; weaponKind?: ArcadeWeaponKind }
    ) => {
      const groundY = envRefs.floorHeightAt(x);
      let obj: THREE.Object3D;
      let label = `+${value} Moedas`;
      let soundUrl = activeCoinModel?.coinSoundUrl;
      let healTier: 'potion' | 'meat' | 'elixir' | undefined;
      let weaponKind: ArcadeWeaponKind | undefined = opts?.weaponKind;

      if (kind === 'weapon') {
        weaponKind = weaponKind || (['knife', 'sword', 'pipe'][dropSeq % 3] as ArcadeWeaponKind);
        obj = buildArcadeWeaponMesh(weaponKind, false);
        obj.scale.setScalar(1.15);
        label = WEAPON_META[weaponKind].label;
      } else if (kind === 'coin') {
        if (coinTemplates.length > 0) {
          const picked = coinTemplates[dropSeq % coinTemplates.length];
          obj = picked.obj.clone(true);
          soundUrl = picked.soundUrl || soundUrl;
        } else {
          const m = new THREE.Mesh(
            new THREE.CylinderGeometry(0.24, 0.24, 0.08, 14),
            new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x854d0e, roughness: 0.35 })
          );
          m.rotation.z = Math.PI / 2;
          obj = m;
        }
      } else if (kind === 'heal') {
        const pickedHeal = opts?.healItem || null;
        healTier = pickedHeal?.tier || 'potion';
        if (pickedHeal?.imageUrl) {
          const tex = texLoader.load(getSafeUrl(pickedHeal.imageUrl));
          tex.magFilter = THREE.NearestFilter;
          const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
          spr.scale.set(0.75, 0.75, 1);
          obj = spr;
          label = `${pickedHeal.title} (+${pickedHeal.healAmount} HP)`;
          value = pickedHeal.healAmount;
          soundUrl = pickedHeal.soundUrl;
        } else {
          obj = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.32, 0.32),
            new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x7f1d1d })
          );
          label = `Poção da Vida (+${value} HP)`;
        }
      } else {
        const item = opts?.itemData;
        const imgUrl = item?.imageUrl || item?.itemImageUrl;
        if (imgUrl) {
          const tex = texLoader.load(getSafeUrl(imgUrl));
          tex.magFilter = THREE.NearestFilter;
          const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
          spr.scale.set(0.78, 0.78, 1);
          obj = spr;
        } else {
          obj = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.3, 0),
            new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0369a1 })
          );
        }
        label = `${item?.title || item?.name || 'Item Raro'}${value > 1 ? ` x${value}` : ''}`;
      }

      obj.position.set(x, groundY + 0.65, z);
      scene.add(obj);
      drops.push({
        id: dropSeq++,
        kind,
        healTier,
        weaponKind,
        value,
        label,
        soundUrl,
        itemData: opts?.itemData,
        sourceMonsterName: opts?.sourceMonsterName,
        x,
        y: groundY + 0.65,
        vy: 4.0,
        z,
        obj,
        collected: false,
      });
    };

    // ---- INIMIGOS (CHEFES GLB + SUB-CHEFES COM SKIN + GANGUES HUMANAS E MONSTROS EM CUBOS) ----
    interface EnemyEntity {
      id: number;
      name: string;
      isBoss: boolean;
      isSubBoss: boolean;
      isMonster: boolean;
      isSpider: boolean;
      moveProfile: EnemyMoveProfile;
      plannedMove: CombatPoseKind;
      lastMove: string;
      heldWeapon: ArcadeWeaponKind | null;
      acroPhase: number;
      baseScale: number;
      speed: number;
      x: number;
      y: number;
      vy: number;
      z: number;
      vx: number;
      hp: number;
      maxHp: number;
      barSize: number;
      attack: number;
      defense: number;
      evasion: number;
      critChance: number;
      damageEffect?: string;
      hasSpecial?: boolean;
      attacksConfig?: MonsterAttacksConfig;
      drops?: any[];
      summonThresholdIdx: number;
      retreatUntil: number;
      facing: number;
      windupStart: number;
      windupUntil: number;
      isLungeSpecial: boolean;
      isRangedShot: boolean;
      attackAnimStart: number;
      attackAnimUntil: number;
      attackCdUntil: number;
      hurtUntil: number;
      koUntil: number;
      hitStunCount: number;
      lastHitAt: number;
      dashUntil: number;
      dashVx: number;
      piledriverCdUntil: number;
      freezeStacks: number;
      freezeUntil: number;
      freezeMesh: THREE.Object3D | null;
      transformedAnimal?: TransformAnimal;
      animalRoot?: THREE.Object3D | null;
      pigEnraged?: boolean;
      fireShotsLeft: number;
      fleeingOffscreen?: boolean;
      activeStatus: 'none' | 'burn' | 'poison' | 'bleed' | 'freeze' | 'electric' | 'impact' | 'transform';
      statusUntil: number;
      nextStatusTick: number;
      group: THREE.Group;
      modelRoot?: THREE.Object3D;
      shadow: THREE.Mesh;
      mixer?: THREE.AnimationMixer;
      actions?: Record<string, THREE.AnimationAction>;
      skinViewer?: any;
      skinPlayerObj?: any;
      walkAnim?: any;
      dead: boolean;
    }

    const enemies: EnemyEntity[] = [];
    let enemySeq = 1;
    let activeWaveIdx = -1;
    let cameraLockMinX = activeZone.minX - 0.5;
    let cameraLockMaxX = activeZone.maxX;
    let maxCamX = Math.max(activeZone.minX + 5.5, activeZone.startX + 1.8);
    let shakeUntil = 0;
    const clearedWaves = new Set<number>();

    const loadGlbIntoEntity = (
      modelUrl: string,
      skinUrl: string | undefined,
      baseScale: number,
      g: THREE.Group,
      entity: EnemyEntity,
      modelForward = 'z'
    ) => {
      const safe = getSafeUrl(modelUrl);
      loader.load(safe, (gltf: any) => {
        if (disposed || entity.dead) return;
        const root = gltf.scene;
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const sz = new THREE.Vector3(); box.getSize(sz);
        const targetH = 1.85 * baseScale;
        const sc = targetH / Math.max(0.01, sz.y);
        root.scale.setScalar(sc);
        root.position.y = -box.min.y * sc;
        // Normaliza frente local para +Z (igual PlayerObject e MapExplorerPoC)
        const faceOffset = modelForward === '-z' ? Math.PI : modelForward === 'x' ? -Math.PI / 2 : modelForward === '-x' ? Math.PI / 2 : 0;
        root.rotation.y = faceOffset;
        const pivot = new THREE.Group();
        pivot.add(root);
        pivot.rotation.y = entity.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
        g.add(pivot);
        entity.modelRoot = pivot;

        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(root);
          const actions: Record<string, THREE.AnimationAction> = {};
          gltf.animations.forEach((clip: any) => { actions[clip.name.toLowerCase()] = mixer.clipAction(clip); });
          entity.mixer = mixer;
          entity.actions = actions;
          const walkAction = actions['walk'] || actions['run'] || actions['idle'] || Object.values(actions)[0];
          walkAction?.play();
        }
        if (skinUrl) applyGlbSkinTexture(root, skinUrl, () => {});
      });
    };

    const andoreRoster = regularRoster.filter(r => /andore/i.test(r.name));
    const regularNonFireRoster = regularRoster.filter(r => r.moveProfile !== 'ninja_fire' && !/andore/i.test(r.name));
    const fireNinjaTmpl = regularRoster.find(r => r.moveProfile === 'ninja_fire') || regularRoster[0];

    const spawnEnemyFromSpec = (
      sp: {
        side: 'front' | 'back' | 'drop' | 'door';
        doorX?: number;
        doorZ?: number;
        zOffset: number;
        isBoss?: boolean;
        isSubBoss?: boolean;
        isFireSquad?: boolean;
        isAndore?: boolean;
        gangIdx: number;
      },
      lockMinX: number,
      lockMaxX: number,
      sIdx: number
    ) => {
      const isBoss = !!sp.isBoss;
      const bossTmpl: BossTemplate | null = isBoss && bossTemplates.length > 0
        ? bossTemplates[stageIdxNum % bossTemplates.length]
        : null;
      const basePool = regularNonFireRoster.length > 0 ? regularNonFireRoster : regularRoster;
      const gangTmpl = sp.isAndore && andoreRoster.length > 0
        ? andoreRoster[sp.gangIdx % andoreRoster.length]
        : sp.isFireSquad
          ? fireNinjaTmpl
          : (sp.isSubBoss && subBossRoster.length > 0)
            ? subBossRoster[sp.gangIdx % subBossRoster.length]
            : basePool[sp.gangIdx % basePool.length];
      const isSubBoss = !isBoss && (!!sp.isSubBoss || !!gangTmpl.isSubBoss);

      const bossMul = stageMeta.bossHpMultiplier;
      const minBossHp = 950 + stageIdxNum * 650;
      const rawBossHp = Math.round((bossTmpl?.hp || 180) * bossMul);
      const adaptiveFloor = playerAttackPower * (isBoss ? (28 + stageIdxNum * 6) : 5);
      const maxHp = isBoss
        ? Math.max(minBossHp, rawBossHp, adaptiveFloor)
        : Math.max(
            gangTmpl.hp,
            isSubBoss
              ? Math.round(adaptiveFloor * 1.65)
              : (gangTmpl.scale >= 1.25 ? Math.round(adaptiveFloor * 1.45) : Math.round(adaptiveFloor * 0.72))
          );
      const barSize = isBoss
        ? Math.max(180, Math.round(maxHp / Math.min(8, Math.max(3, Math.ceil(bossMul / 2) + 2))))
        : (isSubBoss || maxHp > 350 ? 150 : 120);
      const baseScale = isBoss ? (bossTmpl?.scale || 1.65) : gangTmpl.scale;
      const name = isBoss
        ? `👑 ${stageMeta.bossDisplayName}${bossTmpl ? ` (${bossTmpl.name})` : ''}`
        : gangTmpl.name;

      const spawnX = sp.side === 'door'
        ? (sp.doorX ?? (lockMinX + lockMaxX) / 2)
        : sp.side === 'drop'
          ? (lockMinX + lockMaxX) / 2 + (sIdx % 2 === 0 ? 4 : -4)
          : (sp.side === 'front' ? lockMaxX + 1.8 + sIdx * 1.1 : lockMinX - 1.8 - sIdx * 1.1);
      const spawnZ = sp.side === 'door'
        ? (sp.doorZ ?? -3.5)
        : Math.max(STREET_Z_MIN, Math.min(STREET_Z_MAX, sp.zOffset));
      const spawnY = sp.side === 'drop' ? 6.8 + sIdx * 0.7 : envRefs.floorHeightAt(spawnX);

      const g = new THREE.Group();
      g.position.set(spawnX, spawnY, spawnZ);
      scene.add(g);

      const sh = new THREE.Mesh(
        new THREE.CircleGeometry(isBoss ? 0.8 : Math.max(0.42, 0.48 * baseScale), 14),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 })
      );
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(spawnX, envRefs.floorHeightAt(spawnX) + 0.02, spawnZ);
      scene.add(sh);

      const bossAtkBase = Math.max(95 + stageIdxNum * 45, Math.round((bossTmpl?.attack || 55) * (1.8 + stageIdxNum * 0.45)));
      const entity: EnemyEntity = {
        id: enemySeq++,
        name,
        isBoss,
        isSubBoss,
        isMonster: isBoss || !!gangTmpl.isMonster,
        isSpider: /aranha|spider/i.test(name),
        moveProfile: isBoss ? 'giant' : gangTmpl.moveProfile,
        plannedMove: 'punch',
        lastMove: '',
        heldWeapon: null,
        acroPhase: 0,
        baseScale,
        speed: isBoss ? 3.1 + stageIdxNum * 0.16 : gangTmpl.speed,
        x: spawnX,
        y: spawnY,
        vy: sp.side === 'door' && isBoss ? 6.0 : 0,
        z: spawnZ,
        vx: 0,
        hp: maxHp,
        maxHp,
        barSize,
        attack: isBoss ? bossAtkBase : gangTmpl.attack,
        defense: isBoss ? Math.round((bossTmpl?.defense || 18) + stageIdxNum * 8) : gangTmpl.defense,
        evasion: isBoss ? (bossTmpl?.evasion || 6) : gangTmpl.evasion,
        critChance: isBoss ? (bossTmpl?.critChance || 14) : gangTmpl.critChance,
        damageEffect: isBoss ? bossTmpl?.damageEffect : gangTmpl.damageEffect,
        hasSpecial: isBoss ? true : gangTmpl.hasSpecial,
        attacksConfig: isBoss ? bossTmpl?.attacksConfig : gangTmpl.attacksConfig,
        drops: isBoss ? (bossTmpl?.drops || []) : (gangTmpl.drops || []),
        summonThresholdIdx: 0,
        retreatUntil: 0,
        facing: sp.side === 'front' ? -1 : 1,
        windupStart: 0,
        windupUntil: 0,
        isLungeSpecial: false,
        isRangedShot: false,
        attackAnimStart: 0,
        attackAnimUntil: 0,
        attackCdUntil: performance.now() + 550 + sIdx * 240,
        hurtUntil: 0,
        koUntil: 0,
        hitStunCount: 0,
        lastHitAt: 0,
        dashUntil: 0,
        dashVx: 0,
        piledriverCdUntil: performance.now() + 2800,
        freezeStacks: 0,
        freezeUntil: 0,
        freezeMesh: null,
        animalRoot: null,
        fireShotsLeft: gangTmpl.moveProfile === 'ninja_fire' ? 2 + (sIdx % 2) : 0,
        activeStatus: 'none',
        statusUntil: 0,
        nextStatusTick: 0,
        group: g,
        shadow: sh,
        dead: false,
      };

      if (isBoss && bossTmpl?.modelUrl) {
        loadGlbIntoEntity(bossTmpl.modelUrl, bossTmpl.skinUrl, baseScale, g, entity, bossTmpl.modelForward || 'z');
      } else if (!isBoss && gangTmpl.modelUrl) {
        loadGlbIntoEntity(gangTmpl.modelUrl, gangTmpl.skinUrl, baseScale, g, entity, 'z');
      } else {
        (async () => {
          try {
            const rawSkin = (!isBoss && gangTmpl.skinUrl)
              ? gangTmpl.skinUrl
              : await generateMinecraftSkinUrl(gangTmpl.avatarConfig || ({} as any));
            const sUrl = (rawSkin && (/^(https?:|data:|blob:)/i.test(rawSkin) ? rawSkin : (getSafeUrl(rawSkin) || rawSkin)));
            const po: any = new PlayerObject();
            if (po.cape) { po.cape.visible = false; po.remove(po.cape); }
            if (po.elytra) { po.elytra.visible = false; po.remove(po.elytra); }
            if (po.ears) { po.ears.visible = false; po.skin?.head?.remove?.(po.ears); }
            po.skin.modelType = gangTmpl.avatarConfig?.gender === 'female' ? 'slim' : 'default';
            let tex = await loadSkinTexture(sUrl);
            if (!tex && gangTmpl.skinUrl) {
              const fallbackSkin = await generateMinecraftSkinUrl(gangTmpl.avatarConfig || ({} as any));
              tex = await loadSkinTexture(fallbackSkin);
            }
            if (disposed || entity.dead) return;
            if (tex) po.skin.map = tex;
            const targetH = 1.85 * baseScale;
            const sc = targetH / 32.25;
            const wSc = gangTmpl.widthScale || 1.0;
            po.scale.set(sc * wSc, sc, sc * Math.min(1.18, wSc));
            po.position.y = 16.25 * sc;
            po.rotation.y = entity.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
            po.updateMatrixWorld(true);
            if (!isBoss && !gangTmpl.skinUrl) {
              attachHeadAddonsToPlayer(po, gangTmpl.avatarConfig, []);
            }
            g.add(po);
            entity.skinPlayerObj = po;
            entity.walkAnim = new WalkingAnimation();
          } catch { /* noop */ }
        })();
      }

      enemies.push(entity);
      if (isBoss) {
        setBossHud({ name: entity.name, hp: entity.hp, maxHp: entity.maxHp, barSize: entity.barSize });
      }
    };

    const spawnWave = (waveIdx: number) => {
      const w = stageWaves[waveIdx];
      if (!w) return;
      activeWaveIdx = waveIdx;
      cameraLockMinX = w.lockMinX;
      cameraLockMaxX = w.lockMaxX;
      setGoArrow(false);
      setWaveBanner(w.label);
      setTimeout(() => { if (!disposed) setWaveBanner(''); }, 2200);
      if (w.isBossWave && envRefs.bossDoor) {
        envRefs.bossDoor.triggerBreak();
        shakeUntil = performance.now() + 260;
      }
      w.spawns.forEach((sp, sIdx) => spawnEnemyFromSpec(sp, w.lockMinX, w.lockMaxX, sIdx));
    };

    const applyTransformAnimalToEnemy = (en: EnemyEntity, animal: TransformAnimal, now: number) => {
      en.activeStatus = 'transform';
      en.transformedAnimal = animal;
      en.pigEnraged = animal === 'porco';
      en.statusUntil = now + 7000;
      en.speed = animal === 'coelho' ? en.speed * 1.55 : en.speed;
      if (en.skinPlayerObj) en.skinPlayerObj.visible = false;
      if (en.modelRoot) en.modelRoot.visible = false;
      if (en.animalRoot) {
        en.group.remove(en.animalRoot);
        en.animalRoot = null;
      }
      const animalUrl = getTransformModelUrl(animal);
      loader.load(getSafeUrl(animalUrl), (gltf: any) => {
        if (disposed || en.dead || en.activeStatus !== 'transform') return;
        const root = gltf.scene;
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const sz = new THREE.Vector3(); box.getSize(sz);
        const targetH = animal === 'porco' ? 1.25 : animal === 'sapo' ? 0.95 : 0.9;
        const sc = targetH / Math.max(0.01, sz.y);
        root.scale.setScalar(sc);
        root.position.y = -box.min.y * sc;
        if (animal === 'porco') {
          root.traverse((c: any) => {
            if (c.isMesh && c.material) {
              const m = c.material.clone();
              if (m.color) m.color.setHex(0xef4444);
              if (m.emissive) m.emissive.setHex(0x7f1d1d);
              c.material = m;
            }
          });
        }
        const piv = new THREE.Group();
        piv.add(root);
        piv.rotation.y = en.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
        en.group.add(piv);
        en.animalRoot = piv;
      });
    };

    const applyWeaponEffectToEnemy = (en: EnemyEntity, dmgDealt: number, now: number) => {
      const { effect, chance } = equippedEffectInfo;
      if (!effect || effect === 'none' || chance <= 0) return;
      if (Math.random() * 100 >= chance) return;

      if (effect === 'heal') {
        const healAmt = Math.max(5, Math.round(dmgDealt * 0.25));
        playerState.hp = Math.min(playerState.maxHp, playerState.hp + healAmt);
        setPlayerHp(playerState.hp);
        spawnFloat(`💚 +${healAmt} Cura`, '#4ade80', new THREE.Vector3(playerState.x, 2.2, playerState.z), camera);
        return;
      }
      if (effect === 'electric') {
        const shockDmg = Math.max(12, Math.round(dmgDealt * 0.55));
        en.hp = Math.max(0, en.hp - shockDmg);
        en.hurtUntil = Math.max(en.hurtUntil, now + 800);
        spawnSpark(en.x, en.y + 1.2, en.z, 0xfacc15);
        spawnFloat(`⚡ -${shockDmg}`, '#facc15', new THREE.Vector3(en.x, 2.4, en.z), camera);
        setStatusMessage(`⚡ Raio ativado (${chance}%)!`);
        return;
      }
      if (effect === 'impact') {
        en.hurtUntil = Math.max(en.hurtUntil, now + 1100);
        en.vx = (en.x >= playerState.x ? 1 : -1) * 9.5;
        shakeUntil = now + 200;
        spawnSpark(en.x, en.y + 1.0, en.z, 0xf472b6);
        spawnFloat('💥 ESTRONDO!', '#f472b6', new THREE.Vector3(en.x, 2.4, en.z), camera);
        setStatusMessage(`💥 Estrondo ativado (${chance}%)!`);
        return;
      }
      if (effect === 'transform') {
        const animal = rollTransformAnimal();
        applyTransformAnimalToEnemy(en, animal, now);
        spawnFloat(`🌀 ${TRANSFORM_LABELS[animal].toUpperCase()}!`, '#c084fc', new THREE.Vector3(en.x, 2.4, en.z), camera);
        setStatusMessage(`🌀 Transformado em ${TRANSFORM_LABELS[animal]}!`);
        return;
      }
      if (effect === 'freeze') {
        en.freezeStacks++;
        if (en.freezeStacks >= FREEZE_HITS_TO_FREEZE) {
          en.freezeStacks = 0;
          en.activeStatus = 'freeze';
          en.freezeUntil = now + 3800;
          en.statusUntil = now + 3800;
          en.windupUntil = 0;
          en.dashUntil = 0;
          if (!en.freezeMesh) {
            en.freezeMesh = buildIceCubeGroup(en.baseScale);
            en.group.add(en.freezeMesh);
          }
          spawnFloat('🧊 CONGELADO!', '#38bdf8', new THREE.Vector3(en.x, 2.5, en.z), camera);
          setStatusMessage('🧊 Inimigo congelado no gelo!');
        } else {
          spawnFloat(`❄️ Gelo (${en.freezeStacks}/${FREEZE_HITS_TO_FREEZE})`, '#7dd3fc', new THREE.Vector3(en.x, 2.35, en.z), camera);
        }
        return;
      }
      if (effect === 'burn' || effect === 'poison' || effect === 'bleed') {
        en.activeStatus = effect;
        en.statusUntil = now + 5500;
        en.nextStatusTick = now + 750;
        if (effect === 'bleed') spawnBloodDroplet(en.x, en.y + 1.1, en.z);
        if (effect === 'burn') spawnFlamePuff(en.x, en.y + 0.8, en.z);
        const labels: Record<string, [string, string]> = {
          burn: ['🔥 QUEIMANDO!', '#fb923c'],
          poison: ['☠️ ENVENENADO!', '#4ade80'],
          bleed: ['🩸 SANGRANDO!', '#f87171'],
        };
        const [txt, col] = labels[effect];
        spawnFloat(txt, col, new THREE.Vector3(en.x, 2.35, en.z), camera);
        setStatusMessage(`${txt} (${chance}%)`);
      }
    };

    const performPlayerAttack = (isSpecial: boolean, isKick = false) => {
      const now = performance.now();
      if (
        now < playerState.knockdownUntil ||
        now < playerState.getupUntil ||
        now < playerState.freezeUntil ||
        now < playerState.grabbedByPiledriverUntil
      ) return;
      if (now < playerState.webUntil) {
        playerState.webBreakHits++;
        spawnSpark(playerState.x, playerState.y + 1.0, playerState.z, 0xf8fafc);
        if (playerState.webBreakHits >= 4) {
          playerState.webUntil = 0;
          playerState.webStacks = 0;
          playerState.webBreakHits = 0;
          if (playerState.webMesh) { playerState.group.remove(playerState.webMesh); playerState.webMesh = null; }
          spawnFloat('🕸️ TEIA QUEBRADA!', '#38bdf8', new THREE.Vector3(playerState.x, 2.1, playerState.z), camera);
        } else {
          spawnFloat(`🕸️ Debate-se! (${playerState.webBreakHits}/4)`, '#e2e8f0', new THREE.Vector3(playerState.x, 2.0, playerState.z), camera);
        }
        return;
      }

      const groundYHere = envRefs.floorHeightAt(playerState.x);
      const isAir = playerState.y > groundYHere + 0.12 || playerState.vy > 1.2;
      const activeTempWeapon = !isSpecial && !isKick ? playerState.tempWeapon : null;

      if (!isSpecial && !isAir) {
        playerState.comboStep = (now - playerState.lastAttackTime < 650) ? ((playerState.comboStep % 3) + 1) : 1;
        playerState.lastAttackTime = now;
      }

      const dur = isSpecial ? 420 : (isKick ? 260 : 195);
      playerState.attackDuration = dur;
      playerState.isAirAttack = isAir;
      playerState.attackAnimStart = now;
      playerState.attackAnimUntil = now + dur;
      playerState.attackCd = now + (isSpecial ? 380 : (isKick ? 250 : 165));

      let pose: CombatPoseKind = 'punch';
      if (isSpecial) {
        pose = 'high_kick';
      } else if (activeTempWeapon === 'knife') {
        pose = 'throw';
        const hasCloseEnemy = enemies.some(e => !e.dead && e.koUntil === 0 && Math.abs(e.x - playerState.x) < 2.2 && Math.abs(e.z - playerState.z) < 1.3);
        if (!hasCloseEnemy) {
          spawnProjectile(
            playerState.x + playerState.facing * 0.65,
            playerState.y + 1.15,
            playerState.z,
            playerState.facing * 12.5,
            playerAttackPower + WEAPON_META.knife.dmgBonus,
            'bleed',
            'knife',
            true
          );
          playerState.tempWeaponUses--;
          if (playerState.tempWeaponUses <= 0) {
            playerState.tempWeapon = null;
            attachArcadeWeaponToPlayerObj(playerState.playerObj, null);
            sheathPlayerMainWeapon(playerState.playerObj, playerState.isLeftHanded, false);
            setGroundWeaponLabel('');
          } else {
            setGroundWeaponLabel(`${WEAPON_META.knife.label} (${playerState.tempWeaponUses}x)`);
          }
          return;
        }
        pose = 'weapon_swing';
      } else if (activeTempWeapon) {
        pose = 'weapon_swing';
      } else if (isKick) {
        pose = isAir ? 'flying_kick' : (playerState.comboStep % 2 === 0 ? 'acro_kick' : 'side_kick');
      } else if (isAir) {
        pose = 'flying_kick';
      } else {
        pose = playerState.comboStep === 1 ? 'punch' : playerState.comboStep === 2 ? 'hook' : 'high_kick';
      }
      playerState.attackPose = pose;

      if (isSpecial) {
        playerState.specialCd = now + 3500;
        playerState.specialUntil = now + 420;
        shockwaveMesh.visible = true;
        shockwaveMesh.position.set(playerState.x, groundYHere + 0.08, playerState.z);
        shockwaveMesh.scale.setScalar(0.25);
        (shockwaveMesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
        shakeUntil = now + 180;
      } else {
        const stepFwd = pose === 'flying_kick' ? 1.15 : (isKick ? 0.55 : 0.3);
        playerState.x = Math.max(cameraLockMinX, Math.min(cameraLockMaxX, playerState.x + playerState.facing * stepFwd));
      }

      const wMeta = activeTempWeapon ? WEAPON_META[activeTempWeapon] : null;
      const reachX = (isSpecial ? 3.2 : (pose === 'flying_kick' ? 3.0 : isKick ? 2.85 : 2.5)) + (wMeta?.reachBonus || 0);
      const reachZ = isSpecial ? 2.3 : 1.55;
      let hitAnyWithWeapon = false;

      enemies.forEach((en) => {
        if (en.dead || en.koUntil > 0 || now < en.retreatUntil) return;
        const dx = en.x - playerState.x;
        const dz = Math.abs(en.z - playerState.z);
        const inFront = isSpecial ? Math.abs(dx) <= reachX : (dx * playerState.facing >= -0.6 && Math.abs(dx) <= reachX);
        if (inFront && dz <= reachZ) {
          hitAnyWithWeapon = true;
          const mult = isSpecial ? 1.85 : (pose === 'flying_kick' || pose === 'acro_kick' ? 1.5 : (isKick ? 1.3 : (playerState.comboStep === 3 ? 1.45 : 1.0)));
          const isCrit = isSpecial || playerState.comboStep === 3 || pose === 'acro_kick' || pose === 'flying_kick' || Math.random() * 100 < 12;
          const rawAtk = playerAttackPower + (wMeta?.dmgBonus || 0);
          const res = calculatePlayerHitDamage(Math.round(rawAtk * mult), en.defense, en.evasion, isCrit);
          if (res.isEvasion) {
            spawnFloat('Esquiva!', '#94a3b8', new THREE.Vector3(en.x, 2.0, en.z), camera);
            return;
          }
          en.hp = Math.max(0, en.hp - res.damage);

          // Hyper-Armor / Contra-ataque para inimigos NÃO ficarem apanhando passivamente!
          if (now - en.lastHitAt > 1800) en.hitStunCount = 0;
          en.lastHitAt = now;
          en.hitStunCount++;
          const counterThreshold = (en.isBoss || en.moveProfile === 'giant' || en.isSubBoss || en.moveProfile === 'slash') ? 2 : 3;

          if (en.hp > 0 && now >= en.freezeUntil && en.hitStunCount >= counterThreshold && !isSpecial) {
            en.hitStunCount = 0;
            en.hurtUntil = 0;
            en.attackCdUntil = now + 70;
            spawnFloat('💢 REVIDOU!', '#f87171', new THREE.Vector3(en.x, en.y + 2.45, en.z), camera);
          } else {
            en.hurtUntil = now + (activeTempWeapon === 'pipe' || isKick ? 300 : 210);
            en.windupUntil = 0;
            en.vx = (dx >= 0 ? 1 : -1) * (isSpecial || playerState.comboStep === 3 || isKick || activeTempWeapon === 'pipe' ? 6.2 : 3.0);
          }

          if (isCrit) shakeUntil = now + 130;
          spawnSpark((playerState.x + en.x) / 2, en.y + 1.15, en.z + 0.1, isSpecial ? 0xfacc15 : 0xffffff);
          spawnFloat(
            `${res.isCritical ? '💥 ' : ''}-${res.damage}`,
            res.isCritical ? '#facc15' : '#ffffff',
            new THREE.Vector3(en.x, en.y + (en.isBoss ? 2.6 : 1.9), en.z),
            camera
          );
          if (now >= en.freezeUntil) {
            applyWeaponEffectToEnemy(en, res.damage, now);
          }

          if (en.isBoss && (stageId === 'stage1_streets' || stageId === 'stage3_westside') && en.hp > 0) {
            const pct = en.hp / en.maxHp;
            if ((en.summonThresholdIdx === 0 && pct < 0.66) || (en.summonThresholdIdx === 1 && pct < 0.33)) {
              en.summonThresholdIdx++;
              en.retreatUntil = now + 3400;
              spawnFloat(
                envRefs.bossSeatPos ? '📣 *FIIIU!* Rindo na mureta do SUBWAY!' : '📣 CHAMANDO REFORÇOS!',
                '#fbbf24',
                new THREE.Vector3(en.x, en.y + 2.8, en.z),
                camera
              );
              spawnEnemyFromSpec({ side: 'front', zOffset: -0.9, gangIdx: en.summonThresholdIdx }, cameraLockMinX, cameraLockMaxX, 0);
              spawnEnemyFromSpec({ side: 'back', zOffset: 0.9, gangIdx: en.summonThresholdIdx + 2 }, cameraLockMinX, cameraLockMaxX, 1);
              if (stageId === 'stage1_streets' && en.summonThresholdIdx === 2) {
                spawnEnemyFromSpec({ side: 'front', zOffset: 0.1, isFireSquad: true, gangIdx: 0 }, cameraLockMinX, cameraLockMaxX, 2);
              }
            }
          }

          if (en.isBoss || enemies.every(o => o.dead || !o.isBoss)) {
            setBossHud(en.hp > 0 ? { name: en.name, hp: en.hp, maxHp: en.maxHp, barSize: en.barSize } : null);
          }
          if (en.hp <= 0) {
            en.koUntil = now + 450;
            en.vx = (dx >= 0 ? 1 : -1) * 7.5;
          }
        }
      });

      if (hitAnyWithWeapon && activeTempWeapon) {
        playerState.tempWeaponUses--;
        if (playerState.tempWeaponUses <= 0) {
          playerState.tempWeapon = null;
          attachArcadeWeaponToPlayerObj(playerState.playerObj, null);
          sheathPlayerMainWeapon(playerState.playerObj, playerState.isLeftHanded, false);
          setGroundWeaponLabel('');
        } else {
          setGroundWeaponLabel(`${WEAPON_META[activeTempWeapon].label} (${playerState.tempWeaponUses}x)`);
        }
      }

      crates.forEach((cr) => {
        if (cr.broken) return;
        const dx = cr.x - playerState.x;
        const dz = Math.abs(cr.z - playerState.z);
        const crReach = cr.kind === 'car' ? 3.2 : reachX;
        const crZ = cr.kind === 'car' ? 2.0 : reachZ;
        const inFront = isSpecial ? Math.abs(dx) <= crReach : (dx * playerState.facing >= -0.6 && Math.abs(dx) <= crReach);
        if (inFront && dz <= crZ) {
          const dmg = Math.round(playerAttackPower * (isSpecial ? 1.8 : 1));
          cr.hp = Math.max(0, cr.hp - dmg);
          spawnSpark(cr.x + (cr.kind === 'car' ? (dx > 0 ? -1.4 : 1.4) : 0), 0.9, cr.z, 0xfbbf24);
          if (cr.kind === 'car') {
            cr.mesh.rotation.z = (Math.random() - 0.5) * 0.08;
            setBossHud({ name: '🚗 Carro Turbo (Bônus)', hp: cr.hp, maxHp: cr.maxHp, barSize: cr.maxHp });
            spawnFloat(`-${dmg}`, '#facc15', new THREE.Vector3(cr.x, 1.8, cr.z), camera);
          }
          if (cr.hp <= 0) {
            cr.broken = true;
            scene.remove(cr.mesh);
            if (cr.kind === 'car') {
              finished = true;
              setBossHud(null);
              spawnFloat('💥 CARRO DESTRUÍDO! +300 🪙', '#22c55e', new THREE.Vector3(cr.x, 1.8, cr.z), camera);
              setCoinsCollected(c => c + 300);
              advanceToNextStageWithMap(stageId, getNextCampaignStage(stageId));
            } else if (cr.kind === 'glass_thin' || cr.kind === 'glass_thick') {
              spawnFloat('🪟 +25 🪙', '#38bdf8', new THREE.Vector3(cr.x, 1.5, cr.z), camera);
              setCoinsCollected(c => c + 25);
              if (crates.every(c => c.broken)) {
                finished = true;
                setWaveBanner('VIDRAÇAS DESTRUÍDAS! +200 🪙');
                setCoinsCollected(c => c + 200);
                advanceToNextStageWithMap(stageId, getNextCampaignStage(stageId));
              }
            } else {
              const propLabels: Record<string, string> = {
                cone: '⚠️ Cone!',
                fire_barrel: '🔥 Latão!',
                barrel: '🛢️ Tambor!',
                wood_barrel: '🪵 Barril!',
                phone_booth: '☎️ Cabine!',
                trash_can: '🗑️ Lata de Lixo!',
                tire_stack: '🛞 Pneus!',
                crate: '📦 Caixote!',
              };
              spawnFloat(propLabels[cr.kind] || '📦 Quebrou!', '#fbbf24', new THREE.Vector3(cr.x, 1.0, cr.z), camera);
              const elixirCand = healItemsPool.find(h => h.tier === 'elixir' && calculatedRankIndex >= h.minRankIndex);
              const meatCand = healItemsPool.find(h => h.tier === 'meat');
              const potionCand = healItemsPool.find(h => h.tier === 'potion') || healItemsPool.find(h => h.tier !== 'elixir');
              if (cr.guaranteedDrop) {
                if (cr.guaranteedDrop === 'pipe' || cr.guaranteedDrop === 'knife' || cr.guaranteedDrop === 'sword') {
                  spawnDrop('weapon', WEAPON_META[cr.guaranteedDrop].uses, cr.x, cr.z, { weaponKind: cr.guaranteedDrop });
                } else if (cr.guaranteedDrop === 'meat' && meatCand) {
                  meatDropsUsed++;
                  spawnDrop('heal', meatCand.healAmount, cr.x, cr.z, { healItem: meatCand });
                } else if (cr.guaranteedDrop === 'potion' && potionCand) {
                  potionDropsUsed++;
                  spawnDrop('heal', potionCand.healAmount, cr.x, cr.z, { healItem: potionCand });
                } else {
                  spawnDrop('coin', 20, cr.x, cr.z);
                }
              } else {
                const roll = Math.random();
                if (cr.kind !== 'cone' && cr.isPreBoss && elixirCand && elixirDropsUsed < 1 && roll < 0.08) {
                  elixirDropsUsed++;
                  spawnDrop('heal', elixirCand.healAmount, cr.x, cr.z, { healItem: elixirCand });
                } else if (cr.kind !== 'cone' && meatCand && meatDropsUsed < 2 && roll < (cr.isPreBoss ? 0.38 : 0.18)) {
                  meatDropsUsed++;
                  spawnDrop('heal', meatCand.healAmount, cr.x, cr.z, { healItem: meatCand });
                } else if (cr.kind !== 'cone' && potionCand && potionDropsUsed < 3 && roll < (cr.isPreBoss ? 0.62 : 0.40)) {
                  potionDropsUsed++;
                  spawnDrop('heal', potionCand.healAmount, cr.x, cr.z, { healItem: potionCand });
                } else if (cr.kind !== 'cone' && roll < 0.70) {
                  const wk = (['knife', 'sword', 'pipe'] as ArcadeWeaponKind[])[Math.floor(Math.random() * 3)];
                  spawnDrop('weapon', WEAPON_META[wk].uses, cr.x, cr.z, { weaponKind: wk });
                } else if (roll < 0.90) {
                  spawnDrop('coin', cr.kind === 'cone' ? 10 : 15 + Math.floor(Math.random() * 16), cr.x, cr.z);
                } else {
                  spawnFloat('💨 Vazio!', '#94a3b8', new THREE.Vector3(cr.x, 1.3, cr.z), camera);
                }
              }
            }
          }
        }
      });
    };

    let lastTime = performance.now();
    let camX = maxCamX;
    let finished = false;
    let animFrame = 0;
    let hudTickCounter = 0;
    const bonusEndAt = stageMeta.isBonus ? performance.now() + 40000 : 0;

    const tick = () => {
      if (disposed) return;
      animFrame = requestAnimationFrame(tick);

      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      envRefs.updateAnimations?.(now / 1000, dt);

      if (envRefs.elevatorBeamsGroup) {
        envRefs.elevatorBeamsGroup.children.forEach((b: any) => {
          b.position.y -= 4.5 * dt;
          if (b.position.y < -2) b.position.y = 14;
        });
      }

      // Armadilhas de fogo no Estágio 4 (ciclo 4s: 2s apagado -> 0.8s aviso -> 1.2s fogo!)
      const fireCycle = (now % 4200);
      const fireOn = fireCycle >= 3000;
      const fireWarn = fireCycle >= 2100 && fireCycle < 3000;
      envRefs.fireTraps.forEach(ft => {
        ft.flameMesh.visible = fireOn;
        (ft.mesh.material as THREE.MeshStandardMaterial).color.setHex(fireOn ? 0xf97316 : fireWarn ? 0xfacc15 : 0x7f1d1d);
        if (fireOn && Math.abs(playerState.x - ft.x) < 1.1 && Math.abs(playerState.z - ft.z) < 0.9 && playerState.y < 0.6 && now >= playerState.invulnUntil && !finished) {
          playerState.hp = Math.max(0, playerState.hp - 18);
          playerState.invulnUntil = now + 600;
          setPlayerHp(playerState.hp);
          spawnFloat('-18 🔥 Armadilha!', '#fb923c', new THREE.Vector3(playerState.x, 2.0, playerState.z), camera);
          if (playerState.hp <= 0) { finished = true; setGameState('defeat'); }
        }
      });

      if (stageMeta.isBonus && !finished) {
        const remSec = Math.max(0, Math.ceil((bonusEndAt - now) / 1000));
        setBonusTimerSec(remSec);
        if (remSec <= 0) {
          finished = true;
          setWaveBanner('TEMPO ESGOTADO! AVANÇANDO...');
          advanceToNextStageWithMap(stageId, getNextCampaignStage(stageId));
        }
      }

      if (shockwaveMesh.visible) {
        const rem = Math.max(0, playerState.specialUntil - now) / 420;
        shockwaveMesh.scale.setScalar(0.3 + (1 - rem) * 1.15);
        (shockwaveMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, rem * 0.9);
        if (rem <= 0) shockwaveMesh.visible = false;
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        sparks[i].mesh.rotation.y += 12 * dt;
        sparks[i].mesh.scale.multiplyScalar(1 + 2.5 * dt);
        if (now >= sparks[i].until) { scene.remove(sparks[i].mesh); sparks.splice(i, 1); }
      }

      for (let i = fxParticles.length - 1; i >= 0; i--) {
        const fp = fxParticles[i];
        fp.mesh.position.x += fp.vx * dt;
        fp.mesh.position.y += fp.vy * dt;
        fp.mesh.position.z += fp.vz * dt;
        if (!fp.isFlame) {
          fp.vy -= 9.5 * dt;
          if (fp.mesh.position.y <= fp.floorY) {
            fp.mesh.position.y = fp.floorY;
            fp.vx = 0; fp.vy = 0; fp.vz = 0;
            fp.mesh.scale.set(1.5, 0.25, 1.5);
          }
        } else {
          fp.mesh.scale.multiplyScalar(1 + 1.4 * dt);
        }
        if (now >= fp.until) { scene.remove(fp.mesh); fxParticles.splice(i, 1); }
      }

      for (let gi = groundFires.length - 1; gi >= 0; gi--) {
        const gf = groundFires[gi];
        gf.mesh.rotation.y += 4 * dt;
        if (Math.abs(playerState.x - gf.x) < 1.15 && Math.abs(playerState.z - gf.z) < 0.9 && playerState.y < 0.4 && now >= gf.nextTick && !finished) {
          gf.nextTick = now + 750;
          const fDmg = Math.max(6, Math.round(playerState.maxHp * 0.045));
          playerState.hp = Math.max(0, playerState.hp - fDmg);
          playerState.burnUntil = Math.max(playerState.burnUntil, now + 3200);
          setPlayerHp(playerState.hp);
          spawnFlamePuff(playerState.x, playerState.y + 0.5, playerState.z);
          spawnFloat(`🔥 -${fDmg}`, '#fb923c', new THREE.Vector3(playerState.x, playerState.y + 2.0, playerState.z), camera);
          if (playerState.hp <= 0) { finished = true; setGameState('defeat'); }
        }
        if (now >= gf.until) { scene.remove(gf.mesh); groundFires.splice(gi, 1); }
      }

      if (!finished) {
        // Efeitos ativos no jogador (Queimadura, Sangramento com gotas, Envenenamento lento, Gelo e Teia)
        if (now < playerState.burnUntil && now >= playerState.nextBurnTick) {
          playerState.nextBurnTick = now + 900;
          const burnDmg = Math.max(5, Math.round(playerState.maxHp * 0.04));
          playerState.hp = Math.max(0, playerState.hp - burnDmg);
          setPlayerHp(playerState.hp);
          spawnFlamePuff(playerState.x, playerState.y + 0.5, playerState.z);
          spawnFloat(`🔥 -${burnDmg}`, '#fb923c', new THREE.Vector3(playerState.x, playerState.y + 2.1, playerState.z), camera);
          setStatusMessage('🔥 EM CHAMAS! Queimando...');
          if (playerState.hp <= 0) { finished = true; setGameState('defeat'); }
        }
        if (now < playerState.bleedUntil && now >= playerState.nextBleedTick) {
          playerState.nextBleedTick = now + 900;
          const bleedDmg = Math.max(5, Math.round(playerState.maxHp * 0.045));
          playerState.hp = Math.max(0, playerState.hp - bleedDmg);
          setPlayerHp(playerState.hp);
          spawnBloodDroplet(playerState.x, playerState.y + 0.9, playerState.z);
          spawnFloat(`🩸 -${bleedDmg}`, '#f87171', new THREE.Vector3(playerState.x, playerState.y + 2.1, playerState.z), camera);
          setStatusMessage('🩸 SANGRANDO!');
          if (playerState.hp <= 0) { finished = true; setGameState('defeat'); }
        }
        if (now < playerState.poisonUntil && now >= playerState.nextPoisonTick) {
          playerState.nextPoisonTick = now + 1000;
          const poiDmg = Math.max(4, Math.round(playerState.maxHp * 0.035));
          playerState.hp = Math.max(0, playerState.hp - poiDmg);
          setPlayerHp(playerState.hp);
          spawnSpark(playerState.x, playerState.y + 1.0, playerState.z, 0x22c55e);
          spawnFloat(`☠️ -${poiDmg}`, '#4ade80', new THREE.Vector3(playerState.x, playerState.y + 2.1, playerState.z), camera);
          setStatusMessage('☠️ ENVENENADO! (Mais lento)');
          if (playerState.hp <= 0) { finished = true; setGameState('defeat'); }
        }
        if (playerState.freezeUntil > 0 && now >= playerState.freezeUntil) {
          playerState.freezeUntil = 0;
          if (playerState.freezeMesh) { playerState.group.remove(playerState.freezeMesh); playerState.freezeMesh = null; }
        }
        if (playerState.webUntil > 0 && now >= playerState.webUntil) {
          playerState.webUntil = 0;
          playerState.webStacks = 0;
          playerState.webBreakHits = 0;
          if (playerState.webMesh) { playerState.group.remove(playerState.webMesh); playerState.webMesh = null; }
        }

        const isKnockedDown = now < playerState.knockdownUntil;
        const isGettingUp = !isKnockedDown && now < playerState.getupUntil;
        const isFrozenPlayer = now < playerState.freezeUntil;
        const isWebTrapped = now < playerState.webUntil;
        const isGrabbed = now < playerState.grabbedByPiledriverUntil;
        const canControl = !isKnockedDown && !isGettingUp && !isFrozenPlayer && !isGrabbed && !transitionBusy;

        let moveX = 0, moveZ = 0;
        if (canControl) {
          if (keysRef.current['a'] || keysRef.current['arrowleft']) moveX -= 1;
          if (keysRef.current['d'] || keysRef.current['arrowright']) moveX += 1;
          if (keysRef.current['w'] || keysRef.current['arrowup']) moveZ -= 1;
          if (keysRef.current['s'] || keysRef.current['arrowdown']) moveZ += 1;
        }

        if (isWebTrapped && (moveX !== 0 || moveZ !== 0 || jumpQueuedRef.current)) {
          if (hudTickCounter % 8 === 0 || jumpQueuedRef.current) {
            playerState.webBreakHits++;
            if (playerState.webBreakHits >= 5) {
              playerState.webUntil = 0;
              playerState.webStacks = 0;
              playerState.webBreakHits = 0;
              if (playerState.webMesh) { playerState.group.remove(playerState.webMesh); playerState.webMesh = null; }
              spawnFloat('🕸️ SOLTO DA TEIA!', '#38bdf8', new THREE.Vector3(playerState.x, playerState.y + 2.0, playerState.z), camera);
            }
          }
          moveX = 0; moveZ = 0;
        }

        if (moveX !== 0) playerState.facing = moveX > 0 ? 1 : -1;
        const playerSlowMul = (now < playerState.poisonUntil ? 0.62 : 1.0) * (playerState.webStacks === 1 ? 0.55 : 1.0);
        const speed = 6.0 * playerSlowMul;
        const len = Math.hypot(moveX, moveZ) || 1;
        if (moveX !== 0 || moveZ !== 0) {
          playerState.x += (moveX / len) * speed * dt;
          playerState.z += (moveZ / len) * (speed * 0.72) * dt;
        }
        playerState.x = Math.max(cameraLockMinX, Math.min(cameraLockMaxX, playerState.x));
        playerState.z = Math.max(STREET_Z_MIN, Math.min(STREET_Z_MAX, playerState.z));

        const baseGroundY = envRefs.floorHeightAt(playerState.x);
        let groundY = baseGroundY;
        // Permite subir em cima de Latas de Lixo / Barris / Caixotes intactos (como no Final Fight!)
        crates.forEach((cr) => {
          if (cr.broken || !cr.solidTop) return;
          if (Math.abs(playerState.x - cr.x) < 0.72 && Math.abs(playerState.z - cr.z) < 0.65) {
            const topY = envRefs.floorHeightAt(cr.x) + cr.solidTop;
            if (playerState.y >= topY - 0.36 && playerState.vy <= 0.1) {
              groundY = Math.max(groundY, topY);
            }
          }
        });
        if (canControl && !isWebTrapped && jumpQueuedRef.current && playerState.y <= groundY + 0.02) playerState.vy = 7.8;
        jumpQueuedRef.current = false;
        playerState.y += playerState.vy * dt;
        playerState.vy -= (isGrabbed ? 14 : 19.5) * dt;
        if (playerState.y <= groundY) { playerState.y = groundY; playerState.vy = 0; }

        if (canControl) {
          if (specialQueuedRef.current && now >= playerState.specialCd) performPlayerAttack(true, false);
          else if (kickQueuedRef.current && now >= playerState.attackCd) performPlayerAttack(false, true);
          else if (attackQueuedRef.current && now >= playerState.attackCd) performPlayerAttack(false, false);
        }
        attackQueuedRef.current = false;
        kickQueuedRef.current = false;
        specialQueuedRef.current = false;

        setSpecialCooldownPct(Math.round((Math.max(0, playerState.specialCd - now) / 3500) * 100));

        playerState.group.position.set(playerState.x, playerState.y, playerState.z);
        if (isGrabbed) {
          playerState.group.rotation.z = Math.PI;
        } else if (isKnockedDown) {
          playerState.group.rotation.z = -playerState.facing * (Math.PI / 2);
        } else if (isGettingUp) {
          const getUpProg = 1 - Math.max(0, playerState.getupUntil - now) / 380;
          playerState.group.rotation.z = -playerState.facing * (Math.PI / 2) * (1 - getUpProg);
        } else {
          playerState.group.rotation.z = 0;
        }
        playerShadow.position.set(playerState.x, groundY + 0.02, playerState.z);
        playerShadow.scale.setScalar(Math.max(0.55, 1 - Math.max(0, playerState.y - groundY) * 0.18));

        if (playerState.playerObj) {
          if (isFrozenPlayer) {
            playerState.playerObj.rotation.y = playerState.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
          } else if (isGrabbed || isKnockedDown) {
            playerState.playerObj.rotation.y = playerState.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
            applyCombatPose(playerState.playerObj, 'knockdown', 1);
          } else if (isGettingUp) {
            const getUpProg = 1 - Math.max(0, playerState.getupUntil - now) / 380;
            playerState.playerObj.rotation.y = playerState.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
            applyCombatPose(playerState.playerObj, 'getup', getUpProg);
          } else if (now < playerState.specialUntil) {
            const spinProg = 1 - (playerState.specialUntil - now) / 420;
            playerState.playerObj.rotation.y = (playerState.facing > 0 ? Math.PI / 2 : -Math.PI / 2) + spinProg * Math.PI * 4;
            applyCombatPose(playerState.playerObj, 'high_kick', 0.5);
          } else {
            playerState.playerObj.rotation.y = playerState.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
            if (now < playerState.attackAnimUntil) {
              const p = (now - playerState.attackAnimStart) / Math.max(1, playerState.attackDuration);
              applyCombatPose(playerState.playerObj, playerState.attackPose, p);
            } else if (now < playerState.hurtUntil) {
              applyCombatPose(playerState.playerObj, 'hurt', 0.5);
            } else if (moveX !== 0 || moveZ !== 0) {
              playerState.walkAnim.update(playerState.playerObj, dt * playerSlowMul);
            } else {
              applyCombatPose(playerState.playerObj, 'idle', 0);
            }
          }
        }

        stageWaves.forEach((w, idx) => {
          if (!transitionBusy && activeWaveIdx === -1 && !clearedWaves.has(idx) && playerState.x >= w.triggerX) spawnWave(idx);
        });

        // Atualiza projéteis (teias, tiros, granadas, facas ninjas e molotovs)
        for (let pi = projectiles.length - 1; pi >= 0; pi--) {
          const pr = projectiles[pi];
          pr.x += pr.vx * dt;
          if (pr.projKind === 'knife') {
            pr.mesh.rotation.z += (pr.vx >= 0 ? -1 : 1) * 14 * dt;
          }
          if (pr.projKind === 'grenade' || pr.projKind === 'molotov') {
            pr.y += pr.vy * dt;
            pr.vy -= 12 * dt;
            pr.mesh.rotation.z += 9 * dt;
            if (pr.y <= 0.15) {
              pr.dead = true;
              spawnSpark(pr.x, 0.5, pr.z, pr.projKind === 'molotov' ? 0xf97316 : 0xfacc15);
              if (pr.projKind === 'molotov') {
                spawnGroundFirePatch(pr.x, pr.z);
              }
              if (Math.abs(playerState.x - pr.x) < 1.9 && Math.abs(playerState.z - pr.z) < 1.35 && now >= playerState.invulnUntil) {
                playerState.hp = Math.max(0, playerState.hp - pr.damage);
                playerState.invulnUntil = now + 500;
                playerState.hurtUntil = now + 260;
                if (pr.projKind === 'molotov') {
                  playerState.burnUntil = now + 4800;
                  playerState.nextBurnTick = now + 800;
                  spawnFlamePuff(playerState.x, playerState.y + 0.5, playerState.z);
                  setStatusMessage('🔥 QUEIMANDO! Coquetel Molotov!');
                }
                setPlayerHp(playerState.hp);
                spawnFloat(`-${pr.damage} ${pr.projKind === 'molotov' ? '🔥' : '💥'}`, '#ef4444', new THREE.Vector3(playerState.x, 2.0, playerState.z), camera);
                if (playerState.hp <= 0) { finished = true; setGameState('defeat'); }
              }
            }
          } else if (pr.fromPlayer) {
            const hitEn = enemies.find(en => !en.dead && en.koUntil === 0 && Math.abs(en.x - pr.x) < 0.85 && Math.abs(en.z - pr.z) < 0.9 && Math.abs(en.y - pr.y) < 1.5);
            if (hitEn) {
              pr.dead = true;
              const res = calculatePlayerHitDamage(pr.damage, hitEn.defense, hitEn.evasion, false);
              hitEn.hp = Math.max(0, hitEn.hp - res.damage);
              hitEn.hurtUntil = now + 240;
              hitEn.vx = (pr.vx >= 0 ? 1 : -1) * 4.0;
              spawnSpark(hitEn.x, hitEn.y + 1.1, hitEn.z, 0xe2e8f0);
              spawnFloat(`🔪 -${res.damage}`, '#facc15', new THREE.Vector3(hitEn.x, hitEn.y + 2.0, hitEn.z), camera);
              if (hitEn.isBoss || enemies.every(o => o.dead || !o.isBoss)) {
                setBossHud(hitEn.hp > 0 ? { name: hitEn.name, hp: hitEn.hp, maxHp: hitEn.maxHp, barSize: hitEn.barSize } : null);
              }
              if (hitEn.hp <= 0) { hitEn.koUntil = now + 450; hitEn.vx = (pr.vx >= 0 ? 1 : -1) * 7.5; }
            }
          } else if (Math.abs(playerState.x - pr.x) < 0.78 && Math.abs(playerState.z - pr.z) < 0.82 && Math.abs(playerState.y - pr.y) < 1.3 && now >= playerState.invulnUntil) {
            pr.dead = true;
            playerState.hp = Math.max(0, playerState.hp - pr.damage);
            playerState.hurtUntil = now + 260;
            playerState.invulnUntil = now + 500;
            const isWebHit = pr.effect === 'web' || pr.effect === 'poison' && pr.projKind === 'orb';
            if (pr.effect === 'burn') {
              playerState.burnUntil = now + 4600;
              playerState.nextBurnTick = now + 800;
            } else if (pr.effect === 'bleed') {
              playerState.bleedUntil = now + 4500;
              playerState.nextBleedTick = now + 850;
              spawnBloodDroplet(playerState.x, playerState.y + 1.0, playerState.z);
            } else if (pr.effect === 'poison') {
              playerState.poisonUntil = now + 4800;
              playerState.nextPoisonTick = now + 950;
            } else if (pr.effect === 'freeze') {
              playerState.freezeStacks++;
              if (playerState.freezeStacks >= FREEZE_HITS_TO_FREEZE) {
                playerState.freezeStacks = 0;
                playerState.freezeUntil = now + 2600;
                if (!playerState.freezeMesh) {
                  playerState.freezeMesh = buildIceCubeGroup(1.0);
                  playerState.group.add(playerState.freezeMesh);
                }
                setStatusMessage('🧊 CONGELADO NO GELO!');
              }
            }
            if (isWebHit) {
              playerState.webStacks++;
              if (playerState.webStacks >= 2) {
                playerState.webUntil = now + 3500;
                playerState.webBreakHits = 0;
                if (!playerState.webMesh) {
                  playerState.webMesh = buildWebCageGroup();
                  playerState.group.add(playerState.webMesh);
                }
                setStatusMessage('🕸️ PRESO NA TEIA! Debate-se para quebrar!');
                spawnFloat('🕸️ PRESO NA TEIA!', '#f8fafc', new THREE.Vector3(playerState.x, playerState.y + 2.3, playerState.z), camera);
              } else {
                setStatusMessage('🕸️ Teia de aranha! Movimentos lentos!');
              }
            }
            setPlayerHp(playerState.hp);
            spawnFloat(
              `-${pr.damage} ${pr.projKind === 'knife' ? '🔪' : isWebHit ? '🕸️' : pr.effect === 'poison' ? '☠️' : '⚡'}`,
              '#ef4444',
              new THREE.Vector3(playerState.x, 2.0, playerState.z),
              camera
            );
            if (playerState.hp <= 0) { finished = true; setGameState('defeat'); }
          }
          pr.mesh.position.set(pr.x, pr.y, pr.z);
          if (pr.dead || pr.x < cameraLockMinX - 8 || pr.x > cameraLockMaxX + 8) {
            scene.remove(pr.mesh);
            projectiles.splice(pi, 1);
          }
        }

        let currentAttackers = enemies.filter(e => !e.dead && e.koUntil === 0 && e.windupUntil > now).length;
        const aliveEnemies = enemies.filter(e => !e.dead);

        aliveEnemies.forEach((en, idx) => {
          en.mixer?.update(dt);
          if (now < en.dashUntil) {
            en.x += en.dashVx * dt;
          } else if (Math.abs(en.vx) > 0.05) {
            en.x += en.vx * dt;
            en.vx *= Math.pow(0.04, dt);
          }
          if (!en.fleeingOffscreen) {
            en.x = Math.max(cameraLockMinX - 1.5, Math.min(cameraLockMaxX + 1.5, en.x));
          }

          const enGroundY = envRefs.floorHeightAt(en.x);
          if (en.y > enGroundY || en.vy !== 0) {
            en.y += en.vy * dt;
            en.vy -= 14 * dt;
            if (en.y <= enGroundY) { en.y = enGroundY; en.vy = 0; }
          } else if (en.y < enGroundY) {
            en.y = enGroundY;
          }

          if (en.freezeUntil > 0 && now >= en.freezeUntil) {
            en.freezeUntil = 0;
            if (en.freezeMesh) { en.group.remove(en.freezeMesh); en.freezeMesh = null; }
          }

          if (en.activeStatus !== 'none') {
            if (now >= en.statusUntil) {
              if (en.activeStatus === 'transform') {
                if (en.animalRoot) { en.group.remove(en.animalRoot); en.animalRoot = null; }
                if (en.skinPlayerObj) en.skinPlayerObj.visible = true;
                if (en.modelRoot) en.modelRoot.visible = true;
                en.transformedAnimal = undefined;
                en.pigEnraged = false;
              }
              if (en.activeStatus === 'freeze' && en.freezeMesh) {
                en.group.remove(en.freezeMesh);
                en.freezeMesh = null;
              }
              en.activeStatus = 'none';
            } else if ((en.activeStatus === 'burn' || en.activeStatus === 'poison' || en.activeStatus === 'bleed') && now >= en.nextStatusTick && en.koUntil === 0) {
              en.nextStatusTick = now + 850;
              const dot = Math.max(5, Math.round(playerAttackPower * (en.activeStatus === 'burn' ? 0.28 : 0.24)));
              en.hp = Math.max(0, en.hp - dot);
              if (en.activeStatus === 'bleed') spawnBloodDroplet(en.x, en.y + 1.0, en.z);
              if (en.activeStatus === 'burn') spawnFlamePuff(en.x, en.y + 0.6, en.z);
              const dotCol = en.activeStatus === 'burn' ? '#fb923c' : en.activeStatus === 'poison' ? '#4ade80' : '#f87171';
              spawnFloat(`-${dot}`, dotCol, new THREE.Vector3(en.x, en.y + 2.0, en.z), camera);
              if (en.isBoss) setBossHud(prev => en.hp > 0 && prev ? { ...prev, hp: en.hp } : null);
              if (en.hp <= 0) en.koUntil = now + 450;
            }
          }

          if (en.koUntil > 0) {
            const p = 1 - Math.max(0, en.koUntil - now) / 450;
            en.group.position.set(en.x, enGroundY + Math.sin(p * Math.PI) * 0.7, en.z);
            en.group.rotation.z = -en.facing * p * (Math.PI / 2);
            if (now >= en.koUntil) {
              en.dead = true;
              scene.remove(en.group);
              scene.remove(en.shadow);
              try { en.skinViewer?.dispose?.(); } catch { /* noop */ }
              setKillsCount(k => k + 1);

              // 1) Drops configurados na guia Drops do monstro (obedecendo % exata e min..max!)
              if (en.drops && en.drops.length > 0) {
                const sMap = storeCatalogRef.current;
                en.drops.forEach((d: any, dIdx: number) => {
                  const chance = Math.max(0, Math.min(100, Number(d.dropChance ?? d.chance ?? 0)));
                  if (chance <= 0 || Math.random() * 100 >= chance) return;
                  const itemData = sMap.get(String(d.itemId));
                  if (!itemData) return;
                  const minQ = Math.max(1, Number(d.min) || 1);
                  const maxQ = Math.max(minQ, Number(d.max) || minQ);
                  const qty = minQ + Math.floor(Math.random() * (maxQ - minQ + 1));
                  spawnDrop('item', qty, en.x + (dIdx % 2 === 0 ? -0.35 : 0.35), en.z + 0.25, {
                    itemData,
                    sourceMonsterName: en.name,
                  });
                });
              }

              // 2) Moedas (comuns dropam na maioria das vezes moedas com modelo/som ativos; chefes dão bônus!)
              if (en.isBoss) {
                [0, 1, 2].forEach(ci => {
                  spawnDrop('coin', 35 + stageIdxNum * 15, en.x + (ci - 1) * 0.55, en.z + (ci === 1 ? 0.3 : -0.2));
                });
              } else if (Math.random() < 0.85) {
                spawnDrop('coin', 12 + stageIdxNum * 6, en.x, en.z);
              }
            }
            return;
          }

          // Modo recuo do Chefe (Dande sentado rindo na mureta do SUBWAY / Eddie chamando gangue)
          if (now < en.retreatUntil) {
            const seat = envRefs.bossSeatPos;
            const seatX = seat ? seat.x : en.x;
            const seatY = seat ? seat.y : enGroundY;
            const seatZ = seat ? seat.z : -2.55;
            en.facing = playerState.x >= seatX ? 1 : -1;
            en.group.position.set(seatX, seatY, seatZ);
            en.shadow.position.set(seatX, envRefs.floorHeightAt(seatX) + 0.02, seatZ);
            if (en.skinPlayerObj) {
              en.skinPlayerObj.rotation.y = en.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
              applyCombatPose(en.skinPlayerObj, 'crouch', 0.8);
            } else if (en.modelRoot) {
              en.modelRoot.rotation.y = en.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
            }
            return;
          }
          if (en.retreatUntil > 0 && now >= en.retreatUntil) {
            en.retreatUntil = 0;
            if (envRefs.bossSeatPos) {
              en.x = envRefs.bossSeatPos.x - 1.5;
              en.y = envRefs.bossSeatPos.y;
              en.z = -0.2;
              en.vy = 5.2;
              en.vx = -3.8;
            }
          }

          const isEnemyFrozen = now < en.freezeUntil;
          const speedMult = isEnemyFrozen
            ? 0
            : (en.activeStatus === 'poison' ? 0.55 : (en.transformedAnimal === 'coelho' ? 1.55 : 1.0));
          let isMoving = false;

          // Bando de Ninjas do Fogo: depois de lançar os Molotovs, fogem do cenário!
          if (en.fleeingOffscreen) {
            const fleeDir = en.x < (cameraLockMinX + cameraLockMaxX) / 2 ? -1 : 1;
            en.facing = fleeDir;
            en.x += fleeDir * 9.5 * dt;
            isMoving = true;
            if (en.x < cameraLockMinX - 4.5 || en.x > cameraLockMaxX + 4.5) {
              en.dead = true;
              scene.remove(en.group);
              scene.remove(en.shadow);
              return;
            }
          } else if (now < en.dashUntil && !isEnemyFrozen) {
            // Corrida sustentada de Barrigada (Andore) ou Cabeçada (Wong Who / Gordinhos) atravessando a tela!
            isMoving = true;
            if (Math.abs(playerState.x - en.x) < 1.35 && Math.abs(playerState.z - en.z) < 1.0 && Math.abs(playerState.y - enGroundY) < 1.0 && now >= playerState.invulnUntil) {
              en.dashUntil = 0;
              const dmgScale = (en.activeStatus === 'poison' ? 0.65 : 1.0) * 1.38;
              const hit = calculateMonsterHitDamage(Math.round(en.attack * dmgScale), playerDefensePower, Math.random() < 0.25);
              playerState.hp = Math.max(0, playerState.hp - hit.damage);
              playerState.knockdownUntil = now + 560;
              playerState.getupUntil = now + 950;
              playerState.invulnUntil = now + 1300;
              playerState.hurtUntil = now + 560;
              setPlayerHp(playerState.hp);
              shakeUntil = now + 200;
              spawnSpark(playerState.x, playerState.y + 1.0, playerState.z, 0xf97316);
              spawnFloat(`-${hit.damage} 💥 DERRUBADO!`, '#ef4444', new THREE.Vector3(playerState.x, playerState.y + 2.1, playerState.z), camera);
              if (playerState.hp <= 0) { finished = true; setGameState('defeat'); }
            }
          } else if (!isEnemyFrozen && now >= en.hurtUntil && en.y <= enGroundY + 0.05) {
            const dx = playerState.x - en.x;
            const dz = playerState.z - en.z;

            // IA: Somente inimigos humanos compatíveis (não monstros/chefes/gigantes) pegam armas do chão!
            const nearWeapon = (!en.isBoss && !en.isMonster && !en.heldWeapon && !en.transformedAnimal && en.moveProfile !== 'giant')
              ? drops.find(d => !d.collected && d.kind === 'weapon' && d.weaponKind && Math.hypot(d.x - en.x, d.z - en.z) < 5.5)
              : undefined;

            const flankSide = en.x >= playerState.x ? 1 : -1;
            const wantsRangedStand = (en.moveProfile === 'ninja_knife' || en.moveProfile === 'ninja_fire') && !en.heldWeapon && !en.transformedAnimal;
            const desiredDist = wantsRangedStand ? 4.4 : 1.5;
            const targetX = nearWeapon ? nearWeapon.x : (playerState.x + flankSide * desiredDist);
            const targetZ = nearWeapon ? nearWeapon.z : playerState.z;
            const dtx = targetX - en.x;
            const dtz = targetZ - en.z;
            const distToTarget = Math.hypot(dtx, dtz);

            if (nearWeapon && distToTarget < 0.9 && !nearWeapon.collected && nearWeapon.weaponKind) {
              nearWeapon.collected = true;
              scene.remove(nearWeapon.obj);
              en.heldWeapon = nearWeapon.weaponKind;
              attachArcadeWeaponToPlayerObj(en.skinPlayerObj, nearWeapon.weaponKind);
              spawnFloat(`🖐️ ${WEAPON_META[nearWeapon.weaponKind].label}!`, '#facc15', new THREE.Vector3(en.x, en.y + 2.2, en.z), camera);
            }

            const playerAirborne = playerState.y > enGroundY + 0.35;
            const canBossOrConfigRanged = (en.isBoss || en.attacksConfig?.ranged?.enabled) && Math.abs(dx) > 3.2;
            const canNinjaThrow = (en.moveProfile === 'ninja_knife' || (en.moveProfile === 'ninja_fire' && en.fireShotsLeft > 0) || en.heldWeapon === 'knife') && Math.abs(dx) > 2.4;
            const canRanged = !nearWeapon && !en.transformedAnimal && (canBossOrConfigRanged || canNinjaThrow) && Math.abs(dz) < 1.25 && now >= en.attackCdUntil;

            // Andore: Pilão estilo Haggar ocasional se o jogador colar muito perto!
            const piledriverInRange = en.moveProfile === 'giant' && !en.isBoss && !en.transformedAnimal
              && Math.abs(dx) < 1.38 && Math.abs(dz) < 0.85 && playerState.y <= enGroundY + 0.35
              && now >= en.attackCdUntil && now >= en.piledriverCdUntil && now >= playerState.invulnUntil;
            let canPiledriver = false;
            if (piledriverInRange) {
              if (Math.random() < 0.25) {
                canPiledriver = true;
              } else {
                en.piledriverCdUntil = now + 1200;
              }
            }

            // Andore / Gordinho: Investida surpresa cruzando a arena!
            const canLongDash = (en.moveProfile === 'rusher' || (en.moveProfile === 'giant' && !en.isBoss))
              && !en.transformedAnimal && Math.abs(dx) > 3.2 && Math.abs(dx) < 8.5 && Math.abs(dz) < 1.0 && now >= en.attackCdUntil && Math.random() < 0.55;

            if (canPiledriver) {
              en.facing = dx >= 0 ? 1 : -1;
              en.windupUntil = 0;
              en.attackCdUntil = now + 2200;
              en.piledriverCdUntil = now + 7200;
              en.attackAnimStart = now;
              en.attackAnimUntil = now + 750;
              en.vy = 8.4;
              playerState.grabbedByPiledriverUntil = now + 720;
              playerState.invulnUntil = now + 1500;
              playerState.x = en.x + en.facing * 0.45;
              playerState.y = en.y + 1.3;
              playerState.vy = 8.4;
              spawnFloat('⚠️ PILÃO DO ANDORE!', '#f87171', new THREE.Vector3(en.x, en.y + 2.8, en.z), camera);
              setTimeout(() => {
                if (disposed || finished || en.dead || performance.now() < en.freezeUntil) return;
                const pdmg = calculateMonsterHitDamage(Math.round(en.attack * 1.55), playerDefensePower, true).damage;
                playerState.hp = Math.max(0, playerState.hp - pdmg);
                playerState.knockdownUntil = performance.now() + 650;
                playerState.getupUntil = performance.now() + 1050;
                setPlayerHp(playerState.hp);
                shakeUntil = performance.now() + 300;
                spawnSpark(playerState.x, envRefs.floorHeightAt(playerState.x) + 0.4, playerState.z, 0xfacc15);
                spawnFloat(`💥 -${pdmg} PILÃO!`, '#ef4444', new THREE.Vector3(playerState.x, playerState.y + 2.0, playerState.z), camera);
                if (playerState.hp <= 0) { finished = true; setGameState('defeat'); }
              }, 700);
            } else if (canLongDash) {
              en.facing = dx >= 0 ? 1 : -1;
              en.plannedMove = en.moveProfile === 'giant' ? 'belly_charge' : 'headbutt';
              en.dashVx = en.facing * 8.4;
              en.dashUntil = now + 580;
              en.attackAnimStart = now;
              en.attackAnimUntil = now + 580;
              en.attackCdUntil = now + 1350;
              spawnFloat(en.moveProfile === 'giant' ? '💢 BARRIGADA EM CORRIDA!' : '💥 CABEÇADA EM DISPARADA!', '#fb923c', new THREE.Vector3(en.x, en.y + 2.4, en.z), camera);
            } else if (canRanged && Math.random() < (en.moveProfile === 'ninja_fire' || en.moveProfile === 'ninja_knife' ? 0.85 : 0.5) && en.windupUntil === 0) {
              en.facing = dx >= 0 ? 1 : -1;
              en.isRangedShot = true;
              en.isLungeSpecial = false;
              en.plannedMove = 'throw';
              en.windupStart = now;
              en.windupUntil = now + 280;
              const warnTxt = en.moveProfile === 'ninja_fire'
                ? '🔥 MOLOTOV!'
                : (en.moveProfile === 'ninja_knife' || en.heldWeapon === 'knife')
                  ? '🔪 FACA!'
                  : en.isSpider ? '🕸️ TEIA!' : stageId === 'stage4_industrial' ? '💣 GRANADA!' : '🔫 TIRO!';
              spawnFloat(warnTxt, '#facc15', new THREE.Vector3(en.x, en.y + 2.3, en.z), camera);
            } else if (distToTarget > 0.45 && en.windupUntil <= now) {
              if (Math.abs(dtx) > 0.18) en.facing = dtx >= 0 ? 1 : -1;
              const spd = en.speed * speedMult * (nearWeapon ? 1.15 : 1.0);
              en.x += (dtx / distToTarget) * spd * dt;
              en.z += (dtz / distToTarget) * (spd * 0.85) * dt;
              isMoving = true;
            } else if (!nearWeapon && Math.abs(dx) < (en.moveProfile === 'agile' || en.moveProfile === 'ninja_knife' || en.moveProfile === 'giant' ? 3.2 : 2.3) && Math.abs(dz) < 1.05 && now >= en.attackCdUntil) {
              en.facing = dx >= 0 ? 1 : -1;
              if (en.windupUntil === 0 && currentAttackers < 3) {
                let nextMove: CombatPoseKind = 'punch';
                let isSpecialAtk = false;
                if (en.transformedAnimal) {
                  nextMove = 'headbutt';
                  isSpecialAtk = en.pigEnraged || false;
                } else if (en.heldWeapon) {
                  nextMove = 'weapon_swing';
                  isSpecialAtk = en.heldWeapon === 'pipe' || en.heldWeapon === 'sword';
                } else if (en.moveProfile === 'agile') {
                  nextMove = (playerAirborne || en.lastMove !== 'acro_kick') ? 'acro_kick' : 'side_kick';
                  isSpecialAtk = nextMove === 'acro_kick';
                } else if (en.moveProfile === 'slash') {
                  nextMove = en.lastMove !== 'double_smash' ? 'double_smash' : 'side_kick';
                  isSpecialAtk = nextMove === 'double_smash';
                } else if (en.moveProfile === 'giant') {
                  nextMove = (Math.abs(dx) > 1.7 || en.lastMove !== 'belly_charge') ? 'belly_charge' : 'double_smash';
                  isSpecialAtk = true;
                } else if (en.moveProfile === 'rusher') {
                  nextMove = en.lastMove !== 'headbutt' ? 'headbutt' : 'hook';
                  isSpecialAtk = nextMove === 'headbutt';
                } else if (en.moveProfile === 'ninja_knife') {
                  nextMove = en.lastMove !== 'acro_dive' ? 'acro_dive' : 'high_kick';
                  isSpecialAtk = nextMove === 'acro_dive';
                } else if (en.moveProfile === 'ninja_fire') {
                  nextMove = en.lastMove !== 'side_kick' ? 'side_kick' : 'punch';
                } else {
                  const seq: CombatPoseKind[] = ['punch', 'hook', 'side_kick'];
                  const nextI = (seq.indexOf(en.lastMove as CombatPoseKind) + 1) % seq.length;
                  nextMove = seq[nextI];
                  if (playerAirborne) nextMove = 'high_kick';
                }

                en.isRangedShot = false;
                en.plannedMove = nextMove;
                en.lastMove = nextMove;
                en.isLungeSpecial = isSpecialAtk || (!!en.hasSpecial && Math.random() < 0.35);
                en.windupStart = now;
                en.windupUntil = now + (isSpecialAtk ? 300 : 200);
                currentAttackers++;

                if (nextMove === 'belly_charge') spawnFloat('💢 BARRIGADA!', '#f87171', new THREE.Vector3(en.x, en.y + 2.4, en.z), camera);
                else if (nextMove === 'headbutt' && !en.transformedAnimal) spawnFloat('💥 CABEÇADA!', '#fb923c', new THREE.Vector3(en.x, en.y + 2.3, en.z), camera);
                else if (nextMove === 'acro_dive') spawnFloat('🥷 MERGULHO FATAL!', '#ef4444', new THREE.Vector3(en.x, en.y + 2.4, en.z), camera);
                else if (nextMove === 'acro_kick') spawnFloat('🤸 CHUTE ACROBÁTICO!', '#f472b6', new THREE.Vector3(en.x, en.y + 2.3, en.z), camera);
                else if (nextMove === 'double_smash') spawnFloat('🥊 PORRADA DUPLA!', '#facc15', new THREE.Vector3(en.x, en.y + 2.4, en.z), camera);
              }
            } else {
              en.facing = dx >= 0 ? 1 : -1;
            }

            if (en.windupUntil > 0 && now >= en.windupUntil) {
              en.windupUntil = 0;
              en.attackAnimStart = now;
              const animDur = (en.plannedMove === 'acro_kick' || en.plannedMove === 'acro_dive' || en.plannedMove === 'belly_charge') ? 420 : 280;
              en.attackAnimUntil = now + animDur;
              en.attackCdUntil = now + (en.isBoss ? 820 : (en.moveProfile === 'agile' || en.transformedAnimal === 'coelho' ? 720 : 920));

              if (en.isRangedShot) {
                const poisonWeakMul = en.activeStatus === 'poison' ? 0.65 : 1.0;
                const rawAtk = Math.round((en.activeStatus === 'transform' ? en.attack * 0.65 : en.attack) * poisonWeakMul);
                const isKnife = en.moveProfile === 'ninja_knife' || en.heldWeapon === 'knife';
                const isMolotov = en.moveProfile === 'ninja_fire';
                const projKind: 'orb' | 'grenade' | 'knife' | 'molotov' = isMolotov
                  ? 'molotov'
                  : isKnife
                    ? 'knife'
                    : stageId === 'stage4_industrial'
                      ? 'grenade'
                      : 'orb';
                const hit = calculateMonsterHitDamage(Math.round(rawAtk * (isKnife ? 1.05 : 0.95)), playerDefensePower, false);
                spawnProjectile(
                  en.x + en.facing * 0.65,
                  en.y + 1.2,
                  en.z,
                  en.facing * (isKnife ? 10.5 : isMolotov ? 7.4 : 8.5),
                  hit.damage,
                  isMolotov ? 'burn' : (en.isSpider ? 'web' : (en.damageEffect || 'none')),
                  projKind,
                  false
                );
                if (isMolotov) {
                  en.fireShotsLeft = Math.max(0, en.fireShotsLeft - 1);
                  if (en.fireShotsLeft === 0) {
                    en.fleeingOffscreen = true;
                    spawnFloat('💨 Ninja do Fogo recuou!', '#fb923c', new THREE.Vector3(en.x, en.y + 2.5, en.z), camera);
                  }
                }
              } else {
                const mv = en.plannedMove;
                if (mv === 'belly_charge' || mv === 'headbutt') {
                  en.vx = en.facing * 7.2;
                } else if (mv === 'acro_kick' || mv === 'acro_dive') {
                  en.vx = en.facing * 5.6;
                  en.vy = 5.4;
                } else {
                  en.vx = en.facing * (en.isLungeSpecial ? 5.2 : 2.6);
                  if (en.isLungeSpecial && en.isBoss) en.vy = 3.8;
                }

                const atkClip = en.actions?.['attack'] || en.actions?.['bite'] || en.actions?.['hit'];
                if (atkClip) { atkClip.reset().setLoop(THREE.LoopOnce, 1).play(); }

                const hitRangeX = (mv === 'belly_charge' || mv === 'acro_dive' || mv === 'weapon_swing' ? 2.85 : en.isLungeSpecial ? 2.55 : 2.15);
                const yTol = (mv === 'acro_kick' || mv === 'acro_dive') ? 1.8 : 1.05;
                if (Math.abs(playerState.x - en.x) < hitRangeX && Math.abs(playerState.z - en.z) < 1.2 && Math.abs(playerState.y - enGroundY) < yTol && now >= playerState.invulnUntil) {
                  const isCrit = Math.random() * 100 < en.critChance;
                  const poisonWeakMul = en.activeStatus === 'poison' ? 0.65 : 1.0;
                  const pigMul = en.pigEnraged ? 1.6 : (en.transformedAnimal ? 0.7 : 1.0);
                  const rawAtk = Math.round(
                    ((en.attack * pigMul) + (en.heldWeapon ? Math.round(WEAPON_META[en.heldWeapon].dmgBonus * 0.7) : 0)) * poisonWeakMul
                  );
                  const dmgMult = mv === 'acro_dive' ? 1.45 : (mv === 'double_smash' || mv === 'belly_charge' ? 1.32 : (en.isLungeSpecial ? 1.2 : 1.0));
                  const hit = calculateMonsterHitDamage(Math.round(rawAtk * dmgMult), playerDefensePower, isCrit);
                  playerState.hp = Math.max(0, playerState.hp - hit.damage);
                  setPlayerHp(playerState.hp);

                  // Efeitos específicos dos animais transformados no jogador!
                  if (en.transformedAnimal === 'sapo') {
                    playerState.poisonUntil = now + 4500;
                    playerState.nextPoisonTick = now + 900;
                    spawnFloat('🐸☠️ Veneno do Sapo!', '#4ade80', new THREE.Vector3(playerState.x, playerState.y + 2.4, playerState.z), camera);
                  } else if (en.transformedAnimal === 'rato') {
                    playerState.bleedUntil = now + 4500;
                    playerState.nextBleedTick = now + 850;
                    spawnBloodDroplet(playerState.x, playerState.y + 0.85, playerState.z);
                    spawnFloat('🐀🩸 Mordida de Rato!', '#f87171', new THREE.Vector3(playerState.x, playerState.y + 2.4, playerState.z), camera);
                  }

                  const knocksDown = mv === 'belly_charge' || mv === 'double_smash' || mv === 'acro_dive' || mv === 'acro_kick' || mv === 'headbutt' || en.heldWeapon === 'pipe' || en.isBoss;
                  if (knocksDown) {
                    playerState.knockdownUntil = now + 520;
                    playerState.getupUntil = now + 900;
                    playerState.invulnUntil = now + 1250;
                    playerState.hurtUntil = now + 520;
                  } else {
                    playerState.hurtUntil = now + 260;
                    playerState.invulnUntil = now + 480;
                  }
                  shakeUntil = now + 160;
                  spawnSpark(playerState.x, playerState.y + 1.15, playerState.z, 0xef4444);
                  spawnFloat(`-${hit.damage}${knocksDown ? ' 💥 DERRUBADO!' : ''}`, '#ef4444', new THREE.Vector3(playerState.x, playerState.y + 2.0, playerState.z), camera);
                  if (en.damageEffect && en.damageEffect !== 'none') setStatusMessage(`Atingido por ${en.damageEffect.toUpperCase()}!`);
                  if (playerState.hp <= 0) { finished = true; setGameState('defeat'); }
                }
              }
            }
          }

          if (en.animalRoot) {
            en.animalRoot.rotation.y = en.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
          } else if (en.skinPlayerObj) {
            en.skinPlayerObj.rotation.y = en.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
            en.skinPlayerObj.rotation.x = 0;
            if (!isEnemyFrozen && now < en.attackAnimUntil) {
              const dur = Math.max(1, en.attackAnimUntil - en.attackAnimStart);
              const prog = (now - en.attackAnimStart) / dur;
              applyCombatPose(en.skinPlayerObj, en.plannedMove, prog);
              if (en.plannedMove === 'acro_kick' || en.plannedMove === 'acro_dive') {
                en.skinPlayerObj.rotation.x = en.facing * prog * Math.PI * 2;
              }
            } else if (!isEnemyFrozen && now < en.hurtUntil) {
              applyCombatPose(en.skinPlayerObj, 'hurt', 0.5);
            } else if (!isEnemyFrozen && isMoving) {
              en.walkAnim?.update(en.skinPlayerObj, dt * speedMult);
            } else if (!isEnemyFrozen) {
              applyCombatPose(en.skinPlayerObj, 'idle', 0);
            }
          } else if (en.modelRoot) {
            en.group.rotation.y = 0;
            en.modelRoot.rotation.y = en.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
            if (!isEnemyFrozen && en.windupUntil > now) {
              en.group.rotation.z = en.facing * 0.25;
            } else if (!isEnemyFrozen && now < en.attackAnimUntil) {
              en.group.rotation.z = -en.facing * 0.2;
            } else {
              en.group.rotation.z = 0;
            }
          }

          en.group.position.set(en.x, en.y, en.z);
          en.group.scale.setScalar(1.0);
          en.shadow.position.set(en.x, enGroundY + 0.02, en.z);
        });

        if (activeWaveIdx !== -1 && enemies.filter(e => !e.dead).length === 0) {
          const finishedIdx = activeWaveIdx;
          const finishedWave = stageWaves[finishedIdx];
          clearedWaves.add(finishedIdx);
          activeWaveIdx = -1;
          maxCamX = Math.max(maxCamX, (finishedWave.lockMinX + finishedWave.lockMaxX) / 2);
          cameraLockMinX = Math.max(activeZone.minX - 0.5, maxCamX - 6.6);
          cameraLockMaxX = activeZone.maxX;
          if (finishedWave?.isBossWave) {
            finished = true;
            advanceToNextStageWithMap(stageId, getNextCampaignStage(stageId));
          } else {
            setGoArrow(true);
          }
        }

        // Bloqueio progressivo de câmera (estilo Final Fight): jogador NÃO pode voltar para trás!
        if (activeWaveIdx === -1 && !transitionBusy) {
          const candidateCam = Math.min(activeZone.maxX - 5.2, playerState.x + 1.8);
          if (candidateCam > maxCamX) {
            maxCamX = candidateCam;
          }
          cameraLockMinX = Math.max(activeZone.minX - 0.5, maxCamX - 6.6);
          cameraLockMaxX = activeZone.maxX;

          // Verifica portas/transições de sub-cenário (ex: última porta do trem, captura pro ringue dos Andores ou saída do restaurante!)
          const hitPortal = stagePortals.find(pt =>
            pt.zoneIdx === activeZoneIdx &&
            (pt.autoOnWaveIdx !== undefined
              ? clearedWaves.has(pt.autoOnWaveIdx)
              : (playerState.x >= pt.triggerX &&
                 stageWaves.every((w, wi) => w.triggerX > activeZone.maxX || w.triggerX < activeZone.minX || clearedWaves.has(wi))))
          );
          if (hitPortal) {
            transitionBusy = true;
            setGoArrow(false);
            setWaveBanner(hitPortal.banner);
            const startDelay = hitPortal.autoOnWaveIdx !== undefined ? 650 : 0;
            setTimeout(() => {
              if (disposed) return;
              setFadeOpacity(1);
              setTimeout(() => {
                if (disposed) return;
                activeZoneIdx = hitPortal.destZoneIdx;
                activeZone = stageZones[activeZoneIdx];
                playerState.x = hitPortal.destX;
                playerState.y = envRefs.floorHeightAt(hitPortal.destX);
                playerState.vy = 0;
                maxCamX = Math.max(activeZone.minX + 5.5, playerState.x + 1.8);
                camX = maxCamX;
                cameraLockMinX = Math.max(activeZone.minX - 0.5, maxCamX - 6.6);
                cameraLockMaxX = activeZone.maxX;
                camera.position.x = camX;
                camera.lookAt(camX, playerState.y + 1.35, -0.5);
                setTimeout(() => {
                  if (disposed) return;
                  setFadeOpacity(0);
                  transitionBusy = false;
                  setTimeout(() => { if (!disposed) setWaveBanner(''); }, 1600);
                }, 180);
              }, 480);
            }, startDelay);
          }
        }

        drops.forEach((dr) => {
          if (dr.collected) return;
          const drGround = envRefs.floorHeightAt(dr.x);
          if (dr.y > drGround + 0.3 || dr.vy > 0) {
            dr.y += dr.vy * dt;
            dr.vy -= 14 * dt;
            if (dr.y <= drGround + 0.3) { dr.y = drGround + 0.3; dr.vy = 0; }
          }
          dr.obj.position.set(dr.x, dr.y, dr.z);
          dr.obj.rotation.y += 2.5 * dt;

          if (Math.hypot(playerState.x - dr.x, playerState.z - dr.z) < 1.25) {
            dr.collected = true;
            scene.remove(dr.obj);
            if (dr.kind === 'weapon' && dr.weaponKind) {
              // Guarda arma principal nas costas e equipa a arma de rua temporária (nunca entra na mochila)
              sheathPlayerMainWeapon(playerState.playerObj, playerState.isLeftHanded, true);
              playerState.tempWeapon = dr.weaponKind;
              playerState.tempWeaponUses = WEAPON_META[dr.weaponKind].uses;
              attachArcadeWeaponToPlayerObj(playerState.playerObj, dr.weaponKind);
              setGroundWeaponLabel(`${WEAPON_META[dr.weaponKind].label} (${playerState.tempWeaponUses}x)`);
              spawnFloat(`🖐️ ${WEAPON_META[dr.weaponKind].label}!`, WEAPON_META[dr.weaponKind].color, new THREE.Vector3(dr.x, dr.y + 0.65, dr.z), camera);
            } else if (dr.kind === 'coin') {
              playCoinCollect(dr.soundUrl || activeCoinModel?.coinSoundUrl);
              setCoinsCollected(c => c + dr.value);
              spawnFloat(dr.label, '#facc15', new THREE.Vector3(dr.x, dr.y + 0.6, dr.z), camera);
              if (userData?.uid) {
                supabase.rpc('collect_combat_coin', { p_student_id: userData.uid, p_value: dr.value }).then(({ data }: any) => {
                  if (data && data.ok) userData.coins = data.coins;
                }).catch(() => {});
              }
            } else if (dr.kind === 'heal') {
              if (dr.soundUrl) playSoundSafe(dr.soundUrl);
              else if (dr.healTier === 'elixir') playElixirChimeSound();
              else if (dr.healTier === 'meat') playEatFoodSound();
              else playPotionDrinkSound();
              playerState.hp = Math.min(playerState.maxHp, playerState.hp + dr.value);
              setPlayerHp(playerState.hp);
              spawnFloat(dr.label, '#22c55e', new THREE.Vector3(dr.x, dr.y + 0.6, dr.z), camera);
            } else if (dr.kind === 'item' && dr.itemData) {
              playCoinCollect(activeCoinModel?.coinSoundUrl);
              spawnFloat(`🎁 ${dr.label}`, '#38bdf8', new THREE.Vector3(dr.x, dr.y + 0.65, dr.z), camera);
              setStatusMessage(`🎁 Drop obtido: ${dr.label}!`);
              if (userData?.uid) {
                (async () => {
                  try {
                    const item = dr.itemData;
                    const gachaCfg = await fetchGlobalGachaConfig().catch(() => undefined);
                    const qty = Math.max(1, dr.value || 1);
                    const itemPayload = {
                      studentId: userData.uid,
                      itemId: item.id,
                      itemTitle: item.title || item.name || 'Item Dropado',
                      itemType: item.type || 'other',
                      itemImageUrl: item.imageUrl || item.image_url || '',
                      gameEffect: item.gameEffect || 'none',
                      usableInQuest: item.usableInQuest || false,
                      gameModelUrl: item.gameModelUrl || '',
                      modelTextureUrl: item.modelTextureUrl || '',
                      minecraftHeadValue: item.minecraftHeadValue || '',
                      quantity: qty,
                      equipped: false,
                      purchasedAt: Date.now(),
                      giftedBy: `Arcade Drop (${dr.sourceMonsterName || 'Monstro'})`,
                      avatarPart: item.avatarPart || null,
                      itemCategory: item.itemCategory || 'none',
                      baseAttributeType: item.baseAttributeType || 'none',
                      baseAttributeValue: item.baseAttributeValue || 0,
                      modelTransforms: item.modelTransforms || null,
                      adds: item.type === 'equippable'
                        ? rollItemAdds(item.gachaConfig, item.fixedAttributes, (item.useGlobalGacha ?? true) ? gachaCfg : undefined, getMaxAddsLimit(item.minRankRequired), { rollDamage: true })
                        : [],
                      forgeLevel: item.forgeLevel || 0,
                    };
                    await supabase.from('user_items').insert({
                      student_id: userData.uid,
                      item_id: item.id,
                      equipped: false,
                      data: itemPayload,
                    });
                  } catch { /* noop */ }
                })();
              }
            }
          }
        });

        const targetCamX = activeWaveIdx !== -1
          ? (cameraLockMinX + cameraLockMaxX) / 2
          : maxCamX;
        camX += (targetCamX - camX) * Math.min(1, 5 * dt);
        const camYTarget = envRefs.floorHeightAt(playerState.x) + 3.85;
        const shakeX = now < shakeUntil ? (Math.random() - 0.5) * 0.22 : 0;
        const shakeY = now < shakeUntil ? (Math.random() - 0.5) * 0.16 : 0;
        camera.position.set(camX + shakeX, camYTarget + shakeY, 9.6);
        camera.lookAt(camX, camYTarget - 2.5, -0.5);

        hudTickCounter++;
        if (hudTickCounter % 3 === 0) {
          const bars: EnemyHudBar[] = enemies
            .filter(e => !e.dead && e.koUntil === 0 && now >= e.retreatUntil)
            .map(e => {
              const v = new THREE.Vector3(e.x, e.y + 2.2 * e.baseScale, e.z).project(camera);
              return {
                id: e.id,
                name: e.name,
                hp: e.hp,
                maxHp: e.maxHp,
                barSize: e.barSize,
                isBoss: e.isBoss,
                statusLabel: e.activeStatus !== 'none' ? e.activeStatus.toUpperCase() : undefined,
                x: (v.x * 0.5 + 0.5) * 100,
                y: (-v.y * 0.5 + 0.5) * 100,
              };
            })
            .filter(b => b.x > 2 && b.x < 98 && b.y > 4 && b.y < 92);
          setEnemyBars(bars);
        }
      } else if (autoWalkExitTo) {
        const dxEx = autoWalkExitTo.x - playerState.x;
        const dzEx = autoWalkExitTo.z - playerState.z;
        const distEx = Math.hypot(dxEx, dzEx);
        if (distEx > 0.2) {
          playerState.facing = dxEx >= 0 ? 1 : -1;
          playerState.x += (dxEx / distEx) * 3.8 * dt;
          playerState.z += (dzEx / distEx) * 2.8 * dt;
        }
        const exGroundY = envRefs.floorHeightAt(playerState.x);
        playerState.y = exGroundY;
        playerState.group.position.set(playerState.x, playerState.y, playerState.z);
        playerState.group.rotation.z = 0;
        playerShadow.position.set(playerState.x, exGroundY + 0.02, playerState.z);
        if (playerState.playerObj) {
          playerState.playerObj.rotation.y = playerState.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
          if (distEx > 0.2) playerState.walkAnim.update(playerState.playerObj, dt);
          else applyCombatPose(playerState.playerObj, 'idle', 0);
        }
        const camYEx = exGroundY + 3.85;
        camera.position.set(camX, camYEx, 9.6);
        camera.lookAt(camX, camYEx - 2.5, -0.5);
      }

      renderer.render(scene, camera);
    };

    animFrame = requestAnimationFrame(tick);

    const onResize = () => {
      if (!container) return;
      const w = Math.max(320, container.clientWidth);
      const h = Math.max(240, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', onResize);
      skinTexCache.forEach(t => { try { t.dispose(); } catch { /* noop */ } });
      skinTexCache.clear();
      draco.dispose();
      renderer.dispose();
    };
  }, [loadingData, stageId, runSeed, computedMaxHp, playerAttackPower, playerDefensePower, bossTemplates.length, humanoidPresets.length, activeCoinsPool.length, healItemsPool.length]);

  const totalBars = Math.max(1, Math.ceil(playerMaxHp / HP_PER_BAR));
  const currentBarIdx = Math.max(0, Math.ceil(playerHp / HP_PER_BAR) - 1);
  const currentBarFill = playerHp <= 0 ? 0 : ((playerHp - currentBarIdx * HP_PER_BAR) / HP_PER_BAR) * 100;
  const currentBarColor = BAR_COLORS[currentBarIdx % BAR_COLORS.length];
  const prevBarColor = currentBarIdx > 0 ? BAR_COLORS[(currentBarIdx - 1) % BAR_COLORS.length] : 'rgba(255,255,255,0.12)';

  // Barra multi-camadas estilo Final Fight do Chefe / Alvo (última barra amarela sobre fundo vermelho!)
  const bossLayered = bossHud
    ? computeLayeredBar(bossHud.hp, bossHud.maxHp, bossHud.barSize)
    : { layerIdx: 0, totalLayers: 1, fillPct: 0, fgColor: ENEMY_LAYER_COLORS[0], bgColor: '#dc2626' };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#070912', color: '#fff', overflow: 'hidden', userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 1rem', background: 'rgba(15, 23, 42, 0.92)', borderBottom: '1px solid rgba(255,255,255,0.12)', zIndex: 20, gap: '0.5rem', flexWrap: 'wrap' }}>
        <button onClick={onExit} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 'bold' }}>
          <ChevronLeft size={18} /> Sair
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '900', color: '#fbbf24', letterSpacing: '0.5px' }}>
          <Swords size={18} /> MODO ARCADE 3D
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <select
            value={stageId}
            onChange={(e) => setStageId(e.target.value as ArcadeStageId)}
            style={{ background: '#1e293b', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0.25rem 0.5rem', fontSize: '0.78rem', fontWeight: 'bold' }}
          >
            {CAMPAIGN_ORDER.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <button
            onClick={() => setRunSeed(s => s + 1)}
            title="Reiniciar Estágio"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '8px', color: '#e2e8f0', padding: '0.25rem 0.55rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}
          >
            <RotateCcw size={14} /> Reiniciar
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

        {enemyBars.map(eb => {
          const lay = computeLayeredBar(eb.hp, eb.maxHp, eb.barSize);
          return (
            <div key={eb.id} style={{ position: 'absolute', left: `${eb.x}%`, top: `${eb.y}%`, transform: 'translate(-50%, -100%)', pointerEvents: 'none', zIndex: 8, textAlign: 'center', minWidth: '86px' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 'bold', color: eb.isBoss ? '#fbbf24' : '#f8fafc', textShadow: '0 1px 3px #000', whiteSpace: 'nowrap' }}>
                {eb.name} {lay.totalLayers > 1 ? `x${lay.layerIdx + 1}` : ''} {eb.statusLabel ? `· ${eb.statusLabel}` : ''}
              </div>
              <div style={{ height: '6px', background: lay.bgColor, borderRadius: '3px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.45)', marginTop: '2px' }}>
                <div style={{ width: `${lay.fillPct}%`, height: '100%', background: lay.fgColor, transition: 'width 0.1s ease-out' }} />
              </div>
            </div>
          );
        })}

        {/* HUD Superior Esquerdo */}
        <div style={{ position: 'absolute', top: '0.75rem', left: '0.75rem', zIndex: 10, background: 'rgba(10, 12, 22, 0.82)', backdropFilter: 'blur(6px)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: '12px', padding: '0.55rem 0.8rem', minWidth: '250px', pointerEvents: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
            <span style={{ fontWeight: '900', fontSize: '0.82rem', color: '#fbbf24' }}>{userData?.name?.split(' ')[0] || 'Herói'}</span>
            <span style={{ fontSize: '0.72rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Heart size={12} fill="#ef4444" color="#ef4444" /> {maxHearts} ({playerHp}/{playerMaxHp} HP)
            </span>
          </div>
          <div style={{ position: 'relative', height: '14px', background: prevBarColor, borderRadius: '7px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.3)' }}>
            <div style={{ width: `${Math.max(0, Math.min(100, currentBarFill))}%`, height: '100%', background: currentBarColor, transition: 'width 0.15s ease-out' }} />
            {totalBars > 1 && (
              <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.62rem', fontWeight: '900', color: '#fff', textShadow: '0 1px 2px #000' }}>
                x{currentBarIdx + 1}/{totalBars}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.35rem', fontSize: '0.7rem', color: '#cbd5e1' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Swords size={12} color="#f87171" /> {playerAttackPower}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Shield size={12} color="#60a5fa" /> {playerDefensePower}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Coins size={12} color="#facc15" /> {coinsCollected}</span>
            <span style={{ color: '#a78bfa' }}>Abates: {killsCount}</span>
          </div>
          {equippedEffectInfo.effect !== 'none' && (
            <div style={{ fontSize: '0.65rem', color: '#38bdf8', marginTop: '0.2rem' }}>
              Arma: {equippedEffectInfo.effect.toUpperCase()} ({equippedEffectInfo.chance}%)
            </div>
          )}
          {groundWeaponLabel && (
            <div style={{ fontSize: '0.66rem', color: '#facc15', fontWeight: 'bold', marginTop: '0.15rem' }}>
              Mão: {groundWeaponLabel}
            </div>
          )}
          {statusMessage && <div style={{ fontSize: '0.65rem', color: '#fb923c', marginTop: '0.15rem' }}>{statusMessage}</div>}
        </div>

        {/* HUD Superior Direito: Barra Multi-camadas do Chefe / Timer Bônus + GO -> */}
        <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', pointerEvents: 'none' }}>
          {bonusTimerSec !== null && (
            <div style={{ background: 'rgba(10, 12, 22, 0.9)', border: '2px solid #facc15', borderRadius: '12px', padding: '0.45rem 0.9rem', fontWeight: '900', fontSize: '1.15rem', color: bonusTimerSec <= 10 ? '#ef4444' : '#facc15' }}>
              ⏱️ {bonusTimerSec}s
            </div>
          )}
          {bossHud && (
            <div style={{ background: 'rgba(10, 12, 22, 0.88)', border: '1px solid rgba(250, 204, 21, 0.55)', borderRadius: '12px', padding: '0.5rem 0.8rem', minWidth: '250px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '900', fontSize: '0.8rem', color: '#facc15', marginBottom: '0.25rem' }}>
                <span>{bossHud.name}</span>
                <span>{bossHud.hp}/{bossHud.maxHp}</span>
              </div>
              <div style={{ position: 'relative', height: '13px', background: bossLayered.bgColor, borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.45)' }}>
                <div style={{ width: `${bossLayered.fillPct}%`, height: '100%', background: bossLayered.fgColor, transition: 'width 0.15s' }} />
                {bossLayered.totalLayers > 1 && (
                  <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.62rem', fontWeight: '900', color: '#0f172a', background: 'rgba(255,255,255,0.85)', padding: '0 4px', borderRadius: '4px' }}>
                    x{bossLayered.layerIdx + 1}/{bossLayered.totalLayers}
                  </span>
                )}
              </div>
            </div>
          )}
          {goArrow && (
            <div style={{ background: 'rgba(234, 179, 8, 0.92)', color: '#000', fontWeight: '900', fontSize: '1.1rem', padding: '0.35rem 0.9rem', borderRadius: '10px', boxShadow: '0 0 18px rgba(250, 204, 21, 0.8)', animation: 'pulse 0.8s infinite alternate' }}>
              GO ➔
            </div>
          )}
        </div>

        {waveBanner && (
          <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', zIndex: 12, background: 'rgba(0,0,0,0.82)', border: '2px solid #fbbf24', color: '#fbbf24', padding: '0.5rem 1.4rem', borderRadius: '12px', fontWeight: '900', fontSize: '1.15rem', letterSpacing: '1px', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
            {waveBanner}
          </div>
        )}

        {floatingTexts.map(f => (
          <div key={f.id} style={{ position: 'absolute', left: `${f.x}%`, top: `${f.y}%`, transform: 'translate(-50%, -50%)', color: f.color, fontWeight: '900', fontSize: '1.05rem', textShadow: '0 2px 4px #000', pointerEvents: 'none', zIndex: 15 }}>
            {f.text}
          </div>
        ))}

        <div style={{ position: 'absolute', bottom: '0.75rem', left: '0.75rem', right: '0.75rem', zIndex: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', pointerEvents: 'none' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 40px)', gridTemplateRows: 'repeat(3, 40px)', gap: '4px', pointerEvents: 'auto' }}>
            <div />
            <button onPointerDown={() => { keysRef.current['w'] = true; }} onPointerUp={() => { keysRef.current['w'] = false; }} onPointerLeave={() => { keysRef.current['w'] = false; }} style={padBtnStyle}>▲</button>
            <div />
            <button onPointerDown={() => { keysRef.current['a'] = true; }} onPointerUp={() => { keysRef.current['a'] = false; }} onPointerLeave={() => { keysRef.current['a'] = false; }} style={padBtnStyle}>◀</button>
            <div />
            <button onPointerDown={() => { keysRef.current['d'] = true; }} onPointerUp={() => { keysRef.current['d'] = false; }} onPointerLeave={() => { keysRef.current['d'] = false; }} style={padBtnStyle}>▶</button>
            <div />
            <button onPointerDown={() => { keysRef.current['s'] = true; }} onPointerUp={() => { keysRef.current['s'] = false; }} onPointerLeave={() => { keysRef.current['s'] = false; }} style={padBtnStyle}>▼</button>
            <div />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', pointerEvents: 'auto' }}>
            <button onClick={() => { jumpQueuedRef.current = true; }} style={{ ...actionBtnStyle, background: 'rgba(59,130,246,0.85)' }}>
              Pular
            </button>
            <button onClick={() => { kickQueuedRef.current = true; }} title="Chute / Acrobático (Tecla L ou C)" style={{ ...actionBtnStyle, background: 'rgba(234,179,8,0.9)', color: '#0f172a' }}>
              🦵 Chute
            </button>
            <button onClick={() => { specialQueuedRef.current = true; }} style={{ ...actionBtnStyle, background: specialCooldownPct > 0 ? 'rgba(100,116,139,0.7)' : 'rgba(168,85,247,0.9)' }}>
              <Zap size={16} /> Especial {specialCooldownPct > 0 ? `${Math.ceil(specialCooldownPct / 28)}s` : ''}
            </button>
            <button onClick={() => { attackQueuedRef.current = true; }} style={{ ...actionBtnStyle, background: 'rgba(239,68,68,0.92)', padding: '0.65rem 1.2rem' }}>
              <Swords size={18} /> Bater
            </button>
          </div>
        </div>

        {roundClearInfo && (() => {
          const order: ArcadeStageId[] = ['stage1_streets', 'stage2_subway', 'stage3_westside', 'stage4_industrial', 'stage5_bay'];
          const compIdx = Math.max(0, order.indexOf(roundClearInfo.completedStageId));
          const nextStageForMap: ArcadeStageId = roundClearInfo.nextStageId === 'bonus_car'
            ? 'stage2_subway'
            : roundClearInfo.nextStageId === 'bonus_glass'
              ? 'stage4_industrial'
              : (roundClearInfo.nextStageId || 'stage5_bay');
          const nextMapIdx = Math.min(order.length - 1, compIdx + 1);
          const nextLabel = roundClearInfo.nextStageId ? getStageMeta(roundClearInfo.nextStageId).label : 'CAMPANHA CONCLUÍDA!';

          return (
            <div style={{ position: 'absolute', inset: 0, zIndex: 25, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '2.2rem', background: 'rgba(2, 6, 23, 0.42)', pointerEvents: 'none' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.92)', border: '3px solid #cbd5e1', borderRadius: '14px', padding: '0.85rem 1.4rem', boxShadow: '0 14px 40px rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem', maxWidth: '520px', width: '92%' }}>
                <svg viewBox="0 0 420 155" style={{ width: '100%', maxHeight: '165px', borderRadius: '8px', background: 'linear-gradient(180deg, #0c4a6e 0%, #082f49 100%)', border: '1px solid #38bdf8' }}>
                  {/* Contorno da Ilha / Cidade estilo Metro City */}
                  <path d="M 18 48 L 95 36 L 200 32 L 295 45 L 395 95 L 372 130 L 290 122 L 210 105 L 125 98 L 35 88 Z" fill="#94a3b8" stroke="#e2e8f0" strokeWidth="2.5" />
                  {/* Região 1: SLUMS (Verde quando concluída) */}
                  <path d="M 24 52 L 85 45 L 88 86 L 38 82 Z" fill={compIdx >= 0 ? '#22c55e' : '#64748b'} stroke="#0f172a" strokeWidth="1.5" />
                  <text x="56" y="70" textAnchor="middle" fill="#e0f2fe" stroke="#0f172a" strokeWidth="2.5" paintOrder="stroke" fontSize="13" fontWeight="900">SLUM</text>

                  {/* Região 2 & 3: SUBWAY / WEST SIDE */}
                  <path d="M 92 42 L 202 36 L 202 74 L 94 78 Z" fill={compIdx >= 2 ? '#22c55e' : compIdx === 1 ? '#4ade80' : (nextMapIdx === 1 ? '#facc15' : '#64748b')} fillOpacity="0.85" stroke="#0f172a" strokeWidth="1.5" />
                  <text x="150" y="30" textAnchor="middle" fill="#f8fafc" stroke="#0f172a" strokeWidth="2.5" paintOrder="stroke" fontSize="12" fontWeight="900">SUBWAY / WEST SIDE</text>

                  {/* Torres 3D Up Town */}
                  <rect x="265" y="12" width="14" height="38" fill="#cbd5e1" stroke="#334155" />
                  <rect x="284" y="6" width="16" height="44" fill="#e2e8f0" stroke="#334155" />
                  <rect x="305" y="16" width="14" height="34" fill="#94a3b8" stroke="#334155" />

                  {/* Região 4: INDUSTRIAL AREA */}
                  <path d="M 210 74 L 305 72 L 308 112 L 210 100 Z" fill={compIdx >= 3 ? '#22c55e' : (nextMapIdx === 3 ? '#facc15' : '#64748b')} stroke="#0f172a" strokeWidth="1.5" />
                  <text x="256" y="92" textAnchor="middle" fill="#f8fafc" stroke="#0f172a" strokeWidth="2.5" paintOrder="stroke" fontSize="11" fontWeight="900">INDUSTRIAL</text>

                  {/* Região 5: BAY AREA */}
                  <path d="M 314 78 L 386 98 L 368 126 L 312 114 Z" fill={compIdx >= 4 ? '#22c55e' : (nextMapIdx === 4 ? '#facc15' : '#64748b')} stroke="#0f172a" strokeWidth="1.5" />
                  <text x="350" y="113" textAnchor="middle" fill="#f8fafc" stroke="#0f172a" strokeWidth="2.5" paintOrder="stroke" fontSize="11" fontWeight="900">BAY AREA</text>

                  {/* Linha tracejada do metrô conectando todas as áreas */}
                  <path d="M 35 76 L 145 55 L 250 75 L 352 106" fill="none" stroke="#f8fafc" strokeWidth="3.5" strokeDasharray="7 5" />

                  {/* Pontos de rota: concluídos vs próximo destino piscando */}
                  {[
                    [42, 75],
                    [112, 61],
                    [168, 56],
                    [256, 80],
                    [352, 106],
                  ].map(([cx, cy], idx) => (
                    <circle
                      key={idx}
                      cx={cx}
                      cy={cy}
                      r={idx === nextMapIdx ? 6.5 : 4}
                      fill={idx <= compIdx ? '#22c55e' : idx === nextMapIdx ? '#ef4444' : '#e2e8f0'}
                      stroke="#fff"
                      strokeWidth="1.5"
                    />
                  ))}
                  {nextStageForMap && <rect x="145" y="128" width="130" height="18" rx="4" fill="#cbd5e1" />}
                  <text x="210" y="140" textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="900">THE ATLANTIC OCEAN</text>
                </svg>

                <div style={{ fontSize: '1.9rem', fontWeight: '900', letterSpacing: '3px', color: '#f8fafc', textShadow: '0 3px 0 #b91c1c, 0 5px 10px #000', lineHeight: 1.05 }}>
                  ROUND {roundClearInfo.roundNum} CLEAR!
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#facc15', textShadow: '0 1px 2px #000' }}>
                  Próximo destino: {nextLabel}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Cortina de Fade-Out / Fade-In estilo Final Fight */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#000',
            opacity: fadeOpacity,
            transition: 'opacity 0.45s ease-in-out',
            pointerEvents: fadeOpacity > 0.1 ? 'auto' : 'none',
            zIndex: 28,
          }}
        />

        {gameState !== 'playing' && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(5, 8, 18, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="glass-panel" style={{ padding: '2rem', maxWidth: '400px', width: '90%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
              {gameState === 'victory' ? <Trophy size={48} color="#fbbf24" /> : <Sparkles size={48} color="#ef4444" />}
              <h2 style={{ margin: 0, color: gameState === 'victory' ? '#fbbf24' : '#ef4444' }}>
                {gameState === 'victory' ? 'CAMPANHA FINALIZADA!' : 'VOCÊ CAIU EM COMBATE!'}
              </h2>
              <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.9rem' }}>
                Abates: <strong>{killsCount}</strong> · Moedas coletadas: <strong style={{ color: '#facc15' }}>{coinsCollected}</strong>
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                <button onClick={() => { setStageId('stage1_streets'); setRunSeed(s => s + 1); }} className="login-btn" style={{ flex: 1, justifyContent: 'center', background: 'var(--gold-primary)', color: '#000', fontWeight: 'bold' }}>
                  Jogar Novamente
                </button>
                <button onClick={onExit} className="login-btn" style={{ flex: 1, justifyContent: 'center', background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                  Voltar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const padBtnStyle: React.CSSProperties = {
  width: '40px',
  height: '40px',
  borderRadius: '10px',
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(15, 23, 42, 0.78)',
  color: '#fff',
  fontWeight: 'bold',
  fontSize: '0.9rem',
  cursor: 'pointer',
};

const actionBtnStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid rgba(255,255,255,0.3)',
  color: '#fff',
  fontWeight: 'bold',
  fontSize: '0.85rem',
  padding: '0.6rem 0.9rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
};
