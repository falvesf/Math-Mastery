// @ts-ignore
import React from 'react';

interface DamageEffectOverlayProps {
  /** Efeito ativo (burn, freeze, impact, electric, poison, none) */
  effect: string;
  /** Intensidade (nº de acertos) — efeitos persistentes crescem com ela */
  level: number;
  /** Disparo de impacto na hora do golpe (flash/onda de choque) */
  justHit?: boolean;
  /** Congelado (efeito de gelo após N acertos) */
  frozen?: boolean;
  /** Piscada vermelha de drenagem (veneno/sangramento) */
  drainBlink?: boolean;
}

/**
 * Overlays visuais dos efeitos especiais aplicados no oponente em combate.
 * Renderiza apenas as camadas do efeito ativo; o efeito 'none' não mostra nada.
 */
export default function DamageEffectOverlay({ effect, level, justHit = false, frozen = false, drainBlink = false }: DamageEffectOverlayProps) {
  const lvl = Math.max(0, Math.min(5, level));

  // Efeitos só aparecem APÓS o primeiro dano sofrido pelo oponente
  if (!effect || effect === 'none' || level <= 0) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none', overflow: 'visible' }}>
      {/* FOGO — chamas persistentes + tint que derrete (fica mais intenso com os acertos) */}
      {effect === 'burn' && (
        <>
          <div className={`de-burn-tint de-lvl-${lvl}`} />
          <div className={`de-burn-glow de-lvl-${lvl}`} />
          <div className="de-fire" style={{ opacity: Math.min(1, 0.45 + lvl * 0.11), height: `${32 + lvl * 12}%` }}>
            {Array.from({ length: 6 + lvl * 3 }).map((_, i) => (
              <span key={i} className="de-flame" style={{ left: `${6 + (i * 12) % 86}%`, height: `${28 + lvl * 7 + (i % 3) * 8}px`, animationDelay: `${(i % 5) * 0.16}s`, animationDuration: `${0.5 + (i % 3) * 0.2}s` }} />
            ))}
          </div>
        </>
      )}

      {/* GELO — camada de gelo crescente; congela totalmente no nível máximo */}
      {effect === 'freeze' && (
        <>
          <div className={`de-frost de-lvl-${lvl}`} />
          {frozen && <div className="de-frozen-block"><span>❄️</span></div>}
          {!frozen && <div className="de-ice-shards"><span>❄</span></div>}
        </>
      )}

      {/* VENENO — tint verde crescente + névoa tóxica */}
      {effect === 'poison' && (
        <>
          <div className={`de-poison-tint de-lvl-${lvl}`} />
          <div className={`de-poison-glow de-lvl-${lvl}`} />
          <div className="de-poison-bubbles" style={{ opacity: Math.min(1, 0.3 + lvl * 0.12) }}>
            {Array.from({ length: 5 + lvl * 2 }).map((_, i) => (
              <span key={i} className="de-bubble" style={{ left: `${10 + (i * 17) % 80}%`, animationDelay: `${(i % 4) * 0.35}s` }} />
            ))}
          </div>
        </>
      )}

      {/* SANGRAMENTO — tint vermelha + gotejamento de sangue */}
      {effect === 'bleed' && (
        <>
          <div className={`de-bleed-tint de-lvl-${lvl}`} />
          <div className={`de-bleed-glow de-lvl-${lvl}`} />
          <div className="de-blood" style={{ opacity: Math.min(1, 0.3 + lvl * 0.13) }}>
            {Array.from({ length: 5 + lvl * 2 }).map((_, i) => (
              <span key={i} className="de-drop" style={{ left: `${12 + (i * 18) % 76}%`, animationDelay: `${(i % 4) * 0.3}s` }} />
            ))}
          </div>
        </>
      )}

      {/* ESTRONDO — onda de choque + flash + tremor (hematomas grandes são feitos pelo bruise) */}
      {effect === 'impact' && justHit && (
        <>
          <div className="de-impact-flash" />
          <div className="de-shockwave">
            <span className="de-ring" />
            <span className="de-ring de-ring-2" />
            <span className="de-ring de-ring-3" />
          </div>
          <div className="de-shake" />
        </>
      )}

      {/* ELÉTRICO — faíscas na hora do impacto */}
      {effect === 'electric' && justHit && (
        <div className="de-electric">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="de-zap" style={{ left: `${15 + (i * 10) % 70}%`, top: `${15 + (i * 23) % 60}%`, transform: `rotate(${(i * 40) % 180}deg)`, animationDelay: `${(i % 3) * 0.05}s` }}>⚡</span>
          ))}
        </div>
      )}

      {/* Piscada de drenagem (veneno/sangramento) */}
      {drainBlink && <div className="de-drain-blink" />}
    </div>
  );
}