// @ts-ignore
import React, { useState, useMemo } from 'react';
import { 
  X, Columns, Check, 
  RotateCcw, Search, Sparkles, Filter 
} from 'lucide-react';
// @ts-ignore
import { Eye, EyeOff } from 'lucide-react';

export interface ColumnDef {
  id: string;
  label: string;
  shortLabel: string;
  groupKey: 'b1' | 'b2' | 'b3' | 'b4' | 'summary';
  groupTitle: string;
  color: string;
}

export const ALL_COLUMNS: ColumnDef[] = [
  // 1º Bimestre
  { id: 'b1_p1', label: 'Prova 1 (P1)', shortLabel: 'P1', groupKey: 'b1', groupTitle: '1º Bimestre', color: '#60a5fa' },
  { id: 'b1_p2', label: 'Prova 2 (P2)', shortLabel: 'P2', groupKey: 'b1', groupTitle: '1º Bimestre', color: '#60a5fa' },
  { id: 'b1_tb1', label: 'Trabalho 1 (TB1)', shortLabel: 'TB1', groupKey: 'b1', groupTitle: '1º Bimestre', color: '#93c5fd' },
  { id: 'b1_tb2', label: 'Trabalho 2 (TB2)', shortLabel: 'TB2', groupKey: 'b1', groupTitle: '1º Bimestre', color: '#93c5fd' },
  { id: 'b1_extra', label: 'Atividades Extras', shortLabel: 'Ext', groupKey: 'b1', groupTitle: '1º Bimestre', color: '#bfdbfe' },
  { id: 'b1_total', label: 'Total XP Calculado', shortLabel: 'Total', groupKey: 'b1', groupTitle: '1º Bimestre', color: '#60a5fa' },

  // 2º Bimestre
  { id: 'b2_p1', label: 'Prova 1 (P1)', shortLabel: 'P1', groupKey: 'b2', groupTitle: '2º Bimestre', color: '#34d399' },
  { id: 'b2_p2', label: 'Prova 2 (P2)', shortLabel: 'P2', groupKey: 'b2', groupTitle: '2º Bimestre', color: '#34d399' },
  { id: 'b2_tb1', label: 'Trabalho 1 (TB1)', shortLabel: 'TB1', groupKey: 'b2', groupTitle: '2º Bimestre', color: '#6ee7b7' },
  { id: 'b2_tb2', label: 'Trabalho 2 (TB2)', shortLabel: 'TB2', groupKey: 'b2', groupTitle: '2º Bimestre', color: '#6ee7b7' },
  { id: 'b2_extra', label: 'Atividades Extras', shortLabel: 'Ext', groupKey: 'b2', groupTitle: '2º Bimestre', color: '#a7f3d0' },
  { id: 'b2_total', label: 'Total XP Calculado', shortLabel: 'Total', groupKey: 'b2', groupTitle: '2º Bimestre', color: '#34d399' },

  // 3º Bimestre
  { id: 'b3_p1', label: 'Prova 1 (P1)', shortLabel: 'P1', groupKey: 'b3', groupTitle: '3º Bimestre', color: '#f59e0b' },
  { id: 'b3_p2', label: 'Prova 2 (P2)', shortLabel: 'P2', groupKey: 'b3', groupTitle: '3º Bimestre', color: '#f59e0b' },
  { id: 'b3_tb1', label: 'Trabalho 1 (TB1)', shortLabel: 'TB1', groupKey: 'b3', groupTitle: '3º Bimestre', color: '#fbbf24' },
  { id: 'b3_tb2', label: 'Trabalho 2 (TB2)', shortLabel: 'TB2', groupKey: 'b3', groupTitle: '3º Bimestre', color: '#fbbf24' },
  { id: 'b3_extra', label: 'Atividades Extras', shortLabel: 'Ext', groupKey: 'b3', groupTitle: '3º Bimestre', color: '#fde68a' },
  { id: 'b3_total', label: 'Total XP Calculado', shortLabel: 'Total', groupKey: 'b3', groupTitle: '3º Bimestre', color: '#f59e0b' },

  // 4º Bimestre
  { id: 'b4_p1', label: 'Prova 1 (P1)', shortLabel: 'P1', groupKey: 'b4', groupTitle: '4º Bimestre', color: '#a855f7' },
  { id: 'b4_p2', label: 'Prova 2 (P2)', shortLabel: 'P2', groupKey: 'b4', groupTitle: '4º Bimestre', color: '#a855f7' },
  { id: 'b4_tb1', label: 'Trabalho 1 (TB1)', shortLabel: 'TB1', groupKey: 'b4', groupTitle: '4º Bimestre', color: '#c084fc' },
  { id: 'b4_tb2', label: 'Trabalho 2 (TB2)', shortLabel: 'TB2', groupKey: 'b4', groupTitle: '4º Bimestre', color: '#c084fc' },
  { id: 'b4_extra', label: 'Atividades Extras', shortLabel: 'Ext', groupKey: 'b4', groupTitle: '4º Bimestre', color: '#e9d5ff' },
  { id: 'b4_total', label: 'Total XP Calculado', shortLabel: 'Total', groupKey: 'b4', groupTitle: '4º Bimestre', color: '#a855f7' },

  // Resumo & Totais
  { id: 'bimestres_sum', label: 'Soma dos 4 Bimestres', shortLabel: 'Bimestres', groupKey: 'summary', groupTitle: 'Resumo Anual', color: '#94a3b8' },
  { id: 'base_xp', label: 'XP Base Anterior / Bônus', shortLabel: 'XP Base', groupKey: 'summary', groupTitle: 'Resumo Anual', color: '#38bdf8' },
  { id: 'total_xp', label: 'XP Total Final Calculado', shortLabel: 'XP Total', groupKey: 'summary', groupTitle: 'Resumo Anual', color: 'var(--gold-primary)' },
  { id: 'rank', label: 'Patente Resultante', shortLabel: 'Patente', groupKey: 'summary', groupTitle: 'Resumo Anual', color: '#f59e0b' },
  { id: 'system_xp', label: 'XP Atual Gravado no Banco', shortLabel: 'XP Sist.', groupKey: 'summary', groupTitle: 'Resumo Anual', color: '#94a3b8' },
];

