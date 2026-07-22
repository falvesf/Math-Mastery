import React, { useRef, useState } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { useDialog } from '../contexts/DialogContext';

interface DirectUploadButtonProps {
  onUploadComplete: (url: string) => void;
  folder?: string;
  buttonStyle?: React.CSSProperties;
  accept?: string;
}

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

    if (accept === 'image/*' && !file.type.startsWith('image/')) {
      showAlert('Por favor, selecione apenas arquivos de imagem.');
      return;
    }
    
    if (accept.includes('.glb') && !file.name.toLowerCase().endsWith('.glb') && !file.name.toLowerCase().endsWith('.gltf')) {
      showAlert('Por favor, selecione apenas arquivos de modelo 3D (.glb ou .gltf).');
      return;
    }

    setUploading(true);
    setProgress(0);

    const fileRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(fileRef, file);

    uploadTask.on('state_changed', 
      (snapshot) => {
        const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setProgress(p);
      },
      (err) => {
        console.error(err);
        showAlert('Erro ao fazer upload da imagem.');
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          onUploadComplete(downloadUrl);
        } catch (err) {
          console.error('Erro ao pegar URL:', err);
        } finally {
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      }
    );
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
