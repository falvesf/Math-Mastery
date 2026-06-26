import { useState, useEffect } from 'react';
import { ShieldAlert, Users, BookOpen, Settings, LogOut, ArrowLeft, Plus, Star, X, GraduationCap, History, Trash2, Edit2, Medal, Swords, Save, Image as ImageIcon, Clock, Search, Store, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type UserData } from '../contexts/AuthContext';
import { signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, addDoc, serverTimestamp, getDoc, deleteDoc } from 'firebase/firestore';
import { getRankForXp } from '../lib/ranks';
import { DEFAULT_EVALUATIONS, type EvaluationType } from '../lib/evaluations';
import ImageGalleryModal from '../components/ImageGalleryModal';
import AdminStoreManager from '../components/AdminStoreManager';
import AdminRankManager from '../components/AdminRankManager';

export interface ClassDef {
  id: string;
  name: string;
  color: string;
}

export interface QuestOption {
  text: string;
  imageUrl?: string;
}

export interface QuestQuestion {
  title: string;
  imageUrl?: string;
  timeLimit: number; // Em segundos
  options: QuestOption[];
  correctIndex: number;
}

export interface QuestDef {
  id: string;
  title: string;
  description: string;
  coverImageUrl?: string;
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
  const [editRole, setEditRole] = useState('student');

