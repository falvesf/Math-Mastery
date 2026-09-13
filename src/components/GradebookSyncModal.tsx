import React, { useState, useMemo } from 'react';
import { 
  X, Check, ShieldCheck, RefreshCw, 
  ArrowRight, Download, TrendingUp 
} from 'lucide-react';
// @ts-ignore
import { AlertTriangle, Users, TrendingDown } from 'lucide-react';
import { 
  type ClassGradebook, type SyncPreviewRow, generateSyncPreview, 
  executeGradebookSync, createTenantUsersBackup, downloadJsonBackup 
} from '../lib/gradebook';

interface GradebookSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  className: string;
  students: any[];
  gradebook: ClassGradebook;
  userEmail?: string;
  onSyncCompleted: () => void;
  showAlert: (title: string, message: string) => void;
}

export default function GradebookSyncModal({
  isOpen,
  onClose,
  tenantId,
  className,
  students,
  gradebook,
  userEmail,
  onSyncCompleted,
  showAlert
}: GradebookSyncModalProps) {
  const [syncMode, setSyncMode] = useState<'additive' | 'replace' | 'only_with_grades'>('additive');
  const [createBackupBefore, setCreateBackupBefore] = useState(true);
  const [downloadBackupFile, setDownloadBackupFile] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Gera o preview de linhas com base no modo selecionado
  const initialRows = useMemo(() => {
    return generateSyncPreview(students, gradebook, syncMode);
  }, [students, gradebook, syncMode]);

  const [previewRows, setPreviewRows] = useState<SyncPreviewRow[]>(initialRows);

  // Atualiza previewRows se initialRows mudar
  React.useEffect(() => {
    setPreviewRows(initialRows);
  }, [initialRows]);

  if (!isOpen) return null;

  const toggleSelectAll = (checked: boolean) => {
    setPreviewRows(prev => prev.map(r => ({ ...r, selected: checked })));
  };

  const toggleSelectRow = (studentId: string) => {
    setPreviewRows(prev => prev.map(r => r.studentId === studentId ? { ...r, selected: !r.selected } : r));
  };

  const selectedCount = previewRows.filter(r => r.selected).length;
  const allSelected = previewRows.length > 0 && selectedCount === previewRows.length;

  const handleConfirmSync = async () => {
    if (selectedCount === 0) {
      showAlert('Nenhum aluno selecionado', 'Selecione ao menos um aluno para atualizar o XP.');
      return;
    }

    setSyncing(true);
    try {
      // 1. Cria o backup automático se marcado
      if (createBackupBefore) {
        const backup = await createTenantUsersBackup(
          tenantId,
          `Pré-Sincronização Planilha [Turma ${className}]`,
          userEmail
        );
        if (backup && downloadBackupFile) {
          downloadJsonBackup(backup, `backup_seguranca_${className}`);
        }
      }

      // 2. Executa a sincronização dos selecionados
      const result = await executeGradebookSync(tenantId, previewRows, userEmail);

      if (result.success) {
        showAlert(
          'Sincronização Concluída!',
          `O XP e as patentes de ${result.updatedCount} aluno(s) da turma ${className} foram atualizados no sistema com sucesso!`
        );
        onSyncCompleted();
        onClose();
      } else {
        showAlert('Erro na sincronização', result.error || 'Não foi possível salvar todos os registros.');
      }
    } catch (err: any) {
      showAlert('Erro Inesperado', err?.message || 'Falha ao sincronizar.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      <div 
        className="glass-panel" 
        style={{ 
          maxWidth: '900px', 
          width: '100%', 
          maxHeight: '90vh', 
          display: 'flex', 
          flexDirection: 'column', 
          padding: '1.5rem',
          borderRadius: '16px',
          border: '1px solid var(--border-glass)',
          background: 'var(--bg-card)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
          animation: 'slideUp 0.3s ease-out'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={24} color="var(--gold-primary)" />
              <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Sincronizar XP com Gerenciamento de Usuários</h2>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Turma: <strong style={{ color: 'var(--gold-primary)' }}>{className}</strong> • Atualize o XP real dos alunos diretamente a partir das notas digitadas.
            </p>
          </div>
          <button 
            onClick={onClose} 
            disabled={syncing}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.5rem' }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Opções de Modo de Sincronização */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
            MODO DE CÁLCULO PARA ATUALIZAÇÃO
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
            <div 
              onClick={() => setSyncMode('additive')}
              style={{
                padding: '0.85rem',
                borderRadius: '10px',
                cursor: 'pointer',
                border: syncMode === 'additive' ? '2px solid var(--gold-primary)' : '1px solid var(--border-glass)',
                background: syncMode === 'additive' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(0,0,0,0.2)',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <input type="radio" checked={syncMode === 'additive'} readOnly style={{ accentColor: 'var(--gold-primary)' }} />
                <strong style={{ fontSize: '0.9rem', color: syncMode === 'additive' ? 'var(--gold-primary)' : 'var(--text-primary)' }}>
                  Soma Segura (Preservar Base)
                </strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Soma as notas dos bimestres ao XP Base / Anterior do aluno. Impede que alunos percam o progresso histórico conquistado.
              </p>
            </div>

            <div 
              onClick={() => setSyncMode('only_with_grades')}
              style={{
                padding: '0.85rem',
                borderRadius: '10px',
                cursor: 'pointer',
                border: syncMode === 'only_with_grades' ? '2px solid #3b82f6' : '1px solid var(--border-glass)',
                background: syncMode === 'only_with_grades' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.2)',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <input type="radio" checked={syncMode === 'only_with_grades'} readOnly style={{ accentColor: '#3b82f6' }} />
                <strong style={{ fontSize: '0.9rem', color: syncMode === 'only_with_grades' ? '#3b82f6' : 'var(--text-primary)' }}>
                  Apenas Notas Lançadas
                </strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Atualiza apenas os alunos que têm ao menos uma nota preenchida. Alunos em branco continuam com o XP intacto.
              </p>
            </div>

            <div 
              onClick={() => setSyncMode('replace')}
              style={{
                padding: '0.85rem',
                borderRadius: '10px',
                cursor: 'pointer',
                border: syncMode === 'replace' ? '2px solid #ef4444' : '1px solid var(--border-glass)',
                background: syncMode === 'replace' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0,0,0,0.2)',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <input type="radio" checked={syncMode === 'replace'} readOnly style={{ accentColor: '#ef4444' }} />
                <strong style={{ fontSize: '0.9rem', color: syncMode === 'replace' ? '#ef4444' : 'var(--text-primary)' }}>
                  Substituir Totalmente
                </strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Substitui o XP do aluno estritamente pela soma dos 4 bimestres da planilha (ignora o XP anterior).
              </p>
            </div>
          </div>
        </div>

        {/* Bloco de Segurança de Backup */}
        <div style={{ 
          background: 'rgba(16, 185, 129, 0.08)', 
          border: '1px solid rgba(16, 185, 129, 0.3)', 
          borderRadius: '10px', 
          padding: '0.75rem 1rem', 
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={20} color="#10b981" />
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#10b981' }}>Backup de Segurança Automático</span>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Salva o snapshot de todos os usuários deste tenant antes de aplicar as mudanças.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={createBackupBefore} 
                onChange={e => setCreateBackupBefore(e.target.checked)} 
                style={{ accentColor: '#10b981' }}
              />
              <span>Criar no banco</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={downloadBackupFile} 
                onChange={e => setDownloadBackupFile(e.target.checked)} 
                disabled={!createBackupBefore}
                style={{ accentColor: '#10b981' }}
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <Download size={13} /> Baixar JSON
              </span>
            </label>
          </div>
        </div>

        {/* Tabela de Diff */}
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: '10px', background: 'rgba(0,0,0,0.2)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.4)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '1px solid var(--border-glass)' }}>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', width: '40px' }}>
                  <input 
                    type="checkbox" 
                    checked={allSelected} 
                    onChange={e => toggleSelectAll(e.target.checked)}
                    style={{ accentColor: 'var(--gold-primary)', cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left' }}>Aluno</th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>XP Atual</th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Patente Atual</th>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', width: '30px' }}></th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Novo XP</th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Nova Patente</th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Diferença</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map(row => {
                const isGain = row.diffXp > 0;
                const isLoss = row.diffXp < 0;
                const isUnchanged = row.diffXp === 0;

                return (
                  <tr 
                    key={row.studentId}
                    style={{ 
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      background: row.selected ? 'rgba(255,255,255,0.02)' : 'transparent',
                      opacity: row.selected ? 1 : 0.45,
                      transition: 'background 0.15s'
                    }}
                  >
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={row.selected} 
                        onChange={() => toggleSelectRow(row.studentId)}
                        style={{ accentColor: 'var(--gold-primary)', cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 'bold' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>{row.studentName}</span>
                        {!row.hasGrades && (
                          <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                            Sem notas
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      {row.currentXp.toLocaleString('pt-BR')} XP
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontSize: '0.8rem' }}>
                      <span style={{ padding: '0.15rem 0.5rem', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
                        {row.currentRank}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 0.2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <ArrowRight size={14} />
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--gold-primary)' }}>
                      {row.calculatedXp.toLocaleString('pt-BR')} XP
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontSize: '0.8rem' }}>
                      <span style={{ 
                        padding: '0.15rem 0.5rem', 
                        borderRadius: '10px', 
                        background: 'rgba(251, 191, 36, 0.15)', 
                        color: 'var(--gold-primary)',
                        border: '1px solid rgba(251, 191, 36, 0.3)'
                      }}>
                        {row.newRank}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: 'bold' }}>
                      {isGain && (
                        <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                          +{row.diffXp.toLocaleString('pt-BR')}
                        </span>
                      )}
                      {isLoss && (
                        <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                          {row.diffXp.toLocaleString('pt-BR')}
                        </span>
                      )}
                      {isUnchanged && (
                        <span style={{ color: 'var(--text-secondary)' }}>
                          0
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--gold-primary)' }}>{selectedCount}</strong> de {previewRows.length} aluno(s) selecionados para sincronizar
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button 
              onClick={onClose}
              disabled={syncing}
              className="login-btn"
              style={{ background: 'transparent', border: '1px solid var(--border-glass)', padding: '0.6rem 1.2rem', color: 'var(--text-secondary)' }}
            >
              Cancelar
            </button>
            <button 
              onClick={handleConfirmSync}
              disabled={syncing || selectedCount === 0}
              className="login-btn"
              style={{ 
                background: 'var(--gold-primary)', 
                color: 'var(--text-on-gold, #000)', 
                border: 'none', 
                padding: '0.6rem 1.4rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                opacity: syncing || selectedCount === 0 ? 0.5 : 1
              }}
            >
              {syncing ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <Check size={18} />
                  Confirmar e Atualizar XP
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
