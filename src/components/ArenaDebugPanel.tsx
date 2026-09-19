import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ModelTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  shadowOffsetY?: number;
  shadowScale?: number;
}

export interface ArenaDebugConfig {
  playerOffsetX: number;
  playerOffsetY: number;
  playerScale: number;
  playerNameX: number;
  playerNameY: number;
  playerBubbleX: number;
  playerBubbleY: number;
  monsterOffsetX: number;
  monsterOffsetY: number;
  monsterScale: number;
  monsterNameX: number;
  monsterNameY: number;
  monsterBubbleX: number;
  monsterBubbleY: number;
  /** Posição onde o monstro morre (fatalidade): cai/evapora/explode/corta exatamente nesse deslocamento */
  deathOffsetX: number;
  deathOffsetY: number;
  /** Mostra um retângulo na posição da fatalidade para visualizar/definir X e Y */
  showDeathArea: boolean;
  /** Força uma fatalidade específica no fim da luta ('' = aleatória) */
  forcedFatality: string;
  arenaHeight: number;
  arenaPaddingTop: number;
  arenaGap: number;
  attackDist: number;
  coinAreaX: number;
  coinAreaY: number;
  coinAreaW: number;
  coinAreaH: number;
  showPlayerCoinArea: boolean;
  playerCoinAreaX: number;
  playerCoinAreaY: number;
  playerCoinAreaW: number;
  playerCoinAreaH: number;
  showBoxes: boolean;
  showCoinArea: boolean;
  noInstantKill: boolean;
  adminImmortal: boolean;
  monsterImmortal: boolean;
  forceCoinLoss: boolean;
  forceRewards: boolean;
  guaranteedCrit: boolean;
  showBubbleOrigins: boolean;
  bubbleOriginSize: number;
  bubbleMaxWidth: number;
  bubbleFontSize: number;
  playerBubbleMaxWidth: number;
  playerBubbleFontSize: number;
  playerBubbleRotate: number;
  playerBubbleAlwaysOn: boolean;
  monsterBubbleMaxWidth: number;
  monsterBubbleFontSize: number;
  monsterBubbleRotate: number;
  monsterBubbleAlwaysOn: boolean;
  modelConfigs: Record<string, ModelTransform>;
  selectedModelUrl: string;
  /** Multiplicador da largura do canvas do personagem (área visível) */
  charCanvasW: number;
  /** Multiplicador da altura do canvas do personagem */
  charCanvasH: number;
  /** Zoom do boneco dentro do canvas (maior = mais perto/maior) */
  charZoom: number;
  /** Distância da câmera (fit) — base para o enquadramento do personagem */
  charFit: number;
  /** Ativa o cenário 3D Voxel estilo Minecraft na arena */
  enable3DArena?: boolean;
  /** Bioma do cenário 3D em teste */
  biome3D?: 'plains' | 'nether' | 'desert' | 'snow' | 'end';
  // Ajustes finos do Modo 3D Voxel
  playerOffsetX3D?: number;
  playerOffsetY3D?: number;
  playerScale3D?: number;
  monsterOffsetX3D?: number;
  monsterOffsetY3D?: number;
  monsterScale3D?: number;
  arenaGap3D?: number;
  // Calibração de Câmera e Profundidade 3D
  cameraPitch3D?: number;
  cameraDist3D?: number;
  cameraTargetY3D?: number;
  // Ajustes de Magias / Golpes de Longo Alcance
  projStartX?: number;
  projStartY?: number;
  projTargetDist?: number;
  projTargetY?: number;
  projArcHeight?: number;
  /** Exibe o retângulo do campo de ação / range da magia na arena (apenas para o usuário no debug) */
  showProjRange?: boolean;
}

export const DEFAULT_ARENA_DEBUG: ArenaDebugConfig = {
  playerOffsetX: 0,
  playerOffsetY: 0,
  playerScale: 1,
  playerNameX: 0,
  playerNameY: -20,
  monsterOffsetX: 0,
  monsterOffsetY: 0,
  monsterScale: 1,
  monsterNameX: 0,
  monsterNameY: -25,
  deathOffsetX: 0,
  deathOffsetY: 0,
  showDeathArea: false,
  forcedFatality: '',
  arenaHeight: 300,
  arenaPaddingTop: 16,
  arenaGap: 0,
  attackDist: 0,
  coinAreaX: 50,
  coinAreaY: 70,
  coinAreaW: 80,
  coinAreaH: 30,
  showPlayerCoinArea: false,
  playerCoinAreaX: 10,
  playerCoinAreaY: 70,
  playerCoinAreaW: 40,
  playerCoinAreaH: 25,
  playerBubbleX: 0,
  playerBubbleY: -80,
  monsterBubbleX: 0,
  monsterBubbleY: -80,
  showBoxes: false,
  showCoinArea: false,
  noInstantKill: false,
  adminImmortal: false,
  monsterImmortal: false,
  forceCoinLoss: false,
  forceRewards: false,
  guaranteedCrit: false,
  showBubbleOrigins: false,
  bubbleOriginSize: 30,
  bubbleMaxWidth: 200,
  bubbleFontSize: 14,
  playerBubbleMaxWidth: 200,
  playerBubbleFontSize: 14,
  playerBubbleRotate: 0,
  playerBubbleAlwaysOn: false,
  monsterBubbleMaxWidth: 200,
  monsterBubbleFontSize: 14,
  monsterBubbleRotate: 0,
  monsterBubbleAlwaysOn: false,
  modelConfigs: {},
  selectedModelUrl: '',
  charCanvasW: 1,
  charCanvasH: 1,
  charZoom: 0.9,
  charFit: 60,
  enable3DArena: false,
  biome3D: 'plains',
  playerOffsetX3D: 0,
  playerOffsetY3D: 0,
  playerScale3D: 1,
  monsterOffsetX3D: 0,
  monsterOffsetY3D: 0,
  monsterScale3D: 1,
  arenaGap3D: 0,
  cameraPitch3D: 0,
  cameraDist3D: 0,
  cameraTargetY3D: 0,
  projStartX: 0,
  projStartY: 40,
  projTargetDist: 0,
  projTargetY: 80,
  projArcHeight: 245,
  showProjRange: false,
};

export type ArenaModeKey = '3d_desktop' | '3d_mobile' | '2d_desktop' | '2d_mobile';

