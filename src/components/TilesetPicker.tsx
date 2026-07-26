import React, { useState, useEffect, useRef } from 'react';
import { X, Crop, Check, Loader2 } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { storage, db } from '../lib/firebase';
import { useDialog } from '../contexts/DialogContext';

interface TilesetPickerProps {
  tilesetUrl: string;
  tilesetRefPath: string;
  onClose: () => void;
  onTileSelected: (url: string) => void;
}

export default function TilesetPicker({ tilesetUrl, tilesetRefPath, onClose, onTileSelected }: TilesetPickerProps) {
  const { showAlert } = useDialog();

  const getStorageKey = () => `tileset_config_${tilesetUrl}`;

  const [gridSizeInput, setGridSizeInput] = useState(() => {
    const saved = localStorage.getItem(getStorageKey());
    return saved ? (JSON.parse(saved).gridSize || '32') : '32';
  });
  const gridSize = Math.max(1, parseInt(gridSizeInput) || 32);

  const [offsetXInput, setOffsetXInput] = useState(() => {
    const saved = localStorage.getItem(getStorageKey());
    return saved ? (JSON.parse(saved).offsetX || '0') : '0';
  });
  const offsetX = parseInt(offsetXInput) || 0;

  const [offsetYInput, setOffsetYInput] = useState(() => {
    const saved = localStorage.getItem(getStorageKey());
    return saved ? (JSON.parse(saved).offsetY || '0') : '0';
  });
  const offsetY = parseInt(offsetYInput) || 0;

  useEffect(() => {
    localStorage.setItem(getStorageKey(), JSON.stringify({
      gridSize: gridSizeInput,
      offsetX: offsetXInput,
      offsetY: offsetYInput
    }));
  }, [gridSizeInput, offsetXInput, offsetYInput, tilesetUrl]);

  // Carregar do Banco de Dados ao abrir
  useEffect(() => {
    const fetchDbConfig = async () => {
      try {
        const docId = tilesetRefPath.replace(/\//g, '_');
        const docSnap = await getDoc(doc(db, 'tileset_configs', docId));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.gridSize) setGridSizeInput(data.gridSize);
          if (data.offsetX) setOffsetXInput(data.offsetX);
          if (data.offsetY) setOffsetYInput(data.offsetY);
        }
      } catch (err) {
        console.error("Erro ao carregar config do BD:", err);
      }
    };
    fetchDbConfig();
  }, [tilesetRefPath]);
  const [selectedCell, setSelectedCell] = useState<{x: number, y: number} | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imageSize, setImageSize] = useState<{width: number, height: number} | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // Important for CORS and canvas manipulation
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      imageRef.current = img;
      drawCanvas(img);
    };
    img.onerror = () => {
      showAlert("Erro ao carregar o Tileset para recorte (CORS ou URL inválida). Tente fazer upload da imagem novamente.");
      onClose();
    };
    img.src = tilesetUrl;
  }, [tilesetUrl]);

  useEffect(() => {
    if (imageRef.current) {
      drawCanvas(imageRef.current);
    }
  }, [gridSize, offsetX, offsetY, selectedCell]);

  const drawCanvas = (img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // We can scale the canvas for display purposes, but internally it's the exact image size
    canvas.width = img.width;
    canvas.height = img.height;

    // Draw the original image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startX = ((offsetX % gridSize) + gridSize) % gridSize;
    for (let x = startX; x <= img.width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, img.height);
    }
    const startY = ((offsetY % gridSize) + gridSize) % gridSize;
    for (let y = startY; y <= img.height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(img.width, y);
    }
    ctx.stroke();

    // Draw highlight on selected cell
    if (selectedCell) {
      const cellLeft = selectedCell.x * gridSize + offsetX;
      const cellTop = selectedCell.y * gridSize + offsetY;
      
      ctx.fillStyle = 'rgba(251, 191, 36, 0.4)'; // Gold with opacity
      ctx.fillRect(cellLeft, cellTop, gridSize, gridSize);
      ctx.strokeStyle = '#FBBF24'; // Gold border
      ctx.lineWidth = 2;
      ctx.strokeRect(cellLeft, cellTop, gridSize, gridSize);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    
    // Calculate click coordinates relative to the canvas internal resolution
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Calculate grid cell taking offset into account
    const cellX = Math.floor((x - offsetX) / gridSize);
    const cellY = Math.floor((y - offsetY) / gridSize);

    setSelectedCell({ x: cellX, y: cellY });
  };

  // Helper to remove background color (flood fill style or simple top-left pixel color removal)
  const removeBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Assume top-left pixel is the background color
    const r = data[0];
    const g = data[1];
    const b = data[2];
    const a = data[3];

    // If it's already transparent, do nothing
    if (a < 10) return;

    // Threshold for color matching (fuzziness)
    const threshold = 15;

    for (let i = 0; i < data.length; i += 4) {
      if (
        Math.abs(data[i] - r) <= threshold &&
        Math.abs(data[i+1] - g) <= threshold &&
        Math.abs(data[i+2] - b) <= threshold &&
        data[i+3] > 0
      ) {
        data[i+3] = 0; // Make transparent
      }
    }
    ctx.putImageData(imageData, 0, 0);
  };

  const handleCrop = async () => {
    if (!selectedCell || !imageRef.current) return;

    setUploading(true);

    try {
      // Create a temporary canvas for the cropped tile
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = gridSize;
      tempCanvas.height = gridSize;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) throw new Error("Could not get 2D context");

      // Draw just the selected portion
      ctx.drawImage(
        imageRef.current,
        selectedCell.x * gridSize + offsetX,
        selectedCell.y * gridSize + offsetY,
        gridSize,
        gridSize,
        0,
        0,
        gridSize,
        gridSize
      );

      // Remove background (Magic Wand effect based on top-left pixel)
      removeBackground(ctx, gridSize, gridSize);

      // Convert to Blob
      const blob = await new Promise<Blob | null>(resolve => tempCanvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error("Failed to create blob");

      // Upload to Firebase
      const fileRef = ref(storage, `items/tile_${Date.now()}.png`);
      const uploadTask = uploadBytesResumable(fileRef, blob, { contentType: 'image/png' });

      uploadTask.on('state_changed', 
        null,
        (err) => {
          console.error(err);
          showAlert('Erro ao fazer upload do ícone.');
          setUploading(false);
        },
        async () => {
          // Salvar a configuração final utilizada no Banco de Dados para persistência em nuvem
          try {
            const docId = tilesetRefPath.replace(/\//g, '_');
            await setDoc(doc(db, 'tileset_configs', docId), {
              gridSize: gridSizeInput,
              offsetX: offsetXInput,
              offsetY: offsetYInput,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          } catch (dbErr) {
            console.error("Erro ao salvar config no BD:", dbErr);
          }

          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          onTileSelected(downloadUrl);
        }
      );

    } catch (err) {
      console.error(err);
      showAlert("Erro ao processar o recorte.");
      setUploading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 11000, padding: '2rem' }}>
      
      <div style={{ width: '100%', maxWidth: '800px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ color: 'var(--gold-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Crop size={24} /> Seletor de Tile
        </h3>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>
          <X size={28} />
        </button>
      </div>

      <div style={{ background: 'var(--bg-dark)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-glass)', width: '100%', maxWidth: '800px', marginBottom: '1rem', display: 'flex', gap: '2rem', alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Tamanho do Grid</label>
              <input 
                type="number" 
                value={gridSizeInput} 
                onChange={(e) => setGridSizeInput(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', color: 'white', width: '90px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Deslocamento X</label>
              <input 
                type="number" 
                value={offsetXInput} 
                onChange={(e) => setOffsetXInput(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', color: 'white', width: '90px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Deslocamento Y</label>
              <input 
                type="number" 
                value={offsetYInput} 
                onChange={(e) => setOffsetYInput(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', color: 'white', width: '90px' }}
              />
            </div>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Clique na grade abaixo para selecionar um ícone. O fundo da imagem será removido automaticamente (usando a cor do canto superior esquerdo como base).
          </p>
        </div>

        <div>
          <button 
            onClick={handleCrop}
            disabled={!selectedCell || uploading}
            style={{ 
              background: (!selectedCell || uploading) ? 'gray' : 'var(--gold-primary)', 
              color: 'black', 
              border: 'none', 
              padding: '0.75rem 1.5rem', 
              borderRadius: '8px', 
              fontWeight: 'bold', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              cursor: (!selectedCell || uploading) ? 'not-allowed' : 'pointer'
            }}
          >
            {uploading ? <Loader2 className="spin" size={20} /> : <Check size={20} />}
            {uploading ? 'Processando...' : 'Recortar e Usar'}
          </button>
        </div>
      </div>

      <div style={{ 
        flex: 1, 
        width: '100%', 
        maxWidth: '1200px', 
        overflow: 'auto', 
        background: 'repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 20px 20px', 
        borderRadius: '12px',
        border: '1px solid var(--border-glass)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '2rem'
      }}>
        {!imageSize && <p style={{ color: 'white' }}>Carregando imagem...</p>}
        <canvas 
          ref={canvasRef} 
          onClick={handleCanvasClick}
          style={{ 
            cursor: 'crosshair', 
            imageRendering: 'pixelated', // Crucial for pixel art
            maxWidth: '100%', // Prevent overflow but allow zoom
            boxShadow: '0 0 20px rgba(0,0,0,0.5)'
          }} 
        />
      </div>
    </div>
  );
}
