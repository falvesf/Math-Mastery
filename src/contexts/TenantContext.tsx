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
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [noTenants, setNoTenants] = useState(false);

  const isSuperAdmin = userData?.role === 'superadmin' || userData?.email === 'fabio.feitoza@eaportal.org';

  // Carregar tenant do usuário atual
  const loadUserTenant = useCallback(async () => {
    if (!currentUser || !currentUser.uid) {
      setTenant(null);
      setTenantId(null);
      setLoading(false);
      return;
    }

    try {
      // Para superadmin, resolver a escola visitada:
      // 1º localStorage (última escola), 2º banco (primeira escola), 3º modal de criação
      const isUserSuperAdmin = userData?.role === 'superadmin' || userData?.email === 'fabio.feitoza@eaportal.org';
      if (isUserSuperAdmin) {
        const savedTenantId = localStorage.getItem('superadmin_selected_tenant');
        if (savedTenantId) {
          // Carregar dados do tenant salvo
          const { data: tenantData, error: tenantError } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', savedTenantId)
            .single();

          if (!tenantError && tenantData) {
            setTenant(tenantData as Tenant);
            setTenantId(savedTenantId);
            setNoTenants(false);
            setLoading(false);
            return;
          }
        }

        // localStorage vazio ou escola inexistente: buscar no banco
        const { data: allTenants, error: allTenantsError } = await supabase
          .from('tenants')
          .select('*')
          .order('name');

        if (allTenantsError) {
          console.error('Erro ao buscar escolas:', allTenantsError);
          setLoading(false);
          return;
        }

        if (!allTenants || allTenants.length === 0) {
          // Nenhuma escola cadastrada: sinalizar para abrir o modal de criação
          setTenant(null);
          setTenantId(null);
          setNoTenants(true);
          setLoading(false);
          return;
        }

        // Usar a primeira escola cadastrada e salvar como "última visitada"
        const firstTenant = allTenants[0] as Tenant;
        setTenant(firstTenant);
        setTenantId(firstTenant.id);
        setNoTenants(false);
        localStorage.setItem('superadmin_selected_tenant', firstTenant.id);
        setLoading(false);
        return;
      }

      // Buscar tenant do usuário
      const { data: tenantUserData, error: tenantUserError } = await supabase
        .from('tenant_users')
        .select('tenant_id, role')
        .eq('user_id', currentUser.uid)
        .limit(1)
        .maybeSingle();

      if (tenantUserError || !tenantUserData) {
        // Usuário sem tenant - usar padrão
        console.warn('Usuário sem tenant, usando padrão');
        await assignDefaultTenant();
        return;
      }

      const currentTenantId = tenantUserData.tenant_id;
      setTenantId(currentTenantId);

      // Carregar dados do tenant (sem RPC - RLS desabilitado)
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', currentTenantId)
        .single();

      if (tenantError || !tenantData) {
        console.error('Erro ao carregar tenant:', tenantError);
        await assignDefaultTenant();
        return;
      }

      setTenant(tenantData as Tenant);
    } catch (err) {
      console.error('Erro ao carregar tenant do usuário:', err);
      await assignDefaultTenant();
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  // Atribuir tenant padrão ao usuário
  const assignDefaultTenant = async () => {
    if (!currentUser || !currentUser.uid) return;

    try {
      // Verificar se tenant padrão existe
      const { data: defaultTenant, error: fetchError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', DEFAULT_TENANT_ID)
        .single();

      if (fetchError || !defaultTenant) {
        // Criar tenant padrão se não existir
        const { data: newTenant, error: createError } = await supabase
          .from('tenants')
          .insert({
            id: DEFAULT_TENANT_ID,
            name: 'Escola Padrão',
            slug: 'escola-padrao',
            status: 'active',
            config: { isDefault: true }
          })
          .select()
          .single();

        if (createError) {
          console.error('Erro ao criar tenant padrão:', createError);
          return;
        }

        setTenant(newTenant as Tenant);
      } else {
        setTenant(defaultTenant as Tenant);
      }

      setTenantId(DEFAULT_TENANT_ID);

      // Criar relação tenant_users
      await supabase
        .from('tenant_users')
        .upsert({
          tenant_id: DEFAULT_TENANT_ID,
          user_id: currentUser.uid,
          role: userData?.role === 'admin' ? 'admin' : 
                userData?.role === 'teacher' ? 'teacher' : 'student'
        }, { onConflict: 'tenant_id,user_id' });

    } catch (err) {
      console.error('Erro ao atribuir tenant padrão:', err);
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

  // Trocar de tenant (superadmin)
  const switchTenant = useCallback(async (newTenantId: string) => {
    if (!isSuperAdmin) {
      console.error('Apenas superadmin pode trocar de tenant');
      return;
    }

    try {
      setLoading(true);

      // Salvar preferência no localStorage para superadmin
      localStorage.setItem('superadmin_selected_tenant', newTenantId);

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

      setTenant(tenantData as Tenant);
      setTenantId(newTenantId);

      // Recarregar página para atualizar todos os dados
      window.location.reload();
    } catch (err) {
      console.error('Erro ao trocar de tenant:', err);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

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
