import React, { useState, useRef } from 'react';

export interface MapVirtualControlsProps {
  onMove: (vec: { x: number; y: number }) => void;
  onLook: (vec: { x: number; y: number }) => void;
  onAttack: () => void;
  onJump?: () => void;
  onInteract: () => void;
  onTogglePickaxe: () => void;
  onToggleFp: () => void;
  onCycleWeapon: (dir: 1 | -1) => void;
  onUseConsumable: () => void;
  onToggleSprint?: () => void;
  isSprinting?: boolean;
  activeWeapon?: { id: string; title: string; imageUrl?: string; isPickaxe?: boolean } | null;
  activeConsumable?: { key: string; title: string; imageUrl?: string; qty?: number; heal?: number } | null;
  hasPickaxe?: boolean;
  visible?: boolean;
}

export interface GamepadSettings {
  stickLSens: number;
  stickRSens: number;
  stickLInvertX: boolean;
  stickLInvertY: boolean;
  stickRInvertX: boolean;
  stickRInvertY: boolean;
}

const DEFAULT_SETTINGS: GamepadSettings = {
  stickLSens: 1.0,
  stickRSens: 0.65,
  stickLInvertX: false,
  stickLInvertY: false,
  stickRInvertX: false,
  stickRInvertY: false,
};

/**
 * Controles virtuais (Dual Stick + D-Pad + Botões de Ação) projetados para
 * exploração de mapas em dispositivos móveis.
 * Suporta múltiplos toques simultâneos independentes via Pointer Events.
 * Permite ajustar sensibilidade e inversão separadas para Stick L e Stick R (X e Y).
 */
