const fs = require('fs');

let content = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf-8');
content = content.replace(/\r\n/g, '\n');

// 1. Imports
content = content.replace(/import \{ signOut \} from 'firebase\/auth';\n/, "");
content = content.replace(/import \{ auth, db \} from '\.\.\/lib\/firebase';\n/, "import { supabase } from '../lib/supabase';\n");
content = content.replace(/import \{ collection, query, where, getDocs, doc, updateDoc, setDoc, addDoc, serverTimestamp, getDoc, deleteDoc \} from 'firebase\/firestore';\n/, "");

// 2. signOut
content = content.replace(/await signOut\(auth\);/g, "await supabase.auth.signOut();");

// 3. fetchEvaluations
content = content.replace(/    const docRef = doc\(db, 'settings', 'evaluations'\);\n    const snap = await getDoc\(docRef\);\n    if \(snap\.exists\(\)\) \{\n      const fetched = snap\.data\(\)\.types \|\| \[\];\n      setEvaluations\(fetched\);\n      if \(fetched\.length > 0\) setGradeType\(fetched\[0\]\.id\);\n    \} else \{\n      setEvaluations\(DEFAULT_EVALUATIONS\);\n      setGradeType\(DEFAULT_EVALUATIONS\[0\]\.id\);\n      await setDoc\(docRef, \{ types: DEFAULT_EVALUATIONS \}\);\n    \}/,
`    const { data: snap } = await supabase.from('settings').select('*').eq('id', 'evaluations').single();
    if (snap && snap.data) {
      const fetched = snap.data.types || [];
      setEvaluations(fetched);
      if (fetched.length > 0) setGradeType(fetched[0].id);
    } else {
      setEvaluations(DEFAULT_EVALUATIONS);
      setGradeType(DEFAULT_EVALUATIONS[0].id);
      await supabase.from('settings').upsert({ id: 'evaluations', data: { types: DEFAULT_EVALUATIONS } });
    }`);

content = content.replace(/    const apiRef = doc\(db, 'settings', 'api'\);\n    const apiSnap = await getDoc\(apiRef\);\n    if \(apiSnap\.exists\(\)\) \{\n      setPixabayKey\(apiSnap\.data\(\)\.pixabayKey \|\| ''\);\n    \}/,
`    const { data: apiSnap } = await supabase.from('settings').select('*').eq('id', 'api').single();
    if (apiSnap && apiSnap.data) {
      setPixabayKey(apiSnap.data.pixabayKey || '');
    }`);

// 4. fetchClasses
content = content.replace(/    const snap = await getDocs\(collection\(db, 'classes'\)\);\n    const loaded: ClassDef\[\] = \[\];\n    snap\.forEach\(d => loaded\.push\(\{ id: d\.id, \.\.\.d\.data\(\) \} as ClassDef\)\);/,
`    const { data: snap } = await supabase.from('classes').select('*');
    const loaded: ClassDef[] = (snap as ClassDef[]) || [];`);

// 5. fetchQuests
content = content.replace(/    const snap = await getDocs\(collection\(db, 'quests'\)\);\n    const loaded: QuestDef\[\] = \[\];\n    snap\.forEach\(d => loaded\.push\(\{ id: d\.id, \.\.\.d\.data\(\) \} as QuestDef\)\);/,
`    const { data: snap } = await supabase.from('quests').select('*');
    const loaded: QuestDef[] = (snap as QuestDef[]) || [];`);

// 6. fetch3DModels
content = content.replace(/    const snap = await getDocs\(collection\(db, '3d_models'\)\);\n    const loaded: any\[\] = \[\];\n    snap\.forEach\(d => loaded\.push\(\{ id: d\.id, \.\.\.d\.data\(\) \}\)\);/,
`    const { data: snap } = await supabase.from('models_3d').select('*');
    const loaded: any[] = snap || [];`);

// 7. fetchMonsters
content = content.replace(/    const snap = await getDocs\(collection\(db, 'monsters'\)\);\n    const loaded: any\[\] = \[\];\n    snap\.forEach\(d => loaded\.push\(\{ id: d\.id, \.\.\.d\.data\(\) \}\)\);/,
`    const { data: snap } = await supabase.from('monsters').select('*');
    const loaded: any[] = snap || [];`);

