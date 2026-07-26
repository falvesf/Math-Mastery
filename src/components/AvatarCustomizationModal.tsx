import React, { useState, useEffect, useRef } from 'react';
import { X, Save, User as UserIcon, Upload, Dices, Settings } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, updateDoc, collection, getDocs, addDoc } from 'firebase/firestore';
import { useAuth, type UserData } from '../contexts/AuthContext';
import AvatarCharacter, { type AvatarConfig, type EquippedItem } from './AvatarCharacter';
import { useDialog } from '../contexts/DialogContext';
import AdminPresetSkinsManager from './AdminPresetSkinsManager';
import Admin3DModelsManager from './Admin3DModelsManager';
import CustomModelViewer from './CustomModelViewer';
import { sessionCache, CACHE_KEYS, CACHE_TTL } from '../lib/sessionCache';

interface AvatarCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userData?: UserData;
  equippedItems?: EquippedItem[];
  initialConfig?: AvatarConfig;
  customSaveMode?: boolean;
  onSave?: (config: AvatarConfig, name?: string) => void;
  isAdmin?: boolean;
  inline?: boolean;
}

export interface PresetSkin {
  id: string;
  name: string;
  url: string;
  type: 'human' | 'monster';
  baseModelId?: string | null;
  config?: AvatarConfig;
}

const SKIN_COLORS = ['#ffcc99', '#f1c27d', '#e0ac69', '#8d5524', '#c68642', '#3d2c23'];
const HAIR_COLORS = ['#000000', '#4a3000', '#8a4000', '#e3a934', '#a13131', '#ffffff', '#a8a8a8', '#5b5b5b', '#ff00ff', '#00ffff'];
const EYE_COLORS = [
  '#000000', '#4a3000', '#3b5998', '#2ecc71', '#9b59b6', '#e74c3c'
];
const CLOTHES_COLORS = [
  '#e5e5e5', '#333333', '#d63074', '#3498db', '#2ecc71', '#f1c40f', '#e67e22', '#9b59b6'
];

const MONSTER_SKIN_COLORS = ['#7cba3d', '#4a7c59', '#3d5a80', '#293241', '#5a189a', '#7b2cbf', '#9d4edd', '#e01e37', '#6a040f', '#03071e', '#1e2124'];
const MONSTER_EYE_COLORS = ['#ff0000', '#ffea00', '#00ff00', '#00ffff', '#ff00ff', '#ffffff', '#000000'];
const MONSTER_HAIR_COLORS = ['#ffffff', '#000000', '#ff0000', '#800080', '#00ff00', '#333333', '#4a7c59'];

const HAIR_STYLES = ['short', 'long', 'spiky', 'bald', 'ponytail', 'mohawk', 'messy'];
const MOUTH_STYLES = ['smile', 'neutral', 'sad', 'open', 'teeth'];
const EYE_STYLES = ['normal', 'cute', 'wink', 'tired'];
const FACIAL_HAIR_STYLES = ['none', 'beard', 'mustache', 'goatee'];

