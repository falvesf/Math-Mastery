const fs = require('fs');

let content = fs.readFileSync('src/pages/LiveQuestStudent.tsx', 'utf-8');

// Imports
content = content.replace(/import \{[^}]*firebase\/firestore[^}]*\} from 'firebase\/firestore';/, "import { supabase } from '../lib/supabase';");
content = content.replace(/import \{ db \} from '\.\.\/lib\/firebase';\n/, "");

// getDoc(doc(db, 'quests', sessionId))
content = content.replace(/const qDoc = await getDoc\(doc\(db, 'quests', (.*?)\)\);(\s+)if \(!qDoc\.exists\(\)\) \{([\s\S]*?)\}(\s+)setQuest\(qDoc\.data\(\) as QuestDef\);/,
    "const { data: qDocData } = await supabase.from('quests').select('*').eq('id', $1).single();$2if (!qDocData) {$3}$4setQuest({ id: qDocData.id, ...qDocData } as QuestDef);");

// getDoc(doc(db, 'live_quests', sessionId))
content = content.replace(/const sessionRef = doc\(db, 'live_quests', (.*?)\);(\s+)const sDoc = await getDoc\(sessionRef\);(\s+)if \(!sDoc\.exists\(\)\) \{([\s\S]*?)\}(\s+)const currentSession = sDoc\.data\(\) as LiveSession;/,
    "const sessionRef = $1;$2const { data: sDocData } = await supabase.from('live_quests').select('*').eq('id', $1).single();$3if (!sDocData) {$4}$5const currentSession = sDocData as LiveSession;");

// getDoc(doc(db, 'settings', 'economy'))
content = content.replace(/const econSnap = await getDoc\(doc\(db, 'settings', 'economy'\)\);(\s+)if \(econSnap\.exists\(\)\) \{([\s\S]*?)\}/,
    "const { data: econSnap } = await supabase.from('system_collections').select('data').eq('type', 'economy').single();$1if (econSnap && econSnap.data) {$2}");

// user_items fetch
content = content.replace(/const invRef = collection\(db, 'user_items'\);(\s+)const q = query\(invRef, where\('studentId', '==', userData\.uid\)\);(\s+)const invSnap = await getDocs\(q\);(\s+)const pLoaded: any\[\] = \[\];(\s+)invSnap\.docs\.forEach\(d => \{([\s\S]*?)\}\);/,
    "const { data: invSnap } = await supabase.from('user_items').select('*').eq('student_id', userData.uid);$1const pLoaded: any[] = [];$2if (invSnap) invSnap.forEach((d: any) => {\n              const item = { ...d.data, id: d.id };\n              if (item.equipped) {\n                equippedItems.push({ docId: d.id, ...item });\n              }\n              if (item.itemType === 'consumable' && item.usableInQuest && item.gameEffect !== 'add_time') {\n                pLoaded.push({ ...item, id: d.id });\n              }\n            });");

// updateDoc(sessionRef, { [`players.${userData.uid}`]: sanitizedPlayer });
content = content.replace(/await updateDoc\(sessionRef, \{\s+\[`players\.\$\{userData\.uid\}`\]: sanitizedPlayer\s+\}\);/,
    "const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();\n          if (currSess) {\n            const players = currSess.players || {};\n            players[userData.uid] = sanitizedPlayer;\n            await supabase.from('live_quests').update({ players }).eq('id', sessionId);\n          }");

// onSnapshot -> channel
content = content.replace(/unsub = onSnapshot\(sessionRef, \(snap\) => \{([\s\S]*?)\}\);/,
    "const channel = supabase.channel(`live_quest_${sessionId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'live_quests', filter: `id=eq.${sessionId}` }, (payload) => {\n            if (payload.eventType === 'DELETE') {\n              setError('A sessão foi encerrada pelo professor.');\n              setSession(null);\n            } else {\n              setSession(payload.new as LiveSession);\n            }\n            setLoading(false);\n          }).subscribe();\n          unsub = () => supabase.removeChannel(channel);");

// updateDoc handleLeave
content = content.replace(/const sessionRef = doc\(db, 'live_quests', sessionId\);\s+await updateDoc\(sessionRef, \{\s+\[`players\.\$\{userData\.uid\}`\]: deleteField\(\)\s+\}\);/,
    "const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();\n      if (currSess && currSess.players) {\n        const players = currSess.players;\n        delete players[userData.uid];\n        await supabase.from('live_quests').update({ players }).eq('id', sessionId);\n      }");

// handleAnswer updateDoc
content = content.replace(/await updateDoc\(doc\(db, 'live_quests', sessionId\), \{\s+\[`players\.\$\{userData\.uid\}\.currentAnswer`\]: optionIndex\s+\}\);/,
    "const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();\n                  if (currSess && currSess.players) {\n                    const players = currSess.players;\n                    if (players[userData.uid]) players[userData.uid].currentAnswer = optionIndex;\n                    await supabase.from('live_quests').update({ players }).eq('id', sessionId);\n                  }");

