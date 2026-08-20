import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useDialog } from '../contexts/DialogContext';
import { X, Search, Download, Copy, Eye, BookOpen, Loader2, CheckCircle } from 'lucide-react';

interface QuestionBankItem {
  id: string;
  tenant_id?: string;
  title: string;
  image_url?: string;
  options: { text: string; imageUrl?: string }[];
  correct_index: number;
  category: string;
  difficulty: string;
  tags: string[];
  time_limit: number;
  created_by?: string;
  created_at?: string;
}

interface QuestionBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (question: QuestionBankItem) => void;
}

const CATEGORIES = [
  { value: 'all', label: 'Todas as Categorias' },
  { value: 'matematica', label: 'Matemática' },
  { value: 'portugues', label: 'Português' },
  { value: 'ciencias', label: 'Ciências' },
  { value: 'historia', label: 'História' },
  { value: 'geografia', label: 'Geografia' },
  { value: 'ingles', label: 'Inglês' },
  { value: 'geral', label: 'Geral' },
];

const DIFFICULTIES = [
  { value: 'all', label: 'Todas as Dificuldades' },
  { value: 'facil', label: 'Fácil' },
  { value: 'medio', label: 'Médio' },
  { value: 'dificil', label: 'Difícil' },
];

export default function QuestionBankModal({ isOpen, onClose, onSelect }: QuestionBankModalProps) {
  const { tenantId } = useTenant();
  const { showAlert } = useDialog();
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterDifficulty, setFilterDifficulty] = useState('all');
  const [previewQuestion, setPreviewQuestion] = useState<QuestionBankItem | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchQuestions();
    }
  }, [isOpen]);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      let query = supabase.from('question_bank').select('*').order('created_at', { ascending: false });
      
      // Buscar perguntas globais OU da escola atual
      if (tenantId) {
        query = query.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
      }
      
      const { data, error } = await query;

      if (error) throw error;
      setQuestions(data || []);
    } catch (err) {
      console.error('Erro ao carregar perguntas:', err);
      showAlert('Erro', 'Não foi possível carregar o banco de perguntas.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (question: QuestionBankItem) => {
    onSelect(question);
    onClose();
  };

  const filteredQuestions = questions.filter(q => {
    const matchesSearch = !searchQuery || 
      q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = filterCategory === 'all' || q.category === filterCategory;
    const matchesDifficulty = filterDifficulty === 'all' || q.difficulty === filterDifficulty;

    return matchesSearch && matchesCategory && matchesDifficulty;
  });

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'facil': return '#10b981';
      case 'medio': return '#f59e0b';
      case 'dificil': return '#ef4444';
      default: return '#9ca3af';
    }
  };

  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case 'facil': return 'Fácil';
      case 'medio': return 'Médio';
      case 'dificil': return 'Difícil';
      default: return 'Médio';
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <div className="glass-panel" style={{ width: '900px', maxWidth: '95vw', maxHeight: '90vh', padding: '2rem', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out', background: 'var(--bg-dark)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gold-primary)' }}>
            <BookOpen color="var(--gold-primary)" /> Banco de Perguntas
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar perguntas ou tags..."
              style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
            />
          </div>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
          >
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <select
            value={filterDifficulty}
            onChange={e => setFilterDifficulty(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
          >
            {DIFFICULTIES.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        {/* Lista de Perguntas */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--gold-primary)', gap: '0.5rem' }}>
              <Loader2 className="animate-spin" size={24} /> Carregando perguntas...
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <BookOpen size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <p>Nenhuma pergunta encontrada no banco.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredQuestions.map(question => (
                <div
                  key={question.id}
                  className="glass-panel"
                  style={{
                    padding: '1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    border: '1px solid var(--border-glass)',
                  }}
                  onClick={() => handleSelect(question)}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-glass)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 
                        style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.4 }}
                        dangerouslySetInnerHTML={{ __html: question.title }}
                      />
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6' }}>
                          {CATEGORIES.find(c => c.value === question.category)?.label || question.category}
                        </span>
                        <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: `${getDifficultyColor(question.difficulty)}20`, color: getDifficultyColor(question.difficulty) }}>
                          {getDifficultyLabel(question.difficulty)}
                        </span>
                        {(question.tags || []).slice(0, 3).map(tag => (
                          <span key={tag} style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); setPreviewQuestion(question); }}
                        style={{ padding: '0.35rem 0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                        title="Visualizar"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleSelect(question); }}
                        style={{ padding: '0.35rem 0.75rem', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <CheckCircle size={14} /> Selecionar
                      </button>
                    </div>
                  </div>
                  {question.image_url && (
                    <img src={question.image_url} alt="" style={{ marginTop: '0.5rem', maxWidth: '150px', maxHeight: '80px', objectFit: 'contain', borderRadius: '4px' }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Preview */}
      {previewQuestion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }}>
          <div className="glass-panel" style={{ width: '500px', maxWidth: '90vw', padding: '2rem', animation: 'slideUp 0.3s ease-out', background: 'var(--bg-dark)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              Preview da Pergunta
            </h3>
            <div style={{ marginBottom: '1rem' }}>
              <h4 
                style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{ __html: previewQuestion.title }}
              />
              {previewQuestion.image_url && (
                <img src={previewQuestion.image_url} alt="" style={{ maxWidth: '100%', maxHeight: '150px', objectFit: 'contain', borderRadius: '8px', marginBottom: '0.75rem' }} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {previewQuestion.options.map((opt, i) => (
                  <div 
                    key={i} 
                    style={{ 
                      padding: '0.5rem 0.75rem', 
                      borderRadius: '6px', 
                      background: i === previewQuestion.correct_index ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)',
                      border: i === previewQuestion.correct_index ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                      display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}
                  >
                    <span style={{ fontWeight: 'bold', color: i === previewQuestion.correct_index ? '#10b981' : 'var(--text-secondary)' }}>
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <span style={{ color: i === previewQuestion.correct_index ? '#10b981' : 'var(--text-primary)' }}>
                      {opt.text}
                    </span>
                    {i === previewQuestion.correct_index && <CheckCircle size={16} color="#10b981" style={{ marginLeft: 'auto' }} />}
                    {opt.imageUrl && <img src={opt.imageUrl} alt="" style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px', marginLeft: 'auto' }} />}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button
                onClick={() => { handleSelect(previewQuestion); setPreviewQuestion(null); }}
                style={{ flex: 1, padding: '0.75rem', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Selecionar Pergunta
              </button>
              <button
                onClick={() => setPreviewQuestion(null)}
                style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
