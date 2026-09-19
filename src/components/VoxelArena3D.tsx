import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { PlayerObject } from 'skinview3d';
import { getSafeUrl } from '../lib/utils';
import {
  getStoneBricksTexture,
  getGrassTopTexture,
  getGrassSideTexture,
  getDirtTexture,
  getSunTexture,
  getNetherBricksTexture,
  getNetherrackTexture,
  getSandstoneTexture,
  getSandTexture,
  getSnowTopTexture,
  getSnowSideTexture,
  getIceStoneTexture,
  getEndStoneTexture,
  getPurpurTexture,
  type VoxelBiomeType,
} from '../lib/voxelTextures';

// --- Polyfill de compatibilidade entre skinview3d (Three 0.156) e Three.js r170+ ---
// Three.js r170+ exige o método determinantAffine() em matrixWorld durante o render de meshes.
// Como o skinview3d utiliza internamente Three 0.156, injetamos determinantAffine
// no prototype do Matrix4 do skinview3d para que todas as partes dos personagens funcionem perfeitamente.
const patchAffineDeterminant = (matrixProto: any) => {
  if (matrixProto && typeof matrixProto.determinantAffine !== 'function') {
    matrixProto.determinantAffine = function (this: any) {
      const te = this.elements;
      if (!te) return 1;
      const n11 = te[0], n12 = te[4], n13 = te[8];
      const n21 = te[1], n22 = te[5], n23 = te[9];
      const n31 = te[2], n32 = te[6], n33 = te[10];
      return (
        n11 * (n22 * n33 - n23 * n32) -
        n12 * (n21 * n33 - n23 * n31) +
        n13 * (n21 * n32 - n22 * n31)
      );
    };
  }
};

// Aplica no THREE raiz
patchAffineDeterminant(THREE.Matrix4.prototype);

// Aplica no prototype de Matrix4 do skinview3d
try {
  const dummyPlayer = new PlayerObject();
  const innerMatrixProto = (dummyPlayer.skin?.matrixWorld as any)?.constructor?.prototype;
  patchAffineDeterminant(innerMatrixProto);
} catch (e) {
  console.warn('[VoxelArena3D] Falha ao pré-aplicar polyfill:', e);
}

// =====================================================================
// FASE B (teste): helpers de renderização UNIFICADA de entidades GLB.
// =====================================================================

// Altura-alvo (em unidades de mundo) dos bonecos na cena unificada. ~1.9 equivale
// ao tamanho de um personagem Minecraft sobre a plataforma (blocos de 1 unidade).
const UNIFIED_ENTITY_HEIGHT = 1.9;

// Escala o objeto para a altura-alvo e ancora os pés em y=0 (relativo ao pai).
function fitEntityToGround(obj: THREE.Object3D, targetHeight: number) {
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  const h = box.max.y - box.min.y;
  if (h <= 0) return;
  obj.scale.setScalar(targetHeight / h);
  obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= b2.min.y;
}

// Toca uma animação por nome (com fallback para idle / primeira disponível).
function playEntityAnimByName(
  actions: Record<string, THREE.AnimationAction>,
  mixer: THREE.AnimationMixer | null,
  animName: string
) {
  if (!mixer) return;
  const name = animName || 'idle';
  if (name === 'none') { mixer.stopAllAction(); return; }
  const keys = Object.keys(actions);
  if (keys.length === 0) return;
  const candidates = [
    name, name.toLowerCase(), name.toUpperCase(),
    `animation.${name}`, `animation.${name.toLowerCase()}`,
    `Armature|${name}`, `Armature|${name.toLowerCase()}`,
  ];
  let action: THREE.AnimationAction | null = null;
  for (const c of candidates) { if (actions[c]) { action = actions[c]; break; } }
  if (!action) {
    const idle = keys.find((k) => /idle/i.test(k));
    action = idle ? actions[idle] : actions[keys[0]];
  }
  if (action) {
    mixer.stopAllAction();
    action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.2).play();
  }
}

// Aplica a SKIN (textura) nos materiais do modelo GLB, igual ao CustomModelViewer.
function applySkinTexture(root: THREE.Object3D, skinUrl: string | null | undefined, done: () => void) {
  if (!skinUrl) { done(); return; }
  const texLoader = new THREE.TextureLoader();
  texLoader.crossOrigin = 'anonymous';
  texLoader.load(getSafeUrl(skinUrl), (texture) => {
    texture.flipY = false;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat: any) => {
          const newMat = mat.clone();
          newMat.map = texture;
          newMat.transparent = false;
          newMat.alphaTest = 0.5;
          newMat.needsUpdate = true;
          mesh.material = newMat;
        });
      }
    });
    done();
  }, undefined, () => { done(); });
}

// Aplica tint de efeito (dano/veneno/fogo) e fúria nos materiais de uma entidade.
function applyEntityTint(root: THREE.Object3D | null, tint: string | null, enraged: boolean) {
  if (!root) return;
  root.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((mat: any) => {
      if (!mat.color) return;
      if (!mat._origColor) {
        mat._origColor = mat.color.clone();
        mat._origEmissive = mat.emissive ? mat.emissive.clone() : null;
      }
      if (enraged) {
        mat.color.copy(mat._origColor).lerp(new THREE.Color('#ff1111'), 0.7);
        if (mat.emissive) mat.emissive.setRGB(0.6, 0.02, 0.02);
      } else if (tint) {
        const c = new THREE.Color(tint);
        mat.color.copy(mat._origColor).lerp(c, 0.35);
        if (mat.emissive) mat.emissive.copy(c).multiplyScalar(0.25);
      } else {
        mat.color.copy(mat._origColor);
        if (mat.emissive) {
          if (mat._origEmissive) mat.emissive.copy(mat._origEmissive);
          else mat.emissive.setRGB(0, 0, 0);
        }
      }
      mat.needsUpdate = true;
    });
  });
}

// Rotação base dos bonecos na arena: repouso olha para a câmera (+z → Math.PI para
// modelos Blockbench), combate vira para o oponente (jogador vira +x, monstro vira -x).
function isCombatAnim(anim?: string): boolean {
  return !!anim && (anim.startsWith('attack') || anim === 'hurt' || anim === 'attack-fatal' || anim === 'attack-fatal-slow' || anim.startsWith('death') || anim.startsWith('victory'));
}

