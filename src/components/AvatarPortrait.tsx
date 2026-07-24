import React, { useEffect, useRef, useState } from 'react';
import { generateMinecraftSkinUrl } from '../lib/SkinGenerator';

interface AvatarPortraitProps {
  config: any;
  size?: number;
}

export default function AvatarPortrait({ config, size = 64 }: AvatarPortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [skinUrl, setSkinUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!config) return;
    
    if (config.customSkinUrl) {
      setSkinUrl(config.customSkinUrl);
      return;
    }

    let isMounted = true;
    generateMinecraftSkinUrl(config).then(url => {
      if (isMounted) {
        setSkinUrl(url);
      }
    }).catch(err => console.error('Failed to generate skin:', err));

    return () => { isMounted = false; };
  }, [config]);

  useEffect(() => {
    if (!canvasRef.current || !skinUrl) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Clear canvas
      ctx.clearRect(0, 0, size, size);
      
      // Disable smoothing for pixel art
      ctx.imageSmoothingEnabled = false;

      // Draw head base (x:8, y:8, w:8, h:8 in skin texture)
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size);

      // Draw head overlay (x:40, y:8, w:8, h:8 in skin texture)
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size);
    };
    img.src = skinUrl;

  }, [skinUrl, size]);

  if (!config) {
    return (
      <div style={{ 
        width: size, 
        height: size, 
        backgroundColor: 'var(--accent-blue)',
        borderRadius: '8px'
      }} />
    );
  }

  return (
    <canvas 
      ref={canvasRef} 
      width={size} 
      height={size} 
      style={{ 
        width: size, 
        height: size, 
        borderRadius: '8px',
        imageRendering: 'pixelated',
        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
        border: '2px solid var(--border-glass)'
      }} 
    />
  );
}
