import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Swords, Image as ImageIcon, Gift, Search, Plus, Trash2, Move, ChevronDown, Settings, Trophy } from 'lucide-react';
import AvatarCharacter, { type AvatarConfig } from './AvatarCharacter';
import DirectUploadButton from './DirectUploadButton';

interface StoreItemOption {
  id: string;
  title?: string;
  type?: string;
  itemImageUrl?: string;
  imageUrl?: string;
  [key: string]: any;
}

function StoreItemSelect({ value, onChange, items, placeholder = '(Nenhum Item)', disabledIds = [] }: {
  value: string;
  onChange: (id: string, item: StoreItemOption | null) => void;
  items: StoreItemOption[];
  placeholder?: string;
  disabledIds?: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedItem = items.find(i => i.id === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getSortKey = (item: StoreItemOption) => (item.title || '').toLowerCase();

  const filtered = items.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (i.title || '').toLowerCase().includes(q) || (i.type || '').toLowerCase().includes(q);
  });

  const consumables = filtered.filter(i => i.type === 'consumable').sort((a, b) => getSortKey(a).localeCompare(getSortKey(b)));
  const equippables = filtered.filter(i => i.type !== 'consumable').sort((a, b) => getSortKey(a).localeCompare(getSortKey(b)));

  const renderOption = (item: StoreItemOption) => {
    const imgUrl = item.itemImageUrl || item.imageUrl || '';
    const isDisabled = disabledIds.includes(item.id);
    const typeLabel = item.type === 'consumable' ? 'Consumível' : 'Equipável';
    return (
      <div
        key={item.id}
        onClick={() => { if (!isDisabled) { onChange(item.id, item); setIsOpen(false); setSearch(''); } }}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem',
          cursor: isDisabled ? 'not-allowed' : 'pointer', opacity: isDisabled ? 0.4 : 1,
          background: value === item.id ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (!isDisabled) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.08)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = value === item.id ? 'rgba(245, 158, 11, 0.15)' : 'transparent'; }}
      >
        {imgUrl ? (
          <img src={imgUrl} alt="" style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
        ) : (
          <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'var(--text-secondary)' }}>?</div>
        )}
        <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || 'Sem nome'}</span>
        <span style={{ fontSize: '0.7rem', color: item.type === 'consumable' ? '#10b981' : '#3b82f6', fontWeight: 'bold', flexShrink: 0 }}>{typeLabel}</span>
      </div>
    );
  };

  const renderGroup = (label: string, color: string, groupItems: StoreItemOption[]) => {
    if (groupItems.length === 0) return null;
    return (
      <div>
        <div style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem', fontWeight: 'bold', color, textTransform: 'uppercase', letterSpacing: '1px', background: 'rgba(0,0,0,0.3)', position: 'sticky', top: 0, zIndex: 1 }}>
          {label} ({groupItems.length})
        </div>
        {groupItems.map(renderOption)}
      </div>
    );
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem',
          borderRadius: '8px', background: 'var(--bg-dark)', border: isOpen ? '1px solid var(--gold-primary)' : '1px solid var(--border-glass)',
          cursor: 'pointer', minHeight: '42px', transition: 'border-color 0.2s',
        }}
      >
        {selectedItem ? (
          <>
            {(selectedItem.itemImageUrl || selectedItem.imageUrl) ? (
              <img src={selectedItem.itemImageUrl || selectedItem.imageUrl} alt="" style={{ width: '20px', height: '20px', borderRadius: '3px', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '20px', height: '20px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)' }} />
            )}
            <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedItem.title || 'Sem nome'}</span>
            <span style={{ fontSize: '0.7rem', color: selectedItem.type === 'consumable' ? '#10b981' : '#3b82f6', fontWeight: 'bold' }}>{selectedItem.type === 'consumable' ? 'Cons.' : 'Equip.'}</span>
          </>
        ) : (
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{placeholder}</span>
        )}
        <ChevronDown size={14} style={{ color: 'var(--text-secondary)', marginLeft: 'auto', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          background: 'rgba(25, 30, 40, 0.98)', backdropFilter: 'blur(12px)',
          border: '1px solid var(--gold-primary)', borderRadius: '8px',
          marginTop: '4px', maxHeight: '280px', overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', position: 'sticky', top: 0, background: 'rgba(25, 30, 40, 0.98)', zIndex: 2 }}>
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar item..."
              style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
            />
          </div>
          <div onClick={() => { onChange('', null); setIsOpen(false); setSearch(''); }} style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            {placeholder}
          </div>
          {renderGroup('Consumíveis', '#10b981', consumables)}
          {renderGroup('Equipamentos', '#3b82f6', equippables)}
          {consumables.length === 0 && equippables.length === 0 && (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Nenhum item encontrado</div>
          )}
        </div>
      )}
    </div>
  );
}

