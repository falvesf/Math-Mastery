// @ts-ignore - Three do skinview3d (0.156): a arena 3D usa a MESMA versão dos bonecos.
import * as THREE from 'skinview3d/node_modules/three';

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

/**
 * Textura de Tijolos do Nether (Nether Bricks)
 * Tijolos estreitos em carmesim escuro e vinho com juntas pretas
 */
export function getNetherBricksTexture(): THREE.CanvasTexture {
  if (textureCache['nether_bricks']) return textureCache['nether_bricks'];

  const { canvas, ctx } = createPixelCanvas(16, 16);
  const palette = ['#2c0d12', '#371319', '#24080c', '#3f161c', '#1e0508'];
  const darkMortar = '#120204';
  const lightBevel = '#4d1c24';

  let seed = 505;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(seededRandom(seed++) * palette.length);
      ctx.fillStyle = palette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Linhas horizontais de argamassa do Nether
  ctx.fillStyle = darkMortar;
  ctx.fillRect(0, 0, 16, 1);
  ctx.fillRect(0, 8, 16, 1);
  ctx.fillRect(0, 15, 16, 1);

  // Juntas verticais
  ctx.fillRect(8, 1, 1, 7);
  ctx.fillRect(0, 9, 1, 6);
  ctx.fillRect(15, 9, 1, 6);

  // Brilho avermelhado sutil nos cantos
  ctx.fillStyle = lightBevel;
  ctx.fillRect(1, 1, 7, 1);
  ctx.fillRect(9, 1, 7, 1);
  ctx.fillRect(1, 9, 14, 1);

  const tex = makeTexture(canvas);
  textureCache['nether_bricks'] = tex;
  return tex;
}

/**
 * Textura de Netherrack (Pedra porosa infernal)
 */
export function getNetherrackTexture(): THREE.CanvasTexture {
  if (textureCache['netherrack']) return textureCache['netherrack'];

  const { canvas, ctx } = createPixelCanvas(16, 16);
  const palette = ['#681b1b', '#561313', '#772222', '#440e0e', '#882929', '#380a0a'];
  const emberColor = '#a83232';

  let seed = 606;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(seededRandom(seed++) * palette.length);
      ctx.fillStyle = palette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Pontos de brasas/rocha viva
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(seededRandom(seed++) * 16);
    const y = Math.floor(seededRandom(seed++) * 16);
    ctx.fillStyle = emberColor;
    ctx.fillRect(x, y, 1, 1);
  }

  const tex = makeTexture(canvas);
  textureCache['netherrack'] = tex;
  return tex;
}

/**
 * Textura de Arenito (Sandstone)
 * Bloco talhado dourado das pirâmides do deserto
 */
export function getSandstoneTexture(): THREE.CanvasTexture {
  if (textureCache['sandstone']) return textureCache['sandstone'];

  const { canvas, ctx } = createPixelCanvas(16, 16);
  const palette = ['#d8b870', '#cca960', '#e4c785', '#bfa054', '#eed698'];
  const darkGroove = '#a3843e';
  const lightEdge = '#f5e4b2';

  let seed = 707;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(seededRandom(seed++) * palette.length);
      ctx.fillStyle = palette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Friso decorativo talhado
  ctx.fillStyle = darkGroove;
  ctx.fillRect(0, 3, 16, 1);
  ctx.fillRect(0, 12, 16, 1);
  ctx.fillStyle = lightEdge;
  ctx.fillRect(0, 4, 16, 1);
  ctx.fillRect(0, 13, 16, 1);

  const tex = makeTexture(canvas);
  textureCache['sandstone'] = tex;
  return tex;
}

/**
 * Textura de Areia do Deserto (Desert Sand)
 */
