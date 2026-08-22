import { useState } from 'react';
import CustomModelViewer from './CustomModelViewer';
import { isImageUrl } from '../lib/model3d';

interface ChestRevealProps {
  onOpen: () => void;
  title?: string;
  subtitle?: string;
  chestModelUrl?: string;
  chestOpenUrl?: string;
  rarity?: string;
}

const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#4ade80',
  rare: '#60a5fa',
  epic: '#c084fc',
  legendary: '#fbbf24',
};

export default function ChestReveal({ onOpen, title = "Baú de Recompensas", subtitle = "Clique no baú para abri-lo!", chestModelUrl, chestOpenUrl, rarity }: ChestRevealProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

  const usePngChest = chestModelUrl ? isImageUrl(chestModelUrl) : false;
  const displayUrl = chestOpenUrl && isOpen ? chestOpenUrl : chestModelUrl;

  const rarityColor = rarity ? (RARITY_COLORS[rarity] || '#fbbf24') : 'var(--gold-primary)';

  const handleOpen = () => {
    if (isOpen || isOpening) return;
    setIsOpening(true);
    setIsOpen(true);
    
    // O tempo de animação de abrir do bau
    setTimeout(() => {
      setIsOpening(false);
      onOpen();
    }, 1500); // 1.5s delay for animation to play
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '2rem'
    }}>
      <h2 style={{
        fontSize: '2rem',
        fontWeight: 'bold',
        color: rarityColor,
        textShadow: `0 2px 4px rgba(0,0,0,0.5)`,
        marginBottom: '0.5rem',
        animation: 'pulse 2s infinite'
      }}>
        {title}
      </h2>
      <p style={{
        color: 'var(--text-secondary)',
        fontSize: '1.2rem',
        marginBottom: '2rem'
      }}>
        {subtitle}
      </p>

      <div 
        onClick={handleOpen}
        style={{
          cursor: isOpen ? 'default' : 'pointer',
          transform: isOpening ? 'scale(1.1)' : 'scale(1)',
          transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          background: `radial-gradient(circle, ${rarityColor}33 0%, transparent 70%)`,
          borderRadius: '50%',
          padding: '1rem',
          width: '180px',
          height: '180px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        }}
        className={!isOpen ? 'hover-pulse' : ''}
      >
        {chestModelUrl ? (
          usePngChest ? (
            <div style={{ width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={displayUrl || chestModelUrl}
                alt="Baú"
                style={{
                  maxWidth: '120px',
                  maxHeight: '120px',
                  objectFit: 'contain',
                  transform: isOpening ? 'scale(1.15)' : 'scale(1)',
                  transition: 'transform 0.3s ease-out',
                  animation: isOpen ? 'chestOpen 0.6s ease-out' : 'none',
                }}
              />
            </div>
          ) : (
            <div style={{ maxWidth: '120px', maxHeight: '120px' }}>
              <CustomModelViewer 
                modelUrl={chestModelUrl}
                animation={isOpen ? 'open' : 'none'}
                size={120}
              />
            </div>
          )
        ) : (
          <div style={{ maxWidth: '120px', maxHeight: '120px' }}>
            <CustomModelViewer 
              modelUrl="/models/minecraft_chest.glb"
              animation={isOpen ? 'open' : 'none'}
              size={120}
            />
          </div>
        )}
      </div>
    </div>
  );
}