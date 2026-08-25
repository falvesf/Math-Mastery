import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, User as UserIcon, Dices, Settings, ChevronDown, ChevronLeft, ChevronRight, BookMarked, Trash2, Accessibility as PoseIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth, type UserData } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { usePermissions } from '../lib/permissions';
import AvatarCharacter, { type AvatarConfig, type EquippedItem, type ModelTransform, type CharacterPose, resolveModelTransform } from './AvatarCharacter';
import { fetchSavedPoses, saveSavedPoses, type SavedPose } from '../lib/savedPoses';
import { useDialog } from '../contexts/DialogContext';
import AdminPresetSkinsManager from './AdminPresetSkinsManager';
import Admin3DModelsManager from './Admin3DModelsManager';
import CustomModelViewer from './CustomModelViewer';
import { sessionCache, CACHE_KEYS, CACHE_TTL } from '../lib/sessionCache';
import { v4 as uuidv4 } from 'uuid';

interface AvatarCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userData?: UserData;
  equippedItems?: EquippedItem[];
  initialConfig?: AvatarConfig;
  customSaveMode?: boolean;
  onSave?: (config: AvatarConfig, name?: string) => void;
  onPositionsSaved?: () => void;
  isAdmin?: boolean;
  inline?: boolean;
}

const ACTION_LABELS: Record<'idle' | 'walk' | 'run' | 'attack', string> = {
  idle: 'Parado',
  walk: 'Andando',
  run: 'Correndo',
  attack: 'Lutando',
};

export interface PresetSkin {
  id: string;
  name: string;
  url: string;
  type: 'human' | 'monster' | 'equipment';
  baseModelId?: string | null;
  config?: AvatarConfig;
  genderTarget?: 'male' | 'female' | 'both';
}

const SKIN_COLORS = ['#ffcc99', '#f1c27d', '#e0ac69', '#8d5524', '#c68642', '#3d2c23'];
const HAIR_COLORS = ['#000000', '#4a3000', '#8a4000', '#e3a934', '#a13131', '#ffffff', '#a8a8a8', '#5b5b5b', '#ff00ff', '#00ffff'];
const EYE_COLORS = [
  '#000000', '#4a3000', '#3b5998', '#2ecc71', '#9b59b6', '#e74c3c'
];
const CLOTHES_COLORS = [
  '#e5e5e5', '#333333', '#d63074', '#3498db', '#2ecc71', '#f1c40f', '#e67e22', '#9b59b6'
];
const LIPSTICK_COLORS = [
  '#4a0404', '#cc0000', '#ff0066', '#ff99cc', '#800080', '#000000', '#ff6600', '#8b4513'
];

const MONSTER_SKIN_COLORS = ['#7cba3d', '#4a7c59', '#3d5a80', '#293241', '#5a189a', '#7b2cbf', '#9d4edd', '#e01e37', '#6a040f', '#03071e', '#1e2124'];
const MONSTER_EYE_COLORS = ['#ff0000', '#ffea00', '#00ff00', '#00ffff', '#ff00ff', '#ffffff', '#000000'];
const MONSTER_HAIR_COLORS = ['#ffffff', '#000000', '#ff0000', '#800080', '#00ff00', '#333333', '#4a7c59'];

const HAIR_STYLES = ['short', 'long', 'spiky', 'bald', 'ponytail', 'mohawk', 'messy'];
const MOUTH_STYLES = ['smile', 'neutral', 'sad', 'open', 'teeth'];
const FACIAL_HAIR_STYLES = ['none', 'beard', 'mustache', 'goatee'];

const ColorPicker = ({ label, colors, value, onChange }: { label: string, colors: string[], value: string, onChange: (c: string) => void }) => (
  <div style={{ marginBottom: '0.75rem' }}>
    <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{label}</label>
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '2px', flex: 1, scrollbarWidth: 'thin' }}>
        {colors.map(c => (
          <button
            key={c}
            onClick={() => onChange(c)}
            style={{
              width: '24px', height: '24px',
              flexShrink: 0,
              borderRadius: '50%',
              backgroundColor: c,
              border: value === c ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--btn-bg)', padding: '0.2rem 0.4rem', borderRadius: '6px', flexShrink: 0 }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '24px', height: '24px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
        />
      </div>
    </div>
  </div>
);

const DraggableWidget = ({ id, defaultPos = {x: 20, y: 20}, children }: { id: string, defaultPos?: {x: number, y: number}, children: React.ReactNode }) => {
  const [pos, setPos] = useState(() => {
    const saved = localStorage.getItem(`avatarCustomizer_widgetPos_${id}`);
    return saved ? JSON.parse(saved) : defaultPos;
  });
  const [isMinimized, setIsMinimized] = useState(() => {
    const saved = localStorage.getItem(`avatarCustomizer_widgetMin_${id}`);
    return saved ? JSON.parse(saved) : false;
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    localStorage.setItem(`avatarCustomizer_widgetPos_${id}`, JSON.stringify(pos));
  }, [pos, id]);

  useEffect(() => {
    localStorage.setItem(`avatarCustomizer_widgetMin_${id}`, JSON.stringify(isMinimized));
  }, [isMinimized, id]);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 99999,
        background: 'rgba(30, 35, 45, 0.85)',
        backdropFilter: 'blur(10px)',
        padding: isMinimized ? '0.5rem 1rem' : '1rem',
        borderRadius: '24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.1)',
        minWidth: isMinimized ? 'auto' : '220px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).closest('button')) return;
        setIsDragging(true);
        dragStart.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (isDragging) {
          setPos({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
        }
      }}
      onPointerUp={(e) => {
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    >
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMinimized ? '0' : '0.5rem' }}>
        <div style={{ flex: 1 }} />
        <div style={{ cursor: isDragging ? 'grabbing' : 'grab', opacity: 0.6, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', color: '#fff', whiteSpace: 'nowrap', userSelect: 'none' }}>
          ≡ Arrastar ≡
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title={isMinimized ? "Restaurar" : "Minimizar"}
          >
            {isMinimized ? <Settings size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      {!isMinimized && children}
    </div>,
    document.body
  );
};

const HorizontalScrollList = ({ children }: { children: React.ReactNode }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth - 1);
    }
  };

  useEffect(() => {
    // delay check slightly to allow DOM to render sizes
    setTimeout(checkScroll, 100);
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [children]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const amount = scrollRef.current.clientWidth * 0.75;
      scrollRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
      setTimeout(checkScroll, 350);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '100%' }}>
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          style={{ position: 'absolute', left: '-12px', zIndex: 10, background: 'var(--accent-primary)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,0.3)' }}
        >
          <ChevronLeft size={16} />
        </button>
      )}
      <div 
        ref={scrollRef}
        onScroll={checkScroll}
        style={{ display: 'flex', gap: '0.5rem', flexWrap: 'nowrap', overflowX: 'auto', padding: '0.25rem 0', width: '100%', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style>{`.hide-scroll::-webkit-scrollbar { display: none; }`}</style>
        <div className="hide-scroll" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'nowrap' }}>
          {children}
        </div>
      </div>
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          style={{ position: 'absolute', right: '-12px', zIndex: 10, background: 'var(--accent-primary)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,0.3)' }}
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
};

