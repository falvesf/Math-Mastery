import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useDialog } from '../contexts/DialogContext';
import { UserCheck, X } from 'lucide-react';

interface PendingToast {
  id: string;
  userId: string;
  name: string;
  role: string;
  tenantId: string | null;
  tenantName: string;
  pendingClassName: string | null;
}

export default function PendingApprovalToasts({ isStaff }: { isStaff: boolean }) {
  const { tenantId } = useTenant();
  const { showToast } = useDialog();
  const [toasts, setToasts] = useState<PendingToast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    if (!isStaff) return;
    const channel = supabase
      .channel(`pending_approvals_${tenantId || 'all'}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'users',
        filter: tenantId ? `role=in.(pending_student,pending_teacher)and tenant_id=eq.${tenantId}` : 'role=in.(pending_student,pending_teacher)'
      }, async (payload) => {
        const row: any = payload.new;
        if (!row || !row.id) return;
        let tenantName = '';
        if (row.tenant_id) {
          try {
            const { data } = await supabase.from('tenants').select('name').eq('id', row.tenant_id).single();
            tenantName = data?.name || '';
          } catch { /* ignore */ }
        }
        setToasts(prev => {
          if (prev.some(t => t.userId === row.id)) return prev;
          return [...prev, {
            id: `${row.id}_${Date.now()}`,
            userId: row.id,
            name: row.name || 'Aluno',
            role: row.role || 'pending_student',
            tenantId: row.tenant_id || null,
            tenantName,
            pendingClassName: row.pending_class_name || null
          }];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isStaff, tenantId]);

  // Carregar pedidos que JÁ existiam (usuários aguardando aprovação antes de
  // o staff entrar na escola) — avisa na tela inicial sem precisar ir a "Solicitações".
  useEffect(() => {
    if (!isStaff) return;
    let cancelled = false;
    const loadExisting = async () => {
      try {
        let q = supabase
          .from('users')
          .select('id, name, role, tenant_id, pending_class_name')
          .in('role', ['pending_student', 'pending_teacher']);
        if (tenantId) q = q.eq('tenant_id', tenantId);
        else q = q.is('tenant_id', null);
        const { data } = await q;
        if (cancelled || !data || data.length === 0) return;

        // Resolver nomes das escolas de uma vez
        const tenantIds = [...new Set(data.map((r: any) => r.tenant_id).filter(Boolean))];
        const tenantNames: Record<string, string> = {};
        if (tenantIds.length > 0) {
          const { data: tData } = await supabase.from('tenants').select('id, name').in('id', tenantIds);
          (tData || []).forEach((t: any) => { tenantNames[t.id] = t.name; });
        }

        setToasts(prev => {
          const existingIds = new Set(prev.map(t => t.userId));
          const newOnes = data.map((row: any) => ({
            id: `${row.id}_existing_${Date.now()}`,
            userId: row.id,
            name: row.name || 'Aluno',
            role: row.role || 'pending_student',
            tenantId: row.tenant_id || null,
            tenantName: tenantNames[row.tenant_id] || '',
            pendingClassName: row.pending_class_name || null
          })).filter(t => !existingIds.has(t.userId));
          return [...prev, ...newOnes];
        });
      } catch (e) {
        console.error('Erro ao carregar solicitações pendentes:', e);
      }
    };
    loadExisting();
    return () => { cancelled = true; };
  }, [isStaff, tenantId]);

  const handleApprove = async (t: PendingToast) => {
    const targetTenantId = t.tenantId || tenantId;
    if (!targetTenantId) {
      showToast('Não foi possível determinar a escola do aluno.', 'error');
      removeToast(t.id);
      return;
    }
    let targetClassName = t.pendingClassName || '';
    if (!targetClassName) {
      try {
        const { data } = await supabase.from('classes').select('name').eq('tenant_id', targetTenantId).order('name').limit(1).maybeSingle();
        targetClassName = data?.name || 'Sem Turma';
      } catch { targetClassName = 'Sem Turma'; }
    }

    const { error: userErr } = await supabase.from('users').update({
      role: 'student',
      tenant_id: targetTenantId,
      class_id: targetClassName || 'Sem Turma',
      xp: 0,
      coins: 0,
      pending_class_name: null
    }).eq('id', t.userId);
    if (userErr) {
      console.error('Erro ao aprovar (toast):', userErr);
      showToast('Não foi possível aprovar.', 'error');
      removeToast(t.id);
      return;
    }

    await supabase.from('tenant_users').upsert({
      tenant_id: targetTenantId,
      user_id: t.userId,
      role: 'student'
    }, { onConflict: 'tenant_id,user_id' });

    try {
      await supabase.from('enrollment_requests')
        .update({ status: 'approved' })
        .eq('user_id', t.userId)
        .eq('status', 'pending');
    } catch { /* opcional */ }

    // Garantir pré-autorização
    try {
      const { data: existingPreAuth } = await supabase
        .from('pre_authorized_students')
        .select('id')
        .eq('tenant_id', targetTenantId)
        .eq('name', t.name)
        .limit(1);
      if (existingPreAuth && existingPreAuth.length > 0) {
        await supabase.from('pre_authorized_students').update({ rejected: false }).eq('id', existingPreAuth[0].id);
      } else {
        await supabase.from('pre_authorized_students').insert({
          tenant_id: targetTenantId,
          name: t.name,
          class_name: targetClassName || 'Sem Turma',
          imported_from: 'approval',
          rejected: false
        });
      }
    } catch (e) { console.error('Erro na pré-autorização (toast):', e); }

    showToast(`${t.name} aprovado(a)!`, 'success');
    removeToast(t.id);
  };

  const handleReject = async (t: PendingToast) => {
    await supabase.from('users').update({ role: 'student', tenant_id: null, class_id: null }).eq('id', t.userId);
    try { await supabase.from('users').update({ pending_class_name: null }).eq('id', t.userId); } catch { /* opcional */ }
    try { await supabase.from('enrollment_requests').delete().eq('user_id', t.userId); } catch { /* opcional */ }
    try {
      const rejectTenant = t.tenantId || tenantId;
      let q = supabase.from('pre_authorized_students').update({ rejected: true });
      q = rejectTenant ? q.eq('tenant_id', rejectTenant) : q.is('tenant_id', null);
      await q.eq('name', t.name);
    } catch { /* opcional */ }
    showToast(`${t.name} foi rejeitado.`, 'error');
    removeToast(t.id);
  };

  if (toasts.length === 0) return null;

  return (
    <div style={{ position: 'fixed', bottom: '1rem', right: '1rem', zIndex: 20000, display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '380px', maxHeight: 'calc(100dvh - 2rem)', overflowY: 'auto' }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background: 'var(--bg-panel)', border: '1px solid var(--gold-primary)', borderRadius: '12px', padding: '1rem', boxShadow: '0 8px 30px rgba(0,0,0,0.5)', animation: 'toast-in 0.35s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <UserCheck size={18} color="var(--gold-primary)" />
            <strong style={{ color: 'var(--text-primary)' }}>{t.name}</strong>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t.role === 'pending_teacher' ? '(Professor)' : '(Aluno)'}</span>
          </div>
          <p style={{ margin: '0 0 0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.4 }}>
            está solicitando acesso à escola <strong style={{ color: 'var(--text-primary)' }}>{t.tenantName || '(não definida)'}</strong>.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={() => handleApprove(t)} style={{ flex: 1, padding: '0.5rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>Aprovar</button>
            <button onClick={() => handleReject(t)} style={{ flex: 1, padding: '0.5rem', background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>Rejeitar</button>
            <button onClick={() => removeToast(t.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem' }} title="Fechar"><X size={16} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}