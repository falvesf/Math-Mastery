import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { computeChestBaselineFit, computeChestSlide } from './CustomModelViewer';
import { isImageUrl } from '../lib/model3d';

interface InteractiveModelPreviewProps {
  modelUrl: string;
  size?: number;
  zoom: number;     // chestZoom (0.1..5)
  offsetX: number;  // chestOffsetX (fechado)
  offsetY: number;  // chestOffsetY (fechado)
  rotY: number;     // chestRotY (graus)
  open?: boolean;   // simular baú aberto
  openOffsetX?: number; // chestOpenOffsetX
  openOffsetY?: number; // chestOpenOffsetY
  swapSides?: boolean;  // chestSwapSides
  onZoomChange: (v: number) => void;
  onOffsetXChange: (v: number) => void;
  onOffsetYChange: (v: number) => void;
  onRotYChange: (v: number) => void;
}

const clampZoom = (v: number) => Math.max(0.1, Math.min(5, v));

// Renderiza o modelo com a MESMA transformação que a premiação usa
// (baseline fit + chestZoom + offsets + giro), câmera idêntica -> WYSIWYG.
function PreviewModel({ modelUrl, zoom, offsetX, offsetY, rotY, open, openOffsetX, openOffsetY, swapSides }: {
  modelUrl: string; zoom: number; offsetX: number; offsetY: number; rotY: number; open: boolean;
  openOffsetX?: number; openOffsetY?: number; swapSides?: boolean;
}) {
  const safeModelUrl = modelUrl.startsWith('/') && !modelUrl.startsWith('http')
    ? import.meta.env.BASE_URL + modelUrl.substring(1)
    : modelUrl;
  const { scene: originalScene, animations } = useGLTF(safeModelUrl);
  const scene = useMemo(() => originalScene.clone(), [originalScene]);
  const { actions, mixer } = useAnimations(animations, scene);
  const isChest = modelUrl.includes('chest');
  const hasOpenAnim = animations.some(a => /open/i.test(a.name));

  // Encaixe calculado UMA vez (estável, independente de giro/zoom em runtime)
  const { twoState, fit } = useMemo(() => {
    const slide = isChest && !hasOpenAnim ? computeChestSlide(originalScene) : null;
    return { twoState: slide, fit: computeChestBaselineFit(originalScene, slide, swapSides) };
  }, [originalScene, isChest, hasOpenAnim, swapSides]);

  // Baú com animação open de verdade: reproduz a abertura
  useEffect(() => {
    if (!hasOpenAnim) return;
    const action = actions['open'] || actions['OPEN'] || actions['Open'] || Object.values(actions)[0];
    if (!action) return;
    mixer.stopAllAction();
    if (open) {
      action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.1).play();
    }
  }, [open, hasOpenAnim, actions, mixer]);

  // Baú "de dois estados": deslize para mostrar o fechado ou o aberto (respeitando inverter lados)
  const slideX = twoState
    ? (open ? (swapSides ? twoState.closedX : twoState.openX) : (swapSides ? twoState.openX : twoState.closedX))
    : 0;
  // Posição X/Y separada para fechado/aberto
  const offX = open ? (openOffsetX ?? offsetX) : offsetX;
  const offY = open ? (openOffsetY ?? offsetY) : offsetY;
  const rotRad = ((((rotY % 360) + 360) % 360) * Math.PI) / 180;
  return (
    <group position={[offX, fit.posY + offY, 0]} scale={fit.scale * clampZoom(zoom)} rotation={[0, rotRad, 0]}>
      <group position={[slideX, 0, 0]}>
        <primitive object={scene} rotation={[0, Math.PI, 0]} />
      </group>
    </group>
  );
}

function PreviewCanvas({ modelUrl, zoom, offsetX, offsetY, rotY, open, openOffsetX, openOffsetY, swapSides, onZoomChange, onRotYChange }: {
  modelUrl: string; zoom: number; offsetX: number; offsetY: number; rotY: number; open: boolean;
  openOffsetX?: number; openOffsetY?: number; swapSides?: boolean;
  onZoomChange: (v: number) => void; onRotYChange: (v: number) => void;
}) {
  const dragRef = useRef<{ x: number; rot: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: e.clientX, rot: rotY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const newRot = dragRef.current.rot + dx * 0.5;
    onRotYChange(((newRot % 360) + 360) % 360);
  };
  const onPointerUp = () => { dragRef.current = null; };
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    onZoomChange(clampZoom(zoom * factor));
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
      style={{ width: '100%', height: '100%', cursor: 'grab', touchAction: 'none', position: 'relative' }}
    >
      <Canvas camera={{ position: [0, 3, 10], fov: 45 }} style={{ width: '100%', height: '100%' }}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 10, 5]} intensity={0.5} />
        <React.Suspense fallback={null}>
          <PreviewModel modelUrl={modelUrl} zoom={zoom} offsetX={offsetX} offsetY={offsetY} rotY={rotY} open={open} openOffsetX={openOffsetX} openOffsetY={openOffsetY} swapSides={swapSides} />
        </React.Suspense>
      </Canvas>
      <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center', fontSize: '0.6rem', color: 'var(--text-secondary)', pointerEvents: 'none' }}>
        Arraste p/ girar o objeto · scroll p/ zoom
      </div>
    </div>
  );
}

// @ts-ignore
export default function InteractiveModelPreview({ modelUrl, size = 200, zoom, offsetX, offsetY, rotY, open = false, openOffsetX, openOffsetY, swapSides = false, onZoomChange, onOffsetXChange, onOffsetYChange, onRotYChange }: InteractiveModelPreviewProps) {
  const circleBg = { background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)' };

  if (!modelUrl) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', ...circleBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Sem modelo</span>
      </div>
    );
  }

  if (isImageUrl(modelUrl)) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', ...circleBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={modelUrl}
          alt="Preview"
          style={{ width: `${100 * clampZoom(zoom)}%`, height: `${100 * clampZoom(zoom)}%`, objectFit: 'contain', transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rotY}deg)` }}
        />
      </div>
    );
  }

  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', ...circleBg, position: 'relative' }}>
      <PreviewCanvas modelUrl={modelUrl} zoom={zoom} offsetX={offsetX} offsetY={offsetY} rotY={rotY} open={open} openOffsetX={openOffsetX} openOffsetY={openOffsetY} swapSides={swapSides} onZoomChange={onZoomChange} onRotYChange={onRotYChange} />
    </div>
  );
}