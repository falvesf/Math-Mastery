import { useState, useEffect } from 'react';
import { X, Plus, BookOpen, Trash2, Clock, Search, Save, Pencil, CheckCircle, Download, Eye, EyeOff } from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import { useDialog } from '../contexts/DialogContext';
import { supabase } from '../lib/supabase';
import RichTextEditor from './RichTextEditor';
import DirectUploadButton from './DirectUploadButton';

export interface QOption {
  text: string;
  imageUrl?: string;
}

export interface QQuestion {
  title: string;
  imageUrl?: string;
  timeLimit: number;
  options: QOption[];
  correctIndex: number;
}

interface QuestQuestionsEditorProps {
  isOpen: boolean;
  onClose: () => void;
  questions: QQuestion[];
  setQuestions: (qs: QQuestion[]) => void;
  onGalleryForQuestion: (qIndex: number) => void;
  onGalleryForOption: (qIndex: number, optIndex: number) => void;
  onBankGalleryForQuestion?: () => void;
  onBankGalleryForOption?: (optIndex: number) => void;
  bankGalleryResult?: { type: 'question' | 'option'; optIndex?: number; url: string } | null;
}

/**
 * Editor de perguntas do desafio em MODAL dividido:
 * - Esquerda: lista "Pergunta 1..N" (um embaixo do outro)
 * - Direita: estrutura real da pergunta selecionada
 * - Botões "Adicionar Pergunta" (Nova/Importar) e "Salvar" sempre visíveis
 * - Acesso ao Banco de Perguntas a qualquer momento
 */
