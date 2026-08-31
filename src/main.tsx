import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registra o Service Worker (cache de imagens + instalação PWA).
// Registro IMEDIATO (não espera o load) para o SW controlar a página cedo.
if ('serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`;
  navigator.serviceWorker
    .register(swUrl)
    .then((reg) => {
      console.log('[SW] Registrado com sucesso:', reg.scope);
      // Força a atualização/controle da página pelo SW (instalação PWA)
      reg.update();
    })
    .catch((err) => {
      console.warn(`[SW] Falha ao registrar ${swUrl}:`, err);
    });
}
