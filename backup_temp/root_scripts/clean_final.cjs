const fs = require('fs');

// AdminDashboard.tsx
let adminContent = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf-8');

adminContent = adminContent.replace(/    const userRef = doc\(db, 'users', selectedStudent\.uid\);\n    await updateDoc\(userRef, \{ xp: newXp, coins: newCoins \}\);\n    await addDoc\(collection\(db, 'xp_logs'\), \{\n      studentId: selectedStudent\.uid,\n      studentName: selectedStudent\.name,\n      evalName: 'Correção \/ Remoção de XP',\n      justification: removeReason,\n      xpGained: -xpToRemove,\n      timestamp: serverTimestamp\(\)\n    \}\);/g,
`    await supabase.from('users').update({ xp: newXp, coins: newCoins }).eq('id', selectedStudent.uid);
    await supabase.from('xp_logs').insert({
      student_id: selectedStudent.uid,
      student_name: selectedStudent.name,
      eval_name: 'Correção / Remoção de XP',
      justification: removeReason,
      xp_gained: -xpToRemove
    });`);

adminContent = adminContent.replace(/    const userRef = doc\(db, 'users', selectedStudent\.uid\);\n    await updateDoc\(userRef, \{ xp: newXp, coins: newCoins \}\);\n    await addDoc\(collection\(db, 'xp_logs'\), \{\n      studentId: selectedStudent\.uid,\n      studentName: selectedStudent\.name,\n      evalId: selectedEval\.id,\n      evalName: selectedEval\.name,\n      grade: numGrade,\n      weight: selectedEval\.weight,\n      xpGained: xpGained,\n      timestamp: serverTimestamp\(\)\n    \}\);/g,
`    await supabase.from('users').update({ xp: newXp, coins: newCoins }).eq('id', selectedStudent.uid);
    await supabase.from('xp_logs').insert({
      student_id: selectedStudent.uid,
      student_name: selectedStudent.name,
      eval_id: selectedEval.id,
      eval_name: selectedEval.name,
      grade: numGrade,
      weight: selectedEval.weight,
      xp_gained: xpGained
    });`);

adminContent = adminContent.replace(/      await deleteDoc\(doc\(db, 'xp_logs', logId\)\);\n      const newXp = Math\.max\(0, \(selectedStudent\.xp \|\| 0\) - xpGained\);\n      const newCoins = Math\.max\(0, \(selectedStudent\.coins \|\| 0\) - xpGained\);\n      const userRef = doc\(db, 'users', selectedStudent\.uid\);\n      await updateDoc\(userRef, \{ xp: newXp, coins: newCoins \}\);/g,
`      await supabase.from('xp_logs').delete().eq('id', logId);
      const newXp = Math.max(0, (selectedStudent.xp || 0) - xpGained);
      const newCoins = Math.max(0, (selectedStudent.coins || 0) - xpGained);
      await supabase.from('users').update({ xp: newXp, coins: newCoins }).eq('id', selectedStudent.uid);`);

adminContent = adminContent.replace(/    await setDoc\(doc\(db, 'settings', 'evaluations'\), \{ types: updated \}\);/g,
`    await supabase.from('system_collections').upsert({ type: 'evaluations', data: { types: updated } });`);

adminContent = adminContent.replace(/    const classRef = doc\(db, 'classes', editingClassId\);\n    await updateDoc\(classRef, \{ name: editClassName, color: editClassColor \}\);/g,
`    await supabase.from('classes').update({ name: editClassName, color: editClassColor }).eq('id', editingClassId);`);

adminContent = adminContent.replace(/    await setDoc\(doc\(db, 'classes', classId\), newClass\);/g,
`    await supabase.from('classes').insert(newClass);`);

adminContent = adminContent.replace(/      const userRef = doc\(db, 'users', editingStudent\.uid\);\n      const updateData: any = \{ name: editName, classId: editClass, role: editRole \};\n      \n      \/\/ Se houve mudan\w+a de senha \(nao e possivel no supabase anon key mas...\)\n      \n      await updateDoc\(userRef, updateData\);/g,
`      const updateData: any = { name: editName, classId: editClass, role: editRole };
      await supabase.from('users').update(updateData).eq('id', editingStudent.uid);`);

adminContent = adminContent.replace(/      const userRef = doc\(db, 'users', editingStudent\.uid\);\n      const updateData: any = \{ name: editName, classId: editClass, role: editRole \};\n      \n      if \(editPassword && editPassword\.length >= 6\) \{\n         \/\/ Ignorar a senha aq\n      \}\n      \n      await updateDoc\(userRef, updateData\);/g,
`      const updateData: any = { name: editName, classId: editClass, role: editRole };
      await supabase.from('users').update(updateData).eq('id', editingStudent.uid);`);

// Replace the handleSaveStudent fully if regex didn't match
adminContent = adminContent.replace(/      const userRef = doc\(db, 'users', editingStudent\.uid\);\n      const updateData: any = \{ name: editName, classId: editClass, role: editRole \};\n      \n      if \(editPassword && editPassword\.length >= 6\) \{\n        updateData\.password = editPassword;\n      \}\n      \n      await updateDoc\(userRef, updateData\);/g,
`      const updateData: any = { name: editName, classId: editClass, role: editRole };
      await supabase.from('users').update(updateData).eq('id', editingStudent.uid);`);

adminContent = adminContent.replace(/      const userRef = doc\(db, 'users', uid\);\n      await updateDoc\(userRef, \{ xp: newXp, coins: newCoins \}\);\n      await addDoc\(collection\(db, 'xp_logs'\), \{\n        studentId: uid,\n        studentName: student\.name,\n        evalName: 'Ação em Massa',\n        justification: bulkXpReason,\n        xpGained: gain,\n        timestamp: serverTimestamp\(\)\n      \}\);/g,
`      await supabase.from('users').update({ xp: newXp, coins: newCoins }).eq('id', uid);
      await supabase.from('xp_logs').insert({
        student_id: uid,
        student_name: student.name,
        eval_name: 'Ação em Massa',
        justification: bulkXpReason,
        xp_gained: gain
      });`);

adminContent = adminContent.replace(/    const attemptsRef = collection\(db, 'quest_attempts'\);\n    const q = query\(attemptsRef, where\('questId', '==', quest\.id\)\);\n    const snap = await getDocs\(q\);/g,
`    const { data: snap } = await supabase.from('quest_attempts').select('*').eq('quest_id', quest.id);`);

adminContent = adminContent.replace(/signOut\(auth\)/g, `supabase.auth.signOut()`);

fs.writeFileSync('src/pages/AdminDashboard.tsx', adminContent, 'utf-8');

// Dashboard.tsx
let dashContent = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');
dashContent = dashContent.replace(/\.catch\(console\.error\)/g, ".then(({error}) => { if(error) console.error(error); })");
dashContent = dashContent.replace(/signOut\(auth\)/g, `supabase.auth.signOut()`);
fs.writeFileSync('src/pages/Dashboard.tsx', dashContent, 'utf-8');

console.log("Cleanup applied.");