const DraggableWidget = ({ 
  id, 
  defaultPos, 
  children, 
  activeModeKey = '3d_desktop', 
  windowWidth, 
  manualModeOverride = null,
  onSelectMode,
  // compatibilidade com versões anteriores
  deviceKey,
  onSwitchDevice 
}: { 
  id: string; 
  defaultPos: { x: number; y: number }; 
  children: React.ReactNode; 
  activeModeKey?: ArenaModeKey; 
  windowWidth?: number; 
  manualModeOverride?: ArenaModeKey | null;
  onSelectMode?: (mode: ArenaModeKey | 'auto') => void;
  deviceKey?: 'mobile' | 'desktop'; 
  onSwitchDevice?: (device: 'mobile' | 'desktop') => void;
}) => {
  const [pos, setPos] = useState(() => {
    // Always spawn at the center of the screen, ignoring old saved positions that may be off-screen
    const centerX = Math.max(0, Math.floor(window.innerWidth / 2) - 130);
    const centerY = Math.max(0, Math.floor(window.innerHeight / 2) - 210);
    return { x: centerX, y: centerY };
  });
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [widgetHeight, setWidgetHeight] = useState(() => {
    const saved = localStorage.getItem(`arenaDebug_widgetH_${id}`);
    return saved && !isNaN(parseInt(saved)) ? parseInt(saved) : 420;
  });
  const [widgetWidth, setWidgetWidth] = useState(() => {
    const saved = localStorage.getItem(`arenaDebug_widgetW_${id}`);
    return saved && !isNaN(parseInt(saved)) ? Math.max(285, parseInt(saved)) : 290;
  });
  const [widgetOpacity, setWidgetOpacity] = useState<number>(() => {
    const saved = localStorage.getItem('arenaDebug_widgetOpacity');
    if (saved) {
      const num = parseFloat(saved);
      if (!isNaN(num) && num >= 0.15 && num <= 1) return num;
    }
    return 0.95;
  });
  const dragStart = useRef({ x: 0, y: 0 });
  const widgetRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const opacityInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const opEl = opacityInputRef.current;
    if (!opEl) return;
    const block = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    opEl.addEventListener('wheel', block, { passive: false });
    return () => opEl.removeEventListener('wheel', block);
  }, []);

  useEffect(() => {
    const widgetEl = widgetRef.current;
    if (!widgetEl) return;

    const handleWheelCapture = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const isInputOrSelect =
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        Boolean(target.closest('input, select, textarea'));

      if (isInputOrSelect) {
        // Bloqueia 100% o navegador/Chromium de alterar o valor de sliders e campos ao usar o scroll do mouse!
        e.preventDefault();
        e.stopPropagation();

        if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
          document.activeElement.blur();
        }

        // Encaminha a rolagem perfeitamente para o painel de debug
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop += e.deltaY;
        }
      }
    };

    widgetEl.addEventListener('wheel', handleWheelCapture, { capture: true, passive: false });
    return () => {
      widgetEl.removeEventListener('wheel', handleWheelCapture, { capture: true });
    };
  }, [isMinimized]);

  useEffect(() => {
    localStorage.setItem(`arenaDebug_widgetPos_${id}`, JSON.stringify(pos));
  }, [pos, id]);

  useEffect(() => {
    localStorage.setItem(`arenaDebug_widgetH_${id}`, widgetHeight.toString());
  }, [widgetHeight, id]);

  useEffect(() => {
    localStorage.setItem(`arenaDebug_widgetW_${id}`, widgetWidth.toString());
  }, [widgetWidth, id]);

  useEffect(() => {
    localStorage.setItem('arenaDebug_widgetOpacity', widgetOpacity.toString());
  }, [widgetOpacity]);

  // Prevent body scroll from fixed widget
  useEffect(() => {
    document.documentElement.style.overflowX = 'hidden';
    return () => { document.documentElement.style.overflowX = ''; };
  }, []);

  return createPortal(
    <div
      ref={widgetRef}
      style={{
        position: 'fixed', 
        left: typeof pos?.x === 'number' && !isNaN(pos.x) ? pos.x : defaultPos.x, 
        top: typeof pos?.y === 'number' && !isNaN(pos.y) ? pos.y : defaultPos.y, 
        zIndex: 99999,
        opacity: widgetOpacity,
        background: `rgba(25, 30, 42, ${Math.min(0.98, Math.max(0.88, widgetOpacity))})`,
        padding: isMinimized ? '0.4rem 0.8rem' : '0.5rem',
        borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        border: `1px solid rgba(255,255,255,${Math.max(0.08, widgetOpacity * 0.15)})`,
        width: `${widgetWidth}px`, maxWidth: 'min(90vw, 500px)', minWidth: '220px',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        maxHeight: isMinimized ? 'none' : `min(${widgetHeight}px, calc(100vh - 20px))`,
        transition: isDragging ? 'none' : 'opacity 0.15s ease',
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT' || (e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.resize-handle')) return;
        setIsDragging(true);
        dragStart.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => { if (isDragging) setPos({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y }); }}
      onPointerUp={() => setIsDragging(false)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingBottom: '0.35rem', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '0.35rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'move' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
            <span style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '0.72rem' }}>🏟️ Arena Debug</span>
            {windowWidth !== undefined && (
              <span style={{ fontSize: '0.55rem', color: '#94a3b8', background: 'rgba(0,0,0,0.4)', padding: '0.05rem 0.3rem', borderRadius: '4px', fontFamily: 'monospace' }} title="Largura atual da tela">
                {windowWidth}px
              </span>
            )}
            <span
              style={{
                fontSize: '0.58rem',
                fontWeight: 'bold',
                padding: '0.1rem 0.35rem',
                borderRadius: '4px',
                background: activeModeKey.startsWith('3d') ? 'rgba(6,182,212,0.2)' : 'rgba(139,92,246,0.2)',
                color: activeModeKey.startsWith('3d') ? '#22d3ee' : '#c084fc',
                border: `1px solid ${activeModeKey.startsWith('3d') ? 'rgba(6,182,212,0.4)' : 'rgba(139,92,246,0.4)'}`,
              }}
            >
              {activeModeKey === '3d_desktop' && '🧱 3D Desk'}
              {activeModeKey === '3d_mobile' && '🧱 3D Mob'}
              {activeModeKey === '2d_desktop' && '🖼️ 2D Desk'}
              {activeModeKey === '2d_mobile' && '🖼️ 2D Mob'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {/* Controle de Transparência da Janela */}
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '2px', 
                background: 'rgba(0,0,0,0.45)', 
                border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: '5px', 
                padding: '1px 4px' 
              }}
              title="Ajuste de Transparência da Janela (clique no ícone para alternar rápido: 95% -> 50% -> 25%)"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setWidgetOpacity(prev => {
                    if (prev > 0.8) return 0.5;
                    if (prev > 0.4) return 0.25;
                    return 0.95;
                  });
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.62rem',
                  padding: '0',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Alternar transparência rápida (100% -> 50% -> 25%)"
              >
                🪟
              </button>
              <input
                ref={opacityInputRef}
                type="range"
                tabIndex={-1}
                min="0.2"
                max="1"
                step="0.05"
                value={widgetOpacity}
                onChange={(e) => setWidgetOpacity(parseFloat(e.target.value))}
                onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); }}
                onFocus={(e) => e.currentTarget.blur()}
                onPointerUp={(e) => e.currentTarget.blur()}
                onMouseUp={(e) => e.currentTarget.blur()}
                style={{
                  width: '40px',
                  height: '8px',
                  accentColor: '#10b981',
                  cursor: 'pointer',
                }}
                title={`Opacidade da janela: ${Math.round(widgetOpacity * 100)}%`}
              />
              <span style={{ fontSize: '0.52rem', color: '#10b981', fontFamily: 'monospace', minWidth: '22px', textAlign: 'right' }}>
                {Math.round(widgetOpacity * 100)}%
              </span>
            </div>

            <button onClick={() => setIsMinimized(v => !v)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.7rem', padding: '0 0.2rem' }}>
              {isMinimized ? '▼' : '▲'}
            </button>
          </div>
        </div>

        {onSelectMode ? (
          <div style={{ display: 'flex', gap: '2px', background: 'rgba(0,0,0,0.5)', padding: '2px', borderRadius: '6px' }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelectMode('auto'); }}
              style={{
                flex: 1,
                fontSize: '0.55rem',
                padding: '0.12rem 0.2rem',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                background: manualModeOverride === null ? '#475569' : 'transparent',
                color: manualModeOverride === null ? '#ffffff' : '#64748b',
                whiteSpace: 'nowrap',
              }}
              title="Automático: segue o redimensionamento do navegador e o botão 2D/3D da arena"
            >
              🔄 Auto
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelectMode('3d_desktop'); }}
              style={{
                flex: 1,
                fontSize: '0.55rem',
                padding: '0.12rem 0.2rem',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                background: activeModeKey === '3d_desktop' ? '#0284c7' : 'transparent',
                color: activeModeKey === '3d_desktop' ? '#ffffff' : '#64748b',
                boxShadow: activeModeKey === '3d_desktop' ? '0 0 6px rgba(2,132,199,0.6)' : 'none',
                whiteSpace: 'nowrap',
              }}
              title="Calibrar perfil 3D Desktop"
            >
              🧱 3D D
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelectMode('3d_mobile'); }}
              style={{
                flex: 1,
                fontSize: '0.55rem',
                padding: '0.12rem 0.2rem',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                background: activeModeKey === '3d_mobile' ? '#059669' : 'transparent',
                color: activeModeKey === '3d_mobile' ? '#ffffff' : '#64748b',
                boxShadow: activeModeKey === '3d_mobile' ? '0 0 6px rgba(5,150,105,0.6)' : 'none',
                whiteSpace: 'nowrap',
              }}
              title="Calibrar perfil 3D Mobile"
            >
              🧱 3D M
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelectMode('2d_desktop'); }}
              style={{
                flex: 1,
                fontSize: '0.55rem',
                padding: '0.12rem 0.2rem',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                background: activeModeKey === '2d_desktop' ? '#7c3aed' : 'transparent',
                color: activeModeKey === '2d_desktop' ? '#ffffff' : '#64748b',
                boxShadow: activeModeKey === '2d_desktop' ? '0 0 6px rgba(124,58,237,0.6)' : 'none',
                whiteSpace: 'nowrap',
              }}
              title="Calibrar perfil 2D Desktop"
            >
              🖼️ 2D D
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelectMode('2d_mobile'); }}
              style={{
                flex: 1,
                fontSize: '0.55rem',
                padding: '0.12rem 0.2rem',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                background: activeModeKey === '2d_mobile' ? '#d97706' : 'transparent',
                color: activeModeKey === '2d_mobile' ? '#ffffff' : '#64748b',
                boxShadow: activeModeKey === '2d_mobile' ? '0 0 6px rgba(217,119,6,0.6)' : 'none',
                whiteSpace: 'nowrap',
              }}
              title="Calibrar perfil 2D Mobile"
            >
              🖼️ 2D M
            </button>
          </div>
        ) : onSwitchDevice ? (
          <div style={{ display: 'flex', gap: '2px', background: 'rgba(0,0,0,0.5)', padding: '2px', borderRadius: '6px' }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSwitchDevice('desktop'); }}
              style={{ flex: 1, fontSize: '0.58rem', padding: '0.1rem 0.35rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 'bold', background: deviceKey === 'desktop' ? '#2563eb' : 'transparent', color: deviceKey === 'desktop' ? '#ffffff' : '#64748b' }}
            >
              🖥️ Desk
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSwitchDevice('mobile'); }}
              style={{ flex: 1, fontSize: '0.58rem', padding: '0.1rem 0.35rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 'bold', background: deviceKey === 'mobile' ? '#059669' : 'transparent', color: deviceKey === 'mobile' ? '#ffffff' : '#64748b' }}
            >
              📱 Mob
            </button>
          </div>
        ) : null}
      </div>
      {!isMinimized && (
        <div 
          ref={scrollContainerRef}
          className="arena-debug-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingRight: '0.65rem',
            paddingLeft: '0.1rem',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(245, 158, 11, 0.4) transparent',
            overscrollBehavior: 'contain'
          }}
        >
          {children}
        </div>
      )}
      {!isMinimized && (
        <div
          className="resize-handle"
          style={{ position: 'absolute', bottom: 0, right: 0, width: '18px', height: '18px', cursor: 'nwse-resize', zIndex: 10 }}
          onPointerDown={(e) => {
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            const startW = widgetWidth;
            const startH = widgetHeight;
            const onMove = (ev: PointerEvent) => {
              setWidgetWidth(Math.max(200, Math.min(500, startW + (ev.clientX - startX))));
              setWidgetHeight(Math.max(200, Math.min(800, startH + (ev.clientY - startY))));
            };
            const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ opacity: 0.4 }}><path d="M14 18L18 14M10 18L18 10M6 18L18 6" stroke="#94a3b8" strokeWidth="1.5" fill="none"/></svg>
        </div>
      )}
    </div>,
    document.body
  );
};