const GROUPS: { key: 'b1' | 'b2' | 'b3' | 'b4' | 'summary'; title: string; color: string }[] = [
  { key: 'b1', title: '1º Bimestre', color: '#60a5fa' },
  { key: 'b2', title: '2º Bimestre', color: '#34d399' },
  { key: 'b3', title: '3º Bimestre', color: '#f59e0b' },
  { key: 'b4', title: '4º Bimestre', color: '#a855f7' },
  { key: 'summary', title: 'Resumo & Totais', color: 'var(--gold-primary)' },
];

interface GradebookColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  hiddenColumns: string[];
  onToggleColumn: (colId: string) => void;
  onSetMultiple: (colIds: string[], hide: boolean) => void;
  onReset: () => void;
}

export default function GradebookColumnModal({
  isOpen,
  onClose,
  hiddenColumns,
  onToggleColumn,
  onSetMultiple,
  onReset
}: GradebookColumnModalProps) {
  const [search, setSearch] = useState('');

  const filteredColumns = useMemo(() => {
    if (!search.trim()) return ALL_COLUMNS;
    const q = search.toLowerCase();
    return ALL_COLUMNS.filter(c => 
      c.label.toLowerCase().includes(q) || 
      c.shortLabel.toLowerCase().includes(q) || 
      c.groupTitle.toLowerCase().includes(q)
    );
  }, [search]);

  if (!isOpen) return null;

  const isVisible = (colId: string) => !hiddenColumns.includes(colId);

  // Ações rápidas
  const handleHideAllExtras = () => {
    onSetMultiple(['b1_extra', 'b2_extra', 'b3_extra', 'b4_extra'], true);
  };

  const handleHideAllTb2 = () => {
    onSetMultiple(['b1_tb2', 'b2_tb2', 'b3_tb2', 'b4_tb2'], true);
  };

  const handleHideBaseAndSystem = () => {
    onSetMultiple(['base_xp', 'system_xp'], true);
  };

  const handleOnlyTotals = () => {
    const detailIds = [
      'b1_p1', 'b1_p2', 'b1_tb1', 'b1_tb2', 'b1_extra',
      'b2_p1', 'b2_p2', 'b2_tb1', 'b2_tb2', 'b2_extra',
      'b3_p1', 'b3_p2', 'b3_tb1', 'b3_tb2', 'b3_extra',
      'b4_p1', 'b4_p2', 'b4_tb1', 'b4_tb2', 'b4_extra',
      'base_xp', 'system_xp'
    ];
    onSetMultiple(detailIds, true);
  };

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      <div 
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-card, #11151f)',
          border: '1px solid var(--border-glass)',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho do Modal */}
        <div 
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--border-glass)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div 
              style={{ 
                width: '36px', 
                height: '36px', 
                borderRadius: '10px', 
                background: 'rgba(245, 158, 11, 0.15)', 
                border: '1px solid rgba(245, 158, 11, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Columns size={20} color="var(--gold-primary)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                Personalizar Colunas da Planilha
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Escolha quais colunas exibir. Suas preferências são salvas na sua conta e mantidas em qualquer computador.
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '0.4rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Barra de Filtro e Ações Rápidas */}
        <div 
          style={{ 
            padding: '0.75rem 1.5rem', 
            background: 'rgba(0,0,0,0.25)', 
            borderBottom: '1px solid var(--border-glass)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem'
          }}
        >
          {/* Campo de Busca Rápida */}
          <div style={{ position: 'relative', width: '100%' }}>
            <Search 
              size={15} 
              style={{ 
                position: 'absolute', 
                left: '0.75rem', 
                top: '50%', 
                transform: 'translateY(-50%)', 
                color: 'var(--text-secondary)' 
              }} 
            />
            <input 
              type="text"
              placeholder="Buscar coluna (ex: Prova, TB2, Extra, Patente)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem 0.45rem 2.2rem',
                borderRadius: '8px',
                background: 'var(--bg-dark, #0b0d14)',
                border: '1px solid var(--border-glass)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem'
              }}
            />
          </div>

          {/* Atalhos Rápidos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginRight: '0.2rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <Filter size={12} /> Atalhos:
            </span>

            <button
              onClick={onReset}
              className="login-btn"
              style={{
                padding: '0.25rem 0.6rem',
                fontSize: '0.74rem',
                background: hiddenColumns.length === 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)',
                border: hiddenColumns.length === 0 ? '1px solid #10b981' : '1px solid var(--border-glass)',
                color: hiddenColumns.length === 0 ? '#34d399' : 'var(--text-primary)'
              }}
              title="Exibir todas as colunas da planilha"
            >
              <RotateCcw size={11} style={{ marginRight: '0.25rem' }} />
              Exibir Todas
            </button>

            <button
              onClick={handleHideAllExtras}
              className="login-btn"
              style={{
                padding: '0.25rem 0.6rem',
                fontSize: '0.74rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-glass)',
                color: 'var(--text-secondary)'
              }}
              title="Ocultar notas extras de todos os 4 bimestres"
            >
              Ocultar Extras
            </button>

            <button
              onClick={handleHideAllTb2}
              className="login-btn"
              style={{
                padding: '0.25rem 0.6rem',
                fontSize: '0.74rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-glass)',
                color: 'var(--text-secondary)'
              }}
              title="Ocultar Trabalho 2 (TB2) de todos os bimestres"
            >
              Ocultar TB2
            </button>

            <button
              onClick={handleOnlyTotals}
              className="login-btn"
              style={{
                padding: '0.25rem 0.6rem',
                fontSize: '0.74rem',
                background: 'rgba(251, 191, 36, 0.1)',
                border: '1px solid rgba(251, 191, 36, 0.3)',
                color: 'var(--gold-primary)'
              }}
              title="Manter visíveis somente os totais bimestrais, total anual e patente"
            >
              <Sparkles size={11} style={{ marginRight: '0.25rem' }} />
              Apenas Totais & Patentes
            </button>

            <button
              onClick={handleHideBaseAndSystem}
              className="login-btn"
              style={{
                padding: '0.25rem 0.6rem',
                fontSize: '0.74rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-glass)',
                color: 'var(--text-secondary)'
              }}
              title="Ocultar colunas de XP Base e XP Sistema"
            >
              Ocultar XP Base & Sist.
            </button>
          </div>
        </div>

        {/* Lista de Grupos e Colunas com Scroll */}
        <div 
          style={{ 
            flex: 1, 
            overflowY: 'auto', 
            padding: '1.25rem 1.5rem', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '1.25rem' 
          }}
        >
          {GROUPS.map(group => {
            const groupCols = filteredColumns.filter(c => c.groupKey === group.key);
            if (groupCols.length === 0) return null;

            const allVisibleInGroup = groupCols.every(c => isVisible(c.id));
            const noneVisibleInGroup = groupCols.every(c => !isVisible(c.id));

            return (
              <div 
                key={group.key}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '12px',
                  padding: '0.85rem 1rem'
                }}
              >
                {/* Header do Grupo */}
                <div 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    marginBottom: '0.75rem', 
                    borderBottom: '1px solid rgba(255,255,255,0.06)', 
                    paddingBottom: '0.45rem' 
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span 
                      style={{ 
                        width: '10px', 
                        height: '10px', 
                        borderRadius: '50%', 
                        background: group.color 
                      }} 
                    />
                    <strong style={{ fontSize: '0.92rem', color: group.color }}>
                      {group.title}
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      ({groupCols.filter(c => isVisible(c.id)).length}/{groupCols.length} visíveis)
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                      onClick={() => onSetMultiple(groupCols.map(c => c.id), false)}
                      disabled={allVisibleInGroup}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: allVisibleInGroup ? 'rgba(255,255,255,0.2)' : 'var(--gold-primary)',
                        fontSize: '0.72rem',
                        cursor: allVisibleInGroup ? 'default' : 'pointer',
                        padding: '0.1rem 0.35rem'
                      }}
                    >
                      Exibir Todos
                    </button>
                    <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.72rem' }}>•</span>
                    <button
                      onClick={() => onSetMultiple(groupCols.map(c => c.id), true)}
                      disabled={noneVisibleInGroup}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: noneVisibleInGroup ? 'rgba(255,255,255,0.2)' : 'var(--text-secondary)',
                        fontSize: '0.72rem',
                        cursor: noneVisibleInGroup ? 'default' : 'pointer',
                        padding: '0.1rem 0.35rem'
                      }}
                    >
                      Ocultar Todos
                    </button>
                  </div>
                </div>

                {/* Grid de Checkboxes de Colunas */}
                <div 
                  style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', 
                    gap: '0.5rem' 
                  }}
                >
                  {groupCols.map(col => {
                    const visible = isVisible(col.id);
                    return (
                      <div
                        key={col.id}
                        onClick={() => onToggleColumn(col.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.45rem 0.65rem',
                          borderRadius: '8px',
                          background: visible ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.3)',
                          border: visible ? '1px solid rgba(255,255,255,0.1)' : '1px dashed rgba(255,255,255,0.06)',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          opacity: visible ? 1 : 0.55
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                          <div 
                            style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '4px',
                              border: visible ? `1px solid ${col.color}` : '1px solid rgba(255,255,255,0.2)',
                              background: visible ? `${col.color}25` : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {visible && <Check size={12} color={col.color} />}
                          </div>

                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: visible ? '500' : 'normal', color: visible ? 'var(--text-primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {col.label}
                            </div>
                          </div>
                        </div>

                        <span 
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 'bold',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '6px',
                            background: visible ? `${col.color}20` : 'rgba(255,255,255,0.05)',
                            color: visible ? col.color : 'var(--text-secondary)',
                            flexShrink: 0,
                            marginLeft: '0.4rem'
                          }}
                        >
                          {col.shortLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Rodapé com Informação de Sincronização e Fechar */}
        <div 
          style={{
            padding: '0.85rem 1.5rem',
            borderTop: '1px solid var(--border-glass)',
            background: 'rgba(255, 255, 255, 0.02)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: '#10b981' }}>
            <span>☁️</span>
            <span>Preferências sincronizadas na sua conta (permanecem em qualquer navegador).</span>
          </div>

          <button
            onClick={onClose}
            className="login-btn"
            style={{
              padding: '0.4rem 1.25rem',
              fontSize: '0.85rem',
              background: 'var(--gold-primary)',
              color: 'var(--text-on-gold, #000)',
              border: 'none',
              fontWeight: 'bold'
            }}
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
