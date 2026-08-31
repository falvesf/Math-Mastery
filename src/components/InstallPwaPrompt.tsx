import { useEffect, useState } from 'react';

const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent || '');

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  return !!(navigator as any).standalone;
}

/**
 * Botão/dica flutuante de instalação PWA.
 * - Android/desktop: captura beforeinstallprompt → botão "📲 Instalar app".
 * - iOS (Safari): beforeinstallprompt NÃO existe → mostra uma dica de como
 *   instalar (Compartilhar → Adicionar à Tela de Início), dispensável.
 */
export default function InstallPwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissedHint, setDismissedHint] = useState(false);

  useEffect(() => {
    if (isStandaloneMode()) {
      setInstalled(true);
      return;
    }
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || isStandaloneMode()) return null;

  // iOS: sem beforeinstallprompt — orienta pelo caminho manual do Safari.
  if (isIOS) {
    if (dismissedHint) return null;
    return (
      <div style={{ position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 200001, width: 'min(320px, 92vw)' }}>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--gold-primary)',
          borderRadius: '12px', padding: '0.7rem 0.9rem', boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
        }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>📲</span>
          <div style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>
            <strong>Instale o Math Mastery:</strong> toque no botão <b>Compartilhar</b> do Safari e escolha{' '}
            <b>"Adicionar à Tela de Início"</b>.
          </div>
          <button onClick={() => setDismissedHint(true)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem', padding: '0.1rem', flexShrink: 0 }} title="Dispensar">✕</button>
        </div>
      </div>
    );
  }

  // Android/desktop: só mostra quando o navegador permite instalar.
  if (!deferredPrompt) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
    } catch (e) { /* ignore */ }
    setDeferredPrompt(null);
  };

  return (
    <div style={{ position: 'fixed', bottom: '1.2rem', left: '50%', transform: 'translateX(-50%)', zIndex: 200001 }}>
      <button onClick={handleInstall} style={{
        display: 'flex', alignItems: 'center', gap: '0.45rem',
        background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000)',
        border: 'none', borderRadius: '999px', padding: '0.6rem 1.2rem',
        fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}>
        📲 Instalar app
      </button>
    </div>
  );
}