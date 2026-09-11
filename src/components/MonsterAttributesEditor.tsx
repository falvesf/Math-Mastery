import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Volume2, 
  MessageSquare, 
  Gift, 
  Plus, 
  Trash2, 
  XCircle,
  ChevronDown,
  Sparkles,
  Swords,
  Shield,
  Zap,
  Flame,
  RotateCcw
} from 'lucide-react';
import AudioBankPicker from './AudioBankPicker';
import ItemSelectDropdown, { type ItemSelectOption } from './ItemSelectDropdown';

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
// @ts-ignore
void Zap;
// @ts-ignore
void Flame;

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

export interface MonsterStatsConfig {
  level: number;
  attack: number;
  defense: number;
  evasion: number;
  critChance: number;
  xp?: number;
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
  stats?: MonsterStatsConfig;
}

interface MonsterAttributesEditorProps {
  value?: MonsterAttributesConfig;
  onChange: (value: MonsterAttributesConfig) => void;
  availableStoreItems?: any[];
  tabMode?: 'sounds_and_quotes' | 'drops' | 'stats' | 'all';
}

function getItemTypeLabel(item: any): string {
  if (item.avatarPart === 'hand' || item.avatarPart === 'two_handed') return 'Arma';
  if (item.avatarPart === 'head' || item.avatarPart === 'face') return 'Elmo';
  if (item.avatarPart === 'body') return 'Armadura';
  if (item.avatarPart === 'legs') return 'Calças';
  if (item.avatarPart === 'feet') return 'Botas';
  if (item.avatarPart === 'accessory') return 'Acessório';
  if (item.avatarPart === 'pet') return 'Mascote';
  if (item.avatarPart === 'background') return 'Cenário';
  if (item.type === 'consumable') return 'Consumível';
  if (item.type === 'equippable') return 'Equipável';
  return 'Item';
}

