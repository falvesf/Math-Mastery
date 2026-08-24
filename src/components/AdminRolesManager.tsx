import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useDialog } from '../contexts/DialogContext';
import { Plus, Edit2, Trash2, ShieldCheck, Globe, Building2, Save, X, UserCheck } from 'lucide-react';
import { AREAS, ensureStandardRoles, fetchRoles, saveRole, deleteRole, fetchUserRoles, assignRoleToUser, removeRoleFromUser, type RoleDef, type PermAction } from '../lib/permissions';

const ACTIONS: { key: keyof PermAction; label: string }[] = [
  { key: 'view', label: 'Ver' },
  { key: 'create', label: 'Criar' },
  { key: 'update', label: 'Editar' },
  { key: 'delete', label: 'Excluir' },
];

export default function AdminRolesManager() {
  const { tenantId, isSuperAdmin } = useTenant();
  const { showAlert, showConfirm } = useDialog();
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showEdit, setShowEdit] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDef | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [matrix, setMatrix] = useState<Record<string, PermAction>>({});

  const [selectedUser, setSelectedUser] = useState('');
  const [userRolesMap, setUserRolesMap] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      await ensureStandardRoles(tenantId);
      const r = await fetchRoles(tenantId);
      setRoles(r);
      let uq = supabase.from('users').select('id, name, role, tenant_id');
      if (tenantId) {
        uq = uq.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
      }
      const { data } = await uq;
      setUsers((data || []).filter((u: any) => u.role !== 'superadmin'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tenantId]);

  const openNew = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDesc('');
    const m: Record<string, PermAction> = {};
    AREAS.forEach(a => { m[a.key] = { view: false, create: false, update: false, delete: false }; });
    setMatrix(m);
    setShowEdit(true);
  };

  const openEdit = (role: RoleDef) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDesc(role.description || '');
    const m: Record<string, PermAction> = {};
    AREAS.forEach(a => { m[a.key] = role.permissions?.[a.key] || { view: false, create: false, update: false, delete: false }; });
    setMatrix(m);
    setShowEdit(true);
  };

  const handleSave = async () => {
    if (!roleName.trim()) { showAlert('Erro', 'Informe o nome da função.'); return; }
    const id = editingRole?.id || `role_custom_${Date.now()}`;
    const ok = await saveRole({
      id,
      name: roleName.trim(),
      description: roleDesc,
      tenant_id: tenantId || null,
      is_system: editingRole?.is_system || false,
      permissions: matrix
    }, isSuperAdmin);
    if (ok) {
      showAlert('Sucesso', `Função "${roleName.trim()}" salva!`);
      setShowEdit(false);
      load();
    } else {
      showAlert('Erro', 'Não foi possível salvar a função. Verifique se a migration_rbac.sql foi executada.');
    }
  };

  const handleDelete = async (role: RoleDef) => {
    if (role.is_system) { showAlert('Erro', 'Funções padrão não podem ser excluídas.'); return; }
    const ok = await showConfirm('Excluir função?', `Excluir "${role.name}"? Os usuários vinculados perderão essas permissões.`);
    if (!ok) return;
    await deleteRole(role.id);
    load();
  };

  const handleSelectUser = async (userId: string) => {
    setSelectedUser(userId);
    if (!userId) { setUserRolesMap({}); return; }
    const assigned = await fetchUserRoles(userId, tenantId);
    const map: Record<string, boolean> = {};
    roles.forEach(r => { map[r.id] = assigned.includes(r.id); });
    setUserRolesMap(map);
  };

  const handleToggleAssignment = async (roleId: string, checked: boolean) => {
    if (!selectedUser) return;
    const ok = checked
      ? await assignRoleToUser(selectedUser, roleId, tenantId)
      : await removeRoleFromUser(selectedUser, roleId, tenantId);
    if (ok) {
      setUserRolesMap(prev => ({ ...prev, [roleId]: checked }));
    } else {
      showAlert('Erro', 'Não foi possível atualizar a atribuição.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={20} color="var(--gold-primary)" /> Hierarquias e Permissões
          </h3>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Crie funções, defina permissões por área e atribua aos usuários.
          </p>
        </div>
        <button onClick={openNew} className="login-btn" style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000)', border: 'none', fontWeight: 'bold' }}>
          <Plus size={16} /> Nova Função
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Carregando...</p>
      ) : (
        <>
          {/* Lista de funções */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
            {roles.map(role => (
              <div key={role.id} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  {role.tenant_id ? <Building2 size={16} color="#10b981" /> : <Globe size={16} color="var(--text-secondary)" />}
                  <strong style={{ color: 'var(--text-primary)' }}>{role.name}</strong>
                  {role.is_system && <span style={{ fontSize: '0.65rem', background: 'rgba(139,92,246,0.2)', color: '#a78bfa', padding: '0.1rem 0.4rem', borderRadius: '8px' }}>Padrão</span>}
                </div>
                {role.description && <p style={{ margin: '0 0 0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{role.description}</p>}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => openEdit(role)} style={{ padding: '0.35rem 0.6rem', background: 'rgba(59,130,246,0.2)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}><Edit2 size={13} /> Editar</button>
                  {!role.is_system && (
                    <button onClick={() => handleDelete(role)} style={{ padding: '0.35rem 0.6rem', background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}><Trash2 size={13} /> Excluir</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Atribuição de funções a usuários */}
          <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '1rem' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
              <UserCheck size={18} color="var(--gold-primary)" /> Atribuir Funções a Usuários
            </h4>
            <select
              value={selectedUser}
              onChange={e => handleSelectUser(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', marginBottom: '0.75rem' }}
            >
              <option value="">Selecione um usuário...</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
            {selectedUser && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {roles.map(role => {
                  const checked = !!userRolesMap[role.id];
                  return (
                    <label key={role.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      <input type="checkbox" checked={checked} onChange={e => handleToggleAssignment(role.id, e.target.checked)} style={{ accentColor: 'var(--gold-primary)', width: '18px', height: '18px' }} />
                      {role.name}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal de edição da função */}
      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div className="glass-panel" style={{ width: '780px', maxWidth: '95vw', maxHeight: '90vh', padding: '1.5rem', display: 'flex', flexDirection: 'column', background: 'var(--bg-dark)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>{editingRole ? `Editar: ${editingRole.name}` : 'Nova Função'}</h3>
              <button onClick={() => setShowEdit(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}><X size={22} /></button>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Nome da Função</label>
                <input type="text" value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Ex: Designer de Projeto" style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
              </div>
              <div style={{ flex: 2, minWidth: '250px' }}>
                <label style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Descrição</label>
                <input type="text" value={roleDesc} onChange={e => setRoleDesc(e.target.value)} placeholder="O que esta função pode fazer?" style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <th style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Área</th>
                    {ACTIONS.map(a => (
                      <th key={a.key} style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{a.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AREAS.map(area => (
                    <tr key={area.key} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-primary)' }}>{area.label}</td>
                      {ACTIONS.map(a => {
                        const cur = matrix[area.key]?.[a.key] || false;
                        return (
                          <td key={a.key} style={{ padding: '0.4rem', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={cur}
                              onChange={e => setMatrix(prev => ({
                                ...prev,
                                [area.key]: { ...(prev[area.key] || { view: false, create: false, update: false, delete: false }), [a.key]: e.target.checked }
                              }))}
                              style={{ accentColor: 'var(--gold-primary)', width: '18px', height: '18px' }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button onClick={() => setShowEdit(false)} style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSave} style={{ flex: 1, padding: '0.6rem', background: 'var(--gold-primary)', border: 'none', borderRadius: '8px', color: 'var(--text-on-gold, #000)', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}><Save size={16} /> Salvar Função</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}