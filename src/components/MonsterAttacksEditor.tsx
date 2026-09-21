import { useState, useEffect } from 'react';
import {
  type MonsterAttacksConfig,
  type MonsterEffectType,
  MONSTER_EFFECT_OPTIONS,
  MONSTER_PROJECTILE_OPTIONS,
  MONSTER_PROCEDURAL_SPECIALS,
  MONSTER_SUPPORT_OPTIONS,
  MONSTER_AI_STYLES,
  normalizeMonsterAttacks,
  DEFAULT_MONSTER_ATTACKS,
  getMonsterEffectLabel,
} from '../lib/monsterAttacks';
import { ChevronDown, ChevronRight, Trash2, Sparkles, Crosshair, Swords, ShieldAlert, Cpu } from 'lucide-react';
import MonsterProjectileView from './MonsterProjectileView';

interface MonsterAttacksEditorProps {
  value?: MonsterAttacksConfig | null;
  onChange: (value: MonsterAttacksConfig) => void;
  modelUrl?: string;
  models3d?: any[];
}

const labelStyle = { display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' } as const;
const inputStyle = { width: '100%', padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.82rem' } as const;

/** Extrai os nomes das animações contidas no arquivo GLB (download completo — confiável no Supabase). */
async function inspectGlbAnimations(url: string): Promise<string[]> {
  if (!url) return [];
  try {
    // Baixa o GLB completo: o header JSON (com as animações) fica no início, mas o Range
    // é ignorado/limitado por alguns provedores (ex.: Supabase Storage), então lemos tudo.
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) {
      console.warn('[Golpes] GLB não acessível (status', res.status, '):', url);
      return [];
    }
    const buf = await res.arrayBuffer();
    const view = new DataView(buf);
    if (view.byteLength < 20) return [];
    const magic = view.getUint32(0, true);
    // 0x46546c67 = 'glTF'
    if (magic !== 0x46546c67) {
      console.warn('[Golpes] Arquivo não é GLB:', url);
      return [];
    }
    // Estrutura GLB: [magic(4) version(4) length(4)] [chunkLen(4) chunkType(4) JSON...]
    const jsonLen = view.getUint32(12, true);
    const jsonBytes = new Uint8Array(buf, 20, Math.min(jsonLen, buf.byteLength - 20));
    const jsonStr = new TextDecoder('utf-8').decode(jsonBytes);

    // Parse completo do JSON do GLB.
    let parsed: any = null;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = null;
    }
    if (parsed && Array.isArray(parsed.animations)) {
      const names = parsed.animations.map((a: any) => a?.name).filter((n: any) => typeof n === 'string' && n.trim());
      if (names.length > 0) return names;
    }

    // Fallback tolerante: extrai os "name" que aparecem logo após o campo "animations".
    const animsStart = jsonStr.indexOf('"animations"');
    if (animsStart !== -1) {
      const names: string[] = [];
      const re = /"name"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(jsonStr.substring(animsStart)))) {
        names.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
      }
      if (names.length > 0) return names.filter(n => n.trim());
    }

    // Último recurso: usa o GLTFLoader real do three (mesma lib que renderiza o modelo na
    // arena). Se o modelo carrega, as animações existem e os nomes são lidos com certeza.
    try {
      const mod = await import('skinview3d/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
      const GLTFLoader = (mod as any).GLTFLoader || (mod as any).default;
      const loader = new GLTFLoader();
      const gltf = await new Promise<any>((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });
      const names = (gltf?.animations || []).map((a: any) => a?.name).filter(Boolean);
      if (names.length > 0) return names;
      console.warn('[Golpes] GLB carregado, mas sem animações:', url);
    } catch (e) {
      console.warn('[Golpes] GLTFLoader também não conseguiu ler animações:', e);
    }

    return [];
  } catch (e) {
    console.warn('Não foi possível ler animações do GLB:', e);
    return [];
  }
}

/**
 * Editor completo dos 4 Golpes do Monstro (Entidades 3D > Monstros).
 * 1. Corpo a Corpo (ativação por nível + efeito com % de acerto configurável)
 * 2. À Distância (ativação por nível + arremesso de projétil + efeito com % de acerto)
 * 3. Especial (ativação por nível + animação GLB / universal + efeito com % de acerto)
 * 4. Suporte / Fúria / Buffs (ativação por nível + fúria com dano extra ou cura)
 * 5. Estilo de Combate da IA (Híbrido, Ranger, Berserker, Mago, Aleatório)
 */
