/**
 * Utilitário de formatação de nome para registros administrativos e histórico.
 * Exibe apenas o primeiro nome do administrador/professor em vez do e-mail.
 */

export function formatAdminFirstName(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const first = name.trim().split(/\s+/)[0];
    if (first && !first.includes('@')) {
      return first.charAt(0).toUpperCase() + first.slice(1);
    }
  }
  if (email && email.trim()) {
    const handle = email.split('@')[0];
    const firstPart = handle.split('.')[0].split('_')[0].split('-')[0];
    if (firstPart) {
      return firstPart.charAt(0).toUpperCase() + firstPart.slice(1).toLowerCase();
    }
  }
  return 'Admin';
}

export function sanitizeHistoryText(text?: string | null): string {
  if (!text) return '';
  let res = text.replace(/por\s+([a-zA-Z0-9._%+-]+)@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, (_, emailUser) => {
    const raw = emailUser.split('.')[0].split('_')[0].split('-')[0];
    const name = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : 'Admin';
    return `por ${name}`;
  });
  // Também substitui qualquer endereço de e-mail isolado restante no texto
  res = res.replace(/([a-zA-Z0-9._%+-]+)@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, (_, emailUser) => {
    const raw = emailUser.split('.')[0].split('_')[0].split('-')[0];
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : 'Admin';
  });
  res = res.replace(/\|\s*\|\s*/g, '| ').replace(/\s{2,}/g, ' ').trim();
  return res;
}
