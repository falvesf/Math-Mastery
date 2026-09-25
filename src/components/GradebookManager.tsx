import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  FileSpreadsheet, Save, RefreshCw, Download, ShieldCheck, 
  Search, Check, BookOpen, Medal, Users, Sliders, 
  RotateCcw, Sparkles, Columns, EyeOff 
} from 'lucide-react';
// @ts-ignore
import { Settings, ArrowUpDown, AlertCircle, Star, ChevronRight, Eye } from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import { useAuth, type UserData } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import { usePermissions } from '../lib/permissions';
import { getRankForXp } from '../lib/ranks';
// @ts-ignore
import { type RankDef } from '../lib/ranks';
// @ts-ignore
import { type StudentGradeRecord } from '../lib/gradebook';
// @ts-ignore
import { 
  type ClassGradebook, type BimesterGrades, 
  type GradebookWeights, calculateBimesterXp, 
  calculateBimestersSum, calculateStudentTotalXp, 
  loadClassGradebook, saveClassGradebook, loadEvaluationWeights, 
  exportGradebookToExcel,
  loadUserGradebookColumnPreferences, saveUserGradebookColumnPreferences
} from '../lib/gradebook';
// @ts-ignore
import { DEFAULT_WEIGHTS, parseGradeValue } from '../lib/gradebook';
import GradebookSyncModal from './GradebookSyncModal';
import TenantBackupModal from './TenantBackupModal';
import GradebookColumnModal from './GradebookColumnModal';

interface GradebookManagerProps {
  students: UserData[];
  schoolClasses: { id: string; name: string; color?: string }[];
  onRefreshStudents?: () => void;
}

type BimestreTab = 'all' | 'b1' | 'b2' | 'b3' | 'b4';

function StudentRankBadge({ rankDef }: { rankDef: RankDef }) {
  const [imgError, setImgError] = useState(false);
  const color = rankDef?.color || '#94a3b8';

  return (
    <div
      title={`Patente: ${rankDef?.name || 'Sem Patente'}`}
      style={{
        width: '24px',
        height: '24px',
        minWidth: '24px',
        maxWidth: '24px',
        borderRadius: '6px',
        background: `${color}18`,
        border: `1px solid ${color}60`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        boxShadow: `0 0 6px ${color}25`
      }}
    >
      {rankDef?.imageUrl && !imgError ? (
        <img
          src={rankDef.imageUrl}
          alt={rankDef.name}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '1px' }}
        />
      ) : (
        <Medal size={13} color={color} />
      )}
    </div>
  );
}

