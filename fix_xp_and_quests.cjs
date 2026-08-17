const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createClient } = require('@supabase/supabase-js');
const { v5: uuidv5 } = require('uuid');

const NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';
function toUuid(str) {
    if (!str) return str;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) return str;
    return uuidv5(str, NAMESPACE);
}

const serviceAccount = require('./firebase-key.json.json');
initializeApp({ credential: cert(serviceAccount) });
const fbDb = getFirestore();

const SUPABASE_URL = 'https://irpmeockteksidxnpznb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc2MDg2NSwiZXhwIjoyMTAyMzM2ODY1fQ.Zhy4PP_vwQhd7Gef-1_7fSiLs7qJH38zIN0FT4KR40E';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    const { data: supaUsers } = await supabase.from('users').select('*');
    for (const su of supaUsers) {
        if (!su.email) continue;
        const fbUsersSnap = await fbDb.collection('users').where('email', '==', su.email).get();
        if (fbUsersSnap.size > 0) {
            const fbDoc = fbUsersSnap.docs[0];
            const oldFirebaseId = fbDoc.id;
            
            // Map quest_attempts
            const questAttSnap = await fbDb.collection('quest_attempts').where('studentId', '==', oldFirebaseId).get();
            for (const doc of questAttSnap.docs) {
                const data = doc.data();
                // Quest id should NOT be re-mapped if it is Lovable format, wait!
                // Ah, the original migrate_uuid.cjs did `const newQuestId = toUuid(data.questId);`
                // I will do the same for the quest ID but use the real Supabase user ID for student_id.
                // Wait! AdminDashboard saves quests with `id: questId || Date.now().toString()`.
                // So quests created by AdminDashboard will not be UUIDs. 
                // But old Firebase quests were UUID-ified.
                const newId = toUuid(doc.id);
                // The quest itself was migrated with toUuid(doc.id) in migrate_uuid.cjs
                // So I MUST use toUuid for the quest ID here too.
                const newQuestId = data.questId ? toUuid(data.questId) : null;
                
                const row = {
                    id: newId,
                    student_id: su.id,
                    quest_id: newQuestId,
                    status: data.status || 'completed',
                    score: data.score || 0,
                    xp_earned: data.xpEarned || 0,
                    coins_earned: data.coinsEarned || 0,
                    started_at: data.startedAt ? new Date(data.startedAt.seconds * 1000).toISOString() : new Date().toISOString(),
                    completed_at: data.completedAt ? new Date(data.completedAt.seconds * 1000).toISOString() : null,
                    answers: data.answers || {}
                };
                await supabase.from('quest_attempts').upsert(row);
            }
            
            // Map xp_logs
            const xpLogsSnap = await fbDb.collection('xp_logs').where('studentId', '==', oldFirebaseId).get();
            for (const doc of xpLogsSnap.docs) {
                const data = doc.data();
                const newId = toUuid(doc.id);
                
                const row = {
                    id: newId,
                    student_id: su.id,
                    student_name: su.name,
                    eval_id: data.evalId || null,
                    eval_name: data.evalName || '',
                    justification: data.justification || null,
                    grade: data.grade || null,
                    weight: data.weight || null,
                    xp_gained: data.xpGained || 0,
                    created_at: data.timestamp ? new Date(data.timestamp.seconds * 1000).toISOString() : new Date().toISOString()
                };
                await supabase.from('xp_logs').upsert(row);
            }
            console.log(`Migrated XP and Quests for: ${su.email}`);
        }
    }
    console.log("XP and Quests migration complete!");
}
run();
