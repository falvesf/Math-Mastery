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
      variance = 10
  ) => {
      fillTextured(baseColor, x, y + d, d, h, variance, -5);       // Right
      fillTextured(baseColor, x + d, y + d, w, h, variance, 0);    // Front
      fillTextured(baseColor, x + d + w, y + d, d, h, variance, -5); // Left
      fillTextured(baseColor, x + d + w + d, y + d, w, h, variance, -10); // Back
      fillTextured(baseColor, x + d, y, w, d, variance, +10);      // Top
      fillTextured(baseColor, x + d + w, y, w, d, variance, -15);  // Bottom
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
  
  if (gender === 'male') {
      // Calça
      drawCuboid(userPants, 0, 16, 4, 4, 12, 10); // Right Leg
      drawCuboid(userPants, 16, 48, 4, 4, 12, 10); // Left Leg
      
      // Botas Pretas (Na Jacket Layer da Perna para sobressaliência)
      const shoes = '#1a1a1a';
      const drawShoe = (xOff: number, yOff: number) => {
          fillTextured(shoes, xOff, yOff + 12, 4, 4, 5, -5); // Right
          fillTextured(shoes, xOff + 4, yOff + 12, 4, 4, 5, 0); // Front
          fillTextured(shoes, xOff + 8, yOff + 12, 4, 4, 5, -5); // Left
          fillTextured(shoes, xOff + 12, yOff + 12, 4, 4, 5, -10); // Back
          fillTextured(shoes, xOff + 8, yOff, 4, 4, 5, -15); // Bottom
          fill('#333333', xOff + 5, yOff + 12, 2, 3); // Cadarço
      };
      drawShoe(0, 32); drawShoe(0, 48);

      // Camisa Base
      drawCuboid(userShirt, 16, 16, 8, 4, 12, 8); // Body
      // Mangas
      drawCuboid(userShirt, 40, 16, 4, 4, 8, 8); // Right Arm
      drawCuboid(userShirt, 32, 48, 4, 4, 8, 8); // Left Arm

      // Colete de Couro Marrom (Body Jacket)
      const vest = '#634b35';
      // Desenhamos na camada Jacket (Body 2 = x:16, y:32)
      // W=8, D=4, H=12
      // Frente (20,36, W8, H12)
      fillTextured(vest, 20, 36, 8, 10, 12, 0); // Colete vai até H10
      // Fazer decote V na frente
      ctx.clearRect(23, 36, 2, 4); 
      // Costas (32, 36, W8, H12)
      fillTextured(vest, 32, 36, 8, 10, 12, -10);
      // Lados
      fillTextured(vest, 16, 36, 4, 10, 12, -5); // Right
      fillTextured(vest, 28, 36, 4, 10, 12, -5); // Left
      // Topo dos ombros
      fillTextured(vest, 20, 32, 2, 4, 10, 5); // Ombro Dir
      fillTextured(vest, 26, 32, 2, 4, 10, 5); // Ombro Esq

      // Cinto (Desenhado sobre a camisa base, Y=26, H=2)
      const belt = '#2a1d13';
      const buckle = '#a0a0a0';
      fillTextured(belt, 20, 26, 8, 2, 5, 0); // Frente
      fillTextured(belt, 32, 26, 8, 2, 5, -10); // Costas
      fillTextured(belt, 16, 26, 4, 2, 5, -5); // Lado dir
      fillTextured(belt, 28, 26, 4, 2, 5, -5); // Lado esq
      // Fivela
      fill(buckle, 23, 26, 2, 2);
      fill('#000000', 24, 26, 1, 1); // Furo

  } else {
      // Vestido Feminino Refinado
      const dressDark = adjustColor(userShirt, -15);
      // Topo Vestido
      drawCuboid(userShirt, 16, 16, 8, 4, 12, 8); // Body Base
      // Decote
      fill(skin, 23, 20, 2, 3);
      
      // Saia do vestido nas pernas
      drawCuboid(userPants, 0, 16, 4, 4, 8, 8); // Right Leg
      drawCuboid(userPants, 16, 48, 4, 4, 8, 8); // Left Leg
      
      // Detalhes da saia (Jacket Layer pernas)
      fillTextured(dressDark, 4, 40, 4, 6, 8, 0); // Right Front
      fillTextured(dressDark, 4, 56, 4, 6, 8, 0); // Left Front
      
      // Sapatos Femininos
      const shoes = '#3d2c23';
      const drawShoe = (xOff: number, yOff: number) => {
          fillTextured(shoes, xOff, yOff + 14, 4, 2, 5, -5); // Right
          fillTextured(shoes, xOff + 4, yOff + 14, 4, 2, 5, 0); // Front
          fillTextured(shoes, xOff + 8, yOff + 14, 4, 2, 5, -5); // Left
          fillTextured(shoes, xOff + 12, yOff + 14, 4, 2, 5, -10); // Back
          fillTextured(shoes, xOff + 8, yOff, 4, 4, 5, -15); // Bottom
      };
      drawShoe(0, 32); drawShoe(0, 48);
      
      // Cinto no vestido
      const belt = '#ffffff';
      fillTextured(belt, 20, 25, 8, 1, 5, 0); // Frente
      fillTextured(belt, 32, 25, 8, 1, 5, -10); // Costas
      fill('#e8e8e8', 23, 25, 2, 1);
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
