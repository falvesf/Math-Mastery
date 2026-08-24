import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useDialog } from '../contexts/DialogContext';
import { Plus, Trash2, Upload, Loader2, Search, Users, Check, Clock, X } from 'lucide-react';
import ImportStudentsModal from './ImportStudentsModal';
import { normalizeForComparison } from '../lib/nameValidation';

interface PreAuthorizedStudent {
  id: string;
  tenant_id: string;
  name: string;
  class_name: string;
  grade?: string;
  imported_from?: string;
  created_at?: string;
  rejected?: boolean;
}

interface ClassDef {
  id: string;
  name: string;
  color?: string;
}

export default function PreAuthorizedStudentsManager() {
  const { tenantId } = useTenant();
  const { showAlert, showConfirm } = useDialog();
  const [students, setStudents] = useState<PreAuthorizedStudent[]>([]);
  const [classes, setClasses] = useState<ClassDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('all');
  const [authorizedNames, setAuthorizedNames] = useState<Set<string>>(new Set());

  // Form states for manual add
  const [newName, setNewName] = useState('');
  const [newClassName, setNewClassName] = useState('');

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch pre-authorized students
      let studentsQuery = supabase.from('pre_authorized_students').select('*');
      if (tenantId) {
        studentsQuery = studentsQuery.eq('tenant_id', tenantId);
      } else {
        studentsQuery = studentsQuery.is('tenant_id', null);
      }
      const { data: studentsData, error: studentsError } = await studentsQuery.order('name');

      if (studentsError) throw studentsError;
      setStudents(studentsData || []);

      // Buscar alunos já cadastrados no sistema (autorizados) para a escola
      let usersQuery = supabase.from('users').select('name, tenant_id');
      if (tenantId) {
        usersQuery = usersQuery.eq('tenant_id', tenantId);
      } else {
        usersQuery = usersQuery.is('tenant_id', null);
      }
      const { data: usersData } = await usersQuery;
      const names = new Set<string>();
      (usersData || []).forEach((u: any) => {
        if (u.name) names.add(normalizeForComparison(u.name));
      });
      setAuthorizedNames(names);

      // Fetch classes for this tenant
      let classesQuery = supabase.from('classes').select('*');
      if (tenantId) {
        classesQuery = classesQuery.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
      } else {
        classesQuery = classesQuery.is('tenant_id', null);
      }
      const { data: classesData, error: classesError } = await classesQuery.order('name');

      if (classesError) throw classesError;
      setClasses(classesData || []);
    } catch (err: any) {
      console.error('Erro ao carregar dados:', err);
      setStudents([]);
      setClasses([]);
      showAlert('Erro', 'Não foi possível carregar os dados. ' + (err?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async () => {
    if (!newName.trim() || !newClassName.trim()) {
      showAlert('Erro', 'Preencha o nome e a turma do aluno.');
      return;
    }

    try {
      const { error } = await supabase.from('pre_authorized_students').insert({
        tenant_id: tenantId,
        name: newName.trim(),
        class_name: newClassName.trim(),
        imported_from: 'manual'
      });

      if (error) throw error;

      showAlert('Sucesso', `Aluno "${newName}" adicionado com sucesso!`);
      setNewName('');
      setNewClassName('');
      setShowAddModal(false);
      fetchData();
    } catch (err) {
      console.error('Erro ao adicionar aluno:', err);
      showAlert('Erro', 'Não foi possível adicionar o aluno.');
    }
  };

  const handleDeleteStudent = async (id: string, name: string) => {
    const confirmed = await showConfirm('Excluir Aluno', `Deseja excluir "${name}" da lista de pré-autorizados?`);
    if (!confirmed) return;

    try {
      const { error } = await supabase.from('pre_authorized_students').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Erro ao excluir aluno:', err);
      showAlert('Erro', 'Não foi possível excluir o aluno.');
    }
  };

  const handleImportComplete = () => {
    setShowImportModal(false);
    fetchData();
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = filterClass === 'all' || s.class_name === filterClass;
    return matchesSearch && matchesClass;
  });

  const uniqueClasses = [...new Set(students.map(s => s.class_name))].sort();

  const getStudentStatus = (student: PreAuthorizedStudent): 'rejected' | 'authorized' | 'waiting' => {
    if (student.rejected) return 'rejected';
    if (authorizedNames.has(normalizeForComparison(student.name))) return 'authorized';
    return 'waiting';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={20} color="var(--gold-primary)" /> Alunos Pré-autorizados
          </h3>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Alunos nesta lista terão acesso automático ao sistema.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setShowImportModal(true)}
            style={{ padding: '0.5rem 1rem', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            <Upload size={16} /> Importar CSV/XLSX
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            style={{ padding: '0.5rem 1rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000)', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 'bold' }}
          >
            <Plus size={16} /> Adicionar Aluno
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome..."
            style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
          />
        </div>
        <select
          value={filterClass}
          onChange={e => setFilterClass(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
        >
          <option value="all">Todas as Turmas</option>
          {uniqueClasses.map(cls => (
            <option key={cls} value={cls}>{cls}</option>
          ))}
        </select>
      </div>

      {/* Legenda de status */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Check size={15} color="#10b981" /> Já autorizado</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Clock size={15} color="#f59e0b" /> Aguardando primeiro acesso</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><X size={15} color="#ef4444" /> Recusado</span>
      </div>

      {/* Lista de alunos */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <Loader2 className="spin" size={32} color="var(--gold-primary)" />
        </div>
      ) : filteredStudents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          <Users size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <p>Nenhum aluno pré-autorizado encontrado.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filteredStudents.map(student => (
            <div
              key={student.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}
            >
              <div>
                {(() => {
                  const status = getStudentStatus(student);
                  if (status === 'authorized') {
                    return <Check size={18} color="#10b981" style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} title="Aluno já autorizado/cadastrado" />;
                  }
                  if (status === 'rejected') {
                    return <X size={18} color="#ef4444" style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} title="Aluno foi recusado" />;
                  }
                  return <Clock size={18} color="#f59e0b" style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} title="Aguardando primeiro acesso" />;
                })()}
                <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{student.name}</span>
                <span style={{ marginLeft: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {student.class_name}
                </span>
              </div>
              <button
                onClick={() => handleDeleteStudent(student.id, student.name)}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.25rem' }}
                title="Excluir"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal de importação */}
      {showImportModal && (
        <ImportStudentsModal
          tenantId={tenantId!}
          onClose={() => setShowImportModal(false)}
          onComplete={handleImportComplete}
        />
      )}

      {/* Modal de adição manual */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }}>
          <div className="glass-panel" style={{ width: '400px', maxWidth: '90vw', padding: '2rem', animation: 'slideUp 0.3s ease-out' }}>
            <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.2rem', color: 'var(--text-primary)' }}>
              Adicionar Aluno
            </h3>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Nome Completo</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nome do aluno"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Turma</label>
              <select
                value={newClassName}
                onChange={e => setNewClassName(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
              >
                <option value="">Selecione uma turma</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.name}>{cls.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleAddStudent}
                style={{ flex: 1, padding: '0.75rem', background: 'var(--gold-primary)', border: 'none', borderRadius: '8px', color: 'var(--text-on-gold, #000)', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
