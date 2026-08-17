const fs = require('fs');

function applyFix(filePath, fixFn) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf-8');
    // Normalize to \n
    content = content.replace(/\r\n/g, '\n');
    const oldContent = content;
    content = fixFn(content);
    if (content !== oldContent) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log('Fixed', filePath);
    } else {
        console.log('No changes made to', filePath);
    }
}

// 1. DirectUploadButton.tsx
applyFix('src/components/DirectUploadButton.tsx', (content) => {
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

    return content.replace(oldUploadStr, newUploadStr);
});

// 2. TilesetPicker.tsx
applyFix('src/components/TilesetPicker.tsx', (content) => {
    content = content.replace("import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';\n", "");
    content = content.replace("import { doc, getDoc, setDoc } from 'firebase/firestore';\n", "");
    content = content.replace("import { storage, db } from '../lib/firebase';\n", "import { supabase } from '../lib/supabase';\n");

    const oldFetchStr = `      const docRef = doc(db, 'settings', 'tilesets');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().items) {
        setSavedTilesets(docSnap.data().items);
      }`;
    const newFetchStr = `      const { data } = await supabase.from('system_collections').select('data').eq('type', 'tilesets').single();
      if (data && data.data && data.data.items) {
        setSavedTilesets(data.data.items);
      }`;
    content = content.replace(oldFetchStr, newFetchStr);

    const oldSaveStr = `    try {
      await setDoc(doc(db, 'settings', 'tilesets'), { items: newItems }, { merge: true });
    } catch(err) {
      console.error("Erro ao salvar lista de tilesets:", err);
    }`;
    const newSaveStr = `    try {
      await supabase.from('system_collections').upsert({ type: 'tilesets', data: { items: newItems } });
    } catch(err) {
      console.error("Erro ao salvar lista de tilesets:", err);
    }`;
    content = content.replace(oldSaveStr, newSaveStr);

    const oldUploadStr = `      const fileRef = ref(storage, \`tilesets/\${Date.now()}_\${file.name}\`);
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
          const newItem = { url: downloadUrl, refPath: uploadTask.snapshot.ref.fullPath, name: uploadTask.snapshot.ref.name };
          const updatedList = [newItem, ...savedTilesets];
          setSavedTilesets(updatedList);
          await saveTilesetsToDB(updatedList);
          setUploading(false);
          onSelectTileset(downloadUrl);
        }
      );`;

    const newUploadStr = `      const filePath = \`tilesets/\${Date.now()}_\${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}\`;
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
             const newItem = { url: downloadUrl, refPath: filePath, name: file.name };
             const updatedList = [newItem, ...savedTilesets];
             setSavedTilesets(updatedList);
             await saveTilesetsToDB(updatedList);
             onSelectTileset(downloadUrl);
          }
        })
        .catch(err => {
          clearInterval(progressInterval);
          console.error(err);
        })
        .finally(() => {
          setUploading(false);
        });`;
    return content.replace(oldUploadStr, newUploadStr);
});

// 3. ImageGalleryModal.tsx
applyFix('src/components/ImageGalleryModal.tsx', (content) => {
    content = content.replace("import { ref, uploadBytesResumable, getDownloadURL, listAll, deleteObject } from 'firebase/storage';\n", "");
    content = content.replace("import { storage, db } from '../lib/firebase';\n", "import { supabase } from '../lib/supabase';\n");
    content = content.replace("import { doc, getDoc, setDoc } from 'firebase/firestore';\n", "");

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

    return content.replace(oldPixabayUploadStr, newPixabayUploadStr);
});

// 4. LandingPage.tsx
applyFix('src/pages/LandingPage.tsx', (content) => {
    content = content.replace("import { signInWithPopup, signOut } from 'firebase/auth';\n", "");
    content = content.replace("import { auth, googleProvider } from '../lib/firebase';\n", "import { supabase } from '../lib/supabase';\n");

    const oldLoginStr = `  const handleLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await signInWithPopup(auth, googleProvider);
      
      // O restante do processo (criação de doc, etc) é feito via onAuthStateChanged no App.tsx
      // O redirect ou fechamento também é automático pelo estado de 'user'.
      
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('O login foi cancelado. Tente novamente.');
      } else {
        setError('Houve um problema ao entrar com o Google. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };`;

    const newLoginStr = `  const handleLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      
      if (error) throw error;
      
    } catch (err: any) {
      console.error(err);
      setError('Houve um problema ao entrar com o Google. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };`;
    return content.replace(oldLoginStr, newLoginStr);
});

// 5. OnboardingModal.tsx
applyFix('src/components/OnboardingModal.tsx', (content) => {
    content = content.replace("import { collection, getDocs } from 'firebase/firestore';\n", "");
    content = content.replace("import { db } from '../lib/firebase';\n", "import { supabase } from '../lib/supabase';\n");

    const oldFetchStr = `      const querySnapshot = await getDocs(collection(db, 'users'));
      let rankCount = 1;
      querySnapshot.forEach((doc) => {
        if (doc.data().role === 'admin' || doc.data().role === 'coordinator') {
          rankCount++;
        }
      });`;

    const newFetchStr = `      const { count } = await supabase.from('users').select('*', { count: 'exact', head: true }).in('role', ['admin', 'coordinator']);
      let rankCount = 1 + (count || 0);`;

    return content.replace(oldFetchStr, newFetchStr);
});

// 6. PublicProfileModal.tsx
applyFix('src/components/PublicProfileModal.tsx', (content) => {
    content = content.replace("import { db } from '../lib/firebase';\n", "import { supabase } from '../lib/supabase';\n");
    content = content.replace("import { collection, query, where, getDocs } from 'firebase/firestore';\n", "");

    const oldProfFetchStr = `        const q = query(collection(db, 'users'), where('uid', '==', uid));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          setProfileData(snapshot.docs[0].data());
        } else {
          setProfileData(null);
        }`;
    const newProfFetchStr = `        const { data } = await supabase.from('users').select('*').eq('id', uid).single();
        if (data) {
          setProfileData(data);
        } else {
          setProfileData(null);
        }`;

    return content.replace(oldProfFetchStr, newProfFetchStr);
});

// 7. AdminDashboard.tsx - check if there's any stray getDoc
applyFix('src/pages/AdminDashboard.tsx', (content) => {
    return content;
});

