import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Cache global para evitar limite de contextos WebGL e evitar crash (rostinho triste) do navegador
let sharedRenderer: THREE.WebGLRenderer | null = null;

interface GlbMeshExtractorModalProps {
  glbUrl: string;
  currentExtractedName: string | null;
  onSelect: (meshName: string | null) => void;
  onClose: () => void;
}

export interface MeshNodeInfo {
  name: string;
  isGroup: boolean;
  isPrimary: boolean;
  meshCount: number;
  friendlyName?: string;
  parentName?: string;
}

const ROOT_WRAPPERS = new Set([
  'sketchfab_model', 'root', 'gltf_scenerootnode', 'scene', 'osg_scene',
  'sketchfab_scene', 'world', 'rootnode', 'model'
]);

const getFriendlyName = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('serrilhada') || n.includes('saw')) return 'Espada Serrilhada';
  if (n.includes('katana')) return 'Katana Mestre';
  if (n.includes('foice') || n.includes('scythe')) return 'Foice Curva';
  if (n.includes('vermelha') || n.includes('dark') || n.includes('sombria')) return 'Espada Sombria Escarlate';
  if (n.includes('diamond') || n.includes('diamante')) return 'Espada de Diamante';
  if (n.includes('netherite')) return 'Espada de Netherite';
  if (n.includes('gold') || n.includes('ouro')) return 'Espada de Ouro';
  if (n.includes('iron') || n.includes('ferro')) return 'Espada de Ferro';
  if (n.includes('copper') || n.includes('cobre')) return 'Espada de Cobre';
  if (n.includes('stone') || n.includes('pedra')) return 'Espada de Pedra';
  if (n.includes('wood') || n.includes('madeira')) return 'Espada de Madeira';
  if (n.includes('helmet') || n.includes('capacete')) return 'Capacete';
  if (n.includes('chestplate') || n.includes('peitoral')) return 'Peitoral';
  if (n.includes('legging') || n.includes('calca')) return 'Calça';
  if (n.includes('boot') || n.includes('bota')) return 'Botas';
  if (n.includes('shield') || n.includes('escudo')) return 'Escudo';
  if (n.includes('bow') || n.includes('arco')) return 'Arco';
  return '';
};

