import React from 'react';

export interface FloatingDamageData {
  id: string | number;
  damage: number;
  isCrit: boolean;
  isCritical?: boolean;
  target: 'monster' | 'player';
  isMiss?: boolean;
  isEvasion?: boolean;
  x?: number; // % horizontal na arena
  y?: number; // % vertical na arena
}

export interface FloatingDamageNumberProps {
  id?: string | number;
  damage?: number;
  isCrit?: boolean;
  isCritical?: boolean;
  target?: 'monster' | 'player';
  isMiss?: boolean;
  isEvasion?: boolean;
  x?: number; // % horizontal na arena
  y?: number; // % vertical na arena
  onComplete?: (id: string | number) => void;
  data?: FloatingDamageData;
}

export const FloatingDamageNumber: React.FC<FloatingDamageNumberProps> = (props) => {
  const d = props.data || props;
  const damage = d.damage ?? 0;
  const isCrit = d.isCritical ?? d.isCrit ?? false;
  const target = d.target || 'monster';
  const isMiss = d.isEvasion ?? d.isMiss ?? false;
  const x = d.x;
  const y = d.y;

  React.useEffect(() => {
    const itemKey = props.id || props.data?.id;
    if (props.onComplete && itemKey !== undefined) {
      const timer = setTimeout(() => {
        props.onComplete!(itemKey);
      }, 1100);
      return () => clearTimeout(timer);
    }
  }, [props.id, props.data?.id, props.onComplete]);

  // Posição padrão baseada no alvo se não fornecida
  // Monstro fica à direita (~72%), jogador à esquerda (~24%)
  const posX = x !== undefined ? x : (target === 'monster' ? 72 : 24);
  const posY = y !== undefined ? y : 50;

  if (isMiss) {
    return (
      <div
        className="floating-damage-pop"
        style={{
          left: `${posX}%`,
          top: `${posY}%`,
          color: '#38bdf8',
          fontSize: '1.6rem',
          letterSpacing: '1px',
        }}
      >
        <span>💨 ESQUIVOU!</span>
      </div>
    );
  }

  // Estilização baseada em quem foi golpeado e se foi crítico
  const isMonsterHit = target === 'monster';

  return (
    <div
      className={`floating-damage-pop ${isCrit ? 'is-critical' : ''}`}
      style={{
        left: `${posX}%`,
        top: `${posY}%`,
        color: isCrit
          ? '#fff066'
          : isMonsterHit
          ? '#fbbf24'
          : '#ef4444',
        fontSize: isCrit ? '2.8rem' : '2.1rem',
        filter: isCrit ? 'drop-shadow(0 0 15px rgba(245, 158, 11, 0.9))' : 'none',
      }}
    >
      {isCrit && (
        <span
          style={{
            fontSize: '0.85rem',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: '#fff',
            background: isMonsterHit
              ? 'linear-gradient(90deg, #dc2626, #f59e0b)'
              : 'linear-gradient(90deg, #991b1b, #ef4444)',
            padding: '2px 8px',
            borderRadius: '12px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.7)',
            marginBottom: '-4px',
            border: '1px solid rgba(255,255,255,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          💥 CRÍTICO! (2x)
        </span>
      )}
      <span style={{ display: 'flex', alignItems: 'center', lineHeight: 1 }}>
        -{damage}
      </span>
    </div>
  );
};

export default FloatingDamageNumber;
