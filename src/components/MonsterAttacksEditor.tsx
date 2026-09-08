import { useState } from 'react';
import { type MonsterAttacksConfig, MONSTER_EFFECT_OPTIONS, normalizeMonsterAttacks } from '../lib/monsterAttacks';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

interface MonsterAttacksEditorProps {
  value?: MonsterAttacksConfig | null;
  onChange: (value: MonsterAttacksConfig) => void;
}

const labelStyle = { display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' } as const;
const inputStyle = { width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.8rem' } as const;

/** Editor dos 4 golpes do monstro (Entidades 3D > Monstros). */
export default function MonsterAttacksEditor({ value, onChange }: MonsterAttacksEditorProps) {
  const cfg = normalizeMonsterAttacks(value);
  const [open, setOpen] = useState<'melee' | 'ranged' | 'special' | 'heal' | null>('melee');

  const effectSelect = (section: 'melee' | 'ranged' | 'special', current: string) => (
    <div>
      <label style={labelStyle}>Efeito de dano no jogador</label>
      <select
        value={current}
        onChange={e => {
          const next = { ...cfg };
          const v = e.target.value as any;
          if (section === 'melee') next.melee = { ...next.melee, effect: v };
          else if (section === 'ranged') next.ranged = { ...(next.ranged || { enabled: true, effect: 'none' }), effect: v };
          else next.special = { ...(next.special || { enabled: true, effect: 'none' }), effect: v };
          onChange(next);
        }}
        style={inputStyle}
      >
        {MONSTER_EFFECT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.icon} {o.label}</option>)}
      </select>
    </div>
  );

  const sectionHeader = (key: 'melee' | 'ranged' | 'special' | 'heal', title: string, subtitle: string) => (
    <button
      onClick={() => setOpen(open === key ? null : key)}
      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.4rem 0', fontWeight: 'bold', fontSize: '0.9rem' }}
    >
      {open === key ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      <span>{title}</span>
      <span style={{ fontWeight: 'normal', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>— {subtitle}</span>
    </button>
  );

  return (
    <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '1rem', marginTop: '1rem' }}>
      <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--gold-primary)' }}>⚔️ Golpes do Monstro</h4>
      <p style={{ margin: '0 0 0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
        O corpo a corpo é obrigatório. Os demais são opcionais e podem (ou não) ter efeito de dano.
      </p>

      {/* Corpo a corpo */}
      {sectionHeader('melee', 'Corpo a Corpo', 'golpe padrão + efeito opcional')}
      {open === 'melee' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0 0.75rem 0' }}>
          {effectSelect('melee', cfg.melee.effect)}
        </div>
      )}

      {/* À distância */}
      {sectionHeader('ranged', 'À Distância', 'arremessa algo contra o jogador')}
      {open === 'ranged' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0 0.75rem 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!cfg.ranged?.enabled} onChange={e => onChange({ ...cfg, ranged: { ...(cfg.ranged || { enabled: true, effect: 'none' }), enabled: e.target.checked } })} style={{ width: '16px', height: '16px' }} />
            <span style={{ fontSize: '0.85rem' }}>Ativar arremesso</span>
          </label>
          {cfg.ranged?.enabled && (
            <>
              {effectSelect('ranged', cfg.ranged?.effect || 'none')}
              <div>
                <label style={labelStyle}>Projétil (URL/nome do .glb ou bloco)</label>
                <input
                  type="text"
                  value={cfg.ranged?.projectile || ''}
                  onChange={e => onChange({ ...cfg, ranged: { ...(cfg.ranged || { enabled: true, effect: 'none' }), projectile: e.target.value } })}
                  placeholder="Ex.: models/projectiles/bloco.glb (vazio = bloco padrão)"
                  style={inputStyle}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Especial */}
      {sectionHeader('special', 'Especial', 'animação própria do GLB + efeito')}
      {open === 'special' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0 0.75rem 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!cfg.special?.enabled} onChange={e => onChange({ ...cfg, special: { ...(cfg.special || { enabled: true, effect: 'none' }), enabled: e.target.checked } })} style={{ width: '16px', height: '16px' }} />
            <span style={{ fontSize: '0.85rem' }}>Ativar golpe especial</span>
          </label>
          {cfg.special?.enabled && (
            <>
              {effectSelect('special', cfg.special?.effect || 'none')}
              <div>
                <label style={labelStyle}>Animação do GLB (nome exato no arquivo .glb)</label>
                <input
                  type="text"
                  list="monster-special-anims"
                  value={cfg.special?.animation || ''}
                  onChange={e => onChange({ ...cfg, special: { ...(cfg.special || { enabled: true, effect: 'none' }), animation: e.target.value } })}
                  placeholder="Ex.: jump, attack, dance, spin, throw..."
                  style={inputStyle}
                />
                <datalist id="monster-special-anims">
                  <option value="jump" />
                  <option value="attack" />
                  <option value="attack2" />
                  <option value="dance" />
                  <option value="spin" />
                  <option value="throw" />
                  <option value="wave" />
                  <option value="roar" />
                  <option value="walk" />
                  <option value="idle" />
                </datalist>
                <span style={{ display: 'block', marginTop: '0.3rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  Digite o nome da animação que existe no arquivo .glb (ex.: se o golem "pula", a animação costuma se chamar jump).
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Cura */}
      {sectionHeader('heal', 'Cura', 'se cura quando está morrendo')}
      {open === 'heal' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0 0.75rem 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!cfg.heal?.enabled} onChange={e => onChange({ ...cfg, heal: { ...(cfg.heal || { enabled: true, type: 'magic', amount: 1, threshold: 0.25 }), enabled: e.target.checked } })} style={{ width: '16px', height: '16px' }} />
            <span style={{ fontSize: '0.85rem' }}>Ativar cura</span>
          </label>
          {cfg.heal?.enabled && (
            <>
              <div>
                <label style={labelStyle}>Tipo</label>
                <select
                  value={cfg.heal?.type || 'magic'}
                  onChange={e => onChange({ ...cfg, heal: { ...(cfg.heal as any), type: e.target.value as any } })}
                  style={inputStyle}
                >
                  <option value="potion">🧪 Poção de cura</option>
                  <option value="magic">✨ Magia de cura</option>
                  <option value="vampire">🧛 Ataque vampírico (suga HP do oponente)</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Corações recuperados (vampírico = dano extra no jogador)</label>
                <input type="number" min="0" max="5" value={cfg.heal?.amount ?? 1} onChange={e => onChange({ ...cfg, heal: { ...(cfg.heal as any), amount: parseInt(e.target.value) || 0 } })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Vida mínima para tentar curar (% da vida do monstro)</label>
                <input type="number" min="1" max="100" value={Math.round((cfg.heal?.threshold ?? 0.25) * 100)} onChange={e => onChange({ ...cfg, heal: { ...(cfg.heal as any), threshold: (parseInt(e.target.value) || 25) / 100 } })} style={inputStyle} />
              </div>
            </>
          )}
        </div>
      )}

      <button onClick={() => onChange(JSON.parse(JSON.stringify({ melee: { effect: 'none' } })))} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.5rem', background: 'transparent', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)', padding: '0.3rem 0.7rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' }}>
        <Trash2 size={14} /> Limpar golpes
      </button>
    </div>
  );
}