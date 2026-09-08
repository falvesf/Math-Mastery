const fs = require('fs');

let content = fs.readFileSync('src/pages/LiveQuestAdmin.tsx', 'utf-8');

// Imports
content = content.replace(/import \{[^}]*firebase\/firestore[^}]*\} from 'firebase\/firestore';/, "import { supabase } from '../lib/supabase';");
content = content.replace(/import \{ db \} from '\.\.\/lib\/firebase';\n/, "");

// updateDoc helper
content = content.replace(/updateDoc\(doc\(db, 'live_quests', (.*?)\), updates\);/g,
    "supabase.from('live_quests').update(updates).eq('id', $1);");
content = content.replace(/updateDoc\(doc\(db, 'live_quests', (.*?)\), \{ status: 'ranking' \}\);/g,
    "supabase.from('live_quests').update({ status: 'ranking' }).eq('id', $1);");

// getDoc quest
content = content.replace(/const qDoc = await getDoc\(doc\(db, 'quests', sessionId\)\);(\s+)if \(!qDoc\.exists\(\)\) \{([\s\S]*?)\}(\s+)setQuest\(qDoc\.data\(\) as QuestDef\);/,
    "const { data: qDocData } = await supabase.from('quests').select('*').eq('id', sessionId).single();$1if (!qDocData) {$2}$3setQuest({ id: qDocData.id, ...qDocData } as QuestDef);");

// session fetch & creation
content = content.replace(/const sessionRef = doc\(db, 'live_quests', sessionId\);(\s+)const sDoc = await getDoc\(sessionRef\);(\s+)if \(!sDoc\.exists\(\)\) \{([\s\S]*?)await setDoc\(sessionRef, newSession\);(\s+)setSession\(newSession\);(\s+)\} else \{(\s+)const currentSession = sDoc\.data\(\) as LiveSession;(\s+)if \(currentSession\.status === 'finished'\) \{(\s+)await updateDoc\(sessionRef, \{([\s\S]*?)\}\);(\s+)\}(\s+)\}/,
    "const { data: sDocData } = await supabase.from('live_quests').select('*').eq('id', sessionId).single();$1if (!sDocData) {$3await supabase.from('live_quests').insert({ id: sessionId, ...newSession });$4setSession(newSession);$5} else {$6const currentSession = sDocData as LiveSession;$7if (currentSession.status === 'finished') {$8await supabase.from('live_quests').update({$9}).eq('id', sessionId);$10}$11}");

// onSnapshot
content = content.replace(/const unsub = onSnapshot\(sessionRef, \(snap\) => \{(\s+)if \(snap\.exists\(\)\) \{(\s+)setSession\(snap\.data\(\) as LiveSession\);(\s+)\}(\s+)setLoading\(false\);(\s+)\}\);/,
    "const channel = supabase.channel(`live_quest_admin_${sessionId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'live_quests', filter: `id=eq.${sessionId}` }, (payload) => {$1if (payload.eventType !== 'DELETE') {$2setSession(payload.new as LiveSession);$3}$4setLoading(false);$5}).subscribe();\n      const unsub = () => supabase.removeChannel(channel);");

// updateDoc next question
content = content.replace(/await updateDoc\(doc\(db, 'live_quests', sessionId\), \{([\s\S]*?)status: 'question',([\s\S]*?)\}\);/,
    "await supabase.from('live_quests').update({$1status: 'question',$2}).eq('id', sessionId);");

// updateDoc finish
content = content.replace(/await updateDoc\(doc\(db, 'live_quests', sessionId\), \{ status: 'finished' \}\);/,
    "await supabase.from('live_quests').update({ status: 'finished' }).eq('id', sessionId);");

// store_items query
content = content.replace(/const q = query\(collection\(db, 'store_items'\), where\('__name__', 'in', dropItemIds\)\);(\s+)const snap = await getDocs\(q\);(\s+)const storeItemsMap = new Map\(\);(\s+)snap\.docs\.forEach\(doc => storeItemsMap\.set\(doc\.id, \{ id: doc\.id, \.\.\.doc\.data\(\) \}\)\);/,
    "const { data: snap } = await supabase.from('store_items').select('*').in('id', dropItemIds);$1const storeItemsMap = new Map();$2if (snap) snap.forEach(d => storeItemsMap.set(d.id, { id: d.id, ...d.data }));");

// push addDoc user_items
content = content.replace(/promises\.push\(addDoc\(collection\(db, 'user_items'\), itemData\)\);/,
    "promises.push(supabase.from('user_items').insert({\n                      student_id: playerUid,\n                      item_id: item.id,\n                      equipped: false,\n                      data: itemData\n                    }));");

// serverTimestamp -> Date.now()
content = content.replace(/purchasedAt: serverTimestamp\(\)/g, "purchasedAt: Date.now()");

// push updateDoc users
content = content.replace(/promises\.push\(updateDoc\(doc\(db, 'users', playerUid\), userUpdates\)\);/,
    "promises.push(supabase.from('users').update(userUpdates).eq('id', playerUid));");

// push addDoc quest_attempts
content = content.replace(/addDoc\(collection\(db, 'quest_attempts'\), \{([\s\S]*?)questId: quest\.id,([\s\S]*?)studentId: playerUid,([\s\S]*?)earnedXp: finalXp,([\s\S]*?)answers: \{\},([\s\S]*?)timestamp: serverTimestamp\(\)([\s\S]*?)\}\)/,
    "supabase.from('quest_attempts').insert({$1quest_id: quest.id,$2student_id: playerUid,$3earned_xp: finalXp,$4data: { answers: {} }$6})");

// push addDoc xp_logs
content = content.replace(/addDoc\(collection\(db, 'xp_logs'\), \{([\s\S]*?)studentId: playerUid,([\s\S]*?)evalName: `Missão: \$\{quest\.title\}`,([\s\S]*?)xpGained: finalXp,([\s\S]*?)timestamp: serverTimestamp\(\)([\s\S]*?)\}\)/,
    "supabase.from('xp_logs').insert({$1student_id: playerUid,$2eval_name: `Missão: ${quest.title}`,$3xp_gained: finalXp$5})");

// push updateDoc live_quests sessionUpdates
content = content.replace(/promises\.push\(updateDoc\(doc\(db, 'live_quests', sessionId\), sessionUpdates\)\);/,
    "promises.push(supabase.from('live_quests').update(sessionUpdates).eq('id', sessionId));");

// updateDoc live_quests updates
content = content.replace(/await updateDoc\(doc\(db, 'live_quests', sessionId\), updates\);/,
    "await supabase.from('live_quests').update(updates).eq('id', sessionId);");

fs.writeFileSync('src/pages/LiveQuestAdmin.tsx', content, 'utf-8');
