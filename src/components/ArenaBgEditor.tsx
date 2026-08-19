import { useState, useRef, useCallback, useEffect } from 'react';
import { Move, ZoomIn, ZoomOut, RotateCcw, Check } from 'lucide-react';

interface ArenaBgEditorProps {
  imageUrl: string;
  initialPosX?: number;  // 0-100 percentage
  initialPosY?: number;  // 0-100 percentage
  initialScale?: number; // 1-3 scale factor
  initialMoveEnabled?: boolean;
  initialMoveDirection?: 'horizontal' | 'vertical' | 'diagonal';
  initialMoveSpeed?: number;   // amplitude em %
  initialMoveDuration?: number; // segundos por ciclo
  onSave: (posX: number, posY: number, scale: number, moveEnabled: boolean, moveDirection: 'horizontal' | 'vertical' | 'diagonal', moveSpeed: number, moveDuration: number) => void;
  onCancel: () => void;
}

export default function ArenaBgEditor({ 
  imageUrl, 
  initialPosX = 50, 
  initialPosY = 50, 
  initialScale = 1.2,
  initialMoveEnabled = true,
  initialMoveDirection = 'diagonal',
  initialMoveSpeed = 10,
  initialMoveDuration = 30,
  onSave, 
  onCancel 
}: ArenaBgEditorProps) {
  const [posX, setPosX] = useState(initialPosX);
  const [posY, setPosY] = useState(initialPosY);
  const [scale, setScale] = useState(initialScale);
  const [moveEnabled, setMoveEnabled] = useState(initialMoveEnabled);
  const [moveDirection, setMoveDirection] = useState<'horizontal' | 'vertical' | 'diagonal'>(initialMoveDirection);
  const [moveSpeed, setMoveSpeed] = useState(initialMoveSpeed);
  const [moveDuration, setMoveDuration] = useState(initialMoveDuration);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    updatePosition(e);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    updatePosition(e);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    updatePositionFromTouch(e);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    updatePositionFromTouch(e);
  }, [isDragging]);

  const updatePosition = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPosX(Math.max(0, Math.min(100, x)));
    setPosY(Math.max(0, Math.min(100, y)));
  };

  const updatePositionFromTouch = (e: React.TouchEvent) => {
    if (!containerRef.current || !e.touches[0]) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
    const y = ((e.touches[0].clientY - rect.top) / rect.height) * 100;
    setPosX(Math.max(0, Math.min(100, x)));
    setPosY(Math.max(0, Math.min(100, y)));
  };

  const handleReset = () => {
    setPosX(50);
    setPosY(50);
    setScale(1.2);
    setMoveEnabled(true);
    setMoveDirection('diagonal');
    setMoveSpeed(10);
    setMoveDuration(30);
  };

  const moveX = moveDirection === 'horizontal' || moveDirection === 'diagonal' ? moveSpeed : 0;
  const moveY = moveDirection === 'vertical' ? moveSpeed : moveDirection === 'diagonal' ? -moveSpeed / 2 : 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', 
      display: 'flex', alignItems: 'center', justifyContent: 'center', 
      zIndex: 10000, padding: '2rem'
    }}>
      <div style={{
        background: 'var(--bg-dark)', borderRadius: '16px', 
        padding: '2rem', maxWidth: '800px', width: '100%',
        border: '1px solid var(--border-glass)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Move size={20} /> Ajustar Posição do Fundo
          </h3>
          <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.5rem' }}>
            ✕
          </button>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Clique e arraste na imagem para escolher qual parte será exibida na arena. Use o controle deslizante para ajustar o zoom.
        </p>

        {/* Preview Area */}
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          {/* Full Image with Crosshair */}
          <div style={{ flex: '1 1 300px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 'bold' }}>
              Imagem Original (clique para posicionar)
            </label>
            <div 
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleMouseUp}
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16/9',
                borderRadius: '8px',
                overflow: 'hidden',
                cursor: 'crosshair',
                border: '2px solid var(--border-glass)',
                background: '#000'
              }}
            >
              <img 
                src={imageUrl} 
                alt="Arena background" 
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: 0.7
                }}
                draggable={false}
              />
              {/* Crosshair */}
              <div style={{
                position: 'absolute',
                left: `${posX}%`,
                top: `${posY}%`,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none'
              }}>
                <div style={{
                  width: '40px', height: '40px',
                  border: '2px solid var(--gold-primary)',
                  borderRadius: '50%',
                  boxShadow: '0 0 10px rgba(245, 158, 11, 0.5)'
                }} />
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '6px', height: '6px',
                  background: 'var(--gold-primary)',
                  borderRadius: '50%'
                }} />
              </div>
              {/* Grid lines */}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
              </div>
            </div>

            {/* Movimento do Fundo */}
            <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: moveEnabled ? '0.75rem' : 0, color: moveEnabled ? 'var(--gold-primary)' : 'var(--text-secondary)', fontWeight: 'bold', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={moveEnabled}
                  onChange={(e) => setMoveEnabled(e.target.checked)}
                  style={{ accentColor: 'var(--gold-primary)', width: '16px', height: '16px' }}
                />
                Movimento do fundo durante a batalha
              </label>

              {moveEnabled && (
                <>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      Direção do Movimento
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {(['horizontal', 'vertical', 'diagonal'] as const).map(dir => (
                        <button
                          key={dir}
                          onClick={() => setMoveDirection(dir)}
                          style={{
                            flex: 1, padding: '0.4rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold',
                            background: moveDirection === dir ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                            color: moveDirection === dir ? 'var(--gold-primary)' : 'var(--text-secondary)',
                            border: moveDirection === dir ? '1px solid var(--gold-primary)' : '1px solid var(--border-glass)'
                          }}
                        >
                          {dir === 'horizontal' ? 'Horizontal' : dir === 'vertical' ? 'Vertical' : 'Diagonal'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        Velocidade (amplitude)
                      </label>
                      <span style={{ color: 'var(--gold-primary)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                        {moveSpeed}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="25"
                      step="1"
                      value={moveSpeed}
                      onChange={(e) => setMoveSpeed(parseInt(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--gold-primary)' }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        Frequência (segundos por ciclo)
                      </label>
                      <span style={{ color: 'var(--gold-primary)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                        {moveDuration}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      step="1"
                      value={moveDuration}
                      onChange={(e) => setMoveDuration(parseInt(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--gold-primary)' }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Preview */}
          <div style={{ flex: '1 1 250px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 'bold' }}>
              Preview na Arena
            </label>
            <div style={{
              width: '100%',
              aspectRatio: '16/9',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '2px solid var(--gold-primary)',
              position: 'relative',
              background: '#000'
            }}>
              <div style={{
                position: 'absolute',
                inset: '-20%',
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: `${scale * 100}%`,
                backgroundPosition: `${posX}% ${posY}%`,
                backgroundRepeat: 'no-repeat',
                '--preview-move-x': `${moveX}%`,
                '--preview-move-y': `${moveY}%`,
                '--preview-move-duration': `${moveDuration}s`,
                animation: moveEnabled ? 'pan-background-preview var(--preview-move-duration) linear infinite alternate' : 'none',
                filter: 'brightness(0.6) contrast(1.1)'
              } as React.CSSProperties} />
              {/* Simulated arena elements */}
              <div style={{
                position: 'absolute', bottom: '10%', left: '15%',
                width: '30px', height: '50px',
                background: 'rgba(59, 130, 246, 0.3)',
                borderRadius: '4px',
                border: '1px solid rgba(59, 130, 246, 0.5)'
              }} />
              <div style={{
                position: 'absolute', bottom: '10%', right: '15%',
                width: '30px', height: '50px',
                background: 'rgba(239, 68, 68, 0.3)',
                borderRadius: '4px',
                border: '1px solid rgba(239, 68, 68, 0.5)'
              }} />
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                color: 'rgba(255,255,255,0.3)',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                textTransform: 'uppercase'
              }}>
                VS
              </div>
            </div>
            
            {/* Controls */}
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Zoom Control */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    <ZoomIn size={14} style={{ verticalAlign: 'middle' }} /> Zoom
                  </label>
                  <span style={{ color: 'var(--gold-primary)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    {scale.toFixed(2)}x
                  </span>
                </div>
                <input 
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.05"
                  value={scale}
                  onChange={(e) => setScale(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--gold-primary)' }}
                />
              </div>

              {/* Position Info */}
              <div style={{ 
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem',
                background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '6px'
              }}>
                <div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Posição X</span>
                  <div style={{ color: 'var(--gold-primary)', fontFamily: 'monospace', fontWeight: 'bold' }}>{posX.toFixed(1)}%</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Posição Y</span>
                  <div style={{ color: 'var(--gold-primary)', fontFamily: 'monospace', fontWeight: 'bold' }}>{posY.toFixed(1)}%</div>
                </div>
              </div>

              {/* Reset Button */}
              <button 
                onClick={handleReset}
                style={{ 
                  padding: '0.5rem', 
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid var(--border-glass)', 
                  borderRadius: '6px', 
                  color: 'var(--text-secondary)', 
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  fontSize: '0.85rem'
                }}
              >
                <RotateCcw size={14} /> Resetar para Padrão
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
          <button 
            onClick={onCancel}
            style={{ 
              padding: '0.75rem 1.5rem', 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid var(--border-glass)', 
              borderRadius: '8px', 
              color: 'var(--text-secondary)', 
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Cancelar
          </button>
          <button 
            onClick={() => onSave(posX, posY, scale, moveEnabled, moveDirection, moveSpeed, moveDuration)}
            style={{ 
              padding: '0.75rem 1.5rem', 
              background: 'var(--gold-primary)', 
              border: 'none', 
              borderRadius: '8px', 
              color: 'var(--text-on-gold, #000)', 
              cursor: 'pointer',
              fontWeight: 'bold',
              display: 'flex', alignItems: 'center', gap: '0.5rem'
            }}
          >
            <Check size={18} /> Aplicar
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pan-background-preview {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(var(--preview-move-x, 10%), var(--preview-move-y, -5%)) scale(1.05); }
        }
      `}</style>
    </div>
  );
}
