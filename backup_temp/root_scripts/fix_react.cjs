const fs = require('fs');

const fixFile = (fp, replacePairs) => {
    if (!fs.existsSync(fp)) return;
    let content = fs.readFileSync(fp, 'utf-8');
    let original = content;
    for (let [search, replacement] of replacePairs) {
        content = content.replace(search, replacement);
    }
    if (content !== original) {
        fs.writeFileSync(fp, content);
        console.log(`Fixed ${fp}`);
    }
};

// OnboardingModal.tsx
fixFile('src/components/OnboardingModal.tsx', [
    [/import \{[^}]+\} from 'firebase\/firestore';\n/g, ''],
    [/import \{ db \} from '\.\.\/lib\/firebase';/g, ''],
    [/const snap = await getDocs\(collection\(db, 'classes'\)\);\n\s*const loaded: ClassDef\[\] = \[\];\n\s*snap\.forEach\(d => loaded\.push\(\{ id: d\.id, \.\.\.d\.data\(\) \} as ClassDef\)\);/g, 
     "const { data: snap, error } = await supabase.from('classes').select('*');\n        if (error) throw error;\n        const loaded: ClassDef[] = snap || [];"]
]);

// TilesetPicker.tsx
fixFile('src/components/TilesetPicker.tsx', [
    [/import \{[^}]+\} from 'firebase\/firestore';\n/g, ''],
    [/import \{[^}]+\} from 'firebase\/storage';\n/g, ''],
    [/import \{ db, storage \} from '\.\.\/lib\/firebase';\n/g, ''],
    [/const docSnap = await getDoc\(doc\(db, 'tileset_configs', docId\)\);\n\s*if \(docSnap\.exists\(\)\) \{\n\s*const data = docSnap\.data\(\);/g, 
     "const { data: docData } = await supabase.from('tileset_configs').select('*').eq('id', docId).single();\n        if (docData) {\n          const data = docData;"],
    [/await setDoc\(doc\(db, 'tileset_configs', docId\), \{\n\s*gridSize: gridSizeInput,\n\s*offsetX: offsetXInput,\n\s*offsetY: offsetYInput,\n\s*gapX: gapXInput,\n\s*gapY: gapYInput,\n\s*gridColor: gridColor,\n\s*updatedAt: new Date\(\)\.toISOString\(\)\n\s*\}, \{ merge: true \}\);/g,
     "await supabase.from('tileset_configs').upsert({\n              id: docId,\n              gridSize: parseInt(gridSizeInput) || 32,\n              offsetX: parseInt(offsetXInput) || 0,\n              offsetY: parseInt(offsetYInput) || 0,\n              gapX: parseInt(gapXInput) || 0,\n              gapY: parseInt(gapYInput) || 0,\n              gridColor: gridColor\n            });"],
    [/const fileRef = ref\(storage, `items\/tile_\$\{Date\.now\(\)\}\.png`\);\n\s*const uploadTask = uploadBytesResumable\(fileRef, blob, \{ contentType: 'image\/png' \}\);\n\n\s*uploadTask\.on\('state_changed', \n\s*null,\n\s*\(err\) => \{\n\s*console\.error\(err\);\n\s*showAlert\('Erro ao fazer upload do ícone\.'\);\n\s*setUploading\(false\);\n\s*\},\n\s*async \(\) => \{\n\s*\/\/ Salvar a configuração final utilizada no Banco de Dados para persistência em nuvem\n\s*try \{\n\s*const docId = tilesetRefPath\.replace\(\/\\\\\/\\\/g, '_'\);\n\s*await setDoc\(doc\(db, 'tileset_configs', docId\), \{\n\s*gridSize: gridSizeInput,\n\s*offsetX: offsetXInput,\n\s*offsetY: offsetYInput,\n\s*gapX: gapXInput,\n\s*gapY: gapYInput,\n\s*gridColor: gridColor,\n\s*updatedAt: new Date\(\)\.toISOString\(\)\n\s*\}, \{ merge: true \}\);\n\s*\} catch \(dbErr\) \{\n\s*console\.error\("Erro ao salvar config no BD:", dbErr\);\n\s*\}\n\n\s*const downloadUrl = await getDownloadURL\(uploadTask\.snapshot\.ref\);\n\s*onTileSelected\(downloadUrl\);\n\s*\}\n\s*\);/g,
     `const fileName = \`items/tile_\${Date.now()}.png\`;
      const { error: uploadError } = await supabase.storage.from('uploads').upload(fileName, blob, {
          contentType: 'image/png',
          upsert: false
      });

      if (uploadError) {
          console.error(uploadError);
          showAlert('Erro ao fazer upload do ícone.');
          setUploading(false);
          return;
      }

      try {
        const docId = tilesetRefPath.replace(/\\//g, '_');
        await supabase.from('tileset_configs').upsert({
            id: docId,
            gridSize: parseInt(gridSizeInput) || 32,
            offsetX: parseInt(offsetXInput) || 0,
            offsetY: parseInt(offsetYInput) || 0,
            gapX: parseInt(gapXInput) || 0,
            gapY: parseInt(gapYInput) || 0,
            gridColor: gridColor,
            name: 'Tileset'
        });
      } catch (dbErr) {
        console.error("Erro ao salvar config no BD:", dbErr);
      }

      const { data: publicData } = supabase.storage.from('uploads').getPublicUrl(fileName);
      onTileSelected(publicData.publicUrl);`]
]);

// PublicProfileModal.tsx
fixFile('src/components/PublicProfileModal.tsx', [
    [/import \{[^}]+\} from 'firebase\/firestore';\n/g, ''],
    [/import \{ db \} from '\.\.\/lib\/firebase';/g, ''],
    [/const q = query\(collection\(db, 'quest_attempts'\), where\('studentId', '==', user\.uid\)\);\n\s*const snap = await getDocs\(q\);\n\s*const loaded: any\[\] = \[\];\n\s*snap\.forEach\(d => loaded\.push\(\{ id: d\.id, \.\.\.d\.data\(\) \}\)\);/g,
     "const { data: snap } = await supabase.from('quest_attempts').select('*').eq('student_id', user.uid);\n        const loaded: any[] = snap || [];"]
]);
