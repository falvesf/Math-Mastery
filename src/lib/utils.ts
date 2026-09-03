export function getSafeUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http') || url.startsWith('data:')) return url.replace(/ /g, '%20');

  let safeUrl = url.replace(/\\/g, '/');

  // Se for um caminho absoluto da raiz (ex: /img/...), remove a barra inicial para concatenar
  if (safeUrl.startsWith('/')) {
    safeUrl = import.meta.env.BASE_URL + safeUrl.substring(1);
  } else {
    // Se for um caminho relativo puro (ex: img/...), concatena diretamente
    safeUrl = import.meta.env.BASE_URL + safeUrl;
  }

  return safeUrl.replace(/ /g, '%20');
}

/** Codifica cada segmento de um caminho de storage (corrige nomes com espaços/acentos). */
export function encodeStoragePath(path: string): string {
  return path.split('/').map(seg => encodeURIComponent(seg)).join('/');
}

/** Nome de arquivo seguro para upload (remove espaços/caracteres inválidos). */
export function sanitizeFileName(name: string): string {
  return (name || 'arquivo').replace(/[^a-zA-Z0-9.-]/g, '_').replace(/_+/g, '_');
}

export function normalizeCombatCoinDrop(raw: any): { minCoins?: number; maxCoins?: number; minValue?: number; maxValue?: number } {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return raw as { minCoins?: number; maxCoins?: number; minValue?: number; maxValue?: number };
}

/** Extrai o domínio do e-mail (ex: "aluno@escola.edu.br" -> "escola.edu.br") */
export function getEmailDomain(email?: string): string {
  if (!email) return '';
  const parts = email.trim().toLowerCase().split('@');
  return parts.length > 1 ? parts[1] : '';
}

/** Normaliza o domínio permitido configurado na escola (remove "@", espaços, minúsculas) */
export function normalizeAllowedDomain(domain?: string | null): string {
  if (!domain) return '';
  return domain.trim().toLowerCase().replace(/^@/, '');
}

/** Verifica se o e-mail pertence ao domínio permitido da escola (vazio = sem restrição) */
export function emailMatchesDomain(email?: string, allowedDomain?: string | null): boolean {
  const norm = normalizeAllowedDomain(allowedDomain);
  if (!norm) return true;
  return getEmailDomain(email) === norm;
}
