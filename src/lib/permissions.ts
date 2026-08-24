import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';

export interface PermAction {
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

export interface RoleDef {
  id: string;
  name: string;
  description?: string;
  tenant_id?: string | null;
  is_system?: boolean;
  permissions?: Record<string, PermAction>;
}

export interface AreaDef {
  key: string;
  label: string;
}

export const AREAS: AreaDef[] = [
  { key: 'quests', label: 'Central de Missões' },
  { key: 'profile', label: 'Personagem' },
  { key: 'ranking', label: 'Rankings' },
  { key: 'store', label: 'Mercado' },
  { key: 'inventory', label: 'Mochila' },
  { key: 'users', label: 'Alunos' },
  { key: 'quests_admin', label: 'Missões (Painel)' },
  { key: 'items', label: 'Itens da Loja' },
  { key: 'economy', label: 'Economia' },
  { key: 'classes', label: 'Turmas' },
  { key: 'approvals', label: 'Solicitações' },
  { key: 'config', label: 'Tipos de Avaliação' },
  { key: 'ranks', label: 'Patentes' },
  { key: 'entities', label: 'Entidades 3D' },
  { key: 'models', label: 'Moldes 3D' },
  { key: 'skins', label: 'Skins' },
  { key: 'debug3d', label: 'Debug 3D' },
  { key: 'pre_authorized', label: 'Pré-autorizados' },
  { key: 'tenants', label: 'Escolas' },
  { key: 'companion', label: 'Companheiro' },
  { key: 'themes', label: 'Temas' },
  { key: 'arena_debug', label: 'Arena Debug' },
];

const FULL = (): PermAction => ({ view: true, create: true, update: true, delete: true });
const VIEW_ONLY = (): PermAction => ({ view: true, create: false, update: false, delete: false });
const NONE = (): PermAction => ({ view: false, create: false, update: false, delete: false });

// Permissões padrão das funções de sistema
const STANDARD_ROLE_PERMS: Record<string, Record<string, PermAction>> = {
  admin: {
    quests: FULL(), profile: FULL(), ranking: FULL(), store: FULL(), inventory: FULL(),
    users: FULL(), quests_admin: FULL(), items: FULL(), economy: FULL(), classes: FULL(),
    approvals: FULL(), config: FULL(), ranks: FULL(), entities: FULL(), models: FULL(),
    skins: FULL(), debug3d: FULL(), pre_authorized: FULL(), tenants: FULL(), companion: FULL(),
    themes: FULL(), arena_debug: FULL(),
  },
  coordinator: {
    quests: FULL(), profile: FULL(), ranking: FULL(), store: FULL(), inventory: FULL(),
    users: FULL(), quests_admin: FULL(), items: FULL(), economy: FULL(), classes: FULL(),
    approvals: FULL(), config: FULL(), ranks: FULL(), entities: FULL(), models: FULL(),
    skins: FULL(), debug3d: FULL(), pre_authorized: FULL(), tenants: NONE(), companion: NONE(),
    themes: FULL(), arena_debug: VIEW_ONLY(),
  },
  teacher: {
    quests: FULL(), profile: FULL(), ranking: FULL(), store: FULL(), inventory: FULL(),
    users: VIEW_ONLY(), quests_admin: FULL(), items: FULL(), economy: NONE(), classes: VIEW_ONLY(),
    approvals: VIEW_ONLY(), config: NONE(), ranks: VIEW_ONLY(), entities: VIEW_ONLY(), models: VIEW_ONLY(),
    skins: VIEW_ONLY(), debug3d: NONE(), pre_authorized: VIEW_ONLY(), tenants: NONE(), companion: NONE(),
    themes: FULL(), arena_debug: NONE(),
  },
  student: {
    quests: VIEW_ONLY(), profile: FULL(), ranking: VIEW_ONLY(), store: VIEW_ONLY(), inventory: VIEW_ONLY(),
    users: NONE(), quests_admin: NONE(), items: NONE(), economy: NONE(), classes: NONE(),
    approvals: NONE(), config: NONE(), ranks: NONE(), entities: NONE(), models: NONE(),
    skins: NONE(), debug3d: NONE(), pre_authorized: NONE(), tenants: NONE(), companion: NONE(),
    themes: VIEW_ONLY(), arena_debug: NONE(),
  },
};

const STANDARD_ROLE_NAMES: Record<string, string> = {
  admin: 'Administrador',
  coordinator: 'Coordenador',
  teacher: 'Professor',
  student: 'Aluno',
};

const STANDARD_ROLE_NAMES_SET = new Set(['Administrador', 'Coordenador', 'Professor', 'Aluno']);

/** Rótulo do painel pela função base (quando não há função de hierarquia). */
export function baseRolePanelLabel(role?: string): string {
  switch (role) {
    case 'admin':
    case 'superadmin':
      return 'Master';
    case 'teacher':
      return 'Professor';
    case 'coordinator':
      return 'Coordenador';
    default:
      return 'Professor';
  }
}

/**
 * Nome da função que dá título ao painel: usa a função de hierarquia
 * delegada ao usuário (ex: Designer, Coordenador) se houver; senão, a base.
 */
export async function getPanelRoleName(uid: string, tenantId?: string | null, baseRole?: string): Promise<string> {
  try {
    const assigned = await fetchUserRoles(uid, tenantId);
    if (assigned.length > 0) {
      const roles = await fetchRoles(tenantId);
      const found = roles.find(r => assigned.includes(r.id) && !STANDARD_ROLE_NAMES_SET.has(r.name));
      if (found) return found.name;
    }
  } catch (e) {
    console.error('Erro ao carregar função do painel:', e);
  }
  return baseRolePanelLabel(baseRole);
}

/** Texto do botão/título do painel (ex: "Painel Master", "Painel do Designer"). */
export function panelLabel(roleName: string): string {
  return roleName === 'Master' ? 'Painel Master' : `Painel do ${roleName}`;
}

/**
 * Garante que as funções padrão existam para a escola (com permissões iniciais editáveis).
 */
export async function ensureStandardRoles(tenantId?: string | null): Promise<void> {
  try {
    for (const key of Object.keys(STANDARD_ROLE_PERMS)) {
      let q = supabase.from('roles').select('id').eq('name', STANDARD_ROLE_NAMES[key]).eq('is_system', true);
      q = tenantId ? q.eq('tenant_id', tenantId) : q.is('tenant_id', null);
      const { data } = await q.limit(1);
      if (data && data.length > 0) continue;

      const roleId = `role_${key}_${tenantId ? tenantId.replace(/-/g, '').substring(0, 8) : 'global'}`;
      const { error: roleErr } = await supabase.from('roles').upsert({
        id: roleId,
        name: STANDARD_ROLE_NAMES[key],
        description: `Função padrão: ${STANDARD_ROLE_NAMES[key]}`,
        tenant_id: tenantId || null,
        is_system: true
      });
      if (roleErr) { console.error('Erro ao criar role padrão:', roleErr); continue; }

      const perms = STANDARD_ROLE_PERMS[key];
      const rows = Object.keys(perms).map(area => ({
        id: `${roleId}_${area}`,
        role_id: roleId,
        area,
        can_view: perms[area].view,
        can_create: perms[area].create,
        can_update: perms[area].update,
        can_delete: perms[area].delete
      }));
      const { error: permErr } = await supabase.from('role_permissions').upsert(rows);
      if (permErr) console.error('Erro ao criar permissões padrão:', permErr);
    }
  } catch (e) {
    console.error('Erro em ensureStandardRoles:', e);
  }
}

export async function fetchRoles(tenantId?: string | null): Promise<RoleDef[]> {
  try {
    let q = supabase.from('roles').select('*');
    if (tenantId) {
      // Na escola, mostra apenas as funções da própria escola (sem as globais)
      q = q.eq('tenant_id', tenantId);
    } else {
      q = q.is('tenant_id', null);
    }
    const { data } = await q.order('name');
    if (!data) return [];
    const roles: RoleDef[] = [];
    for (const r of data as any[]) {
      const { data: permsData } = await supabase.from('role_permissions').select('*').eq('role_id', r.id);
      const permissions: Record<string, PermAction> = {};
      (permsData || []).forEach((p: any) => {
        permissions[p.area] = { view: p.can_view, create: p.can_create, update: p.can_update, delete: p.can_delete };
      });
      roles.push({
        id: r.id,
        name: r.name,
        description: r.description,
        tenant_id: r.tenant_id,
        is_system: r.is_system,
        permissions
      });
    }
    return roles;
  } catch (e) {
    console.error('Erro ao buscar roles:', e);
    return [];
  }
}

export async function saveRole(role: RoleDef, isSuperAdmin: boolean): Promise<boolean> {
  try {
    const { error: roleErr } = await supabase.from('roles').upsert({
      id: role.id,
      name: role.name,
      description: role.description || '',
      tenant_id: role.tenant_id || null,
      is_system: role.is_system || false
    });
    if (roleErr) { console.error('Erro ao salvar role:', roleErr); return false; }

    const perms = role.permissions || {};
    const rows = AREAS
      .filter(a => perms[a.key])
      .map(a => ({
        id: `${role.id}_${a.key}`,
        role_id: role.id,
        area: a.key,
        can_view: perms[a.key].view,
        can_create: perms[a.key].create,
        can_update: perms[a.key].update,
        can_delete: perms[a.key].delete
      }));
    const { error: delErr } = await supabase.from('role_permissions').delete().eq('role_id', role.id);
    if (delErr) { console.error('Erro ao limpar permissões:', delErr); }
    if (rows.length > 0) {
      const { error: permErr } = await supabase.from('role_permissions').insert(rows);
      if (permErr) { console.error('Erro ao salvar permissões:', permErr); return false; }
    }
    return true;
  } catch (e) {
    console.error('Erro em saveRole:', e);
    return false;
  }
}

export async function deleteRole(roleId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('roles').delete().eq('id', roleId);
    return !error;
  } catch (e) {
    console.error('Erro ao excluir role:', e);
    return false;
  }
}

