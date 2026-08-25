import { useEffect, useState } from 'react';
import CustomModelViewer from './CustomModelViewer';
import { fetchActiveChest, isImageUrl } from '../lib/model3d';
import { useTenant } from '../contexts/TenantContext';

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
  const { tenantId } = useTenant();

  // Baú padrão cadastrado em Moldes 3D > Baús de Recompensa (is_active).
  // Usado como fallback quando nenhum baú específico foi passado — substitui o minecraft_chest.glb fixo.
  const [defaultChest, setDefaultChest] = useState<{ url: string; open_url?: string; rarity?: string } | null>(null);
  useEffect(() => {
    if (chestModelUrl) return;
    let mounted = true;
    fetchActiveChest(tenantId).then(chest => {
      if (mounted && chest) setDefaultChest(chest);
    });
    return () => { mounted = false; };
  }, [chestModelUrl, tenantId]);

  const resolvedUrl = chestModelUrl || defaultChest?.url || '/models/minecraft_chest.glb';
  const resolvedOpenUrl = chestOpenUrl || defaultChest?.open_url || undefined;
  const resolvedRarity = rarity || defaultChest?.rarity;

  const usePngChest = resolvedUrl ? isImageUrl(resolvedUrl) : false;
  const displayUrl = resolvedOpenUrl && isOpen ? resolvedOpenUrl : resolvedUrl;

  const rarityColor = resolvedRarity ? (RARITY_COLORS[resolvedRarity] || '#fbbf24') : 'var(--gold-primary)';

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
        {usePngChest ? (
            <div style={{ width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={displayUrl || resolvedUrl}
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
                modelUrl={resolvedUrl}
                animation={isOpen ? 'open' : 'none'}
                size={120}
              />
            </div>
          )}
      </div>
    </div>
  );
}