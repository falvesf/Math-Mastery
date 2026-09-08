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
            
            // Map items
            const fbItemsSnap = await fbDb.collection('user_items').where('studentId', '==', oldFirebaseId).get();
            for (const doc of fbItemsSnap.docs) {
                const data = doc.data();
                const row = {
                    id: toUuid(doc.id),
                    student_id: su.id,
                    item_id: toUuid(data.itemId),
                    equipped: data.equipped || false,
                    data: data
                };
                await supabase.from('user_items').upsert(row);
            }
            
            // Map avatar
            let avatar = fbDoc.data().avatarConfig;
            if (avatar) {
                if (avatar.items) {
                    const mappedItems = {};
                    for (const [part, itemId] of Object.entries(avatar.items)) {
                        mappedItems[part] = toUuid(itemId);
                    }
                    avatar.items = mappedItems;
                }
                await supabase.from('users').update({ avatar_config: avatar }).eq('id', su.id);
            }
            console.log(`Migrated user: ${su.email}`);
        }
    }
}
run();
