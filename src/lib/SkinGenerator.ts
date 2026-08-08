import type { AvatarConfig } from '../components/AvatarCharacter';

function adjustColor(hex: string, percent: number): string {
    if (!hex) return '#000000';
    let r = parseInt(hex.substring(1,3), 16) || 0;
    let g = parseInt(hex.substring(3,5), 16) || 0;
    let b = parseInt(hex.substring(5,7), 16) || 0;

    r = Math.min(255, Math.max(0, r + (r * percent / 100)));
    g = Math.min(255, Math.max(0, g + (g * percent / 100)));
    b = Math.min(255, Math.max(0, b + (b * percent / 100)));

    return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
}

const hash = (x: number, y: number) => {
    let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
};

export async function generateMinecraftSkinUrl(config: AvatarConfig, isBlinking: boolean = false): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  
  const gender = config.gender || 'male';
  const skin = config.skinColor || '#ffcc99';
  const hair = config.hairColor || '#4a3000';
  const eye = config.eyeColor || '#000000';
  const userShirt = config.shirtColor || (gender === 'female' ? '#d63074' : '#e5e5e5');
  const userPants = config.pantsColor || (gender === 'female' ? '#d63074' : '#3a2d24');
  
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 64, 64);

  const fillTextured = (
      baseColor: string, 
      startX: number, startY: number, 
      w: number, h: number, 
      variance = 10, 
      brightnessOffset = 0
  ) => {
      if (w <= 0 || h <= 0) return;
      for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) {
              let noise = (hash(startX + dx, startY + dy) - 0.5) * 2 * variance;
              ctx.fillStyle = adjustColor(baseColor, noise + brightnessOffset);
              ctx.fillRect(startX + dx, startY + dy, 1, 1);
          }
      }
  };

  const drawCuboid = (
      baseColor: string, 
      x: number, y: number, 
      w: number, d: number, h: number, 
      variance = 10,
      skipBottom = false
  ) => {
      fillTextured(baseColor, x, y + d, d, h, variance, -5);       // Right
      fillTextured(baseColor, x + d, y + d, w, h, variance, 0);    // Front
      fillTextured(baseColor, x + d + w, y + d, d, h, variance, -5); // Left
      fillTextured(baseColor, x + d + w + d, y + d, w, h, variance, -10); // Back
      fillTextured(baseColor, x + d, y, w, d, variance, +10);      // Top
      if (!skipBottom) {
          fillTextured(baseColor, x + d + w, y, w, d, variance, -15);  // Bottom
      }
  };

  const fill = (color: string, x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
  };

  const armW = gender === 'female' ? 3 : 4;

  // ==========================================
  // PELE BASE
  // ==========================================
  drawCuboid(skin, 0, 0, 8, 8, 8, 5); // Head
  drawCuboid(skin, 16, 16, 8, 4, 12, 5); // Body base
  drawCuboid(skin, 40, 16, armW, 4, 12, 5); // Right Arm
  drawCuboid(skin, 32, 48, armW, 4, 12, 5); // Left Arm
  drawCuboid(skin, 0, 16, 4, 4, 12, 5); // Right Leg
  drawCuboid(skin, 16, 48, 4, 4, 12, 5); // Left Leg

  // Detalhes Dedos
  fill(adjustColor(skin, -25), 45, 20, 2, 1);
  fill(adjustColor(skin, -25), 37, 52, 2, 1);
  fill(adjustColor(skin, -30), 45, 26, 1, 2);
  fill(adjustColor(skin, -30), 46, 26, 1, 2);
  fill(adjustColor(skin, -30), 37, 58, 1, 2);
  fill(adjustColor(skin, -30), 38, 58, 1, 2);

  // ==========================================
  // ROUPAS (Pixel Art Fiel)
  // ==========================================
  
  const style = config.clothingStyle || (gender === 'female' ? 'dress' : 't-shirt');

  if (style === 'dress') {
      // Vestido Refinado
      // Topo Vestido (Cor principal = userShirt)
      drawCuboid(userShirt, 16, 16, 8, 4, 12, 8); // Body Base
      // Mangas Curtas
      drawCuboid(userShirt, 40, 16, armW, 4, 4, 8, true); // Right Arm
      drawCuboid(userShirt, 32, 48, armW, 4, 4, 8, true); // Left Arm
      // Decote
      fill(skin, 23, 20, 2, 3);
      
      // Saia do vestido nas pernas (mesma cor principal do vestido!)
      drawCuboid(userShirt, 0, 16, 4, 4, 8, 8); // Right Leg
      drawCuboid(userShirt, 16, 48, 4, 4, 8, 8); // Left Leg
      
      // Detalhes do vestido (usando a cor secundária: userPants)
      // 1. Cinto na cintura
      fillTextured(userPants, 20, 26, 8, 2, 5, 0); // Frente
      fillTextured(userPants, 32, 26, 8, 2, 5, -10); // Costas
      fillTextured(userPants, 16, 26, 4, 2, 5, -5); // Lado dir
      fillTextured(userPants, 28, 26, 4, 2, 5, -5); // Lado esq
      fill(adjustColor(userPants, 30), 23, 26, 2, 2); // Fivela brilhante
      
      // 2. Barra da saia (trim) de 2 pixels
      // Perna Direita
      fill(userPants, 0, 26, 4, 2); // Right face
      fill(userPants, 4, 26, 4, 2); // Front face
      fill(userPants, 8, 26, 4, 2); // Left face
      fill(userPants, 12, 26, 4, 2); // Back face
      // Perna Esquerda
      fill(userPants, 16, 58, 4, 2); // Right face
      fill(userPants, 20, 58, 4, 2); // Front face
      fill(userPants, 24, 58, 4, 2); // Left face
      fill(userPants, 28, 58, 4, 2); // Back face
  } else if (style === 'tank-top') {
      // Regata e Shorts
      drawCuboid(userShirt, 16, 16, 8, 4, 12, 8); // Body
      
      // Decote cavado e costas
      fill(skin, 22, 17, 4, 5); // Frente
      fill(skin, 34, 17, 4, 5); // Costas
      // Alças da regata
      fill(userShirt, 20, 16, 2, 4); // Ombro dir
      fill(userShirt, 26, 16, 2, 4); // Ombro esq
      fill(userShirt, 32, 16, 2, 4); // Costas dir
      fill(userShirt, 38, 16, 2, 4); // Costas esq
      
      // Shorts
      drawCuboid(userPants, 0, 16, 4, 4, 6, 10); // Right Leg
      drawCuboid(userPants, 16, 48, 4, 4, 6, 10); // Left Leg
  } else if (style === 't-shirt') {
      // Camiseta e Calça
      drawCuboid(userShirt, 16, 16, 8, 4, 12, 8); // Body
      // Mangas Curtas
      drawCuboid(userShirt, 40, 16, armW, 4, 4, 8, true); // Right Arm
      drawCuboid(userShirt, 32, 48, armW, 4, 4, 8, true); // Left Arm
      
      // Calça
      drawCuboid(userPants, 0, 16, 4, 4, 12, 10); // Right Leg
      drawCuboid(userPants, 16, 48, 4, 4, 12, 10); // Left Leg
  } else if (style === 'pants-shirt') {
      // Manga Longa e Calça
      drawCuboid(userShirt, 16, 16, 8, 4, 12, 8); // Body
      // Mangas Longas (altura 9 para deixar 3 pixels para as mãos)
      drawCuboid(userShirt, 40, 16, armW, 4, 9, 8, true); // Right Arm
      drawCuboid(userShirt, 32, 48, armW, 4, 9, 8, true); // Left Arm
      
      // Calça
      drawCuboid(userPants, 0, 16, 4, 4, 12, 10); // Right Leg
      drawCuboid(userPants, 16, 48, 4, 4, 12, 10); // Left Leg
      
      if (gender === 'male') {
          // Cinto sobre a camisa
          const belt = '#2a1d13';
          const buckle = '#a0a0a0';
          fillTextured(belt, 20, 26, 8, 2, 5, 0); // Frente
          fillTextured(belt, 32, 26, 8, 2, 5, -10); // Costas
          fillTextured(belt, 16, 26, 4, 2, 5, -5); // Lado dir
          fillTextured(belt, 28, 26, 4, 2, 5, -5); // Lado esq
          fill(buckle, 23, 26, 2, 2);
          fill('#000000', 24, 26, 1, 1);
      }
  } else if (style === 'skirt') {
      // Saia com Blusa
      drawCuboid(userShirt, 16, 16, 8, 4, 12, 8); // Body Base
      drawCuboid(userShirt, 40, 16, armW, 4, 4, 8, true); // Mangas
      drawCuboid(userShirt, 32, 48, armW, 4, 4, 8, true); 
      // Saia
      drawCuboid(userPants, 0, 16, 4, 4, 8, 8); // Right Leg
      drawCuboid(userPants, 16, 48, 4, 4, 8, 8); // Left Leg
      // Pernas expostas
      drawCuboid(skin, 0, 24, 4, 4, 4, 5); // Right Leg inferior
      drawCuboid(skin, 16, 56, 4, 4, 4, 5); // Left Leg inferior
  } else if (style === 'crop-top') {
      // Cropped e Shorts
      drawCuboid(userShirt, 16, 16, 8, 4, 6, 8); // Body Base curto (6 pixels)
      drawCuboid(userShirt, 40, 16, armW, 4, 4, 8, true); // Mangas curtinhas
      drawCuboid(userShirt, 32, 48, armW, 4, 4, 8, true); 
      // Shorts
      drawCuboid(userPants, 0, 16, 4, 4, 6, 10); 
      drawCuboid(userPants, 16, 48, 4, 4, 6, 10); 
  } else if (style === 'overalls') {
      // Jardineira / Macacão (Shirt = blusa, Pants = macacão)
      drawCuboid(userShirt, 16, 16, 8, 4, 12, 8); // Blusa de baixo
      drawCuboid(userShirt, 40, 16, armW, 4, 5, 8, true); 
      drawCuboid(userShirt, 32, 48, armW, 4, 5, 8, true); 
      
      // Macacão (usando userPants)
      // Corpo do macacão
      fill(userPants, 20, 22, 8, 6); // Frente peito
      fill(userPants, 32, 22, 8, 6); // Costas
      fill(userPants, 16, 24, 4, 4); // Lados
      fill(userPants, 28, 24, 4, 4); 
      // Alças
      fill(userPants, 21, 16, 2, 6); // Alça dir frente
      fill(userPants, 25, 16, 2, 6); // Alça esq frente
      fill(userPants, 33, 16, 2, 6); // Alça dir costas
      fill(userPants, 37, 16, 2, 6); // Alça esq costas
      
      // Calça
      drawCuboid(userPants, 0, 16, 4, 4, 12, 10); 
      drawCuboid(userPants, 16, 48, 4, 4, 12, 10); 
      // Botões da jardineira
      fill('#f1c40f', 21, 21, 1, 1);
      fill('#f1c40f', 26, 21, 1, 1);
  } else if (style === 'suit') {
      // Terno / Traje Social (Shirt = camisa interna, Pants = terno externo)
      drawCuboid(userShirt, 16, 16, 8, 4, 12, 5); // Camisa
      // Paletó externo no Body
      fill(userPants, 20, 16, 3, 12); // Lado dir peito
      fill(userPants, 25, 16, 3, 12); // Lado esq peito
      fill(userPants, 32, 16, 8, 12); // Costas paletó
      fill(userPants, 16, 16, 4, 12); // Lados paletó
      fill(userPants, 28, 16, 4, 12); 
      // Gravata (vermelha escura por padrão ou da cor do sapato)
      fill('#8b0000', 23, 18, 2, 7); 
      
      // Mangas do terno
      drawCuboid(userPants, 40, 16, armW, 4, 11, 8, true); // Braço com terno, deixando 1px pra mão
      drawCuboid(userPants, 32, 48, armW, 4, 11, 8, true); 
      
      // Calça
      drawCuboid(userPants, 0, 16, 4, 4, 12, 10); 
      drawCuboid(userPants, 16, 48, 4, 4, 12, 10); 
  }

  // ==========================================
  // SAPATOS
  // ==========================================
  const shoeStyle = config.shoeStyle || (gender === 'female' ? 'flats' : 'sneakers');
  const shoes = config.shoeColor || (gender === 'female' ? '#3d2c23' : '#1a1a1a');

  const drawFootwear = (xOff: number, yOff: number) => {
      if (shoeStyle === 'sneakers') {
          // Tênis
          fillTextured(shoes, xOff, yOff + 12, 4, 4, 5, -5); // Right
          fillTextured(shoes, xOff + 4, yOff + 12, 4, 4, 5, 0); // Front
          fillTextured(shoes, xOff + 8, yOff + 12, 4, 4, 5, -5); // Left
          fillTextured(shoes, xOff + 12, yOff + 12, 4, 4, 5, -10); // Back
          fillTextured(shoes, xOff + 8, yOff, 4, 4, 5, -15); // Bottom
          fill('#ffffff', xOff + 5, yOff + 12, 2, 4); // Cadarço branco
          fill('#ffffff', xOff + 4, yOff + 15, 4, 1); // Sola branca
      } else if (shoeStyle === 'boots') {
          // Botas (mais altas)
          fillTextured(shoes, xOff, yOff + 9, 4, 7, 5, -5); 
          fillTextured(shoes, xOff + 4, yOff + 9, 4, 7, 5, 0); 
          fillTextured(shoes, xOff + 8, yOff + 9, 4, 7, 5, -5); 
          fillTextured(shoes, xOff + 12, yOff + 9, 4, 7, 5, -10); 
          fillTextured(shoes, xOff + 8, yOff, 4, 4, 5, -15); 
      } else if (shoeStyle === 'heels') {
          // Salto (cobre o fundo e calcanhar, deixa o peito do pé)
          fill(shoes, xOff + 4, yOff + 14, 4, 2); // Ponta frente
          fill(shoes, xOff, yOff + 13, 4, 3); // Lado direito
          fill(shoes, xOff + 8, yOff + 13, 4, 3); // Lado esq
          fill(shoes, xOff + 12, yOff + 12, 4, 4); // Calcanhar
          fill(shoes, xOff + 8, yOff, 4, 4); // Sola
          fill(skin, xOff + 4, yOff + 12, 4, 2); // Peito do pé exposto
      } else if (shoeStyle === 'sandals') {
          // Sandálias (só tiras)
          fill(shoes, xOff + 8, yOff, 4, 4); // Sola
          fill(shoes, xOff + 4, yOff + 14, 4, 1); // Tira frente
          fill(shoes, xOff, yOff + 14, 4, 1); // Tira lado dir
          fill(shoes, xOff + 8, yOff + 14, 4, 1); // Tira lado esq
          fill(shoes, xOff + 12, yOff + 14, 4, 1); // Tira costas
      } else {
          // Flats / Sapatilha
          fillTextured(shoes, xOff, yOff + 14, 4, 2, 5, -5); 
          fillTextured(shoes, xOff + 4, yOff + 14, 4, 2, 5, 0); 
          fillTextured(shoes, xOff + 8, yOff + 14, 4, 2, 5, -5); 
          fillTextured(shoes, xOff + 12, yOff + 14, 4, 2, 5, -10); 
          fillTextured(shoes, xOff + 8, yOff, 4, 4, 5, -15); 
      }
  };

  drawFootwear(0, 32); 
  drawFootwear(0, 48);

  // ==========================================
  // BOCA SUTIL E EXPRESSÕES
  // ==========================================
  const drawMouth = () => {
      const mc = config.lipstickColor || '#4a0404';
      if (config.mouthStyle === 'smile') {
          fill(mc, 10, 14, 1, 1); fill(mc, 11, 15, 2, 1); fill(mc, 13, 14, 1, 1);
      } else if (config.mouthStyle === 'sad') {
          fill(mc, 10, 15, 1, 1); fill(mc, 11, 14, 2, 1); fill(mc, 13, 15, 1, 1);
      } else if (config.mouthStyle === 'surprised') {
          fill(mc, 11, 14, 2, 2);
      } else if (config.mouthStyle === 'teeth') {
          fill(mc, 10, 14, 4, 2);
          fill('#ffffff', 11, 14, 2, 1); // Dentes
      } else if (config.mouthStyle === 'tongue') {
          fill(mc, 11, 14, 2, 1);
          fill('#e84393', 12, 15, 1, 1); // Língua
      } else {
          fill(mc, 11, 14, 2, 1); // Neutral
      }
  };

  // ==========================================
  // ROSTO E OLHOS (Pixel Perfect Nova Skin)
  // ==========================================
  // Franja Sombra
  fillTextured(skin, 8, 8, 8, 2, 5, -15);
  
  if (isBlinking) {
      // Olhos fechados (linha única)
      fill(eye, 9, 12, 2, 1);
      fill(eye, 13, 12, 2, 1);
  } else {
      const eyeStyle = config.eyeStyle || (gender === 'female' ? 'cute' : 'classic');

      if (eyeStyle === 'cute') {
          // Olho Fofo (Anime 2x3)
          // Olho Esquerdo
          fill(eye, 9, 10, 2, 3); // Base do olho
          fill('#ffffff', 10, 10, 1, 1); // Brilho superior
          fill('#ffffff', 9, 12, 1, 1); // Brilho inferior
          
          // Olho Direito
          fill(eye, 13, 10, 2, 3); // Base do olho
          fill('#ffffff', 14, 10, 1, 1); // Brilho superior
          fill('#ffffff', 13, 12, 1, 1); // Brilho inferior
          
          // Blush forte
          fill(adjustColor(skin, -20), 8, 13, 2, 1);
          fill(adjustColor(skin, -20), 14, 13, 2, 1);
      } else if (eyeStyle === 'oriental') {
          // Oriental Fino (Branco + Cor, olhar afiado)
          fill('#ffffff', 9, 11, 1, 1);
          fill(eye, 10, 11, 1, 1);
          
          fill(eye, 13, 11, 1, 1);
          fill('#ffffff', 14, 11, 1, 1);
      } else if (eyeStyle === 'oriental-2') {
          // Oriental Suave (Inclinado para baixo \ / )
          fill(eye, 9, 10, 1, 1);
          fill(eye, 10, 11, 1, 1);
          
          fill(eye, 13, 11, 1, 1);
          fill(eye, 14, 10, 1, 1);
      } else if (eyeStyle === 'oriental-3') {
          // Oriental Fechado (Sorrindo ^ ^ )
          fill(eye, 9, 11, 1, 1);
          fill(eye, 10, 10, 1, 1);
          
          fill(eye, 13, 10, 1, 1);
          fill(eye, 14, 11, 1, 1);
      } else if (eyeStyle === 'dot') {
          // Pontinho
          fill(eye, 10, 11, 1, 1);
          fill(eye, 13, 11, 1, 1);
      } else if (eyeStyle === 'tired') {
          // Cansado (com olheiras)
          fill('#ffffff', 9, 11, 1, 2);
          fill(eye, 10, 11, 1, 2);
          fill(adjustColor(skin, -20), 9, 13, 2, 1); // Olheira esquerda
          
          fill(eye, 13, 11, 1, 2);
          fill('#ffffff', 14, 11, 1, 2);
          fill(adjustColor(skin, -20), 13, 13, 2, 1); // Olheira direita
      } else {
          // Clássico
          fill('#ffffff', 9, 11, 1, 2);
          fill(eye, 10, 11, 1, 2);
          
          fill(eye, 13, 11, 1, 2);
          fill('#ffffff', 14, 11, 1, 2);
      }
  }

  drawMouth();

  // ==========================================
  // CABELO
  // ==========================================
  const effectiveStyle = config.hairStyle || (gender === 'female' ? 'long' : 'short');

  if (effectiveStyle === 'bald') {
      ctx.clearRect(32, 0, 64, 16); 
      // Não desenha a base do cabelo, então não precisa redesenhar a cabeça e os olhos!
      fillTextured(skin, 8, 8, 8, 2, 5, 0); // Removemos a sombra da franja na testa
  } else {
      // Base do cabelo
      fill(hair, 8, 0, 8, 8); // Top
      fill(hair, 0, 8, 8, 3); // Right
      fill(hair, 16, 8, 8, 3); // Left
      
      // Cabelo nas costas: Ajuste para ser mais curto se for masculino
      if (effectiveStyle === 'short' || effectiveStyle === 'spiky' || effectiveStyle === 'messy' || effectiveStyle === 'mohawk') {
          fill(hair, 24, 8, 8, 3); // Cabelo curto atrás (termina antes do pescoço)
      } else {
          fill(hair, 24, 8, 8, 6); // Cabelo cobrindo parte da nuca (long/ponytail)
      }

      // Hat Layer para volume capilar
      drawCuboid(hair, 32, 0, 8, 8, 8, 20); 
      ctx.clearRect(40, 11, 8, 5); // Limpa o rosto na camada Hat
      
      // Limpa a base (fundo) do Hat Layer para não parecer uma barba (x: 48 a 56, y: 0 a 8)
      ctx.clearRect(48, 0, 8, 8);
      
      // Se for cabelo curto, o Hat Layer não deve cobrir as laterais e costas até o pescoço
      if (effectiveStyle === 'short' || effectiveStyle === 'spiky' || effectiveStyle === 'messy') {
          ctx.clearRect(32, 12, 8, 4); // Limpa base do Right Face (Hat)
          ctx.clearRect(48, 12, 8, 4); // Limpa base do Left Face (Hat)
          ctx.clearRect(56, 12, 8, 4); // Limpa base do Back Face (Hat)
      }
      
      // Estilos de franja e volume do topo da cabeça
      if (effectiveStyle === 'spiky') {
          // Espetado: padrão xadrez no topo para dar efeito de pontas
          for (let i = 0; i < 8; i++) {
              for (let j = 0; j < 8; j++) {
                  if ((i + j) % 2 === 0) {
                      ctx.clearRect(40 + i, 0 + j, 1, 1);
                  }
              }
          }
          // Franja espetada (pontas irregulares para baixo)
          fill(hair, 40, 8, 8, 2);
          fill(hair, 41, 10, 1, 2);
          fill(hair, 43, 10, 2, 3);
          fill(hair, 46, 10, 1, 2);
      } else if (effectiveStyle === 'messy') {
          // Bagunçado: remove pedaços aleatórios do volume (Hat layer) para parecer despenteado
          ctx.clearRect(40, 1, 2, 2); // Topo
          ctx.clearRect(45, 5, 2, 1);
          ctx.clearRect(42, 3, 1, 2);
          ctx.clearRect(33, 8, 1, 2); // Lado direito
          ctx.clearRect(37, 10, 2, 2);
          ctx.clearRect(49, 9, 2, 1); // Lado esquerdo
          ctx.clearRect(53, 8, 1, 2);
          
          // Franja bagunçada
          fill(hair, 40, 8, 8, 2);
          fill(hair, 40, 10, 2, 1);
          fill(hair, 43, 10, 1, 2);
          fill(hair, 45, 10, 2, 2);
          fill(hair, 46, 12, 1, 1);
      } else {
          // Franja padrão (Curto, Longo, Rabo de cavalo)
          fill(hair, 40, 8, 8, 2); // Testa inteira (y=8,9)
          fill(hair, 40, 10, 1, 2); // Mecha esquerda (cai no x=8, fora do olho)
          fill(hair, 47, 10, 1, 2); // Mecha direita (cai no x=15, fora do olho)
          fill(hair, 43, 10, 2, 1); // Mecha central (cai no x=11,12, entre os olhos)
      }
  }

  // ==========================================
  // PÊLOS FACIAIS (Barba / Bigode)
  // ==========================================
  if (config.facialHair && config.facialHair !== 'none') {
      const facialHairColor = config.facialHairColor || adjustColor(hair, -15); // Usa a cor customizada ou um pouco mais escura que o cabelo
      
      // O Bigode vai aparecer para mustache, beard E goatee
      if (config.facialHair === 'mustache' || config.facialHair === 'beard' || config.facialHair === 'goatee') {
          // Bigode na Outer Layer (x = 10 + 32 = 42)
          fill(facialHairColor, 42, 13, 4, 1);
      }
      
      if (config.facialHair === 'goatee' || config.facialHair === 'beard') {
          // Cavanhaque contornando a boca na Outer Layer
          fill(facialHairColor, 42, 14, 1, 2); // Conector esquerdo
          fill(facialHairColor, 45, 14, 1, 2); // Conector direito
          fill(facialHairColor, 43, 15, 2, 1); // Base do queixo
          
          // Fundo do queixo (Bottom Face da Outer Layer, centro)
          fill(facialHairColor, 51, 0, 2, 2); 
      }
      
      if (config.facialHair === 'beard') {
          // Laterais da barba na Outer Layer (Front face)
          fill(facialHairColor, 40, 13, 2, 3); // Lado esquerdo do rosto
          fill(facialHairColor, 46, 13, 2, 3); // Lado direito do rosto
          // Linha do queixo nas laterais da cabeça (Right and Left faces na Outer Layer)
          fill(facialHairColor, 36, 14, 4, 2); // Right face (jaw)
          fill(facialHairColor, 48, 14, 4, 2); // Left face (jaw)
          // Fundo do queixo completo (Bottom face na Outer Layer)
          fill(facialHairColor, 48, 0, 8, 4); // Metade da frente do bottom face
      }
  }

  if (effectiveStyle === 'long') {
      fill(hair, 0, 11, 8, 5); // Laterais
      fill(hair, 16, 11, 8, 5); 
      fill(hair, 24, 14, 8, 2); // Nuca extra
      fillTextured(hair, 56, 10, 8, 6, 20, -10); // Volume extra atrás
      
      // Mechas caídas no peito
      fillTextured(hair, 20, 36, 2, 6, 20, +5); 
      fillTextured(hair, 26, 36, 2, 6, 20, +5); 
      // Cabelo escorrido nas costas
      fillTextured(adjustColor(hair, -15), 32, 36, 8, 8, 20, -10);
  } else if (effectiveStyle === 'ponytail') {
      fillTextured(hair, 56, 10, 8, 6, 20, -10); // Base do rabo de cavalo atrás
  } else if (effectiveStyle === 'bun') {
      // Coque (bun)
      fillTextured(hair, 56, 9, 4, 4, 20, -10); // Coque na parte de trás superior
      fill(config.hairTieColor || userShirt, 56, 11, 4, 1); // Laço pequeno no coque
  } else if (effectiveStyle === 'braid') {
      // Trança (braid)
      fillTextured(hair, 56, 10, 8, 4, 20, -10); // Base atrás
      fillTextured(adjustColor(hair, -15), 34, 36, 4, 10, 20, -10); // Trança caída (maior)
      fill(config.hairTieColor || userShirt, 34, 44, 4, 2); // Laço no fim da trança
  } else if (effectiveStyle === 'pigtails') {
      // Marias-chiquinhas (pigtails)
      fillTextured(hair, 48, 10, 2, 4, 20, -10); // Base esq
      fillTextured(hair, 62, 10, 2, 4, 20, -10); // Base dir
      // Caídas nos ombros
      fillTextured(adjustColor(hair, -15), 18, 36, 4, 8, 20, -5); 
      fillTextured(adjustColor(hair, -15), 26, 36, 4, 8, 20, -5); 
      fill(config.hairTieColor || userShirt, 18, 38, 4, 2); // Laços
      fill(config.hairTieColor || userShirt, 26, 38, 4, 2); 
  } else if (effectiveStyle === 'bob') {
      // Chanel (bob)
      fillTextured(hair, 0, 8, 8, 8, 20, 0); // Lado direito cheio até o ombro
      fillTextured(hair, 16, 8, 8, 8, 20, 0); // Lado esquerdo cheio até o ombro
      fillTextured(hair, 24, 8, 8, 8, 20, -10); // Costas cheio até o pescoço
      fill(skin, 0, 15, 8, 1); // Pontas retas revelando pescoço levemente
      fill(skin, 16, 15, 8, 1); 
  } else if (effectiveStyle === 'curly') {
      // Cacheado (curly) - muito volume
      ctx.clearRect(32, 0, 64, 16); 
      // Desenha o limite máximo do hat layer com muita textura
      drawCuboid(hair, 32, 0, 8, 8, 8, 30); 
      ctx.clearRect(40, 11, 8, 5); // Limpa o rosto
      ctx.clearRect(48, 0, 8, 8); // Limpa baixo
      // Franja cacheada volumosa
      fill(hair, 40, 7, 8, 4);
      fillTextured(adjustColor(hair, -10), 0, 8, 8, 8, 30, 0); // Lados cheios no inner layer
      fillTextured(adjustColor(hair, -10), 16, 8, 8, 8, 30, 0); 
      fillTextured(adjustColor(hair, -20), 24, 8, 8, 8, 30, -10); // Costas cheias no inner layer
  } else if (effectiveStyle === 'mohawk') {
      ctx.clearRect(32, 0, 64, 16); 
      fillTextured(hair, 43, 0, 2, 8, 20, 10); 
      fillTextured(hair, 59, 8, 2, 6, 20, -5); 
  }
  
  // ==========================================
  // ACESSÓRIOS DE CABELO / ROSTO
  // ==========================================
  if (config.glasses && config.glasses !== 'none') {
      const glColor = config.glassesColor || '#ff0000';
      if (config.glasses === 'classic') {
          fill(glColor, 40, 11, 8, 1); // Linha superior
          fill(glColor, 40, 11, 1, 3); // Lado esq
          fill(glColor, 47, 11, 1, 3); // Lado dir
          fill(glColor, 43, 11, 2, 1); // Ponte central
          // Vidro translúcido (no hat layer)
          ctx.fillStyle = 'rgba(0, 255, 255, 0.4)';
          ctx.fillRect(41, 12, 2, 2);
          ctx.fillRect(45, 12, 2, 2);
          // Armação inferior
          fill(glColor, 41, 13, 2, 1);
          fill(glColor, 45, 13, 2, 1);
      } else if (config.glasses === 'thin') {
          // Óculos de aste fina (Meia armação elegante)
          fill(glColor, 40, 11, 8, 1); // Armação apenas no topo
          ctx.fillStyle = 'rgba(0, 255, 255, 0.4)';
          ctx.fillRect(41, 12, 2, 2);
          ctx.fillRect(45, 12, 2, 2);
      } else if (config.glasses === 'round') {
          // Óculos redondos
          fill(glColor, 43, 11, 2, 1); // Ponte
          // Lente Esq (redonda)
          fill(glColor, 41, 10, 2, 1); // Topo
          fill(glColor, 41, 13, 2, 1); // Fundo
          fill(glColor, 40, 11, 1, 2); // Esq
          fill(glColor, 43, 11, 1, 2); // Dir
          // Lente Dir (redonda)
          fill(glColor, 45, 10, 2, 1); // Topo
          fill(glColor, 45, 13, 2, 1); // Fundo
          fill(glColor, 44, 11, 1, 2); // Esq
          fill(glColor, 47, 11, 1, 2); // Dir
          ctx.fillStyle = 'rgba(0, 255, 255, 0.4)';
          ctx.fillRect(41, 11, 2, 2);
          ctx.fillRect(45, 11, 2, 2);
      } else if (config.glasses === 'sunglasses') {
          // Óculos de sol
          fill(glColor, 40, 11, 8, 1); // Linha superior reta
          fill(glColor, 40, 11, 1, 2); // Lado esq
          fill(glColor, 47, 11, 1, 2); // Lado dir
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; // Lentes escuras
          ctx.fillRect(41, 11, 3, 2); // Lente esq larga
          ctx.fillRect(44, 11, 3, 2); // Lente dir larga
      }
  }

  const fallbackColor = config.accessoryColor || '#ff0000';
  const accsToRender = config.hairAccessories || [config.hairAccessory || 'none'];
  
  accsToRender.forEach((acc, index) => {
      const accColor = config.accessoryColors?.[index] || fallbackColor;

      if (acc === 'bow') {
          // Será renderizado em 3D no AvatarCharacter
      } else if (acc === 'flower') {
          // Será renderizado em 3D no AvatarCharacter
      } else if (acc === 'headband') {
          // Será renderizado em 3D no AvatarCharacter
      } else if (acc === 'glasses' && config.glasses !== 'classic') {
          // Compatibilidade para óculos salvos como hairAccessory
          const glColor = config.glassesColor || accColor;
          fill(glColor, 40, 11, 8, 1); 
          fill(glColor, 40, 11, 1, 3); 
          fill(glColor, 47, 11, 1, 3); 
          fill(glColor, 43, 11, 2, 1); 
          ctx.fillStyle = 'rgba(0, 255, 255, 0.4)';
          ctx.fillRect(41, 12, 2, 2);
          ctx.fillRect(45, 12, 2, 2);
          fill(glColor, 41, 13, 2, 1);
          fill(glColor, 45, 13, 2, 1);
      }
  });

  return canvas.toDataURL('image/png');
}