export default function QuestQuestionsEditor({ isOpen, onClose, questions, setQuestions, onGalleryForQuestion, onGalleryForOption, onBankGalleryForQuestion, onBankGalleryForOption, bankGalleryResult }: QuestQuestionsEditorProps) {
  const { tenantId, isSuperAdmin } = useTenant();
  const { showAlert, showConfirm } = useDialog();
  const [activeIndex, setActiveIndex] = useState(0);
  const [showBank, setShowBank] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<any[]>([]);
  const [bankSearch, setBankSearch] = useState('');
  const [bankLoading, setBankLoading] = useState(false);
  const [addMenu, setAddMenu] = useState<'new' | 'import' | null>(null);
  // Perquisa do banco sendo editada pelo superadmin (abre modal próprio)
  const [editingBankQ, setEditingBankQ] = useState<any>(null);
  const [editingBankOptions, setEditingBankOptions] = useState<QOption[]>([]);
  // Toggle da imagem grande da pergunta no modal do desafio
  const [showQImage, setShowQImage] = useState(false);
  // Índice da pergunta recém-adicionada/importada que deve receber foco no enunciado
  const [pendingFocus, setPendingFocus] = useState<number | null>(null);

  const updateQ = (index: number, field: keyof QQuestion, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  const updateOption = (qIndex: number, optIndex: number, field: keyof QOption, value: string) => {
    const updated = [...questions];
    updated[qIndex].options[optIndex] = { ...updated[qIndex].options[optIndex], [field]: value };
    setQuestions(updated);
  };

  const addNewQuestion = () => {
    setQuestions([...questions, { title: '', imageUrl: '', timeLimit: 30, options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }], correctIndex: 0 }]);
    setActiveIndex(questions.length);
    setPendingFocus(questions.length);
    setAddMenu(null);
  };

  const deleteQuestion = async (index: number) => {
    if (questions.length <= 1) {
      await showAlert('A missão precisa de pelo menos 1 pergunta.');
      return;
    }
    const ok = await showConfirm(`Excluir Pergunta ${index + 1}?`);
    if (!ok) return;
    const updated = [...questions];
    updated.splice(index, 1);
    setQuestions(updated);
    if (activeIndex >= updated.length) setActiveIndex(Math.max(0, updated.length - 1));
  };

  // Pergunta sem conteúdo = recém-adicionada e não preenchida
  const isQuestionEmpty = (qq: QQuestion) =>
    !(qq.title || '').trim() &&
    !(qq.imageUrl || '').trim() &&
    (qq.options || []).every(o => !(o.text || '').trim() && !(o.imageUrl || '').trim());

  const handleClose = async () => {
    const emptyIndexes: number[] = [];
    questions.forEach((qq, i) => { if (isQuestionEmpty(qq)) emptyIndexes.push(i); });

    if (emptyIndexes.length > 0) {
      const ok = await showConfirm(
        `Você tem ${emptyIndexes.length} pergunta(s) adicionada(s) sem conteúdo (não salva(s)). Descartá-la(s) e sair?`
      );
      if (!ok) {
        // Usuário não quis descartar: foca na primeira pergunta que precisa ser preenchida
        setActiveIndex(emptyIndexes[0]);
        setPendingFocus(emptyIndexes[0]);
        return;
      }
      // Usuário confirmou: descarta as perguntas sem conteúdo
      const kept = questions.filter((_, i) => !emptyIndexes.includes(i));
      if (kept.length === 0) {
        // A missão precisa de pelo menos 1 pergunta: mantém uma em branco
        setQuestions([{ title: '', imageUrl: '', timeLimit: 30, options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }], correctIndex: 0 }]);
      } else {
        setQuestions(kept);
      }
    }
    onClose();
  };

  // ---- Banco de Perguntas ----
  const loadBank = async () => {
    setBankLoading(true);
    let query = supabase.from('question_bank').select('*').order('created_at', { ascending: false });
    if (tenantId) query = query.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    const { data, error } = await query;
    setBankLoading(false);
    if (error) {
      console.error('Erro ao carregar banco:', error);
      return;
    }
    setBankQuestions(data || []);
  };

  const openBank = () => { setShowBank(true); loadBank(); };

  const importFromBank = (q: any) => {
    const converted: QQuestion = {
      title: q.title || '',
      imageUrl: q.image_url || '',
      timeLimit: q.time_limit || 30,
      options: (q.options || []).map((o: any) => ({ text: o.text || '', imageUrl: o.imageUrl || '' })),
      correctIndex: typeof q.correct_index === 'number' ? q.correct_index : 0,
    };
    // Substitui a última se estiver vazia, senão adiciona
    setQuestions(prev => {
      const last = prev[prev.length - 1];
      const lastEmpty = !last.title.trim() && !(last.imageUrl || '').trim();
      if (lastEmpty && prev.length >= 1) {
        const copy = [...prev];
        copy[copy.length - 1] = converted;
        return copy;
      }
      return [...prev, converted];
    });
    setActiveIndex(questions.length);
    setPendingFocus(questions.length);
    setShowBank(false);
    setAddMenu(null);
  };

  // Superadmin pode editar/excluir perguntas do banco
  const openEditBankQuestion = (q: any) => {
    setEditingBankQ(q);
    setEditingBankOptions((q.options || []).map((o: any) => ({ text: o.text || '', imageUrl: o.imageUrl || '' })));
  };

  const saveBankQuestionEdit = async () => {
    if (!editingBankQ) return;
    await supabase.from('question_bank').update({
      title: editingBankQ.title,
      image_url: editingBankQ.image_url,
      options: editingBankOptions,
      correct_index: editingBankQ.correct_index,
      time_limit: editingBankQ.time_limit,
    }).eq('id', editingBankQ.id);
    setEditingBankQ(null);
    loadBank();
    await showAlert('Pergunta do banco atualizada!');
  };

  const updateBankQ = (field: string, value: any) => {
    setEditingBankQ((prev: any) => ({ ...prev, [field]: value }));
  };
  const updateBankOption = (optIndex: number, field: keyof QOption, value: string) => {
    setEditingBankOptions(prev => prev.map((o, i) => i === optIndex ? { ...o, [field]: value } : o));
  };

  const deleteBankQuestion = async (q: any) => {
    const ok = await showConfirm(`Excluir pergunta do banco global?`);
    if (!ok) return;
    await supabase.from('question_bank').delete().eq('id', q.id);
    loadBank();
  };

  // Salvar pergunta atual no banco global (manual)
  const saveQuestionToBank = async () => {
    const q = questions[activeIndex];
    if (!q.title.trim()) {
      await showAlert('Digite o enunciado da pergunta antes de salvar no banco.');
      return;
    }
    const { data: existing } = await supabase
      .from('question_bank')
      .select('id')
      .eq('title', q.title.trim())
      .limit(1);
    if (existing && existing.length > 0) {
      await showAlert('Esta pergunta já existe no banco.');
      return;
    }
    await supabase.from('question_bank').insert({
      title: q.title.trim(),
      image_url: q.imageUrl || '',
      options: q.options.map(o => ({ text: o.text || '', imageUrl: o.imageUrl || '' })),
      correct_index: q.correctIndex,
      time_limit: q.timeLimit || 30,
      category: 'geral',
      difficulty: 'medio',
      tags: [],
      tenant_id: null,
    });
    await showAlert('Pergunta salva no banco global!');
  };

  // Aplica imagem escolhida na galeria para a pergunta do banco em edição
  useEffect(() => {
    if (!bankGalleryResult) return;
    if (bankGalleryResult.type === 'question') {
      setEditingBankQ((prev: any) => prev ? { ...prev, image_url: bankGalleryResult.url } : prev);
    } else if (bankGalleryResult.type === 'option') {
      const optIndex = bankGalleryResult.optIndex ?? 0;
      setEditingBankOptions(prev => prev.map((o, i) => i === optIndex ? { ...o, imageUrl: bankGalleryResult.url } : o));
    }
  }, [bankGalleryResult]);

  if (!isOpen) return null;

  const q = questions[activeIndex] || { title: '', imageUrl: '', timeLimit: 30, options: [{ text: '' }], correctIndex: 0 };
  const filteredBank = bankQuestions.filter(b =>
    !bankSearch ||
    b.title.toLowerCase().includes(bankSearch.toLowerCase()) ||
    (b.tags || []).some((t: string) => t.toLowerCase().includes(bankSearch.toLowerCase()))
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11000, padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '1200px', maxWidth: '98vw', height: '90vh', maxHeight: '94vh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Pencil color="var(--gold-primary)" /> Perguntas do Desafio ({questions.length})
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={openBank} style={{ padding: '0.5rem 1rem', background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <BookOpen size={16} /> Banco de Perguntas
            </button>
            <button onClick={handleClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Corpo: esquerda (lista) + direita (edição) */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* ESQUERDA — lista de perguntas */}
          <div style={{ width: '220px', borderRight: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-glass)' }}>
              <button
                onClick={() => setAddMenu(addMenu === 'new' ? null : 'new')}
                style={{ width: '100%', padding: '0.6rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold,#000)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              >
                <Plus size={16} /> Adicionar Pergunta
              </button>
              {addMenu === 'new' && (
                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <button onClick={addNewQuestion} style={{ padding: '0.5rem', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    + Nova (em branco)
                  </button>
                  <button onClick={() => { setAddMenu(null); openBank(); }} style={{ padding: '0.5rem', background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    + Importar do Banco
                  </button>
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
              {questions.map((_, i) => (
                <div
                  key={i}
                  onClick={() => { setActiveIndex(i); setPendingFocus(null); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.65rem 0.75rem', marginBottom: '0.35rem', borderRadius: '8px', cursor: 'pointer',
                    background: activeIndex === i ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.03)',
                    border: activeIndex === i ? '1px solid rgba(139,92,246,0.5)' : '1px solid transparent',
                    fontWeight: activeIndex === i ? 'bold' : 'normal'
                  }}
                >
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>Pergunta {i + 1}</span>
                  {questions.length > 1 && (
                    <button onClick={e => { e.stopPropagation(); deleteQuestion(i); }} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.1rem' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* DIREITA — edição da pergunta ativa */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--gold-primary)' }}>Pergunta {activeIndex + 1}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 'bold', fontSize: '0.85rem' }}>
                  <Clock size={16} /> Tempo (seg)
                </label>
                <input type="number" value={q.timeLimit} onChange={e => updateQ(activeIndex, 'timeLimit', parseInt(e.target.value) || 0)} style={{ width: '70px', padding: '0.4rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--accent-red)', color: 'white', fontFamily: 'inherit', fontSize: '1rem', textAlign: 'center' }} />
              </div>
            </div>

            <label style={{ color: 'var(--text-secondary)', fontWeight: 'bold', fontSize: '0.9rem', display: 'block', marginBottom: '0.5rem' }}>Enunciado</label>
            <RichTextEditor autoFocus={pendingFocus === activeIndex} value={q.title} onChange={(html) => updateQ(activeIndex, 'title', html)} placeholder="Digite o enigma ou pergunta aqui..." />

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Imagem:</span>
              <button onClick={() => onGalleryForQuestion(activeIndex)} style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--gold-primary)', border: '1px solid rgba(245,158,11,0.3)', padding: '0.4rem 0.75rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 'bold' }}>
                <Search size={14} /> Galeria
              </button>
              <DirectUploadButton folder="quests" onUploadComplete={(url) => { updateQ(activeIndex, 'imageUrl', url); setShowQImage(true); }} buttonStyle={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} />
              {q.imageUrl && (
                <>
                  <button
                    onClick={() => setShowQImage(s => !s)}
                    title={showQImage ? 'Ocultar imagem' : 'Mostrar imagem'}
                    style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--gold-primary)', border: '1px solid rgba(245,158,11,0.3)', padding: '0.4rem', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}
                  >
                    {showQImage ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button onClick={() => { updateQ(activeIndex, 'imageUrl', ''); setShowQImage(false); }} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', display: 'flex', padding: '0.3rem' }} title="Remover imagem">
                    <X size={14} />
                  </button>
                </>
              )}
            </div>

            {showQImage && q.imageUrl && (
              <div style={{ width: '100%', maxHeight: '160px', marginTop: '0.75rem', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
                <img src={q.imageUrl} alt="" style={{ width: '100%', maxHeight: '160px', objectFit: 'contain', background: 'rgba(0,0,0,0.5)' }} />
              </div>
            )}

            <h4 style={{ margin: '1.25rem 0 0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Alternativas (Mínimo de 2)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.75rem' }}>
              {q.options.map((opt, optIndex) => (
                <div key={optIndex} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: q.correctIndex === optIndex ? 'rgba(16,185,129,0.2)' : 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px', border: q.correctIndex === optIndex ? '2px solid var(--accent-green)' : '1px solid transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="radio" name={`correct-${activeIndex}`} checked={q.correctIndex === optIndex} onChange={() => updateQ(activeIndex, 'correctIndex', optIndex)} style={{ width: '20px', height: '20px', cursor: 'pointer', flexShrink: 0 }} title="Marcar como correta" />
                    <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold', fontSize: '0.9rem', flexShrink: 0, width: '20px', textAlign: 'center' }}>{['A', 'B', 'C', 'D'][optIndex]}</span>
                    <input type="text" value={opt.text} onChange={e => updateOption(activeIndex, optIndex, 'text', e.target.value)} placeholder={`Texto da Opção ${['A', 'B', 'C', 'D'][optIndex]}`} style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem', minWidth: 0 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingLeft: '2.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0 }}>Img:</span>
                    <button onClick={() => onGalleryForOption(activeIndex, optIndex)} style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--gold-primary)', border: '1px solid rgba(245,158,11,0.2)', padding: '0.3rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}>
                      <Search size={12} /> Galeria
                    </button>
                    <DirectUploadButton folder="quests" onUploadComplete={(url) => updateOption(activeIndex, optIndex, 'imageUrl', url)} buttonStyle={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem' }} />
                    {opt.imageUrl && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: 'auto' }}>
                        <img src={opt.imageUrl} alt="" style={{ width: '24px', height: '24px', objectFit: 'cover', borderRadius: '3px' }} />
                        <button onClick={() => updateOption(activeIndex, optIndex, 'imageUrl', '')} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}><X size={12} /></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button onClick={saveQuestionToBank} style={{ marginTop: '1.25rem', padding: '0.5rem 1rem', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <Download size={14} /> Salvar no Banco Global
            </button>
          </div>
        </div>

        {/* Rodapé */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexShrink: 0 }}>
          <button onClick={handleClose} style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={handleClose} style={{ padding: '0.6rem 1.5rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold,#000)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Save size={16} /> Salvar Perguntas ({questions.length})
          </button>
        </div>

        {/* Modal do Banco de Perguntas (interno) */}
        {showBank && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11001, padding: '1rem' }}>
            <div className="glass-panel" style={{ width: '900px', maxWidth: '95vw', maxHeight: '88vh', padding: '1.5rem', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BookOpen size={20} /> Banco de Perguntas {isSuperAdmin && <span style={{ fontSize: '0.7rem', background: 'rgba(139,92,246,0.2)', color: '#a78bfa', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>Superadmin</span>}
                </h3>
                <button onClick={() => setShowBank(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}><X size={22} /></button>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <input type="text" value={bankSearch} onChange={e => setBankSearch(e.target.value)} placeholder="Buscar perguntas..." style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
              </div>

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {bankLoading ? <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Carregando...</p>
                : filteredBank.length === 0 ? <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontStyle: 'italic' }}>Nenhuma pergunta no banco ainda.</p>
                : filteredBank.map(bq => (
                  <div key={bq.id} style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', whiteSpace: 'normal' }} dangerouslySetInnerHTML={{ __html: bq.title }} />
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        {bq.category} · {bq.difficulty} · {(bq.tags || []).slice(0, 3).map((t: string) => `#${t}`).join(' ')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                      <button onClick={() => importFromBank(bq)} style={{ padding: '0.35rem 0.7rem', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Download size={13} /> Importar
                      </button>
                      {isSuperAdmin && (
                        <>
                          <button onClick={() => openEditBankQuestion(bq)} style={{ padding: '0.35rem 0.6rem', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' }} title="Editar pergunta">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deleteBankQuestion(bq)} style={{ padding: '0.35rem 0.6rem', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' }} title="Excluir">
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal de edição da pergunta do banco (superadmin) */}
        {editingBankQ && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 11002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setEditingBankQ(null)}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '760px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', borderRadius: '12px' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.3rem' }}>Editar Pergunta do Banco</h3>
                <button onClick={() => setEditingBankQ(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: '0.3rem' }}>
                  <X size={22} />
                </button>
              </div>

              <label style={{ display: 'block', color: 'var(--text-secondary)', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.4rem' }}>Enunciado</label>
              <RichTextEditor
                value={editingBankQ.title || ''}
                onChange={(html) => updateBankQ('title', html)}
                placeholder="Digite o enigma ou pergunta aqui..."
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Imagem:</span>
                <button onClick={() => onBankGalleryForQuestion && onBankGalleryForQuestion()} style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--gold-primary)', border: '1px solid rgba(245,158,11,0.3)', padding: '0.4rem 0.75rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 'bold' }}>
                  <Search size={14} /> Galeria
                </button>
                <DirectUploadButton folder="quests" onUploadComplete={(url) => updateBankQ('image_url', url)} buttonStyle={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} />
                {editingBankQ.image_url && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: 'auto' }}>
                      <img src={editingBankQ.image_url} alt="" style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-glass)' }} />
                      <button onClick={() => updateBankQ('image_url', '')} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', display: 'flex', padding: '0.2rem' }} title="Remover imagem">
                        <X size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
              {editingBankQ.image_url && (
                <div style={{ width: '100%', maxHeight: '160px', marginTop: '0.5rem', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
                  <img src={editingBankQ.image_url} alt="" style={{ width: '100%', maxHeight: '160px', objectFit: 'contain', background: 'rgba(0,0,0,0.5)' }} />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontWeight: 'bold', fontSize: '0.9rem' }}>
                  <Clock size={16} /> Tempo (seg)
                </label>
                <input
                  type="number"
                  value={editingBankQ.time_limit ?? 30}
                  onChange={e => updateBankQ('time_limit', parseInt(e.target.value) || 0)}
                  style={{ width: '80px', padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--accent-red)', color: 'white', fontFamily: 'inherit', fontSize: '1rem', textAlign: 'center' }}
                />
              </div>

              <h4 style={{ marginBottom: '0.6rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Alternativas (mínimo 2)</h4>
              {editingBankOptions.map((opt, optIndex) => (
                <div key={optIndex} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem', background: editingBankQ.correct_index === optIndex ? 'rgba(16,185,129,0.2)' : 'rgba(0,0,0,0.2)', padding: '0.6rem', borderRadius: '8px', border: editingBankQ.correct_index === optIndex ? '2px solid var(--accent-green)' : '1px solid transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <input
                      type="radio"
                      name={`bank-correct`}
                      checked={editingBankQ.correct_index === optIndex}
                      onChange={() => updateBankQ('correct_index', optIndex)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
                      title="Marcar como correta"
                    />
                    <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold', fontSize: '0.85rem', flexShrink: 0, width: '18px', textAlign: 'center' }}>{['A','B','C','D'][optIndex]}</span>
                    <input
                      type="text"
                      value={opt.text}
                      onChange={e => updateBankOption(optIndex, 'text', e.target.value)}
                      placeholder={`Texto da Opção ${['A','B','C','D'][optIndex]}`}
                      style={{ flex: 1, padding: '0.55rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem', minWidth: 0 }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingLeft: '2.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0 }}>Img:</span>
                    <button onClick={() => onBankGalleryForOption && onBankGalleryForOption(optIndex)} style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--gold-primary)', border: '1px solid rgba(245,158,11,0.2)', padding: '0.3rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Search size={12} /> Galeria
                    </button>
                    <DirectUploadButton folder="quests" onUploadComplete={(url) => updateBankOption(optIndex, 'imageUrl', url)} buttonStyle={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem' }} />
                    {opt.imageUrl && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: 'auto' }}>
                        <img src={opt.imageUrl} alt="" style={{ width: '24px', height: '24px', objectFit: 'cover', borderRadius: '3px', border: '1px solid var(--border-glass)' }} />
                        <button onClick={() => updateBankOption(optIndex, 'imageUrl', '')} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', display: 'flex', padding: '0.1rem' }} title="Remover imagem">
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.5rem' }}>
                <button className="login-btn" onClick={() => setEditingBankQ(null)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border-glass)' }}>
                  Cancelar
                </button>
                <button className="login-btn" onClick={saveBankQuestionEdit} style={{ flex: 1, background: 'var(--gold-primary)', color: '#000', border: 'none', fontWeight: 'bold' }}>
                  <Save size={18} style={{ marginRight: '0.5rem' }} /> Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}