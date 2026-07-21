import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, HelpCircle, X } from 'lucide-react';

interface DialogOptions {
  title?: string;
  message: string;
}

interface DialogContextType {
  showAlert: (message: string, title?: string) => Promise<void>;
  showConfirm: (message: string, title?: string) => Promise<boolean>;
  showPrompt: (message: string, defaultValue?: string, title?: string) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<'alert' | 'confirm' | 'prompt'>('alert');
  const [dialogState, setDialogState] = useState<DialogOptions & { defaultValue?: string }>({ message: '' });
  const [promptValue, setPromptValue] = useState('');
  const [resolvePromise, setResolvePromise] = useState<{ resolve: (value: any) => void } | null>(null);

  const showAlert = useCallback((message: string, title?: string) => {
    return new Promise<void>((resolve) => {
      setType('alert');
      setDialogState({ message, title });
      setResolvePromise({ resolve });
      setIsOpen(true);
    });
  }, []);

  const showConfirm = useCallback((message: string, title?: string) => {
    return new Promise<boolean>((resolve) => {
      setType('confirm');
      setDialogState({ message, title });
      setResolvePromise({ resolve });
      setIsOpen(true);
    });
  }, []);

  const showPrompt = useCallback((message: string, defaultValue: string = '', title?: string) => {
    return new Promise<string | null>((resolve) => {
      setType('prompt');
      setDialogState({ message, title, defaultValue });
      setPromptValue(defaultValue);
      setResolvePromise({ resolve });
      setIsOpen(true);
    });
  }, []);

  const handleClose = (result: boolean) => {
    setIsOpen(false);
    if (resolvePromise) {
      if (type === 'alert') {
        resolvePromise.resolve(undefined);
      } else if (type === 'prompt') {
        resolvePromise.resolve(result ? promptValue : null);
      } else {
        resolvePromise.resolve(result);
      }
    }
  };

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      {isOpen && createPortal(
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            borderRadius: '16px',
            padding: '2rem',
            width: '100%',
            maxWidth: '450px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            position: 'relative',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <button
              onClick={() => handleClose(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '0.2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'white';
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{
                background: type === 'alert' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                color: type === 'alert' ? 'var(--accent-blue)' : 'var(--gold-primary)',
                padding: '0.75rem',
                borderRadius: '12px'
              }}>
                {type === 'alert' ? <AlertCircle size={32} /> : <HelpCircle size={32} />}
              </div>
              <div style={{ flex: 1, marginTop: '0.2rem' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem', color: 'white' }}>
                  {dialogState.title || (type === 'alert' ? 'Aviso' : type === 'confirm' ? 'Confirmação' : 'Entrada de Dados')}
                </h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: '1.5', fontSize: '1.05rem' }}>
                  {dialogState.message}
                </p>
                {type === 'prompt' && (
                  <input
                    type="text"
                    value={promptValue}
                    onChange={(e) => setPromptValue(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleClose(true);
                    }}
                    style={{
                      width: '100%',
                      marginTop: '1rem',
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-glass)',
                      background: 'rgba(0,0,0,0.3)',
                      color: 'white',
                      fontSize: '1rem'
                    }}
                  />
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
              {(type === 'confirm' || type === 'prompt') && (
                <button
                  onClick={() => handleClose(false)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-glass)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'white',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '1rem'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                  Cancelar
                </button>
              )}
              <button
                onClick={() => handleClose(true)}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: type === 'alert' ? 'var(--accent-blue)' : 'var(--gold-primary)',
                  color: type === 'alert' ? 'white' : 'black',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: type === 'alert' ? '0 0 15px rgba(59, 130, 246, 0.4)' : '0 0 15px rgba(245, 158, 11, 0.4)',
                  fontSize: '1rem'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                {type === 'alert' ? 'Entendi' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (context === undefined) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}