export default function GlbMeshExtractorModal({ glbUrl, currentExtractedName, onSelect, onClose }: GlbMeshExtractorModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('Inicializando motor 3D...');
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [meshes, setMeshes] = useState<MeshNodeInfo[]>([]);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(
    new Set(currentExtractedName ? currentExtractedName.split(',').map(s => s.trim()).filter(Boolean) : [])
  );
  const selectedNamesArr = [...selectedNames];
  const selectedName = selectedNamesArr[0] || null;

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'primary' | 'all'>('primary');
  const [clickMode, setClickMode] = useState<'group' | 'mesh'>('group');
  const clickModeRef = useRef<'group' | 'mesh'>('group');
  clickModeRef.current = clickMode;
  const primaryNamesRef = useRef<Set<string>>(new Set());

  const toggleMesh = (name: string) => {
    setSelectedNames(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  
  const highlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0x854d0e,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.9,
    wireframe: true
  });
  
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());

  // --- REPAIR TOOLS LOGIC ---

  const buildMeshTree = (rootGltf: THREE.Object3D) => {
    const countDescendants = (obj: THREE.Object3D): number => {
      let count = 0;
      obj.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) count++;
      });
      return count;
    };

    let branchRoot: THREE.Object3D = rootGltf;
    while (
      branchRoot.children.length === 1 &&
      (branchRoot === rootGltf || ROOT_WRAPPERS.has(branchRoot.name.toLowerCase()))
    ) {
      branchRoot = branchRoot.children[0];
    }

    let topCandidates: THREE.Object3D[] = [];
    if (ROOT_WRAPPERS.has(branchRoot.name.toLowerCase()) || branchRoot === rootGltf) {
      topCandidates = branchRoot.children.filter(c => countDescendants(c) > 0);
    } else {
      topCandidates = branchRoot.children.length > 0
        ? branchRoot.children.filter(c => countDescendants(c) > 0)
        : [branchRoot];
    }

    const primarySet = new Set<string>();
    topCandidates.forEach(c => {
      if (c.name) primarySet.add(c.name);
    });
    primaryNamesRef.current = primarySet;

    const foundNodes: MeshNodeInfo[] = [];
    const seenNames = new Set<string>();

    topCandidates.forEach((node) => {
      if (!node.name) return;
      const mc = countDescendants(node);
      const isGrp = (node.children && node.children.length > 0 && !(node as THREE.Mesh).isMesh);
      seenNames.add(node.name);
      foundNodes.push({
        name: node.name,
        isGroup: isGrp,
        isPrimary: true,
        meshCount: (node as THREE.Mesh).isMesh ? 1 : mc,
        friendlyName: getFriendlyName(node.name)
      });
    });

    let unnamedMeshCount = 0;
    let unnamedGroupCount = 0;

    rootGltf.traverse((node) => {
      if (node === rootGltf) return;
      const lowerName = (node.name || '').toLowerCase();
      if (ROOT_WRAPPERS.has(lowerName)) return;

      const isMesh = (node as THREE.Mesh).isMesh === true;
      const hasChildren = node.children && node.children.length > 0;

      if (!node.name) {
        if (isMesh) {
          unnamedMeshCount++;
          node.name = `Mesh_${unnamedMeshCount}`;
        } else if (hasChildren) {
          unnamedGroupCount++;
          node.name = `Group_${unnamedGroupCount}`;
        }
      }

      if (seenNames.has(node.name)) return;

      const mc = isMesh ? 1 : countDescendants(node);
      if (mc === 0) return;

      seenNames.add(node.name);
      foundNodes.push({
        name: node.name,
        isGroup: !isMesh && hasChildren,
        isPrimary: false,
        meshCount: mc,
        friendlyName: getFriendlyName(node.name),
        parentName: node.parent?.name && !ROOT_WRAPPERS.has(node.parent.name.toLowerCase()) ? node.parent.name : undefined
      });
    });

    const totalMeshCount = Array.from(originalMaterialsRef.current.keys()).length;
    const primaryCount = foundNodes.filter(n => n.isPrimary).length;
    const box = new THREE.Box3().setFromObject(rootGltf);
    const size = box.getSize(new THREE.Vector3());
    setDebugInfo(`Raio-X: ${totalMeshCount} Malhas, ${primaryCount > 0 ? `${primaryCount} Objetos Principais` : `${foundNodes.length} Peças`}. Tamanho: ${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`);

    setMeshes(foundNodes);
    if (primaryCount > 0) {
      setActiveTab('primary');
    } else {
      setActiveTab('all');
    }
  };

  const handleSplitDisconnectedMeshes = () => {
    if (!sceneRef.current) return;

    let rootModel: THREE.Object3D | null = null;
    sceneRef.current.traverse((node) => {
      if (node.userData?.isRootGltf) rootModel = node;
    });
    if (!rootModel) return;

    let totalSplits = 0;
    const meshesToSplit: THREE.Mesh[] = [];

    (rootModel as THREE.Object3D).traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        meshesToSplit.push(node as THREE.Mesh);
      }
    });

    meshesToSplit.forEach((mesh) => {
      const geo = mesh.geometry;
      if (!geo || !geo.attributes.position) return;

      const posAttr = geo.attributes.position;
      const normAttr = geo.attributes.normal;
      const uvAttr = geo.attributes.uv;
      const vertCount = posAttr.count;

      let indices: Uint32Array | Uint16Array;
      if (geo.index) {
        indices = geo.index.array as any;
      } else {
        indices = new Uint32Array(vertCount);
        for (let i = 0; i < vertCount; i++) indices[i] = i;
      }

      if (indices.length < 3) return;

      const parent = new Int32Array(vertCount);
      for (let i = 0; i < vertCount; i++) parent[i] = i;
      function find(i: number) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
      function union(i: number, j: number) { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; }

      for (let i = 0; i < indices.length; i += 3) {
        union(indices[i], indices[i + 1]);
        union(indices[i + 1], indices[i + 2]);
      }

      const posMap = new Map<string, number>();
      for (let i = 0; i < vertCount; i++) {
        const key = `${posAttr.getX(i).toFixed(3)}_${posAttr.getY(i).toFixed(3)}_${posAttr.getZ(i).toFixed(3)}`;
        if (posMap.has(key)) {
          union(i, posMap.get(key)!);
        } else {
          posMap.set(key, i);
        }
      }

      const islandsMap = new Map<number, number[]>();
      for (let i = 0; i < indices.length; i += 3) {
        const root = find(indices[i]);
        if (!islandsMap.has(root)) islandsMap.set(root, []);
        islandsMap.get(root)!.push(indices[i], indices[i + 1], indices[i + 2]);
      }

      if (islandsMap.size <= 1) return;

      const islandClusters = Array.from(islandsMap.values());
      islandClusters.sort((a, b) => {
        let minA = Infinity, minB = Infinity;
        for (const idx of a) minA = Math.min(minA, posAttr.getX(idx));
        for (const idx of b) minB = Math.min(minB, posAttr.getX(idx));
        return minA - minB;
      });

      const parentGroup = new THREE.Group();
      parentGroup.name = mesh.name ? `${mesh.name}_Grupo` : 'Grupo_Separado';
      parentGroup.position.copy(mesh.position);
      parentGroup.rotation.copy(mesh.rotation);
      parentGroup.scale.copy(mesh.scale);

      islandClusters.forEach((clusterIndices, clusterIdx) => {
        const newGeo = new THREE.BufferGeometry();
        const oldToNew = new Map<number, number>();
        const newPos: number[] = [];
        const newNorm: number[] = [];
        const newUv: number[] = [];
        const newIdx: number[] = [];

        for (let k = 0; k < clusterIndices.length; k++) {
          const oldV = clusterIndices[k];
          if (!oldToNew.has(oldV)) {
            const nIdx = newPos.length / 3;
            oldToNew.set(oldV, nIdx);
            newPos.push(posAttr.getX(oldV), posAttr.getY(oldV), posAttr.getZ(oldV));
            if (normAttr) newNorm.push(normAttr.getX(oldV), normAttr.getY(oldV), normAttr.getZ(oldV));
            if (uvAttr) newUv.push(uvAttr.getX(oldV), uvAttr.getY(oldV));
          }
          newIdx.push(oldToNew.get(oldV)!);
        }

        newGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
        if (normAttr) newGeo.setAttribute('normal', new THREE.Float32BufferAttribute(newNorm, 3));
        if (uvAttr) newGeo.setAttribute('uv', new THREE.Float32BufferAttribute(newUv, 2));
        newGeo.setIndex(newIdx);

        const pieceName = `Espada_${clusterIdx + 1}`;
        const newMesh = new THREE.Mesh(newGeo, mesh.material);
        newMesh.name = pieceName;
        parentGroup.add(newMesh);
        originalMaterialsRef.current.set(newMesh, mesh.material);
      });

      originalMaterialsRef.current.delete(mesh);
      mesh.parent?.add(parentGroup);
      mesh.removeFromParent();
      totalSplits += islandClusters.length;
    });

    if (totalSplits === 0) {
      alert('Esta malha já é uma geometria contínua única (não foram encontradas peças desconectadas no espaço 3D).');
      return;
    }

    buildMeshTree(rootModel);
    alert(`✂️ Sucesso! O modelo foi analisado e separado em ${totalSplits} peças independentes!\n\nAgora você pode clicar e selecionar cada uma individualmente.`);
  };
  
  const handleDeleteMesh = () => {
    if (selectedNames.size === 0 || !sceneRef.current) return;
    
    sceneRef.current.traverse((node) => {
      if (selectedNames.has(node.name)) {
        node.removeFromParent();
      }
    });
    setMeshes(m => m.filter(x => !selectedNames.has(x.name)));
    setSelectedNames(new Set());
  };

  const handleDownloadTexture = () => {
    if (!selectedName || !sceneRef.current) return;
    
    let targetMesh: THREE.Mesh | null = null;
    let fallbackMesh: THREE.Mesh | null = null;
    
    sceneRef.current.traverse((node) => {
      if (node.name === selectedName) {
        node.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (!fallbackMesh) fallbackMesh = mesh;
            
            const mat = mesh.material;
            const hasMap = Array.isArray(mat) ? mat.some(m => (m as any).map) : (mat as any).map;
            
            if (hasMap && !targetMesh) {
              targetMesh = mesh;
            }
          }
        });
      }
    });
    
    if (!targetMesh && fallbackMesh) {
       targetMesh = fallbackMesh;
    }
    
    if (!targetMesh) return alert("Nenhuma malha 3D encontrada na seleção para extrair a textura.");
    
    let actualMaterial: THREE.MeshStandardMaterial | null = null;
    if (Array.isArray(targetMesh.material)) {
      actualMaterial = (targetMesh.material.find(m => (m as THREE.MeshStandardMaterial).map) || targetMesh.material[0]) as THREE.MeshStandardMaterial;
    } else {
      actualMaterial = targetMesh.material as THREE.MeshStandardMaterial;
    }

    if (!actualMaterial || !actualMaterial.map || !actualMaterial.map.image) {
      return alert("Esta peça não possui uma imagem de textura.\n\nIsso significa que ela foi colorida no Blockbench usando apenas cores sólidas (Vertex Colors) e não possui um arquivo de imagem associado, ou as texturas se perderam na exportação.\n\nSe você quiser apenas apagar partes sobressalentes, tente usar o botão 'Deletar Peça Selecionada'.");
    }
    
    const image = actualMaterial.map.image as any;
    const canvas = document.createElement('canvas');
    canvas.width = image.width || image.videoWidth;
    canvas.height = image.height || image.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Draw the texture to canvas
    ctx.drawImage(image, 0, 0);
    
    // Download it
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${selectedName}_texture.png`;
    link.href = dataUrl;
    link.click();
  };

  const handleUploadTexture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedName || !sceneRef.current) return;
    
    const url = URL.createObjectURL(file);
    const textureLoader = new THREE.TextureLoader();
    
    textureLoader.load(url, (newTexture) => {
      // Minecraft pixel art optimizations
      newTexture.magFilter = THREE.NearestFilter;
      newTexture.minFilter = THREE.NearestFilter;
      newTexture.colorSpace = THREE.SRGBColorSpace;
      newTexture.flipY = false; // GLTF uses flipped UVs by default
      
      sceneRef.current?.traverse((node) => {
        if (node.name === selectedName) {
          node.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              const originalMat = originalMaterialsRef.current.get(mesh) || mesh.material;
              
              if (Array.isArray(originalMat)) {
                originalMat.forEach(m => {
                  const stdMat = m as THREE.MeshStandardMaterial;
                  stdMat.map = newTexture;
                  stdMat.needsUpdate = true;
                });
              } else {
                const stdMat = originalMat as THREE.MeshStandardMaterial;
                stdMat.map = newTexture;
                stdMat.needsUpdate = true;
              }
              
              originalMaterialsRef.current.set(mesh, originalMat);
            }
          });
        }
      });
    });
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExportGlb = () => {
    if (!sceneRef.current) return;
    
    setLoading(true);
    setLoadingText("Empacotando e exportando GLB...");
    
    const exporter = new GLTFExporter();
    
    // We only want to export the loaded GLTF model, not the lights or debug helpers
    let rootToExport: THREE.Object3D | null = null;
    sceneRef.current.traverse((node) => {
      if (node.userData?.isRootGltf) {
        rootToExport = node;
      }
    });
    
    if (!rootToExport) {
      setLoading(false);
      return alert("Erro: Não foi possível encontrar a raiz do modelo para exportar.");
    }
    
    // Temporarily restore original materials before exporting (remove yellow highlight)
    rootToExport.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        if (originalMaterialsRef.current.has(mesh)) {
          mesh.material = originalMaterialsRef.current.get(mesh)!;
        }
      }
    });
    
    exporter.parse(
      rootToExport,
      (gltfData) => {
        const blob = new Blob([gltfData as ArrayBuffer], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = 'repaired_model.glb';
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        
        // Re-apply highlight to selected mesh
        if (selectedName) {
           rootToExport?.traverse((node) => {
             if (node.name === selectedName && (node as THREE.Mesh).isMesh) {
                (node as THREE.Mesh).material = highlightMaterial;
             }
           });
        }
        
        setLoading(false);
      },
      (error) => {
        console.error('Erro ao exportar:', error);
        alert("Ocorreu um erro ao exportar o modelo.");
        setLoading(false);
      },
      { binary: true }
    );
  };
  
  const handleExportFusedGlb = () => {
    if (selectedNames.size === 0 || !sceneRef.current) return;

    let rootToExport: THREE.Object3D | null = null;
    sceneRef.current.traverse((node) => {
      if (node.userData?.isRootGltf) rootToExport = node;
    });
    if (!rootToExport) {
      return alert('Erro: Não foi possível encontrar a raiz do modelo para exportar.');
    }

    // Restaura materiais originais (remove o highlight amarelo)
    rootToExport.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        if (originalMaterialsRef.current.has(mesh)) {
          mesh.material = originalMaterialsRef.current.get(mesh)!;
        }
      }
    });

    // Coleta os nós que ficam: selecionadas + ancestrais + TODOS os OSSOS (bones)
    // e suas cadeias. Preservar os ossos é vital: malhas com skinning (esqueleto)
    // referenciam os ossos por índice; se algum sumir, o GLTFLoader quebra com
    // "Cannot set properties of undefined (setting 'isBone')" ao carregar o GLB.
    const keepSet = new Set(selectedNames);
    const toKeep = new Set<THREE.Object3D>();
    rootToExport.traverse((node) => {
      const isBoneNode = (node as any).isBone === true || node.type === 'Bone';
      if (keepSet.has(node.name) || isBoneNode) {
        let cur: THREE.Object3D | null = node;
        while (cur) { toKeep.add(cur); cur = cur.parent; }
        // Mantém todos os filhos e descendentes da peça selecionada
        node.traverse((d) => toKeep.add(d));
      }
    });

    // Nós a remover = filhos que não estão em toKeep
    const toRemove: THREE.Object3D[] = [];
    rootToExport.traverse((node) => {
      node.children.forEach((c) => { if (!toKeep.has(c)) toRemove.push(c); });
    });

    // Remove temporariamente as não-selecionadas (exporta o MESMO caminho da
    // exportação completa, que o sistema reconhece)
    const parents = new Map<THREE.Object3D, THREE.Object3D | null>();
    toRemove.forEach((n) => { parents.set(n, n.parent); n.removeFromParent(); });

    setLoading(true);
    setLoadingText('Fundindo malhas selecionadas e exportando GLB...');
    const exporter = new GLTFExporter();
    exporter.parse(
      rootToExport,
      (gltfData) => {
        const blob = new Blob([gltfData as ArrayBuffer], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = 'fused_meshes.glb';
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        toRemove.forEach((n) => { const p = parents.get(n); if (p) p.add(n); });
        setLoading(false);
      },
      (error) => {
        toRemove.forEach((n) => { const p = parents.get(n); if (p) p.add(n); });
        console.error('Erro ao exportar fundido:', error);
        alert('Ocorreu um erro ao exportar o modelo fundido.');
        setLoading(false);
      },
      { binary: true }
    );

    // Re-aplica o highlight nas malhas selecionadas
    rootToExport.traverse((node) => {
      if ((node as THREE.Mesh).isMesh && selectedNames.has(node.name)) {
        (node as THREE.Mesh).material = highlightMaterial;
      }
    });
  };
  
  // --- END REPAIR TOOLS LOGIC ---

  useEffect(() => {
    if (!containerRef.current) return;
    
    let isMounted = true;
    
    // Setup Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;
    
    // Setup Camera
    const width = containerRef.current.clientWidth || 400;
    const height = containerRef.current.clientHeight || 400;
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.001, 10000);
    camera.position.set(0, 5, 20);
    cameraRef.current = camera;
    
    // Setup Renderer (usando o cache global)
    if (!sharedRenderer) {
      sharedRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      sharedRenderer.setPixelRatio(window.devicePixelRatio);
      sharedRenderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    const renderer = sharedRenderer;
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Setup Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;
    
    // Removing debug cube since rendering is confirmed working
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 1);
    dirLight2.position.set(-5, -5, -7.5);
    scene.add(dirLight2);

    // Load GLB
    const loader = new GLTFLoader();
    
    let safeUrl = glbUrl.replace(/\\/g, '/');
    if (!safeUrl.startsWith('http') && !safeUrl.startsWith('/')) {
      if (!safeUrl.startsWith('models/')) safeUrl = `models/${safeUrl}`;
      safeUrl = `/${safeUrl}`;
    } else if (safeUrl.startsWith('/') && !safeUrl.startsWith('/models/')) {
      safeUrl = `/models${safeUrl}`;
    }
    if (safeUrl.startsWith('/')) {
      safeUrl = import.meta.env.BASE_URL + safeUrl.substring(1);
    }
    
    // Tratamento vital: Codificar espaços e caracteres especiais no URL para requisições HTTP
    const finalEncodedUrl = encodeURI(safeUrl);
    
    setLoadingText(`Baixando: ${safeUrl}...`);
    
    loader.load(
      finalEncodedUrl,
      (gltf) => {
        if (!isMounted) return;
        try {
          gltf.scene.userData = { ...gltf.scene.userData, isRootGltf: true };
          gltf.scene.updateMatrixWorld(true);
          
          // Calcular a caixa delimitadora (bounding box)
          const box = new THREE.Box3().setFromObject(gltf.scene);
          
          // Adicionar uma caixa amarela neon para debug (mostra exatamente onde o motor acha que o modelo está)
          const boxHelper = new THREE.Box3Helper(box, new THREE.Color(0xffff00));
          scene.add(boxHelper);
          
          let center = box.getCenter(new THREE.Vector3());
          let size = box.getSize(new THREE.Vector3());
          
          // Se a caixa estiver corrompida (modelo sem geometria clara), forçamos pro centro
          if (isNaN(center.x) || !isFinite(center.x)) center = new THREE.Vector3(0,0,0);
          if (isNaN(size.x) || !isFinite(size.x)) size = new THREE.Vector3(1,1,1);
          
          let maxDim = Math.max(size.x, size.y, size.z);
          if (maxDim === 0 || isNaN(maxDim) || !isFinite(maxDim)) maxDim = 10;
          
          // Se for gigantesco, recua a câmera proporcionalmente (ajustando o FAR para não cortar)
          camera.far = Math.max(10000, maxDim * 10);
          camera.updateProjectionMatrix();
          
          // Mover a CÂMERA para focar no objeto
          camera.position.x = center.x;
          camera.position.y = center.y + (maxDim * 0.5);
          camera.position.z = center.z + (maxDim * 2);
          
          controls.target.copy(center);
          controls.update();
          
          scene.add(gltf.scene);
          
          // Helper to count descendant meshes
          const countDescendants = (obj: THREE.Object3D): number => {
            let count = 0;
            obj.traverse((c) => {
              if ((c as THREE.Mesh).isMesh) count++;
            });
            return count;
          };

          // Cache all original materials for meshes
          gltf.scene.traverse((node) => {
            if ((node as THREE.Mesh).isMesh) {
              originalMaterialsRef.current.set(node as THREE.Mesh, (node as THREE.Mesh).material);
            }
          });

          // Build mesh tree
          buildMeshTree(gltf.scene);
          setLoading(false);
        } catch (err: any) {
          console.error("Erro interno ao processar GLB:", err);
          setError('Erro ao processar modelo: ' + err.message);
          setLoading(false);
        }
      },
      (xhr) => {
        if (!isMounted) return;
        if (xhr.total > 0) {
          setLoadingText(`Baixando modelo... ${Math.round((xhr.loaded / xhr.total) * 100)}%`);
        } else {
          setLoadingText(`Baixando modelo... ${Math.round(xhr.loaded / 1024)} KB`);
        }
      },
      (err: any) => {
        if (!isMounted) return;
        console.error("Falha ao carregar modelo 3D:", err);
        setError(`Falha ao baixar: ${safeUrl}. Erro: ${err.message || 'Desconhecido'}`);
        setLoading(false);
      }
    );
    
    // Animation Loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    
    // Raycaster for clicking
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current || !cameraRef.current || !sceneRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / containerRef.current.clientWidth) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / containerRef.current.clientHeight) * 2 + 1;
      
      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(sceneRef.current.children, true);
      
      if (intersects.length > 0) {
        // Find the mesh
        const object = intersects[0].object;
        let targetName = object.name;
        
        if (clickModeRef.current === 'group') {
          // Look up parent tree to find matching primary group or highest container
          let cur: THREE.Object3D | null = object;
          let matchedPrimary: THREE.Object3D | null = null;
          let matchedGroup: THREE.Object3D | null = null;
          
          while (cur && cur !== sceneRef.current) {
            if (primaryNamesRef.current.has(cur.name)) {
              matchedPrimary = cur;
              break;
            }
            if (cur.children && cur.children.length > 0 && !ROOT_WRAPPERS.has(cur.name.toLowerCase())) {
              matchedGroup = cur;
            }
            cur = cur.parent;
          }
          
          if (matchedPrimary) {
            targetName = matchedPrimary.name;
          } else if (matchedGroup) {
            targetName = matchedGroup.name;
          }
        }
        
        if (targetName) {
          toggleMesh(targetName);
        }
      }
    };
    
    containerRef.current.addEventListener('click', onClick);
    
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth || 400;
      const h = containerRef.current.clientHeight || 400;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h, false);
    };
    
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(containerRef.current);
    
    return () => {
      isMounted = false;
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
        containerRef.current.removeEventListener('click', onClick);
        containerRef.current.removeChild(renderer.domElement);
      }
      cancelAnimationFrame(animationId);
      
      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          if ((object as THREE.Mesh).isMesh) {
            const mesh = object as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach(m => m.dispose());
              } else {
                mesh.material.dispose();
              }
            }
          }
        });
      }
      
      // Como usamos um renderizador global, NUNCA destruimos ele. Apenas limpamos a cena.
      // Isso evita vazamento de memória e evita o "rostinho triste" (Aw, Snap!)
    };
  }, [glbUrl]);
  
  // Highlight effect
  useEffect(() => {
    if (!sceneRef.current) return;
    
    // First, restore all original materials
    originalMaterialsRef.current.forEach((mat, mesh) => {
      mesh.material = mat;
    });
    
    if (selectedNames.size > 0) {
      sceneRef.current.traverse((node) => {
        if (selectedNames.has(node.name)) {
          // If it's a group, highlight all children
          node.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              (child as THREE.Mesh).material = highlightMaterial;
            }
          });
        }
      });
    }
  }, [selectedNames]);

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal-content" style={{ background: 'var(--bg-dark)', borderRadius: '16px', border: '1px solid var(--gold-primary)', width: '90vw', maxWidth: '1000px', height: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        
        <div style={{ padding: '1rem', background: 'var(--btn-bg)', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--gold-primary)' }}>📦 Extrator de Malhas (Meshes)</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>✖</button>
        </div>
        
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left panel: 3D View */}
          <div style={{ flex: 2, position: 'relative', background: '#000' }}>
            {loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', fontWeight: 'bold', padding: '1rem', textAlign: 'center', zIndex: 10 }}>{loadingText}</div>}
            {error && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontWeight: 'bold', padding: '1rem', textAlign: 'center', zIndex: 10 }}>{error}</div>}
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            <div style={{ position: 'absolute', bottom: '0.75rem', left: '0.75rem', right: '0.75rem', background: 'rgba(0,0,0,0.85)', padding: '0.5rem 0.75rem', borderRadius: '8px', color: '#fff', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <span>💡 Clique na espada no 3D para selecioná-la!</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}>
                <span style={{ color: '#9ca3af' }}>Modo de clique:</span>
                <button
                  type="button"
                  onClick={() => setClickMode('group')}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: 'none',
                    background: clickMode === 'group' ? '#f59e0b' : 'rgba(255,255,255,0.1)',
                    color: clickMode === 'group' ? '#000' : '#fff',
                    cursor: 'pointer',
                    fontWeight: clickMode === 'group' ? 'bold' : 'normal',
                    fontSize: '0.72rem'
                  }}
                >
                  Espada Inteira
                </button>
                <button
                  type="button"
                  onClick={() => setClickMode('mesh')}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: 'none',
                    background: clickMode === 'mesh' ? '#f59e0b' : 'rgba(255,255,255,0.1)',
                    color: clickMode === 'mesh' ? '#000' : '#fff',
                    cursor: 'pointer',
                    fontWeight: clickMode === 'mesh' ? 'bold' : 'normal',
                    fontSize: '0.72rem'
                  }}
                >
                  Cubo Individual
                </button>
              </div>
            </div>
          </div>
          
          {/* Right panel: Mesh List & Actions */}
          <div style={{ flex: 1, background: 'var(--bg-card)', borderLeft: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border-glass)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, color: '#fff', fontSize: '0.95rem' }}>Peças & Espadas</h4>
                {debugInfo && <span style={{ fontSize: '0.7rem', color: '#93c5fd', background: 'rgba(59, 130, 246, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>{debugInfo}</span>}
              </div>

              {/* Search input */}
              <input
                type="text"
                placeholder="🔍 Buscar espada (ex: diamond, netherite)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-glass)',
                  background: 'var(--bg-dark)',
                  color: '#fff',
                  fontSize: '0.8rem'
                }}
              />

              {/* Filter Tabs if primary items exist */}
              {meshes.some(m => m.isPrimary) && (
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('primary')}
                    style={{
                      flex: 1,
                      padding: '0.35rem 0.5rem',
                      fontSize: '0.75rem',
                      borderRadius: '4px',
                      border: '1px solid ' + (activeTab === 'primary' ? 'var(--gold-primary)' : 'transparent'),
                      background: activeTab === 'primary' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
                      color: activeTab === 'primary' ? '#fbbf24' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontWeight: activeTab === 'primary' ? 'bold' : 'normal'
                    }}
                  >
                    ⭐ Espadas / Grupos ({meshes.filter(m => m.isPrimary).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    style={{
                      flex: 1,
                      padding: '0.35rem 0.5rem',
                      fontSize: '0.75rem',
                      borderRadius: '4px',
                      border: '1px solid ' + (activeTab === 'all' ? 'var(--gold-primary)' : 'transparent'),
                      background: activeTab === 'all' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
                      color: activeTab === 'all' ? '#fbbf24' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontWeight: activeTab === 'all' ? 'bold' : 'normal'
                    }}
                  >
                    🧱 Todas as Peças ({meshes.length})
                  </button>
                </div>
              )}
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', minHeight: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedNames(new Set())}
                  style={{ textAlign: 'left', padding: '0.65rem 0.75rem', borderRadius: '6px', border: '1px solid ' + (selectedNames.size === 0 ? '#f59e0b' : 'transparent'), background: selectedNames.size === 0 ? 'rgba(245, 158, 11, 0.1)' : 'transparent', color: selectedNames.size === 0 ? '#f59e0b' : 'var(--text-primary)', cursor: 'pointer', fontSize: '0.82rem' }}
                  className="hover-brightness"
                >
                  <i>❌ Não extrair nada (Usar modelo completo)</i>
                </button>
                
                {(() => {
                  const filtered = meshes.filter(m => {
                    if (searchQuery.trim()) {
                      const q = searchQuery.toLowerCase().trim();
                      const matchName = m.name.toLowerCase().includes(q);
                      const matchFriendly = m.friendlyName ? m.friendlyName.toLowerCase().includes(q) : false;
                      const matchParent = m.parentName ? m.parentName.toLowerCase().includes(q) : false;
                      return matchName || matchFriendly || matchParent;
                    }
                    if (activeTab === 'primary' && meshes.some(x => x.isPrimary)) {
                      return m.isPrimary;
                    }
                    return true;
                  });

                  if (filtered.length === 0 && !loading) {
                    return <div style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.85rem' }}>Nenhum item encontrado com o filtro atual.</div>;
                  }

                  return filtered.map((mesh, i) => {
                    const isSel = selectedNames.has(mesh.name);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleMesh(mesh.name)}
                        style={{
                          textAlign: 'left',
                          padding: '0.6rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid ' + (isSel ? '#f59e0b' : 'var(--border-glass)'),
                          background: isSel ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-dark)',
                          color: isSel ? '#fff' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                        className="hover-brightness"
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: isSel ? 'bold' : 'normal', color: isSel ? '#fbbf24' : '#fff', fontSize: '0.82rem' }}>
                              {isSel ? '☑ ' : '☐ '}{mesh.name}
                            </span>
                            {mesh.friendlyName && (
                              <span style={{ fontSize: '0.7rem', color: '#60a5fa', background: 'rgba(59, 130, 246, 0.15)', padding: '1px 5px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                                ✨ {mesh.friendlyName}
                              </span>
                            )}
                          </div>
                          {mesh.parentName && (
                            <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>
                              dentro de: {mesh.parentName}
                            </span>
                          )}
                        </div>
                        <span style={{
                          fontSize: '0.68rem',
                          background: mesh.isGroup ? 'rgba(59, 130, 246, 0.3)' : 'rgba(16, 185, 129, 0.3)',
                          color: mesh.isGroup ? '#60a5fa' : '#34d399',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}>
                          {mesh.isGroup ? (mesh.meshCount > 1 ? `Grupo (${mesh.meshCount} peças)` : 'Grupo') : 'Mesh'}
                        </span>
                      </button>
                    );
                  });
                })()}
              </div>
              
              {/* FERRAMENTAS DE REPARO MOVIDAS PARA DENTRO DA ÁREA COM SCROLL */}
              <div style={{ marginTop: '1rem', padding: '0.85rem', borderTop: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderRadius: '8px' }}>
                <h5 style={{ margin: '0 0 0.25rem', color: '#93c5fd', fontSize: '0.75rem', textTransform: 'uppercase' }}>Reparo 3D (Opcional)</h5>
                
                <button 
                  type="button"
                  onClick={handleSplitDisconnectedMeshes}
                  style={{ padding: '0.55rem', background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.5)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  title="Detecta e separa automaticamente modelos que têm vários objetos desconectados no espaço 3D fundidos em uma única malha (como pacotes de espadas do Sketchfab)"
                >
                  ✂️ Separar Peças Fundidas em Ilhas
                </button>

                <button 
                  type="button"
                  onClick={handleDeleteMesh}
                  disabled={selectedNames.size === 0}
                  style={{ padding: '0.5rem', background: selectedNames.size > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)', color: selectedNames.size > 0 ? '#fca5a5' : '#666', border: '1px solid ' + (selectedNames.size > 0 ? 'rgba(239, 68, 68, 0.5)' : 'transparent'), borderRadius: '4px', cursor: selectedNames.size > 0 ? 'pointer' : 'not-allowed', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  🗑️ Deletar Peças Selecionadas
                </button>
                
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button 
                    type="button"
                    onClick={handleDownloadTexture}
                    disabled={selectedNames.size === 0}
                    style={{ flex: 1, padding: '0.5rem', background: selectedNames.size > 0 ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)', color: selectedNames.size > 0 ? '#93c5fd' : '#666', border: '1px solid ' + (selectedNames.size > 0 ? 'rgba(59, 130, 246, 0.5)' : 'transparent'), borderRadius: '4px', cursor: selectedNames.size > 0 ? 'pointer' : 'not-allowed', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
                    title="Baixar a imagem da textura para pintar/apagar pixels"
                  >
                    🖼️ Baixar Textura
                  </button>
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={selectedNames.size === 0}
                    style={{ flex: 1, padding: '0.5rem', background: selectedNames.size > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)', color: selectedNames.size > 0 ? '#6ee7b7' : '#666', border: '1px solid ' + (selectedNames.size > 0 ? 'rgba(16, 185, 129, 0.5)' : 'transparent'), borderRadius: '4px', cursor: selectedNames.size > 0 ? 'pointer' : 'not-allowed', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
                    title="Substituir a textura da peça selecionada por uma imagem PNG do seu PC"
                  >
                    📤 Injetar Textura
                  </button>
                </div>
                <input type="file" ref={fileInputRef} accept="image/png" style={{ display: 'none' }} onChange={handleUploadTexture} />
                
                <button 
                  type="button"
                  onClick={handleExportFusedGlb}
                  disabled={selectedNames.size === 0}
                  style={{ padding: '0.5rem', background: selectedNames.size > 0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)', color: selectedNames.size > 0 ? '#fbbf24' : '#666', border: '1px solid ' + (selectedNames.size > 0 ? 'rgba(245, 158, 11, 0.5)' : 'transparent'), borderRadius: '4px', cursor: selectedNames.size > 0 ? 'pointer' : 'not-allowed', fontSize: '0.78rem', fontWeight: 'bold' }}
                >
                  💾 Fundir Selecionadas em GLB
                </button>
                
                <button 
                  type="button"
                  onClick={handleExportGlb}
                  disabled={meshes.length === 0}
                  style={{ marginTop: '0.25rem', padding: '0.5rem', background: meshes.length > 0 ? 'var(--bg-glass)' : 'rgba(255,255,255,0.05)', color: meshes.length > 0 ? '#fff' : '#666', border: '1px solid ' + (meshes.length > 0 ? 'var(--border-glass)' : 'transparent'), borderRadius: '4px', cursor: meshes.length > 0 ? 'pointer' : 'not-allowed', fontSize: '0.78rem', fontWeight: 'bold' }}
                >
                  💾 Exportar Novo GLB Corrigido
                </button>
              </div>
            </div>
            <div style={{ padding: '0.85rem 1rem', borderTop: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Seleção atual:</span>
                <strong style={{ color: selectedNames.size > 0 ? '#f59e0b' : '#ef4444', textAlign: 'right', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedNames.size === 0 ? 'Nenhuma' : selectedNames.size === 1 ? (
                    (() => {
                      const found = meshes.find(m => m.name === selectedName);
                      return found?.friendlyName ? `${found.name} (${found.friendlyName})` : selectedName;
                    })()
                  ) : `${selectedNames.size} peças selecionadas`}
                </strong>
              </div>
              <button 
                type="button"
                onClick={() => {
                  onSelect(selectedNames.size === 0 ? null : selectedNamesArr.join(', '));
                  onClose();
                }}
                style={{ padding: '0.75rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Confirmar Seleção {selectedNames.size > 0 ? `(${selectedNames.size})` : ''}
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </div>,
    document.body
  );
}
