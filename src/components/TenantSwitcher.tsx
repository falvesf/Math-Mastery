import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';

interface TenantSwitcherProps {
  variant?: 'dropdown' | 'menu';
}

export default function TenantSwitcher({ variant = 'dropdown' }: TenantSwitcherProps) {
  const { tenant, tenantId, tenants, userTenants, switchTenant, isSuperAdmin, refreshTenants } = useTenant();
  const [open, setOpen] = useState(false);
  const [btnRect, setBtnRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || popupRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Superadmin: se a lista de escolas ainda não carregou, tenta carregar
  useEffect(() => {
    if (isSuperAdmin && tenants.length === 0) {
      refreshTenants();
    }
  }, [isSuperAdmin, tenants.length, refreshTenants]);

  // Superadmin: todas as escolas. Demais usuários: só as que pertencem.
  const options = isSuperAdmin ? tenants : userTenants;
  const currentTenantId = tenantId || tenant?.id || null;
  const currentTenant = tenant || options.find(t => t.id === currentTenantId) || null;

  if (options.length <= 1) return null;

  if (variant === 'menu') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {isSuperAdmin ? 'Escolas' : 'Suas Escolas'}
        </div>
        {options.map(t => {
          const active = t.id === currentTenantId;
          return (
            <button
              key={t.id}
              onClick={() => { if (!active) switchTenant(t.id); }}
              disabled={active}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem', background: active ? 'rgba(251,191,36,0.12)' : 'transparent', border: 'none', borderRadius: '8px', cursor: active ? 'default' : 'pointer', color: active ? 'var(--gold-primary)' : 'var(--text-primary)', fontWeight: active ? 'bold' : 'normal', textAlign: 'left', fontFamily: 'inherit', fontSize: '0.9rem' }}
            >
              <Building2 size={16} color={active ? 'var(--gold-primary)' : 'var(--text-secondary)'} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              {active && <Check size={16} style={{ flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
    );
  }

  const openDropdown = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setBtnRect({ left: r.left, top: r.bottom + 6, width: r.width });
    setOpen(o => !o);
  };

  return (
    <div ref={ref} style={{ position: 'relative', zIndex: 99999 }}>
      <button
        onClick={openDropdown}
        className="login-btn"
        title="Trocar de escola"
        style={{ padding: '0.4rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', borderColor: 'var(--border-glass)', maxWidth: '240px' }}
      >
        <Building2 size={15} color="var(--gold-primary)" style={{ flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem', fontWeight: 'bold' }}>
          {currentTenant?.name || 'Escolas'}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && btnRect && createPortal(
        <div
          ref={popupRef}
          style={{ position: 'fixed', left: Math.max(8, btnRect.left), top: btnRect.top, minWidth: '240px', maxWidth: '320px', background: 'var(--bg-panel)', border: '1px solid var(--border-glass)', borderRadius: '12px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', padding: '0.4rem', zIndex: 99999 }}
        >
          <div style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {isSuperAdmin ? 'Escolas' : 'Suas Escolas'}
          </div>
          {options.map(t => {
            const active = t.id === currentTenantId;
            return (
              <button
                key={t.id}
                onClick={() => { setOpen(false); if (!active) switchTenant(t.id); }}
                disabled={active}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem', background: active ? 'rgba(251,191,36,0.12)' : 'transparent', border: 'none', borderRadius: '8px', cursor: active ? 'default' : 'pointer', color: active ? 'var(--gold-primary)' : 'var(--text-primary)', fontWeight: active ? 'bold' : 'normal', textAlign: 'left', fontFamily: 'inherit', fontSize: '0.9rem' }}
              >
                <Building2 size={16} color={active ? 'var(--gold-primary)' : 'var(--text-secondary)'} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                {active && <Check size={16} style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}