export default function GradebookManager({
  students,
  schoolClasses,
  onRefreshStudents
}: GradebookManagerProps) {
  const { tenant, tenantId, isSuperAdmin } = useTenant();
  const { userData } = useAuth();
  const { showAlert, showConfirm, showToast } = useDialog();
  const { can: canGradebook } = usePermissions();

  const canEdit = isSuperAdmin || canGradebook('gradebook', 'update') || canGradebook('gradebook', 'create') || userData?.role === 'admin' || userData?.role === 'teacher';
  const canDelete = isSuperAdmin || canGradebook('gradebook', 'delete') || userData?.role === 'admin';

  // Turma selecionada
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [activeBimestre, setActiveBimestre] = useState<BimestreTab>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Mobile: colapsa os nomes longos (toque para expandir).
  const [isNarrow, setIsNarrow] = useState<boolean>(typeof window !== 'undefined' && window.innerWidth <= 640);
  const [expandedNameUid, setExpandedNameUid] = useState<string | null>(null);

  // Estado da planilha da turma atual
  const [gradebook, setGradebook] = useState<ClassGradebook | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [weightsPanelOpen, setWeightsPanelOpen] = useState(false);

  // Modais
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [columnModalOpen, setColumnModalOpen] = useState(false);

  // Colunas ocultadas pelo usuário (persistidas no Supabase e localStorage)
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => {
    if (userData?.uid) {
      try {
        const cached = localStorage.getItem(`math_mastery_gb_hidden_cols_${userData.uid}`);
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }
    return [];
  });

  // Carrega preferências salvas no Supabase para sincronização entre dispositivos
  useEffect(() => {
    if (!userData?.uid) return;
    loadUserGradebookColumnPreferences(userData.uid).then(remoteList => {
      if (remoteList && Array.isArray(remoteList)) {
        setHiddenColumns(remoteList);
      }
    });
  }, [userData?.uid]);

  const toggleColumn = useCallback((colId: string) => {
    setHiddenColumns(prev => {
      const isHidden = prev.includes(colId);
      const next = isHidden ? prev.filter(c => c !== colId) : [...prev, colId];
      if (userData?.uid) {
        saveUserGradebookColumnPreferences(userData.uid, next, tenantId);
      }
      return next;
    });
  }, [userData?.uid, tenantId]);

  const handleSetMultipleColumns = useCallback((colIds: string[], hide: boolean) => {
    setHiddenColumns(prev => {
      let next: string[];
      if (hide) {
        next = Array.from(new Set([...prev, ...colIds]));
      } else {
        next = prev.filter(c => !colIds.includes(c));
      }
      if (userData?.uid) {
        saveUserGradebookColumnPreferences(userData.uid, next, tenantId);
      }
      return next;
    });
  }, [userData?.uid, tenantId]);

  const handleResetColumns = useCallback(() => {
    setHiddenColumns([]);
    if (userData?.uid) {
      saveUserGradebookColumnPreferences(userData.uid, [], tenantId);
    }
    showToast('Todas as colunas foram restauradas e estão visíveis.');
  }, [userData?.uid, tenantId, showToast]);

  const isColVisible = useCallback((colId: string) => !hiddenColumns.includes(colId), [hiddenColumns]);

  const b1Cols = useMemo(() => [
    { id: 'b1_p1', label: 'P1', field: 'p1' as const, color: '#93c5fd', width: '38px', title: 'Prova 1 (1º Bim)' },
    { id: 'b1_p2', label: 'P2', field: 'p2' as const, color: '#93c5fd', width: '38px', title: 'Prova 2 (1º Bim)' },
    { id: 'b1_tb1', label: 'TB1', field: 'tb1' as const, color: '#93c5fd', width: '38px', title: 'Trabalho 1 (1º Bim)' },
    { id: 'b1_tb2', label: 'TB2', field: 'tb2' as const, color: '#93c5fd', width: '38px', title: 'Trabalho 2 (1º Bim)' },
    { id: 'b1_extra', label: 'Ext', field: 'extra' as const, color: '#bfdbfe', width: '38px', title: 'Atividades Extras (1º Bim)' },
    { id: 'b1_total', label: 'Total', field: 'total' as const, color: '#60a5fa', width: '54px', isTotal: true, title: 'Total XP Calculado (1º Bim)' },
  ], []);

  const b2Cols = useMemo(() => [
    { id: 'b2_p1', label: 'P1', field: 'p1' as const, color: '#6ee7b7', width: '38px', title: 'Prova 1 (2º Bim)' },
    { id: 'b2_p2', label: 'P2', field: 'p2' as const, color: '#6ee7b7', width: '38px', title: 'Prova 2 (2º Bim)' },
    { id: 'b2_tb1', label: 'TB1', field: 'tb1' as const, color: '#6ee7b7', width: '38px', title: 'Trabalho 1 (2º Bim)' },
    { id: 'b2_tb2', label: 'TB2', field: 'tb2' as const, color: '#6ee7b7', width: '38px', title: 'Trabalho 2 (2º Bim)' },
    { id: 'b2_extra', label: 'Ext', field: 'extra' as const, color: '#a7f3d0', width: '38px', title: 'Atividades Extras (2º Bim)' },
    { id: 'b2_total', label: 'Total', field: 'total' as const, color: '#34d399', width: '54px', isTotal: true, title: 'Total XP Calculado (2º Bim)' },
  ], []);

  const b3Cols = useMemo(() => [
    { id: 'b3_p1', label: 'P1', field: 'p1' as const, color: '#fbbf24', width: '38px', title: 'Prova 1 (3º Bim)' },
    { id: 'b3_p2', label: 'P2', field: 'p2' as const, color: '#fbbf24', width: '38px', title: 'Prova 2 (3º Bim)' },
    { id: 'b3_tb1', label: 'TB1', field: 'tb1' as const, color: '#fbbf24', width: '38px', title: 'Trabalho 1 (3º Bim)' },
    { id: 'b3_tb2', label: 'TB2', field: 'tb2' as const, color: '#fbbf24', width: '38px', title: 'Trabalho 2 (3º Bim)' },
    { id: 'b3_extra', label: 'Ext', field: 'extra' as const, color: '#fde68a', width: '38px', title: 'Atividades Extras (3º Bim)' },
    { id: 'b3_total', label: 'Total', field: 'total' as const, color: '#f59e0b', width: '54px', isTotal: true, title: 'Total XP Calculado (3º Bim)' },
  ], []);

  const b4Cols = useMemo(() => [
    { id: 'b4_p1', label: 'P1', field: 'p1' as const, color: '#c084fc', width: '38px', title: 'Prova 1 (4º Bim)' },
    { id: 'b4_p2', label: 'P2', field: 'p2' as const, color: '#c084fc', width: '38px', title: 'Prova 2 (4º Bim)' },
    { id: 'b4_tb1', label: 'TB1', field: 'tb1' as const, color: '#c084fc', width: '38px', title: 'Trabalho 1 (4º Bim)' },
    { id: 'b4_tb2', label: 'TB2', field: 'tb2' as const, color: '#c084fc', width: '38px', title: 'Trabalho 2 (4º Bim)' },
    { id: 'b4_extra', label: 'Ext', field: 'extra' as const, color: '#e9d5ff', width: '38px', title: 'Atividades Extras (4º Bim)' },
    { id: 'b4_total', label: 'Total', field: 'total' as const, color: '#a855f7', width: '54px', isTotal: true, title: 'Total XP Calculado (4º Bim)' },
  ], []);

  const visibleB1 = useMemo(() => b1Cols.filter(c => isColVisible(c.id)), [b1Cols, isColVisible]);
  const visibleB2 = useMemo(() => b2Cols.filter(c => isColVisible(c.id)), [b2Cols, isColVisible]);
  const visibleB3 = useMemo(() => b3Cols.filter(c => isColVisible(c.id)), [b3Cols, isColVisible]);
  const visibleB4 = useMemo(() => b4Cols.filter(c => isColVisible(c.id)), [b4Cols, isColVisible]);

  // Lista de turmas disponíveis (classes cadastradas + turmas encontradas nos alunos)
  const availableClasses = useMemo(() => {
    const classSet = new Map<string, { id: string; name: string; color: string; count: number }>();

    schoolClasses.forEach(c => {
      classSet.set(c.name, {
        id: c.id,
        name: c.name,
        color: c.color || '#3b82f6',
        count: 0
      });
    });

    students.forEach(s => {
      if (s.role === 'student' && s.classId) {
        if (classSet.has(s.classId)) {
          classSet.get(s.classId)!.count += 1;
        } else {
          classSet.set(s.classId, {
            id: s.classId,
            name: s.classId,
            color: '#64748b',
            count: 1
          });
        }
      }
    });

    return Array.from(classSet.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [schoolClasses, students]);

  // Define turma inicial
  useEffect(() => {
    if (!selectedClass && availableClasses.length > 0) {
      setSelectedClass(availableClasses[0].name);
    }
  }, [availableClasses, selectedClass]);

  // Alunos da turma selecionada
  const classStudents = useMemo(() => {
    if (!selectedClass) return [];
    return students
      .filter(s => s.role === 'student' && s.classId === selectedClass)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, selectedClass]);

  // Alunos filtrados por busca — aceita VÁRIAS palavras (todas precisam bater), sem acento.
  const filteredStudents = useMemo(() => {
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const words = norm(searchQuery).split(/\s+/).filter(Boolean);
    if (!words.length) return classStudents;
    return classStudents.filter(s => { const n = norm(s.name); return words.every(w => n.includes(w)); });
  }, [classStudents, searchQuery]);

  // Reavalia o modo mobile ao redimensionar.
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth <= 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Carrega a planilha quando troca a turma
  const loadCurrentClassGradebook = useCallback(async () => {
    if (!tenantId || !selectedClass) return;
    setLoading(true);
    try {
      const loaded = await loadClassGradebook(tenantId, selectedClass);
      if (loaded) {
        setGradebook(loaded);
      } else {
        // Inicializa com pesos da Avaliação ou padrões
        const evalWeights = await loadEvaluationWeights();
        const newGb: ClassGradebook = {
          classId: selectedClass,
          className: selectedClass,
          tenantId,
          updatedAt: new Date().toISOString(),
          updatedBy: userData?.email || 'Professor',
          weights: evalWeights,
          syncMode: 'additive',
          grades: {}
        };

        // Pré-preenche registros para os alunos atuais da turma
        classStudents.forEach(st => {
          newGb.grades[st.uid] = {
            studentId: st.uid,
            studentName: st.name,
            b1: {},
            b2: {},
            b3: {},
            b4: {},
            baseXp: st.xp || 0 // Inicializa XP Base com o XP atual do aluno para preservar integralmente
          };
        });

        setGradebook(newGb);
      }
      setSaveStatus('saved');
    } catch (err) {
      console.error('Erro ao carregar gradebook:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedClass, userData?.email, classStudents]);

  useEffect(() => {
    if (selectedClass && tenantId) {
      loadCurrentClassGradebook();
    }
  }, [selectedClass, tenantId, loadCurrentClassGradebook]);

  // Auto-save debounced
  const saveTimeoutRef = useRef<any>(null);

  const triggerAutoSave = useCallback((updatedGb: ClassGradebook) => {
    setSaveStatus('unsaved');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      if (!tenantId || !selectedClass) return;
      setSaveStatus('saving');
      const ok = await saveClassGradebook(tenantId, selectedClass, updatedGb);
      if (ok) {
        setSaveStatus('saved');
      } else {
        setSaveStatus('unsaved');
      }
    }, 1200);
  }, [tenantId, selectedClass]);

  // Salvar manual
  const handleManualSave = async () => {
    if (!tenantId || !selectedClass || !gradebook) return;
    setSaveStatus('saving');
    const ok = await saveClassGradebook(tenantId, selectedClass, gradebook);
    if (ok) {
      setSaveStatus('saved');
      showToast?.('Planilha salva com sucesso!');
    } else {
      setSaveStatus('unsaved');
      showAlert('Erro', 'Não foi possível salvar a planilha no momento.');
    }
  };

  // Atualiza uma nota individual de um aluno
  const handleGradeChange = (
    studentId: string,
    studentName: string,
    bimestreKey: 'b1' | 'b2' | 'b3' | 'b4',
    field: keyof BimesterGrades,
    rawValue: string
  ) => {
    if (!gradebook) return;

    const currentRecord = gradebook.grades[studentId] || {
      studentId,
      studentName,
      b1: {},
      b2: {},
      b3: {},
      b4: {},
      baseXp: 0
    };

    const currentBimester = currentRecord[bimestreKey] || {};
    const updatedBimester = {
      ...currentBimester,
      [field]: rawValue
    };

    const updatedGrades = {
      ...gradebook.grades,
      [studentId]: {
        ...currentRecord,
        studentName,
        [bimestreKey]: updatedBimester
      }
    };

    const updatedGb: ClassGradebook = {
      ...gradebook,
      grades: updatedGrades
    };

    setGradebook(updatedGb);
    triggerAutoSave(updatedGb);
  };

  // Atualiza o XP Base do aluno
  const handleBaseXpChange = (studentId: string, studentName: string, val: string) => {
    if (!gradebook) return;

    const currentRecord = gradebook.grades[studentId] || {
      studentId,
      studentName,
      b1: {},
      b2: {},
      b3: {},
      b4: {},
      baseXp: 0
    };

    const updatedGb: ClassGradebook = {
      ...gradebook,
      grades: {
        ...gradebook.grades,
        [studentId]: {
          ...currentRecord,
          studentName,
          baseXp: val
        }
      }
    };

    setGradebook(updatedGb);
    triggerAutoSave(updatedGb);
  };

  // Recalcular todos os XPs Base a partir do sistema (XP Atual do Aluno menos o total das notas calculadas)
  const handleRecalculateAllBaseXp = async () => {
    if (!gradebook) return;
    const ok = await showConfirm(
      'Ajustar XP Base?',
      'Esta ação ajustará o campo "XP Base" de cada aluno para que a soma total seja igual ao XP atual registrado no sistema. Nenhuma nota será perdida.'
    );
    if (!ok) return;

    const updatedGrades = { ...gradebook.grades };

    classStudents.forEach(st => {
      const rec = updatedGrades[st.uid] || {
        studentId: st.uid,
        studentName: st.name,
        b1: {},
        b2: {},
        b3: {},
        b4: {},
        baseXp: 0
      };

      const bimSum = calculateBimestersSum(rec, gradebook.weights);
      const currentSystemXp = Number(st.xp) || 0;
      // Define a base como a diferença para bater exatamente com o sistema
      rec.baseXp = Math.max(0, currentSystemXp - bimSum);
      updatedGrades[st.uid] = rec;
    });

    const updatedGb: ClassGradebook = {
      ...gradebook,
      grades: updatedGrades
    };

    setGradebook(updatedGb);
    triggerAutoSave(updatedGb);
    showToast?.('XP Base ajustado para todos os alunos!');
  };

  // Atualiza os pesos de cálculo da turma
  const handleWeightsChange = (newWeights: Partial<GradebookWeights>) => {
    if (!gradebook) return;
    const updatedGb: ClassGradebook = {
      ...gradebook,
      weights: {
        ...gradebook.weights,
        ...newWeights
      }
    };
    setGradebook(updatedGb);
    triggerAutoSave(updatedGb);
  };

  // Copia pesos configurados na aba "Avaliação"
  const handleSyncWeightsWithAvaliacao = async () => {
    try {
      const loaded = await loadEvaluationWeights();
      handleWeightsChange(loaded);
      showToast?.('Pesos importados da aba Avaliação!');
    } catch (e) {
      showAlert('Erro', 'Não foi possível ler os pesos da Avaliação.');
    }
  };

  // Navegação por teclado estilo Planilha (Excel)
  const handleInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colId: string
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const targetRow = e.shiftKey ? rowIndex - 1 : rowIndex + 1;
      if (targetRow >= 0 && targetRow < filteredStudents.length) {
        const nextInput = document.querySelector<HTMLInputElement>(
          `input[data-row="${targetRow}"][data-col="${colId}"]`
        );
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    } else if (e.key === 'ArrowDown') {
      const targetRow = rowIndex + 1;
      if (targetRow < filteredStudents.length) {
        const nextInput = document.querySelector<HTMLInputElement>(
          `input[data-row="${targetRow}"][data-col="${colId}"]`
        );
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    } else if (e.key === 'ArrowUp') {
      const targetRow = rowIndex - 1;
      if (targetRow >= 0) {
        const nextInput = document.querySelector<HTMLInputElement>(
          `input[data-row="${targetRow}"][data-col="${colId}"]`
        );
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    }
  };

  // Exportação para Excel
  const handleExportExcel = () => {
    if (!gradebook || classStudents.length === 0) {
      showAlert('Atenção', 'Não há dados suficientes para exportar.');
      return;
    }
    exportGradebookToExcel(selectedClass, classStudents, gradebook);
  };

  return (
    <div 
      style={{ 
        flex: 1, 
        minHeight: 0, 
        height: '100%',
        display: 'flex', 
        flexDirection: 'column', 
        gap: '0.45rem', 
        animation: 'fadeIn 0.25s ease-out',
        overflow: 'hidden'
      }}
    >
      {/* Barra de Cabeçalho Compacta */}
      <div 
        style={{ 
          flexShrink: 0,
          background: 'rgba(20, 24, 33, 0.75)', 
          padding: '0.45rem 0.85rem', 
          borderRadius: '10px', 
          border: '1px solid var(--border-glass)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <FileSpreadsheet size={22} color="var(--gold-primary)" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 'bold' }}>
                <span className="hide-on-mobile">Planilha de Notas & Controle de XP</span>
                <span className="show-on-mobile-inline">Planilha de Notas e XP</span>
              </h2>
              {saveStatus === 'saving' && (
                <span style={{ fontSize: '0.72rem', color: 'var(--gold-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                  <RefreshCw size={11} className="animate-spin" /> Salvando...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span style={{ fontSize: '0.72rem', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                  <Check size={11} /> Salvo
                </span>
              )}
              {saveStatus === 'unsaved' && (
                <span style={{ fontSize: '0.72rem', color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                  • Pendente
                </span>
              )}
            </div>
            <p className="hide-on-mobile" style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
              Substitua integralmente o Excel lançando notas bimestrais, calculando patentes e sincronizando o XP em massa.
            </p>
          </div>
        </div>

        {/* Botões de Ação Topo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'nowrap' }}>
          {canDelete && (
            <button
              onClick={() => setBackupModalOpen(true)}
              className="login-btn"
              style={{
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '0.35rem 0.7rem',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
              title="Backups do Tenant - Gerenciar backups em JSON da escola"
            >
              <ShieldCheck size={14} />
              <span className="hide-on-mobile">Backups do Tenant</span>
            </button>
          )}

          <button
            onClick={handleExportExcel}
            className="login-btn"
            style={{
              background: 'rgba(59, 130, 246, 0.12)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              padding: '0.35rem 0.7rem',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
            title="Exportar XLSX - Arquivo idêntico à planilha oficial"
          >
            <Download size={14} />
            <span className="hide-on-mobile">Exportar XLSX</span>
          </button>

          {canEdit && (
            <button
              onClick={() => setSyncModalOpen(true)}
              disabled={classStudents.length === 0}
              className="login-btn"
              style={{
                background: 'var(--gold-primary)',
                color: 'var(--text-on-gold, #000)',
                border: 'none',
                padding: '0.35rem 0.85rem',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                boxShadow: '0 2px 8px rgba(218, 165, 32, 0.25)'
              }}
              title="Sincronizar XP com Usuários"
            >
              <Sparkles size={14} />
              <span className="hide-on-mobile">Sincronizar XP com Usuários</span>
            </button>
          )}
        </div>
      </div>

      {/* Seletores de Turma (Abas Horizontais) */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="hide-scrollbar" style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.15rem' }}>
          {availableClasses.map(c => {
            const isSelected = selectedClass === c.name;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedClass(c.name)}
                style={{
                  padding: '0.35rem 0.8rem',
                  borderRadius: '14px',
                  border: isSelected ? '1px solid var(--gold-primary)' : `1px solid ${c.color || 'var(--border-glass)'}`,
                  background: isSelected ? 'var(--gold-primary)' : 'rgba(255,255,255,0.03)',
                  color: isSelected ? 'var(--text-on-gold, #000)' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontWeight: isSelected ? 'bold' : 'normal',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  whiteSpace: 'nowrap',
                  boxShadow: isSelected ? '0 2px 6px rgba(245, 158, 11, 0.25)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                <BookOpen size={13} />
                <span>{c.name}</span>
                <span 
                  style={{ 
                    fontSize: '0.7rem', 
                    padding: '0.05rem 0.4rem', 
                    borderRadius: '8px', 
                    background: isSelected ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)',
                    fontWeight: 'bold' 
                  }}
                >
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Busca rápida */}
        <div style={{ position: 'relative', width: '200px' }}>
          <Search size={13} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Filtrar aluno (uma ou mais palavras)..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.35rem 0.65rem 0.35rem 1.9rem',
              borderRadius: '6px',
              background: 'var(--bg-dark)',
              border: '1px solid var(--border-glass)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem'
            }}
          />
        </div>
      </div>

      {/* Barra de Filtro de Bimestres & Pesos */}
      <div 
        style={{ 
          flexShrink: 0,
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '0.5rem',
          background: 'rgba(0,0,0,0.2)', 
          padding: '0.35rem 0.65rem', 
          borderRadius: '8px',
          border: '1px solid var(--border-glass)'
        }}
      >
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'Visão Anual (Todos)', shortLabel: 'Todos' },
            { id: 'b1', label: '1º Bimestre', shortLabel: '1º BIM' },
            { id: 'b2', label: '2º Bimestre', shortLabel: '2º BIM' },
            { id: 'b3', label: '3º Bimestre', shortLabel: '3º BIM' },
            { id: 'b4', label: '4º Bimestre', shortLabel: '4º BIM' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveBimestre(tab.id as BimestreTab)}
              style={{
                padding: '0.25rem 0.65rem',
                borderRadius: '6px',
                border: activeBimestre === tab.id ? '1px solid var(--gold-primary)' : '1px solid transparent',
                background: activeBimestre === tab.id ? 'rgba(251, 191, 36, 0.15)' : 'transparent',
                color: activeBimestre === tab.id ? 'var(--gold-primary)' : 'var(--text-secondary)',
                fontWeight: activeBimestre === tab.id ? 'bold' : 'normal',
                fontSize: '0.78rem',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <span className="hide-on-mobile">{tab.label}</span>
              <span className="show-on-mobile-inline">{tab.shortLabel}</span>
            </button>
          ))}
        </div>

        {/* Atalho Pesos e Base */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div 
            onClick={() => setWeightsPanelOpen(!weightsPanelOpen)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.35rem', 
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
              borderRadius: '6px',
              background: weightsPanelOpen ? 'rgba(255,255,255,0.08)' : 'transparent',
              fontSize: '0.76rem',
              color: 'var(--text-secondary)'
            }}
            title="Configurar pesos multiplicadores de Provas, Trabalhos e Extras"
          >
            <Sliders size={13} color="var(--gold-primary)" />
            <span>
              Pesos: Prova <strong style={{ color: 'var(--gold-primary)' }}>×{gradebook?.weights?.pesoProva ?? 100}</strong> • Trabalho <strong style={{ color: 'var(--gold-primary)' }}>×{gradebook?.weights?.pesoTrabalho ?? 100}</strong> • Extra <strong style={{ color: 'var(--gold-primary)' }}>×{gradebook?.weights?.pesoExtra ?? 100}</strong>
            </span>
          </div>

          {canEdit && (
            <button
              onClick={handleRecalculateAllBaseXp}
              className="login-btn"
              style={{
                padding: '0.25rem 0.55rem',
                fontSize: '0.75rem',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border-glass)',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
              title="Ajustar XP Base - Ajusta o XP Base para igualar o XP atual de cada aluno no sistema"
            >
              <RotateCcw size={12} />
              <span className="hide-on-mobile">Ajustar XP Base</span>
            </button>
          )}

          <button
            onClick={() => setColumnModalOpen(true)}
            className="login-btn"
            style={{
              padding: '0.25rem 0.65rem',
              fontSize: '0.75rem',
              background: hiddenColumns.length > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.04)',
              border: hiddenColumns.length > 0 ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid var(--border-glass)',
              color: hiddenColumns.length > 0 ? '#fca5a5' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              cursor: 'pointer'
            }}
            title="Colunas - Personalizar e ocultar/exibir colunas da planilha"
          >
            <Columns size={13} color={hiddenColumns.length > 0 ? '#f87171' : 'var(--gold-primary)'} />
            <span className="hide-on-mobile">Colunas</span>
            {hiddenColumns.length > 0 && (
              <span style={{
                fontSize: '0.68rem',
                padding: '0.05rem 0.35rem',
                borderRadius: '999px',
                background: 'rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontWeight: 'bold'
              }}>
                {hiddenColumns.length}<span className="hide-on-mobile"> ocultas</span>
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Painel Expansível de Pesos */}
      {weightsPanelOpen && gradebook && (
        <div 
          style={{ 
            flexShrink: 0,
            background: 'rgba(0,0,0,0.4)', 
            border: '1px solid var(--border-glass)', 
            borderRadius: '8px', 
            padding: '0.75rem',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.82rem', color: 'var(--gold-primary)' }}>
              Fórmula: XP Bimestre = (P1 + P2) × Peso Prova + (TB1 + TB2) × Peso Trabalho + Extra × Peso Extra
            </strong>
            <button
              onClick={handleSyncWeightsWithAvaliacao}
              className="login-btn"
              style={{
                padding: '0.25rem 0.6rem',
                fontSize: '0.75rem',
                background: 'rgba(251, 191, 36, 0.1)',
                border: '1px solid var(--gold-primary)',
                color: 'var(--gold-primary)'
              }}
            >
              Vincular com Guia Avaliação
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                Peso Provas (P1 + P2)
              </label>
              <input
                type="number"
                value={gradebook.weights.pesoProva}
                onChange={e => handleWeightsChange({ pesoProva: Number(e.target.value) || 0 })}
                style={{
                  width: '100%',
                  padding: '0.35rem',
                  borderRadius: '6px',
                  background: 'var(--bg-dark)',
                  border: '1px solid var(--border-glass)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                Peso Trabalhos (TB1 + TB2)
              </label>
              <input
                type="number"
                value={gradebook.weights.pesoTrabalho}
                onChange={e => handleWeightsChange({ pesoTrabalho: Number(e.target.value) || 0 })}
                style={{
                  width: '100%',
                  padding: '0.35rem',
                  borderRadius: '6px',
                  background: 'var(--bg-dark)',
                  border: '1px solid var(--border-glass)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                Peso Atividades Extras
              </label>
              <input
                type="number"
                value={gradebook.weights.pesoExtra}
                onChange={e => handleWeightsChange({ pesoExtra: Number(e.target.value) || 0 })}
                style={{
                  width: '100%',
                  padding: '0.35rem',
                  borderRadius: '6px',
                  background: 'var(--bg-dark)',
                  border: '1px solid var(--border-glass)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Grade Spreadsheet Table Container (Scroll H/V ÚNICO da planilha) */}
      <div 
        style={{ 
          flex: 1, 
          minHeight: 0, 
          overflow: 'auto',
          border: '1px solid var(--border-glass)', 
          borderRadius: '10px', 
          background: 'rgba(17, 21, 31, 0.65)', 
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          position: 'relative'
        }}
      >
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <RefreshCw size={22} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
            <p>Carregando dados da turma {selectedClass}...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Users size={32} style={{ opacity: 0.4, margin: '0 auto 0.5rem auto' }} />
            <p>Nenhum aluno encontrado na turma {selectedClass}.</p>
          </div>
        ) : (
          <table 
            style={{ 
              width: '100%', 
              borderCollapse: 'separate', 
              borderSpacing: 0, 
              fontSize: '0.8rem',
              textAlign: 'left'
            }}
          >
            {/* Header com 2 Linhas: Bimestres em Cima, Avaliações em Baixo */}
            <thead>
              {/* Linha 1: Títulos de Bimestres e Colunas Fixas */}
              <tr style={{ background: '#11151f', position: 'sticky', top: 0, zIndex: 11 }}>
                {/* Colunas Fixas (RowSpan 2) */}
                <th 
                  rowSpan={2} 
                  style={{ 
                    position: 'sticky', 
                    top: 0, 
                    left: 0, 
                    zIndex: 14, 
                    background: '#11151f', 
                    width: '36px', 
                    minWidth: '36px', 
                    textAlign: 'center', 
                    padding: '0.35rem 0.25rem', 
                    borderBottom: '1px solid var(--border-glass)', 
                    borderRight: '1px solid rgba(255,255,255,0.08)' 
                  }}
                >
                  #
                </th>
                <th 
                  rowSpan={2} 
                  style={{ 
                    position: 'sticky', 
                    top: 0, 
                    left: '36px', 
                    zIndex: 14, 
                    background: '#11151f', 
                    width: '190px', 
                    minWidth: '190px', 
                    padding: '0.35rem 0.65rem', 
                    borderBottom: '1px solid var(--border-glass)', 
                    borderRight: '1px solid rgba(255,255,255,0.08)' 
                  }}
                >
                  Nome do Aluno
                </th>

                {/* 1º Bimestre Header Grupo */}
                {(activeBimestre === 'all' || activeBimestre === 'b1') && visibleB1.length > 0 && (
                  <th 
                    colSpan={visibleB1.length} 
                    style={{ 
                      position: 'sticky', 
                      top: 0, 
                      zIndex: 11, 
                      textAlign: 'center', 
                      padding: '0.3rem 0.4rem', 
                      borderBottom: '1px solid rgba(59, 130, 246, 0.35)', 
                      borderRight: '1px solid rgba(59, 130, 246, 0.4)', 
                      background: 'rgba(30, 58, 138, 0.4)', 
                      color: '#93c5fd', 
                      fontWeight: 'bold', 
                      fontSize: '0.78rem' 
                    }}
                  >
                    1º Bimestre
                  </th>
                )}

                {/* 2º Bimestre Header Grupo */}
                {(activeBimestre === 'all' || activeBimestre === 'b2') && visibleB2.length > 0 && (
                  <th 
                    colSpan={visibleB2.length} 
                    style={{ 
                      position: 'sticky', 
                      top: 0, 
                      zIndex: 11, 
                      textAlign: 'center', 
                      padding: '0.3rem 0.4rem', 
                      borderBottom: '1px solid rgba(160, 185, 129, 0.35)', 
                      borderRight: '1px solid rgba(16, 185, 129, 0.4)', 
                      background: 'rgba(6, 78, 59, 0.4)', 
                      color: '#6ee7b7', 
                      fontWeight: 'bold', 
                      fontSize: '0.78rem' 
                    }}
                  >
                    2º Bimestre
                  </th>
                )}

                {/* 3º Bimestre Header Grupo */}
                {(activeBimestre === 'all' || activeBimestre === 'b3') && visibleB3.length > 0 && (
                  <th 
                    colSpan={visibleB3.length} 
                    style={{ 
                      position: 'sticky', 
                      top: 0, 
                      zIndex: 11, 
                      textAlign: 'center', 
                      padding: '0.3rem 0.4rem', 
                      borderBottom: '1px solid rgba(245, 158, 11, 0.35)', 
                      borderRight: '1px solid rgba(245, 158, 11, 0.4)', 
                      background: 'rgba(120, 53, 15, 0.4)', 
                      color: '#fde68a', 
                      fontWeight: 'bold', 
                      fontSize: '0.78rem' 
                    }}
                  >
                    3º Bimestre
                  </th>
                )}

                {/* 4º Bimestre Header Grupo */}
                {(activeBimestre === 'all' || activeBimestre === 'b4') && visibleB4.length > 0 && (
                  <th 
                    colSpan={visibleB4.length} 
                    style={{ 
                      position: 'sticky', 
                      top: 0, 
                      zIndex: 11, 
                      textAlign: 'center', 
                      padding: '0.3rem 0.4rem', 
                      borderBottom: '1px solid rgba(168, 85, 247, 0.35)', 
                      borderRight: '1px solid rgba(168, 85, 247, 0.4)', 
                      background: 'rgba(88, 28, 135, 0.4)', 
                      color: '#e9d5ff', 
                      fontWeight: 'bold', 
                      fontSize: '0.78rem' 
                    }}
                  >
                    4º Bimestre
                  </th>
                )}

                {/* Colunas Resumo Anual (RowSpan 2) */}
                {isColVisible('bimestres_sum') && (
                  <th 
                    rowSpan={2} 
                    style={{ 
                      position: 'sticky', 
                      top: 0, 
                      zIndex: 11, 
                      background: '#11151f', 
                      textAlign: 'center', 
                      width: '75px', 
                      minWidth: '75px', 
                      padding: '0.35rem 0.3rem', 
                      borderBottom: '1px solid var(--border-glass)', 
                      color: 'var(--text-secondary)', 
                      fontSize: '0.76rem' 
                    }} 
                    title="Soma do XP dos 4 bimestres"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                      <span>Bimestres</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleColumn('bimestres_sum'); }}
                        title="Ocultar coluna Bimestres"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', opacity: 0.35, display: 'inline-flex', alignItems: 'center' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.35'; }}
                      >
                        <EyeOff size={10} />
                      </button>
                    </div>
                  </th>
                )}

                {isColVisible('base_xp') && (
                  <th 
                    rowSpan={2} 
                    style={{ 
                      position: 'sticky', 
                      top: 0, 
                      zIndex: 11, 
                      background: '#11151f', 
                      textAlign: 'center', 
                      width: '75px', 
                      minWidth: '75px', 
                      padding: '0.35rem 0.3rem', 
                      borderBottom: '1px solid var(--border-glass)', 
                      color: '#38bdf8', 
                      fontSize: '0.76rem' 
                    }} 
                    title="XP anterior ou bônus manual"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                      <span>XP Base</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleColumn('base_xp'); }}
                        title="Ocultar coluna XP Base"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', opacity: 0.35, display: 'inline-flex', alignItems: 'center' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.35'; }}
                      >
                        <EyeOff size={10} />
                      </button>
                    </div>
                  </th>
                )}

                {isColVisible('total_xp') && (
                  <th 
                    rowSpan={2} 
                    style={{ 
                      position: 'sticky', 
                      top: 0, 
                      zIndex: 11, 
                      background: '#181b24', 
                      textAlign: 'center', 
                      width: '85px', 
                      minWidth: '85px', 
                      padding: '0.35rem 0.3rem', 
                      borderBottom: '1px solid var(--border-glass)', 
                      color: 'var(--gold-primary)', 
                      fontWeight: 'bold', 
                      fontSize: '0.76rem' 
                    }} 
                    title="XP Total Final Calculado"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                      <span>XP Total</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleColumn('total_xp'); }}
                        title="Ocultar coluna XP Total"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', opacity: 0.35, display: 'inline-flex', alignItems: 'center' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.35'; }}
                      >
                        <EyeOff size={10} />
                      </button>
                    </div>
                  </th>
                )}

                {isColVisible('rank') && (
                  <th 
                    rowSpan={2} 
                    style={{ 
                      position: 'sticky', 
                      top: 0, 
                      zIndex: 11, 
                      background: '#11151f', 
                      textAlign: 'center', 
                      width: '105px', 
                      minWidth: '105px', 
                      padding: '0.35rem 0.3rem', 
                      borderBottom: '1px solid var(--border-glass)', 
                      fontSize: '0.76rem' 
                    }} 
                    title="Patente Resultante"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                      <span>Patente</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleColumn('rank'); }}
                        title="Ocultar coluna Patente"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', opacity: 0.35, display: 'inline-flex', alignItems: 'center' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.35'; }}
                      >
                        <EyeOff size={10} />
                      </button>
                    </div>
                  </th>
                )}

                {isColVisible('system_xp') && (
                  <th 
                    rowSpan={2} 
                    style={{ 
                      position: 'sticky', 
                      top: 0, 
                      zIndex: 11, 
                      background: '#11151f', 
                      textAlign: 'center', 
                      width: '75px', 
                      minWidth: '75px', 
                      padding: '0.35rem 0.3rem', 
                      borderBottom: '1px solid var(--border-glass)', 
                      color: 'var(--text-secondary)', 
                      fontSize: '0.76rem' 
                    }} 
                    title="XP gravado atualmente no banco de dados"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                      <span>XP Sist.</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleColumn('system_xp'); }}
                        title="Ocultar coluna XP Sist."
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', opacity: 0.35, display: 'inline-flex', alignItems: 'center' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.35'; }}
                      >
                        <EyeOff size={10} />
                      </button>
                    </div>
                  </th>
                )}
              </tr>

              {/* Linha 2: Colunas Específicas de Notas (P1, P2, TB1, TB2, Ext, Total) */}
              <tr style={{ background: '#11151f', position: 'sticky', top: '27px', zIndex: 10 }}>
                {/* 1º Bimestre Sub-headers */}
                {(activeBimestre === 'all' || activeBimestre === 'b1') && visibleB1.map((col, idx) => (
                  <th 
                    key={col.id} 
                    style={{ 
                      padding: '0.22rem 0.12rem', 
                      textAlign: 'center', 
                      width: col.width, 
                      minWidth: col.width, 
                      borderBottom: '1px solid var(--border-glass)', 
                      borderRight: idx === visibleB1.length - 1 ? '1px solid rgba(59, 130, 246, 0.4)' : undefined, 
                      color: col.color, 
                      fontWeight: col.isTotal ? 'bold' : 'normal', 
                      background: col.isTotal ? 'rgba(59, 130, 246, 0.12)' : undefined, 
                      fontSize: '0.72rem' 
                    }}
                    title={col.title}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                      <span>{col.label}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleColumn(col.id); }}
                        title={`Ocultar coluna ${col.title}`}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', opacity: 0.35, display: 'inline-flex', alignItems: 'center' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.35'; }}
                      >
                        <EyeOff size={10} />
                      </button>
                    </div>
                  </th>
                ))}

                {/* 2º Bimestre Sub-headers */}
                {(activeBimestre === 'all' || activeBimestre === 'b2') && visibleB2.map((col, idx) => (
                  <th 
                    key={col.id} 
                    style={{ 
                      padding: '0.22rem 0.12rem', 
                      textAlign: 'center', 
                      width: col.width, 
                      minWidth: col.width, 
                      borderBottom: '1px solid var(--border-glass)', 
                      borderRight: idx === visibleB2.length - 1 ? '1px solid rgba(16, 185, 129, 0.4)' : undefined, 
                      color: col.color, 
                      fontWeight: col.isTotal ? 'bold' : 'normal', 
                      background: col.isTotal ? 'rgba(16, 185, 129, 0.12)' : undefined, 
                      fontSize: '0.72rem' 
                    }}
                    title={col.title}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                      <span>{col.label}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleColumn(col.id); }}
                        title={`Ocultar coluna ${col.title}`}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', opacity: 0.35, display: 'inline-flex', alignItems: 'center' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.35'; }}
                      >
                        <EyeOff size={10} />
                      </button>
                    </div>
                  </th>
                ))}

                {/* 3º Bimestre Sub-headers */}
                {(activeBimestre === 'all' || activeBimestre === 'b3') && visibleB3.map((col, idx) => (
                  <th 
                    key={col.id} 
                    style={{ 
                      padding: '0.22rem 0.12rem', 
                      textAlign: 'center', 
                      width: col.width, 
                      minWidth: col.width, 
                      borderBottom: '1px solid var(--border-glass)', 
                      borderRight: idx === visibleB3.length - 1 ? '1px solid rgba(245, 158, 11, 0.4)' : undefined, 
                      color: col.color, 
                      fontWeight: col.isTotal ? 'bold' : 'normal', 
                      background: col.isTotal ? 'rgba(245, 158, 11, 0.12)' : undefined, 
                      fontSize: '0.72rem' 
                    }}
                    title={col.title}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                      <span>{col.label}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleColumn(col.id); }}
                        title={`Ocultar coluna ${col.title}`}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', opacity: 0.35, display: 'inline-flex', alignItems: 'center' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.35'; }}
                      >
                        <EyeOff size={10} />
                      </button>
                    </div>
                  </th>
                ))}

                {/* 4º Bimestre Sub-headers */}
                {(activeBimestre === 'all' || activeBimestre === 'b4') && visibleB4.map((col, idx) => (
                  <th 
                    key={col.id} 
                    style={{ 
                      padding: '0.22rem 0.12rem', 
                      textAlign: 'center', 
                      width: col.width, 
                      minWidth: col.width, 
                      borderBottom: '1px solid var(--border-glass)', 
                      borderRight: idx === visibleB4.length - 1 ? '1px solid rgba(168, 85, 247, 0.4)' : undefined, 
                      color: col.color, 
                      fontWeight: col.isTotal ? 'bold' : 'normal', 
                      background: col.isTotal ? 'rgba(168, 85, 247, 0.12)' : undefined, 
                      fontSize: '0.72rem' 
                    }}
                    title={col.title}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                      <span>{col.label}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleColumn(col.id); }}
                        title={`Ocultar coluna ${col.title}`}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', opacity: 0.35, display: 'inline-flex', alignItems: 'center' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.35'; }}
                      >
                        <EyeOff size={10} />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {filteredStudents.map((student, rIdx) => {
                const rec = gradebook?.grades[student.uid] || {
                  studentId: student.uid,
                  studentName: student.name,
                  b1: {},
                  b2: {},
                  b3: {},
                  b4: {},
                  baseXp: student.xp || 0
                };

                const b1Xp = calculateBimesterXp(rec.b1, gradebook?.weights);
                const b2Xp = calculateBimesterXp(rec.b2, gradebook?.weights);
                const b3Xp = calculateBimesterXp(rec.b3, gradebook?.weights);
                const b4Xp = calculateBimesterXp(rec.b4, gradebook?.weights);
                const bimSum = b1Xp + b2Xp + b3Xp + b4Xp;
                const totalXp = calculateStudentTotalXp(rec, gradebook?.weights, true);
                const rankDef = getRankForXp(totalXp > 0 ? totalXp : (student.xp || 0), student.classId);
                const systemXp = Number(student.xp) || 0;

                const renderGradeInput = (
                  bKey: 'b1' | 'b2' | 'b3' | 'b4',
                  field: keyof BimesterGrades,
                  colId: string
                ) => {
                  const val = rec[bKey]?.[field] ?? '';
                  return (
                    <td style={{ padding: '0.2rem 0.15rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <input
                        type="text"
                        data-row={rIdx}
                        data-col={colId}
                        value={val === null || val === undefined ? '' : String(val)}
                        readOnly={!canEdit}
                        onFocus={e => canEdit && e.target.select()}
                        onKeyDown={e => canEdit && handleInputKeyDown(e, rIdx, colId)}
                        onChange={e => canEdit && handleGradeChange(student.uid, student.name, bKey, field, e.target.value)}
                        placeholder="-"
                        style={{
                          width: '36px',
                          height: '24px',
                          textAlign: 'center',
                          padding: '0.1rem',
                          borderRadius: '4px',
                          background: val !== '' && val !== null ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.2)',
                          border: val !== '' && val !== null ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(255,255,255,0.06)',
                          color: val !== '' ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontSize: '0.8rem',
                          fontFamily: 'inherit',
                          fontWeight: val !== '' ? 'bold' : 'normal',
                          outline: 'none',
                          cursor: canEdit ? 'text' : 'default',
                          transition: 'border-color 0.15s, background 0.15s'
                        }}
                      />
                    </td>
                  );
                };

                return (
                  <tr 
                    key={student.uid}
                    style={{ 
                      background: rIdx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = rIdx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent'; }}
                  >
                    {/* Fixed Index */}
                    <td style={{ padding: '0.3rem 0.25rem', textAlign: 'center', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.08)', position: 'sticky', left: 0, background: '#11151f', zIndex: 5, fontSize: '0.78rem' }}>
                      {rIdx + 1}
                    </td>

                    {/* Fixed Student Name & Rank Badge */}
                    <td style={{ padding: '0.3rem 0.6rem', borderBottom: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.08)', position: 'sticky', left: '36px', background: '#11151f', zIndex: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <StudentRankBadge rankDef={rankDef} />
                        <span
                          onClick={() => setExpandedNameUid(expandedNameUid === student.uid ? null : student.uid)}
                          style={{ whiteSpace: expandedNameUid === student.uid ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: expandedNameUid === student.uid ? 220 : (isNarrow ? 92 : 160), fontSize: '0.82rem', fontWeight: '500', cursor: 'pointer' }}
                          title={student.name}
                        >
                          {student.name}
                        </span>
                      </div>
                    </td>

                    {/* 1º Bimestre */}
                    {(activeBimestre === 'all' || activeBimestre === 'b1') && visibleB1.map((col, idx) => {
                      if (col.field === 'total') {
                        return (
                          <td 
                            key={col.id} 
                            style={{ 
                              padding: '0.2rem 0.25rem', 
                              textAlign: 'center', 
                              fontWeight: 'bold', 
                              color: '#60a5fa', 
                              background: 'rgba(59, 130, 246, 0.05)', 
                              borderBottom: '1px solid rgba(255,255,255,0.05)', 
                              borderRight: idx === visibleB1.length - 1 ? '1px solid rgba(59, 130, 246, 0.25)' : undefined, 
                              fontSize: '0.78rem' 
                            }}
                          >
                            {b1Xp > 0 ? b1Xp.toLocaleString('pt-BR') : '-'}
                          </td>
                        );
                      }
                      return renderGradeInput('b1', col.field, col.id);
                    })}

                    {/* 2º Bimestre */}
                    {(activeBimestre === 'all' || activeBimestre === 'b2') && visibleB2.map((col, idx) => {
                      if (col.field === 'total') {
                        return (
                          <td 
                            key={col.id} 
                            style={{ 
                              padding: '0.2rem 0.25rem', 
                              textAlign: 'center', 
                              fontWeight: 'bold', 
                              color: '#34d399', 
                              background: 'rgba(16, 185, 129, 0.05)', 
                              borderBottom: '1px solid rgba(255,255,255,0.05)', 
                              borderRight: idx === visibleB2.length - 1 ? '1px solid rgba(16, 185, 129, 0.25)' : undefined, 
                              fontSize: '0.78rem' 
                            }}
                          >
                            {b2Xp > 0 ? b2Xp.toLocaleString('pt-BR') : '-'}
                          </td>
                        );
                      }
                      return renderGradeInput('b2', col.field, col.id);
                    })}

                    {/* 3º Bimestre */}
                    {(activeBimestre === 'all' || activeBimestre === 'b3') && visibleB3.map((col, idx) => {
                      if (col.field === 'total') {
                        return (
                          <td 
                            key={col.id} 
                            style={{ 
                              padding: '0.2rem 0.25rem', 
                              textAlign: 'center', 
                              fontWeight: 'bold', 
                              color: '#f59e0b', 
                              background: 'rgba(245, 158, 11, 0.05)', 
                              borderBottom: '1px solid rgba(255,255,255,0.05)', 
                              borderRight: idx === visibleB3.length - 1 ? '1px solid rgba(245, 158, 11, 0.25)' : undefined, 
                              fontSize: '0.78rem' 
                            }}
                          >
                            {b3Xp > 0 ? b3Xp.toLocaleString('pt-BR') : '-'}
                          </td>
                        );
                      }
                      return renderGradeInput('b3', col.field, col.id);
                    })}

                    {/* 4º Bimestre */}
                    {(activeBimestre === 'all' || activeBimestre === 'b4') && visibleB4.map((col, idx) => {
                      if (col.field === 'total') {
                        return (
                          <td 
                            key={col.id} 
                            style={{ 
                              padding: '0.2rem 0.25rem', 
                              textAlign: 'center', 
                              fontWeight: 'bold', 
                              color: '#a855f7', 
                              background: 'rgba(168, 85, 247, 0.05)', 
                              borderBottom: '1px solid rgba(255,255,255,0.05)', 
                              borderRight: idx === visibleB4.length - 1 ? '1px solid rgba(168, 85, 247, 0.25)' : undefined, 
                              fontSize: '0.78rem' 
                            }}
                          >
                            {b4Xp > 0 ? b4Xp.toLocaleString('pt-BR') : '-'}
                          </td>
                        );
                      }
                      return renderGradeInput('b4', col.field, col.id);
                    })}

                    {/* Subtotal Bimestres */}
                    {isColVisible('bimestres_sum') && (
                      <td style={{ padding: '0.3rem 0.35rem', textAlign: 'center', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.78rem' }}>
                        {bimSum.toLocaleString('pt-BR')}
                      </td>
                    )}

                    {/* XP Base / Anterior */}
                    {isColVisible('base_xp') && (
                      <td style={{ padding: '0.2rem 0.25rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <input
                          type="text"
                          data-row={rIdx}
                          data-col="base_xp"
                          value={rec.baseXp === null || rec.baseXp === undefined ? '' : String(rec.baseXp)}
                          readOnly={!canEdit}
                          onFocus={e => canEdit && e.target.select()}
                          onKeyDown={e => canEdit && handleInputKeyDown(e, rIdx, 'base_xp')}
                          onChange={e => canEdit && handleBaseXpChange(student.uid, student.name, e.target.value)}
                          placeholder="0"
                          style={{
                            width: '56px',
                            height: '24px',
                            textAlign: 'center',
                            padding: '0.1rem',
                            borderRadius: '4px',
                            background: 'rgba(56, 189, 248, 0.08)',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            color: '#38bdf8',
                            fontSize: '0.8rem',
                            fontFamily: 'inherit',
                            fontWeight: 'bold',
                            outline: 'none',
                            cursor: canEdit ? 'text' : 'default'
                          }}
                          title="XP Base histórico do aluno para preservar pontuação"
                        />
                      </td>
                    )}

                    {/* XP Total Calculado */}
                    {isColVisible('total_xp') && (
                      <td style={{ padding: '0.3rem 0.35rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--gold-primary)', background: 'rgba(251, 191, 36, 0.06)', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem' }}>
                        {totalXp.toLocaleString('pt-BR')}
                      </td>
                    )}

                    {/* Patente Resultante */}
                    {isColVisible('rank') && (
                      <td style={{ padding: '0.3rem 0.35rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <span 
                          style={{ 
                            padding: '0.15rem 0.45rem', 
                            borderRadius: '10px', 
                            fontSize: '0.74rem', 
                            fontWeight: 'bold', 
                            color: rankDef?.color || '#fff', 
                            background: `${rankDef?.color || '#3b82f6'}20`, 
                            border: `1px solid ${rankDef?.color || '#3b82f6'}50`, 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '0.25rem',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <Medal size={11} />
                          {rankDef?.name || 'Sem Patente'}
                        </span>
                      </td>
                    )}

                    {/* XP Atual no Sistema (Referência) */}
                    {isColVisible('system_xp') && (
                      <td style={{ padding: '0.3rem 0.35rem', textAlign: 'center', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.78rem' }}>
                        {systemXp.toLocaleString('pt-BR')}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Barra Inferior Fixa/Congelada com Atalhos e Salvar */}
      <div 
        style={{ 
          flexShrink: 0, 
          padding: '0.45rem 0.85rem', 
          background: 'rgba(17, 21, 31, 0.95)', 
          borderRadius: '8px', 
          border: '1px solid var(--border-glass)',
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap',
          gap: '0.5rem', 
          fontSize: '0.78rem', 
          color: 'var(--text-secondary)',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.2)'
        }}
      >
        <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span>⌨️ <strong>Enter</strong>: Próximo aluno na mesma nota</span>
          <span>⌨️ <strong>Tab</strong>: Próxima nota do mesmo aluno</span>
          <span>⌨️ <strong>Setas Cima/Baixo</strong>: Navega entre alunos</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {canEdit ? (
            <button
              onClick={handleManualSave}
              className="login-btn"
              style={{
                padding: '0.35rem 0.9rem',
                fontSize: '0.8rem',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border-glass)',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                cursor: 'pointer'
              }}
            >
              <Save size={14} />
              <span>Salvar Planilha Agora</span>
            </button>
          ) : (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              Modo Somente Leitura
            </span>
          )}
        </div>
      </div>

      {/* Modais Integrados */}
      {gradebook && (
        <GradebookSyncModal
          isOpen={syncModalOpen}
          onClose={() => setSyncModalOpen(false)}
          tenantId={tenantId || ''}
          className={selectedClass}
          students={classStudents}
          gradebook={gradebook}
          userEmail={userData?.email}
          onSyncCompleted={() => {
            if (onRefreshStudents) onRefreshStudents();
            loadCurrentClassGradebook();
          }}
          showAlert={showAlert}
        />
      )}

      <TenantBackupModal
        isOpen={backupModalOpen}
        onClose={() => setBackupModalOpen(false)}
        tenantId={tenantId || ''}
        tenantName={tenant?.name}
        userEmail={userData?.email}
        onRestored={() => {
          if (onRefreshStudents) onRefreshStudents();
          loadCurrentClassGradebook();
        }}
        showAlert={showAlert}
        showConfirm={showConfirm}
      />

      <GradebookColumnModal
        isOpen={columnModalOpen}
        onClose={() => setColumnModalOpen(false)}
        hiddenColumns={hiddenColumns}
        onToggleColumn={toggleColumn}
        onSetMultiple={handleSetMultipleColumns}
        onReset={handleResetColumns}
      />
    </div>
  );
}
