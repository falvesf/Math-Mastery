export function getSafeUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  
  let safeUrl = url.replace(/\\/g, '/');
  
  // Se for um caminho absoluto da raiz (ex: /img/...), remove a barra inicial para concatenar
  if (safeUrl.startsWith('/')) {
    safeUrl = import.meta.env.BASE_URL + safeUrl.substring(1);
  } else {
    // Se for um caminho relativo puro (ex: img/...), concatena diretamente
    safeUrl = import.meta.env.BASE_URL + safeUrl;
  }
  
  return safeUrl;
}
