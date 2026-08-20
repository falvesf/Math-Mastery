import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { GraduationCap, Loader2 } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  status: string;
}

interface SchoolSelectorModalProps {
  onSelect: (tenant: Tenant) => void;
}

export default function SchoolSelectorModal({ onSelect }: SchoolSelectorModalProps) {
  const [schools, setSchools] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSchools();
  }, []);

  const fetchSchools = async () => {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      setSchools(data || []);
    } catch (err) {
      console.error('Erro ao carregar escolas:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <div className="glass-panel" style={{ width: '500px', maxWidth: '90vw', padding: '2rem', textAlign: 'center', animation: 'slideUp 0.3s ease-out' }}>
        <GraduationCap size={48} color="var(--gold-primary)" style={{ marginBottom: '1rem' }} />
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', color: 'var(--text-primary)' }}>
          Selecione sua Escola
        </h2>
        <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Escolha a escola onde você estuda para continuar.
        </p>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Loader2 className="spin" size={32} color="var(--gold-primary)" />
          </div>
        ) : schools.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', padding: '2rem' }}>
            Nenhuma escola disponível no momento.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {schools.map(school => (
              <button
                key={school.id}
                onClick={() => onSelect(school)}
                style={{
                  padding: '1.5rem',
                  background: 'rgba(0,0,0,0.2)',
                  border: '2px solid var(--border-glass)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--gold-primary)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-glass)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {school.logo_url ? (
                  <img src={school.logo_url} alt={school.name} style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover' }} />
                ) : (
                  <GraduationCap size={48} color="var(--gold-primary)" />
                )}
                <span style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '1rem' }}>
                  {school.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
