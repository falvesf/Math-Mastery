import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { PlayerObject } from 'skinview3d';
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



export interface VoxelArena3DProps {
  /** Força o perfil de câmera e enquadramento para calibração ('desktop' | 'mobile') */
  deviceMode?: 'desktop' | 'mobile';
  /** Animação atual do monstro para efeitos de luz dinâmicos */
  monsterAnim?: string;
  /** Se o monstro está no pulso de cura verde água */
  healActive?: boolean;
  /** Terremoto/abalo na arena */
  arenaQuake?: boolean;
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Refs Three.js desacoplados do ciclo de vida da cena
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const healLightRef = useRef<THREE.PointLight | null>(null);
  const cloudsGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Ref para atualizar posições de overlay sem reconstruir o renderer
  const updateOverlayPositionsRef = useRef<(() => void) | null>(null);

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

      const parent = container.parentElement;
      if (parent) {
        parent.style.setProperty('--shadow-player-lift', `${Math.round(pLift)}px`);
        parent.style.setProperty('--shadow-monster-lift', `${Math.round(mLift)}px`);
        parent.style.setProperty('--shadow-player-bottom', `${Math.round(pBottomPx)}px`);
        parent.style.setProperty('--shadow-monster-bottom', `${Math.round(mBottomPx)}px`);
        parent.style.setProperty('--shadow-player-x', `${Math.round(pLeftPx)}px`);
        parent.style.setProperty('--shadow-monster-x', `${Math.round(mLeftPx)}px`);
        parent.style.setProperty('--shadow-attack-dist', `${attackDistPx}px`);
        parent.style.setProperty('--attack-dist', `${attackDistPx}px`);
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

  return (
    <div
      ref={containerRef}
      className={`voxel-arena-3d-root ${arenaQuake ? 'arena-quake-3d' : ''}`}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        zIndex: 0,
        pointerEvents: 'none',
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
  );
};

export default VoxelArena3D;

