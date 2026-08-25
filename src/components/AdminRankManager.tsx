import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { Medal, Plus, Edit2, Trash2, Search, Globe, Building2, Copy, Gift, Package, X } from 'lucide-react';
import ImageGalleryModal from './ImageGalleryModal';
import DirectUploadButton from './DirectUploadButton';
import { useDialog } from '../contexts/DialogContext';
import { useTenant } from '../contexts/TenantContext';
import { RANKS, ensureGlobalRanks, DEFAULT_RANKS } from '../lib/ranks';
import type { RankDef } from '../lib/ranks';
import { fetchModelsByCategory } from '../lib/model3d';
import type { ClassDef } from '../pages/AdminDashboard';

const AnimatedRankIcon = ({ rank }: { rank: RankDef }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const allImages = [rank.imageUrl, ...(rank.variants || []).map(v => v.imageUrl)].filter(Boolean) as string[];

  useEffect(() => {
    if (allImages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % allImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [allImages.length]);

  if (allImages.length === 0) {
    return <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: rank.color, border: '2px solid rgba(255,255,255,0.5)' }}></div>;
  }

  return (
    <img key={currentIndex} src={allImages[currentIndex]} alt={rank.name} style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${rank.color}`, boxShadow: `0 0 10px ${rank.color}80`, animation: 'fadeIn 0.5s ease-in-out' }} />
  );
};

export default function AdminRankManager({ pixabayKey }: { pixabayKey: string }) {
  const { showConfirm } = useDialog();
  const { tenantId, isSuperAdmin } = useTenant();
  const [ranks, setRanks] = useState<RankDef[]>([]);
  const [globalRanks, setGlobalRanks] = useState<(RankDef & { _isGlobal?: boolean; id?: string })[]>([]);
  const [classes, setClasses] = useState<ClassDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRankBank, setShowRankBank] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingGlobalId, setEditingGlobalId] = useState<string | null>(null);
  const [formData, setFormData] = useState<RankDef>({
    name: '', minXp: 0, color: '#fbbf24', imageUrl: ''
  });
  const [availableItems, setAvailableItems] = useState<{ id: string; title: string; type: string; imageUrl: string }[]>([]);
  const [availableChests, setAvailableChests] = useState<{ id: string; name: string; url: string; rarity?: string }[]>([]);

  const [galleryTarget, setGalleryTarget] = useState<'main' | number | null>(null);

  useEffect(() => {
    fetchRanks(false);
    fetchClasses();
    fetchAvailableItems();
    fetchChests();
  }, [tenantId]);

  const fetchChests = async () => {
    const chests = await fetchModelsByCategory('chest', tenantId);
    setAvailableChests(chests.map(c => ({ id: c.id, name: c.name, url: c.url, rarity: c.rarity })));
  };

  const fetchAvailableItems = async () => {
    try {
      let query = supabase.from('store_items').select('id, data').eq('active', true);
      if (tenantId) {
        query = query.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
      }
      const { data: snap } = await query;
      if (snap) {
        const items = snap.map((item: any) => ({
          id: item.id,
          title: item.data?.title || 'Sem nome',
          type: item.data?.type || 'consumable',
          imageUrl: item.data?.imageUrl || ''
        }));
        setAvailableItems(items);
      }
    } catch (err) {
      console.error("Erro ao carregar itens:", err);
    }
  };

  const fetchClasses = async (_showLoading = true) => {
    try {
      let query = supabase.from('classes').select('*');
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      const { data: snap } = await query;
      if (snap && snap.length > 0) {
        setClasses(snap as ClassDef[]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Remove campos de exibição (aliases camelCase) que NÃO são colunas do banco.
  // Enviá-los no INSERT/UPSERT faz o PostgREST rejeitar a linha inteira.
  const cleanRankForDb = (r: any) => {
    const { _isGlobal, _id, id, hideFromHistory, ...clean } = r || {};
    return clean;
  };

  const fetchRanks = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      // Garantir que exista base global (patentes padrão) no banco
      await ensureGlobalRanks();

      // Patentes LOCAIS da escola (exibidas no editor)
      let query = supabase.from('custom_ranks').select('*');
      if (tenantId) {
        query = query.eq('tenant_id', tenantId).eq('is_global', false);
      } else {
        // Sem tenant: não listar patentes locais órfãs de outras escolas (evita o "limbo")
        query = query.eq('tenant_id', '00000000-0000-0000-0000-000000000001').eq('is_global', false);
      }
      const { data: snap } = await query;
      let loadedRanks: (RankDef & { _isGlobal?: boolean })[] = [];
      if (snap && snap.length > 0) {
        loadedRanks = snap.map(d => {
          const { id, ...rest } = d;
          return {
            ...rest,
            hideFromHistory: d.hide_from_history ?? d.hideFromHistory ?? (d.minXp === 0),
            _isGlobal: d.is_global ?? false
          } as RankDef & { _isGlobal?: boolean };
        }).sort((a, b) => a.minXp - b.minXp);
      }
      setRanks(loadedRanks);

      // Globais (banco de patentes)
      const { data: gSnap } = await supabase.from('custom_ranks').select('*').eq('is_global', true);
      const loadedGlobals: (RankDef & { _isGlobal?: boolean; id?: string })[] = (gSnap || []).map(d => {
        const { id, ...rest } = d;
        return {
          id,
          ...rest,
          hideFromHistory: d.hide_from_history ?? d.hideFromHistory ?? (d.minXp === 0),
          _isGlobal: true
        } as RankDef & { _isGlobal?: boolean; id?: string };
      }).sort((a, b) => a.minXp - b.minXp);
      // Fallback: se não houver globais no banco, usar as patentes padrão embutidas
      const effectiveGlobals = loadedGlobals.length > 0
        ? loadedGlobals
        : DEFAULT_RANKS.map((r, i) => ({ ...r, id: `default_global_${i}`, _isGlobal: true }) as RankDef & { _isGlobal?: boolean; id?: string });
      setGlobalRanks(effectiveGlobals);

      // RANKS do jogo: apenas os LOCAIS da escola (sem fallback p/ globais —
      // se não há patentes locais, ninguém sobe de nível no jogo)
      RANKS.length = 0;
      RANKS.push(...loadedRanks);
    } catch (e) {
      console.error('Erro ao carregar patentes:', e);
    }
    setLoading(false);
  };

  const importGlobalRanks = async () => {
    const confirmed = await showConfirm('Importar patentes globais? Elas serão adicionadas à sua lista local (evitando nomes duplicados) e ficarão editáveis.');
    if (!confirmed) return;

    if (globalRanks.length === 0) return;

    const tenantPrefix = tenantId ? tenantId.replace(/-/g, '').substring(0, 8) : 'local';

    // Buscar patentes locais existentes para não duplicar por nome
    const { data: existingLocal } = await supabase
      .from('custom_ranks')
      .select('name')
      .eq('tenant_id', tenantId)
      .eq('is_global', false);

    const existingNames = new Set((existingLocal || []).map(r => (r.name as string).toLowerCase()));

    const sorted = [...globalRanks].sort((a, b) => a.minXp - b.minXp);
    
    // Obter total atual para não sobrepor IDs
    const currentCount = existingLocal?.length || 0;
    let addedCount = 0;

    for (let i = 0; i < sorted.length; i++) {
      const g = sorted[i];
      if (existingNames.has(g.name.toLowerCase())) {
        continue; // Ignora se já existe uma patente com o mesmo nome
      }
      
      const clean = cleanRankForDb(g);
      await supabase.from('custom_ranks').insert({
        id: `rank_${tenantPrefix}_${currentCount + addedCount}_${Date.now()}`,
        ...clean,
        hide_from_history: (g as any).hideFromHistory ?? ((g as any).hide_from_history ?? (g.minXp === 0)),
        tenant_id: tenantId || null,
        is_global: false
      });
      addedCount++;
    }

    await showConfirm(`${addedCount} patentes importadas com sucesso!`, 'Sucesso');
    fetchRanks(false);
  };

  const copyGlobalsAsBase = async () => {
    const confirmed = await showConfirm('Copiar patentes globais como base? Elas serão copiadas para esta escola e ficarão editáveis. As globais originais permanecem para outras escolas.');
    if (!confirmed) return;

    if (globalRanks.length === 0) return;

    const tenantPrefix = tenantId ? tenantId.replace(/-/g, '').substring(0, 8) : 'local';

    // Limpar patentes locais existentes
    const { data: existingLocal } = await supabase
      .from('custom_ranks')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_global', false);

    if (existingLocal) {
      for (const d of existingLocal) {
        await supabase.from('custom_ranks').delete().eq('id', d.id);
      }
    }

    const sorted = [...globalRanks].sort((a, b) => a.minXp - b.minXp);
    for (let i = 0; i < sorted.length; i++) {
      const clean = cleanRankForDb(sorted[i]);
      await supabase.from('custom_ranks').upsert({
        id: `rank_${tenantPrefix}_${i}`,
        ...clean,
        hide_from_history: (sorted[i] as any).hideFromHistory ?? ((sorted[i] as any).hide_from_history ?? (sorted[i].minXp === 0)),
        tenant_id: tenantId || null,
        is_global: false
      });
    }

    fetchRanks(false);
  };

  // Copiar UMA patente global para a escola (cópia local editável)
  const handleImportRankToLocal = async (global: any) => {
    const confirmed = await showConfirm('Copiar esta patente global para a sua escola? Será criada uma cópia local editável.');
    if (!confirmed) return;
    const tenantPrefix = tenantId ? tenantId.replace(/-/g, '').substring(0, 8) : 'local';
    const existingLocal = await supabase
      .from('custom_ranks')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_global', false);
    const nextIdx = existingLocal.data?.length || 0;
    const clean = cleanRankForDb(global);
    await supabase.from('custom_ranks').upsert({
      id: `rank_${tenantPrefix}_${nextIdx}`,
      ...clean,
      hide_from_history: (global as any).hideFromHistory ?? ((global as any).hide_from_history ?? (global.minXp === 0)),
      tenant_id: tenantId || null,
      is_global: false
    });
    await showConfirm('Patente copiada para a sua escola!', 'Sucesso');
    fetchRanks(false);
  };

  // Superadmin: abrir editor para editar uma patente GLOBAL do banco
  const openEditGlobal = (global: any) => {
    if (!isSuperAdmin) return;
    const { _isGlobal, _id, id: _rid, ...rankData } = global as any;
    setFormData({
      ...rankData,
      name: global.name || '',
      minXp: global.minXp || 0,
      color: global.color || '#fbbf24',
      hideFromHistory: global.hideFromHistory ?? global.hide_from_history ?? (global.minXp === 0)
    } as RankDef);
    setEditingGlobalId(global.id);
    setEditingIndex(null);
    setIsEditing(true);
  };

  // Superadmin: excluir patente GLOBAL do banco
  const handleDeleteGlobal = async (id: string) => {
    if (!isSuperAdmin) return;
    const confirmed = await showConfirm('Excluir esta patente global do banco? Isso não afeta as cópias locais das escolas.');
    if (!confirmed) return;
    await supabase.from('custom_ranks').delete().eq('id', id);
    fetchRanks(false);
  };

  const handleSaveRank = async () => {
    if (!formData.name) return;

    // Superadmin editando uma patente GLOBAL (via banco de patentes)
    if (editingGlobalId) {
      await supabase.from('custom_ranks').update({
        name: formData.name,
        minXp: formData.minXp,
        color: formData.color,
        imageUrl: formData.imageUrl || '',
        audioUrl: formData.audioUrl || '',
        variants: formData.variants || [],
        rankUpChestItems: formData.rankUpChestItems || [],
        rankUpChestModelId: formData.rankUpChestModelId || '',
        hide_from_history: formData.hideFromHistory ?? (formData.minXp === 0),
        is_global: true,
        tenant_id: null,
      }).eq('id', editingGlobalId);
      setIsEditing(false);
      setEditingGlobalId(null);
      setEditingIndex(null);
      fetchRanks(false);
      return;
    }

    // Patentes LOCAIS da escola (a lista já contém só locais)
    const localRanks = ranks.filter(r => !(r as any)._isGlobal);

    const newRanks = [...localRanks];
    let isNewRank = false;
    if (editingIndex !== null) {
      const actualIdx = localRanks.indexOf(ranks[editingIndex]);
      if (actualIdx >= 0) newRanks[actualIdx] = formData;
    } else {
      newRanks.push(formData);
      isNewRank = true;
    }

    newRanks.sort((a, b) => a.minXp - b.minXp);

    // Limpar patentes locais antigas da escola (para evitar duplicatas)
    const { data: existingLocal } = await supabase
      .from('custom_ranks')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_global', false);

    if (existingLocal) {
      for (const d of existingLocal) {
        await supabase.from('custom_ranks').delete().eq('id', d.id);
      }
    }

    // Salvar patentes locais com IDs únicos por tenant
    const tenantPrefix = tenantId ? tenantId.replace(/-/g, '').substring(0, 8) : 'local';
    for (let i = 0; i < newRanks.length; i++) {
      const src = newRanks[i] as any;
      const clean = cleanRankForDb(src);
      const { error } = await supabase.from('custom_ranks').upsert({
        id: `rank_${tenantPrefix}_${i}`,
        ...clean,
        hide_from_history: src.hideFromHistory ?? (src.minXp === 0),
        tenant_id: tenantId || null,
        is_global: false
      });
      if (error) console.error('Erro ao salvar patente local:', error);
    }

    // Nova patente também vira base GLOBAL (banco de patentes), editável só pelo superadmin
    if (isNewRank) {
      try {
        await supabase.from('custom_ranks').insert({
          id: `global_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          name: formData.name,
          minXp: formData.minXp,
          color: formData.color,
          imageUrl: formData.imageUrl || '',
          audioUrl: formData.audioUrl || '',
          variants: formData.variants || [],
          rankUpChestItems: formData.rankUpChestItems || [],
          rankUpChestModelId: formData.rankUpChestModelId || '',
          hide_from_history: formData.hideFromHistory ?? (formData.minXp === 0),
          tenant_id: null,
          is_global: true
        });
      } catch (e) {
        console.error('Erro ao criar base global da patente:', e);
      }
    }

    setRanks(newRanks);
    RANKS.length = 0;
    RANKS.push(...newRanks);

    setIsEditing(false);
    setEditingIndex(null);
    fetchRanks(false);
  };

  const handleDeleteRank = async (index: number) => {
    const confirmed = await showConfirm('Tem certeza que deseja apagar esta patente?');
    if (confirmed) {
      const target = ranks[index] as any;
      if (target._isGlobal && !isSuperAdmin) {
        await showConfirm('Patentes globais não podem ser excluídas. Apenas o superadmin pode alterá-las.', 'Ação bloqueada');
        return;
      }
      // Superadmin excluindo patente global diretamente
      if (target._isGlobal && isSuperAdmin && target.id) {
        await supabase.from('custom_ranks').delete().eq('id', target.id);
        setRanks(ranks.filter((_, i) => i !== index));
        fetchRanks(false);
        return;
      }
      const newRanks = ranks.filter((_, i) => i !== index);

      const localRanks = newRanks.filter(r => !(r as any)._isGlobal);
      const globalRanks = newRanks.filter(r => (r as any)._isGlobal);

      // Limpar patentes locais da escola
      const { data: existingLocal } = await supabase
        .from('custom_ranks')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_global', false);

      if (existingLocal) {
        for (const d of existingLocal) {
          await supabase.from('custom_ranks').delete().eq('id', d.id);
        }
      }

      const tenantPrefix = tenantId ? tenantId.replace(/-/g, '').substring(0, 8) : 'local';
      for (let i = 0; i < localRanks.length; i++) {
        const src = localRanks[i] as any;
        const clean = cleanRankForDb(src);
        await supabase.from('custom_ranks').upsert({
          id: `rank_${tenantPrefix}_${i}`,
          ...clean,
          hide_from_history: src.hideFromHistory ?? (src.minXp === 0),
          tenant_id: tenantId || null,
          is_global: false
        });
      }

      setRanks([...globalRanks, ...localRanks]);
      RANKS.length = 0;
      RANKS.push(...localRanks);
      fetchRanks(false);
    }
  };

  const openEdit = (rank: RankDef, index: number) => {
    if ((rank as any)._isGlobal && !isSuperAdmin) {
      showConfirm('Esta patente é global. Para personalizá-la, crie uma cópia local.', 'Informação');
      return;
    }
    setFormData({
      ...rank,
      hideFromHistory: rank.hideFromHistory ?? (rank.minXp === 0),
      variants: rank.variants || [],
      rankUpChestItems: rank.rankUpChestItems || [],
      rankUpChestModelId: rank.rankUpChestModelId || ''
    });
    setEditingIndex(index);
    setEditingGlobalId(null);
    setIsEditing(true);
  };

  const openNew = () => {
    const localRanks = ranks.filter(r => !(r as any)._isGlobal);
    const minXp = localRanks.length > 0 ? localRanks[localRanks.length - 1].minXp + 500 : 0;
    setFormData({
      name: '',
      minXp,
      color: '#fbbf24',
      imageUrl: '',
      variants: [],
      rankUpChestItems: [],
      rankUpChestModelId: '',
      hideFromHistory: minXp === 0
    });
    setEditingIndex(null);
    setEditingGlobalId(null);
    setIsEditing(true);
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando Patentes...</div>;

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>

      {galleryTarget !== null && createPortal(
        <ImageGalleryModal
          apiKey={pixabayKey}
          onClose={() => setGalleryTarget(null)}
          onSelectImage={(url) => {
            if (galleryTarget === 'main') {
              setFormData({ ...formData, imageUrl: url });
            } else if (typeof galleryTarget === 'number') {
              const newVariants = [...(formData.variants || [])];
              newVariants[galleryTarget].imageUrl = url;
              setFormData({ ...formData, variants: newVariants });
            }
            setGalleryTarget(null);
          }}
        />,
        document.body
      )}

      <div className="glass-panel" style={{ padding: '2rem' }}>
        <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Medal color="var(--gold-primary)" /> Patentes
            </h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Configure as patentes da sua escola. Patentes globais (🌐) são somente leitura.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button className="login-btn" onClick={importGlobalRanks} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' }}>
              <Copy size={16} /> Importar Patentes Globais
            </button>
            {globalRanks.length > 0 && (
              <button className="login-btn" onClick={() => setShowRankBank(true)} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                <Package size={16} /> Banco de Patentes
              </button>
            )}
            <button className="login-btn" onClick={openNew} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }}>
              <Plus size={18} /> Nova Patente Local
            </button>
          </div>
        </div>

        {isEditing && createPortal(
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }}>
            <div className="glass-panel" style={{ width: '500px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out' }}>
              <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card)', padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{editingIndex !== null ? 'Editar Patente Local' : 'Criar Nova Patente Local'}</h3>
                <button onClick={() => setIsEditing(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <Trash2 size={24} style={{ display: 'none' }} />
                  <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>×</span>
                </button>
              </div>
              <div style={{ padding: '1.5rem 2rem', overflowY: 'auto' }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome da Patente</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Guerreiro de Prata" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>XP Mínimo</label>
                    <input type="number" value={formData.minXp} onChange={e => setFormData({ ...formData, minXp: Number(e.target.value) })} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Cor do Brilho/Borda</label>
                    <input type="color" value={formData.color} onChange={e => setFormData({ ...formData, color: e.target.value })} style={{ width: '100%', height: '45px', padding: '0.2rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', cursor: 'pointer' }} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Arte da Patente (URL da Imagem)</label>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <input type="text" value={formData.imageUrl || ''} onChange={e => setFormData({ ...formData, imageUrl: e.target.value })} placeholder="Ex: https://..." style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
                    <DirectUploadButton folder="ranks" onUploadComplete={(url) => setFormData({ ...formData, imageUrl: url })} buttonStyle={{ minHeight: '100%' }} />
                    <button onClick={() => setGalleryTarget('main')} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', minHeight: '100%' }}>
                      <Search size={20} />
                    </button>
                  </div>
                  {formData.imageUrl && (
                    <div style={{ marginTop: '1rem', width: '120px', height: '120px', borderRadius: '12px', overflow: 'hidden', border: `3px solid ${formData.color}`, boxShadow: `0 0 15px ${formData.color}80` }}>
                      <img src={formData.imageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Música de Comemoração (Opcional - MP3/WAV)</label>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <input type="text" value={formData.audioUrl || ''} onChange={e => setFormData({ ...formData, audioUrl: e.target.value })} placeholder="URL do áudio..." style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
                    <DirectUploadButton folder="audio" accept="audio/*" onUploadComplete={(url) => setFormData({ ...formData, audioUrl: url })} buttonStyle={{ minHeight: '100%' }} />
                  </div>
                  {formData.audioUrl && (
                    <audio controls src={formData.audioUrl} style={{ marginTop: '1rem', width: '100%', height: '40px' }} />
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: 'rgba(255,255,255,0.03)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <input
                    type="checkbox"
                    id="hideFromHistoryCheckbox"
                    checked={formData.hideFromHistory ?? (formData.minXp === 0)}
                    onChange={e => setFormData({ ...formData, hideFromHistory: e.target.checked })}
                    style={{ width: '18px', height: '18px', marginTop: '2px', cursor: 'pointer' }}
                  />
                  <label htmlFor="hideFromHistoryCheckbox" style={{ color: 'var(--text-primary)', cursor: 'pointer', margin: 0, fontSize: '0.9rem' }}>
                    <strong style={{ display: 'block', color: 'var(--gold-primary)' }}>Omitir do Histórico de Conquistas</strong>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.3' }}>
                      Se ativado, esta patente não gerará registros de conquista na linha do tempo dos alunos (ideal para a patente inicial de 0 XP).
                    </span>
                  </label>
                </div>
              </div>

              {/* Itens do Baú de Patente (por patente) */}
              <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ color: 'var(--text-secondary)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Gift size={18} color="var(--gold-primary)" /> Itens do Baú de Patente
                  </label>
                  <button onClick={() => setFormData({ ...formData, rankUpChestItems: [...(formData.rankUpChestItems || []), { itemId: '', quantity: 1 }] })} style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Plus size={14} /> Adicionar Item
                  </button>
                </div>
                <p style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                  Estes itens são premiados quando o aluno alcançar ESTA patente, desde que o checkbox "Receber baú ao subir de patente" esteja ativo nas Configurações da Economia.
                </p>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                    <Gift size={16} color="var(--gold-primary)" /> Baú Visual (opcional)
                  </label>
                  <select
                    value={formData.rankUpChestModelId || ''}
                    onChange={(e) => setFormData({ ...formData, rankUpChestModelId: e.target.value || '' })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  >
                    <option value="">(Baú padrão do jogo)</option>
                    {availableChests.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.rarity ? ` — ${c.rarity}` : ''}</option>
                    ))}
                  </select>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginTop: '0.35rem' }}>
                    Arte usada na revelação do baú ao subir de patente. Cadastre na aba "Moldes 3D → Baús de Recompensa".
                  </span>
                </div>

                {(formData.rankUpChestItems || []).length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>Nenhum item configurado. Este baú não será distribuído ao alcançar esta patente.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {(formData.rankUpChestItems || []).map((slot, index) => (
                      <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <Package size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                        <select
                          value={slot.itemId}
                          onChange={(e) => {
                            const newItems = [...(formData.rankUpChestItems || [])];
                            newItems[index] = { ...newItems[index], itemId: e.target.value };
                            setFormData({ ...formData, rankUpChestItems: newItems });
                          }}
                          style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                        >
                          <option value="">Selecione um item...</option>
                          {availableItems.map(item => (
                            <option key={item.id} value={item.id}>{item.title} ({item.type === 'consumable' ? 'Consumível' : 'Equipável'})</option>
                          ))}
                        </select>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Qtd:</span>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={slot.quantity}
                            onChange={(e) => {
                              const newItems = [...(formData.rankUpChestItems || [])];
                              newItems[index] = { ...newItems[index], quantity: parseInt(e.target.value) || 1 };
                              setFormData({ ...formData, rankUpChestItems: newItems });
                            }}
                            style={{ width: '60px', padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                          />
                        </div>
                        <button
                          onClick={() => {
                            const newItems = [...(formData.rankUpChestItems || [])];
                            newItems.splice(index, 1);
                            setFormData({ ...formData, rankUpChestItems: newItems });
                          }}
                          style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.25rem' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Variações por Turma */}
              <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <label style={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}>Variações de Arte (Por Turma)</label>
                  <button onClick={() => setFormData({ ...formData, variants: [...(formData.variants || []), { classIds: [], imageUrl: '' }] })} style={{ background: 'var(--btn-bg)', border: 'none', color: 'var(--text-primary)', padding: '0.25rem 0.75rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
                    + Adicionar Variação
                  </button>
                </div>

                {(formData.variants || []).length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>Nenhuma variação específica. Todas as turmas usarão a arte padrão.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '1rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                    {(formData.variants || []).map((variant, vIdx) => (
                      <div key={vIdx} style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--gold-primary)', fontSize: '0.9rem' }}>Variação {vIdx + 1}</span>
                          <button onClick={() => {
                            const newV = [...(formData.variants || [])];
                            newV.splice(vIdx, 1);
                            setFormData({ ...formData, variants: newV });
                          }} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}><Trash2 size={16} /></button>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Turmas vinculadas:</label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {classes.map(c => {
                              const isSelected = variant.classIds.includes(c.name);
                              return (
                                <button
                                  key={c.id}
                                  onClick={() => {
                                    const newV = [...(formData.variants || [])];
                                    if (isSelected) {
                                      newV[vIdx].classIds = newV[vIdx].classIds.filter(name => name !== c.name);
                                    } else {
                                      newV[vIdx].classIds.push(c.name);
                                    }
                                    setFormData({ ...formData, variants: newV });
                                  }}
                                  style={{
                                    padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRadius: '4px', cursor: 'pointer',
                                    background: isSelected ? c.color : 'var(--btn-bg)',
                                    color: isSelected ? 'var(--text-on-gold, #000000)' : 'var(--text-secondary)',
                                    border: `1px solid ${isSelected ? c.color : 'var(--border-glass)'}`,
                                    fontWeight: isSelected ? 'bold' : 'normal'
                                  }}
                                >
                                  {c.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Imagem da Variação</label>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input type="text" value={variant.imageUrl} onChange={e => {
                              const newV = [...(formData.variants || [])];
                              newV[vIdx].imageUrl = e.target.value;
                              setFormData({ ...formData, variants: newV });
                            }} placeholder="URL..." style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />

                            <DirectUploadButton folder="ranks" onUploadComplete={(url) => {
                              const newV = [...(formData.variants || [])];
                              newV[vIdx].imageUrl = url;
                              setFormData({ ...formData, variants: newV });
                            }} buttonStyle={{ minHeight: '100%', padding: '0 0.5rem' }} />

                            <button onClick={() => setGalleryTarget(vIdx)} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0 0.75rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                              <Search size={16} />
                            </button>
                          </div>
                          {variant.imageUrl && (
                            <div style={{ marginTop: '0.5rem', width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', border: `2px solid ${formData.color}` }}>
                              <img src={variant.imageUrl} alt="Variant Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
                <button onClick={() => setIsEditing(false)} style={{ background: 'transparent', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleSaveRank} className="login-btn" style={{ padding: '0.75rem 1.5rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }}>Salvar Patente</button>
              </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        <div style={{ display: 'grid', gap: '1rem' }}>
          {ranks.map((rank, idx) => {
            const isGlobal = (rank as any)._isGlobal;
            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <AnimatedRankIcon rank={rank} />
                  <div>
                    <h3 style={{ margin: 0, color: rank.color, fontSize: '1.2rem', textShadow: `0 0 5px ${rank.color}80`, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {rank.name}
                      {isGlobal ? <span title="Global (somente leitura)"><Globe size={14} color="var(--text-secondary)" /></span> : <span title="Local (editável)"><Building2 size={14} color="#10b981" /></span>}
                    </h3>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span>A partir de {rank.minXp} XP</span>
                      {(rank.hideFromHistory || (rank.minXp === 0 && rank.hideFromHistory !== false)) && (
                        <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                          Oculta do Histórico
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => openEdit(rank, idx)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.5rem' }} disabled={isGlobal && !isSuperAdmin}><Edit2 size={18} /></button>
                  <button onClick={() => handleDeleteRank(idx)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.5rem' }} disabled={(isGlobal && !isSuperAdmin) || ranks.length === 1}><Trash2 size={18} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Banco de Patentes (globais) */}
      {showRankBank && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div className="glass-panel" style={{ width: '700px', maxWidth: '95vw', maxHeight: '90vh', padding: '2rem', display: 'flex', flexDirection: 'column', background: 'var(--bg-dark)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gold-primary)' }}>
                <Medal color="var(--gold-primary)" /> Banco de Patentes (Global)
              </h2>
              <button onClick={() => setShowRankBank(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
              Patentes globais criadas por todas as escolas. {isSuperAdmin ? 'Como superadmin, você edita/exclui a base global.' : 'Copie para a sua escola para editar localmente.'}
            </p>
            {!isSuperAdmin ? (
              <div style={{ marginBottom: '1rem' }}>
                <button className="login-btn" onClick={async () => { await importGlobalRanks(); }} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--btn-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' }}>
                  <Copy size={16} /> Importar Todas de uma vez
                </button>
              </div>
            ) : (
              <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="login-btn" onClick={async () => { await importGlobalRanks(); }} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--btn-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' }}>
                  <Copy size={16} /> Importar Todas para esta Escola
                </button>
                <button className="login-btn" onClick={async () => { await copyGlobalsAsBase(); }} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(251, 191, 36, 0.15)', color: 'var(--gold-primary)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
                  <Gift size={16} /> Substituir Base da Escola pelas Padrão
                </button>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gap: '0.5rem' }}>
              {globalRanks.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Nenhuma patente global no banco ainda.</p>
              ) : globalRanks.map((rank, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <AnimatedRankIcon rank={rank} />
                    <div>
                      <h4 style={{ margin: 0, color: rank.color, fontSize: '1rem' }}>{rank.name}</h4>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>A partir de {rank.minXp} XP</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => handleImportRankToLocal(rank)} style={{ padding: '0.4rem 0.8rem', background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Copy size={14} /> Copiar
                    </button>
                    {isSuperAdmin && (
                      <>
                        <button onClick={() => openEditGlobal(rank)} style={{ padding: '0.4rem 0.8rem', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Edit2 size={14} /> Editar
                        </button>
                        <button onClick={() => handleDeleteGlobal(rank.id || '')} style={{ padding: '0.4rem 0.8rem', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Trash2 size={14} /> Excluir
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}