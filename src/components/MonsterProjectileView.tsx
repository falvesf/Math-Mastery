// @ts-ignore
import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import CustomModelViewer from './CustomModelViewer';
import type { MonsterProjectileType } from '../lib/monsterAttacks';

interface MonsterProjectileViewProps {
  type?: MonsterProjectileType;
  customUrl?: string;
  size?: number;
}

function SpinningRockMesh() {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 2.8;
      meshRef.current.rotation.y += delta * 3.4;
      meshRef.current.rotation.z += delta * 1.5;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[0.4, 0.6, 0.2]}>
      <dodecahedronGeometry args={[1.25, 0]} />
      <meshStandardMaterial
        color="#7d766e"
        roughness={0.9}
        metalness={0.15}
        flatShading={true}
      />
    </mesh>
  );
}

export function LowPolyRock3D({ size = 56 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.9))' }}>
      <Canvas camera={{ position: [0, 0, 3.2], fov: 45 }}>
        <ambientLight intensity={1.4} />
        <directionalLight position={[4, 6, 5]} intensity={2.0} />
        <directionalLight position={[-3, -2, -2]} intensity={0.6} />
        <SpinningRockMesh />
      </Canvas>
    </div>
  );
}

export default function MonsterProjectileView({
  type = 'rock',
  customUrl,
  size = 56,
}: MonsterProjectileViewProps) {
  // Se houver URL de modelo 3D GLB associado, renderiza via CustomModelViewer
  if (customUrl) {
    return (
      <div style={{ width: size, height: size, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CustomModelViewer modelUrl={customUrl} size={size} animation="none" />
      </div>
    );
  }

  // Rocha do Golem: Rocha 3D geométrica com iluminação e rotação
  if (type === 'rock') {
    return <LowPolyRock3D size={size} />;
  }

  // Outros projéteis estilizados
  if (type === 'tnt') {
    return (
      <div style={{ transform: `scale(${size / 36})`, transformOrigin: 'center' }}>
        <div className="proj-tnt">TNT</div>
      </div>
    );
  }

  if (type === 'arrow') {
    return (
      <div style={{ transform: `scale(${size / 36})`, transformOrigin: 'center' }}>
        <div className="proj-arrow">🏹</div>
      </div>
    );
  }

  if (type === 'fireball') {
    return (
      <div style={{ transform: `scale(${size / 36})`, transformOrigin: 'center' }}>
        <div className="proj-fireball" title="Fogo" />
      </div>
    );
  }

  if (type === 'iceball') {
    return (
      <div style={{ transform: `scale(${size / 36})`, transformOrigin: 'center' }}>
        <div className="proj-iceball" title="Gelo" />
      </div>
    );
  }

  if (type === 'thunder') {
    return (
      <div style={{ transform: `scale(${size / 36})`, transformOrigin: 'center' }}>
        <div className="proj-thunder" title="Raio" />
      </div>
    );
  }

  if (type === 'poison_flask') {
    return (
      <div style={{ transform: `scale(${size / 36})`, transformOrigin: 'center' }}>
        <div className="proj-poison_flask" title="Veneno" />
      </div>
    );
  }

  // Fallback padrão: Rocha 3D
  return <LowPolyRock3D size={size} />;
}
