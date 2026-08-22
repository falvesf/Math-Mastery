import React from 'react';

interface NintendoHeartProps {
  fillPercentage: number; // 0 to 100
  size?: number;
  title?: string;
}

/**
 * Coração no estilo clássico Nintendo (Zelda / RPG):
 * Enche verticalmente de baixo para cima com efeito de preenchimento fluido e brilho.
 */
export default function NintendoHeart({ fillPercentage, size = 14, title }: NintendoHeartProps) {
  const clamped = Math.max(0, Math.min(100, fillPercentage));
  const isCharging = clamped > 0 && clamped < 100;
  const isFull = clamped >= 100;
  const isEmpty = clamped <= 0;

  // ID único para gradiente linear vertical baseado na porcentagem de preenchimento
  const gradId = React.useId ? React.useId().replace(/:/g, '') : `n-heart-${Math.round(clamped * 10)}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{
        overflow: 'visible',
        display: 'inline-block',
        verticalAlign: 'middle',
        filter: isFull 
          ? 'drop-shadow(0 0 3px rgba(239, 68, 68, 0.7))' 
          : isCharging 
            ? 'drop-shadow(0 0 5px rgba(239, 68, 68, 0.9))' 
            : 'none',
        transition: 'filter 0.3s ease'
      }}
    >
      {title && <title>{title}</title>}
      <defs>
        {/* Gradiente vertical de baixo para cima */}
        <linearGradient id={gradId} x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset={`${clamped}%`} stopColor="#ef4444" />
          <stop offset={`${clamped}%`} stopColor="transparent" />
        </linearGradient>
      </defs>

      {/* Contorno / Fundo do coração vazio */}
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        fill="rgba(0, 0, 0, 0.55)"
        stroke={isEmpty ? "rgba(255, 255, 255, 0.25)" : "rgba(239, 68, 68, 0.6)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Preenchimento líquido de baixo para cima */}
      {!isEmpty && (
        <path
          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
          fill={isFull ? "#ef4444" : `url(#${gradId})`}
          stroke="#ef4444"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={isCharging ? { animation: 'pulse 1.8s ease-in-out infinite' } : {}}
        />
      )}
    </svg>
  );
}
