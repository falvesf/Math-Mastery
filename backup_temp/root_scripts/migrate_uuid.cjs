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

function replaceFirebaseUrls(obj) {
    if (!obj) return obj;
    if (typeof obj === 'string') {
        const fbPrefix = 'https://firebasestorage.googleapis.com/v0/b/math-mastery-db.firebasestorage.app/o/';
        if (obj.includes(fbPrefix)) {
            const afterO = obj.split(fbPrefix)[1];
            if (afterO) {
                const filePathEncoded = afterO.split('?')[0];
                const filePath = decodeURIComponent(filePathEncoded);
                return `${SUPABASE_URL}/storage/v1/object/public/uploads/${filePath}`;
            }
        }
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => replaceFirebaseUrls(item));
    }
    if (typeof obj === 'object') {
        const newObj = {};
        for (const [k, v] of Object.entries(obj)) {
            newObj[k] = replaceFirebaseUrls(v);
        }
        return newObj;
    }
    return obj;
}

// Global user mapping from Firebase UID -> Supabase UUID
const userMapping = {};

async function run() {
    console.log("Loading users map...");
    const { data: supaUsers } = await supabase.from('users').select('id, xp');
    // How to map? Firebase ID is lost?
    // Wait, users were migrated with `toUuid(firebaseUid)`.
    
    console.log("Migrating store_items...");
    const storeSnap = await fbDb.collection('store_items').get();
    for (let doc of storeSnap.docs) {
        let data = doc.data();
        data = replaceFirebaseUrls(data);
        const newId = toUuid(doc.id);
        
        const row = {
            id: newId,
            name: data.name || '',
            description: data.description || '',
            type: data.type || '',
            avatar_part: data.avatarPart || '',
            price: data.cost || data.price || 0,
            image_url: data.imageUrl || '',
            active: data.active !== undefined ? data.active : true,
            rarity: data.rarity || 'common',
            data: { ...data, id: newId } // store the new ID in data as well
        };
        await supabase.from('store_items').upsert(row);
    }
    console.log("store_items done.");

    console.log("Migrating quests...");
    const questsSnap = await fbDb.collection('quests').get();
    for (let doc of questsSnap.docs) {
        let data = doc.data();
        data = replaceFirebaseUrls(data);
        const newId = toUuid(doc.id);
        const row = {
            id: newId,
            title: data.title || '',
            description: data.description || '',
            type: data.type || 'solo',
            difficulty: data.difficulty || 'normal',
            time_limit: data.timeLimit || 0,
            xp_reward: data.xpReward || 0,
            coin_reward: data.coinReward || 0,
            min_level: data.minLevel || 1,
            required_class: data.requiredClass || null,
            image_url: data.imageUrl || '',
            active: data.active !== undefined ? data.active : true,
            questions: data.questions || []
        };
        await supabase.from('quests').upsert(row);
    }
    console.log("quests done.");

    console.log("Migrating user_items...");
    const userItemsSnap = await fbDb.collection('user_items').get();
    for (let doc of userItemsSnap.docs) {
        let data = doc.data();
        const newId = toUuid(doc.id);
        const newItemId = toUuid(data.itemId);
        const newStudentId = toUuid(data.studentId);
        const row = {
            id: newId,
            student_id: newStudentId,
            item_id: newItemId,
            acquired_at: data.acquiredAt ? new Date(data.acquiredAt.seconds * 1000).toISOString() : new Date().toISOString()
        };
        await supabase.from('user_items').upsert(row);
    }
    console.log("user_items done.");

    console.log("Migrating quest_attempts...");
    const questAttSnap = await fbDb.collection('quest_attempts').get();
    for (let doc of questAttSnap.docs) {
        let data = doc.data();
        const newId = toUuid(doc.id);
        const newQuestId = toUuid(data.questId);
        const newStudentId = toUuid(data.studentId);
        const row = {
            id: newId,
            student_id: newStudentId,
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
    console.log("quest_attempts done.");

    console.log("Updating users avatar_config...");
    // Fix avatar_config item IDs in users table
    const usersSnap = await fbDb.collection('users').get();
    for (let doc of usersSnap.docs) {
        let data = doc.data();
        const newUserId = toUuid(doc.id);
        if (data.avatarConfig && data.avatarConfig.items) {
            const mappedItems = {};
            for (const [part, itemId] of Object.entries(data.avatarConfig.items)) {
                mappedItems[part] = toUuid(itemId);
            }
            data.avatarConfig.items = mappedItems;
            
            // Also map avatar config strings recursively just in case
            data.avatarConfig = replaceFirebaseUrls(data.avatarConfig);
            
            await supabase.from('users').update({ avatar_config: data.avatarConfig }).eq('id', newUserId);
        }
    }
    console.log("users avatar_config done.");

    console.log("ALL DONE!");
}

run();
