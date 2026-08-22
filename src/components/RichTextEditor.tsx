import { useState, useRef, useCallback, useEffect } from 'react';
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Palette, Calculator } from 'lucide-react';

const MATH_SYMBOLS = [
  { category: 'Operações', symbols: ['+', '−', '×', '÷', '±', '≠', '≈', '≤', '≥'] },
  { category: 'Expoentes', symbols: ['²', '³', '⁴', '¹', '⁰', 'ⁿ'] },
  { category: 'Frações', symbols: ['½', '⅓', '¼', '⅔', '¾', '⅕', '⅖', '⅗', '⅘', '⅙', '⅚', '⅛', '⅜', '⅝', '⅞'] },
  { category: 'Raiz', symbols: ['√', '∛'] },
  { category: 'Gregas', symbols: ['π', 'α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'σ', 'φ', 'ψ', 'ω', 'Δ', 'Σ', 'Ω'] },
  { category: 'Geometria', symbols: ['∠', '⊥', '∥', '△', '□', '○', '◇', '°', '∟', '∝', '≅', '≡'] },
  { category: 'Setas', symbols: ['→', '←', '↑', '↓', '↔', '⇒', '⇔', '↗', '↘', '↙', '↖'] },
  { category: 'Outros', symbols: ['∞', '∂', '∫', '∑', '∏', '∈', '∉', '⊂', '⊃', '∪', '∩', '∧', '∨', '¬', '∀', '∃'] },
];

const COLORS = [
  '#ffffff', '#ff0000', '#ff6600', '#ffcc00', '#33cc33', '#0099ff', '#6633cc', '#ff3399',
  '#000000', '#cc0000', '#cc6600', '#cc9900', '#339933', '#0066cc', '#660099', '#cc0066',
  '#cccccc', '#ff6666', '#ffaa66', '#ffdd66', '#66cc66', '#66bbff', '#9966cc', '#ff66aa',
];

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function RichTextEditor({ value, onChange, placeholder = 'Digite aqui...', autoFocus = false }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showMathPanel, setShowMathPanel] = useState(false);
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const mathPanelRef = useRef<HTMLDivElement>(null);
  const colorPanelRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) {
      editorRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (mathPanelRef.current && !mathPanelRef.current.contains(e.target as Node)) {
        setShowMathPanel(false);
      }
      if (colorPanelRef.current && !colorPanelRef.current.contains(e.target as Node)) {
        setShowColorPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const updateActiveFormats = useCallback(() => {
    const formats = new Set<string>();
    if (document.queryCommandState('bold')) formats.add('bold');
    if (document.queryCommandState('italic')) formats.add('italic');
    if (document.queryCommandState('underline')) formats.add('underline');
    if (document.queryCommandState('justifyLeft')) formats.add('justifyLeft');
    if (document.queryCommandState('justifyCenter')) formats.add('justifyCenter');
    if (document.queryCommandState('justifyRight')) formats.add('justifyRight');
    setActiveFormats(formats);
  }, []);

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    updateActiveFormats();
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange, updateActiveFormats]);

  const insertSymbol = useCallback((symbol: string) => {
    document.execCommand('insertText', false, symbol);
    editorRef.current?.focus();
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); execCommand('bold'); }
      if (e.key === 'i') { e.preventDefault(); execCommand('italic'); }
      if (e.key === 'u') { e.preventDefault(); execCommand('underline'); }
    }
  }, [execCommand]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  const toolbarBtnStyle = (active: boolean = false): React.CSSProperties => ({
    background: active ? 'rgba(245, 158, 11, 0.3)' : 'transparent',
    border: active ? '1px solid var(--gold-primary)' : '1px solid transparent',
    color: active ? 'var(--gold-primary)' : 'var(--text-secondary)',
    cursor: 'pointer',
    padding: '0.35rem',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
    minWidth: '28px',
    height: '28px',
  });

  return (
    <div style={{ border: '1px solid var(--border-glass)', borderRadius: '8px', overflow: 'hidden', background: 'rgba(0,0,0,0.4)' }}>
      {/* Toolbar */}
      <div ref={toolbarRef} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--border-glass)', alignItems: 'center' }}>
        {/* Formatação básica */}
        <button type="button" onClick={() => execCommand('bold')} style={toolbarBtnStyle(activeFormats.has('bold'))} title="Negrito (Ctrl+B)">
          <Bold size={14} />
        </button>
        <button type="button" onClick={() => execCommand('italic')} style={toolbarBtnStyle(activeFormats.has('italic'))} title="Itálico (Ctrl+I)">
          <Italic size={14} />
        </button>
        <button type="button" onClick={() => execCommand('underline')} style={toolbarBtnStyle(activeFormats.has('underline'))} title="Sublinhado (Ctrl+U)">
          <Underline size={14} />
        </button>

        <div style={{ width: '1px', height: '20px', background: 'var(--border-glass)', margin: '0 0.25rem' }} />

        {/* Alinhamento */}
        <button type="button" onClick={() => execCommand('justifyLeft')} style={toolbarBtnStyle(activeFormats.has('justifyLeft'))} title="Alinhar à esquerda">
          <AlignLeft size={14} />
        </button>
        <button type="button" onClick={() => execCommand('justifyCenter')} style={toolbarBtnStyle(activeFormats.has('justifyCenter'))} title="Centralizar">
          <AlignCenter size={14} />
        </button>
        <button type="button" onClick={() => execCommand('justifyRight')} style={toolbarBtnStyle(activeFormats.has('justifyRight'))} title="Alinhar à direita">
          <AlignRight size={14} />
        </button>

        <div style={{ width: '1px', height: '20px', background: 'var(--border-glass)', margin: '0 0.25rem' }} />

        {/* Cor do texto */}
        <div ref={colorPanelRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => { setShowColorPanel(!showColorPanel); setShowMathPanel(false); }} style={toolbarBtnStyle(showColorPanel)} title="Cor do texto">
            <Palette size={14} />
          </button>
          {showColorPanel && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 100,
              background: 'rgba(25, 30, 40, 0.98)', backdropFilter: 'blur(12px)',
              border: '1px solid var(--gold-primary)', borderRadius: '8px',
              padding: '0.75rem', marginTop: '4px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '4px',
              width: '220px',
            }}>
              {COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => { execCommand('foreColor', color); setShowColorPanel(false); }}
                  style={{
                    width: '22px', height: '22px', borderRadius: '3px',
                    background: color, border: '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer', transition: 'transform 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  title={color}
                />
              ))}
            </div>
          )}
        </div>

        <div style={{ width: '1px', height: '20px', background: 'var(--border-glass)', margin: '0 0.25rem' }} />

        {/* Símbolos matemáticos */}
        <div ref={mathPanelRef} style={{ position: 'relative' }}>
          <button 
            type="button" 
            onClick={() => { setShowMathPanel(!showMathPanel); setShowColorPanel(false); }}
            style={toolbarBtnStyle(showMathPanel)} 
            title="Símbolos matemáticos"
          >
            <Calculator size={14} />
          </button>
          {showMathPanel && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 100,
              background: 'rgba(25, 30, 40, 0.98)', backdropFilter: 'blur(12px)',
              border: '1px solid var(--gold-primary)', borderRadius: '8px',
              padding: '0.75rem', marginTop: '4px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              maxHeight: '300px', overflowY: 'auto',
              width: '280px',
            }}>
              {MATH_SYMBOLS.map(group => (
                <div key={group.category} style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--gold-primary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.35rem' }}>
                    {group.category}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                    {group.symbols.map(symbol => (
                      <button
                        key={symbol}
                        type="button"
                        onClick={() => { insertSymbol(symbol); setShowMathPanel(false); }}
                        style={{
                          width: '30px', height: '30px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '4px', cursor: 'pointer',
                          color: 'var(--text-primary)', fontSize: '1rem',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.2)'; e.currentTarget.style.borderColor = 'var(--gold-primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                        title={symbol}
                      >
                        {symbol}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={updateActiveFormats}
        onMouseUp={updateActiveFormats}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        style={{
          minHeight: '120px',
          padding: '1rem',
          color: 'white',
          fontFamily: 'inherit',
          fontSize: '1.1rem',
          lineHeight: '1.6',
          outline: 'none',
          cursor: 'text',
          wordBreak: 'break-word',
        }}
        onFocus={() => {
          if (editorRef.current?.innerHTML === '' || editorRef.current?.innerHTML === '<br>') {
            editorRef.current.innerHTML = '';
          }
        }}
        onBlur={() => {
          if (editorRef.current?.innerHTML === '') {
            editorRef.current.innerHTML = '';
          }
        }}
      />

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: rgba(255, 255, 255, 0.3);
          pointer-events: none;
        }
        [contenteditable] img {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          margin: 0.25rem 0;
        }
      `}</style>
    </div>
  );
}
