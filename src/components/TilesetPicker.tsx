import React, { useState, useEffect, useRef } from 'react';
import { X, Crop, Check, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
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

  const [gapXInput, setGapXInput] = useState(() => {
    const saved = localStorage.getItem(getStorageKey());
    return saved ? (JSON.parse(saved).gapX || '0') : '0';
  });
  const gapX = parseInt(gapXInput) || 0;

  const [gapYInput, setGapYInput] = useState(() => {
    const saved = localStorage.getItem(getStorageKey());
    return saved ? (JSON.parse(saved).gapY || '0') : '0';
  });
  const gapY = parseInt(gapYInput) || 0;

  const [gridColor, setGridColor] = useState<'white' | 'black'>(() => {
    const saved = localStorage.getItem(getStorageKey());
    return saved ? (JSON.parse(saved).gridColor || 'white') : 'white';
  });

  // Máscara de transparência (remoção de fundo)
  const [removeBg, setRemoveBg] = useState(() => {
    const saved = localStorage.getItem(getStorageKey());
    return saved ? (JSON.parse(saved).removeBg ?? true) : true;
  });
const [bgTolerance, setBgTolerance] = useState(() => {
    const saved = localStorage.getItem(getStorageKey());
    return saved ? (JSON.parse(saved).bgTolerance ?? 30) : 30;
  });
  // Cor específica do fundo a remover ('' = detectar automaticamente pelos cantos)
  const [bgColor, setBgColor] = useState(() => {
    const saved = localStorage.getItem(getStorageKey());
    return saved ? (JSON.parse(saved).bgColor || '') : '';
  });
  // Global = remove a cor em toda a imagem; false = flood fill a partir das bordas
  const [bgGlobal, setBgGlobal] = useState(() => {
    const saved = localStorage.getItem(getStorageKey());
    return saved ? (JSON.parse(saved).bgGlobal ?? false) : false;
  });

  useEffect(() => {
    localStorage.setItem(getStorageKey(), JSON.stringify({
      gridSize: gridSizeInput,
      offsetX: offsetXInput,
      offsetY: offsetYInput,
      gapX: gapXInput,
      gapY: gapYInput,
      gridColor: gridColor,
      removeBg,
      bgTolerance,
      bgColor,
      bgGlobal
    }));
  }, [gridSizeInput, offsetXInput, offsetYInput, gapXInput, gapYInput, gridColor, removeBg, bgTolerance, bgColor, bgGlobal, tilesetUrl]);

  // Carregar do Banco de Dados ao abrir
  useEffect(() => {
    const fetchDbConfig = async () => {
      try {
        const docId = tilesetRefPath.replace(/\//g, '_');
        const { data: docData } = await supabase.from('tileset_configs').select('*').eq('id', docId).single();
        if (docData) {
          const data = docData;
          if (data.gridSize) setGridSizeInput(data.gridSize);
          if (data.offsetX) setOffsetXInput(data.offsetX);
          if (data.offsetY) setOffsetYInput(data.offsetY);
          if (data.gapX) setGapXInput(data.gapX);
          if (data.gapY) setGapYInput(data.gapY);
          if (data.gridColor) setGridColor(data.gridColor);
if (typeof data.removeBg === 'boolean') setRemoveBg(data.removeBg);
          if (data.bgTolerance) setBgTolerance(data.bgTolerance);
          if (data.bgColor) setBgColor(data.bgColor);
          if (typeof data.bgGlobal === 'boolean') setBgGlobal(data.bgGlobal);
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
  const [zoom, setZoom] = useState(1);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // Important for CORS and canvas manipulation
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      imageRef.current = img;
      // Zoom inicial: encaixar a imagem na área visível (lado maior)
      const avail = Math.min(window.innerWidth * 0.85, 900);
      setZoom(Math.max(0.25, Math.min(1, avail / Math.max(img.width, img.height))));
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
  }, [gridSize, offsetX, offsetY, gapX, gapY, gridColor, selectedCell]);

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
    ctx.strokeStyle = gridColor === 'black' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    const stepX = gridSize + gapX;
    const startCellX = Math.floor(-offsetX / stepX);
    const endCellX = Math.ceil((img.width - offsetX) / stepX);
    
    for (let i = startCellX; i <= endCellX; i++) {
       const x = offsetX + i * stepX;
       ctx.moveTo(x, 0);
       ctx.lineTo(x, img.height);
       if (gapX > 0) {
          ctx.moveTo(x + gridSize, 0);
          ctx.lineTo(x + gridSize, img.height);
       }
    }
    
    const stepY = gridSize + gapY;
    const startCellY = Math.floor(-offsetY / stepY);
    const endCellY = Math.ceil((img.height - offsetY) / stepY);
    
    for (let i = startCellY; i <= endCellY; i++) {
       const y = offsetY + i * stepY;
       ctx.moveTo(0, y);
       ctx.lineTo(img.width, y);
       if (gapY > 0) {
          ctx.moveTo(0, y + gridSize);
          ctx.lineTo(img.width, y + gridSize);
       }
    }
    ctx.stroke();

    // Draw highlight on selected cell
    if (selectedCell) {
      const cellLeft = selectedCell.x * stepX + offsetX;
      const cellTop = selectedCell.y * stepY + offsetY;
      
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
    const stepX = gridSize + gapX;
    const stepY = gridSize + gapY;
    const cellX = Math.floor((x - offsetX) / stepX);
    const cellY = Math.floor((y - offsetY) / stepY);

    setSelectedCell({ x: cellX, y: cellY });
  };

// Converte #rrggbb em {r,g,b}
  const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16) || 0,
      g: parseInt(h.substring(2, 4), 16) || 0,
      b: parseInt(h.substring(4, 6), 16) || 0,
    };
  };

  // Remove o fundo SEM deformar o item: flood fill a partir das bordas.
  // Referência = cor específica (se passada) ou os 4 cantos da imagem.
  const floodFillBackground = (ctx: CanvasRenderingContext2D, width: number, height: number, tolerance: number, refColor?: { r: number; g: number; b: number }) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const visited = new Uint8Array(width * height);
    const queue: number[] = [];

    const refs: { r: number; g: number; b: number }[] = [];
    if (refColor) {
      refs.push(refColor);
    } else {
      const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
      for (const [cx, cy] of corners) {
        const idx = (cy * width + cx) * 4;
        if (data[idx + 3] >= 10) refs.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
      }
    }
    if (refs.length === 0) return;

    const pushBorder = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const pi = (y * width + x) * 4;
      const pv = y * width + x;
      if (visited[pv]) return;
      if (data[pi + 3] < 10) { visited[pv] = 1; return; }
      for (const ref of refs) {
        if (Math.abs(data[pi] - ref.r) <= tolerance && Math.abs(data[pi + 1] - ref.g) <= tolerance && Math.abs(data[pi + 2] - ref.b) <= tolerance) {
          visited[pv] = 1;
          queue.push(pv);
          break;
        }
      }
    };

    for (let x = 0; x < width; x++) { pushBorder(x, 0); pushBorder(x, height - 1); }
    for (let y = 0; y < height; y++) { pushBorder(0, y); pushBorder(width - 1, y); }

    while (queue.length > 0) {
      const p = queue.pop() as number;
      const x = p % width;
      const y = Math.floor(p / width);
      data[p * 4 + 3] = 0;
      const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (visited[ni]) continue;
        const idx = ni * 4;
        if (data[idx + 3] < 10) { visited[ni] = 1; continue; }
        let matches = false;
        for (const ref of refs) {
          if (Math.abs(data[idx] - ref.r) <= tolerance && Math.abs(data[idx + 1] - ref.g) <= tolerance && Math.abs(data[idx + 2] - ref.b) <= tolerance) {
            matches = true;
            break;
          }
        }
        visited[ni] = 1;
        if (matches) queue.push(ni);
      }
    }
    ctx.putImageData(imageData, 0, 0);
  };

  // Remove a cor em TODA a imagem (global) — útil quando o flood fill não alcança
  // o fundo (ex.: item tocando a borda). Pode remover partes da cor dentro do item.
  const removeColorGlobal = (ctx: CanvasRenderingContext2D, width: number, height: number, color: { r: number; g: number; b: number }, tolerance: number) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (
        data[i + 3] > 0 &&
        Math.abs(data[i] - color.r) <= tolerance &&
        Math.abs(data[i + 1] - color.g) <= tolerance &&
        Math.abs(data[i + 2] - color.b) <= tolerance
      ) {
        data[i + 3] = 0;
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
      const stepX = gridSize + gapX;
      const stepY = gridSize + gapY;
      ctx.drawImage(
        imageRef.current,
        selectedCell.x * stepX + offsetX,
        selectedCell.y * stepY + offsetY,
        gridSize,
        gridSize,
        0,
        0,
        gridSize,
        gridSize
      );

// Remove o fundo (se habilitado) — flood fill a partir das bordas, com cor
      // específica (se informada) ou automática pelos cantos; modo global remove em toda a imagem.
      if (removeBg) {
        const refColor = bgColor ? hexToRgb(bgColor) : null;
        if (bgGlobal) {
          const c = refColor || (() => {
            const d = ctx.getImageData(0, 0, 1, 1).data;
            return { r: d[0], g: d[1], b: d[2] };
          })();
          removeColorGlobal(ctx, gridSize, gridSize, c, bgTolerance);
        } else {
          floodFillBackground(ctx, gridSize, gridSize, bgTolerance, refColor);
        }
      }

      // Convert to Blob
      const blob = await new Promise<Blob | null>(resolve => tempCanvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error("Failed to create blob");

      // Upload to Supabase
      const fileName = `tile_${Date.now()}.png`;
      const filePath = `items/${fileName}`;
      
      const { error } = await supabase.storage.from('uploads').upload(filePath, blob, { contentType: 'image/png' });
      
      if (error) {
        console.error(error);
        showAlert('Erro ao fazer upload do ícone.');
        setUploading(false);
        return;
      }

      // Salvar a configuração final utilizada no Banco de Dados para persistência em nuvem
      try {
        const docId = tilesetRefPath.replace(/\//g, '_');
await supabase.from('tileset_configs').upsert({
          id: docId,
          gridSize: parseInt(gridSizeInput) || 32,
          offsetX: parseInt(offsetXInput) || 0,
          offsetY: parseInt(offsetYInput) || 0,
          gapX: parseInt(gapXInput) || 0,
          gapY: parseInt(gapYInput) || 0,
          gridColor: gridColor,
          removeBg,
          bgTolerance,
          bgColor: bgColor || null,
          bgGlobal
        });
      } catch (dbErr) {
        console.error("Erro ao salvar config no BD:", dbErr);
      }

      const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(filePath);
      onTileSelected(urlData.publicUrl);

    } catch (err) {
      console.error(err);
      showAlert("Erro ao processar o recorte.");
      setUploading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 11000, padding: '1rem', overflowY: 'auto' }}>
      
<div style={{ width: '100%', maxWidth: '1400px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ color: 'var(--gold-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Crop size={24} /> Seletor de Tile
        </h3>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
          <X size={28} />
        </button>
      </div>

      <div className="tileset-modal-body" style={{ flex: 1, minHeight: 0 }}>
        {/* Painel de controles (esquerda no desktop, abaixo no mobile) */}
        <div className="tileset-controls-panel">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Tamanho do Grid</label>
              <input type="number" value={gridSizeInput} onChange={(e) => setGridSizeInput(e.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', color: 'white', width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Cor da Grade</label>
              <select value={gridColor} onChange={(e) => setGridColor(e.target.value as 'white' | 'black')} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', color: 'white' }}>
                <option value="white">Branca</option>
                <option value="black">Preta</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Deslocamento X</label>
              <input type="number" value={offsetXInput} onChange={(e) => setOffsetXInput(e.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', color: 'white', width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Deslocamento Y</label>
              <input type="number" value={offsetYInput} onChange={(e) => setOffsetYInput(e.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', color: 'white', width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Gap X</label>
              <input type="number" value={gapXInput} onChange={(e) => setGapXInput(e.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', color: 'white', width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Gap Y</label>
              <input type="number" value={gapYInput} onChange={(e) => setGapYInput(e.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', color: 'white', width: '100%' }} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Máscara de Transparência</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
              <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>Remover fundo (bordas)</span>
            </div>
            {removeBg && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Tolerância: {bgTolerance}</label>
                <input type="range" min="5" max="100" step="1" value={bgTolerance} onChange={(e) => setBgTolerance(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--gold-primary)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>Cor do fundo:</label>
                  <input
                    type="color"
                    value={bgColor || '#ff00ff'}
                    onChange={(e) => setBgColor(e.target.value)}
                    style={{ width: '36px', height: '30px', border: '1px solid var(--border-glass)', borderRadius: '6px', background: 'transparent', cursor: 'pointer', padding: 0 }}
                    title="Selecionar a cor do fundo a remover"
                  />
                  <button
                    onClick={() => setBgColor('')}
                    style={{ padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.7rem', whiteSpace: 'nowrap' }}
                    title="Voltar a detectar automaticamente pelos cantos"
                  >
                    Auto
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
                  <input type="checkbox" checked={bgGlobal} onChange={(e) => setBgGlobal(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer' }}>Remover em toda a imagem (global)</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Zoom</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button onClick={() => setZoom(z => Math.max(0.25, z / 1.12))} style={{ padding: '0.3rem 0.6rem', background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border-glass)', borderRadius: '6px', color: 'white', cursor: 'pointer', fontWeight: 'bold', flexShrink: 0 }}>−</button>
              <input type="range" min="0.25" max="8" step="0.05" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} style={{ flex: 1, minWidth: 0, accentColor: 'var(--gold-primary)' }} />
              <button onClick={() => setZoom(z => Math.min(8, z * 1.12))} style={{ padding: '0.3rem 0.6rem', background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border-glass)', borderRadius: '6px', color: 'white', cursor: 'pointer', fontWeight: 'bold', flexShrink: 0 }}>+</button>
              <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold', width: '40px', textAlign: 'center', flexShrink: 0 }}>{Math.round(zoom * 100)}%</span>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Clique na grade da imagem para selecionar um ícone. O fundo é removido por flood fill a partir das bordas.
          </p>

          <button
            onClick={handleCrop}
            disabled={!selectedCell || uploading}
            style={{
              background: (!selectedCell || uploading) ? 'gray' : 'var(--gold-primary)',
              color: 'var(--text-on-gold, #000000)',
              border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', fontWeight: 'bold',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%',
              cursor: (!selectedCell || uploading) ? 'not-allowed' : 'pointer', flexShrink: 0
            }}
          >
            {uploading ? <Loader2 className="spin" size={20} /> : <Check size={20} />}
            {uploading ? 'Processando...' : 'Recortar e Usar'}
          </button>
        </div>

        {/* Área da imagem (direita no desktop, acima no mobile) */}
        <div className="tileset-canvas-area">
          {!imageSize && <p style={{ color: 'white' }}>Carregando imagem...</p>}
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onWheel={(e) => {
              e.preventDefault();
              // Suave: progressão exponencial proporcional ao deltaY (trackpad/rodinha)
              setZoom(z => Math.max(0.25, Math.min(8, z * Math.exp(-e.deltaY * 0.00035))));
            }}
            style={{
              cursor: 'crosshair',
              imageRendering: 'pixelated',
              width: imageSize ? imageSize.width * zoom : undefined,
              height: imageSize ? imageSize.height * zoom : undefined,
              maxWidth: 'none',
              boxShadow: '0 0 20px rgba(0,0,0,0.5)'
            }}
          />
        </div>
      </div>
    </div>
  );
}

