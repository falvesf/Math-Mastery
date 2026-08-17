import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registra o Service Worker para cache de imagens do Supabase Storage
// Só ativa em produção (ou quando servido via HTTPS / localhost)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[SW] Registrado com sucesso. Escopo:', reg.scope);
      })
      .catch((err) => {
        console.warn('[SW] Falha ao registrar:', err);
      });
  });
}
