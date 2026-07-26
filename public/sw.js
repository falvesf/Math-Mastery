/**
 * Math Mastery — Service Worker para cache de imagens do Firebase Storage
 * 
 * Estratégia: Cache-First para imagens do Firebase Storage.
 * - Na primeira vez: busca no Firebase, guarda no cache local.
 * - Nas próximas vezes: serve direto do cache, sem nenhuma requisição de rede.
 * - Cache expira após 7 dias para garantir que imagens atualizadas apareçam.
 * 
 * Isso é totalmente transparente: nenhum componente React precisa mudar.
 */

const CACHE_NAME = 'mathmastery-images-v1';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 dias

// Domínios cujas respostas devem ser cacheadas
const CACHEABLE_ORIGINS = [
  'firebasestorage.googleapis.com',
];

self.addEventListener('install', (event) => {
  // Ativa imediatamente sem esperar as abas antigas fecharem
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Assume o controle de todas as abas abertas imediatamente
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Remove caches antigos de versões anteriores do SW
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      ),
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Só intercepta requisições de imagem dos domínios configurados
  const isCacheable = CACHEABLE_ORIGINS.some((origin) =>
    url.hostname.includes(origin)
  );

  if (!isCacheable) return; // Deixa o browser lidar com tudo mais

  // Só cacheia GET de imagens (não API calls do Firestore)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Remove o token de autenticação da URL para usar como chave do cache
      // (o token pode mudar, mas a imagem em si é a mesma)
      const cacheKey = stripToken(event.request.url);

      // 1. Verifica se já temos essa imagem no cache
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        // Verifica se o cache não expirou
        const dateHeader = cachedResponse.headers.get('sw-cached-at');
        if (dateHeader) {
          const cachedAt = parseInt(dateHeader, 10);
          const age = (Date.now() - cachedAt) / 1000;
          if (age < MAX_AGE_SECONDS) {
            return cachedResponse; // Serve do cache!
          }
        } else {
          return cachedResponse; // Cache sem data = serve mesmo assim
        }
      }

      // 2. Não está no cache (ou expirou): busca na rede
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) {
          // Clona e guarda no cache com o timestamp
          const responseToCache = addCacheTimestamp(networkResponse.clone());
          cache.put(cacheKey, responseToCache);
        }
        return networkResponse;
      } catch (error) {
        // Se a rede falhar e tivermos cache expirado, melhor servir o cache antigo
        // do que mostrar um erro ao usuário
        if (cachedResponse) return cachedResponse;
        throw error;
      }
    })
  );
});

/**
 * Remove o parâmetro `token` da URL do Firebase Storage para usar como chave
 * estável no cache. O token pode ser rotacionado, mas o arquivo é o mesmo.
 */
function stripToken(urlString) {
  try {
    const url = new URL(urlString);
    url.searchParams.delete('token');
    return url.toString();
  } catch {
    return urlString;
  }
}

/**
 * Adiciona um header customizado com o timestamp de quando o item foi cacheado.
 * Isso permite verificar a idade do cache sem depender de headers HTTP do servidor.
 */
function addCacheTimestamp(response) {
  const headers = new Headers(response.headers);
  headers.set('sw-cached-at', Date.now().toString());

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
