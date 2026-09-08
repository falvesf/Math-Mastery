const fs = require('fs');

let content = fs.readFileSync('src/pages/LiveQuestAdmin.tsx', 'utf-8');
content = content.replace(/\r\n/g, '\n');

// 1. imports
content = content.replace(/import \{[^}]*firebase\/firestore[^}]*\} from 'firebase\/firestore';\n/, "import { supabase } from '../lib/supabase';\n");
content = content.replace(/import \{ db \} from '\.\.\/lib\/firebase';\n/, "");

// 2. updateDoc helper at 98
content = content.replace(/updateDoc\(doc\(db, 'live_quests', sessionId!\), updates\);/g,
    "supabase.from('live_quests').update(updates).eq('id', sessionId!);");

// 3. status ranking at 160
content = content.replace(/updateDoc\(doc\(db, 'live_quests', sessionId\), \{ status: 'ranking' \}\);/g,
    "supabase.from('live_quests').update({ status: 'ranking' }).eq('id', sessionId);");

// 5. next question at 240
content = content.replace(/await updateDoc\(doc\(db, 'live_quests', sessionId\), \{\n\s+status: 'question',/g,
    "await supabase.from('live_quests').update({\n      status: 'question',");

// 6. finish at 252
content = content.replace(/await updateDoc\(doc\(db, 'live_quests', sessionId\), \{ status: 'finished' \}\);/g,
    "await supabase.from('live_quests').update({ status: 'finished' }).eq('id', sessionId);");

// 7. addDoc quest_attempts at 415
content = content.replace(/addDoc\(collection\(db, 'quest_attempts'\), \{/g,
    "supabase.from('quest_attempts').insert({");

content = content.replace(/questId: quest.id,/g, "quest_id: quest.id,");
content = content.replace(/studentId: uid,/g, "student_id: uid,");
content = content.replace(/earnedXp: earnedXp,/g, "earned_xp: earnedXp,");
content = content.replace(/answers: \[\],/g, "data: { answers: [] },");
content = content.replace(/timestamp: serverTimestamp\(\),/g, "created_at: new Date().toISOString(),");
content = content.replace(/isStudyMode: false,/g, "is_study_mode: false,");
content = content.replace(/isLiveQuest: true/g, "is_live_quest: true");

// 8. addDoc xp_logs at 431
content = content.replace(/addDoc\(collection\(db, 'xp_logs'\), \{/g,
    "supabase.from('xp_logs').insert({");

content = content.replace(/studentName: player.name,/g, "student_name: player.name,");
content = content.replace(/xpGained: earnedXp,/g, "xp_gained: earnedXp,");
content = content.replace(/evalName: `Missão: \$\{quest\.title\}`/g, "eval_name: `Missão: ${quest.title}`");

// 9. session load chunk
content = content.replace(/      const qDoc = await getDoc\(doc\(db, 'quests', sessionId\)\);\n      if \(!qDoc\.exists\(\)\) \{\n        navigate\('\/admin'\);\n        return;\n      \}\n      const qData = qDoc\.data\(\) as QuestDef;\n      setQuest\(qData\);\n\n      \/\/ Create or Load Session\n      const sessionRef = doc\(db, 'live_quests', sessionId\);\n      const sDoc = await getDoc\(sessionRef\);\n      if \(!sDoc\.exists\(\)\) \{\n        const newSession: LiveSession = \{\n          questId: sessionId,\n          teacherId: userData\.uid,\n          status: 'lobby',\n          currentQuestionIndex: 0,\n          activeQuestions: qData\.questions\.map\(\(_, i\) => i\),\n          monsterHp: 0,\n          maxMonsterHp: 0,\n          players: \{\}\n        \};\n        await setDoc\(sessionRef, newSession\);\n      \} else \{\n        \/\/ If resuming a session but no players are present, force reset to lobby\n        const data = sDoc\.data\(\) as LiveSession;\n        const playersCount = Object\.keys\(data\.players \|\| \{\}\)\.length;\n        if \(\(data\.status as string\) === 'lobby' \|\| \(\(data\.status as string\) !== 'lobby' && playersCount === 0\)\) \{\n          await updateDoc\(sessionRef, \{\n            status: 'lobby',\n            currentQuestionIndex: 0,\n            activeQuestions: qData\.questions\.map\(\(_, i\) => i\),\n            monsterHp: 0,\n            maxMonsterHp: 0\n          \}\);\n        \}\n      \}\n\n      \/\/ Listen to Session\n      const unsub = onSnapshot\(sessionRef, \(snap\) => \{\n        if \(snap\.exists\(\)\) \{\n          setSession\(snap\.data\(\) as LiveSession\);\n        \} else \{\n          setSession\(null\);\n        \}\n        setLoading\(false\);\n      \}\);\n\n      return \(\) => unsub\(\);/m,
`      const { data: qDocData } = await supabase.from('quests').select('*').eq('id', sessionId).single();
      if (!qDocData) {
        navigate('/admin');
        return;
      }
      const qData = { id: qDocData.id, ...qDocData } as QuestDef;
      setQuest(qData);

      // Create or Load Session
      const { data: sDocData } = await supabase.from('live_quests').select('*').eq('id', sessionId).single();
      if (!sDocData) {
        const newSession: LiveSession = {
          questId: sessionId,
          teacherId: userData.uid,
          status: 'lobby',
          currentQuestionIndex: 0,
          activeQuestions: qData.questions.map((_, i) => i),
          monsterHp: 0,
          maxMonsterHp: 0,
          players: {}
        };
        await supabase.from('live_quests').insert({ id: sessionId, ...newSession });
      } else {
        const data = sDocData as LiveSession;
        const playersCount = Object.keys(data.players || {}).length;
        if ((data.status as string) === 'lobby' || ((data.status as string) !== 'lobby' && playersCount === 0)) {
          await supabase.from('live_quests').update({
            status: 'lobby',
            currentQuestionIndex: 0,
            activeQuestions: qData.questions.map((_, i) => i),
            monsterHp: 0,
            maxMonsterHp: 0
          }).eq('id', sessionId);
        }
      }

      // Listen to Session
      const channel = supabase.channel(\`live_quest_admin_\${sessionId}\`).on('postgres_changes', { event: '*', schema: 'public', table: 'live_quests', filter: \`id=eq.\${sessionId}\` }, (payload) => {
        if (payload.eventType !== 'DELETE') {
          setSession(payload.new as LiveSession);
        } else {
          setSession(null);
        }
        setLoading(false);
      }).subscribe();
      
      const unsub = () => supabase.removeChannel(channel);

      return () => unsub();`);

// userUpdates coins increment
content = content.replace(/userUpdates\.coins = increment\(chestConfig\.maxCoins\);/g,
  `const { data: uData } = await supabase.from('users').select('coins').eq('id', playerUid).single();
             userUpdates.coins = (uData?.coins || 0) + chestConfig.maxCoins;`);

// user_items insert
content = content.replace(/promises\.push\(addDoc\(collection\(db, 'user_items'\), itemData\)\);/g,
  `promises.push(supabase.from('user_items').insert({ student_id: playerUid, item_id: item.id, equipped: false, data: itemData }));`);

// users update
content = content.replace(/promises\.push\(updateDoc\(doc\(db, 'users', playerUid\), userUpdates\)\);/g,
  `promises.push(supabase.from('users').update(userUpdates).eq('id', playerUid));`);

// live_quests updates
content = content.replace(/promises\.push\(updateDoc\(doc\(db, 'live_quests', sessionId\), sessionUpdates\)\);/g,
  `promises.push(supabase.from('live_quests').update(sessionUpdates).eq('id', sessionId));`);

// Reset player answers updateDoc
content = content.replace(/await updateDoc\(doc\(db, 'live_quests', sessionId\), updates\);/g,
  `await supabase.from('live_quests').update(updates).eq('id', sessionId);`);

// store_items fetch
content = content.replace(/const q = query\(collection\(db, 'store_items'\), where\('__name__', 'in', validIds\)\);\n               const snap = await getDocs\(q\);\n               const storeItemsMap = new Map\(\);\n               snap\.docs\.forEach\(d => storeItemsMap\.set\(d\.id, \{ id: d\.id, \.\.\.d\.data\(\) \}\)\);/g,
  `const { data: snap } = await supabase.from('store_items').select('*').in('id', validIds);\n               const storeItemsMap = new Map();\n               if (snap) snap.forEach(d => storeItemsMap.set(d.id, { id: d.id, ...d.data }));`);

// write back
fs.writeFileSync('src/pages/LiveQuestAdmin.tsx', content, 'utf-8');
