import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Edit2, Save, X, Box, Globe, Building2, Swords, Package, Coins, Check, Image as ImageIcon } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';
import { useTenant } from '../contexts/TenantContext';
import DirectUploadButton from './DirectUploadButton';
import ImageGalleryModal from './ImageGalleryModal';
import InteractiveModelPreview from './InteractiveModelPreview';
import { playChestAudio } from '../lib/audio';
import { playSound } from '../lib/audioBank';
import { sessionCache, CACHE_KEYS } from '../lib/sessionCache';

export interface Model3D {
  id: string;
  name: string;
  url: string;
  category?: 'skin' | 'chest' | 'coin';
  rarity?: string;
  open_url?: string;
  slot_count?: number;
  is_active?: boolean;
  chestScale?: number;
  chestZoom?: number;
  chestOffsetX?: number;
  chestOffsetY?: number;
  chestRotY?: number;
  chestOpenOffsetX?: number;
  chestOpenOffsetY?: number;
  chestSwapSides?: boolean;
  chestAudioUrl?: string;
  chestAudioRate?: number;
  chestAudioStart?: number;
  chestAudioDuration?: number;
  coinSoundUrl?: string;
  _isGlobal?: boolean;
}

export type ModelCategory = 'skin' | 'chest' | 'coin';

const RARITIES: { value: string; label: string }[] = [
  { value: 'common', label: 'Comum' },
  { value: 'uncommon', label: 'Incomum' },
  { value: 'rare', label: 'Raro' },
  { value: 'epic', label: 'Épico' },
  { value: 'mestre', label: 'Mestre' },
  { value: 'legendary', label: 'Lendário' },
];

const CATEGORY_LABELS: Record<ModelCategory, string> = {
  skin: 'Skins de Monstros e Pets',
  chest: 'Baús de Recompensa',
  coin: 'Moedas',
};

const CATEGORY_COLORS: Record<ModelCategory, string> = {
  skin: '#10b981',
  chest: '#f59e0b',
  coin: '#fbbf24',
};

