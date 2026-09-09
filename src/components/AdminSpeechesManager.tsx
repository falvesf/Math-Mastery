import React, { useState } from 'react';
import { MessageSquare, Sparkles, HelpCircle } from 'lucide-react';
import AdminCompanionTipsManager from './AdminCompanionTipsManager';
import { AdminPlayerQuotesManager } from './AdminPlayerQuotesManager';

export const AdminSpeechesManager: React.FC = () => {
  const [subTab, setSubTab] = useState<'tutorial' | 'missions'>('tutorial');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Header Geral com Guia e Sub-abas */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        paddingBottom: '1.25rem',
        borderBottom: '1px solid var(--border-glass)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)',
          }}>
            <MessageSquare size={22} color="var(--gold-primary)" />
          </div>
          <div>
            <h2 style={{
              margin: 0,
              fontSize: '1.4rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              letterSpacing: '-0.01em',
            }}>
              Central de Falas do Sistema
            </h2>
            <p style={{
              margin: '0.2rem 0 0 0',
              fontSize: '0.82rem',
              color: 'var(--text-secondary)',
            }}>
              Gerencie todas as mensagens verbais do jogo: dicas introdutórias do companheiro e frases dinâmicas de combate.
            </p>
          </div>
        </div>

        {/* Seletor de Sub-abas */}
        <div style={{
          display: 'flex',
          gap: '0.35rem',
          padding: '0.3rem',
          borderRadius: '12px',
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid var(--border-glass)',
        }}>
          <button
            type="button"
            onClick={() => setSubTab('tutorial')}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '9px',
              fontSize: '0.82rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              cursor: 'pointer',
              border: subTab === 'tutorial' ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid transparent',
              background: subTab === 'tutorial' 
                ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' 
                : 'transparent',
              color: subTab === 'tutorial' ? '#0f172a' : 'var(--text-secondary)',
              boxShadow: subTab === 'tutorial' ? '0 4px 12px rgba(245, 158, 11, 0.3)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <HelpCircle size={15} />
            Tutorial (Companheiro)
          </button>

          <button
            type="button"
            onClick={() => setSubTab('missions')}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '9px',
              fontSize: '0.82rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              cursor: 'pointer',
              border: subTab === 'missions' ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid transparent',
              background: subTab === 'missions' 
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                : 'transparent',
              color: subTab === 'missions' ? '#ffffff' : 'var(--text-secondary)',
              boxShadow: subTab === 'missions' ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <Sparkles size={15} />
            Falas em Missões
          </button>
        </div>
      </div>

      {/* Conteúdo da Sub-aba */}
      <div style={{ width: '100%' }}>
        {subTab === 'tutorial' ? (
          <AdminCompanionTipsManager />
        ) : (
          <AdminPlayerQuotesManager />
        )}
      </div>
    </div>
  );
};

export default AdminSpeechesManager;
