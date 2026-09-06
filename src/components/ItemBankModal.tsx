import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useDialog } from '../contexts/DialogContext';
import { X, Search, Download, Copy, Eye, Package, Loader2, Edit2, Trash2, Check, CheckCheck } from 'lucide-react';
import ItemIcon from './ItemIcon';
import ItemTooltip from './ItemTooltip';

interface StoreItemData {
  id: string;
  title?: string;
  description?: string;
  type?: string;
  category?: string;
  rarity?: string;
  cost?: number;
  imageUrl?: string;
  gameModelUrl?: string;
  modelTextureUrl?: string;
  minecraftHeadValue?: string;
  [key: string]: any;
  isForgeable?: boolean;
  forgeConfig?: any;
  isTransmutable?: boolean;
  isTransmuted?: boolean;
  transmuteConfig?: any;
}

interface ItemBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (item: StoreItemData, copyMode: 'direct' | 'customize') => void;
  onImportMultiple?: (items: StoreItemData[]) => void;
  onEditGlobal?: (item: StoreItemData) => void;
  localItems?: StoreItemData[];
}

export default function ItemBankModal({ isOpen, onClose, onImport, onImportMultiple, onEditGlobal, localItems }: ItemBankModalProps) {
  const { isSuperAdmin } = useTenant();
  const { showAlert, showConfirm } = useDialog();
  const [items, setItems] = useState<StoreItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'consumable' | 'equippable'>('all');
  const [filterRarity, setFilterRarity] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<StoreItemData | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [importingMultiple, setImportingMultiple] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchItems();
      setSelectedIds([]);
    }
  }, [isOpen]);

  // IDs de itens globais já importados na loja local desta escola
  const importedSourceIds = new Set(
    (localItems || [])
      .map(i => (i as any).importedFromId)
      .filter(Boolean) as string[]
  );

  // Fallback para itens importados antes desta feature (sem importedFromId):
  // considera importado se existir item local com o mesmo título.
  const localTitles = new Set(
    (localItems || [])
      .map(i => String((i as any).title || '').trim().toLowerCase())
      .filter(Boolean)
  );

  const isImported = (item: StoreItemData) =>
    importedSourceIds.has(item._rawId) ||
    localTitles.has(String(item.title || '').trim().toLowerCase());

  const fetchItems = async () => {
    setLoading(true);
    try {
      // Banco de itens: apenas os itens GLOBAIS (base), para a escola importar/copiar
      const itemsQuery = supabase
        .from('store_items')
        .select('*')
        .eq('active', true)
        .eq('is_global', true);

      const { data, error } = await itemsQuery;

      if (error) throw error;
      
      // Mapear os dados para um formato consistente
      const mappedItems = (data || []).map(item => {
        const itemData = item.data || {};
        return {
          id: item.id,
          title: itemData.title || item.name || 'Sem nome',
          description: itemData.description || item.description || '',
          type: itemData.type || item.type || 'consumable',
          category: itemData.category || 'geral',
          rarity: itemData.rarity || item.rarity || 'common',
          cost: itemData.cost || item.price || 0,
          imageUrl: itemData.imageUrl || item.image_url || '',
          gameModelUrl: itemData.gameModelUrl || '',
          modelTextureUrl: itemData.modelTextureUrl || '',
          minecraftHeadValue: itemData.minecraftHeadValue || '',
          ...itemData,
          _rawId: item.id,
          _tenantId: item.tenant_id,
          _isGlobal: item.is_global,
        };
      });
      
      setItems(mappedItems);
    } catch (err) {
      console.error('Erro ao carregar itens:', err);
      showAlert('Erro', 'Não foi possível carregar o banco de itens.');
    } finally {
      setLoading(false);
    }
  };

  const handleImportClick = (item: StoreItemData) => {
    setSelectedItem(item);
    setShowImportModal(true);
  };

  const handleImportConfirm = (copyMode: 'direct' | 'customize') => {
    if (selectedItem) {
      onImport(selectedItem, copyMode);
      setShowImportModal(false);
      setSelectedItem(null);
      onClose();
    }
  };

  const toggleSelect = (id: string) => {
    // Itens já importados não podem ser selecionados para reimportação
    const item = items.find(i => i.id === id);
    if (item && isImported(item)) return;
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredItems.filter(i => !isImported(i)).map(i => i.id);
    const allVisibleSelected = visibleIds.every(id => selectedIds.includes(id));
    if (allVisibleSelected) {
      setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...visibleIds])]);
    }
  };

  const handleImportMultiple = async () => {
    const selectedItems = items.filter(i => selectedIds.includes(i.id));
    if (selectedItems.length === 0 || !onImportMultiple) return;
    setImportingMultiple(true);
    try {
      await onImportMultiple(selectedItems);
      setSelectedIds([]);
      fetchItems();
    } finally {
      setImportingMultiple(false);
    }
  };

  const handleDeleteGlobal = async (item: StoreItemData) => {
    if (!isSuperAdmin) return;
    const confirmed = await showConfirm('Excluir item global do banco?', `Apagar "${item.title}" do banco de itens? Isso não afeta as cópias locais já importadas pelas escolas.`);
    if (!confirmed) return;
    const { error } = await supabase.from('store_items').delete().eq('id', item._rawId);
    if (error) {
      console.error('Erro ao excluir item global:', error);
      showAlert('Erro', 'Não foi possível excluir o item global.');
      return;
    }
    setItems(prev => prev.filter(i => i.id !== item.id));
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = !searchQuery || 
      (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === 'all' || item.type === filterType;
    const matchesRarity = filterRarity === 'all' || item.rarity === filterRarity;

    return matchesSearch && matchesType && matchesRarity;
  });

  const getRarityColor = (rarity?: string) => {
    switch (rarity) {
      case 'common': return '#9ca3af';
      case 'uncommon': return '#10b981';
      case 'rare': return '#3b82f6';
      case 'epic': return '#8b5cf6';
      case 'mestre': return '#ef4444';
      case 'legendary': return '#f59e0b';
      default: return '#9ca3af';
    }
  };

  const getRarityLabel = (rarity?: string) => {
    switch (rarity) {
      case 'common': return 'Comum';
      case 'uncommon': return 'Incomum';
      case 'rare': return 'Raro';
      case 'epic': return 'Épico';
      case 'mestre': return 'Mestre';
      case 'legendary': return 'Lendário';
      default: return 'Comum';
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000 }}>
      <div className="glass-panel" style={{ width: '900px', maxWidth: '95vw', maxHeight: '90vh', padding: '2rem', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out', background: 'var(--bg-dark)', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gold-primary)' }}>
            <Package color="var(--gold-primary)" /> Banco de Itens
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {selectedIds.length > 0 && (
              <button
                onClick={handleImportMultiple}
                disabled={importingMultiple}
                style={{ padding: '0.5rem 1rem', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                {importingMultiple ? <Loader2 className="animate-spin" size={16} /> : <CheckCheck size={16} />}
                Importar Selecionados ({selectedIds.length})
              </button>
            )}
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar itens..."
              style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
            />
          </div>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as any)}
            style={{ padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
          >
            <option value="all">Todos os Tipos</option>
            <option value="consumable">Consumíveis</option>
            <option value="equippable">Equipáveis</option>
          </select>
          <select
            value={filterRarity}
            onChange={e => setFilterRarity(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
          >
            <option value="all">Todas as Raridades</option>
            <option value="common">Comum</option>
            <option value="uncommon">Incomum</option>
            <option value="rare">Raro</option>
            <option value="epic">Épico</option>
            <option value="mestre">Mestre</option>
            <option value="legendary">Lendário</option>
          </select>
          <button
            onClick={toggleSelectAll}
            style={{ padding: '0.5rem 0.75rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Check size={14} /> Selecionar todos visíveis
          </button>
        </div>

        {/* Lista de Itens */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', minHeight: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--gold-primary)', gap: '0.5rem' }}>
              <Loader2 className="animate-spin" size={24} /> Carregando itens...
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <Package size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <p>Nenhum item encontrado no banco.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
              {filteredItems.map(item => {
                const imported = isImported(item);
                const selected = selectedIds.includes(item.id);
                const rarityColor = getRarityColor(item.rarity);
                return (
                <div
                  key={item.id}
                  className="glass-panel"
                  style={{
                    padding: '1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    border: `2px solid ${rarityColor}`,
                    background: `${rarityColor}10`,
                    boxShadow: `0 0 12px ${rarityColor}30`,
                    outline: selected ? '2px solid #8b5cf6' : 'none',
                  }}
                  onClick={() => handleImportClick(item)}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = rarityColor;
                    setHoveredItem(item.id);
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = rarityColor;
                    setHoveredItem(null);
                  }}
                  onMouseMove={e => setMousePos({ x: e.clientX, y: e.clientY })}
                >
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                    <ItemIcon item={item} size={48} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</h4>
                        {imported && (
                          <span title="Item já importado para a loja local" style={{ color: '#10b981', display: 'inline-flex', flexShrink: 0 }}>
                            <Check size={16} strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: item.type === 'consumable' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: item.type === 'consumable' ? '#10b981' : '#3b82f6' }}>
                          {item.type === 'consumable' ? 'Consumível' : 'Equipável'}
                        </span>
                        <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: `${getRarityColor(item.rarity)}20`, color: getRarityColor(item.rarity) }}>
                          {getRarityLabel(item.rarity)}
                        </span>
                      </div>
                    </div>
                    <div onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={imported}
                        onChange={() => toggleSelect(item.id)}
                        style={{ width: '18px', height: '18px', cursor: imported ? 'not-allowed' : 'pointer', opacity: imported ? 0.35 : 1 }}
                        title={imported ? 'Item já importado' : 'Selecionar para importação múltipla'}
                      />
                    </div>
                  </div>
                  {item.description && (
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {item.description}
                    </p>
                  )}
                  <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    {isSuperAdmin && (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); onEditGlobal && onEditGlobal(item); onClose(); }}
                          style={{ padding: '0.35rem 0.75rem', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          <Edit2 size={14} /> Editar
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDeleteGlobal(item); }}
                          style={{ padding: '0.35rem 0.75rem', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          <Trash2 size={14} /> Excluir
                        </button>
                      </>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); handleImportClick(item); }}
                      style={{ padding: '0.35rem 0.75rem', background: imported ? 'rgba(16, 185, 129, 0.15)' : 'rgba(139, 92, 246, 0.2)', color: imported ? '#10b981' : '#8b5cf6', border: imported ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Download size={14} /> {imported ? 'Importado' : 'Importar'}
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Importação */}
      {showImportModal && selectedItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100001 }}>
          <div className="glass-panel" style={{ width: '450px', maxWidth: '90vw', padding: '2rem', animation: 'slideUp 0.3s ease-out', background: 'var(--bg-dark)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', color: 'var(--text-primary)' }}>
              Importar: {selectedItem.title}
            </h3>
            <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Como deseja importar este item para sua escola?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                onClick={() => handleImportConfirm('direct')}
                style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <Copy size={20} color="#10b981" />
                  <span style={{ fontWeight: 'bold', color: '#10b981' }}>Importar Direto</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Cópia exata do item. Você pode editar depois na sua loja.
                </p>
              </button>
              <button
                onClick={() => handleImportConfirm('customize')}
                style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <Eye size={20} color="#3b82f6" />
                  <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>Importar e Personalizar</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Abre o editor para ajustar nome, preço, atributos antes de salvar.
                </p>
              </button>
            </div>
            <button
              onClick={() => { setShowImportModal(false); setSelectedItem(null); }}
              style={{ marginTop: '1rem', width: '100%', padding: '0.5rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      
      {hoveredItem && (
        <ItemTooltip 
          item={items.find(i => i.id === hoveredItem)} 
          mousePos={mousePos} 
        />
      )}
    </div>
  );
}
