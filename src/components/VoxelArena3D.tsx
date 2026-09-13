import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { PlayerObject } from 'skinview3d';
import {
  getStoneBricksTexture,
  getGrassTopTexture,
  getGrassSideTexture,
  getDirtTexture,
  getSunTexture,
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
  /** Bioma do cenário 3D */
  biome?: 'plains' | 'nether' | 'desert';

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
 * - Plataforma central de Tijolos de Pedra (Stone Bricks)
 * - Campos de Grama (Grass Blocks) ao redor com horizonte infinito
 * - Céu azul Minecraft, névoa e Sol Quadrado
 * - Nuvens cúbicas volumétricas flutuando pelo céu
 * - Personagem 3D do Jogador renderizado DIRETAMENTE na cena sobre a plataforma
 * - Personagem 3D do Monstro renderizado DIRETAMENTE na cena sobre a plataforma
 * - Câmera adaptativa com proporções perfeitas para desktop e mobile
 * - Animações de combate (avanço de ataque, impacto, recuo, cura e vitória)
 */
export const VoxelArena3D: React.FC<VoxelArena3DProps> = ({
  deviceMode,
  healActive = false,
  arenaQuake = false,
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

  // Refs de animação Three.js
  const animFrameRef = useRef<number | null>(null);
  const healLightRef = useRef<THREE.PointLight | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cloudsGroupRef = useRef<THREE.Group | null>(null);

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

    // 1. Cena e Neblina
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const skyColor = new THREE.Color('#78a7ff');
    scene.background = skyColor;
    scene.fog = new THREE.FogExp2(skyColor, 0.022);

    // 2. Câmera Isométrica com Profundidade 3D Rica em Desktop e Mobile
    const computeCameraConfig = (currAspect: number) => {
      const isMobile = deviceMode ? (deviceMode === 'mobile') : (window.innerWidth <= 768 || currAspect < 1.35);

      // Distância base em Z: mantém ambos os combatentes (-3.6 a +3.6) no campo de visão
      let baseZ = 12.5;
      if (isMobile) {
        // No mobile (vertical), calcula Z para cobrir os 7.2m de combate com margem elegante
        const targetVisibleWidth = 9.2;
        const requiredZ = targetVisibleWidth / (0.768 * Math.max(0.48, currAspect));
        baseZ = Math.max(12.5, Math.min(16.8, requiredZ));
      }

      // Aplica offset de distância configurável (zoom)
      const effectiveDist = baseZ + (cameraDist || 0);

      // Ponto focal vertical (centro de interesse no topo da plataforma)
      const baseLookAtY = 0.4 + (cameraTargetY || 0);

      // Inclinação para manter o ângulo isométrico idêntico ao desktop (~15.6°)
      // Isso garante que tanto desktop quanto mobile mostrem todas as linhas de blocos de pedra
      // com perspectiva profunda, sem jamais achatar a plataforma.
      const pitchDeg = 15.6 + (cameraPitch || 0);
      const pitchRad = (pitchDeg * Math.PI) / 180;
      const effectiveCamY = baseLookAtY + (effectiveDist * Math.tan(pitchRad));

      return {
        camY: effectiveCamY,
        camZ: effectiveDist,
        lookAtY: baseLookAtY,
      };
    };

    const initialCam = computeCameraConfig(aspect);
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
    renderer.toneMappingExposure = 1.1;

    // 4. Luzes da Arena
    const hemiLight = new THREE.HemisphereLight('#b8d5ff', '#4d6932', 0.85);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#fff4e0', 1.6);
    sunLight.position.set(8, 16, 10);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight('#a0b8d8', 0.4);
    scene.add(ambientLight);

    const healLight = new THREE.PointLight('#2dd4bf', 0, 10, 1.5);
    healLight.position.set(3.5, 1.2, 0);
    scene.add(healLight);
    healLightRef.current = healLight;

    // 5. Texturas e Materiais dos Blocos
    const stoneTex = getStoneBricksTexture();
    const grassTopTex = getGrassTopTexture();
    const grassSideTex = getGrassSideTexture();
    const dirtTex = getDirtTexture();

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    const stoneMaterial = new THREE.MeshStandardMaterial({
      map: stoneTex,
      roughness: 0.85,
      metalness: 0.05,
    });

    const grassMaterials = [
      new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: grassTopTex, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 0.9 }),
    ];

    // 6. Plataforma de Luta em Tijolos de Pedra (Stone Bricks)
    const platW = 14;
    const platD = 8;
    const platCount = platW * platD;
    const platformMesh = new THREE.InstancedMesh(boxGeo, stoneMaterial, platCount);

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

    // 7. Campo de Grama Circundante (Grass Plains)
    // Ampliado para frente (+Z) e laterais (X) para que em qualquer inclinação ou tela mobile
    // o chão continue sólido de grama verde, sem jamais exibir abismo ou corte de tela
    const grassW = 42;
    const grassD = 38;
    const totalGrass = grassW * grassD;
    const grassMesh = new THREE.InstancedMesh(boxGeo, grassMaterials, totalGrass);

    let gIdx = 0;
    const gHalfW = grassW / 2;
    const gHalfD = grassD / 2;
    // Desloca o centro da grama ligeiramente para a frente (+Z) para cobrir até a base da câmera
    const grassCenterZOffset = 5;

    for (let x = 0; x < grassW; x++) {
      for (let z = 0; z < grassD; z++) {
        const posX = x - gHalfW + 0.5;
        const posZ = (z - gHalfD + 0.5) + grassCenterZOffset;
        // Altura de 3 blocos para formar uma camada espessa e sólida de terra Minecraft
        dummy.position.set(posX, -2, posZ);
        dummy.scale.set(1, 3, 1);
        dummy.updateMatrix();
        grassMesh.setMatrixAt(gIdx++, dummy.matrix);
      }
    }
    grassMesh.instanceMatrix.needsUpdate = true;
    scene.add(grassMesh);

    // 8. Sol Quadrado do Minecraft
    const sunTex = getSunTexture();
    const sunGeo = new THREE.PlaneGeometry(6, 6);
    const sunMat = new THREE.MeshBasicMaterial({
      map: sunTex,
      transparent: true,
      depthWrite: false,
    });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.set(14, 18, -25);
    sunMesh.lookAt(0, 5, 0);
    scene.add(sunMesh);

    // 9. Nuvens Cúbicas Flutuantes
    const cloudsGroup = new THREE.Group();
    cloudsGroupRef.current = cloudsGroup;
    const cloudMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.85,
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
      const cMesh = new THREE.Mesh(cGeo, cloudMat);
      cMesh.position.set(c.x, c.y, c.z);
      cloudsGroup.add(cMesh);
    });
    scene.add(cloudsGroup);

    // 10. Sombras dos Personagens no chão de pedra
    const shadowTexCanvas = document.createElement('canvas');
    shadowTexCanvas.width = 32;
    shadowTexCanvas.height = 32;
    const sCtx = shadowTexCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(16, 16, 2, 16, 16, 15);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
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

    // 11. Sincronização de Projeção para Elevação dos Personagens na Plataforma
    const updateOverlayPositions = () => {
      if (!container || !camera) return;
      const h = container.clientHeight;
      const w = container.clientWidth;
      if (h === 0 || w === 0) return;

      camera.updateMatrixWorld();

      // Ponto na superfície da plataforma de pedra sob o jogador
      const pGround = new THREE.Vector3(-3.6, 0.51, 0.2);
      pGround.project(camera);
      const pBottomPx = (pGround.y * 0.5 + 0.5) * h;

      // Ponto na superfície da plataforma de pedra sob o monstro
      const mGround = new THREE.Vector3(3.6, 0.51, 0.2);
      mGround.project(camera);
      const mBottomPx = (mGround.y * 0.5 + 0.5) * h;

      // Compensa o padding inferior da arena (60px no desktop, 16px no mobile)
      const isMobile = deviceMode ? (deviceMode === 'mobile') : (window.innerWidth <= 768);
      const bottomPadding = isMobile ? 16 : 60;
      const pLift = Math.max(0, pBottomPx - bottomPadding);
      const mLift = Math.max(0, mBottomPx - bottomPadding);

      const parent = container.parentElement;
      if (parent) {
        parent.style.setProperty('--shadow-player-lift', `${Math.round(pLift)}px`);
        parent.style.setProperty('--shadow-monster-lift', `${Math.round(mLift)}px`);
        parent.style.setProperty('--shadow-player-bottom', `${Math.round(pBottomPx)}px`);
        parent.style.setProperty('--shadow-monster-bottom', `${Math.round(mBottomPx)}px`);
      }
    };
    updateOverlayPositions();

    // 12. Loop de Animação e Renderização
    const clock = new THREE.Clock();

    const animate = () => {
      if (isDisposed) return;
      animFrameRef.current = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      const now = performance.now() / 1000;

      // Nuvens se deslocam suavemente pelo céu
      if (cloudsGroupRef.current) {
        cloudsGroupRef.current.position.x = (elapsedTime * 0.4) % 60;
      }

      // Sombra acompanha avanço de ataque do jogador
      if (playerAttackStartRef.current != null) {
        const t = now - playerAttackStartRef.current;
        if (t < 0.3) {
          playerShadow.position.x = -3.6 + (t / 0.3) * 5.4;
        } else if (t < 0.65) {
          playerShadow.position.x = 1.8;
        } else if (t < 1.1) {
          playerShadow.position.x = 1.8 - ((t - 0.65) / 0.45) * 5.4;
        } else {
          playerShadow.position.x = -3.6;
          playerAttackStartRef.current = null;
        }
      } else {
        playerShadow.position.x = -3.6;
      }

      // Sombra acompanha avanço de ataque do monstro
      if (monsterAttackStartRef.current != null) {
        const t = now - monsterAttackStartRef.current;
        if (t < 0.3) {
          monsterShadow.position.x = 3.6 - (t / 0.3) * 5.4;
        } else if (t < 0.65) {
          monsterShadow.position.x = -1.8;
        } else if (t < 1.1) {
          monsterShadow.position.x = -1.8 + ((t - 0.65) / 0.45) * 5.4;
        } else {
          monsterShadow.position.x = 3.6;
          monsterAttackStartRef.current = null;
        }
      } else {
        monsterShadow.position.x = 3.6;
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
      const newCam = computeCameraConfig(newAspect);
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
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      renderer.dispose();
      boxGeo.dispose();
      stoneMaterial.dispose();
      grassMaterials.forEach((m) => m.dispose());
      sunGeo.dispose();
      sunMat.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
    };
  }, [
    playerModelUrl,
    playerSkinUrl,
    JSON.stringify(playerConfig),
    monsterModelUrl,
    monsterSkinUrl,
    monsterZoom,
    monsterRotY,
    deviceMode,
    cameraPitch,
    cameraDist,
    cameraTargetY,
  ]);

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

