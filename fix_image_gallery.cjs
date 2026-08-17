const fs = require('fs');

let content = fs.readFileSync('src/components/ImageGalleryModal.tsx', 'utf-8');

// Replace imports
content = content.replace("import { ref, uploadBytesResumable, getDownloadURL, listAll, deleteObject } from 'firebase/storage';\n", "");
content = content.replace("import { storage, db } from '../lib/firebase';\n", "import { supabase } from '../lib/supabase';\n");
content = content.replace("import { doc, getDoc, setDoc } from 'firebase/firestore';\n", "");

// Fetch logic
const oldFetchStr = `      const docRef = doc(db, 'settings', 'quest_images');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().items) {
        setSavedTilesets(docSnap.data().items);
      }`;
const newFetchStr = `      const { data } = await supabase.from('system_collections').select('data').eq('type', 'quest_images').single();
      if (data && data.data && data.data.items) {
        setSavedTilesets(data.data.items);
      }`;
content = content.replace(oldFetchStr, newFetchStr);

const oldSaveStr = `    try {
      await setDoc(doc(db, 'settings', 'quest_images'), { items: newItems }, { merge: true });
    } catch(err) {
      console.error("Erro ao salvar lista:", err);
    }`;
const newSaveStr = `    try {
      await supabase.from('system_collections').upsert({ type: 'quest_images', data: { items: newItems } });
    } catch(err) {
      console.error("Erro ao salvar lista:", err);
    }`;
content = content.replace(oldSaveStr, newSaveStr);

// Upload generic logic
const oldUploadStr = `    const fileRef = ref(storage, \`quests/\${Date.now()}_\${file.name}\`);
    const uploadTask = uploadBytesResumable(fileRef, file);

    uploadTask.on('state_changed', 
      (snapshot) => {
        const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setProgress(p);
      },
      (err) => {
        console.error(err);
        setUploading(false);
      },
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        if (activeTab === 'tilesets') {
          // Adiciona o tileset diretamente no estado para driblar o cache do listAll do Firebase
          setSavedTilesets(prev => [
            { url: downloadUrl, refPath: uploadTask.snapshot.ref.fullPath, name: uploadTask.snapshot.ref.name },
            ...prev
          ]);
        } else {
          onSelectImage(downloadUrl);
          onClose();
        }
        setUploading(false);
      }
    );`;

const newUploadStr = `    const filePath = \`quests/\${Date.now()}_\${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}\`;
    const progressInterval = setInterval(() => setProgress(p => Math.min(p + 10, 90)), 200);

    supabase.storage.from('uploads').upload(filePath, file, { cacheControl: '3600', upsert: false })
      .then(async ({ data, error }) => {
        clearInterval(progressInterval);
        setProgress(100);
        if (error) {
           console.error(error);
        } else if (data) {
           const { data: publicData } = supabase.storage.from('uploads').getPublicUrl(filePath);
           const downloadUrl = publicData.publicUrl;
           if (activeTab === 'tilesets') {
             setSavedTilesets(prev => [
               { url: downloadUrl, refPath: filePath, name: file.name },
               ...prev
             ]);
           } else {
             onSelectImage(downloadUrl);
             onClose();
           }
        }
      })
      .catch(err => {
        clearInterval(progressInterval);
        console.error(err);
      })
      .finally(() => {
        setUploading(false);
      });`;
content = content.replace(oldUploadStr, newUploadStr);


const oldPixabayUploadStr = `      // Upload para o Firebase Storage
      const fileRef = ref(storage, \`quests/pixabay_\${Date.now()}.jpg\`);
      
      // Usando uploadBytesResumable para manter a coerência de progresso
      const uploadTask = uploadBytesResumable(fileRef, blob, { contentType: 'image/jpeg' });

      // Trava de segurança: Timeout de 10 segundos para não congelar a tela
      const timeoutId = setTimeout(() => {
        uploadTask.cancel();
        console.error('Upload expirou por tempo (Timeout).');
        showAlert('O Firebase não respondeu a tempo (possível bloqueio CORS ou Storage desativado). Usando o link original.');
        onSelectImage(url);
        setUploading(false);
        onClose();
      }, 10000);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(p);
        },
        (err) => {
          clearTimeout(timeoutId);
          console.error('Upload falhou:', err);
          showAlert('Erro no Firebase (Bloqueio). Usando link original.');
          onSelectImage(url);
          setUploading(false);
          onClose();
        },
        async () => {
          clearTimeout(timeoutId);
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          onSelectImage(downloadUrl);
          setUploading(false);
          onClose();
        }
      );`;
      
const newPixabayUploadStr = `      // Upload para o Supabase Storage
      const filePath = \`quests/pixabay_\${Date.now()}.jpg\`;
      const progressInterval = setInterval(() => setProgress(p => Math.min(p + 10, 90)), 200);

      supabase.storage.from('uploads').upload(filePath, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })
        .then(({ data, error }) => {
          clearInterval(progressInterval);
          setProgress(100);
          if (error) {
            console.error('Upload falhou:', error);
            showAlert('Erro no Storage. Usando link original.');
            onSelectImage(url);
          } else if (data) {
            const { data: publicData } = supabase.storage.from('uploads').getPublicUrl(filePath);
            onSelectImage(publicData.publicUrl);
          }
        })
        .catch(err => {
          clearInterval(progressInterval);
          console.error('Download falhou:', err);
          showAlert('Erro ao processar imagem. Usando link temporário.');
          onSelectImage(url);
        })
        .finally(() => {
          setUploading(false);
          onClose();
        });`;

content = content.replace(oldPixabayUploadStr, newPixabayUploadStr);

fs.writeFileSync('src/components/ImageGalleryModal.tsx', content, 'utf-8');
console.log('Fixed ImageGalleryModal');
