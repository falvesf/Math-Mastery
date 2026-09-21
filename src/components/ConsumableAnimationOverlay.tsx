import React, { useEffect, useState } from 'react';
import type { ConsumableAnimPreset } from '../lib/consumableEffects';
import { playMagicZapSound, playImpactShatterSound } from '../lib/audioBank';

export interface ConsumableActiveAnim {
  id: string;
  presetId: ConsumableAnimPreset;
  category: 'aura' | 'eating' | 'projectile_strike' | 'special';
  primaryColor: string;
  secondaryColor: string;
  glowColor: string;
  scale: number;
  itemTitle?: string;
  itemImageUrl?: string;
  targetOptionIndex?: number;
  targetOptionRect?: { x: number; y: number; width: number; height: number } | null;
  playerPos?: { x: number; y: number } | null;
  onImpact?: () => void;
}

interface Props {
  anim: ConsumableActiveAnim | null;
  onComplete?: () => void;
}

export const ConsumableAnimationOverlay: React.FC<Props> = ({ anim, onComplete }) => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'idle' | 'intro' | 'travel' | 'impact'>('idle');
  const [impactPos, setImpactPos] = useState<{ x: number; y: number } | null>(null);
  const [targetOffset, setTargetOffset] = useState<{ dx: number; dy: number }>({ dx: -300, dy: 50 });

  useEffect(() => {
    if (!anim) {
      setPhase('idle');
      return;
    }

    if (anim.category === 'projectile_strike') {
      setPhase('intro'); // Chá fumegante
      
      // Pré-calcula posição do botão de opção de destino e do jogador
      if (anim.targetOptionIndex !== undefined) {
        const btn = document.getElementById(`quest-opt-${anim.targetOptionIndex}`);
        if (btn) {
          const btnRect = btn.getBoundingClientRect();
          const rootRect = rootRef.current?.getBoundingClientRect();
          const startX = rootRect ? (rootRect.left + rootRect.width / 2) : (window.innerWidth * 0.75);
          const startY = rootRect ? (rootRect.bottom - 110) : (window.innerHeight * 0.45);
          const dx = (btnRect.left + btnRect.width / 2) - startX;
          const dy = (btnRect.top + btnRect.height / 2) - startY;
          setTargetOffset({ dx, dy });
          setImpactPos({ x: btnRect.left + btnRect.width / 2, y: btnRect.top + btnRect.height / 2 });
        }
      }

      const t1 = setTimeout(() => {
        setPhase('travel'); // Projétil viaja
        playMagicZapSound();
      }, 650);

      const t2 = setTimeout(() => {
        setPhase('impact'); // Colisão na opção
        playImpactShatterSound();
        if (anim.onImpact) anim.onImpact();
      }, 1150);

      const t3 = setTimeout(() => {
        if (onComplete) onComplete();
      }, 2200);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    } else {
      setPhase('intro');
      const timer = setTimeout(() => {
        if (onComplete) onComplete();
      }, anim.presetId === 'aura_gold' ? 2500 : 2000);
      return () => clearTimeout(timer);
    }
  }, [anim?.id]);

  if (!anim) return null;

  const styleVars = {
    '--aura-primary': anim.primaryColor,
    '--aura-secondary': anim.secondaryColor,
    '--aura-glow': anim.glowColor,
    '--aura-scale': anim.scale,
  } as React.CSSProperties;

  return (
    <div key={anim.id} ref={rootRef} className="consumable-fx-root" style={styleVars} aria-hidden="true">
      {/* 1. EFEITO DE AURA MÁGICA (Poção Rosada, Elixir Dourado, Escudo, etc.) */}
      {anim.category === 'aura' && (
        <div className="consumable-aura-wrap">
          {/* Brilho radial no chão */}
          <div className="consumable-ground-glow" />

          {/* Anéis radiantes concêntricos */}
          <div className="consumable-ring ring-primary" />
          <div className="consumable-ring ring-secondary" />
          <div className="consumable-ring ring-pulse" />

          {/* Coluna de luz ascendente */}
          <div className="consumable-light-pillar" />

          {/* Partículas e estrelas cintilantes */}
          <div className="consumable-particles">
            <span className="c-particle cp-1" style={{ left: '15%', animationDelay: '0s' }}>
              {anim.presetId === 'aura_rosy' ? '💖' : anim.presetId === 'aura_gold' ? '🌟' : '✦'}
            </span>
            <span className="c-particle cp-2" style={{ left: '75%', animationDelay: '0.15s' }}>
              {anim.presetId === 'aura_rosy' ? '✦' : anim.presetId === 'aura_gold' ? '✨' : '✧'}
            </span>
            <span className="c-particle cp-3" style={{ left: '30%', animationDelay: '0.3s' }}>
              {anim.presetId === 'aura_rosy' ? '✧' : anim.presetId === 'aura_gold' ? '✦' : '✦'}
            </span>
            <span className="c-particle cp-4" style={{ left: '65%', animationDelay: '0.45s' }}>
              {anim.presetId === 'aura_rosy' ? '💖' : anim.presetId === 'aura_gold' ? '🌟' : '✦'}
            </span>
            <span className="c-particle cp-5" style={{ left: '48%', animationDelay: '0.2s' }}>
              {anim.presetId === 'aura_rosy' ? '✦' : anim.presetId === 'aura_gold' ? '✨' : '✧'}
            </span>
            <span className="c-particle cp-6" style={{ left: '22%', animationDelay: '0.6s' }}>
              {anim.presetId === 'aura_rosy' ? '✧' : anim.presetId === 'aura_gold' ? '🌟' : '✦'}
            </span>
            <span className="c-particle cp-7" style={{ left: '82%', animationDelay: '0.4s' }}>
              {anim.presetId === 'aura_rosy' ? '💖' : anim.presetId === 'aura_gold' ? '✦' : '✧'}
            </span>
          </div>

          {/* Texto flutuante de recuperação */}
          <div className="consumable-float-badge">
            {anim.presetId === 'aura_rosy' && '+1 HP 💖'}
            {anim.presetId === 'aura_gold' && 'HP MÁXIMO! 🌟'}
            {anim.presetId === 'shield_burst' && 'ESCUDO ATIVADO! 🛡️'}
            {anim.presetId === 'cleanse_cure' && 'PURIFICADO! 🧪'}
            {anim.presetId === 'custom_aura' && 'ENERGIA RESTAURADA! ✦'}
          </div>
        </div>
      )}

      {/* 2. EFEITO DE COMER ALIMENTO (Carne / Comida) */}
      {anim.category === 'eating' && (
        <div className="consumable-eat-wrap">
          <div className="eating-food-actor">
            {anim.itemImageUrl ? (
              <img src={anim.itemImageUrl} alt="" className="eating-food-img" />
            ) : (
              <span className="eating-food-emoji">🍖</span>
            )}
            {/* Migalhas saltando durante a mastigação */}
            <span className="crumb c-1" />
            <span className="crumb c-2" />
            <span className="crumb c-3" />
            <span className="crumb c-4" />
            <span className="crumb c-5" />
          </div>

          {/* Brilho e cura ao engolir */}
          <div className="eating-chew-glow" />
          <div className="consumable-float-badge eat-badge">+1 HP 💚</div>
        </div>
      )}

      {/* 3. EFEITO DE CHÁ CALMANTE + RAIO ELIMINADOR DE ALTERNATIVA */}
      {anim.category === 'projectile_strike' && (
        <div className="consumable-tea-strike-wrap">
          {/* Fase 1: Xícara de chá fumegante com vapor e halo sereno */}
          {(phase === 'intro' || phase === 'travel') && (
            <div className="tea-drinking-actor">
              <div className="tea-cup-glow" />
              <div className="tea-cup-item">
                <span className="tea-cup-emoji">🍵</span>
                <span className="tea-steam s-1">♨</span>
                <span className="tea-steam s-2">♨</span>
                <span className="tea-steam s-3">♨</span>
              </div>
              <div className="tea-calm-badge">Serenidade... 🍵</div>
            </div>
          )}

          {/* Fase 2: Projétil / Faísca mágica disparada contra a opção errada */}
          {phase === 'travel' && (
            <div
              className="magic-strike-projectile"
              style={{
                '--target-x': `${targetOffset.dx}px`,
                '--target-y': `${targetOffset.dy}px`,
              } as React.CSSProperties}
            >
              <div className="projectile-core">⚡</div>
              <div className="projectile-trail" />
            </div>
          )}

          {/* Fase 3: Explosão de impacto na alternativa */}
          {phase === 'impact' && (
            <div
              className="option-impact-burst"
              style={
                impactPos
                  ? { position: 'fixed', left: `${impactPos.x}px`, top: `${impactPos.y}px`, zIndex: 9999 }
                  : { position: 'absolute', left: '35%', top: '50%' }
              }
            >
              <div className="impact-flash" />
              <div className="impact-shards">
                <span className="shard sh-1">💥</span>
                <span className="shard sh-2">❌</span>
                <span className="shard sh-3">⚡</span>
                <span className="shard sh-4">✨</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. EFEITO DE AMPULHETA (Tempo) */}
      {anim.category === 'special' && anim.presetId === 'hourglass_spin' && (
        <div className="consumable-hourglass-wrap">
          <div className="hourglass-actor">
            <span className="hourglass-icon">⏳</span>
            <div className="hourglass-sand-ring" />
          </div>
          <div className="consumable-float-badge time-badge">+30s ⏱️</div>
        </div>
      )}
    </div>
  );
};

export default ConsumableAnimationOverlay;
