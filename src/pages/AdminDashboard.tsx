import { useState, useEffect, useRef } from 'react';
import { ShieldAlert, Users, BookOpen, Settings, LogOut, ArrowLeft, Plus, Star, X, GraduationCap, History, Trash2, Edit2, Medal, Swords, Save, Image as ImageIcon, Search, Store, RefreshCw, Box, Package, Play, UserCheck, Menu, CircleDollarSign, ChevronDown, MessageCircle, Gift, Filter, Eye, EyeOff, ShieldCheck, KeyRound, Copy, RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, mapUserToClient, type UserData } from '../contexts/AuthContext';
import { useTenant, type Tenant } from '../contexts/TenantContext';
import { supabase } from '../lib/supabase';
import { getRankForXp } from '../lib/ranks';
import { DEFAULT_EVALUATIONS, type EvaluationType } from '../lib/evaluations';
import ImageGalleryModal from '../components/ImageGalleryModal';
import DirectUploadButton from '../components/DirectUploadButton';
import AdminStoreManager from '../components/AdminStoreManager';
import AdminRankManager from '../components/AdminRankManager';
import AdminEntitiesManager from '../components/AdminEntitiesManager';
import AdminRolesManager from '../components/AdminRolesManager';
import { usePermissions, fetchRoles, fetchUserRoles, assignRoleToUser, removeRoleFromUser, getPanelRoleName, panelLabel, baseRolePanelLabel, type RoleDef } from '../lib/permissions';
import AdminCompanionTipsManager from '../components/AdminCompanionTipsManager';
import TenantSwitcher from '../components/TenantSwitcher';
import AdminEconomySettings from '../components/AdminEconomySettings';
import AvatarCustomizationModal from '../components/AvatarCustomizationModal';
import ArenaBgEditor from '../components/ArenaBgEditor';
import AvatarCharacter, { type AvatarConfig } from '../components/AvatarCharacter';
import LazyAnimatedAvatar from '../components/LazyAnimatedAvatar';
import QuestionBankModal from '../components/QuestionBankModal';
import QuestQuestionsEditor from '../components/QuestQuestionsEditor';
import QuestConfigModal from '../components/QuestConfigModal';
import AvatarPrint from '../components/AvatarPrint';
import PublicProfileModal from '../components/PublicProfileModal';
import PreAuthorizedStudentsManager from '../components/PreAuthorizedStudentsManager';
import { useDialog } from '../contexts/DialogContext';
import { validateCharacterName, normalizeForComparison, formatFirstAndLastName } from '../lib/nameValidation';
import { normalizeCombatCoinDrop } from '../lib/utils';
import { createLocalAccount, generatePassword, resetLocalPassword, listLocalAccounts, deleteLocalAccount, type LocalAccountRow } from '../lib/localAuth';

export interface ClassDef {
  id: string;
  name: string;
  code?: string;
  color: string;
}

export interface QuestOption {
  text: string;
  imageUrl?: string;
}

export interface QuestQuestion {
  title: string;
  imageUrl?: string;
  timeLimit: number; // Em segundos
  options: QuestOption[];
  correctIndex: number;
}

export interface QuestDef {
  id: string;
  title: string;
  description: string;
  coverImageUrl?: string;
  baseXp: number;
  allowRetries: boolean;
  xpPenaltyPerRetry: number;
  questions: QuestQuestion[];
  monsterName?: string;
  monsterAvatarConfig?: AvatarConfig;
  monsterModelUrl?: string;
  monsterQuotes?: {
    hp100_80?: string;
    hp79_50?: string;
    hp49_25?: string;
    hp24_0?: string;
  };
  monsterDefeatQuotes?: string;
  chestConfig?: {
    maxCoins?: number;
    itemIds?: string[];
    itemQuantities?: number[];
    slotChances?: number[];
    dropChance?: number;
    chestModelId?: string;
  };
  mode?: 'classic' | 'live';
  liveChest1stPlace?: { maxCoins?: number; itemIds?: string[]; itemQuantities?: number[]; };
  liveChest2ndPlace?: { maxCoins?: number; itemIds?: string[]; itemQuantities?: number[]; };
  liveChest3rdPlace?: { maxCoins?: number; itemIds?: string[]; itemQuantities?: number[]; };
  monsterDrops?: {
    itemId: string;
    dropChance: number;
  }[];
  battleBgUrl?: string;
  battleBgPosX?: number;
  battleBgPosY?: number;
  battleBgScale?: number;
  battleBgMoveEnabled?: boolean;
  battleBgMoveDirection?: 'horizontal' | 'vertical' | 'diagonal';
  battleBgMoveSpeed?: number;
  battleBgMoveDuration?: number;
  podiumBgUrl?: string;
  podiumBgPosX?: number;
  podiumBgPosY?: number;
  podiumBgScale?: number;
  combatCoinDrop?: {
    minCoins?: number;
    maxCoins?: number;
    minValue?: number;
    maxValue?: number;
  };
  active: boolean;
  createdBy?: string;
  creatorRole?: string;
  targetClasses?: string[];
  shuffleQuestions?: boolean;
  shuffleAnswers?: boolean;
  randomQuestionSelection?: boolean;
  randomQuestionCount?: number;
  tenant_id?: string | null;
}

interface StoreItemOption {
  id: string;
  title?: string;
  type?: string;
  itemImageUrl?: string;
  imageUrl?: string;
  [key: string]: any;
}

function StoreItemSelect({ value, onChange, items, placeholder = '(Nenhum Item)', disabledIds = [] }: {
  value: string;
  onChange: (id: string, item: StoreItemOption | null) => void;
  items: StoreItemOption[];
  placeholder?: string;
  disabledIds?: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedItem = items.find(i => i.id === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getSortKey = (item: StoreItemOption) => (item.title || '').toLowerCase();

  const filtered = items.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (i.title || '').toLowerCase().includes(q) || (i.type || '').toLowerCase().includes(q);
  });

  const consumables = filtered.filter(i => i.type === 'consumable').sort((a, b) => getSortKey(a).localeCompare(getSortKey(b)));
  const equippables = filtered.filter(i => i.type !== 'consumable').sort((a, b) => getSortKey(a).localeCompare(getSortKey(b)));

  const renderOption = (item: StoreItemOption) => {
    const imgUrl = item.itemImageUrl || item.imageUrl || '';
    const isDisabled = disabledIds.includes(item.id);
    const typeLabel = item.type === 'consumable' ? 'Consumível' : 'Equipável';
    return (
      <div
        key={item.id}
        onClick={() => { if (!isDisabled) { onChange(item.id, item); setIsOpen(false); setSearch(''); } }}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem',
          cursor: isDisabled ? 'not-allowed' : 'pointer', opacity: isDisabled ? 0.4 : 1,
          background: value === item.id ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (!isDisabled) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.08)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = value === item.id ? 'rgba(245, 158, 11, 0.15)' : 'transparent'; }}
      >
        {imgUrl ? (
          <img src={imgUrl} alt="" style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
        ) : (
          <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'var(--text-secondary)' }}>?</div>
        )}
        <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || 'Sem nome'}</span>
        <span style={{ fontSize: '0.7rem', color: item.type === 'consumable' ? '#10b981' : '#3b82f6', fontWeight: 'bold', flexShrink: 0 }}>{typeLabel}</span>
      </div>
    );
  };

  const renderGroup = (label: string, color: string, groupItems: StoreItemOption[]) => {
    if (groupItems.length === 0) return null;
    return (
      <div>
        <div style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem', fontWeight: 'bold', color, textTransform: 'uppercase', letterSpacing: '1px', background: 'rgba(0,0,0,0.3)', position: 'sticky', top: 0, zIndex: 1 }}>
          {label} ({groupItems.length})
        </div>
        {groupItems.map(renderOption)}
      </div>
    );
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem',
          borderRadius: '8px', background: 'var(--bg-dark)', border: isOpen ? '1px solid var(--gold-primary)' : '1px solid var(--border-glass)',
          cursor: 'pointer', minHeight: '42px', transition: 'border-color 0.2s',
        }}
      >
        {selectedItem ? (
          <>
            {(selectedItem.itemImageUrl || selectedItem.imageUrl) ? (
              <img src={selectedItem.itemImageUrl || selectedItem.imageUrl} alt="" style={{ width: '20px', height: '20px', borderRadius: '3px', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '20px', height: '20px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)' }} />
            )}
            <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedItem.title || 'Sem nome'}</span>
            <span style={{ fontSize: '0.7rem', color: selectedItem.type === 'consumable' ? '#10b981' : '#3b82f6', fontWeight: 'bold' }}>{selectedItem.type === 'consumable' ? 'Cons.' : 'Equip.'}</span>
          </>
        ) : (
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{placeholder}</span>
        )}
        <ChevronDown size={14} style={{ color: 'var(--text-secondary)', marginLeft: 'auto', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          background: 'rgba(25, 30, 40, 0.98)', backdropFilter: 'blur(12px)',
          border: '1px solid var(--gold-primary)', borderRadius: '8px',
          marginTop: '4px', maxHeight: '280px', overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', position: 'sticky', top: 0, background: 'rgba(25, 30, 40, 0.98)', zIndex: 2 }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar item..."
              style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
            />
          </div>
          <div onClick={() => { onChange('', null); setIsOpen(false); setSearch(''); }} style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            {placeholder}
          </div>
          {renderGroup('Consumíveis', '#10b981', consumables)}
          {renderGroup('Equipamentos', '#3b82f6', equippables)}
          {consumables.length === 0 && equippables.length === 0 && (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Nenhum item encontrado</div>
          )}
        </div>
      )}
    </div>
  );
}

