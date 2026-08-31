import * as THREE from 'skinview3d/node_modules/three';

export async function generateVoxelItemFromImage(imageUrl: string, backColor?: string, curveX = 0, curveY = 0, split?: 'left' | 'right', thickness = 0.12): Promise<THREE.Group> {
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
        
        let finalPlaneWidth = planeWidth;
        if (split) finalPlaneWidth = planeWidth / 2;
        
        // Usamos mais segmentos (16x16) para que o plano tenha vértices suficientes para curvar suavemente
        const geometry = new THREE.PlaneGeometry(finalPlaneWidth, planeHeight, 16, 16);
        
        if (split) {
          const uvAttribute = geometry.attributes.uv;
          for (let i = 0; i < uvAttribute.count; i++) {
            const u = uvAttribute.getX(i);
            if (split === 'left') {
              uvAttribute.setX(i, u * 0.5);
            } else if (split === 'right') {
              uvAttribute.setX(i, u * 0.5 + 0.5);
            }
          }
        }
        
        if (curveX !== 0 || curveY !== 0) {
          const positionAttribute = geometry.attributes.position;
          for (let i = 0; i < positionAttribute.count; i++) {
            const x = positionAttribute.getX(i);
            const y = positionAttribute.getY(i);
            
            // Normalizar coordenadas para [-1, 1] baseado no centro do plano original
            let originalX = x;
            if (split === 'left') {
              originalX = x - planeWidth / 4;
            } else if (split === 'right') {
              originalX = x + planeWidth / 4;
            }
            
            const nx = originalX / (planeWidth / 2);
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
        
        // Fake 3D / Parallax. A espessura total desejada é `thickness`; as camadas são
        // empilhadas bem próximas (quase coladas) para dar volume SEM mostrar vãos/cópias.
        const thicknessVal = Math.max(0.03, thickness || 0.12);
        const layers = Math.max(40, Math.min(400, Math.round(thicknessVal / 0.002)));
        
        for (let i = 0; i < layers; i++) {
           // i = 0 é a camada mais de trás (zOffset negativo). i = layers-1 é a da frente (zOffset positivo).
           const isBackLayer = i === 0;
           const mat = isBackLayer ? backMaterial : material;
           
           const mesh = new THREE.Mesh(geometry, mat);
           // Offset Z para dar profundidade (de -thickness/2 até +thickness/2)
           const zOffset = layers > 1 ? (i / (layers - 1)) * thicknessVal - (thicknessVal / 2) : 0;
           
           // Posicionar para que o pivô (0,0) fique no canto inferior esquerdo, igual ao Voxel antigo
           mesh.position.set(planeWidth / 2, planeHeight / 2, zOffset);
           mesh.userData.isVoxelLayer = true;
           
           group.userData.is25D = true; // Flag for dynamic curve updates
           group.add(mesh);
        }
        
        // Guarda as peças para poder RE-EMPILHAR com outra espessura (setVoxelThickness)
        // sem precisar recarregar a textura.
        group.userData.voxelGeometry = geometry;
        group.userData.voxelMaterial = material;
        group.userData.voxelBackMaterial = backMaterial;
        group.userData.voxelPlaneWidth = planeWidth;
        group.userData.voxelPlaneHeight = planeHeight;
        group.userData.voxelThickness = thicknessVal;
        
        resolve(group);
      },
      undefined,
      (err) => reject(new Error("Falha ao carregar textura: " + err.message))
    );
  });
}

// Re-empilha as camadas com uma nova espessura (total local), mantendo-as quase coladas.
// Usa a geometria/materiais já cacheados — não recarrega a textura.
export function setVoxelThickness(group: THREE.Group, thickness: number) {
  if (!group || !group.userData.is25D) return;
  const geo = group.userData.voxelGeometry as THREE.PlaneGeometry | undefined;
  const mat = group.userData.voxelMaterial as THREE.Material | undefined;
  const backMat = group.userData.voxelBackMaterial as THREE.Material | undefined;
  if (!geo || !mat) return;

  // Remove SOMENTE as camadas voxel (preserva sprites/filhos extras)
  for (let i = group.children.length - 1; i >= 0; i--) {
    if ((group.children[i] as any).userData?.isVoxelLayer) {
      group.remove(group.children[i]);
    }
  }

  const thicknessVal = Math.max(0.03, thickness || 0.12);
  const layers = Math.max(40, Math.min(400, Math.round(thicknessVal / 0.002)));
  const w = group.userData.voxelPlaneWidth ?? 1.6;
  const h = group.userData.voxelPlaneHeight ?? 1.6;

  for (let i = 0; i < layers; i++) {
    const isBackLayer = i === 0;
    const mesh = new THREE.Mesh(geo, isBackLayer ? (backMat || mat) : mat);
    const zOffset = layers > 1 ? (i / (layers - 1)) * thicknessVal - (thicknessVal / 2) : 0;
    mesh.position.set(w / 2, h / 2, zOffset);
    mesh.userData.isVoxelLayer = true;
    group.add(mesh);
  }
  group.userData.voxelThickness = thicknessVal;
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
