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
import { generateMonsterBiographyWithAI, generateMonsterQuotesWithAI } from '../lib/monsterAiBiography';

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
  /** Pontos de vida da criatura (usado nos mapas exploráveis). */
  hp?: number;
  /** Agressividade em relação a ANIMAIS: pacífico (só revida), neutro (revida/reage) ou agressivo (ataca qualquer animal no raio). */
  aggression?: 'peaceful' | 'neutral' | 'aggressive';
  /** Agendamento de agressividade por nível: { level, aggression } — muda conforme o monstro evolui (vence batalhas). */
  aggressionByLevel?: Array<{ level: number; aggression: 'peaceful' | 'neutral' | 'aggressive' }>;
  xp?: number;
  /** Tabela de fuga configurável ("corações restantes → chance %"). Vazia = NUNCA foge. */
  fleeChanceTable?: Array<{ minHearts: number; chance: number }>;
  /** Animais: chance (0-1) de ficar HOSTIL quando atacado. */
  hostileChance?: number;
  /** Dano de efeito aplicado pelos golpes (poison/bleed/burn/electric/freeze/none). */
  damageEffect?: string;
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
    /** Fala do monstro ao derrotar o jogador (golpe final contra o herói). */
    win?: string;
  };
  drops?: Array<{ itemId: string; dropChance: number; min?: number; max?: number }>;
  stats?: MonsterStatsConfig;
  biography?: string;
}

interface MonsterAttributesEditorProps {
  value?: MonsterAttributesConfig;
  onChange: (value: MonsterAttributesConfig) => void;
  availableStoreItems?: any[];
  tabMode?: 'sounds_and_quotes' | 'drops' | 'stats' | 'lore' | 'all';
  monsterName?: string;
  monsterAttacks?: any;
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
  monsterName = '',
  monsterAttacks,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'sounds' | 'quotes' | 'drops' | 'stats' | 'lore'>(
    tabMode === 'drops' ? 'drops' : tabMode === 'stats' ? 'stats' : tabMode === 'lore' ? 'lore' : 'sounds'
  );
  const [isGeneratingBio, setIsGeneratingBio] = useState(false);
  const [isGeneratingQuotes, setIsGeneratingQuotes] = useState(false);

  useEffect(() => {
    if (tabMode === 'drops') {
      setActiveSubTab('drops');
    } else if (tabMode === 'stats') {
      setActiveSubTab('stats');
    } else if (tabMode === 'lore') {
      setActiveSubTab('lore');
    } else if (tabMode === 'sounds_and_quotes' && (activeSubTab === 'drops' || activeSubTab === 'stats' || activeSubTab === 'lore')) {
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
    hp: value.stats?.hp,
    aggression: value.stats?.aggression || 'aggressive',
    aggressionByLevel: value.stats?.aggressionByLevel,
    xp: value.stats?.xp ?? 0,
    fleeChanceTable: value.stats?.fleeChanceTable,
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
            <button
              type="button"
              onClick={() => setActiveSubTab('lore')}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: activeSubTab === 'lore' ? 'bold' : 'normal',
                background: activeSubTab === 'lore' ? 'rgba(168, 85, 247, 0.25)' : 'transparent',
                color: activeSubTab === 'lore' ? '#c084fc' : 'var(--text-secondary)',
                border: activeSubTab === 'lore' ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid transparent',
                cursor: 'pointer'
              }}
            >
              📜 Biografia IA
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

            {/* HP */}
            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239, 68, 68, 0.45)', borderRadius: '8px', padding: '0.65rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: '#fca5a5', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                ❤️ Pontos de Vida (HP)
              </label>
              <input
                type="number"
                min="1"
                placeholder={currentStats.hp === undefined ? `auto (${Math.max(40, Math.round(40 + (currentStats.level || 1) * 35))})` : undefined}
                value={currentStats.hp ?? ''}
                onChange={e => updateStats({ hp: e.target.value === '' ? undefined : Math.max(1, parseInt(e.target.value) || 1) })}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 'bold', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Usado nos mapas exploráveis. Vazio = automático pelo nível.
              </div>
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

