import { useEffect, useRef } from 'react';
import { SkinViewer, IdleAnimation } from 'skinview3d';
import * as THREE from 'skinview3d/node_modules/three';
import { resolveSkinUrl } from './ItemIcon';

// Partes do esqueleto do skinview3d que ficam visíveis por "Parte do Avatar".
const PART_TARGETS: Record<string, string[]> = {
  head: ['head', 'hat'],
  body: ['body', 'jacket'],
  shoulders: ['body', 'jacket'],
  torso: ['body', 'jacket'],
  chest: ['body', 'jacket'],
  armor: ['body', 'jacket'],
  arm: ['leftArm', 'rightArm'],
  leftArm: ['leftArm'],
  rightArm: ['rightArm'],
  leg: ['leftLeg', 'rightLeg'],
  leftLeg: ['leftLeg'],
  rightLeg: ['rightLeg'],
  feet: ['leftLeg', 'rightLeg'],
};

// Foco da câmera por parte (posição Y do alvo + zoom).
const PART_FOCUS: Record<string, { y: number; zoom: number }> = {
  head: { y: 1.6, zoom: 1.1 },
  body: { y: 1.0, zoom: 0.85 },
  arm: { y: 1.0, zoom: 1.0 },
  leg: { y: 0.6, zoom: 1.0 },
  feet: { y: 0.4, zoom: 1.0 },
};

const WEAPON_PARTS = new Set(['rightHand', 'leftHand', 'two_handed', 'hand', 'right_hand', 'left_hand']);

function getTargetKey(avatarPart?: string): string {
  if (!avatarPart) return 'head';
  const p = avatarPart.toLowerCase();
  if (p.includes('torso') || p.includes('shoulder') || p.includes('chest') || p.includes('body') || p.includes('armor') || p.includes('armour')) return 'body';
  if (p.includes('leftarm')) return 'leftArm';
  if (p.includes('rightarm')) return 'rightArm';
  if (p.includes('arm')) return 'arm';
  if (p.includes('leftleg')) return 'leftLeg';
  if (p.includes('rightleg')) return 'rightLeg';
  if (p.includes('leg') || p.includes('feet') || p.includes('foot')) return 'leg';
  return 'head';
}

export default function MinecraftPartPreview({ minecraftHeadValue, avatarPart, size = 260 }: { minecraftHeadValue: string; avatarPart?: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !minecraftHeadValue) return;
    let viewer: SkinViewer;
    try {
      viewer = new SkinViewer({ canvas: canvasRef.current, width: size, height: size, skin: '' });
      viewerRef.current = viewer;
      viewer.controls.enableRotate = true;
      viewer.controls.enableZoom = true;
      viewer.controls.enablePan = false;
      viewer.animation = new IdleAnimation();
    } catch (e) {
      console.error('Erro ao iniciar SkinViewer:', e);
      return;
    }

    const textureUrl = resolveSkinUrl(minecraftHeadValue);
    if (!textureUrl) return;
    let finalUrl = textureUrl;
    if (textureUrl.includes('textures.minecraft.net/texture/')) {
      finalUrl = `https://mc-heads.net/skin/${textureUrl.substring(textureUrl.lastIndexOf('/') + 1)}`;
    } else if (textureUrl.startsWith('http')) {
      finalUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(textureUrl)}`;
    }

    viewer.loadSkin(finalUrl).then(() => {
      const skin = viewer.playerObject.skin;
      const targets = PART_TARGETS[getTargetKey(avatarPart)] || PART_TARGETS.head;
      const allParts: Record<string, any> = {
        head: skin.head, hat: skin.hat,
        body: skin.body, jacket: skin.jacket,
        leftArm: skin.leftArm, rightArm: skin.rightArm,
        leftLeg: skin.leftLeg, rightLeg: skin.rightLeg,
        leftPants: skin.leftPants, rightPants: skin.rightPants,
      };
      Object.entries(allParts).forEach(([name, part]) => {
        if (part) part.visible = targets.includes(name);
      });

      // Enquadra automaticamente a(s) parte(s) visível(eis) no canvas
      const box = new THREE.Box3();
      Object.values(allParts).forEach(part => {
        if (part && part.visible) {
          part.updateMatrixWorld(true);
          box.expandByObject(part);
        }
      });
      const center = new THREE.Vector3();
      const size3 = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size3);
      const dist = Math.max(size3.x, size3.y, 0.4) / (2 * Math.tan(((viewer.camera.fov || 45) / 2) * Math.PI / 180));
      viewer.controls.target.set(center.x, center.y, center.z);
      viewer.camera.position.set(center.x, center.y, center.z + dist * 1.6);
      viewer.camera.lookAt(center);
      viewer.controls.update();
    }).catch((err) => console.error('Erro ao carregar skin:', err));

    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, [minecraftHeadValue, avatarPart, size]);

  return (
    <div style={{ width: size, height: size, position: 'relative', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {WEAPON_PARTS.has((avatarPart || '').toLowerCase()) ? (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.85rem', padding: '1rem' }}>
          A textura Minecraft se aplica ao corpo do personagem (cabeça, torso, braços, pernas). Não se aplica a armas/acessórios.
        </p>
      ) : (
        <canvas ref={canvasRef} style={{ width: size, height: size }} />
      )}
    </div>
  );
}