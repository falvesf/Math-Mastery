// @ts-ignore
import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Rocha de gelo 3D (estilo low-poly cristalino) que envolve o monstro congelado.
// Azul, semi-transparente (dá para ver o boneco dentro) e vai DERRETENDO (encolhendo)
// conforme o `melt` (1 = cheio, 0 = derretido). Feita com Three/R3F, igual à rocha do Golem.
function IceMesh({ melt }: { melt: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.25;
  });
  const s = Math.max(0.001, Math.min(1, melt));
  // Oval: mais alto do que largo, um pouco maior que o boneco.
  return (
    <mesh ref={ref} scale={[1.15 * s, 1.55 * s, 1.15 * s]}>
      <icosahedronGeometry args={[1, 1]} />
      <meshPhysicalMaterial
        color="#bfe6ff"
        emissive="#2f7ec4"
        emissiveIntensity={0.45}
        transparent
        opacity={0.5}
        roughness={0.12}
        metalness={0}
        flatShading
        transmission={0.25}
        thickness={0.6}
      />
    </mesh>
  );
}

export function IceRockView({ size = 170, melt = 1 }: { size?: number; melt?: number }) {
  return (
    <div style={{ width: size, height: size, pointerEvents: 'none', filter: 'drop-shadow(0 0 14px rgba(120,190,255,0.65))' }}>
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }} gl={{ alpha: true }} style={{ pointerEvents: 'none' }}>
        <ambientLight intensity={1.35} />
        <directionalLight position={[4, 6, 5]} intensity={1.8} />
        <directionalLight position={[-3, -2, -2]} intensity={0.7} />
        <IceMesh melt={melt} />
      </Canvas>
    </div>
  );
}

export default IceRockView;