// Avanço do ataque corpo a corpo em unidades de mundo. O monstro parte de x=+3.6 e
// alcança ~-1.6 (perto do jogador); o jogador o espelho. Ajustável para calibrar.
const UNIFIED_LUNGE = 5.2;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Atualiza o avanço (tween de posição X) de um boneco no loop de animação.
// mode 'go': avança 0.6s, segura 0.3s, volta 0.6s. mode 'hold': avança e fica (fatal/vitória).
function updateMoveTween(
  moveRef: React.MutableRefObject<{ fromX: number; toX: number; restX: number; start: number; mode: 'go' | 'hold' } | null>,
  group: THREE.Group | null,
  nowMs: number
) {
  const m = moveRef.current;
  if (!m || !group) return;
  const elapsed = (nowMs - m.start) / 1000;
  if (m.mode === 'go') {
    let x = m.fromX;
    if (elapsed < 0.6) {
      x = lerp(m.fromX, m.toX, easeInOut(clamp01(elapsed / 0.6)));
    } else if (elapsed < 0.9) {
      x = m.toX;
    } else if (elapsed < 1.5) {
      x = lerp(m.toX, m.restX, easeInOut(clamp01((elapsed - 0.9) / 0.6)));
    } else {
      x = m.restX;
      moveRef.current = null;
    }
    group.position.x = x;
  } else {
    group.position.x = elapsed < 0.6 ? lerp(m.fromX, m.toX, easeInOut(clamp01(elapsed / 0.6))) : m.toX;
  }
}



export interface VoxelArena3DProps {
  /** Força o perfil de câmera e enquadramento para calibração ('desktop' | 'mobile') */
  deviceMode?: 'desktop' | 'mobile';
  /** Animação atual do monstro para efeitos de luz dinâmicos */
  monsterAnim?: string;
  /** Se o monstro está no pulso de cura verde água */
  healActive?: boolean;
  /** Terremoto/abalo na arena */
  arenaQuake?: boolean;
  /** Distância configurada do golpe corpo a corpo (em px). Se omitido ou 0, usa a distância calculada automaticamente */
  attackDist?: number;
  /** Bioma do cenário 3D: planície, nether, deserto, tundra/neve ou the end */
  biome?: VoxelBiomeType;

  // --- Jogador (3D) ---
  playerConfig?: any;
  playerModelUrl?: string | null;
  playerSkinUrl?: string | null;
  playerEquippedItems?: any[];
  playerAnim?: string;

  // --- Monstro (3D) ---
  monsterModelUrl?: string | null;
  monsterSkinUrl?: string | null;
  monsterConfig?: any;
  monsterZoom?: number;
  monsterRotY?: number;
  monsterEnraged?: boolean;
  monsterEffectTint?: string | null;

  // --- Calibração de Câmera & Profundidade 3D ---
  cameraPitch?: number;
  cameraDist?: number;
  cameraTargetY?: number;

  /** Reporta o tamanho (em px) do stage 3D sempre que ele é medido/redimensionado. */
  onStageSizeChange?: (size: { w: number; h: number }) => void;

  /** TESTE (Fase B): renderiza jogador + monstro DENTRO da cena (unificada), sem overlays. */
  unified3D?: boolean;
}

/**
 * VoxelArena3D
 * Cenário 3D Único e Integrado em tempo real estilo Minecraft:
 * - Plataforma central temática (Stone Bricks, Nether Bricks, Sandstone, Ice Stone, Purpur)
 * - Chão circundante infinito com blocos do bioma
 * - Céu, névoa e iluminação específicos de cada dimensão
 * - Efeitos atmosféricos e partículas procedurais (nuvens, brasas vulcânicas, neve, partículas do Ender)
 * - Personagem 3D do Jogador renderizado DIRETAMENTE na cena sobre a plataforma
 * - Personagem 3D do Monstro renderizado DIRETAMENTE na cena sobre a plataforma
 * - Câmera adaptativa com proporções perfeitas para desktop e mobile
 * - Animações de combate (avanço de ataque, impacto, recuo, cura e vitória)
 */
