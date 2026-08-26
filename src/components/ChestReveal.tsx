import { useEffect, useState } from 'react';
import CustomModelViewer from './CustomModelViewer';
import { fetchActiveChest, isImageUrl } from '../lib/model3d';
import { playChestAudio } from '../lib/audio';
import { useTenant } from '../contexts/TenantContext';

interface ChestRevealProps {
  onOpen: () => void;
  title?: string;
  subtitle?: string;
  chestModelUrl?: string;
  chestOpenUrl?: string;
  rarity?: string;
  chestScale?: number;
  chestZoom?: number;
  chestOffsetX?: number;
  chestOffsetY?: number;
  chestRotY?: number;
  chestOpenOffsetX?: number;
  chestOpenOffsetY?: number;
  chestSwapSides?: boolean;
  chestAudioUrl?: string;
  chestAudioRate?: number;
  chestAudioStart?: number;
  chestAudioDuration?: number;
}

const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#4ade80',
  rare: '#60a5fa',
  epic: '#c084fc',
  legendary: '#fbbf24',
};

export default function ChestReveal({ onOpen, title = "Baú de Recompensas", subtitle = "Clique no baú para abri-lo!", chestModelUrl, chestOpenUrl, rarity, chestScale = 1, chestZoom, chestOffsetX, chestOffsetY, chestRotY, chestOpenOffsetX, chestOpenOffsetY, chestSwapSides, chestAudioUrl, chestAudioRate, chestAudioStart, chestAudioDuration }: ChestRevealProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const { tenantId } = useTenant();

  // Baú padrão cadastrado em Moldes 3D > Baús de Recompensa (is_active).
  // Usado como fallback quando nenhum baú específico foi passado — substitui o minecraft_chest.glb fixo.
  const [defaultChest, setDefaultChest] = useState<{ url: string; open_url?: string; rarity?: string; chestScale?: number; chestZoom?: number; chestOffsetX?: number; chestOffsetY?: number; chestRotY?: number; chestOpenOffsetX?: number; chestOpenOffsetY?: number; chestSwapSides?: boolean; chestAudioUrl?: string; chestAudioRate?: number; chestAudioStart?: number; chestAudioDuration?: number } | null>(null);
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
  const resolvedChestScale = chestScale * (defaultChest?.chestScale ?? 1);
  const resolvedZoom = chestZoom ?? defaultChest?.chestZoom ?? 1;
  const resolvedOffsetX = chestOffsetX ?? defaultChest?.chestOffsetX ?? 0;
  const resolvedOffsetY = chestOffsetY ?? defaultChest?.chestOffsetY ?? 0;
  const resolvedRotY = chestRotY ?? defaultChest?.chestRotY ?? 0;
  const resolvedOpenOffsetX = chestOpenOffsetX ?? defaultChest?.chestOpenOffsetX ?? undefined;
  const resolvedOpenOffsetY = chestOpenOffsetY ?? defaultChest?.chestOpenOffsetY ?? undefined;
  const resolvedSwapSides = chestSwapSides ?? defaultChest?.chestSwapSides ?? false;
  const resolvedAudioUrl = chestAudioUrl || defaultChest?.chestAudioUrl || '';
  const resolvedAudioRate = chestAudioRate ?? defaultChest?.chestAudioRate ?? 1;
  const resolvedAudioStart = chestAudioStart ?? defaultChest?.chestAudioStart ?? 0;
  const resolvedAudioDuration = chestAudioDuration ?? defaultChest?.chestAudioDuration ?? 0;

  const usePngChest = resolvedUrl ? isImageUrl(resolvedUrl) : false;
  const displayUrl = resolvedOpenUrl && isOpen ? resolvedOpenUrl : resolvedUrl;

  const rarityColor = resolvedRarity ? (RARITY_COLORS[resolvedRarity] || '#fbbf24') : 'var(--gold-primary)';

  // Som de abertura: usa o áudio personalizado do baú (com velocidade/corte);
  // senão, um "pop" curto padrão.
  const playOpenSound = () => {
    if (resolvedAudioUrl) {
      playChestAudio(resolvedAudioUrl, resolvedAudioRate, resolvedAudioStart, resolvedAudioDuration);
      return;
    }
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const playTone = (freq: number, start: number, dur: number, vol = 0.4) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0, audioCtx.currentTime + start);
        gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + start + dur * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + dur);
        osc.start(audioCtx.currentTime + start);
        osc.stop(audioCtx.currentTime + start + dur);
      };
      // "Abriu o baú": duas notas rápidas ascendentes
      playTone(523.25, 0, 0.15, 0.35); // C5
      playTone(783.99, 0.15, 0.25, 0.4); // G5
    } catch (e) {
      console.error("Audio API not supported");
    }
  };

  // O círculo externo cresce junto com a escala do baú (antes ficava fixo em 180px
  // e cortava o baú quando o tamanho aumentava). Limite = caber na tela.
  const viewportCap = Math.min(window.innerWidth - 32, window.innerHeight - 32);
  const boxSize = Math.max(120, Math.min(520, viewportCap, 180 * resolvedChestScale));
  const innerSize = Math.max(80, boxSize - 32);

  const handleOpen = () => {
    if (isOpen || isOpening) return;
    setIsOpening(true);
    setIsOpen(true);
    playOpenSound();
    
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
          width: boxSize,
          height: boxSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        }}
        className={!isOpen ? 'hover-pulse' : ''}
      >
        {usePngChest ? (
            <div style={{ width: innerSize, height: innerSize, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={displayUrl || resolvedUrl}
                alt="Baú"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  transform: isOpening ? 'scale(1.15)' : 'scale(1)',
                  transition: 'transform 0.3s ease-out',
                  animation: isOpen ? 'chestOpen 0.6s ease-out' : 'none',
                }}
              />
            </div>
          ) : (
            <div style={{ width: innerSize, height: innerSize }}>
              <CustomModelViewer 
                modelUrl={resolvedUrl}
                animation={isOpen ? 'open' : 'none'}
                size={innerSize}
                chestZoom={resolvedZoom}
                chestOffsetX={resolvedOffsetX}
                chestOffsetY={resolvedOffsetY}
                chestRotY={resolvedRotY}
                chestOpenOffsetX={resolvedOpenOffsetX}
                chestOpenOffsetY={resolvedOpenOffsetY}
                chestSwapSides={resolvedSwapSides}
              />
            </div>
          )}
      </div>
    </div>
  );
}