// Componente para card de aprovação de aluno
function StudentEnrollmentCard({ reqUser, tenantId, schoolClasses, userData, onApprove, onReject, showConfirm, showAlert }: {
  reqUser: any;
  tenantId: string | null;
  schoolClasses: any[];
  userData: any;
  onApprove: () => void;
  onReject: () => void;
  showConfirm: (title: string, msg: string) => Promise<boolean>;
  showAlert: (title: string, msg: string) => void;
}) {
  const [schoolName, setSchoolName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSchoolName();
  }, [reqUser.tenantId]);

  const fetchSchoolName = async () => {
    try {
      if (reqUser.tenantId) {
        const { data } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', reqUser.tenantId)
          .maybeSingle();
        if (data) setSchoolName(data.name);
      }
    } catch (err) {
      console.error('Erro ao buscar escola:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (await showConfirm('Aprovar Aluno', `Aprovar ${reqUser.name} como aluno?`)) {
      // Usar escola e turma que o aluno escolheu (salvas no próprio usuário)
      const targetTenantId = reqUser.tenantId || tenantId;
      const targetClassName = reqUser.pendingClassName || reqUser.classId || schoolClasses[0]?.name || 'Sem Turma';
      
      if (targetTenantId) {
        // 1. Atualizar role para student e associar à escola/turma
        const { error: userUpdateError } = await supabase.from('users').update({ 
          role: 'student',
          tenant_id: targetTenantId,
          class_id: targetClassName,
          xp: 0,
          coins: 0
        }).eq('id', reqUser.uid);
        
        if (userUpdateError) {
          console.error('Erro ao aprovar aluno:', userUpdateError);
          showAlert('Erro', 'Não foi possível aprovar o aluno.');
          return;
        }
        
        // 2. Tentar limpar pending_class_name (pode não existir ainda)
        try {
          await supabase.from('users').update({ pending_class_name: null }).eq('id', reqUser.uid);
        } catch (e) {
          console.warn('Coluna pending_class_name não existe, ignorando:', e);
        }
        
        // 3. Criar relação tenant_users
        await supabase.from('tenant_users').upsert({
          tenant_id: targetTenantId,
          user_id: reqUser.uid,
          role: 'student'
        }, { onConflict: 'tenant_id,user_id' });
        
        // 4. Atualizar status da solicitação se existir
        try {
          await supabase.from('enrollment_requests')
            .update({ status: 'approved', reviewed_by: userData?.uid, reviewed_at: new Date().toISOString() })
            .eq('user_id', reqUser.uid)
            .eq('status', 'pending');
        } catch (e) { console.error('Erro ao atualizar solicitação:', e); }

        // 5. Garantir que o aluno esteja na lista de pré-autorizados
        try {
          const { data: existingPreAuth } = await supabase
            .from('pre_authorized_students')
            .select('id')
            .eq('tenant_id', targetTenantId)
            .eq('name', reqUser.name)
            .limit(1);
          if (existingPreAuth && existingPreAuth.length > 0) {
            // Já está na lista → limpar marca de rejeição (agora foi aprovado)
            await supabase.from('pre_authorized_students')
              .update({ rejected: false })
              .eq('id', existingPreAuth[0].id);
          } else {
            // Não está na lista → cadastrar automaticamente
            await supabase.from('pre_authorized_students').insert({
              tenant_id: targetTenantId,
              name: reqUser.name,
              class_name: targetClassName,
              imported_from: 'approval',
              rejected: false
            });
          }
        } catch (e) { console.error('Erro ao adicionar na pré-autorização:', e); }

        showAlert('Sucesso', `${reqUser.name} foi aprovado como aluno da turma ${targetClassName}!`);
      } else {
        showAlert('Erro', 'Não foi possível determinar a escola do aluno.');
      }
      onApprove();
    }
  };

  const handleReject = async () => {
    if (await showConfirm('Rejeitar Aluno', `Deseja rejeitar a solicitação de ${reqUser.name}?`)) {
      // Primeiro: reverter o role para student e limpar escola/turma (colunas que sempre existem)
      const { error: updateError } = await supabase.from('users').update({ 
        role: 'student', 
        tenant_id: null, 
        class_id: null 
      }).eq('id', reqUser.uid);
      
      if (updateError) {
        console.error('Erro ao rejeitar aluno:', updateError);
        showAlert('Erro', 'Não foi possível rejeitar o aluno. Verifique se as colunas existem.');
        return;
      }
      
      // Tentar limpar pending_class_name (pode não existir ainda)
      try {
        await supabase.from('users').update({ pending_class_name: null }).eq('id', reqUser.uid);
      } catch (e) {
        console.warn('Coluna pending_class_name não existe, ignorando:', e);
      }
      
      // Remover solicitação de matrícula se existir
      try {
        await supabase.from('enrollment_requests').delete().eq('user_id', reqUser.uid);
      } catch (e) { console.error('Erro ao remover solicitação:', e); }
      
      // Marcar como rejeitado na lista pré-autorizada (se o aluno estiver nela)
      try {
        const rejectTenant = reqUser.tenantId || tenantId;
        let rejectQuery = supabase.from('pre_authorized_students').update({ rejected: true });
        if (rejectTenant) {
          rejectQuery = rejectQuery.eq('tenant_id', rejectTenant);
        } else {
          rejectQuery = rejectQuery.is('tenant_id', null);
        }
        await rejectQuery.eq('name', reqUser.name);
      } catch (e) { console.error('Erro ao marcar rejeição na pré-autorização:', e); }
      
      onReject();
      showAlert('Sucesso', `${reqUser.name} foi rejeitado e poderá escolher outra escola/turma.`);
    }
  };

  const chosenSchool = schoolName || (reqUser.tenantId ? `ID: ${reqUser.tenantId.substring(0, 8)}...` : 'Não definida');
  const chosenClass = reqUser.pendingClassName || 'Não definida';

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', border: '1px solid #3b82f6', background: 'rgba(59, 130, 246, 0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <img src={reqUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(reqUser.name)}`} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%' }} />
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <h4 style={{ margin: 0, fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reqUser.name}</h4>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{reqUser.email}</span>
        </div>
      </div>
      
      {/* Informações da escola e turma escolhidas pelo aluno */}
      {loading ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Carregando informações...</div>
      ) : (
        <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Escola escolhida:</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--gold-primary)' }}>{chosenSchool}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Turma escolhida:</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--accent-blue)' }}>{chosenClass}</span>
          </div>
        </div>
      )}
      
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
        <button 
          onClick={handleReject}
          className="login-btn" 
          style={{ flex: 1, padding: '0.5rem', background: 'rgba(239, 68, 68, 0.2)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)' }}
        >
          Rejeitar
        </button>
        <button 
          onClick={handleApprove}
          className="login-btn" 
          style={{ flex: 1, padding: '0.5rem', background: 'var(--accent-green)', color: 'white', border: 'none' }}
        >
          Aprovar
        </button>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { showAlert, showConfirm, showToast } = useDialog();
  const { userData, startImpersonation } = useAuth();
  const { tenant, tenantId, tenants, isSuperAdmin, noTenants, switchTenant, createTenant, updateTenant, deleteTenant, refreshTenants } = useTenant();
  const { can: canView } = usePermissions();
  const navigate = useNavigate();
  // Nome da função que dá título ao painel (função de hierarquia ou base)
  const [panelRoleName, setPanelRoleName] = useState(() => baseRolePanelLabel(userData?.role));
  useEffect(() => {
    if (!userData?.uid) return;
    let active = true;
    getPanelRoleName(userData.uid, tenantId, userData.role).then(n => { if (active) setPanelRoleName(n); }).catch(() => {});
    return () => { active = false; };
  }, [userData?.uid, tenantId, userData?.role]);
  // Guias internas do "Geral" e quem pode ver cada uma
  const generalTabOptions = [
    { key: 'config', label: 'Avaliação', icon: <Settings size={17} />, check: canView('config', 'view') },
    { key: 'tenants', label: 'Escolas', icon: <GraduationCap size={17} />, check: isSuperAdmin && canView('tenants', 'view') },
    { key: 'users', label: 'Gerenciamento de Usuários', icon: <Users size={17} />, check: canView('users', 'view') },
    { key: 'roles', label: 'Hierarquias', icon: <ShieldCheck size={17} />, check: (userData?.role === 'admin' || userData?.role === 'superadmin') },
    { key: 'ranks', label: 'Patentes', icon: <Medal size={17} />, check: canView('ranks', 'view') },
    { key: 'classes', label: 'Turmas', icon: <BookOpen size={17} />, check: canView('classes', 'view') },
    { key: 'companion', label: 'Tutorial', icon: <MessageCircle size={17} />, check: isSuperAdmin },
  ];
  const canAccessGeneral = generalTabOptions.some(t => t.check);
  // Se o usuário tem acesso ao Gerenciamento de Usuários, ele é a primeira
  // guia mostrada ao abrir o menu Geral; senão, a primeira permitida.
  const canAccessUsers = generalTabOptions.find(t => t.key === 'users')?.check || false;
  const firstGeneralTab = (canAccessUsers ? 'users' : generalTabOptions.find(t => t.check)?.key || 'users') as any;
  // Primeira área do painel que o usuário consegue abrir (evita página em branco)
  const firstAccessibleTab = canAccessGeneral
    ? 'general'
    : canView('quests_admin', 'view') ? 'quests'
    : canView('items', 'view') ? 'store'
    : canView('economy', 'view') ? 'economy'
    : canView('approvals', 'view') ? 'approvals'
    : canView('entities', 'view') ? 'entities'
    : 'general';
  const [activeTab, setActiveTab] = useState('general');
  const [generalTab, setGeneralTab] = useState<'users' | 'classes' | 'config' | 'ranks' | 'roles' | 'tenants' | 'companion'>('users');

  // Ao abrir o painel, garante que a sub-aba do "Geral" é uma que o usuário
  // tem permissão de ver (evita cair no Gerenciamento de Usuários sem permissão).
  useEffect(() => {
    if (activeTab === 'general') {
      if (!canAccessGeneral) {
        // Sem acesso ao Geral: abre a primeira área lateral permitida
        if (firstAccessibleTab !== 'general') setActiveTab(firstAccessibleTab);
        return;
      }
      const current = generalTabOptions.find(t => t.key === generalTab);
      if (!current || !current.check) {
        setGeneralTab(firstGeneralTab);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, generalTab, canAccessGeneral, firstAccessibleTab]);
  const [students, setStudents] = useState<UserData[]>([]);
  const [allUserItems, setAllUserItems] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const [evaluations, setEvaluations] = useState<EvaluationType[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<ClassDef[]>([]);
  const [quests, setQuests] = useState<QuestDef[]>([]);

  // Modal de Escolas (Multi-tenant) States
  const [tenantModalOpen, setTenantModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [tenantForm, setTenantForm] = useState({ name: '', slug: '', max_students: 500, status: 'active' as 'active' | 'inactive' | 'suspended', allowed_email_domain: '' });

  // Modal de Lançar Nota States
  const [selectedStudent, setSelectedStudent] = useState<UserData | null>(null);
  const [selectedStudentItems, setSelectedStudentItems] = useState<any[]>([]);
  const [modalMode, setModalMode] = useState('add');
  const [xpMode, setXpMode] = useState<'grade' | 'free'>('grade');
  const [grade, setGrade] = useState('');
  const [gradeType, setGradeType] = useState('');
  const [freeXpAmount, setFreeXpAmount] = useState('');
  const [freeXpReason, setFreeXpReason] = useState('');
  const [xpHistory, setXpHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [removeAmount, setRemoveAmount] = useState('');
  const [removeReason, setRemoveReason] = useState('');

  // Modal de Editar Aluno States
  const [editingStudent, setEditingStudent] = useState<UserData | null>(null);
  const [viewingProfileUser, setViewingProfileUser] = useState<UserData | null>(null);
  const [editName, setEditName] = useState('');
  const [editClass, setEditClass] = useState('');
  const [editRole, setEditRole] = useState('student');
  const [editCustomRoleId, setEditCustomRoleId] = useState('');
  const [originalCustomRoleIds, setOriginalCustomRoleIds] = useState<string[]>([]);
  const [schoolRoles, setSchoolRoles] = useState<RoleDef[]>([]);
  const [editCharacterName, setEditCharacterName] = useState('');
  const [editUserTenantIds, setEditUserTenantIds] = useState<string[]>([]);
  const [originalUserTenantIds, setOriginalUserTenantIds] = useState<string[]>([]);
  const [editUserTenantAdd, setEditUserTenantAdd] = useState('');
  const [editUserPrimaryTenantId, setEditUserPrimaryTenantId] = useState<string>('');

  // Contas Locais (login híbrido)
  const [showLocalAccountModal, setShowLocalAccountModal] = useState(false);
  const [localAccountForm, setLocalAccountForm] = useState({ username: '', email: '', phone: '', className: '' });
  const [localAccountPassword, setLocalAccountPassword] = useState('');
  const [localAccountCreated, setLocalAccountCreated] = useState<{ username: string; password: string; auth_email: string } | null>(null);
  const [localAccountError, setLocalAccountError] = useState('');
  const [localAccountLoading, setLocalAccountLoading] = useState(false);

  const openLocalAccountModal = () => {
    setLocalAccountForm({ username: '', email: '', phone: '', className: '' });
    setLocalAccountPassword(generatePassword());
    setLocalAccountCreated(null);
    setLocalAccountError('');
    setShowLocalAccountModal(true);
  };

  const handleCreateLocalAccount = async () => {
    if (!tenantId) {
      setLocalAccountError('Selecione uma escola antes de criar a conta.');
      return;
    }
    if (!localAccountForm.username.trim()) {
      setLocalAccountError('Informe um nome de usuário.');
      return;
    }
    if (!localAccountPassword.trim()) {
      setLocalAccountError('Gere uma senha antes de criar a conta.');
      return;
    }
    setLocalAccountError('');
    setLocalAccountLoading(true);
    try {
      const result = await createLocalAccount({
        tenantId,
        username: localAccountForm.username,
        email: localAccountForm.email,
        phone: localAccountForm.phone,
        className: localAccountForm.className || undefined,
        password: localAccountPassword,
      });
      setLocalAccountCreated({ username: result.username, password: result.password, auth_email: result.auth_email });
    } catch (e: any) {
      setLocalAccountError(e?.message || 'Erro ao criar a conta local.');
    } finally {
      setLocalAccountLoading(false);
    }
  };

  // Gerenciamento de Contas Locais (listar + redefinir senha)
  const [showLocalAccountsList, setShowLocalAccountsList] = useState(false);
  const [localAccounts, setLocalAccounts] = useState<LocalAccountRow[]>([]);
  const [localAccountsLoading, setLocalAccountsLoading] = useState(false);
  const [localAccountsError, setLocalAccountsError] = useState('');
  const [resetResult, setResetResult] = useState<{ username: string; password: string } | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const openLocalAccountsList = async () => {
    setShowLocalAccountsList(true);
    setResetResult(null);
    setLocalAccountsError('');
    setLocalAccountsLoading(true);
    try {
      const rows = await listLocalAccounts(tenantId);
      setLocalAccounts(rows);
    } catch (e: any) {
      setLocalAccountsError(e?.message || 'Erro ao carregar contas locais.');
    } finally {
      setLocalAccountsLoading(false);
    }
  };

  const handleResetLocalPassword = async (account: LocalAccountRow) => {
    const newPass = generatePassword();
    setResettingId(account.id);
    setLocalAccountsError('');
    try {
      const result = await resetLocalPassword(account.id, newPass);
      setResetResult({ username: result.username, password: result.password });
      setLocalAccounts(prev => prev.map(a => a.id === account.id ? { ...a, must_change_password: true } : a));
    } catch (e: any) {
      setLocalAccountsError(e?.message || 'Erro ao redefinir a senha.');
    } finally {
      setResettingId(null);
    }
  };

  const handleDeleteLocalAccount = async (account: LocalAccountRow) => {
    const confirmed = await showConfirm(`Excluir a conta local "${account.username}"? O usuário de autenticação e os dados serão removidos.`);
    if (!confirmed) return;
    setResettingId(account.id);
    setLocalAccountsError('');
    try {
      await deleteLocalAccount(account.id);
      setLocalAccounts(prev => prev.filter(a => a.id !== account.id));
      setResetResult(null);
      showToast(`Conta local "${account.username}" excluída.`, 'success');
    } catch (e: any) {
      setLocalAccountsError(e?.message || 'Erro ao excluir a conta local.');
    } finally {
      setResettingId(null);
    }
  };

  // Novos States - Filtros e Seleção em Massa
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedClassTab, setSelectedClassTab] = useState('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSortBy, setStudentSortBy] = useState<'xp' | 'name' | 'class'>('xp');
  const [studentSortOrder, setStudentSortOrder] = useState<'desc' | 'asc'>('desc');
  
  // XP em Massa
  const [isBulkXpModalOpen, setIsBulkXpModalOpen] = useState(false);
  const [bulkXpAction, setBulkXpAction] = useState<'add' | 'remove'>('add');
  const [bulkXpAmount, setBulkXpAmount] = useState('');
  const [bulkXpReason, setBulkXpReason] = useState('');
  
  // Apagar Aluno
  const [deletingStudent, setDeletingStudent] = useState<UserData | null>(null);

  // Config States
  // Config States
  const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
  const [editingEvalId, setEditingEvalId] = useState<string | null>(null);
  const [newEvalName, setNewEvalName] = useState('');
  const [newEvalWeight, setNewEvalWeight] = useState('');
  
  // Turmas States
  const [newClassName, setNewClassName] = useState('');
  const [newClassCode, setNewClassCode] = useState('');
  const [newClassColor, setNewClassColor] = useState('#3b82f6');
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editClassName, setEditClassName] = useState('');
  const [editClassCode, setEditClassCode] = useState('');
  const [editClassColor, setEditClassColor] = useState('#3b82f6');
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);

  // Missões States
  const [isCreatingQuest, setIsCreatingQuest] = useState(false);
  const [isQuestHistoryModalOpen, setIsQuestHistoryModalOpen] = useState(false);
  const [selectedQuestForHistory, setSelectedQuestForHistory] = useState<QuestDef | null>(null);
  const [questHistoryAttempts, setQuestHistoryAttempts] = useState<any[]>([]);
  const [editingQuestId, setEditingQuestId] = useState<string | null>(null);
  const [questTitle, setQuestTitle] = useState('');
  const [questDesc, setQuestDesc] = useState('');
  const [questCover, setQuestCover] = useState('');
  const [questMode, setQuestMode] = useState<'classic' | 'live'>('classic');
  const [questXp, setQuestXp] = useState('1000');
  const [questRetries, setQuestRetries] = useState(false);
  const [questShuffleQuestions, setQuestShuffleQuestions] = useState(false);
  const [questShuffleAnswers, setQuestShuffleAnswers] = useState(false);
  const [questRandomSelection, setQuestRandomSelection] = useState(false);
  const [questRandomCount, setQuestRandomCount] = useState(10);
  const [questPenalty, setQuestPenalty] = useState('0');
  const [questQuestions, setQuestQuestions] = useState<QuestQuestion[]>([
    { title: '', imageUrl: '', timeLimit: 30, options: [{text: ''}, {text: ''}, {text: ''}, {text: ''}], correctIndex: 0 }
  ]);
  const [showQuestionBank, setShowQuestionBank] = useState(false);
  const [showQuestQuestionsEditor, setShowQuestQuestionsEditor] = useState(false);
  const [showQuestConfig, setShowQuestConfig] = useState(false);
  const [bankGalleryResult, setBankGalleryResult] = useState<{ type: 'question' | 'option'; optIndex?: number; url: string } | null>(null);

  // Sidebar Mobile State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isUserFiltersOpen, setIsUserFiltersOpen] = useState(true);
  const [showAvatars3D, setShowAvatars3D] = useState(() => {
    const saved = localStorage.getItem('showAvatars3D');
    return saved !== null ? saved === 'true' : true;
  });
  const [questMonsterName, setQuestMonsterName] = useState('');
  const [questMonsterConfig, setQuestMonsterConfig] = useState<AvatarConfig | null>(null);
  const [questMonsterModelUrl, setQuestMonsterModelUrl] = useState('');
  const [questMonsterQuotes, setQuestMonsterQuotes] = useState<{hp100_80?: string, hp79_50?: string, hp49_25?: string, hp24_0?: string}>({});
  const [questMonsterDefeatQuotes, setQuestMonsterDefeatQuotes] = useState('');
  const [questMonsterDrops, setQuestMonsterDrops] = useState<{itemId: string, dropChance: number}[]>([]);
  const [questBattleBgUrl, setQuestBattleBgUrl] = useState('');
  const [questBattleBgPosX, setQuestBattleBgPosX] = useState(50);
  const [questBattleBgPosY, setQuestBattleBgPosY] = useState(50);
  const [questBattleBgScale, setQuestBattleBgScale] = useState(1.2);
  const [questBattleBgMoveEnabled, setQuestBattleBgMoveEnabled] = useState(true);
  const [questBattleBgMoveDirection, setQuestBattleBgMoveDirection] = useState<'horizontal' | 'vertical' | 'diagonal'>('diagonal');
  const [questBattleBgMoveSpeed, setQuestBattleBgMoveSpeed] = useState(10);
  const [questBattleBgMoveDuration, setQuestBattleBgMoveDuration] = useState(30);
  const [questPodiumBgUrl, setQuestPodiumBgUrl] = useState('');
  const [showArenaBgEditor, setShowArenaBgEditor] = useState(false);
  const [questChestConfig, setQuestChestConfig] = useState<{maxCoins?: number, itemIds?: string[], itemQuantities?: number[], slotChances?: number[], dropChance?: number, chestModelId?: string}>({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1], slotChances: [50, 25, 10, 5], dropChance: 100 });
  const [questCombatCoinMin, setQuestCombatCoinMin] = useState(2);
  const [questCombatCoinMax, setQuestCombatCoinMax] = useState(6);
  const [questCombatCoinMinValue, setQuestCombatCoinMinValue] = useState(1);
  const [questCombatCoinMaxValue, setQuestCombatCoinMaxValue] = useState(3);
  const [questLiveChest1st, setQuestLiveChest1st] = useState<{maxCoins?: number, itemIds?: string[], itemQuantities?: number[]}>({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
  const [questLiveChest2nd, setQuestLiveChest2nd] = useState<{maxCoins?: number, itemIds?: string[], itemQuantities?: number[]}>({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
  const [questLiveChest3rd, setQuestLiveChest3rd] = useState<{maxCoins?: number, itemIds?: string[], itemQuantities?: number[]}>({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
  const [available3DModels, setAvailable3DModels] = useState<any[]>([]);
  const [availableChests, setAvailableChests] = useState<any[]>([]);
  const [availableMonsters, setAvailableMonsters] = useState<any[]>([]);
  const [availableStoreItems, setAvailableStoreItems] = useState<any[]>([]);
  const [isCustomizingMonster, setIsCustomizingMonster] = useState(false);
  const [questCreatedBy, setQuestCreatedBy] = useState<string | null>(null);
  const [questCreatorRole, setQuestCreatorRole] = useState<string | null>(null);
  const [questTargetClasses, setQuestTargetClasses] = useState<string[]>([]);
  
  const [galleryTarget, setGalleryTarget] = useState<string | null>(null);
  const [pixabayKey, setPixabayKey] = useState('');

  const fetchEvaluations = async () => {
    const { data: snap } = await supabase.from('system_collections').select('*').eq('collection_name', 'settings').eq('doc_id', 'evaluations').single();
    if (snap && snap.data) {
      const fetched = (snap.data as any).types || [];
      setEvaluations(fetched);
      if (fetched.length > 0) setGradeType(fetched[0].id);
    } else {
      setEvaluations(DEFAULT_EVALUATIONS);
      setGradeType(DEFAULT_EVALUATIONS[0].id);
      await supabase.from('system_collections').insert({ collection_name: 'settings', doc_id: 'evaluations', data: { types: DEFAULT_EVALUATIONS } });
    }

    const { data: apiSnap } = await supabase.from('system_collections').select('*').eq('collection_name', 'settings').eq('doc_id', 'api').single();
    if (apiSnap && apiSnap.data) {
      setPixabayKey((apiSnap.data as any).pixabayKey || '');
    }
  };

  const fetchClasses = async () => {
    let classesQuery = supabase.from('classes').select('*');
    if (tenantId) {
      classesQuery = classesQuery.eq('tenant_id', tenantId);
    } else {
      // Sem tenant definido: não listar turmas de todas as escolas
      classesQuery = classesQuery.eq('tenant_id', '00000000-0000-0000-0000-000000000001');
    }
    const { data: snap } = await classesQuery;
    const loaded: ClassDef[] = (snap as ClassDef[]) || [];
    loaded.sort((a, b) => a.name.localeCompare(b.name));
    setSchoolClasses(loaded);
  };

  const fetchQuests = async () => {
    let questsQuery = supabase.from('quests').select('*');
    if (tenantId) {
      questsQuery = questsQuery.eq('tenant_id', tenantId);
    } else {
      // Sem tenant definido: não listar missões de todas as escolas
      questsQuery = questsQuery.eq('tenant_id', '00000000-0000-0000-0000-000000000001');
    }
    const { data: snap } = await questsQuery;
    const loaded: QuestDef[] = snap ? snap.map((d: any) => ({
      ...d,
      id: d.id,
      coverImageUrl: d.cover_image_url || d.coverImageUrl,
      baseXp: d.base_xp || d.baseXp,
      allowRetries: d.allow_retries !== undefined ? d.allow_retries : d.allowRetries,
      targetClasses: d.target_classes || d.targetClasses || [],
      chestConfig: d.chestconfig || d.chestConfig || null,
      combatCoinDrop: d.combatcoindrop || d.combatCoinDrop || null,
      createdAt: { seconds: new Date(d.created_at || d.id).getTime() / 1000 }
    })) as QuestDef[] : [];
    setQuests(loaded);
  };

  // Funções para o modal de escolas
  const openCreateTenantModal = () => {
    setEditingTenant(null);
    setTenantForm({ name: '', slug: '', max_students: 100, status: 'active', allowed_email_domain: '' });
    setTenantModalOpen(true);
  };

  // Se não houver nenhuma escola cadastrada, abrir automaticamente o modal de criação
  useEffect(() => {
    if (isSuperAdmin && noTenants && !tenantModalOpen) {
      openCreateTenantModal();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, noTenants, tenantModalOpen]);

  const openEditTenantModal = (t: Tenant) => {
    setEditingTenant(t);
    setTenantForm({ name: t.name, slug: t.slug, max_students: t.max_students || 100, status: t.status, allowed_email_domain: (t as any).allowed_email_domain || '' });
    setTenantModalOpen(true);
  };

  const handleSaveTenant = async () => {
    if (!tenantForm.name.trim()) {
      await showAlert('Erro', 'O nome da escola é obrigatório.');
      return;
    }
    if (!tenantForm.slug.trim()) {
      await showAlert('Erro', 'O slug da escola é obrigatório.');
      return;
    }

    if (editingTenant) {
      // Editar escola existente
      const success = await updateTenant(editingTenant.id, {
        name: tenantForm.name,
        slug: tenantForm.slug,
        max_students: tenantForm.max_students,
        status: tenantForm.status,
        allowed_email_domain: tenantForm.allowed_email_domain?.trim() || null
      });
      if (success) {
        await showAlert('Sucesso', `Escola "${tenantForm.name}" atualizada com sucesso!`);
        setTenantModalOpen(false);
      }
    } else {
      // Criar nova escola
      const newTenant = await createTenant({
        name: tenantForm.name,
        slug: tenantForm.slug,
        max_students: tenantForm.max_students,
        status: tenantForm.status,
        allowed_email_domain: tenantForm.allowed_email_domain?.trim() || null
      });
      if (newTenant) {
        await showAlert('Sucesso', `Escola "${tenantForm.name}" criada com sucesso!`);
        setTenantModalOpen(false);
      }
    }
  };

  const fetch3DModels = async () => {
    let query = supabase.from('3d_models').select('*');
    if (tenantId) {
      query = query.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
    }
    const { data: snap } = await query;
    const loaded: any[] = snap ? snap.map((d: any) => ({
      ...d,
      id: d.id,
      imageUrl: d.image_url || d.imageUrl,
      avatarPart: d.avatar_part || d.avatarPart
    })) : [];
    setAvailable3DModels(loaded);
    setAvailableChests(loaded.filter((m: any) => (m.category || 'skin') === 'chest'));
  };

  const fetchMonsters = async () => {
    let query = supabase.from('preset_skins').select('*').eq('type', 'monster');
    if (tenantId) {
      query = query.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
    }
    const { data: snap } = await query;
    const loaded: any[] = snap ? snap.map((d: any) => ({
      id: d.id,
      name: d.name || 'Sem nome',
      url: d.url || '',
      type: d.type || 'monster',
      config: d.config || null,
      baseModelId: d.baseModelId || null,
    })) : [];
    setAvailableMonsters(loaded);
  };

  const fetchStoreItems = async () => {
    let storeQuery = supabase.from('store_items').select('*').eq('active', true);
    if (tenantId) {
      // Buscar itens globais OU itens da escola atual
      storeQuery = storeQuery.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
    }
    const { data: snap } = await storeQuery;
    const loaded: any[] = snap ? snap.map((d: any) => ({
      id: d.id,
      ...(d.data || {}),
      title: (d.data as any)?.title || d.name || 'Sem nome',
      type: (d.data as any)?.type || d.type || 'equippable',
      imageUrl: (d.data as any)?.itemImageUrl || (d.data as any)?.imageUrl || d.image_url || d.imageUrl || '',
      avatarPart: (d.data as any)?.avatarPart || d.avatar_part || d.avatarPart || '',
    })) : [];
    setAvailableStoreItems(loaded);
  };

  const fetchStudents = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    
    // Buscar usuários - somente alunos do tenant atual (superadmin vê a escola selecionada).
    // Não misturar usuários órfãos/sem tenant de outras escolas.
    let usersQuery = supabase.from('users').select('*');
    if (tenantId) {
      // Incluir também quem existe só em tenant_users (users.tenant_id pode estar nulo)
      const { data: memberRows } = await supabase.from('tenant_users').select('user_id').eq('tenant_id', tenantId);
      const memberIds = (memberRows || []).map(r => r.user_id).filter(Boolean);
      usersQuery = memberIds.length > 0
        ? usersQuery.or(`tenant_id.eq.${tenantId},role.eq.pending_student,role.eq.pending_teacher,id.in.(${memberIds.join(',')})`)
        : usersQuery.or(`tenant_id.eq.${tenantId},role.eq.pending_student,role.eq.pending_teacher`);
    } else {
      // Sem tenant definido: não listar alunos de todas as escolas (evita o "limbo")
      usersQuery = usersQuery.eq('tenant_id', '00000000-0000-0000-0000-000000000001').eq('role', 'pending_student');
    }
    const { data: querySnapshot } = await usersQuery;
    
    const loadedStudents: UserData[] = querySnapshot ? querySnapshot.map(d => mapUserToClient(d)) : [];
    // Sort by name
    loadedStudents.sort((a, b) => a.name.localeCompare(b.name));
    
    // Buscar todos os itens equipados com filtro de tenant
    let itemsQuery = supabase.from('user_items').select('*').eq('equipped', true);
    if (tenantId) {
      itemsQuery = itemsQuery.eq('tenant_id', tenantId);
    } else {
      // Sem tenant: não buscar itens de todas as escolas
      itemsQuery = itemsQuery.eq('tenant_id', '00000000-0000-0000-0000-000000000001');
    }
    const { data: itemsSnap } = await itemsQuery;
    const itemsMap: Record<string, any[]> = {};
    if (itemsSnap) itemsSnap.forEach(d => {
      const data = d.data || {};
      data.itemId = d.item_id;
      data.studentId = d.student_id;
      if (!itemsMap[data.studentId]) itemsMap[data.studentId] = [];
      itemsMap[data.studentId].push({
        itemId: data.itemId,
        imageUrl: data.itemImageUrl,
        avatarPart: data.avatarPart,
        itemTitle: data.itemTitle,
        itemCategory: data.itemCategory,
        baseAttributeType: data.baseAttributeType,
        baseAttributeValue: data.baseAttributeValue,
        adds: data.adds,
        gameModelUrl: data.gameModelUrl,
        modelTextureUrl: data.modelTextureUrl,
        minecraftHeadValue: data.minecraftHeadValue,
        modelTransforms: data.modelTransforms,
        backColor: data.backColor || ''
      });
    });
    setAllUserItems(itemsMap);
    
    setStudents(loadedStudents);
    setLoading(false);
  };

  const loadStudentHistoryLocally = async (studentUid: string) => {
    setLoadingHistory(true);
    const { data: snap } = await supabase.from('xp_logs').select('*').eq('student_id', studentUid);
    let logs = (snap || [])
      .filter(d => {
        const eName = d.eval_name || d.reason || '';
        // Histórico de XP no painel master: exclusivamente registros de atribuição/dedução manual do professor
        return !eName.startsWith('Missão:') && !eName.startsWith('Subiu de Patente:') && !eName.startsWith('Compra na Loja:');
      })
      .map(d => {
        let eName = d.eval_name || d.reason || 'Avaliação';
        let just = d.justification || '';
        let img = '';
        if (!d.eval_name && d.reason && d.reason.includes(' | ')) {
           const parts = d.reason.split(' | ');
           eName = parts[0].trim();
           img = parts[1] ? parts[1].trim() : '';
           just = parts[2] ? parts[2].trim() : '';
        } else if (d.eval_name && d.eval_name.includes(' | ')) {
           const parts = d.eval_name.split(' | ');
           eName = parts[0].trim();
           img = parts[1] ? parts[1].trim() : '';
        }
        
        return {
          logId: d.id, 
          evalName: eName,
          imageUrl: img,
          xpGained: d.xp_gained !== undefined ? d.xp_gained : (d.amount || 0),
          justification: just,
          ...d 
        };
      });
    logs.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    setXpHistory(logs);

    // Fetch equipped items for the selected student
    const { data: itemsSnap } = await supabase.from('user_items').select('*').eq('student_id', studentUid).eq('equipped', true);
    const eqItems = (itemsSnap || []).map(d => {
      const data = d.data || {};
      return {
        itemId: data.itemId,
        imageUrl: data.itemImageUrl,
        avatarPart: data.avatarPart,
        itemTitle: data.itemTitle,
        itemCategory: data.itemCategory,
        baseAttributeType: data.baseAttributeType,
        baseAttributeValue: data.baseAttributeValue,
        adds: data.adds,
        gameModelUrl: data.gameModelUrl,
        modelTextureUrl: data.modelTextureUrl,
        minecraftHeadValue: data.minecraftHeadValue,
        modelTransforms: data.modelTransforms,
        backColor: data.backColor || ''
      };
    });
    setSelectedStudentItems(eqItems);

    setLoadingHistory(false);
  };

  useEffect(() => {
    fetchEvaluations();
    fetchClasses();
    fetchQuests();
    fetch3DModels();
    fetchMonsters();
    fetchStudents();
    fetchStoreItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    if (activeTab === 'general' && generalTab === 'users') {
      fetchStudents();
    }
  }, [activeTab, generalTab]);

  useEffect(() => {
    if (selectedStudent) {
      loadStudentHistoryLocally(selectedStudent.uid);
    }
  }, [selectedStudent?.uid]);

  // Remover XP
  const handleRemoveXp = async () => {
    if (!selectedStudent || !removeAmount || !removeReason) return;
    const xpToRemove = parseInt(removeAmount);
    if (isNaN(xpToRemove) || xpToRemove <= 0) return;
    const newXp = Math.max(0, (selectedStudent.xp || 0) - xpToRemove);
    const newCoins = Math.max(0, (selectedStudent.coins || 0) - xpToRemove);
    await supabase.from('users').update({ xp: newXp, coins: newCoins }).eq('id', selectedStudent.uid);
    await supabase.from('xp_logs').insert({
      student_id: selectedStudent.uid,
      amount: -xpToRemove,
      reason: `Correção / Remoção de XP |  | ${removeReason}`
    });
    setSelectedStudent({ ...selectedStudent, xp: newXp, coins: newCoins });
    setRemoveAmount('');
    setRemoveReason('');
    fetchStudents();
    loadStudentHistoryLocally(selectedStudent.uid);
  };

  // Dar XP
  const handleGiveGrade = async () => {
    if (!selectedStudent || !grade) return;
    const numGrade = parseFloat(grade.replace(',', '.'));
    if (isNaN(numGrade) || numGrade < 0 || numGrade > 10) return;
    const selectedEval = evaluations.find(e => e.id === gradeType) || evaluations[0];
    const xpGained = numGrade * selectedEval.weight;
    const newXp = (selectedStudent.xp || 0) + xpGained;
    const newCoins = (selectedStudent.coins || 0) + xpGained;
    await supabase.from('users').update({ xp: newXp, coins: newCoins }).eq('id', selectedStudent.uid);
    await supabase.from('xp_logs').insert({
      student_id: selectedStudent.uid,
      amount: xpGained,
      reason: `${selectedEval.name} |  | Recebeu nota ${numGrade}`
    });
    setSelectedStudent({ ...selectedStudent, xp: newXp, coins: newCoins });
    setGrade('');
    fetchStudents(false); 
    loadStudentHistoryLocally(selectedStudent.uid);
  };

  // Dar XP por valor livre
  const handleGiveFreeXp = async () => {
    if (!selectedStudent || !freeXpAmount) return;
    const xpGained = parseFloat(freeXpAmount.replace(',', '.'));
    if (isNaN(xpGained) || xpGained <= 0) return;
    const newXp = (selectedStudent.xp || 0) + xpGained;
    const newCoins = (selectedStudent.coins || 0) + xpGained;
    await supabase.from('users').update({ xp: newXp, coins: newCoins }).eq('id', selectedStudent.uid);
    await supabase.from('xp_logs').insert({
      student_id: selectedStudent.uid,
      amount: xpGained,
      reason: `Valor Livre |  | ${freeXpReason || 'Atribuição manual de XP'}`
    });
    setSelectedStudent({ ...selectedStudent, xp: newXp, coins: newCoins });
    setFreeXpAmount('');
    setFreeXpReason('');
    fetchStudents(false);
    loadStudentHistoryLocally(selectedStudent.uid);
  };

  const handleDeleteHistoryLog = async (logId: string, xpGained: number) => {
    if (!selectedStudent) return;
    const confirmed = await showConfirm("Atenção! Você está apagando este registro do histórico. O XP do aluno será recalculado. Deseja continuar?");
    if (confirmed) {
      await supabase.from('xp_logs').delete().eq('id', logId);
      const newXp = Math.max(0, (selectedStudent.xp || 0) - xpGained);
      const newCoins = Math.max(0, (selectedStudent.coins || 0) - xpGained);
      await supabase.from('users').update({ xp: newXp, coins: newCoins }).eq('id', selectedStudent.uid);
      setSelectedStudent({ ...selectedStudent, xp: newXp, coins: newCoins });
      fetchStudents(false);
      loadStudentHistoryLocally(selectedStudent.uid);
    }
  };

  // Avaliações
  const handleAddEvaluation = async () => {
    if (!newEvalName || !newEvalWeight) return;
    const newEval = { id: editingEvalId || Date.now().toString(), name: newEvalName, weight: Number(newEvalWeight) };
    
    let updated;
    if (editingEvalId) {
      updated = evaluations.map(e => e.id === editingEvalId ? newEval : e);
    } else {
      updated = [...evaluations, newEval];
    }
    
    setEvaluations(updated);
    setEditingEvalId(null);
    setNewEvalName('');
    setNewEvalWeight('');
    await supabase.from('system_collections').update({ data: { types: updated } }).eq('collection_name', 'settings').eq('doc_id', 'evaluations');
  };

  const handleEditEvaluation = (ev: EvaluationType) => {
    setEditingEvalId(ev.id);
    setNewEvalName(ev.name);
    setNewEvalWeight(ev.weight.toString());
  };

  const handleRemoveEvaluation = async (id: string) => {
    if (evaluations.length <= 1) {
      await showAlert("Você precisa ter pelo menos um tipo de avaliação.");
      return;
    }
    const updated = evaluations.filter(e => e.id !== id);
    setEvaluations(updated);
    await supabase.from('system_collections').update({ data: { types: updated } }).eq('collection_name', 'settings').eq('doc_id', 'evaluations');
  };

  // Turmas
  const handleAddClass = async () => {
    if (!newClassName) return;
    const classId = Date.now().toString();
    const newClass = { id: classId, name: newClassName, code: newClassCode.trim() || null, color: newClassColor, tenant_id: tenantId || null };
    await supabase.from('classes').insert(newClass);
    setNewClassName('');
    setNewClassCode('');
    fetchClasses();
  };

  const handleEditClassSubmit = async () => {
    if (!editingClassId || !editClassName) return;
    await supabase.from('classes').update({ name: editClassName, code: editClassCode.trim() || null, color: editClassColor }).eq('id', editingClassId);
    setEditingClassId(null);
    setIsClassModalOpen(false);
    fetchClasses();
  };

  const handleRemoveClass = async (id: string) => {
    const confirmed = await showConfirm("Deseja realmente apagar esta turma?");
    if (confirmed) {
      await supabase.from('classes').delete().eq('id', id);
      fetchClasses();
    }
  };

  // Editar Aluno / Usuário
  const openEditModal = (student: UserData) => {
    setEditingStudent(student);
    setEditName(student.name || '');
    setEditClass(student.classId || '');
    setEditRole(student.role || 'student');
    setEditCharacterName(student.characterName || '');
    setEditUserPrimaryTenantId(student.tenantId || '');
    setEditCustomRoleId('');
    setOriginalCustomRoleIds([]);
    // Carregar escolas de acesso atuais do usuário (para superadmin atribuir tenants)
    loadUserAccessTenants(student.uid);
    // Carregar funções de Hierarquia (roles) da escola + atribuição atual do usuário
    loadSchoolRoles(student.uid);
  };

  const loadSchoolRoles = async (uid: string) => {
    try {
      const roles = await fetchRoles(tenantId);
      setSchoolRoles(roles);
      const assigned = await fetchUserRoles(uid, tenantId);
      // Considera apenas funções NÃO padrão como "função de hierarquia" selecionável
      const stdNames = new Set(['Administrador', 'Coordenador', 'Professor', 'Aluno']);
      const customAssigned = roles
        .filter(r => r.id && assigned.includes(r.id) && !stdNames.has(r.name))
        .map(r => r.id);
      setOriginalCustomRoleIds(customAssigned);
      setEditCustomRoleId(customAssigned[0] || '');
    } catch (e) {
      console.error('Erro ao carregar funções de hierarquia:', e);
    }
  };

  const loadUserAccessTenants = async (uid: string) => {
    try {
      const { data: rows } = await supabase.from('tenant_users').select('tenant_id').eq('user_id', uid);
      const ids = (rows || []).map((r: any) => r.tenant_id).filter(Boolean);
      setOriginalUserTenantIds(ids);
      setEditUserTenantIds(ids);
      setEditUserTenantAdd('');
      // Se o usuário já tem tenant_id em users, usar como padrão; senão, a primeira escola de acesso
      setEditUserPrimaryTenantId(prev => prev || (ids[0] || ''));
    } catch (e) {
      console.error('Erro ao carregar escolas de acesso:', e);
      setOriginalUserTenantIds([]);
      setEditUserTenantIds([]);
      setEditUserTenantAdd('');
    }
  };

  const handleSaveStudent = async () => {
    if (!editingStudent) return;
    
    const trimmedCharName = editCharacterName.trim();
    if (trimmedCharName && trimmedCharName !== (editingStudent.characterName || '')) {
      const validation = validateCharacterName(trimmedCharName);
      if (!validation.valid) {
        showToast(validation.error!, 'error');
        return;
      }
      
      const { data: existing } = await supabase.from('users')
        .select('id, character_name')
        .not('id', 'eq', editingStudent.uid)
        .not('character_name', 'is', null);
      
      if (existing) {
        const normalizedNew = normalizeForComparison(trimmedCharName);
        const conflict = existing.find(u => {
          const existingNorm = normalizeForComparison(u.character_name || '');
          return existingNorm === normalizedNew || 
                 existingNorm.includes(normalizedNew) || 
                 normalizedNew.includes(existingNorm);
        });
        
        if (conflict) {
          showToast('Este nome de personagem já está em uso ou é muito similar ao de outro personagem.', 'error');
          return;
        }
      }
    }
    
    const updateData: any = { 
      name: editName, 
      class_id: editClass, 
      role: editRole,
      character_name: trimmedCharName || null
    };
    
    // Promovendo para equipe concede 50k XP
    if (editRole !== 'student' && editingStudent.role === 'student') {
      updateData.xp = 50000;
      updateData.coins = Math.max(50000, editingStudent.coins || 0);
    }
    
    // Sincronizar escolas de acesso (superadmin) ANTES de salvar o usuário,
    // para também gravar users.tenant_id com a primeira escola de acesso.
    const added = editUserTenantIds.filter(id => !originalUserTenantIds.includes(id));
    const removed = originalUserTenantIds.filter(id => !editUserTenantIds.includes(id));

    if (added.length > 0) {
      const tenantRole = editRole === 'admin' ? 'admin' : editRole === 'coordinator' ? 'coordinator' : editRole === 'teacher' ? 'teacher' : 'student';
      for (const tid of added) {
        await supabase.from('tenant_users').upsert({
          tenant_id: tid,
          user_id: editingStudent.uid,
          role: tenantRole
        }, { onConflict: 'tenant_id,user_id' });
      }
    }
    if (removed.length > 0) {
      for (const tid of removed) {
        await supabase.from('tenant_users').delete().eq('tenant_id', tid).eq('user_id', editingStudent.uid);
      }
    }

    // Atualizar users.tenant_id conforme a escola padrão definida:
    // - Se o superadmin marcou uma escola padrão (dentro das de acesso), usa ela.
    // - Se é admin/teacher sendo gerenciado pelo superadmin sem escolas explícitas,
    //   usa a escola atual do superadmin.
    // - Caso contrário, preserva o tenant_id atual (não zera aluno existente).
    if (editUserPrimaryTenantId && editUserTenantIds.includes(editUserPrimaryTenantId)) {
      updateData.tenant_id = editUserPrimaryTenantId;
    } else if (editUserTenantIds.length > 0) {
      updateData.tenant_id = editUserTenantIds[0];
    } else if (editRole !== 'student' && tenantId && isSuperAdmin) {
      updateData.tenant_id = tenantId;
    } else {
      // Preservar tenant_id atual
      delete updateData.tenant_id;
    }
    
    // Sincronizar função de Hierarquia (role customizada via user_roles)
    if (tenantId) {
      let roleSyncOk = true;
      // Remove atribuições anteriores que não estão mais selecionadas
      for (const rid of originalCustomRoleIds) {
        if (rid !== editCustomRoleId) {
          const ok = await removeRoleFromUser(editingStudent.uid, rid, tenantId);
          if (!ok) roleSyncOk = false;
        }
      }
      // Atribui a função selecionada
      if (editCustomRoleId && !originalCustomRoleIds.includes(editCustomRoleId)) {
        const ok = await assignRoleToUser(editingStudent.uid, editCustomRoleId, tenantId);
        if (!ok) roleSyncOk = false;
      }
      if (!roleSyncOk) {
        showToast('Atenção: a função de hierarquia não pôde ser atualizada (verifique permissões/RLS).', 'error');
      }
    }

    const { error: userUpdateError } = await supabase.from('users').update(updateData).eq('id', editingStudent.uid);
    if (userUpdateError) {
      console.error('Erro ao salvar usuário:', userUpdateError);
      showToast('Erro ao salvar o usuário.', 'error');
      return;
    }

    setEditingStudent(null);
    fetchStudents();
    showToast(
      editCustomRoleId
        ? `Usuário salvo com a função de hierarquia "${schoolRoles.find(r => r.id === editCustomRoleId)?.name || ''}".`
        : 'Usuário salvo com sucesso.',
      'success'
    );
  };

  const handleDeleteStudent = async () => {
    if (!deletingStudent) return;
    try {
      await supabase.from('users').delete().eq('id', deletingStudent.uid);
      // NOTA: Em um sistema real em produção via Firebase Auth, não conseguimos deletar a conta Auth pelo cliente.
      // O usuário seria recriado ao logar, então você pode adicionar uma flag `disabled` ou rodar isso numa Cloud Function.
      // Para os fins deste projeto, deletamos o documento.
      setDeletingStudent(null);
      fetchStudents();
    } catch (e) {
      console.error(e);
      await showAlert('Erro ao excluir usuário');
    }
  };

  const handleBulkXp = async () => {
    if (selectedStudentIds.length === 0 || !bulkXpAmount || !bulkXpReason) return;
    const xpChange = parseInt(bulkXpAmount);
    if (isNaN(xpChange) || xpChange <= 0) return;

    for (const uid of selectedStudentIds) {
      const student = students.find(s => s.uid === uid);
      if (!student) continue;

      let newXp, newCoins, gain;
      if (bulkXpAction === 'add') {
        gain = xpChange;
        newXp = (student.xp || 0) + gain;
        newCoins = (student.coins || 0) + gain;
      } else {
        gain = -xpChange;
        newXp = Math.max(0, (student.xp || 0) + gain);
        newCoins = Math.max(0, (student.coins || 0) + gain);
      }

      await supabase.from('users').update({ xp: newXp, coins: newCoins }).eq('id', uid);
      await supabase.from('xp_logs').insert({
        student_id: uid,
        amount: gain,
        reason: `Ação em Massa | | ${bulkXpReason}`
      });
    }

    setIsBulkXpModalOpen(false);
    setBulkXpAmount('');
    setBulkXpReason('');
    setSelectedStudentIds([]);
    fetchStudents();
  };

  const handleSaveQuest = async () => {
    if (!questTitle || !questTitle.trim() || questQuestions.length === 0) {
      await showAlert("Preencha o título da missão e adicione perguntas!");
      return;
    }

    for (let i = 0; i < questQuestions.length; i++) {
      const q = questQuestions[i];
      const hasTextOrImage = q.title.trim() !== '' || (q.imageUrl || '').trim() !== '';
      const filledOptions = q.options.map((opt, idx) => {
        const isFilled = (opt.text || '').trim() !== '' || (opt.imageUrl || '').trim() !== '';
        return { idx, isFilled };
      }).filter(o => o.isFilled);

      if (!hasTextOrImage) {
        await showAlert(`A Pergunta ${i + 1} precisa ter o título preenchido ou uma imagem.`);
        return;
      }
      if (filledOptions.length < 2) {
        await showAlert(`A Pergunta ${i + 1} precisa ter pelo menos 2 alternativas preenchidas.`);
        return;
      }
      if (!filledOptions.some(o => o.idx === q.correctIndex)) {
        await showAlert(`A resposta correta da Pergunta ${i + 1} aponta para uma alternativa vazia.`);
        return;
      }
    }

    // Perguntas digitadas manualmente (sem vínculo com o banco) vão para o banco global
    // de perguntas. Importações NÃO duplicam. (Fire-and-forget, não bloqueia o save)
    questQuestions.forEach((q, index) => { saveQuestionToBank(q, index); });

    if (questChestConfig?.itemIds) {
      const ids = questChestConfig.itemIds.filter(id => id.trim() !== '');
      const uniqueIds = new Set(ids);
      if (ids.length !== uniqueIds.size) {
        await showAlert("O baú não pode conter itens repetidos! Cada slot deve ter um item diferente.");
        return;
      }
    }

    const questId = editingQuestId || Date.now().toString();
    const newQuest: QuestDef = {
      id: questId,
      title: questTitle,
      description: questDesc,
      coverImageUrl: questCover,
      baseXp: parseInt(questXp) || 0,
      allowRetries: questRetries,
      xpPenaltyPerRetry: questRetries ? (parseInt(questPenalty) || 0) : 0,
      questions: questQuestions,
      monsterName: questMonsterName,
      monsterAvatarConfig: questMonsterConfig || undefined,
      monsterModelUrl: questMonsterModelUrl,
      monsterQuotes: questMonsterQuotes,
      monsterDefeatQuotes: questMonsterDefeatQuotes,
      monsterDrops: questMonsterDrops,
      battleBgUrl: questBattleBgUrl,
      battleBgPosX: questBattleBgPosX,
      battleBgPosY: questBattleBgPosY,
      battleBgScale: questBattleBgScale,
      battleBgMoveEnabled: questBattleBgMoveEnabled,
      battleBgMoveDirection: questBattleBgMoveDirection,
      battleBgMoveSpeed: questBattleBgMoveSpeed,
      battleBgMoveDuration: questBattleBgMoveDuration,
      podiumBgUrl: questPodiumBgUrl || undefined,
      combatCoinDrop: {
        minCoins: questCombatCoinMin,
        maxCoins: questCombatCoinMax,
        minValue: questCombatCoinMinValue,
        maxValue: questCombatCoinMaxValue,
      },
      chestConfig: questChestConfig,
      mode: questMode,
      liveChest1stPlace: questLiveChest1st,
      liveChest2ndPlace: questLiveChest2nd,
      liveChest3rdPlace: questLiveChest3rd,
      active: true,
      createdBy: questCreatedBy || userData?.uid,
      tenant_id: tenantId || null,
      creatorRole: questCreatorRole || userData?.role,
      targetClasses: questTargetClasses,
      shuffleQuestions: questShuffleQuestions,
      shuffleAnswers: questShuffleAnswers,
      randomQuestionSelection: questRandomSelection,
      randomQuestionCount: questRandomSelection ? questRandomCount : undefined
    };

    // Sanitize object to remove undefined values for Firestore
    const sanitizedQuest = JSON.parse(JSON.stringify(newQuest));

    try {
      // Tenta salvar com todas as colunas. Se alguma coluna não existir na
      // tabela (ex: combatCoinDrop), o PostgREST retorna erro SEM lançar
      // exceção. Detectamos o erro e removemos a coluna ausente para não
      // perder o restante do save silenciosamente.
      let payload = sanitizedQuest;
      let upsertRes = await supabase.from('quests').upsert({ id: questId, ...payload });
      let upsertErr = upsertRes.error;
      while (upsertErr && /Could not find the '([^']+)' column/.test(upsertErr.message || '')) {
        const missing = (upsertErr.message.match(/Could not find the '([^']+)' column/) || [])[1];
        if (!missing) break;
        const { [missing]: _dropped, ...rest } = payload;
        payload = rest;
        upsertRes = await supabase.from('quests').upsert({ id: questId, ...payload });
        upsertErr = upsertRes.error;
      }
      if (upsertErr) {
        await showAlert("Erro ao salvar a missão: " + (upsertErr.message || 'Erro desconhecido.'));
        return;
      }
      // Garantir que chestconfig seja salvo mesmo se o upsert não atualizar
      if (questChestConfig) {
        await supabase.from('quests').update({ chestconfig: questChestConfig }).eq('id', questId);
      }
      await showAlert("✅ Missão salva com sucesso!");
      setIsCreatingQuest(false);
      setEditingQuestId(null);
      setQuestTitle(''); setQuestDesc(''); setQuestCover(''); setQuestMode('classic'); setQuestXp('1000'); setQuestRetries(false); setQuestPenalty('0'); setQuestMonsterName(''); setQuestMonsterConfig(null);
      setQuestMonsterModelUrl(''); setQuestMonsterQuotes({}); setQuestMonsterDefeatQuotes(''); setQuestMonsterDrops([]); setQuestBattleBgUrl(''); setQuestBattleBgPosX(50); setQuestBattleBgPosY(50); setQuestBattleBgScale(1.2); setQuestBattleBgMoveEnabled(true); setQuestBattleBgMoveDirection('diagonal'); setQuestBattleBgMoveSpeed(10); setQuestBattleBgMoveDuration(30); setQuestPodiumBgUrl(''); setQuestCombatCoinMin(2); setQuestCombatCoinMax(6); setQuestCombatCoinMinValue(1); setQuestCombatCoinMaxValue(3); setQuestChestConfig({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1], slotChances: [50, 25, 10, 5], dropChance: 100 });
      setQuestLiveChest1st({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
      setQuestLiveChest2nd({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
      setQuestLiveChest3rd({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
      setQuestCreatedBy(null); setQuestCreatorRole(null); setQuestTargetClasses([]);
      setQuestShuffleQuestions(false); setQuestShuffleAnswers(false);
      setQuestRandomSelection(false); setQuestRandomCount(10);
      setQuestQuestions([{ title: '', imageUrl: '', timeLimit: 30, options: [{text: ''}, {text: ''}, {text: ''}, {text: ''}], correctIndex: 0 }]);
      fetchQuests();
    } catch (e: any) {
      console.error(e);
      await showAlert("Erro ao salvar a missão: " + (e.message || "Erro desconhecido. Verifique se todos os campos estão preenchidos."));
    }
  };

  const handleEditQuest = (quest: QuestDef) => {
    setEditingQuestId(quest.id);
    setQuestTitle(quest.title);
    setQuestDesc(quest.description);
    setQuestCover(quest.coverImageUrl || '');
    setQuestXp(quest.baseXp.toString());
    setQuestRetries(quest.allowRetries);
    setQuestPenalty((quest.xpPenaltyPerRetry || 0).toString());
    setQuestQuestions(quest.questions);
    setQuestMonsterName(quest.monsterName || '');
    setQuestMonsterConfig(quest.monsterAvatarConfig || null);
    setQuestMonsterModelUrl(quest.monsterModelUrl || '');
    setQuestMonsterQuotes(quest.monsterQuotes || {});
    setQuestMonsterDefeatQuotes(quest.monsterDefeatQuotes || '');
    setQuestMonsterDrops(quest.monsterDrops || []);
    setQuestBattleBgUrl(quest.battleBgUrl || '');
    setQuestBattleBgPosX(quest.battleBgPosX ?? 50);
    setQuestBattleBgPosY(quest.battleBgPosY ?? 50);
    setQuestBattleBgScale(quest.battleBgScale ?? 1.2);
    setQuestBattleBgMoveEnabled(quest.battleBgMoveEnabled ?? true);
    setQuestBattleBgMoveDirection(quest.battleBgMoveDirection ?? 'diagonal');
    setQuestBattleBgMoveSpeed(quest.battleBgMoveSpeed ?? 10);
    setQuestBattleBgMoveDuration(quest.battleBgMoveDuration ?? 30);
    setQuestPodiumBgUrl(quest.podiumBgUrl || '');
    const combatCoinDropConfig = normalizeCombatCoinDrop(quest.combatCoinDrop);
    setQuestCombatCoinMin(combatCoinDropConfig.minCoins ?? 2);
    setQuestCombatCoinMax(combatCoinDropConfig.maxCoins ?? 6);
    setQuestCombatCoinMinValue(combatCoinDropConfig.minValue ?? 1);
    setQuestCombatCoinMaxValue(combatCoinDropConfig.maxValue ?? 3);
    setQuestChestConfig(quest.chestConfig || { itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1], slotChances: [50, 25, 10, 5], dropChance: 100 });
    setQuestMode(quest.mode || 'classic');
    setQuestLiveChest1st(quest.liveChest1stPlace || { itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
    setQuestLiveChest2nd(quest.liveChest2ndPlace || { itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
    setQuestLiveChest3rd(quest.liveChest3rdPlace || { itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
    setQuestCreatedBy(quest.createdBy || null);
    setQuestCreatorRole(quest.creatorRole || null);
    setQuestTargetClasses(quest.targetClasses || []);
    setQuestShuffleQuestions(quest.shuffleQuestions || false);
    setQuestShuffleAnswers(quest.shuffleAnswers || false);
    setQuestRandomSelection(quest.randomQuestionSelection || false);
    setQuestRandomCount(quest.randomQuestionCount || 10);
    setIsCreatingQuest(true);
  };

  const openQuestHistory = async (quest: QuestDef) => {
    setSelectedQuestForHistory(quest);
    setIsQuestHistoryModalOpen(true);
    setIsQuestHistoryModalOpen(true);
    
    const { data: snap, error } = await supabase.from('quest_attempts').select('*').eq('quest_id', quest.id);
    
    if (error) {
      console.error("Erro ao buscar histórico:", error);
      setLoading(false);
      return;
    }

    const loaded: any[] = [];
    if (snap) {
      snap.forEach(d => {
        // Map snake_case from DB to camelCase for the frontend
        loaded.push({ 
          id: d.id, 
          studentId: d.student_id, 
          questId: d.quest_id, 
          status: d.status,
          timestamp: d.created_at ? { seconds: new Date(d.created_at).getTime() / 1000 } : null,
          earnedXp: d.data?.earned_xp || 0,
          answers: d.data?.answers || []
        });
      });
    }
    
    setQuestHistoryAttempts(loaded);
    setQuestHistoryAttempts(loaded);
  };

  const handleResetQuestAttempt = async (studentId: string) => {
    const confirmed = await showConfirm('Deseja realmente RESETAR o desafio para este aluno? Todo o histórico de tentativas dele para esta missão será apagado. Ele poderá fazer a missão novamente. O XP ganho anteriormente não será removido automaticamente.');
    if (!confirmed) return;
    
    const attemptsToDelete = questHistoryAttempts.filter(a => a.studentId === studentId);
    for (const attempt of attemptsToDelete) {
      await supabase.from('quest_attempts').delete().eq('id', attempt.id);
    }
    
    setQuestHistoryAttempts(prev => prev.filter(a => a.studentId !== studentId));
  };

  const handleToggleQuestActive = async (id: string, currentStatus: boolean) => {
    await supabase.from('quests').update({ active: !currentStatus }).eq('id', id);
    fetchQuests();
  };

  const handleDeleteQuest = async (id: string) => {
    const confirmed = await showConfirm("Apagar essa Missão definitivamente?");
    if (confirmed) {
      await supabase.from('quests').delete().eq('id', id);
      fetchQuests();
    }
  };

  const saveQuestionToBank = async (q: QuestQuestion, _index: number) => {
    if (!q.title?.trim()) return;
    try {
      const { data: existing } = await supabase
        .from('question_bank')
        .select('id')
        .eq('title', q.title.trim())
        .limit(1);
      if (existing && existing.length > 0) return;
      await supabase.from('question_bank').insert({
        title: q.title.trim(),
        image_url: q.imageUrl || '',
        options: q.options.map(o => ({ text: o.text || '', imageUrl: o.imageUrl || '' })),
        correct_index: q.correctIndex,
        time_limit: q.timeLimit || 30,
        category: 'geral',
        difficulty: 'medio',
        tags: [],
        tenant_id: null,
      });
    } catch (e) {
      console.error('Erro ao salvar no banco global:', e);
    }
  };

  const handleUpdateQuestion = (qIndex: number, field: keyof QuestQuestion, value: any) => {
    setQuestQuestions(prev => {
      const next = [...prev];
      if (next[qIndex]) {
        next[qIndex] = { ...next[qIndex], [field]: value };
      }
      return next;
    });
  };

  const handleUpdateOption = (qIndex: number, optIndex: number, field: keyof QuestOption, value: any) => {
    setQuestQuestions(prev => {
      const next = [...prev];
      if (next[qIndex] && next[qIndex].options && next[qIndex].options[optIndex]) {
        const nextOptions = [...next[qIndex].options];
        nextOptions[optIndex] = { ...nextOptions[optIndex], [field]: value };
        next[qIndex] = { ...next[qIndex], options: nextOptions };
      }
      return next;
    });
  };

  const handleImportQuestionFromBank = (importedQuestion: any) => {
    setQuestQuestions(prev => [
      ...prev,
      {
        title: importedQuestion.title || '',
        imageUrl: importedQuestion.image_url || '',
        timeLimit: importedQuestion.time_limit || 30,
        options: importedQuestion.options || [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
        correctIndex: importedQuestion.correct_index ?? 0
      }
    ]);
    setShowQuestionBank(false);
  };

  const handleGallerySelect = (url: string) => {
    if (galleryTarget === 'cover') setQuestCover(url);
    else if (galleryTarget === 'arena') setQuestBattleBgUrl(url);
    else if (galleryTarget === 'podium') setQuestPodiumBgUrl(url);
    else if (galleryTarget?.startsWith('question-')) {
      const qIndex = parseInt(galleryTarget.split('-')[1]);
      handleUpdateQuestion(qIndex, 'imageUrl', url);
    } else if (galleryTarget?.startsWith('option-')) {
      const [, qIndexStr, optIndexStr] = galleryTarget.split('-');
      handleUpdateOption(parseInt(qIndexStr), parseInt(optIndexStr), 'imageUrl', url);
    } else if (galleryTarget === 'bank-question') {
      setBankGalleryResult({ type: 'question', url });
    } else if (galleryTarget?.startsWith('bank-option-')) {
      const optIndex = parseInt(galleryTarget.split('-')[2]);
      setBankGalleryResult({ type: 'option', optIndex, url });
    }
    setGalleryTarget(null);
  };



  const renderChestConfig = (
    title: string,
    desc: string,
    chestConfig: any,
    setChestConfig: (c: any) => void,
    showDropChance: boolean
  ) => {
    const selectedChest = availableChests.find((c: any) => c.id === chestConfig?.chestModelId);
    const slotCount = selectedChest?.slot_count || chestConfig?.slotCount || 4;
    const slots = Array.from({ length: slotCount }, (_, i) => i);
    return (
      <div style={{ background: 'rgba(255, 215, 0, 0.05)', padding: '1.5rem', borderRadius: '8px', border: '1px solid rgba(255, 215, 0, 0.3)', marginTop: '2rem' }}>
        <h4 style={{ color: 'var(--gold-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Package size={20} /> {title}</h4>
        {desc && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>{desc}</p>}

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>Baú Visual (opcional)</label>
          <select
            value={chestConfig?.chestModelId || ''}
            onChange={e => {
              const chest = availableChests.find((c: any) => c.id === e.target.value);
              setChestConfig({ ...chestConfig, chestModelId: e.target.value || undefined, slotCount: chest?.slot_count || 4 });
            }}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--gold-primary)', color: 'white', fontFamily: 'inherit', fontSize: '1rem' }}
          >
            <option value="">(Baú padrão do jogo)</option>
            {availableChests.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}{c.rarity ? ` — ${c.rarity}` : ''}</option>
            ))}
          </select>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginTop: '0.35rem' }}>
            {selectedChest ? `Este baú possui ${slotCount} slots de recompensa.` : 'Selecione um baú cadastrado na aba "Moldes 3D → Baús de Recompensa" para usá-lo na revelação.'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>Máximo de Moedas {showDropChance && '(Obrigatório para ativar o baú)'}</label>
            <input type="number" value={chestConfig?.maxCoins || ''} onChange={e => setChestConfig({ ...chestConfig, maxCoins: parseInt(e.target.value) || 0 })} placeholder="Ex: 100" style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--gold-primary)', color: 'white', fontFamily: 'inherit', fontSize: '1.1rem' }} />
          </div>
          {showDropChance && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>Chance do Baú Aparecer (%)</label>
              <input type="number" min="1" max="100" value={chestConfig?.dropChance ?? 100} onChange={e => setChestConfig({ ...chestConfig, dropChance: Math.min(100, Math.max(1, parseInt(e.target.value) || 100)) })} placeholder="1 a 100" style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--gold-primary)', color: 'white', fontFamily: 'inherit', fontSize: '1.1rem' }} />
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
          {slots.map((slot) => {
            const selectedItem = availableStoreItems.find(i => i.id === chestConfig?.itemIds?.[slot]);
            const isConsumable = selectedItem?.type === 'consumable';
            const defaultChance = slot === 0 ? 50 : slot === 1 ? 25 : slot === 2 ? 10 : 5;
            const slotChance = chestConfig?.slotChances?.[slot] ?? defaultChance;
            
            return (
              <div key={slot} style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Item {slot + 1} {showDropChance ? `(${slotChance}% de chance)` : '(100% de chance)'}</label>
                {showDropChance && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Chance de cair:</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={slotChance}
                      onChange={e => {
                        const newChances = [...(chestConfig?.slotChances || [])];
                        newChances[slot] = Math.min(100, Math.max(1, parseInt(e.target.value) || 1));
                        setChestConfig({ ...chestConfig, slotChances: newChances });
                      }}
                      style={{ width: '70px', padding: '0.4rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>%</span>
                  </div>
                )}
                <StoreItemSelect
                  value={chestConfig?.itemIds?.[slot] || ''}
                  onChange={(id, item) => {
                    const newIds = [...(chestConfig?.itemIds || [])];
                    const newQuants = [...(chestConfig?.itemQuantities || [])];
                    newIds[slot] = id;
                    if (item?.type === 'equippable') newQuants[slot] = 1;
                    setChestConfig({ ...chestConfig, itemIds: newIds, itemQuantities: newQuants });
                  }}
                  items={availableStoreItems}
                  placeholder="(Nenhum Item)"
                  disabledIds={(chestConfig?.itemIds || []).filter((id: string, idx: number) => id && idx !== slot)}
                />
                
                {isConsumable && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Quantidade:</span>
                    <input 
                      type="number"
                      min="1"
                      max="99"
                      value={chestConfig?.itemQuantities?.[slot] || 1}
                      onChange={e => {
                        const newQuants = [...(chestConfig?.itemQuantities || [])];
                        newQuants[slot] = Math.max(1, parseInt(e.target.value) || 1);
                        setChestConfig({ ...chestConfig, itemQuantities: newQuants });
                      }}
                      style={{ width: '60px', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="app-container" style={{ height: '100vh', maxHeight: '100vh', overflow: 'hidden' }}>
      <div className="dashboard-header-sticky">
      <nav className="navbar glass-panel compact-nav" style={{ position: 'static', marginBottom: '0.5rem' }}>
        <div className="logo-container">
          <div style={{ width: 48, height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={`${import.meta.env.BASE_URL}logo-math-mastery.png`} alt="Math Mastery" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem', minWidth: 0 }}>
            <h1 className="title-glow">
              {panelLabel(panelRoleName)}
            </h1>
            <div className="tenant-switcher-desktop" style={{ position: 'relative', zIndex: 99999 }}>
              <TenantSwitcher />
            </div>
          </div>
        </div>
        <div className="admin-navbar-right" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="login-btn back-btn" onClick={() => navigate('/dashboard')} style={{ padding: '0.5rem', borderRadius: '8px' }} title="Voltar ao Painel do Aluno">
            <ArrowLeft size={20} />
          </button>
          <button className="login-btn mobile-menu-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ padding: '0.5rem', borderRadius: '8px' }} title="Menu">
            <Menu size={20} />
          </button>
          <div className="user-info-pill" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: '50px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              {userData && (
                <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark)' }}>
                  <AvatarPrint config={userData.avatarConfig} equippedItems={[]} size={36} />
                </div>
              )}
              <span style={{ fontWeight: 'bold' }}>{userData?.name?.split(' ')[0]}</span>
            </div>
          </div>
          <button className="login-btn logout-btn" onClick={() => supabase.auth.signOut()} style={{ padding: '0.75rem', borderRadius: '50%' }} title="Sair">
            <LogOut size={20} />
          </button>
        </div>
      </nav>
      </div>

      <div className="admin-layout" style={{ display: 'flex', gap: '1.5rem', flex: 1, overflow: 'hidden' }}>
        {/* Overlay for Mobile */}
        {isSidebarOpen && (
          <div className="admin-sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>
        )}
        
        <div className={`glass-panel admin-sidebar ${isSidebarOpen ? 'open' : ''}`} style={{ width: '250px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: '100px', maxHeight: 'calc(100vh - 120px)' }}>

          <div className="tenant-switcher-mobile" style={{ flexDirection: 'column', gap: '0.25rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
            <TenantSwitcher variant="menu" />
          </div>
{canAccessGeneral && (
            <button className={`login-btn ${activeTab === 'general' ? 'active' : ''}`} onClick={() => { setActiveTab('general'); setGeneralTab(firstGeneralTab); setIsSidebarOpen(false); }} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'general' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'general' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
              <Users size={20} /> <span className="sidebar-btn-text">Geral</span>
            </button>
          )}
          {canView('quests_admin', 'view') && (
            <button className={`login-btn ${activeTab === 'quests' ? 'active' : ''}`} onClick={() => { setActiveTab('quests'); setIsSidebarOpen(false); }} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'quests' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'quests' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
              <Swords size={20} /> <span className="sidebar-btn-text">Missões</span>
            </button>
          )}
          {canView('items', 'view') && (
            <button className={`login-btn ${activeTab === 'store' ? 'active' : ''}`} onClick={() => { setActiveTab('store'); setIsSidebarOpen(false); }} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'store' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'store' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
              <Store size={20} /> <span className="sidebar-btn-text">Catálogo de Itens</span>
            </button>
          )}
          {canView('economy', 'view') && (
            <button className={`login-btn ${activeTab === 'economy' ? 'active' : ''}`} onClick={() => { setActiveTab('economy'); setIsSidebarOpen(false); }} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'economy' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'economy' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
              <CircleDollarSign size={20} /> <span className="sidebar-btn-text">Economia</span>
            </button>
          )}
          {canView('approvals', 'view') && (
            <button className={`login-btn ${activeTab === 'approvals' ? 'active' : ''}`} onClick={() => { setActiveTab('approvals'); setIsSidebarOpen(false); }} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'approvals' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'approvals' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
              <UserCheck size={20} /> <span className="sidebar-btn-text">Solicitações</span>
            </button>
          )}
          {canView('entities', 'view') && (
            <button className={`login-btn ${activeTab === 'entities' ? 'active' : ''}`} onClick={() => setActiveTab('entities')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'entities' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'entities' ? 'rgba(239, 68, 68, 0.1)' : 'transparent', marginTop: 'auto' }}>
              <Box size={20} /> Entidades (3D)
            </button>
          )}
        </div>

        {/* Content */}
        <div className="glass-panel" id="admin-content-scroll" style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', position: 'relative' }}>

        {/* Aba Geral — barra de sub-guias */}
        {activeTab === 'general' && (
          <div className="general-tabs-wrap" style={{ position: 'sticky', top: 0, zIndex: 40, background: 'var(--bg-card)', padding: '0.6rem 0', marginBottom: '0.9rem', borderBottom: '1px solid var(--border-glass)' }}>
            <div className="hide-scrollbar" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
              {generalTabOptions.filter(t => t.check).sort((a, b) => a.label.localeCompare(b.label)).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setGeneralTab(tab.key as any)}
                  className={`general-tab-btn ${generalTab === tab.key ? 'active' : ''}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.65rem 1.1rem', borderRadius: '10px', border: generalTab === tab.key ? '1px solid var(--gold-primary)' : '1px solid var(--border-glass)', cursor: 'pointer', fontSize: '0.92rem', fontWeight: generalTab === tab.key ? 'bold' : 'normal', background: generalTab === tab.key ? 'var(--gold-primary)' : 'var(--bg-card)', color: generalTab === tab.key ? 'var(--text-on-gold, #000)' : 'var(--text-primary)', flexShrink: 0, boxShadow: generalTab === tab.key ? '0 2px 10px rgba(218, 165, 32, 0.3)' : 'none' }}
                  title={tab.label}
                >
                  {tab.icon} <span className="general-tab-text">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Aba de Solicitações (Approvals) */}
        {activeTab === 'approvals' && (
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserCheck size={28} color="var(--gold-primary)" />
                Solicitações de Acesso
              </h2>
              <p style={{ color: 'var(--text-secondary)' }}>Aprove ou rejeite contas que solicitaram acesso como Professor / Coordenador ou Aluno.</p>
            </div>
            
            {/* Seção de Alunos Pendentes */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Solicitações de Alunos</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                {students.filter(s => s.role === 'pending_student').length === 0 ? (
                  <div style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--border-glass)' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>Nenhuma solicitação de aluno pendente.</p>
                  </div>
                ) : (
                  students.filter(s => s.role === 'pending_student').map(reqUser => (
                    <StudentEnrollmentCard 
                      key={reqUser.uid} 
                      reqUser={reqUser}
                      tenantId={tenantId}
                      schoolClasses={schoolClasses}
                      userData={userData}
                      onApprove={fetchStudents}
                      onReject={fetchStudents}
                      showConfirm={showConfirm}
                      showAlert={showAlert}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Seção de Professores Pendentes */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Solicitações de Professores</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                {students.filter(s => s.role === 'pending_teacher').length === 0 ? (
                  <div style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--border-glass)' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>Nenhuma solicitação de professor pendente.</p>
                  </div>
                ) : (
                  students.filter(s => s.role === 'pending_teacher').map(reqUser => (
                    <div key={reqUser.uid} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--gold-primary)', background: 'rgba(251, 191, 36, 0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <img src={reqUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(reqUser.name)}`} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%' }} />
                        <div style={{ overflow: 'hidden' }}>
                          <h4 style={{ margin: 0, fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reqUser.name}</h4>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{reqUser.email}</span>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                        <button 
                          onClick={async () => {
                            if (await showConfirm('Rejeitar Solicitação', `Deseja negar o acesso de professor para ${reqUser.name}? Ele voltará a ser um Aluno comum.`)) {
                              await supabase.from('users').update({ role: 'student' }).eq('id', reqUser.uid);
                              fetchStudents();
                            }
                          }}
                          className="login-btn" 
                          style={{ flex: 1, padding: '0.5rem', background: 'rgba(239, 68, 68, 0.2)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)' }}
                        >
                          Rejeitar
                        </button>
                        <button 
                          onClick={async () => {
                            if (await showConfirm('Aprovar Professor', `Confirmar ${reqUser.name} como Professor?`)) {
                              await supabase.from('users').update({ role: 'teacher' }).eq('id', reqUser.uid);
                              fetchStudents();
                            }
                          }}
                          className="login-btn" 
                          style={{ flex: 1, padding: '0.5rem', background: 'var(--accent-green)', color: 'white', border: 'none' }}
                        >
                          Aprovar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Seção de Alunos Pré-autorizados */}
            <div style={{ marginTop: '2rem' }}>
              <PreAuthorizedStudentsManager />
            </div>
          </div>
        )}

        {/* Aba de Entidades 3D */}
        {activeTab === 'entities' && (
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <AdminEntitiesManager />
          </div>
        )}

        {/* Aba de Hierarquias e Permissões */}
        {activeTab === 'general' && generalTab === 'roles' && (userData?.role === 'admin' || userData?.role === 'superadmin') && (
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <AdminRolesManager />
          </div>
        )}

        {/* Aba de Dicas do Companheiro - Apenas Superadmin */}
        {activeTab === 'general' && generalTab === 'companion' && isSuperAdmin && (
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MessageCircle size={28} color="#fbbf24" />
                Tutorial
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Personalize as falas do personagem que aparece no cubo do jogador.
              </p>
            </div>
            <AdminCompanionTipsManager />
          </div>
        )}

        {/* Aba de Escolas (Multi-tenant) - Apenas Superadmin */}
        {activeTab === 'general' && generalTab === 'tenants' && isSuperAdmin && (
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <GraduationCap size={28} color="#8b5cf6" />
                Escolas
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Gerencie as escolas da plataforma. Cada escola é um tenant isolado com seus próprios alunos, missões e itens.
              </p>
            </div>

            {/* Tenant Atual */}
            {tenant && (
              <div style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <span style={{ color: '#8b5cf6', fontWeight: 'bold', fontSize: '0.85rem' }}>ESCOLA ATUAL</span>
                    <h3 style={{ margin: '0.25rem 0 0 0', fontSize: '1.3rem' }}>{tenant.name}</h3>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Slug: {tenant.slug} | Status: {tenant.status} | Limite: {tenant.max_students || 500} alunos</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {tenantId !== '00000000-0000-0000-0000-000000000001' && (
                      <button 
                        onClick={async () => {
                          if (await showConfirm('Voltar para Escola Padrão', 'Deseja voltar para a escola padrão? A página será recarregada.')) {
                            localStorage.removeItem('superadmin_selected_tenant');
                            window.location.reload();
                          }
                        }}
                        style={{ padding: '0.5rem 1rem', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        <ArrowLeft size={16} /> Voltar Padrão
                      </button>
                    )}
                    <button 
                      onClick={() => refreshTenants()}
                      style={{ padding: '0.5rem 1rem', background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <RefreshCw size={16} /> Atualizar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Lista de Escolas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
              {tenants.map(t => (
                <div 
                  key={t.id} 
                  className="glass-panel" 
                  style={{ 
                    padding: '1.5rem', 
                    border: t.id === tenantId ? '2px solid #8b5cf6' : '1px solid var(--border-glass)',
                    background: t.id === tenantId ? 'rgba(139, 92, 246, 0.05)' : 'var(--bg-card)',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {t.name}
                        {t.id === tenantId && (
                          <span style={{ fontSize: '0.7rem', background: '#8b5cf6', color: 'white', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>ATUAL</span>
                        )}
                      </h4>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Slug: {t.slug}</span>
                    </div>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: 'bold',
                      padding: '0.2rem 0.6rem', 
                      borderRadius: '10px',
                      background: t.status === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: t.status === 'active' ? '#10b981' : '#ef4444'
                    }}>
                      {t.status === 'active' ? 'Ativa' : t.status === 'inactive' ? 'Inativa' : 'Suspensa'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                      👥 Limite: {t.max_students || 500} alunos
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {t.id !== tenantId && (
                      <button 
                        onClick={async () => {
                          if (await showConfirm('Trocar de Escola', `Deseja trocar para a escola "${t.name}"? A página será recarregada.`)) {
                            await switchTenant(t.id);
                          }
                        }}
                        style={{ padding: '0.4rem 0.8rem', background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Entrar
                      </button>
                    )}
                    <button 
                      onClick={() => openEditTenantModal(t)}
                      style={{ padding: '0.4rem 0.8rem', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      Editar
                    </button>
                    {t.id !== '00000000-0000-0000-0000-000000000001' && t.id !== tenantId && (
                      <button 
                        onClick={async () => {
                          if (await showConfirm('DELETAR ESCOLA', `ATENÇÃO: Isso deletará permanentemente a escola "${t.name}" e TODOS os seus dados (alunos, missões, itens). Esta ação é IRREVERSÍVEL!`)) {
                            await deleteTenant(t.id);
                          }
                        }}
                        style={{ padding: '0.4rem 0.8rem', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Deletar
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Card para criar nova escola */}
              <div 
                className="glass-panel" 
                style={{ 
                  padding: '1.5rem', 
                  border: '2px dashed rgba(139, 92, 246, 0.3)',
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  minHeight: '150px'
                }}
                onClick={openCreateTenantModal}
              >
                <Plus size={32} color="#8b5cf6" />
                <span style={{ color: '#8b5cf6', fontWeight: 'bold', marginTop: '0.5rem' }}>Nova Escola</span>
              </div>
            </div>
          </div>
        )}

        {/* Aba de Economia */}
        {activeTab === 'economy' && (
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div className="dashboard-header-sticky" style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '1rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Ajustes da Economia</h2>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Configure taxas, quedas de moedas e regras do comércio.</span>
              </div>
            </div>
            <AdminEconomySettings />
          </div>
        )}

        {/* Aba de Usuários */}
        {activeTab === 'general' && generalTab === 'users' && canView('users', 'view') && (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
              <div className="dashboard-header-sticky" style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '0.5rem 2rem', margin: '-2rem -2rem 0.5rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
                <div className="compact-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Gerenciamento de Usuários</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem 0.5rem', borderRadius: '8px' }}>
                  <button onClick={() => setIsUserFiltersOpen(!isUserFiltersOpen)} style={{ background: 'transparent', border: 'none', color: isUserFiltersOpen ? 'var(--gold-primary)' : 'var(--text-secondary)', cursor: 'pointer', padding: '0.35rem', display: 'flex', alignItems: 'center', borderRadius: '6px' }} title={isUserFiltersOpen ? 'Ocultar Filtros' : 'Mostrar Filtros'}>
                    <Filter size={16} />
                  </button>
                  <div style={{ width: '1px', height: '16px', background: 'var(--border-glass)' }} />
                  <button onClick={() => {
                    const next = !showAvatars3D;
                    setShowAvatars3D(next);
                    localStorage.setItem('showAvatars3D', String(next));
                  }} style={{ background: 'transparent', border: 'none', color: showAvatars3D ? 'var(--gold-primary)' : 'var(--text-secondary)', cursor: 'pointer', padding: '0.35rem', display: 'flex', alignItems: 'center', borderRadius: '6px' }} title={showAvatars3D ? 'Ocultar Avatares 3D' : 'Mostrar Avatares 3D'}>
                    {showAvatars3D ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <div style={{ width: '1px', height: '16px', background: 'var(--border-glass)' }} />
<button onClick={() => {
                    const studentIds = students.filter(s => s.role === 'student').map(s => s.uid);
                    const allSelected = studentIds.length > 0 && studentIds.every(id => selectedStudentIds.includes(id));
                    if (allSelected) {
                      setSelectedStudentIds([]);
                    } else {
                      setSelectedStudentIds(studentIds);
                    }
                  }} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.35rem', display: 'flex', alignItems: 'center', borderRadius: '6px', fontSize: '0.75rem', gap: '0.25rem' }} title="Selecionar/Desselecionar Todos os Alunos">
                    <Users size={14} />
</button>
                </div>
                {canView('users', 'create') && (
                  <button className="login-btn" onClick={openLocalAccountModal} style={{ padding: '0.4rem 0.9rem', display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'rgba(139, 92, 246, 0.2)', color: '#c084fc', border: '1px solid rgba(139, 92, 246, 0.4)' }}>
                    <KeyRound size={15} /> Conta Local
                  </button>
                )}
                {canView('users', 'create') && (
                  <button className="login-btn" onClick={openLocalAccountsList} style={{ padding: '0.4rem 0.9rem', display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.35)' }}>
                    <KeyRound size={15} /> Contas Locais
                  </button>
                )}
                
                {selectedStudentIds.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(251, 191, 36, 0.1)', padding: '0.25rem 0.75rem', borderRadius: '8px', border: '1px solid var(--gold-primary)' }}>
                    <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>{selectedStudentIds.length} selecionados</span>
                    <button 
                      className="login-btn" 
                      onClick={() => setIsBulkXpModalOpen(true)}
                      style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0.5rem 1rem' }}
                    >
                      <Star size={18} style={{ marginRight: '0.5rem' }} /> XP em Massa
                    </button>
                    <button 
                      onClick={() => setSelectedStudentIds([])}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      <X size={20} />
                    </button>
                  </div>
                )}
              </div>

              {/* Filtros e Busca */}
              {isUserFiltersOpen && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexDirection: 'column' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: '1 1 150px', display: 'flex', alignItems: 'center', minWidth: 0 }}>
                    <Search size={16} style={{ position: 'absolute', right: '0.75rem', color: 'var(--text-secondary)' }} />
                    <input 
                      type="text" 
                      placeholder="Buscar por nome..." 
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      style={{ width: '100%', padding: '0 2rem 0 1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.9rem', height: '36px' }}
                    />
                  </div>
                  <select 
                    value={studentSortBy} 
                    onChange={e => setStudentSortBy(e.target.value as any)}
                    style={{ padding: '0 0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', height: '36px', fontSize: '0.9rem' }}
                  >
                    <option value="xp">Por XP</option>
                    <option value="name">Por Nome</option>
                    <option value="class">Por Turma</option>
                  </select>
                  <button 
                    onClick={() => setStudentSortOrder(studentSortOrder === 'desc' ? 'asc' : 'desc')}
                    style={{ padding: '0 0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', height: '36px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}
                    title="Alterar Direção"
                  >
                    {studentSortOrder === 'asc' ? 'A→Z' : 'Z→A'}
                  </button>
                </div>
                
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <button className="class-tabs-arrow class-tabs-arrow-left" onClick={() => { const el = document.querySelector('.class-tabs-scroll'); if (el) el.scrollBy({ left: -120, behavior: 'smooth' }); }} style={{ display: 'none', position: 'absolute', left: 0, zIndex: 5, background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)', padding: 0, flexShrink: 0 }}>
                    <ChevronDown size={14} style={{ transform: 'rotate(90deg)' }} />
                  </button>
                  <div className="compact-tab-row class-tabs-scroll" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                  <button 
                    onClick={() => setSelectedClassTab('all')}
                    style={{ padding: '0.25rem 1rem', borderRadius: '16px', border: `1px solid ${selectedClassTab === 'all' ? 'var(--gold-primary)' : 'var(--border-glass)'}`, background: selectedClassTab === 'all' ? 'var(--gold-primary)' : 'var(--btn-bg)', color: selectedClassTab === 'all' ? '#000' : 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '0.85rem', textShadow: selectedClassTab === 'all' ? '0 1px 2px rgba(0,0,0,0.3)' : 'none' }}
                  >
                    Todos
                  </button>
                  <button 
                    onClick={() => setSelectedClassTab('staff')}
                    style={{ padding: '0.25rem 1rem', borderRadius: '16px', border: `1px solid ${selectedClassTab === 'staff' ? 'var(--accent-red)' : 'var(--border-glass)'}`, background: selectedClassTab === 'staff' ? 'var(--accent-red)' : 'var(--btn-bg)', color: selectedClassTab === 'staff' ? '#fff' : 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '0.85rem', textShadow: selectedClassTab === 'staff' ? '0 1px 2px rgba(0,0,0,0.5)' : 'none' }}
                  >
                    Equipe (Prof/Admin)
                  </button>
                  {schoolClasses.map(cls => (
                    <button 
                      key={cls.id}
                      onClick={() => setSelectedClassTab(cls.name)}
                      style={{ padding: '0.25rem 1rem', borderRadius: '16px', border: `1px solid ${cls.color}`, background: selectedClassTab === cls.name ? cls.color : 'var(--btn-bg)', color: selectedClassTab === cls.name ? '#fff' : 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '0.85rem', textShadow: selectedClassTab === cls.name ? '0 1px 2px rgba(0,0,0,0.5)' : 'none' }}
                    >
                      {cls.name}
                    </button>
                  ))}
                  <button 
                    onClick={() => setSelectedClassTab('unassigned')}
                    style={{ padding: '0.25rem 1rem', borderRadius: '16px', border: `1px solid ${selectedClassTab === 'unassigned' ? 'var(--text-secondary)' : 'var(--border-glass)'}`, background: selectedClassTab === 'unassigned' ? 'var(--text-secondary)' : 'var(--btn-bg)', color: selectedClassTab === 'unassigned' ? '#fff' : 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '0.85rem', textShadow: selectedClassTab === 'unassigned' ? '0 1px 2px rgba(0,0,0,0.5)' : 'none' }}
                  >
                    Sem Turma
                  </button>
                </div>
                  <button className="class-tabs-arrow class-tabs-arrow-right" onClick={() => { const el = document.querySelector('.class-tabs-scroll'); if (el) el.scrollBy({ left: 120, behavior: 'smooth' }); }} style={{ display: 'none', position: 'absolute', right: 0, zIndex: 5, background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)', padding: 0, flexShrink: 0 }}>
                    <ChevronDown size={14} style={{ transform: 'rotate(-90deg)' }} />
                  </button>
                </div>
                </div>
              )}
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Carregando usuários do banco de dados...</div>
              ) : students.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', border: '1px dashed var(--border-glass)', borderRadius: '8px' }}>
                  <GraduationCap size={48} color="var(--text-secondary)" style={{ opacity: 0.5, margin: '0 auto 1rem auto' }} />
                  <h3>Nenhum usuário logou no sistema ainda</h3>
                  <p style={{ color: 'var(--text-secondary)' }}>Os alunos da instituição devem fazer o primeiro acesso via Google para aparecerem aqui.</p>
                </div>
              ) : (() => {
                const filteredStudents = students.filter(student => {
                  // Usuários pendentes NUNCA aparecem na listagem geral — só em "Solicitações"
                  if (student.role === 'pending_teacher' || student.role === 'pending_student') return false;

                  const matchesSearch = student.name.toLowerCase().includes(studentSearch.toLowerCase());
                  
                  let matchesTab = true;
                  if (selectedClassTab === 'staff') {
                    matchesTab = student.role !== 'student';
                  } else if (selectedClassTab === 'unassigned') {
                    matchesTab = !student.classId && student.role === 'student';
                  } else if (selectedClassTab === 'all') {
                    matchesTab = student.role === 'student';
                  } else {
                    matchesTab = student.classId === selectedClassTab && student.role === 'student';
                  }

                  return matchesSearch && matchesTab;
                });

                filteredStudents.sort((a, b) => {
                  let comparison = 0;
                  if (studentSortBy === 'xp') {
                    comparison = (a.xp || 0) - (b.xp || 0);
                  } else if (studentSortBy === 'name') {
                    comparison = a.name.localeCompare(b.name);
                  } else if (studentSortBy === 'class') {
                    const classA = a.classId || '';
                    const classB = b.classId || '';
                    comparison = classA.localeCompare(classB);
                  }
                  
                  return studentSortOrder === 'desc' ? -comparison : comparison;
                });

                if (filteredStudents.length === 0) {
                  return <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Nenhum usuário encontrado para estes filtros.</div>;
                }

                return (
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {filteredStudents.map(student => {
                      const currentRank = getRankForXp(student.xp || 0, student.classId);
                      const sClass = schoolClasses.find(c => c.name === student.classId);
                      const classColor = sClass ? sClass.color : 'var(--text-secondary)';
                      const isSelected = selectedStudentIds.includes(student.uid);

                      return (
                        <div key={student.uid} className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', background: isSelected ? 'rgba(251, 191, 36, 0.05)' : 'rgba(255,255,255,0.02)', border: isSelected ? '1px solid var(--gold-primary)' : '1px solid transparent' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', minWidth: 0, flex: 1 }}>
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedStudentIds([...selectedStudentIds, student.uid]);
                                else setSelectedStudentIds(selectedStudentIds.filter(id => id !== student.uid));
                              }}
                              style={{ width: '20px', height: '20px', cursor: 'pointer', flexShrink: 0 }}
                            />
                            {student.avatarConfig && showAvatars3D ? (
                              <div 
                                onClick={() => setViewingProfileUser(student)}
                                style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'visible', border: `2px solid ${currentRank.color}`, background: 'var(--bg-dark)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', flexShrink: 0, aspectRatio: '1' }}
                              >
                                <LazyAnimatedAvatar
                                  id={student.uid}
                                  config={student.avatarConfig!}
                                  equippedItems={allUserItems[student.uid] || []}
                                  size={48}
                                  animation={student.avatarConfig?.animationState as any || 'idle'}
                                  faceCamera={true}
                                />
                              </div>
                            ) : (
                              <div
                                onClick={() => setViewingProfileUser(student)}
                                style={{ width: 48, height: 48, borderRadius: '50%', border: `2px solid ${currentRank.color}`, background: 'var(--bg-dark)', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', overflow: 'hidden', flexShrink: 0, aspectRatio: '1' }}
                              >
                                {student.photoURL ? (
                                  <img src={student.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: currentRank.color }}>{student.name?.charAt(0)?.toUpperCase() || '?'}</span>
                                )}
                              </div>
                            )}
                            <div>
                              <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {student.characterName ? (
                                  <>
                                    <span>{student.characterName}</span>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                                      (<span className="student-name-desktop">{student.name}</span><span className="student-name-mobile">{student.name && student.name.length > 24 ? formatFirstAndLastName(student.name) : student.name}</span>)
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="student-name-desktop">{student.name}</span>
                                    <span className="student-name-mobile">{student.name && student.name.length > 24 ? formatFirstAndLastName(student.name) : student.name}</span>
                                  </>
                                )}
                                {student.role !== 'student' && (
                                  <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem', background: 'var(--accent-red)', borderRadius: '12px', color: 'white', textTransform: 'uppercase' }}>
                                    {student.role === 'admin' ? 'Admin' : student.role === 'teacher' ? 'Professor' : 'Coord.'}
                                  </span>
                                )}
                              </h3>
                              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                                {student.role === 'student' && (
                                  <span style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '0.3rem', 
                                    padding: '0.15rem 0.6rem', 
                                    borderRadius: '12px', 
                                    fontSize: '0.8rem',
                                    fontWeight: 'bold',
                                    background: classColor || 'var(--text-secondary)',
                                    color: '#fff',
                                    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                                    border: `1px solid ${classColor || 'var(--border-glass)'}`
                                  }}>
                                    <BookOpen size={12} /> {student.classId || 'Sem Turma'}
                                  </span>
                                )}
                                <span style={{ color: currentRank.color, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}><ShieldAlert size={14} /> {currentRank.name}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--gold-primary)' }}><Star size={14} /> {student.xp || 0} XP</span>
                              </div>
                            </div>
                          </div>
                          <div className="user-action-btns" style={{ display: 'flex', gap: '0.35rem', flexShrink: 0, flexWrap: 'nowrap' }}>
                            {student.uid !== userData?.uid && (student.role !== 'admin' || isSuperAdmin) && canView('users', 'update') && (
                              <button 
                                className="login-btn" 
                                onClick={() => openEditModal(student)}
                                style={{ padding: '0.4rem', background: 'var(--btn-bg)', borderColor: 'transparent', flexShrink: 0 }}
                                title="Editar/Promover Usuário"
                              >
                                <Edit2 size={16} />
                              </button>
                            )}
                            {student.role === 'student' && canView('users', 'update') && (
                              <button 
                                className="login-btn" 
                                onClick={() => { setModalMode('add'); setXpMode('grade'); setSelectedStudent(student); }}
                                style={{ padding: '0.4rem', borderColor: 'var(--gold-primary)', color: 'var(--gold-primary)', background: 'rgba(251, 191, 36, 0.1)', flexShrink: 0 }}
                                title="Gerenciar XP"
                              >
                                <Star size={16} />
                              </button>
                            )}
                            {(userData?.role === 'admin' || isSuperAdmin) && student.uid !== userData?.uid && (
                              <button 
                                className="login-btn" 
                                onClick={async () => {
                                  if (await showConfirm('Logar como', `Entrar como ${student.characterName || student.name} para verificar/suporte? Você poderá voltar ao seu perfil depois.`)) {
                                    await startImpersonation(student.uid);
                                    navigate('/dashboard');
                                  }
                                }}
                                style={{ padding: '0.4rem', borderColor: 'var(--accent-green)', color: 'var(--accent-green)', background: 'rgba(16, 185, 129, 0.1)', flexShrink: 0 }}
                                title="Logar como este usuário (verificar/suporte)"
                              >
                                <UserCheck size={16} />
                              </button>
                            )}
                            {student.uid !== userData?.uid && (student.role !== 'admin' || isSuperAdmin) && canView('users', 'delete') && (
                              <button 
                                className="login-btn" 
                                onClick={() => setDeletingStudent(student)}
                                style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)', borderColor: 'transparent', flexShrink: 0 }}
                                title="Excluir Usuário"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Aba de Missões (Quizzes) */}
          {activeTab === 'quests' && (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
              {!isCreatingQuest ? (
                <>
                  <div className="dashboard-header-sticky" style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Missões</h2>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Crie desafios ao estilo Kahoot para os alunos faturarem XP.</p>
                    </div>
                    <button className="login-btn" onClick={() => setIsCreatingQuest(true)} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }}>
                      <Plus size={18} style={{ marginRight: '0.5rem' }} /> Nova Missão
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {quests.filter(q => {
                      if (userData?.role === 'admin') return true;
                      if (userData?.role === 'teacher') return q.createdBy === userData?.uid || q.creatorRole === 'admin';
                      return true;
                    }).length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)' }}>Nenhuma missão criada ainda.</p>
                    ) : quests.filter(q => {
                      if (userData?.role === 'admin') return true;
                      if (userData?.role === 'teacher') return q.createdBy === userData?.uid || q.creatorRole === 'admin';
                      return true;
                    }).map(quest => {
                      const isOwnerOrAdmin = userData?.role === 'admin' || quest.createdBy === userData?.uid;
                      return (
                      <div key={quest.id} className="glass-panel quest-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderLeft: `4px solid ${quest.active ? 'var(--accent-green)' : 'var(--text-secondary)'}` }}>
                        <div className="quest-card-info" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', minWidth: 0 }}>
                          {quest.coverImageUrl ? (
                            <img src={quest.coverImageUrl} alt="Capa" className="quest-card-img" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
                          ) : (
                            <div className="quest-card-img" style={{ width: '80px', height: '80px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.1)' }}>
                              <Swords size={32} color="var(--text-secondary)" />
                            </div>
                          )}
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                              <h3 style={{ fontSize: '1.3rem', margin: 0, wordBreak: 'break-word', minWidth: 0 }}>{quest.title}</h3>
                              <span className="quest-card-mode-badge" style={{ padding: '0.2rem 0.6rem', background: quest.mode === 'live' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: quest.mode === 'live' ? 'var(--gold-primary)' : 'var(--accent-blue)', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {quest.mode === 'live' ? 'Tempo Real' : 'Atividade'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                              <span>Recompensa: <strong style={{ color: 'var(--gold-primary)' }}>{quest.baseXp} XP</strong></span>
                              <span>Modo: {quest.allowRetries ? `Vidas Extras` : 'Hardcore'}</span>
                              <span>{quest.randomQuestionSelection && quest.randomQuestionCount ? `${quest.randomQuestionCount} de ${quest.questions.length}` : quest.questions.length} Perguntas</span>
                              {quest.targetClasses && quest.targetClasses.length > 0 && <span style={{ color: 'var(--accent-blue)' }}>Turmas: {quest.targetClasses.join(', ')}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="quest-card-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                          {quest.mode === 'live' && (
                            <button onClick={() => navigate(`/live-admin/${quest.id}`, { state: { reset: true } })} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }} title="Iniciar Sessão Ao Vivo">
                              <Play size={18} fill="black" /> Iniciar Ao Vivo
                            </button>
                          )}
                          <button onClick={() => openQuestHistory(quest)} style={{ background: 'transparent', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }} title="Ver Histórico">
                            <History size={18} /> Histórico
                          </button>
                          {isOwnerOrAdmin && (
                            <>
                              <button onClick={() => handleEditQuest(quest)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.5rem' }} title="Editar Missão">
                                <Edit2 size={20} />
                              </button>
                              <button onClick={() => handleToggleQuestActive(quest.id, quest.active)} style={{ background: quest.active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)', color: quest.active  ? 'var(--accent-green)'  : 'var(--text-primary)', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                                {quest.active ? 'Ativa (Visível)' : 'Rascunho (Oculta)'}
                              </button>
                              <button onClick={() => handleDeleteQuest(quest.id)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.5rem' }} title="Excluir Missão">
                                <Trash2 size={20} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ animation: 'slideUp 0.3s ease-out', display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div className="quest-edit-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card)', padding: '0.75rem 0', borderBottom: '1px solid var(--border-glass)' }}>
                    <h2 style={{ fontSize: '1.8rem', margin: 0 }}>{editingQuestId ? 'Editar Missão' : 'Criar Nova Missão (Estilo Kahoot)'}</h2>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      {editingQuestId && (
                        <button className="login-btn" onClick={() => openQuestHistory(quests.find(q => q.id === editingQuestId)!)} style={{ background: 'var(--accent-blue)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <History size={18} /> Ver Histórico
                        </button>
                      )}
                      <button className="login-btn" onClick={() => { setIsCreatingQuest(false); setEditingQuestId(null); }} style={{ background: 'transparent', border: '1px solid var(--border-glass)' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
                    <div className="quest-edit-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                      
                      {/* Lado Esquerdo: Textos */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>Modo de Jogo</label>
                          <div style={{ display: 'flex', gap: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                              <input type="radio" name="questMode" checked={questMode === 'classic'} onChange={() => setQuestMode('classic')} />
                              <span style={{ color: questMode === 'classic'  ? 'var(--gold-primary)'  : 'var(--text-primary)' }}>Atividade Individual</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                              <input type="radio" name="questMode" checked={questMode === 'live'} onChange={() => setQuestMode('live')} />
                              <span style={{ color: questMode === 'live'  ? 'var(--gold-primary)'  : 'var(--text-primary)' }}>Em Tempo Real (Kahoot RPG)</span>
                            </label>
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome da Missão</label>
                          <input type="text" value={questTitle} onChange={e => setQuestTitle(e.target.value)} placeholder="Ex: A Masmorra das Frações" style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '1.2rem' }} />
                        </div>
                        
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Descrição (Lore da Missão)</label>
                          <textarea value={questDesc} onChange={e => setQuestDesc(e.target.value)} rows={3} style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} placeholder="Um monstro apareceu! Resolva os problemas para derrotá-lo..."></textarea>
                        </div>

                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>Recompensa Base de XP</label>
                          <input type="number" value={questXp} onChange={e => setQuestXp(e.target.value)} style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--gold-primary)', color: 'white', fontFamily: 'inherit', fontSize: '1.2rem' }} />
                        </div>

                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Turmas Alvo (Deixe vazio para todas)</label>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                            {schoolClasses.length === 0 ? <span style={{ color: 'var(--text-secondary)' }}>Nenhuma turma cadastrada</span> : schoolClasses.map(cls => (
                              <button
                                key={cls.id}
                                onClick={() => {
                                  if (questTargetClasses.includes(cls.name)) {
                                    setQuestTargetClasses(questTargetClasses.filter(c => c !== cls.name));
                                  } else {
                                    setQuestTargetClasses([...questTargetClasses, cls.name]);
                                  }
                                }}
                                style={{
                                  padding: '0.5rem 1rem',
                                  borderRadius: '20px',
                                  border: `1px solid ${cls.color}`,
                                  background: questTargetClasses.includes(cls.name) ? cls.color : 'var(--btn-bg)',
                                  color: questTargetClasses.includes(cls.name)  ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)',
                                  cursor: 'pointer',
                                  fontWeight: 'bold',
                                  fontSize: '0.9rem'
                                }}
                              >
                                {cls.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Lado Direito: Imagem e Configs */}
                      <div className="quest-edit-right" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Imagem de Capa (Opcional - Cole uma URL de imagem)</label>
                          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                            <input type="text" value={questCover} onChange={e => setQuestCover(e.target.value)} placeholder="URL ou Galeria ->" style={{ flex: 1, padding: '1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', minWidth: 0 }} />
                            <DirectUploadButton folder="quests" onUploadComplete={setQuestCover} buttonStyle={{ minHeight: '100%' }} />
                            <button onClick={() => setGalleryTarget('cover')} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', minHeight: '100%' }}>
                              <Search size={20} />
                            </button>
                          </div>
                          {questCover && (
                            <div style={{ width: '100%', height: '200px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <img src={questCover} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', marginBottom: '2rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input type="checkbox" id="questRetries" checked={questRetries} onChange={e => setQuestRetries(e.target.checked)} style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--accent-blue)' }} />
                            <label htmlFor="questRetries" style={{ color: 'white', cursor: 'pointer' }}>
                              <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Modo Vidas Extras (Retries)</strong>
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Se ativado, o aluno não falha na primeira resposta errada. Ele perde corações e pode continuar.</span>
                            </label>
                          </div>
                          {questRetries && (
                            <div style={{ marginLeft: '2.2rem' }}>
                              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Penalidade de XP por vida perdida</label>
                              <input type="number" value={questPenalty} onChange={e => setQuestPenalty(e.target.value)} placeholder="Ex: 50" style={{ width: '150px', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                            </div>
                          )}
                          <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)', margin: '0.5rem 0' }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input type="checkbox" id="questShuffleQ" checked={questShuffleQuestions} onChange={e => setQuestShuffleQuestions(e.target.checked)} style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--accent-blue)' }} />
                            <label htmlFor="questShuffleQ" style={{ color: 'white', cursor: 'pointer' }}>
                              <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Embaralhar Questões</strong>
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>A ordem das perguntas será aleatória para cada aluno.</span>
                            </label>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input type="checkbox" id="questShuffleA" checked={questShuffleAnswers} onChange={e => setQuestShuffleAnswers(e.target.checked)} style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--accent-blue)' }} />
                            <label htmlFor="questShuffleA" style={{ color: 'white', cursor: 'pointer' }}>
                              <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Embaralhar Respostas</strong>
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>A ordem das opções (A, B, C, D) será aleatória para cada aluno.</span>
                            </label>
                          </div>
                          <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)', margin: '0.5rem 0' }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input type="checkbox" id="questRandomSel" checked={questRandomSelection} onChange={e => setQuestRandomSelection(e.target.checked)} style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--accent-blue)' }} />
                            <label htmlFor="questRandomSel" style={{ color: 'white', cursor: 'pointer' }}>
                              <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Seleção Aleatória de Questões</strong>
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Cada aluno recebe um subconjunto aleatório das questões. Evita cola entre colegas.</span>
                            </label>
                          </div>
                          {questRandomSelection && (
                            <div style={{ marginLeft: '2.2rem', marginTop: '0.5rem' }}>
                              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                Número de questões por aluno (total: {questQuestions.length})
                              </label>
                              <input 
                                type="number" 
                                value={questRandomCount} 
                                onChange={e => setQuestRandomCount(Math.max(1, Math.min(questQuestions.length, parseInt(e.target.value) || 1)))} 
                                min={1} 
                                max={questQuestions.length}
                                placeholder="Ex: 10" 
                                style={{ width: '150px', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} 
                              />
                              <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                questões aleatórias de {questQuestions.length} disponíveis
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* Configurações avançadas do desafio (Monstro, Arena, Recompensas) */}
                    <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginTop: '2rem' }}>
                      <div style={{ flex: 1, minWidth: '250px' }}>
                        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Swords size={18} /> Monstro / Oponente
                        </h4>
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {questMonsterName ? `Monstro: ${questMonsterName}` : 'Nenhum monstro personalizado (padrão do jogo)'}
                          {' · '}{questMonsterDrops.length > 0 ? `${questMonsterDrops.length} drop(s) de derrota` : 'sem drops de derrota'}
                        </p>
                        <h4 style={{ margin: '0.5rem 0 0.25rem 0', fontSize: '1.05rem', color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <ImageIcon size={18} /> Arena
                        </h4>
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {questBattleBgUrl ? 'Fundo personalizado definido' : 'Fundo padrão do jogo'}
                        </p>
                        <h4 style={{ margin: '0.5rem 0 0.25rem 0', fontSize: '1.05rem', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Gift size={18} /> Recompensas
                        </h4>
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          Moedas em combate: {questCombatCoinMin}-{questCombatCoinMax} ({questCombatCoinMinValue}-{questCombatCoinMaxValue}/moeda)
                          {questChestConfig?.maxCoins ? ` · Baú final: até ${questChestConfig.maxCoins} moedas` : ' · Baú final: sem moedas'}
                          {questMode === 'live' ? ' · Baús do pódio (1º/2º/3º) configuráveis' : ''}
                        </p>
                      </div>
                      <button
                        className="login-btn"
                        onClick={() => setShowQuestConfig(true)}
                        style={{ padding: '0.75rem 1.5rem', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem', flexShrink: 0 }}
                      >
                        <Settings size={18} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} /> Configurações do Desafio
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Perguntas do Desafio</h3>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Deixe o texto e a imagem em branco se quiser ocultar uma opção (mínimo de 2 opções).</p>
                  </div>

                  {/* Card resumo + botão abrir editor */}
                  <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: 'var(--gold-primary)' }}>
                        {questQuestions.length} pergunta{questQuestions.length !== 1 ? 's' : ''} configurada{questQuestions.length !== 1 ? 's' : ''}
                      </h4>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Clique em "Editar Perguntas" para abrir o editor completo (lista à esquerda, edição à direita).
                      </p>
                    </div>
                    <button
                      className="login-btn"
                      onClick={() => setShowQuestQuestionsEditor(true)}
                      style={{ padding: '0.75rem 1.5rem', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem' }}
                    >
                      <Edit2 size={18} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} /> Editar Perguntas
                    </button>
                  </div>

                  <div className="quest-edit-footer" style={{ display: 'flex', gap: '1rem', marginTop: 'auto', flexShrink: 0, position: 'sticky', bottom: 0, zIndex: 10, background: 'var(--bg-card)', padding: '0.75rem 0', borderTop: '1px solid var(--border-glass)' }}>
                    <button className="login-btn" onClick={handleSaveQuest} style={{ flex: 1, padding: '1rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', fontWeight: 'bold', fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <Save size={20} /> Salvar Missão
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aba de Turmas */}
          {activeTab === 'general' && generalTab === 'classes' && canView('classes', 'view') && (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
              <div className="dashboard-header-sticky" style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '1rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Gerenciamento de Turmas</h2>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Crie turmas para agrupar os alunos e gerar Rankings exclusivos.</span>
                </div>
              
              <div className="glass-panel" style={{ padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Criar Nova Turma</label>
                    <input type="text" value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="Ex: 6º ano A" style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ flex: '1 1 150px' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Código da Turma</label>
                    <input type="text" value={newClassCode} onChange={e => setNewClassCode(e.target.value)} placeholder="Ex: EFUND06MA" style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ flex: '0 1 100px' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Cor</label>
                    <input type="color" value={newClassColor} onChange={e => setNewClassColor(e.target.value)} style={{ width: '100%', height: '36px', padding: '0', borderRadius: '8px', background: 'transparent', border: 'none', cursor: 'pointer' }} />
                  </div>
                  <button className="login-btn" onClick={handleAddClass} style={{ background: 'var(--accent-blue)', color: 'white', border: 'none', height: '36px', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Plus size={16} /> <span className="hide-text-mobile">Adicionar</span>
                  </button>
                </div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {schoolClasses.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>Nenhuma turma criada.</p>
                ) : (
                  schoolClasses.map(cls => (
                    <div key={cls.id} className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderLeft: `4px solid ${cls.color}` }}>
                      <h4 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <BookOpen size={20} color={cls.color} /> {cls.name}
                      </h4>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => { setEditingClassId(cls.id); setEditClassName(cls.name); setEditClassCode(cls.code || ''); setEditClassColor(cls.color); setIsClassModalOpen(true); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.5rem' }} title="Editar Turma">
                          <Edit2 size={20} />
                        </button>
                        <button onClick={() => handleRemoveClass(cls.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.5rem' }} title="Excluir Turma">
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Aba de Configurações */}
          {activeTab === 'general' && generalTab === 'config' && canView('config', 'view') && (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
              <div className="dashboard-header-sticky" style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Avaliação</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Ajuste pesos das notas e integrações externas.</p>
                </div>
                <button 
                  className="login-btn" 
                  onClick={() => { setEditingEvalId(null); setNewEvalName(''); setNewEvalWeight(''); setIsEvalModalOpen(true); }}
                  style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0.5rem 1rem' }}
                >
                  <Plus size={18} style={{ marginRight: '0.5rem' }} /> Adicionar
                </button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '1rem' }}>
                {evaluations.map(ev => (
                  <div key={ev.id} className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.02)' }}>
                    <div>
                      <h4 style={{ fontSize: '1.2rem', margin: '0 0 0.25rem 0' }}>{ev.name}</h4>
                      <p style={{ margin: 0, color: 'var(--gold-primary)', fontSize: '0.9rem' }}>Nota × {ev.weight} = XP Final</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => { handleEditEvaluation(ev); setIsEvalModalOpen(true); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.5rem' }} title="Editar">
                        <Edit2 size={20} />
                      </button>
                      <button onClick={() => handleRemoveEvaluation(ev.id)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.5rem' }} title="Excluir">
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aba Ranks */}
          {activeTab === 'general' && generalTab === 'ranks' && canView('ranks', 'view') && (
            <AdminRankManager pixabayKey={pixabayKey} />
          )}
          {/* Aba Loja */}
          {activeTab === 'store' && (
            <AdminStoreManager pixabayKey={pixabayKey} />
          )}

        </div>
      </div>

      {/* Modal de Editar Aluno */}
      {editingStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '560px', maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto', padding: '1.5rem', animation: 'slideUp 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', position: 'sticky', top: 0, background: 'inherit', padding: '0.25rem 0' }}>
              <h3 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--text-primary)' }}>Editar Usuário</h3>
              <button onClick={() => setEditingStudent(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome Completo</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome do Personagem</label>
              <input 
                type="text" 
                value={editCharacterName} 
                onChange={e => setEditCharacterName(e.target.value)} 
                maxLength={12}
                placeholder="Até 12 caracteres, sem acentos/espaços"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} 
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {editCharacterName.length}/12 caracteres
              </div>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Turma Oficial</label>
              <select value={editClass} onChange={e => setEditClass(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', marginBottom: '1rem' }}>
                <option value="">Sem Turma</option>
                {schoolClasses.map(cls => (
                  <option key={cls.id} value={cls.name}>{cls.name}</option>
                ))}
              </select>

              {userData?.role === 'admin' || isSuperAdmin ? (
                <>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Permissão no Sistema (Role)</label>
                  <select
                    value={editCustomRoleId ? `role_id:${editCustomRoleId}` : editRole}
                    onChange={e => {
                      const val = e.target.value;
                      if (val.startsWith('role_id:')) {
                        setEditCustomRoleId(val.slice('role_id:'.length));
                      } else {
                        setEditCustomRoleId('');
                        setEditRole(val);
                      }
                    }}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--accent-red)', color: 'white', fontFamily: 'inherit' }}
                  >
                    <optgroup label="Funções Padrão">
                      <option value="student">Aluno (Padrão)</option>
                      <option value="teacher">Professor</option>
                      <option value="coordinator">Coordenador</option>
                      <option value="admin">Administrador (Gerente)</option>
                    </optgroup>
                    {schoolRoles.filter(r => !['Administrador', 'Coordenador', 'Professor', 'Aluno'].includes(r.name)).length > 0 && (
                      <optgroup label="Funções de Hierarquia">
                        {schoolRoles
                          .filter(r => !['Administrador', 'Coordenador', 'Professor', 'Aluno'].includes(r.name))
                          .map(r => (
                            <option key={r.id} value={`role_id:${r.id}`}>{r.name}</option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                  {editCustomRoleId && (
                    <span style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Função de hierarquia selecionada: <strong style={{ color: 'var(--gold-primary)' }}>{schoolRoles.find(r => r.id === editCustomRoleId)?.name}</strong>. A base (role padrão) continua <strong>{editRole === 'student' ? 'Aluno' : editRole === 'teacher' ? 'Professor' : editRole === 'coordinator' ? 'Coordenador' : 'Administrador'}</strong>.
                    </span>
                  )}
                </>
              ) : null}
            </div>

            {isSuperAdmin && (
              <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Escolas de Acesso</label>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {editUserTenantIds.length === 0 && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>Nenhuma escola de acesso.</span>
                  )}
                  {editUserTenantIds.map(tid => {
                    const t = tenants.find(tt => tt.id === tid);
                    return (
                      <div key={tid} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: '20px', padding: '0.25rem 0.6rem 0.25rem 0.75rem', fontSize: '0.85rem' }}>
                        <span>{t?.name || tid}</span>
                        <button onClick={() => setEditUserTenantIds(prev => prev.filter(id => id !== tid))} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: 0, display: 'flex' }} title="Remover acesso">
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <select
                  value={editUserTenantAdd}
                  onChange={e => {
                    const val = e.target.value;
                    if (val) {
                      setEditUserTenantIds(prev => [...prev, val]);
                      setEditUserTenantAdd('');
                      if (!editUserPrimaryTenantId) setEditUserPrimaryTenantId(val);
                    }
                  }}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                >
                  <option value="">+ Adicionar acesso a uma escola...</option>
                  {tenants
                    .filter(t => !editUserTenantIds.includes(t.id))
                    .map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  O usuário poderá alternar entre as escolas pelo seletor no cabeçalho.
                </div>

                {editUserTenantIds.length > 0 && (
                  <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(139,92,246,0.08)', border: '1px dashed rgba(139,92,246,0.4)', borderRadius: '8px' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      Escola Padrão (é a escola inicial ao entrar no sistema)
                    </label>
                    <select
                      value={editUserPrimaryTenantId}
                      onChange={e => setEditUserPrimaryTenantId(e.target.value)}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    >
                      {editUserTenantIds.map(tid => {
                        const t = tenants.find(tt => tt.id === tid);
                        return (
                          <option key={tid} value={tid}>{t?.name || tid}</option>
                        );
                      })}
                    </select>
                  </div>
                )}
              </div>
            )}

            <button className="login-btn" onClick={handleSaveStudent} style={{ width: '100%', justifyContent: 'center', background: 'var(--accent-blue)', color: 'white', border: 'none' }}>
              Salvar Alterações
            </button>
          </div>
        </div>
      )}

      {/* Modal de Gerenciar XP e Histórico */}
      {selectedStudent && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="glass-panel xp-modal-content modal-content" style={{ maxWidth: '800px', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '2rem', position: 'relative' }}>
            <button className="xp-modal-close-top" onClick={() => setSelectedStudent(null)} style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', zIndex: 10 }}>
              <X size={24} />
            </button>
            
            {/* Lado Esquerdo: Formulário */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>Gerenciar XP</h3>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                 {selectedStudent.avatarConfig ? (
                   <div style={{ position: 'relative', width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-dark)', border: '2px solid var(--accent-blue)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                     <div style={{ position: 'absolute', width: 64, height: 64, bottom: -6, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
                       <AvatarCharacter config={selectedStudent.avatarConfig} equippedItems={selectedStudentItems} size={64} interactive={false} animation={selectedStudent.avatarConfig.animationState as any || 'idle'} />
                     </div>
                   </div>
                 ) : (
                   <img src={selectedStudent.photoURL} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
                 )}
                 <div>
                   <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{selectedStudent.name}</div>
                   <div style={{ fontSize: '0.9rem', color: 'var(--gold-primary)', marginTop: '0.2rem' }}>XP Atual: {selectedStudent.xp || 0}</div>
                 </div>
              </div>

              {/* Toggles Adicionar/Remover */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: '8px' }}>
                <button onClick={() => setModalMode('add')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: modalMode === 'add' ? 'rgba(255,255,255,0.1)' : 'transparent', color: modalMode === 'add'  ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontWeight: modalMode === 'add' ? 'bold' : 'normal' }}>
                  Dar XP
                </button>
                <button onClick={() => setModalMode('remove')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: modalMode === 'remove' ? 'rgba(239, 68, 68, 0.2)' : 'transparent', color: modalMode === 'remove' ? 'var(--accent-red)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontWeight: modalMode === 'remove' ? 'bold' : 'normal' }}>
                  Retirar XP
                </button>
              </div>

              {modalMode === 'add' ? (
                <>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Como atribuir o XP?</label>
                    <div style={{ display: 'flex', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.75rem 1rem', borderRadius: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: xpMode === 'grade' ? 'var(--gold-primary)' : 'var(--text-secondary)', fontWeight: xpMode === 'grade' ? 'bold' : 'normal' }}>
                        <input type="radio" name="xpMode" checked={xpMode === 'grade'} onChange={() => setXpMode('grade')} style={{ accentColor: 'var(--gold-primary)', width: '16px', height: '16px' }} />
                        Por Nota
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: xpMode === 'free' ? 'var(--gold-primary)' : 'var(--text-secondary)', fontWeight: xpMode === 'free' ? 'bold' : 'normal' }}>
                        <input type="radio" name="xpMode" checked={xpMode === 'free'} onChange={() => setXpMode('free')} style={{ accentColor: 'var(--gold-primary)', width: '16px', height: '16px' }} />
                        Valor Livre
                      </label>
                    </div>
                  </div>

                  {xpMode === 'grade' ? (
                    <>
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Tipo de Avaliação</label>
                        <select value={gradeType} onChange={e => setGradeType(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}>
                          {evaluations.map(ev => (
                            <option key={ev.id} value={ev.id}>{ev.name} (Peso x{ev.weight})</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ marginBottom: '2rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nota (0 a 10)</label>
                        <input type="number" step="0.1" min="0" max="10" value={grade} onChange={e => setGrade(e.target.value)} placeholder="Ex: 8.5" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '1.2rem' }} />
                        {grade && !isNaN(parseFloat(grade.replace(',', '.'))) && (
                          <div style={{ marginTop: '0.5rem', color: 'var(--gold-primary)', fontSize: '0.9rem', fontWeight: 600 }}>
                            Resultado: +{parseFloat(grade.replace(',', '.')) * (evaluations.find(e => e.id === gradeType)?.weight || 100)} XP
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Quantidade de XP</label>
                        <input type="number" step="1" min="1" value={freeXpAmount} onChange={e => setFreeXpAmount(e.target.value)} placeholder="Ex: 150" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '1.2rem' }} />
                      </div>
                      <div style={{ marginBottom: '2rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Justificativa (Opcional)</label>
                        <input type="text" value={freeXpReason} onChange={e => setFreeXpReason(e.target.value)} placeholder="Ex: Participação, tarefa extra, bônus..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                      </div>
                    </>
                  )}
                  <button className="login-btn" onClick={xpMode === 'grade' ? handleGiveGrade : handleGiveFreeXp} style={{ width: '100%', justifyContent: 'center', background: 'var(--gold-primary)', color: 'var(--bg-dark)', border: 'none' }}>
                    Confirmar e Dar XP
                  </button>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Quantidade de XP a Retirar</label>
                    <input type="number" value={removeAmount} onChange={e => setRemoveAmount(e.target.value)} placeholder="Ex: 50" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '1.2rem' }} />
                  </div>
                  <div style={{ marginBottom: '2rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Justificativa (Motivo)</label>
                    <input type="text" value={removeReason} onChange={e => setRemoveReason(e.target.value)} placeholder="Ex: Lançamento incorreto, punição, etc." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                  </div>
                  <button className="login-btn" onClick={handleRemoveXp} style={{ width: '100%', justifyContent: 'center', background: 'var(--accent-red)', color: 'white', border: 'none' }}>
                    Confirmar Remoção de XP
                  </button>
                </>
              )}
            </div>

            {/* Lado Direito: Histórico */}
            <div style={{ flex: 1, minWidth: '300px', borderLeft: '1px solid var(--border-glass)', paddingLeft: '2rem', display: 'flex', flexDirection: 'column', maxHeight: '550px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <History size={18} /> Histórico de XP
                </h3>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {loadingHistory ? (
                  <p style={{ color: 'var(--text-secondary)' }}>Carregando histórico...</p>
                ) : xpHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)', opacity: 0.6 }}>
                    Nenhum XP registrado ainda.
                  </div>
                ) : (
                  xpHistory.map((log) => (
                    <div key={log.logId} style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', borderLeft: `3px solid ${log.xpGained >= 0 ? 'var(--gold-primary)' : 'var(--accent-red)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {log.imageUrl && (
                            <img src={log.imageUrl} alt="Badge" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
                          )}
                          <div>
                            <strong style={{ fontSize: '0.95rem' }}>{log.evalName}</strong>
                            {log.justification && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                Motivo: {log.justification}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ color: log.xpGained >= 0 ? 'var(--gold-primary)' : 'var(--accent-red)', fontWeight: 'bold' }}>
                            {log.xpGained > 0 ? '+' : ''}{log.xpGained} XP
                          </span>
                          
                          {/* Botão de Apagar do Histórico (Admin/Professores) */}
                          <button 
                            onClick={() => handleDeleteHistoryLog(log.logId, log.xpGained)} 
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.2rem' }}
                            title="Apagar este registro"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        <span>{log.grade !== undefined ? `Nota base: ${log.grade}` : ''}</span>
                        <span>{log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleDateString('pt-BR') : 'Agora'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      )}      {/* Modal Apagar Aluno */}
      {deletingStudent && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="glass-panel modal-content" style={{ maxWidth: '450px', textAlign: 'center' }}>
            <Trash2 size={48} color="var(--accent-red)" style={{ margin: '0 auto 1.5rem auto' }} />
            <h3 style={{ fontSize: '1.5rem', margin: '0 0 1rem 0' }}>Excluir {deletingStudent.name}?</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: '1.5' }}>
              Atenção: Esta ação apagará permanentemente o XP, itens, moedas e histórico deste usuário. Essa ação <strong>não</strong> pode ser desfeita. Deseja continuar?
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setDeletingStudent(null)} style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleDeleteStudent} style={{ flex: 1, padding: '0.75rem', background: 'var(--accent-red)', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Bulk XP */}
      {isBulkXpModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="glass-panel modal-content" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Star size={24} /> XP em Massa
              </h3>
              <button onClick={() => setIsBulkXpModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Você está alterando o XP de <strong>{selectedStudentIds.length} alunos</strong> ao mesmo tempo.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: '8px' }}>
              <button onClick={() => setBulkXpAction('add')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: bulkXpAction === 'add' ? 'rgba(255,255,255,0.1)' : 'transparent', color: bulkXpAction === 'add'  ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontWeight: bulkXpAction === 'add' ? 'bold' : 'normal' }}>
                Adicionar XP
              </button>
              <button onClick={() => setBulkXpAction('remove')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: bulkXpAction === 'remove' ? 'rgba(239, 68, 68, 0.2)' : 'transparent', color: bulkXpAction === 'remove' ? 'var(--accent-red)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontWeight: bulkXpAction === 'remove' ? 'bold' : 'normal' }}>
                Retirar XP
              </button>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Quantidade de XP</label>
              <input type="number" value={bulkXpAmount} onChange={e => setBulkXpAmount(e.target.value)} placeholder="Ex: 500" style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '1.2rem' }} />
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Justificativa (Aparecerá no histórico de todos)</label>
              <input type="text" value={bulkXpReason} onChange={e => setBulkXpReason(e.target.value)} placeholder="Ex: Vitória no Desafio das Frações" style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
            </div>

            <button className="login-btn" onClick={handleBulkXp} style={{ width: '100%', justifyContent: 'center', background: bulkXpAction === 'add' ? 'var(--gold-primary)' : 'var(--accent-red)', color: bulkXpAction === 'add'  ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', border: 'none' }}>
              Confirmar para {selectedStudentIds.length} Alunos
            </button>
          </div>
        </div>
      )}

      {galleryTarget && (
        <ImageGalleryModal 
          onClose={() => setGalleryTarget(null)}
          onSelectImage={handleGallerySelect}
        />
      )}

      {showQuestionBank && (
        <QuestionBankModal
          isOpen={showQuestionBank}
          onClose={() => setShowQuestionBank(false)}
          onSelect={handleImportQuestionFromBank}
        />
      )}

      {showQuestQuestionsEditor && (
        <QuestQuestionsEditor
          isOpen={showQuestQuestionsEditor}
          onClose={() => setShowQuestQuestionsEditor(false)}
          questions={questQuestions}
          setQuestions={setQuestQuestions}
          onGalleryForQuestion={(qIndex) => setGalleryTarget(`question-${qIndex}`)}
          onGalleryForOption={(qIndex, optIndex) => setGalleryTarget(`option-${qIndex}-${optIndex}`)}
          onBankGalleryForQuestion={() => setGalleryTarget('bank-question')}
          onBankGalleryForOption={(optIndex) => setGalleryTarget(`bank-option-${optIndex}`)}
          bankGalleryResult={bankGalleryResult}
        />
      )}

      {showQuestConfig && (
        <QuestConfigModal
          isOpen={showQuestConfig}
          onClose={() => setShowQuestConfig(false)}
          questMonsterName={questMonsterName}
          setQuestMonsterName={setQuestMonsterName}
          questMonsterConfig={questMonsterConfig}
          setQuestMonsterConfig={setQuestMonsterConfig}
          questMonsterModelUrl={questMonsterModelUrl}
          setQuestMonsterModelUrl={setQuestMonsterModelUrl}
          questMonsterQuotes={questMonsterQuotes}
          setQuestMonsterQuotes={setQuestMonsterQuotes}
          questMonsterDefeatQuotes={questMonsterDefeatQuotes}
          setQuestMonsterDefeatQuotes={setQuestMonsterDefeatQuotes}
          questMonsterDrops={questMonsterDrops}
          setQuestMonsterDrops={setQuestMonsterDrops}
          availableMonsters={availableMonsters}
          available3DModels={available3DModels}
          availableStoreItems={availableStoreItems}
          onCustomizeMonster={() => setIsCustomizingMonster(true)}
          questBattleBgUrl={questBattleBgUrl}
          setQuestBattleBgUrl={setQuestBattleBgUrl}
          questBattleBgPosX={questBattleBgPosX}
          setQuestBattleBgPosX={setQuestBattleBgPosX}
          questBattleBgPosY={questBattleBgPosY}
          setQuestBattleBgPosY={setQuestBattleBgPosY}
          questBattleBgScale={questBattleBgScale}
          setQuestBattleBgScale={setQuestBattleBgScale}
          questBattleBgMoveEnabled={questBattleBgMoveEnabled}
          setQuestBattleBgMoveEnabled={setQuestBattleBgMoveEnabled}
          questBattleBgMoveDirection={questBattleBgMoveDirection}
          setQuestBattleBgMoveDirection={setQuestBattleBgMoveDirection}
          questBattleBgMoveSpeed={questBattleBgMoveSpeed}
          setQuestBattleBgMoveSpeed={setQuestBattleBgMoveSpeed}
          questBattleBgMoveDuration={questBattleBgMoveDuration}
          setQuestBattleBgMoveDuration={setQuestBattleBgMoveDuration}
          onGalleryArena={() => setGalleryTarget('arena')}
          onOpenArenaEditor={() => setShowArenaBgEditor(true)}
          questPodiumBgUrl={questPodiumBgUrl}
          setQuestPodiumBgUrl={setQuestPodiumBgUrl}
          onGalleryPodium={() => setGalleryTarget('podium')}
          questCombatCoinMin={questCombatCoinMin}
          setQuestCombatCoinMin={setQuestCombatCoinMin}
          questCombatCoinMax={questCombatCoinMax}
          setQuestCombatCoinMax={setQuestCombatCoinMax}
          questCombatCoinMinValue={questCombatCoinMinValue}
          setQuestCombatCoinMinValue={setQuestCombatCoinMinValue}
          questCombatCoinMaxValue={questCombatCoinMaxValue}
          setQuestCombatCoinMaxValue={setQuestCombatCoinMaxValue}
          questMode={questMode}
          questChestConfig={questChestConfig}
          setQuestChestConfig={setQuestChestConfig}
          questLiveChest1st={questLiveChest1st}
          setQuestLiveChest1st={setQuestLiveChest1st}
          questLiveChest2nd={questLiveChest2nd}
          setQuestLiveChest2nd={setQuestLiveChest2nd}
          questLiveChest3rd={questLiveChest3rd}
          setQuestLiveChest3rd={setQuestLiveChest3rd}
          availableChests={availableChests}
          renderChestConfig={renderChestConfig}
        />
      )}

      {showArenaBgEditor && questBattleBgUrl && (
        <ArenaBgEditor
          imageUrl={questBattleBgUrl}
          initialPosX={questBattleBgPosX}
          initialPosY={questBattleBgPosY}
          initialScale={questBattleBgScale}
          initialMoveEnabled={questBattleBgMoveEnabled}
          initialMoveDirection={questBattleBgMoveDirection}
          initialMoveSpeed={questBattleBgMoveSpeed}
          initialMoveDuration={questBattleBgMoveDuration}
          onSave={(posX, posY, scale, moveEnabled, moveDirection, moveSpeed, moveDuration) => {
            setQuestBattleBgPosX(posX);
            setQuestBattleBgPosY(posY);
            setQuestBattleBgScale(scale);
            setQuestBattleBgMoveEnabled(moveEnabled);
            setQuestBattleBgMoveDirection(moveDirection);
            setQuestBattleBgMoveSpeed(moveSpeed);
            setQuestBattleBgMoveDuration(moveDuration);
            setShowArenaBgEditor(false);
          }}
          onCancel={() => setShowArenaBgEditor(false)}
        />
      )}

      {isEvalModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="glass-panel modal-content" style={{ maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>{editingEvalId ? 'Editar Avaliação' : 'Nova Avaliação'}</h3>
              <button onClick={() => { setIsEvalModalOpen(false); setEditingEvalId(null); setNewEvalName(''); setNewEvalWeight(''); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome da Atividade</label>
              <input type="text" value={newEvalName} onChange={e => setNewEvalName(e.target.value)} placeholder="Ex: Tarefa de Casa" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Multiplicador (Peso)</label>
              <input type="number" value={newEvalWeight} onChange={e => setNewEvalWeight(e.target.value)} placeholder="Ex: 50" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
            </div>

            <button className="login-btn" onClick={() => { handleAddEvaluation(); setIsEvalModalOpen(false); }} style={{ width: '100%', justifyContent: 'center', background: 'var(--gold-primary)', color: 'var(--bg-dark)', border: 'none' }}>
              {editingEvalId ? 'Salvar Alterações' : 'Criar Avaliação'}
            </button>
          </div>
        </div>
      )}

      {/* Modal Histórico de Missão */}
      {isQuestHistoryModalOpen && selectedQuestForHistory && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="glass-panel modal-content modal-content-lg" style={{ maxWidth: '900px' }}>
            <div style={{ position: 'sticky', top: '-2rem', zIndex: 5, background: 'var(--bg-card)', padding: '1.5rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.8rem', margin: '0 0 0.5rem 0' }}>Histórico: {selectedQuestForHistory.title}</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Respostas e desempenho dos alunos</p>
              </div>
              <button onClick={() => setIsQuestHistoryModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            {loading ? (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando histórico...</p>
            ) : questHistoryAttempts.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Nenhum aluno tentou esta missão ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {(() => {
                  const groups = new Map<string, any[]>();
                  
                  questHistoryAttempts.forEach(attempt => {
                    const student = students.find(s => s.uid === attempt.studentId);
                    let classIdentifier = 'unassigned';
                    if (student?.classId && schoolClasses.some(c => c.name === student.classId)) {
                      classIdentifier = student.classId;
                    }
                    if (!groups.has(classIdentifier)) groups.set(classIdentifier, []);
                    groups.get(classIdentifier)!.push(attempt);
                  });

                  return [...schoolClasses.map(c => c.name), 'unassigned'].map(clsName => {
                    const attemptsInClass = groups.get(clsName) || [];
                    
                    if (attemptsInClass.length === 0) return null;

                    // Group attempts by student
                    const studentGroups = new Map<string, any[]>();
                    attemptsInClass.forEach(a => {
                      if (!studentGroups.has(a.studentId)) studentGroups.set(a.studentId, []);
                      studentGroups.get(a.studentId)!.push(a);
                    });

                    const clsInfo = schoolClasses.find(c => c.name === clsName) || { name: 'Sem Turma / Desconhecidos', color: '#94a3b8' };

                    return (
                      <div key={clsName} style={{ background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px', border: `1px solid ${clsInfo.color}` }}>
                        <h3 style={{ margin: '0 0 1rem 0', color: clsInfo.color, borderBottom: `1px solid ${clsInfo.color}`, paddingBottom: '0.5rem' }}>{clsInfo.name}</h3>
                        
                        <div style={{ display: 'grid', gap: '1rem' }}>
                          {Array.from(studentGroups.entries()).map(([studentId, attempts]) => {
                            const student = students.find(s => s.uid === studentId);
                            
                            // Sort attempts by timestamp
                            attempts.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
                            
                            const completions = attempts.filter(a => a.status === 'completed');
                            const defeats = attempts.filter(a => a.status === 'failed');
                            const firstCompletion = completions[0];
                            const lastAccess = attempts[attempts.length - 1];
                            const firstCompletionXp = firstCompletion ? (firstCompletion.earnedXp || 0) : 0;
                            
                            const firstCompletionDateStr = firstCompletion && firstCompletion.timestamp ? new Date(firstCompletion.timestamp.seconds * 1000).toLocaleString('pt-BR') : '-';
                            const lastAccessDateStr = lastAccess && lastAccess.timestamp ? new Date(lastAccess.timestamp.seconds * 1000).toLocaleString('pt-BR') : '-';
                            
                            return (
                              <div key={studentId} style={{ background: 'var(--btn-bg)', padding: '1rem', borderRadius: '8px', borderLeft: `4px solid ${completions.length > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                  <div style={{ flex: 1 }}>
                                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem' }}>{student?.name || 'Aluno Desconhecido (Deletado)'}</h4>
                                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                                      <span>Tentativas: <strong style={{ color: 'white' }}>{attempts.length}</strong></span>
                                      <span>Vitórias: <strong style={{ color: 'var(--accent-green)' }}>{completions.length}</strong></span>
                                      <span>Derrotas: <strong style={{ color: 'var(--accent-red)' }}>{defeats.length}</strong></span>
                                      <span>Último Acesso: <strong>{lastAccessDateStr}</strong></span>
                                      {completions.length > 0 && (
                                        <span>Primeira Vitória: <strong>{firstCompletionDateStr}</strong></span>
                                      )}
                                      <span>XP Ganho: <strong style={{ color: 'var(--gold-primary)' }}>{firstCompletionXp}</strong></span>
                                    </div>
                                  </div>
                                  <button onClick={() => handleResetQuestAttempt(studentId)} className="login-btn" style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', padding: '0.5rem 1rem', marginLeft: '1rem' }} title="Resetar histórico deste aluno">
                                    <RefreshCw size={16} style={{ marginRight: '0.5rem' }} /> Resetar
                                  </button>
                                </div>
                                
                                {lastAccess.answers && lastAccess.answers.length > 0 ? (
                                  <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '8px' }}>
                                    <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)' }}>Respostas da Última Tentativa:</h5>
                                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                      {lastAccess.answers.map((ans: any, i: number) => (
                                        <li key={i} style={{ color: ans.isCorrect ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                          Questão {ans.qIndex !== undefined ? (ans.qIndex + 1) : (i + 1)}: {ans.text || ans.optionText || '(Tempo Esgotado)'} {ans.isCorrect ? '✓' : '✗'}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : (
                                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Nenhum detalhe de respostas salvo para a última tentativa.</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </div>
      )}
      
      {isCustomizingMonster && (
        <AvatarCustomizationModal
          isOpen={true}
          onClose={() => setIsCustomizingMonster(false)}
          initialConfig={questMonsterConfig || undefined}
          customSaveMode={true}
          onSave={(newConfig) => {
             setQuestMonsterConfig(newConfig);
          }}
        />
      )}

      {isClassModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="glass-panel modal-content" style={{ maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>Editar Turma</h3>
              <button onClick={() => { setIsClassModalOpen(false); setEditingClassId(null); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome da Turma</label>
              <input type="text" value={editClassName} onChange={e => setEditClassName(e.target.value)} placeholder="Ex: 6o ano A" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Codigo da Turma</label>
              <input type="text" value={editClassCode} onChange={e => setEditClassCode(e.target.value)} placeholder="Ex: EFUND06MA" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Cor da Turma</label>
              <input type="color" value={editClassColor} onChange={e => setEditClassColor(e.target.value)} style={{ width: '100%', height: '45px', padding: '0', borderRadius: '8px', background: 'transparent', border: 'none', cursor: 'pointer' }} />
            </div>

            <button className="login-btn" onClick={handleEditClassSubmit} style={{ width: '100%', justifyContent: 'center', background: 'var(--accent-blue)', color: 'white', border: 'none' }}>
              Salvar Alterações
            </button>
          </div>
        </div>
      )}

      {viewingProfileUser && (() => {
        const rank = getRankForXp(viewingProfileUser.xp || 0);
        return (
          <PublicProfileModal 
            isOpen={true}
            user={viewingProfileUser} 
            onClose={() => setViewingProfileUser(null)} 
            equippedItems={allUserItems[viewingProfileUser.uid] || []}
            rankName={rank.name}
            rankColor={rank.color}
          />
        );
      })()}

      {/* Modal de Escolas */}
      {tenantModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="glass-panel modal-content" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <GraduationCap size={24} color="#8b5cf6" />
                {editingTenant ? 'Editar Escola' : 'Nova Escola'}
              </h3>
              <button onClick={() => setTenantModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Nome da Escola *</label>
              <input 
                type="text" 
                value={tenantForm.name} 
                onChange={e => setTenantForm({...tenantForm, name: e.target.value})} 
                placeholder="Ex: Escola Modelo" 
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} 
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Slug (URL) *</label>
              <input 
                type="text" 
                value={tenantForm.slug} 
                onChange={e => setTenantForm({...tenantForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')})} 
                placeholder="escola-modelo" 
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} 
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Apenas letras minúsculas, números e hífens
              </span>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Limite de Alunos</label>
              <input 
                type="number" 
                value={tenantForm.max_students} 
                onChange={e => setTenantForm({...tenantForm, max_students: parseInt(e.target.value) || 500})} 
                min="10"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} 
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Mínimo: 10 alunos
              </span>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Domínio de E-mail Permitido (Opcional)</label>
              <input 
                type="text" 
                value={tenantForm.allowed_email_domain} 
                onChange={e => setTenantForm({...tenantForm, allowed_email_domain: e.target.value.toLowerCase().replace(/^@/, '')})} 
                placeholder="ex: escola.edu.br (vazio = qualquer conta Google)" 
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} 
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Somente contas com esse domínio poderão se matricular nesta escola. Deixe vazio para aceitar qualquer conta (ex: Gmail).
              </span>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Status</label>
              <select 
                value={tenantForm.status} 
                onChange={e => setTenantForm({...tenantForm, status: e.target.value as 'active' | 'inactive' | 'suspended'})}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
              >
                <option value="active">Ativa</option>
                <option value="inactive">Inativa</option>
                <option value="suspended">Suspensa</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={() => setTenantModalOpen(false)} 
                style={{ flex: 1, padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveTenant} 
                style={{ flex: 1, padding: '0.75rem', background: '#8b5cf6', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {editingTenant ? 'Salvar' : 'Criar Escola'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criar Conta Local */}
      {showLocalAccountModal && (
        <div className="modal-overlay" style={{ zIndex: 200 }}>
          <div className="glass-panel modal-content" style={{ maxWidth: '520px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <KeyRound size={22} color="#8b5cf6" /> Criar Conta Local
              </h3>
              <button onClick={() => setShowLocalAccountModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            {localAccountCreated ? (
              <div>
                <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
                  <strong style={{ color: 'var(--accent-green)', display: 'block', marginBottom: '0.5rem' }}>Conta criada com sucesso!</strong>
                  <p style={{ margin: '0 0 0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Entregue estas credenciais ao aluno. Ele deverá trocar a senha no primeiro acesso.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.95rem' }}>
                    <div><strong style={{ color: 'var(--gold-primary)' }}>Usuário:</strong> {localAccountCreated.username}</div>
                    <div><strong style={{ color: 'var(--gold-primary)' }}>Senha:</strong> <span style={{ fontFamily: 'monospace', letterSpacing: '1px' }}>{localAccountCreated.password}</span>
                      <button onClick={() => navigator.clipboard?.writeText(localAccountCreated.password)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', marginLeft: '0.5rem', display: 'inline-flex', verticalAlign: 'middle' }} title="Copiar senha"><Copy size={14} /></button>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>E-mail de acesso: {localAccountCreated.auth_email}</div>
                  </div>
                </div>
                <button className="login-btn" onClick={() => setShowLocalAccountModal(false)} style={{ width: '100%', justifyContent: 'center', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }}>
                  Concluir
                </button>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome de Usuário (único) *</label>
                  <input
                    type="text"
                    value={localAccountForm.username}
                    onChange={e => setLocalAccountForm({ ...localAccountForm, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                    placeholder="ex: joao.silva"
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>E-mail (opcional)</label>
                    <input
                      type="text"
                      value={localAccountForm.email}
                      onChange={e => setLocalAccountForm({ ...localAccountForm, email: e.target.value })}
                      placeholder="ex: joao@gmail.com"
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Telefone (opcional)</label>
                    <input
                      type="text"
                      value={localAccountForm.phone}
                      onChange={e => setLocalAccountForm({ ...localAccountForm, phone: e.target.value })}
                      placeholder="ex: (11) 99999-0000"
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Turma (opcional)</label>
                  <select
                    value={localAccountForm.className}
                    onChange={e => setLocalAccountForm({ ...localAccountForm, className: e.target.value })}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                  >
                    <option value="">Sem Turma (definir depois)</option>
                    {schoolClasses.map(cls => (
                      <option key={cls.id} value={cls.name}>{cls.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '1rem', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '8px', padding: '0.85rem 1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Senha Gerada</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ flex: 1, fontFamily: 'monospace', letterSpacing: '2px', fontSize: '1.05rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>
                      {localAccountPassword || '—'}
                    </span>
                    <button onClick={() => setLocalAccountPassword(generatePassword())} style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)', color: 'var(--gold-primary)', borderRadius: '6px', padding: '0.35rem 0.6rem', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} title="Gerar nova senha">
                      <RefreshCcw size={14} /> Gerar
                    </button>
                    <button onClick={() => navigator.clipboard?.writeText(localAccountPassword)} style={{ background: 'transparent', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)', borderRadius: '6px', padding: '0.35rem 0.6rem', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} title="Copiar senha">
                      <Copy size={14} /> Copiar
                    </button>
                  </div>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    A senha gerada só é válida até o primeiro acesso, quando o aluno será obrigado a trocá-la.
                  </p>
                </div>

                {localAccountError && (
                  <div style={{ color: 'var(--accent-red)', fontSize: '0.85rem', background: 'rgba(239,68,68,0.1)', padding: '0.6rem 0.8rem', borderRadius: '8px', marginBottom: '1rem' }}>{localAccountError}</div>
                )}

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button onClick={() => setShowLocalAccountModal(false)} style={{ flex: 1, padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 'bold' }}>
                    Cancelar
                  </button>
                  <button onClick={handleCreateLocalAccount} disabled={localAccountLoading} style={{ flex: 1, padding: '0.75rem', background: '#8b5cf6', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                    {localAccountLoading ? <RefreshCcw size={16} className="animate-spin" /> : <KeyRound size={16} />} Criar Conta
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Gerenciar Contas Locais */}
      {showLocalAccountsList && (
        <div className="modal-overlay" style={{ zIndex: 210 }}>
          <div className="glass-panel modal-content" style={{ maxWidth: '620px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <KeyRound size={22} color="#60a5fa" /> Contas Locais
              </h3>
              <button onClick={() => setShowLocalAccountsList(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            {resetResult && (
              <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
                <strong style={{ color: 'var(--gold-primary)', display: 'block', marginBottom: '0.4rem' }}>Senha redefinida para {resetResult.username}</strong>
                <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  O aluno deverá trocá-la no próximo acesso.
                </p>
                <div style={{ fontFamily: 'monospace', letterSpacing: '2px', fontSize: '1.05rem', color: 'var(--gold-primary)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {resetResult.password}
                  <button onClick={() => navigator.clipboard?.writeText(resetResult.password)} style={{ background: 'transparent', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)', borderRadius: '6px', padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Copy size={14} /> Copiar
                  </button>
                </div>
              </div>
            )}

            {localAccountsError && (
              <div style={{ color: 'var(--accent-red)', fontSize: '0.85rem', background: 'rgba(239,68,68,0.1)', padding: '0.6rem 0.8rem', borderRadius: '8px', marginBottom: '1rem' }}>{localAccountsError}</div>
            )}

            <div style={{ maxHeight: '55vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {localAccountsLoading ? (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Carregando contas locais...</p>
              ) : localAccounts.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', padding: '2rem', textAlign: 'center' }}>
                  Nenhuma conta local cadastrada nesta escola.
                </p>
              ) : localAccounts.map(acc => (
                <div key={acc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.username}</strong>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block' }}>
                      {acc.email || 'sem e-mail'}
                      {acc.must_change_password && <span style={{ marginLeft: '0.4rem', color: 'var(--gold-primary)' }}>• aguardando 1º acesso</span>}
                    </span>
                  </div>
                  <button
                    onClick={() => handleResetLocalPassword(acc)}
                    disabled={resettingId === acc.id}
                    style={{ flexShrink: 0, padding: '0.4rem 0.8rem', background: 'rgba(251,191,36,0.15)', color: 'var(--gold-primary)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    title="Redefinir senha (o aluno precisará trocar no próximo acesso)"
                  >
                    {resettingId === acc.id ? <RefreshCcw size={14} className="animate-spin" /> : <RefreshCcw size={14} />} Redefinir Senha
                  </button>
                  <button
                    onClick={() => handleDeleteLocalAccount(acc)}
                    disabled={resettingId === acc.id}
                    style={{ flexShrink: 0, padding: '0.4rem 0.8rem', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    title="Excluir conta local"
                  >
                    <Trash2 size={14} /> Excluir
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
