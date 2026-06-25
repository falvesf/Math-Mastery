import { useState, useEffect } from 'react';
import { ShieldAlert, Users, BookOpen, Settings, LogOut, ArrowLeft, Plus, Star, X, GraduationCap, History, Trash2, Edit2, Medal, Swords, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type UserData } from '../contexts/AuthContext';
import { signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, addDoc, serverTimestamp, getDoc, deleteDoc } from 'firebase/firestore';
import { getRankForXp, RANKS } from '../lib/ranks';
import { DEFAULT_EVALUATIONS, type EvaluationType } from '../lib/evaluations';

export interface ClassDef {
  id: string;
  name: string;
  color: string;
}

export interface QuestQuestion {
  title: string;
  options: string[];
  correctIndex: number;
}

export interface QuestDef {
  id: string;
  title: string;
  description: string;
  baseXp: number;
  allowRetries: boolean;
  xpPenaltyPerRetry: number;
  questions: QuestQuestion[];
  active: boolean;
}

export default function AdminDashboard() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('users');
  const [students, setStudents] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(false);
  const [evaluations, setEvaluations] = useState<EvaluationType[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<ClassDef[]>([]);
  const [quests, setQuests] = useState<QuestDef[]>([]);

  // Modal de Lançar Nota States
  const [selectedStudent, setSelectedStudent] = useState<UserData | null>(null);
  const [modalMode, setModalMode] = useState('add');
  const [grade, setGrade] = useState('');
  const [gradeType, setGradeType] = useState('');
  const [xpHistory, setXpHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [removeAmount, setRemoveAmount] = useState('');
  const [removeReason, setRemoveReason] = useState('');

  // Modal de Editar Aluno States
  const [editingStudent, setEditingStudent] = useState<UserData | null>(null);
  const [editName, setEditName] = useState('');
  const [editClass, setEditClass] = useState('');

  // Config States
  const [newEvalName, setNewEvalName] = useState('');
  const [newEvalWeight, setNewEvalWeight] = useState('');
  
  // Turmas States
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState('#3b82f6');

  // Missões States
  const [isCreatingQuest, setIsCreatingQuest] = useState(false);
  const [questTitle, setQuestTitle] = useState('');
  const [questDesc, setQuestDesc] = useState('');
  const [questXp, setQuestXp] = useState('1000');
  const [questRetries, setQuestRetries] = useState(false);
  const [questPenalty, setQuestPenalty] = useState('0');
  const [questQuestions, setQuestQuestions] = useState<QuestQuestion[]>([{ title: '', options: ['', '', '', ''], correctIndex: 0 }]);

  const fetchEvaluations = async () => {
    const docRef = doc(db, 'settings', 'evaluations');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const fetched = snap.data().types || [];
      setEvaluations(fetched);
      if (fetched.length > 0) setGradeType(fetched[0].id);
    } else {
      setEvaluations(DEFAULT_EVALUATIONS);
      setGradeType(DEFAULT_EVALUATIONS[0].id);
      await setDoc(docRef, { types: DEFAULT_EVALUATIONS });
    }
  };

  const fetchClasses = async () => {
    const snap = await getDocs(collection(db, 'classes'));
    const loaded: ClassDef[] = [];
    snap.forEach(d => loaded.push({ id: d.id, ...d.data() } as ClassDef));
    loaded.sort((a, b) => a.name.localeCompare(b.name));
    setSchoolClasses(loaded);
  };

  const fetchQuests = async () => {
    const snap = await getDocs(collection(db, 'quests'));
    const loaded: QuestDef[] = [];
    snap.forEach(d => loaded.push({ id: d.id, ...d.data() } as QuestDef));
    setQuests(loaded);
  };

  const fetchStudents = async () => {
    setLoading(true);
    const q = query(collection(db, 'users'), where('role', '==', 'student'));
    const querySnapshot = await getDocs(q);
    const loadedStudents: UserData[] = [];
    querySnapshot.forEach((doc) => {
      loadedStudents.push(doc.data() as UserData);
    });
    setStudents(loadedStudents);
    setLoading(false);
  };

  const loadStudentHistoryLocally = async (studentUid: string) => {
    setLoadingHistory(true);
    const q = query(collection(db, 'xp_logs'), where('studentId', '==', studentUid));
    const snap = await getDocs(q);
    const logs = snap.docs.map(d => ({ logId: d.id, ...(d.data() as any) }));
    logs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    setXpHistory(logs);
    setLoadingHistory(false);
  };

  useEffect(() => {
    fetchEvaluations();
    fetchClasses();
    fetchQuests();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      fetchStudents();
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedStudent) {
      loadStudentHistoryLocally(selectedStudent.uid);
    }
  }, [selectedStudent?.uid]);

  // Remover XP
  const handleRemoveXp = async () => {
    if (!selectedStudent || !removeAmount || !removeReason) return;
    const xpToRemove = parseInt(removeAmount);
    if (isNaN(xpToRemove) || xpToRemove <= 0) return;
    const newXp = Math.max(0, (selectedStudent.xp || 0) - xpToRemove);
    const userRef = doc(db, 'users', selectedStudent.uid);
    await updateDoc(userRef, { xp: newXp });
    await addDoc(collection(db, 'xp_logs'), {
      studentId: selectedStudent.uid,
      studentName: selectedStudent.name,
      evalName: 'Correção / Remoção de XP',
      justification: removeReason,
      xpGained: -xpToRemove,
      timestamp: serverTimestamp()
    });
    setSelectedStudent({ ...selectedStudent, xp: newXp });
    setRemoveAmount('');
    setRemoveReason('');
    fetchStudents();
    loadStudentHistoryLocally(selectedStudent.uid);
  };

  // Dar XP
  const handleGiveGrade = async () => {
    if (!selectedStudent || !grade) return;
    const numGrade = parseFloat(grade.replace(',', '.'));
    if (isNaN(numGrade) || numGrade < 0 || numGrade > 10) return;
    const selectedEval = evaluations.find(e => e.id === gradeType) || evaluations[0];
    const xpGained = numGrade * selectedEval.weight;
    const newXp = (selectedStudent.xp || 0) + xpGained;
    const userRef = doc(db, 'users', selectedStudent.uid);
    await updateDoc(userRef, { xp: newXp });
    await addDoc(collection(db, 'xp_logs'), {
      studentId: selectedStudent.uid,
      studentName: selectedStudent.name,
      evalId: selectedEval.id,
      evalName: selectedEval.name,
      grade: numGrade,
      weight: selectedEval.weight,
      xpGained: xpGained,
      timestamp: serverTimestamp()
    });
    setSelectedStudent({ ...selectedStudent, xp: newXp });
    setGrade('');
    fetchStudents(); 
    loadStudentHistoryLocally(selectedStudent.uid);
  };

  const handleDeleteHistoryLog = async (logId: string, xpGained: number) => {
    if (!selectedStudent) return;
    if (window.confirm("Atenção! Você está apagando este registro do histórico. O XP do aluno será recalculado. Deseja continuar?")) {
      await deleteDoc(doc(db, 'xp_logs', logId));
      const newXp = Math.max(0, (selectedStudent.xp || 0) - xpGained);
      const userRef = doc(db, 'users', selectedStudent.uid);
      await updateDoc(userRef, { xp: newXp });
      setSelectedStudent({ ...selectedStudent, xp: newXp });
      fetchStudents();
      loadStudentHistoryLocally(selectedStudent.uid);
    }
  };

  // Avaliações
  const handleAddEvaluation = async () => {
    if (!newEvalName || !newEvalWeight) return;
    const newEval = { id: Date.now().toString(), name: newEvalName, weight: Number(newEvalWeight) };
    const updated = [...evaluations, newEval];
    setEvaluations(updated);
    setNewEvalName('');
    setNewEvalWeight('');
    await setDoc(doc(db, 'settings', 'evaluations'), { types: updated });
  };

  const handleRemoveEvaluation = async (id: string) => {
    if (evaluations.length <= 1) {
      alert("Você precisa ter pelo menos um tipo de avaliação.");
      return;
    }
    const updated = evaluations.filter(e => e.id !== id);
    setEvaluations(updated);
    await setDoc(doc(db, 'settings', 'evaluations'), { types: updated });
  };

  // Turmas
  const handleAddClass = async () => {
    if (!newClassName) return;
    const classId = Date.now().toString();
    const newClass = { id: classId, name: newClassName, color: newClassColor };
    await setDoc(doc(db, 'classes', classId), newClass);
    setNewClassName('');
    fetchClasses();
  };

  const handleRemoveClass = async (id: string) => {
    if (window.confirm("Deseja realmente apagar esta turma?")) {
      await deleteDoc(doc(db, 'classes', id));
      fetchClasses();
    }
  };

  // Editar Aluno
  const openEditModal = (student: UserData) => {
    setEditingStudent(student);
    setEditName(student.name || '');
    setEditClass(student.classId || '');
  };

  const handleSaveStudent = async () => {
    if (!editingStudent) return;
    const userRef = doc(db, 'users', editingStudent.uid);
    await updateDoc(userRef, { name: editName, classId: editClass });
    setEditingStudent(null);
    fetchStudents();
  };

  // Missões Handlers
  const handleAddQuestion = () => {
    setQuestQuestions([...questQuestions, { title: '', options: ['', '', '', ''], correctIndex: 0 }]);
  };

  const handleUpdateQuestion = (index: number, field: string, value: any) => {
    const updated = [...questQuestions];
    if (field === 'title') updated[index].title = value;
    if (field === 'correctIndex') updated[index].correctIndex = value;
    setQuestQuestions(updated);
  };

  const handleUpdateOption = (qIndex: number, optIndex: number, value: string) => {
    const updated = [...questQuestions];
    updated[qIndex].options[optIndex] = value;
    setQuestQuestions(updated);
  };

  const handleSaveQuest = async () => {
    if (!questTitle || questQuestions.length === 0) return;
    const questId = Date.now().toString();
    const newQuest: QuestDef = {
      id: questId,
      title: questTitle,
      description: questDesc,
      baseXp: parseInt(questXp) || 0,
      allowRetries: questRetries,
      xpPenaltyPerRetry: questRetries ? (parseInt(questPenalty) || 0) : 0,
      questions: questQuestions,
      active: true
    };
    await setDoc(doc(db, 'quests', questId), newQuest);
    setIsCreatingQuest(false);
    setQuestTitle(''); setQuestDesc(''); setQuestQuestions([{ title: '', options: ['', '', '', ''], correctIndex: 0 }]);
    fetchQuests();
  };

  const handleToggleQuestActive = async (id: string, currentStatus: boolean) => {
    await updateDoc(doc(db, 'quests', id), { active: !currentStatus });
    fetchQuests();
  };

  const handleDeleteQuest = async (id: string) => {
    if(window.confirm("Apagar essa Missão definitivamente?")) {
      await deleteDoc(doc(db, 'quests', id));
      fetchQuests();
    }
  };

  return (
    <div className="app-container" style={{ maxWidth: '1400px' }}>
      <nav className="navbar glass-panel" style={{ marginBottom: '2rem' }}>
        <div className="logo-container">
          <ShieldAlert className="logo-icon" color="var(--accent-red)" size={32} />
          <h1 className="title-glow" style={{ color: 'var(--accent-red)', textShadow: '0 0 15px rgba(239, 68, 68, 0.3)' }}>
            Painel Master (Admin)
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button className="login-btn" onClick={() => navigate('/dashboard')} style={{ padding: '0.5rem 1rem' }}>
            <ArrowLeft size={18} style={{ marginRight: '0.5rem' }} /> Voltar
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: '50px' }}>
            <img src={userData?.photoURL} alt="Avatar" style={{ width: 36, borderRadius: '50%', border: '2px solid var(--accent-red)' }} />
            <span style={{ fontWeight: 600 }}>{userData?.name?.split(' ')[0]}</span>
          </div>
          <button className="login-btn" onClick={() => signOut(auth)} style={{ padding: '0.75rem', borderRadius: '50%' }} title="Sair">
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        {/* Sidebar */}
        <div className="glass-panel" style={{ width: '250px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', height: 'fit-content' }}>
          <button className={`login-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'users' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'users' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
            <Users size={20} /> Alunos & Notas
          </button>
          <button className={`login-btn ${activeTab === 'quests' ? 'active' : ''}`} onClick={() => setActiveTab('quests')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'quests' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'quests' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
            <Swords size={20} /> Missões (Quizzes)
          </button>
          <button className={`login-btn ${activeTab === 'classes' ? 'active' : ''}`} onClick={() => setActiveTab('classes')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'classes' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'classes' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
            <BookOpen size={20} /> Turmas
          </button>
          <button className={`login-btn ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'config' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'config' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
            <Settings size={20} /> Tipos de Avaliação
          </button>
          <button className={`login-btn ${activeTab === 'ranks' ? 'active' : ''}`} onClick={() => setActiveTab('ranks')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'ranks' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'ranks' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
            <Medal size={20} /> Patentes (Artes)
          </button>
        </div>

        {/* Content */}
        <div className="glass-panel" style={{ flex: 1, padding: '2rem', minHeight: '600px', minWidth: '300px' }}>
          
          {/* Aba de Usuários */}
          {activeTab === 'users' && (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                  <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Gerenciamento de Alunos</h2>
                  <p style={{ color: 'var(--text-secondary)' }}>Alunos aparecem aqui automaticamente após fazerem login com a conta @eaportal.org.</p>
                </div>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Carregando alunos do banco de dados...</div>
              ) : students.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', border: '1px dashed var(--border-glass)', borderRadius: '8px' }}>
                  <GraduationCap size={48} color="var(--text-secondary)" style={{ opacity: 0.5, margin: '0 auto 1rem auto' }} />
                  <h3>Nenhum aluno logou no sistema ainda</h3>
                  <p style={{ color: 'var(--text-secondary)' }}>Os alunos da instituição devem fazer o primeiro acesso via Google para aparecerem aqui.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {students.map(student => {
                    const currentRank = getRankForXp(student.xp || 0);
                    const sClass = schoolClasses.find(c => c.name === student.classId);
                    const classColor = sClass ? sClass.color : 'var(--text-secondary)';

                    return (
                      <div key={student.uid} className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                          <img src={student.photoURL} alt="" style={{ width: 48, height: 48, borderRadius: '50%', border: `2px solid ${currentRank.color}` }} />
                          <div>
                            <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-primary)' }}>{student.name}</h3>
                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: classColor }}>
                                <BookOpen size={14} /> {student.classId || 'Sem Turma'}
                              </span>
                              <span style={{ color: currentRank.color, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><ShieldAlert size={14} /> {currentRank.name}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--gold-primary)' }}><Star size={14} /> {student.xp || 0} XP</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button 
                            className="login-btn" 
                            onClick={() => openEditModal(student)}
                            style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderColor: 'transparent' }}
                            title="Editar Aluno"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            className="login-btn" 
                            onClick={() => setSelectedStudent(student)}
                            style={{ borderColor: 'var(--gold-primary)', color: 'var(--gold-primary)', background: 'rgba(251, 191, 36, 0.1)' }}
                          >
                            <Star size={18} style={{ marginRight: '0.5rem' }} /> Gerenciar XP
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Aba de Missões (Quizzes) */}
          {activeTab === 'quests' && (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
              {!isCreatingQuest ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                      <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Central de Missões</h2>
                      <p style={{ color: 'var(--text-secondary)' }}>Crie desafios onde os alunos ganham XP automaticamente ao acertar.</p>
                    </div>
                    <button className="login-btn" onClick={() => setIsCreatingQuest(true)} style={{ background: 'var(--gold-primary)', color: 'black', border: 'none' }}>
                      <Plus size={18} style={{ marginRight: '0.5rem' }} /> Nova Missão
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {quests.length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)' }}>Nenhuma missão criada ainda.</p>
                    ) : quests.map(quest => (
                      <div key={quest.id} className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderLeft: `4px solid ${quest.active ? 'var(--accent-green)' : 'var(--text-secondary)'}` }}>
                        <div>
                          <h3 style={{ fontSize: '1.3rem', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Swords size={20} color="var(--gold-primary)" /> {quest.title}
                          </h3>
                          <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <span>Recompensa: <strong style={{ color: 'var(--gold-primary)' }}>{quest.baseXp} XP</strong></span>
                            <span>Modo: {quest.allowRetries ? `Vidas Extras (-${quest.xpPenaltyPerRetry} XP por erro)` : 'Tentativa Única (Hardcore)'}</span>
                            <span>{quest.questions.length} Perguntas</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                          <button onClick={() => handleToggleQuestActive(quest.id, quest.active)} style={{ background: quest.active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)', color: quest.active ? 'var(--accent-green)' : 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                            {quest.active ? 'Ativa (Visível)' : 'Rascunho (Oculta)'}
                          </button>
                          <button onClick={() => handleDeleteQuest(quest.id)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}>
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ animation: 'slideUp 0.3s ease-out' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.8rem', margin: 0 }}>Criar Nova Missão Escolar</h2>
                    <button className="login-btn" onClick={() => setIsCreatingQuest(false)} style={{ background: 'transparent', border: '1px solid var(--border-glass)' }}>
                      Cancelar
                    </button>
                  </div>

                  <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome da Missão (ex: Batalha das Equações)</label>
                        <input type="text" value={questTitle} onChange={e => setQuestTitle(e.target.value)} style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit', fontSize: '1.2rem' }} />
                      </div>
                      
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Descrição (Lore da Missão)</label>
                        <textarea value={questDesc} onChange={e => setQuestDesc(e.target.value)} rows={3} style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }} placeholder="Um monstro apareceu! Resolva os problemas para derrotá-lo..."></textarea>
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>Recompensa Base de XP</label>
                        <input type="number" value={questXp} onChange={e => setQuestXp(e.target.value)} style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--gold-primary)', color: 'white', fontFamily: 'inherit', fontSize: '1.2rem' }} />
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Modo de Jogo</label>
                        <select value={questRetries ? 'vidas' : 'hardcore'} onChange={e => setQuestRetries(e.target.value === 'vidas')} style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit', fontSize: '1.1rem' }}>
                          <option value="hardcore">Tentativa Única (Errou, falhou a missão)</option>
                          <option value="vidas">Vidas Extras (Pode tentar novamente com penalidade)</option>
                        </select>
                      </div>

                      {questRetries && (
                        <div style={{ gridColumn: '1 / -1', background: 'rgba(239, 68, 68, 0.1)', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid var(--accent-red)' }}>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--accent-red)', fontWeight: 'bold' }}>Penalidade de XP por cada erro na Missão</label>
                          <input type="number" value={questPenalty} onChange={e => setQuestPenalty(e.target.value)} placeholder="Ex: 50" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--accent-red)', color: 'white', fontFamily: 'inherit' }} />
                          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Se a recompensa base for 1000 XP e a penalidade 100, no primeiro erro a recompensa máxima passará a ser 900 XP.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Perguntas / Desafios</h3>
                  
                  {questQuestions.map((q, qIndex) => (
                    <div key={qIndex} className="glass-panel" style={{ padding: '2rem', marginBottom: '1.5rem', position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '-15px', left: '20px', background: 'var(--accent-blue)', padding: '0.2rem 1rem', borderRadius: '20px', fontWeight: 'bold' }}>
                        Pergunta {qIndex + 1}
                      </div>
                      
                      <input 
                        type="text" 
                        value={q.title} 
                        onChange={e => handleUpdateQuestion(qIndex, 'title', e.target.value)} 
                        placeholder="Digite o enigma ou pergunta aqui..." 
                        style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit', fontSize: '1.1rem', marginBottom: '1.5rem', marginTop: '0.5rem' }} 
                      />

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {q.options.map((opt, optIndex) => (
                          <div key={optIndex} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: q.correctIndex === optIndex ? 'rgba(16, 185, 129, 0.2)' : 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '8px', border: q.correctIndex === optIndex ? '1px solid var(--accent-green)' : '1px solid transparent' }}>
                            <input 
                              type="radio" 
                              name={`correct-${qIndex}`} 
                              checked={q.correctIndex === optIndex}
                              onChange={() => handleUpdateQuestion(qIndex, 'correctIndex', optIndex)}
                              style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                            />
                            <input 
                              type="text" 
                              value={opt} 
                              onChange={e => handleUpdateOption(qIndex, optIndex, e.target.value)}
                              placeholder={`Opção ${['A', 'B', 'C', 'D'][optIndex]}`}
                              style={{ flex: 1, padding: '0.75rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: 'none', color: 'white', fontFamily: 'inherit' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                    <button className="login-btn" onClick={handleAddQuestion} style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: '1px dashed var(--border-glass)' }}>
                      <Plus size={18} style={{ marginRight: '0.5rem' }} /> Adicionar Pergunta
                    </button>
                    <button className="login-btn" onClick={handleSaveQuest} style={{ flex: 2, background: 'var(--gold-primary)', color: 'black', border: 'none' }}>
                      <Save size={18} style={{ marginRight: '0.5rem' }} /> Salvar Missão no Banco de Dados
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aba de Turmas */}
          {activeTab === 'classes' && (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
              <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Gerenciamento de Turmas</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Crie turmas para agrupar os alunos e gerar Rankings exclusivos.</p>
              
              <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'rgba(0,0,0,0.2)' }}>
                <h3 style={{ marginBottom: '1rem' }}>Criar Nova Turma</h3>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: 2 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Nome da Turma</label>
                    <input type="text" value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="Ex: 6º ano A" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Cor da Turma</label>
                    <input type="color" value={newClassColor} onChange={e => setNewClassColor(e.target.value)} style={{ width: '100%', height: '45px', padding: '0', borderRadius: '8px', background: 'transparent', border: 'none', cursor: 'pointer' }} />
                  </div>
                  <button className="login-btn" onClick={handleAddClass} style={{ background: 'var(--accent-blue)', color: 'white', border: 'none', height: '45px' }}>
                    <Plus size={20} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {schoolClasses.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>Nenhuma turma criada.</p>
                ) : (
                  schoolClasses.map(cls => (
                    <div key={cls.id} className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderLeft: `4px solid ${cls.color}` }}>
                      <h4 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <BookOpen size={20} color={cls.color} /> {cls.name}
                      </h4>
                      <button onClick={() => handleRemoveClass(cls.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.5rem' }} title="Excluir Turma">
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Aba de Configurações */}
          {activeTab === 'config' && (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                  <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Tipos de Avaliação</h2>
                  <p style={{ color: 'var(--text-secondary)' }}>Defina como os alunos ganham XP customizando os pesos das notas.</p>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'rgba(0,0,0,0.2)' }}>
                <h3 style={{ marginBottom: '1rem' }}>Adicionar Nova Avaliação</h3>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: 2 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Nome da Atividade</label>
                    <input type="text" value={newEvalName} onChange={e => setNewEvalName(e.target.value)} placeholder="Ex: Tarefa de Casa" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Multiplicador (Peso)</label>
                    <input type="number" value={newEvalWeight} onChange={e => setNewEvalWeight(e.target.value)} placeholder="Ex: 50" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }} />
                  </div>
                  <button className="login-btn" onClick={handleAddEvaluation} style={{ background: 'var(--gold-primary)', color: 'var(--bg-dark)', border: 'none', height: '45px' }}>
                    <Plus size={20} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '1rem' }}>
                {evaluations.map(ev => (
                  <div key={ev.id} className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.02)' }}>
                    <div>
                      <h4 style={{ fontSize: '1.2rem', margin: '0 0 0.25rem 0' }}>{ev.name}</h4>
                      <p style={{ margin: 0, color: 'var(--gold-primary)', fontSize: '0.9rem' }}>Nota × {ev.weight} = XP Final</p>
                    </div>
                    <button onClick={() => handleRemoveEvaluation(ev.id)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.5rem' }} title="Excluir">
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aba Ranks */}
          {activeTab === 'ranks' && (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
              <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Patentes e Artes</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Quando as artes do projeto chegarem, faremos o upload das imagens aqui para substituir as bordas coloridas no painel do aluno.</p>
              <div style={{ display: 'grid', gap: '1rem' }}>
                {RANKS.map(rank => (
                  <div key={rank.name} className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: rank.color }}></div>
                    <div>
                      <h3 style={{ margin: 0, color: rank.color }}>{rank.name}</h3>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Requisito: {rank.minXp} XP</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Editar Aluno */}
      {editingStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-panel" style={{ width: '400px', padding: '2rem', animation: 'slideUp 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>Editar Aluno</h3>
              <button onClick={() => setEditingStudent(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome Completo</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }} />
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Turma Oficial</label>
              <select value={editClass} onChange={e => setEditClass(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }}>
                <option value="">Sem Turma</option>
                {schoolClasses.map(cls => (
                  <option key={cls.id} value={cls.name}>{cls.name}</option>
                ))}
              </select>
            </div>

            <button className="login-btn" onClick={handleSaveStudent} style={{ width: '100%', justifyContent: 'center', background: 'var(--accent-blue)', color: 'white', border: 'none' }}>
              Salvar Alterações
            </button>
          </div>
        </div>
      )}

      {/* Modal de Gerenciar XP e Histórico */}
      {selectedStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-panel" style={{ width: '800px', maxWidth: '95vw', padding: '2rem', animation: 'slideUp 0.3s ease-out', display: 'flex', gap: '2rem' }}>
            
            {/* Lado Esquerdo: Formulário */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>Gerenciar XP</h3>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                 <img src={selectedStudent.photoURL} alt="" style={{ width: 48, height: 48, borderRadius: '50%' }} />
                 <div>
                   <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{selectedStudent.name}</div>
                   <div style={{ fontSize: '0.9rem', color: 'var(--gold-primary)', marginTop: '0.2rem' }}>XP Atual: {selectedStudent.xp || 0}</div>
                 </div>
              </div>

              {/* Toggles Adicionar/Remover */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: '8px' }}>
                <button onClick={() => setModalMode('add')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: modalMode === 'add' ? 'rgba(255,255,255,0.1)' : 'transparent', color: modalMode === 'add' ? 'white' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontWeight: modalMode === 'add' ? 'bold' : 'normal' }}>
                  Dar XP
                </button>
                <button onClick={() => setModalMode('remove')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: modalMode === 'remove' ? 'rgba(239, 68, 68, 0.2)' : 'transparent', color: modalMode === 'remove' ? 'var(--accent-red)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontWeight: modalMode === 'remove' ? 'bold' : 'normal' }}>
                  Retirar XP
                </button>
              </div>

              {modalMode === 'add' ? (
                <>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Tipo de Avaliação</label>
                    <select value={gradeType} onChange={e => setGradeType(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }}>
                      {evaluations.map(ev => (
                        <option key={ev.id} value={ev.id}>{ev.name} (Peso x{ev.weight})</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: '2rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nota (0 a 10)</label>
                    <input type="number" step="0.1" min="0" max="10" value={grade} onChange={e => setGrade(e.target.value)} placeholder="Ex: 8.5" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit', fontSize: '1.2rem' }} />
                    {grade && !isNaN(parseFloat(grade.replace(',', '.'))) && (
                      <div style={{ marginTop: '0.5rem', color: 'var(--gold-primary)', fontSize: '0.9rem', fontWeight: 600 }}>
                        Resultado: +{parseFloat(grade.replace(',', '.')) * (evaluations.find(e => e.id === gradeType)?.weight || 100)} XP
                      </div>
                    )}
                  </div>
                  <button className="login-btn" onClick={handleGiveGrade} style={{ width: '100%', justifyContent: 'center', background: 'var(--gold-primary)', color: 'var(--bg-dark)', border: 'none' }}>
                    Confirmar e Dar XP
                  </button>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Quantidade de XP a Retirar</label>
                    <input type="number" value={removeAmount} onChange={e => setRemoveAmount(e.target.value)} placeholder="Ex: 50" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit', fontSize: '1.2rem' }} />
                  </div>
                  <div style={{ marginBottom: '2rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Justificativa (Motivo)</label>
                    <input type="text" value={removeReason} onChange={e => setRemoveReason(e.target.value)} placeholder="Ex: Lançamento incorreto, punição, etc." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }} />
                  </div>
                  <button className="login-btn" onClick={handleRemoveXp} style={{ width: '100%', justifyContent: 'center', background: 'var(--accent-red)', color: 'white', border: 'none' }}>
                    Confirmar Remoção de XP
                  </button>
                </>
              )}
            </div>

            {/* Lado Direito: Histórico */}
            <div style={{ flex: 1, borderLeft: '1px solid var(--border-glass)', paddingLeft: '2rem', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <History size={18} /> Histórico de XP
                </h3>
                <button onClick={() => setSelectedStudent(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <X size={24} />
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {loadingHistory ? (
                  <p style={{ color: 'var(--text-secondary)' }}>Carregando histórico...</p>
                ) : xpHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)', opacity: 0.6 }}>
                    Nenhum XP registrado ainda.
                  </div>
                ) : (
                  xpHistory.map((log) => (
                    <div key={log.logId} style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', borderLeft: `3px solid ${log.xpGained >= 0 ? 'var(--gold-primary)' : 'var(--accent-red)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                        <div>
                          <strong style={{ fontSize: '0.95rem' }}>{log.evalName}</strong>
                          {log.justification && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                              Motivo: {log.justification}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ color: log.xpGained >= 0 ? 'var(--gold-primary)' : 'var(--accent-red)', fontWeight: 'bold' }}>
                            {log.xpGained > 0 ? '+' : ''}{log.xpGained} XP
                          </span>
                          
                          {/* Botão de Apagar do Histórico (Admin/Professores) */}
                          <button 
                            onClick={() => handleDeleteHistoryLog(log.logId, log.xpGained)} 
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.2rem' }}
                            title="Apagar este registro"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        <span>{log.grade !== undefined ? `Nota base: ${log.grade}` : ''}</span>
                        <span>{log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleDateString('pt-BR') : 'Agora'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