export interface QuestConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Monstro / Oponente
  questMonsterName: string;
  setQuestMonsterName: (v: string) => void;
  questMonsterConfig: AvatarConfig | null;
  setQuestMonsterConfig: (c: AvatarConfig | null) => void;
  questMonsterModelUrl: string;
  setQuestMonsterModelUrl: (v: string) => void;
  questMonsterQuotes: { hp100_80?: string; hp79_50?: string; hp49_25?: string; hp24_0?: string };
  setQuestMonsterQuotes: (q: any) => void;
  questMonsterDefeatQuotes: string;
  setQuestMonsterDefeatQuotes: (v: string) => void;
  questMonsterDrops: { itemId: string; dropChance: number }[];
  setQuestMonsterDrops: (d: any) => void;
  availableMonsters: any[];
  available3DModels: any[];
  availableStoreItems: any[];
  onCustomizeMonster: () => void;
  // Arena
  questBattleBgUrl: string;
  setQuestBattleBgUrl: (v: string) => void;
  questBattleBgPosX: number;
  setQuestBattleBgPosX: (v: number) => void;
  questBattleBgPosY: number;
  setQuestBattleBgPosY: (v: number) => void;
  questBattleBgScale: number;
  setQuestBattleBgScale: (v: number) => void;
  questBattleBgMoveEnabled: boolean;
  setQuestBattleBgMoveEnabled: (v: boolean) => void;
  questBattleBgMoveDirection: 'horizontal' | 'vertical' | 'diagonal';
  setQuestBattleBgMoveDirection: (v: any) => void;
  questBattleBgMoveSpeed: number;
  setQuestBattleBgMoveSpeed: (v: number) => void;
  questBattleBgMoveDuration: number;
  setQuestBattleBgMoveDuration: (v: number) => void;
  onGalleryArena: () => void;
  onOpenArenaEditor: () => void;
  // Pódio
  questPodiumBgUrl?: string;
  setQuestPodiumBgUrl?: (v: string) => void;
  onGalleryPodium?: () => void;
  // Recompensas
  questCombatCoinMin: number;
  setQuestCombatCoinMin: (v: number) => void;
  questCombatCoinMax: number;
  setQuestCombatCoinMax: (v: number) => void;
  questCombatCoinMinValue: number;
  setQuestCombatCoinMinValue: (v: number) => void;
  questCombatCoinMaxValue: number;
  setQuestCombatCoinMaxValue: (v: number) => void;
  questMode: 'classic' | 'live';
  questChestConfig: any;
  setQuestChestConfig: (c: any) => void;
  questLiveChest1st: any;
  setQuestLiveChest1st: (c: any) => void;
  questLiveChest2nd: any;
  setQuestLiveChest2nd: (c: any) => void;
  questLiveChest3rd: any;
  setQuestLiveChest3rd: (c: any) => void;
  availableChests: any[];
  renderChestConfig: (title: string, desc: string, chestConfig: any, setChestConfig: (c: any) => void, showDropChance: boolean) => React.JSX.Element;
}

type ConfigTab = 'monster' | 'arena' | 'rewards';

/**
 * Modal de configurações do desafio dividido em dois lados:
 * - Esquerda: menu de abas (Monstro/Oponente, Arena, Recompensas)
 * - Direita: conteúdo da aba selecionada
 */
