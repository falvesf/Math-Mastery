import * as THREE from 'skinview3d/node_modules/three';

export async function generateVoxelItemFromImage(imageUrl: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Cannot get 2d context for voxelization"));
        return;
      }
      
      // Limitar a resolução máxima para 32x32 por questões de performance (evitar lag com milhares de blocos)
      const MAX_SIZE = 32;
      let width = img.width;
      let height = img.height;
      if (width > MAX_SIZE || height > MAX_SIZE) {
        const ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Limpa os pixels da imagem para a memória do canvas (já redimensionada)
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      const group = new THREE.Group();
      
      // Para manter a espada sempre do mesmo tamanho físico no jogo (16 pixels de largura final),
      // calculamos o voxelSize dinamicamente com base na resolução real da imagem.
      const maxDim = Math.max(canvas.width, canvas.height);
      const voxelSize = 1.6 / maxDim; // 1.6 é o tamanho base que, multiplicado por 10, vira 16 blocos
      const halfSize = voxelSize / 2;
      
      // A espessura (Z) deve ser uma constante física para que NUNCA fique fina como papel,
      // mesmo que a imagem original seja de alta resolução. 0.15 equivale a 1.5 pixels de espessura de um item 16x16.
      const depth = 0.15;
      
      const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, depth);
      // Usar MeshStandardMaterial para que a iluminação gere sombras e volume (aparência 3D)
      const materials: Record<string, THREE.MeshStandardMaterial> = {};
      
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const index = (y * canvas.width + x) * 4;
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          const a = data[index + 3];
          
          if (a > 10) { // Somente pixels visíveis
            const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
            
            if (!materials[hex]) {
              materials[hex] = new THREE.MeshStandardMaterial({ 
                color: hex,
                roughness: 1, // Material fosco tipo Minecraft
                metalness: 0
              });
            }
            
            const voxel = new THREE.Mesh(geometry, materials[hex]);
            
            // Posicionar de modo que o pivô (0,0,0) fique no canto inferior esquerdo da imagem
            // (onde normalmente fica o cabo das espadas).
            // Y na imagem cresce para baixo, mas no Three.js cresce para cima.
            voxel.position.set(
              (x * voxelSize) + halfSize,
              ((canvas.height - y - 1) * voxelSize) + halfSize,
              0
            );
            
            group.add(voxel);
          }
        }
      }
      resolve(group);
    };
    
    img.onerror = () => reject(new Error("Falha ao carregar imagem para Voxel: " + imageUrl));
    
    // Tratamento para garantir o carregamento do URL
    const finalUrl = (imageUrl.startsWith('http') || imageUrl.startsWith('data:') || imageUrl.startsWith('/'))
      ? imageUrl 
      : `https://${imageUrl}`;
      
    img.src = finalUrl;
  });
}