// updateDoc user
content = content.replace(/await updateDoc\(doc\(db, 'users', userData\.uid\), \{\s+coins: Math\.max\(0, currentCoins - lost\)\s+\}\);/,
    "await supabase.from('users').update({ coins: Math.max(0, currentCoins - lost) }).eq('id', userData.uid);");

// updateDoc user userUpdate
content = content.replace(/await updateDoc\(doc\(db, 'users', userData\.uid\), userUpdate\);/,
    "await supabase.from('users').update(userUpdate).eq('id', userData.uid);");

// updateDoc live_quest updates
content = content.replace(/await updateDoc\(doc\(db, 'live_quests', sessionId\), updates\);/,
    "const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();\n    if (currSess && currSess.players) {\n      const players = currSess.players;\n      if (players[userData.uid]) {\n        if (updates[`players.${userData.uid}.isDead`] !== undefined) players[userData.uid].isDead = updates[`players.${userData.uid}.isDead`];\n        if (updates[`players.${userData.uid}.hp`] !== undefined) players[userData.uid].hp = updates[`players.${userData.uid}.hp`];\n      }\n      await supabase.from('live_quests').update({ players }).eq('id', sessionId);\n    }");

// triggerFatality update user
content = content.replace(/await updateDoc\(doc\(db, 'users', userData\.uid\), \{ hearts: maxHearts \}\);/,
    "await supabase.from('users').update({ hearts: maxHearts }).eq('id', userData.uid);");

// triggerFatality update session (dead)
content = content.replace(/await updateDoc\(doc\(db, 'live_quests', sessionId\), \{\s+\[`players\.\$\{userData\.uid\}\.isDead`\]: true\s+\}\);/,
    "const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();\n      if (currSess && currSess.players) {\n        const players = currSess.players;\n        if (players[userData.uid]) players[userData.uid].isDead = true;\n        await supabase.from('live_quests').update({ players }).eq('id', sessionId);\n      }");

// triggerFatality update session (hp)
content = content.replace(/await updateDoc\(doc\(db, 'live_quests', sessionId\), \{\s+\[`players\.\$\{userData\.uid\}\.hp`\]: newHp\s+\}\);/,
    "const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();\n      if (currSess && currSess.players) {\n        const players = currSess.players;\n        if (players[userData.uid]) players[userData.uid].hp = newHp;\n        await supabase.from('live_quests').update({ players }).eq('id', sessionId);\n      }");

// triggerFatality update user (hp)
content = content.replace(/await updateDoc\(doc\(db, 'users', userData\.uid\), \{ hearts: newHp \}\);/,
    "await supabase.from('users').update({ hearts: newHp }).eq('id', userData.uid);");

// consume item
content = content.replace(/await deleteDoc\(doc\(db, 'user_items', item\.id\)\);/,
    "await supabase.from('user_items').delete().eq('id', item.id);");

// fetch powerups inline
content = content.replace(/updateDoc\(doc\(db, 'users', userData\.uid\), \{ coins: currentCoins \+ coinsToRescue \}\)\.catch\(console\.error\);/,
    "supabase.from('users').update({ coins: currentCoins + coinsToRescue }).eq('id', userData.uid).catch(console.error);");

// handlePowerupSelect extra_life update session
content = content.replace(/updateDoc\(doc\(db, 'live_quests', sessionId!\), \{\s+\[`players\.\$\{userData\.uid\}\.hp`\]: maxHearts\s+\}\);/,
    "supabase.from('live_quests').select('players').eq('id', sessionId!).single().then(({ data: currSess }) => {\n        if (currSess && currSess.players) {\n          const players = currSess.players;\n          if (players[userData.uid]) players[userData.uid].hp = maxHearts;\n          supabase.from('live_quests').update({ players }).eq('id', sessionId!);\n        }\n      });");

// handlePowerupSelect extra_life await update session
content = content.replace(/await updateDoc\(doc\(db, 'live_quests', sessionId!\), \{\s+\[`players\.\$\{userData\.uid\}\.hp`\]: Math\.min\(maxHearts, currentHp \+ 1\)\s+\}\);/,
    "const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId!).single();\n                if (currSess && currSess.players) {\n                  const players = currSess.players;\n                  if (players[userData.uid]) players[userData.uid].hp = Math.min(maxHearts, currentHp + 1);\n                  await supabase.from('live_quests').update({ players }).eq('id', sessionId!);\n                }");

fs.writeFileSync('src/pages/LiveQuestStudent.tsx', content, 'utf-8');
