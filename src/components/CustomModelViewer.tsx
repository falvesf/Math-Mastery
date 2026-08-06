import React, { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, useAnimations, OrbitControls, Bounds } from '@react-three/drei';
import * as THREE from 'three';

interface CustomModelViewerProps {
  modelUrl: string;
  textureUrl?: string;
  animation?: string;
  size?: number;
  role?: 'player' | 'monster';
}

function Model({ modelUrl, textureUrl, animationName, role }: { modelUrl: string, textureUrl?: string, animationName?: string, role?: 'player' | 'monster' }) {
  const safeModelUrl = modelUrl.startsWith('/') && !modelUrl.startsWith('http') 
    ? import.meta.env.BASE_URL + modelUrl.substring(1) 
    : modelUrl;
  const { scene: originalScene, animations } = useGLTF(safeModelUrl);
  
  // Clone to avoid mutating the cached GLTF if multiple are rendered
  const scene = useMemo(() => originalScene.clone(), [originalScene]);
  const { actions } = useAnimations(animations, scene);

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
      const possibleNames = [animationName, animationName.toUpperCase(), animationName.toLowerCase(), 'animation.idle', 'animation.walk'];
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
      targetAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.2).play();
      return () => { targetAction?.fadeOut(0.2); };
    }
  }, [actions, animationName]);

  const targetRotation = React.useMemo(() => {
    if (!role) return [0, Math.PI, 0];
    const isCombatAnim = animationName?.startsWith('attack') || animationName === 'hurt' || animationName?.startsWith('death');
    if (isCombatAnim) {
      return role === 'player' ? [0, Math.PI / 2, 0] : [0, -Math.PI / 2, 0];
    }
    return [0, Math.PI, 0];
  }, [role, animationName]);

  return <primitive object={scene} rotation={targetRotation} />;
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
