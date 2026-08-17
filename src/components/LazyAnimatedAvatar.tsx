import { useEffect, useRef, useState } from 'react';
import AvatarCharacter, { type AvatarConfig } from './AvatarCharacter';

const MAX_ANIMATED = 8;

// Estado global compartilhado entre TODAS as instâncias do componente na mesma página
const activeIds = new Set<string>();
const pendingCallbacks: Array<{ id: string; activate: () => void }> = [];

function tryActivate(id: string, activate: () => void) {
  if (activeIds.size < MAX_ANIMATED) {
    activeIds.add(id);
    activate();
  } else {
    // Ainda não há slot livre: entra na fila
    pendingCallbacks.push({ id, activate });
  }
}

function releaseSlot(id: string, deactivate: () => void) {
  if (!activeIds.has(id)) {
    // Pode estar na fila pendente — remove da fila sem precisar liberar slot
    const idx = pendingCallbacks.findIndex(p => p.id === id);
    if (idx !== -1) pendingCallbacks.splice(idx, 1);
    return;
  }
  activeIds.delete(id);
  deactivate();
  // Libera o próximo da fila de espera
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
}

export default function LazyAnimatedAvatar({ id, config, equippedItems, size, animation = 'idle' }: LazyAnimatedAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  // Rastreia se este componente está registrado como "visível"
  const visibleRef = useRef(false);

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
      // Ao desmontar, libera o slot se estava ativo
      if (visibleRef.current) {
        releaseSlot(id, () => {});
        visibleRef.current = false;
      }
    };
  }, [id]);

  return (
    <div ref={containerRef} style={{ width: size, height: size }}>
      {isAnimating ? (
        <AvatarCharacter
          config={config}
          equippedItems={equippedItems}
          size={size}
          interactive={false}
          animation={animation as any}
        />
      ) : (
        <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: size * 0.3, opacity: 0.5 }}>...</span>
        </div>
      )}
    </div>
  );
}
