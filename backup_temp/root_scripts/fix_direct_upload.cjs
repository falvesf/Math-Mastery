const fs = require('fs');

let content = fs.readFileSync('src/components/DirectUploadButton.tsx', 'utf-8');

// Replace imports
content = content.replace("import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';\n", "");
content = content.replace("import { storage } from '../lib/firebase';\n", "import { supabase } from '../lib/supabase';\n");

const oldUploadStr = `    const fileRef = ref(storage, \`\${folder}/\${Date.now()}_\${file.name}\`);
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
    );`;

const newUploadStr = `    const filePath = \`\${folder}/\${Date.now()}_\${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}\`;
    
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
      });`;

content = content.replace(oldUploadStr, newUploadStr);

fs.writeFileSync('src/components/DirectUploadButton.tsx', content, 'utf-8');
console.log('Fixed DirectUploadButton');
