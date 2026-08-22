import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import SkinBuffIcon from './SkinBuffIcon';
import CachedImage from './CachedImage';

// Decodifica o minecraftHeadValue (Base64 do Mojang ou URL direta) para a URL da textura
export function resolveSkinUrl(minecraftHeadValue?: string | null): string {
  if (!minecraftHeadValue) return '';
  const raw = minecraftHeadValue.trim();
  if (!raw) return '';
  if (raw.startsWith('http')) return raw;
  try {
    const decoded = JSON.parse(atob(raw));
    if (decoded.textures && decoded.textures.SKIN && decoded.textures.SKIN.url) {
      return decoded.textures.SKIN.url;
    }
  } catch (e) {
    // ignorar
  }
  return '';
}

// Aplica o proxy CORS para texturas do Minecraft
export function proxySkinUrl(textureUrl: string): string {
  if (textureUrl.includes('textures.minecraft.net/texture/')) {
    const hash = textureUrl.substring(textureUrl.lastIndexOf('/') + 1);
    return `https://mc-heads.net/skin/${hash}`;
  }
  if (textureUrl.startsWith('http')) {
    return `https://api.allorigins.win/raw?url=${encodeURIComponent(textureUrl)}`;
  }
  return textureUrl;
}

interface ItemIconProps {
  item: {
    imageUrl?: string;
    itemImageUrl?: string;
    gameModelUrl?: string;
    minecraftHeadValue?: string;
    unlockedSkinId?: string;
    gameEffect?: string;
  };
  size?: number;
  style?: React.CSSProperties;
}

/**
 * Ícone unificado de item:
 * 1. Se for buff de skin (unlock_skin com unlockedSkinId) -> SkinBuffIcon (esfera 2D)
 * 2. Se tiver imageUrl/itemImageUrl -> CachedImage
 * 3. Se tiver minecraftHeadValue -> esfera 2D com a face da skin (mesma lógica do SkinBuffIcon)
 * 4. Caso contrário -> placeholder (Package)
 */
export default function ItemIcon({ item, size = 64, style }: ItemIconProps) {
  const image = item.imageUrl || item.itemImageUrl || '';

  // Buff de skin (usa unlockedSkinId como URL da skin)
  if (item.gameEffect === 'unlock_skin' && item.unlockedSkinId) {
    return (
      <div style={{ width: size, height: size, flexShrink: 0 }}>
        <SkinBuffIcon skinUrl={item.unlockedSkinId} size={size} />
      </div>
    );
  }

  // Imagem normal
  if (image) {
    return <CachedImage src={image} style={{ width: size, height: size, borderRadius: 8, objectFit: 'cover', ...style }} />;
  }

  // Cabeça Minecraft (esfera 2D)
  if (item.minecraftHeadValue && item.minecraftHeadValue.trim() !== '') {
    return <MinecraftHeadIcon minecraftHeadValue={item.minecraftHeadValue} size={size} />;
  }

  // Placeholder
  return (
    <div style={{ width: size, height: size, borderRadius: 8, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...style }}>
      <Package size={size * 0.4} color="var(--text-secondary)" />
    </div>
  );
}

/**
 * Esfera 2D com a face da skin Minecraft (mesma estética do SkinBuffIcon).
 * Decodifica minecraftHeadValue -> URL da textura e recorta a face.
 */
export function MinecraftHeadIcon({ minecraftHeadValue, size = 64 }: { minecraftHeadValue: string; size?: number }) {
  const [faceUrl, setFaceUrl] = useState('');

  useEffect(() => {
    let isMounted = true;
    const url = resolveSkinUrl(minecraftHeadValue);
    if (!url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!isMounted) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          // Face base + overlay (capacete)
          ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8);
          ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);
          setFaceUrl(canvas.toDataURL('image/png'));
        }
      } catch (e) {
        console.error('Erro ao gerar face da skin:', e);
      }
    };
    img.onerror = () => {
      if (!isMounted) return;
      // Tentar com proxy CORS
      const proxied = proxySkinUrl(url);
      if (proxied !== url) {
        const img2 = new Image();
        img2.crossOrigin = 'anonymous';
        img2.onload = () => {
          if (!isMounted) return;
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 8;
            canvas.height = 8;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(img2, 8, 8, 8, 8, 0, 0, 8, 8);
              ctx.drawImage(img2, 40, 8, 8, 8, 0, 0, 8, 8);
              setFaceUrl(canvas.toDataURL('image/png'));
            }
          } catch (e) {
            console.error('Erro ao gerar face via proxy:', e);
          }
        };
        img2.onerror = () => {};
        img2.src = proxied;
      }
    };
    img.src = url;
    return () => { isMounted = false; };
  }, [minecraftHeadValue]);

  if (!faceUrl) {
    return (
      <div style={{ width: size, height: size, borderRadius: 8, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Package size={size * 0.4} color="var(--text-secondary)" />
      </div>
    );
  }

  // Esfera estilo SkinBuffIcon
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.2) 0%, rgba(0,0,0,0.4) 100%)',
      border: '2px solid rgba(255,255,255,0.3)',
      boxShadow: 'inset 0 0 15px rgba(255,255,255,0.1), 0 4px 10px rgba(0,0,0,0.5)',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      flexShrink: 0
    }}>
      <div style={{
        position: 'absolute',
        top: '5%',
        left: '15%',
        width: '40%',
        height: '20%',
        background: 'rgba(255,255,255,0.3)',
        borderRadius: '50%',
        transform: 'rotate(-25deg)',
        pointerEvents: 'none'
      }} />
      <div style={{
        width: size * 0.5,
        height: size * 0.5,
        overflow: 'hidden',
        position: 'relative',
        borderRadius: '4px',
        marginTop: '-15%',
        boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
        backgroundColor: '#000'
      }}>
        <img src={faceUrl} alt="" style={{ width: '100%', height: '100%', imageRendering: 'pixelated', objectFit: 'cover' }} />
      </div>
    </div>
  );
}