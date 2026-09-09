import { useState, useEffect } from 'react';
// @ts-ignore
import { User, Swords, Dog, Settings, Trash2, Edit2, Plus, Shield, Zap } from 'lucide-react';
import AvatarCustomizationModal from './AvatarCustomizationModal';
import AdminPresetSkinsManager from './AdminPresetSkinsManager';
import Admin3DModelsManager from './Admin3DModelsManager';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useDialog } from '../contexts/DialogContext';
import { safeParseAvatarConfig } from './AvatarCharacter';
import { sessionCache, CACHE_KEYS } from '../lib/sessionCache';

export default function AdminEntitiesManager() {
  const [activeTab, setActiveTab] = useState<'players' | 'monsters' | 'pets' | 'skins' | 'models'>('players');
  const { tenantId } = useTenant();
  const { showAlert, showConfirm } = useDialog();
  const [skinModels, setSkinModels] = useState<any[]>([]);
  const [monsterModelUrl, setMonsterModelUrl] = useState('');
  const [monstersList, setMonstersList] = useState<any[]>([]);
  // @ts-ignore
  const [loadingMonsters, setLoadingMonsters] = useState(false);
  const [selectedMonsterForEdit, setSelectedMonsterForEdit] = useState<any | null>(null);

  const fetchSkinModels = () => {
    let q = supabase.from('3d_models').select('*');
    if (tenantId) q = q.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
    q.then(({ data }) => {
      const list = (data || []).filter(m => (m.category || 'skin') === 'skin');
      setSkinModels(list);
      // Se o molde selecionado foi excluído, reseta o estado (senão a URL antiga
      // persiste e é aplicada como initialConfig, carregando o GLB excluído).
      setMonsterModelUrl(prev => (list.some(m => m.url === prev) ? prev : ''));
    }, () => { });
  };

  const fetchMonsters = async () => {
    setLoadingMonsters(true);
    sessionCache.invalidate(CACHE_KEYS.presetSkins(tenantId));
    let q = supabase.from('preset_skins').select('*').eq('type', 'monster');
    if (tenantId) q = q.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
    const { data } = await q;

    // Busca missões para auto-sincronizar quaisquer sons ou falas legadas
    let questQuery = supabase.from('quests').select('id, monsterName, monsterModelUrl, monster_gender, monster_attack_sound, monster_grunt_sound, monster_damage_sound, monsterQuotes, monsterDefeatQuotes, monsterDrops, monsterAvatarConfig, tenant_id');
    if (tenantId) questQuery = questQuery.eq('tenant_id', tenantId);
    const { data: questData } = await questQuery;

    const mapped = (data || []).map(d => {
      const cfg: any = safeParseAvatarConfig(d.config) || {};

      // Se a criatura salva em preset_skins não tiver sons/falas/gênero preenchidos,
      // busca nas missões que usam este monstro e preenche automaticamente
      if (questData && questData.length > 0 && (!cfg.attackSound || !cfg.gruntSound || !cfg.damageSound || !cfg.gender)) {
        const matchingQuest = questData.find(q =>
          (q.monsterName && d.name && q.monsterName.trim().toLowerCase() === d.name.trim().toLowerCase()) ||
          (q.monsterModelUrl && cfg.customModelUrl && q.monsterModelUrl === cfg.customModelUrl)
        );
        if (matchingQuest) {
          let updated = false;
          if (!cfg.gender && matchingQuest.monster_gender) { cfg.gender = matchingQuest.monster_gender; updated = true; }
          if (!cfg.attackSound && matchingQuest.monster_attack_sound) { cfg.attackSound = matchingQuest.monster_attack_sound; updated = true; }
          if (!cfg.gruntSound && matchingQuest.monster_grunt_sound) { cfg.gruntSound = matchingQuest.monster_grunt_sound; updated = true; }
          if (!cfg.damageSound && matchingQuest.monster_damage_sound) { cfg.damageSound = matchingQuest.monster_damage_sound; updated = true; }
          if (!cfg.quotes && matchingQuest.monsterQuotes) { cfg.quotes = matchingQuest.monsterQuotes; updated = true; }
          if (!cfg.drops && matchingQuest.monsterDrops) { cfg.drops = matchingQuest.monsterDrops; updated = true; }

          if (updated) {
            supabase.from('preset_skins').update({ config: JSON.stringify(cfg) }).eq('id', d.id).then(() => { });
          }
        }
      }

      return {
        ...d,
        parsedConfig: cfg
      };
    });

    setMonstersList(mapped);
    setLoadingMonsters(false);
  };

  // Busca na abertura e sempre que trocar de guia (novos moldes aparecem sem recarregar)
  useEffect(() => {
    fetchSkinModels();
    if (activeTab === 'monsters') {
      fetchMonsters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, activeTab]);

  // Atualiza quando um molde é salvo/excluído no Moldes 3D
  useEffect(() => {
    const onModelsChanged = () => {
      fetchSkinModels();
      if (activeTab === 'monsters') fetchMonsters();
    };
    window.addEventListener('models3d-changed', onModelsChanged);
    return () => window.removeEventListener('models3d-changed', onModelsChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const handleDeleteMonster = async (id: string, name: string) => {
    const confirm = await showConfirm(`Tem certeza que deseja excluir o monstro "${name}"?`);
    if (!confirm) return;
    const { error } = await supabase.from('preset_skins').delete().eq('id', id);
    if (error) {
      showAlert(`Erro ao excluir: ${error.message}`);
    } else {
      showAlert(`Monstro "${name}" excluído com sucesso!`);
      if (selectedMonsterForEdit?.id === id) {
        setSelectedMonsterForEdit(null);
        setMonsterModelUrl('');
      }
      fetchMonsters();
      sessionCache.invalidate(CACHE_KEYS.presetSkins(tenantId));
    }
  };

  return (
    <div>
      {/* Sticky Header Area */}
      <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
        <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Gerenciar Entidades 3D</h2>

        {/* Tabs */}
        <div className="hide-scrollbar" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
          <button
            onClick={() => setActiveTab('players')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.75rem 1.5rem', borderRadius: '8px',
              color: activeTab === 'players' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              backgroundColor: activeTab === 'players' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
              fontWeight: activeTab === 'players' ? 'bold' : 'normal',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              transition: 'all 0.2s'
            }}
          >
            <User size={18} /> Jogadores
          </button>
          <button
            onClick={() => setActiveTab('monsters')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.75rem 1.5rem', borderRadius: '8px',
              color: activeTab === 'monsters' ? 'var(--accent-red)' : 'var(--text-secondary)',
              backgroundColor: activeTab === 'monsters' ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
              fontWeight: activeTab === 'monsters' ? 'bold' : 'normal',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              transition: 'all 0.2s'
            }}
          >
            <Swords size={18} /> Monstros
          </button>
          <button
            onClick={() => setActiveTab('pets')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.75rem 1.5rem', borderRadius: '8px',
              color: activeTab === 'pets' ? 'var(--gold-primary)' : 'var(--text-secondary)',
              backgroundColor: activeTab === 'pets' ? 'rgba(251, 191, 36, 0.1)' : 'transparent',
              fontWeight: activeTab === 'pets' ? 'bold' : 'normal',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              transition: 'all 0.2s'
            }}
          >
            <Dog size={18} /> Pets
          </button>
          <button
            onClick={() => setActiveTab('skins')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.75rem 1.5rem', borderRadius: '8px',
              color: activeTab === 'skins' ? '#60a5fa' : 'var(--text-secondary)',
              backgroundColor: activeTab === 'skins' ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
              fontWeight: activeTab === 'skins' ? 'bold' : 'normal',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              transition: 'all 0.2s'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg> Skins
          </button>
          <button
            onClick={() => setActiveTab('models')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.75rem 1.5rem', borderRadius: '8px',
              color: activeTab === 'models' ? '#10b981' : 'var(--text-secondary)',
              backgroundColor: activeTab === 'models' ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
              fontWeight: activeTab === 'models' ? 'bold' : 'normal',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              transition: 'all 0.2s'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> Moldes 3D
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="glass-panel" style={{ padding: '1rem' }}>
        {activeTab === 'players' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem' }}>Configuração de Jogadores</h3>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Configure a aparência base do avatar.</span>
            </div>
            <AvatarCustomizationModal
              key="player-modal"
              isOpen={true}
              onClose={() => { }}
              isAdmin={true}
              inline={true}
              customSaveMode={false}
            />
          </div>
        )}

        {activeTab === 'monsters' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem' }}>
            {/* Cabeçalho */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Swords size={20} color="var(--accent-red)" /> Galeria de Monstros Criados ({monstersList.length})
                </h3>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Monstros cadastrados com golpes personalizados e tamanho definido para uso nas missões.
                </span>
              </div>
              <button
                onClick={() => {
                  setSelectedMonsterForEdit(null);
                  setMonsterModelUrl('');
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.6rem 1.2rem', borderRadius: '8px',
                  background: !selectedMonsterForEdit ? 'var(--accent-primary)' : 'rgba(59, 130, 246, 0.15)',
                  color: '#fff', border: '1px solid var(--accent-primary)',
                  cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem'
                }}
              >
                <Plus size={16} /> Criar Novo Monstro
              </button>
            </div>

            {/* Lista de Monstros Existentes */}
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--border-glass)' }}>
              {monstersList.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Nenhum monstro cadastrado ainda. Use o formulário abaixo para criar seu primeiro monstro!
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                  {monstersList.map(m => {
                    const isEditing = selectedMonsterForEdit?.id === m.id;
                    const cfg = m.parsedConfig;
                    const attacks = cfg?.attacks;
                    const hasCustomAttacks = !!attacks && (!!attacks.melee || !!attacks.ranged?.enabled || !!attacks.special?.enabled || !!attacks.support?.enabled || !!attacks.heal?.enabled);
                    const modelObj = skinModels.find(sm => sm.url === cfg?.customModelUrl || sm.id === m.baseModelId);
                    const modelName = modelObj ? modelObj.name : (cfg?.customModelUrl ? 'Molde 3D Customizado' : (m.url ? 'Skin 2D' : 'Avatar Base'));
                    const zoomVal = cfg?.customZoom || 1;

                    return (
                      <div
                        key={m.id}
                        style={{
                          background: isEditing ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-dark)',
                          border: isEditing ? '2px solid var(--accent-primary)' : '1px solid var(--border-glass)',
                          borderRadius: '10px',
                          padding: '1rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.6rem',
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 'bold' }}>
                              {m.name}
                            </h4>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              {modelName}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              title="Editar este monstro"
                              onClick={() => {
                                setSelectedMonsterForEdit(m);
                                setMonsterModelUrl(cfg?.customModelUrl || modelObj?.url || '');
                              }}
                              style={{ background: 'rgba(59, 130, 246, 0.2)', border: 'none', borderRadius: '6px', padding: '6px', color: 'var(--accent-primary)', cursor: 'pointer' }}
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              title="Excluir monstro"
                              onClick={() => handleDeleteMonster(m.id, m.name)}
                              style={{ background: 'rgba(239, 68, 68, 0.2)', border: 'none', borderRadius: '6px', padding: '6px', color: 'var(--accent-red)', cursor: 'pointer' }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.75rem' }}>
                          <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px', color: zoomVal !== 1 ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: zoomVal !== 1 ? 'bold' : 'normal' }}>
                            📏 Escala: {zoomVal}x
                          </span>
                          {hasCustomAttacks ? (
                            <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              ⚔️ Golpes Ativos
                            </span>
                          ) : (
                            <span style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '4px' }}>
                              Golpe Básico
                            </span>
                          )}
                        </div>

                        {hasCustomAttacks && attacks && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                            {attacks.ranged?.enabled && <span style={{ background: 'rgba(59, 130, 246, 0.12)', padding: '1px 6px', borderRadius: '3px' }}>🏹 Distância ({attacks.ranged.effect || 'impacto'})</span>}
                            {attacks.special?.enabled && <span style={{ background: 'rgba(168, 85, 247, 0.12)', padding: '1px 6px', borderRadius: '3px' }}>⚡ Especial ({attacks.special.proceduralType || 'redemoinho'})</span>}
                            {attacks.support?.enabled && <span style={{ background: 'rgba(234, 179, 8, 0.12)', padding: '1px 6px', borderRadius: '3px' }}>🛡️ Suporte</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Formulário / Customizador */}
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ marginBottom: '1rem', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '8px', padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {selectedMonsterForEdit ? (
                      <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>
                        ✏️ Editando Monstro: "{selectedMonsterForEdit.name}"
                      </span>
                    ) : (
                      'Começar a partir de um Molde 3D importado (Skins de Monstros e Pets)'
                    )}
                  </label>
                  {selectedMonsterForEdit && (
                    <button
                      onClick={() => {
                        setSelectedMonsterForEdit(null);
                        setMonsterModelUrl('');
                      }}
                      style={{ background: 'transparent', border: '1px dashed var(--border-glass)', borderRadius: '4px', color: 'var(--text-secondary)', fontSize: '0.75rem', padding: '2px 8px', cursor: 'pointer' }}
                    >
                      Cancelar Edição (Criar Novo)
                    </button>
                  )}
                </div>
                <select
                  value={monsterModelUrl}
                  onChange={e => setMonsterModelUrl(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                >
                  <option value="">(Criar monstro do zero)</option>
                  {skinModels.map(m => <option key={m.id} value={m.url}>{m.name}</option>)}
                </select>
                <span style={{ display: 'block', marginTop: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                  Modelos .glb com cores próprias são usados direto, sem precisar de skin.
                </span>
              </div>

              <AvatarCustomizationModal
                key={`monster-modal-${selectedMonsterForEdit ? selectedMonsterForEdit.id : (monsterModelUrl || 'new')}`}
                isOpen={true}
                onClose={() => { }}
                isAdmin={true}
                inline={true}
                customSaveMode={true}
                initialMonsterName={selectedMonsterForEdit ? selectedMonsterForEdit.name : ''}
                initialSkinId={selectedMonsterForEdit ? selectedMonsterForEdit.id : null}
                initialConfig={selectedMonsterForEdit ? selectedMonsterForEdit.parsedConfig : (monsterModelUrl ? { customModelUrl: monsterModelUrl } as any : undefined)}
                onSave={(savedConfig, savedName) => {
                  fetchMonsters();
                  if (selectedMonsterForEdit) {
                    setSelectedMonsterForEdit(prev => prev ? {
                      ...prev,
                      name: savedName || prev.name,
                      parsedConfig: savedConfig || prev.parsedConfig
                    } : null);
                  }
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'pets' && (
          <div style={{ textAlign: 'center', padding: '4rem 0', opacity: 0.7 }}>
            <Dog size={64} style={{ marginBottom: '1rem', color: 'var(--gold-primary)' }} />
            <h3 style={{ marginBottom: '0.5rem' }}>Sistema de Pets em Breve</h3>
            <p style={{ color: 'var(--text-secondary)' }}>Esta funcionalidade está em desenvolvimento e estará disponível em atualizações futuras.</p>
          </div>
        )}

        {activeTab === 'skins' && (
          <AdminPresetSkinsManager />
        )}

        {activeTab === 'models' && (
          <Admin3DModelsManager />
        )}
      </div>
    </div>
  );
}
