import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ModelTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
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
  attackDist: 150,
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
};

const DraggableWidget = ({ id, defaultPos, children, deviceKey }: { id: string; defaultPos: { x: number; y: number }; children: React.ReactNode; deviceKey?: string }) => {
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
    return saved && !isNaN(parseInt(saved)) ? parseInt(saved) : 260;
  });
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    localStorage.setItem(`arenaDebug_widgetPos_${id}`, JSON.stringify(pos));
  }, [pos, id]);

  useEffect(() => {
    localStorage.setItem(`arenaDebug_widgetH_${id}`, widgetHeight.toString());
  }, [widgetHeight, id]);

  useEffect(() => {
    localStorage.setItem(`arenaDebug_widgetW_${id}`, widgetWidth.toString());
  }, [widgetWidth, id]);

  // Prevent body scroll from fixed widget
  useEffect(() => {
    document.documentElement.style.overflowX = 'hidden';
    return () => { document.documentElement.style.overflowX = ''; };
  }, []);

  return createPortal(
    <div
      style={{
        position: 'fixed', 
        left: typeof pos?.x === 'number' && !isNaN(pos.x) ? pos.x : defaultPos.x, 
        top: typeof pos?.y === 'number' && !isNaN(pos.y) ? pos.y : defaultPos.y, 
        zIndex: 99999,
        background: 'rgba(30, 35, 45, 0.95)', backdropFilter: 'blur(10px)',
        padding: isMinimized ? '0.4rem 0.8rem' : '0.5rem',
        borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.1)',
        width: `${widgetWidth}px`, maxWidth: 'min(90vw, 500px)', minWidth: '200px',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        maxHeight: isMinimized ? 'none' : `min(${widgetHeight}px, calc(100vh - 20px))`,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'move', flexShrink: 0, paddingBottom: '0.3rem' }}>
        <span style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '0.7rem' }}>🏟️ Arena Debug {deviceKey && <span style={{ fontSize: '0.6rem', color: deviceKey === 'mobile' ? '#10b981' : '#3b82f6', background: deviceKey === 'mobile' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)', padding: '0.1rem 0.4rem', borderRadius: '4px', marginLeft: '0.3rem' }}>{deviceKey === 'mobile' ? '📱 Mobile' : '🖥️ Desktop'}</span>}</span>
        <button onClick={() => setIsMinimized(v => !v)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.7rem', padding: '0 0.2rem' }}>
          {isMinimized ? '▼' : '▲'}
        </button>
      </div>
      {!isMinimized && (
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingRight: '0.5rem' }}>
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

const Slider = ({ label, value, onChange, min, max, step = 1, unit = '' }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
    <span style={{ fontSize: '0.65rem', color: '#94a3b8', minWidth: '50px', whiteSpace: 'nowrap' }}>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ flex: 1, height: '12px' }} />
    <span style={{ fontSize: '0.65rem', color: '#fbbf24', fontFamily: 'monospace', minWidth: '35px', textAlign: 'right' }}>{value.toFixed(step < 1 ? 1 : 0)}{unit}</span>
  </div>
);

interface ArenaDebugPanelProps {
  config: ArenaDebugConfig;
  onChange: (config: ArenaDebugConfig) => void;
  onSave: () => void;
  onTestPlayerBubble: () => void;
  onTestMonsterBubble: () => void;
  isAdmin: boolean;
  deviceKey?: string;
}

const Toggle = ({ label, value, onChange: onToggle }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
    <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{label}</span>
    <button onClick={() => onToggle(!value)} style={{ padding: '0.15rem 0.5rem', background: value ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid var(--border-glass)', borderRadius: '4px', color: value ? '#10b981' : '#94a3b8', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 'bold' }}>
      {value ? 'ON' : 'OFF'}
    </button>
  </div>
);

export default function ArenaDebugPanel({ config, onChange, onSave, onTestPlayerBubble, onTestMonsterBubble, isAdmin, deviceKey }: ArenaDebugPanelProps) {
  const [tab, setTab] = useState<'player' | 'monster' | 'arena' | 'combat' | 'visual' | 'render'>('player');

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
  };

  const update = (key: keyof ArenaDebugConfig, value: any) => {
    const next = { ...safeConfig, [key]: value };
    onChange(next);
    // Dispara evento para o AvatarCharacter aplicar o enquadramento na hora (sem recarregar)
    if (['charCanvasW', 'charCanvasH', 'charZoom', 'charFit'].includes(key)) {
      window.dispatchEvent(new CustomEvent('arena-char-render', { detail: next }));
    }
  };

  if (!isAdmin) return null;

  const tabs = [
    { id: 'player' as const, label: '👤', color: '#3b82f6' },
    { id: 'monster' as const, label: '👹', color: '#ef4444' },
    { id: 'arena' as const, label: '🏟️', color: '#8b5cf6' },
    { id: 'combat' as const, label: '⚔️', color: '#f87171' },
    { id: 'visual' as const, label: '🔲', color: '#94a3b8' },
    { id: 'render' as const, label: '🧍', color: '#10b981' },
  ];

  return (
    <DraggableWidget id="arena_debug" defaultPos={{ x: 20, y: 80 }} deviceKey={deviceKey}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.2rem', marginBottom: '0.4rem', flexShrink: 0, alignItems: 'center', position: 'sticky', top: 0, zIndex: 5, background: 'rgba(30, 35, 45, 0.95)', paddingTop: '0.2rem', paddingBottom: '0.2rem' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: '0.3rem 0.2rem', background: tab === t.id ? t.color : 'rgba(255,255,255,0.05)', border: `1px solid ${tab === t.id ? t.color : 'transparent'}`, borderRadius: '6px', color: tab === t.id ? '#fff' : '#94a3b8', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'center' }}>
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
            <Slider label="X" value={safeConfig.monsterOffsetX} onChange={v => update('monsterOffsetX', v)} min={-200} max={200} />
            <Slider label="Y" value={safeConfig.monsterOffsetY} onChange={v => update('monsterOffsetY', v)} min={-200} max={200} />
            <Slider label="Escala" value={safeConfig.monsterScale} onChange={v => update('monsterScale', v)} min={0.3} max={2} step={0.1} unit="x" />
            <Slider label="Nome X" value={safeConfig.monsterNameX} onChange={v => update('monsterNameX', v)} min={-300} max={300} />
            <Slider label="Nome Y" value={safeConfig.monsterNameY} onChange={v => update('monsterNameY', v)} min={-300} max={300} />

            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.4rem', marginTop: '0.3rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 'bold', marginBottom: '0.3rem' }}>💀 Posição da Fatalidade (onde o monstro morre)</div>
              <Slider label="Morte X" value={safeConfig.deathOffsetX} onChange={v => update('deathOffsetX', v)} min={-300} max={300} />
              <Slider label="Morte Y" value={safeConfig.deathOffsetY} onChange={v => update('deathOffsetY', v)} min={-300} max={300} />
              <Toggle label="Ver retângulo da fatalidade" value={safeConfig.showDeathArea} onChange={v => update('showDeathArea', v)} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.3rem' }}>
                <span style={{ fontSize: '0.65rem', color: '#94a3b8', minWidth: '58px', whiteSpace: 'nowrap' }}>Forçar:</span>
                <select value={safeConfig.forcedFatality} onChange={e => update('forcedFatality', e.target.value)} style={{ flex: 1, padding: '0.3rem 0.4rem', borderRadius: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.65rem' }}>
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
              <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.3rem' }}>
                <input type="text" value={safeConfig.selectedModelUrl} onChange={e => update('selectedModelUrl', e.target.value)} placeholder="URL do modelo .glb" style={{ flex: 1, padding: '0.3rem 0.5rem', borderRadius: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.65rem' }} />
                <button onClick={() => { if (safeConfig.selectedModelUrl && !safeConfig.modelConfigs[safeConfig.selectedModelUrl]) update('modelConfigs', { ...safeConfig.modelConfigs, [safeConfig.selectedModelUrl]: { scale: 1, offsetX: 0, offsetY: 0 } }); }} style={{ padding: '0.3rem 0.5rem', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 'bold' }}>+</button>
              </div>
              {Object.entries(safeConfig.modelConfigs).map(([url, cfg]) => (
                <div key={url} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '0.4rem', marginBottom: '0.3rem', border: safeConfig.selectedModelUrl === url ? '1px solid #8b5cf6' : '1px solid transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span onClick={() => update('selectedModelUrl', url)} style={{ fontSize: '0.6rem', color: '#a78bfa', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }} title={url}>{url.split('/').pop()?.substring(0, 25) || url}</span>
                    <button onClick={() => { const nc = { ...safeConfig.modelConfigs }; delete nc[url]; update('modelConfigs', nc); if (safeConfig.selectedModelUrl === url) update('selectedModelUrl', ''); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 0.2rem', fontSize: '0.7rem' }}>✕</button>
                  </div>
                  <Slider label="Escala" value={cfg.scale} onChange={v => update('modelConfigs', { ...safeConfig.modelConfigs, [url]: { ...cfg, scale: v } })} min={0.1} max={5} step={0.1} unit="x" />
                  <Slider label="X" value={cfg.offsetX} onChange={v => update('modelConfigs', { ...safeConfig.modelConfigs, [url]: { ...cfg, offsetX: v } })} min={-300} max={300} />
                  <Slider label="Y" value={cfg.offsetY} onChange={v => update('modelConfigs', { ...safeConfig.modelConfigs, [url]: { ...cfg, offsetY: v } })} min={-300} max={300} />
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
            <Slider label="Ataque" value={safeConfig.attackDist} onChange={v => update('attackDist', v)} min={50} max={400} unit="px" />
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

        {tab === 'combat' && (
          <>
            <Toggle label="Sem 1-hit kill" value={safeConfig.noInstantKill} onChange={v => update('noInstantKill', v)} />
            <Toggle label="Admin imortal" value={safeConfig.adminImmortal} onChange={v => update('adminImmortal', v)} />
            <Toggle label="Monstro imortal" value={safeConfig.monsterImmortal} onChange={v => update('monsterImmortal', v)} />
            <Toggle label="Forçar perda de moedas" value={safeConfig.forceCoinLoss} onChange={v => update('forceCoinLoss', v)} />
            <Toggle label="Admin recebe recompensas (teste)" value={safeConfig.forceRewards} onChange={v => update('forceRewards', v)} />
            <Toggle label="Crítico garantido (teste)" value={safeConfig.guaranteedCrit} onChange={v => update('guaranteedCrit', v)} />
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
