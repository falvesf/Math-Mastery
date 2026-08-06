import { useState, useEffect } from 'react';
import { ShieldAlert, Users, BookOpen, Settings, LogOut, ArrowLeft, Plus, Star, X, GraduationCap, History, Trash2, Edit2, Medal, Swords, Save, Image as ImageIcon, Clock, Search, Store, RefreshCw, Box, Package, Play, UserCheck, Menu, CircleDollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type UserData } from '../contexts/AuthContext';
import { signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, addDoc, serverTimestamp, getDoc, deleteDoc } from 'firebase/firestore';
import { getRankForXp } from '../lib/ranks';
import { DEFAULT_EVALUATIONS, type EvaluationType } from '../lib/evaluations';
import ImageGalleryModal from '../components/ImageGalleryModal';
import DirectUploadButton from '../components/DirectUploadButton';
import AdminStoreManager from '../components/AdminStoreManager';
import AdminRankManager from '../components/AdminRankManager';
import AdminEntitiesManager from '../components/AdminEntitiesManager';
import AdminEconomySettings from '../components/AdminEconomySettings';
import AvatarCustomizationModal from '../components/AvatarCustomizationModal';
import AvatarCharacter, { type AvatarConfig } from '../components/AvatarCharacter';
import { useDialog } from '../contexts/DialogContext';

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
  monsterName?: string;
  monsterAvatarConfig?: AvatarConfig;
  monsterModelUrl?: string;
  monsterQuotes?: {
    hp100_80?: string;
    hp79_50?: string;
    hp49_25?: string;
    hp24_0?: string;
  };
  monsterDefeatQuotes?: string;
  chestConfig?: {
    maxCoins?: number;
    itemIds?: string[];
    itemQuantities?: number[];
    dropChance?: number;
  };
  mode?: 'classic' | 'live';
  liveChest1stPlace?: { maxCoins?: number; itemIds?: string[]; itemQuantities?: number[]; };
  liveChest2ndPlace?: { maxCoins?: number; itemIds?: string[]; itemQuantities?: number[]; };
  liveChest3rdPlace?: { maxCoins?: number; itemIds?: string[]; itemQuantities?: number[]; };
  monsterDrops?: {
    itemId: string;
    dropChance: number;
  }[];
  active: boolean;
  createdBy?: string;
  creatorRole?: string;
  targetClasses?: string[];
  shuffleQuestions?: boolean;
  shuffleAnswers?: boolean;
}

