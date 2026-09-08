import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { resolveSkinUrl } from './ItemIcon';

// Configuração de cada parte do corpo: dimensões do cubo + regiões UV da skin 64x64.
// Ordem das faces do BoxGeometry: right(0), left(1), top(2), bottom(3), front(4), back(5).
interface PartCfg {
  dims: [number, number, number];
  faces: { x: number; y: number; w: number; h: number }[];
}

const PART_CONFIGS: Record<string, PartCfg> = {
  head: {
    dims: [8, 8, 8],
    faces: [
      { x: 0, y: 8, w: 8, h: 8 },   // right
      { x: 16, y: 8, w: 8, h: 8 },  // left
      { x: 8, y: 0, w: 8, h: 8 },   // top
      { x: 16, y: 0, w: 8, h: 8 },  // bottom
      { x: 8, y: 8, w: 8, h: 8 },   // front
      { x: 24, y: 8, w: 8, h: 8 },  // back
    ],
  },
  body: {
    dims: [8, 12, 4],
    faces: [
      { x: 16, y: 20, w: 4, h: 12 },  // right
      { x: 28, y: 20, w: 4, h: 12 },  // left
      { x: 20, y: 16, w: 8, h: 4 },   // top
      { x: 28, y: 16, w: 8, h: 4 },   // bottom
      { x: 20, y: 20, w: 8, h: 12 },  // front
      { x: 32, y: 20, w: 8, h: 12 },  // back
    ],
  },
  arm: {
    dims: [4, 12, 4],
    faces: [
      { x: 40, y: 20, w: 4, h: 12 },  // right
      { x: 52, y: 20, w: 4, h: 12 },  // left
      { x: 44, y: 16, w: 4, h: 4 },   // top
      { x: 48, y: 16, w: 4, h: 4 },   // bottom
      { x: 44, y: 20, w: 4, h: 12 },  // front
      { x: 56, y: 20, w: 4, h: 12 },  // back
    ],
  },
  leg: {
    dims: [4, 12, 4],
    faces: [
      { x: 0, y: 20, w: 4, h: 12 },  // right
      { x: 8, y: 20, w: 4, h: 12 },  // left
      { x: 4, y: 16, w: 4, h: 4 },   // top
      { x: 8, y: 16, w: 4, h: 4 },   // bottom
      { x: 4, y: 20, w: 4, h: 12 },  // front
      { x: 12, y: 20, w: 4, h: 12 }, // back
    ],
  },
};

const WEAPON_PARTS = new Set(['rightHand', 'leftHand', 'two_handed', 'hand', 'right_hand', 'left_hand']);

// Mapeia a "Parte do Avatar" para a configuração do cubo (só corpo; armas/acessórios não se aplicam).
function getPartConfig(avatarPart?: string): PartCfg | null {
  if (!avatarPart || WEAPON_PARTS.has(avatarPart)) return null;
  const p = avatarPart.toLowerCase();
  if (p.includes('torso') || p.includes('shoulder') || p.includes('chest') || p.includes('body') || p.includes('armor') || p.includes('armour')) return PART_CONFIGS.body;
  if (p.includes('arm') && !p.includes('hand')) return PART_CONFIGS.arm;
  if (p.includes('leg') || p.includes('feet') || p.includes('foot')) return PART_CONFIGS.leg;
  return PART_CONFIGS.head;
}

function MinecraftCube({ minecraftHeadValue, avatarPart }: { minecraftHeadValue: string; avatarPart?: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const cfg = getPartConfig(avatarPart) || PART_CONFIGS.head;

  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(cfg.dims[0] / 8, cfg.dims[1] / 8, cfg.dims[2] / 8);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const setUV = (faceIndex: number, face: { x: number; y: number; w: number; h: number }) => {
      const x0 = face.x / 64;
      const x1 = (face.x + face.w) / 64;
      const y1 = 1.0 - face.y / 64;
      const y0 = 1.0 - (face.y + face.h) / 64;
      const offset = faceIndex * 8;
      uv.setXY(offset + 0, x0, y1); uv.setXY(offset + 1, x1, y1);
      uv.setXY(offset + 2, x0, y0); uv.setXY(offset + 3, x1, y0);
    };
    cfg.faces.forEach((face, i) => setUV(i, face));
    uv.needsUpdate = true;
    return g;
  }, [cfg]);

  const materials = useMemo(() => {
    const mats = Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial({ color: '#4a3a22', transparent: true }));
    const textureUrl = resolveSkinUrl(minecraftHeadValue);
    if (!textureUrl) return mats;

    let finalUrl = textureUrl;
    if (textureUrl.includes('textures.minecraft.net/texture/')) {
      finalUrl = `https://mc-heads.net/skin/${textureUrl.substring(textureUrl.lastIndexOf('/') + 1)}`;
    } else if (textureUrl.startsWith('http')) {
      finalUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(textureUrl)}`;
    }

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      finalUrl,
      (texture) => {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        mats.forEach(m => { m.map = texture; m.color.set('#ffffff'); m.needsUpdate = true; });
      },
      undefined,
      () => {}
    );
    return mats;
  }, [minecraftHeadValue]);

  useFrame(() => {
    if (meshRef.current) meshRef.current.rotation.y += 0.008;
  });

  return <mesh ref={meshRef} geometry={geometry} material={materials} scale={1.4} />;
}

export default function MinecraftCubePreview({ minecraftHeadValue, avatarPart, size = 260 }: { minecraftHeadValue: string; avatarPart?: string; size?: number }) {
  const applies = !avatarPart || !WEAPON_PARTS.has(avatarPart);
  return (
    <div style={{ width: size, height: size, position: 'relative', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {applies ? (
        <Canvas camera={{ position: [0, 0, 3.4], fov: 45 }} style={{ width: '100%', height: '100%' }}>
          <ambientLight intensity={1.6} />
          <directionalLight position={[4, 5, 5]} intensity={0.7} />
          <MinecraftCube minecraftHeadValue={minecraftHeadValue} avatarPart={avatarPart} />
        </Canvas>
      ) : (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.85rem', padding: '1rem' }}>
          A textura Minecraft se aplica ao corpo do personagem (cabeça, torso, braços, pernas). Não se aplica a armas/acessórios.
        </p>
      )}
    </div>
  );
}