export default function MonsterAttacksEditor({ value, onChange, modelUrl, models3d = [] }: MonsterAttacksEditorProps) {
  const cfg = normalizeMonsterAttacks(value);
  const [open, setOpen] = useState<'melee' | 'ranged' | 'special' | 'support' | 'ai' | null>('melee');
  const [glbAnimations, setGlbAnimations] = useState<string[]>([]);
  const [loadingAnims, setLoadingAnims] = useState(false);
  const [testLevel, setTestLevel] = useState<number>(1);

  // Inspeciona animações do GLB quando a URL do modelo mudar
  useEffect(() => {
    let active = true;
    if (!modelUrl) {
      setGlbAnimations([]);
      return;
    }
    setLoadingAnims(true);
    inspectGlbAnimations(modelUrl).then(anims => {
      if (!active) return;
      setGlbAnimations(anims);
      setLoadingAnims(false);
    });
    return () => { active = false; };
  }, [modelUrl]);

  const updateActivation = (
    section: 'melee' | 'ranged' | 'special' | 'support',
    enabled: boolean,
    minLevel: number = 1,
  ) => {
    const next = { ...cfg };
    if (section === 'melee') {
      next.melee = { ...next.melee, enabled, minLevel };
    } else if (section === 'ranged') {
      next.ranged = { ...(next.ranged || { effect: 'none', projectileType: 'rock' }), enabled, minLevel };
    } else if (section === 'special') {
      next.special = { ...(next.special || { effect: 'none', proceduralType: 'jump_slam' }), enabled, minLevel };
    } else {
      const sup = { ...(next.heal || next.support || { type: 'buff_rage', amount: 1, threshold: 0.4 }), enabled, minLevel };
      next.heal = sup;
      next.support = sup;
    }
    onChange(next);
  };

  const updateEffectChance = (
    section: 'melee' | 'ranged' | 'special',
    effectChance: number,
    effectChancePerLevel: number,
  ) => {
    const next = { ...cfg };
    if (section === 'melee') {
      next.melee = { ...next.melee, effectChance, effectChancePerLevel };
    } else if (section === 'ranged') {
      next.ranged = { ...(next.ranged || { enabled: true, effect: 'none' }), effectChance, effectChancePerLevel };
    } else {
      next.special = { ...(next.special || { enabled: true, effect: 'none' }), effectChance, effectChancePerLevel };
    }
    onChange(next);
  };

  const updateEffectActivation = (
    section: 'melee' | 'ranged' | 'special',
    effectEnabled: boolean,
    effectMinLevel: number = 1,
  ) => {
    const next = { ...cfg };
    if (section === 'melee') {
      next.melee = {
        ...next.melee,
        effectEnabled,
        effectMinLevel: Math.max(1, effectMinLevel),
      };
    } else if (section === 'ranged') {
      next.ranged = {
        ...(next.ranged || { enabled: true, effect: 'none' }),
        effectEnabled,
        effectMinLevel: Math.max(1, effectMinLevel),
      };
    } else {
      next.special = {
        ...(next.special || { enabled: true, effect: 'none' }),
        effectEnabled,
        effectMinLevel: Math.max(1, effectMinLevel),
      };
    }
    onChange(next);
  };

  const effectSelect = (
    section: 'melee' | 'ranged' | 'special',
    current: MonsterEffectType,
    label = 'Efeito de dano aplicado ao acertar o jogador',
  ) => (
    <div>
      <label style={labelStyle}>{label}</label>
      <select
        value={current || 'none'}
        onChange={e => {
          const next = { ...cfg };
          const v = e.target.value as any;
          if (section === 'melee') {
            next.melee = {
              ...next.melee,
              effect: v,
              effectEnabled: v !== 'none' ? (next.melee.effectEnabled !== false) : false,
              effectMinLevel: next.melee.effectMinLevel || 1,
              effectChance: (v !== 'none' && (next.melee.effectChance === undefined || next.melee.effectChance === 0)) ? 40 : (next.melee.effectChance ?? 40),
              effectChancePerLevel: next.melee.effectChancePerLevel ?? 3,
            };
          } else if (section === 'ranged') {
            next.ranged = {
              ...(next.ranged || { enabled: true, projectileType: 'rock' }),
              effect: v,
              effectEnabled: v !== 'none' ? (next.ranged?.effectEnabled !== false) : false,
              effectMinLevel: next.ranged?.effectMinLevel || 1,
              effectChance: (v !== 'none' && (next.ranged?.effectChance === undefined || next.ranged?.effectChance === 0)) ? 40 : (next.ranged?.effectChance ?? 40),
              effectChancePerLevel: next.ranged?.effectChancePerLevel ?? 3,
            };
          } else {
            next.special = {
              ...(next.special || { enabled: true, proceduralType: 'jump_slam' }),
              effect: v,
              effectEnabled: v !== 'none' ? (next.special?.effectEnabled !== false) : false,
              effectMinLevel: next.special?.effectMinLevel || 1,
              effectChance: (v !== 'none' && (next.special?.effectChance === undefined || next.special?.effectChance === 0)) ? 40 : (next.special?.effectChance ?? 40),
              effectChancePerLevel: next.special?.effectChancePerLevel ?? 3,
            };
          }
          onChange(next);
        }}
        style={inputStyle}
      >
        {MONSTER_EFFECT_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>
            {o.icon} {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  const renderActivationControl = (
    section: 'melee' | 'ranged' | 'special' | 'support',
    enabled: boolean,
    minLevel: number = 1,
  ) => {
    const mode = !enabled ? 'disabled' : (minLevel > 1 ? 'level' : 'always');
    return (
      <div style={{ marginBottom: '0.85rem', padding: '0.65rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
          <label style={{ ...labelStyle, marginBottom: 0, fontWeight: 'bold', color: 'var(--text-primary)' }}>
            Condição de Ativação do Golpe
          </label>
          <span style={{
            fontSize: '0.7rem',
            padding: '2px 8px',
            borderRadius: '4px',
            fontWeight: 'bold',
            background: !enabled ? 'rgba(239,68,68,0.2)' : (minLevel > 1 ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)'),
            color: !enabled ? '#fca5a5' : (minLevel > 1 ? '#fde047' : '#86efac'),
            border: !enabled ? '1px solid rgba(239,68,68,0.4)' : (minLevel > 1 ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(34,197,94,0.4)'),
          }}>
            {!enabled ? '⛔ Desativado' : (minLevel > 1 ? `🔒 Desbloqueia no Nv. ${minLevel}+` : '🟢 Sempre Ativado')}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
          <button
            type="button"
            onClick={() => updateActivation(section, true, 1)}
            style={{
              padding: '0.45rem',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: mode === 'always' ? 'bold' : 'normal',
              background: mode === 'always' ? 'rgba(34, 197, 94, 0.25)' : 'rgba(0,0,0,0.3)',
              border: mode === 'always' ? '1px solid #22c55e' : '1px solid var(--border-glass)',
              color: mode === 'always' ? '#86efac' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.3rem',
              transition: 'all 0.15s',
            }}
          >
            🟢 Sempre Ativo
          </button>
          <button
            type="button"
            onClick={() => updateActivation(section, true, Math.max(2, minLevel || 3))}
            style={{
              padding: '0.45rem',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: mode === 'level' ? 'bold' : 'normal',
              background: mode === 'level' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(0,0,0,0.3)',
              border: mode === 'level' ? '1px solid #f59e0b' : '1px solid var(--border-glass)',
              color: mode === 'level' ? '#fde047' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.3rem',
              transition: 'all 0.15s',
            }}
          >
            🔒 No Nível X
          </button>
          <button
            type="button"
            onClick={() => updateActivation(section, false, minLevel || 1)}
            style={{
              padding: '0.45rem',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: mode === 'disabled' ? 'bold' : 'normal',
              background: mode === 'disabled' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(0,0,0,0.3)',
              border: mode === 'disabled' ? '1px solid #ef4444' : '1px solid var(--border-glass)',
              color: mode === 'disabled' ? '#fca5a5' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.3rem',
              transition: 'all 0.15s',
            }}
          >
            ⛔ Desativado
          </button>
        </div>

        {mode === 'level' && (
          <div style={{ marginTop: '0.65rem', padding: '0.55rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px dashed rgba(245, 158, 11, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.74rem', color: '#fde047', fontWeight: 'bold' }}>
                Desbloquear quando o monstro alcançar:
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Nível</span>
                <input
                  type="number"
                  min="2"
                  max="100"
                  value={minLevel}
                  onChange={e => updateActivation(section, true, Math.max(2, Math.min(100, parseInt(e.target.value) || 2)))}
                  style={{ width: '58px', padding: '0.2rem 0.4rem', borderRadius: '4px', background: 'var(--bg-dark)', border: '1px solid #f59e0b', color: '#fde047', textAlign: 'center', fontSize: '0.82rem', fontWeight: 'bold' }}
                />
              </div>
            </div>
            <input
              type="range"
              min="2"
              max="25"
              step="1"
              value={Math.min(25, Math.max(2, minLevel))}
              onChange={e => updateActivation(section, true, parseInt(e.target.value) || 2)}
              style={{ width: '100%', accentColor: '#f59e0b' }}
            />
            <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              💡 O monstro só usará este golpe após alcançar o Nível {minLevel}. Se o monstro for mais fraco, o golpe ficará inativo.
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderEffectActivationControl = (
    section: 'melee' | 'ranged' | 'special',
    effect: MonsterEffectType,
    effectEnabled: boolean = true,
    effectMinLevel: number = 1,
  ) => {
    if (!effect || effect === 'none') return null;

    const effectLabel = getMonsterEffectLabel(effect);
    const mode = !effectEnabled ? 'disabled' : (effectMinLevel > 1 ? 'level' : 'always');

    return (
      <div style={{ marginTop: '0.65rem', marginBottom: '0.65rem', padding: '0.65rem 0.75rem', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', border: '1px solid rgba(217, 119, 6, 0.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
          <label style={{ ...labelStyle, marginBottom: 0, fontWeight: 'bold', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            ⚡ Condição de Ativação do Efeito ({effectLabel})
          </label>
          <span style={{
            fontSize: '0.68rem',
            padding: '2px 8px',
            borderRadius: '4px',
            fontWeight: 'bold',
            background: !effectEnabled ? 'rgba(239,68,68,0.2)' : (effectMinLevel > 1 ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)'),
            color: !effectEnabled ? '#fca5a5' : (effectMinLevel > 1 ? '#fde047' : '#86efac'),
            border: !effectEnabled ? '1px solid rgba(239,68,68,0.4)' : (effectMinLevel > 1 ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(34,197,94,0.4)'),
          }}>
            {!effectEnabled ? '⛔ Efeito Desativado' : (effectMinLevel > 1 ? `🔒 Aplica a partir do Nv. ${effectMinLevel}` : '🟢 Sempre Ativo')}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
          <button
            type="button"
            onClick={() => updateEffectActivation(section, true, 1)}
            style={{
              padding: '0.45rem',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: mode === 'always' ? 'bold' : 'normal',
              background: mode === 'always' ? 'rgba(34, 197, 94, 0.25)' : 'rgba(0,0,0,0.3)',
              border: mode === 'always' ? '1px solid #22c55e' : '1px solid var(--border-glass)',
              color: mode === 'always' ? '#86efac' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.3rem',
              transition: 'all 0.15s',
            }}
          >
            🟢 Sempre Ativo
          </button>
          <button
            type="button"
            onClick={() => updateEffectActivation(section, true, Math.max(2, effectMinLevel || 5))}
            style={{
              padding: '0.45rem',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: mode === 'level' ? 'bold' : 'normal',
              background: mode === 'level' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(0,0,0,0.3)',
              border: mode === 'level' ? '1px solid #f59e0b' : '1px solid var(--border-glass)',
              color: mode === 'level' ? '#fde047' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.3rem',
              transition: 'all 0.15s',
            }}
          >
            🔒 No Nível X
          </button>
          <button
            type="button"
            onClick={() => updateEffectActivation(section, false, effectMinLevel || 1)}
            style={{
              padding: '0.45rem',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: mode === 'disabled' ? 'bold' : 'normal',
              background: mode === 'disabled' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(0,0,0,0.3)',
              border: mode === 'disabled' ? '1px solid #ef4444' : '1px solid var(--border-glass)',
              color: mode === 'disabled' ? '#fca5a5' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.3rem',
              transition: 'all 0.15s',
            }}
          >
            ⛔ Desativado
          </button>
        </div>

        {mode === 'level' && (
          <div style={{ marginTop: '0.65rem', padding: '0.55rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px dashed rgba(245, 158, 11, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.74rem', color: '#fde047', fontWeight: 'bold' }}>
                Começar a aplicar {effectLabel} no:
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Nível</span>
                <input
                  type="number"
                  min="2"
                  max="100"
                  value={effectMinLevel}
                  onChange={e => updateEffectActivation(section, true, Math.max(2, Math.min(100, parseInt(e.target.value) || 2)))}
                  style={{ width: '58px', padding: '0.2rem 0.4rem', borderRadius: '4px', background: 'var(--bg-dark)', border: '1px solid #f59e0b', color: '#fde047', textAlign: 'center', fontSize: '0.82rem', fontWeight: 'bold' }}
                />
              </div>
            </div>
            <input
              type="range"
              min="2"
              max="25"
              step="1"
              value={Math.min(25, Math.max(2, effectMinLevel))}
              onChange={e => updateEffectActivation(section, true, parseInt(e.target.value) || 2)}
              style={{ width: '100%', accentColor: '#f59e0b' }}
            />
            <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              💡 O golpe causará dano normal nos níveis anteriores, mas só passará a infligir <strong>{effectLabel}</strong> quando o monstro for Nível {effectMinLevel} ou superior.
            </span>
          </div>
        )}

        {mode === 'disabled' && (
          <div style={{ marginTop: '0.5rem', padding: '0.45rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
            <span style={{ fontSize: '0.7rem', color: '#fca5a5' }}>
              ⛔ O golpe funcionará normalmente, mas nunca aplicará {effectLabel} no adversário.
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderEffectChanceControls = (
    section: 'melee' | 'ranged' | 'special',
    effect: MonsterEffectType,
    effectChance: number = 100,
    effectChancePerLevel: number = 3,
    effectEnabled: boolean = true,
    effectMinLevel: number = 1,
  ) => {
    if (!effect || effect === 'none' || effectEnabled === false) return null;

    const effectLabel = getMonsterEffectLabel(effect);
    const isEffUnlockedAt = (lvl: number) => effectEnabled !== false && lvl >= (effectMinLevel || 1);
    const calcAt = (lvl: number) => {
      if (!isEffUnlockedAt(lvl)) return 0;
      return Math.min(100, Math.max(0, Math.round((effectChance + (lvl - 1) * effectChancePerLevel) * 10) / 10));
    };

    const isCurrentTestUnlocked = isEffUnlockedAt(testLevel);
    const currentChance = calcAt(testLevel);

    return (
      <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(217, 119, 6, 0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            🎯 Porcentagem de Acerto do Efeito ({effectLabel})
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
            Efeito não pega a todo momento
          </span>
        </div>

        {/* 1. Chance Base (%) */}
        <div style={{ marginBottom: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Chance Base (no nível em que desbloqueia):</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={effectChance}
                onChange={e => updateEffectChance(section, Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)), effectChancePerLevel)}
                style={{ width: '56px', padding: '0.2rem 0.4rem', borderRadius: '4px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--gold-primary)', textAlign: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>%</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={effectChance}
            onChange={e => updateEffectChance(section, parseFloat(e.target.value) || 0, effectChancePerLevel)}
            style={{ width: '100%', accentColor: 'var(--gold-primary)' }}
          />
        </div>

        {/* 2. Bônus por Nível (+% por Nv.) */}
        <div style={{ marginBottom: '0.65rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Bônus por Nível do Monstro:</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 'bold' }}>+</span>
              <input
                type="number"
                min="0"
                max="25"
                step="0.5"
                value={effectChancePerLevel}
                onChange={e => updateEffectChance(section, effectChance, Math.max(0, Math.min(25, parseFloat(e.target.value) || 0)))}
                style={{ width: '56px', padding: '0.2rem 0.4rem', borderRadius: '4px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: '#60a5fa', textAlign: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>%/Nv.</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="15"
            step="0.5"
            value={effectChancePerLevel}
            onChange={e => updateEffectChance(section, effectChance, parseFloat(e.target.value) || 0)}
            style={{ width: '100%', accentColor: '#3b82f6' }}
          />
        </div>

        {/* 3. Régua / Preview em Tempo Real de Progressão */}
        <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid var(--border-glass)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📈 Progressão da Chance por Nível:</span>
            <span>
              {!isCurrentTestUnlocked ? (
                <span style={{ color: '#fca5a5', fontWeight: 'bold' }}>
                  🔒 No Nv. {testLevel}: Efeito Bloqueado (requer Nv. {effectMinLevel})
                </span>
              ) : (
                <span style={{ color: testLevel === 1 ? 'var(--gold-primary)' : '#60a5fa' }}>
                  Teste Nv. {testLevel}: <strong>{currentChance}%</strong>
                </span>
              )}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.25rem', textAlign: 'center', fontSize: '0.68rem' }}>
            {[1, 3, 5, 10, 20].map(lvl => {
              const unlocked = isEffUnlockedAt(lvl);
              const ch = calcAt(lvl);
              return (
                <div
                  key={lvl}
                  onClick={() => setTestLevel(lvl)}
                  style={{
                    padding: '3px 2px',
                    borderRadius: '4px',
                    background: testLevel === lvl ? 'rgba(217, 119, 6, 0.3)' : 'rgba(0,0,0,0.3)',
                    border: testLevel === lvl ? '1px solid var(--gold-primary)' : '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.62rem' }}>Nv. {lvl}</div>
                  <div style={{ fontWeight: 'bold', color: !unlocked ? '#fca5a5' : (ch >= 100 ? '#4ade80' : (ch >= 60 ? '#fde047' : '#93c5fd')), fontSize: !unlocked ? '0.6rem' : '0.68rem' }}>
                    {!unlocked ? '🔒 Bloq.' : `${ch}%`}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Simular Nível:</span>
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              value={testLevel}
              onChange={e => setTestLevel(parseInt(e.target.value) || 1)}
              style={{ flex: 1, accentColor: '#60a5fa' }}
            />
            <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#93c5fd', width: '36px', textAlign: 'right' }}>
              Nv. {testLevel}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const sectionHeader = (
    key: 'melee' | 'ranged' | 'special' | 'support' | 'ai',
    icon: any,
    title: string,
    subtitle: string,
    badge?: string,
  ) => {
    const Icon = icon;
    const isExpanded = open === key;
    const isBadgeDisabled = badge?.includes('⛔');
    const isBadgeLocked = badge?.includes('🔒');
    const isBadgeActive = badge?.includes('🟢');

    let badgeBg = 'rgba(59, 130, 246, 0.2)';
    let badgeBorder = 'rgba(59, 130, 246, 0.4)';
    let badgeColor = '#93c5fd';

    if (isBadgeDisabled) {
      badgeBg = 'rgba(239, 68, 68, 0.2)';
      badgeBorder = 'rgba(239, 68, 68, 0.4)';
      badgeColor = '#fca5a5';
    } else if (isBadgeLocked) {
      badgeBg = 'rgba(245, 158, 11, 0.2)';
      badgeBorder = 'rgba(245, 158, 11, 0.4)';
      badgeColor = '#fde047';
    } else if (isBadgeActive) {
      badgeBg = 'rgba(34, 197, 94, 0.2)';
      badgeBorder = 'rgba(34, 197, 94, 0.4)';
      badgeColor = '#86efac';
    }

    return (
      <button
        type="button"
        onClick={() => setOpen(isExpanded ? null : key)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          width: '100%',
          textAlign: 'left',
          background: isExpanded ? 'rgba(255,255,255,0.06)' : 'transparent',
          border: '1px solid ' + (isExpanded ? 'var(--gold-primary)' : 'var(--border-glass)'),
          borderRadius: '8px',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          padding: '0.6rem 0.8rem',
          fontWeight: 'bold',
          fontSize: '0.88rem',
          transition: 'all 0.2s',
          marginTop: '0.4rem',
        }}
      >
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Icon size={16} color="var(--gold-primary)" />
        <span style={{ color: 'var(--text-primary)' }}>{title}</span>
        <span style={{ fontWeight: 'normal', fontSize: '0.74rem', color: 'var(--text-secondary)', flex: 1 }}>
          — {subtitle}
        </span>
        {badge && (
          <span
            style={{
              fontSize: '0.68rem',
              padding: '2px 6px',
              borderRadius: '10px',
              background: badgeBg,
              color: badgeColor,
              border: `1px solid ${badgeBorder}`,
            }}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  const meleeEffectActive = cfg.melee.effect !== 'none';
  const meleeBadge = !cfg.melee.enabled
    ? '⛔ Desativado'
    : ((cfg.melee.minLevel || 1) > 1
        ? `🔒 Nv. ${cfg.melee.minLevel}+`
        : (meleeEffectActive
            ? (cfg.melee.effectEnabled === false
                ? '🟢 Ativo (Sem Efeito)'
                : ((cfg.melee.effectMinLevel || 1) > 1
                    ? `🟢 Ativo | 🔒 ${cfg.melee.effect} Nv. ${cfg.melee.effectMinLevel}+`
                    : `🟢 ${cfg.melee.effect} (${cfg.melee.effectChance ?? 100}%)`))
            : '🟢 Sempre Ativo'));

  const rangedEffectActive = cfg.ranged?.effect && cfg.ranged.effect !== 'none';
  const rangedBadge = !cfg.ranged?.enabled
    ? '⛔ Desativado'
    : ((cfg.ranged?.minLevel || 1) > 1
        ? `🔒 Nv. ${cfg.ranged.minLevel}+`
        : (rangedEffectActive
            ? (cfg.ranged?.effectEnabled === false
                ? `🟢 ${cfg.ranged?.projectileType || 'Arremesso'} (Sem Efeito)`
                : ((cfg.ranged?.effectMinLevel || 1) > 1
                    ? `🟢 ${cfg.ranged?.projectileType || 'Arremesso'} | 🔒 ${cfg.ranged.effect} Nv. ${cfg.ranged.effectMinLevel}+`
                    : `🟢 ${cfg.ranged?.projectileType || 'Arremesso'} | ${cfg.ranged.effect}`))
            : `🟢 ${cfg.ranged?.projectileType || 'Ativo'}`));

  const specialEffectActive = cfg.special?.effect && cfg.special.effect !== 'none';
  const specialBadge = !cfg.special?.enabled
    ? '⛔ Desativado'
    : ((cfg.special?.minLevel || 1) > 1
        ? `🔒 Nv. ${cfg.special.minLevel}+`
        : (specialEffectActive
            ? (cfg.special?.effectEnabled === false
                ? `🟢 Especial (Sem Efeito)`
                : ((cfg.special?.effectMinLevel || 1) > 1
                    ? `🟢 Especial | 🔒 ${cfg.special.effect} Nv. ${cfg.special.effectMinLevel}+`
                    : `🟢 Especial | ${cfg.special.effect}`))
            : `🟢 ${cfg.special?.animation ? 'GLB' : (cfg.special?.proceduralType || 'Ativo')}`));

  const supCfg = cfg.heal || cfg.support;
  const supportBadge = !supCfg?.enabled
    ? '⛔ Desativado'
    : ((supCfg?.minLevel || 1) > 1
        ? `🔒 Nv. ${supCfg.minLevel}+`
        : `🟢 ${supCfg?.type || 'Ativo'}`);

  return (
    <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '1rem', marginTop: '1.2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
        <h4 style={{ margin: 0, color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Swords size={18} /> Sistema de 4 Golpes do Monstro
        </h4>
        <button
          type="button"
          onClick={() => onChange(JSON.parse(JSON.stringify(DEFAULT_MONSTER_ATTACKS)))}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            background: 'transparent',
            border: '1px solid var(--border-glass)',
            color: 'var(--text-secondary)',
            padding: '0.25rem 0.6rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.72rem',
          }}
        >
          <Trash2 size={13} /> Resetar Padrão
        </button>
      </div>

      <p style={{ margin: '0 0 0.85rem 0', color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
        Configure as condições de ativação (por nível do monstro) e a porcentagem de acerto dos efeitos para cada golpe.
      </p>

      {/* Aviso quando o modelo GLB não estiver disponível para listar as animações nativas */}
      {!modelUrl && (
        <div style={{ marginBottom: '0.85rem', padding: '0.6rem 0.75rem', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', fontSize: '0.72rem', color: '#fbbf24', lineHeight: 1.4 }}>
          ⚠️ <strong>Nenhum modelo 3D (GLB) associado a este monstro.</strong> As animações nativas do modelo só aparecem
          se houver um Molde 3D vinculado (aba <strong>Aparência → Molde 3D</strong>) ou um Modelo 3D customizado
          (<code>customModelUrl</code>). Enquanto isso, os golpes usam as animações universais do jogo.
        </div>
      )}
      {modelUrl && glbAnimations.length === 0 && !loadingAnims && (
        <div style={{ marginBottom: '0.85rem', padding: '0.6rem 0.75rem', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', fontSize: '0.72rem', color: '#fbbf24', lineHeight: 1.4 }}>
          ⚠️ Não foi possível ler animações do arquivo GLB (<code>{modelUrl}</code>). Verifique se o arquivo contém animações
          e se o servidor permite leitura parcial (CORS/Range). Os golpes continuam funcionando com as animações universais.
        </div>
      )}

      {/* 1. CORPO A CORPO */}
      {sectionHeader('melee', Swords, '1. Corpo a Corpo', 'Golpe físico próximo', meleeBadge)}
      {open === 'melee' && (
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '0 0 8px 8px', border: '1px solid var(--border-glass)', borderTop: 'none', marginBottom: '0.5rem' }}>
          {renderActivationControl('melee', cfg.melee.enabled !== false, cfg.melee.minLevel || 1)}
          {cfg.melee.enabled !== false && (
            <>
              <p style={{ margin: '0 0 0.6rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                O monstro avança em direção ao oponente para acertá-lo de perto.
              </p>
              <div style={{ marginBottom: '0.6rem' }}>
                <label style={labelStyle}>
                  Animação do golpe {loadingAnims && <span style={{ color: 'var(--gold-primary)' }}>(lendo GLB...)</span>}
                </label>
                <select
                  value={cfg.melee.animation || ''}
                  onChange={e => onChange({
                    ...cfg,
                    melee: { ...cfg.melee, animation: e.target.value },
                  })}
                  style={inputStyle}
                >
                  <option value="">🌀 Padrão (avanço + golpe do jogo)</option>
                  {glbAnimations.length > 0 && (
                    <optgroup label="🎬 Animações Nativas do Arquivo .GLB deste Modelo">
                      {glbAnimations.map(anim => (
                        <option key={anim} value={anim}>🎞️ {anim}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {glbAnimations.length === 0 && (
                  <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                    Nenhuma animação encontrada no modelo atual — usando o golpe padrão do jogo.
                  </span>
                )}
              </div>
              {effectSelect('melee', cfg.melee.effect)}
              {renderEffectActivationControl('melee', cfg.melee.effect, cfg.melee.effectEnabled !== false, cfg.melee.effectMinLevel || 1)}
              {renderEffectChanceControls('melee', cfg.melee.effect, cfg.melee.effectChance ?? 100, cfg.melee.effectChancePerLevel ?? 3, cfg.melee.effectEnabled !== false, cfg.melee.effectMinLevel || 1)}
            </>
          )}
        </div>
      )}

      {/* 2. À DISTÂNCIA (ARREMESSO) */}
      {sectionHeader(
        'ranged',
        Crosshair,
        '2. À Distância (Arremesso)',
        'Ergue os braços e arremessa projétil',
        rangedBadge,
      )}
      {open === 'ranged' && (
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '0 0 8px 8px', border: '1px solid var(--border-glass)', borderTop: 'none', marginBottom: '0.5rem' }}>
          {renderActivationControl('ranged', !!cfg.ranged?.enabled, cfg.ranged?.minLevel || 1)}

          {cfg.ranged?.enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--gold-primary)' }}>
              <div>
                <label style={labelStyle}>Tipo de Projétil Arremessado</label>
                <select
                  value={cfg.ranged?.projectileType || 'rock'}
                  onChange={e => {
                    const pType = e.target.value as any;
                    const defaultEffect = MONSTER_PROJECTILE_OPTIONS.find(p => p.id === pType)?.defaultEffect || 'none';
                    onChange({
                      ...cfg,
                      ranged: {
                        ...(cfg.ranged || { enabled: true }),
                        enabled: true,
                        projectileType: pType,
                        effect: cfg.ranged?.effect === 'none' ? defaultEffect : (cfg.ranged?.effect || 'none'),
                        effectChance: cfg.ranged?.effectChance ?? 40,
                        effectChancePerLevel: cfg.ranged?.effectChancePerLevel ?? 3,
                      },
                    });
                  }}
                  style={inputStyle}
                >
                  {MONSTER_PROJECTILE_OPTIONS.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.label}
                    </option>
                  ))}
                </select>
                <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  O monstro permanece no seu lugar, ergue os braços, o objeto sobe sobre sua cabeça e é arremessado em arco contra o jogador.
                </span>
              </div>

              <div>
                <label style={labelStyle}>
                  Animação do golpe {loadingAnims && <span style={{ color: 'var(--gold-primary)' }}>(lendo GLB...)</span>}
                </label>
                <select
                  value={cfg.ranged?.animation || ''}
                  onChange={e => onChange({
                    ...cfg,
                    ranged: { ...(cfg.ranged as any), animation: e.target.value },
                  })}
                  style={inputStyle}
                >
                  <option value="">🌀 Padrão (arremesso do jogo)</option>
                  {glbAnimations.length > 0 && (
                    <optgroup label="🎬 Animações Nativas do Arquivo .GLB deste Modelo">
                      {glbAnimations.map(anim => (
                        <option key={anim} value={anim}>🎞️ {anim}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Visualização ao vivo do projétil */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.6rem 0.8rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                <div style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                  <MonsterProjectileView type={cfg.ranged?.projectileType || 'rock'} customUrl={cfg.ranged?.projectile} size={42} />
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    Visual do Projétil: {cfg.ranged?.projectile ? 'Modelo 3D Customizado (.GLB)' : (MONSTER_PROJECTILE_OPTIONS.find(p => p.id === (cfg.ranged?.projectileType || 'rock'))?.label || 'Rocha 3D')}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                    {cfg.ranged?.projectile 
                      ? 'O monstro materializará este modelo 3D em suas mãos e o arremessará contra o jogador.'
                      : (cfg.ranged?.projectileType === 'rock' 
                          ? 'Rocha 3D geométrica nativa do Golem (ou você pode selecionar um bloco .glb abaixo).'
                          : 'Surgirá diretamente nas mãos do monstro e voará em arco parabólico.')}
                  </div>
                </div>
              </div>

              {/* Configuração de arquivo GLB para Rocha do Golem ou Projétil Customizado */}
              {(cfg.ranged?.projectileType === 'custom' || cfg.ranged?.projectileType === 'rock' || !!cfg.ranged?.projectile) && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>
                      {cfg.ranged?.projectileType === 'rock' ? 'Modelo 3D da Rocha (.GLB) — Opcional' : 'URL do Modelo GLB do Projétil'}
                    </label>
                    {cfg.ranged?.projectile && (
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...cfg,
                            ranged: { ...(cfg.ranged as any), projectile: '' },
                          })
                        }
                        style={{ fontSize: '0.66rem', color: 'var(--accent-red)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        Resetar para Rocha 3D nativa
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={cfg.ranged?.projectile || ''}
                    onChange={e =>
                      onChange({
                        ...cfg,
                        ranged: { ...(cfg.ranged as any), projectile: e.target.value.replace(/\\/g, '/') },
                      })
                    }
                    placeholder={cfg.ranged?.projectileType === 'rock' ? "Padrão: Rocha 3D nativa (ou cole URL de bloco/pedra .glb)" : "Cole a URL de um modelo .glb (ex: pedra, machado, etc.)"}
                    style={inputStyle}
                  />
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.35rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Modelos rápidos:</span>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...cfg,
                          ranged: { ...(cfg.ranged as any), projectile: '/models/monster/attack/minecraft_block_pack.glb' },
                        })
                      }
                      style={{
                        fontSize: '0.65rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid var(--border-glass)',
                        color: 'var(--gold-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      🧱 Bloco de Pedra Minecraft
                    </button>
                    {models3d.slice(0, 4).map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          onChange({
                            ...cfg,
                            ranged: { ...(cfg.ranged as any), projectile: (m.url || '').replace(/\\/g, '/') },
                          })
                        }
                        style={{
                          fontSize: '0.65rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid var(--border-glass)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {effectSelect('ranged', cfg.ranged?.effect || 'none', 'Efeito ao acertar o projétil')}
              {renderEffectActivationControl('ranged', cfg.ranged?.effect || 'none', cfg.ranged?.effectEnabled !== false, cfg.ranged?.effectMinLevel || 1)}
              {renderEffectChanceControls('ranged', cfg.ranged?.effect || 'none', cfg.ranged?.effectChance ?? 100, cfg.ranged?.effectChancePerLevel ?? 3, cfg.ranged?.effectEnabled !== false, cfg.ranged?.effectMinLevel || 1)}
            </div>
          )}
        </div>
      )}

      {/* 3. ESPECIAL */}
      {sectionHeader(
        'special',
        Sparkles,
        '3. Golpe Especial',
        'Animação GLB ou Movimento Universal',
        specialBadge,
      )}
      {open === 'special' && (
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '0 0 8px 8px', border: '1px solid var(--border-glass)', borderTop: 'none', marginBottom: '0.5rem' }}>
          {renderActivationControl('special', !!cfg.special?.enabled, cfg.special?.minLevel || 1)}

          {cfg.special?.enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--gold-primary)' }}>
              <div>
                <label style={labelStyle}>
                  Movimento / Animação Especial {loadingAnims && <span style={{ color: 'var(--gold-primary)' }}>(lendo GLB...)</span>}
                </label>
                <select
                  value={cfg.special?.animation ? `glb:${cfg.special.animation}` : (cfg.special?.proceduralType || 'jump_slam')}
                  onChange={e => {
                    const val = e.target.value;
                    if (val.startsWith('glb:')) {
                      const animName = val.substring(4);
                      onChange({
                        ...cfg,
                        special: {
                          ...(cfg.special as any),
                          animation: animName,
                          proceduralType: undefined,
                        },
                      });
                    } else {
                      const proc = MONSTER_PROCEDURAL_SPECIALS.find(p => p.id === val);
                      onChange({
                        ...cfg,
                        special: {
                          ...(cfg.special as any),
                          animation: '',
                          proceduralType: val,
                          effect: cfg.special?.effect === 'none' && proc?.defaultEffect ? proc.defaultEffect : (cfg.special?.effect || 'none'),
                        },
                      });
                    }
                  }}
                  style={inputStyle}
                >
                  <optgroup label="✨ Movimentos Especiais Universais (Funcionam em QUALQUER monstro)">
                    {MONSTER_PROCEDURAL_SPECIALS.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.icon} {s.name}
                      </option>
                    ))}
                  </optgroup>

                  {glbAnimations.length > 0 && (
                    <optgroup label="🎬 Animações Nativas do Arquivo .GLB deste Modelo">
                      {glbAnimations.map(anim => (
                        <option key={anim} value={`glb:${anim}`}>
                          🎞️ {anim}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                <div style={{ marginTop: '0.4rem', padding: '0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  {cfg.special?.animation ? (
                    <span>🎬 Usará a animação <strong>{cfg.special.animation}</strong> embutida no arquivo 3D.</span>
                  ) : (
                    <span>
                      {MONSTER_PROCEDURAL_SPECIALS.find(p => p.id === (cfg.special?.proceduralType || 'jump_slam'))?.description}
                    </span>
                  )}
                </div>
              </div>

              {effectSelect('special', cfg.special?.effect || 'none', 'Efeito de dano do golpe especial')}
              {renderEffectActivationControl('special', cfg.special?.effect || 'none', cfg.special?.effectEnabled !== false, cfg.special?.effectMinLevel || 1)}
              {renderEffectChanceControls('special', cfg.special?.effect || 'none', cfg.special?.effectChance ?? 100, cfg.special?.effectChancePerLevel ?? 3, cfg.special?.effectEnabled !== false, cfg.special?.effectMinLevel || 1)}
            </div>
          )}
        </div>
      )}

      {/* 4. SUPORTE & FÚRIA */}
      {sectionHeader(
        'support',
        ShieldAlert,
        '4. Suporte & Fúria',
        'Fúria (+dano massivo) ou Cura quando com vida baixa',
        supportBadge,
      )}
      {open === 'support' && (
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '0 0 8px 8px', border: '1px solid var(--border-glass)', borderTop: 'none', marginBottom: '0.5rem' }}>
          {renderActivationControl('support', !!(cfg.heal?.enabled || cfg.support?.enabled), cfg.heal?.minLevel || cfg.support?.minLevel || 1)}

          {(cfg.heal?.enabled || cfg.support?.enabled) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--gold-primary)' }}>
              <div>
                <label style={labelStyle}>Tipo de Suporte</label>
                <select
                  value={cfg.heal?.type || cfg.support?.type || 'buff_rage'}
                  onChange={e => {
                    const supType = e.target.value as any;
                    const nextSupport = {
                      ...(cfg.heal || cfg.support || { enabled: true, amount: 1, threshold: 0.4 }),
                      type: supType,
                    };
                    onChange({ ...cfg, heal: nextSupport, support: nextSupport });
                  }}
                  style={inputStyle}
                >
                  {MONSTER_SUPPORT_OPTIONS.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.icon} {s.label}
                    </option>
                  ))}
                </select>
                <span style={{ display: 'block', marginTop: '0.3rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  {MONSTER_SUPPORT_OPTIONS.find(s => s.id === (cfg.heal?.type || cfg.support?.type || 'buff_rage'))?.desc}
                </span>
              </div>

              <div>
                <label style={labelStyle}>
                  {(cfg.heal?.type || cfg.support?.type) === 'buff_rage'
                    ? 'Bônus de Fúria (+corações extras de dano no próximo ataque)'
                    : 'Corações recuperados'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={cfg.heal?.amount ?? cfg.support?.amount ?? 1}
                  onChange={e => {
                    const amt = Math.max(1, parseInt(e.target.value) || 1);
                    const nextSupport = {
                      ...(cfg.heal || cfg.support || { enabled: true, type: 'buff_rage', threshold: 0.4 }),
                      amount: amt,
                    };
                    onChange({ ...cfg, heal: nextSupport, support: nextSupport });
                  }}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Vida do monstro para ativar (ativa quando estiver com ≤ {Math.round(((cfg.heal?.threshold ?? cfg.support?.threshold ?? 0.4)) * 100)}% de vida)
                </label>
                <input
                  type="range"
                  min="10"
                  max="80"
                  step="5"
                  value={Math.round(((cfg.heal?.threshold ?? cfg.support?.threshold ?? 0.4)) * 100)}
                  onChange={e => {
                    const val = (parseInt(e.target.value) || 40) / 100;
                    const nextSupport = {
                      ...(cfg.heal || cfg.support || { enabled: true, type: 'buff_rage', amount: 1 }),
                      threshold: val,
                    };
                    onChange({ ...cfg, heal: nextSupport, support: nextSupport });
                  }}
                  style={{ width: '100%', accentColor: 'var(--gold-primary)' }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. INTELIGÊNCIA & ESTILO DA IA */}
      {sectionHeader('ai', Cpu, '5. Inteligência & Estilo da IA', 'Comportamento tático na batalha', cfg.aiStyle || 'hybrid')}
      {open === 'ai' && (
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '0 0 8px 8px', border: '1px solid var(--border-glass)', borderTop: 'none', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Estilo de Combate da IA</label>
              <select
                value={cfg.aiStyle || 'hybrid'}
                onChange={e => onChange({ ...cfg, aiStyle: e.target.value as any })}
                style={inputStyle}
              >
                {MONSTER_AI_STYLES.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.icon} {s.label}
                  </option>
                ))}
              </select>
              <span style={{ display: 'block', marginTop: '0.3rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                {MONSTER_AI_STYLES.find(s => s.id === (cfg.aiStyle || 'hybrid'))?.desc}
              </span>
            </div>

            <div>
              <label style={labelStyle}>Ataque Preferencial (Base do Monstro)</label>
              <select
                value={cfg.primaryAttack || 'melee'}
                onChange={e => onChange({ ...cfg, primaryAttack: e.target.value as any })}
                style={inputStyle}
              >
                <option value="melee">⚔️ Corpo a Corpo (Avança para cima)</option>
                <option value="ranged">🏹 À Distância (Arremessa de longe)</option>
              </select>
              <span style={{ display: 'block', marginTop: '0.2rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                Para monstros tipo Ranger ou Golem arremessador, definir como &quot;À Distância&quot; faz com que o padrão seja o arremesso de projéteis.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}