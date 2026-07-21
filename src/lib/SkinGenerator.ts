import type { AvatarConfig, EquippedItem } from '../components/AvatarCharacter';

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

  // ==========================================
  // PELE BASE
  // ==========================================
  drawCuboid(skin, 0, 0, 8, 8, 8, 5); // Head
  drawCuboid(skin, 16, 16, 8, 4, 12, 5); // Body base
  drawCuboid(skin, 40, 16, 4, 4, 12, 5); // Right Arm
  drawCuboid(skin, 32, 48, 4, 4, 12, 5); // Left Arm
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
      drawCuboid(userShirt, 40, 16, 4, 4, 4, 8, true); // Right Arm
      drawCuboid(userShirt, 32, 48, 4, 4, 4, 8, true); // Left Arm
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
      drawCuboid(userShirt, 40, 16, 4, 4, 4, 8, true); // Right Arm
      drawCuboid(userShirt, 32, 48, 4, 4, 4, 8, true); // Left Arm
      
      // Calça
      drawCuboid(userPants, 0, 16, 4, 4, 12, 10); // Right Leg
      drawCuboid(userPants, 16, 48, 4, 4, 12, 10); // Left Leg
  } else {
      // Manga Longa e Calça
      drawCuboid(userShirt, 16, 16, 8, 4, 12, 8); // Body
      // Mangas Longas (altura 9 para deixar 3 pixels para as mãos)
      drawCuboid(userShirt, 40, 16, 4, 4, 9, 8, true); // Right Arm
      drawCuboid(userShirt, 32, 48, 4, 4, 9, 8, true); // Left Arm
      
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
  }

  // ==========================================
  // SAPATOS
  // ==========================================
  if (gender === 'male') {
      const shoes = '#1a1a1a'; // Tenis preto
      const drawShoe = (xOff: number, yOff: number) => {
          fillTextured(shoes, xOff, yOff + 12, 4, 4, 5, -5); // Right
          fillTextured(shoes, xOff + 4, yOff + 12, 4, 4, 5, 0); // Front
          fillTextured(shoes, xOff + 8, yOff + 12, 4, 4, 5, -5); // Left
          fillTextured(shoes, xOff + 12, yOff + 12, 4, 4, 5, -10); // Back
          fillTextured(shoes, xOff + 8, yOff, 4, 4, 5, -15); // Bottom
          fill('#333333', xOff + 5, yOff + 12, 2, 3); // Cadarço
      };
      drawShoe(0, 32); drawShoe(0, 48);
  } else {
      const shoes = '#3d2c23'; // Sapato feminino delicado
      const drawShoe = (xOff: number, yOff: number) => {
          fillTextured(shoes, xOff, yOff + 14, 4, 2, 5, -5); // Right
          fillTextured(shoes, xOff + 4, yOff + 14, 4, 2, 5, 0); // Front
          fillTextured(shoes, xOff + 8, yOff + 14, 4, 2, 5, -5); // Left
          fillTextured(shoes, xOff + 12, yOff + 14, 4, 2, 5, -10); // Back
          fillTextured(shoes, xOff + 8, yOff, 4, 4, 5, -15); // Bottom
      };
      drawShoe(0, 32); drawShoe(0, 48);
  }

  // ==========================================
  // BOCA SUTIL E EXPRESSÕES
  // ==========================================
  const drawMouth = () => {
      const mc = '#4a0404';
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
  } else if (gender === 'female') {
      // Olho 2x2 fofo (W W / B W)
      fill('#ffffff', 9, 11, 2, 2);
      fill(eye, 10, 11, 1, 2);
      fill('#ffffff', 13, 11, 2, 2);
      fill(eye, 13, 11, 1, 2); // Iris na esquerda do olho direito
      fill(adjustColor(skin, -10) + '80', 8, 13, 1, 1); // Blush
      fill(adjustColor(skin, -10) + '80', 15, 13, 1, 1);
  } else {
      // Olhos exatos da referência: 2x2.
      // Olho Direito (personagem): W B no topo, W B embaixo. Ou seja, x=9 é branco, x=10 é preto/cor.
      fill('#ffffff', 9, 11, 1, 2);
      fill(eye, 10, 11, 1, 2);
      // Olho Esquerdo (personagem): B W no topo. x=13 é preto, x=14 é branco.
      fill(eye, 13, 11, 1, 2);
      fill('#ffffff', 14, 11, 1, 2);
  }

  drawMouth();

  // ==========================================
  // CABELO
  // ==========================================
  const effectiveStyle = config.hairStyle || (gender === 'female' ? 'long' : 'short');

  // Base
  fill(hair, 8, 0, 8, 8); // Top
  fill(hair, 0, 8, 8, 3); // Right
  fill(hair, 16, 8, 8, 3); // Left
  
  // Cabelo nas costas: Ajuste para ser mais curto se for masculino
  if (effectiveStyle === 'short' || effectiveStyle === 'spiky' || effectiveStyle === 'messy' || effectiveStyle === 'mohawk') {
      fill(hair, 24, 8, 8, 3); // Cabelo curto atrás (termina antes do pescoço)
  } else {
      fill(hair, 24, 8, 8, 6); // Cabelo cobrindo parte da nuca (long/ponytail)
  }
  
  if (effectiveStyle === 'bald') {
      ctx.clearRect(32, 0, 64, 16); 
      drawCuboid(skin, 0, 0, 8, 8, 8, 5);
      fillTextured(skin, 8, 8, 8, 2, 5, 0); // Sem sombra da franja
      
      if (isBlinking) {
          fill(eye, 9, 12, 2, 1); fill(eye, 13, 12, 2, 1);
      } else if (gender === 'female') {
          fill('#ffffff', 9, 11, 2, 2); fill(eye, 10, 11, 1, 2);
          fill('#ffffff', 13, 11, 2, 2); fill(eye, 13, 11, 1, 2);
      } else {
          fill('#ffffff', 9, 11, 1, 2); fill(eye, 10, 11, 1, 2);
          fill(eye, 13, 11, 1, 2); fill('#ffffff', 14, 11, 1, 2);
      }
      drawMouth();
  } else {
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
      
      // Franja
      fill(hair, 40, 8, 8, 2); 
      fill(hair, 40, 10, 2, 2); 
      fill(hair, 44, 10, 3, 1); 
      fill(hair, 46, 11, 1, 1);
  }

  // ==========================================
  // PÊLOS FACIAIS (Barba / Bigode)
  // ==========================================
  if (config.facialHair && config.facialHair !== 'none') {
      const facialHairColor = adjustColor(hair, -15); // Cor um pouco mais escura que o cabelo
      if (config.facialHair === 'mustache' || config.facialHair === 'beard') {
          // Bigode
          fill(facialHairColor, 10, 13, 4, 1);
      }
      if (config.facialHair === 'goatee' || config.facialHair === 'beard') {
          // Cavanhaque / Queixo
          fill(facialHairColor, 10, 15, 4, 1);
          fill(facialHairColor, 11, 16, 2, 1);
      }
      if (config.facialHair === 'beard') {
          // Laterais da barba
          fill(facialHairColor, 8, 13, 2, 3); // Lado esquerdo do rosto
          fill(facialHairColor, 14, 13, 2, 3); // Lado direito do rosto
          // Linha do queixo nas laterais da cabeça (Right and Left faces)
          fill(facialHairColor, 4, 14, 4, 2); // Right face (jaw)
          fill(facialHairColor, 16, 14, 4, 2); // Left face (jaw)
          // Fundo do queixo (Bottom face)
          fill(facialHairColor, 16, 0, 8, 4); // Metade da frente do bottom face
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
      // Rabo de cavalo caindo nas costas (centro)
      fillTextured(adjustColor(hair, -10), 34, 36, 4, 8, 20, -10); 
      // Laço de cabelo
      fill(userShirt, 34, 36, 4, 2);
  } else if (effectiveStyle === 'mohawk') {
      ctx.clearRect(32, 0, 64, 16); 
      fillTextured(hair, 43, 0, 2, 8, 20, 10); 
      fillTextured(hair, 59, 8, 2, 6, 20, -5); 
  }
  
  return canvas.toDataURL('image/png');
}