  // Novos States - Filtros e Seleção em Massa
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedClassTab, setSelectedClassTab] = useState('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSortBy, setStudentSortBy] = useState<'xp' | 'name' | 'class'>('xp');
  const [studentSortOrder, setStudentSortOrder] = useState<'desc' | 'asc'>('desc');
  
  // XP em Massa
  const [isBulkXpModalOpen, setIsBulkXpModalOpen] = useState(false);
  const [bulkXpAction, setBulkXpAction] = useState<'add' | 'remove'>('add');
  const [bulkXpAmount, setBulkXpAmount] = useState('');
  const [bulkXpReason, setBulkXpReason] = useState('');
  
  // Apagar Aluno
  const [deletingStudent, setDeletingStudent] = useState<UserData | null>(null);

  // Config States
  // Config States
  const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
  const [editingEvalId, setEditingEvalId] = useState<string | null>(null);
  const [newEvalName, setNewEvalName] = useState('');
  const [newEvalWeight, setNewEvalWeight] = useState('');
  
  // Turmas States
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState('#3b82f6');

  // Missões States
  const [isCreatingQuest, setIsCreatingQuest] = useState(false);
  const [isQuestHistoryModalOpen, setIsQuestHistoryModalOpen] = useState(false);
  const [selectedQuestForHistory, setSelectedQuestForHistory] = useState<QuestDef | null>(null);
  const [questHistoryAttempts, setQuestHistoryAttempts] = useState<any[]>([]);
  const [editingQuestId, setEditingQuestId] = useState<string | null>(null);
  const [questTitle, setQuestTitle] = useState('');
  const [questDesc, setQuestDesc] = useState('');
  const [questCover, setQuestCover] = useState('');
  const [questXp, setQuestXp] = useState('1000');
  const [questRetries, setQuestRetries] = useState(false);
  const [questPenalty, setQuestPenalty] = useState('0');
  const [questQuestions, setQuestQuestions] = useState<QuestQuestion[]>([
    { title: '', imageUrl: '', timeLimit: 30, options: [{text: ''}, {text: ''}, {text: ''}, {text: ''}], correctIndex: 0 }
  ]);
  const [galleryTarget, setGalleryTarget] = useState<string | null>(null);
  const [pixabayKey, setPixabayKey] = useState('');

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

    const apiRef = doc(db, 'settings', 'api');
    const apiSnap = await getDoc(apiRef);
    if (apiSnap.exists()) {
      setPixabayKey(apiSnap.data().pixabayKey || '');
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
    const q = query(collection(db, 'users'));
    const querySnapshot = await getDocs(q);
    const loadedStudents: UserData[] = [];
    querySnapshot.forEach((doc) => {
      loadedStudents.push(doc.data() as UserData);
    });
    // Sort by name
    loadedStudents.sort((a, b) => a.name.localeCompare(b.name));
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
    const newCoins = Math.max(0, (selectedStudent.coins || 0) - xpToRemove);
    const userRef = doc(db, 'users', selectedStudent.uid);
    await updateDoc(userRef, { xp: newXp, coins: newCoins });
    await addDoc(collection(db, 'xp_logs'), {
      studentId: selectedStudent.uid,
      studentName: selectedStudent.name,
      evalName: 'Correção / Remoção de XP',
      justification: removeReason,
      xpGained: -xpToRemove,
      timestamp: serverTimestamp()
    });
    setSelectedStudent({ ...selectedStudent, xp: newXp, coins: newCoins });
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
    const newCoins = (selectedStudent.coins || 0) + xpGained;
    const userRef = doc(db, 'users', selectedStudent.uid);
    await updateDoc(userRef, { xp: newXp, coins: newCoins });
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
    setSelectedStudent({ ...selectedStudent, xp: newXp, coins: newCoins });
    setGrade('');
    fetchStudents(); 
    loadStudentHistoryLocally(selectedStudent.uid);
  };

  const handleDeleteHistoryLog = async (logId: string, xpGained: number) => {
    if (!selectedStudent) return;
    if (window.confirm("Atenção! Você está apagando este registro do histórico. O XP do aluno será recalculado. Deseja continuar?")) {
      await deleteDoc(doc(db, 'xp_logs', logId));
      const newXp = Math.max(0, (selectedStudent.xp || 0) - xpGained);
      const newCoins = Math.max(0, (selectedStudent.coins || 0) - xpGained);
      const userRef = doc(db, 'users', selectedStudent.uid);
      await updateDoc(userRef, { xp: newXp, coins: newCoins });
      setSelectedStudent({ ...selectedStudent, xp: newXp, coins: newCoins });
      fetchStudents();
      loadStudentHistoryLocally(selectedStudent.uid);
    }
  };

  // Avaliações
  const handleAddEvaluation = async () => {
    if (!newEvalName || !newEvalWeight) return;
    const newEval = { id: editingEvalId || Date.now().toString(), name: newEvalName, weight: Number(newEvalWeight) };
    
    let updated;
    if (editingEvalId) {
      updated = evaluations.map(e => e.id === editingEvalId ? newEval : e);
    } else {
      updated = [...evaluations, newEval];
    }
    
    setEvaluations(updated);
    setEditingEvalId(null);
    setNewEvalName('');
    setNewEvalWeight('');
    await setDoc(doc(db, 'settings', 'evaluations'), { types: updated });
  };

  const handleEditEvaluation = (ev: EvaluationType) => {
    setEditingEvalId(ev.id);
    setNewEvalName(ev.name);
    setNewEvalWeight(ev.weight.toString());
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

  // Editar Aluno / Usuário
  const openEditModal = (student: UserData) => {
    setEditingStudent(student);
    setEditName(student.name || '');
    setEditClass(student.classId || '');
    setEditRole(student.role || 'student');
  };

  const handleSaveStudent = async () => {
    if (!editingStudent) return;
    const userRef = doc(db, 'users', editingStudent.uid);
    const updateData: any = { name: editName, classId: editClass, role: editRole };
    
    // Promovendo para equipe concede 50k XP
    if (editRole !== 'student' && editingStudent.role === 'student') {
      updateData.xp = 50000;
      updateData.coins = Math.max(50000, editingStudent.coins || 0);
    }
    
    await updateDoc(userRef, updateData);
    setEditingStudent(null);
    fetchStudents();
  };

  const handleDeleteStudent = async () => {
    if (!deletingStudent) return;
    try {
      await deleteDoc(doc(db, 'users', deletingStudent.uid));
      // NOTA: Em um sistema real em produção via Firebase Auth, não conseguimos deletar a conta Auth pelo cliente.
      // O usuário seria recriado ao logar, então você pode adicionar uma flag `disabled` ou rodar isso numa Cloud Function.
      // Para os fins deste projeto, deletamos o documento.
      setDeletingStudent(null);
      fetchStudents();
    } catch (e) {
      console.error(e);
      alert('Erro ao excluir usuário');
    }
  };

  const handleBulkXp = async () => {
    if (selectedStudentIds.length === 0 || !bulkXpAmount || !bulkXpReason) return;
    const xpChange = parseInt(bulkXpAmount);
    if (isNaN(xpChange) || xpChange <= 0) return;

    for (const uid of selectedStudentIds) {
      const student = students.find(s => s.uid === uid);
      if (!student) continue;

      let newXp, newCoins, gain;
      if (bulkXpAction === 'add') {
        gain = xpChange;
        newXp = (student.xp || 0) + gain;
        newCoins = (student.coins || 0) + gain;
      } else {
        gain = -xpChange;
        newXp = Math.max(0, (student.xp || 0) + gain);
        newCoins = Math.max(0, (student.coins || 0) + gain);
      }

      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { xp: newXp, coins: newCoins });
      await addDoc(collection(db, 'xp_logs'), {
        studentId: uid,
        studentName: student.name,
        evalName: 'Ação em Massa',
        justification: bulkXpReason,
        xpGained: gain,
        timestamp: serverTimestamp()
      });
    }

    setIsBulkXpModalOpen(false);
    setBulkXpAmount('');
    setBulkXpReason('');
    setSelectedStudentIds([]);
    fetchStudents();
  };

  // Missões Handlers
  const handleAddQuestion = () => {
    setQuestQuestions([...questQuestions, { title: '', imageUrl: '', timeLimit: 30, options: [{text: ''}, {text: ''}, {text: ''}, {text: ''}], correctIndex: 0 }]);
  };

  const handleUpdateQuestion = (index: number, field: keyof QuestQuestion, value: any) => {
    const updated = [...questQuestions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestQuestions(updated);
  };

  const handleUpdateOption = (qIndex: number, optIndex: number, field: keyof QuestOption, value: string) => {
    const updated = [...questQuestions];
    updated[qIndex].options[optIndex] = { ...updated[qIndex].options[optIndex], [field]: value };
    setQuestQuestions(updated);
  };

  const handleSaveQuest = async () => {
    if (!questTitle || questQuestions.length === 0) return;
    const questId = editingQuestId || Date.now().toString();
    const newQuest: QuestDef = {
      id: questId,
      title: questTitle,
      description: questDesc,
      coverImageUrl: questCover,
      baseXp: parseInt(questXp) || 0,
      allowRetries: questRetries,
      xpPenaltyPerRetry: questRetries ? (parseInt(questPenalty) || 0) : 0,
      questions: questQuestions,
      active: true
    };
    await setDoc(doc(db, 'quests', questId), newQuest);
    setIsCreatingQuest(false);
    setEditingQuestId(null);
    setQuestTitle(''); setQuestDesc(''); setQuestCover(''); setQuestXp('1000'); setQuestRetries(false); setQuestPenalty('0');
    setQuestQuestions([{ title: '', imageUrl: '', timeLimit: 30, options: [{text: ''}, {text: ''}, {text: ''}, {text: ''}], correctIndex: 0 }]);
    fetchQuests();
  };

  const handleEditQuest = (quest: QuestDef) => {
    setEditingQuestId(quest.id);
    setQuestTitle(quest.title);
    setQuestDesc(quest.description);
    setQuestCover(quest.coverImageUrl || '');
    setQuestXp(quest.baseXp.toString());
    setQuestRetries(quest.allowRetries);
    setQuestPenalty((quest.xpPenaltyPerRetry || 0).toString());
    setQuestQuestions(quest.questions);
    setIsCreatingQuest(true);
  };

  const openQuestHistory = async (quest: QuestDef) => {
    setSelectedQuestForHistory(quest);
    setIsQuestHistoryModalOpen(true);
    setLoading(true);
    
    const attemptsRef = collection(db, 'quest_attempts');
    const q = query(attemptsRef, where('questId', '==', quest.id));
    const snap = await getDocs(q);
    
    const loaded: any[] = [];
    snap.forEach(d => {
      loaded.push({ id: d.id, ...d.data() });
    });
    
    setQuestHistoryAttempts(loaded);
    setLoading(false);
  };

  const handleResetQuestAttempt = async (attemptId: string) => {
    if (!confirm('Deseja realmente RESETAR o desafio para este aluno? Ele poderá fazer a missão novamente. O XP ganho anteriormente não será removido automaticamente.')) return;
    await deleteDoc(doc(db, 'quest_attempts', attemptId));
    setQuestHistoryAttempts(prev => prev.filter(a => a.id !== attemptId));
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

  const handleGallerySelect = (url: string) => {
    if (galleryTarget === 'cover') setQuestCover(url);
    else if (galleryTarget?.startsWith('question-')) {
      const qIndex = parseInt(galleryTarget.split('-')[1]);
      handleUpdateQuestion(qIndex, 'imageUrl', url);
    } else if (galleryTarget?.startsWith('option-')) {
      const [, qIndexStr, optIndexStr] = galleryTarget.split('-');
      handleUpdateOption(parseInt(qIndexStr), parseInt(optIndexStr), 'imageUrl', url);
    }
    setGalleryTarget(null);
  };



  return (
    <div className="app-container" style={{ maxWidth: '1400px', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '1rem 2rem' }}>
      <nav className="navbar glass-panel" style={{ marginBottom: '1rem', flexShrink: 0 }}>
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

      <div style={{ display: 'flex', gap: '1.5rem', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div className="glass-panel" style={{ width: '250px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', flexShrink: 0 }}>
          <button className={`login-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'users' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'users' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
            <Users size={20} /> Alunos & Notas
          </button>
          <button className={`login-btn ${activeTab === 'quests' ? 'active' : ''}`} onClick={() => setActiveTab('quests')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'quests' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'quests' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
            <Swords size={20} /> Missões (Quizzes)
          </button>
          <button className={`login-btn ${activeTab === 'store' ? 'active' : ''}`} onClick={() => setActiveTab('store')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'store' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'store' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
            <Store size={20} /> Loja de Itens
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
        <div className="glass-panel" id="admin-content-scroll" style={{ flex: 1, padding: '2rem', overflowY: 'auto', position: 'relative' }}>
          
          {/* Aba de Usuários */}
          {activeTab === 'users' && (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'rgba(30, 41, 59, 0.95)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Gerenciamento de Usuários</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Controle de alunos, turmas e equipe escolar.</p>
                </div>
                
                {selectedStudentIds.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(251, 191, 36, 0.1)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--gold-primary)' }}>
                    <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>{selectedStudentIds.length} selecionados</span>
                    <button 
                      className="login-btn" 
                      onClick={() => setIsBulkXpModalOpen(true)}
                      style={{ background: 'var(--gold-primary)', color: 'black', border: 'none', padding: '0.5rem 1rem' }}
                    >
                      <Star size={18} style={{ marginRight: '0.5rem' }} /> XP em Massa
                    </button>
                    <button 
                      onClick={() => setSelectedStudentIds([])}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      <X size={20} />
                    </button>
                  </div>
                )}
              </div>

              {/* Filtros e Busca */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexDirection: 'column' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flex: '1 1 300px' }}>
                    <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                      type="text" 
                      placeholder="Buscar por nome..." 
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontSize: '1.1rem' }}
                    />
                  </div>
                  <select 
                    value={studentSortBy} 
                    onChange={e => setStudentSortBy(e.target.value as any)}
                    style={{ padding: '0 1rem', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}
                  >
                    <option value="xp">Por XP</option>
                    <option value="name">Por Nome</option>
                    <option value="class">Por Turma</option>
                  </select>
                  <select 
                    value={studentSortOrder} 
                    onChange={e => setStudentSortOrder(e.target.value as any)}
                    style={{ padding: '0 1rem', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}
                  >
                    <option value="desc">Descendente</option>
                    <option value="asc">Ascendente</option>
                  </select>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                  <button 
                    onClick={() => setSelectedClassTab('all')}
                    style={{ padding: '0.5rem 1.5rem', borderRadius: '20px', border: '1px solid var(--border-glass)', background: selectedClassTab === 'all' ? 'var(--gold-primary)' : 'rgba(255,255,255,0.05)', color: selectedClassTab === 'all' ? 'black' : 'white', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 'bold' }}
                  >
                    Todos
                  </button>
                  <button 
                    onClick={() => setSelectedClassTab('staff')}
                    style={{ padding: '0.5rem 1.5rem', borderRadius: '20px', border: '1px solid var(--border-glass)', background: selectedClassTab === 'staff' ? 'var(--accent-red)' : 'rgba(255,255,255,0.05)', color: selectedClassTab === 'staff' ? 'white' : 'white', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 'bold' }}
                  >
                    Equipe (Prof/Admin)
                  </button>
                  {schoolClasses.map(cls => (
                    <button 
                      key={cls.id}
                      onClick={() => setSelectedClassTab(cls.name)}
                      style={{ padding: '0.5rem 1.5rem', borderRadius: '20px', border: `1px solid ${cls.color}`, background: selectedClassTab === cls.name ? cls.color : 'rgba(255,255,255,0.05)', color: selectedClassTab === cls.name ? 'black' : 'white', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 'bold' }}
                    >
                      {cls.name}
                    </button>
                  ))}
                  <button 
                    onClick={() => setSelectedClassTab('unassigned')}
                    style={{ padding: '0.5rem 1.5rem', borderRadius: '20px', border: '1px solid var(--text-secondary)', background: selectedClassTab === 'unassigned' ? 'var(--text-secondary)' : 'rgba(255,255,255,0.05)', color: selectedClassTab === 'unassigned' ? 'black' : 'white', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 'bold' }}
                  >
                    Sem Turma
                  </button>
                </div>
                </div>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Carregando usuários do banco de dados...</div>
              ) : students.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', border: '1px dashed var(--border-glass)', borderRadius: '8px' }}>
                  <GraduationCap size={48} color="var(--text-secondary)" style={{ opacity: 0.5, margin: '0 auto 1rem auto' }} />
                  <h3>Nenhum usuário logou no sistema ainda</h3>
                  <p style={{ color: 'var(--text-secondary)' }}>Os alunos da instituição devem fazer o primeiro acesso via Google para aparecerem aqui.</p>
                </div>
              ) : (() => {
                const filteredStudents = students.filter(student => {
                  const matchesSearch = student.name.toLowerCase().includes(studentSearch.toLowerCase());
                  
                  let matchesTab = true;
                  if (selectedClassTab === 'staff') {
                    matchesTab = student.role !== 'student';
                  } else if (selectedClassTab === 'unassigned') {
                    matchesTab = !student.classId && student.role === 'student';
                  } else if (selectedClassTab === 'all') {
                    matchesTab = student.role === 'student';
                  } else {
                    matchesTab = student.classId === selectedClassTab && student.role === 'student';
                  }

                  return matchesSearch && matchesTab;
                });

                filteredStudents.sort((a, b) => {
                  let comparison = 0;
                  if (studentSortBy === 'xp') {
                    comparison = (a.xp || 0) - (b.xp || 0);
                  } else if (studentSortBy === 'name') {
                    comparison = a.name.localeCompare(b.name);
                  } else if (studentSortBy === 'class') {
                    const classA = a.classId || '';
                    const classB = b.classId || '';
                    comparison = classA.localeCompare(classB);
                  }
                  
                  return studentSortOrder === 'desc' ? -comparison : comparison;
                });

                if (filteredStudents.length === 0) {
                  return <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Nenhum usuário encontrado para estes filtros.</div>;
                }

                return (
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {filteredStudents.map(student => {
                      const currentRank = getRankForXp(student.xp || 0);
                      const sClass = schoolClasses.find(c => c.name === student.classId);
                      const classColor = sClass ? sClass.color : 'var(--text-secondary)';
                      const isSelected = selectedStudentIds.includes(student.uid);

                      return (
                        <div key={student.uid} className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', background: isSelected ? 'rgba(251, 191, 36, 0.05)' : 'rgba(255,255,255,0.02)', border: isSelected ? '1px solid var(--gold-primary)' : '1px solid transparent' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedStudentIds([...selectedStudentIds, student.uid]);
                                else setSelectedStudentIds(selectedStudentIds.filter(id => id !== student.uid));
                              }}
                              style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                            />
                            <img src={student.photoURL} alt="" style={{ width: 48, height: 48, borderRadius: '50%', border: `2px solid ${currentRank.color}` }} />
                            <div>
                              <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {student.name}
                                {student.role !== 'student' && (
                                  <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem', background: 'var(--accent-red)', borderRadius: '12px', color: 'white', textTransform: 'uppercase' }}>
                                    {student.role === 'admin' ? 'Admin' : student.role === 'teacher' ? 'Professor' : 'Coord.'}
                                  </span>
                                )}
                              </h3>
                              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                                {student.role === 'student' && (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: classColor }}>
                                    <BookOpen size={14} /> {student.classId || 'Sem Turma'}
                                  </span>
                                )}
                                <span style={{ color: currentRank.color, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><ShieldAlert size={14} /> {currentRank.name}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--gold-primary)' }}><Star size={14} /> {student.xp || 0} XP</span>
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button 
                              className="login-btn" 
                              onClick={() => openEditModal(student)}
                              style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderColor: 'transparent' }}
                              title="Editar/Promover Usuário"
                            >
                              <Edit2 size={18} />
                            </button>
                            {student.role === 'student' && (
                              <button 
                                className="login-btn" 
                                onClick={() => setSelectedStudent(student)}
                                style={{ borderColor: 'var(--gold-primary)', color: 'var(--gold-primary)', background: 'rgba(251, 191, 36, 0.1)' }}
                                title="Gerenciar XP"
                              >
                                <Star size={18} />
                              </button>
                            )}
                            <button 
                              className="login-btn" 
                              onClick={() => setDeletingStudent(student)}
                              style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)', borderColor: 'transparent' }}
                              title="Excluir Usuário"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Aba de Missões (Quizzes) */}
          {activeTab === 'quests' && (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
              {!isCreatingQuest ? (
                <>
                  <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'rgba(30, 41, 59, 0.95)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Central de Missões</h2>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Crie desafios ao estilo Kahoot para os alunos faturarem XP.</p>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                          {quest.coverImageUrl ? (
                            <img src={quest.coverImageUrl} alt="Capa" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
                          ) : (
                            <div style={{ width: '80px', height: '80px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.1)' }}>
                              <Swords size={32} color="var(--text-secondary)" />
                            </div>
                          )}
                          <div>
                            <h3 style={{ fontSize: '1.3rem', margin: '0 0 0.5rem 0' }}>{quest.title}</h3>
                            <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                              <span>Recompensa: <strong style={{ color: 'var(--gold-primary)' }}>{quest.baseXp} XP</strong></span>
                              <span>Modo: {quest.allowRetries ? `Vidas Extras` : 'Hardcore'}</span>
                              <span>{quest.questions.length} Perguntas</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                          <button onClick={() => openQuestHistory(quest)} style={{ background: 'transparent', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }} title="Ver Histórico">
                            <History size={18} /> Histórico
                          </button>
                          <button onClick={() => handleEditQuest(quest)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.5rem' }} title="Editar Missão">
                            <Edit2 size={20} />
                          </button>
                          <button onClick={() => handleToggleQuestActive(quest.id, quest.active)} style={{ background: quest.active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)', color: quest.active ? 'var(--accent-green)' : 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                            {quest.active ? 'Ativa (Visível)' : 'Rascunho (Oculta)'}
                          </button>
                          <button onClick={() => handleDeleteQuest(quest.id)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.5rem' }} title="Excluir Missão">
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
                    <h2 style={{ fontSize: '1.8rem', margin: 0 }}>{editingQuestId ? 'Editar Missão' : 'Criar Nova Missão (Estilo Kahoot)'}</h2>
                    <button className="login-btn" onClick={() => { setIsCreatingQuest(false); setEditingQuestId(null); }} style={{ background: 'transparent', border: '1px solid var(--border-glass)' }}>
                      Cancelar
                    </button>
                  </div>

                  <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                      
                      {/* Lado Esquerdo: Textos */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome da Missão</label>
                          <input type="text" value={questTitle} onChange={e => setQuestTitle(e.target.value)} placeholder="Ex: A Masmorra das Frações" style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit', fontSize: '1.2rem' }} />
                        </div>
                        
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Descrição (Lore da Missão)</label>
                          <textarea value={questDesc} onChange={e => setQuestDesc(e.target.value)} rows={3} style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }} placeholder="Um monstro apareceu! Resolva os problemas para derrotá-lo..."></textarea>
                        </div>

                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>Recompensa Base de XP</label>
                          <input type="number" value={questXp} onChange={e => setQuestXp(e.target.value)} style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--gold-primary)', color: 'white', fontFamily: 'inherit', fontSize: '1.2rem' }} />
                        </div>
                      </div>

                      {/* Lado Direito: Imagem e Configs */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Imagem de Capa (Opcional - Cole uma URL de imagem)</label>
                          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                            <input type="text" value={questCover} onChange={e => setQuestCover(e.target.value)} placeholder="URL ou Galeria ->" style={{ flex: 1, padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }} />
                            <button onClick={() => setGalleryTarget('cover')} style={{ background: 'var(--gold-primary)', color: 'black', border: 'none', padding: '0 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                              <Search size={20} />
                            </button>
                          </div>
                          {questCover && (
                            <div style={{ width: '100%', height: '200px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <img src={questCover} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                            </div>
                          )}
                        </div>

                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Modo de Jogo</label>
                          <select value={questRetries ? 'vidas' : 'hardcore'} onChange={e => setQuestRetries(e.target.value === 'vidas')} style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit', fontSize: '1.1rem' }}>
                            <option value="hardcore">Tentativa Única (Errou, falhou a missão)</option>
                            <option value="vidas">Vidas Extras (Pode tentar novamente com penalidade)</option>
                          </select>
                        </div>

                        {questRetries && (
                          <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid var(--accent-red)' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--accent-red)', fontWeight: 'bold' }}>Penalidade de XP por cada erro</label>
                            <input type="number" value={questPenalty} onChange={e => setQuestPenalty(e.target.value)} placeholder="Ex: 50" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--accent-red)', color: 'white', fontFamily: 'inherit' }} />
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Perguntas do Desafio</h3>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Deixe o texto e a imagem em branco se quiser ocultar uma opção (mínimo de 2 opções).</p>
                  </div>
                  
                  {questQuestions.map((q, qIndex) => (
                    <div key={qIndex} className="glass-panel" style={{ padding: '2.5rem 2rem 2rem 2rem', marginBottom: '2rem', position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '-15px', left: '20px', background: 'var(--accent-blue)', padding: '0.2rem 1.5rem', borderRadius: '20px', fontWeight: 'bold', fontSize: '1.1rem' }}>
                        Pergunta {qIndex + 1}
                      </div>

                      {/* Configurações da Pergunta: Texto, Tempo e Imagem */}
                      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          <input 
                            type="text" 
                            value={q.title} 
                            onChange={e => handleUpdateQuestion(qIndex, 'title', e.target.value)} 
                            placeholder="Digite o enigma ou pergunta aqui..." 
                            style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit', fontSize: '1.2rem' }} 
                          />
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <ImageIcon size={20} color="var(--text-secondary)" />
                            <input 
                              type="text" 
                              value={q.imageUrl || ''} 
                              onChange={e => handleUpdateQuestion(qIndex, 'imageUrl', e.target.value)} 
                              placeholder="URL ou Galeria ->" 
                              style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px dashed var(--border-glass)', color: 'white', fontFamily: 'inherit' }} 
                            />
                            <button onClick={() => setGalleryTarget(`question-${qIndex}`)} style={{ background: 'var(--gold-primary)', color: 'black', border: 'none', padding: '0.75rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                              <Search size={18} />
                            </button>
                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                            <Clock size={18} /> Tempo (Segundos)
                          </label>
                          <input 
                            type="number" 
                            value={q.timeLimit} 
                            onChange={e => handleUpdateQuestion(qIndex, 'timeLimit', parseInt(e.target.value) || 0)} 
                            style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--accent-red)', color: 'white', fontFamily: 'inherit', fontSize: '1.2rem', textAlign: 'center' }} 
                          />
                        </div>
                      </div>

                      {q.imageUrl && (
                        <div style={{ width: '100%', height: '200px', marginBottom: '1.5rem', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
                          <img src={q.imageUrl} alt="Imagem da pergunta" style={{ width: '100%', height: '100%', objectFit: 'contain', background: 'rgba(0,0,0,0.5)' }} />
                        </div>
                      )}

                      {/* Opções */}
                      <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Alternativas (Mínimo de 2)</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {q.options.map((opt, optIndex) => (
                          <div key={optIndex} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: q.correctIndex === optIndex ? 'rgba(16, 185, 129, 0.2)' : 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: q.correctIndex === optIndex ? '2px solid var(--accent-green)' : '1px solid transparent' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              <input 
                                type="radio" 
                                name={`correct-${qIndex}`} 
                                checked={q.correctIndex === optIndex}
                                onChange={() => handleUpdateQuestion(qIndex, 'correctIndex', optIndex)}
                                style={{ width: '24px', height: '24px', cursor: 'pointer' }}
                              />
                              <input 
                                type="text" 
                                value={opt.text} 
                                onChange={e => handleUpdateOption(qIndex, optIndex, 'text', e.target.value)}
                                placeholder={`Texto da Opção ${['A', 'B', 'C', 'D'][optIndex]} (Deixe vazio p/ ocultar)`}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontFamily: 'inherit' }}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', paddingLeft: '2.5rem' }}>
                              <input 
                                type="text" 
                                value={opt.imageUrl || ''} 
                                onChange={e => handleUpdateOption(qIndex, optIndex, 'imageUrl', e.target.value)}
                                placeholder={`URL / Galeria ->`}
                                style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: '0.85rem' }}
                              />
                              <button onClick={() => setGalleryTarget(`option-${qIndex}-${optIndex}`)} style={{ background: 'var(--gold-primary)', color: 'black', border: 'none', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                <Search size={14} />
                              </button>
                            </div>
                            {opt.imageUrl && (
                              <div style={{ paddingLeft: '2.5rem', marginTop: '0.5rem' }}>
                                <img src={opt.imageUrl} alt="" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-glass)' }} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                    <button className="login-btn" onClick={handleAddQuestion} style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: '1px dashed var(--border-glass)' }}>
                      <Plus size={18} style={{ marginRight: '0.5rem' }} /> Adicionar Nova Pergunta
                    </button>
                    <button className="login-btn" onClick={handleSaveQuest} style={{ flex: 2, background: 'var(--gold-primary)', color: 'black', border: 'none' }}>
                      <Save size={18} style={{ marginRight: '0.5rem' }} /> Salvar Missão
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aba de Turmas */}
          {activeTab === 'classes' && (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'rgba(30, 41, 59, 0.95)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Gerenciamento de Turmas</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', marginTop: 0 }}>Crie turmas para agrupar os alunos e gerar Rankings exclusivos.</p>
              
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
              <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'rgba(30, 41, 59, 0.95)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Configurações do Sistema</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Ajuste pesos das notas e integrações externas.</p>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Tipos de Avaliação</h3>
                <button 
                  className="login-btn" 
                  onClick={() => { setEditingEvalId(null); setNewEvalName(''); setNewEvalWeight(''); setIsEvalModalOpen(true); }}
                  style={{ background: 'var(--gold-primary)', color: 'black', border: 'none', padding: '0.5rem 1rem' }}
                >
                  <Plus size={18} style={{ marginRight: '0.5rem' }} /> Adicionar
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
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => { handleEditEvaluation(ev); setIsEvalModalOpen(true); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.5rem' }} title="Editar">
                        <Edit2 size={20} />
                      </button>
                      <button onClick={() => handleRemoveEvaluation(ev.id)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.5rem' }} title="Excluir">
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aba Ranks */}
          {activeTab === 'ranks' && (
            <AdminRankManager pixabayKey={pixabayKey} />
          )}
          {/* Aba Loja */}
          {activeTab === 'store' && (
            <AdminStoreManager pixabayKey={pixabayKey} />
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
              <select value={editClass} onChange={e => setEditClass(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit', marginBottom: '1rem' }}>
                <option value="">Sem Turma</option>
                {schoolClasses.map(cls => (
                  <option key={cls.id} value={cls.name}>{cls.name}</option>
                ))}
              </select>

              {userData?.role === 'admin' && (
                <>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Permissão no Sistema (Role)</label>
                  <select value={editRole} onChange={e => setEditRole(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--accent-red)', color: 'white', fontFamily: 'inherit' }}>
                    <option value="student">Aluno (Padrão)</option>
                    <option value="teacher">Professor</option>
                    <option value="coordinator">Coordenador</option>
                    <option value="admin">Administrador (Super)</option>
                  </select>
                </>
              )}
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
      )}      {/* Modal Apagar Aluno */}
      {deletingStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-panel" style={{ width: '450px', padding: '2rem', animation: 'slideUp 0.3s ease-out', textAlign: 'center' }}>
            <Trash2 size={48} color="var(--accent-red)" style={{ margin: '0 auto 1.5rem auto' }} />
            <h3 style={{ fontSize: '1.5rem', margin: '0 0 1rem 0' }}>Excluir {deletingStudent.name}?</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: '1.5' }}>
              Atenção: Esta ação apagará permanentemente o XP, itens, moedas e histórico deste usuário. Essa ação <strong>não</strong> pode ser desfeita. Deseja continuar?
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setDeletingStudent(null)} style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'white', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleDeleteStudent} style={{ flex: 1, padding: '0.75rem', background: 'var(--accent-red)', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Bulk XP */}
      {isBulkXpModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-panel" style={{ width: '500px', padding: '2rem', animation: 'slideUp 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Star size={24} /> XP em Massa
              </h3>
              <button onClick={() => setIsBulkXpModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Você está alterando o XP de <strong>{selectedStudentIds.length} alunos</strong> ao mesmo tempo.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: '8px' }}>
              <button onClick={() => setBulkXpAction('add')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: bulkXpAction === 'add' ? 'rgba(255,255,255,0.1)' : 'transparent', color: bulkXpAction === 'add' ? 'white' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontWeight: bulkXpAction === 'add' ? 'bold' : 'normal' }}>
                Adicionar XP
              </button>
              <button onClick={() => setBulkXpAction('remove')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: bulkXpAction === 'remove' ? 'rgba(239, 68, 68, 0.2)' : 'transparent', color: bulkXpAction === 'remove' ? 'var(--accent-red)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontWeight: bulkXpAction === 'remove' ? 'bold' : 'normal' }}>
                Retirar XP
              </button>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Quantidade de XP</label>
              <input type="number" value={bulkXpAmount} onChange={e => setBulkXpAmount(e.target.value)} placeholder="Ex: 500" style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit', fontSize: '1.2rem' }} />
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Justificativa (Aparecerá no histórico de todos)</label>
              <input type="text" value={bulkXpReason} onChange={e => setBulkXpReason(e.target.value)} placeholder="Ex: Vitória no Desafio das Frações" style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }} />
            </div>

            <button className="login-btn" onClick={handleBulkXp} style={{ width: '100%', justifyContent: 'center', background: bulkXpAction === 'add' ? 'var(--gold-primary)' : 'var(--accent-red)', color: bulkXpAction === 'add' ? 'black' : 'white', border: 'none' }}>
              Confirmar para {selectedStudentIds.length} Alunos
            </button>
          </div>
        </div>
      )}

      {galleryTarget && (
        <ImageGalleryModal 
          onClose={() => setGalleryTarget(null)}
          onSelectImage={handleGallerySelect}
        />
      )}

      {isEvalModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-panel" style={{ width: '400px', padding: '2rem', animation: 'slideUp 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>{editingEvalId ? 'Editar Avaliação' : 'Nova Avaliação'}</h3>
              <button onClick={() => { setIsEvalModalOpen(false); setEditingEvalId(null); setNewEvalName(''); setNewEvalWeight(''); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome da Atividade</label>
              <input type="text" value={newEvalName} onChange={e => setNewEvalName(e.target.value)} placeholder="Ex: Tarefa de Casa" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }} />
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Multiplicador (Peso)</label>
              <input type="number" value={newEvalWeight} onChange={e => setNewEvalWeight(e.target.value)} placeholder="Ex: 50" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }} />
            </div>

            <button className="login-btn" onClick={() => { handleAddEvaluation(); setIsEvalModalOpen(false); }} style={{ width: '100%', justifyContent: 'center', background: 'var(--gold-primary)', color: 'var(--bg-dark)', border: 'none' }}>
              {editingEvalId ? 'Salvar Alterações' : 'Criar Avaliação'}
            </button>
          </div>
        </div>
      )}

      {/* Modal Histórico de Missão */}
      {isQuestHistoryModalOpen && selectedQuestForHistory && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', animation: 'slideUp 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <div>
                <h2 style={{ fontSize: '1.8rem', margin: '0 0 0.5rem 0' }}>Histórico: {selectedQuestForHistory.title}</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Respostas e desempenho dos alunos</p>
              </div>
              <button onClick={() => setIsQuestHistoryModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            {loading ? (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando histórico...</p>
            ) : questHistoryAttempts.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Nenhum aluno tentou esta missão ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {(() => {
                  const groups = new Map<string, any[]>();
                  
                  questHistoryAttempts.forEach(attempt => {
                    const student = students.find(s => s.uid === attempt.studentId);
                    let classIdentifier = 'unassigned';
                    // student.classId actually stores the string NAME of the class (e.g. "6º ano A"), not the auto-generated ID
                    if (student?.classId && schoolClasses.some(c => c.name === student.classId)) {
                      classIdentifier = student.classId;
                    }
                    if (!groups.has(classIdentifier)) groups.set(classIdentifier, []);
                    groups.get(classIdentifier)!.push(attempt);
                  });

                  return [...schoolClasses.map(c => c.name), 'unassigned'].map(clsName => {
                    const attemptsInClass = groups.get(clsName) || [];
                    
                    if (attemptsInClass.length === 0) return null;

                    const clsInfo = schoolClasses.find(c => c.name === clsName) || { name: 'Sem Turma / Desconhecidos', color: '#94a3b8' };

                    return (
                      <div key={clsName} style={{ background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px', border: `1px solid ${clsInfo.color}` }}>
                        <h3 style={{ margin: '0 0 1rem 0', color: clsInfo.color, borderBottom: `1px solid ${clsInfo.color}`, paddingBottom: '0.5rem' }}>{clsInfo.name}</h3>
                        
                        <div style={{ display: 'grid', gap: '1rem' }}>
                          {attemptsInClass.map(attempt => {
                            const student = students.find(s => s.uid === attempt.studentId);
                            const dateStr = attempt.timestamp ? new Date(attempt.timestamp.seconds * 1000).toLocaleString('pt-BR') : 'Data desconhecida';
                            
                            return (
                              <div key={attempt.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', borderLeft: `4px solid ${attempt.status === 'completed' ? 'var(--accent-green)' : 'var(--accent-red)'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                  <div>
                                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem' }}>{student?.name || 'Aluno Desconhecido (Deletado)'}</h4>
                                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                      <span>Data: {dateStr}</span>
                                      <span>Status: <strong style={{ color: attempt.status === 'completed' ? 'var(--accent-green)' : 'var(--accent-red)' }}>{attempt.status === 'completed' ? 'Concluído' : 'Fracassou/Abandonou'}</strong></span>
                                      <span>XP Ganho: <strong style={{ color: 'var(--gold-primary)' }}>{attempt.earnedXp}</strong></span>
                                    </div>
                                  </div>
                                  <button onClick={() => handleResetQuestAttempt(attempt.id)} className="login-btn" style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', padding: '0.5rem 1rem' }} title="Resetar tentativa do aluno">
                                    <RefreshCw size={16} style={{ marginRight: '0.5rem' }} /> Resetar
                                  </button>
                                </div>
                                
                                {attempt.answers && attempt.answers.length > 0 ? (
                                  <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '8px' }}>
                                    <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)' }}>Respostas Selecionadas:</h5>
                                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                      {attempt.answers.map((ans: any, i: number) => (
                                        <li key={i} style={{ color: ans.isCorrect ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                          Questão {ans.qIndex + 1}: {ans.text} {ans.isCorrect ? '✓' : '✗'}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : (
                                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Nenhum detalhe de respostas salvo para esta tentativa.</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