const Slider = ({ label, value, onChange, min, max, step = 1, unit = '' }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string }) => {
  const getDecimals = (s: number) => (s < 0.1 ? 2 : (s < 1 ? 1 : 0));
  const [localVal, setLocalVal] = useState<string>(() => (isNaN(value) ? '0' : value.toFixed(getDecimals(step))));
  const rangeRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalVal(isNaN(value) ? '0' : value.toFixed(getDecimals(step)));
  }, [value, step]);

  useEffect(() => {
    const blockWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const rEl = rangeRef.current;
    const tEl = textRef.current;
    if (rEl) rEl.addEventListener('wheel', blockWheel, { passive: false });
    if (tEl) tEl.addEventListener('wheel', blockWheel, { passive: false });
    return () => {
      if (rEl) rEl.removeEventListener('wheel', blockWheel);
      if (tEl) tEl.removeEventListener('wheel', blockWheel);
    };
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.18rem', width: '100%', boxSizing: 'border-box' }}>
      <span style={{ fontSize: '0.65rem', color: '#94a3b8', minWidth: '50px', flexShrink: 0, whiteSpace: 'nowrap' }}>{label}</span>
      <input 
        ref={rangeRef}
        type="range" 
        tabIndex={-1}
        min={min} 
        max={max} 
        step={step} 
        value={isNaN(value) ? 0 : value} 
        onChange={e => {
          const v = parseFloat(e.target.value);
          onChange(v);
        }} 
        onFocus={e => e.currentTarget.blur()}
        onPointerDown={e => {
          e.stopPropagation();
          (e.target as HTMLElement)?.blur();
        }}
        onPointerUp={e => e.currentTarget.blur()}
        onMouseDown={e => {
          e.stopPropagation();
        }}
        onMouseUp={e => e.currentTarget.blur()}
        onClick={e => e.currentTarget.blur()}
        style={{ flex: 1, minWidth: 0, height: '12px', accentColor: '#f59e0b', cursor: 'pointer' }} 
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '1px', flexShrink: 0 }}>
        <input
          ref={textRef}
          type="text"
          inputMode="decimal"
          value={localVal}
          onChange={e => {
            const raw = e.target.value;
            setLocalVal(raw);
            const num = parseFloat(raw.replace(',', '.'));
            if (!isNaN(num)) onChange(num);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onBlur={() => {
            const num = parseFloat(localVal.replace(',', '.'));
            if (isNaN(num)) {
              setLocalVal(value.toString());
            } else {
              setLocalVal(num.toFixed(getDecimals(step)));
            }
          }}
          style={{
            width: '42px',
            fontSize: '0.65rem',
            color: '#fbbf24',
            fontFamily: 'monospace',
            textAlign: 'right',
            background: 'rgba(0,0,0,0.45)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '4px',
            padding: '1px 2px',
          }}
        />
        {unit && <span style={{ fontSize: '0.58rem', color: '#94a3b8', minWidth: '10px' }}>{unit}</span>}
      </div>
    </div>
  );
};

