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
  /** Mantém este avatar SEMPRE animado (não libera o slot depois de capturar o snapshot).
   *  Use para o pódio (top 3) — assim as primeiras posições continuam animando. */
  alwaysAnimate?: boolean;
}

export default function LazyAnimatedAvatar({ id, config, equippedItems, size, animation = 'idle', faceCamera, alwaysAnimate = false }: LazyAnimatedAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasCaptureRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(snapshotCache.get(id) || null);
  const visibleRef = useRef(false);
  // Espelha o snapshot para o IntersectionObserver (evita closure com valor velho).
  const snapshotRef = useRef(snapshot);
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);

  // Capturar snapshot quando o avatar3D estiver renderizado. Retorna true se a captura
  // foi boa (canvas com conteúdo real). Só trocamos o avatar ao vivo pelo snapshot quando
  // a captura é boa — senão o avatar ficaria "apagado".
  const captureSnapshot = useCallback((): boolean => {
    if (!canvasCaptureRef.current) return false;
    const canvas = canvasCaptureRef.current.querySelector('canvas');
    if (!canvas || canvas.width === 0) return false;
    try {
      const t = document.createElement('canvas');
      t.width = canvas.width;
      t.height = canvas.height;
      const ctx = t.getContext('2d');
      if (!ctx) return false;
      ctx.drawImage(canvas, 0, 0);
      const px = ctx.getImageData(0, 0, t.width, t.height).data;
      let hasContent = false;
      for (let i = 3; i < px.length; i += 4) {
        if (px[i] > 0) { hasContent = true; break; }
      }
      if (!hasContent) return false;
      const url = canvas.toDataURL('image/png');
      snapshotCache.set(id, url);
      setSnapshot(url);
      return true;
    } catch {
      return false;
    }
  }, [id]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !visibleRef.current) {
          visibleRef.current = true;
          // Se já tem snapshot e não é "sempre animado", fica ESTÁTICO (sem criar novo
          // context WebGL) — evita o acúmulo/limite de contexts no vai-e-vem do scroll.
          if (snapshotRef.current && !alwaysAnimate) return;
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
  }, [id, alwaysAnimate]);

  // Captura o snapshot com tentativas: o skin/itens carregam de forma assíncrona, então a
// captura pode vir em branco no início. Tenta várias vezes; só troca para o snapshot (e
// libera o slot para o próximo, rotação justa) quando a captura tiver conteúdo real.
useEffect(() => {
  if (!isAnimating) return;
  let attempts = 0;
  const iv = setInterval(() => {
    attempts++;
    if (captureSnapshot()) {
      clearInterval(iv);
      if (!alwaysAnimate && pendingCallbacks.length > 0) {
        releaseSlot(id, () => setIsAnimating(false));
      }
    } else if (attempts >= 10) {
      clearInterval(iv); // desiste; mantém o avatar AO VIVO (melhor que ficar apagado)
    }
  }, 800);
  return () => clearInterval(iv);
}, [isAnimating, captureSnapshot, alwaysAnimate, id]);

  return (
    <div ref={containerRef} style={{ width: size, height: size, position: 'relative' }}>
      {isAnimating ? (
        <div ref={canvasCaptureRef} style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
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
        // Snapshot no MESMO tamanho do canvas (size × size×1.8), centralizado no círculo,
        // para o personagem aparecer completo, fora do círculo e sem ser recortado.
        <img
          src={snapshot}
          alt=""
          style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: size, height: size * 1.8, objectFit: 'contain' }}
        />
      ) : (
        // Aguardando slot/snapshot: mostra um placeholder leve (breve, até a rotação
        // capturar o snapshot). Sem context WebGL extra — evita o "quadrado branco".
        <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <span style={{ fontSize: size * 0.3, opacity: 0.5 }}>...</span>
        </div>
      )}
    </div>
  );
}