// 8. fetchStoreItems
content = content.replace(/    const snap = await getDocs\(query\(collection\(db, 'store_items'\), where\('active', '==', true\)\)\);\n    const loaded: any\[\] = \[\];\n    snap\.forEach\(d => loaded\.push\(\{ id: d\.id, \.\.\.d\.data\(\) \}\)\);/,
`    const { data: snap } = await supabase.from('store_items').select('*').eq('active', true);
    const loaded: any[] = snap || [];`);

// 9. fetchStudents
content = content.replace(/    const q = query\(collection\(db, 'users'\)\);\n    const querySnapshot = await getDocs\(q\);\n    const loadedStudents: UserData\[\] = \[\];\n    querySnapshot\.forEach\(\(doc\) => \{\n      loadedStudents\.push\(doc\.data\(\) as UserData\);\n    \}\);/,
`    const { data: querySnapshot } = await supabase.from('users').select('*');
    const loadedStudents: UserData[] = (querySnapshot as UserData[]) || [];`);

content = content.replace(/    const itemsQ = query\(collection\(db, 'user_items'\), where\('equipped', '==', true\)\);\n    const itemsSnap = await getDocs\(itemsQ\);\n    const itemsMap: Record<string, any\[\]> = \{\};\n    itemsSnap\.forEach\(d => \{\n      const data = d\.data\(\);/,
`    const { data: itemsSnap } = await supabase.from('user_items').select('*').eq('equipped', true);
    const itemsMap: Record<string, any[]> = {};
    if (itemsSnap) itemsSnap.forEach(d => {
      const data = d.data || {};
      data.itemId = d.item_id;
      data.studentId = d.student_id;`);

// 10. loadStudentHistoryLocally
content = content.replace(/    const q = query\(collection\(db, 'xp_logs'\), where\('studentId', '==', studentUid\)\);\n    const snap = await getDocs\(q\);\n    const logs = snap\.docs\.map\(d => \(\{ logId: d\.id, \.\.\.\(d\.data\(\) as any\) \}\)\);\n    logs\.sort\(\(a, b\) => \(b\.timestamp\?\.seconds \|\| 0\) - \(a\.timestamp\?\.seconds \|\| 0\)\);/,
`    const { data: snap } = await supabase.from('xp_logs').select('*').eq('student_id', studentUid);
    let logs = (snap || []).map(d => ({ logId: d.id, ...d }));
    logs.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());`);

content = content.replace(/    const itemsQ = query\(collection\(db, 'user_items'\), where\('studentId', '==', studentUid\), where\('equipped', '==', true\)\);\n    const itemsSnap = await getDocs\(itemsQ\);\n    const eqItems = itemsSnap\.docs\.map\(d => \{\n      const data = d\.data\(\);/,
`    const { data: itemsSnap } = await supabase.from('user_items').select('*').eq('student_id', studentUid).eq('equipped', true);
    const eqItems = (itemsSnap || []).map(d => {
      const data = d.data || {};`);

// 11. handleSaveGrade (Add XP)
content = content.replace(/      const userRef = doc\(db, 'users', selectedStudent\.uid\);\n      await updateDoc\(userRef, \{ xp: newXp, coins: newCoins \}\);\n\n      await addDoc\(collection\(db, 'xp_logs'\), \{\n        studentId: selectedStudent\.uid,\n        studentName: selectedStudent\.name,\n        xpGained: xpAmount,\n        evalName,\n        evalType: gradeType,\n        timestamp: serverTimestamp\(\)\n      \}\);/,
`      await supabase.from('users').update({ xp: newXp, coins: newCoins }).eq('id', selectedStudent.uid);

      await supabase.from('xp_logs').insert({
        student_id: selectedStudent.uid,
        student_name: selectedStudent.name,
        xp_gained: xpAmount,
        eval_name: evalName,
        eval_type: gradeType
      });`);

// 12. handleRemoveXp
content = content.replace(/      const userRef = doc\(db, 'users', selectedStudent\.uid\);\n      await updateDoc\(userRef, \{ xp: newXp, coins: newCoins \}\);\n\n      await addDoc\(collection\(db, 'xp_logs'\), \{\n        studentId: selectedStudent\.uid,\n        studentName: selectedStudent\.name,\n        xpGained: -xpAmount,\n        evalName: removeReason,\n        evalType: 'Remoção Manual',\n        timestamp: serverTimestamp\(\)\n      \}\);/,
`      await supabase.from('users').update({ xp: newXp, coins: newCoins }).eq('id', selectedStudent.uid);

      await supabase.from('xp_logs').insert({
        student_id: selectedStudent.uid,
        student_name: selectedStudent.name,
        xp_gained: -xpAmount,
        eval_name: removeReason,
        eval_type: 'Remoção Manual'
      });`);

// 13. handleRemoveHistoryEntry
content = content.replace(/      await deleteDoc\(doc\(db, 'xp_logs', logId\)\);\n\n      \/\/ Estornar XP do aluno\n      const newXp = Math\.max\(0, \(selectedStudent\.xp \|\| 0\) - entry\.xpGained\);\n      \n      \/\/ Recalcular Rank Baseado no novo XP\n      const rankObj = getRankForXp\(newXp\);\n      const oldRankObj = getRankForXp\(selectedStudent\.xp \|\| 0\);\n      let newCoins = selectedStudent\.coins \|\| 0;\n      if \(rankObj\.minXp < oldRankObj\.minXp\) \{\n        newCoins = Math\.max\(0, newCoins - oldRankObj\.coinReward\);\n      \}\n\n      const userRef = doc\(db, 'users', selectedStudent\.uid\);\n      await updateDoc\(userRef, \{ xp: newXp, coins: newCoins \}\);/,
`      await supabase.from('xp_logs').delete().eq('id', logId);

      // Estornar XP do aluno
      const newXp = Math.max(0, (selectedStudent.xp || 0) - entry.xp_gained);
      
      // Recalcular Rank Baseado no novo XP
      const rankObj = getRankForXp(newXp);
      const oldRankObj = getRankForXp(selectedStudent.xp || 0);
      let newCoins = selectedStudent.coins || 0;
      if (rankObj.minXp < oldRankObj.minXp) {
        newCoins = Math.max(0, newCoins - oldRankObj.coinReward);
      }

      await supabase.from('users').update({ xp: newXp, coins: newCoins }).eq('id', selectedStudent.uid);`);

// 14. handleAddEval & handleDeleteEval
content = content.replace(/      await setDoc\(doc\(db, 'settings', 'evaluations'\), \{ types: updated \}\);/g,
`      await supabase.from('settings').upsert({ id: 'evaluations', data: { types: updated } });`);

// 15. save class
content = content.replace(/      const classId = `class_$\{Date\.now\(\)\}`;\n      const newClass = \{ name: newClassName, color: newClassColor \};\n      await setDoc\(doc\(db, 'classes', classId\), newClass\);/g,
`      const classId = \`class_\${Date.now()}\`;
      const newClass = { id: classId, name: newClassName, color: newClassColor };
      await supabase.from('classes').insert(newClass);`);

// 16. update class
content = content.replace(/      const classRef = doc\(db, 'classes', editingClassId\);\n      await updateDoc\(classRef, \{ name: editClassName, color: editClassColor \}\);/g,
`      await supabase.from('classes').update({ name: editClassName, color: editClassColor }).eq('id', editingClassId);`);

// 17. delete class
content = content.replace(/      await deleteDoc\(doc\(db, 'classes', id\)\);/g,
`      await supabase.from('classes').delete().eq('id', id);`);

// 18. update user
content = content.replace(/      const userRef = doc\(db, 'users', editingStudent\.uid\);\n      await updateDoc\(userRef, updateData\);/g,
`      await supabase.from('users').update(updateData).eq('id', editingStudent.uid);`);

// 19. delete user
content = content.replace(/      await deleteDoc\(doc\(db, 'users', deletingStudent\.uid\)\);/g,
`      await supabase.from('users').delete().eq('id', deletingStudent.uid);`);

// 20. handleBulkXp
content = content.replace(/      for \(const uid of selectedStudentIds\) \{\n        const student = students\.find\(s => s\.uid === uid\);\n        if \(!student\) continue;\n\n        const newXp = Math\.max\(0, \(student\.xp \|\| 0\) \+ xpAmount\);\n        let newCoins = student\.coins \|\| 0;\n\n        if \(xpAmount > 0\) \{\n           const oldRank = getRankForXp\(student\.xp \|\| 0\);\n           const newRank = getRankForXp\(newXp\);\n           if \(newRank\.minXp > oldRank\.minXp\) \{\n             newCoins \+= newRank\.coinReward;\n           \}\n        \}\n\n        const userRef = doc\(db, 'users', uid\);\n        await updateDoc\(userRef, \{ xp: newXp, coins: newCoins \}\);\n\n        await addDoc\(collection\(db, 'xp_logs'\), \{\n          studentId: uid,\n          studentName: student\.name,\n          xpGained: xpAmount,\n          evalName: bulkXpReason,\n          evalType: bulkXpAction === 'add' \? 'Bônus em Massa' : 'Remoção em Massa',\n          timestamp: serverTimestamp\(\)\n        \}\);\n      \}/g,
`      for (const uid of selectedStudentIds) {
        const student = students.find(s => s.uid === uid);
        if (!student) continue;

        const newXp = Math.max(0, (student.xp || 0) + xpAmount);
        let newCoins = student.coins || 0;

        if (xpAmount > 0) {
           const oldRank = getRankForXp(student.xp || 0);
           const newRank = getRankForXp(newXp);
           if (newRank.minXp > oldRank.minXp) {
             newCoins += newRank.coinReward;
           }
        }

        await supabase.from('users').update({ xp: newXp, coins: newCoins }).eq('id', uid);

        await supabase.from('xp_logs').insert({
          student_id: uid,
          student_name: student.name,
          xp_gained: xpAmount,
          eval_name: bulkXpReason,
          eval_type: bulkXpAction === 'add' ? 'Bônus em Massa' : 'Remoção em Massa'
        });
      }`);

// 21. save quest
content = content.replace(/      await setDoc\(doc\(db, 'quests', questId\), sanitizedQuest\);/g,
`      await supabase.from('quests').upsert({ id: questId, ...sanitizedQuest });`);

// 22. viewQuestHistory
content = content.replace(/    const q = query\(collection\(db, 'quest_attempts'\), where\('questId', '==', quest\.id\)\);\n    const snap = await getDocs\(q\);\n    const attempts = snap\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \}\)\);/g,
`    const { data: snap } = await supabase.from('quest_attempts').select('*').eq('quest_id', quest.id);
    const attempts = (snap || []).map(d => ({ id: d.id, ...d.data, created_at: d.created_at, studentId: d.student_id, earnedXp: d.earned_xp, questId: d.quest_id, status: d.status }));`);

// 23. delete quest attempt
content = content.replace(/      await deleteDoc\(doc\(db, 'quest_attempts', attempt\.id\)\);/g,
`      await supabase.from('quest_attempts').delete().eq('id', attempt.id);`);

// 24. toggleQuestStatus
content = content.replace(/    await updateDoc\(doc\(db, 'quests', id\), \{ active: !currentStatus \}\);/g,
`    await supabase.from('quests').update({ active: !currentStatus }).eq('id', id);`);

// 25. deleteQuest
content = content.replace(/      await deleteDoc\(doc\(db, 'quests', id\)\);/g,
`      await supabase.from('quests').delete().eq('id', id);`);

// 26. role update
content = content.replace(/await updateDoc\(doc\(db, 'users', reqUser\.uid\), \{ role: 'student' \}\);/g,
`await supabase.from('users').update({ role: 'student' }).eq('id', reqUser.uid);`);

content = content.replace(/await updateDoc\(doc\(db, 'users', reqUser\.uid\), \{ role: 'teacher' \}\);/g,
`await supabase.from('users').update({ role: 'teacher' }).eq('id', reqUser.uid);`);

fs.writeFileSync('src/pages/AdminDashboard.tsx', content, 'utf-8');
