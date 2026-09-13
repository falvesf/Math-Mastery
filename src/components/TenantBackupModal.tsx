import React, { useState, useEffect } from 'react';
import { 
  X, Download, Upload, ShieldCheck, RefreshCw, 
  RotateCcw, Calendar, FileText 
} from 'lucide-react';
// @ts-ignore
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { 
  type UserBackupData, createTenantUsersBackup, 
  listTenantUsersBackups, downloadJsonBackup, 
  restoreTenantUsersBackup 
} from '../lib/gradebook';

interface TenantBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName?: string;
  userEmail?: string;
  onRestored?: () => void;
  showAlert: (title: string, message: string) => void;
  showConfirm: (title: string, message: string) => Promise<boolean>;
}

export default function TenantBackupModal({
  isOpen,
  onClose,
  tenantId,
  tenantName,
  userEmail,
  onRestored,
  showAlert,
  showConfirm
}: TenantBackupModalProps) {
  const [backups, setBackups] = useState<UserBackupData[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadBackups = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const list = await listTenantUsersBackups(tenantId);
      setBackups(list);
    } catch (e) {
      console.error('Erro ao carregar lista de backups:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadBackups();
    }
  }, [isOpen, tenantId]);

  if (!isOpen) return null;

  const handleCreateManualBackup = async () => {
    setCreating(true);
    try {
      const backup = await createTenantUsersBackup(
        tenantId,
        'Backup Manual Gerado pelo Professor / Admin',
        userEmail
      );
      if (backup) {
        downloadJsonBackup(backup, `backup_manual_${tenantName ? tenantName.replace(/[^a-zA-Z0-9_-]/g, '_') : 'escola'}`);
        showAlert('Backup Concluído!', `Backup gerado com sucesso contendo ${backup.userCount} usuários. O download do arquivo JSON iniciou automaticamente.`);
        loadBackups();
      } else {
        showAlert('Erro', 'Não foi possível gerar o backup.');
      }
    } catch (err: any) {
      showAlert('Erro', err?.message || 'Falha ao criar backup.');
    } finally {
      setCreating(false);
    }
  };

  const handleRestoreBackup = async (backup: UserBackupData) => {
    const ok = await showConfirm(
      'Atenção: Restaurar Backup?',
      `Deseja restaurar o backup de ${new Date(backup.createdAt).toLocaleString('pt-BR')} (${backup.userCount} usuários)? Os dados atuais de XP, moedas e patentes dos alunos deste tenant serão revertidos para esta data.`
    );
    if (!ok) return;

    setRestoring(true);
    try {
      const res = await restoreTenantUsersBackup(tenantId, backup.users);
      if (res.success) {
        showAlert('Restauração Concluída!', `Dados de ${res.restoredCount} usuário(s) foram restaurados com sucesso.`);
        if (onRestored) onRestored();
        onClose();
      } else {
        showAlert('Erro na Restauração', res.error || 'Falha ao restaurar dados.');
      }
    } catch (err: any) {
      showAlert('Erro', err?.message || 'Falha inesperada ao restaurar.');
    } finally {
      setRestoring(false);
    }
  };

  const handleUploadBackupJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        if (!parsed.users || !Array.isArray(parsed.users)) {
          showAlert('Arquivo Inválido', 'O arquivo selecionado não contém um backup de usuários válido.');
          return;
        }

        const ok = await showConfirm(
          'Restaurar do Arquivo Enviado?',
          `O arquivo contém ${parsed.users.length} usuários. Deseja restaurar os dados de progresso para a escola atual (${tenantName || 'Atual'})?`
        );
        if (!ok) return;

        setRestoring(true);
        const res = await restoreTenantUsersBackup(tenantId, parsed.users);
        if (res.success) {
          showAlert('Restauração Concluída!', `${res.restoredCount} usuários foram atualizados a partir do arquivo.`);
          if (onRestored) onRestored();
          onClose();
        } else {
          showAlert('Erro na Restauração', res.error || 'Falha ao processar arquivo.');
        }
      } catch (parseErr) {
        showAlert('Erro ao ler arquivo', 'O arquivo não é um JSON válido.');
      } finally {
        setRestoring(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      <div 
        className="glass-panel" 
        style={{ 
          maxWidth: '750px', 
          width: '100%', 
          maxHeight: '85vh', 
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ShieldCheck size={26} color="#10b981" />
            <div>
              <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Backups de Usuários (Isolado por Escola)</h2>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Escola: <strong style={{ color: 'var(--gold-primary)' }}>{tenantName || 'Escola Atual'}</strong>
              </span>
            </div>
          </div>
          <button 
            onClick={onClose} 
            disabled={restoring || creating}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.5rem' }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Action Bar */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleCreateManualBackup}
            disabled={creating || restoring}
            className="login-btn"
            style={{
              background: '#10b981',
              color: '#fff',
              border: 'none',
              padding: '0.6rem 1.2rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {creating ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
            <span>Criar e Baixar Backup Agora (.json)</span>
          </button>

          <label 
            className="login-btn"
            style={{
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              padding: '0.6rem 1.2rem',
              cursor: restoring ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Upload size={16} />
            <span>Restaurar de Arquivo JSON</span>
            <input 
              type="file" 
              accept=".json" 
              disabled={restoring} 
              onChange={handleUploadBackupJson} 
              style={{ display: 'none' }} 
            />
          </label>

          <button
            onClick={loadBackups}
            disabled={loading}
            className="login-btn"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-glass)',
              color: 'var(--text-secondary)',
              padding: '0.6rem 0.8rem',
              marginLeft: 'auto'
            }}
            title="Recarregar lista"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* List of Previous Backups */}
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', padding: '0.5rem' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Carregando histórico de backups...
            </div>
          ) : backups.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <FileText size={36} style={{ margin: '0 auto 0.5rem auto', opacity: 0.4 }} />
              <p style={{ margin: 0 }}>Nenhum backup registrado para esta escola ainda.</p>
              <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Clique no botão verde acima para criar o primeiro backup seguro.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {backups.map(b => (
                <div 
                  key={b.backupId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.85rem 1rem',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                      <Calendar size={14} color="var(--gold-primary)" />
                      <strong style={{ fontSize: '0.9rem' }}>
                        {new Date(b.createdAt).toLocaleString('pt-BR')}
                      </strong>
                      <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.5rem', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                        {b.userCount} usuários
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Motivo: {b.trigger} • Por: {b.createdBy || 'Sistema'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => downloadJsonBackup(b, `backup_${tenantName ? tenantName.replace(/[^a-zA-Z0-9_-]/g, '_') : 'escola'}`)}
                      className="login-btn"
                      style={{
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.8rem',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--border-glass)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <Download size={14} />
                      <span>Baixar JSON</span>
                    </button>

                    <button
                      onClick={() => handleRestoreBackup(b)}
                      disabled={restoring}
                      className="login-btn"
                      style={{
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.8rem',
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#f87171',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <RotateCcw size={14} />
                      <span>Restaurar</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button 
            onClick={onClose}
            className="login-btn"
            style={{ background: 'transparent', border: '1px solid var(--border-glass)', padding: '0.5rem 1.5rem', color: 'var(--text-secondary)' }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