export default function AdminDashboard() {
  const { showAlert, showConfirm } = useDialog();
  const { userData } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('users');
  const [students, setStudents] = useState<UserData[]>([]);
  const [allUserItems, setAllUserItems] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const [evaluations, setEvaluations] = useState<EvaluationType[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<ClassDef[]>([]);
  const [quests, setQuests] = useState<QuestDef[]>([]);

  // Modal de Lançar Nota States
  const [selectedStudent, setSelectedStudent] = useState<UserData | null>(null);
  const [selectedStudentItems, setSelectedStudentItems] = useState<any[]>([]);
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
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editClassName, setEditClassName] = useState('');
  const [editClassColor, setEditClassColor] = useState('#3b82f6');
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);

  // Missões States
  const [isCreatingQuest, setIsCreatingQuest] = useState(false);
  const [isQuestHistoryModalOpen, setIsQuestHistoryModalOpen] = useState(false);
  const [selectedQuestForHistory, setSelectedQuestForHistory] = useState<QuestDef | null>(null);
  const [questHistoryAttempts, setQuestHistoryAttempts] = useState<any[]>([]);
  const [editingQuestId, setEditingQuestId] = useState<string | null>(null);
  const [questTitle, setQuestTitle] = useState('');
  const [questDesc, setQuestDesc] = useState('');
  const [questCover, setQuestCover] = useState('');
  const [questMode, setQuestMode] = useState<'classic' | 'live'>('classic');
  const [questXp, setQuestXp] = useState('1000');
  const [questRetries, setQuestRetries] = useState(false);
  const [questShuffleQuestions, setQuestShuffleQuestions] = useState(false);
  const [questShuffleAnswers, setQuestShuffleAnswers] = useState(false);
  const [questPenalty, setQuestPenalty] = useState('0');
  const [questQuestions, setQuestQuestions] = useState<QuestQuestion[]>([
    { title: '', imageUrl: '', timeLimit: 30, options: [{text: ''}, {text: ''}, {text: ''}, {text: ''}], correctIndex: 0 }
  ]);

  // Sidebar Mobile State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isUserFiltersOpen, setIsUserFiltersOpen] = useState(false);
  const [questMonsterName, setQuestMonsterName] = useState('');
  const [questMonsterConfig, setQuestMonsterConfig] = useState<AvatarConfig | null>(null);
  const [questMonsterModelUrl, setQuestMonsterModelUrl] = useState('');
  const [questMonsterQuotes, setQuestMonsterQuotes] = useState<{hp100_80?: string, hp79_50?: string, hp49_25?: string, hp24_0?: string}>({});
  const [questMonsterDefeatQuotes, setQuestMonsterDefeatQuotes] = useState('');
  const [questMonsterDrops, setQuestMonsterDrops] = useState<{itemId: string, dropChance: number}[]>([]);
  const [questChestConfig, setQuestChestConfig] = useState<{maxCoins?: number, itemIds?: string[], itemQuantities?: number[], dropChance?: number}>({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1], dropChance: 100 });
  const [questLiveChest1st, setQuestLiveChest1st] = useState<{maxCoins?: number, itemIds?: string[], itemQuantities?: number[]}>({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
  const [questLiveChest2nd, setQuestLiveChest2nd] = useState<{maxCoins?: number, itemIds?: string[], itemQuantities?: number[]}>({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
  const [questLiveChest3rd, setQuestLiveChest3rd] = useState<{maxCoins?: number, itemIds?: string[], itemQuantities?: number[]}>({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
  const [available3DModels, setAvailable3DModels] = useState<any[]>([]);
  const [availableMonsters, setAvailableMonsters] = useState<any[]>([]);
  const [availableStoreItems, setAvailableStoreItems] = useState<any[]>([]);
  const [isCustomizingMonster, setIsCustomizingMonster] = useState(false);
  const [questCreatedBy, setQuestCreatedBy] = useState<string | null>(null);
  const [questCreatorRole, setQuestCreatorRole] = useState<string | null>(null);
  const [questTargetClasses, setQuestTargetClasses] = useState<string[]>([]);
  
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

  const fetch3DModels = async () => {
    const snap = await getDocs(collection(db, '3d_models'));
    const loaded: any[] = [];
    snap.forEach(d => loaded.push({ id: d.id, ...d.data() }));
    setAvailable3DModels(loaded);
  };

  const fetchMonsters = async () => {
    const snap = await getDocs(collection(db, 'monsters'));
    const loaded: any[] = [];
    snap.forEach(d => loaded.push({ id: d.id, ...d.data() }));
    setAvailableMonsters(loaded);
  };

  const fetchStoreItems = async () => {
    const snap = await getDocs(query(collection(db, 'store_items'), where('active', '==', true)));
    const loaded: any[] = [];
    snap.forEach(d => loaded.push({ id: d.id, ...d.data() }));
    setAvailableStoreItems(loaded);
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
    
    // Buscar todos os itens equipados
    const itemsQ = query(collection(db, 'user_items'), where('equipped', '==', true));
    const itemsSnap = await getDocs(itemsQ);
    const itemsMap: Record<string, any[]> = {};
    itemsSnap.forEach(d => {
      const data = d.data();
      if (!itemsMap[data.studentId]) itemsMap[data.studentId] = [];
      itemsMap[data.studentId].push({
        itemId: data.itemId,
        imageUrl: data.itemImageUrl,
        avatarPart: data.avatarPart,
        itemTitle: data.itemTitle,
        itemCategory: data.itemCategory,
        baseAttributeType: data.baseAttributeType,
        baseAttributeValue: data.baseAttributeValue,
        adds: data.adds,
        gameModelUrl: data.gameModelUrl,
        modelTextureUrl: data.modelTextureUrl,
        minecraftHeadValue: data.minecraftHeadValue,
        modelTransforms: data.modelTransforms
      });
    });
    setAllUserItems(itemsMap);
    
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

    // Fetch equipped items for the selected student
    const itemsQ = query(collection(db, 'user_items'), where('studentId', '==', studentUid), where('equipped', '==', true));
    const itemsSnap = await getDocs(itemsQ);
    const eqItems = itemsSnap.docs.map(d => {
      const data = d.data();
      return {
        itemId: data.itemId,
        imageUrl: data.itemImageUrl,
        avatarPart: data.avatarPart,
        itemTitle: data.itemTitle,
        itemCategory: data.itemCategory,
        baseAttributeType: data.baseAttributeType,
        baseAttributeValue: data.baseAttributeValue,
        adds: data.adds,
        gameModelUrl: data.gameModelUrl,
        modelTextureUrl: data.modelTextureUrl,
        minecraftHeadValue: data.minecraftHeadValue,
        modelTransforms: data.modelTransforms
      };
    });
    setSelectedStudentItems(eqItems);

    setLoadingHistory(false);
  };

  useEffect(() => {
    fetchEvaluations();
    fetchClasses();
    fetchQuests();
    fetch3DModels();
    fetchMonsters();
    fetchStudents();
    fetchStoreItems();
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
    const confirmed = await showConfirm("Atenção! Você está apagando este registro do histórico. O XP do aluno será recalculado. Deseja continuar?");
    if (confirmed) {
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
      await showAlert("Você precisa ter pelo menos um tipo de avaliação.");
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

  const handleEditClassSubmit = async () => {
    if (!editingClassId || !editClassName) return;
    const classRef = doc(db, 'classes', editingClassId);
    await updateDoc(classRef, { name: editClassName, color: editClassColor });
    setEditingClassId(null);
    setIsClassModalOpen(false);
    fetchClasses();
  };

  const handleRemoveClass = async (id: string) => {
    const confirmed = await showConfirm("Deseja realmente apagar esta turma?");
    if (confirmed) {
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
      await showAlert('Erro ao excluir usuário');
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
  const handleAddQuestion = async () => {
    if (questQuestions.length > 0) {
      const lastQ = questQuestions[questQuestions.length - 1];
      const hasTextOrImage = lastQ.title.trim() !== '' || (lastQ.imageUrl || '').trim() !== '';
      
      const filledOptions = lastQ.options.map((opt, idx) => {
        const isFilled = (opt.text || '').trim() !== '' || (opt.imageUrl || '').trim() !== '';
        return { idx, isFilled };
      }).filter(o => o.isFilled);
      
      if (!hasTextOrImage) {
        await showAlert("Preencha o título ou adicione uma imagem na última questão antes de criar uma nova.");
        return;
      }
      if (filledOptions.length < 2) {
        await showAlert("A última questão precisa de pelo menos 2 alternativas preenchidas antes de criar uma nova.");
        return;
      }
      if (!filledOptions.some(o => o.idx === lastQ.correctIndex)) {
        await showAlert("A resposta correta da última questão aponta para uma alternativa vazia. Marque uma alternativa preenchida como correta.");
        return;
      }
    }
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
    if (!questTitle || !questTitle.trim() || questQuestions.length === 0) {
      await showAlert("Preencha o título da missão e adicione perguntas!");
      return;
    }

    for (let i = 0; i < questQuestions.length; i++) {
      const q = questQuestions[i];
      const hasTextOrImage = q.title.trim() !== '' || (q.imageUrl || '').trim() !== '';
      const filledOptions = q.options.map((opt, idx) => {
        const isFilled = (opt.text || '').trim() !== '' || (opt.imageUrl || '').trim() !== '';
        return { idx, isFilled };
      }).filter(o => o.isFilled);

      if (!hasTextOrImage) {
        await showAlert(`A Pergunta ${i + 1} precisa ter o título preenchido ou uma imagem.`);
        return;
      }
      if (filledOptions.length < 2) {
        await showAlert(`A Pergunta ${i + 1} precisa ter pelo menos 2 alternativas preenchidas.`);
        return;
      }
      if (!filledOptions.some(o => o.idx === q.correctIndex)) {
        await showAlert(`A resposta correta da Pergunta ${i + 1} aponta para uma alternativa vazia.`);
        return;
      }
    }

    if (questChestConfig?.itemIds) {
      const ids = questChestConfig.itemIds.filter(id => id.trim() !== '');
      const uniqueIds = new Set(ids);
      if (ids.length !== uniqueIds.size) {
        await showAlert("O baú não pode conter itens repetidos! Cada slot deve ter um item diferente.");
        return;
      }
    }

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
      monsterName: questMonsterName,
      monsterAvatarConfig: questMonsterConfig || undefined,
      monsterModelUrl: questMonsterModelUrl,
      monsterQuotes: questMonsterQuotes,
      monsterDefeatQuotes: questMonsterDefeatQuotes,
      monsterDrops: questMonsterDrops,
      chestConfig: questChestConfig,
      mode: questMode,
      liveChest1stPlace: questLiveChest1st,
      liveChest2ndPlace: questLiveChest2nd,
      liveChest3rdPlace: questLiveChest3rd,
      active: true,
      createdBy: questCreatedBy || userData?.uid,
      creatorRole: questCreatorRole || userData?.role,
      targetClasses: questTargetClasses,
      shuffleQuestions: questShuffleQuestions,
      shuffleAnswers: questShuffleAnswers
    };

    // Sanitize object to remove undefined values for Firestore
    const sanitizedQuest = JSON.parse(JSON.stringify(newQuest));

    try {
      await setDoc(doc(db, 'quests', questId), sanitizedQuest);
      setIsCreatingQuest(false);
      setEditingQuestId(null);
      setQuestTitle(''); setQuestDesc(''); setQuestCover(''); setQuestMode('classic'); setQuestXp('1000'); setQuestRetries(false); setQuestPenalty('0'); setQuestMonsterName(''); setQuestMonsterConfig(null);
      setQuestMonsterModelUrl(''); setQuestMonsterQuotes({}); setQuestMonsterDefeatQuotes(''); setQuestMonsterDrops([]); setQuestChestConfig({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1], dropChance: 100 });
      setQuestLiveChest1st({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
      setQuestLiveChest2nd({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
      setQuestLiveChest3rd({ itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
      setQuestCreatedBy(null); setQuestCreatorRole(null); setQuestTargetClasses([]);
      setQuestShuffleQuestions(false); setQuestShuffleAnswers(false);
      setQuestQuestions([{ title: '', imageUrl: '', timeLimit: 30, options: [{text: ''}, {text: ''}, {text: ''}, {text: ''}], correctIndex: 0 }]);
      fetchQuests();
    } catch (e: any) {
      console.error(e);
      await showAlert("Erro ao salvar a missão: " + (e.message || "Erro desconhecido. Verifique se todos os campos estão preenchidos."));
    }
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
    setQuestMonsterName(quest.monsterName || '');
    setQuestMonsterConfig(quest.monsterAvatarConfig || null);
    setQuestMonsterModelUrl(quest.monsterModelUrl || '');
    setQuestMonsterQuotes(quest.monsterQuotes || {});
    setQuestMonsterDefeatQuotes(quest.monsterDefeatQuotes || '');
    setQuestMonsterDrops(quest.monsterDrops || []);
    setQuestChestConfig(quest.chestConfig || { itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1], dropChance: 100 });
    setQuestMode(quest.mode || 'classic');
    setQuestLiveChest1st(quest.liveChest1stPlace || { itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
    setQuestLiveChest2nd(quest.liveChest2ndPlace || { itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
    setQuestLiveChest3rd(quest.liveChest3rdPlace || { itemIds: ['', '', '', ''], itemQuantities: [1, 1, 1, 1] });
    setQuestCreatedBy(quest.createdBy || null);
    setQuestCreatorRole(quest.creatorRole || null);
    setQuestTargetClasses(quest.targetClasses || []);
    setQuestShuffleQuestions(quest.shuffleQuestions || false);
    setQuestShuffleAnswers(quest.shuffleAnswers || false);
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

  const handleResetQuestAttempt = async (studentId: string) => {
    const confirmed = await showConfirm('Deseja realmente RESETAR o desafio para este aluno? Todo o histórico de tentativas dele para esta missão será apagado. Ele poderá fazer a missão novamente. O XP ganho anteriormente não será removido automaticamente.');
    if (!confirmed) return;
    
    const attemptsToDelete = questHistoryAttempts.filter(a => a.studentId === studentId);
    for (const attempt of attemptsToDelete) {
      await deleteDoc(doc(db, 'quest_attempts', attempt.id));
    }
    
    setQuestHistoryAttempts(prev => prev.filter(a => a.studentId !== studentId));
  };

  const handleToggleQuestActive = async (id: string, currentStatus: boolean) => {
    await updateDoc(doc(db, 'quests', id), { active: !currentStatus });
    fetchQuests();
  };

  const handleDeleteQuest = async (id: string) => {
    const confirmed = await showConfirm("Apagar essa Missão definitivamente?");
    if (confirmed) {
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



  const renderChestConfig = (
    title: string,
    desc: string,
    chestConfig: any,
    setChestConfig: (c: any) => void,
    showDropChance: boolean
  ) => {
    return (
      <div style={{ background: 'rgba(255, 215, 0, 0.05)', padding: '1.5rem', borderRadius: '8px', border: '1px solid rgba(255, 215, 0, 0.3)', marginTop: '2rem' }}>
        <h4 style={{ color: 'var(--gold-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Package size={20} /> {title}</h4>
        {desc && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>{desc}</p>}
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>Máximo de Moedas {showDropChance && '(Obrigatório para ativar o baú)'}</label>
            <input type="number" value={chestConfig?.maxCoins || ''} onChange={e => setChestConfig({ ...chestConfig, maxCoins: parseInt(e.target.value) || 0 })} placeholder="Ex: 100" style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--gold-primary)', color: 'white', fontFamily: 'inherit', fontSize: '1.1rem' }} />
          </div>
          {showDropChance && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>Chance do Baú Aparecer (%)</label>
              <input type="number" min="1" max="100" value={chestConfig?.dropChance ?? 100} onChange={e => setChestConfig({ ...chestConfig, dropChance: Math.min(100, Math.max(1, parseInt(e.target.value) || 100)) })} placeholder="1 a 100" style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--gold-primary)', color: 'white', fontFamily: 'inherit', fontSize: '1.1rem' }} />
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {[0, 1, 2, 3].map((slot) => {
            const selectedItem = availableStoreItems.find(i => i.id === chestConfig?.itemIds?.[slot]);
            const isConsumable = selectedItem?.type === 'consumable';
            
            return (
              <div key={slot} style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Item {slot + 1} {showDropChance ? (slot === 0 ? '(50% de chance)' : slot === 1 ? '(25% de chance)' : slot === 2 ? '(10% de chance)' : '(5% de chance)') : '(100% de chance)'}</label>
                <select 
                  value={chestConfig?.itemIds?.[slot] || ''} 
                  onChange={e => {
                    const newIds = [...(chestConfig?.itemIds || ['', '', '', ''])];
                    const newQuants = [...(chestConfig?.itemQuantities || [1, 1, 1, 1])];
                    newIds[slot] = e.target.value;
                    
                    const newItem = availableStoreItems.find(i => i.id === e.target.value);
                    if (newItem?.type === 'equippable') {
                      newQuants[slot] = 1;
                    }
                    
                    setChestConfig({ ...chestConfig, itemIds: newIds, itemQuantities: newQuants });
                  }}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', marginBottom: isConsumable ? '0.5rem' : '0' }}
                >
                  <option value="">(Nenhum Item)</option>
                  {availableStoreItems.map(item => {
                    const isSelectedElsewhere = (chestConfig?.itemIds || []).some((id: string, idx: number) => id === item.id && idx !== slot);
                    return (
                      <option key={item.id} value={item.id} disabled={isSelectedElsewhere}>
                        {item.title} ({item.type === 'equippable' ? 'Equipamento' : 'Consumível'})
                      </option>
                    );
                  })}
                </select>
                
                {isConsumable && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Quantidade:</span>
                    <input 
                      type="number"
                      min="1"
                      max="99"
                      value={chestConfig?.itemQuantities?.[slot] || 1}
                      onChange={e => {
                        const newQuants = [...(chestConfig?.itemQuantities || [1, 1, 1, 1])];
                        newQuants[slot] = Math.max(1, parseInt(e.target.value) || 1);
                        setChestConfig({ ...chestConfig, itemQuantities: newQuants });
                      }}
                      style={{ width: '60px', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="app-container" style={{ height: '100vh', maxHeight: '100vh', overflow: 'hidden' }}>
      <nav className="navbar glass-panel compact-nav">
        <div className="logo-container">
          <ShieldAlert className="logo-icon" color="var(--gold-primary)" size={32} />
          <h1 className="title-glow">
            {userData?.role === 'admin' ? 'Painel Master (Admin)' : 'Painel do Professor'}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button className="login-btn mobile-menu-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ padding: '0.5rem', borderRadius: '8px' }} title="Menu">
            <Menu size={20} />
          </button>
          <button className="login-btn" onClick={() => navigate('/dashboard')} style={{ padding: '0.5rem 1rem' }}>
            <ArrowLeft size={18} style={{ marginRight: '0.5rem' }} /> Voltar
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: '50px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              {userData && (
                <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark)' }}>
                  <AvatarCharacter config={userData.avatarConfig || undefined} size={36} interactive={false} animation="none" />
                </div>
              )}
              <span style={{ fontWeight: 'bold' }}>{userData?.name?.split(' ')[0]}</span>
            </div>
          </div>
          <button className="login-btn" onClick={() => signOut(auth)} style={{ padding: '0.75rem', borderRadius: '50%' }} title="Sair">
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      <div style={{ display: 'flex', gap: '1.5rem', flex: 1, overflow: 'hidden' }}>
        {/* Overlay for Mobile */}
        {isSidebarOpen && (
          <div className="admin-sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>
        )}
        
        {/* Sidebar */}
        <div className={`glass-panel admin-sidebar ${isSidebarOpen ? 'open' : ''}`} style={{ width: '250px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: '100px', maxHeight: 'calc(100vh - 120px)' }}>
          <button className={`login-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'users' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'users' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
            <Users size={20} /> Alunos & Notas
          </button>
          <button className={`login-btn ${activeTab === 'quests' ? 'active' : ''}`} onClick={() => setActiveTab('quests')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'quests' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'quests' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
            <Swords size={20} /> Missões (Quizzes)
          </button>
          <button className={`login-btn ${activeTab === 'store' ? 'active' : ''}`} onClick={() => setActiveTab('store')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'store' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'store' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
            <Store size={20} /> Loja de Itens
          </button>
          <button className={`login-btn ${activeTab === 'economy' ? 'active' : ''}`} onClick={() => setActiveTab('economy')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'economy' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'economy' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
            <CircleDollarSign size={20} /> Economia (Ajustes)
          </button>
          {userData?.role === 'admin' && (
            <>
              <button className={`login-btn ${activeTab === 'classes' ? 'active' : ''}`} onClick={() => setActiveTab('classes')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'classes' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'classes' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
                <BookOpen size={20} /> Turmas
              </button>
              <button className={`login-btn ${activeTab === 'approvals' ? 'active' : ''}`} onClick={() => setActiveTab('approvals')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'approvals' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'approvals' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
                <UserCheck size={20} /> Solicitações
              </button>
              <button className={`login-btn ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'config' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'config' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
                <Settings size={20} /> Tipos de Avaliação
              </button>
            </>
          )}
          <button className={`login-btn ${activeTab === 'ranks' ? 'active' : ''}`} onClick={() => setActiveTab('ranks')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'ranks' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'ranks' ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
            <Medal size={20} /> Patentes (Artes)
          </button>
          {userData?.role === 'admin' && (
            <button className={`login-btn ${activeTab === 'entities' ? 'active' : ''}`} onClick={() => setActiveTab('entities')} style={{ width: '100%', justifyContent: 'flex-start', border: activeTab === 'entities' ? '1px solid var(--accent-red)' : '1px solid transparent', background: activeTab === 'entities' ? 'rgba(239, 68, 68, 0.1)' : 'transparent', marginTop: 'auto' }}>
              <Box size={20} /> Entidades (3D)
            </button>
          )}
        </div>

        {/* Content */}
        <div className="glass-panel" id="admin-content-scroll" style={{ flex: 1, padding: '2rem', overflowY: 'auto', position: 'relative' }}>
          
        {/* Aba de Solicitações (Approvals) */}
        {activeTab === 'approvals' && (
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserCheck size={28} color="var(--gold-primary)" />
                Solicitações de Acesso
              </h2>
              <p style={{ color: 'var(--text-secondary)' }}>Aprove ou rejeite contas que solicitaram acesso como Professor / Coordenador.</p>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {students.filter(s => s.role === 'pending_teacher').length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--border-glass)' }}>
                  <ShieldAlert size={48} color="var(--text-secondary)" style={{ opacity: 0.5, margin: '0 auto 1rem auto' }} />
                  <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Nenhuma solicitação pendente no momento.</p>
                </div>
              ) : (
                students.filter(s => s.role === 'pending_teacher').map(reqUser => (
                  <div key={reqUser.uid} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--gold-primary)', background: 'rgba(251, 191, 36, 0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <img src={reqUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(reqUser.name)}`} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%' }} />
                      <div style={{ overflow: 'hidden' }}>
                        <h4 style={{ margin: 0, fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reqUser.name}</h4>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{reqUser.email}</span>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                      <button 
                        onClick={async () => {
                          if (await showConfirm('Rejeitar Solicitação', `Deseja negar o acesso de professor para ${reqUser.name}? Ele voltará a ser um Aluno comum.`)) {
                            await updateDoc(doc(db, 'users', reqUser.uid), { role: 'student' });
                            fetchStudents();
                          }
                        }}
                        className="login-btn" 
                        style={{ flex: 1, padding: '0.5rem', background: 'rgba(239, 68, 68, 0.2)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)' }}
                      >
                        Rejeitar
                      </button>
                      <button 
                        onClick={async () => {
                          if (await showConfirm('Aprovar Professor', `Confirmar ${reqUser.name} como Professor?`)) {
                            await updateDoc(doc(db, 'users', reqUser.uid), { role: 'teacher' });
                            fetchStudents();
                          }
                        }}
                        className="login-btn" 
                        style={{ flex: 1, padding: '0.5rem', background: 'var(--accent-green)', color: 'white', border: 'none' }}
                      >
                        Aprovar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Aba de Entidades 3D */}
        {activeTab === 'entities' && (
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <AdminEntitiesManager />
          </div>
        )}

        {/* Aba de Economia */}
        {activeTab === 'economy' && (
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Ajustes da Economia</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Configure taxas, quedas de moedas e regras do comércio.</p>
            </div>
            <AdminEconomySettings />
          </div>
        )}

        {/* Aba de Usuários */}
        {activeTab === 'users' && (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '0.5rem 2rem', margin: '-2rem -2rem 0.5rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
                <div className="compact-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Gerenciamento de Usuários</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Controle de alunos, turmas e equipe escolar.</p>
                </div>
                
                {selectedStudentIds.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(251, 191, 36, 0.1)', padding: '0.25rem 0.75rem', borderRadius: '8px', border: '1px solid var(--gold-primary)' }}>
                    <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>{selectedStudentIds.length} selecionados</span>
                    <button 
                      className="login-btn" 
                      onClick={() => setIsBulkXpModalOpen(true)}
                      style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0.5rem 1rem' }}
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
              <button className="retractable-toggle-btn" onClick={() => setIsUserFiltersOpen(!isUserFiltersOpen)}>
                {isUserFiltersOpen ? 'Ocultar Filtros' : 'Mostrar Filtros e Turmas'}
              </button>
              <div className={`compact-filters retractable-content ${isUserFiltersOpen ? 'open' : ''}`} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexDirection: 'column' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: '1 1 300px', display: 'flex', alignItems: 'center' }}>
                    <Search size={16} style={{ position: 'absolute', right: '0.75rem', color: 'var(--text-secondary)' }} />
                    <input 
                      type="text" 
                      placeholder="Buscar por nome..." 
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      style={{ width: '100%', padding: '0 2rem 0 1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.9rem', height: '36px' }}
                    />
                  </div>
                  <select 
                    value={studentSortBy} 
                    onChange={e => setStudentSortBy(e.target.value as any)}
                    style={{ padding: '0 0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', height: '36px', fontSize: '0.9rem' }}
                  >
                    <option value="xp">Por XP</option>
                    <option value="name">Por Nome</option>
                    <option value="class">Por Turma</option>
                  </select>
                  <select 
                    value={studentSortOrder} 
                    onChange={e => setStudentSortOrder(e.target.value as any)}
                    style={{ padding: '0 0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', height: '36px', fontSize: '0.9rem' }}
                  >
                    <option value="desc">Descendente</option>
                    <option value="asc">Ascendente</option>
                  </select>
                </div>
                
                <div className="compact-tab-row" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                  <button 
                    onClick={() => setSelectedClassTab('all')}
                    style={{ padding: '0.25rem 1rem', borderRadius: '16px', border: '1px solid var(--border-glass)', background: selectedClassTab === 'all' ? 'var(--gold-primary)' : 'var(--btn-bg)', color: selectedClassTab === 'all'  ? 'black'  : 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '0.85rem' }}
                  >
                    Todos
                  </button>
                  <button 
                    onClick={() => setSelectedClassTab('staff')}
                    style={{ padding: '0.25rem 1rem', borderRadius: '16px', border: '1px solid var(--border-glass)', background: selectedClassTab === 'staff' ? 'var(--accent-red)' : 'var(--btn-bg)', color: selectedClassTab === 'staff'  ? 'var(--text-primary)' : 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '0.85rem' }}
                  >
                    Equipe (Prof/Admin)
                  </button>
                  {schoolClasses.map(cls => (
                    <button 
                      key={cls.id}
                      onClick={() => setSelectedClassTab(cls.name)}
                      style={{ padding: '0.25rem 1rem', borderRadius: '16px', border: `1px solid ${cls.color}`, background: selectedClassTab === cls.name ? cls.color : 'var(--btn-bg)', color: selectedClassTab === cls.name ? 'black' : 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '0.85rem' }}
                    >
                      {cls.name}
                    </button>
                  ))}
                  <button 
                    onClick={() => setSelectedClassTab('unassigned')}
                    style={{ padding: '0.25rem 1rem', borderRadius: '16px', border: '1px solid var(--text-secondary)', background: selectedClassTab === 'unassigned' ? 'var(--text-secondary)' : 'var(--btn-bg)', color: selectedClassTab === 'unassigned' ? 'black' : 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '0.85rem' }}
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
                      const currentRank = getRankForXp(student.xp || 0, student.classId);
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
                            {student.avatarConfig ? (
                              <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'visible', border: `2px solid ${currentRank.color}`, background: 'var(--bg-dark)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                <AvatarCharacter config={student.avatarConfig} equippedItems={allUserItems[student.uid] || []} size={48} interactive={false} animation={student.avatarConfig?.animationState as any || 'idle'} />
                              </div>
                            ) : (
                              <img src={student.photoURL} alt="" style={{ width: 48, height: 48, borderRadius: '50%', border: `2px solid ${currentRank.color}`, objectFit: 'cover' }} />
                            )}
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
                                <span style={{ color: currentRank.color, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}><ShieldAlert size={14} /> {currentRank.name}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--gold-primary)' }}><Star size={14} /> {student.xp || 0} XP</span>
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button 
                              className="login-btn" 
                              onClick={() => openEditModal(student)}
                              style={{ padding: '0.5rem', background: 'var(--btn-bg)', borderColor: 'transparent' }}
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
                  <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Central de Missões</h2>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Crie desafios ao estilo Kahoot para os alunos faturarem XP.</p>
                    </div>
                    <button className="login-btn" onClick={() => setIsCreatingQuest(true)} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }}>
                      <Plus size={18} style={{ marginRight: '0.5rem' }} /> Nova Missão
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {quests.filter(q => {
                      if (userData?.role === 'admin') return true;
                      if (userData?.role === 'teacher') return q.createdBy === userData?.uid || q.creatorRole === 'admin';
                      return true;
                    }).length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)' }}>Nenhuma missão criada ainda.</p>
                    ) : quests.filter(q => {
                      if (userData?.role === 'admin') return true;
                      if (userData?.role === 'teacher') return q.createdBy === userData?.uid || q.creatorRole === 'admin';
                      return true;
                    }).map(quest => {
                      const isOwnerOrAdmin = userData?.role === 'admin' || quest.createdBy === userData?.uid;
                      return (
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                              <h3 style={{ fontSize: '1.3rem', margin: 0 }}>{quest.title}</h3>
                              <span style={{ padding: '0.2rem 0.6rem', background: quest.mode === 'live' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: quest.mode === 'live' ? 'var(--gold-primary)' : 'var(--accent-blue)', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {quest.mode === 'live' ? 'Tempo Real' : 'Atividade'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                              <span>Recompensa: <strong style={{ color: 'var(--gold-primary)' }}>{quest.baseXp} XP</strong></span>
                              <span>Modo: {quest.allowRetries ? `Vidas Extras` : 'Hardcore'}</span>
                              <span>{quest.questions.length} Perguntas</span>
                              {quest.targetClasses && quest.targetClasses.length > 0 && <span style={{ color: 'var(--accent-blue)' }}>Turmas: {quest.targetClasses.join(', ')}</span>}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                          {quest.mode === 'live' && (
                            <button onClick={() => navigate(`/live-admin/${quest.id}`)} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }} title="Iniciar Sessão Ao Vivo">
                              <Play size={18} fill="black" /> Iniciar Ao Vivo
                            </button>
                          )}
                          <button onClick={() => openQuestHistory(quest)} style={{ background: 'transparent', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }} title="Ver Histórico">
                            <History size={18} /> Histórico
                          </button>
                          {isOwnerOrAdmin && (
                            <>
                              <button onClick={() => handleEditQuest(quest)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.5rem' }} title="Editar Missão">
                                <Edit2 size={20} />
                              </button>
                              <button onClick={() => handleToggleQuestActive(quest.id, quest.active)} style={{ background: quest.active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)', color: quest.active  ? 'var(--accent-green)'  : 'var(--text-primary)', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                                {quest.active ? 'Ativa (Visível)' : 'Rascunho (Oculta)'}
                              </button>
                              <button onClick={() => handleDeleteQuest(quest.id)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.5rem' }} title="Excluir Missão">
                                <Trash2 size={20} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      );
                    })}
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
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>Modo de Jogo</label>
                          <div style={{ display: 'flex', gap: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                              <input type="radio" name="questMode" checked={questMode === 'classic'} onChange={() => setQuestMode('classic')} />
                              <span style={{ color: questMode === 'classic'  ? 'var(--gold-primary)'  : 'var(--text-primary)' }}>Atividade Individual</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                              <input type="radio" name="questMode" checked={questMode === 'live'} onChange={() => setQuestMode('live')} />
                              <span style={{ color: questMode === 'live'  ? 'var(--gold-primary)'  : 'var(--text-primary)' }}>Em Tempo Real (Kahoot RPG)</span>
                            </label>
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome da Missão</label>
                          <input type="text" value={questTitle} onChange={e => setQuestTitle(e.target.value)} placeholder="Ex: A Masmorra das Frações" style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '1.2rem' }} />
                        </div>
                        
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Descrição (Lore da Missão)</label>
                          <textarea value={questDesc} onChange={e => setQuestDesc(e.target.value)} rows={3} style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} placeholder="Um monstro apareceu! Resolva os problemas para derrotá-lo..."></textarea>
                        </div>

                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>Recompensa Base de XP</label>
                          <input type="number" value={questXp} onChange={e => setQuestXp(e.target.value)} style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--gold-primary)', color: 'white', fontFamily: 'inherit', fontSize: '1.2rem' }} />
                        </div>

                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Turmas Alvo (Deixe vazio para todas)</label>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                            {schoolClasses.length === 0 ? <span style={{ color: 'var(--text-secondary)' }}>Nenhuma turma cadastrada</span> : schoolClasses.map(cls => (
                              <button
                                key={cls.id}
                                onClick={() => {
                                  if (questTargetClasses.includes(cls.name)) {
                                    setQuestTargetClasses(questTargetClasses.filter(c => c !== cls.name));
                                  } else {
                                    setQuestTargetClasses([...questTargetClasses, cls.name]);
                                  }
                                }}
                                style={{
                                  padding: '0.5rem 1rem',
                                  borderRadius: '20px',
                                  border: `1px solid ${cls.color}`,
                                  background: questTargetClasses.includes(cls.name) ? cls.color : 'var(--btn-bg)',
                                  color: questTargetClasses.includes(cls.name)  ? 'black'  : 'var(--text-primary)',
                                  cursor: 'pointer',
                                  fontWeight: 'bold',
                                  fontSize: '0.9rem'
                                }}
                              >
                                {cls.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Lado Direito: Imagem e Configs */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Imagem de Capa (Opcional - Cole uma URL de imagem)</label>
                          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                            <input type="text" value={questCover} onChange={e => setQuestCover(e.target.value)} placeholder="URL ou Galeria ->" style={{ flex: 1, padding: '1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                            <DirectUploadButton folder="quests" onUploadComplete={setQuestCover} buttonStyle={{ minHeight: '100%' }} />
                            <button onClick={() => setGalleryTarget('cover')} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', minHeight: '100%' }}>
                              <Search size={20} />
                            </button>
                          </div>
                          {questCover && (
                            <div style={{ width: '100%', height: '200px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <img src={questCover} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', marginBottom: '2rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input type="checkbox" id="questRetries" checked={questRetries} onChange={e => setQuestRetries(e.target.checked)} style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--accent-blue)' }} />
                            <label htmlFor="questRetries" style={{ color: 'white', cursor: 'pointer' }}>
                              <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Modo Vidas Extras (Retries)</strong>
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Se ativado, o aluno não falha na primeira resposta errada. Ele perde corações e pode continuar.</span>
                            </label>
                          </div>
                          {questRetries && (
                            <div style={{ marginLeft: '2.2rem' }}>
                              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Penalidade de XP por vida perdida</label>
                              <input type="number" value={questPenalty} onChange={e => setQuestPenalty(e.target.value)} placeholder="Ex: 50" style={{ width: '150px', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                            </div>
                          )}
                          <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)', margin: '0.5rem 0' }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input type="checkbox" id="questShuffleQ" checked={questShuffleQuestions} onChange={e => setQuestShuffleQuestions(e.target.checked)} style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--accent-blue)' }} />
                            <label htmlFor="questShuffleQ" style={{ color: 'white', cursor: 'pointer' }}>
                              <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Embaralhar Questões</strong>
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>A ordem das perguntas será aleatória para cada aluno.</span>
                            </label>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input type="checkbox" id="questShuffleA" checked={questShuffleAnswers} onChange={e => setQuestShuffleAnswers(e.target.checked)} style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--accent-blue)' }} />
                            <label htmlFor="questShuffleA" style={{ color: 'white', cursor: 'pointer' }}>
                              <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Embaralhar Respostas</strong>
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>A ordem das opções (A, B, C, D) será aleatória para cada aluno.</span>
                            </label>
                          </div>
                        </div>
                      </div>

                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', marginTop: '2rem' }}>
                      <h4 style={{ color: 'var(--accent-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Swords size={20} /> Configurar Monstro / Oponente</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome do Monstro</label>
                          <input type="text" value={questMonsterName} onChange={e => setQuestMonsterName(e.target.value)} placeholder="Ex: Golem de Pedra" style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Selecionar Monstro da Galeria</label>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <select 
                              value={availableMonsters.find(m => m.name === questMonsterName)?.id || ''} 
                              onChange={e => {
                                const selected = availableMonsters.find(m => m.id === e.target.value);
                                if (selected) {
                                  setQuestMonsterName(selected.name);
                                  setQuestMonsterConfig(selected.config || null);
                                  
                                  if (selected.config?.customModelUrl) {
                                    setQuestMonsterModelUrl(selected.config.customModelUrl);
                                  } else if (selected.baseModelId) {
                                    const rawModel = available3DModels.find(m => m.id === selected.baseModelId);
                                    if (rawModel) setQuestMonsterModelUrl(rawModel.url);
                                    else setQuestMonsterModelUrl('');
                                  } else {
                                    setQuestMonsterModelUrl('');
                                  }
                                } else {
                                  setQuestMonsterName('');
                                  setQuestMonsterConfig(null);
                                  setQuestMonsterModelUrl('');
                                }
                              }} 
                              style={{ flex: 1, padding: '1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                            >
                              <option value="">(Personalizar um novo Monstro...)</option>
                              {availableMonsters.map(monster => (
                                <option key={monster.id} value={monster.id}>{monster.name}</option>
                              ))}
                            </select>

                            <div style={{ width: '100px', height: '100px', borderRadius: '8px', border: '1px solid var(--border-glass)', overflow: 'hidden', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                               {(questMonsterConfig || questMonsterModelUrl) ? (
                                  <AvatarCharacter 
                                    config={questMonsterConfig || (questMonsterModelUrl ? { customModelUrl: questMonsterModelUrl } as AvatarConfig : null)} 
                                    size={90} 
                                    interactive={false} 
                                    animation="idle" 
                                    role="monster" 
                                  />
                               ) : (
                                  <Swords size={32} color="var(--text-secondary)" opacity={0.5} />
                               )}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gridColumn: '1 / -1' }}>
                          <button onClick={() => setIsCustomizingMonster(true)} style={{ width: '100%', padding: '1rem', background: questMonsterConfig ? 'var(--gold-primary)' : 'rgba(59, 130, 246, 0.2)', color: questMonsterConfig ? 'black' : 'var(--accent-primary)', border: `1px solid ${questMonsterConfig ? 'var(--gold-primary)' : 'var(--accent-primary)'}`, borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                            {questMonsterConfig ? 'Editar Aparência deste Monstro' : 'Criar Monstro 3D Personalizado'}
                          </button>
                        </div>
                      </div>


                      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-glass)' }}>
                        <h5 style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '1.1rem' }}>Falas do Monstro (Opcional - Separe por ; para sortear)</h5>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--accent-green)', fontSize: '0.9rem' }}>HP 100% a 80%</label>
                            <input type="text" value={questMonsterQuotes.hp100_80 || ''} onChange={e => setQuestMonsterQuotes({...questMonsterQuotes, hp100_80: e.target.value})} placeholder="Ex: Vou te esmagar!; Renda-se!" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--gold-primary)', fontSize: '0.9rem' }}>HP 79% a 50%</label>
                            <input type="text" value={questMonsterQuotes.hp79_50 || ''} onChange={e => setQuestMonsterQuotes({...questMonsterQuotes, hp79_50: e.target.value})} placeholder="Ex: Você é mais forte do que parece..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--accent-primary)', fontSize: '0.9rem' }}>HP 49% a 25%</label>
                            <input type="text" value={questMonsterQuotes.hp49_25 || ''} onChange={e => setQuestMonsterQuotes({...questMonsterQuotes, hp49_25: e.target.value})} placeholder="Ex: Isso não vai ficar assim!" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--accent-red)', fontSize: '0.9rem' }}>HP Menor que 24%</label>
                            <input type="text" value={questMonsterQuotes.hp24_0 || ''} onChange={e => setQuestMonsterQuotes({...questMonsterQuotes, hp24_0: e.target.value})} placeholder="Ex: Maldição!; Como posso perder?!" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                          </div>
                        </div>

                        <div style={{ marginTop: '1.5rem' }}>
                          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'bold' }}>Falas de Derrota (Quando o jogador der o Golpe Final)</label>
                          <input type="text" value={questMonsterDefeatQuotes} onChange={e => setQuestMonsterDefeatQuotes(e.target.value)} placeholder="Ex: NÃO PODE SER!; Fui derrotado...; AHHH!" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--accent-red)', color: 'white', fontFamily: 'inherit' }} />
                        </div>
                      </div>

                      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-glass)' }}>
                        <h5 style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '1.1rem' }}>Recompensas de Derrota do Monstro (Drops)</h5>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>Adicione itens que o monstro pode dropar ao ser derrotado. A chance padrão é definida pela raridade do item (Comum: 60%, Incomum: 40%, Raro: 20%, Épico: 5%, Lendário: 1%), mas você pode alterá-la.</p>
                        
                        {questMonsterDrops.map((drop, index) => {
                          return (
                            <div key={index} style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: '8px' }}>
                              <select 
                                value={drop.itemId}
                                onChange={e => {
                                  const newDrops = [...questMonsterDrops];
                                  const selectedItem = availableStoreItems.find(i => i.id === e.target.value);
                                  
                                  let defaultChance = 60;
                                  if (selectedItem?.rarity === 'uncommon') defaultChance = 40;
                                  if (selectedItem?.rarity === 'rare') defaultChance = 20;
                                  if (selectedItem?.rarity === 'epic') defaultChance = 5;
                                  if (selectedItem?.rarity === 'legendary') defaultChance = 1;
                                  
                                  newDrops[index] = { itemId: e.target.value, dropChance: defaultChance };
                                  setQuestMonsterDrops(newDrops);
                                }}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                              >
                                <option value="">(Selecione um Item)</option>
                                {availableStoreItems.map(si => (
                                  <option key={si.id} value={si.id}>{si.title} ({si.type === 'equippable' ? 'Equipamento' : 'Consumível'})</option>
                                ))}
                              </select>
                              
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Chance:</label>
                                <input 
                                  type="number" 
                                  min="0" max="100" 
                                  value={drop.dropChance} 
                                  onChange={e => {
                                    const newDrops = [...questMonsterDrops];
                                    newDrops[index].dropChance = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                                    setQuestMonsterDrops(newDrops);
                                  }}
                                  style={{ width: '80px', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                                />
                                <span style={{ color: 'var(--text-secondary)' }}>%</span>
                              </div>
                              
                              <button 
                                onClick={() => {
                                  const newDrops = questMonsterDrops.filter((_, i) => i !== index);
                                  setQuestMonsterDrops(newDrops);
                                }}
                                style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.5rem' }}
                                title="Remover Drop"
                              >
                                <Trash2 size={20} />
                              </button>
                            </div>
                          );
                        })}
                        
                        <button 
                          onClick={() => setQuestMonsterDrops([...questMonsterDrops, { itemId: '', dropChance: 60 }])}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(59, 130, 246, 0.2)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)', borderRadius: '8px', cursor: 'pointer', marginTop: '1rem' }}
                        >
                          <Plus size={18} /> Adicionar Item de Drop
                        </button>
                      </div>

                    </div>

                    {renderChestConfig(
                      questMode === 'classic' ? 'Baú de Recompensas (Final da Missão)' : 'Baú de Revisão (Final da Missão Normal)',
                      'O jogador terá 100% de chance de receber Moedas aleatórias (entre 10% e o valor máximo). O Item 1 terá 50% de chance, Item 2 terá 25% (se o 1 vier), Item 3 terá 10% e Item 4 terá 5%.',
                      questChestConfig,
                      setQuestChestConfig,
                      true
                    )}
                    
                    {questMode === 'live' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem', padding: '1.5rem', border: '1px solid var(--gold-primary)', borderRadius: '12px', background: 'rgba(251, 191, 36, 0.05)' }}>
                        <h3 style={{ fontSize: '1.5rem', color: 'var(--gold-primary)', margin: 0 }}>Baús de Recompensa (Pódio Ao Vivo)</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>No modo ao vivo, as chances de itens são sempre 100%. Configure um baú para o 1º, 2º e 3º colocado (que será entregue imediatamente no encerramento da batalha).</p>
                        
                        {renderChestConfig('Baú do 1º Lugar', '', questLiveChest1st, setQuestLiveChest1st, false)}
                        {renderChestConfig('Baú do 2º Lugar', '', questLiveChest2nd, setQuestLiveChest2nd, false)}
                        {renderChestConfig('Baú do 3º Lugar', '', questLiveChest3rd, setQuestLiveChest3rd, false)}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Perguntas do Desafio</h3>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Deixe o texto e a imagem em branco se quiser ocultar uma opção (mínimo de 2 opções).</p>
                  </div>
                  
                  {questQuestions.map((q, qIndex) => (
                    <div key={qIndex} className="glass-panel" style={{ padding: '2.5rem 2rem 2rem 2rem', marginBottom: '2rem', position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '-15px', left: '20px', background: 'var(--accent-blue)', padding: '0.2rem 1.5rem', borderRadius: '20px', fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>Pergunta {qIndex + 1}</span>
                        {questQuestions.length > 1 && (
                          <button
                            onClick={async () => {
                              const confirm = await showConfirm(`Tem certeza que deseja excluir a Pergunta ${qIndex + 1}?`);
                              if (confirm) {
                                const newQs = [...questQuestions];
                                newQs.splice(qIndex, 1);
                                setQuestQuestions(newQs);
                              }
                            }}
                            title="Excluir pergunta"
                            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: '0 0 0 0.5rem', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-red)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
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
                            <DirectUploadButton folder="quests" onUploadComplete={(url) => handleUpdateQuestion(qIndex, 'imageUrl', url)} buttonStyle={{ minHeight: '100%' }} />
                            <button onClick={() => setGalleryTarget(`question-${qIndex}`)} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0.75rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: '100%' }}>
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
                                style={{ flex: 1, padding: '0.75rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
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
                              <DirectUploadButton folder="quests" onUploadComplete={(url) => handleUpdateOption(qIndex, optIndex, 'imageUrl', url)} buttonStyle={{ minHeight: '100%' }} />
                              <button onClick={() => setGalleryTarget(`option-${qIndex}-${optIndex}`)} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: '100%' }}>
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
                    <button className="login-btn" onClick={handleSaveQuest} style={{ flex: 2, background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }}>
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
              <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Gerenciamento de Turmas</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', marginTop: 0 }}>Crie turmas para agrupar os alunos e gerar Rankings exclusivos.</p>
              
              <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'rgba(0,0,0,0.2)' }}>
                <h3 style={{ marginBottom: '1rem' }}>Criar Nova Turma</h3>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: 2 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Nome da Turma</label>
                    <input type="text" value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="Ex: 6º ano A" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
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
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => { setEditingClassId(cls.id); setEditClassName(cls.name); setEditClassColor(cls.color); setIsClassModalOpen(true); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.5rem' }} title="Editar Turma">
                          <Edit2 size={20} />
                        </button>
                        <button onClick={() => handleRemoveClass(cls.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.5rem' }} title="Excluir Turma">
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Aba de Configurações */}
          {activeTab === 'config' && (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
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
                  style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0.5rem 1rem' }}
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
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Turma Oficial</label>
              <select value={editClass} onChange={e => setEditClass(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', marginBottom: '1rem' }}>
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
          <div className="glass-panel xp-modal-content" style={{ width: '800px', maxWidth: '95vw', maxHeight: '95vh', overflowY: 'auto', padding: '2rem', animation: 'slideUp 0.3s ease-out', display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>
            
            {/* Lado Esquerdo: Formulário */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>Gerenciar XP</h3>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                 {selectedStudent.avatarConfig ? (
                   <div style={{ position: 'relative', width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-dark)', border: '2px solid var(--accent-blue)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                     <div style={{ position: 'absolute', width: 64, height: 64, bottom: -6, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
                       <AvatarCharacter config={selectedStudent.avatarConfig} equippedItems={selectedStudentItems} size={64} interactive={false} animation={selectedStudent.avatarConfig.animationState as any || 'idle'} />
                     </div>
                   </div>
                 ) : (
                   <img src={selectedStudent.photoURL} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
                 )}
                 <div>
                   <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{selectedStudent.name}</div>
                   <div style={{ fontSize: '0.9rem', color: 'var(--gold-primary)', marginTop: '0.2rem' }}>XP Atual: {selectedStudent.xp || 0}</div>
                 </div>
              </div>

              {/* Toggles Adicionar/Remover */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: '8px' }}>
                <button onClick={() => setModalMode('add')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: modalMode === 'add' ? 'rgba(255,255,255,0.1)' : 'transparent', color: modalMode === 'add'  ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontWeight: modalMode === 'add' ? 'bold' : 'normal' }}>
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
                    <select value={gradeType} onChange={e => setGradeType(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}>
                      {evaluations.map(ev => (
                        <option key={ev.id} value={ev.id}>{ev.name} (Peso x{ev.weight})</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: '2rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nota (0 a 10)</label>
                    <input type="number" step="0.1" min="0" max="10" value={grade} onChange={e => setGrade(e.target.value)} placeholder="Ex: 8.5" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '1.2rem' }} />
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
                    <input type="number" value={removeAmount} onChange={e => setRemoveAmount(e.target.value)} placeholder="Ex: 50" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '1.2rem' }} />
                  </div>
                  <div style={{ marginBottom: '2rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Justificativa (Motivo)</label>
                    <input type="text" value={removeReason} onChange={e => setRemoveReason(e.target.value)} placeholder="Ex: Lançamento incorreto, punição, etc." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                  </div>
                  <button className="login-btn" onClick={handleRemoveXp} style={{ width: '100%', justifyContent: 'center', background: 'var(--accent-red)', color: 'white', border: 'none' }}>
                    Confirmar Remoção de XP
                  </button>
                </>
              )}
            </div>

            {/* Lado Direito: Histórico */}
            <div style={{ flex: 1, minWidth: '300px', borderLeft: '1px solid var(--border-glass)', paddingLeft: '2rem', display: 'flex', flexDirection: 'column', maxHeight: '550px' }}>
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
              <button onClick={() => setDeletingStudent(null)} style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}>
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
              <button onClick={() => setBulkXpAction('add')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: bulkXpAction === 'add' ? 'rgba(255,255,255,0.1)' : 'transparent', color: bulkXpAction === 'add'  ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontWeight: bulkXpAction === 'add' ? 'bold' : 'normal' }}>
                Adicionar XP
              </button>
              <button onClick={() => setBulkXpAction('remove')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: bulkXpAction === 'remove' ? 'rgba(239, 68, 68, 0.2)' : 'transparent', color: bulkXpAction === 'remove' ? 'var(--accent-red)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontWeight: bulkXpAction === 'remove' ? 'bold' : 'normal' }}>
                Retirar XP
              </button>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Quantidade de XP</label>
              <input type="number" value={bulkXpAmount} onChange={e => setBulkXpAmount(e.target.value)} placeholder="Ex: 500" style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '1.2rem' }} />
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Justificativa (Aparecerá no histórico de todos)</label>
              <input type="text" value={bulkXpReason} onChange={e => setBulkXpReason(e.target.value)} placeholder="Ex: Vitória no Desafio das Frações" style={{ width: '100%', padding: '1rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
            </div>

            <button className="login-btn" onClick={handleBulkXp} style={{ width: '100%', justifyContent: 'center', background: bulkXpAction === 'add' ? 'var(--gold-primary)' : 'var(--accent-red)', color: bulkXpAction === 'add'  ? 'black'  : 'var(--text-primary)', border: 'none' }}>
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
              <input type="text" value={newEvalName} onChange={e => setNewEvalName(e.target.value)} placeholder="Ex: Tarefa de Casa" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Multiplicador (Peso)</label>
              <input type="number" value={newEvalWeight} onChange={e => setNewEvalWeight(e.target.value)} placeholder="Ex: 50" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
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
                    if (student?.classId && schoolClasses.some(c => c.name === student.classId)) {
                      classIdentifier = student.classId;
                    }
                    if (!groups.has(classIdentifier)) groups.set(classIdentifier, []);
                    groups.get(classIdentifier)!.push(attempt);
                  });

                  return [...schoolClasses.map(c => c.name), 'unassigned'].map(clsName => {
                    const attemptsInClass = groups.get(clsName) || [];
                    
                    if (attemptsInClass.length === 0) return null;

                    // Group attempts by student
                    const studentGroups = new Map<string, any[]>();
                    attemptsInClass.forEach(a => {
                      if (!studentGroups.has(a.studentId)) studentGroups.set(a.studentId, []);
                      studentGroups.get(a.studentId)!.push(a);
                    });

                    const clsInfo = schoolClasses.find(c => c.name === clsName) || { name: 'Sem Turma / Desconhecidos', color: '#94a3b8' };

                    return (
                      <div key={clsName} style={{ background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px', border: `1px solid ${clsInfo.color}` }}>
                        <h3 style={{ margin: '0 0 1rem 0', color: clsInfo.color, borderBottom: `1px solid ${clsInfo.color}`, paddingBottom: '0.5rem' }}>{clsInfo.name}</h3>
                        
                        <div style={{ display: 'grid', gap: '1rem' }}>
                          {Array.from(studentGroups.entries()).map(([studentId, attempts]) => {
                            const student = students.find(s => s.uid === studentId);
                            
                            // Sort attempts by timestamp
                            attempts.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
                            
                            const completions = attempts.filter(a => a.status === 'completed');
                            const defeats = attempts.filter(a => a.status === 'failed');
                            const firstCompletion = completions[0];
                            const lastAccess = attempts[attempts.length - 1];
                            const firstCompletionXp = firstCompletion ? (firstCompletion.earnedXp || 0) : 0;
                            
                            const firstCompletionDateStr = firstCompletion && firstCompletion.timestamp ? new Date(firstCompletion.timestamp.seconds * 1000).toLocaleString('pt-BR') : '-';
                            const lastAccessDateStr = lastAccess && lastAccess.timestamp ? new Date(lastAccess.timestamp.seconds * 1000).toLocaleString('pt-BR') : '-';
                            
                            return (
                              <div key={studentId} style={{ background: 'var(--btn-bg)', padding: '1rem', borderRadius: '8px', borderLeft: `4px solid ${completions.length > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                  <div style={{ flex: 1 }}>
                                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem' }}>{student?.name || 'Aluno Desconhecido (Deletado)'}</h4>
                                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                                      <span>Tentativas: <strong style={{ color: 'white' }}>{attempts.length}</strong></span>
                                      <span>Vitórias: <strong style={{ color: 'var(--accent-green)' }}>{completions.length}</strong></span>
                                      <span>Derrotas: <strong style={{ color: 'var(--accent-red)' }}>{defeats.length}</strong></span>
                                      <span>Último Acesso: <strong>{lastAccessDateStr}</strong></span>
                                      {completions.length > 0 && (
                                        <span>Primeira Vitória: <strong>{firstCompletionDateStr}</strong></span>
                                      )}
                                      <span>XP Ganho: <strong style={{ color: 'var(--gold-primary)' }}>{firstCompletionXp}</strong></span>
                                    </div>
                                  </div>
                                  <button onClick={() => handleResetQuestAttempt(studentId)} className="login-btn" style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', padding: '0.5rem 1rem', marginLeft: '1rem' }} title="Resetar histórico deste aluno">
                                    <RefreshCw size={16} style={{ marginRight: '0.5rem' }} /> Resetar
                                  </button>
                                </div>
                                
                                {lastAccess.answers && lastAccess.answers.length > 0 ? (
                                  <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '8px' }}>
                                    <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)' }}>Respostas da Última Tentativa:</h5>
                                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                      {lastAccess.answers.map((ans: any, i: number) => (
                                        <li key={i} style={{ color: ans.isCorrect ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                          Questão {ans.qIndex !== undefined ? (ans.qIndex + 1) : (i + 1)}: {ans.text || ans.optionText || '(Tempo Esgotado)'} {ans.isCorrect ? '✓' : '✗'}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : (
                                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Nenhum detalhe de respostas salvo para a última tentativa.</p>
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
      
      {isCustomizingMonster && (
        <AvatarCustomizationModal
          isOpen={true}
          onClose={() => setIsCustomizingMonster(false)}
          initialConfig={questMonsterConfig || undefined}
          customSaveMode={true}
          onSave={(newConfig) => {
             setQuestMonsterConfig(newConfig);
          }}
        />
      )}

      {isClassModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-panel" style={{ width: '400px', padding: '2rem', animation: 'slideUp 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>Editar Turma</h3>
              <button onClick={() => { setIsClassModalOpen(false); setEditingClassId(null); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome da Turma</label>
              <input type="text" value={editClassName} onChange={e => setEditClassName(e.target.value)} placeholder="Ex: 6º ano A" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Cor da Turma</label>
              <input type="color" value={editClassColor} onChange={e => setEditClassColor(e.target.value)} style={{ width: '100%', height: '45px', padding: '0', borderRadius: '8px', background: 'transparent', border: 'none', cursor: 'pointer' }} />
            </div>

            <button className="login-btn" onClick={handleEditClassSubmit} style={{ width: '100%', justifyContent: 'center', background: 'var(--accent-blue)', color: 'white', border: 'none' }}>
              Salvar Alterações
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