export default function AvatarCustomizationModal({ isOpen, onClose, initialConfig, customSaveMode = false, onSave, onPositionsSaved, isAdmin = false, inline = false, equippedItems = [] }: AvatarCustomizationModalProps) {
  const { userData, updateUserDataLocally } = useAuth();
  const { tenantId } = useTenant();
  const { can: canView } = usePermissions();
  const { showAlert, showToast } = useDialog();
  // Menus de administrador na edição do personagem (Skins, Moldes, Debug)
  const canSkins = userData?.role === 'admin' || isAdmin || canView('skins', 'view');
  const canModels = userData?.role === 'admin' || isAdmin || canView('models', 'view');
  const canDebug = userData?.role === 'admin' || isAdmin || canView('debug3d', 'view');
  const [config, setConfig] = useState<AvatarConfig>({
    gender: 'male',
    skinColor: '#ffcc99',
    hairColor: '#4a3000',
    eyeColor: '#000000',
    hairStyle: 'short',
    mouthStyle: 'smile',
    facialHair: 'none',
    handedness: 'right',
  });
  const [showEquippedItems, setShowEquippedItems] = useState(() => {
    const saved = localStorage.getItem('avatarCustomizer_showEquippedItems');
    return saved ? JSON.parse(saved) : true;
  });
  const [saving, setSaving] = useState(false);
  const [monsterName, setMonsterName] = useState('');
  const [presetSkins, setPresetSkins] = useState<PresetSkin[]>([]);
  const [models3d, setModels3d] = useState<any[]>([]);
  const [showAdminManager, setShowAdminManager] = useState(false);
  const [showAdmin3dManager, setShowAdmin3dManager] = useState(false);
  const [viewerZoom, setViewerZoom] = useState(1);
  
  const handednessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHandednessChange = (newHandedness: 'right' | 'left') => {
    if (config.handedness === newHandedness) return;
    
    // Salva a animação atual (se não for o próprio raise-hand)
    const previousAnimation = (config.animationState === 'raise-hand') ? 'idle' : (config.animationState || 'idle');
    
    setConfig(prev => ({ ...prev, handedness: newHandedness, animationState: 'raise-hand' }));
    
    if (handednessTimeoutRef.current) {
      clearTimeout(handednessTimeoutRef.current);
    }
    
    handednessTimeoutRef.current = setTimeout(() => {
      setConfig(prev => ({ ...prev, animationState: previousAnimation }));
    }, 2500);
  };
  const [debugMode, setDebugMode] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [debugItemId, setDebugItemId] = useState<string | null>(null);
  const [debugTransform, setDebugTransform] = useState<ModelTransform>({
    posX: 0, posY: -11, posZ: 0,
    rotX: Math.PI / 2.2, rotY: 0, rotZ: -Math.PI / 20,
    slide: -18,
    scale: 16
  });

  // Retorna um transform padrão (por parte do corpo) quando não existe
  // configuração salva específica para o gênero atual — para que um gênero
  // não "vaze" as configurações do outro.
  const getDebugDefaultTransform = (item?: any): ModelTransform => {
    const part = item?.avatarPart;
    if (part === 'legs') return { posX: 0, posY: -15, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, slide: 0, scale: 16, thickness: 1 };
    if (part === 'feet') return { posX: 0, posY: -22, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, slide: 0, scale: 16, thickness: 1 };
    if (part === 'body') return { posX: 0, posY: -6, posZ: 0, rotX: 0, rotY: Math.PI, rotZ: 0, slide: 0, scale: 16, thickness: 1 };
    if (part === 'head') {
      const isMinecraft = !!item?.minecraftHeadValue;
      return { posX: 0, posY: isMinecraft ? 4 : 0, posZ: 0, rotX: 0, rotY: isMinecraft ? 0 : Math.PI, rotZ: 0, slide: 0, scale: isMinecraft ? 9.2 : 16, thickness: 1 };
    }
    return {
      posX: 0, posY: -11, posZ: 0,
      rotX: Math.PI / 2.2, rotY: 0, rotZ: -Math.PI / 20,
      slide: -18,
      scale: 16,
      thickness: 1
    };
  };

  // Carregar poses salvas da escola
  const loadSavedPoses = async () => {
    const poses = await fetchSavedPoses(tenantId);
    setSavedPoses(poses);
  };

  const handleSavePose = async () => {
    const name = newPoseName.trim();
    if (!name) {
      showAlert('Erro', 'Digite um nome para a pose.');
      return;
    }
    const poseToSave: SavedPose = {
      id: `pose_${Date.now()}`,
      name,
      pose: JSON.parse(JSON.stringify(debugPose)),
      updatedAt: Date.now(),
    };
    const updated = [...savedPoses, poseToSave];
    const ok = await saveSavedPoses(tenantId, updated);
    if (ok) {
      setSavedPoses(updated);
      setNewPoseName('');
      setPoseModalTab('list');
      showAlert('Sucesso', `Pose "${name}" salva!`);
    } else {
      showAlert('Erro', 'Não foi possível salvar a pose.');
    }
  };

  const handleDeletePose = async (poseId: string) => {
    const updated = savedPoses.filter(p => p.id !== poseId);
    const ok = await saveSavedPoses(tenantId, updated);
    if (ok) {
      setSavedPoses(updated);
      showAlert('Sucesso', 'Pose removida.');
    } else {
      showAlert('Erro', 'Não foi possível remover a pose.');
    }
  };

  // Aplicar uma pose salva: carrega no debugPose para edição
  const handleLoadPose = (pose: SavedPose) => {
    setDebugPose(JSON.parse(JSON.stringify(pose.pose)));
    setDebugPreviewAnim(false);
    setShowPoseModal(false);
  };

  // Equipar uma pose salva numa ação base (Parado/Andando/Correndo/Luta)
  const handleEquipPoseAction = async (pose: SavedPose, action: 'idle' | 'walk' | 'run' | 'attack') => {
    const actionPoses = { ...(config.actionPoses || {}) };
    if (actionPoses[action]) {
      // Já existe uma pose equipada nesta ação: remover (volta a base)
      delete actionPoses[action];
    } else {
      actionPoses[action] = JSON.parse(JSON.stringify(pose.pose));
    }
    const newConfig = { ...config, actionPoses };
    setConfig(newConfig);
    // Persistir imediatamente no banco para não perder o vínculo ao fechar/reabrir
    try {
      await supabase.from('users').update({ avatar_config: newConfig }).eq('id', userData?.uid);
      updateUserDataLocally({ avatarConfig: newConfig });
    } catch (e) {
      console.error('Erro ao persistir actionPoses:', e);
    }
    showAlert('Sucesso', actionPoses[action]
      ? `Pose "${pose.name}" equipada na ação "${ACTION_LABELS[action]}".`
      : `Ação "${ACTION_LABELS[action]}" voltou para a animação padrão.`);
  };

  const [debugTab, setDebugTab] = useState<'item' | 'pose'>('item');
  const [debugBodyPart, setDebugBodyPart] = useState<keyof CharacterPose>('rightArm');
  const [debugPose, setDebugPose] = useState<CharacterPose>({});
  const [debugAnimationFrames, setDebugAnimationFrames] = useState<CharacterPose[]>([]);
  const [debugPreviewAnim, setDebugPreviewAnim] = useState(false);
  const [debugFrameDuration, setDebugFrameDuration] = useState(0.5);
  const [copiedDebugTransform, setCopiedDebugTransform] = useState<ModelTransform | null>(null);
  const [savedPoses, setSavedPoses] = useState<SavedPose[]>([]);
  const [showPoseModal, setShowPoseModal] = useState(false);
  const [poseModalTab, setPoseModalTab] = useState<'list' | 'save'>('list');
  const [newPoseName, setNewPoseName] = useState('');
  const [activeTab, setActiveTab] = useState<'features' | 'hair' | 'clothes'>('features');

  const fetchPresetSkins = async (forceRefresh = false) => {
    try {
      const cacheKey = CACHE_KEYS.presetSkins(tenantId);
      if (!forceRefresh) {
        const cached = sessionCache.get<PresetSkin[]>(cacheKey);
        if (cached) { setPresetSkins(cached); return; }
      }
      let query = supabase.from('preset_skins').select('*');
      if (tenantId) {
        query = query.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
      }
      const { data } = await query;
      const fetched: PresetSkin[] = [];
      if (data) {
        data.forEach(d => {
          fetched.push({ id: d.id, ...d } as PresetSkin);
        });
      }
      sessionCache.set(cacheKey, fetched, CACHE_TTL.PRESET_SKINS);
      setPresetSkins(fetched);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao buscar skins.');
    }
  };

  const fetchModels3d = async (forceRefresh = false) => {
    try {
      const cacheKey = CACHE_KEYS.models3d(tenantId);
      if (!forceRefresh) {
        const cached = sessionCache.get<any[]>(cacheKey);
        if (cached) { setModels3d(cached); return; }
      }
      let query = supabase.from('3d_models').select('*');
      if (tenantId) {
        query = query.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
      }
      const { data } = await query;
      const fetched: any[] = [];
      if (data) {
        data.forEach(d => {
          fetched.push({ id: d.id, ...d });
        });
      }
      sessionCache.set(cacheKey, fetched, CACHE_TTL.MODELS_3D);
      setModels3d(fetched);
    } catch (e) {
      console.error('Erro ao buscar modelos 3D', e);
    }
  };

  useEffect(() => {
    fetchPresetSkins();
    fetchModels3d();
  }, []);

  useEffect(() => {
    localStorage.setItem('avatarCustomizer_showEquippedItems', JSON.stringify(showEquippedItems));
  }, [showEquippedItems]);

  useEffect(() => {
    if (isOpen) {
      if (initialConfig) {
        setConfig(initialConfig);
      } else if (!inline) {
        if (userData?.avatarConfig && !customSaveMode) {
          let loadedConfig = { ...userData.avatarConfig };
          if (loadedConfig.customSkinUrl) {
const isStaff = (userData.role !== 'student' && !userData.studentViewActive) || isAdmin || canSkins;
                const expiry = userData.unlockedSkins?.[loadedConfig.customSkinUrl];
            if (!isStaff && (!expiry || expiry <= Date.now())) {
              loadedConfig.customSkinUrl = '';
            }
          }
          setConfig(loadedConfig);
        } else {
          setConfig({
            gender: 'male',
            skinColor: '#ffcc99',
            hairColor: '#4a3000',
            eyeColor: '#000000',
            hairStyle: 'short',
            mouthStyle: 'smile',
            facialHair: 'none',
            handedness: 'right',
            animationState: 'idle',
          });
        }
      }
    }
  }, [isOpen, initialConfig, userData, customSaveMode, inline]);

  if (!isOpen) return null;

  const hasRandomized = useRef(false);

  useEffect(() => {
    if (inline && !hasRandomized.current && presetSkins.length >= 0) {
      handleRandomize();
      hasRandomized.current = true;
    }
  }, [inline, presetSkins]);

  const handleSave = async () => {
    setSaving(true);
    
    // Set firstEditAt if it doesn't exist
    const configToSave = { ...config };
    if (!configToSave.firstEditAt) {
      configToSave.firstEditAt = Date.now();
    }
    setConfig(configToSave);

    // Remove undefined values to prevent Firestore errors
    const cleanConfig = JSON.parse(JSON.stringify(configToSave));

    try {
      if (!customSaveMode && userData && !inline) {
        await supabase.from('users').update({ avatar_config: cleanConfig }).eq('id', userData.uid);
        if (onSave) {
          onSave(config, monsterName);
        }
        showToast('Personagem salvo com sucesso!', 'success');
      } else {
        if (onSave) {
          onSave(config, monsterName);
        }
        
        if ((userData?.role === 'admin' || isAdmin || canSkins || canModels) && inline && monsterName.trim()) {
          try {
            const { error: insertError } = await supabase.from('preset_skins').insert({
              id: uuidv4(),
              name: monsterName.trim(),
              url: '',
              type: customSaveMode ? 'monster' : 'human',
              baseModelId: config.customModelUrl ? (models3d.find(m => m.url === config.customModelUrl)?.id || null) : null,
              genderTarget: 'unisex',
              config: cleanConfig,
              tenant_id: userData?.tenantId || null,
              is_global: false
            });
            
            if (insertError) {
              console.error("Erro ao salvar na galeria", insertError);
              await showAlert(`Erro ao salvar no banco de dados: ${insertError.message || JSON.stringify(insertError)}`);
            } else {
              await showAlert(`${customSaveMode ? 'Monstro' : 'Personagem'} salvo na galeria com sucesso!`);
            }
          } catch (e) {
            console.error("Erro inesperado ao salvar na galeria", e);
          }
        } else {
          await showAlert('Aparência salva na memória temporária.');
        }
      }
      if (!inline) {
        onClose();
      } else {
        setMonsterName(''); // Limpar o nome para o próximo
      }
    } catch (e) {
      console.error(e);
      await showAlert('Erro ao salvar.');
    }
    setSaving(false);
  };

  useEffect(() => {
    if (config.customSkinUrl && !config.customModelUrl && presetSkins.length > 0 && models3d.length > 0) {
      const activePreset = presetSkins.find(s => s.url === config.customSkinUrl);
      if (activePreset?.baseModelId && activePreset.baseModelId !== 'default') {
        const model = models3d.find(m => m.id === activePreset.baseModelId);
        if (model) {
          setConfig(prev => ({ ...prev, customModelUrl: model.url }));
        }
      }
    }
  }, [config.customSkinUrl, config.customModelUrl, presetSkins, models3d, setConfig]);

  useEffect(() => {
    if (debugItemId && debugMode) {
      const item = equippedItems.find(i => (i.itemId || i.docId) === debugItemId);
      if (!item) return;
      
      const isBattle = config.animationState === 'attack';
      
      let loadedTransform = resolveModelTransform(item, config.gender, config.handedness, isBattle);
      
      // Se não houver transform específico para este gênero, usar um padrão
      // (para não herdar a configuração do outro gênero).
      if (loadedTransform) {
        setDebugTransform(loadedTransform);
      } else {
        setDebugTransform(getDebugDefaultTransform(item));
      }
    }
  }, [config.handedness, config.animationState, config.gender, debugItemId, debugMode, equippedItems]);

  const handleGenderSwap = (targetGender: 'male' | 'female') => {
    if (config.gender === targetGender) return;

    // Clean undefined values from current config before saving
    const currentConfigForBackup = JSON.parse(JSON.stringify(config));
    // Do not recursively save previous backups inside the new backup
    delete currentConfigForBackup.savedOppositeGenderConfig;

    let newConfig: AvatarConfig = {
      ...config,
      gender: targetGender,
      savedOppositeGenderConfig: currentConfigForBackup,
    };

    // Safest approach: remove skin when switching genders to prevent clipping or gender-lock issues
    if (config.customSkinUrl) {
      newConfig.customSkinUrl = undefined;
      newConfig.customModelUrl = undefined;
      if (config.savedPreSkinConfig) {
         // Se estava usando skin, o backup real das peças do outro gênero está em savedPreSkinConfig
         // Então vamos pegar ele, e juntar com a config atual (que não tem as peças, mas tem corpo etc)
         const preSkin = JSON.parse(JSON.stringify(config.savedPreSkinConfig));
         currentConfigForBackup.savedPreSkinConfig = undefined; // prevent nested mess
         newConfig.savedOppositeGenderConfig = { ...currentConfigForBackup, ...preSkin };
         newConfig.savedPreSkinConfig = undefined;
      }
    }

    if (config.savedOppositeGenderConfig) {
      const backup = { ...config.savedOppositeGenderConfig };
      
      newConfig = {
        ...newConfig,
        ...backup,
        gender: targetGender, // ensure it stays targetGender
        savedOppositeGenderConfig: currentConfigForBackup, // restore the backup we just created
      };
    } else {
      // Safe defaults if no backup exists for that gender
      if (targetGender === 'female') {
        newConfig.hairStyle = 'long';
        newConfig.clothingStyle = 'dress';
        newConfig.facialHair = 'none';
      } else {
        newConfig.hairStyle = 'short';
        newConfig.clothingStyle = 't-shirt';
        newConfig.facialHair = 'none';
        newConfig.hairAccessory = 'none';
        newConfig.hairAccessories = [];
        newConfig.lipstickColor = undefined;
      }
    }

    // ===== SANITIZAÇÃO PÓSBACKUP =====
    // Garante que atributos exclusivos do gênero oposto nunca migrem,
    // mesmo que estejam no backup restaurado.
    if (targetGender === 'female') {
      // Mulheres não têm barba/bigode
      newConfig.facialHair = 'none';
      newConfig.facialHairColor = undefined;
      // Estilos de cabelo exclusivamente masculinos não migram
      const maleOnlyHair = ['spiky', 'mohawk', 'messy'];
      if (maleOnlyHair.includes(newConfig.hairStyle || '')) {
        newConfig.hairStyle = 'long';
      }
    } else {
      // Homens não têm acessórios de cabelo femininos nem batom
      const femaleOnlyAccessories = ['bow', 'flower', 'headband'];
      const currentAccs = newConfig.hairAccessories || (newConfig.hairAccessory ? [newConfig.hairAccessory] : []);
      newConfig.hairAccessories = currentAccs.filter(a => !femaleOnlyAccessories.includes(a));
      if (femaleOnlyAccessories.includes(newConfig.hairAccessory || '')) {
        newConfig.hairAccessory = 'none';
      }
      newConfig.lipstickColor = undefined;
      // Estilos de cabelo exclusivamente femininos não migram
      const femaleOnlyHair = ['ponytail', 'bun', 'braid', 'pigtails', 'bob'];
      if (femaleOnlyHair.includes(newConfig.hairStyle || '')) {
        newConfig.hairStyle = 'short';
      }
      // Peças de roupa exclusivamente femininas → t-shirt
      const femaleOnlyClothing = ['dress', 'skirt', 'crop-top', 'overalls'];
      if (femaleOnlyClothing.includes(newConfig.clothingStyle || '')) {
        newConfig.clothingStyle = 't-shirt';
      }
      // Sapatos exclusivamente femininos → sneakers
      const femaleOnlyShoes = ['flats', 'heels'];
      if (femaleOnlyShoes.includes(newConfig.shoeStyle || '')) {
        newConfig.shoeStyle = 'sneakers';
      }
    }

    setConfig(newConfig);
  };


  const handleEquipSkin = (skinUrl: string, modelUrl?: string) => {
    let newConfig = { ...config, customSkinUrl: skinUrl, customModelUrl: modelUrl };
    if (!config.customSkinUrl) {
      newConfig.savedPreSkinConfig = {
        hairStyle: config.hairStyle,
        hairAccessories: config.hairAccessories,
        accessoryColors: config.accessoryColors,
        hairTieColor: config.hairTieColor,
        ponytailLength: config.ponytailLength,
        ponytailThickness: config.ponytailThickness,
        ponytailAngle: config.ponytailAngle,
        hairAccessory: config.hairAccessory,
        accessoryColor: config.accessoryColor
      };
    }
    newConfig.hairStyle = 'bald';
    newConfig.hairAccessories = [];
    newConfig.hairAccessory = 'none';
    setConfig(newConfig);
  };

  const handleUnequipSkin = () => {
    if (config.savedPreSkinConfig) {
      const restored = { ...config, ...config.savedPreSkinConfig, customSkinUrl: '', customModelUrl: undefined };
      delete restored.savedPreSkinConfig;
      setConfig(restored);
    } else {
      setConfig({ ...config, customSkinUrl: '', customModelUrl: undefined });
    }
  };

  const handleRandomize = () => {
    const randomItem = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
    
    // Sugerir da galeria global
    const availableSkins = presetSkins.filter(s => 
      (s.type || 'human') === (customSaveMode ? 'monster' : 'human') &&
      (!s.genderTarget || s.genderTarget === 'both' || s.genderTarget === config.gender)
    );
    if (availableSkins.length > 0 && Math.random() < 0.4) {
      const selected = randomItem(availableSkins);
      if (selected.config) {
        setConfig(selected.config);
        return;
      }
    }

    if (customSaveMode) {
      setConfig({
        ...config,
        gender: randomItem(['male', 'female']),
        skinColor: randomItem(MONSTER_SKIN_COLORS),
        hairColor: randomItem(MONSTER_HAIR_COLORS),
        eyeColor: randomItem(MONSTER_EYE_COLORS),
        shirtColor: randomItem(CLOTHES_COLORS),
        pantsColor: randomItem(CLOTHES_COLORS),
        clothingStyle: randomItem(['t-shirt', 'pants-shirt', 'tank-top', 'dress']),
        hairStyle: randomItem(HAIR_STYLES),
        facialHair: randomItem(FACIAL_HAIR_STYLES),
        mouthStyle: randomItem(MOUTH_STYLES),
        customSkinUrl: ''
      });
    } else {
      const newGender = randomItem(['male', 'female']);
      const isFemale = newGender === 'female';
      const acc1 = isFemale ? randomItem(['none', 'none', 'bow', 'flower', 'headband']) : 'none';
      let acc2 = 'none';
      if (isFemale && acc1 !== 'none') {
        const remainingOptions = ['none', 'bow', 'flower', 'headband'].filter(opt => opt === 'none' || opt !== acc1);
        acc2 = randomItem(remainingOptions);
      }
      
      setConfig({
        ...config,
        gender: newGender,
        skinColor: randomItem(SKIN_COLORS),
        hairColor: randomItem(HAIR_COLORS),
        eyeColor: randomItem(EYE_COLORS),
        eyeStyle: randomItem(['classic', 'cute', 'oriental', 'oriental-2', 'oriental-3', 'dot', 'tired']),
        lipstickColor: isFemale ? randomItem(LIPSTICK_COLORS) : '#4a0404',
        shirtColor: randomItem(CLOTHES_COLORS),
        pantsColor: randomItem(CLOTHES_COLORS),
        clothingStyle: isFemale ? randomItem(['t-shirt', 'pants-shirt', 'tank-top', 'dress', 'skirt', 'crop-top', 'overalls', 'suit']) : randomItem(['t-shirt', 'pants-shirt', 'tank-top', 'overalls', 'suit']),
        hairStyle: isFemale ? randomItem(['long', 'ponytail', 'bun', 'braid', 'pigtails', 'bob', 'curly', 'bald']) : randomItem(['short', 'long', 'spiky', 'mohawk', 'messy', 'curly', 'bald']),
        hairTieColor: randomItem(HAIR_COLORS),
        facialHair: !isFemale ? randomItem(FACIAL_HAIR_STYLES) : 'none',
        mouthStyle: randomItem(MOUTH_STYLES),
        glasses: randomItem(['none', 'none', 'classic']),
        glassesColor: randomItem(CLOTHES_COLORS),
        hairAccessories: [acc1, acc2],
        accessoryColors: [randomItem([...HAIR_COLORS, ...CLOTHES_COLORS]), randomItem([...HAIR_COLORS, ...CLOTHES_COLORS])],
        customSkinUrl: ''
      });
    }
  };

  const isGenderLocked = (() => {
    if ((isAdmin || customSaveMode) && !userData?.studentViewActive) return false;
    if (userData?.studentViewActive) return !config.firstEditAt ? false : (Date.now() >= (config.firstEditAt + 15 * 60 * 1000) && !config.genderUnlockUntil);
    if (userData?.role === 'admin' || userData?.role === 'teacher') return false;
    if (!config.firstEditAt) return false;
    const now = Date.now();
    const isWithinFirst15Min = now < config.firstEditAt + 15 * 60 * 1000;
    const hasUnlockActive = config.genderUnlockUntil && now < config.genderUnlockUntil;
    return !isWithinFirst15Min && !hasUnlockActive;
  })();

  return (
    <div className={inline ? '' : 'modal-overlay'} style={inline ? { width: '100%' } : {}}>
      <div className={inline ? '' : 'glass-panel modal-content modal-content-lg'} style={{
        width: '100%', maxWidth: inline ? '100%' : '1000px',
        padding: 0,
        overflowY: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {!inline && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: '1.5rem', right: '1.5rem',
              background: 'none', border: 'none',
              color: 'var(--text-secondary)', cursor: 'pointer',
              padding: '0.5rem',
              zIndex: 99
            }}
          >
            <X size={24} />
          </button>
        )}

        <div style={{ flexShrink: 0, padding: inline ? '0' : '1rem 1rem 0.5rem 1rem', borderBottom: inline ? 'none' : '1px solid var(--border-glass)', zIndex: 11 }}>
          {!inline && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', justifyContent: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1rem', textTransform: 'uppercase' }}>
                {customSaveMode ? 'Personalizar Monstro' : 'Personalizar Personagem'}
              </h2>
            </div>
          )}
          {(canSkins || canModels || canDebug) && !inline && (
            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.25rem', fontSize: '0.75rem', flexWrap: 'wrap' }}>
              {canSkins && (
                <button 
                  onClick={() => setShowAdminManager(true)}
                  style={{ flex: 1, padding: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', background: 'var(--bg-card)', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  <Settings size={12} /> <span className="hide-on-mobile">Skins</span>
                </button>
              )}
              {canModels && (
                <button 
                  onClick={() => setShowAdmin3dManager(true)}
                  style={{ flex: 1, padding: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', background: 'var(--bg-card)', border: '1px solid #10b981', color: '#10b981', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  <Settings size={12} /> <span className="hide-on-mobile">Moldes</span>
                </button>
              )}
              {canDebug && (
                <button 
                  onClick={() => setDebugMode(!debugMode)}
                  style={{ flex: 1, padding: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', background: debugMode ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-card)', border: debugMode ? '2px solid #f59e0b' : '1px solid #f59e0b', color: '#f59e0b', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  🔧 <span className="hide-on-mobile">Debug</span>
                </button>
              )}
            </div>
          )}
          {debugMode && (
            <DraggableWidget id="debug_panel" defaultPos={{x: 250, y: 20}}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem', fontSize: '0.9rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <p style={{ margin: 0, color: '#f59e0b', fontWeight: 'bold' }}>🔧 Debug {debugTab === 'item' ? 'Transform' : 'Pose'}</p>
                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                   <button
onClick={() => setConfig(prev => {
                        const newGender = prev.gender === 'female' ? 'male' : 'female';
                        const newId = debugItemId;
                        if (newId) {
                          const item = equippedItems.find(i => (i.itemId || i.docId) === newId);
                          const isBattle = prev.animationState === 'attack';
                          const t = resolveModelTransform(item, newGender, prev.handedness, isBattle);
                          if (t) setDebugTransform(t);
                          else setDebugTransform(getDebugDefaultTransform(item));
                        }
                        // Sanitiza o estilo de cabelo para o novo gênero (evita herdar
                        // estilos exclusivos do gênero oposto ao alternar no Debug)
                        const next = { ...prev, gender: newGender };
                        const maleOnlyHair = ['spiky', 'mohawk', 'messy'];
                        const femaleOnlyHair = ['ponytail', 'bun', 'braid', 'pigtails', 'bob'];
                        if (newGender === 'female' && maleOnlyHair.includes(next.hairStyle || '')) {
                          next.hairStyle = 'long';
                        } else if (newGender === 'male' && femaleOnlyHair.includes(next.hairStyle || '')) {
                          next.hairStyle = 'short';
                        }
                        return next;
                      })}
                     style={{ padding: '0.25rem 0.5rem', background: 'rgba(139, 92, 246, 0.2)', color: '#c4b5fd', border: '1px solid #8b5cf6', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}
                     title="Alternar gênero da configuração 3D"
                   >
                     👤 {config.gender === 'female' ? 'Feminino' : 'Masculino'}
                   </button>
                   <button onClick={() => setDebugTab('item')} style={{ padding: '0.25rem 0.5rem', background: debugTab === 'item' ? '#f59e0b' : 'transparent', color: debugTab === 'item' ? '#000' : '#f59e0b', border: '1px solid #f59e0b', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}>🗡️ Item</button>
                   <button onClick={() => setDebugTab('pose')} style={{ padding: '0.25rem 0.5rem', background: debugTab === 'pose' ? '#f59e0b' : 'transparent', color: debugTab === 'pose' ? '#000' : '#f59e0b', border: '1px solid #f59e0b', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}>🧍 Pose</button>
                </div>
              </div>

              {debugTab === 'item' && (
                <>
                  <div style={{ marginBottom: '0.25rem' }}>
                    <select 
                      value={debugItemId || ''} 
                      onChange={(e) => {
                        const newId = e.target.value;
                        setDebugItemId(newId);
                        if (newId) {
                          const item = equippedItems.find(i => (i.itemId || i.docId) === newId);
                          const isBattle = config.animationState === 'attack';
                          
                          let loadedTransform = resolveModelTransform(item, config.gender, config.handedness, isBattle);
                          
                          if (loadedTransform) {
                            setDebugTransform(loadedTransform);
                          } else {
                            setDebugTransform(getDebugDefaultTransform(item));
                          }
                        }
                      }}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.5)', color: '#f59e0b', border: '1px solid #f59e0b', borderRadius: '4px', padding: '0.25rem' }}
                    >
                      <option value="">Selecione um item...</option>
                      {equippedItems.filter(i => i.gameModelUrl || i.minecraftHeadValue).map(item => (
                        <option key={item.itemId || item.docId} value={item.itemId || item.docId}>{item.itemTitle}</option>
                      ))}
                    </select>
                  </div>
                  {[
                    { label: 'Pos X', key: 'posX' as const, min: -30, max: 30, step: 0.5 },
                    { label: 'Pos Y', key: 'posY' as const, min: -30, max: 10, step: 0.5 },
                    { label: 'Pos Z', key: 'posZ' as const, min: -30, max: 30, step: 0.5 },
                    { label: 'Rot X', key: 'rotX' as const, min: -Math.PI, max: Math.PI, step: 0.05 },
                    { label: 'Rot Y', key: 'rotY' as const, min: -Math.PI, max: Math.PI, step: 0.05 },
                    { label: 'Rot Z', key: 'rotZ' as const, min: -Math.PI, max: Math.PI, step: 0.05 },
                    { label: 'Slide', key: 'slide' as const, min: -40, max: 20, step: 1 },
                    { label: 'Scale', key: 'scale' as const, min: 0.1, max: 100, step: 0.1 },
                    { label: 'Thick', key: 'thickness' as const, min: 0.1, max: 10, step: 0.1 },
                    { label: 'Curve X', key: 'curveX' as const, min: -10, max: 10, step: 0.01 },
                    { label: 'Curve Y', key: 'curveY' as const, min: -10, max: 10, step: 0.01 },
                  ].map(({ label, key, min, max, step }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ width: '42px', color: '#f59e0b', fontFamily: 'monospace', fontWeight: 'bold' }}>{label}</span>
                      <input 
                        type="range" 
                        min={min} max={max} step={step}
                        value={debugTransform[key] ?? (key.startsWith('curve') ? 0 : 16)} 
                        onChange={(e) => setDebugTransform(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                        style={{ flex: 1, accentColor: '#f59e0b' }}
                      />
                      <span style={{ width: '55px', textAlign: 'right', color: '#fbbf24', fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 'bold' }}>{(debugTransform[key] ?? (key === 'scale' ? 16 : 0)).toFixed(2)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      onClick={() => {
                        const code = `posX: ${debugTransform.posX}, posY: ${debugTransform.posY}, posZ: ${debugTransform.posZ}, rotX: ${debugTransform.rotX.toFixed(4)}, rotY: ${debugTransform.rotY.toFixed(4)}, rotZ: ${debugTransform.rotZ.toFixed(4)}, slide: ${debugTransform.slide}, scale: ${debugTransform.scale}, thickness: ${debugTransform.thickness}, curveX: ${debugTransform.curveX || 0}, curveY: ${debugTransform.curveY || 0}`;
                        navigator.clipboard.writeText(code).catch(() => {});
                        setCopiedDebugTransform({ ...debugTransform });
                        showAlert('Valores copiados! Use "Colar Valores" em outro item.');
                      }}
                      style={{ flex: 1, padding: '0.5rem', background: 'var(--bg-card)', color: '#f59e0b', border: '1px solid #f59e0b', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                    >
                      📋 Copiar Valores
                    </button>
                    <button
                      onClick={() => {
                        // Colar do estado copiado (ou tentar ler o clipboard de texto)
                        if (copiedDebugTransform) {
                          setDebugTransform({ ...copiedDebugTransform });
                          showAlert('Valores colados a partir da última cópia!');
                          return;
                        }
                        navigator.clipboard.readText().then(text => {
                          const match = text.match(/posX:\s*(-?[\d.]+).*?posY:\s*(-?[\d.]+).*?posZ:\s*(-?[\d.]+).*?rotX:\s*(-?[\d.]+).*?rotY:\s*(-?[\d.]+).*?rotZ:\s*(-?[\d.]+).*?slide:\s*(-?[\d.]+).*?scale:\s*(-?[\d.]+).*?thickness:\s*(-?[\d.]+).*?curveX:\s*(-?[\d.]+).*?curveY:\s*(-?[\d.]+)/s);
                          if (match) {
                            const [, posX, posY, posZ, rotX, rotY, rotZ, slide, scale, thickness, curveX, curveY] = match.map(Number);
                            setDebugTransform({ posX, posY, posZ, rotX, rotY, rotZ, slide, scale, thickness, curveX, curveY });
                            showAlert('Valores colados a partir do clipboard!');
                          } else {
                            showAlert('Nenhum valor no clipboard no formato esperado. Copie primeiro.');
                          }
                        }).catch(() => {
                          showAlert('Copie os valores primeiro (botão "Copiar Valores") para poder colar.');
                        });
                      }}
                      style={{ flex: 1, padding: '0.5rem', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid #10b981', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                    >
                      📥 Colar Valores
                    </button>
                    <button
                      onClick={async () => {
                        let targetItem = null;
                        if (debugItemId) {
                          targetItem = equippedItems.find(i => (i.itemId === debugItemId || i.docId === debugItemId));
                        } else {
                          targetItem = equippedItems.find(i => i.avatarPart === 'two_handed' || i.avatarPart === 'hand' || i.avatarPart === 'rightHand' || i.avatarPart === 'leftHand');
                        }
                        
                        if (!targetItem || !targetItem.itemId) {
                          showAlert('Nenhum item válido selecionado para salvar a configuração!');
                          return;
                        }
                        try {
                          const isBattle = config.animationState === 'attack';
                          const isLeftHanded = config.handedness === 'left';
                          const transformKey = config.gender === 'female'
                            ? (isBattle ? (isLeftHanded ? 'battle_left_female' : 'battle_female') : (isLeftHanded ? 'common_left_female' : 'common_female'))
                            : (isBattle ? (isLeftHanded ? 'battle_left' : 'battle') : (isLeftHanded ? 'common_left' : 'common'));
                          
                          // 1. Save to store_items (também grava a chave "common" universal,
                          // para a pré-visualização na loja/bazar respeitar a configuração
                          // independente do gênero/mão do comprador)
                          const { data: storeItemSnap } = await supabase.from('store_items').select('data').eq('id', targetItem.itemId).single();
                          if (storeItemSnap) {
                            const prevTransforms = (storeItemSnap.data as any).modelTransforms || {};
                            const newStoreData = { 
                              ...(storeItemSnap.data as any), 
                              modelTransforms: { ...prevTransforms, [transformKey]: debugTransform, common: { ...debugTransform } } 
                            };
                            await supabase.from('store_items').update({ data: newStoreData }).eq('id', targetItem.itemId);
                          }
                          
                          // 2. Cascade to user_items
                          const { data: snapUserItems } = await supabase.from('user_items').select('id, data').eq('item_id', targetItem.itemId);
                          if (snapUserItems) {
                            for (const d of snapUserItems) {
                              const prevTransforms = (d.data as any).modelTransforms || {};
                              const newUserData = { 
                                ...(d.data as any), 
                                modelTransforms: { ...prevTransforms, [transformKey]: debugTransform, common: { ...debugTransform } } 
                              };
                              await supabase.from('user_items').update({ data: newUserData }).eq('id', d.id);
                            }
                          }
                          if (onPositionsSaved) onPositionsSaved();
                          
                          showAlert(`Configuração de transformação (${transformKey}) salva com sucesso em todos os inventários!`);
                        } catch (e) {
                          console.error(e);
                          showAlert('Erro ao salvar no banco de dados.');
                        }
                      }}
                      style={{ flex: 1, padding: '0.5rem', background: '#f59e0b', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                    >
                      💾 Salvar no BD
                    </button>
                  </div>
                </>
              )}

              {debugTab === 'pose' && (
                <>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <select 
                      value={debugBodyPart}
                      onChange={(e) => setDebugBodyPart(e.target.value as keyof CharacterPose)}
                      style={{ flex: 1, background: 'rgba(0,0,0,0.5)', color: '#f59e0b', border: '1px solid #f59e0b', borderRadius: '4px', padding: '0.25rem' }}
                    >
                      <option value="rightArm">Braço Direito</option>
                      <option value="leftArm">Braço Esquerdo</option>
                      <option value="rightLeg">Perna Direita</option>
                      <option value="leftLeg">Perna Esquerda</option>
                      <option value="body">Corpo</option>
                      <option value="head">Cabeça</option>
                    </select>
                  </div>
                  {[
                    { label: 'Rot X', key: 'rx' as const },
                    { label: 'Rot Y', key: 'ry' as const },
                    { label: 'Rot Z', key: 'rz' as const },
                  ].map(({ label, key }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ width: '42px', color: '#f59e0b', fontFamily: 'monospace', fontWeight: 'bold' }}>{label}</span>
                      <input 
                        type="range" 
                        min={-Math.PI} max={Math.PI} step={0.05}
                        value={debugPose[debugBodyPart]?.[key] ?? 0} 
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setDebugPose(prev => ({
                            ...prev,
                            [debugBodyPart]: {
                              ...(prev[debugBodyPart] || { rx: 0, ry: 0, rz: 0 }),
                              [key]: val
                            }
                          }));
                          setDebugPreviewAnim(false);
                        }}
                        style={{ flex: 1, accentColor: '#f59e0b' }}
                      />
                      <span style={{ width: '55px', textAlign: 'right', color: '#fbbf24', fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 'bold' }}>{(debugPose[debugBodyPart]?.[key] ?? 0).toFixed(2)}</span>
                    </div>
                  ))}
                  
                  {/* Frames / Animação */}
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '4px' }}>
                    <p style={{ margin: '0 0 0.5rem 0', color: '#f59e0b', fontSize: '0.8rem', fontWeight: 'bold' }}>Animação de Batalha (Frames: {debugAnimationFrames.length})</p>
                    <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
                      <button 
                        onClick={() => {
                          setDebugAnimationFrames([...debugAnimationFrames, JSON.parse(JSON.stringify(debugPose))]);
                          setDebugPreviewAnim(false);
                        }}
                        style={{ flex: 1, padding: '0.25rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                      >+ Add Frame</button>
                      <button 
                        onClick={() => {
                          if (debugAnimationFrames.length > 0) {
                            const newFrames = [...debugAnimationFrames];
                            newFrames.pop();
                            setDebugAnimationFrames(newFrames);
                            setDebugPreviewAnim(false);
                          }
                        }}
                        style={{ padding: '0.25rem', background: '#eab308', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                      >Desfazer</button>
                      <button 
                        onClick={() => {
                          setDebugAnimationFrames([]);
                          setDebugPreviewAnim(false);
                        }}
                        style={{ padding: '0.25rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                      >Limpar</button>
                      <button 
                        onClick={() => setDebugPreviewAnim(prev => !prev)}
                        style={{ flex: 1, padding: '0.25rem', background: debugPreviewAnim ? '#8b5cf6' : 'transparent', color: debugPreviewAnim ? '#fff' : '#a78bfa', border: '1px solid #8b5cf6', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                        title="Alternar entre editar a pose e visualizar a animação dos frames"
                      >
                        {debugPreviewAnim ? '⏹ Parar Preview' : '▶ Preview'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <span style={{ color: '#f59e0b', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>Tempo/frame</span>
                      <input 
                        type="range" 
                        min={0.1} max={3} step={0.1}
                        value={debugFrameDuration}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setDebugFrameDuration(val);
                          setDebugPreviewAnim(false);
                        }}
                        style={{ flex: 1, accentColor: '#f59e0b' }}
                      />
                      <span style={{ width: '50px', textAlign: 'right', color: '#fbbf24', fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 'bold' }}>{debugFrameDuration.toFixed(1)}s</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                    <select 
                      value={debugItemId || ''} 
                      onChange={(e) => {
                        setDebugItemId(e.target.value);
                        const item = equippedItems.find(i => (i.itemId === e.target.value || i.docId === e.target.value));
                        if (item) {
                          const isBattle = config.animationState === 'attack';
                          let loadedTransform = resolveModelTransform(item, config.gender, config.handedness, isBattle);
                          if (loadedTransform) setDebugTransform(loadedTransform);
                          else setDebugTransform(getDebugDefaultTransform(item));
                        }
                      }}
                      style={{ flex: 1, background: 'rgba(0,0,0,0.5)', color: '#f59e0b', border: '1px solid #f59e0b', borderRadius: '4px', padding: '0.25rem' }}
                    >
                      <option value="">Vincular Animação/Pose ao Item...</option>
                      {equippedItems.filter(i => i.gameModelUrl || i.minecraftHeadValue || i.avatarPart === 'hand' || i.avatarPart === 'two_handed').map(item => (
                        <option key={item.itemId || item.docId} value={item.itemId || item.docId}>{item.itemTitle}</option>
                      ))}
                    </select>
                    <button
                      onClick={async () => {
                        let targetItem = null;
                        if (debugItemId) {
                          targetItem = equippedItems.find(i => (i.itemId === debugItemId || i.docId === debugItemId));
                        }
                        
                        // Se tiver frames, salva como animação, se não salva apenas a pose atual como 1 frame
                        const framesToSave = debugAnimationFrames.length > 0 ? debugAnimationFrames : [JSON.parse(JSON.stringify(debugPose))];
                        const customAnimation = { frames: framesToSave, loop: false, duration: 1000 };

                        // SEM item selecionado → vincular a animação ao PERSONAGEM (ação Lutando)
                        if (!targetItem) {
                          const actionPoses = { ...(config.actionPoses || {}) };
                          actionPoses.attack = framesToSave[0];
                          const newConfig = { ...config, actionPoses };
                          setConfig(newConfig);
                          try {
                            await supabase.from('users').update({ avatar_config: newConfig }).eq('id', userData?.uid);
                            updateUserDataLocally({ avatarConfig: newConfig });
                          } catch (e) {
                            console.error('Erro ao persistir animação do personagem:', e);
                          }
                          showAlert('Animaça/pose de Luta vinculada ao PERSONAGEM.');
                          return;
                        }

                        if (!targetItem.itemId) {
                          showAlert('Item inválido!');
                          return;
                        }
                        try {
                          // 1. Save to store_items
                          const { data: storeItemSnap } = await supabase.from('store_items').select('data').eq('id', targetItem.itemId).single();
                          if (storeItemSnap) {
                            const newStoreData = { ...(storeItemSnap.data as any), customAnimation };
                            await supabase.from('store_items').update({ data: newStoreData }).eq('id', targetItem.itemId);
                          }
                          
                          // 2. Cascade to user_items
                          const { data: snapUserItems } = await supabase.from('user_items').select('id, data').eq('item_id', targetItem.itemId);
                          if (snapUserItems) {
                            for (const d of snapUserItems) {
                              const newUserData = { ...(d.data as any), customAnimation };
                              await supabase.from('user_items').update({ data: newUserData }).eq('id', d.id);
                            }
                          }
                          
                          const isDefenseItem = targetItem.itemCategory === 'defense';
                          showAlert(`Animaça/pose salva no item "${targetItem.itemTitle || targetItem.itemId}" (${isDefenseItem ? 'defesa — dispara ao levar dano' : 'ataque — dispara ao atacar'}).`);
                          if (onPositionsSaved) onPositionsSaved();
                        } catch (e) {
                          console.error(e);
                          showAlert('Erro ao salvar animação no banco de dados.');
                        }
                      }}
                      style={{ padding: '0.5rem', background: '#f59e0b', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                    >💾 Salvar Animação no BD</button>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button
                        onClick={() => { setPoseModalTab('save'); setShowPoseModal(true); }}
                        style={{ flex: 1, padding: '0.5rem', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid #10b981', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                      >📥 Salvar Pose</button>
                      <button
                        onClick={() => { loadSavedPoses(); setPoseModalTab('list'); setShowPoseModal(true); }}
                        style={{ flex: 1, padding: '0.5rem', background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', border: '1px solid #8b5cf6', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                      >📚 Poses Salvas</button>
                    </div>
                  </div>
                </>
              )}
            </DraggableWidget>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: inline ? '0' : '1.5rem 2rem' }}>
          <div className="avatar-modal-grid">
          
          <div className={`avatar-viewer-container ${isMobileDrawerOpen ? 'drawer-open' : ''}`}>
            {/* Controle de Zoom */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', zIndex: 5 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Zoom:</span>
              <button onClick={() => setViewerZoom(v => Math.max(0.4, +(v - 0.1).toFixed(2)))} style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Diminuir">−</button>
              <span style={{ fontSize: '0.85rem', color: 'var(--gold-primary)', fontWeight: 'bold', minWidth: '38px', textAlign: 'center' }}>{Math.round(viewerZoom * 100)}%</span>
              <button onClick={() => setViewerZoom(v => Math.min(2.5, +(v + 0.1).toFixed(2)))} style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Aumentar">+</button>
              <button onClick={() => setViewerZoom(1)} style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', background: 'transparent', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem' }} title="Resetar zoom">Resetar</button>
            </div>

            {/* Avatar com zoom aplicado */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flex: 1, width: '100%', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ transform: `scale(${viewerZoom})`, transformOrigin: 'center bottom', transition: 'transform 0.2s ease-out' }}>
            {(() => {
              const activePreset = presetSkins.find(s => s.url === config.customSkinUrl);
              const activeModel = activePreset?.baseModelId && activePreset.baseModelId !== 'default' 
                ? models3d.find(m => m.id === activePreset.baseModelId) 
                : null;

              if (activeModel) {
                return <CustomModelViewer modelUrl={activeModel.url} textureUrl={config.customSkinUrl} animation={config.animationState || 'idle'} size={window.innerWidth <= 768 ? 160 : 220} />;
              }
              return <AvatarCharacter config={config} equippedItems={showEquippedItems ? equippedItems : []} size={window.innerWidth <= 768 ? 160 : 220} animation={config.animationState || 'idle'} interactive={true} debugItemTransform={debugMode ? debugTransform : null} debugItemId={debugMode ? debugItemId : null} debugPose={debugMode ? debugPose : undefined} debugAnimationFrames={debugMode ? debugAnimationFrames : undefined} debugPreviewAnim={debugPreviewAnim} debugAnimationDuration={debugFrameDuration} actionPoses={config.actionPoses} faceCamera={true} />;
            })()}
            </div>
            </div>
            
            {/* Draggable Controls Widget */}
            <DraggableWidget id="anim_controller" defaultPos={{x: 20, y: 20}}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mão:</span>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={() => handleHandednessChange('right')} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRadius: '12px', background: config.handedness !== 'left' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', border: config.handedness !== 'left' ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)', color: config.handedness !== 'left' ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer' }}>Destro</button>
                    <button onClick={() => handleHandednessChange('left')} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRadius: '12px', background: config.handedness === 'left' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', border: config.handedness === 'left' ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)', color: config.handedness === 'left' ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer' }}>Canhoto</button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                  <button onClick={() => setConfig({ ...config, animationState: 'idle' })} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: (!config.animationState || config.animationState === 'idle') ? 'var(--gold-primary)' : 'var(--bg-card)', color: (!config.animationState || config.animationState === 'idle') ? '#000' : 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '12px', cursor: 'pointer' }}>Parado</button>
                  <button onClick={() => setConfig({ ...config, animationState: 'walk' })} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: config.animationState === 'walk' ? 'var(--gold-primary)' : 'var(--bg-card)', color: config.animationState === 'walk' ? '#000' : 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '12px', cursor: 'pointer' }}>Andando</button>
                  <button onClick={() => setConfig({ ...config, animationState: 'run' })} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: config.animationState === 'run' ? 'var(--gold-primary)' : 'var(--bg-card)', color: config.animationState === 'run' ? '#000' : 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '12px', cursor: 'pointer' }}>Correndo</button>
                  <button onClick={() => setConfig({ ...config, animationState: 'attack' })} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: config.animationState === 'attack' ? 'var(--accent-red)' : 'var(--bg-card)', color: config.animationState === 'attack' ? '#fff' : 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '12px', cursor: 'pointer' }}>Luta</button>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-primary)', justifyContent: 'center', marginTop: '0.25rem' }}>
                  <input type="checkbox" checked={showEquippedItems} onChange={(e) => setShowEquippedItems(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--gold-primary)' }} />
                  Mostrar Itens Equipados
                </label>

                <button onClick={handleRandomize} className="hover-brightness" style={{ padding: '0.5rem', width: '100%', background: 'var(--bg-card)', color: 'var(--gold-primary)', border: '1px solid var(--gold-primary)', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'bold', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  <Dices size={16} /> Aleatorizar
                </button>
              </div>
            </DraggableWidget>
          </div>

            <button 
              className="mobile-drawer-toggle"
              onClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
              style={{
                display: 'none',
                position: 'absolute',
                bottom: '1rem',
                right: '1rem',
                zIndex: 105,
                background: 'var(--gold-primary)',
                color: '#000',
                border: 'none',
                borderRadius: '50%',
                width: '48px',
                height: '48px',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                cursor: 'pointer'
              }}
            >
              <Settings size={24} />
            </button>

          {/* Controls */}
          <div className={`avatar-options-container ${isMobileDrawerOpen ? 'drawer-open' : ''}`} style={{ minWidth: 0 }}>
            {isMobileDrawerOpen && (
              <button 
                onClick={() => setIsMobileDrawerOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '1rem',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  width: '100%',
                  borderBottom: '1px solid var(--border-color)',
                  marginBottom: '1rem'
                }}
              >
                <X size={20} /> Fechar Opções
              </button>
            )}
            
            {customSaveMode && (
              <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--accent-primary)', borderRadius: '8px' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Skins de Monstro Pré-definidas</label>
                <HorizontalScrollList>
                  <button
                    onClick={handleUnequipSkin}
                    style={{
                       padding: '0.5rem', background: !config.customSkinUrl ? 'var(--accent-primary)' : 'var(--btn-bg)', border: !config.customSkinUrl ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: !config.customSkinUrl ? '#fff' : 'white', fontSize: '0.85rem', flexShrink: 0
                    }}
                  >
                    Nenhum
                  </button>
                  {presetSkins.filter(s => s.type === 'monster').map(skin => (
                    <button
                      key={skin.id}
                      onClick={() => {
                        const modelUrl = skin.baseModelId && skin.baseModelId !== 'default' 
                          ? models3d.find(m => m.id === skin.baseModelId)?.url 
                          : undefined;
                        handleEquipSkin(skin.url, modelUrl);
                      }}
                      style={{
                         padding: '0.5rem', background: config.customSkinUrl === skin.url ? 'var(--accent-primary)' : 'var(--btn-bg)', border: config.customSkinUrl === skin.url ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: config.customSkinUrl === skin.url ? '#fff' : 'white', fontSize: '0.85rem', flexShrink: 0
                      }}
                    >
                      {skin.name}
                    </button>
                  ))}
                </HorizontalScrollList>
              </div>
            )}
            
            {!customSaveMode && (() => {
              const availableSkins = presetSkins.filter(s => {
                if ((s.type || 'human') !== 'human') return false;
                // Quem tem permissão de "Skins" (ou é staff) vê TODAS as skins cadastradas;
                // aluno comum só vê as que desbloqueou.
                const canSeeAll = (userData?.role !== 'student' && !userData?.studentViewActive) || isAdmin || canSkins;
                if (!canSeeAll) {
                  const expiry = userData?.unlockedSkins?.[s.url];
                  if (!expiry || expiry <= Date.now()) return false;
                }
                if (s.genderTarget && s.genderTarget !== 'both' && s.genderTarget !== config.gender) return false;
                return true;
              });

              if (availableSkins.length === 0) return null;

              return (
                <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Skins Pré-definidas</label>
                  <HorizontalScrollList>
                    <button
                      onClick={handleUnequipSkin}
                      style={{
                         padding: '0.5rem', background: !config.customSkinUrl ? 'var(--accent-primary)' : 'var(--btn-bg)', border: !config.customSkinUrl ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: !config.customSkinUrl ? '#fff' : 'var(--text-primary)', fontSize: '0.85rem', flexShrink: 0
                      }}
                    >
                      Nenhuma
                    </button>
                    {availableSkins.map(skin => {
                      const expiry = userData?.unlockedSkins?.[skin.url];
                      const daysLeft = expiry ? Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
                      return (
                      <button
                        key={skin.id}
                        onClick={() => handleEquipSkin(skin.url)}
                        style={{
                           padding: '0.5rem', background: config.customSkinUrl === skin.url ? 'var(--accent-primary)' : 'var(--btn-bg)', border: config.customSkinUrl === skin.url ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: config.customSkinUrl === skin.url ? '#fff' : 'var(--text-primary)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', flexShrink: 0
                        }}
                      >
                        <span>{skin.name}</span>
                        {(!isAdmin && userData?.role === 'student' && daysLeft > 0) && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)' }}>{daysLeft} {daysLeft === 1 ? 'dia' : 'dias'} rest.</span>
                        )}
                      </button>
                    )})}
                  </HorizontalScrollList>
                </div>
              );
            })()}
            
            {/* ABAS */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <button 
                onClick={() => setActiveTab('features')}
                style={{ flex: 1, padding: '0.5rem', background: activeTab === 'features' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'features' ? 'var(--text-on-gold, #000)' : 'var(--text-primary)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >Características</button>
              <button 
                onClick={() => setActiveTab('hair')}
                style={{ flex: 1, padding: '0.5rem', background: activeTab === 'hair' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'hair' ? 'var(--text-on-gold, #000)' : 'var(--text-primary)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >{(config.gender === 'male' || !config.gender) || customSaveMode ? 'Cabelo e Pelos Faciais' : 'Cabelo'}</button>
              <button 
                onClick={() => setActiveTab('clothes')}
                style={{ flex: 1, padding: '0.5rem', background: activeTab === 'clothes' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'clothes' ? 'var(--text-on-gold, #000)' : 'var(--text-primary)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >Trajes</button>
            </div>

            {/* CONTEÚDO DAS ABAS */}
            <div style={{ opacity: config.customSkinUrl ? 0.5 : 1, pointerEvents: config.customSkinUrl ? 'none' : 'auto' }}>
              {activeTab === 'features' && (
                <>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Modelo Base (Gênero)
                      {isGenderLocked && <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)' }}>(Bloqueado - Requer Item da Loja)</span>}
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem', opacity: isGenderLocked ? 0.5 : 1, pointerEvents: isGenderLocked ? 'none' : 'auto' }}>
                      {['male', 'female'].map(gender => (
                        <button
                          key={gender}
                          onClick={() => handleGenderSwap(gender as 'male' | 'female')}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            background: config.gender === gender || (gender === 'male' && !config.gender) ? 'var(--gold-primary)' : 'var(--bg-dark)',
                            color: config.gender === gender || (gender === 'male' && !config.gender) ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            textTransform: 'capitalize'
                          }}
                        >
                          {gender === 'male' ? 'Masculino' : 'Feminino'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Expressão</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {[
                        { id: 'smile', label: 'Sorrindo', icon: '🙂' },
                        { id: 'neutral', label: 'Sério', icon: '😐' },
                        { id: 'sad', label: 'Triste', icon: '😢' },
                        { id: 'surprised', label: 'Surpreso', icon: '😮' },
                        { id: 'teeth', label: 'Feliz', icon: '😁' },
                        { id: 'tongue', label: 'Língua', icon: '😛' }
                      ].map(style => (
                        <button
                          key={style.id}
                          onClick={() => setConfig({ ...config, mouthStyle: style.id })}
                          title={style.label}
                          style={{
                            flex: 1,
                            minWidth: '40px',
                            padding: '0.5rem',
                            background: config.mouthStyle === style.id ? 'var(--gold-primary)' : 'var(--bg-dark)',
                            color: config.mouthStyle === style.id ? '#000' : 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '1.2rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                          }}
                        >
                          {style.icon}
                        </button>
                      ))}
                    </div>
                  </div>

                  {config.gender === 'female' && (
                    <ColorPicker 
                      label="Cor da Boca (Batom)" 
                      colors={LIPSTICK_COLORS} 
                      value={config.lipstickColor || '#4a0404'} 
                      onChange={c => setConfig({ ...config, lipstickColor: c })} 
                    />
                  )}

                  <ColorPicker 
                    label="Cor de Pele" 
                    colors={SKIN_COLORS} 
                    value={config.skinColor || ''} 
                    onChange={c => setConfig({ ...config, skinColor: c })} 
                  />

                  <div style={{ marginBottom: '0.75rem', marginTop: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Estilo dos Olhos</label>
                    <select
                      value={config.eyeStyle || (config.gender === 'female' ? 'cute' : 'classic')}
                      onChange={(e) => setConfig({ ...config, eyeStyle: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    >
                      {[
                        { id: 'classic', label: 'Clássico (Padrão)' },
                        { id: 'cute', label: 'Fofo (Com Blush)' },
                        { id: 'oriental', label: 'Oriental Fino' },
                        { id: 'oriental-2', label: 'Oriental Suave' },
                        { id: 'oriental-3', label: 'Oriental Fechado' },
                        { id: 'dot', label: 'Pontinho' },
                        { id: 'tired', label: 'Cansado (Olheiras)' }
                      ].map(style => (
                        <option key={style.id} value={style.id}>{style.label}</option>
                      ))}
                    </select>
                  </div>

                  <ColorPicker 
                    label="Cor dos Olhos" 
                    colors={EYE_COLORS} 
                    value={config.eyeColor || ''} 
                    onChange={c => setConfig({ ...config, eyeColor: c })} 
                  />
                  {/* Fim de Características */}
                </>
              )}

              {activeTab === 'hair' && (
                <>

                  {((config.gender === 'male' || !config.gender) || customSaveMode) && (
                    <>
                      <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Pelos Faciais</label>
                        <select
                          value={config.facialHair || 'none'}
                          onChange={(e) => setConfig({ ...config, facialHair: e.target.value as any })}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                        >
                          {[
                            { id: 'none', label: 'Nenhum' },
                            { id: 'beard', label: 'Barba Cheia' },
                            { id: 'mustache', label: 'Bigode' },
                            { id: 'goatee', label: 'Cavanhaque' }
                          ].map(style => (
                            <option key={style.id} value={style.id}>{style.label}</option>
                          ))}
                        </select>
                      </div>

                      {config.facialHair && config.facialHair !== 'none' && (
                        <ColorPicker 
                          label="Cor dos Pelos Faciais" 
                          colors={HAIR_COLORS} 
                          value={config.facialHairColor || config.hairColor || ''} 
                          onChange={c => setConfig({ ...config, facialHairColor: c })} 
                        />
                      )}
                      
                      <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />
                    </>
                  )}

                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Estilo de Cabelo</label>
                    <select
                      value={config.hairStyle}
                      onChange={(e) => setConfig({ ...config, hairStyle: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    >
                      {[
                        { id: 'short', label: 'Curto', genders: ['male'] },
                        { id: 'long', label: 'Longo', genders: ['female', 'male'] },
                        { id: 'spiky', label: 'Espetado', genders: ['male'] },
                        { id: 'mohawk', label: 'Moicano', genders: ['male'] },
                        { id: 'messy', label: 'Bagunçado', genders: ['male'] },
                        { id: 'ponytail', label: 'Rabo de Cavalo', genders: ['female'] },
                        { id: 'bun', label: 'Coque', genders: ['female'] },
                        { id: 'braid', label: 'Trança', genders: ['female'] },
                        { id: 'pigtails', label: 'Marias-Chiquinhas', genders: ['female'] },
                        { id: 'bob', label: 'Chanel', genders: ['female'] },
                        { id: 'curly', label: 'Cacheado', genders: ['female', 'male'] },
                        { id: 'bald', label: 'Careca', genders: ['male', 'female'] }
                      ].filter(opt => opt.genders.includes(config.gender || 'male')).map(style => (
                        <option key={style.id} value={style.id}>{style.label}</option>
                      ))}
                    </select>
                  </div>

                  <ColorPicker 
                    label="Cor do Cabelo" 
                    colors={HAIR_COLORS} 
                    value={config.hairColor || ''} 
                    onChange={c => setConfig({ ...config, hairColor: c })} 
                  />

                  {['ponytail', 'bun', 'braid', 'pigtails'].includes(config.hairStyle || '') && (
                    <ColorPicker 
                      label="Cor do Prendedor de Cabelo" 
                      colors={[...HAIR_COLORS, ...CLOTHES_COLORS]} 
                      value={config.hairTieColor || config.shirtColor || '#d63074'} 
                      onChange={c => setConfig({ ...config, hairTieColor: c })} 
                    />
                  )}

                  {config.hairStyle === 'ponytail' && (
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', marginTop: '1rem', border: '1px solid var(--border-color)' }}>
                      <h4 style={{ margin: '0 0 1rem 0', color: 'var(--gold-primary)', fontSize: '0.9rem' }}>Formato do Rabo de Cavalo</h4>
                      
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          <span>Comprimento</span>
                          <span>{config.ponytailLength ?? 7}</span>
                        </div>
                        <input 
                          type="range" 
                          min="3" max="14" step="0.5"
                          value={config.ponytailLength ?? 7}
                          onChange={(e) => setConfig({ ...config, ponytailLength: parseFloat(e.target.value) })}
                          style={{ width: '100%', accentColor: 'var(--gold-primary)' }}
                        />
                      </div>

                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          <span>Espessura</span>
                          <span>{config.ponytailThickness ?? 3.5}</span>
                        </div>
                        <input 
                          type="range" 
                          min="1" max="6" step="0.5"
                          value={config.ponytailThickness ?? 3.5}
                          onChange={(e) => setConfig({ ...config, ponytailThickness: parseFloat(e.target.value) })}
                          style={{ width: '100%', accentColor: 'var(--gold-primary)' }}
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          <span>Ângulo (Levantado)</span>
                          <span>{config.ponytailAngle ?? 15}°</span>
                        </div>
                        <input 
                          type="range" 
                          min="-10" max="90" step="5"
                          value={config.ponytailAngle ?? 15}
                          onChange={(e) => setConfig({ ...config, ponytailAngle: parseFloat(e.target.value) })}
                          style={{ width: '100%', accentColor: 'var(--gold-primary)' }}
                        />
                      </div>
                    </div>
                  )}


                  {config.gender === 'female' && (
                    <>
                      <div style={{ marginBottom: '0.75rem', marginTop: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Acessório de Cabelo 1</label>
                        <select
                          value={config.hairAccessories?.[0] || config.hairAccessory || 'none'}
                          onChange={(e) => {
                            const newAccs = [...(config.hairAccessories || [config.hairAccessory || 'none'])];
                            newAccs[0] = e.target.value;
                            if (newAccs[0] === newAccs[1]) newAccs[1] = 'none'; // Prevent dupes
                            setConfig({ ...config, hairAccessories: newAccs });
                          }}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', marginBottom: '1rem' }}
                        >
                          <option value="none">Nenhum</option>
                          <option value="bow">Laço</option>
                          <option value="flower">Flor</option>
                          <option value="headband">Tiara</option>
                        </select>

                        {((config.hairAccessories?.[0] && config.hairAccessories[0] !== 'none') || (!config.hairAccessories && config.hairAccessory && config.hairAccessory !== 'none')) ? (
                          <ColorPicker 
                            label="Cor do Acessório 1" 
                            colors={[...HAIR_COLORS, ...CLOTHES_COLORS]} 
                            value={config.accessoryColors?.[0] || config.accessoryColor || '#ff0000'} 
                            onChange={c => {
                              const newColors = [...(config.accessoryColors || [config.accessoryColor || '#ff0000', config.accessoryColor || '#ff0000'])];
                              newColors[0] = c;
                              setConfig({ ...config, accessoryColors: newColors });
                            }} 
                          />
                        ) : null}
                      </div>

                      <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Acessório de Cabelo 2</label>
                        <select
                          value={config.hairAccessories?.[1] || 'none'}
                          onChange={(e) => {
                            const newAccs = [...(config.hairAccessories || [config.hairAccessory || 'none', 'none'])];
                            newAccs[1] = e.target.value;
                            if (newAccs[1] === newAccs[0]) newAccs[0] = 'none'; // Prevent dupes
                            setConfig({ ...config, hairAccessories: newAccs });
                          }}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', marginBottom: '1rem' }}
                        >
                          <option value="none">Nenhum</option>
                          {config.hairAccessories?.[0] !== 'bow' && (config.hairAccessory !== 'bow') && <option value="bow">Laço</option>}
                          {config.hairAccessories?.[0] !== 'flower' && (config.hairAccessory !== 'flower') && <option value="flower">Flor</option>}
                          {config.hairAccessories?.[0] !== 'headband' && (config.hairAccessory !== 'headband') && <option value="headband">Tiara</option>}
                        </select>

                        {config.hairAccessories?.[1] && config.hairAccessories[1] !== 'none' ? (
                          <ColorPicker 
                            label="Cor do Acessório 2" 
                            colors={[...HAIR_COLORS, ...CLOTHES_COLORS]} 
                            value={config.accessoryColors?.[1] || config.accessoryColor || '#ff0000'} 
                            onChange={c => {
                              const newColors = [...(config.accessoryColors || [config.accessoryColor || '#ff0000', config.accessoryColor || '#ff0000'])];
                              newColors[1] = c;
                              setConfig({ ...config, accessoryColors: newColors });
                            }} 
                          />
                        ) : null}
                      </div>
                    </>
                  )}
                </>
              )}

              {activeTab === 'clothes' && (
                <>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Estilo de Roupa</label>
                    <select
                      value={config.clothingStyle || (config.gender === 'female' ? 'dress' : 't-shirt')}
                      onChange={(e) => setConfig({ ...config, clothingStyle: e.target.value as any })}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    >
                      {[
                        { id: 't-shirt', label: 'Camiseta e Calça', genders: ['male', 'female'] },
                        { id: 'pants-shirt', label: 'Calça com Camisa Longa', genders: ['male', 'female'] },
                        { id: 'tank-top', label: 'Regata e Shorts', genders: ['male', 'female'] },
                        { id: 'suit', label: 'Terno / Traje Social', genders: ['male', 'female'] },
                        { id: 'dress', label: 'Vestido', genders: ['female'] },
                        { id: 'skirt', label: 'Saia com Blusa', genders: ['female'] },
                        { id: 'crop-top', label: 'Cropped e Shorts', genders: ['female'] },
                        { id: 'overalls', label: 'Jardineira / Macacão', genders: ['female'] }
                      ].filter(opt => opt.genders.includes(config.gender || 'male')).map(style => (
                        <option key={style.id} value={style.id}>{style.label}</option>
                      ))}
                    </select>
                  </div>

                  <ColorPicker 
                    label={
                      config.clothingStyle === 'dress' || (config.gender === 'female' && !config.clothingStyle) ? "Cor do Vestido" :
                      config.clothingStyle === 'tank-top' ? "Cor da Regata" :
                      config.clothingStyle === 't-shirt' ? "Cor da Camiseta" :
                      "Cor da Camisa"
                    }
                    colors={CLOTHES_COLORS} 
                    value={config.shirtColor || (config.gender === 'female' ? '#d63074' : '#e5e5e5')} 
                    onChange={c => setConfig({ ...config, shirtColor: c })} 
                  />

                  <ColorPicker 
                    label={
                      config.clothingStyle === 'dress' || (config.gender === 'female' && !config.clothingStyle) ? "Detalhes do Vestido" :
                      config.clothingStyle === 'tank-top' || config.clothingStyle === 'crop-top' ? "Cor do Shorts" :
                      config.clothingStyle === 'skirt' ? "Cor da Saia" :
                      config.clothingStyle === 'overalls' ? "Cor da Blusa" : // A cor primária é o macacão e secundária é a blusa
                      "Cor da Calça"
                    }
                    colors={CLOTHES_COLORS} 
                    value={config.pantsColor || (config.gender === 'female' ? '#d63074' : '#3a2d24')} 
                    onChange={c => setConfig({ ...config, pantsColor: c })} 
                  />

                  <div style={{ marginBottom: '0.75rem', marginTop: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Óculos</label>
                    <select
                      value={config.glasses || 'none'}
                      onChange={(e) => setConfig({ ...config, glasses: e.target.value as any })}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    >
                      <option value="none">Nenhum</option>
                      <option value="classic">Clássico</option>
                      <option value="thin">Armação Fina</option>
                      <option value="round">Redondos</option>
                      <option value="sunglasses">Óculos de Sol</option>
                    </select>
                  </div>

                  {config.glasses && config.glasses !== 'none' && (
                    <ColorPicker 
                      label="Cor dos Óculos" 
                      colors={[...HAIR_COLORS, ...CLOTHES_COLORS]} 
                      value={config.glassesColor || '#ff0000'} 
                      onChange={c => setConfig({ ...config, glassesColor: c })} 
                    />
                  )}

                  <div style={{ marginBottom: '0.75rem', marginTop: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Sapatos</label>
                    <select
                      value={config.shoeStyle || (config.gender === 'female' ? 'flats' : 'sneakers')}
                      onChange={(e) => setConfig({ ...config, shoeStyle: e.target.value as any })}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    >
                      {[
                        { id: 'sneakers', label: 'Tênis', genders: ['male', 'female'] },
                        { id: 'boots', label: 'Botas', genders: ['male', 'female'] },
                        { id: 'flats', label: 'Sapatilha', genders: ['female'] },
                        { id: 'heels', label: 'Salto Alto', genders: ['female'] },
                        { id: 'sandals', label: 'Sandálias', genders: ['female', 'male'] }
                      ].filter(opt => opt.genders.includes(config.gender || 'male')).map(style => (
                        <option key={style.id} value={style.id}>{style.label}</option>
                      ))}
                    </select>
                  </div>

                  <ColorPicker 
                    label="Cor dos Sapatos" 
                    colors={CLOTHES_COLORS} 
                    value={config.shoeColor || (config.gender === 'female' ? '#3d2c23' : '#1a1a1a')} 
                    onChange={c => setConfig({ ...config, shoeColor: c })} 
                  />
                </>
              )}
            </div>

            {(userData?.role === 'admin' || isAdmin || canSkins || canModels) && inline && (
              <div style={{ marginBottom: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--accent-primary)' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                  {customSaveMode ? 'Salvar Monstro na Galeria Global' : 'Salvar Personagem na Galeria Global'}
                </label>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  Ao dar um nome abaixo, este {customSaveMode ? 'monstro' : 'personagem'} será salvo para ser reutilizado ou sugerido aleatoriamente.
                </p>
                <input 
                  type="text" 
                  value={monsterName}
                  onChange={e => setMonsterName(e.target.value)}
                  placeholder={`Nome do ${customSaveMode ? 'Monstro' : 'Personagem'} (Ex: ${customSaveMode ? 'Golem de Gelo' : 'Herói Padrão'})`}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                />
              </div>
            )}

          </div>
          </div>
        </div>

        {/* STICKY FOOTER */}
        <div style={{ flexShrink: 0, background: 'var(--bg-dark)', padding: '0.75rem', borderTop: '1px solid var(--border-color)', zIndex: 100, display: 'flex', justifyContent: 'center', borderRadius: inline ? '0' : '0 0 16px 16px', boxShadow: '0 -4px 10px rgba(0,0,0,0.2)' }}>
          <button 
            className="btn-primary hover-brightness"
            onClick={handleSave}
            disabled={saving}
            style={{ width: '100%', maxWidth: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.6rem', fontSize: '0.9rem', fontWeight: 'bold' }}
          >
            <Save size={16} /> {saving ? 'Salvando...' : customSaveMode ? 'Salvar Monstro' : 'Salvar Personagem'}
          </button>
        </div>

      </div>

      {showAdminManager && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000,
          padding: '1rem'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
            <button
              onClick={() => {
                setShowAdminManager(false);
                fetchPresetSkins();
              }}
              style={{
                position: 'absolute', top: '1.5rem', right: '1.5rem',
                background: 'none', border: 'none',
                color: 'var(--text-secondary)', cursor: 'pointer',
                padding: '0.5rem', zIndex: 10
              }}
            >
              <X size={24} />
            </button>
            <h2 style={{ marginTop: 0, marginBottom: '2rem' }}>Gerenciar Skins (Administrador)</h2>
            <AdminPresetSkinsManager />
          </div>
    </div>
      )}

      {showAdmin3dManager && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000,
          padding: '1rem'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
            <button
              onClick={() => setShowAdmin3dManager(false)}
              style={{
                position: 'absolute', top: '1.5rem', right: '1.5rem',
                background: 'none', border: 'none',
                color: 'var(--text-secondary)', cursor: 'pointer',
                padding: '0.5rem', zIndex: 10
              }}
            >
              <X size={24} />
            </button>
            <h2 style={{ marginTop: 0, marginBottom: '2rem' }}>Gerenciar Moldes 3D (Administrador)</h2>
            <Admin3DModelsManager />
          </div>
        </div>
      )}

      {/* Modal de Poses Salvas */}
      {showPoseModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 11000,
          padding: '1rem'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '700px', maxHeight: '85vh', overflowY: 'auto', position: 'relative', padding: '1.5rem' }}>
            <button
              onClick={() => setShowPoseModal(false)}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.5rem', zIndex: 10 }}
            >
              <X size={22} />
            </button>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#a78bfa' }}>
              <BookMarked size={20} /> Poses Salvas da Escola
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
              As poses são salvas por escola e podem ser reutilizadas em qualquer personagem. Equipe uma pose em uma ação base (Parado/Andando/Correndo/Lutando) — a animação padrão não é perdida e pode ser restaurada.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                onClick={() => setPoseModalTab('list')}
                style={{ padding: '0.4rem 1rem', background: poseModalTab === 'list' ? '#8b5cf6' : 'transparent', color: poseModalTab === 'list' ? '#fff' : '#a78bfa', border: '1px solid #8b5cf6', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}
              >📚 Biblioteca</button>
              <button
                onClick={() => setPoseModalTab('save')}
                style={{ padding: '0.4rem 1rem', background: poseModalTab === 'save' ? '#10b981' : 'transparent', color: poseModalTab === 'save' ? '#fff' : '#10b981', border: '1px solid #10b981', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}
              >📥 Salvar Pose Atual</button>
            </div>

            {poseModalTab === 'save' && (
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', padding: '1rem' }}>
                <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontSize: '0.85rem' }}>Nome da pose (ex: "Ataque Espada de Frente")</label>
                <input
                  type="text"
                  value={newPoseName}
                  onChange={e => setNewPoseName(e.target.value)}
                  placeholder="Nome da pose..."
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', marginBottom: '0.75rem' }}
                />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  A pose atual (braços, pernas, corpo, cabeça) será salva. Você pode carregá-la depois para editar ou equipá-la em uma ação.
                </div>
                <button
                  onClick={handleSavePose}
                  style={{ padding: '0.5rem 1rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                >💾 Salvar Pose</button>
              </div>
            )}

            {poseModalTab === 'list' && (
              savedPoses.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Nenhuma pose salva ainda. Salve a pose atual no modo "Salvar Pose Atual".</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {savedPoses.map(pose => (
                    <div key={pose.id} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '160px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa' }}>
                          <PoseIcon size={18} />
                        </div>
                        <div>
                          <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{pose.name}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {pose.updatedAt ? new Date(pose.updatedAt).toLocaleString('pt-BR') : ''}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <button onClick={() => handleLoadPose(pose)} style={{ padding: '0.3rem 0.6rem', background: 'rgba(59,130,246,0.2)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.4)', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }} title="Carregar no editor para ajustar">
                          Carregar
                        </button>
                        {(['idle', 'walk', 'run', 'attack'] as const).map(action => {
                          const equipped = config.actionPoses?.[action];
                          return (
                            <button
                              key={action}
                              onClick={() => handleEquipPoseAction(pose, action)}
                              style={{ padding: '0.3rem 0.6rem', background: equipped ? 'rgba(16,185,129,0.25)' : 'transparent', color: equipped ? '#10b981' : 'var(--text-secondary)', border: equipped ? '1px solid rgba(16,185,129,0.5)' : '1px solid var(--border-glass)', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                              title={equipped ? `Remover pose da ação ${ACTION_LABELS[action]}` : `Equipar nesta ação (${ACTION_LABELS[action]})`}
                            >
                              {ACTION_LABELS[action]}{equipped ? ' ✓' : ''}
                            </button>
                          );
                        })}
                        <button onClick={() => handleDeletePose(pose.id)} style={{ padding: '0.3rem 0.6rem', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem' }} title="Excluir pose">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
