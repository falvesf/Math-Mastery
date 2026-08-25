import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, OrbitControls, Bounds } from '@react-three/drei';
import * as THREE from 'three';

interface CustomModelViewerProps {
  modelUrl: string;
  textureUrl?: string;
  animation?: string;
  size?: number;
  role?: 'player' | 'monster';
}

// Para baús "de dois estados" (fechado à esquerda + aberto à direita no MESMO .glb,
// sem animação de ossos): detecta o centro de cada baú para saber a distância do deslize.
// Retorna null se não conseguir separar em dois grupos (ex.: um único mesh).
function computeChestSlide(scene: THREE.Object3D): { closedX: number; openX: number } | null {
  const centers: number[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const box = new THREE.Box3().setFromObject(child as THREE.Object3D);
      centers.push(box.getCenter(new THREE.Vector3()).x);
    }
  });
  if (centers.length < 2) return null;
  const left = centers.filter(x => x <= 0);
  const right = centers.filter(x => x > 0);
  if (left.length === 0 || right.length === 0) return null;
  const closedX = left.reduce((s, x) => s + x, 0) / left.length;
  const openX = right.reduce((s, x) => s + x, 0) / right.length;
  return { closedX, openX };
}

function Model({ modelUrl, textureUrl, animationName, role }: { modelUrl: string, textureUrl?: string, animationName?: string, role?: 'player' | 'monster' }) {
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
    return animationName === 'open' ? chestSlide.openX : chestSlide.closedX;
  }, [chestSlide, animationName]);

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

export default React.memo(function CustomModelViewer({ modelUrl, textureUrl, animation = 'idle', size = 150, role }: CustomModelViewerProps) {
  const isChest = modelUrl.includes('chest');
  
  // Aumentar a escala para monstros, mas não o suficiente para cortar a cabeça no modo desafio
  const modelScale = isChest ? 2.8 : 2.6;
  const modelPosY = isChest ? -2.5 : -2.8;

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
          <group position={[0, modelPosY, 0]} scale={modelScale}>
            <Model modelUrl={modelUrl} textureUrl={textureUrl} animationName={animation} role={role} />
          </group>
        </React.Suspense>
      </Canvas>
    </div>
  );
});