export default function QuestConfigModal(props: QuestConfigModalProps) {
  const { isOpen, onClose } = props;
  const [activeTab, setActiveTab] = useState<ConfigTab>('monster');

  if (!isOpen) return null;

  const tabs: { id: ConfigTab; label: string; icon: any; color: string }[] = [
    { id: 'monster', label: 'Monstro / Oponente', icon: Swords, color: 'var(--accent-red)' },
    { id: 'arena', label: 'Arena', icon: ImageIcon, color: '#8b5cf6' },
    { id: 'rewards', label: 'Recompensas', icon: Gift, color: 'var(--gold-primary)' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11010, padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '1200px', maxWidth: '98vw', height: '90vh', maxHeight: '94vh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings color="var(--gold-primary)" /> Configurações do Desafio
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* Corpo: esquerda (menu) + direita (conteúdo) */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* ESQUERDA — menu de abas */}
          <div style={{ width: '230px', borderRight: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
              {tabs.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <div
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.6rem',
                      padding: '0.8rem 0.9rem', marginBottom: '0.4rem', borderRadius: '8px', cursor: 'pointer',
                      background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
                      border: active ? '1px solid var(--gold-primary)' : '1px solid transparent',
                      fontWeight: active ? 'bold' : 'normal',
                    }}
                  >
                    <Icon size={18} color={tab.color} />
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{tab.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* DIREITA — conteúdo da aba */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
            {activeTab === 'monster' && <MonsterTab {...props} />}
            {activeTab === 'arena' && <ArenaTab {...props} />}
            {activeTab === 'rewards' && <RewardsTab {...props} />}
          </div>
        </div>

        {/* Rodapé */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={onClose} style={{ padding: '0.6rem 1.5rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold,#000)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Save size={16} /> Salvar Configurações
          </button>
        </div>
      </div>
    </div>
  );
}

function MonsterTab(p: QuestConfigModalProps) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
      <h4 style={{ color: 'var(--accent-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Swords size={20} /> Configurar Monstro / Oponente</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome do Monstro</label>
          <input type="text" value={p.questMonsterName} onChange={e => p.setQuestMonsterName(e.target.value)} placeholder="Ex: Golem de Pedra" style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Selecionar Monstro da Galeria</label>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <select
              value={p.availableMonsters.find(m => m.name === p.questMonsterName)?.id || ''}
              onChange={e => {
                const selected = p.availableMonsters.find(m => m.id === e.target.value);
                if (selected) {
                  p.setQuestMonsterName(selected.name);
                  p.setQuestMonsterConfig(selected.config || null);
                  if (selected.config?.customModelUrl) {
                    p.setQuestMonsterModelUrl(selected.config.customModelUrl);
                  } else if (selected.baseModelId) {
                    const rawModel = p.available3DModels.find(m => m.id === selected.baseModelId);
                    if (rawModel) p.setQuestMonsterModelUrl(rawModel.url);
                    else p.setQuestMonsterModelUrl('');
                  } else {
                    p.setQuestMonsterModelUrl('');
                  }
                } else {
                  p.setQuestMonsterName('');
                  p.setQuestMonsterConfig(null);
                  p.setQuestMonsterModelUrl('');
                }
              }}
              style={{ flex: 1, padding: '1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
            >
              <option value="">(Personalizar um novo Monstro...)</option>
              {p.availableMonsters.map(monster => (
                <option key={monster.id} value={monster.id}>{monster.name}</option>
              ))}
            </select>

            <div style={{ width: '100px', height: '100px', borderRadius: '8px', border: '1px solid var(--border-glass)', overflow: 'hidden', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {(p.questMonsterConfig || p.questMonsterModelUrl) ? (
                <AvatarCharacter
                  config={p.questMonsterConfig || (p.questMonsterModelUrl ? { customModelUrl: p.questMonsterModelUrl } as AvatarConfig : null)}
                  size={90}
                  interactive={false}
                  animation="idle"
                  role="monster"
                />
              ) : (
                <Swords size={32} color="var(--text-secondary)" opacity={0.5} />
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gridColumn: '1 / -1' }}>
          <button onClick={p.onCustomizeMonster} style={{ width: '100%', padding: '1rem', background: p.questMonsterConfig ? 'var(--gold-primary)' : 'rgba(59, 130, 246, 0.2)', color: p.questMonsterConfig ? 'var(--text-on-gold, #000000)' : 'var(--accent-primary)', border: `1px solid ${p.questMonsterConfig ? 'var(--gold-primary)' : 'var(--accent-primary)'}`, borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            {p.questMonsterConfig ? 'Editar Aparência deste Monstro' : 'Criar Monstro 3D Personalizado'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-glass)' }}>
        <h5 style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '1.1rem' }}>Falas do Monstro (Opcional - Separe por ; para sortear)</h5>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--accent-green)', fontSize: '0.9rem' }}>HP 100% a 80%</label>
            <input type="text" value={p.questMonsterQuotes.hp100_80 || ''} onChange={e => p.setQuestMonsterQuotes({ ...p.questMonsterQuotes, hp100_80: e.target.value })} placeholder="Ex: Vou te esmagar!; Renda-se!" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--gold-primary)', fontSize: '0.9rem' }}>HP 79% a 50%</label>
            <input type="text" value={p.questMonsterQuotes.hp79_50 || ''} onChange={e => p.setQuestMonsterQuotes({ ...p.questMonsterQuotes, hp79_50: e.target.value })} placeholder="Ex: Você é mais forte do que parece..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--accent-primary)', fontSize: '0.9rem' }}>HP 49% a 25%</label>
            <input type="text" value={p.questMonsterQuotes.hp49_25 || ''} onChange={e => p.setQuestMonsterQuotes({ ...p.questMonsterQuotes, hp49_25: e.target.value })} placeholder="Ex: Isso não vai ficar assim!" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--accent-red)', fontSize: '0.9rem' }}>HP Menor que 24%</label>
            <input type="text" value={p.questMonsterQuotes.hp24_0 || ''} onChange={e => p.setQuestMonsterQuotes({ ...p.questMonsterQuotes, hp24_0: e.target.value })} placeholder="Ex: Maldição!; Como posso perder?!" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
          </div>
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'bold' }}>Falas de Derrota (Quando o jogador der o Golpe Final)</label>
          <input type="text" value={p.questMonsterDefeatQuotes} onChange={e => p.setQuestMonsterDefeatQuotes(e.target.value)} placeholder="Ex: NÃO PODE SER!; Fui derrotado...; AHHH!" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--accent-red)', color: 'white', fontFamily: 'inherit' }} />
        </div>
      </div>

      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-glass)' }}>
        <h5 style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '1.1rem' }}>Recompensas de Derrota do Monstro (Drops)</h5>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>Adicione itens que o monstro pode dropar ao ser derrotado. A chance padrão é definida pela raridade do item (Comum: 60%, Incomum: 40%, Raro: 20%, Épico: 5%, Lendário: 1%), mas você pode alterá-la.</p>

        {p.questMonsterDrops.map((drop, index) => {
          return (
            <div key={index} style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: '8px' }}>
              <StoreItemSelect
                value={drop.itemId}
                onChange={(id, item) => {
                  const newDrops = [...p.questMonsterDrops];
                  let defaultChance = 60;
                  if (item?.rarity === 'uncommon') defaultChance = 40;
                  if (item?.rarity === 'rare') defaultChance = 20;
                  if (item?.rarity === 'epic') defaultChance = 5;
                  if (item?.rarity === 'legendary') defaultChance = 1;
                  newDrops[index] = { itemId: id, dropChance: defaultChance };
                  p.setQuestMonsterDrops(newDrops);
                }}
                items={p.availableStoreItems}
                placeholder="(Selecione um Item)"
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Chance:</label>
                <input
                  type="number"
                  min="0" max="100"
                  value={drop.dropChance}
                  onChange={e => {
                    const newDrops = [...p.questMonsterDrops];
                    newDrops[index].dropChance = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                    p.setQuestMonsterDrops(newDrops);
                  }}
                  style={{ width: '80px', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                />
                <span style={{ color: 'var(--text-secondary)' }}>%</span>
              </div>

              <button
                onClick={() => {
                  const newDrops = p.questMonsterDrops.filter((_, i) => i !== index);
                  p.setQuestMonsterDrops(newDrops);
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.5rem' }}
                title="Remover Drop"
              >
                <Trash2 size={20} />
              </button>
            </div>
          );
        })}

        <button
          onClick={() => p.setQuestMonsterDrops([...p.questMonsterDrops, { itemId: '', dropChance: 60 }])}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(59, 130, 246, 0.2)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)', borderRadius: '8px', cursor: 'pointer', marginTop: '1rem' }}
        >
          <Plus size={18} /> Adicionar Item de Drop
        </button>
      </div>
    </div>
  );
}

function ArenaTab(p: QuestConfigModalProps) {
  return (
    <div style={{ background: 'rgba(139, 92, 246, 0.05)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
      <h4 style={{ color: '#8b5cf6', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <ImageIcon size={20} /> Fundo da Arena de Batalha
      </h4>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Escolha uma imagem de fundo personalizada para a arena de batalha. Se não selecionar, será usado o fundo padrão.
      </p>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Preview do fundo atual */}
        <div style={{ width: '200px', height: '100px', borderRadius: '8px', border: '1px solid var(--border-glass)', overflow: 'hidden', background: 'var(--bg-dark)', flexShrink: 0 }}>
          {p.questBattleBgUrl ? (
            <div style={{
              width: '100%',
              height: '100%',
              backgroundImage: `url(${p.questBattleBgUrl})`,
              backgroundSize: `${p.questBattleBgScale * 100}%`,
              backgroundPosition: `${p.questBattleBgPosX}% ${p.questBattleBgPosY}%`,
              backgroundRepeat: 'no-repeat'
            }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'url(/battle_bg.png) center/cover', opacity: 0.5 }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Botões de ação */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={p.onGalleryArena}
              style={{ padding: '0.5rem 1rem', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--gold-primary)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 'bold' }}
            >
              <Search size={16} /> Galeria
            </button>
            <DirectUploadButton
              folder="arena-backgrounds"
              onUploadComplete={(url) => p.setQuestBattleBgUrl(url)}
              buttonStyle={{ padding: '0.5rem 1rem', background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.3)' }}
            />
            {p.questBattleBgUrl && (
              <button
                onClick={p.onOpenArenaEditor}
                style={{ padding: '0.5rem 1rem', background: 'rgba(59, 130, 246, 0.2)', color: 'var(--accent-blue)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 'bold' }}
              >
                <Move size={16} /> Ajustar Posição
              </button>
            )}
            <button
              onClick={() => { p.setQuestBattleBgUrl(''); p.setQuestBattleBgPosX(50); p.setQuestBattleBgPosY(50); p.setQuestBattleBgScale(1.2); p.setQuestBattleBgMoveEnabled(true); p.setQuestBattleBgMoveDirection('diagonal'); p.setQuestBattleBgMoveSpeed(10); p.setQuestBattleBgMoveDuration(30); }}
              style={{ padding: '0.5rem 1rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Usar Padrão
            </button>
          </div>

          {/* Position Info */}
          {p.questBattleBgUrl && (p.questBattleBgPosX !== 50 || p.questBattleBgPosY !== 50 || p.questBattleBgScale !== 1.2) && (
            <div style={{
              display: 'flex', gap: '1rem',
              background: 'rgba(59, 130, 246, 0.1)',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              color: 'var(--accent-blue)'
            }}>
              <span>X: {p.questBattleBgPosX.toFixed(0)}%</span>
              <span>Y: {p.questBattleBgPosY.toFixed(0)}%</span>
              <span>Zoom: {p.questBattleBgScale.toFixed(2)}x</span>
            </div>
          )}

          {/* Input manual de URL */}
          <input
            type="text"
            value={p.questBattleBgUrl}
            onChange={e => p.setQuestBattleBgUrl(e.target.value)}
            placeholder="Ou cole a URL da imagem aqui..."
            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem' }}
          />
        </div>
      </div>

      {/* SEÇÃO DO CENÁRIO DO PÓDIO */}
      <hr style={{ borderColor: 'rgba(255, 255, 255, 0.1)', margin: '1.5rem 0' }} />

      <h4 style={{ color: 'var(--gold-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Trophy size={20} /> Fundo do Pódio dos Campeões
      </h4>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Escolha uma imagem de fundo para a consagração dos vencedores e pódio no Modo Ao Vivo. Fica incrível com as explosões de fogos!
      </p>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Preview do fundo do pódio atual */}
        <div style={{ width: '200px', height: '100px', borderRadius: '8px', border: '1px solid var(--border-glass)', overflow: 'hidden', background: 'var(--bg-dark)', flexShrink: 0 }}>
          {p.questPodiumBgUrl ? (
            <div style={{
              width: '100%',
              height: '100%',
              backgroundImage: `url(${p.questPodiumBgUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'radial-gradient(ellipse at center, rgba(30, 27, 75, 0.9) 0%, rgba(10, 10, 20, 0.98) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 'bold' }}>
              Fundo Padrão Cósmico
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Botões de ação */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {p.onGalleryPodium && (
              <button
                onClick={p.onGalleryPodium}
                style={{ padding: '0.5rem 1rem', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--gold-primary)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 'bold' }}
              >
                <Search size={16} /> Galeria
              </button>
            )}
            <DirectUploadButton
              folder="podium-backgrounds"
              onUploadComplete={(url) => p.setQuestPodiumBgUrl && p.setQuestPodiumBgUrl(url)}
              buttonStyle={{ padding: '0.5rem 1rem', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--gold-primary)', border: '1px solid rgba(245, 158, 11, 0.3)' }}
            />
            {p.questPodiumBgUrl && (
              <button
                onClick={() => p.setQuestPodiumBgUrl && p.setQuestPodiumBgUrl('')}
                style={{ padding: '0.5rem 1rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Usar Padrão
              </button>
            )}
          </div>

          {/* Input manual de URL */}
          <input
            type="text"
            value={p.questPodiumBgUrl || ''}
            onChange={e => p.setQuestPodiumBgUrl && p.setQuestPodiumBgUrl(e.target.value)}
            placeholder="Ou cole a URL da imagem do pódio aqui..."
            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem' }}
          />
        </div>
      </div>
    </div>
  );
}

function RewardsTab(p: QuestConfigModalProps) {
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem', border: '1px solid var(--gold-primary)', borderRadius: '12px', background: 'rgba(251, 191, 36, 0.05)' }}>
        <h3 style={{ fontSize: '1.2rem', color: 'var(--gold-primary)', margin: 0 }}>Drop de Moedas em Combate</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
          Moedas caem do monstro a cada acerto, e o jogador clica para coletar. Vale quando a economia é "Moedas de Ouro" e "Moedas visíveis nos desafios" está ativa (também nas revisões). O baú e itens grandes só caem na 1ª conclusão.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Qtd. mínima de moedas</label>
            <input type="number" min="1" value={p.questCombatCoinMin} onChange={e => p.setQuestCombatCoinMin(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Qtd. máxima de moedas</label>
            <input type="number" min="1" value={p.questCombatCoinMax} onChange={e => p.setQuestCombatCoinMax(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Valor mín. por moeda</label>
            <input type="number" min="1" value={p.questCombatCoinMinValue} onChange={e => p.setQuestCombatCoinMinValue(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Valor máx. por moeda</label>
            <input type="number" min="1" value={p.questCombatCoinMaxValue} onChange={e => p.setQuestCombatCoinMaxValue(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
          </div>
        </div>
      </div>

      {p.renderChestConfig(
        p.questMode === 'classic' ? 'Baú de Recompensas (Final da Missão)' : 'Baú de Revisão (Final da Missão Normal)',
        'O jogador terá 100% de chance de receber Moedas aleatórias (entre 10% e o valor máximo). Cada item tem uma chance definida por slot (padrão: 50%, 25%, 10%, 5%) que pode ser ajustada abaixo. O próximo slot só é sorteado se o anterior for ganho.',
        p.questChestConfig,
        p.setQuestChestConfig,
        true
      )}

      {p.questMode === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem', padding: '1.5rem', border: '1px solid var(--gold-primary)', borderRadius: '12px', background: 'rgba(251, 191, 36, 0.05)' }}>
          <h3 style={{ fontSize: '1.5rem', color: 'var(--gold-primary)', margin: 0 }}>Baús de Recompensa (Pódio Ao Vivo)</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>No modo ao vivo, as chances de itens são sempre 100%. Configure um baú para o 1º, 2º e 3º colocado (que será entregue imediatamente no encerramento da batalha).</p>

          {p.renderChestConfig('Baú do 1º Lugar', '', p.questLiveChest1st, p.setQuestLiveChest1st, false)}
          {p.renderChestConfig('Baú do 2º Lugar', '', p.questLiveChest2nd, p.setQuestLiveChest2nd, false)}
          {p.renderChestConfig('Baú do 3º Lugar', '', p.questLiveChest3rd, p.setQuestLiveChest3rd, false)}
        </div>
      )}
    </>
  );
}