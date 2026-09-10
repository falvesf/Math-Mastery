import React, { useState, useEffect, useRef } from 'react';
import { 
  Volume2, 
  MessageSquare, 
  Gift, 
  Plus, 
  Trash2, 
  XCircle,
  ChevronDown,
  Sparkles,
  Swords
} from 'lucide-react';
import AudioBankPicker from './AudioBankPicker';

// @ts-ignore
void Volume2;
// @ts-ignore
void MessageSquare;
// @ts-ignore
void Gift;
// @ts-ignore
void ChevronDown;
// @ts-ignore
void Swords;

// Campo individual de som integrado com o banco de áudio
function SoundInput({ label, value, onChange, categoryFilter = 'voice', genderFilter = '' }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  categoryFilter?: string;
  genderFilter?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      return;
    }
    if (!value) return;
    try {
      const a = new Audio(value);
      a.volume = 0.8;
      a.onended = () => { setIsPlaying(false); audioRef.current = null; };
      a.play().catch(() => { setIsPlaying(false); audioRef.current = null; });
      audioRef.current = a;
      setIsPlaying(true);
    } catch (e) {}
  };

  useEffect(() => {
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
  }, []);

  return (
    <div style={{ marginBottom: '0.75rem', width: '100%', minWidth: 0 }}>
      <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500 }}>{label}</label>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
        <input 
          type="text" 
          value={value || ''} 
          onChange={e => onChange(e.target.value)} 
          placeholder="URL do áudio..." 
          style={{ 
            flex: 1, 
            minWidth: 0, 
            padding: '0.5rem 0.65rem', 
            borderRadius: '6px', 
            background: 'var(--bg-dark)', 
            border: '1px solid var(--border-glass)', 
            color: 'var(--text-primary)', 
            fontSize: '0.82rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }} 
        />
        <button 
          type="button"
          onClick={togglePlay} 
          disabled={!value} 
          title={isPlaying ? 'Pausar áudio' : 'Ouvir prévia'}
          style={{ 
            flexShrink: 0, 
            padding: '0.5rem 0.65rem', 
            background: isPlaying ? 'rgba(245,158,11,0.3)' : 'var(--btn-bg)', 
            border: '1px solid var(--border-glass)', 
            borderRadius: '6px', 
            cursor: value ? 'pointer' : 'not-allowed', 
            opacity: value ? 1 : 0.4, 
            color: isPlaying ? 'var(--gold-primary)' : 'var(--text-primary)', 
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {isPlaying ? '⏹' : '▶'}
        </button>
        <button 
          type="button"
          onClick={() => setPickerOpen(true)} 
          style={{ 
            flexShrink: 0, 
            padding: '0.5rem 0.75rem', 
            background: 'rgba(139,92,246,0.2)', 
            color: '#c084fc', 
            border: '1px solid rgba(139,92,246,0.4)', 
            borderRadius: '6px', 
            cursor: 'pointer', 
            fontSize: '0.78rem', 
            fontWeight: 'bold', 
            whiteSpace: 'nowrap' 
          }}
        >
          Banco
        </button>
        {value && (
          <button 
            type="button"
            title="Limpar áudio"
            onClick={() => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; setIsPlaying(false); } onChange(''); }} 
            style={{ 
              flexShrink: 0, 
              padding: '0.4rem', 
              background: 'transparent', 
              border: 'none', 
              color: 'var(--accent-red)', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <XCircle size={17} />
          </button>
        )}
      </div>
      <AudioBankPicker 
        open={pickerOpen} 
        onClose={() => setPickerOpen(false)} 
        onSelect={(url) => { onChange(url); setPickerOpen(false); }} 
        categoryFilter={categoryFilter} 
        genderFilter={genderFilter} 
        title={`Banco de Áudio — ${label}`} 
      />
    </div>
  );
}

export interface MonsterAttributesConfig {
  gender?: string;
  attackSound?: string;
  gruntSound?: string;
  damageSound?: string;
  quotes?: {
    hp100_80?: string;
    hp79_50?: string;
    hp49_25?: string;
    hp24_0?: string;
    defeat?: string;
  };
  drops?: Array<{ itemId: string; dropChance: number }>;
}

interface MonsterAttributesEditorProps {
  value?: MonsterAttributesConfig;
  onChange: (value: MonsterAttributesConfig) => void;
  availableStoreItems?: any[];
  tabMode?: 'sounds_and_quotes' | 'drops' | 'all';
}

export const MonsterAttributesEditor: React.FC<MonsterAttributesEditorProps> = ({
  value = {},
  onChange,
  availableStoreItems = [],
  tabMode = 'all',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'sounds' | 'quotes' | 'drops'>(
    tabMode === 'drops' ? 'drops' : 'sounds'
  );

  useEffect(() => {
    if (tabMode === 'drops') {
      setActiveSubTab('drops');
    } else if (tabMode === 'sounds_and_quotes' && activeSubTab === 'drops') {
      setActiveSubTab('sounds');
    }
  }, [tabMode]);

  const updateField = (patch: Partial<MonsterAttributesConfig>) => {
    onChange({
      ...value,
      ...patch,
    });
  };

  const updateQuotes = (quotePatch: Partial<NonNullable<MonsterAttributesConfig['quotes']>>) => {
    onChange({
      ...value,
      quotes: {
        ...(value.quotes || {}),
        ...quotePatch,
      },
    });
  };

  const drops = value.drops || [];

  return (
    <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '1rem', marginTop: tabMode === 'all' ? '1rem' : '0.5rem' }}>
      {tabMode === 'drops' ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.6rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Gift size={16} /> Recompensas de Derrota (Drops)
          </h4>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {drops.length} {drops.length === 1 ? 'item' : 'itens'}
          </span>
        </div>
      ) : tabMode === 'sounds_and_quotes' ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.6rem', flexWrap: 'wrap', gap: '0.4rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Volume2 size={16} /> Sons & Falas da Criatura
          </h4>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <button
              type="button"
              onClick={() => setActiveSubTab('sounds')}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: activeSubTab === 'sounds' ? 'bold' : 'normal',
                background: activeSubTab === 'sounds' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                color: activeSubTab === 'sounds' ? 'var(--gold-primary)' : 'var(--text-secondary)',
                border: activeSubTab === 'sounds' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                cursor: 'pointer'
              }}
            >
              🔊 Sons
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('quotes')}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: activeSubTab === 'quotes' ? 'bold' : 'normal',
                background: activeSubTab === 'quotes' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                color: activeSubTab === 'quotes' ? 'var(--gold-primary)' : 'var(--text-secondary)',
                border: activeSubTab === 'quotes' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                cursor: 'pointer'
              }}
            >
              💬 Falas
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.6rem', flexWrap: 'wrap', gap: '0.4rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Sparkles size={16} /> Identidade, Falas & Recompensas
          </h4>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <button
              type="button"
              onClick={() => setActiveSubTab('sounds')}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: activeSubTab === 'sounds' ? 'bold' : 'normal',
                background: activeSubTab === 'sounds' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                color: activeSubTab === 'sounds' ? 'var(--gold-primary)' : 'var(--text-secondary)',
                border: activeSubTab === 'sounds' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                cursor: 'pointer'
              }}
            >
              🔊 Sons
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('quotes')}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: activeSubTab === 'quotes' ? 'bold' : 'normal',
                background: activeSubTab === 'quotes' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                color: activeSubTab === 'quotes' ? 'var(--gold-primary)' : 'var(--text-secondary)',
                border: activeSubTab === 'quotes' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                cursor: 'pointer'
              }}
            >
              💬 Falas
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('drops')}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: activeSubTab === 'drops' ? 'bold' : 'normal',
                background: activeSubTab === 'drops' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                color: activeSubTab === 'drops' ? 'var(--gold-primary)' : 'var(--text-secondary)',
                border: activeSubTab === 'drops' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                cursor: 'pointer'
              }}
            >
              🎁 Drops ({drops.length})
            </button>
          </div>
        </div>
      )}

      {/* ABA DE SONS */}
      {activeSubTab === 'sounds' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ marginBottom: '0.5rem', width: '100%' }}>
            <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500 }}>
              Gênero da Voz do Monstro
            </label>
            <select
              value={value.gender || ''}
              onChange={e => updateField({ gender: e.target.value })}
              style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            >
              <option value="">Neutro / Criatura</option>
              <option value="male">Masculino ♂</option>
              <option value="female">Feminino ♀</option>
            </select>
          </div>

          <SoundInput
            label="Som de Ataque (ao golpear)"
            value={value.attackSound || ''}
            onChange={url => updateField({ attackSound: url })}
            categoryFilter="voice"
            genderFilter={value.gender || ''}
          />
          <SoundInput
            label="Grunido / Rugido Especial"
            value={value.gruntSound || ''}
            onChange={url => updateField({ gruntSound: url })}
            categoryFilter="voice"
            genderFilter={value.gender || ''}
          />
          <SoundInput
            label="Som de Dano (ao ser atingido pelo jogador)"
            value={value.damageSound || ''}
            onChange={url => updateField({ damageSound: url })}
            categoryFilter="voice"
            genderFilter={value.gender || ''}
          />
        </div>
      )}

      {/* ABA DE FALAS */}
      {activeSubTab === 'quotes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Separe frases por ponto e vírgula (;) para sortear aleatoriamente em combate.
          </p>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--accent-green)', marginBottom: '0.2rem' }}>HP Pleno (100% a 80%)</label>
            <input
              type="text"
              value={value.quotes?.hp100_80 || ''}
              onChange={e => updateQuotes({ hp100_80: e.target.value })}
              placeholder="Ex: Vou te esmagar!; Renda-se mortal!"
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--gold-primary)', marginBottom: '0.2rem' }}>HP Firme (79% a 50%)</label>
            <input
              type="text"
              value={value.quotes?.hp79_50 || ''}
              onChange={e => updateQuotes({ hp79_50: e.target.value })}
              placeholder="Ex: Você é mais forte do que parece..."
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#f97316', marginBottom: '0.2rem' }}>HP Médio / Ferido (49% a 25%)</label>
            <input
              type="text"
              value={value.quotes?.hp49_25 || ''}
              onChange={e => updateQuotes({ hp49_25: e.target.value })}
              placeholder="Ex: Isso não vai ficar assim!; Sinta minha fúria!"
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--accent-red)', marginBottom: '0.2rem' }}>HP Crítico (&lt; 25%)</label>
            <input
              type="text"
              value={value.quotes?.hp24_0 || ''}
              onChange={e => updateQuotes({ hp24_0: e.target.value })}
              placeholder="Ex: Maldição!; Como posso ser derrotado?!"
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            />
          </div>

          <div style={{ marginTop: '0.3rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#ef4444', fontWeight: 'bold', marginBottom: '0.2rem' }}>💀 Fala de Derrota (Golpe Final)</label>
            <input
              type="text"
              value={value.quotes?.defeat || ''}
              onChange={e => updateQuotes({ defeat: e.target.value })}
              placeholder="Ex: NÃO PODE SER!; Fui derrotado...; AHHH!"
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239, 68, 68, 0.4)', color: 'white', fontSize: '0.82rem' }}
            />
          </div>
        </div>
      )}

      {/* ABA DE DROPS */}
      {activeSubTab === 'drops' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Itens que este monstro deixará cair quando qualquer jogador derrotá-lo em uma missão vinculada.
          </p>

          {drops.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
              Nenhum drop cadastrado para este monstro.
            </div>
          ) : (
            drops.map((drop, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 0.6rem', borderRadius: '6px', flexWrap: 'wrap' }}>
                <select
                  value={drop.itemId}
                  onChange={e => {
                    const newDrops = [...drops];
                    const selectedItem = availableStoreItems.find(it => it.id === e.target.value);
                    let defChance = 50;
                    if (selectedItem?.rarity === 'uncommon') defChance = 35;
                    if (selectedItem?.rarity === 'rare') defChance = 20;
                    if (selectedItem?.rarity === 'epic') defChance = 5;
                    if (selectedItem?.rarity === 'legendary') defChance = 1;
                    newDrops[idx] = { itemId: e.target.value, dropChance: defChance };
                    updateField({ drops: newDrops });
                  }}
                  style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                >
                  <option value="">(Selecione o Item)</option>
                  {availableStoreItems.map(it => (
                    <option key={it.id} value={it.id}>
                      {it.title || it.name || it.id} ({it.rarity || 'comum'})
                    </option>
                  ))}
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={drop.dropChance}
                    onChange={e => {
                      const newDrops = [...drops];
                      newDrops[idx].dropChance = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                      updateField({ drops: newDrops });
                    }}
                    style={{ width: '60px', padding: '0.4rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>%</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const newDrops = drops.filter((_, i) => i !== idx);
                    updateField({ drops: newDrops });
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.3rem' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}

          <button
            type="button"
            onClick={() => {
              updateField({
                drops: [...drops, { itemId: '', dropChance: 50 }],
              });
            }}
            style={{
              padding: '0.45rem 0.8rem',
              borderRadius: '6px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              color: '#60a5fa',
              fontSize: '0.78rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              marginTop: '0.3rem'
            }}
          >
            <Plus size={14} /> Adicionar Item de Drop
          </button>
        </div>
      )}
    </div>
  );
};

export default MonsterAttributesEditor;
