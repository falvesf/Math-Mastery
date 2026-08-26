import { useEffect, useRef } from 'react';

interface BattleTransitionProps {
  active: boolean;
  /** 'enter' = entra na batalha (fade-out revela a arena). 'exit' = sai da batalha (fica coberto até navegar) */
  direction?: 'enter' | 'exit';
  onComplete?: () => void;
  duration?: number;
}

/** Transição estilo Final Fantasy 7: 3 faixas horizontais varrem a tela + flash. */
export default function BattleTransition({ active, direction = 'enter', onComplete, duration }: BattleTransitionProps) {
  const fired = useRef(false);

  useEffect(() => {
    if (!active) { fired.current = false; return; }
    fired.current = false;
    const d = duration ?? (direction === 'exit' ? 950 : 1350);
    const t = setTimeout(() => { fired.current = true; onComplete?.(); }, d);
    return () => clearTimeout(t);
  }, [active, direction]);

  if (!active) return null;
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 999999, pointerEvents: 'auto', overflow: 'hidden', background: '#000' }}
      className={direction === 'exit' ? 'ff7-transition ff7-exit' : 'ff7-transition'}
    >
      <div className="ff7-strip ff7-strip-top" />
      <div className="ff7-strip ff7-strip-mid" />
      <div className="ff7-strip ff7-strip-bot" />
      <div className="ff7-flash" />
    </div>
  );
}