          {/* Tabela de Fuga */}
            <div style={{ maxWidth: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255, 87, 34, 0.25)', borderRadius: '8px', padding: '0.65rem', boxSizing: 'border-box' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: '#ff8a65', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                🏃 Chance de Fuga (por corações restantes)
              </label>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.66rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                No golpe final (última questão), o monstro foge conforme o número de corações que ainda lhe restam.
                <strong> Sem tabela cadastrada, o monstro NUNCA foge.</strong> Só foge se houver uma chance cadastrada e a condição (corações) for atendida.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '0.5rem' }}>
              {(currentStats.fleeChanceTable || []).map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.4rem', background: 'rgba(255,138,101,0.06)', border: '1px solid rgba(255,138,101,0.2)', borderRadius: '8px', padding: '0.55rem', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Mín. ♥</label>
                    <input
                      type="number"
                      min="1"
                      value={row.minHearts}
                      onChange={e => updateStats({
                        fleeChanceTable: (currentStats.fleeChanceTable || []).map((r, j) => j === i ? { ...r, minHearts: Math.max(1, parseInt(e.target.value) || 1) } : r),
                      })}
                      title="Mínimo de corações restantes"
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.8rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ fontSize: '1rem', color: 'var(--text-secondary)', paddingBottom: '0.3rem' }}>→</div>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Chance %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={row.chance}
                      onChange={e => updateStats({
                        fleeChanceTable: (currentStats.fleeChanceTable || []).map((r, j) => j === i ? { ...r, chance: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) } : r),
                      })}
                      title="Chance de fuga (%)"
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.8rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => updateStats({ fleeChanceTable: (currentStats.fleeChanceTable || []).filter((_, j) => j !== i) })}
                    title="Remover degrau"
                    style={{ padding: '0.4rem 0.55rem', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '6px', color: '#f87171', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.5rem', marginTop: '0.15rem' }}>
                <button
                  type="button"
                  onClick={() => updateStats({ fleeChanceTable: [...(currentStats.fleeChanceTable || []), { minHearts: (currentStats.fleeChanceTable?.length || 0) + 2, chance: 20 }] })}
                  style={{ padding: '0.5rem', background: 'rgba(255,138,101,0.12)', border: '1px dashed rgba(255,138,101,0.5)', borderRadius: '8px', color: '#ff8a65', fontSize: '0.78rem', cursor: 'pointer' }}
                >
                  + Adicionar degrau
                </button>
                {(currentStats.fleeChanceTable || []).length > 0 && (
                  <button
                    type="button"
                    onClick={() => updateStats({ fleeChanceTable: undefined })}
                    style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer' }}
                  >
                    Usar padrão do jogo (limpar tabela = nunca foge)
                  </button>
                )}
              </div>
            </div>

          <div style={{ marginTop: '0.6rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.6rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500 }}>Chance de ficar HOSTIL ao ser atacado (%)</label>
              <input type="number" min={0} max={100} value={Math.round((currentStats.hostileChance ?? 0) * 100)} onChange={e => updateStats({ hostileChance: Math.min(1, Math.max(0, (parseInt(e.target.value) || 0) / 100)) })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500 }}>Agressividade (contra animais)</label>
              <select value={currentStats.aggression || 'aggressive'} onChange={e => updateStats({ aggression: e.target.value as any })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.82rem' }}>
                <option value="peaceful">🕊️ Pacífico — só revida se for atacado por um animal</option>
                <option value="neutral">⚖️ Neutro — ataca animais se for atacado (por animal ou jogador)</option>
                <option value="aggressive">⚔️ Agressivo — ataca qualquer animal no seu raio</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500 }}>Muda a agressividade a partir do nível (evolução)</label>
              {(currentStats.aggressionByLevel || []).map((e, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Nv.</span>
                  <input type="number" min={1} value={e.level} onChange={ev => updateStats({ aggressionByLevel: (currentStats.aggressionByLevel || []).map((x, j) => j === idx ? { ...x, level: Math.max(1, parseInt(ev.target.value) || 1) } : x) })} style={{ width: 60, padding: '0.35rem', borderRadius: 6, background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                  <select value={e.aggression} onChange={ev => updateStats({ aggressionByLevel: (currentStats.aggressionByLevel || []).map((x, j) => j === idx ? { ...x, aggression: ev.target.value as any } : x) })} style={{ flex: 1, padding: '0.35rem', borderRadius: 6, background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                    <option value="peaceful">🕊️ Pacífico</option>
                    <option value="neutral">⚖️ Neutro</option>
                    <option value="aggressive">⚔️ Agressivo</option>
                  </select>
                  <button onClick={() => updateStats({ aggressionByLevel: (currentStats.aggressionByLevel || []).filter((_, j) => j !== idx) })} style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                </div>
              ))}
              <button onClick={() => updateStats({ aggressionByLevel: [...(currentStats.aggressionByLevel || []), { level: (currentStats.level || 1) + 1, aggression: 'aggressive' as any }] })} style={{ padding: '0.3rem 0.6rem', borderRadius: 6, background: 'rgba(245,158,11,0.15)', border: '1px dashed rgba(245,158,11,0.5)', color: 'var(--gold-primary)', cursor: 'pointer', fontSize: '0.75rem' }}>+ Faixa de nível</button>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 4 }}>Ex.: pacífico até nv3, neutro do nv4 ao nv7, agressivo do nv8. Vale por MONSTRO (cada um sobe de nível vencendo batalhas).</div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500 }}>Dano de efeito do golpe</label>
              <select value={currentStats.damageEffect || 'none'} onChange={e => updateStats({ damageEffect: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.82rem' }}>
                <option value="none">Nenhum</option>
                <option value="poison">Veneno</option>
                <option value="bleed">Sangramento</option>
                <option value="burn">Queimadura</option>
                <option value="electric">Elétrico</option>
                <option value="freeze">Congelamento</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
            <button
              type="button"
              onClick={() => updateStats({ level: 1, attack: 1, defense: 1, evasion: 1, critChance: 1, hp: undefined, xp: 0, fleeChanceTable: undefined })}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Separe várias falas com ponto e vírgula (;) para que sejam sorteadas aleatoriamente.
            </p>
            <button
              type="button"
              disabled={isGeneratingQuotes}
              onClick={async () => {
                setIsGeneratingQuotes(true);
                try {
                  const quotes = await generateMonsterQuotesWithAI({
                    monsterName: monsterName || 'Monstro',
                    gender: value.gender || 'male',
                    level: value.stats?.level || 1,
                    biography: value.biography,
                    attacks: monsterAttacks,
                    quotes: value.quotes
                  });
                  updateQuotes(quotes);
                } catch (e) {
                  console.error('Erro ao gerar falas com IA:', e);
                } finally {
                  setIsGeneratingQuotes(false);
                }
              }}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '8px',
                background: isGeneratingQuotes ? 'rgba(245, 158, 11, 0.2)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: 'white',
                border: 'none',
                cursor: isGeneratingQuotes ? 'wait' : 'pointer',
                fontSize: '0.78rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
              }}
            >
              <Sparkles size={14} />
              {isGeneratingQuotes ? 'Gerando falas...' : '✨ Gerar falas com IA'}
            </button>
          </div>

          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.6rem', lineHeight: 1.4 }}>
            Escreva <b>várias falas separadas por ponto e vírgula ( ; )</b> — o jogo sorteia uma aleatoriamente. Sem fala cadastrada, o monstro <b>não fala</b> (não há fala padrão).
          </div>

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

          <div style={{ marginTop: '0.3rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#fbbf24', fontWeight: 'bold', marginBottom: '0.2rem' }}>🏆 Fala de Vitória (Ao Derrotar o Jogador)</label>
            <input
              type="text"
              value={value.quotes?.win || ''}
              onChange={e => updateQuotes({ win: e.target.value })}
              placeholder="Ex: Você é fraco!; Eu venci!; Não é páreo para mim!"
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(251, 191, 36, 0.4)', color: 'white', fontSize: '0.82rem' }}
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
                    step="any"
                    value={drop.dropChance}
                    onChange={e => {
                      const newDrops = [...drops];
                      newDrops[idx].dropChance = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                      updateField({ drops: newDrops });
                    }}
                    style={{ width: '75px', padding: '0.4rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>%</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Qtde</span>
                  <input type="number" min={1} value={drop.min ?? 1} onChange={e => { const nd = [...drops]; nd[idx] = { ...nd[idx], min: Math.max(1, parseInt(e.target.value) || 1) }; updateField({ drops: nd }); }} style={{ width: '54px', padding: '0.4rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>–</span>
                  <input type="number" min={1} value={drop.max ?? 1} onChange={e => { const nd = [...drops]; nd[idx] = { ...nd[idx], max: Math.max(1, parseInt(e.target.value) || 1) }; updateField({ drops: nd }); }} style={{ width: '54px', padding: '0.4rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
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

      {/* SUB-GUIA: BIOGRAFIA IA */}
      {activeSubTab === 'lore' && (
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h4 style={{ margin: 0, color: '#c084fc', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Sparkles size={16} /> Biografia & Alma da Criatura (Bestiário)
              </h4>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Esta é a biografia canônica completa. No Bestiário do aluno, ela se revela dinamicamente conforme os alunos enfrentam o monstro!
              </p>
            </div>
            <button
              type="button"
              disabled={isGeneratingBio}
              onClick={async () => {
                setIsGeneratingBio(true);
                try {
                  const dropItemTitles = (value.drops || []).map(d => {
                    const found = availableStoreItems.find(it => it.id === d.itemId);
                    return { itemId: d.itemId, itemTitle: found?.title || found?.name || 'Item' };
                  });
                  const bio = await generateMonsterBiographyWithAI({
                    monsterName: monsterName || 'Monstro',
                    gender: value.gender || 'male',
                    level: value.stats?.level || 1,
                    attacks: monsterAttacks,
                    drops: dropItemTitles,
                    quotes: value.quotes
                  });
                  updateField({ biography: bio });
                } catch (e) {
                  console.error('Erro ao gerar biografia:', e);
                } finally {
                  setIsGeneratingBio(false);
                }
              }}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                background: isGeneratingBio ? 'rgba(168, 85, 247, 0.2)' : 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                color: 'white',
                border: 'none',
                cursor: isGeneratingBio ? 'wait' : 'pointer',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 2px 8px rgba(168, 85, 247, 0.3)'
              }}
            >
              <Sparkles size={15} />
              {isGeneratingBio ? 'Criando com IA...' : '✨ Gerar com IA'}
            </button>
          </div>

          <textarea
            rows={8}
            value={value.biography || ''}
            onChange={e => updateField({ biography: e.target.value })}
            placeholder="Escreva a biografia oficial do monstro ou clique em 'Gerar com IA' para que a IA crie a lenda com base nos ataques, sons e drops..."
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              background: 'var(--bg-dark)',
              border: '1px solid var(--border-glass)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              lineHeight: 1.5,
              resize: 'vertical',
              boxSizing: 'border-box',
              fontFamily: 'inherit'
            }}
          />
        </div>
      )}
    </div>
  );
};

export default MonsterAttributesEditor;
