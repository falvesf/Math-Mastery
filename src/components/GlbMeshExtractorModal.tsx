import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { supabase } from '../lib/supabase';

// Cache global para evitar limite de contextos WebGL e evitar crash (rostinho triste) do navegador
let sharedRenderer: THREE.WebGLRenderer | null = null;

interface GlbMeshExtractorModalProps {
  glbUrl: string;
  currentExtractedName: string | null;
  onSelect: (meshName: string | null) => void;
  onApplyIcon?: (iconUrl: string) => void;
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

export default function GlbMeshExtractorModal({ glbUrl, currentExtractedName, onSelect, onApplyIcon, onClose }: GlbMeshExtractorModalProps) {
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
  const [isolateMode, setIsolateMode] = useState<boolean>(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'primary' | 'all'>('primary');
  const [clickMode, setClickMode] = useState<'group' | 'mesh'>('group');
  const clickModeRef = useRef<'group' | 'mesh'>('group');
  clickModeRef.current = clickMode;
  const primaryNamesRef = useRef<Set<string>>(new Set());

  // --- REFS E ESTADOS DE RENDERIZAÇÃO & 3D ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());

  const highlightMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0x854d0e,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.9,
    wireframe: true
  }), []);

  // --- REFS E ESTADOS PARA CAPTURA DE ÍCONE 2D ---
  const boxHelperRef = useRef<THREE.Box3Helper | null>(null);
  const initialCameraStateRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const modelCenterRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const modelSizeRef = useRef<THREE.Vector3>(new THREE.Vector3(1, 1, 1));
  const rawRenderCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Função centralizada para atualizar visibilidade e isolamento da malha selecionada
  const updateSceneVisibility = useCallback(() => {
    if (!sceneRef.current) return;

    // 1. Restaura materiais originais em todas as malhas
    originalMaterialsRef.current.forEach((mat, mesh) => {
      mesh.material = mat;
    });

    if (selectedNames.size > 0) {
      const keepSet = new Set(selectedNames);
      const targetNodes = new Set<THREE.Object3D>();

      sceneRef.current.traverse((node) => {
        if (keepSet.has(node.name)) {
          targetNodes.add(node);
          node.traverse((c) => targetNodes.add(c));
          let p = node.parent;
          while (p && p.type !== 'Scene') {
            targetNodes.add(p);
            p = p.parent;
          }
        }
      });

      if (isolateMode) {
        // Isolar peça selecionada: esconde as demais malhas completamente
        sceneRef.current.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            node.visible = targetNodes.has(node);
          }
        });
      } else {
        // Ver tudo: tudo visível, mas a peça selecionada fica com destaque dourado
        sceneRef.current.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            node.visible = true;
            if (targetNodes.has(node)) {
              (node as THREE.Mesh).material = highlightMaterial;
            }
          }
        });
      }

      // Atualiza a bounding box do helper e o centro de foco para a peça selecionada
      if (boxHelperRef.current) {
        const box = new THREE.Box3();
        targetNodes.forEach((tn) => {
          tn.traverse((c) => {
            if ((c as THREE.Mesh).isMesh && c.visible) {
              box.expandByObject(c);
            }
          });
        });
        if (!box.isEmpty()) {
          boxHelperRef.current.box.copy(box);
          boxHelperRef.current.visible = true;
          modelCenterRef.current.copy(box.getCenter(new THREE.Vector3()));
          modelSizeRef.current.copy(box.getSize(new THREE.Vector3()));
        }
      }
    } else {
      // Nenhuma peça selecionada: mostra tudo normalmente com seus materiais originais
      sceneRef.current.traverse((node) => {
        if ((node as THREE.Mesh).isMesh) {
          node.visible = true;
        }
      });
      if (boxHelperRef.current) {
        let rootModel: THREE.Object3D | null = null;
        sceneRef.current.traverse((node) => {
          if (node.userData?.isRootGltf) rootModel = node;
        });
        if (rootModel) {
          const box = new THREE.Box3().setFromObject(rootModel);
          boxHelperRef.current.box.copy(box);
          boxHelperRef.current.visible = true;
          modelCenterRef.current.copy(box.getCenter(new THREE.Vector3()));
          modelSizeRef.current.copy(box.getSize(new THREE.Vector3()));
        }
      }
    }
  }, [selectedNames, isolateMode, highlightMaterial]);

  const [capturedIconUrl, setCapturedIconUrl] = useState<string | null>(null);
  const [showIconPreviewModal, setShowIconPreviewModal] = useState(false);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [showViewfinder, setShowViewfinder] = useState(true);
  const [iconFillPercent, setIconFillPercent] = useState<number>(88);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showTemporaryToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const cropAndFitToSquare = (
    sourceCanvas: HTMLCanvasElement,
    targetSize = 512,
    fillPercent = 88
  ): string => {
    const ctx = sourceCanvas.getContext('2d');
    if (!ctx) return sourceCanvas.toDataURL('image/png');

    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let minX = w;
    let maxX = -1;
    let minY = h;
    let maxY = -1;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const alpha = data[idx + 3];
        if (alpha > 15) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Se estiver vazio ou inválido, retorna o canvas original
    if (maxX < minX || maxY < minY) {
      return sourceCanvas.toDataURL('image/png');
    }

    // Adiciona margem suave de 2px para preservar o antialiasing sem cortar pixels limítrofes
    const pad = 2;
    const cropX = Math.max(0, minX - pad);
    const cropY = Math.max(0, minY - pad);
    const cropMaxX = Math.min(w - 1, maxX + pad);
    const cropMaxY = Math.min(h - 1, maxY + pad);

    const contentWidth = cropMaxX - cropX + 1;
    const contentHeight = cropMaxY - cropY + 1;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetSize;
    outCanvas.height = targetSize;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return sourceCanvas.toDataURL('image/png');

    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';

    // Área útil proporcional ao fillPercent (ex: 88% ocupa 512 * 0.88 = ~450px)
    const usableSize = targetSize * (Math.max(40, Math.min(100, fillPercent)) / 100);
    const scale = Math.min(usableSize / contentWidth, usableSize / contentHeight);

    const drawWidth = contentWidth * scale;
    const drawHeight = contentHeight * scale;

    const destX = (targetSize - drawWidth) / 2;
    const destY = (targetSize - drawHeight) / 2;

    outCtx.drawImage(
      sourceCanvas,
      cropX, cropY, contentWidth, contentHeight,
      destX, destY, drawWidth, drawHeight
    );

    return outCanvas.toDataURL('image/png');
  };

  const handleZoom = (direction: 'in' | 'out') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const factor = direction === 'in' ? 0.75 : 1.35;
    cameraRef.current.position.lerp(controlsRef.current.target, 1 - factor);
    controlsRef.current.update();
  };

  const setCameraPreset = (preset: 'diagonal' | 'front' | 'side' | 'top' | 'reset') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const center = modelCenterRef.current;
    const maxDim = Math.max(modelSizeRef.current.x, modelSizeRef.current.y, modelSizeRef.current.z, 1);
    
    if (preset === 'reset') {
      if (initialCameraStateRef.current) {
        cameraRef.current.position.copy(initialCameraStateRef.current.position);
        controlsRef.current.target.copy(initialCameraStateRef.current.target);
      } else {
        cameraRef.current.position.set(center.x, center.y + maxDim * 0.5, center.z + maxDim * 2);
        controlsRef.current.target.copy(center);
      }
      controlsRef.current.update();
      return;
    }

    if (preset === 'diagonal') {
      const dist = maxDim * 1.25;
      cameraRef.current.position.set(center.x + dist * 0.7, center.y + dist * 0.6, center.z + dist * 0.9);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    } else if (preset === 'front') {
      cameraRef.current.position.set(center.x, center.y, center.z + maxDim * 2.0);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    } else if (preset === 'side') {
      cameraRef.current.position.set(center.x + maxDim * 2.0, center.y, center.z);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    } else if (preset === 'top') {
      cameraRef.current.position.set(center.x, center.y + maxDim * 2.2, center.z + 0.001);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }
  };

  const focusOnSelected = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    const center = modelCenterRef.current;
    const maxDim = Math.max(modelSizeRef.current.x, modelSizeRef.current.y, modelSizeRef.current.z, 0.2);
    const dist = maxDim * 1.5;
    cameraRef.current.position.set(center.x + dist * 0.7, center.y + dist * 0.6, center.z + dist * 0.9);
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  };

  const handleCaptureIcon = () => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !containerRef.current) {
      return alert("Visualizador 3D ainda não está pronto para captura.");
    }

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const container = containerRef.current;

    // 1. Ocultar o boxHelper de depuração (caixa amarela neon)
    const boxWasVisible = boxHelperRef.current ? boxHelperRef.current.visible : false;
    if (boxHelperRef.current) {
      boxHelperRef.current.visible = false;
    }

    // 2. Restaurar materiais originais temporariamente (remover o highlight amarelo)
    originalMaterialsRef.current.forEach((mat, mesh) => {
      mesh.material = mat;
    });

    // 3. Se o usuário tiver peças específicas selecionadas, isolar apenas elas!
    const hiddenNodes: THREE.Object3D[] = [];
    if (selectedNames.size > 0) {
      let rootModel: THREE.Object3D | null = null;
      scene.traverse((node) => {
        if (node.userData?.isRootGltf) rootModel = node;
      });

      if (rootModel) {
        const selectedObjects = new Set<THREE.Object3D>();
        (rootModel as THREE.Object3D).traverse((node) => {
          if (selectedNames.has(node.name)) {
            selectedObjects.add(node);
            node.traverse((child) => selectedObjects.add(child));
          }
        });

        (rootModel as THREE.Object3D).traverse((node) => {
          if ((node as THREE.Mesh).isMesh && !selectedObjects.has(node)) {
            if (node.visible) {
              node.visible = false;
              hiddenNodes.push(node);
            }
          }
        });
      }
    }

    // 4. Configurar transparência total da cena e do renderizador
    const prevBackground = scene.background;
    scene.background = null;
    const prevClearColor = new THREE.Color();
    renderer.getClearColor(prevClearColor);
    const prevClearAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);

    // 5. Preservar rigorosamente o aspect ratio, perspectiva e enquadramento que o usuário vê na tela
    // NUNCA alterar camera.aspect para 1.0 aqui, pois alterar o aspect ratio
    // deforma a perspectiva 3D, reduz o FOV horizontal e deforma/curva o modelo!
    const prevPixelRatio = renderer.getPixelRatio();
    const prevWidth = container.clientWidth || 400;
    const prevHeight = container.clientHeight || 400;
    const currentAspect = prevWidth / prevHeight;

    // Garante renderização em alta resolução (mínimo 1024px na menor dimensão) mantendo estritamente o aspect ratio original
    const minTargetDim = 1024;
    const scaleMultiplier = Math.max(1, minTargetDim / Math.min(prevWidth, prevHeight));
    const renderW = Math.round(prevWidth * scaleMultiplier);
    const renderH = Math.round(prevHeight * scaleMultiplier);

    // Desativa pixelRatio temporariamente para controle 1:1 pixel-perfect do buffer WebGL
    // sem cortes ou truncamentos causados pelo escalonamento de DPI do Windows (125%, 150%, 200%)
    renderer.setPixelRatio(1);
    camera.aspect = currentAspect;
    camera.updateProjectionMatrix();
    renderer.setSize(renderW, renderH, false);

    renderer.render(scene, camera);

    // Salva cópia bruta do render no canvas offscreen (tamanho exato renderW x renderH)
    const offscreen = document.createElement('canvas');
    offscreen.width = renderW;
    offscreen.height = renderH;
    const offCtx = offscreen.getContext('2d');
    if (offCtx) {
      offCtx.drawImage(renderer.domElement, 0, 0, renderW, renderH);
    }
    rawRenderCanvasRef.current = offscreen;

    // Aplica recorte inteligente proporcional e centraliza perfeitamente no ícone 512x512
    const croppedDataUrl = cropAndFitToSquare(offscreen, 512, iconFillPercent);

    // 7. Restaurar estado imediatamente
    renderer.setPixelRatio(prevPixelRatio);
    camera.aspect = currentAspect;
    camera.updateProjectionMatrix();
    renderer.setSize(prevWidth, prevHeight, false);
    scene.background = prevBackground;
    renderer.setClearColor(prevClearColor, prevClearAlpha);
    renderer.render(scene, camera);

    if (boxHelperRef.current) {
      boxHelperRef.current.visible = boxWasVisible;
    }

    hiddenNodes.forEach((node) => {
      node.visible = true;
    });
    updateSceneVisibility();

    setCapturedIconUrl(croppedDataUrl);
    setShowIconPreviewModal(true);
  };

  const handleApplyCapturedIcon = async () => {
    if (!capturedIconUrl) return;
    setIsUploadingIcon(true);

    try {
      // 1. Converter dataUrl para Blob
      const res = await fetch(capturedIconUrl);
      const blob = await res.blob();

      // 2. Fazer upload para o bucket 'uploads' no Supabase
      const fileName = `store/icon_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.png`;
      const { data, error } = await supabase.storage.from('uploads').upload(fileName, blob, {
        contentType: 'image/png',
        upsert: true
      });

      let finalUrl = capturedIconUrl;
      if (!error && data) {
        const { data: publicData } = supabase.storage.from('uploads').getPublicUrl(fileName);
        if (publicData?.publicUrl) {
          finalUrl = publicData.publicUrl;
        }
      } else if (error) {
        console.warn('Upload para storage retornou erro, usando dataUrl diretamente:', error);
      }

      if (onApplyIcon) {
        onApplyIcon(finalUrl);
      }

      setShowIconPreviewModal(false);
      showTemporaryToast('✨ Ícone definido com sucesso como arte do item!');
    } catch (err) {
      console.error('Falha ao processar ícone:', err);
      if (onApplyIcon) {
        onApplyIcon(capturedIconUrl);
      }
      setShowIconPreviewModal(false);
      showTemporaryToast('✨ Ícone aplicado como arte do item!');
    } finally {
      setIsUploadingIcon(false);
    }
  };

  const handleDownloadCapturedIcon = () => {
    if (!capturedIconUrl) return;
    const link = document.createElement('a');
    link.download = `${selectedName || 'item_3d'}_icon.png`;
    link.href = capturedIconUrl;
    link.click();
  };

  const toggleMesh = (name: string) => {
    setSelectedNames(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };


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
    
    let foundMesh: THREE.Mesh | null = null;
    sceneRef.current.traverse((node: THREE.Object3D) => {
      if (node.name === selectedName) {
        node.traverse((child: THREE.Object3D) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (!foundMesh) foundMesh = mesh;
            const mat = mesh.material;
            const hasMap = Array.isArray(mat) ? mat.some((m: any) => (m as any).map) : (mat as any).map;
            if (hasMap) foundMesh = mesh;
          }
        });
      }
    });

    if (!(foundMesh as any)) return alert("Nenhuma malha 3D encontrada na seleção para extrair a textura.");
    const validMesh = (foundMesh as unknown) as THREE.Mesh;
    
    let actualMaterial: THREE.MeshStandardMaterial | null = null;
    if (Array.isArray(validMesh.material)) {
      actualMaterial = (validMesh.material.find((m: any) => (m as THREE.MeshStandardMaterial).map) || validMesh.material[0]) as THREE.MeshStandardMaterial;
    } else {
      actualMaterial = validMesh.material as THREE.MeshStandardMaterial;
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

  const exportModelGlb = (onlySelected: boolean) => {
    if (!sceneRef.current) return;

    let foundRoot: THREE.Object3D | null = null;
    sceneRef.current.traverse((node: THREE.Object3D) => {
      if (node.userData?.isRootGltf) foundRoot = node;
    });
    if (!foundRoot) {
      return alert("Erro: Não foi possível encontrar a raiz do modelo para exportar.");
    }
    const rootToExport = foundRoot as THREE.Object3D;

    // 1. Restaura materiais originais (remove highlight amarelo/wireframe)
    rootToExport.traverse((node: THREE.Object3D) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        if (originalMaterialsRef.current.has(mesh)) {
          mesh.material = originalMaterialsRef.current.get(mesh)!;
        }
      }
    });

    const isPruning = onlySelected && selectedNames.size > 0;
    const toRemove: THREE.Object3D[] = [];
    const parents = new Map<THREE.Object3D, THREE.Object3D>();
    let shiftX = 0;
    let shiftZ = 0;

    if (isPruning) {
      const keepSet = new Set(selectedNames);
      const toKeep = new Set<THREE.Object3D>();

      rootToExport.traverse((node: THREE.Object3D) => {
        const isBoneNode = (node as any).isBone === true || node.type === 'Bone';
        if (keepSet.has(node.name) || isBoneNode) {
          let cur: THREE.Object3D | null = node;
          while (cur) {
            toKeep.add(cur);
            cur = cur.parent;
          }
          node.traverse((d: THREE.Object3D) => toKeep.add(d));
        }
      });

      // Remove apenas filhos diretos dos nós mantidos que não estejam em toKeep
      rootToExport.traverse((node: THREE.Object3D) => {
        if (toKeep.has(node)) {
          node.children.forEach((c: THREE.Object3D) => {
            if (!toKeep.has(c)) {
              toRemove.push(c);
            }
          });
        }
      });

      toRemove.forEach((n) => {
        if (n.parent) {
          parents.set(n, n.parent);
          n.removeFromParent();
        }
      });

      // Recentraliza a peça selecionada no centro horizontal (X=0, Z=0) para alinhamento ideal
      const box = new THREE.Box3().setFromObject(rootToExport);
      const center = box.getCenter(new THREE.Vector3());
      if (!isNaN(center.x) && isFinite(center.x)) shiftX = center.x;
      if (!isNaN(center.z) && isFinite(center.z)) shiftZ = center.z;

      if (Math.abs(shiftX) > 0.0001 || Math.abs(shiftZ) > 0.0001) {
        rootToExport.children.forEach((c) => {
          c.position.x -= shiftX;
          c.position.z -= shiftZ;
        });
      }
    }

    const cleanup = () => {
      if (isPruning) {
        if (Math.abs(shiftX) > 0.0001 || Math.abs(shiftZ) > 0.0001) {
          rootToExport.children.forEach((c) => {
            c.position.x += shiftX;
            c.position.z += shiftZ;
          });
        }
        toRemove.forEach((n) => {
          const p = parents.get(n);
          if (p) p.add(n);
        });
      }
      updateSceneVisibility();
    };

    setLoading(true);
    setLoadingText(isPruning ? "Exportando peça selecionada em GLB limpo..." : "Empacotando e exportando GLB corrigido...");

    const exporter = new GLTFExporter();
    exporter.parse(
      rootToExport,
      (gltfData) => {
        const blob = new Blob([gltfData as ArrayBuffer], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const filename = isPruning
          ? `${(selectedName || 'peca_extraida').replace(/[^a-zA-Z0-9_-]/g, '_')}.glb`
          : 'modelo_corrigido.glb';
        link.download = filename;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);

        cleanup();
        setLoading(false);
        showTemporaryToast(`✅ Modelo exportado com sucesso: ${filename}`);
      },
      (error) => {
        cleanup();
        console.error('Erro ao exportar:', error);
        alert("Ocorreu um erro ao exportar o modelo GLB.");
        setLoading(false);
      },
      { binary: true }
    );
  };

  // @ts-ignore
  const handleExportGlb = () => {
    exportModelGlb(selectedNames.size > 0);
  };
  
  // @ts-ignore
  const handleExportFusedGlb = () => {
    exportModelGlb(true);
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
      sharedRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      sharedRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
          boxHelperRef.current = boxHelper;
          
          let center = box.getCenter(new THREE.Vector3());
          let size = box.getSize(new THREE.Vector3());
          
          // Se a caixa estiver corrompida (modelo sem geometria clara), forçamos pro centro
          if (isNaN(center.x) || !isFinite(center.x)) center = new THREE.Vector3(0,0,0);
          if (isNaN(size.x) || !isFinite(size.x)) size = new THREE.Vector3(1,1,1);

          modelCenterRef.current.copy(center);
          modelSizeRef.current.copy(size);
          
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

          initialCameraStateRef.current = {
            position: camera.position.clone(),
            target: controls.target.clone()
          };
          
          scene.add(gltf.scene);

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
  
  // Highlight and isolation effect
  useEffect(() => {
    updateSceneVisibility();
  }, [updateSceneVisibility]);

  return (
    <>
      {createPortal(
        <div className="modal-overlay" style={{ zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal-content" style={{ background: 'var(--bg-dark)', borderRadius: '16px', border: '1px solid var(--gold-primary)', width: '90vw', maxWidth: '1000px', height: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        
        <div style={{ padding: '1rem', background: 'var(--btn-bg)', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--gold-primary)' }}>📦 Extrator de Malhas (Meshes)</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>✖</button>
        </div>
        
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left panel: 3D View */}
          <div style={{ flex: 2, position: 'relative', background: '#000', overflow: 'hidden' }}>
            {loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', fontWeight: 'bold', padding: '1rem', textAlign: 'center', zIndex: 10 }}>{loadingText}</div>}
            {error && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontWeight: 'bold', padding: '1rem', textAlign: 'center', zIndex: 10 }}>{error}</div>}
            
            {/* Top Toolbar: Ângulos de Câmera e Captura de Ícone 2D */}
            <div style={{
              position: 'absolute',
              top: '0.75rem',
              left: '0.75rem',
              right: '0.75rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
              zIndex: 10,
              pointerEvents: 'none'
            }}>
              {/* Presets de Ângulo de Visão */}
              <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.8)', padding: '4px 6px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(6px)', pointerEvents: 'auto' }}>
                <span style={{ fontSize: '0.7rem', color: '#9ca3af', alignSelf: 'center', padding: '0 4px', fontWeight: 'bold' }}>Ângulos:</span>
                <button
                  type="button"
                  onClick={() => setCameraPreset('diagonal')}
                  title="Posição clássica diagonal de armas e espadas em inventário de RPG"
                  style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 'bold' }}
                >
                  ⚔️ Diagonal RPG
                </button>
                <button
                  type="button"
                  onClick={() => setCameraPreset('front')}
                  title="Visão frontal ortogonal (ótimo para armaduras e escudos)"
                  style={{ padding: '3px 7px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: '0.72rem' }}
                >
                  👁️ Frontal
                </button>
                <button
                  type="button"
                  onClick={() => setCameraPreset('side')}
                  title="Visão de perfil lateral"
                  style={{ padding: '3px 7px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: '0.72rem' }}
                >
                  📐 Lateral
                </button>
                <button
                  type="button"
                  onClick={() => setCameraPreset('top')}
                  title="Visão superior de cima"
                  style={{ padding: '3px 7px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: '0.72rem' }}
                >
                  🔝 Topo
                </button>
                <button
                  type="button"
                  onClick={() => setCameraPreset('reset')}
                  title="Restaurar posição inicial da câmera"
                  style={{ padding: '3px 7px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.08)', color: '#9ca3af', cursor: 'pointer', fontSize: '0.72rem' }}
                >
                  🎯 Reset
                </button>
                <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)', margin: '0 2px' }} />
                <button
                  type="button"
                  onClick={() => handleZoom('in')}
                  title="Aproximar Câmera (Zoom +)"
                  style={{ padding: '3px 7px', borderRadius: '5px', border: '1px solid rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 'bold' }}
                >
                  ➕ Zoom
                </button>
                <button
                  type="button"
                  onClick={() => handleZoom('out')}
                  title="Afastar Câmera (Zoom -)"
                  style={{ padding: '3px 7px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.08)', color: '#d1d5db', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 'bold' }}
                >
                  ➖ Zoom
                </button>
                {selectedNames.size > 0 && (
                  <>
                    <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)', margin: '0 2px' }} />
                    <button
                      type="button"
                      onClick={focusOnSelected}
                      title="Centralizar e aproximar a câmera na peça selecionada"
                      style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        border: '1px solid rgba(59, 130, 246, 0.5)',
                        background: 'rgba(59, 130, 246, 0.2)',
                        color: '#93c5fd',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        fontWeight: 'bold'
                      }}
                    >
                      🎯 Focar Peça
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsolateMode((prev) => !prev)}
                      title={isolateMode ? "Mostrar o modelo 3D completo" : "Ocultar o restante e isolar apenas a peça selecionada"}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        border: '1px solid ' + (isolateMode ? '#10b981' : 'rgba(255,255,255,0.2)'),
                        background: isolateMode ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.08)',
                        color: isolateMode ? '#34d399' : '#e5e7eb',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        fontWeight: 'bold'
                      }}
                    >
                      {isolateMode ? '👁️ Peça Isolada' : '🌐 Ver Tudo'}
                    </button>
                  </>
                )}
              </div>

              {/* Ações de Ícone */}
              <div style={{ display: 'flex', gap: '6px', pointerEvents: 'auto' }}>
                <button
                  type="button"
                  onClick={() => setShowViewfinder(prev => !prev)}
                  title="Alternar guia de enquadramento 1:1"
                  style={{
                    padding: '5px 9px',
                    borderRadius: '8px',
                    border: '1px solid ' + (showViewfinder ? '#f59e0b' : 'rgba(255,255,255,0.2)'),
                    background: showViewfinder ? 'rgba(245, 158, 11, 0.2)' : 'rgba(0,0,0,0.8)',
                    color: showViewfinder ? '#fbbf24' : '#9ca3af',
                    cursor: 'pointer',
                    fontSize: '0.74rem',
                    fontWeight: 'bold',
                    backdropFilter: 'blur(6px)'
                  }}
                >
                  🎯 Guia 1:1
                </button>

                <button
                  type="button"
                  onClick={handleCaptureIcon}
                  disabled={loading || !!error}
                  title="Capturar o modelo na posição 3D atual e gerar um ícone transparente de 512x512"
                  style={{
                    padding: '5px 12px',
                    borderRadius: '8px',
                    border: '1px solid #f59e0b',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#000',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 'bold',
                    boxShadow: '0 0 12px rgba(245, 158, 11, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  📸 Capturar Ícone 2D
                </button>
              </div>
            </div>

            {/* Guia de Enquadramento 1:1 (Viewfinder retangular centralizado) */}
            {showViewfinder && !loading && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 'min(70%, 65vh, 380px)',
                  aspectRatio: '1 / 1',
                  border: '2px dashed rgba(245, 158, 11, 0.65)',
                  borderRadius: '16px',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.28), inset 0 0 15px rgba(245, 158, 11, 0.15)',
                  pointerEvents: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '10px',
                  zIndex: 4,
                  boxSizing: 'border-box'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fbbf24', fontSize: '0.68rem', fontWeight: 'bold' }}>
                  <span>◤ 1:1</span>
                  <span>ENQUADRAMENTO 3D ◥</span>
                </div>
                <div style={{ textAlign: 'center', color: '#fbbf24', fontSize: '0.68rem', background: 'rgba(0,0,0,0.7)', padding: '3px 8px', borderRadius: '4px', alignSelf: 'center', border: '1px solid rgba(245,158,11,0.3)', pointerEvents: 'none' }}>
                  ✨ Recorte inteligente: expande automaticamente o item no ícone
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fbbf24', fontSize: '0.68rem', fontWeight: 'bold' }}>
                  <span>◣ 512 x 512</span>
                  <span>◢</span>
                </div>
              </div>
            )}

            {/* Toast Feedback */}
            {toastMessage && (
              <div style={{
                position: 'absolute',
                top: '4rem',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(16, 185, 129, 0.95)',
                color: '#fff',
                padding: '0.55rem 1.1rem',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                zIndex: 100,
                pointerEvents: 'none'
              }}>
                {toastMessage}
              </div>
            )}

            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            <div style={{ position: 'absolute', bottom: '0.75rem', left: '0.75rem', right: '0.75rem', background: 'rgba(0,0,0,0.85)', padding: '0.5rem 0.75rem', borderRadius: '8px', color: '#fff', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)', zIndex: 6 }}>
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
                <h5 style={{ margin: '0 0 0.25rem', color: '#93c5fd', fontSize: '0.75rem', textTransform: 'uppercase' }}>Reparo 3D & Captura de Ícone</h5>
                
                <button 
                  type="button"
                  onClick={handleCaptureIcon}
                  disabled={loading || !!error}
                  style={{
                    padding: '0.65rem',
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.35))',
                    color: '#fbbf24',
                    border: '1px solid #f59e0b',
                    borderRadius: '6px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.25)'
                  }}
                  title="Captura o objeto 3D exatamente no ângulo que você posicionou na tela para usar como ícone/arte do item"
                >
                  📸 Capturar Ícone 2D (512x512)
                </button>

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
                  onClick={() => exportModelGlb(true)}
                  disabled={selectedNames.size === 0}
                  style={{
                    padding: '0.55rem',
                    background: selectedNames.size > 0 ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.35))' : 'rgba(255,255,255,0.05)',
                    color: selectedNames.size > 0 ? '#fbbf24' : '#666',
                    border: '1px solid ' + (selectedNames.size > 0 ? '#f59e0b' : 'transparent'),
                    borderRadius: '6px',
                    cursor: selectedNames.size > 0 ? 'pointer' : 'not-allowed',
                    fontSize: '0.78rem',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem'
                  }}
                  title="Exporta um arquivo .GLB contendo APENAS a peça selecionada, com esqueleto preservado e perfeitamente centralizada para uso como item/arma"
                >
                  💾 Extrair Peça em Arquivo .GLB
                </button>
                
                <button 
                  type="button"
                  onClick={() => exportModelGlb(false)}
                  disabled={meshes.length === 0}
                  style={{
                    marginTop: '0.2rem',
                    padding: '0.5rem',
                    background: meshes.length > 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                    color: meshes.length > 0 ? '#d1d5db' : '#666',
                    border: '1px solid ' + (meshes.length > 0 ? 'rgba(255,255,255,0.15)' : 'transparent'),
                    borderRadius: '4px',
                    cursor: meshes.length > 0 ? 'pointer' : 'not-allowed',
                    fontSize: '0.76rem'
                  }}
                  title="Exporta o modelo completo com todas as correções e texturas injetadas"
                >
                  💾 Exportar Modelo Inteiro Corrigido
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
  )}

  {/* Modal de Pré-visualização do Ícone 2D Capturado */}
  {showIconPreviewModal && capturedIconUrl && createPortal(
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000005,
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--bg-dark, #12131a)',
        border: '1px solid var(--gold-primary, #f59e0b)',
        borderRadius: '16px',
        padding: '1.5rem',
        width: '100%',
        maxWidth: '540px',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--gold-primary, #f59e0b)', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📸 Ícone 2D Capturado (512x512)
          </h3>
          <button
            type="button"
            onClick={() => setShowIconPreviewModal(false)}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.25rem' }}
          >
            ✖
          </button>
        </div>

        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          {/* Checkerboard 1:1 image preview */}
          <div style={{
            width: '180px',
            height: '180px',
            borderRadius: '12px',
            border: '2px solid rgba(255,255,255,0.15)',
            background: 'repeating-conic-gradient(#1f2937 0% 25%, #111827 0% 50%) 50% / 16px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0
          }}>
            <img
              src={capturedIconUrl}
              alt="Ícone 3D Capturado"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>

          {/* Slot / In-game preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: 'bold', textTransform: 'uppercase' }}>
              Aparência no Inventário / Loja:
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '68px',
                height: '68px',
                borderRadius: '10px',
                background: 'rgba(0, 0, 0, 0.6)',
                border: '2px solid #f59e0b',
                boxShadow: '0 0 10px rgba(245, 158, 11, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px'
              }}>
                <img
                  src={capturedIconUrl}
                  alt="Miniatura"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div style={{ fontSize: '0.75rem', color: '#d1d5db', lineHeight: 1.4 }}>
                <div style={{ color: '#fbbf24', fontWeight: 'bold' }}>Fundo Transparente</div>
                <div>Resolução: 512 x 512</div>
                <div>Proporção: 1:1 Perfeita</div>
              </div>
            </div>
          </div>
        </div>

        {/* Slider de Escala / Preenchimento no Ícone */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.4)',
          padding: '0.85rem 1rem',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: '#e5e7eb', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              📐 Tamanho / Preenchimento do Ícone:
            </span>
            <span style={{ fontSize: '0.88rem', color: '#fbbf24', fontWeight: 'bold' }}>
              {iconFillPercent}%
            </span>
          </div>

          <input
            type="range"
            min={50}
            max={98}
            value={iconFillPercent}
            onChange={(e) => {
              const val = Number(e.target.value);
              setIconFillPercent(val);
              if (rawRenderCanvasRef.current) {
                const updated = cropAndFitToSquare(rawRenderCanvasRef.current, 512, val);
                setCapturedIconUrl(updated);
              }
            }}
            style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
          />

          <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={() => {
                setIconFillPercent(70);
                if (rawRenderCanvasRef.current) setCapturedIconUrl(cropAndFitToSquare(rawRenderCanvasRef.current, 512, 70));
              }}
              style={{ padding: '3px 8px', fontSize: '0.72rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: iconFillPercent === 70 ? '#f59e0b' : 'rgba(255,255,255,0.05)', color: iconFillPercent === 70 ? '#000' : '#d1d5db', cursor: 'pointer' }}
            >
              Compacto (70%)
            </button>
            <button
              type="button"
              onClick={() => {
                setIconFillPercent(88);
                if (rawRenderCanvasRef.current) setCapturedIconUrl(cropAndFitToSquare(rawRenderCanvasRef.current, 512, 88));
              }}
              style={{ padding: '3px 8px', fontSize: '0.72rem', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.5)', background: iconFillPercent === 88 ? '#f59e0b' : 'rgba(245, 158, 11, 0.15)', color: iconFillPercent === 88 ? '#000' : '#fbbf24', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ⭐ Padrão RPG (88%)
            </button>
            <button
              type="button"
              onClick={() => {
                setIconFillPercent(96);
                if (rawRenderCanvasRef.current) setCapturedIconUrl(cropAndFitToSquare(rawRenderCanvasRef.current, 512, 96));
              }}
              style={{ padding: '3px 8px', fontSize: '0.72rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: iconFillPercent === 96 ? '#f59e0b' : 'rgba(255,255,255,0.05)', color: iconFillPercent === 96 ? '#000' : '#d1d5db', cursor: 'pointer' }}
            >
              Preenchimento Máximo (96%)
            </button>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
          {onApplyIcon && (
            <button
              type="button"
              onClick={handleApplyCapturedIcon}
              disabled={isUploadingIcon}
              style={{
                padding: '0.75rem',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                cursor: isUploadingIcon ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)'
              }}
            >
              {isUploadingIcon ? '⏳ Enviando imagem...' : '⚡ Definir como Imagem do Item'}
            </button>
          )}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleDownloadCapturedIcon}
              style={{
                flex: 1,
                padding: '0.65rem',
                background: 'rgba(59, 130, 246, 0.2)',
                color: '#60a5fa',
                border: '1px solid #3b82f6',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem'
              }}
            >
              📥 Baixar Arquivo PNG
            </button>

            <button
              type="button"
              onClick={() => setShowIconPreviewModal(false)}
              style={{
                flex: 1,
                padding: '0.65rem',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem'
              }}
            >
              🔄 Voltar e Ajustar Posição 3D
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )}
  </>
  );
}
