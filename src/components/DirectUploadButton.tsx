import React, { useRef, useState } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useDialog } from '../contexts/DialogContext';

interface DirectUploadButtonProps {
  onUploadComplete: (url: string) => void;
  folder?: string;
  buttonStyle?: React.CSSProperties;
  accept?: string;
}

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_GLB_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB (modelos 3D)

export default function DirectUploadButton({ onUploadComplete, folder = 'uploads', buttonStyle, accept = 'image/*' }: DirectUploadButtonProps) {
  const { showAlert } = useDialog();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isGlb = file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf');
    const isImage = file.type.startsWith('image/');

    // Modo misto (aceita .glb/.gltf + imagem)
    if (accept.includes('.glb')) {
      if (!isGlb && !isImage) {
        showAlert('Selecione um modelo 3D (.glb/.gltf) ou uma imagem.');
        return;
      }
    } else if (accept === 'image/*') {
      if (!isImage) {
        showAlert('Por favor, selecione apenas arquivos de imagem.');
        return;
      }
    }

    // Limites de tamanho
    if (isImage && file.size > MAX_IMAGE_SIZE_BYTES) {
      showAlert(`Não é possível subir imagens maiores que 2 MB. Este arquivo tem ${(file.size / (1024 * 1024)).toFixed(1)} MB.`);
      return;
    }
    if (isGlb && file.size > MAX_GLB_SIZE_BYTES) {
      showAlert(`Não é possível subir modelos 3D maiores que 5 MB. Este arquivo tem ${(file.size / (1024 * 1024)).toFixed(1)} MB.`);
      return;
    }

    setUploading(true);
    setProgress(0);

    const filePath = `${folder}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    
    // Simulate progress for UI since Supabase upload is a single promise
    const progressInterval = setInterval(() => {
       setProgress(p => Math.min(p + 10, 90));
    }, 200);

    supabase.storage.from('uploads').upload(filePath, file, { cacheControl: '3600', upsert: false })
      .then(({ data, error }) => {
         clearInterval(progressInterval);
         setProgress(100);
         if (error) {
            console.error(error);
            showAlert('Erro ao fazer upload da imagem.');
         } else if (data) {
            const { data: publicData } = supabase.storage.from('uploads').getPublicUrl(filePath);
            onUploadComplete(publicData.publicUrl);
         }
      })
      .catch(err => {
         clearInterval(progressInterval);
         console.error('Erro de upload:', err);
         showAlert('Erro ao fazer upload da imagem.');
      })
      .finally(() => {
         setUploading(false);
         if (fileInputRef.current) fileInputRef.current.value = '';
      });
  };

  return (
    <div style={{ display: 'inline-block', height: '100%' }}>
      <input
        type="file"
        accept={accept}
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button
        onClick={handleClick}
        disabled={uploading}
        title="Fazer Upload do Seu Computador"
        style={{
          background: 'var(--accent-blue)',
          color: 'white',
          border: 'none',
          padding: '0 1rem',
          borderRadius: '8px',
          cursor: uploading ? 'not-allowed' : 'pointer',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          height: '100%',
          opacity: uploading ? 0.7 : 1,
          ...buttonStyle
        }}
      >
        {uploading ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            <span style={{ fontSize: '0.8rem' }}>{Math.round(progress)}%</span>
          </>
        ) : (
          <UploadCloud size={20} />
        )}
      </button>
    </div>
  );
}