export async function fetchUserRoles(userId: string, tenantId?: string | null): Promise<string[]> {
  try {
    let q = supabase.from('user_roles').select('role_id');
    if (tenantId) {
      q = q.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
    }
    const { data } = await q.eq('user_id', userId);
    return (data || []).map((r: any) => r.role_id);
  } catch (e) {
    console.error('Erro ao buscar roles do usuário:', e);
    return [];
  }
}

export async function assignRoleToUser(userId: string, roleId: string, tenantId?: string | null): Promise<boolean> {
  try {
    const { error } = await supabase.from('user_roles').upsert({
      id: `ur_${userId}_${roleId}_${tenantId || 'global'}`.replace(/-/g, ''),
      user_id: userId,
      role_id: roleId,
      tenant_id: tenantId || null
    }, { onConflict: 'user_id,role_id,tenant_id' });
    return !error;
  } catch (e) {
    console.error('Erro ao atribuir role:', e);
    return false;
  }
}

export async function removeRoleFromUser(userId: string, roleId: string, tenantId?: string | null): Promise<boolean> {
  try {
    let q = supabase.from('user_roles').delete().eq('user_id', userId).eq('role_id', roleId);
    q = tenantId ? q.eq('tenant_id', tenantId) : q.is('tenant_id', null);
    const { error } = await q;
    return !error;
  } catch (e) {
    console.error('Erro ao remover role:', e);
    return false;
  }
}

