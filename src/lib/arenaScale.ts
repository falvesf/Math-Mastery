// Escala de resolução da arena.
//
// O Arena Debug guarda vários offsets em PIXELS ABSOLUTOS (posição dos bonecos,
// nome, balões de fala, fatalidade, magias, distância de ataque corpo a corpo etc.).
// Como a arena usa um "stage" de proporção fixa (16:9 desktop / 9:16 mobile) que apenas
// MUDA DE TAMANHO conforme a resolução (1080p, 1440p, 4K, ...), esses pixels não
// acompanham a escala e quebram ao trocar de resolução.
//
// A solução: expressar os offsets de forma PROPORCIONAL. Calculamos um fator
// `arenaScale = larguraAtual / larguraReferencia` e multiplicamos os offsets por ele.
// Assim UMA única configuração vale para qualquer resolução do mesmo modo
// (2D/3D x Desktop/Mobile), e as 4 configurações existentes passam a ser suficientes.
//
// IMPORTANTE: após esta mudança, reajuste as configurações UMA vez (na resolução que
// você mais usa). Depois disso, elas ficam estáveis em qualquer resolução.

import type { ArenaDebugConfig } from '../components/ArenaDebugPanel';

// Larguras de referência (em px) para desktop e mobile. Representam uma largura
// "nominal" da arena; o valor exato só define o ponto neutro da escala (scale = 1).
export const ARENA_REF_WIDTH_DESKTOP = 1000;
export const ARENA_REF_WIDTH_MOBILE = 390;

// Campos do Arena Debug que são OFFSETS/TAMANHOS em pixels de tela e, portanto,
// precisam escalar junto com a arena. NÃO incluímos aqui:
//  - multiplicadores de escala (playerScale, monsterScale, *Scale3D);
//  - coordenadas já em % (coinArea*, playerCoinArea*);
//  - calibração de câmera 3D (cameraPitch3D, cameraDist3D, cameraTargetY3D) que é em
//    espaço de mundo e já independe de resolução;
//  - ajustes internos do model viewer (charCanvasW/H, charZoom, charFit);
//  - layout próprio da arena (arenaHeight, arenaPaddingTop) para não causar feedback.
const SCALED_PX_FIELDS: (keyof ArenaDebugConfig)[] = [
  'playerOffsetX', 'playerOffsetY', 'playerOffsetX3D', 'playerOffsetY3D',
  'monsterOffsetX', 'monsterOffsetY', 'monsterOffsetX3D', 'monsterOffsetY3D',
  'playerNameX', 'playerNameY', 'monsterNameX', 'monsterNameY',
  'playerBubbleX', 'playerBubbleY', 'monsterBubbleX', 'monsterBubbleY',
  'deathOffsetX', 'deathOffsetY',
  'projStartX', 'projStartY', 'projTargetDist', 'projTargetY', 'projArcHeight',
  'attackDist', 'arenaGap',
  'bubbleOriginSize',
  'playerBubbleMaxWidth', 'monsterBubbleMaxWidth', 'bubbleMaxWidth',
  'playerBubbleFontSize', 'monsterBubbleFontSize', 'bubbleFontSize',
];

/** Retorna uma cópia do config com os offsets em px multiplicados por `scale`. */
export function scaleArenaDebug(cfg: ArenaDebugConfig, scale: number): ArenaDebugConfig {
  if (!cfg || scale === 1) return cfg;
  const out: ArenaDebugConfig = { ...cfg };
  for (const field of SCALED_PX_FIELDS) {
    const value = (cfg as any)[field];
    if (typeof value === 'number' && isFinite(value)) {
      (out as any)[field] = Math.round(value * scale);
    }
  }
  return out;
}

/**
 * Calcula o fator de escala da arena com base na largura efetiva do stage (3D) ou da
 * arena (2D) e no dispositivo (desktop/mobile). Retorna um número >= 0.3.
 */
export function computeArenaScale(
  effectiveWidthPx: number,
  device: 'desktop' | 'mobile'
): number {
  const ref = device === 'mobile' ? ARENA_REF_WIDTH_MOBILE : ARENA_REF_WIDTH_DESKTOP;
  const width = Math.max(1, Number(effectiveWidthPx) || ref);
  return Math.max(0.3, Math.min(4, width / ref));
}
