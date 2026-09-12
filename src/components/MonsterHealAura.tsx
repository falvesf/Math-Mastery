import React from 'react';

/**
 * MonsterHealAura
 * Efeito visual mágica de cura estilo JRPG:
 * - Círculos e anéis radiantes concêntricos na base/chão (sem bordas retangulares)
 * - Coluna de luz etérea verde água ascendente
 * - Partículas e estrelas cintilantes flutuando para o alto
 */
export const MonsterHealAura: React.FC = () => {
  return (
    <div className="monster-heal-aura" aria-hidden="true">
      {/* 1. Brilho radial no chão aos pés do monstro (suave, sem bordas) */}
      <div className="heal-ground-glow" />

      {/* 2. Anéis circulares radiantes no chão (estilo magia RPG, expandindo suavemente) */}
      <div className="heal-ring heal-ring-primary" />
      <div className="heal-ring heal-ring-secondary" />
      <div className="heal-ring heal-ring-pulse" />

      {/* 3. Coluna de luz vertical ascendente em degradê verde água */}
      <div className="heal-light-pillar" />

      {/* 4. Estrelas / partículas mágicas cintilantes subindo */}
      <div className="heal-particles">
        <span className="heal-particle hp-1" style={{ left: '15%', animationDelay: '0s' }}>✦</span>
        <span className="heal-particle hp-2" style={{ left: '80%', animationDelay: '0.2s' }}>✧</span>
        <span className="heal-particle hp-3" style={{ left: '30%', animationDelay: '0.4s' }}>✦</span>
        <span className="heal-particle hp-4" style={{ left: '70%', animationDelay: '0.6s' }}>✦</span>
        <span className="heal-particle hp-5" style={{ left: '50%', animationDelay: '0.3s' }}>✧</span>
        <span className="heal-particle hp-6" style={{ left: '20%', animationDelay: '0.7s' }}>✦</span>
        <span className="heal-particle hp-7" style={{ left: '85%', animationDelay: '0.5s' }}>✧</span>
        <span className="heal-particle hp-8" style={{ left: '40%', animationDelay: '0.8s' }}>✦</span>
      </div>
    </div>
  );
};

export default MonsterHealAura;
