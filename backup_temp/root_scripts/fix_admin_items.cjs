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
    // 1. Get the admin's NEW UUID from Supabase users
    const { data: supaUsers } = await supabase.from('users').select('*').like('email', '%fabio.feitoza%');
    if (!supaUsers || supaUsers.length === 0) {
        console.log("Admin not found in Supabase users!");
        return;
    }
    const newAdminId = supaUsers[0].id;
    console.log("New Admin UUID:", newAdminId);

    // 2. Find the admin's OLD Firebase UUID
    const fbUsersSnap = await fbDb.collection('users').where('email', '>=', 'fabio.feitoza').get();
    let oldFirebaseId = null;
    let oldAvatarConfig = null;
    for (const doc of fbUsersSnap.docs) {
        if (doc.data().email && doc.data().email.includes('fabio.feitoza')) {
            oldFirebaseId = doc.id;
            oldAvatarConfig = doc.data().avatarConfig;
            break;
        }
    }
    
    if (!oldFirebaseId) {
        console.log("Admin not found in Firebase!");
        return;
    }
    
    const oldAdminUuid = toUuid(oldFirebaseId);
    console.log("Old Admin UUID:", oldAdminUuid);

    // 3. Update the admin's user_items to the NEW UUID!
    // Since migrate_missing didn't migrate the full data, let's re-migrate ONLY the admin's items!
    const fbItemsSnap = await fbDb.collection('user_items').where('studentId', '==', oldFirebaseId).get();
    console.log(`Found ${fbItemsSnap.size} items for admin in Firebase.`);
    
    for (const doc of fbItemsSnap.docs) {
        const data = doc.data();
        const row = {
            id: toUuid(doc.id),
            student_id: newAdminId, // Map to new UUID!
            item_id: toUuid(data.itemId),
            equipped: data.equipped || false,
            data: data
        };
        await supabase.from('user_items').upsert(row);
    }
    console.log("Migrated admin items!");

    // 4. Update the admin's avatar_config!
    if (oldAvatarConfig) {
        // Map item IDs to UUIDs in avatar config
        if (oldAvatarConfig.items) {
            const mappedItems = {};
            for (const [part, itemId] of Object.entries(oldAvatarConfig.items)) {
                mappedItems[part] = toUuid(itemId);
            }
            oldAvatarConfig.items = mappedItems;
        }
        await supabase.from('users').update({ avatar_config: oldAvatarConfig }).eq('id', newAdminId);
        console.log("Migrated admin avatar_config!");
    }
}
run();
