import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface CustomModelViewerProps {
  modelUrl: string;
  textureUrl?: string;
  animation?: string;
  size?: number;
  role?: 'player' | 'monster';
  chestZoom?: number;
  chestOffsetX?: number;
  chestOffsetY?: number;
  chestRotY?: number;
  chestOpenOffsetX?: number;
  chestOpenOffsetY?: number;
  chestSwapSides?: boolean;
}

// Para baús "de dois estados" (fechado à esquerda + aberto à direita no MESMO .glb,
// sem animação de ossos): detecta o centro de cada baú para saber a distância do deslize.
// Retorna null se não conseguir separar em dois grupos (ex.: um único mesh).
// Usa uma CÓPIA da cena (matrizes locais autoradas) para ser estável, independente
// de rotação/escala aplicadas em runtime pelo R3F.
export function computeChestSlide(scene: THREE.Object3D): { closedX: number; openX: number } | null {
  const s = scene.clone();
  s.updateMatrixWorld(true);
  const left: THREE.Box3[] = [];
  const right: THREE.Box3[] = [];
  s.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const box = new THREE.Box3().setFromObject(child as THREE.Object3D);
      const c = box.getCenter(new THREE.Vector3());
      if (c.x <= 0) left.push(box.clone());
      else right.push(box.clone());
    }
  });
  if (left.length === 0 || right.length === 0) return null;
  const leftBox = new THREE.Box3();
  left.forEach(b => leftBox.union(b));
  const rightBox = new THREE.Box3();
  right.forEach(b => rightBox.union(b));

  // Detecção automática: o baú FECHADO costuma ser mais baixo (tampa abaixada);
  // o ABERTO mais alto (tampa levantada). Se as alturas diferirem de forma
  // significativa, o menor é o fechado — independente do lado.
  let closedBox = leftBox;
  let openBox = rightBox;
  const leftH = leftBox.max.y - leftBox.min.y;
  const rightH = rightBox.max.y - rightBox.min.y;
  if (Math.abs(leftH - rightH) > Math.max(leftH, rightH) * 0.05) {
    if (rightH < leftH) { closedBox = rightBox; openBox = leftBox; }
  }

  return {
    closedX: closedBox.getCenter(new THREE.Vector3()).x,
    openX: openBox.getCenter(new THREE.Vector3()).x
  };
}

// Encaixe base (baseline) para baús: faz o baú (ou o baú fechado, se "de dois estados")
// preencher ~78% da área visível com zoom=1. Retorna { scale, posY }.
// Com zoom/offsets manuais, o usuário ajusta por cima (WYSIWYG com o preview).
// Usa CÓPIA da cena (matrizes locais) para ficar estável durante giro/zoom.
export function computeChestBaselineFit(scene: THREE.Object3D, twoState: { closedX: number; openX: number } | null, swapSides = false): { scale: number; posY: number } {
  const s = scene.clone();
  s.updateMatrixWorld(true);
  const box = new THREE.Box3();

  if (twoState) {
    // Encaixa o cluster identificado como FECHADO (pela detecção automática),
    // respeitando a inversão manual se o admin tiver marcado "Inverter lados".
    const autoClosedIsRight = twoState.closedX > 0;
    const useRight = swapSides ? !autoClosedIsRight : autoClosedIsRight;
    s.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const b = new THREE.Box3().setFromObject(child as THREE.Object3D);
        const c = b.getCenter(new THREE.Vector3()).x;
        if (useRight ? c > 0 : c <= 0) box.union(b);
      }
    });
  } else {
    box.setFromObject(s);
  }

  if (box.isEmpty()) return { scale: 2.8, posY: -1 };

  const h = Math.max(0.001, box.max.y - box.min.y);
  const w = Math.max(0.001, box.max.x - box.min.x);
  const cy = (box.max.y + box.min.y) / 2;
  // Clamp largo para permitir encolher modelos grandes (ex.: autorados enormes)
  const fitScale = Math.max(0.001, Math.min(20, 6.5 / Math.max(h, w)));
  // Centraliza na altura do alvo da câmera (y=1.5) para não cortar
  return { scale: fitScale, posY: 1.5 - cy * fitScale };
}

