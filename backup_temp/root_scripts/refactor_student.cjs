const fs = require('fs');

let content = fs.readFileSync('src/pages/LiveQuestStudent.tsx', 'utf-8');
content = content.replace(/\r\n/g, '\n');

// 1. Imports
content = content.replace(/import \{ doc, getDoc, onSnapshot, updateDoc, deleteField, collection, query, where, getDocs, increment, deleteDoc \} from 'firebase\/firestore';\n/, "");
content = content.replace(/import \{ db \} from '\.\.\/lib\/firebase';\n/, "import { supabase } from '../lib/supabase';\n");

// 2. getDoc quests
content = content.replace(/        const qDoc = await getDoc\(doc\(db, 'quests', sessionId\)\);\n        if \(!qDoc\.exists\(\)\) \{/g,
`        const { data: qDoc } = await supabase.from('quests').select('*').eq('id', sessionId).single();
        if (!qDoc) {`);

content = content.replace(/          setQuest\(qDoc\.data\(\) as QuestDef\);/g,
`          setQuest(qDoc as QuestDef);`);

// 3. getDoc live_quests
content = content.replace(/        const sessionRef = doc\(db, 'live_quests', sessionId\);\n        const sDoc = await getDoc\(sessionRef\);\n        if \(!sDoc\.exists\(\)\) \{/g,
`        const { data: sDoc } = await supabase.from('live_quests').select('*').eq('id', sessionId).single();
        if (!sDoc) {`);

content = content.replace(/          const currentSession = sDoc\.data\(\) as LiveSession;/g,
`          const currentSession = sDoc as LiveSession;`);

// 4. getDoc settings economy
content = content.replace(/        const econSnap = await getDoc\(doc\(db, 'settings', 'economy'\)\);\n        if \(econSnap\.exists\(\)\) \{\n          setCoinsDropInCombat\(econSnap\.data\(\)\.coinsDropInCombat \?\? false\);\n          setCoinsLostInCombat\(econSnap\.data\(\)\.coinsLostInCombat \?\? false\);\n        \}/g,
`        const { data: econSnap } = await supabase.from('system_collections').select('*').eq('type', 'economy').single();
        if (econSnap && econSnap.data) {
          setCoinsDropInCombat(econSnap.data.coinsDropInCombat ?? false);
          setCoinsLostInCombat(econSnap.data.coinsLostInCombat ?? false);
        }`);

// 5. getDocs user_items
content = content.replace(/            const invRef = collection\(db, 'user_items'\);\n            const q = query\(invRef, where\('studentId', '==', userData\.uid\)\);\n            const invSnap = await getDocs\(q\);\n            \n            const pLoaded: any\[\] = \[\];\n            invSnap\.docs\.forEach\(d => \{\n              const item = d\.data\(\) as UserItem;/g,
`            const { data: invSnap } = await supabase.from('user_items').select('*').eq('student_id', userData.uid);
            
            const pLoaded: any[] = [];
            (invSnap || []).forEach(d => {
              const item = { ...d.data, id: d.id } as UserItem;`);

// 6. updateDoc players
content = content.replace(/          await updateDoc\(sessionRef, \{\n            \[`players\.\$\{userData\.uid\}`\]: sanitizedPlayer\n          \}\);/g,
`          const { data: curr } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();
          if (curr && curr.players) {
            curr.players[userData.uid] = sanitizedPlayer;
            await supabase.from('live_quests').update({ players: curr.players }).eq('id', sessionId);
          }`);

// 7. onSnapshot live_quests
content = content.replace(/        unsub = onSnapshot\(sessionRef, \(snap\) => \{\n          if \(!snap\.exists\(\)\) \{\n            setError\('A sessão foi encerrada pelo professor\.'\);\n            setSession\(null\);\n          \} else \{\n            setSession\(snap\.data\(\) as LiveSession\);\n          \}\n          setLoading\(false\);\n        \}\);/g,
`        const channel = supabase.channel(\`public:live_quests:id=eq.\${sessionId}\`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'live_quests', filter: \`id=eq.\${sessionId}\` }, (payload) => {
            if (payload.eventType === 'DELETE') {
              setError('A sessão foi encerrada pelo professor.');
              setSession(null);
            } else {
              setSession(payload.new as LiveSession);
            }
          })
          .subscribe();
        unsub = () => { supabase.removeChannel(channel); };
        setSession(sDoc as LiveSession);
        setLoading(false);`);

// 8. handleLeave
content = content.replace(/      const sessionRef = doc\(db, 'live_quests', sessionId\);\n      await updateDoc\(sessionRef, \{\n        \[`players\.\$\{userData\.uid\}`\]: deleteField\(\)\n      \}\);/g,
`      const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();
      if (currSess && currSess.players) {
        delete currSess.players[userData.uid];
        await supabase.from('live_quests').update({ players: currSess.players }).eq('id', sessionId);
      }`);

// 9. handleUpdateAvatar
content = content.replace(/                  await updateDoc\(doc\(db, 'live_quests', sessionId\), \{\n                    \[`players\.\$\{userData\.uid\}\.avatarConfig`\]: config\n                  \}\);/g,
`                  const { data: c } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();
                  if (c && c.players && c.players[userData.uid]) {
                    c.players[userData.uid].avatarConfig = config;
                    await supabase.from('live_quests').update({ players: c.players }).eq('id', sessionId);
                  }`);

content = content.replace(/                  await updateDoc\(doc\(db, 'users', userData\.uid\), \{\n                    avatarConfig: config\n                  \}\);/g,
`                  await supabase.from('users').update({ avatar_config: config }).eq('id', userData.uid);`);

// 10. handleAnswerSubmit xp and coins
content = content.replace(/        try \{\n          await updateDoc\(doc\(db, 'users', userData\.uid\), \{\n            xp: increment\(earnedXp\)\n          \}\);\n        \} catch\(e\)\{\}/g,
`        try {
          const { data: u } = await supabase.from('users').select('xp').eq('id', userData.uid).single();
          if (u) await supabase.from('users').update({ xp: (u.xp || 0) + earnedXp }).eq('id', userData.uid);
        } catch(e){}`);

content = content.replace(/               const currentCoins = userData\.coins \|\| 0;\n               await updateDoc\(doc\(db, 'users', userData\.uid\), \{ coins: Math\.max\(0, currentCoins \- lost\) \}\);\n            \} catch\(e\)\{\}/g,
`               const currentCoins = userData.coins || 0;
               await supabase.from('users').update({ coins: Math.max(0, currentCoins - lost) }).eq('id', userData.uid);
            } catch(e){}`);

content = content.replace(/          await updateDoc\(doc\(db, 'users', userData\.uid\), userUpdate\);/g,
`          await supabase.from('users').update(userUpdate).eq('id', userData.uid);`);

// 11. update session currentAnswer
content = content.replace(/    await updateDoc\(doc\(db, 'live_quests', sessionId\), updates\);/g,
`    const { data: uC } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();
    if (uC && uC.players && uC.players[userData.uid]) {
      uC.players[userData.uid].currentAnswer = idx;
      await supabase.from('live_quests').update({ players: uC.players }).eq('id', sessionId);
    }`);

// 12. Use potion
content = content.replace(/      await updateDoc\(doc\(db, 'live_quests', sessionId\), \{\n        \[`players\.\$\{userData\.uid\}\.hp`\]: maxHearts\n      \}\);/g,
`      const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();
      if (currSess && currSess.players && currSess.players[userData.uid]) {
        currSess.players[userData.uid].hp = maxHearts;
        await supabase.from('live_quests').update({ players: currSess.players }).eq('id', sessionId);
      }`);

content = content.replace(/         await updateDoc\(doc\(db, 'users', userData\.uid\), \{ hearts: maxHearts \}\);/g,
`         await supabase.from('users').update({ hearts: maxHearts }).eq('id', userData.uid);`);

content = content.replace(/      await updateDoc\(doc\(db, 'live_quests', sessionId\), \{\n        \[`players\.\$\{userData\.uid\}\.hp`\]: newHp\n      \}\);/g,
`      const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();
      if (currSess && currSess.players && currSess.players[userData.uid]) {
        currSess.players[userData.uid].hp = newHp;
        await supabase.from('live_quests').update({ players: currSess.players }).eq('id', sessionId);
      }`);

content = content.replace(/         await updateDoc\(doc\(db, 'users', userData\.uid\), \{ hearts: newHp \}\);/g,
`         await supabase.from('users').update({ hearts: newHp }).eq('id', userData.uid);`);

content = content.replace(/    await deleteDoc\(doc\(db, 'user_items', item\.id\)\);/g,
`    await supabase.from('user_items').delete().eq('id', item.id);`);

// 13. Rescue Coins
content = content.replace(/                        updateDoc\(doc\(db, 'users', userData\.uid\), \{ coins: currentCoins \+ coinsToRescue \}\)\.catch\(console\.error\);/g,
`                        supabase.from('users').update({ coins: currentCoins + coinsToRescue }).eq('id', userData.uid).then();`);

// 14. wonChest deleteField
content = content.replace(/      updateDoc\(doc\(db, 'live_quests', sessionId!\), \{\n        \[`players\.\$\{userData!\.uid\}\.wonChest`\]: deleteField\(\)\n      \}\)\.catch\(console\.error\);/g,
`      supabase.from('live_quests').select('players').eq('id', sessionId!).single().then(({ data: sess }) => {
        if (sess && sess.players && sess.players[userData!.uid]) {
          delete sess.players[userData!.uid].wonChest;
          supabase.from('live_quests').update({ players: sess.players }).eq('id', sessionId!).then();
        }
      });`);

content = content.replace(/                await updateDoc\(doc\(db, 'live_quests', sessionId!\), \{\n                  \[`players\.\$\{userData!\.uid\}\.wonChest`\]: deleteField\(\)\n                \}\);/g,
`                const { data: sess } = await supabase.from('live_quests').select('players').eq('id', sessionId!).single();
                if (sess && sess.players && sess.players[userData!.uid]) {
                  delete sess.players[userData!.uid].wonChest;
                  await supabase.from('live_quests').update({ players: sess.players }).eq('id', sessionId!);
                }`);

fs.writeFileSync('src/pages/LiveQuestStudent.tsx', content, 'utf-8');
