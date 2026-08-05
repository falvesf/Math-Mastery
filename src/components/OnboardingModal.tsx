import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Loader2, GraduationCap, CheckCircle, UserCheck } from 'lucide-react';

interface ClassDef {
  id: string;
  name: string;
  color?: string;
}

interface OnboardingModalProps {
  userName: string;
  onSelectClass: (className: string) => void;
  onSelectTeacher: () => void;
}

export default function OnboardingModal({ userName, onSelectClass, onSelectTeacher }: OnboardingModalProps) {
  const [classes, setClasses] = useState<ClassDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassDef | null>(null);
  const [selectedRole, setSelectedRole] = useState<'student' | 'teacher' | null>(null);

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const snap = await getDocs(collection(db, 'classes'));
        const loaded: ClassDef[] = [];
        snap.forEach(d => loaded.push({ id: d.id, ...d.data() } as ClassDef));
        loaded.sort((a, b) => a.name.localeCompare(b.name));
        setClasses(loaded);
      } catch (err) {
        console.error('Erro ao buscar turmas', err);
      } finally {
        setLoading(false);
      }
    };
    fetchClasses();
  }, []);

  const handleConfirm = () => {
    if (selectedRole === 'teacher') {
      onSelectTeacher();
    } else if (selectedClass) {
      onSelectClass(selectedClass.name);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(10px)', padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', padding: '2rem', textAlign: 'center', gap: '1.5rem', animation: 'popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
        
        {!selectedRole && !selectedClass ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '1.5rem', borderRadius: '50%', color: 'var(--accent-blue)' }}>
                <GraduationCap size={48} />
              </div>
            </div>
            
            <h2 style={{ fontSize: '2rem', margin: 0, color: 'white' }}>Bem-vindo(a), {userName}!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Para começar, selecione a sua Série / Turma:</p>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <Loader2 className="animate-spin" size={32} color="var(--accent-blue)" />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                {classes.map(cls => (
                  <button
                    key={cls.id}
                    className="login-btn"
                    onClick={() => { setSelectedClass(cls); setSelectedRole('student'); }}
                    style={{ background: cls.color || 'var(--btn-bg)', color: cls.color  ? 'black'  : 'var(--text-primary)', fontWeight: 'bold' }}
                  >
                    {cls.name}
                  </button>
                ))}
              </div>
            )}

            <div style={{ margin: '2rem 0', borderBottom: '1px solid var(--border-glass)', position: 'relative' }}>
              <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-dark)', padding: '0 1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>OU</span>
            </div>

            <button 
              className="login-btn" 
              onClick={() => setSelectedRole('teacher')}
              style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--gold-primary)', border: '1px solid var(--gold-primary)', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
            >
              <UserCheck size={20} />
              Sou Professor / Coordenador
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '1.5rem', borderRadius: '50%', color: 'var(--accent-green)' }}>
                <CheckCircle size={48} />
              </div>
            </div>

            <h2 style={{ fontSize: '2rem', margin: 0, color: 'white' }}>Confirme sua escolha</h2>
            
            {selectedRole === 'teacher' ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', margin: '1rem 0' }}>
                Você está solicitando acesso como <strong>Professor / Coordenador</strong>.<br /><br />
                Sua conta passará por aprovação de um Administrador.
              </p>
            ) : (
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', margin: '1rem 0' }}>
                Seu nome é <strong>{userName}</strong> e você estuda na turma <strong style={{ color: selectedClass?.color || 'white' }}>{selectedClass?.name}</strong>?
              </p>
            )}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button 
                className="login-btn" 
                onClick={() => { setSelectedRole(null); setSelectedClass(null); }}
                style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border-glass)' }}
              >
                Voltar
              </button>
              <button 
                className="login-btn" 
                onClick={handleConfirm}
                style={{ flex: 2, background: 'var(--accent-green)', color: 'white', border: 'none', fontWeight: 'bold' }}
              >
                Sim, está correto
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