export function getSandTexture(): THREE.CanvasTexture {
  if (textureCache['sand']) return textureCache['sand'];

  const { canvas, ctx } = createPixelCanvas(16, 16);
  const palette = ['#dbbc76', '#cfb068', '#e5c988', '#c4a45a', '#ebd094'];

  let seed = 808;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(seededRandom(seed++) * palette.length);
      ctx.fillStyle = palette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const tex = makeTexture(canvas);
  textureCache['sand'] = tex;
  return tex;
}

/**
 * Textura de Neve no Topo (Snow Block Top)
 */
export function getSnowTopTexture(): THREE.CanvasTexture {
  if (textureCache['snow_top']) return textureCache['snow_top'];

  const { canvas, ctx } = createPixelCanvas(16, 16);
  const palette = ['#ffffff', '#f4f8fb', '#eaf2f8', '#deebf5', '#d4e4f0'];

  let seed = 909;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(seededRandom(seed++) * palette.length);
      ctx.fillStyle = palette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const tex = makeTexture(canvas);
  textureCache['snow_top'] = tex;
  return tex;
}

/**
 * Textura Lateral do Bloco de Neve (Snow Block Side)
 * Terra embaixo + camada espessa de neve branca no topo
 */
export function getSnowSideTexture(): THREE.CanvasTexture {
  if (textureCache['snow_side']) return textureCache['snow_side'];

  const { canvas, ctx } = createPixelCanvas(16, 16);
  const dirtPalette = ['#775438', '#66452c', '#553720', '#835f41'];
  const snowPalette = ['#ffffff', '#f4f8fb', '#eaf2f8', '#deebf5'];

  let seed = 1001;
  // Fundo de terra
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(seededRandom(seed++) * dirtPalette.length);
      ctx.fillStyle = dirtPalette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Camada espessa e irregular de neve no topo
  const snowDepth = [5, 6, 5, 7, 6, 5, 6, 7, 5, 6, 7, 6, 5, 6, 5, 6];
  for (let x = 0; x < 16; x++) {
    const depth = snowDepth[x];
    for (let y = 0; y < depth; y++) {
      const idx = Math.floor(seededRandom(seed++) * snowPalette.length);
      ctx.fillStyle = snowPalette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const tex = makeTexture(canvas);
  textureCache['snow_side'] = tex;
  return tex;
}

/**
 * Textura de Pedra Glacial / Gelo Compacto (Ice Stone)
 */
export function getIceStoneTexture(): THREE.CanvasTexture {
  if (textureCache['ice_stone']) return textureCache['ice_stone'];

  const { canvas, ctx } = createPixelCanvas(16, 16);
  const palette = ['#7ca3ba', '#6c93aa', '#8bb2c9', '#5b8198', '#9ac0d7', '#4d7187'];

  let seed = 1102;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(seededRandom(seed++) * palette.length);
      ctx.fillStyle = palette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Linhas de blocos de gelo
  ctx.fillStyle = '#426377';
  ctx.fillRect(0, 0, 16, 1);
  ctx.fillRect(0, 8, 16, 1);
  ctx.fillRect(8, 1, 1, 7);
  ctx.fillRect(0, 9, 1, 7);

  // Brilho cristalino
  ctx.fillStyle = '#b3d8ee';
  ctx.fillRect(1, 1, 7, 1);
  ctx.fillRect(9, 1, 7, 1);

  const tex = makeTexture(canvas);
  textureCache['ice_stone'] = tex;
  return tex;
}

/**
 * Textura de Pedra do End (End Stone)
 * Rocha amarelada pontilhada de crateras da dimensão The End
 */
export function getEndStoneTexture(): THREE.CanvasTexture {
  if (textureCache['end_stone']) return textureCache['end_stone'];

  const { canvas, ctx } = createPixelCanvas(16, 16);
  const palette = ['#d7d69b', '#cac98f', '#e3e2aa', '#bdbe82', '#ecebb8', '#b0b176'];

  let seed = 1203;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(seededRandom(seed++) * palette.length);
      ctx.fillStyle = palette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Manchas escuras crateradas
  for (let i = 0; i < 15; i++) {
    const x = Math.floor(seededRandom(seed++) * 15);
    const y = Math.floor(seededRandom(seed++) * 15);
    ctx.fillStyle = '#9b9d62';
    ctx.fillRect(x, y, 2, 1);
  }

  const tex = makeTexture(canvas);
  textureCache['end_stone'] = tex;
  return tex;
}

/**
 * Textura de Bloco Purpur (Purpur Block)
 * Tijolos roxos da fortaleza do End
 */
export function getPurpurTexture(): THREE.CanvasTexture {
  if (textureCache['purpur']) return textureCache['purpur'];

  const { canvas, ctx } = createPixelCanvas(16, 16);
  const palette = ['#a26ca3', '#945e95', '#af78b0', '#834f84', '#6d3c6e'];
  const darkEdge = '#5c2f5d';
  const lightEdge = '#bd87be';

  let seed = 1304;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = Math.floor(seededRandom(seed++) * palette.length);
      ctx.fillStyle = palette[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Moldura do bloco Purpur
  ctx.fillStyle = darkEdge;
  ctx.strokeRect(0.5, 0.5, 15, 15);
  ctx.fillStyle = lightEdge;
  ctx.fillRect(1, 1, 14, 1);
  ctx.fillRect(1, 1, 1, 14);

  const tex = makeTexture(canvas);
  textureCache['purpur'] = tex;
  return tex;
}

// ==========================================
// Metadados Globais dos Biomas Voxel
// ==========================================

export type VoxelBiomeType = 'plains' | 'nether' | 'desert' | 'snow' | 'end';

export interface VoxelBiomeMeta {
  id: VoxelBiomeType;
  title: string;
  name: string;
  description: string;
  badge: string;
  icon: string;
  primaryColor: string;
  skyColor: string;
  ambientDesc: string;
}

export const VOXEL_BIOMES: VoxelBiomeMeta[] = [
  {
    id: 'plains',
    title: 'Planície Verdejante',
    name: 'Planície (Minecraft)',
    description: 'Campos verdes clássicos, tijolos de pedra e céu ensolarado.',
    badge: '🌲 Planície',
    icon: '🌲',
    primaryColor: '#4c7e28',
    skyColor: '#78a7ff',
    ambientDesc: 'Céu azul e nuvens flutuantes',
  },
  {
    id: 'nether',
    title: 'Nether Vulcânico',
    name: 'Nether (Infernal)',
    description: 'Fortaleza de tijolos do nether, netherrack e bruma carmesim.',
    badge: '🔥 Nether',
    icon: '🔥',
    primaryColor: '#701d1d',
    skyColor: '#1c0508',
    ambientDesc: 'Névoa densa e brasas incandescentes',
  },
  {
    id: 'desert',
    title: 'Deserto das Areias',
    name: 'Deserto (Pirâmides)',
    description: 'Dunas douradas, arenito talhado e sol escaldante.',
    badge: '🏜️ Deserto',
    icon: '🏜️',
    primaryColor: '#d4b574',
    skyColor: '#6eb6ff',
    ambientDesc: 'Sol escaldante e dunas infinitas',
  },
  {
    id: 'snow',
    title: 'Tundra Congelada',
    name: 'Tundra (Gelo & Neve)',
    description: 'Campos de neve fofa, pedra glacial e flocos caindo suavemente.',
    badge: '❄️ Tundra',
    icon: '❄️',
    primaryColor: '#a0c4d8',
    skyColor: '#8faec9',
    ambientDesc: 'Névoa fria e flocos de neve',
  },
  {
    id: 'end',
    title: 'O Fim / The End',
    name: 'The End (O Vazio)',
    description: 'Rocha espacial do End, blocos Purpur e vazio cósmico arroxeado.',
    badge: '🌌 The End',
    icon: '🌌',
    primaryColor: '#6c436d',
    skyColor: '#0a0514',
    ambientDesc: 'Vazio cósmico e partículas do Ender',
  },
];
