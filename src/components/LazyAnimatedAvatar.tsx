import { useEffect, useRef, useState, useCallback } from 'react';
import AvatarCharacter, { type AvatarConfig } from './AvatarCharacter';

const MAX_ANIMATED = 8;

// Cache global de snapshots (id → dataURL)
const snapshotCache = new Map<string, string>();

// Estado global compartilhado entre TODAS as instâncias do componente na mesma página
const activeIds = new Set<string>();
const pendingCallbacks: Array<{ id: string; activate: () => void }> = [];

function tryActivate(id: string, activate: () => void) {
  if (activeIds.size < MAX_ANIMATED) {
    activeIds.add(id);
    activate();
  } else {
    pendingCallbacks.push({ id, activate });
  }
}

function releaseSlot(id: string, deactivate: () => void) {
  if (!activeIds.has(id)) {
    const idx = pendingCallbacks.findIndex(p => p.id === id);
    if (idx !== -1) pendingCallbacks.splice(idx, 1);
    return;
  }
  activeIds.delete(id);
  deactivate();
  if (pendingCallbacks.length > 0) {
    const next = pendingCallbacks.shift()!;
    activeIds.add(next.id);
    next.activate();
  }
}

interface LazyAnimatedAvatarProps {
  id: string;
  config: AvatarConfig;
  equippedItems: any[];
  size: number;
  animation?: string;
  faceCamera?: boolean;
}

export default function LazyAnimatedAvatar({ id, config, equippedItems, size, animation = 'idle', faceCamera }: LazyAnimatedAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasCaptureRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(snapshotCache.get(id) || null);
  const visibleRef = useRef(false);

  // Capturar snapshot quando o avatar3D estiver renderizado
  const captureSnapshot = useCallback(() => {
    if (!canvasCaptureRef.current) return;
    const canvas = canvasCaptureRef.current.querySelector('canvas');
    if (!canvas || canvas.width === 0) return;
    try {
      const url = canvas.toDataURL('image/png');
      snapshotCache.set(id, url);
      setSnapshot(url);
    } catch {}
  }, [id]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !visibleRef.current) {
          visibleRef.current = true;
          tryActivate(id, () => setIsAnimating(true));
        } else if (!entry.isIntersecting && visibleRef.current) {
          visibleRef.current = false;
          releaseSlot(id, () => setIsAnimating(false));
        }
      },
      { threshold: 0.1, rootMargin: '50px' }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (visibleRef.current) {
        releaseSlot(id, () => {});
        visibleRef.current = false;
      }
    };
  }, [id]);

  // Quando o avatar3D aparece, capturar snapshot após um tempo
  useEffect(() => {
    if (!isAnimating) return;
    const timer = setTimeout(captureSnapshot, 1500);
    return () => clearTimeout(timer);
  }, [isAnimating, captureSnapshot]);

  return (
    <div ref={containerRef} style={{ width: size, height: size }}>
      {isAnimating ? (
        <div ref={canvasCaptureRef} style={{ width: size, height: size }}>
          <AvatarCharacter
            config={config}
            equippedItems={equippedItems}
            size={size}
            interactive={false}
            animation={animation as any}
            faceCamera={faceCamera}
            actionPoses={config.actionPoses}
          />
        </div>
      ) : snapshot ? (
        <img
          src={snapshot}
          alt=""
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: size * 0.3, opacity: 0.5 }}>...</span>
        </div>
      )}
    </div>
  );
}