export default function Admin3DModelsManager() {
  const { showAlert, showConfirm } = useDialog();
  const { tenantId, isSuperAdmin } = useTenant();
  const [models, setModels] = useState<Model3D[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ModelCategory>('skin');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<ModelCategory>('skin');
  const [rarity, setRarity] = useState<string>('common');
  const [openUrl, setOpenUrl] = useState('');
  const [slotCount, setSlotCount] = useState(4);
  const [isActive, setIsActive] = useState(false);
  const [chestScale, setChestScale] = useState(1);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewOffsetX, setPreviewOffsetX] = useState(0);
  const [previewOffsetY, setPreviewOffsetY] = useState(0);
  const [previewRotY, setPreviewRotY] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewOpenOffsetX, setPreviewOpenOffsetX] = useState(0);
  const [previewOpenOffsetY, setPreviewOpenOffsetY] = useState(0);
  const [previewSwapSides, setPreviewSwapSides] = useState(false);
  const [chestAudioUrl, setChestAudioUrl] = useState('');
  const [chestAudioRate, setChestAudioRate] = useState(1);
  const [chestAudioStart, setChestAudioStart] = useState(0);
  const [chestAudioDuration, setChestAudioDuration] = useState(0);
  const [coinSoundUrl, setCoinSoundUrl] = useState('');
  const [galleryTarget, setGalleryTarget] = useState<'url' | 'openUrl' | null>(null);

  const fetchModels = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      let query = supabase.from('3d_models').select('*');
      if (tenantId) {
        query = query.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
      }
      const { data: snap, error } = await query;
      if (error) {
        console.error('Supabase fetch error:', error);
        showAlert(`Erro do Supabase: ${error.message}`);
      } else if (snap) {
        setModels((snap as any[]).map((m: any) => ({
          ...m,
          category: m.category || 'skin',
          rarity: m.rarity || undefined,
          open_url: m.open_url || undefined,
          slot_count: m.slot_count ?? 4,
          is_active: m.is_active ?? false,
          chestScale: m.chest_scale ?? 1,
          chestZoom: m.chest_zoom ?? 1,
          chestOffsetX: m.chest_offset_x ?? 0,
          chestOffsetY: m.chest_offset_y ?? 0,
          chestRotY: m.chest_rot_y ?? 0,
          chestOpenOffsetX: m.chest_open_offset_x ?? 0,
          chestOpenOffsetY: m.chest_open_offset_y ?? 0,
          chestSwapSides: m.chest_swap_sides ?? false,
          chestAudioUrl: m.chest_audio_url || '',
          chestAudioRate: m.chest_audio_rate ?? 1,
          chestAudioStart: m.chest_audio_start ?? 0,
          chestAudioDuration: m.chest_audio_duration ?? 0,
          coinSoundUrl: m.coin_sound_url || '',
          _isGlobal: m.is_global ?? false,
        })));
      }
    } catch (e: any) {
      console.error(e);
      showAlert(`Erro ao buscar modelos 3D: ${e.message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchModels();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const filteredModels = models.filter(m => (m.category || 'skin') === activeTab);

  const handleOpenModal = (model?: Model3D) => {
    if (model) {
      setEditingId(model.id);
      setName(model.name);
      setUrl(model.url);
      setCategory((model.category || 'skin') as ModelCategory);
      setRarity(model.rarity || 'common');
      setOpenUrl(model.open_url || '');
      setSlotCount(model.slot_count ?? 4);
      setIsActive(model.is_active ?? false);
      setChestScale(model.chestScale ?? 1);
      setPreviewZoom(model.chestZoom ?? 1);
      setPreviewOffsetX(model.chestOffsetX ?? 0);
      setPreviewOffsetY(model.chestOffsetY ?? 0);
      setPreviewRotY(model.chestRotY ?? 0);
      setPreviewOpenOffsetX(model.chestOpenOffsetX ?? 0);
      setPreviewOpenOffsetY(model.chestOpenOffsetY ?? 0);
      setPreviewSwapSides(model.chestSwapSides ?? false);
      setChestAudioUrl(model.chestAudioUrl || '');
      setChestAudioRate(model.chestAudioRate ?? 1);
      setChestAudioStart(model.chestAudioStart ?? 0);
      setChestAudioDuration(model.chestAudioDuration ?? 0);
      setCoinSoundUrl(model.coinSoundUrl || '');
    } else {
      setEditingId(null);
      setName('');
      setUrl('');
      setCategory(activeTab);
      setRarity('common');
      setOpenUrl('');
      setSlotCount(4);
      setIsActive(false);
      setChestScale(1);
      setPreviewZoom(1);
      setPreviewOffsetX(0);
      setPreviewOffsetY(0);
      setPreviewRotY(0);
      setPreviewOpenOffsetX(0);
      setPreviewOpenOffsetY(0);
      setPreviewSwapSides(false);
      setChestAudioUrl('');
      setChestAudioRate(1);
      setChestAudioStart(0);
      setChestAudioDuration(0);
      setCoinSoundUrl('');
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) {
      showAlert('Preencha o nome e a URL do modelo (.glb, .gltf, .png).');
      return;
    }

    const urlLower = url.toLowerCase();
    const isGlbOrGltf = urlLower.includes('.glb') || urlLower.includes('.gltf') || url.startsWith('data:');
    const isImage = urlLower.includes('.png') || urlLower.includes('.jpg') || urlLower.includes('.jpeg') || urlLower.includes('.webp') || url.startsWith('data:image/');

    if (!isGlbOrGltf && !isImage) {
      const confirm = await showConfirm(
        'A URL não parece conter .glb/.gltf ou uma imagem (.png/.jpg). Você tem certeza que é um modelo válido? Deseja salvar mesmo assim?'
      );
      if (!confirm) return;
    }

    try {
      const data: any = {
        name: name.trim(),
        url: url.trim(),
        category,
        tenant_id: tenantId || null,
        is_global: false,
      };

      if (category === 'chest') {
        data.rarity = rarity || null;
        data.open_url = openUrl.trim() || null;
        data.slot_count = Math.max(1, Math.min(10, slotCount || 4));
        data.chest_scale = Math.max(0.5, Math.min(3, chestScale || 1));
        data.chest_zoom = Math.max(0.1, Math.min(5, previewZoom || 1));
        data.chest_offset_x = previewOffsetX || 0;
        data.chest_offset_y = previewOffsetY || 0;
        data.chest_rot_y = previewRotY || 0;
        data.chest_open_offset_x = previewOpenOffsetX || 0;
        data.chest_open_offset_y = previewOpenOffsetY || 0;
        data.chest_swap_sides = previewSwapSides;
        data.chest_audio_url = chestAudioUrl.trim() || null;
        data.chest_audio_rate = Math.max(0.25, Math.min(3, chestAudioRate || 1));
        data.chest_audio_start = Math.max(0, chestAudioStart || 0);
        data.chest_audio_duration = Math.max(0, chestAudioDuration || 0);
        data.is_active = isActive;
        if (isActive) {
          // Só um baú padrão por tenant (ou global quando sem tenant)
          if (tenantId) {
            await supabase.from('3d_models').update({ is_active: false }).eq('category', 'chest').eq('tenant_id', tenantId);
          } else {
            await supabase.from('3d_models').update({ is_active: false }).eq('category', 'chest').is('tenant_id', null);
          }
        }
      } else if (category === 'coin') {
        data.open_url = openUrl.trim() || null;
        data.coin_sound_url = coinSoundUrl.trim() || null;
        data.is_active = isActive;
        if (isActive) {
          if (tenantId) {
            await supabase.from('3d_models').update({ is_active: false }).eq('category', 'coin').eq('tenant_id', tenantId);
          } else {
            await supabase.from('3d_models').update({ is_active: false }).eq('category', 'coin').is('tenant_id', null);
          }
          await supabase.from('3d_models').update({ is_active: false }).eq('category', 'coin').is('tenant_id', null);
        }
      }

      if (editingId) {
        const editingModel = models.find(m => m.id === editingId);
        if (editingModel?._isGlobal && !isSuperAdmin) {
          showAlert('Modelos globais só podem ser editados pelo superadmin.');
          return;
        }
        const { error: updateError } = await supabase.from('3d_models').update(data).eq('id', editingId);
        if (updateError) {
          console.error('Erro ao atualizar modelo:', updateError);
          if ((updateError.message || '').includes('category') || (updateError.message || '').includes('does not exist')) {
            showAlert('Faltam colunas novas na tabela 3d_models. Rode o migration_3d_models_categories.sql no Supabase.');
          } else {
            showAlert(`Erro ao atualizar o modelo: ${updateError.message}`);
          }
          return;
        }
        showAlert('Modelo atualizado com sucesso!');
      } else {
        const { error: insertError } = await supabase.from('3d_models').insert({ id: uuidv4(), ...data });
        if (insertError) {
          console.error('Erro ao inserir modelo:', insertError);
          if ((insertError.message || '').includes('category') || (insertError.message || '').includes('does not exist')) {
            showAlert('Faltam colunas novas na tabela 3d_models. Rode o migration_3d_models_categories.sql no Supabase.');
          } else {
            showAlert(`Erro ao salvar o modelo: ${insertError.message}`);
          }
          return;
        }
        showAlert('Modelo adicionado com sucesso!');
      }
      sessionCache.invalidate(CACHE_KEYS.models3d());
      setIsModalOpen(false);
      fetchModels(false);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao salvar o modelo.');
    }
  };

  const handleDelete = async (id: string) => {
    if (await showConfirm('Deseja realmente excluir este modelo 3D? Ele deixará de funcionar nas skins que o utilizam.')) {
      try {
        const model = models.find(m => m.id === id);
        if (model?._isGlobal && !isSuperAdmin) {
          showAlert('Modelos globais só podem ser excluídos pelo superadmin.');
          return;
        }
        await supabase.from('3d_models').delete().eq('id', id);
        sessionCache.invalidate(CACHE_KEYS.models3d());
        showAlert('Modelo excluído com sucesso!');
        fetchModels(false);
      } catch (e) {
        console.error(e);
        showAlert('Erro ao excluir modelo.');
      }
    }
  };

  const handleActivateCoin = async (model: Model3D) => {
    if (model._isGlobal && !isSuperAdmin) {
      showAlert('Modelos globais só podem ser editados pelo superadmin.');
      return;
    }
    try {
      const { error: e1 } = tenantId
          ? await supabase.from('3d_models').update({ is_active: false }).eq('category', 'coin').eq('tenant_id', tenantId)
          : await supabase.from('3d_models').update({ is_active: false }).eq('category', 'coin').is('tenant_id', null);
      const { error: e2 } = await supabase.from('3d_models').update({ is_active: false }).eq('category', 'coin').is('tenant_id', null);
      const { error: e3 } = await supabase.from('3d_models').update({ is_active: true }).eq('id', model.id);
      const err = e1 || e2 || e3;
      if (err) {
        console.error('Erro ao ativar moeda:', err);
        if ((err.message || '').includes('category') || (err.message || '').includes('does not exist')) {
          showAlert('Faltam colunas novas na tabela 3d_models. Rode o migration_3d_models_categories.sql no Supabase.');
        } else {
          showAlert(`Erro ao ativar moeda: ${err.message}`);
        }
        return;
      }
      sessionCache.invalidate(CACHE_KEYS.models3d());
      fetchModels(false);
      showAlert(`Moeda "${model.name}" ativada!`);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao ativar moeda.');
    }
  };

  const handleActivateChest = async (model: Model3D) => {
    if (model._isGlobal && !isSuperAdmin) {
      showAlert('Modelos globais só podem ser editados pelo superadmin.');
      return;
    }
    try {
      const { error: e1 } = tenantId
          ? await supabase.from('3d_models').update({ is_active: false }).eq('category', 'chest').eq('tenant_id', tenantId)
          : await supabase.from('3d_models').update({ is_active: false }).eq('category', 'chest').is('tenant_id', null);
      const { error: e2 } = await supabase.from('3d_models').update({ is_active: true }).eq('id', model.id);
      const err = e1 || e2;
      if (err) {
        console.error('Erro ao definir baú padrão:', err);
        if ((err.message || '').includes('category') || (err.message || '').includes('does not exist')) {
          showAlert('Faltam colunas novas na tabela 3d_models. Rode o migration_3d_models_categories.sql no Supabase.');
        } else {
          showAlert(`Erro ao definir baú padrão: ${err.message}`);
        }
        return;
      }
      sessionCache.invalidate(CACHE_KEYS.models3d());
      fetchModels(false);
      showAlert(`Baú "${model.name}" definido como padrão!`);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao definir baú padrão.');
    }
  };

  const renderIcon = (cat: ModelCategory) => {
    switch (cat) {
      case 'chest': return <Package size={24} color="#f59e0b" />;
      case 'coin': return <Coins size={24} color="#fbbf24" />;
      default: return <Box size={24} color="#10b981" />;
    }
  };

  const renderRarityBadge = (model: Model3D) => {
    if (model.category !== 'chest' || !model.rarity) return null;
    const rarityColors: Record<string, string> = {
      common: '#9ca3af',
      uncommon: '#4ade80',
      rare: '#60a5fa',
      epic: '#c084fc',
      mestre: '#ef4444',
      legendary: '#fbbf24',
    };
    return (
      <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: 'rgba(0,0,0,0.4)', color: rarityColors[model.rarity] || '#9ca3af', border: `1px solid ${rarityColors[model.rarity] || '#9ca3af'}`, textTransform: 'capitalize' }}>
        {model.rarity}
      </span>
    );
  };

  return (
    <div style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', marginTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Box size={20} color="var(--accent-primary)" /> Moldes 3D Customizados
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Cadastre moldes (.glb) para skins, baús de recompensa e moedas de batalha. Moldes globais (🌐) são somente leitura.</p>
        </div>
        <button onClick={() => handleOpenModal()} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} /> Novo Molde
        </button>
      </div>

      {/* Tabs de categoria */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {(Object.keys(CATEGORY_LABELS) as ModelCategory[]).map(cat => {
          const color = CATEGORY_COLORS[cat];
          return (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '0.5rem 1.25rem', borderRadius: '8px',
                color: activeTab === cat ? color : 'var(--text-secondary)',
                backgroundColor: activeTab === cat ? `${color}1a` : 'transparent',
                fontWeight: activeTab === cat ? 'bold' : 'normal',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                transition: 'all 0.2s'
              }}
            >
              {cat === 'skin' ? <Swords size={16} /> : cat === 'chest' ? <Package size={16} /> : <Coins size={16} />}
              {CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>

      {isModalOpen ? (
        <div style={{ background: 'var(--bg-main)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)', marginTop: '1rem' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>{editingId ? 'Editar Molde' : 'Novo Molde'}</h2>
            <button onClick={() => setIsModalOpen(false)} style={{ color: 'var(--text-secondary)', cursor: 'pointer', background: 'none', border: 'none' }}>
              <X size={24} />
            </button>
          </div>
          
          <div style={{ padding: '1.5rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Categoria</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as ModelCategory)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}
              >
                <option value="skin">Skins de Monstros e Pets</option>
                <option value="chest">Baús de Recompensa</option>
                <option value="coin">Moedas</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome do Molde</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder={category === 'chest' ? "Ex: Baú Lendário" : category === 'coin' ? "Ex: Moeda de Ouro" : "Ex: Iron Golem"} 
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} 
              />
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                URL do Modelo ({category === 'skin' ? '.glb' : '.glb ou .png'})
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  value={url} 
                  onChange={e => setUrl(e.target.value)} 
                  placeholder={category === 'skin' ? "https://meusite.com/golem.glb" : category === 'chest' ? "https://meusite.com/baú_fechado.png" : "https://meusite.com/moeda.png"} 
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} 
                />
                <DirectUploadButton 
                  onUploadComplete={setUrl} 
                  folder={category === 'skin' ? '3d_models' : category === 'chest' ? 'chests' : 'coins'} 
                  accept={category === 'skin' ? '.glb,.gltf' : '.glb,.gltf,.png,.jpg,.jpeg,.webp'}
                />
                <button
                  onClick={() => setGalleryTarget('url')}
                  title="Escolher imagem da galeria"
                  style={{
                    background: 'rgba(139, 92, 246, 0.2)',
                    color: '#a78bfa',
                    border: '1px solid rgba(139, 92, 246, 0.4)',
                    borderRadius: '8px',
                    padding: '0 1rem',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.8rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <ImageIcon size={18} /> Galeria
                </button>
              </div>
            </div>

            {(category === 'chest' || category === 'coin') && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                  URL do Modelo Aberto ({category === 'chest' ? 'baú aberto' : 'moeda animada'} — .png opcional)
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    value={openUrl} 
                    onChange={e => setOpenUrl(e.target.value)} 
                    placeholder={category === 'chest' ? "https://meusite.com/baú_aberto.png" : "https://meusite.com/moeda_aberta.png"} 
                    style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} 
                  />
                  <DirectUploadButton 
                    onUploadComplete={setOpenUrl} 
                    folder={category === 'chest' ? 'chests' : 'coins'} 
                    accept=".png,.jpg,.jpeg,.webp"
                  />
                  <button
                    onClick={() => setGalleryTarget('openUrl')}
                    title="Escolher imagem da galeria"
                    style={{
                      background: 'rgba(139, 92, 246, 0.2)',
                      color: '#a78bfa',
                      border: '1px solid rgba(139, 92, 246, 0.4)',
                      borderRadius: '8px',
                      padding: '0 1rem',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.8rem',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <ImageIcon size={18} /> Galeria
                  </button>
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginTop: '0.35rem' }}>
                  Para PNG: use a URL fechado no campo acima e o aberto aqui — a animação simula o baú/moeda abrindo.
                </span>
              </div>
            )}

            {category === 'chest' && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Raridade do Baú</label>
                  <select
                    value={rarity}
                    onChange={e => setRarity(e.target.value)}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}
                  >
                    {RARITIES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginTop: '0.35rem' }}>
                    Quanto maior a raridade, melhores os itens dentro do baú.
                  </span>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Quantidade de Slots (itens no baú)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={slotCount}
                    onChange={e => setSlotCount(parseInt(e.target.value) || 4)}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}
                  />
                </div>

                {/* Pré-visualização + Tamanho do baú na premiação */}
                <div style={{ marginBottom: '1rem', borderTop: '1px solid var(--border-glass)', paddingTop: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                    Pré-visualização (igual à premiação — arraste p/ girar o objeto, scroll p/ zoom)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div style={{ width: Math.round(150 * chestScale), height: Math.round(150 * chestScale) }}>
                      <InteractiveModelPreview
                        modelUrl={url}
                        size={Math.max(120, Math.min(340, Math.round(150 * chestScale)))}
                        zoom={previewZoom}
                        offsetX={previewOffsetX}
                        offsetY={previewOffsetY}
                        rotY={previewRotY}
                        open={previewOpen}
                        openOffsetX={previewOpenOffsetX}
                        openOffsetY={previewOpenOffsetY}
                        swapSides={previewSwapSides}
                        onZoomChange={setPreviewZoom}
                        onOffsetXChange={setPreviewOffsetX}
                        onOffsetYChange={setPreviewOffsetY}
                        onRotYChange={setPreviewRotY}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => setPreviewOpen(false)}
                          style={{ flex: 1, padding: '0.35rem 0.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', background: !previewOpen ? 'rgba(16,185,129,0.2)' : 'var(--btn-bg)', color: !previewOpen ? '#10b981' : 'var(--text-secondary)', border: `1px solid ${!previewOpen ? 'rgba(16,185,129,0.5)' : 'var(--border-glass)'}` }}
                        >
                          Baú Fechado
                        </button>
                        <button
                          onClick={() => setPreviewOpen(true)}
                          style={{ flex: 1, padding: '0.35rem 0.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', background: previewOpen ? 'rgba(245,158,11,0.2)' : 'var(--btn-bg)', color: previewOpen ? 'var(--gold-primary)' : 'var(--text-secondary)', border: `1px solid ${previewOpen ? 'rgba(245,158,11,0.5)' : 'var(--border-glass)'}` }}
                        >
                          Simular Aberto
                        </button>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <label style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.85rem' }}>Tamanho (área na premiação)</label>
                          <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>{(chestScale * 100).toFixed(0)}%</span>
                        </div>
                        <input type="range" min="0.5" max="3" step="0.05" value={chestScale} onChange={e => setChestScale(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--gold-primary)' }} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <label style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.85rem' }}>Zoom do objeto</label>
                          <span style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>{(previewZoom * 100).toFixed(0)}%</span>
                        </div>
                        <input type="range" min="0.1" max="5" step="0.05" value={previewZoom} onChange={e => setPreviewZoom(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-blue)' }} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <label style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.85rem' }}>
                            Posição X {previewOpen ? '(aberto)' : '(fechado)'}
                          </label>
                          <span style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>{(previewOpen ? previewOpenOffsetX : previewOffsetX).toFixed(1)}</span>
                        </div>
                        <input
                          type="range"
                          min="-8"
                          max="8"
                          step="0.1"
                          value={previewOpen ? previewOpenOffsetX : previewOffsetX}
                          onChange={e => (previewOpen ? setPreviewOpenOffsetX(parseFloat(e.target.value)) : setPreviewOffsetX(parseFloat(e.target.value)))}
                          style={{ width: '100%', accentColor: 'var(--accent-blue)' }}
                        />
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <label style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.85rem' }}>
                            Posição Y {previewOpen ? '(aberto)' : '(fechado)'}
                          </label>
                          <span style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>{(previewOpen ? previewOpenOffsetY : previewOffsetY).toFixed(1)}</span>
                        </div>
                        <input
                          type="range"
                          min="-8"
                          max="8"
                          step="0.1"
                          value={previewOpen ? previewOpenOffsetY : previewOffsetY}
                          onChange={e => (previewOpen ? setPreviewOpenOffsetY(parseFloat(e.target.value)) : setPreviewOffsetY(parseFloat(e.target.value)))}
                          style={{ width: '100%', accentColor: 'var(--accent-blue)' }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="checkbox"
                          checked={previewSwapSides}
                          onChange={e => setPreviewSwapSides(e.target.checked)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <label style={{ color: 'var(--text-primary)', fontSize: '0.85rem', cursor: 'pointer' }}>Inverter lados no arquivo (fechado à direita)</label>
                      </div>
                      <div>
                        <div style={{ marginBottom: '0.3rem' }}>
                          <label style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.85rem' }}>Som ao abrir (opcional)</label>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input
                            type="text"
                            value={chestAudioUrl}
                            onChange={e => setChestAudioUrl(e.target.value)}
                            placeholder="URL do áudio (mp3/ogg)..."
                            style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}
                          />
                          <DirectUploadButton folder="audio" accept="audio/*" onUploadComplete={setChestAudioUrl} buttonStyle={{ minHeight: '100%', padding: '0 0.75rem' }} />
                        </div>
                        {chestAudioUrl && (
                          <>
                            <div style={{ marginTop: '0.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                              <div>
                                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>Velocidade</label>
                                <input type="number" min="0.25" max="3" step="0.05" value={chestAudioRate} onChange={e => setChestAudioRate(parseFloat(e.target.value) || 1)} style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
                              </div>
                              <div>
                                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>Início (seg)</label>
                                <input type="number" min="0" step="0.1" value={chestAudioStart} onChange={e => setChestAudioStart(Math.max(0, parseFloat(e.target.value) || 0))} style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
                              </div>
                              <div>
                                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>Duração (0=tudo)</label>
                                <input type="number" min="0" step="0.1" value={chestAudioDuration} onChange={e => setChestAudioDuration(Math.max(0, parseFloat(e.target.value) || 0))} style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                              <audio controls src={chestAudioUrl} playbackRate={chestAudioRate} style={{ flex: 1, height: '38px' }} />
                              <button
                                onClick={() => playChestAudio(chestAudioUrl, chestAudioRate, chestAudioStart, chestAudioDuration)}
                                style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.75rem', background: 'rgba(16,185,129,0.2)', color: '#10b981', border: '1px solid rgba(16,185,129,0.5)', whiteSpace: 'nowrap' }}
                              >
                                ▶ Testar com corte
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <label style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.85rem' }}>Giro do objeto</label>
                          <span style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>{Math.round(previewRotY)}°</span>
                        </div>
                        <input type="range" min="0" max="360" step="1" value={previewRotY} onChange={e => setPreviewRotY(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-blue)' }} />
                      </div>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                        O preview é idêntico à premiação. Arraste para girar e use o scroll (ou os sliders) para ajustar zoom/posição/giro. Salve para aplicar.
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {category === 'chest' && (
              <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  style={{ width: '20px', height: '20px' }}
                />
                <label style={{ color: 'var(--text-primary)' }}>Marcar como baú padrão (usado quando a missão não define um baú específico)</label>
              </div>
            )}

            {category === 'coin' && (
              <>
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                    style={{ width: '20px', height: '20px' }}
                  />
                  <label style={{ color: 'var(--text-primary)' }}>Marcar como moeda ativa nas batalhas</label>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Som ao cair no chão (opcional)</label>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={coinSoundUrl}
                      onChange={e => setCoinSoundUrl(e.target.value)}
                      placeholder="URL do som..."
                      style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}
                    />
                    <button onClick={() => playSound(coinSoundUrl)} disabled={!coinSoundUrl} style={{ padding: '0.5rem 0.7rem', background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', borderRadius: '8px', cursor: coinSoundUrl ? 'pointer' : 'not-allowed', opacity: coinSoundUrl ? 1 : 0.4 }}>▶</button>
                    <DirectUploadButton folder="audio" accept="audio/*" onUploadComplete={setCoinSoundUrl} buttonStyle={{ minHeight: '100%', padding: '0 0.75rem' }} />
                  </div>
                </div>
              </>
            )}

            <button 
              onClick={handleSave} 
              className="btn-primary" 
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem' }}
            >
              <Save size={18} /> Salvar
            </button>
          </div>
        </div>
      ) : (
        <>
          {loading ? (
            <p style={{ color: 'var(--text-secondary)' }}>Carregando moldes...</p>
          ) : filteredModels.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
              <p style={{ color: 'var(--text-secondary)' }}>
                {activeTab === 'skin' ? 'Nenhum molde 3D de skin cadastrado.' : activeTab === 'chest' ? 'Nenhum baú de recompensa cadastrado.' : 'Nenhuma moeda cadastrada.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {filteredModels.map(model => (
                <div key={model.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {renderIcon(model.category || 'skin')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {model.name}
                      {model._isGlobal ? <span title="Global (somente leitura)"><Globe size={14} color="var(--text-secondary)" /></span> : <span title="Local (editável)"><Building2 size={14} color="#10b981" /></span>}
                    </h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {renderRarityBadge(model)}
                      {model.category === 'chest' && model.slot_count && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{model.slot_count} slots</span>
                      )}
                      {model.category === 'chest' && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{Math.round((model.chestScale ?? 1) * 100)}%</span>
                      )}
                      {model.category === 'chest' && model.is_active && (
                        <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', border: '1px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Check size={11} /> Padrão
                        </span>
                      )}
                      {model.category === 'coin' && model.is_active && (
                        <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', border: '1px solid #fbbf24', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Check size={11} /> Ativa
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    {model.category === 'chest' && !model.is_active && (
                      <button onClick={() => handleActivateChest(model)} disabled={model._isGlobal && !isSuperAdmin} title="Definir como baú padrão" style={{ padding: '0.5rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', cursor: model._isGlobal && !isSuperAdmin ? 'not-allowed' : 'pointer', border: 'none', opacity: model._isGlobal && !isSuperAdmin ? 0.4 : 1 }}>
                        <Check size={16} />
                      </button>
                    )}
                    {model.category === 'coin' && !model.is_active && (
                      <button onClick={() => handleActivateCoin(model)} disabled={model._isGlobal && !isSuperAdmin} title="Ativar moeda" style={{ padding: '0.5rem', color: '#fbbf24', background: 'rgba(251, 191, 36, 0.1)', borderRadius: '8px', cursor: model._isGlobal && !isSuperAdmin ? 'not-allowed' : 'pointer', border: 'none', opacity: model._isGlobal && !isSuperAdmin ? 0.4 : 1 }}>
                        <Check size={16} />
                      </button>
                    )}
                    <button onClick={() => handleOpenModal(model)} disabled={model._isGlobal && !isSuperAdmin} style={{ padding: '0.5rem', color: '#60a5fa', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', cursor: model._isGlobal && !isSuperAdmin ? 'not-allowed' : 'pointer', border: 'none', opacity: model._isGlobal && !isSuperAdmin ? 0.4 : 1 }}>
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(model.id)} disabled={model._isGlobal && !isSuperAdmin} style={{ padding: '0.5rem', color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', cursor: model._isGlobal && !isSuperAdmin ? 'not-allowed' : 'pointer', border: 'none', opacity: model._isGlobal && !isSuperAdmin ? 0.4 : 1 }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {galleryTarget && (
        <ImageGalleryModal
          onSelectImage={(imageUrl) => {
            if (galleryTarget === 'url') setUrl(imageUrl);
            else setOpenUrl(imageUrl);
          }}
          onClose={() => setGalleryTarget(null)}
        />
      )}
    </div>
  );
}