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

export default function GlbMeshExtractorModal({ glbUrl, currentExtractedName, onSelect, onClose }: GlbMeshExtractorModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('Inicializando motor 3D...');
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [meshes, setMeshes] = useState<{name: string, isGroup: boolean}[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(currentExtractedName);
  
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
  
  const handleDeleteMesh = () => {
    if (!selectedName || !sceneRef.current) return;
    
    // Find the node to delete
    let nodeToDelete: THREE.Object3D | null = null;
    sceneRef.current.traverse((node) => {
      if (node.name === selectedName) nodeToDelete = node;
    });
    
    if (nodeToDelete) {
      nodeToDelete.removeFromParent();
      setMeshes(m => m.filter(x => x.name !== selectedName));
      setSelectedName(null);
    }
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
          
          // Find all selectable nodes and count everything
          const foundNodes: {name: string, isGroup: boolean}[] = [];
          let meshCount = 0;
          let groupCount = 0;
          
          gltf.scene.traverse((node) => {
            if ((node as THREE.Mesh).isMesh) meshCount++;
            if ((node as THREE.Group).isGroup) groupCount++;
            
            // Aceitar nós mesmo sem nome explícito, dando um nome genérico para podermos interagir
            const nodeName = node.name || `${(node as THREE.Mesh).isMesh ? 'Mesh' : 'Group'}_${meshCount + groupCount}`;
            
            if ((node as THREE.Mesh).isMesh) {
              foundNodes.push({ name: nodeName, isGroup: false });
              originalMaterialsRef.current.set(node as THREE.Mesh, (node as THREE.Mesh).material);
              
              // Se o mesh não tem nome, a gente nomeia pra poder selecionar
              if (!node.name) node.name = nodeName;
              
            } else if ((node as THREE.Group).isGroup && node.children.length > 0) {
              foundNodes.push({ name: nodeName, isGroup: true });
              if (!node.name) node.name = nodeName;
            }
          });
          
          setDebugInfo(`Raio-X do Arquivo: ${meshCount} Malhas, ${groupCount} Grupos. Tamanho Físico: ${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`);
          
          setMeshes(foundNodes.filter((v,i,a)=>a.findIndex(t=>(t.name === v.name))===i)); 
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
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / containerRef.current.clientWidth) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / containerRef.current.clientHeight) * 2 + 1;
      
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      
      if (intersects.length > 0) {
        // Find the mesh
        const object = intersects[0].object;
        if (object.name) {
          setSelectedName(object.name);
        } else {
          // If the mesh itself has no name, look up the parent tree
          let parent = object.parent;
          while (parent && parent.type !== 'Scene') {
            if (parent.name) {
              setSelectedName(parent.name);
              break;
            }
            parent = parent.parent;
          }
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
    
    if (selectedName) {
      sceneRef.current.traverse((node) => {
        if (node.name === selectedName) {
          // If it's a group, highlight all children
          node.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              (child as THREE.Mesh).material = highlightMaterial;
            }
          });
        }
      });
    }
  }, [selectedName]);

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
            <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', right: '1rem', background: 'rgba(0,0,0,0.7)', padding: '0.5rem', borderRadius: '8px', color: '#fff', fontSize: '0.85rem', textAlign: 'center', pointerEvents: 'none' }}>
              Dica: Você pode girar a câmera segurando o botão esquerdo do mouse. Clique diretamente num objeto para selecioná-lo!
            </div>
          </div>
          
          {/* Right panel: Mesh List & Actions */}
          <div style={{ flex: 1, background: 'var(--bg-card)', borderLeft: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
              <h4 style={{ margin: '0 0 0.5rem', color: '#fff' }}>Malhas Encontradas</h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Clique em um nome abaixo ou no objeto 3D para isolá-lo.</p>
              {debugInfo && <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', fontSize: '0.75rem', borderRadius: '4px' }}>{debugInfo}</div>}
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', minHeight: 0 }}>
              {meshes.length === 0 && !loading && <div style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.9rem' }}>Nenhuma malha nomeada encontrada.</div>}
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button
                  onClick={() => setSelectedName(null)}
                  style={{ textAlign: 'left', padding: '0.75rem', borderRadius: '6px', border: '1px solid ' + (selectedName === null ? '#f59e0b' : 'transparent'), background: selectedName === null ? 'rgba(245, 158, 11, 0.1)' : 'transparent', color: selectedName === null ? '#f59e0b' : 'var(--text-primary)', cursor: 'pointer' }}
                  className="hover-brightness"
                >
                  <i>❌ Não extrair nada (Usar modelo completo)</i>
                </button>
                
                {meshes.map((mesh, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedName(mesh.name)}
                    style={{ textAlign: 'left', padding: '0.75rem', borderRadius: '6px', border: '1px solid ' + (selectedName === mesh.name ? '#f59e0b' : 'var(--border-glass)'), background: selectedName === mesh.name ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-dark)', color: selectedName === mesh.name ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    className="hover-brightness"
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selectedName === mesh.name ? 'bold' : 'normal' }}>{mesh.name}</span>
                    <span style={{ fontSize: '0.7rem', background: mesh.isGroup ? 'rgba(59, 130, 246, 0.3)' : 'rgba(16, 185, 129, 0.3)', color: mesh.isGroup ? '#60a5fa' : '#34d399', padding: '2px 6px', borderRadius: '4px' }}>
                      {mesh.isGroup ? 'Group' : 'Mesh'}
                    </span>
                  </button>
                ))}
              </div>
              
              {/* FERRAMENTAS DE REPARO MOVIDAS PARA DENTRO DA ÁREA COM SCROLL */}
              <div style={{ marginTop: '1rem', padding: '1rem', borderTop: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderRadius: '8px' }}>
                <h5 style={{ margin: '0 0 0.25rem', color: '#93c5fd', fontSize: '0.8rem', textTransform: 'uppercase' }}>Reparo 3D (Opcional)</h5>
                
                <button 
                  onClick={handleDeleteMesh}
                  disabled={!selectedName}
                  style={{ padding: '0.5rem', background: selectedName ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)', color: selectedName ? '#fca5a5' : '#666', border: '1px solid ' + (selectedName ? 'rgba(239, 68, 68, 0.5)' : 'transparent'), borderRadius: '4px', cursor: selectedName ? 'pointer' : 'not-allowed', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  🗑️ Deletar Peça Selecionada
                </button>
                
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button 
                    onClick={handleDownloadTexture}
                    disabled={!selectedName}
                    style={{ flex: 1, padding: '0.5rem', background: selectedName ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)', color: selectedName ? '#93c5fd' : '#666', border: '1px solid ' + (selectedName ? 'rgba(59, 130, 246, 0.5)' : 'transparent'), borderRadius: '4px', cursor: selectedName ? 'pointer' : 'not-allowed', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
                    title="Baixar a imagem da textura para pintar/apagar pixels"
                  >
                    🖼️ Baixar Textura
                  </button>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!selectedName}
                    style={{ flex: 1, padding: '0.5rem', background: selectedName ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)', color: selectedName ? '#6ee7b7' : '#666', border: '1px solid ' + (selectedName ? 'rgba(16, 185, 129, 0.5)' : 'transparent'), borderRadius: '4px', cursor: selectedName ? 'pointer' : 'not-allowed', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
                    title="Substituir a textura da peça selecionada por uma imagem PNG do seu PC"
                  >
                    📤 Injetar Textura
                  </button>
                </div>
                <input type="file" ref={fileInputRef} accept="image/png" style={{ display: 'none' }} onChange={handleUploadTexture} />
                
                <button 
                  onClick={handleExportGlb}
                  disabled={meshes.length === 0}
                  style={{ marginTop: '0.25rem', padding: '0.5rem', background: meshes.length > 0 ? 'var(--bg-glass)' : 'rgba(255,255,255,0.05)', color: meshes.length > 0 ? '#fff' : '#666', border: '1px solid ' + (meshes.length > 0 ? 'var(--border-glass)' : 'transparent'), borderRadius: '4px', cursor: meshes.length > 0 ? 'pointer' : 'not-allowed', fontSize: '0.8rem', fontWeight: 'bold' }}
                >
                  💾 Exportar Novo GLB Corrigido
                </button>
              </div>
            </div>
            <div style={{ padding: '1rem', borderTop: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Seleção atual:</span>
                <strong style={{ color: selectedName ? '#f59e0b' : '#ef4444' }}>{selectedName || 'Nenhuma'}</strong>
              </div>
              <button 
                onClick={() => {
                  onSelect(selectedName);
                  onClose();
                }}
                style={{ padding: '0.75rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Confirmar Seleção
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </div>,
    document.body
  );
}
