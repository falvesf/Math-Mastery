import React, { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, useAnimations, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface CustomModelViewerProps {
  modelUrl: string;
  textureUrl?: string;
  animation?: 'idle' | 'walk' | 'run' | 'attack' | 'none';
  size?: number;
}

function Model({ modelUrl, textureUrl, animationName }: { modelUrl: string, textureUrl?: string, animationName?: string }) {
  const { scene: originalScene, animations } = useGLTF(modelUrl);
  
  // Clone to avoid mutating the cached GLTF if multiple are rendered
  const scene = useMemo(() => originalScene.clone(), [originalScene]);
  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    if (textureUrl) {
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = "anonymous";
      loader.load(textureUrl, (texture) => {
        texture.flipY = false;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            // Minecraft textures use alpha test
            mesh.material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.1 });
          }
        });
      }, undefined, (err) => {
        console.error("Error loading texture:", err);
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
      targetAction.reset().fadeIn(0.2).play();
      return () => { targetAction?.fadeOut(0.2); };
    }
  }, [actions, animationName]);

  return <primitive object={scene} />;
}

export default function CustomModelViewer({ modelUrl, textureUrl, animation = 'idle', size = 150 }: CustomModelViewerProps) {
  return (
    <div style={{ width: size, height: size * 1.5, position: 'relative' }}>
      <Canvas camera={{ position: [0, 5, 15], fov: 45 }}>
        <ambientLight intensity={1} />
        <OrbitControls enablePan={false} enableZoom={true} />
        <React.Suspense fallback={null}>
          <Model modelUrl={modelUrl} textureUrl={textureUrl} animationName={animation} />
        </React.Suspense>
      </Canvas>
    </div>
  );
}
