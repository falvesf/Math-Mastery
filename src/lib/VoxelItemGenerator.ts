import * as THREE from 'skinview3d/node_modules/three';

export async function generateVoxelItemFromImage(imageUrl: string, backColor?: string, curveX = 0, curveY = 0): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    
    // Tratamento para garantir o carregamento do URL
    const finalUrl = (imageUrl.startsWith('http') || imageUrl.startsWith('data:') || imageUrl.startsWith('/'))
      ? imageUrl 
      : `https://${imageUrl}`;

    loader.load(
      finalUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        
        const imgWidth = texture.image.width;
        const imgHeight = texture.image.height;
        
        // Se a imagem for pixel art real (pequena), NearestFilter mantém nítido.
        // Se for alta resolução, LinearFilter suaviza serrilhados.
        const isPixelArt = imgWidth <= 64 && imgHeight <= 64;
        texture.minFilter = isPixelArt ? THREE.NearestFilter : THREE.LinearFilter;
        texture.magFilter = isPixelArt ? THREE.NearestFilter : THREE.LinearFilter;
        
        // Calcular o tamanho do plano mantendo a proporção original da imagem
        const maxDim = Math.max(imgWidth, imgHeight);
        const planeWidth = (imgWidth / maxDim) * 1.6;
        const planeHeight = (imgHeight / maxDim) * 1.6;
        
        // Usamos mais segmentos (16x16) para que o plano tenha vértices suficientes para curvar suavemente
        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight, 16, 16);
        
        if (curveX !== 0 || curveY !== 0) {
          const positionAttribute = geometry.attributes.position;
          for (let i = 0; i < positionAttribute.count; i++) {
            const x = positionAttribute.getX(i);
            const y = positionAttribute.getY(i);
            
            // Normalizar coordenadas para [-1, 1] baseado no centro do plano
            const nx = x / (planeWidth / 2);
            const ny = y / (planeHeight / 2);
            
            // Curva parabólica (quadrática): afunda as bordas de acordo com a força de curveX/curveY
            const zCurve = (nx * nx * curveX) + (ny * ny * curveY);
            
            positionAttribute.setZ(i, zCurve);
          }
          geometry.computeVertexNormals(); // Recalcular as normais para a luz refletir corretamente na curva
        }
        
        // Material padrão para a frente e recheio
        const material = new THREE.MeshStandardMaterial({
          map: texture,
          transparent: false,
          alphaTest: 0.5,
          side: THREE.DoubleSide,
          roughness: 1,
          metalness: 0
        });

        let backMaterial = material;

        // Se uma cor sólida para as costas foi definida, criamos uma silhueta via Canvas
        if (backColor) {
           const canvas = document.createElement('canvas');
           canvas.width = imgWidth;
           canvas.height = imgHeight;
           const ctx = canvas.getContext('2d');
           if (ctx) {
             // Desenha a imagem original
             ctx.drawImage(texture.image, 0, 0);
             // Troca para o modo que só pinta onde já existe pixel não-transparente
             ctx.globalCompositeOperation = 'source-atop';
             ctx.fillStyle = backColor;
             ctx.fillRect(0, 0, imgWidth, imgHeight);
             
             const solidTexture = new THREE.CanvasTexture(canvas);
             solidTexture.colorSpace = THREE.SRGBColorSpace;
             solidTexture.minFilter = isPixelArt ? THREE.NearestFilter : THREE.LinearFilter;
             solidTexture.magFilter = isPixelArt ? THREE.NearestFilter : THREE.LinearFilter;
             
             backMaterial = new THREE.MeshStandardMaterial({
               map: solidTexture,
               transparent: false,
               alphaTest: 0.5,
               side: THREE.DoubleSide,
               roughness: 1,
               metalness: 0
             });
           }
        }
        
        const group = new THREE.Group();
        
        // Fake 3D / Parallax
        const thickness = 0.12; // Espessura ligeiramente reduzida para juntar mais
        const layers = 60; // Densidade extremamente alta para sumir com os gaps e evitar invisibilidade lateral
        
        for (let i = 0; i < layers; i++) {
           // i = 0 é a camada mais de trás (zOffset negativo). i = layers-1 é a da frente (zOffset positivo).
           const isBackLayer = i === 0;
           const mat = isBackLayer ? backMaterial : material;
           
           const mesh = new THREE.Mesh(geometry, mat);
           // Offset Z para dar profundidade (de -thickness/2 até +thickness/2)
           const zOffset = layers > 1 ? (i / (layers - 1)) * thickness - (thickness / 2) : 0;
           
           // Posicionar para que o pivô (0,0) fique no canto inferior esquerdo, igual ao Voxel antigo
           mesh.position.set(planeWidth / 2, planeHeight / 2, zOffset);
           
           group.userData.is25D = true; // Flag for dynamic curve updates
           group.add(mesh);
        }
        
        resolve(group);
      },
      undefined,
      (err) => reject(new Error("Falha ao carregar textura: " + err.message))
    );
  });
}

export function updateVoxelCurve(group: THREE.Group, curveX: number, curveY: number) {
  if (!group || !group.userData.is25D || !group.children.length) return;
  
  const firstMesh = group.children[0] as THREE.Mesh;
  const geometry = firstMesh.geometry as THREE.BufferGeometry;
  
  if (geometry && geometry.attributes && geometry.attributes.position) {
    geometry.computeBoundingBox();
    const width = geometry.boundingBox!.max.x - geometry.boundingBox!.min.x;
    const height = geometry.boundingBox!.max.y - geometry.boundingBox!.min.y;
    
    const positionAttribute = geometry.attributes.position;
    for (let i = 0; i < positionAttribute.count; i++) {
      const x = positionAttribute.getX(i);
      const y = positionAttribute.getY(i);
      
      const nx = x / (width / 2);
      const ny = y / (height / 2);
      
      const zCurve = (nx * nx * curveX) + (ny * ny * curveY);
      positionAttribute.setZ(i, zCurve);
    }
    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
  }
}
