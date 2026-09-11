import React, { useState, useEffect, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { Search, Package } from 'lucide-react';

export const getRarityLabel = (rarity?: string) => {
  switch (rarity) {
    case 'legendary': return 'Lendário';
    case 'mestre': return 'Mestre';
    case 'epic': return 'Épico';
    case 'rare': return 'Raro';
    case 'uncommon': return 'Incomum';
    case 'common':
    default: return 'Comum';
  }
};

export const getRarityColor = (rarity?: string) => {
  switch (rarity) {
    case 'legendary': return '#f59e0b';
    case 'mestre': return '#ef4444';
    case 'epic': return '#8b5cf6';
    case 'rare': return '#3b82f6';
    case 'uncommon': return '#10b981';
    case 'common':
    default: return '#9ca3af';
  }
};

export const RARITY_WEIGHTS: Record<string, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  mestre: 5,
  legendary: 6,
};

export const sortByRarityThenTitle = (
  a: { rarity?: string; title?: string }, 
  b: { rarity?: string; title?: string }
) => {
  const wA = RARITY_WEIGHTS[a.rarity || 'common'] ?? 99;
  const wB = RARITY_WEIGHTS[b.rarity || 'common'] ?? 99;
  if (wA !== wB) return wA - wB;
  return (a.title || '').localeCompare(b.title || '', 'pt-BR', { sensitivity: 'base' });
};

export interface ItemSelectOption {
  id: string;
  title: string;
  imageUrl?: string;
  badge?: string;
  rarity?: string;
  typeLabel?: string;
}

interface ItemSelectDropdownProps {
  items: ItemSelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  width?: number | string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

export const ItemSelectDropdown: React.FC<ItemSelectDropdownProps> = ({
  items,
  value,
  onChange,
  placeholder = 'Selecione um item...',
  width = '100%',
  style,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const ddHeight = 280;
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < ddHeight + 8;
    setPos({
      top: openUp ? Math.max(4, r.top - ddHeight - 4) : r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 260),
    });
  };

  useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }
    place();
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current && !rootRef.current.contains(target) &&
        portalRef.current && !portalRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  // Itens classificados por raridade e por ordem alfabética
  const sortedItems = [...items].sort(sortByRarityThenTitle);

  const filteredItems = search.trim()
    ? sortedItems.filter(i => {
        const q = search.toLowerCase();
        const t = (i.title || '').toLowerCase();
        const r = getRarityLabel(i.rarity).toLowerCase();
        const b = (i.badge || '').toLowerCase();
        const y = (i.typeLabel || '').toLowerCase();
        return t.includes(q) || r.includes(q) || b.includes(q) || y.includes(q);
      })
    : sortedItems;

  const selected = items.find(i => i.id === value);
  const selectedRarityColor = selected?.rarity ? getRarityColor(selected.rarity) : undefined;

  return (
    <div ref={rootRef} style={{ width, minWidth: 0, ...style }}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onMouseDown={(e) => {
          if (disabled) return;
          e.stopPropagation();
          setOpen(o => !o);
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '5px 9px',
          borderRadius: '6px',
          border: selectedRarityColor ? `1px solid ${selectedRarityColor}77` : '1px solid rgba(139,92,246,0.5)',
          background: 'var(--bg-dark, #13151b)',
          color: 'var(--text-primary, #fff)',
          fontSize: '0.78rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          minHeight: 30,
          textAlign: 'left',
          boxSizing: 'border-box',
        }}
      >
        {selected ? (
          <>
            {selected.imageUrl ? (
              <img src={selected.imageUrl} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0, borderRadius: 2 }} />
            ) : (
              <Package size={17} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={selected.title}>
              {selected.title}
            </span>
            {selected.typeLabel && (
              <span style={{
                flexShrink: 0,
                fontSize: '0.6rem',
                padding: '1px 5px',
                borderRadius: '3px',
                background: 'rgba(255,255,255,0.06)',
                color: 'var(--text-secondary, #94a3b8)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                {selected.typeLabel}
              </span>
            )}
            {selected.badge && (
              <span style={{ flexShrink: 0, fontSize: '0.62rem', color: '#c084fc' }}>{selected.badge}</span>
            )}
            {selected.rarity && (
              <span style={{
                flexShrink: 0,
                fontSize: '0.62rem',
                fontWeight: 600,
                padding: '1px 5px',
                borderRadius: '3px',
                background: `${selectedRarityColor}22`,
                color: selectedRarityColor,
                border: `1px solid ${selectedRarityColor}44`
              }}>
                {getRarityLabel(selected.rarity)}
              </span>
            )}
            <span
              title="Limpar seleção"
              onMouseDown={(e) => {
                e.stopPropagation();
                onChange('');
                setOpen(false);
              }}
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'rgba(239,68,68,0.25)',
                color: '#ef4444',
                fontSize: '0.75rem',
                lineHeight: 1,
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >×</span>
          </>
        ) : (
          <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>{placeholder}</span>
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={portalRef}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 2147483000,
            maxHeight: 280,
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(18, 19, 26, 0.98)',
            border: '1px solid rgba(139,92,246,0.6)',
            borderRadius: '8px',
            boxShadow: '0 14px 40px rgba(0,0,0,0.9)',
            overflow: 'hidden',
            backdropFilter: 'blur(12px)'
          }}
        >
          {/* Quick Search */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Search size={14} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, raridade ou tipo..."
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '0.74rem'
              }}
            />
            {search && (
              <span
                onClick={() => setSearch('')}
                style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem', padding: '0 2px' }}
                title="Limpar busca"
              >✕</span>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1, padding: '2px 0' }}>
            {/* Opção para limpar */}
            <div
              onMouseDown={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '6px 9px',
                cursor: 'pointer',
                fontSize: '0.74rem',
                color: '#ef4444',
                borderBottom: '1px solid rgba(255,255,255,0.06)'
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ fontWeight: 'bold' }}>✕ Limpar (nenhum)</span>
            </div>

            {filteredItems.length === 0 ? (
              <div style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: '0.74rem', textAlign: 'center' }}>
                Nenhum item encontrado
              </div>
            ) : (
              (() => {
                let currentRarity: string | null = null;
                const hasRarities = filteredItems.some(i => !!i.rarity);
                return filteredItems.map((i) => {
                  const itemRarity = i.rarity || 'common';
                  const isNewSection = hasRarities && itemRarity !== currentRarity;
                  if (isNewSection) {
                    currentRarity = itemRarity;
                  }
                  const rColor = getRarityColor(itemRarity);
                  const isSelected = i.id === value;

                  return (
                    <Fragment key={i.id}>
                      {isNewSection && (
                        <div style={{
                          padding: '4px 9px',
                          fontSize: '0.62rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: rColor,
                          background: 'rgba(255,255,255,0.04)',
                          borderTop: '1px solid rgba(255,255,255,0.06)',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          position: 'sticky',
                          top: 0,
                          zIndex: 1,
                          backdropFilter: 'blur(8px)'
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: rColor, display: 'inline-block' }} />
                          <span>{getRarityLabel(itemRarity)}</span>
                        </div>
                      )}
                      <div
                        onMouseDown={(e) => { e.stopPropagation(); onChange(i.id); setOpen(false); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          padding: '5px 9px',
                          cursor: 'pointer',
                          fontSize: '0.74rem',
                          background: isSelected ? 'rgba(255,215,0,0.16)' : 'transparent',
                          whiteSpace: 'nowrap',
                          transition: 'background 0.12s ease'
                        }}
                        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
                        onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        {i.imageUrl ? (
                          <img src={i.imageUrl} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0, borderRadius: 2 }} />
                        ) : (
                          <Package size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }} title={i.title}>{i.title}</span>
                        {i.typeLabel && (
                          <span style={{
                            fontSize: '0.58rem',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: 'rgba(255,255,255,0.06)',
                            color: 'var(--text-secondary, #94a3b8)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            flexShrink: 0,
                            marginLeft: 'auto'
                          }}>
                            {i.typeLabel}
                          </span>
                        )}
                        {i.rarity && (
                          <span style={{
                            fontSize: '0.58rem',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: `${rColor}22`,
                            color: rColor,
                            border: `1px solid ${rColor}44`,
                            flexShrink: 0,
                            marginLeft: i.typeLabel ? 4 : 'auto'
                          }}>
                            {getRarityLabel(itemRarity)}
                          </span>
                        )}
                        {i.badge && (
                          <span style={{ fontSize: '0.58rem', color: '#c084fc', flexShrink: 0, marginLeft: 4 }}>
                            {i.badge}
                          </span>
                        )}
                      </div>
                    </Fragment>
                  );
                });
              })()
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ItemSelectDropdown;
