import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useDialog } from '../contexts/DialogContext';
import { Upload, FileSpreadsheet, Loader2, CheckCircle, X, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ImportStudentsModalProps {
  tenantId: string;
  onClose: () => void;
  onComplete: () => void;
}

interface ImportedStudent {
  name: string;
  class_name: string;
  class_code?: string;
  grade?: string;
  matched?: boolean;
  matchedClassName?: string;
}

interface ClassInfo {
  id: string;
  name: string;
  code?: string;
}

export default function ImportStudentsModal({ tenantId, onClose, onComplete }: ImportStudentsModalProps) {
  const { showAlert } = useDialog();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [allStudents, setAllStudents] = useState<ImportedStudent[]>([]);
  const [validStudents, setValidStudents] = useState<ImportedStudent[]>([]);
  const [invalidStudents, setInvalidStudents] = useState<ImportedStudent[]>([]);
  const [fileName, setFileName] = useState('');
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [importMode, setImportMode] = useState<'matched' | 'all'>('matched');

  useEffect(() => {
    fetchClasses();
  }, [tenantId]);

  const fetchClasses = async () => {
    try {
      // Primeiro tenta com a coluna 'code'. Se não existir, faz fallback sem ela.
      let classesData: ClassInfo[] | null = null;
      try {
        let query = supabase.from('classes').select('id, name, code');
        if (tenantId) {
          query = query.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
        } else {
          query = query.or('is_global.eq.true,tenant_id.is.null');
        }
        const { data, error } = await query;
        if (!error && data) classesData = data as ClassInfo[];
      } catch (e) {
        console.error('Falha ao buscar com coluna code, tentando sem ela:', e);
      }

      if (!classesData) {
        let query = supabase.from('classes').select('id, name');
        if (tenantId) {
          query = query.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
        } else {
          query = query.or('is_global.eq.true,tenant_id.is.null');
        }
        const { data, error } = await query;
        if (error) {
          console.error('Erro ao buscar turmas:', error);
          setClasses([]);
          return;
        }
        classesData = (data || []).map((c: any) => ({ id: c.id, name: c.name }));
      }

      setClasses(classesData);
      console.log('Turmas carregadas para importação:', classesData);
    } catch (err) {
      console.error('Erro ao buscar turmas:', err);
      setClasses([]);
    }
  };

  const matchStudents = (students: ImportedStudent[]): { valid: ImportedStudent[]; invalid: ImportedStudent[] } => {
    const valid: ImportedStudent[] = [];
    const invalid: ImportedStudent[] = [];

    for (const student of students) {
      const codeMatch = student.class_code
        ? classes.find(c => c.code && c.code.trim().toUpperCase() === student.class_code!.trim().toUpperCase())
        : undefined;
      const nameMatch = classes.find(c => c.name.trim().toUpperCase() === student.class_name.trim().toUpperCase());

      const matched = codeMatch || nameMatch;
      if (matched) {
        valid.push({ ...student, matched: true, matchedClassName: matched.name });
      } else {
        invalid.push({ ...student, matched: false });
      }
    }

    return { valid, invalid };
  };

  const parseRows = (headers: string[], rows: string[][]): ImportedStudent[] => {
    const h = headers.map(v => v.toLowerCase().trim());
    
    const nameIdx = h.findIndex(v => 
      v.includes('nome completo') || v.includes('nome do aluno') || 
      v.includes('nome') || v.includes('name') || v.includes('aluno')
    );
    const classIdx = h.findIndex(v => 
      v.includes('turma') || v.includes('class') || v.includes('sala') || 
      v.includes('classe') || v.includes('turma/série')
    );
    const codeIdx = h.findIndex(v => 
      v.includes('código da turma') || v.includes('codigo da turma') || 
      v.includes('código turma') || v.includes('codigo turma') ||
      v.includes('cod turma') || v.includes('cod. turma')
    );
    const gradeIdx = h.findIndex(v => 
      v.includes('série') || v.includes('serie') || v.includes('grade') || 
      v.includes('ano') || v.includes('nível')
    );

    if (nameIdx === -1 || (classIdx === -1 && codeIdx === -1)) {
      showAlert('Erro', 'O arquivo deve ter colunas com "Nome" e pelo menos "Turma" ou "Código da turma". Colunas encontradas: ' + headers.join(', '));
      return [];
    }

    const students: ImportedStudent[] = [];
    for (const cols of rows) {
      const name = cols[nameIdx]?.trim();
      const className = classIdx >= 0 ? cols[classIdx]?.trim() : '';
      const classCode = codeIdx >= 0 ? cols[codeIdx]?.trim() : '';
      if (name && (className || classCode)) {
        students.push({
          name,
          class_name: className || classCode,
          class_code: classCode || undefined,
          grade: gradeIdx >= 0 ? cols[gradeIdx]?.trim() : undefined
        });
      }
    }
    return students;
  };

  const parseCSV = (text: string): ImportedStudent[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => line.split(',').map(c => c.trim()));
    return parseRows(headers, rows);
  };

  const parseXLSX = (buffer: ArrayBuffer): ImportedStudent[] => {
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    if (data.length < 2) return [];
    const headers = data[0].map(h => String(h || '').trim());
    const rows = data.slice(1).map(row => row.map(cell => String(cell || '').trim()));
    return parseRows(headers, rows);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);

    try {
      let students: ImportedStudent[] = [];

      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        students = parseCSV(text);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        students = parseXLSX(buffer);
      } else {
        showAlert('Erro', 'Formato não suportado. Use CSV ou XLSX.');
        setLoading(false);
        return;
      }

      const { valid, invalid } = matchStudents(students);
      setAllStudents(students);
      setValidStudents(valid);
      setInvalidStudents(invalid);
      console.log('Alunos parseados (amostra):', students.slice(0, 5));
      console.log('Turmas no sistema (amostra):', classes.slice(0, 10));
      console.log('Valid/Invalid:', valid.length, invalid.length);
    } catch (err) {
      console.error('Erro ao processar arquivo:', err);
      showAlert('Erro', 'Não foi possível processar o arquivo.');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    const toImport = importMode === 'matched' ? validStudents : allStudents;
    if (toImport.length === 0) return;

    setLoading(true);
    try {
      const records = toImport.map(student => ({
        tenant_id: tenantId,
        name: student.name,
        class_name: student.matchedClassName || student.class_name,
        imported_from: 'csv'
      }));

      const { error } = await supabase
        .from('pre_authorized_students')
        .upsert(records, { onConflict: 'tenant_id,name' });
      if (error) throw error;

      showAlert('Sucesso', `${toImport.length} alunos importados com sucesso! (duplicados atualizados)`);
      onComplete();
    } catch (err: any) {
      console.error('Erro ao importar alunos:', err);
      showAlert('Erro', 'Não foi possível importar os alunos. ' + (err?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const hasData = allStudents.length > 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }}>
      <div className="glass-panel" style={{ width: '650px', maxWidth: '90vw', maxHeight: '85vh', padding: '2rem', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
            Importar Alunos
          </h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Upload Area */}
        <div
          style={{ border: '2px dashed var(--border-glass)', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', cursor: 'pointer', marginBottom: '1rem', transition: 'all 0.2s' }}
          onClick={() => fileInputRef.current?.click()}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold-primary)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-glass)'}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <FileSpreadsheet size={36} color="var(--text-secondary)" style={{ marginBottom: '0.5rem' }} />
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Clique para selecionar CSV ou XLSX
          </p>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.75rem', opacity: 0.7 }}>
            Colunas: Nome Completo, Turma (ou Código da turma), Série
          </p>
        </div>

        {/* Preview */}
        {hasData && (
          <div style={{ flex: 1, overflow: 'auto', marginBottom: '1rem' }}>
            {/* Resumo */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '120px', padding: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{validStudents.length}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Encontrados</div>
              </div>
              {invalidStudents.length > 0 && (
                <div style={{ flex: 1, minWidth: '120px', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>{invalidStudents.length}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Não encontrados</div>
                </div>
              )}
            </div>

            {/* Modo de importação */}
            {invalidStudents.length > 0 && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <AlertTriangle size={16} color="#f59e0b" />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                    {invalidStudents.length} alunos com turma não encontrada no sistema
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', color: importMode === 'matched' ? 'var(--gold-primary)' : 'var(--text-secondary)' }}>
                    <input type="radio" name="importMode" checked={importMode === 'matched'} onChange={() => setImportMode('matched')} />
                    Importar apenas turmas encontradas ({validStudents.length})
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', color: importMode === 'all' ? 'var(--gold-primary)' : 'var(--text-secondary)' }}>
                    <input type="radio" name="importMode" checked={importMode === 'all'} onChange={() => setImportMode('all')} />
                    Importar todos ({allStudents.length})
                  </label>
                </div>
              </div>
            )}

            {/* Lista de alunos encontrados */}
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#10b981', fontSize: '0.9rem' }}>
              Alunos encontrados ({validStudents.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: invalidStudents.length > 0 ? '1rem' : 0 }}>
              {validStudents.slice(0, 10).map((student, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                  <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{student.name}</span>
                  <span style={{ color: '#10b981', fontSize: '0.8rem' }}>{student.matchedClassName}</span>
                </div>
              ))}
              {validStudents.length > 10 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', margin: '0.25rem 0' }}>
                  ... e mais {validStudents.length - 10} alunos
                </p>
              )}
            </div>

            {/* Lista de alunos não encontrados */}
            {invalidStudents.length > 0 && (
              <>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#ef4444', fontSize: '0.9rem' }}>
                  Alunos não encontrados ({invalidStudents.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {invalidStudents.slice(0, 10).map((student, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                      <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{student.name}</span>
                      <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>{student.class_code || student.class_name}</span>
                    </div>
                  ))}
                  {invalidStudents.length > 10 && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', margin: '0.25rem 0' }}>
                      ... e mais {invalidStudents.length - 10} alunos
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleImport}
            disabled={!hasData || loading || (importMode === 'matched' && validStudents.length === 0)}
            style={{ flex: 1, padding: '0.75rem', background: hasData && (importMode === 'all' || validStudents.length > 0) ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', color: hasData && (importMode === 'all' || validStudents.length > 0) ? 'var(--text-on-gold, #000)' : 'var(--text-secondary)', cursor: hasData && (importMode === 'all' || validStudents.length > 0) ? 'pointer' : 'not-allowed', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            {loading ? <Loader2 className="spin" size={18} /> : <CheckCircle size={18} />}
            Importar ({importMode === 'matched' ? validStudents.length : allStudents.length})
          </button>
        </div>
      </div>
    </div>
  );
}
