import React, { useState } from 'react';
import { Sparkles, Package } from 'lucide-react';

export interface DroppedBattleItem {
  id: string;
  itemId: string;
  title: string;
  imageUrl?: string;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'mestre' | 'legendary';
  x: number; // %
  y: number; // %
  dropData: any;
  createdAt: number;
}

interface LootBeamDropProps {
  drop: DroppedBattleItem;
  onCollect: (drop: DroppedBattleItem) => void;
}

const RARITY_THEMES: Record<
  string,
  { color: string; rgb: string; label: string; hasAura: boolean }
> = {
  common: {
    color: '#9ca3af',
    rgb: '156, 163, 175',
    label: 'Comum',
    hasAura: false,
  },
  uncommon: {
    color: '#10b981',
    rgb: '16, 185, 129',
    label: 'Incomum',
    hasAura: true,
  },
  rare: {
    color: '#3b82f6',
    rgb: '59, 130, 246',
    label: 'Raro',
    hasAura: true,
  },
  epic: {
    color: '#8b5cf6',
    rgb: '139, 92, 246',
    label: 'Épico',
    hasAura: true,
  },
  mestre: {
    color: '#ef4444',
    rgb: '239, 68, 68',
    label: 'Mestre',
    hasAura: true,
  },
  legendary: {
    color: '#f59e0b',
    rgb: '245, 158, 11',
    label: 'Lendário',
    hasAura: true,
  },
};

export const LootBeamDrop: React.FC<LootBeamDropProps> = ({ drop, onCollect }) => {
  const [pickingUp, setPickingUp] = useState(false);
  const theme = RARITY_THEMES[drop.rarity || 'common'] || RARITY_THEMES.common;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pickingUp) return;
    setPickingUp(true);
    onCollect(drop);
  };

  return (
    <div
      className={`loot-drop-container ${pickingUp ? 'picking-up' : ''}`}
      onClick={handleClick}
      title={`${drop.title} (${theme.label}) — Clique para coletar!`}
      style={
        {
          left: `${drop.x}%`,
          top: `${drop.y}%`,
          '--loot-color': theme.color,
          '--loot-glow': theme.hasAura ? `rgba(${theme.rgb}, 0.65)` : 'transparent',
          '--loot-rgb': theme.rgb,
        } as React.CSSProperties
      }
    >
      {/* Feixe Vertical de Luz (Aura) - NÃO aparece se for item Comum */}
      {theme.hasAura && (
        <div className="loot-beam-wrapper">
          {/* Brilho no chão */}
          <div className="loot-beam-ground" />

          {/* Halo difuso do feixe */}
          <div
            className="loot-beam-halo"
            style={{
              background: `linear-gradient(to top, rgba(${theme.rgb}, 0.8) 0%, rgba(${theme.rgb}, 0.35) 50%, transparent 100%)`,
            }}
          />

          {/* Núcleo ultra-brilhante do feixe */}
          <div
            className="loot-beam-core"
            style={{
              background: `linear-gradient(to top, #ffffff 0%, rgba(${theme.rgb}, 0.95) 45%, rgba(${theme.rgb}, 0.7) 80%, transparent 100%)`,
              boxShadow: `0 0 8px #ffffff, 0 0 16px ${theme.color}, 0 0 28px rgba(${theme.rgb}, 0.8)`,
            }}
          />

          {/* Partículas flutuantes ascendentes */}
          <div
            className="loot-particle"
            style={{
              left: '42%',
              bottom: '10px',
              width: '4px',
              height: '4px',
              background: '#ffffff',
              boxShadow: `0 0 6px ${theme.color}`,
              animationDuration: '2.1s',
              animationDelay: '0s',
            }}
          />
          <div
            className="loot-particle"
            style={{
              left: '55%',
              bottom: '15px',
              width: '5px',
              height: '5px',
              background: theme.color,
              boxShadow: `0 0 8px #ffffff`,
              animationDuration: '1.8s',
              animationDelay: '0.4s',
            }}
          />
          <div
            className="loot-particle"
            style={{
              left: '38%',
              bottom: '25px',
              width: '3px',
              height: '3px',
              background: '#ffffff',
              boxShadow: `0 0 5px ${theme.color}`,
              animationDuration: '2.4s',
              animationDelay: '0.9s',
            }}
          />
          <div
            className="loot-particle"
            style={{
              left: '60%',
              bottom: '5px',
              width: '4px',
              height: '4px',
              background: theme.color,
              boxShadow: `0 0 7px ${theme.color}`,
              animationDuration: '1.9s',
              animationDelay: '1.3s',
            }}
          />
        </div>
      )}

      {/* Caixa com o Ícone do Item no solo */}
      <div
        className="loot-item-box"
        style={{
          border: theme.hasAura ? `2px solid ${theme.color}` : '1px solid rgba(255,255,255,0.25)',
          boxShadow: theme.hasAura
            ? `0 0 14px rgba(${theme.rgb}, 0.7), inset 0 0 8px rgba(${theme.rgb}, 0.3)`
            : '0 4px 10px rgba(0,0,0,0.6)',
        }}
      >
        {drop.imageUrl ? (
          <img
            src={drop.imageUrl}
            alt={drop.title}
            style={{
              width: '30px',
              height: '30px',
              objectFit: 'contain',
              filter: theme.hasAura ? `drop-shadow(0 0 4px ${theme.color})` : 'none',
            }}
          />
        ) : (
          <Package
            size={20}
            color={theme.color}
            style={{ filter: theme.hasAura ? `drop-shadow(0 0 4px ${theme.color})` : 'none' }}
          />
        )}
      </div>

      {/* Etiqueta com Nome do Item e Raridade */}
      <div
        className="loot-item-name-badge"
        style={{
          borderColor: theme.hasAura ? theme.color : 'rgba(255,255,255,0.2)',
          color: theme.hasAura ? theme.color : '#e2e8f0',
          boxShadow: theme.hasAura
            ? `0 2px 8px rgba(0,0,0,0.7), 0 0 10px rgba(${theme.rgb}, 0.5)`
            : '0 2px 8px rgba(0,0,0,0.7)',
        }}
      >
        {theme.hasAura && <Sparkles size={11} style={{ flexShrink: 0 }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {drop.title}
        </span>
      </div>
    </div>
  );
};

export default LootBeamDrop;
