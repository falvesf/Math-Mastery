/**
 * Toca um áudio com velocidade e recorte (início/duração) configuráveis.
 * Retorna o elemento de áudio (para poder pausar) ou null em erro.
 */
export function playChestAudio(url: string, rate = 1, startSec = 0, durationSec = 0): HTMLAudioElement | null {
  try {
    const audio = new Audio(url);
    audio.volume = 0.9;
    audio.playbackRate = Math.max(0.25, Math.min(3, rate || 1));
    audio.currentTime = Math.max(0, startSec || 0);

    const cleanup = () => {
      audio.removeEventListener('timeupdate', stopAtEnd);
      audio.removeEventListener('ended', cleanup);
    };
    const endAt = (startSec || 0) + (durationSec || 0);
    const stopAtEnd = () => {
      if (endAt > 0 && audio.currentTime >= endAt) {
        audio.pause();
        cleanup();
      }
    };

    if (durationSec > 0) {
      audio.addEventListener('timeupdate', stopAtEnd);
    }
    audio.addEventListener('ended', cleanup);

    audio.play().catch(() => {});
    return audio;
  } catch (e) {
    console.error('Erro ao tocar áudio:', e);
    return null;
  }
}