export default function AvatarCustomizationModal({ isOpen, onClose, initialConfig, customSaveMode = false, onSave, isAdmin = false, inline = false, equippedItems = [] }: AvatarCustomizationModalProps) {
  const { userData } = useAuth();
  const { showAlert } = useDialog();
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
    return saved ? JSON.parse(saved) : false;
  });
  const [saving, setSaving] = useState(false);
  const [monsterName, setMonsterName] = useState('');
  const [presetSkins, setPresetSkins] = useState<PresetSkin[]>([]);
  const [models3d, setModels3d] = useState<any[]>([]);
  const [showAdminManager, setShowAdminManager] = useState(false);
  const [showAdmin3dManager, setShowAdmin3dManager] = useState(false);

  const fetchPresetSkins = async (forceRefresh = false) => {
    try {
      const cacheKey = CACHE_KEYS.presetSkins();
      if (!forceRefresh) {
        const cached = sessionCache.get<PresetSkin[]>(cacheKey);
        if (cached) { setPresetSkins(cached); return; }
      }
      const snap = await getDocs(collection(db, 'preset_skins'));
      const fetched: PresetSkin[] = [];
      snap.forEach(d => {
        fetched.push({ id: d.id, ...d.data() } as PresetSkin);
      });
      sessionCache.set(cacheKey, fetched, CACHE_TTL.PRESET_SKINS);
      setPresetSkins(fetched);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao buscar skins.');
    }
  };

  const fetchModels3d = async (forceRefresh = false) => {
    try {
      const cacheKey = CACHE_KEYS.models3d();
      if (!forceRefresh) {
        const cached = sessionCache.get<any[]>(cacheKey);
        if (cached) { setModels3d(cached); return; }
      }
      const snap = await getDocs(collection(db, '3d_models'));
      const fetched: any[] = [];
      snap.forEach(d => {
        fetched.push({ id: d.id, ...d.data() });
      });
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
          setConfig(userData.avatarConfig);
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
    try {
      if (!customSaveMode && userData && !inline) {
        await updateDoc(doc(db, 'users', userData.uid), { avatarConfig: config });
        if (onSave) {
          onSave(config, monsterName);
        }
        await showAlert('Personagem salvo com sucesso!');
      } else {
        if (onSave) {
          onSave(config, monsterName);
        }
        
        if ((userData?.role === 'admin' || isAdmin) && inline && monsterName.trim()) {
          try {
            await addDoc(collection(db, 'preset_skins'), {
              name: monsterName.trim(),
              url: '',
              type: customSaveMode ? 'monster' : 'human',
              baseModelId: config.customModelUrl ? (models3d.find(m => m.url === config.customModelUrl)?.id || null) : null,
              config: config
            });
            await showAlert(`${customSaveMode ? 'Monstro' : 'Personagem'} salvo na galeria com sucesso!`);
          } catch (e) {
            console.error("Erro ao salvar na galeria", e);
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

  const handleRandomize = () => {
    const randomItem = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
    
    // Sugerir da galeria global
    const relevantPresets = presetSkins.filter(s => s.type === (customSaveMode ? 'monster' : 'human') && s.config);
    if (relevantPresets.length > 0 && Math.random() < 0.4) {
      const selected = randomItem(relevantPresets);
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
      setConfig({
        ...config,
        gender: newGender,
        skinColor: randomItem(SKIN_COLORS),
        hairColor: randomItem(HAIR_COLORS),
        eyeColor: randomItem(EYE_COLORS),
        shirtColor: randomItem(CLOTHES_COLORS),
        pantsColor: randomItem(CLOTHES_COLORS),
        clothingStyle: newGender === 'female' ? randomItem(['t-shirt', 'pants-shirt', 'tank-top', 'dress']) : randomItem(['t-shirt', 'pants-shirt', 'tank-top']),
        hairStyle: randomItem(newGender === 'female' ? ['long', 'ponytail', 'bald'] : ['short', 'long', 'spiky', 'mohawk', 'bald']),
        facialHair: newGender === 'male' ? randomItem(FACIAL_HAIR_STYLES) : 'none',
        mouthStyle: randomItem(MOUTH_STYLES),
        customSkinUrl: ''
      });
    }
  };

  const ColorPicker = ({ label, colors, value, onChange }: { label: string, colors: string[], value: string, onChange: (c: string) => void }) => (
    <div style={{ marginBottom: '1.5rem' }}>
      <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{label}</label>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '4px', flex: 1, scrollbarWidth: 'thin' }}>
          {colors.map(c => (
            <button
              key={c}
              onClick={() => onChange(c)}
              style={{
                width: '32px', height: '32px',
                flexShrink: 0,
                borderRadius: '50%',
                backgroundColor: c,
                border: value === c ? '3px solid var(--accent-primary)' : '2px solid transparent',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.5rem', borderRadius: '8px', flexShrink: 0 }}>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: '28px', height: '28px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div style={inline ? { width: '100%' } : {
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div className={inline ? '' : 'glass-panel'} style={{
        width: '100%', maxWidth: inline ? '100%' : '800px',
        maxHeight: '90vh',
        overflowY: 'auto',
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
              padding: '0.5rem'
            }}
          >
            <X size={24} />
          </button>
        )}

        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <UserIcon size={32} color="var(--accent-primary)" />
            <h2 style={{ margin: 0, fontSize: '1.5rem', textTransform: 'uppercase' }}>
              {customSaveMode ? 'Personalizar Monstro' : 'Personalizar Personagem'}
            </h2>
          </div>
          {(userData?.role === 'admin' || isAdmin) && !inline && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <button 
                onClick={() => setShowAdminManager(true)}
                style={{ flex: 1, padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'var(--bg-card)', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                <Settings size={16} /> Admin: Skins
              </button>
              <button 
                onClick={() => setShowAdmin3dManager(true)}
                style={{ flex: 1, padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'var(--bg-card)', border: '1px solid #10b981', color: '#10b981', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                <Settings size={16} /> Admin: Moldes 3D
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>
          
          <div style={{
            flex: '1 1 250px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-dark)',
            borderRadius: '16px',
            padding: '2rem',
            minHeight: '300px',
            border: '2px solid var(--border-color)'
          }}>
            {(() => {
              const activePreset = presetSkins.find(s => s.url === config.customSkinUrl);
              const activeModel = activePreset?.baseModelId && activePreset.baseModelId !== 'default' 
                ? models3d.find(m => m.id === activePreset.baseModelId) 
                : null;

              if (activeModel) {
                return <CustomModelViewer modelUrl={activeModel.url} textureUrl={config.customSkinUrl} animation={config.animationState || 'idle'} size={250} />;
              }
              return <AvatarCharacter config={config} equippedItems={showEquippedItems ? equippedItems : []} size={250} animation={config.animationState || 'idle'} interactive={true} />;
            })()}
            
            <div style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Mão Dominante (Armas)</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  onClick={() => setConfig({ ...config, handedness: 'right' })}
                  style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', background: config.handedness !== 'left' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', border: config.handedness !== 'left' ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)', color: config.handedness !== 'left' ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  Destro
                </button>
                <button
                  onClick={() => setConfig({ ...config, handedness: 'left' })}
                  style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', background: config.handedness === 'left' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', border: config.handedness === 'left' ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)', color: config.handedness === 'left' ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  Canhoto
                </button>
              </div>
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setConfig({ ...config, animationState: 'idle' })} style={{ padding: '0.5rem 1rem', background: (!config.animationState || config.animationState === 'idle') ? 'var(--gold-primary)' : 'var(--bg-card)', color: (!config.animationState || config.animationState === 'idle') ? '#000' : '#fff', border: '1px solid var(--border-color)', borderRadius: '20px', cursor: 'pointer' }}>Parado</button>
              <button onClick={() => setConfig({ ...config, animationState: 'walk' })} style={{ padding: '0.5rem 1rem', background: config.animationState === 'walk' ? 'var(--gold-primary)' : 'var(--bg-card)', color: config.animationState === 'walk' ? '#000' : '#fff', border: '1px solid var(--border-color)', borderRadius: '20px', cursor: 'pointer' }}>Andando</button>
              <button onClick={() => setConfig({ ...config, animationState: 'run' })} style={{ padding: '0.5rem 1rem', background: config.animationState === 'run' ? 'var(--gold-primary)' : 'var(--bg-card)', color: config.animationState === 'run' ? '#000' : '#fff', border: '1px solid var(--border-color)', borderRadius: '20px', cursor: 'pointer' }}>Correndo</button>
            </div>
            
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Pré-visualização</p>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
              <input 
                type="checkbox" 
                checked={showEquippedItems} 
                onChange={(e) => setShowEquippedItems(e.target.checked)} 
                style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer', accentColor: 'var(--gold-primary)' }}
              />
              Mostrar Itens Equipados
            </label>

            <button 
              onClick={handleRandomize}
              className="hover-brightness"
              style={{ marginTop: '1rem', padding: '0.75rem', width: '100%', background: 'var(--bg-card)', color: 'var(--gold-primary)', border: '1px solid var(--gold-primary)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'bold' }}
            >
              <Dices size={20} /> Aleatorizar
            </button>
          </div>

          {/* Controls */}
          <div style={{ flex: '2 1 400px', minWidth: 0 }}>
            
            {customSaveMode && (
              <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--accent-primary)', borderRadius: '8px' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Skins de Monstro Pré-definidas</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setConfig({ ...config, customSkinUrl: '', customModelUrl: undefined })}
                    style={{
                       padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: !config.customSkinUrl ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'white', fontSize: '0.85rem'
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
                        setConfig({ ...config, customSkinUrl: skin.url, customModelUrl: modelUrl });
                      }}
                      style={{
                         padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: config.customSkinUrl === skin.url ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'white', fontSize: '0.85rem'
                      }}
                    >
                      {skin.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {!customSaveMode && (
              <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Skins Pré-definidas (Nova Skin)</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setConfig({ ...config, customSkinUrl: '' })}
                    style={{
                       padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: !config.customSkinUrl ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'white', fontSize: '0.85rem'
                    }}
                  >
                    Nenhuma (Usar peças)
                  </button>
                  {presetSkins.filter(s => s.type === 'human').map(skin => (
                    <button
                      key={skin.id}
                      onClick={() => setConfig({ ...config, customSkinUrl: skin.url })}
                      style={{
                         padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: config.customSkinUrl === skin.url ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'white', fontSize: '0.85rem'
                      }}
                    >
                      {skin.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div style={{ marginBottom: '1.5rem', opacity: config.customSkinUrl ? 0.5 : 1, pointerEvents: config.customSkinUrl ? 'none' : 'auto' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Modelo Base (Gênero)</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {['male', 'female'].map(gender => (
                  <button
                    key={gender}
                    onClick={() => setConfig({ ...config, gender: gender as any })}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      background: config.gender === gender || (gender === 'male' && !config.gender) ? 'var(--gold-primary)' : 'var(--bg-dark)',
                      color: config.gender === gender || (gender === 'male' && !config.gender) ? '#000' : '#fff',
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

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Estilo de Roupa</label>
              <select
                value={config.clothingStyle || (config.gender === 'female' ? 'dress' : 't-shirt')}
                onChange={(e) => setConfig({ ...config, clothingStyle: e.target.value as any })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }}
              >
                <option value="t-shirt">Camiseta e Calça</option>
                <option value="pants-shirt">Calça com Camisa Longa</option>
                <option value="tank-top">Regata e Shorts</option>
                {config.gender === 'female' && <option value="dress">Vestido</option>}
              </select>
            </div>

            <ColorPicker 
              label="Cor de Pele" 
              colors={SKIN_COLORS} 
              value={config.skinColor || ''} 
              onChange={c => setConfig({ ...config, skinColor: c })} 
            />
            
            <ColorPicker 
              label="Cor do Cabelo" 
              colors={HAIR_COLORS} 
              value={config.hairColor || ''} 
              onChange={c => setConfig({ ...config, hairColor: c })} 
            />
            
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
                config.clothingStyle === 'tank-top' ? "Cor do Shorts" :
                "Cor da Calça"
              }
              colors={CLOTHES_COLORS} 
              value={config.pantsColor || (config.gender === 'female' ? '#d63074' : '#3a2d24')} 
              onChange={c => setConfig({ ...config, pantsColor: c })} 
            />

            <ColorPicker 
              label="Cor dos Olhos" 
              colors={EYE_COLORS} 
              value={config.eyeColor || ''} 
              onChange={c => setConfig({ ...config, eyeColor: c })} 
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ flex: '1 1 120px' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Estilo de Cabelo</label>
                <select
                  value={config.hairStyle}
                  onChange={(e) => setConfig({ ...config, hairStyle: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }}
                >
                  {[
                    { id: 'short', label: 'Curto', genders: ['male'] },
                    { id: 'long', label: 'Longo', genders: ['female', 'male'] },
                    { id: 'spiky', label: 'Espetado', genders: ['male'] },
                    { id: 'ponytail', label: 'Rabo de Cavalo', genders: ['female'] },
                    { id: 'mohawk', label: 'Moicano', genders: ['male'] },
                    { id: 'bald', label: 'Careca', genders: ['male', 'female'] },
                    { id: 'messy', label: 'Bagunçado', genders: ['male'] }
                  ].filter(opt => opt.genders.includes(config.gender || 'male')).map(style => (
                    <option key={style.id} value={style.id}>{style.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: '1 1 120px' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Expressão</label>
                <select
                  value={config.mouthStyle}
                  onChange={(e) => setConfig({ ...config, mouthStyle: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }}
                >
                  {[
                    { id: 'smile', label: 'Sorrindo :)' },
                    { id: 'neutral', label: 'Sério :|' },
                    { id: 'sad', label: 'Triste :(' },
                    { id: 'surprised', label: 'Surpreso :o' },
                    { id: 'teeth', label: 'Feliz :D' },
                    { id: 'tongue', label: 'Língua :P' }
                  ].map(style => (
                    <option key={style.id} value={style.id}>{style.label}</option>
                  ))}
                </select>
              </div>

              {(config.gender === 'male' || customSaveMode) && (
                <div style={{ flex: '1 1 120px' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Pelos Faciais</label>
                  <select
                    value={config.facialHair || 'none'}
                    onChange={(e) => setConfig({ ...config, facialHair: e.target.value as any })}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }}
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
              )}
            </div>

            {(userData?.role === 'admin' || isAdmin) && inline && (
              <div style={{ marginBottom: '1.5rem', background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--accent-primary)' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>
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
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }}
                />
              </div>
            )}

            <button 
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ width: '100%', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              <Save size={20} /> {saving ? 'Salvando...' : customSaveMode ? 'Salvar Monstro' : 'Salvar Personagem'}
            </button>
          </div>
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
    </div>
  );
}