export default function MapVirtualControls({
  onMove,
  onLook,
  onAttack,
  onJump,
  onInteract,
  onTogglePickaxe,
  onToggleFp,
  onCycleWeapon,
  onUseConsumable,
  onToggleSprint,
  isSprinting = false,
  activeWeapon,
  activeConsumable,
  hasPickaxe = true,
  visible = true,
}: MapVirtualControlsProps) {
  if (!visible) return null;

  // --- CONFIGURAÇÕES DE SENSIBILIDADE E INVERSÃO DE EIXO ---
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<GamepadSettings>(() => {
    try {
      const saved = localStorage.getItem('map_virtual_controls_settings');
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch { /* noop */ }
    return DEFAULT_SETTINGS;
  });

  const updateSetting = <K extends keyof GamepadSettings>(key: K, value: GamepadSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem('map_virtual_controls_settings', JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    try { localStorage.setItem('map_virtual_controls_settings', JSON.stringify(DEFAULT_SETTINGS)); } catch { /* noop */ }
  };

  // --- STICK L (Movimento) ---
  const joyLBaseRef = useRef<HTMLDivElement>(null);
  const joyLKnobRef = useRef<HTMLDivElement>(null);
  const touchIdLRef = useRef<number | null>(null);

  // --- STICK R (Câmera) ---
  const joyRBaseRef = useRef<HTMLDivElement>(null);
  const joyRKnobRef = useRef<HTMLDivElement>(null);
  const touchIdRRef = useRef<number | null>(null);

  const maxRadius = 42; // Raio máximo de deflexão do analógico (px)

  // Handlers para Stick L
  const handlePointerDownL = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    touchIdLRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { /* noop */ }
    updateJoyL(e.clientX, e.clientY);
  };

  const handlePointerMoveL = (e: React.PointerEvent<HTMLDivElement>) => {
    if (touchIdLRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    updateJoyL(e.clientX, e.clientY);
  };

  const handlePointerUpL = (e: React.PointerEvent<HTMLDivElement>) => {
    if (touchIdLRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    touchIdLRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* noop */ }
    if (joyLKnobRef.current) {
      joyLKnobRef.current.style.transform = 'translate(0px, 0px)';
      joyLKnobRef.current.style.transition = 'transform 0.15s ease-out';
    }
    onMove({ x: 0, y: 0 });
  };

  const updateJoyL = (clientX: number, clientY: number) => {
    const base = joyLBaseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;

    if (joyLKnobRef.current) {
      joyLKnobRef.current.style.transition = 'none';
      joyLKnobRef.current.style.transform = `translate(${kx}px, ${ky}px)`;
    }

    let normX = clampedDist > 2 ? (kx / maxRadius) * settings.stickLSens : 0;
    let normY = clampedDist > 2 ? (-ky / maxRadius) * settings.stickLSens : 0;
    if (settings.stickLInvertX) normX = -normX;
    if (settings.stickLInvertY) normY = -normY;
    onMove({ x: normX, y: normY });
  };

  // Handlers para Stick R
  const handlePointerDownR = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    touchIdRRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { /* noop */ }
    updateJoyR(e.clientX, e.clientY);
  };

  const handlePointerMoveR = (e: React.PointerEvent<HTMLDivElement>) => {
    if (touchIdRRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    updateJoyR(e.clientX, e.clientY);
  };

  const handlePointerUpR = (e: React.PointerEvent<HTMLDivElement>) => {
    if (touchIdRRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    touchIdRRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* noop */ }
    if (joyRKnobRef.current) {
      joyRKnobRef.current.style.transform = 'translate(0px, 0px)';
      joyRKnobRef.current.style.transition = 'transform 0.15s ease-out';
    }
    onLook({ x: 0, y: 0 });
  };

  const updateJoyR = (clientX: number, clientY: number) => {
    const base = joyRBaseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;

    if (joyRKnobRef.current) {
      joyRKnobRef.current.style.transition = 'none';
      joyRKnobRef.current.style.transform = `translate(${kx}px, ${ky}px)`;
    }

    let normX = clampedDist > 2 ? (kx / maxRadius) * settings.stickRSens : 0;
    let normY = clampedDist > 2 ? (ky / maxRadius) * settings.stickRSens : 0;
    if (settings.stickRInvertX) normX = -normX;
    if (settings.stickRInvertY) normY = -normY;
    onLook({ x: normX, y: normY });
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 25,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
      }}
    >
      {/* ========================================================
          LADO ESQUERDO: STICK L (Movimento) + D-PAD (Itens/Atalhos)
          ======================================================== */}
      <div
        className="virtual-gamepad-left"
        style={{
          position: 'absolute',
          left: 'max(12px, env(safe-area-inset-left))',
          bottom: 'max(12px, env(safe-area-inset-bottom))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          pointerEvents: 'none',
        }}
      >
        {/* STICK L (Analógico de Andar/Correr) */}
        <div
          ref={joyLBaseRef}
          onPointerDown={handlePointerDownL}
          onPointerMove={handlePointerMoveL}
          onPointerUp={handlePointerUpL}
          onPointerCancel={handlePointerUpL}
          title="Stick L: Andar / Mover personagem"
          style={{
            width: 114,
            height: 114,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(15,23,42,0.65) 0%, rgba(15,23,42,0.4) 70%, rgba(2,6,23,0.7) 100%)',
            border: '2px solid rgba(56, 189, 248, 0.45)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.5), inset 0 0 16px rgba(56,189,248,0.18)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            pointerEvents: 'auto',
            touchAction: 'none',
            cursor: 'grab',
          }}
        >
          {/* Marcadores Cardeais da Base */}
          <div style={{ position: 'absolute', top: 6, width: 8, height: 2, background: 'rgba(56,189,248,0.5)', borderRadius: 1 }} />
          <div style={{ position: 'absolute', bottom: 6, width: 8, height: 2, background: 'rgba(56,189,248,0.5)', borderRadius: 1 }} />
          <div style={{ position: 'absolute', left: 6, width: 2, height: 8, background: 'rgba(56,189,248,0.5)', borderRadius: 1 }} />
          <div style={{ position: 'absolute', right: 6, width: 2, height: 8, background: 'rgba(56,189,248,0.5)', borderRadius: 1 }} />
          <div style={{ position: 'absolute', width: 22, height: 22, borderRadius: '50%', border: '1px dashed rgba(56,189,248,0.3)' }} />

          {/* Knob Central Móvel */}
          <div
            ref={joyLKnobRef}
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, rgba(56,189,248,0.95) 0%, rgba(14,165,233,0.85) 60%, rgba(2,132,199,0.95) 100%)',
              border: '2px solid #bae6fd',
              boxShadow: '0 4px 14px rgba(14,165,233,0.6), inset 0 2px 4px rgba(255,255,255,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0f172a',
              fontWeight: 900,
              fontSize: '0.85rem',
              pointerEvents: 'none',
              transform: 'translate(0px, 0px)',
              willChange: 'transform',
            }}
          >
            <span style={{ fontSize: '1.05rem', filter: 'drop-shadow(0 1px 1px rgba(255,255,255,0.4))' }}>🕹️</span>
          </div>
          <span style={{ position: 'absolute', bottom: -18, fontSize: '0.62rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.5px', textShadow: '0 1px 3px #000' }}>
            STICK L
          </span>
        </div>

        {/* D-PAD (Navegação de Itens e Atalhos Embaixo do Stick L) */}
        <div
          style={{
            width: 114,
            height: 114,
            position: 'relative',
            pointerEvents: 'auto',
            touchAction: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Fundo Cruz do D-Pad */}
          <div
            style={{
              position: 'absolute',
              width: 104,
              height: 38,
              background: 'rgba(15,23,42,0.75)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(6px)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: 38,
              height: 104,
              background: 'rgba(15,23,42,0.75)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(6px)',
            }}
          />

          {/* D-PAD CIMA: Usar Consumível da Mochila */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onUseConsumable();
            }}
            title={activeConsumable ? `Usar ${activeConsumable.title} (+${activeConsumable.heal || 0} ❤️)` : 'Usar poção/item da mochila'}
            style={{
              position: 'absolute',
              top: 0,
              width: 36,
              height: 36,
              borderRadius: '7px 7px 0 0',
              background: 'rgba(30,41,59,0.92)',
              border: '1px solid rgba(245,158,11,0.5)',
              color: '#fbbf24',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '0.9rem',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              padding: 0,
            }}
          >
            {activeConsumable?.imageUrl ? (
              <img src={activeConsumable.imageUrl} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
            ) : (
              <span>🧪</span>
            )}
            {activeConsumable && (activeConsumable.qty || 0) > 1 && (
              <span style={{ position: 'absolute', top: 1, right: 2, fontSize: '0.5rem', fontWeight: 800, color: '#fde047' }}>
                {activeConsumable.qty}
              </span>
            )}
          </button>

          {/* D-PAD ESQUERDA: Arma/Item Anterior */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCycleWeapon(-1);
            }}
            title="Arma anterior"
            style={{
              position: 'absolute',
              left: 0,
              width: 36,
              height: 36,
              borderRadius: '7px 0 0 7px',
              background: 'rgba(30,41,59,0.92)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 900,
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              padding: 0,
            }}
          >
            ◀
          </button>

          {/* D-PAD CENTRO: Indicador do Item Atual */}
          <div
            style={{
              position: 'absolute',
              width: 32,
              height: 32,
              borderRadius: 6,
              background: 'rgba(2,6,23,0.9)',
              border: '1px solid rgba(245,158,11,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
              boxShadow: 'inset 0 0 6px rgba(245,158,11,0.3)',
              overflow: 'hidden',
            }}
          >
            {activeWeapon?.imageUrl ? (
              <img src={activeWeapon.imageUrl} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: '0.85rem' }}>{activeWeapon?.isPickaxe ? '⛏️' : '⚔️'}</span>
            )}
          </div>

          {/* D-PAD DIREITA: Próxima Arma/Item */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCycleWeapon(1);
            }}
            title="Próxima arma"
            style={{
              position: 'absolute',
              right: 0,
              width: 36,
              height: 36,
              borderRadius: '0 7px 7px 0',
              background: 'rgba(30,41,59,0.92)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 900,
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              padding: 0,
            }}
          >
            ▶
          </button>

          {/* D-PAD BAIXO: Alternar Picareta */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTogglePickaxe();
            }}
            title={hasPickaxe ? 'Alternar Picareta / Quebrar rochas' : 'Você não possui uma picareta no inventário'}
            style={{
              position: 'absolute',
              bottom: 0,
              width: 36,
              height: 36,
              borderRadius: '0 0 7px 7px',
              background: activeWeapon?.isPickaxe ? 'rgba(245,158,11,0.35)' : 'rgba(30,41,59,0.92)',
              border: activeWeapon?.isPickaxe ? '1.5px solid #fbbf24' : '1px solid rgba(255,255,255,0.3)',
              color: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: hasPickaxe ? 'pointer' : 'not-allowed',
              opacity: hasPickaxe ? 1 : 0.45,
              fontSize: '0.95rem',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              padding: 0,
            }}
          >
            ⛏️
          </button>
        </div>
      </div>

      {/* ========================================================
          LADO DIREITO: STICK R (Câmera) + BOTÕES DE AÇÃO SEM SOBREPOSIÇÃO
          ======================================================== */}
      <div
        className="virtual-gamepad-right"
        style={{
          position: 'absolute',
          right: 'max(12px, env(safe-area-inset-right))',
          bottom: 'max(12px, env(safe-area-inset-bottom))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 12,
          pointerEvents: 'none',
        }}
      >
        {/* BOTÃO DE ENGRENAGEM (Ajustar Sensibilidade e Inversão dos Sticks) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto', marginBottom: -4 }}>
          <button
            onClick={() => setShowSettings(!showSettings)}
            title="Ajustar sensibilidade e eixos dos controles virtuais"
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'rgba(15,23,42,0.85)',
              border: '1.5px solid rgba(245,158,11,0.6)',
              color: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '1rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(6px)',
            }}
          >
            ⚙️
          </button>
        </div>

        {/* STICK R (Analógico de Girar Câmera) */}
        <div
          ref={joyRBaseRef}
          onPointerDown={handlePointerDownR}
          onPointerMove={handlePointerMoveR}
          onPointerUp={handlePointerUpR}
          onPointerCancel={handlePointerUpR}
          title="Stick R: Girar câmera 360°"
          style={{
            width: 114,
            height: 114,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(15,23,42,0.65) 0%, rgba(15,23,42,0.4) 70%, rgba(2,6,23,0.7) 100%)',
            border: '2px solid rgba(245, 158, 11, 0.45)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.5), inset 0 0 16px rgba(245,158,11,0.18)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            pointerEvents: 'auto',
            touchAction: 'none',
            cursor: 'grab',
          }}
        >
          {/* Marcadores Cardeais da Base */}
          <div style={{ position: 'absolute', top: 6, width: 8, height: 2, background: 'rgba(245,158,11,0.5)', borderRadius: 1 }} />
          <div style={{ position: 'absolute', bottom: 6, width: 8, height: 2, background: 'rgba(245,158,11,0.5)', borderRadius: 1 }} />
          <div style={{ position: 'absolute', left: 6, width: 2, height: 8, background: 'rgba(245,158,11,0.5)', borderRadius: 1 }} />
          <div style={{ position: 'absolute', right: 6, width: 2, height: 8, background: 'rgba(245,158,11,0.5)', borderRadius: 1 }} />
          <div style={{ position: 'absolute', width: 22, height: 22, borderRadius: '50%', border: '1px dashed rgba(245,158,11,0.3)' }} />

          {/* Knob Central Móvel */}
          <div
            ref={joyRKnobRef}
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, rgba(251,191,36,0.95) 0%, rgba(245,158,11,0.85) 60%, rgba(217,119,6,0.95) 100%)',
              border: '2px solid #fef08a',
              boxShadow: '0 4px 14px rgba(245,158,11,0.6), inset 0 2px 4px rgba(255,255,255,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0f172a',
              fontWeight: 900,
              fontSize: '0.85rem',
              pointerEvents: 'none',
              transform: 'translate(0px, 0px)',
              willChange: 'transform',
            }}
          >
            <span style={{ fontSize: '1.05rem', filter: 'drop-shadow(0 1px 1px rgba(255,255,255,0.4))' }}>🎥</span>
          </div>
          <span style={{ position: 'absolute', bottom: -18, fontSize: '0.62rem', fontWeight: 800, color: '#fbbf24', letterSpacing: '0.5px', textShadow: '0 1px 3px #000' }}>
            STICK R
          </span>
        </div>

        {/* CLUSTER ERGONÔMICO DE BOTÕES DE AÇÃO (LARGURA E ALTURA AMPLIADAS, ZERO SOBREPOSIÇÃO) */}
        <div
          style={{
            width: 190,
            height: 140,
            position: 'relative',
            pointerEvents: 'auto',
            touchAction: 'none',
          }}
        >
          {/* BOTÃO PRINCIPAL: BATER / ATACAR (Maior e no canto direito inferior) */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAttack();
            }}
            title="Atacar / Bater (F / Espaço)"
            style={{
              position: 'absolute',
              right: 6,
              bottom: 6,
              width: 58,
              height: 58,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, rgba(239,68,68,0.95) 0%, rgba(185,28,28,0.9) 60%, rgba(127,29,29,0.95) 100%)',
              border: '2.5px solid #fca5a5',
              boxShadow: '0 6px 18px rgba(239,68,68,0.65), inset 0 2px 5px rgba(255,255,255,0.5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              cursor: 'pointer',
              zIndex: 3,
            }}
          >
            <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>⚔️</span>
            <span style={{ fontSize: '0.5rem', fontWeight: 900, letterSpacing: '0.4px', textShadow: '0 1px 2px #000' }}>
              BATER
            </span>
          </button>

          {/* NOVO: BOTÃO PULAR (🦘) - Imediatamente ao lado do botão de bater */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onJump) onJump();
            }}
            title="Pular obstáculos (Espaço)"
            style={{
              position: 'absolute',
              right: 72,
              bottom: 6,
              width: 50,
              height: 50,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, rgba(168,85,247,0.95) 0%, rgba(126,34,206,0.9) 100%)',
              border: '2px solid #e9d5ff',
              boxShadow: '0 4px 14px rgba(168,85,247,0.6), inset 0 2px 4px rgba(255,255,255,0.5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              cursor: 'pointer',
              zIndex: 3,
            }}
          >
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>🦘</span>
            <span style={{ fontSize: '0.48rem', fontWeight: 900, textShadow: '0 1px 2px #000' }}>
              PULAR
            </span>
          </button>

          {/* BOTÃO INTERAGIR / ABRIR PORTAS E BAÚS (Acima do Bater) */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onInteract();
            }}
            title="Interagir / Abrir baús e portas (E)"
            style={{
              position: 'absolute',
              right: 6,
              bottom: 74,
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, rgba(245,158,11,0.95) 0%, rgba(217,119,6,0.9) 100%)',
              border: '2px solid #fde68a',
              boxShadow: '0 4px 14px rgba(245,158,11,0.6), inset 0 2px 4px rgba(255,255,255,0.5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000',
              cursor: 'pointer',
              zIndex: 3,
            }}
          >
            <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>🔑</span>
            <span style={{ fontSize: '0.46rem', fontWeight: 900 }}>ABRIR</span>
          </button>

          {/* BOTÃO CORRER / SPRINT (Diagonal ergonômica entre saltar e abrir) */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleSprint?.();
            }}
            title="Correr / Sprint rápido"
            style={{
              position: 'absolute',
              right: 68,
              bottom: 68,
              width: 46,
              height: 46,
              borderRadius: '50%',
              background: isSprinting
                ? 'radial-gradient(circle at 35% 35%, rgba(16,185,129,0.95) 0%, rgba(5,150,105,0.9) 100%)'
                : 'radial-gradient(circle at 35% 35%, rgba(14,165,233,0.85) 0%, rgba(2,132,199,0.8) 100%)',
              border: isSprinting ? '2px solid #86efac' : '2px solid #7dd3fc',
              boxShadow: isSprinting ? '0 0 14px rgba(16,185,129,0.8)' : '0 4px 12px rgba(14,165,233,0.5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              cursor: 'pointer',
              zIndex: 3,
            }}
          >
            <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>🏃</span>
            <span style={{ fontSize: '0.46rem', fontWeight: 800, textShadow: '0 1px 2px #000' }}>
              {isSprinting ? 'CORRENDO' : 'CORRER'}
            </span>
          </button>

          {/* BOTÃO PICARETA RÁPIDA (À esquerda do Pular, sem colidir) */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTogglePickaxe();
            }}
            title={hasPickaxe ? 'Alternar Picareta (P)' : 'Você não possui uma picareta no inventário'}
            style={{
              position: 'absolute',
              right: 132,
              bottom: 12,
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: activeWeapon?.isPickaxe
                ? 'radial-gradient(circle, rgba(234,179,8,0.95) 0%, rgba(161,98,7,0.9) 100%)'
                : 'rgba(30,41,59,0.92)',
              border: activeWeapon?.isPickaxe ? '2px solid #fef08a' : '1px solid rgba(255,255,255,0.35)',
              boxShadow: '0 3px 10px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fbbf24',
              cursor: hasPickaxe ? 'pointer' : 'not-allowed',
              opacity: hasPickaxe ? 1 : 0.45,
              zIndex: 2,
            }}
          >
            <span style={{ fontSize: '1rem', lineHeight: 1 }}>⛏️</span>
            <span style={{ fontSize: '0.42rem', fontWeight: 800, color: '#fef08a' }}>PICARETA</span>
          </button>

          {/* BOTÃO PERSPECTIVA DE CÂMERA (1ª / 3ª PESSOA - Topo do cluster, separado dos demais) */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFp();
            }}
            title="Alternar 1ª / 3ª pessoa (V)"
            style={{
              position: 'absolute',
              right: 128,
              bottom: 68,
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: 'rgba(30,41,59,0.92)',
              border: '1.5px solid rgba(192,132,252,0.6)',
              boxShadow: '0 3px 10px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#d8b4fe',
              cursor: 'pointer',
              zIndex: 2,
            }}
          >
            <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>👁️</span>
            <span style={{ fontSize: '0.42rem', fontWeight: 800, color: '#e9d5ff' }}>VISÃO</span>
          </button>
        </div>
      </div>

      {/* ========================================================
          MODAL DE CONFIGURAÇÕES DOS CONTROLES VIRTUAIS
          ======================================================== */}
      {showSettings && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            pointerEvents: 'auto',
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSettings(false);
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '2px solid rgba(245,158,11,0.6)',
              borderRadius: 16,
              padding: 20,
              maxWidth: 360,
              width: '100%',
              color: '#fff',
              boxShadow: '0 12px 36px rgba(0,0,0,0.7)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.05rem', fontWeight: 800, color: '#fbbf24' }}>
                <span>⚙️</span> Ajustes de Controles
              </div>
              <button
                onClick={() => setShowSettings(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Sensibilidade Stick R (Câmera) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700 }}>
                <span>🎥 Sensibilidade Câmera (Stick R):</span>
                <span style={{ color: '#fbbf24' }}>{Math.round(settings.stickRSens * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="2.0"
                step="0.05"
                value={settings.stickRSens}
                onChange={(e) => updateSetting('stickRSens', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#fbbf24' }}
              />
            </div>

            {/* Inversão Stick R (Câmera) */}
            <div style={{ background: 'rgba(255,255,255,0.04)', padding: 10, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fbbf24' }}>🎥 Eixos da Câmera (Stick R)</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.stickRInvertX}
                  onChange={(e) => updateSetting('stickRInvertX', e.target.checked)}
                  style={{ accentColor: '#fbbf24', width: 16, height: 16 }}
                />
                Inverter Horizontal (Eixo X)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.stickRInvertY}
                  onChange={(e) => updateSetting('stickRInvertY', e.target.checked)}
                  style={{ accentColor: '#fbbf24', width: 16, height: 16 }}
                />
                Inverter Vertical (Eixo Y)
              </label>
            </div>

            {/* Sensibilidade Stick L (Movimento) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700 }}>
                <span>🕹️ Sensibilidade Andar (Stick L):</span>
                <span style={{ color: '#38bdf8' }}>{Math.round(settings.stickLSens * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="2.0"
                step="0.05"
                value={settings.stickLSens}
                onChange={(e) => updateSetting('stickLSens', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#38bdf8' }}
              />
            </div>

            {/* Inversão Stick L (Movimento) */}
            <div style={{ background: 'rgba(255,255,255,0.04)', padding: 10, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#38bdf8' }}>🕹️ Eixos de Movimento (Stick L)</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.stickLInvertX}
                  onChange={(e) => updateSetting('stickLInvertX', e.target.checked)}
                  style={{ accentColor: '#38bdf8', width: 16, height: 16 }}
                />
                Inverter Horizontal (Eixo X)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.stickLInvertY}
                  onChange={(e) => updateSetting('stickLInvertY', e.target.checked)}
                  style={{ accentColor: '#38bdf8', width: 16, height: 16 }}
                />
                Inverter Vertical (Eixo Y)
              </label>
            </div>

            {/* Ações do Modal */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={resetSettings}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#94a3b8',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Padrões
              </button>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
                  border: 'none',
                  color: '#000',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Salvar e Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