function Model({ modelUrl, textureUrl, animationName, role, chestSwapSides }: { modelUrl: string, textureUrl?: string, animationName?: string, role?: 'player' | 'monster', chestSwapSides?: boolean }) {
  const safeModelUrl = modelUrl.startsWith('/') && !modelUrl.startsWith('http') 
    ? import.meta.env.BASE_URL + modelUrl.substring(1) 
    : modelUrl;
  const { scene: originalScene, animations } = useGLTF(safeModelUrl);
  
  // Clone to avoid mutating the cached GLTF if multiple are rendered
  const scene = useMemo(() => originalScene.clone(), [originalScene]);
  const { actions, mixer } = useAnimations(animations, scene);

  // Guarda a pose original de todos os ossos e meshes
  const initialTransforms = useMemo(() => {
    const map = new Map();
    scene.traverse((child) => {
      map.set(child.uuid, {
        position: child.position.clone(),
        rotation: child.rotation.clone(),
        scale: child.scale.clone()
      });
    });
    return map;
  }, [scene]);

  useEffect(() => {
    if (textureUrl) {
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = 'anonymous';
      loader.load(textureUrl, (texture) => {
        texture.flipY = false; // GLTF padrão usa flipY falso
        texture.magFilter = THREE.NearestFilter; // Para manter o estilo pixel art
        texture.minFilter = THREE.NearestFilter;
        
        scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            // Preserva as propriedades originais do material (brilho, sombra), apenas troca a imagem
            if (mesh.material) {
              const newMat = (mesh.material as THREE.Material).clone() as any;
              newMat.map = texture;
              newMat.transparent = false; // Desativar transparência do alpha blending para evitar Z-fighting
              newMat.alphaTest = 0.5; // Usar alphaTest para cutout puro (descartar pixels invisíveis)
              newMat.needsUpdate = true;
              mesh.material = newMat;
            }
          }
        });
      }, undefined, (err) => {
        console.error('Erro ao carregar textura customizada:', err);
      });
    }
  }, [scene, textureUrl]);

  useEffect(() => {
    let targetAction: THREE.AnimationAction | null = null;
    
    if (animationName && animationName !== 'none') {
      const possibleNames = [
        animationName, 
        animationName.toUpperCase(), 
        animationName.toLowerCase(), 
        `animation.${animationName}`, 
        `animation.${animationName.toLowerCase()}`,
        `Armature|${animationName}`,
        `Armature|${animationName.toLowerCase()}`,
        `attack1`,
        `attack2`,
        'animation.idle', 
        'animation.walk'
      ];
      for (const name of possibleNames) {
        if (actions[name]) {
          targetAction = actions[name];
          break;
        }
      }
    }

    if (!targetAction && Object.keys(actions).length > 0) {
       targetAction = Object.values(actions)[0]; // Fallback to first animation
    }

    if (targetAction) {
      // Restaura a pose original do esqueleto antes de transicionar
      // Isso impede que ossos "presos" por animações anteriores deformem ou movam o modelo pra perto da câmera
      scene.traverse((child) => {
        const initial = initialTransforms.get(child.uuid);
        if (initial) {
          child.position.copy(initial.position);
          child.rotation.copy(initial.rotation);
          child.scale.copy(initial.scale);
        }
      });
      
      mixer.stopAllAction();
      targetAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.2).play();
      return () => { targetAction?.fadeOut(0.2); };
    }
  }, [actions, animationName, mixer, scene, initialTransforms]);

  const targetRotation = React.useMemo(() => {
    if (!role) return [0, Math.PI, 0];
    const isCombatAnim = animationName?.startsWith('attack') || animationName === 'hurt' || animationName?.startsWith('death');
    if (isCombatAnim) {
      return role === 'player' ? [0, Math.PI / 2, 0] : [0, -Math.PI / 2, 0];
    }
    return [0, Math.PI, 0];
  }, [role, animationName]);

  // Baú "de dois estados" (fechado | aberto no mesmo arquivo, SEM animação de ossos):
  // quando o arquivo tem animação 'open' de verdade, deixamos a animação rodar.
  // Quando NÃO tem, usamos o deslize horizontal para revelar o baú aberto.
  const isChest = modelUrl.includes('chest');
  const hasOpenAnimation = Object.keys(actions).some(name => /open/i.test(name));
  const chestSlide = React.useMemo(() => {
    if (!isChest || hasOpenAnimation) return null;
    return computeChestSlide(scene);
  }, [isChest, hasOpenAnimation, scene]);

  const slideTargetX = React.useMemo(() => {
    if (!chestSlide) return 0;
    // Se o arquivo tiver o fechado no lado invertido, troca os lados
    const target = chestSwapSides
      ? (animationName === 'open' ? chestSlide.closedX : chestSlide.openX)
      : (animationName === 'open' ? chestSlide.openX : chestSlide.closedX);
    return target;
  }, [chestSlide, animationName, chestSwapSides]);

  const slideGroupRef = useRef<THREE.Group>(null);
  const isFirstSlideFrame = useRef(true);
  useFrame((_, delta) => {
    const g = slideGroupRef.current;
    if (!g) return;
    if (isFirstSlideFrame.current) {
      g.position.x = slideTargetX;
      isFirstSlideFrame.current = false;
      return;
    }
    const next = THREE.MathUtils.damp(g.position.x, slideTargetX, 8, delta);
    if (Math.abs(next - g.position.x) > 0.0001) g.position.x = next;
  });

  return (
    <group ref={slideGroupRef}>
      <primitive object={scene} rotation={targetRotation} />
    </group>
  );
}

