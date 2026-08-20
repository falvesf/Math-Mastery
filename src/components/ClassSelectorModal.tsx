import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BookOpen, Loader2 } from 'lucide-react';

interface ClassDef {
  id: string;
  name: string;
  color?: string;
  tenant_id?: string;
}

interface ClassSelectorModalProps {
  tenantId: string;
  schoolName: string;
  onSelect: (classDef: ClassDef) => void;
  onBack: () => void;
}

export default function ClassSelectorModal({ tenantId, schoolName, onSelect, onBack }: ClassSelectorModalProps) {
  const [classes, setClasses] = useState<ClassDef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClasses();
  }, [tenantId]);

  const fetchClasses = async () => {
    try {
      // Buscar turmas da escola selecionada (e turmas sem tenant_id como fallback)
      let query = supabase.from('classes').select('*').order('name');
      
      if (tenantId) {
        query = query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setClasses(data || []);
    } catch (err) {
      console.error('Erro ao carregar turmas:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <div className="glass-panel" style={{ width: '500px', maxWidth: '90vw', padding: '2rem', textAlign: 'center', animation: 'slideUp 0.3s ease-out' }}>
        <BookOpen size={48} color="var(--gold-primary)" style={{ marginBottom: '1rem' }} />
        <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.5rem', color: 'var(--text-primary)' }}>
          Selecione sua Turma
        </h2>
        <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Escola: <strong style={{ color: 'var(--gold-primary)' }}>{schoolName}</strong>
        </p>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Loader2 className="spin" size={32} color="var(--gold-primary)" />
          </div>
        ) : classes.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', padding: '2rem' }}>
            Nenhuma turma disponível nesta escola.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
            {classes.map(cls => (
              <button
                key={cls.id}
                onClick={() => onSelect(cls)}
                style={{
                  padding: '1rem',
                  background: cls.color || 'rgba(0,0,0,0.2)',
                  border: '2px solid transparent',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--gold-primary)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <span style={{ fontWeight: 'bold', color: 'white', fontSize: '0.9rem', textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>
                  {cls.name}
                </span>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={onBack}
          style={{
            marginTop: '1.5rem',
            padding: '0.5rem 1.5rem',
            background: 'transparent',
            border: '1px solid var(--border-glass)',
            borderRadius: '8px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          ← Voltar para seleção de escola
        </button>
      </div>
    </div>
  );
}