export const MonsterAttributesEditor: React.FC<MonsterAttributesEditorProps> = ({
  value = {},
  onChange,
  availableStoreItems = [],
  tabMode = 'all',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'sounds' | 'quotes' | 'drops' | 'stats'>(
    tabMode === 'drops' ? 'drops' : tabMode === 'stats' ? 'stats' : 'sounds'
  );

  useEffect(() => {
    if (tabMode === 'drops') {
      setActiveSubTab('drops');
    } else if (tabMode === 'stats') {
      setActiveSubTab('stats');
    } else if (tabMode === 'sounds_and_quotes' && (activeSubTab === 'drops' || activeSubTab === 'stats')) {
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

  const currentStats: MonsterStatsConfig = {
    level: value.stats?.level ?? 1,
    attack: value.stats?.attack ?? 1,
    defense: value.stats?.defense ?? 1,
    evasion: value.stats?.evasion ?? 1,
    critChance: value.stats?.critChance ?? 1,
    xp: value.stats?.xp ?? 0,
  };

  const updateStats = (statsPatch: Partial<MonsterStatsConfig>) => {
    onChange({
      ...value,
      stats: {
        ...currentStats,
        ...statsPatch,
      },
    });
  };

  const drops = value.drops || [];

  // Itens mapeados para o ItemSelectDropdown (com título, imagem, raridade e tag de tipo)
  const storeItemOptions: ItemSelectOption[] = useMemo(() => {
    return availableStoreItems.map(it => ({
      id: it.id,
      title: it.title || it.name || it.id,
      imageUrl: it.imageUrl || it.image_url || it.gameImage2dUrl,
      rarity: it.rarity || 'common',
      typeLabel: getItemTypeLabel(it),
    }));
  }, [availableStoreItems]);

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
      ) : tabMode === 'stats' ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.6rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Shield size={16} /> Atributos de Combate & Nível
          </h4>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px' }}>
            Nível {currentStats.level}
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
            <Sparkles size={16} /> Identidade, Atributos & Drops
          </h4>
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setActiveSubTab('stats')}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: activeSubTab === 'stats' ? 'bold' : 'normal',
                background: activeSubTab === 'stats' ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
                color: activeSubTab === 'stats' ? '#60a5fa' : 'var(--text-secondary)',
                border: activeSubTab === 'stats' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
                cursor: 'pointer'
              }}
            >
              🛡️ Atributos
            </button>
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
                background: activeSubTab === 'drops' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                color: activeSubTab === 'drops' ? '#34d399' : 'var(--text-secondary)',
                border: activeSubTab === 'drops' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid transparent',
                cursor: 'pointer'
              }}
            >
              🎁 Drops ({drops.length})
            </button>
          </div>
        </div>
      )}

      {/* ABA DE ATRIBUTOS E NÍVEL */}
      {activeSubTab === 'stats' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Estatísticas base da criatura. Monstros começam por padrão com nível 1 e 1 em cada atributo. Se um monstro vencer a batalha (jogador derrotado), ele absorve <strong>5% do XP da missão</strong>, sobe de nível baseado nos pontos das patentes e ganha <strong>6 pontos aleatórios</strong> de atributos.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem' }}>
            {/* Nível */}
            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0.65rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gold-primary)', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                ⭐ Nível
              </label>
              <input
                type="number"
                min="1"
                value={currentStats.level}
                onChange={e => updateStats({ level: Math.max(1, parseInt(e.target.value) || 1) })}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 'bold', boxSizing: 'border-box' }}
              />
            </div>

            {/* Ataque */}
            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '8px', padding: '0.65rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: '#f87171', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                ⚔️ Poder de Ataque
              </label>
              <input
                type="number"
                min="1"
                value={currentStats.attack}
                onChange={e => updateStats({ attack: Math.max(1, parseInt(e.target.value) || 1) })}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 'bold', boxSizing: 'border-box' }}
              />
            </div>

            {/* Defesa */}
            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px', padding: '0.65rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: '#60a5fa', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                🛡️ Poder de Defesa
              </label>
              <input
                type="number"
                min="1"
                value={currentStats.defense}
                onChange={e => updateStats({ defense: Math.max(1, parseInt(e.target.value) || 1) })}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 'bold', boxSizing: 'border-box' }}
              />
            </div>

            {/* Evasão */}
            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '0.65rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: '#34d399', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                💨 Evasão (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={currentStats.evasion}
                onChange={e => updateStats({ evasion: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 'bold', boxSizing: 'border-box' }}
              />
            </div>

            {/* Chance de Crítico */}
            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '8px', padding: '0.65rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: '#fbbf24', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                💥 Chance de Crítico (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={currentStats.critChance}
                onChange={e => updateStats({ critChance: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 'bold', boxSizing: 'border-box' }}
              />
            </div>

            {/* XP Acumulado */}
            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(168, 85, 247, 0.25)', borderRadius: '8px', padding: '0.65rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: '#c084fc', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                ✨ XP Acumulado
              </label>
              <input
                type="number"
                min="0"
                value={currentStats.xp || 0}
                onChange={e => updateStats({ xp: Math.max(0, parseInt(e.target.value) || 0) })}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 'bold', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
            <button
              type="button"
              onClick={() => updateStats({ level: 1, attack: 1, defense: 1, evasion: 1, critChance: 1, xp: 0 })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.4rem 0.75rem',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                fontSize: '0.74rem',
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={13} /> Restaurar Padrões (Nv. 1, Atributos 1)
            </button>
          </div>
        </div>
      )}

      {/* ABA DE SONS */}
      {activeSubTab === 'sounds' && (
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500 }}>Gênero da Criatura (Voz Padrão)</label>
            <select
              value={value.gender || 'male'}
              onChange={e => updateField({ gender: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            >
              <option value="male">Masculino / Monstro Padrão</option>
              <option value="female">Feminino / Criatura Fêmea</option>
            </select>
          </div>

          <SoundInput
            label="Som de Ataque Físico"
            value={value.attackSound || ''}
            onChange={v => updateField({ attackSound: v })}
            categoryFilter="voice"
            genderFilter={value.gender || 'male'}
          />

          <SoundInput
            label="Som de Grunhido / Rugido"
            value={value.gruntSound || ''}
            onChange={v => updateField({ gruntSound: v })}
            categoryFilter="voice"
            genderFilter={value.gender || 'male'}
          />

          <SoundInput
            label="Som ao Levar Dano (Hurt)"
            value={value.damageSound || ''}
            onChange={v => updateField({ damageSound: v })}
            categoryFilter="voice"
            genderFilter={value.gender || 'male'}
          />
        </div>
      )}

      {/* ABA DE FALAS */}
      {activeSubTab === 'quotes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Separe várias falas com ponto e vírgula (;) para que sejam sorteadas aleatoriamente.
          </p>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--accent-green)', marginBottom: '0.2rem' }}>HP Cheio (80% - 100%)</label>
            <input
              type="text"
              value={value.quotes?.hp100_80 || ''}
              onChange={e => updateQuotes({ hp100_80: e.target.value })}
              placeholder="Ex: Você não é páreo para mim!; Desista enquanto pode!"
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--gold-primary)', marginBottom: '0.2rem' }}>HP Médio (50% - 79%)</label>
            <input
              type="text"
              value={value.quotes?.hp79_50 || ''}
              onChange={e => updateQuotes({ hp79_50: e.target.value })}
              placeholder="Ex: Nada mal, mas isso termina agora!; Foi apenas um arranhão!"
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#f97316', marginBottom: '0.2rem' }}>HP Baixo (25% - 49%)</label>
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
            Itens que este monstro deixará cair durante a luta na arena quando qualquer jogador acertar e derrotar o monstro. Lista filtrada exclusivamente pelos itens cadastrados nesta escola.
          </p>

          {drops.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
              Nenhum drop cadastrado para este monstro.
            </div>
          ) : (
            drops.map((drop, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 0.6rem', borderRadius: '6px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <ItemSelectDropdown
                    items={storeItemOptions}
                    value={drop.itemId}
                    onChange={(newId) => {
                      const newDrops = [...drops];
                      const selectedItem = availableStoreItems.find(it => it.id === newId);
                      let defChance = 50;
                      if (selectedItem?.rarity === 'uncommon') defChance = 35;
                      if (selectedItem?.rarity === 'rare') defChance = 20;
                      if (selectedItem?.rarity === 'epic') defChance = 5;
                      if (selectedItem?.rarity === 'mestre') defChance = 2;
                      if (selectedItem?.rarity === 'legendary') defChance = 1;
                      newDrops[idx] = { itemId: newId, dropChance: defChance };
                      updateField({ drops: newDrops });
                    }}
                    placeholder="(Selecione o Item de Drop)"
                  />
                </div>

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
