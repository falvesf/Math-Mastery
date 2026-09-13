import * as THREE from 'three';

/**
 * voxelTextures.ts
 * Gerador procedural de texturas pixel art (16x16) fiéis ao Minecraft.
 * Gera em memória via HTML Canvas com filtragem NearestFilter para máxima nitidez e 0ms de download.
 */

// Cache de texturas geradas para reaproveitamento total
const textureCache: Record<string, THREE.CanvasTexture> = {};

function createPixelCanvas(width = 16, height = 16): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function makeTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Pseudo-random com seed para consistência visual
function seededRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

/**
 * Textura clássica de Tijolos de Pedra (Stone Bricks)
 * Layout 4 tijolos (2 fileiras com junta desencontrada)
 */
export function getStoneBricksTexture(): THREE.CanvasTexture {
  if (textureCache['stone_bricks']) return textureCache['stone_bricks'];

  const { canvas, ctx } = createPixelCanvas(16, 16);

  // Paleta de pedra
  const palette = ['#737373', '#666666', '#7f7f7f', '#5e5e5e', '#8a8a8a'];
  const darkMortar = '#3b3b3b';
  const lightBevel = '#919191';

  let seed = 42;
  // Preenchimento base com ruído de pedra
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(seededRandom(seed++) * palette.length);
      ctx.fillStyle = palette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Linhas horizontais de argamassa (y = 0, y = 8, y = 15)
  ctx.fillStyle = darkMortar;
  ctx.fillRect(0, 0, 16, 1);
  ctx.fillRect(0, 8, 16, 1);
  ctx.fillRect(0, 15, 16, 1);

  // Linhas verticais de argamassa
  // Fileira superior (y = 1..7): junta em x = 8
  ctx.fillRect(8, 1, 1, 7);
  // Fileira inferior (y = 9..14): junta em x = 0 e x = 15 (repetição)
  ctx.fillRect(0, 9, 1, 6);
  ctx.fillRect(15, 9, 1, 6);

  // Destaques sutis de chanfro nos tijolos (borda superior clara)
  ctx.fillStyle = lightBevel;
  ctx.fillRect(1, 1, 7, 1);
  ctx.fillRect(9, 1, 7, 1);
  ctx.fillRect(1, 9, 14, 1);

  const tex = makeTexture(canvas);
  textureCache['stone_bricks'] = tex;
  return tex;
}

/**
 * Textura do topo do bloco de grama (Grass Block Top)
 */
export function getGrassTopTexture(): THREE.CanvasTexture {
  if (textureCache['grass_top']) return textureCache['grass_top'];

  const { canvas, ctx } = createPixelCanvas(16, 16);
  const palette = ['#4c7e28', '#588c2d', '#437021', '#629933', '#3d631e'];

  let seed = 101;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(seededRandom(seed++) * palette.length);
      ctx.fillStyle = palette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const tex = makeTexture(canvas);
  textureCache['grass_top'] = tex;
  return tex;
}

/**
 * Textura lateral do bloco de grama (Grass Block Side)
 * Terra embaixo + pontas de grama verde no topo
 */
export function getGrassSideTexture(): THREE.CanvasTexture {
  if (textureCache['grass_side']) return textureCache['grass_side'];

  const { canvas, ctx } = createPixelCanvas(16, 16);
  const dirtPalette = ['#866043', '#745237', '#62432b', '#5c3e27', '#936a4b'];
  const grassPalette = ['#4c7e28', '#588c2d', '#437021', '#629933'];

  let seed = 202;
  // Fundo de terra
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(seededRandom(seed++) * dirtPalette.length);
      ctx.fillStyle = dirtPalette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Camada superior de grama com gotejamento irregular
  const dripLengths = [3, 4, 3, 5, 4, 3, 4, 5, 3, 4, 3, 5, 4, 3, 4, 3];
  for (let x = 0; x < 16; x++) {
    const depth = dripLengths[x];
    for (let y = 0; y < depth; y++) {
      const idx = Math.floor(seededRandom(seed++) * grassPalette.length);
      ctx.fillStyle = grassPalette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const tex = makeTexture(canvas);
  textureCache['grass_side'] = tex;
  return tex;
}

/**
 * Textura de terra (Dirt)
 */
export function getDirtTexture(): THREE.CanvasTexture {
  if (textureCache['dirt']) return textureCache['dirt'];

  const { canvas, ctx } = createPixelCanvas(16, 16);
  const palette = ['#866043', '#745237', '#62432b', '#5c3e27', '#936a4b'];

  let seed = 303;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(seededRandom(seed++) * palette.length);
      ctx.fillStyle = palette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const tex = makeTexture(canvas);
  textureCache['dirt'] = tex;
  return tex;
}

/**
 * Textura de pedra esburacada (Cobblestone)
 */
export function getCobblestoneTexture(): THREE.CanvasTexture {
  if (textureCache['cobblestone']) return textureCache['cobblestone'];

  const { canvas, ctx } = createPixelCanvas(16, 16);
  const palette = ['#5a5a5a', '#6b6b6b', '#7a7a7a', '#4a4a4a', '#3f3f3f', '#888888'];

  let seed = 404;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(seededRandom(seed++) * palette.length);
      ctx.fillStyle = palette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const tex = makeTexture(canvas);
  textureCache['cobblestone'] = tex;
  return tex;
}

/**
 * Textura do Sol quadrado do Minecraft
 */
export function getSunTexture(): THREE.CanvasTexture {
  if (textureCache['minecraft_sun']) return textureCache['minecraft_sun'];

  const { canvas, ctx } = createPixelCanvas(32, 32);

  // Halo suave
  ctx.fillStyle = 'rgba(255, 245, 200, 0.4)';
  ctx.fillRect(0, 0, 32, 32);

  // Borda solar dourada
  ctx.fillStyle = '#ffea7a';
  ctx.fillRect(4, 4, 24, 24);

  // Centro branco brilhante do sol quadrado
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(8, 8, 16, 16);

  const tex = makeTexture(canvas);
  textureCache['minecraft_sun'] = tex;
  return tex;
}