export const VoxelArena3D: React.FC<VoxelArena3DProps> = ({
  deviceMode,
  healActive = false,
  arenaQuake = false,
  attackDist,
  biome = 'plains',
  // @ts-ignore
  playerConfig,
  // @ts-ignore
  playerModelUrl,
  // @ts-ignore
  playerSkinUrl,
  // @ts-ignore
  playerEquippedItems = [],
  playerAnim = 'idle',
  // @ts-ignore
  monsterModelUrl,
  // @ts-ignore
  monsterSkinUrl,
  // @ts-ignore
  monsterConfig,
  monsterAnim = 'idle',
  // @ts-ignore
  monsterZoom = 1,
  // @ts-ignore
  monsterRotY = 0,
  // @ts-ignore
  monsterEnraged = false,
  // @ts-ignore
  monsterEffectTint = null,
  cameraPitch = 0,
  cameraDist = 0,
  cameraTargetY = 0,
  onStageSizeChange,
  unified3D = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);

  // Proporção FIXA por modo: 9:16 (mobile) / 16:9 (desktop). O stage 3D mantém essa
  // proporção e é centralizado; devices fora do padrão ganham só margem.
  const isMobileMode = deviceMode ? (deviceMode === 'mobile') : (typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const STAGE_ASPECT = isMobileMode ? (9 / 16) : (16 / 9);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Refs Three.js desacoplados do ciclo de vida da cena
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const healLightRef = useRef<THREE.PointLight | null>(null);
  const cloudsGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Refs das entidades unificadas (Fase B): jogador + monstro dentro da cena
  const unifiedMonsterGroupRef = useRef<THREE.Group | null>(null);
  const unifiedPlayerGroupRef = useRef<THREE.Group | null>(null);
  const unifiedMonsterMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const unifiedPlayerMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const unifiedMonsterActionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const unifiedPlayerActionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  // Guarda o modelo cru (sem tint) para restaurar materiais a cada mudança de efeito
  const unifiedMonsterRootRef = useRef<THREE.Object3D | null>(null);
  const unifiedPlayerRootRef = useRef<THREE.Object3D | null>(null);
  const unifiedMonsterOriginalMatsRef = useRef<Map<string, { color: THREE.Color; emissive?: THREE.Color }>>(new Map());
  const unifiedPlayerOriginalMatsRef = useRef<Map<string, { color: THREE.Color; emissive?: THREE.Color }>>(new Map());
  // Tweens de avanço (ataque corpo a corpo) das entidades unificadas
  const monsterMoveRef = useRef<{ fromX: number; toX: number; restX: number; start: number; mode: 'go' | 'hold' } | null>(null);
  const playerMoveRef = useRef<{ fromX: number; toX: number; restX: number; start: number; mode: 'go' | 'hold' } | null>(null);

  // Ref para atualizar posições de overlay sem reconstruir o renderer
  const updateOverlayPositionsRef = useRef<(() => void) | null>(null);

  // Mantém o valor ATUAL do slider de distância de ataque acessível aos closures
  // antigos (updateOverlayPositions é criado no mount; sem isso ele usaria o valor
  // inicial e reverteria --attack-dist para o automático em resize/câmera).
  const attackDistRef = useRef<number | undefined>(attackDist);
  attackDistRef.current = attackDist;

  // 2. Câmera Isométrica com Profundidade 3D Rica em Desktop e Mobile (função desacoplada)
  const computeCameraConfig = (currAspect: number, pMode?: 'desktop' | 'mobile', pPitch = 0, pDist = 0, pTargetY = 0) => {
    const isMobile = pMode ? (pMode === 'mobile') : (typeof window !== 'undefined' ? (window.innerWidth <= 768 || currAspect < 1.35) : false);

    // Distância base em Z: mantém ambos os combatentes (-3.6 a +3.6) no campo de visão
    let baseZ = 12.5;
    if (isMobile) {
      // No mobile (vertical), calcula Z para cobrir os 7.2m de combate com margem elegante
      const targetVisibleWidth = 9.2;
      const requiredZ = targetVisibleWidth / (0.768 * Math.max(0.48, currAspect));
      baseZ = Math.max(12.5, Math.min(16.8, requiredZ));
    }

    // Aplica offset de distância configurável (zoom)
    const effectiveDist = baseZ + (pDist || 0);

    // Ponto focal vertical (centro de interesse no topo da plataforma)
    const baseLookAtY = 0.4 + (pTargetY || 0);

    // Inclinação para manter o ângulo isométrico idêntico ao desktop (~15.6°)
    const pitchDeg = 15.6 + (pPitch || 0);
    const pitchRad = (pitchDeg * Math.PI) / 180;
    const effectiveCamY = baseLookAtY + (effectiveDist * Math.tan(pitchRad));

    return {
      camY: effectiveCamY,
      camZ: effectiveDist,
      lookAtY: baseLookAtY,
    };
  };

  // Atualiza a câmera e projeção matematicamente em tempo real SEM descartar o WebGL
  useEffect(() => {
    const camera = cameraRef.current;
    const container = containerRef.current;
    if (!camera || !container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;

    const currAspect = w / h;
    const camCfg = computeCameraConfig(currAspect, deviceMode, cameraPitch, cameraDist, cameraTargetY);
    camera.aspect = currAspect;
    camera.position.set(0, camCfg.camY, camCfg.camZ);
    camera.lookAt(0, camCfg.lookAtY, 0);
    camera.updateProjectionMatrix();

    updateOverlayPositionsRef.current?.();
  }, [cameraPitch, cameraDist, cameraTargetY, deviceMode]);

  // Mede o espaço disponível e calcula o "stage" com a proporção fixa (letterbox)
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const measure = () => {
      const aw = outer.clientWidth;
      const ah = outer.clientHeight;
      if (aw === 0 || ah === 0) return;
      const areaAspect = aw / ah;
      let w: number, h: number;
      if (areaAspect > STAGE_ASPECT) {
        // Área mais larga que o alvo → limita pela altura, margem nas laterais
        h = ah;
        w = Math.round(ah * STAGE_ASPECT);
      } else {
        // Área mais alta que o alvo → limita pela largura, margem em cima/baixo
        w = aw;
        h = Math.round(aw / STAGE_ASPECT);
      }
      setStageSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
      onStageSizeChange?.({ w, h });
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(outer);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [STAGE_ASPECT]);

  // Refs de estado de animação para transições suaves da sombra
  const playerAnimRef = useRef(playerAnim);
  const monsterAnimRef = useRef(monsterAnim);
  const playerAttackStartRef = useRef<number | null>(null);
  const monsterAttackStartRef = useRef<number | null>(null);

  // Atualiza refs ao alterar props de animação
  useEffect(() => {
    if (playerAnim !== playerAnimRef.current) {
      if (playerAnim.startsWith('attack')) {
        playerAttackStartRef.current = performance.now() / 1000;
      }
      playerAnimRef.current = playerAnim;
    }
  }, [playerAnim]);

  useEffect(() => {
    if (monsterAnim !== monsterAnimRef.current) {
      if (monsterAnim.startsWith('attack')) {
        monsterAttackStartRef.current = performance.now() / 1000;
      }
      monsterAnimRef.current = monsterAnim;
    }
  }, [monsterAnim]);

  // Efeito dinâmico de cura na luz da cena 3D
  useEffect(() => {
    if (!healLightRef.current) return;
    if (healActive) {
      healLightRef.current.intensity = 3.5;
      healLightRef.current.color.set('#2dd4bf');
    } else {
      healLightRef.current.intensity = 0;
    }
  }, [healActive]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // @ts-ignore
    let isDisposed = false;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 450;
    const aspect = width / height;

    // 1. Configurações Temáticas por Bioma
    const isPlains = biome === 'plains';
    const isNether = biome === 'nether';
    const isDesert = biome === 'desert';
    const isSnow = biome === 'snow';
    const isEnd = biome === 'end';

    let skyHex = '#78a7ff';
    let fogHex = '#78a7ff';
    let fogDensity = 0.022;

    if (isNether) {
      skyHex = '#1c0508';
      fogHex = '#2d0a0e';
      fogDensity = 0.032;
    } else if (isDesert) {
      skyHex = '#6eb6ff';
      fogHex = '#bde0fe';
      fogDensity = 0.016;
    } else if (isSnow) {
      skyHex = '#8faec9';
      fogHex = '#a9c2d6';
      fogDensity = 0.026;
    } else if (isEnd) {
      skyHex = '#0a0514';
      fogHex = '#130924';
      fogDensity = 0.028;
    }

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const skyColor = new THREE.Color(skyHex);
    scene.background = skyColor;
    scene.fog = new THREE.FogExp2(new THREE.Color(fogHex), fogDensity);

    const initialCam = computeCameraConfig(aspect, deviceMode, cameraPitch, cameraDist, cameraTargetY);
    const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 150);
    camera.position.set(0, initialCam.camY, initialCam.camZ);
    camera.lookAt(0, initialCam.lookAtY, 0);
    cameraRef.current = camera;

    // 3. Renderer Three.js
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isNether ? 1.25 : (isEnd ? 1.2 : 1.1);

    // 4. Luzes da Arena adaptadas ao bioma
    let hemiSky = '#b8d5ff';
    let hemiGround = '#4d6932';
    let dirColor = '#fff4e0';
    let dirIntensity = 1.6;
    let ambColor = '#a0b8d8';
    let ambIntensity = 0.4;

    if (isNether) {
      hemiSky = '#ff4d2d';
      hemiGround = '#22080a';
      dirColor = '#ff6622';
      dirIntensity = 1.8;
      ambColor = '#661118';
      ambIntensity = 0.55;
    } else if (isDesert) {
      hemiSky = '#dbeafe';
      hemiGround = '#b48c4a';
      dirColor = '#fff5d0';
      dirIntensity = 2.0;
      ambColor = '#ffe8ba';
      ambIntensity = 0.45;
    } else if (isSnow) {
      hemiSky = '#f1f5f9';
      hemiGround = '#64748b';
      dirColor = '#e0f2fe';
      dirIntensity = 1.5;
      ambColor = '#cbd5e1';
      ambIntensity = 0.5;
    } else if (isEnd) {
      hemiSky = '#c084fc';
      hemiGround = '#1e1b4b';
      dirColor = '#d8b4fe';
      dirIntensity = 1.4;
      ambColor = '#3b0764';
      ambIntensity = 0.6;
    }

    const hemiLight = new THREE.HemisphereLight(hemiSky, hemiGround, 0.85);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(dirColor, dirIntensity);
    sunLight.position.set(8, 16, 10);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(ambColor, ambIntensity);
    scene.add(ambientLight);

    const healLight = new THREE.PointLight('#2dd4bf', 0, 10, 1.5);
    healLight.position.set(3.5, 1.2, 0);
    scene.add(healLight);
    healLightRef.current = healLight;

    // 5. Texturas e Materiais dos Blocos por Bioma
    let platformTex = getStoneBricksTexture();
    if (isNether) platformTex = getNetherBricksTexture();
    else if (isDesert) platformTex = getSandstoneTexture();
    else if (isSnow) platformTex = getIceStoneTexture();
    else if (isEnd) platformTex = getPurpurTexture();

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    const platformMaterial = new THREE.MeshStandardMaterial({
      map: platformTex,
      roughness: isSnow ? 0.7 : 0.85,
      metalness: isSnow ? 0.1 : 0.05,
    });

    let groundMaterials: THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
    if (isNether) {
      groundMaterials = new THREE.MeshStandardMaterial({ map: getNetherrackTexture(), roughness: 0.92 });
    } else if (isDesert) {
      groundMaterials = new THREE.MeshStandardMaterial({ map: getSandTexture(), roughness: 0.95 });
    } else if (isSnow) {
      const snowTop = getSnowTopTexture();
      const snowSide = getSnowSideTexture();
      const dirtTex = getDirtTexture();
      groundMaterials = [
        new THREE.MeshStandardMaterial({ map: snowSide, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: snowSide, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: snowTop, roughness: 0.85 }),
        new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 0.95 }),
        new THREE.MeshStandardMaterial({ map: snowSide, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: snowSide, roughness: 0.9 }),
      ];
    } else if (isEnd) {
      groundMaterials = new THREE.MeshStandardMaterial({ map: getEndStoneTexture(), roughness: 0.88 });
    } else {
      // plains
      const grassTopTex = getGrassTopTexture();
      const grassSideTex = getGrassSideTexture();
      const dirtTex = getDirtTexture();
      groundMaterials = [
        new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: grassTopTex, roughness: 0.85 }),
        new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 0.95 }),
        new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 0.9 }),
      ];
    }

    // 6. Plataforma de Luta
    const platW = 14;
    const platD = 8;
    const platCount = platW * platD;
    const platformMesh = new THREE.InstancedMesh(boxGeo, platformMaterial, platCount);

    const dummy = new THREE.Object3D();
    let idx = 0;
    const halfW = platW / 2;
    const halfD = platD / 2;

    for (let x = 0; x < platW; x++) {
      for (let z = 0; z < platD; z++) {
        const posX = x - halfW + 0.5;
        const posZ = z - halfD + 0.5;
        dummy.position.set(posX, 0, posZ);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        platformMesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
    platformMesh.instanceMatrix.needsUpdate = true;
    scene.add(platformMesh);

    // 7. Chão Circundante do Bioma
    const grassW = 42;
    const grassD = 38;
    const totalGrass = grassW * grassD;
    const grassMesh = new THREE.InstancedMesh(boxGeo, groundMaterials, totalGrass);

    let gIdx = 0;
    const gHalfW = grassW / 2;
    const gHalfD = grassD / 2;
    const grassCenterZOffset = 5;

    for (let x = 0; x < grassW; x++) {
      for (let z = 0; z < grassD; z++) {
        const posX = x - gHalfW + 0.5;
        const posZ = (z - gHalfD + 0.5) + grassCenterZOffset;
        dummy.position.set(posX, -2, posZ);
        dummy.scale.set(1, 3, 1);
        dummy.updateMatrix();
        grassMesh.setMatrixAt(gIdx++, dummy.matrix);
      }
    }
    grassMesh.instanceMatrix.needsUpdate = true;
    scene.add(grassMesh);

    // 8. Astro Celeste (Sol / Fenda Infernal / Vórtice Ender)
    let sunGeo: THREE.BufferGeometry | null = null;
    let sunMat: THREE.Material | null = null;
    let sunMesh: THREE.Mesh | null = null;

    if (isPlains || isDesert || isSnow) {
      const sunTex = getSunTexture();
      sunGeo = new THREE.PlaneGeometry(isDesert ? 7.5 : (isSnow ? 5.5 : 6), isDesert ? 7.5 : (isSnow ? 5.5 : 6));
      sunMat = new THREE.MeshBasicMaterial({
        map: sunTex,
        transparent: true,
        depthWrite: false,
        color: isSnow ? '#e0f2fe' : (isDesert ? '#fff8db' : '#ffffff'),
      });
      sunMesh = new THREE.Mesh(sunGeo, sunMat);
      sunMesh.position.set(14, 18, -25);
      sunMesh.lookAt(0, 5, 0);
      scene.add(sunMesh);
    } else if (isEnd) {
      // Vórtice cósmico roxo do Ender
      sunGeo = new THREE.PlaneGeometry(8, 8);
      const canvasVortex = document.createElement('canvas');
      canvasVortex.width = 32;
      canvasVortex.height = 32;
      const vCtx = canvasVortex.getContext('2d')!;
      const vGrad = vCtx.createRadialGradient(16, 16, 2, 16, 16, 15);
      vGrad.addColorStop(0, '#ffffff');
      vGrad.addColorStop(0.3, '#c084fc');
      vGrad.addColorStop(0.7, '#6b21a8');
      vGrad.addColorStop(1, 'rgba(0,0,0,0)');
      vCtx.fillStyle = vGrad;
      vCtx.fillRect(0, 0, 32, 32);
      const vortexTex = new THREE.CanvasTexture(canvasVortex);
      sunMat = new THREE.MeshBasicMaterial({
        map: vortexTex,
        transparent: true,
        depthWrite: false,
      });
      sunMesh = new THREE.Mesh(sunGeo, sunMat);
      sunMesh.position.set(14, 18, -25);
      sunMesh.lookAt(0, 5, 0);
      scene.add(sunMesh);
    }

    // 9. Nuvens Cúbicas (Plains, Desert e Snow)
    let cloudMat: THREE.MeshBasicMaterial | null = null;
    let cloudsGroup: THREE.Group | null = null;
    if (isPlains || isDesert || isSnow) {
      cloudsGroup = new THREE.Group();
      cloudsGroupRef.current = cloudsGroup;
      cloudMat = new THREE.MeshBasicMaterial({
        color: isDesert ? '#fff7ed' : '#ffffff',
        transparent: true,
        opacity: isDesert ? 0.6 : (isSnow ? 0.75 : 0.85),
      });

      const cloudDefs = [
        { x: -18, y: 14, z: -18, w: 12, h: 2, d: 8 },
        { x: -5, y: 15, z: -25, w: 16, h: 2, d: 10 },
        { x: 12, y: 14.5, z: -20, w: 14, h: 2, d: 7 },
        { x: 26, y: 15, z: -15, w: 10, h: 2, d: 6 },
        { x: -28, y: 15.5, z: -12, w: 15, h: 2, d: 9 },
      ];

      cloudDefs.forEach((c) => {
        const cGeo = new THREE.BoxGeometry(c.w, c.h, c.d);
        const cMesh = new THREE.Mesh(cGeo, cloudMat!);
        cMesh.position.set(c.x, c.y, c.z);
        cloudsGroup!.add(cMesh);
      });
      scene.add(cloudsGroup);
    }

    // 10. Partículas Ambientais em 3D (Nether brasas, Snow neve, End partículas)
    const particleCount = (isNether || isSnow || isEnd) ? 45 : 0;
    let particleMesh: THREE.InstancedMesh | null = null;
    let particlePositions: { x: number; y: number; z: number; speed: number; rotSpeed: number }[] = [];
    let particleGeo: THREE.BoxGeometry | null = null;
    let particleMat: THREE.MeshBasicMaterial | null = null;

    if (particleCount > 0) {
      const pSize = isSnow ? 0.16 : (isNether ? 0.18 : 0.22);
      particleGeo = new THREE.BoxGeometry(pSize, pSize, pSize);
      const pColor = isNether ? '#ff6622' : (isSnow ? '#ffffff' : '#c084fc');
      particleMat = new THREE.MeshBasicMaterial({ color: pColor, transparent: true, opacity: isSnow ? 0.85 : 0.75 });
      particleMesh = new THREE.InstancedMesh(particleGeo, particleMat, particleCount);

      for (let i = 0; i < particleCount; i++) {
        particlePositions.push({
          x: (Math.random() - 0.5) * 26,
          y: Math.random() * 14,
          z: (Math.random() - 0.5) * 18,
          speed: isNether ? (0.8 + Math.random() * 1.2) : (isSnow ? -(0.9 + Math.random() * 1.1) : (0.3 + Math.random() * 0.5)),
          rotSpeed: (Math.random() - 0.5) * 2,
        });
      }
      scene.add(particleMesh);
    }

    // 10. Marcadores de Referência dos Personagens na Plataforma (Sombras Base)
    const shadowTexCanvas = document.createElement('canvas');
    shadowTexCanvas.width = 32;
    shadowTexCanvas.height = 32;
    const sCtx = shadowTexCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(16, 16, 2, 16, 16, 15);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.22)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 32, 32);

    const shadowTex = new THREE.CanvasTexture(shadowTexCanvas);
    const shadowGeo = new THREE.PlaneGeometry(2.4, 1.5);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });

    const playerShadow = new THREE.Mesh(shadowGeo, shadowMat);
    playerShadow.rotation.x = -Math.PI / 2;
    playerShadow.position.set(-3.6, 0.51, 0.2);
    scene.add(playerShadow);

    const monsterShadow = new THREE.Mesh(shadowGeo, shadowMat);
    monsterShadow.rotation.x = -Math.PI / 2;
    monsterShadow.position.set(3.6, 0.51, 0.2);
    scene.add(monsterShadow);

    // 11. Sincronização de Projeção para Elevação e Posição X dos Personagens na Plataforma
    const updateOverlayPositions = () => {
      if (!container || !camera) return;
      const h = container.clientHeight;
      const w = container.clientWidth;
      if (h === 0 || w === 0) return;

      camera.updateMatrixWorld();

      // Ponto na superfície da plataforma de pedra sob o jogador
      const pGround = new THREE.Vector3(-3.6, 0.51, 0.2);
      pGround.project(camera);
      const pLeftPx = (pGround.x * 0.5 + 0.5) * w;
      const pBottomPx = (pGround.y * 0.5 + 0.5) * h;

      // Ponto na superfície da plataforma de pedra sob o monstro
      const mGround = new THREE.Vector3(3.6, 0.51, 0.2);
      mGround.project(camera);
      const mLeftPx = (mGround.x * 0.5 + 0.5) * w;
      const mBottomPx = (mGround.y * 0.5 + 0.5) * h;

      // Compensa o padding inferior da arena (60px no desktop, 16px no mobile)
      const isMobile = deviceMode ? (deviceMode === 'mobile') : (window.innerWidth <= 768);
      const bottomPadding = isMobile ? 16 : 60;
      const pLift = Math.max(0, pBottomPx - bottomPadding);
      const mLift = Math.max(0, mBottomPx - bottomPadding);
      const attackDistPx = Math.max(50, Math.round(mLeftPx - pLeftPx));
      // Usa a distância configurada pelo slider quando > 0 (lido do ref = valor ATUAL)
      const configuredDist = attackDistRef.current;
      const finalAttackDist = (configuredDist && configuredDist > 0) ? configuredDist : attackDistPx;

      // As posições projetadas são relativas ao STAGE (letterbox). O wrapper do jogador/
      // monstro/projétil usa coordenadas relativas à ARENA, então somamos o deslocamento
      // do stage dentro da arena (centralização). As vars vão para a ARENA (ancestral comum).
      const outer = outerRef.current;
      const arenaEl = (outer?.parentElement || container.parentElement) as HTMLElement | null;
      let stageOffsetX = 0;
      let stageOffsetBottom = 0;
      if (outer && arenaEl) {
        const outerRect = outer.getBoundingClientRect();
        const arenaRect = arenaEl.getBoundingClientRect();
        stageOffsetX = outerRect.left - arenaRect.left;
        // `bottom` é medido a partir da base da arena:
        stageOffsetBottom = arenaRect.bottom - outerRect.bottom;
      }
      const pBottomArena = pBottomPx + stageOffsetBottom;
      const mBottomArena = mBottomPx + stageOffsetBottom;

      // Fase B (unificado): projeta a CABEÇA dos bonecos 3D para ancorar nome/corações.
      // Em modo unificado o corpo é renderizado na cena (altura = UNIFIED_ENTITY_HEIGHT),
      // então escrevemos a altura em px (dos pés ao topo da cabeça) nas variáveis
      // --shadow-*-head-lift. Sem unificado, a UI usa a altura natural do overlay.
      let mHeadLift = 0;
      let pHeadLift = 0;
      if (unified3DRef.current) {
        const mHeadY = 0.51 + UNIFIED_ENTITY_HEIGHT * Math.max(0.2, monsterZoomRef.current || 1);
        const pHeadY = 0.51 + UNIFIED_ENTITY_HEIGHT;
        const mHead = new THREE.Vector3(3.6, mHeadY, 0.2).project(camera);
        const pHead = new THREE.Vector3(-3.6, pHeadY, 0.2).project(camera);
        const mHeadTop = (mHead.y * 0.5 + 0.5) * h + stageOffsetBottom;
        const pHeadTop = (pHead.y * 0.5 + 0.5) * h + stageOffsetBottom;
        mHeadLift = Math.max(0, Math.round(mBottomArena - mHeadTop));
        pHeadLift = Math.max(0, Math.round(pBottomArena - pHeadTop));
      }

      if (arenaEl) {
        arenaEl.style.setProperty('--shadow-player-lift', `${Math.round(pLift)}px`);
        arenaEl.style.setProperty('--shadow-monster-lift', `${Math.round(mLift)}px`);
        arenaEl.style.setProperty('--shadow-player-bottom', `${Math.round(pBottomArena)}px`);
        arenaEl.style.setProperty('--shadow-monster-bottom', `${Math.round(mBottomArena)}px`);
        arenaEl.style.setProperty('--shadow-player-x', `${Math.round(pLeftPx + stageOffsetX)}px`);
        arenaEl.style.setProperty('--shadow-monster-x', `${Math.round(mLeftPx + stageOffsetX)}px`);
        arenaEl.style.setProperty('--shadow-monster-head-lift', `${mHeadLift}px`);
        arenaEl.style.setProperty('--shadow-player-head-lift', `${pHeadLift}px`);
        arenaEl.style.setProperty('--shadow-attack-dist', `${attackDistPx}px`);
        arenaEl.style.setProperty('--attack-dist', `${finalAttackDist}px`);
      }
    };
    updateOverlayPositionsRef.current = updateOverlayPositions;
    updateOverlayPositions();

    // 12. Loop de Animação e Renderização
    const clock = new THREE.Clock();

    const animate = () => {
      if (isDisposed) return;
      animFrameRef.current = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      const delta = clock.getDelta();

      // Atualiza os mixers de animação das entidades unificadas (Fase B)
      if (unifiedMonsterMixerRef.current) unifiedMonsterMixerRef.current.update(delta);
      if (unifiedPlayerMixerRef.current) unifiedPlayerMixerRef.current.update(delta);
      // Avanço do ataque corpo a corpo (tween de X) no loop
      const nowMs = performance.now();
      updateMoveTween(monsterMoveRef, unifiedMonsterGroupRef.current, nowMs);
      updateMoveTween(playerMoveRef, unifiedPlayerGroupRef.current, nowMs);

      // Nuvens se deslocam suavemente pelo céu
      if (cloudsGroupRef.current) {
        cloudsGroupRef.current.position.x = (elapsedTime * 0.4) % 60;
      }

      // Partículas flutuantes em tempo real (Nether brasas, Snow neve, End partículas)
      if (particleMesh && particlePositions.length > 0) {
        const pDummy = new THREE.Object3D();
        for (let i = 0; i < particlePositions.length; i++) {
          const p = particlePositions[i];
          p.y += p.speed * 0.016;
          if (isNether && p.y > 15) {
            p.y = 0;
            p.x = (Math.random() - 0.5) * 26;
            p.z = (Math.random() - 0.5) * 18;
          } else if (isSnow && p.y < -1) {
            p.y = 14;
            p.x = (Math.random() - 0.5) * 26;
            p.z = (Math.random() - 0.5) * 18;
          } else if (isEnd && p.y > 14) {
            p.y = 0;
            p.x = (Math.random() - 0.5) * 26;
            p.z = (Math.random() - 0.5) * 18;
          }

          pDummy.position.set(p.x, p.y, p.z);
          pDummy.rotation.x += p.rotSpeed * 0.016;
          pDummy.rotation.y += p.rotSpeed * 0.016;
          pDummy.updateMatrix();
          particleMesh.setMatrixAt(i, pDummy.matrix);
        }
        particleMesh.instanceMatrix.needsUpdate = true;
      }

      // Câmera estável com suave balanço horizontal de respiração
      if (cameraRef.current) {
        const sway = Math.sin(elapsedTime * 0.4) * 0.04;
        cameraRef.current.position.x = sway;
      }

      try {
        renderer.render(scene, camera);
      } catch (renderErr) {
        console.error('[VoxelArena3D] Erro na renderização Three.js:', renderErr);
      }
    };

    animate();

    // 15. Redimensionamento Responsivo e Câmera Adaptativa
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;

      const newAspect = w / h;
      camera.aspect = newAspect;

      // Câmera adaptativa para manter visão proporcional em telas verticais/mobile
      const newCam = computeCameraConfig(newAspect, deviceMode, cameraPitch, cameraDist, cameraTargetY);
      camera.position.set(0, newCam.camY, newCam.camZ);
      camera.lookAt(0, newCam.lookAtY, 0);
      camera.updateProjectionMatrix();

      renderer.setSize(w, h);
      updateOverlayPositions();
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    return () => {
      isDisposed = true;
      updateOverlayPositionsRef.current = null;
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      renderer.dispose();
      boxGeo.dispose();
      platformMaterial.dispose();
      if (Array.isArray(groundMaterials)) {
        groundMaterials.forEach((m) => m.dispose());
      } else if (groundMaterials) {
        (groundMaterials as THREE.Material).dispose();
      }
      if (sunGeo) sunGeo.dispose();
      if (sunMat) sunMat.dispose();
      if (cloudMat) cloudMat.dispose();
      if (particleGeo) particleGeo.dispose();
      if (particleMat) particleMat.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
    };
  }, [biome]);

  // =====================================================================
  // FASE B (TESTE): renderização UNIFICADA — jogador e monstro GLB dentro
  // da MESMA cena 3D (sem overlays CSS). As posições ficam em coordenadas
  // de mundo e a projeção da câmera resolve automaticamente (sem offsets).
  // =====================================================================

  // Guarda os valores atuais para os callbacks de load assíncrono
  const monsterZoomRef = useRef(monsterZoom);
  monsterZoomRef.current = monsterZoom;
  const monsterRotYRef = useRef(monsterRotY);
  monsterRotYRef.current = monsterRotY;
  const monsterEffectTintRef = useRef(monsterEffectTint);
  monsterEffectTintRef.current = monsterEffectTint;
  const monsterEnragedRef = useRef(monsterEnraged);
  monsterEnragedRef.current = monsterEnraged;
  // Rotação extra (graus) do modelo GLB do jogador (config.customRotY)
  const playerRotYRef = useRef(Number((playerConfig as any)?.customRotY ?? 0) || 0);
  playerRotYRef.current = Number((playerConfig as any)?.customRotY ?? 0) || 0;
  // Flag de cena unificada para o closure do updateOverlayPositions (criado uma vez)
  const unified3DRef = useRef(unified3D);
  unified3DRef.current = unified3D;

  // Carrega jogador + monstro GLB e insere na cena.
  useEffect(() => {
    if (!unified3D) return;
    const scene = sceneRef.current;
    if (!scene) return;

    let disposed = false;
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(draco);

    const loadEntity = (
      url: string | null | undefined,
      skinUrl: string | null | undefined,
      x: number,
      zoom: number,
      rotYDeg: number,
      onReady: (group: THREE.Group, root: THREE.Object3D, mixer: THREE.AnimationMixer, actions: Record<string, THREE.AnimationAction>) => void
    ) => {
      if (!url) return;
      const safe = getSafeUrl(url);
      loader.load(safe, (gltf) => {
        if (disposed) return;
        const group = new THREE.Group();
        const root = gltf.scene;
        fitEntityToGround(root, UNIFIED_ENTITY_HEIGHT * Math.max(0.2, zoom || 1));
        group.add(root);
        group.position.set(x, 0.51, 0.2);
        // Rotação base: repouso olha para a câmera (+z). Modelos Blockbench nascem virados
        // para -z, então +Math.PI os vira para a câmera (mesmo padrão do CustomModelViewer).
        group.rotation.y = Math.PI + THREE.MathUtils.degToRad(rotYDeg || 0);
        scene.add(group);
        const mixer = new THREE.AnimationMixer(root);
        const actions: Record<string, THREE.AnimationAction> = {};
        gltf.animations.forEach((clip) => { actions[clip.name] = mixer.clipAction(clip); });
        // Aplica a SKIN (se houver) ANTES de concluir (tint + animação).
        applySkinTexture(root, skinUrl, () => {
          if (disposed) return;
          onReady(group, root, mixer, actions);
        });
      }, undefined, (err) => {
        console.warn('[VoxelArena3D] Falha ao carregar GLB unificado:', safe, err);
      });
    };

    // Monstro (GLB)
    loadEntity(monsterModelUrl, monsterSkinUrl, 3.6, monsterZoomRef.current, monsterRotYRef.current, (group, root, mixer, actions) => {
      unifiedMonsterGroupRef.current = group;
      unifiedMonsterRootRef.current = root;
      unifiedMonsterMixerRef.current = mixer;
      unifiedMonsterActionsRef.current = actions;
      applyEntityTint(root, monsterEffectTintRef.current, monsterEnragedRef.current);
      playEntityAnimByName(actions, mixer, monsterAnimRef.current);
    });

    // Jogador (GLB customizado) — rotY extra vem de playerConfig.customRotY
    loadEntity(playerModelUrl, playerSkinUrl, -3.6, 1, playerRotYRef.current, (group, root, mixer, actions) => {
      unifiedPlayerGroupRef.current = group;
      unifiedPlayerRootRef.current = root;
      unifiedPlayerMixerRef.current = mixer;
      unifiedPlayerActionsRef.current = actions;
      playEntityAnimByName(actions, mixer, playerAnimRef.current);
    });

    return () => {
      disposed = true;
      [unifiedMonsterGroupRef, unifiedPlayerGroupRef].forEach((ref) => {
        if (ref.current) {
          scene.remove(ref.current);
          ref.current.traverse((c) => {
            const mesh = c as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.geometry?.dispose();
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((m: any) => m?.dispose?.());
            }
          });
        }
      });
      unifiedMonsterMixerRef.current?.stopAllAction();
      unifiedPlayerMixerRef.current?.stopAllAction();
      unifiedMonsterGroupRef.current = null;
      unifiedPlayerGroupRef.current = null;
      unifiedMonsterRootRef.current = null;
      unifiedPlayerRootRef.current = null;
      unifiedMonsterMixerRef.current = null;
      unifiedPlayerMixerRef.current = null;
      unifiedMonsterActionsRef.current = {};
      unifiedPlayerActionsRef.current = {};
      draco.dispose();
    };
  }, [unified3D, biome, monsterModelUrl, monsterSkinUrl, playerModelUrl, playerSkinUrl, monsterZoom, monsterRotY]);

  // Aplica a animação (por nome) e a rotação (repouso vs combate) quando muda.
  useEffect(() => {
    if (!unified3D) return;
    // Rotação: em repouso olham para a câmera; em combate viram para o oponente.
    if (unifiedMonsterGroupRef.current) {
      const base = isCombatAnim(monsterAnim) ? -Math.PI / 2 : Math.PI;
      unifiedMonsterGroupRef.current.rotation.y = base + THREE.MathUtils.degToRad(monsterRotYRef.current);
    }
    if (unifiedPlayerGroupRef.current) {
      const base = isCombatAnim(playerAnim) ? Math.PI / 2 : Math.PI;
      unifiedPlayerGroupRef.current.rotation.y = base + THREE.MathUtils.degToRad(playerRotYRef.current);
    }
    playEntityAnimByName(unifiedMonsterActionsRef.current, unifiedMonsterMixerRef.current, monsterAnim);
    playEntityAnimByName(unifiedPlayerActionsRef.current, unifiedPlayerMixerRef.current, playerAnim);
  }, [unified3D, monsterAnim, playerAnim, monsterModelUrl, playerModelUrl, monsterRotY]);

  // Avanço corpo a corpo: quando entra em ataque/fatal/vitória, lança o tween de X.
  useEffect(() => {
    if (!unified3D) return;
    const now = performance.now();
    const monGroup = unifiedMonsterGroupRef.current;
    if (monGroup) {
      const isAttack = monsterAnim?.startsWith('attack');
      const isVictory = monsterAnim?.startsWith('victory');
      if (isAttack || isVictory) {
        const isFatal = monsterAnim === 'attack-fatal' || monsterAnim === 'attack-fatal-slow';
        monsterMoveRef.current = { fromX: monGroup.position.x, toX: 3.6 - UNIFIED_LUNGE, restX: 3.6, start: now, mode: (isVictory || isFatal) ? 'hold' : 'go' };
      } else {
        monsterMoveRef.current = { fromX: monGroup.position.x, toX: 3.6, restX: 3.6, start: now, mode: 'go' };
      }
    }
    const playGroup = unifiedPlayerGroupRef.current;
    if (playGroup) {
      const isAttack = playerAnim?.startsWith('attack');
      const isVictory = playerAnim?.startsWith('victory');
      if (isAttack || isVictory) {
        const isFatal = playerAnim === 'attack-fatal' || playerAnim === 'attack-fatal-slow';
        playerMoveRef.current = { fromX: playGroup.position.x, toX: -3.6 + UNIFIED_LUNGE, restX: -3.6, start: now, mode: (isVictory || isFatal) ? 'hold' : 'go' };
      } else {
        playerMoveRef.current = { fromX: playGroup.position.x, toX: -3.6, restX: -3.6, start: now, mode: 'go' };
      }
    }
  }, [unified3D, monsterAnim, playerAnim]);

  // Reaplica tint/fúria quando os efeitos mudam.
  useEffect(() => {
    if (!unified3D) return;
    applyEntityTint(unifiedMonsterRootRef.current, monsterEffectTint, monsterEnraged);
  }, [unified3D, monsterEffectTint, monsterEnraged, monsterModelUrl]);

  // Recalcula a projeção da cabeça quando a cena unificada liga/desliga ou o zoom muda.
  useEffect(() => {
    updateOverlayPositionsRef.current?.();
  }, [unified3D, monsterZoom, playerConfig]);

  // Atualiza --attack-dist imediatamente quando o slider mudar (sem esperar resize)
  useEffect(() => {
    const outer = outerRef.current;
    const arenaEl = (outer?.parentElement || containerRef.current?.parentElement) as HTMLElement | null;
    if (!arenaEl) return;
    if (attackDist && attackDist > 0) {
      arenaEl.style.setProperty('--attack-dist', `${attackDist}px`);
    } else {
      // Ao zerar o slider, restaura a distância calculada automaticamente
      const auto = arenaEl.style.getPropertyValue('--shadow-attack-dist');
      if (auto) arenaEl.style.setProperty('--attack-dist', auto);
    }
  }, [attackDist]);

  return (
    <div
      className={`voxel-arena-3d-root ${arenaQuake ? 'arena-quake-3d' : ''}`}
      ref={outerRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        zIndex: 0,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* "Stage" com PROPORÇÃO FIXA por modo (9:16 mobile / 16:9 desktop): garante o
          MESMO enquadramento em qualquer device do mesmo modo. Fora do padrão (iPhone,
          Android alto, tablet), sobra apenas margem — o fundo do jogo preenche atrás. */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: stageSize.w || '100%',
          height: stageSize.h || '100%',
          flexShrink: 0,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        />
      </div>
    </div>
  );
};

export default VoxelArena3D;

