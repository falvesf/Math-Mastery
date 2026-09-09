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

/** Extrai rapidamente os nomes das animações contidas no cabeçalho do arquivo GLB via fetch HTTP. */
async function inspectGlbAnimations(url: string): Promise<string[]> {
  if (!url) return [];
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-350000' } });
    const buf = await res.arrayBuffer();
    const view = new DataView(buf);
    if (view.byteLength < 20) return [];
    const magic = view.getUint32(0, true);
    // 0x46546c67 = 'glTF'
    if (magic !== 0x46546c67) return [];
    const jsonLen = view.getUint32(12, true);
    const jsonBytes = new Uint8Array(buf, 20, Math.min(jsonLen, buf.byteLength - 20));
    const jsonStr = new TextDecoder('utf-8').decode(jsonBytes);
    const match = jsonStr.match(/"animations"\s*:\s*\[(.*?)\](?:\s*,\s*"[a-zA-Z]+"\s*:|\s*\})/s);
    if (match) {
      const animMatches = [...match[1].matchAll(/"name"\s*:\s*"([^"]+)"/g)];
      return animMatches.map(m => m[1]);
    }
    const parsed = JSON.parse(jsonStr);
    return (parsed.animations || []).map((a: any) => a.name).filter(Boolean);
  } catch (e) {
    console.warn('Não foi possível ler animações do GLB:', e);
    return [];
  }
}

/**
 * Editor completo dos 4 Golpes do Monstro (Entidades 3D > Monstros).
 * 1. Corpo a Corpo (obrigatório + efeito opcional)
 * 2. À Distância (arremesso de rocha, dinamite, flecha, esfera de fogo/gelo/raio/veneno)
 * 3. Especial (animação nativa do GLB ou movimentos universais procedurais como Pulo Estrondo, Giro, Investida, Dança)
 * 4. Suporte / Fúria / Buffs (fúria com dano dobrado, poção de cura, magia)
 * 5. Estilo de Combate da IA (Híbrido, Ranger, Berserker, Mago, Aleatório)
 */
export default function MonsterAttacksEditor({ value, onChange, modelUrl, models3d = [] }: MonsterAttacksEditorProps) {
  const cfg = normalizeMonsterAttacks(value);
  const [open, setOpen] = useState<'melee' | 'ranged' | 'special' | 'support' | 'ai' | null>('melee');
  const [glbAnimations, setGlbAnimations] = useState<string[]>([]);
  const [loadingAnims, setLoadingAnims] = useState(false);

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
          if (section === 'melee') next.melee = { ...next.melee, effect: v };
          else if (section === 'ranged') next.ranged = { ...(next.ranged || { enabled: true, effect: 'none', projectileType: 'rock' }), effect: v };
          else next.special = { ...(next.special || { enabled: true, effect: 'none', proceduralType: 'jump_slam' }), effect: v };
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

  const sectionHeader = (
    key: 'melee' | 'ranged' | 'special' | 'support' | 'ai',
    icon: any,
    title: string,
    subtitle: string,
    badge?: string,
  ) => {
    const Icon = icon;
    const isExpanded = open === key;
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
              background: 'rgba(59, 130, 246, 0.2)',
              color: '#93c5fd',
              border: '1px solid rgba(59, 130, 246, 0.4)',
            }}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

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
        O golpe corpo a corpo é obrigatório. Os demais (à distância, especial e suporte) são opcionais. A IA do monstro pode alternar entre eles em batalha.
      </p>

      {/* 1. CORPO A CORPO */}
      {sectionHeader('melee', Swords, '1. Corpo a Corpo', 'Ataque padrão obrigatório', cfg.melee.effect !== 'none' ? cfg.melee.effect : 'Padrão')}
      {open === 'melee' && (
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '0 0 8px 8px', border: '1px solid var(--border-glass)', borderTop: 'none', marginBottom: '0.5rem' }}>
          <p style={{ margin: '0 0 0.6rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            O monstro avança em direção ao oponente para acertá-lo de perto.
          </p>
          {effectSelect('melee', cfg.melee.effect)}
        </div>
      )}

      {/* 2. À DISTÂNCIA (ARREMESSO) */}
      {sectionHeader(
        'ranged',
        Crosshair,
        '2. À Distância (Arremesso)',
        'Ergue os braços e arremessa projétil',
        cfg.ranged?.enabled ? (cfg.ranged.projectileType || 'Ativo') : 'Desativado',
      )}
      {open === 'ranged' && (
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '0 0 8px 8px', border: '1px solid var(--border-glass)', borderTop: 'none', marginBottom: '0.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.75rem' }}>
            <input
              type="checkbox"
              checked={!!cfg.ranged?.enabled}
              onChange={e =>
                onChange({
                  ...cfg,
                  ranged: {
                    ...(cfg.ranged || { enabled: true, effect: 'none', projectileType: 'rock' }),
                    enabled: e.target.checked,
                  },
                })
              }
              style={{ width: '16px', height: '16px', accentColor: 'var(--gold-primary)' }}
            />
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Habilitar Golpe À Distância</span>
          </label>

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
                        // Sugere o efeito correspondente caso esteja em 'none'
                        effect: cfg.ranged?.effect === 'none' ? defaultEffect : (cfg.ranged?.effect || 'none'),
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
        cfg.special?.enabled ? (cfg.special.animation || cfg.special.proceduralType || 'Ativo') : 'Desativado',
      )}
      {open === 'special' && (
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '0 0 8px 8px', border: '1px solid var(--border-glass)', borderTop: 'none', marginBottom: '0.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.75rem' }}>
            <input
              type="checkbox"
              checked={!!cfg.special?.enabled}
              onChange={e =>
                onChange({
                  ...cfg,
                  special: {
                    ...(cfg.special || { enabled: true, effect: 'none', proceduralType: 'jump_slam' }),
                    enabled: e.target.checked,
                  },
                })
              }
              style={{ width: '16px', height: '16px', accentColor: 'var(--gold-primary)' }}
            />
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Habilitar Golpe Especial</span>
          </label>

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
        (cfg.heal?.enabled || cfg.support?.enabled) ? (cfg.heal?.type || cfg.support?.type || 'Ativo') : 'Desativado',
      )}
      {open === 'support' && (
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '0 0 8px 8px', border: '1px solid var(--border-glass)', borderTop: 'none', marginBottom: '0.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.75rem' }}>
            <input
              type="checkbox"
              checked={!!(cfg.heal?.enabled || cfg.support?.enabled)}
              onChange={e => {
                const nextSupport = {
                  ...(cfg.heal || cfg.support || { enabled: true, type: 'buff_rage', amount: 1, threshold: 0.4 }),
                  enabled: e.target.checked,
                };
                onChange({ ...cfg, heal: nextSupport, support: nextSupport });
              }}
              style={{ width: '16px', height: '16px', accentColor: 'var(--gold-primary)' }}
            />
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Habilitar Golpe de Suporte / Fúria</span>
          </label>

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