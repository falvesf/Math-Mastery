import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useDialog } from '../contexts/DialogContext';
import { Upload, FileSpreadsheet, Loader2, CheckCircle, X } from 'lucide-react';

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

  const parseCSV = (text: string): ImportedStudent[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const nameIdx = header.findIndex(h => h.includes('nome') || h.includes('name'));
    const classIdx = header.findIndex(h => h.includes('turma') || h.includes('class'));
    const gradeIdx = header.findIndex(h => h.includes('série') || h.includes('serie') || h.includes('grade'));

    if (nameIdx === -1 || classIdx === -1) {
      showAlert('Erro', 'O arquivo deve ter colunas "Nome" e "Turma".');
      return [];
    }

    const students: ImportedStudent[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols[nameIdx] && cols[classIdx]) {
        students.push({
          name: cols[nameIdx],
          class_name: cols[classIdx],
          grade: gradeIdx >= 0 ? cols[gradeIdx] : undefined
        });
      }
    }
    return students;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);

    try {
      const text = await file.text();
      let students: ImportedStudent[] = [];

      if (file.name.endsWith('.csv')) {
        students = parseCSV(text);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        // For XLSX, we'll need a library like xlsx
        // For now, show a message to use CSV
        showAlert('Aviso', 'Por favor, converta o arquivo para CSV antes de importar. Suporte para XLSX será adicionado em breve.');
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
