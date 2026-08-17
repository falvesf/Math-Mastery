const fs = require('fs');

let content = fs.readFileSync('src/components/TilesetPicker.tsx', 'utf-8');

// Replace imports
content = content.replace("import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';\n", "");
content = content.replace("import { doc, getDoc, setDoc } from 'firebase/firestore';\n", "");
content = content.replace("import { storage, db } from '../lib/firebase';\n", "import { supabase } from '../lib/supabase';\n");

// Replace fetch saved tilesets from firestore to supabase
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

// Replace save items to firestore
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

// Replace upload logic
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
        
content = content.replace(oldUploadStr, newUploadStr);

fs.writeFileSync('src/components/TilesetPicker.tsx', content, 'utf-8');
console.log('Fixed TilesetPicker');
