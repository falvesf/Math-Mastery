import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useDialog } from '../contexts/DialogContext';
import { X, Search, Download, Copy, Eye, Package, Loader2 } from 'lucide-react';

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
}

interface ItemBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (item: StoreItemData, copyMode: 'direct' | 'customize') => void;
}

export default function ItemBankModal({ isOpen, onClose, onImport }: ItemBankModalProps) {
  const { tenantId } = useTenant();
  const { showAlert } = useDialog();
  const [items, setItems] = useState<StoreItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'consumable' | 'equippable'>('all');
  const [filterRarity, setFilterRarity] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<StoreItemData | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchItems();
    }
  }, [isOpen]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      // Buscar itens da tabela store_items
      // Inclui itens globais (is_global = true) e itens da escola atual
      let itemsQuery = supabase
        .from('store_items')
        .select('*')
        .eq('active', true);

      if (tenantId) {
        itemsQuery = itemsQuery.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
      }

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
      case 'legendary': return 'Lendário';
      default: return 'Comum';
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <div className="glass-panel" style={{ width: '900px', maxWidth: '95vw', maxHeight: '90vh', padding: '2rem', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out', background: 'var(--bg-dark)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gold-primary)' }}>
            <Package color="var(--gold-primary)" /> Banco de Itens
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
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
            <option value="legendary">Lendário</option>
          </select>
        </div>

        {/* Lista de Itens */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
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
              {filteredItems.map(item => (
                <div
                  key={item.id}
                  className="glass-panel"
                  style={{
                    padding: '1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    border: '1px solid var(--border-glass)',
                  }}
                  onClick={() => handleImportClick(item)}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-glass)')}
                >
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Package size={24} color="var(--text-secondary)" />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</h4>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: item.type === 'consumable' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: item.type === 'consumable' ? '#10b981' : '#3b82f6' }}>
                          {item.type === 'consumable' ? 'Consumível' : 'Equipável'}
                        </span>
                        <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: `${getRarityColor(item.rarity)}20`, color: getRarityColor(item.rarity) }}>
                          {getRarityLabel(item.rarity)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {item.description && (
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {item.description}
                    </p>
                  )}
                  <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={e => { e.stopPropagation(); handleImportClick(item); }}
                      style={{ padding: '0.35rem 0.75rem', background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Download size={14} /> Importar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Importação */}
      {showImportModal && selectedItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }}>
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
    </div>
  );
}
