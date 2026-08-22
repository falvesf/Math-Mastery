import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { initRanks } from '../lib/ranks';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  theme?: Record<string, any>;
  config?: Record<string, any>;
  max_students?: number;
  status: 'active' | 'inactive' | 'suspended';
  admin_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface TenantContextType {
  tenant: Tenant | null;
  tenantId: string | null;
  tenants: Tenant[];
  userTenants: Tenant[];
  loading: boolean;
  isSuperAdmin: boolean;
  noTenants: boolean;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshTenants: () => Promise<void>;
  createTenant: (data: Partial<Tenant>) => Promise<Tenant | null>;
  updateTenant: (id: string, data: Partial<Tenant>) => Promise<boolean>;
  deleteTenant: (id: string) => Promise<boolean>;
}

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  tenantId: null,
  tenants: [],
  userTenants: [],
  loading: true,
  isSuperAdmin: false,
  noTenants: false,
  switchTenant: async () => {},
  refreshTenants: async () => {},
  createTenant: async () => null,
  updateTenant: async () => false,
  deleteTenant: async () => false,
});

export const useTenant = () => useContext(TenantContext);

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export const TenantProvider = ({ children }: { children: ReactNode }) => {
  const { currentUser, userData } = useAuth();
  // uid confiável: o User do supabase tem `id`, mas o código usava `uid`
  const uid = currentUser?.id || userData?.uid || undefined;
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [userTenants, setUserTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
// Inicializa o tenantId SINCRONAMENTE da URL (?tenant=) ou do cache (localStorage),
// como no projeto agendamentochromes. Assim, no primeiro render (inclusive após reload)
// a escola salva/visitada já está selecionada.
  const [tenantId, setTenantId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('tenant');
      if (t) return t;
      const saved =
        localStorage.getItem('superadmin_selected_tenant') ||
        (uid ? localStorage.getItem(`user_selected_tenant_${uid}`) : null);
      if (saved) return saved;
    }
    return null;
  });
  const [noTenants, setNoTenants] = useState(false);

  const isSuperAdmin = userData?.role === 'superadmin' || userData?.email === 'fabio.feitoza@eaportal.org';

  // Carregar tenant do usuário atual
  const loadUserTenant = useCallback(async () => {
    // 1) Deep-link: escola vinda da URL (?tenant=<id>)
    const urlTenant = new URLSearchParams(window.location.search).get('tenant');
    if (urlTenant) {
      try {
        history.replaceState(null, '', window.location.pathname);
      } catch (e) {
        console.warn('Não foi possível limpar a URL:', e);
      }
      const { data } = await supabase.from('tenants').select('*').eq('id', urlTenant).single();
      setTenant((data as Tenant) || { id: urlTenant, name: 'Escola', slug: '' });
      setNoTenants(false);
      setLoading(false);
      return;
    }

    // 2) tenantId já inicializado do cache (localStorage) no useState: garante o objeto
    if (tenantId) {
      if (!tenant) {
        const { data } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
        if (data) {
          setTenant(data as Tenant);
          setLoading(false);
          return;
        }
        // Escola salva não existe mais (foi excluída): limpar cache e resolver normalmente
        localStorage.removeItem('superadmin_selected_tenant');
        if (uid) localStorage.removeItem(`user_selected_tenant_${uid}`);
        setTenantId(null);
      } else {
        setLoading(false);
        return;
      }
    }

    // 3) Sem usuário autenticado: não há tenant a resolver (e não trava o loading)
    if (!currentUser || !uid) {
      setLoading(false);
      return;
    }

    // 4) Aguarda o userData carregar, a menos que seja superadmin por email
    const isSuperByEmail = currentUser?.email === 'fabio.feitoza@eaportal.org';
    if (!userData && !isSuperByEmail) {
      setLoading(true);
      return;
    }

    try {
      const isUserSuperAdmin =
        userData?.role === 'superadmin' ||
        userData?.email === 'fabio.feitoza@eaportal.org' ||
        currentUser?.email === 'fabio.feitoza@eaportal.org';

      if (isUserSuperAdmin) {
        // Escola ativa: lê de qualquer chave de cache (superadmin ou por usuário)
        const savedTenantId =
          localStorage.getItem('superadmin_selected_tenant') ||
          (uid ? localStorage.getItem(`user_selected_tenant_${uid}`) : null);
        if (savedTenantId) {
          const { data: tenantData } = await supabase.from('tenants').select('*').eq('id', savedTenantId).single();
          if (tenantData) {
            setTenant(tenantData as Tenant);
            setTenantId(savedTenantId);
            setNoTenants(false);
            setLoading(false);
            return;
          }
          // Escola salva não existe mais (foi excluída): limpar do cache
          localStorage.removeItem('superadmin_selected_tenant');
          if (uid) localStorage.removeItem(`user_selected_tenant_${uid}`);
        }

        // Cache vazio ou escola inexistente: primeira escola (e atualiza o cache)
        const { data: allTenants } = await supabase.from('tenants').select('*').order('name');
        if (allTenants && allTenants.length > 0) {
          const firstTenant = allTenants[0] as Tenant;
          setTenant(firstTenant);
          setTenantId(firstTenant.id);
          setNoTenants(false);
          localStorage.setItem('superadmin_selected_tenant', firstTenant.id);
          if (uid) localStorage.setItem(`user_selected_tenant_${uid}`, firstTenant.id);
          setLoading(false);
          return;
        }

        setTenant(null);
        setTenantId(null);
        setNoTenants(true);
        setLoading(false);
        return;
      }

      // Usuário comum: tenants do usuário
      const { data: tenantUserRows } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', uid);

      if (!tenantUserRows || tenantUserRows.length === 0) {
        console.warn('Usuário sem tenant, usando padrão');
        await assignDefaultTenant();
        return;
      }

      const tenantIds = tenantUserRows.map((r: any) => r.tenant_id);
      const { data: resolvedTenantsData } = await supabase.from('tenants').select('*').in('id', tenantIds);

      if (!resolvedTenantsData || resolvedTenantsData.length === 0) {
        await assignDefaultTenant();
        return;
      }

      const resolvedTenants = resolvedTenantsData as Tenant[];
      setUserTenants(resolvedTenants);

      // Preferência salva OU escola padrão do usuário (users.tenant_id) OU primeira
      const savedPref = localStorage.getItem(`user_selected_tenant_${uid}`);
      // Escola padrão definida pelo superadmin (users.tenant_id) tem prioridade
      // apenas quando o usuário ainda não escolheu manualmente (sem cache salvo).
      const primaryPref = userData?.tenantId && resolvedTenants.some(t => t.id === userData.tenantId) ? userData.tenantId : null;
      const chosenTenant = resolvedTenants.find(t => t.id === savedPref) || resolvedTenants.find(t => t.id === primaryPref) || resolvedTenants[0];
      setTenant(chosenTenant);
      setTenantId(chosenTenant.id);
    } catch (err) {
      console.error('Erro ao carregar tenant do usuário:', err);
      await assignDefaultTenant();
    } finally {
      setLoading(false);
    }
  }, [currentUser, userData?.role, userData?.email]);

  // Atribuir tenant ao usuário que não possui um (sem criar "tenant fantasma")
  const assignDefaultTenant = async () => {
    if (!currentUser || !uid) return;

    try {
      // 1) Se o usuário já tem tenant_id em users, usar esse
      if (userData?.tenantId) {
        const { data: userTenant } = await supabase.from('tenants').select('*').eq('id', userData.tenantId).single();
        if (userTenant) {
          setTenant(userTenant as Tenant);
          setTenantId(userData.tenantId);
          setUserTenants([userTenant as Tenant]);
          await supabase
            .from('tenant_users')
            .upsert({
              tenant_id: userData.tenantId,
              user_id: uid,
              role: userData?.role === 'admin' ? 'admin' :
                    userData?.role === 'teacher' ? 'teacher' :
                    userData?.role === 'coordinator' ? 'coordinator' : 'student'
            }, { onConflict: 'tenant_id,user_id' });
          return;
        }
      }

      // 2) Fallback: primeira escola real ativa (nunca criar tenant fantasma)
      const { data: realTenants } = await supabase.from('tenants').select('*').eq('status', 'active').order('name');
      const firstReal = (realTenants || []).find(t => t.id !== DEFAULT_TENANT_ID) as Tenant | undefined;
      if (firstReal) {
        setTenant(firstReal);
        setTenantId(firstReal.id);
        setUserTenants([firstReal]);
        // Grava no banco: users.tenant_id + tenant_users
        await supabase.from('users').update({ tenant_id: firstReal.id }).eq('id', uid);
        await supabase
          .from('tenant_users')
          .upsert({
            tenant_id: firstReal.id,
            user_id: uid,
            role: userData?.role === 'admin' ? 'admin' :
                  userData?.role === 'teacher' ? 'teacher' :
                  userData?.role === 'coordinator' ? 'coordinator' : 'student'
          }, { onConflict: 'tenant_id,user_id' });
        return;
      }

      // 3) Sem nenhuma escola real: não criar fantasma, apenas estado vazio
      setTenant(null);
      setTenantId(null);
      setUserTenants([]);
      setNoTenants(true);
    } catch (err) {
      console.error('Erro ao atribuir tenant:', err);
    }
  };

  // Carregar todos os tenants (superadmin)
  const loadAllTenants = useCallback(async () => {
    if (!isSuperAdmin) return;

    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('name');

      if (error) {
        console.error('Erro ao carregar tenants:', error);
        return;
      }

      setTenants((data || []) as Tenant[]);
      setNoTenants(!data || data.length === 0);
    } catch (err) {
      console.error('Erro ao carregar tenants:', err);
    }
  }, [isSuperAdmin]);

  // Trocar de tenant (superadmin ou usuário com múltiplas escolas)
  const switchTenant = useCallback(async (newTenantId: string) => {
    // Superadmin pode trocar para qualquer escola; demais só para as que pertencem
    const allowed = isSuperAdmin || userTenants.some(t => t.id === newTenantId);
    if (!allowed) {
      console.error('Acesso negado: usuário não pertence a esta escola.');
      return;
    }

    try {
      setLoading(true);

      // Persistir preferência (cache) — em ambas as chaves para ser robusto
      localStorage.setItem('superadmin_selected_tenant', newTenantId);
      if (uid) {
        localStorage.setItem(`user_selected_tenant_${uid}`, newTenantId);
      }

      // Carregar dados do novo tenant
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', newTenantId)
        .single();

      if (tenantError || !tenantData) {
        console.error('Erro ao carregar tenant:', tenantError);
        return;
      }

      // Seta o estado NO LUGAR: o contexto muda, e os efeitos de dados
      // que dependem do tenantId re-executam (padrão do agendamentochromes)
      setTenant(tenantData as Tenant);
      setTenantId(newTenantId);
    } catch (err) {
      console.error('Erro ao trocar de tenant:', err);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, userTenants, currentUser]);

  // Refresh tenants
  const refreshTenants = useCallback(async () => {
    await loadAllTenants();
  }, [loadAllTenants]);

  // Criar tenant
  const createTenant = useCallback(async (data: Partial<Tenant>): Promise<Tenant | null> => {
    if (!isSuperAdmin) {
      console.error('Apenas superadmin pode criar tenants');
      return null;
    }

    try {
      const { data: newTenant, error } = await supabase
        .from('tenants')
        .insert({
          name: data.name,
          slug: data.slug,
          logo_url: data.logo_url,
          theme: data.theme || {},
          config: data.config || {},
          max_students: data.max_students || 500,
          status: data.status || 'active',
          admin_id: data.admin_id,
        })
        .select()
        .single();

      if (error) {
        console.error('Erro ao criar tenant:', error);
        return null;
      }

      // Criar turmas padrão para a nova escola
      try {
        const defaultClasses = [
          '6º Ano A', '6º Ano B', '7º Ano A', '7º Ano B',
          '8º Ano A', '8º Ano B', '9º Ano A', '9º Ano B',
          '1ª Série EM', '2ª Série EM', '3ª Série EM'
        ];
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
        const now = Date.now();
        const classInserts = defaultClasses.map((name, idx) => ({
          id: `${now}_${idx}`,
          name,
          color: colors[idx % colors.length],
          tenant_id: newTenant.id
        }));
        await supabase.from('classes').insert(classInserts);
      } catch (e) {
        console.error('Erro ao criar turmas padrão da escola:', e);
      }

      // Criar economia padrão para a nova escola
      try {
        await supabase.from('system_collections').insert({
          collection_name: 'settings',
          doc_id: 'economy',
          tenant_id: newTenant.id,
          data: {
            currencyType: 'coins',
            coinsDropInCombat: false,
            coinsLostInCombat: false,
            coinsCanBuyItems: true,
            coinToXPRatio: 10,
            rankUpChestEnabled: false,
            rankUpChestItems: []
          }
        });
      } catch (e) {
        console.error('Erro ao criar economia padrão da escola:', e);
      }

      await refreshTenants();
      setNoTenants(false);
      setTenant(newTenant as Tenant);
      setTenantId(newTenant.id);
      localStorage.setItem('superadmin_selected_tenant', newTenant.id);
      return newTenant as Tenant;
    } catch (err) {
      console.error('Erro ao criar tenant:', err);
      return null;
    }
  }, [isSuperAdmin, refreshTenants]);

  // Atualizar tenant
  const updateTenant = useCallback(async (id: string, data: Partial<Tenant>): Promise<boolean> => {
    if (!isSuperAdmin) {
      console.error('Apenas superadmin pode atualizar tenants');
      return false;
    }

    try {
      const { error } = await supabase
        .from('tenants')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) {
        console.error('Erro ao atualizar tenant:', error);
        return false;
      }

      await refreshTenants();

      // Se atualizou o tenant atual, recarregar
      if (id === tenantId) {
        const { data: updatedTenant } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', id)
          .single();

        if (updatedTenant) {
          setTenant(updatedTenant as Tenant);
        }
      }

      return true;
    } catch (err) {
      console.error('Erro ao atualizar tenant:', err);
      return false;
    }
  }, [isSuperAdmin, refreshTenants, tenantId]);

  // Deletar tenant
  const deleteTenant = useCallback(async (id: string): Promise<boolean> => {
    if (!isSuperAdmin) {
      console.error('Apenas superadmin pode deletar tenants');
      return false;
    }

    // Não permitir deletar tenant padrão
    if (id === DEFAULT_TENANT_ID) {
      console.error('Não é possível deletar o tenant padrão');
      return false;
    }

    // Não permitir deletar tenant atual
    if (id === tenantId) {
      console.error('Não é possível deletar o tenant atual');
      return false;
    }

    try {
      const { error } = await supabase
        .from('tenants')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Erro ao deletar tenant:', error);
        return false;
      }

      await refreshTenants();
      return true;
    } catch (err) {
      console.error('Erro ao deletar tenant:', err);
      return false;
    }
  }, [isSuperAdmin, refreshTenants, tenantId]);

  // Carregar tenant ao montar
  useEffect(() => {
    loadUserTenant();
  }, [loadUserTenant]);

  // Carregar todos os tenants se for superadmin
  useEffect(() => {
    if (isSuperAdmin) {
      loadAllTenants();
    }
  }, [isSuperAdmin, loadAllTenants]);

  // Recarregar patentes quando o tenant mudar (patentes são por escola)
  useEffect(() => {
    if (tenantId) {
      initRanks(tenantId);
    }
  }, [tenantId]);

  return (
    <TenantContext.Provider value={{
      tenant,
      tenantId,
      tenants,
      userTenants,
      loading,
      isSuperAdmin,
      noTenants,
      switchTenant,
      refreshTenants,
      createTenant,
      updateTenant,
      deleteTenant,
    }}>
      {children}
    </TenantContext.Provider>
  );
};
