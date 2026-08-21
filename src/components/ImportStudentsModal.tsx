import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useDialog } from '../contexts/DialogContext';
import { Upload, FileSpreadsheet, Loader2, CheckCircle, X } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ImportStudentsModalProps {
  tenantId: string;
  onClose: () => void;
  onComplete: () => void;
}

interface ImportedStudent {
  name: string;
  class_name: string;
  grade?: string;
}

export default function ImportStudentsModal({ tenantId, onClose, onComplete }: ImportStudentsModalProps) {
  const { showAlert } = useDialog();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ImportedStudent[]>([]);
  const [fileName, setFileName] = useState('');

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
    const gradeIdx = h.findIndex(v => 
      v.includes('série') || v.includes('serie') || v.includes('grade') || 
      v.includes('ano') || v.includes('nível')
    );

    if (nameIdx === -1 || classIdx === -1) {
      showAlert('Erro', 'O arquivo deve ter colunas com "Nome" e "Turma" no cabeçalho. Colunas encontradas: ' + headers.join(', '));
      return [];
    }

    const students: ImportedStudent[] = [];
    for (const cols of rows) {
      const name = cols[nameIdx]?.trim();
      const className = cols[classIdx]?.trim();
      if (name && className) {
        students.push({
          name,
          class_name: className,
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

      setPreview(students);
    } catch (err) {
      console.error('Erro ao processar arquivo:', err);
      showAlert('Erro', 'Não foi possível processar o arquivo.');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (preview.length === 0) return;

    setLoading(true);
    try {
      const records = preview.map(student => ({
        tenant_id: tenantId,
        name: student.name,
        class_name: student.class_name,
        grade: student.grade,
        imported_from: 'csv'
      }));

      const { error } = await supabase.from('pre_authorized_students').insert(records);
      if (error) throw error;

      showAlert('Sucesso', `${preview.length} alunos importados com sucesso!`);
      onComplete();
    } catch (err) {
      console.error('Erro ao importar alunos:', err);
      showAlert('Erro', 'Não foi possível importar os alunos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }}>
      <div className="glass-panel" style={{ width: '600px', maxWidth: '90vw', maxHeight: '80vh', padding: '2rem', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out' }}>
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
          style={{ border: '2px dashed var(--border-glass)', borderRadius: '12px', padding: '2rem', textAlign: 'center', cursor: 'pointer', marginBottom: '1rem', transition: 'all 0.2s' }}
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
          <FileSpreadsheet size={48} color="var(--text-secondary)" style={{ marginBottom: '1rem' }} />
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Clique para selecionar um arquivo CSV ou XLSX
          </p>
          <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.7 }}>
            Formato esperado: Nome Completo, Turma
          </p>
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div style={{ flex: 1, overflow: 'auto', marginBottom: '1rem' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--text-primary)', fontSize: '1rem' }}>
              Preview ({preview.length} alunos encontrados)
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {preview.slice(0, 10).map((student, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-primary)' }}>{student.name}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{student.class_name}</span>
                </div>
              ))}
              {preview.length > 10 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>
                  ... e mais {preview.length - 10} alunos
                </p>
              )}
            </div>
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
            disabled={preview.length === 0 || loading}
            style={{ flex: 1, padding: '0.75rem', background: preview.length > 0 ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', color: preview.length > 0 ? 'var(--text-on-gold, #000)' : 'var(--text-secondary)', cursor: preview.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            {loading ? <Loader2 className="spin" size={18} /> : <CheckCircle size={18} />}
            Importar {preview.length > 0 ? `(${preview.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