// Decide como enquadrar o modelo na área:
//  - Baús: enquadramento MANUAL (baseline + chestZoom + offsets + giro), WYSIWYG com o preview.
//  - Jogadores/monstros: escala/posição fixas (comportamento atual).
function ModelGroup({ modelUrl, textureUrl, animationName, role, chestZoom = 1, chestOffsetX = 0, chestOffsetY = 0, chestRotY = 0, chestOpenOffsetX, chestOpenOffsetY, chestSwapSides = false }: {
  modelUrl: string; textureUrl?: string; animationName?: string; role?: 'player' | 'monster';
  chestZoom?: number; chestOffsetX?: number; chestOffsetY?: number; chestRotY?: number;
  chestOpenOffsetX?: number; chestOpenOffsetY?: number; chestSwapSides?: boolean;
}) {
  const safeModelUrl = modelUrl.startsWith('/') && !modelUrl.startsWith('http')
    ? import.meta.env.BASE_URL + modelUrl.substring(1)
    : modelUrl;
  const { scene, animations } = useGLTF(safeModelUrl);
  const isChest = modelUrl.includes('chest');

  const hasOpenAnim = animations.some(a => /open/i.test(a.name));

  // Encaixe calculado UMA vez por cena (estável, não depende de rotação/zoom em runtime)
  const { twoState, fit } = useMemo(() => {
    const slide = isChest && !hasOpenAnim ? computeChestSlide(scene) : null;
    const base = isChest ? computeChestBaselineFit(scene, slide, chestSwapSides) : { scale: 1, posY: 0 };
    return { twoState: slide, fit: base };
  }, [scene, isChest, hasOpenAnim, chestSwapSides]);

  const content = (
    <Model modelUrl={modelUrl} textureUrl={textureUrl} animationName={animationName} role={role} chestSwapSides={chestSwapSides} />
  );

  if (!isChest) {
    return (
      <group position={[0, -2.8, 0]} scale={2.6}>
        {content}
      </group>
    );
  }

  // Baú: posição X/Y SEPARADA para o estado fechado e aberto (WYSIWYG com o preview)
  const isOpen = animationName === 'open';
  const offX = isOpen ? (chestOpenOffsetX ?? chestOffsetX ?? 0) : (chestOffsetX ?? 0);
  const offY = isOpen ? (chestOpenOffsetY ?? chestOffsetY ?? 0) : (chestOffsetY ?? 0);
  const zoom = Math.max(0.1, Math.min(5, chestZoom ?? 1));
  const rotRad = ((((chestRotY ?? 0) % 360) + 360) % 360) * Math.PI / 180;
  return (
    <group position={[offX, fit.posY + offY, 0]} scale={fit.scale * zoom} rotation={[0, rotRad, 0]}>
      {content}
    </group>
  );
}

export default React.memo(function CustomModelViewer({ modelUrl, textureUrl, animation = 'idle', size = 150, role, chestZoom, chestOffsetX, chestOffsetY, chestRotY, chestOpenOffsetX, chestOpenOffsetY, chestSwapSides }: CustomModelViewerProps) {
  const isChest = modelUrl.includes('chest');
  
  // Desabilitar rotação e zoom no modo desafio (quando role for passado)
  const isArena = !!role;
  const allowInteraction = !isChest && !isArena;

  return (
    <div style={{ width: size, height: size, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      <Canvas camera={{ position: [0, 3, 10], fov: 45 }} style={{ width: '100%', height: '100%' }}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 10, 5]} intensity={0.5} />
        <OrbitControls enablePan={false} enableZoom={allowInteraction} enableRotate={allowInteraction} target={[0, 1.5, 0]} />
        <React.Suspense fallback={null}>
          <ModelGroup modelUrl={modelUrl} textureUrl={textureUrl} animationName={animation} role={role} chestZoom={chestZoom} chestOffsetX={chestOffsetX} chestOffsetY={chestOffsetY} chestRotY={chestRotY} chestOpenOffsetX={chestOpenOffsetX} chestOpenOffsetY={chestOpenOffsetY} chestSwapSides={chestSwapSides} />
        </React.Suspense>
      </Canvas>
    </div>
  );
});