/**
 * Hook: permissões efetivas do usuário atual para a escola atual.
 */
export function usePermissions() {
  const { userData } = useAuth();
  const { tenantId, isSuperAdmin } = useTenant();
  const [perms, setPerms] = useState<Record<string, PermAction>>({});
  const [loading, setLoading] = useState(true);
  const [userRoleIds, setUserRoleIds] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!userData?.uid) { setPerms({}); setLoading(false); return; }
      if (isSuperAdmin) {
        // Superadmin tem acesso total
        const full: Record<string, PermAction> = {};
        AREAS.forEach(a => { full[a.key] = FULL(); });
        setPerms(full);
        setLoading(false);
        return;
      }
      try {
        // Garantir que as funções padrão existam para a escola
        await ensureStandardRoles(tenantId);

        const roleIds = await fetchUserRoles(userData.uid, tenantId);
        if (!active) return;
        setUserRoleIds(roleIds);

        // Fallback: se não há funções customizadas, usa a função base do usuário (compatibilidade)
        if (roleIds.length === 0) {
          const std = STANDARD_ROLE_PERMS[userData.role || ''];
          if (std) {
            const fallback: Record<string, PermAction> = {};
            AREAS.forEach(a => { fallback[a.key] = std[a.key] || NONE(); });
            setPerms(fallback);
          } else {
            setPerms({});
          }
          setLoading(false);
          return;
        }

        const merged: Record<string, PermAction> = {};
        AREAS.forEach(a => { merged[a.key] = NONE(); });
        for (const roleId of roleIds) {
          const { data } = await supabase.from('role_permissions').select('*').eq('role_id', roleId);
          (data || []).forEach((p: any) => {
            if (!merged[p.area]) merged[p.area] = NONE();
            merged[p.area].view = merged[p.area].view || p.can_view;
            merged[p.area].create = merged[p.area].create || p.can_create;
            merged[p.area].update = merged[p.area].update || p.can_update;
            merged[p.area].delete = merged[p.area].delete || p.can_delete;
          });
        }
        if (active) setPerms(merged);
      } catch (e) {
        console.error('Erro ao carregar permissões:', e);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [userData?.uid, tenantId, isSuperAdmin]);

  const can = useCallback((area: string, action: 'view' | 'create' | 'update' | 'delete' = 'view'): boolean => {
    if (isSuperAdmin) return true;
    return !!perms[area]?.[action];
  }, [perms, isSuperAdmin]);

  return { can, perms, loading, roleIds: userRoleIds };
}