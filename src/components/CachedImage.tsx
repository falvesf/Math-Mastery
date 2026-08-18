import { useState, useEffect, ImgHTMLAttributes } from 'react';

// Um cache na memória para evitar re-fazer o processo ObjectURL na mesma sessão
const memoryCache: Record<string, string> = {};

interface CachedImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

export default function CachedImage({ src, alt, ...props }: CachedImageProps) {
  const [cachedSrc, setCachedSrc] = useState<string>(
    memoryCache[src] || (src?.startsWith('data:') ? src : '')
  );
  
  useEffect(() => {
    if (!src) return;
    
    // Se for Base64 puro ou já estiver no cache de memória
    if (src.startsWith('data:') || memoryCache[src]) {
      setCachedSrc(memoryCache[src] || src);
      return;
    }

    let isMounted = true;

    const loadCachedImage = async () => {
      try {
        // Tenta abrir o cache do navegador
        const cache = await caches.open('math-mastery-images-v1');
        
        // Verifica se a imagem já está lá
        const response = await cache.match(src);
        
        if (response) {
          // Se já está no cache, cria uma URL temporária (Blob) para exibir
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          memoryCache[src] = objectUrl;
          if (isMounted) setCachedSrc(objectUrl);
        } else {
          // Se não estiver, baixa a imagem e a salva no cache
          const fetchResponse = await fetch(src);
          if (fetchResponse.ok) {
            // Salva um clone no cache para não esgotar a resposta
            cache.put(src, fetchResponse.clone());
            const blob = await fetchResponse.blob();
            const objectUrl = URL.createObjectURL(blob);
            memoryCache[src] = objectUrl;
            if (isMounted) setCachedSrc(objectUrl);
          } else {
            // Falha ao buscar, usa o src original como fallback
            if (isMounted) setCachedSrc(src);
          }
        }
      } catch (error) {
        // Fallback silencioso para o src original se o cache API falhar (ex: modo anônimo estrito)
        if (isMounted) setCachedSrc(src);
      }
    };

    loadCachedImage();

    return () => {
      isMounted = false;
    };
  }, [src]);

  return <img src={cachedSrc || src} alt={alt} {...props} />;
}