interface ArenaDebugPanelProps {
  config: ArenaDebugConfig;
  onChange: (config: ArenaDebugConfig) => void;
  onSave: () => void;
  onTestPlayerBubble: () => void;
  onTestMonsterBubble: () => void;
  onTestProjectile?: () => void;
  onTestPlayerAttack?: () => void;
  onTestMonsterAttack?: () => void;
  isAdmin: boolean;
  activeModeKey?: ArenaModeKey;
  windowWidth?: number;
  manualModeOverride?: ArenaModeKey | null;
  onSelectMode?: (mode: ArenaModeKey | 'auto') => void;
  deviceKey?: 'mobile' | 'desktop';
  onSwitchDevice?: (device: 'mobile' | 'desktop') => void;
  currentMonsterModelUrl?: string | null;
}

const Toggle = ({ label, value, onChange: onToggle }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
    <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{label}</span>
    <button onClick={() => onToggle(!value)} style={{ padding: '0.15rem 0.5rem', background: value ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid var(--border-glass)', borderRadius: '4px', color: value ? '#10b981' : '#94a3b8', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 'bold' }}>
      {value ? 'ON' : 'OFF'}
    </button>
  </div>
);

export default function ArenaDebugPanel({ 
  config, 
  onChange, 
  onSave, 
  onTestPlayerBubble, 
  onTestMonsterBubble, 
  onTestProjectile,
  onTestPlayerAttack,
  onTestMonsterAttack,
  isAdmin, 
  activeModeKey = '3d_desktop', 
  windowWidth, 
  manualModeOverride = null,
  onSelectMode,
  deviceKey, 
  onSwitchDevice,
  currentMonsterModelUrl
}: ArenaDebugPanelProps) {
  const [tab, setTab] = useState<'player' | 'monster' | 'arena' | 'arena3d' | 'projectile' | 'combat' | 'visual' | 'render'>('player');

  // Garantir que campos novos existam (compatibilidade com cache antigo)
  const safeConfig: ArenaDebugConfig = {
    ...DEFAULT_ARENA_DEBUG,
    ...config,
    modelConfigs: config.modelConfigs || {},
    selectedModelUrl: config.selectedModelUrl || '',
    showBubbleOrigins: config.showBubbleOrigins ?? false,
    bubbleOriginSize: config.bubbleOriginSize ?? 30,
    showCoinArea: config.showCoinArea ?? false,
    noInstantKill: config.noInstantKill ?? false,
    adminImmortal: config.adminImmortal ?? false,
    monsterImmortal: config.monsterImmortal ?? false,
    forceCoinLoss: config.forceCoinLoss ?? false,
    forceRewards: config.forceRewards ?? false,
    guaranteedCrit: config.guaranteedCrit ?? false,
    enable3DArena: config.enable3DArena ?? false,
    biome3D: config.biome3D || 'plains',
    playerOffsetX3D: config.playerOffsetX3D ?? 0,
    playerOffsetY3D: config.playerOffsetY3D ?? 0,
    playerScale3D: config.playerScale3D ?? 1,
    monsterOffsetX3D: config.monsterOffsetX3D ?? 0,
    monsterOffsetY3D: config.monsterOffsetY3D ?? 0,
    monsterScale3D: config.monsterScale3D ?? 1,
    arenaGap3D: config.arenaGap3D ?? 0,
    cameraPitch3D: config.cameraPitch3D ?? 0,
    cameraDist3D: config.cameraDist3D ?? 0,
    cameraTargetY3D: config.cameraTargetY3D ?? 0,
    projStartX: config.projStartX ?? 0,
    projStartY: config.projStartY ?? 40,
    projTargetDist: config.projTargetDist ?? 0,
    projTargetY: config.projTargetY ?? 80,
    projArcHeight: config.projArcHeight ?? 245,
    showProjRange: config.showProjRange ?? false,
    // normaliza: 0 = automático; 150 era o default antigo, trata como automático
    attackDist: (config.attackDist === 150 || config.attackDist == null) ? 0 : config.attackDist,
  };

  const update = (key: keyof ArenaDebugConfig, value: any) => {
    const next = { ...safeConfig, [key]: value };
    onChange(next);
    // Dispara evento para o AvatarCharacter aplicar o enquadramento na hora (sem recarregar)
    if (['charCanvasW', 'charCanvasH', 'charZoom', 'charFit'].includes(key)) {
      window.dispatchEvent(new CustomEvent('arena-char-render', { detail: next }));
    }
  };

  const updateMultiple = (updates: Partial<ArenaDebugConfig>) => {
    const next = { ...safeConfig, ...updates };
    onChange(next);
    const keys = Object.keys(updates);
    if (keys.some(k => ['charCanvasW', 'charCanvasH', 'charZoom', 'charFit'].includes(k))) {
      window.dispatchEvent(new CustomEvent('arena-char-render', { detail: next }));
    }
  };

  const resetToMathematicalDefaults = () => {
    // Também reseta configurações customizadas de escala/offsets do modelo 3D atual se existir
    const updatedModelConfigs = { ...safeConfig.modelConfigs };
    if (currentMonsterModelUrl && updatedModelConfigs[currentMonsterModelUrl]) {
      updatedModelConfigs[currentMonsterModelUrl] = {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        shadowOffsetY: 0,
        shadowScale: 1
      };
    }

    const next: ArenaDebugConfig = {
      ...safeConfig,
      modelConfigs: updatedModelConfigs,
      playerOffsetX: 0,
      playerOffsetY: 0,
      monsterOffsetX: 0,
      monsterOffsetY: 0,
      playerOffsetX3D: 0,
      playerOffsetY3D: 0,
      monsterOffsetX3D: 0,
      monsterOffsetY3D: 0,
      playerScale: 1,
      monsterScale: 1,
      playerScale3D: 1,
      monsterScale3D: 1,
      arenaGap: 0,
      arenaGap3D: 0,
    };
    onChange(next);
    setTimeout(() => {
      onSave();
    }, 50);
  };

  if (!isAdmin) return null;

  const tabs = [
    { id: 'player' as const, label: '👤', color: '#3b82f6', title: 'Jogador 2D' },
    { id: 'monster' as const, label: '👹', color: '#ef4444', title: 'Monstro 2D' },
    { id: 'arena' as const, label: '🏟️', color: '#8b5cf6', title: 'Arena 2D' },
    { id: 'arena3d' as const, label: '🧱', color: '#06b6d4', title: 'Cenário 3D Voxel' },
    { id: 'projectile' as const, label: '⚡', color: '#f59e0b', title: 'Magia / Ataque à Distância' },
    { id: 'combat' as const, label: '⚔️', color: '#f87171', title: 'Combate' },
    { id: 'visual' as const, label: '🔲', color: '#94a3b8', title: 'Visual' },
    { id: 'render' as const, label: '🧍', color: '#10b981', title: 'Renderização do Avatar' },
  ];

  return (
    <DraggableWidget 
      id="arena_debug" 
      defaultPos={{ x: 20, y: 80 }} 
      activeModeKey={activeModeKey}
      windowWidth={windowWidth} 
      manualModeOverride={manualModeOverride}
      onSelectMode={onSelectMode}
      deviceKey={deviceKey}
      onSwitchDevice={onSwitchDevice}
    >
      {/* Informações de Resolução e Ancoragem Matemática */}
      <div style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(56, 189, 248, 0.35)', borderRadius: '6px', padding: '0.3rem 0.45rem', marginBottom: '0.35rem', display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.62rem', color: '#38bdf8', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '3px' }}>
            📐 Ancoragem Matemática
          </span>
          <span style={{ fontSize: '0.58rem', color: '#94a3b8', fontFamily: 'monospace', background: 'rgba(0,0,0,0.4)', padding: '1px 4px', borderRadius: '3px' }}>
            {windowWidth ? `${windowWidth}px` : (typeof window !== 'undefined' ? `${window.innerWidth}px` : '')}
          </span>
        </div>
        <div style={{ fontSize: '0.52rem', color: '#94a3b8', lineHeight: 1.2 }}>
          3D ancorado às pedras | 2D centralizado a 50%
        </div>
        <button
          type="button"
          onClick={resetToMathematicalDefaults}
          style={{
            marginTop: '2px',
            padding: '0.25rem 0.4rem',
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '4px',
            color: '#38bdf8',
            cursor: 'pointer',
            fontSize: '0.58rem',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            transition: 'all 0.15s'
          }}
          title="Zera offsets manuais (X=0, Y=0) e ativa o posicionamento puramente calibrado pelos cálculos 3D/2D"
        >
          🔄 Restaurar Padrões Calibrados (Zero Offsets)
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.2rem', marginBottom: '0.4rem', flexShrink: 0, alignItems: 'center', position: 'sticky', top: 0, zIndex: 5, background: 'rgba(30, 35, 45, 0.95)', paddingTop: '0.2rem', paddingBottom: '0.2rem' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} title={t.title} style={{ flex: 1, padding: '0.3rem 0.15rem', background: tab === t.id ? t.color : 'rgba(255,255,255,0.05)', border: `1px solid ${tab === t.id ? t.color : 'transparent'}`, borderRadius: '6px', color: tab === t.id ? '#fff' : '#94a3b8', cursor: 'pointer', fontSize: '0.75rem', textAlign: 'center' }}>
            {t.label}
          </button>
        ))}
        <button onClick={onSave} style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '6px', color: '#10b981', cursor: 'pointer', fontSize: '0.6rem', padding: '0.3rem 0.4rem', fontWeight: 'bold', flexShrink: 0 }} title="Salvar Globalmente">💾</button>
      </div>

      {/* Tab content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {tab === 'player' && (
          <>
            <Slider label="X" value={safeConfig.playerOffsetX} onChange={v => update('playerOffsetX', v)} min={-200} max={200} />
            <Slider label="Y" value={safeConfig.playerOffsetY} onChange={v => update('playerOffsetY', v)} min={-200} max={200} />
            <Slider label="Escala" value={safeConfig.playerScale} onChange={v => update('playerScale', v)} min={0.3} max={2} step={0.1} unit="x" />
            <Slider label="Nome X" value={safeConfig.playerNameX} onChange={v => update('playerNameX', v)} min={-300} max={300} />
            <Slider label="Nome Y" value={safeConfig.playerNameY} onChange={v => update('playerNameY', v)} min={-300} max={300} />
          </>
        )}

        {tab === 'monster' && (
          <>
            {activeModeKey.startsWith('3d') ? (
              <>
                <Slider label="X" value={safeConfig.monsterOffsetX3D ?? 0} onChange={v => update('monsterOffsetX3D', v)} min={-600} max={600} unit="px" />
                <Slider label="Elevação Y" value={safeConfig.monsterOffsetY3D ?? 0} onChange={v => update('monsterOffsetY3D', v)} min={-400} max={400} unit="px" />
                <Slider label="Escala" value={safeConfig.monsterScale3D ?? 1} onChange={v => updateMultiple({ monsterScale3D: v, monsterScale: v })} min={0.3} max={2.5} step={0.05} unit="x" />
              </>
            ) : (
              <>
                <Slider label="X" value={safeConfig.monsterOffsetX} onChange={v => update('monsterOffsetX', v)} min={-200} max={200} />
                <Slider label="Y" value={safeConfig.monsterOffsetY} onChange={v => update('monsterOffsetY', v)} min={-200} max={200} />
                <Slider label="Escala" value={safeConfig.monsterScale} onChange={v => updateMultiple({ monsterScale: v, monsterScale3D: v })} min={0.3} max={2} step={0.05} unit="x" />
              </>
            )}
            <Slider label="Nome X" value={safeConfig.monsterNameX} onChange={v => update('monsterNameX', v)} min={-300} max={300} />
            <Slider label="Nome Y" value={safeConfig.monsterNameY} onChange={v => update('monsterNameY', v)} min={-300} max={300} />

            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.4rem', marginTop: '0.3rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 'bold', marginBottom: '0.3rem' }}>💀 Posição da Fatalidade (onde o monstro morre)</div>
              <Slider label="Morte X" value={safeConfig.deathOffsetX} onChange={v => update('deathOffsetX', v)} min={-300} max={300} />
              <Slider label="Morte Y" value={safeConfig.deathOffsetY} onChange={v => update('deathOffsetY', v)} min={-300} max={300} />
              <Toggle label="Ver retângulo da fatalidade" value={safeConfig.showDeathArea} onChange={v => update('showDeathArea', v)} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.3rem' }}>
                <span style={{ fontSize: '0.65rem', color: '#94a3b8', minWidth: '58px', whiteSpace: 'nowrap' }}>Forçar:</span>
                <select 
                  value={safeConfig.forcedFatality} 
                  onChange={e => update('forcedFatality', e.target.value)} 
                  onFocus={e => e.currentTarget.blur()}
                  style={{ flex: 1, padding: '0.3rem 0.4rem', borderRadius: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.65rem' }}
                >
                  <option value="">🎲 Aleatória</option>
                  <option value="death-fall">Queda</option>
                  <option value="death-evaporate">Evaporar</option>
                  <option value="death-slice">Corte</option>
                  <option value="death-explode">Explosão</option>
                </select>
              </div>
              <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>Deslocamento em cima da posição normal do monstro. Ajuste até ele cair/evaporar/explodir no ponto exato do golpe.</div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.4rem', marginTop: '0.3rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#a78bfa', fontWeight: 'bold', marginBottom: '0.3rem' }}>🎯 Modelos .GLB</div>
              {currentMonsterModelUrl && (
                <div style={{ marginBottom: '0.3rem', padding: '0.25rem 0.4rem', background: 'rgba(139,92,246,0.15)', borderRadius: '4px', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem' }}>
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <div style={{ fontSize: '0.55rem', color: '#a78bfa', fontWeight: 'bold' }}>Monstro da Arena:</div>
                    <div style={{ fontSize: '0.58rem', color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '160px' }} title={currentMonsterModelUrl}>
                      {currentMonsterModelUrl.split('/').pop()?.substring(0, 24) || currentMonsterModelUrl}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                    {safeConfig.modelConfigs[currentMonsterModelUrl] && (
                      <button
                        type="button"
                        onClick={() => {
                          update('modelConfigs', {
                            ...safeConfig.modelConfigs,
                            [currentMonsterModelUrl]: { scale: 1, offsetX: 0, offsetY: 0, shadowOffsetY: 0, shadowScale: 1 }
                          });
                        }}
                        style={{ padding: '0.2rem 0.4rem', background: 'rgba(56,189,248,0.2)', border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8', borderRadius: '4px', cursor: 'pointer', fontSize: '0.58rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                        title="Restaurar tamanho padrão (1x centralizado) deste monstro"
                      >
                        🔄 1x Padrão
                      </button>
                    )}
                    {!safeConfig.modelConfigs[currentMonsterModelUrl] && (
                      <button
                        type="button"
                        onClick={() => {
                          updateMultiple({
                            modelConfigs: {
                              ...safeConfig.modelConfigs,
                              [currentMonsterModelUrl]: { scale: 1, offsetX: 0, offsetY: 0, shadowOffsetY: 0, shadowScale: 1 }
                            },
                            selectedModelUrl: currentMonsterModelUrl
                          });
                        }}
                        style={{ padding: '0.2rem 0.4rem', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.58rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                      >
                        + Ajustar Este
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.3rem' }}>
                <input type="text" value={safeConfig.selectedModelUrl} onChange={e => update('selectedModelUrl', e.target.value)} placeholder="URL do modelo .glb" style={{ flex: 1, padding: '0.3rem 0.5rem', borderRadius: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.65rem' }} />
                <button onClick={() => { if (safeConfig.selectedModelUrl && !safeConfig.modelConfigs[safeConfig.selectedModelUrl]) update('modelConfigs', { ...safeConfig.modelConfigs, [safeConfig.selectedModelUrl]: { scale: 1, offsetX: 0, offsetY: 0, shadowOffsetY: 0, shadowScale: 1 } }); }} style={{ padding: '0.3rem 0.5rem', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 'bold' }}>+</button>
              </div>
              {Object.entries(safeConfig.modelConfigs).map(([url, cfg]) => (
                <div key={url} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '0.4rem', marginBottom: '0.3rem', border: safeConfig.selectedModelUrl === url ? '1px solid #8b5cf6' : '1px solid transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span onClick={() => update('selectedModelUrl', url)} style={{ fontSize: '0.6rem', color: '#a78bfa', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }} title={url}>{url.split('/').pop()?.substring(0, 25) || url}</span>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <button 
                        type="button" 
                        onClick={() => update('modelConfigs', { ...safeConfig.modelConfigs, [url]: { scale: 1, offsetX: 0, offsetY: 0, shadowOffsetY: 0, shadowScale: 1 } })} 
                        style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.35)', color: '#38bdf8', cursor: 'pointer', padding: '0.1rem 0.35rem', borderRadius: '3px', fontSize: '0.55rem', fontWeight: 'bold' }} 
                        title="Restaurar tamanho padrão (1x centralizado)"
                      >
                        🔄 1x
                      </button>
                      <button onClick={() => { const nc = { ...safeConfig.modelConfigs }; delete nc[url]; updateMultiple({ modelConfigs: nc, ...(safeConfig.selectedModelUrl === url ? { selectedModelUrl: '' } : {}) }); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 0.2rem', fontSize: '0.7rem' }}>✕</button>
                    </div>
                  </div>
                  <Slider label="Escala" value={cfg.scale} onChange={v => update('modelConfigs', { ...safeConfig.modelConfigs, [url]: { ...cfg, scale: v } })} min={0.1} max={5} step={0.05} unit="x" />
                  <Slider label="X" value={cfg.offsetX} onChange={v => update('modelConfigs', { ...safeConfig.modelConfigs, [url]: { ...cfg, offsetX: v } })} min={-300} max={300} />
                  <Slider label="Y" value={cfg.offsetY} onChange={v => update('modelConfigs', { ...safeConfig.modelConfigs, [url]: { ...cfg, offsetY: v } })} min={-300} max={300} />
                  <Slider label="Sombra Y" value={cfg.shadowOffsetY ?? 0} onChange={v => update('modelConfigs', { ...safeConfig.modelConfigs, [url]: { ...cfg, shadowOffsetY: v } })} min={-100} max={100} unit="px" />
                  <Slider label="Sombra Tam." value={cfg.shadowScale ?? 1} onChange={v => update('modelConfigs', { ...safeConfig.modelConfigs, [url]: { ...cfg, shadowScale: v } })} min={0.2} max={3} step={0.05} unit="x" />
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'arena' && (
          <>
            <Slider label="Altura" value={safeConfig.arenaHeight} onChange={v => update('arenaHeight', v)} min={150} max={768} unit="px" />
            <Slider label="Topo" value={safeConfig.arenaPaddingTop} onChange={v => update('arenaPaddingTop', v)} min={0} max={200} unit="px" />
            <Slider label="Gap" value={safeConfig.arenaGap} onChange={v => update('arenaGap', v)} min={-100} max={100} unit="px" />
            <Slider label="Ataque" value={safeConfig.attackDist} onChange={v => update('attackDist', v)} min={0} max={1500} step={5} unit="px" />
            <div style={{ fontSize: '0.58rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
              {safeConfig.attackDist === 0 ? '✨ 0 = Automático (distância calculada até o oponente)' : `🎯 Distância configurada: ${safeConfig.attackDist}px`}
            </div>
            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.4rem', marginTop: '0.3rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#fbbf24', fontWeight: 'bold', marginBottom: '0.3rem' }}>💰 Área de Moedas (%)</div>
              <Toggle label="Ver área" value={safeConfig.showCoinArea} onChange={v => update('showCoinArea', v)} />
              <Slider label="X" value={safeConfig.coinAreaX} onChange={v => update('coinAreaX', v)} min={0} max={100} unit="%" />
              <Slider label="Y" value={safeConfig.coinAreaY} onChange={v => update('coinAreaY', v)} min={0} max={100} unit="%" />
              <Slider label="Largura" value={safeConfig.coinAreaW} onChange={v => update('coinAreaW', v)} min={10} max={100} unit="%" />
              <Slider label="Altura" value={safeConfig.coinAreaH} onChange={v => update('coinAreaH', v)} min={10} max={100} unit="%" />
            </div>
            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.4rem', marginTop: '0.3rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#3b82f6', fontWeight: 'bold', marginBottom: '0.3rem' }}>💧 Queda de Moedas do Jogador (%)</div>
              <Toggle label="Ver área" value={safeConfig.showPlayerCoinArea} onChange={v => update('showPlayerCoinArea', v)} />
              <Slider label="X" value={safeConfig.playerCoinAreaX} onChange={v => update('playerCoinAreaX', v)} min={0} max={100} unit="%" />
              <Slider label="Y" value={safeConfig.playerCoinAreaY} onChange={v => update('playerCoinAreaY', v)} min={0} max={100} unit="%" />
              <Slider label="Largura" value={safeConfig.playerCoinAreaW} onChange={v => update('playerCoinAreaW', v)} min={10} max={100} unit="%" />
              <Slider label="Altura" value={safeConfig.playerCoinAreaH} onChange={v => update('playerCoinAreaH', v)} min={10} max={100} unit="%" />
            </div>
          </>
        )}

        {tab === 'arena3d' && (
          <>
            <div style={{ fontSize: '0.7rem', color: '#06b6d4', fontWeight: 'bold', marginBottom: '0.2rem' }}>🧱 Cenário 3D Voxel (Minecraft)</div>
            <Toggle label="Ativar Modo 3D" value={!!safeConfig.enable3DArena} onChange={v => update('enable3DArena', v)} />

            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.4rem', marginTop: '0.3rem' }}>
              <div style={{ fontSize: '0.68rem', color: '#3b82f6', fontWeight: 'bold', marginBottom: '0.2rem' }}>👤 Jogador no 3D</div>
              <Slider label="X" value={safeConfig.playerOffsetX3D ?? 0} onChange={v => update('playerOffsetX3D', v)} min={-600} max={600} unit="px" />
              <Slider label="Elevação Y" value={safeConfig.playerOffsetY3D ?? 0} onChange={v => update('playerOffsetY3D', v)} min={-400} max={400} unit="px" />
              <Slider label="Escala" value={safeConfig.playerScale3D ?? 1} onChange={v => update('playerScale3D', v)} min={0.3} max={2.5} step={0.05} unit="x" />
            </div>

            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.4rem', marginTop: '0.3rem' }}>
              <div style={{ fontSize: '0.68rem', color: '#ef4444', fontWeight: 'bold', marginBottom: '0.2rem' }}>👹 Monstro no 3D</div>
              <Slider label="X" value={safeConfig.monsterOffsetX3D ?? 0} onChange={v => update('monsterOffsetX3D', v)} min={-600} max={600} unit="px" />
              <Slider label="Elevação Y" value={safeConfig.monsterOffsetY3D ?? 0} onChange={v => update('monsterOffsetY3D', v)} min={-400} max={400} unit="px" />
              <Slider label="Escala" value={safeConfig.monsterScale3D ?? 1} onChange={v => updateMultiple({ monsterScale3D: v, monsterScale: v })} min={0.3} max={2.5} step={0.05} unit="x" />
            </div>

            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.4rem', marginTop: '0.3rem' }}>
              <div style={{ fontSize: '0.68rem', color: '#8b5cf6', fontWeight: 'bold', marginBottom: '0.2rem' }}>🏟️ Arena & Distância 3D</div>
              <Slider label="Gap 3D" value={safeConfig.arenaGap3D ?? 0} onChange={v => update('arenaGap3D', v)} min={-400} max={600} unit="px" />
              <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.3rem', marginTop: '0.3rem' }}>
                <div style={{ fontSize: '0.65rem', color: '#f97316', fontWeight: 'bold', marginBottom: '0.2rem' }}>⚔️ Distância do Golpe Corpo a Corpo</div>
                <Slider label="Ataque" value={safeConfig.attackDist} onChange={v => update('attackDist', v)} min={0} max={1500} step={5} unit="px" />
                <div style={{ fontSize: '0.58rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                  {safeConfig.attackDist === 0 ? '✨ 0 = Automático (distância calculada pelos modelos 3D)' : `🎯 Distância configurada: ${safeConfig.attackDist}px`}
                </div>
                {onTestPlayerAttack && (
                  <button
                    onClick={onTestPlayerAttack}
                    style={{ width: '100%', padding: '0.4rem', background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.5)', borderRadius: '6px', color: '#60a5fa', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 'bold', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                  >
                    ⚔️ Testar Ataque do Jogador
                  </button>
                )}
                {onTestMonsterAttack && (
                  <button
                    onClick={onTestMonsterAttack}
                    style={{ width: '100%', padding: '0.4rem', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: '6px', color: '#f87171', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                  >
                    👹 Testar Ataque do Monstro
                  </button>
                )}
              </div>
            </div>

            {/* O bioma é definido nas Configurações da Missão (Cenário da Arena). O Arena Debug
                não altera mais o bioma para não sobrescrever a escolha da missão. */}

            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.4rem', marginTop: '0.3rem' }}>
              <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 'bold', marginBottom: '0.2rem' }}>🎥 Câmera & Profundidade 3D</div>
              <Slider label="Profundidade" value={safeConfig.cameraPitch3D ?? 0} onChange={v => update('cameraPitch3D', v)} min={-15} max={30} step={0.5} unit="°" />
              <div style={{ fontSize: '0.58rem', color: '#94a3b8', marginBottom: '0.2rem' }}>
                {safeConfig.cameraPitch3D === 0 ? '✨ 0 = Inclinação isométrica ideal (~15.6°)' : `📐 Ajuste de ângulo: ${safeConfig.cameraPitch3D > 0 ? '+' : ''}${safeConfig.cameraPitch3D}°`}
              </div>
              <Slider label="Distância" value={safeConfig.cameraDist3D ?? 0} onChange={v => update('cameraDist3D', v)} min={-8} max={12} step={0.5} />
              <Slider label="Alvo Y" value={safeConfig.cameraTargetY3D ?? 0} onChange={v => update('cameraTargetY3D', v)} min={-3} max={4} step={0.1} />
              <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                Ajuste a inclinação para exibir as camadas de blocos com profundidade 3D profunda no mobile e desktop. Clique no 💾 para salvar separadamente.
              </div>
            </div>
          </>
        )}

        {tab === 'projectile' && (
          <>
            <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 'bold', marginBottom: '0.2rem' }}>⚡ Golpes de Longo Alcance / Magias</div>
            <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginBottom: '0.4rem' }}>
              Calibre o ponto de origem no monstro, a altura da parábola no céu e onde o projétil atinge o peito do jogador. Você pode deslizar ou digitar o número exato.
            </div>

            <Toggle label="Ver campo de ação / range" value={!!safeConfig.showProjRange} onChange={v => update('showProjRange', v)} />

            <Slider label="Origem X" value={safeConfig.projStartX ?? 0} onChange={v => update('projStartX', v)} min={-1500} max={1500} unit="px" />
            <Slider label="Origem Y" value={safeConfig.projStartY ?? 40} onChange={v => update('projStartY', v)} min={-300} max={800} unit="px" />
            <Slider label="Alcance" value={safeConfig.projTargetDist ?? 0} onChange={v => update('projTargetDist', v)} min={0} max={3000} unit="px" />
            <div style={{ fontSize: '0.58rem', color: '#94a3b8', marginBottom: '0.2rem' }}>
              {safeConfig.projTargetDist === 0 ? '✨ 0 = Automático pela distância da arena' : `🎯 Alcance fixo em ${safeConfig.projTargetDist}px`}
            </div>
            <Slider label="Impacto Y" value={safeConfig.projTargetY ?? 80} onChange={v => update('projTargetY', v)} min={-300} max={800} unit="px" />
            <Slider label="Arco Céu" value={safeConfig.projArcHeight ?? 245} onChange={v => update('projArcHeight', v)} min={20} max={1200} unit="px" />

            {onTestProjectile && (
              <button
                onClick={onTestProjectile}
                style={{ width: '100%', padding: '0.45rem', background: 'rgba(245,158,11,0.25)', border: '1px solid rgba(245,158,11,0.6)', borderRadius: '6px', color: '#f59e0b', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold', marginTop: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
              >
                ⚡ Testar Golpe à Distância
              </button>
            )}
          </>
        )}

        {tab === 'combat' && (
          <>
            <Toggle label="Sem 1-hit kill" value={safeConfig.noInstantKill} onChange={v => update('noInstantKill', v)} />
            <Toggle label="Admin imortal" value={safeConfig.adminImmortal} onChange={v => update('adminImmortal', v)} />
            <Toggle label="Monstro imortal" value={safeConfig.monsterImmortal} onChange={v => update('monsterImmortal', v)} />
            <Toggle label="Forçar perda de moedas" value={safeConfig.forceCoinLoss} onChange={v => update('forceCoinLoss', v)} />
            <Toggle label="Admin recebe recompensas (teste)" value={safeConfig.forceRewards} onChange={v => update('forceRewards', v)} />
            <Toggle label="Crítico garantido (teste)" value={safeConfig.guaranteedCrit} onChange={v => update('guaranteedCrit', v)} />

            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.4rem', marginTop: '0.3rem' }}>
              <div style={{ fontSize: '0.68rem', color: '#f97316', fontWeight: 'bold', marginBottom: '0.2rem' }}>⚔️ Distância do Golpe Corpo a Corpo</div>
              <Slider label="Ataque" value={safeConfig.attackDist} onChange={v => update('attackDist', v)} min={0} max={1500} step={5} unit="px" />
              <div style={{ fontSize: '0.58rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                {safeConfig.attackDist === 0 ? '✨ 0 = Automático (distância calculada até o oponente)' : `🎯 Distância configurada: ${safeConfig.attackDist}px`}
              </div>
              {onTestPlayerAttack && (
                <button
                  onClick={onTestPlayerAttack}
                  style={{ width: '100%', padding: '0.4rem', background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.5)', borderRadius: '6px', color: '#60a5fa', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 'bold', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                >
                  ⚔️ Testar Ataque do Jogador
                </button>
              )}
              {onTestMonsterAttack && (
                <button
                  onClick={onTestMonsterAttack}
                  style={{ width: '100%', padding: '0.4rem', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: '6px', color: '#f87171', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                >
                  👹 Testar Ataque do Monstro
                </button>
              )}
            </div>
          </>
        )}

        {tab === 'visual' && (
          <>
            <Toggle label="Bounding Boxes" value={safeConfig.showBoxes} onChange={v => update('showBoxes', v)} />
            <Toggle label="Origem das falas" value={safeConfig.showBubbleOrigins} onChange={v => update('showBubbleOrigins', v)} />
            {safeConfig.showBubbleOrigins && <Slider label="Tamanho" value={safeConfig.bubbleOriginSize} onChange={v => update('bubbleOriginSize', v)} min={10} max={80} unit="px" />}

            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.4rem', marginTop: '0.3rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#3b82f6', fontWeight: 'bold', marginBottom: '0.3rem' }}>💬 Balão do Jogador</div>
              <Slider label="Largura" value={safeConfig.playerBubbleMaxWidth} onChange={v => update('playerBubbleMaxWidth', v)} min={80} max={400} unit="px" />
              <Slider label="Fonte" value={safeConfig.playerBubbleFontSize} onChange={v => update('playerBubbleFontSize', v)} min={8} max={24} unit="px" />
              <Slider label="Pos X" value={safeConfig.playerBubbleX} onChange={v => update('playerBubbleX', v)} min={-300} max={300} />
              <Slider label="Pos Y" value={safeConfig.playerBubbleY} onChange={v => update('playerBubbleY', v)} min={-300} max={300} />
              <Slider label="Girar" value={safeConfig.playerBubbleRotate} onChange={v => update('playerBubbleRotate', v)} min={-45} max={45} unit="°" />
              <Toggle label="Sempre visível" value={safeConfig.playerBubbleAlwaysOn} onChange={v => update('playerBubbleAlwaysOn', v)} />
              <button onClick={onTestPlayerBubble} style={{ width: '100%', padding: '0.3rem', background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', borderRadius: '4px', color: '#3b82f6', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 'bold', marginTop: '0.2rem' }}>👤 Testar Fala</button>
            </div>

            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.4rem', marginTop: '0.3rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 'bold', marginBottom: '0.3rem' }}>💬 Balão do Monstro</div>
              <Slider label="Largura" value={safeConfig.monsterBubbleMaxWidth} onChange={v => update('monsterBubbleMaxWidth', v)} min={80} max={400} unit="px" />
              <Slider label="Fonte" value={safeConfig.monsterBubbleFontSize} onChange={v => update('monsterBubbleFontSize', v)} min={8} max={24} unit="px" />
              <Slider label="Pos X" value={safeConfig.monsterBubbleX} onChange={v => update('monsterBubbleX', v)} min={-300} max={300} />
              <Slider label="Pos Y" value={safeConfig.monsterBubbleY} onChange={v => update('monsterBubbleY', v)} min={-300} max={300} />
              <Slider label="Girar" value={safeConfig.monsterBubbleRotate} onChange={v => update('monsterBubbleRotate', v)} min={-45} max={45} unit="°" />
              <Toggle label="Sempre visível" value={safeConfig.monsterBubbleAlwaysOn} onChange={v => update('monsterBubbleAlwaysOn', v)} />
              <button onClick={onTestMonsterBubble} style={{ width: '100%', padding: '0.3rem', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '4px', color: '#ef4444', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 'bold', marginTop: '0.2rem' }}>👹 Testar Fala</button>
            </div>
          </>
        )}

        {tab === 'render' && (
          <>
            <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 'bold', marginBottom: '0.3rem' }}>🧍 Renderização do Personagem (canvas 3D)</div>
            <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginBottom: '0.4rem' }}>
              Ajuste o tamanho do canvas e o enquadramento do boneco para as armas não cortarem nas bordas. Aplica em tempo real e salva globalmente com 💾.
            </div>
            <Slider label="Largura" value={safeConfig.charCanvasW} onChange={v => update('charCanvasW', v)} min={0.6} max={2.5} step={0.05} unit="x" />
            <Slider label="Altura" value={safeConfig.charCanvasH} onChange={v => update('charCanvasH', v)} min={0.6} max={2.5} step={0.05} unit="x" />
            <Slider label="Zoom" value={safeConfig.charZoom} onChange={v => update('charZoom', v)} min={0.4} max={2.5} step={0.05} unit="x" />
            <Slider label="Fit" value={safeConfig.charFit} onChange={v => update('charFit', v)} min={35} max={140} step={1} unit="" />
            <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.3rem' }}>
              Largura/Altura = tamanho do canvas (mais área). Zoom = tamanho do boneco. Fit = distância da câmera. O corte de armas acontece quando o canvas é estreito — aumente a Largura.
            </div>
          </>
        )}
      </div>
    </DraggableWidget>
  );
}
