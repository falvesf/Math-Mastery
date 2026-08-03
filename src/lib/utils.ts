export function getSafeUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  
  let safeUrl = url.replace(/\\/g, '/');
  if (safeUrl.startsWith('/')) {
    safeUrl = import.meta.env.BASE_URL + safeUrl.substring(1);
  }
  return safeUrl;
}
