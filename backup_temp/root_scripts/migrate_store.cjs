const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createClient } = require('@supabase/supabase-js');

const serviceAccount = require('./firebase-key.json.json');
initializeApp({ 
    credential: cert(serviceAccount)
});
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

async function run() {
    const snap = await fbDb.collection('store_items').get();
    let count = 0;
    for (let doc of snap.docs) {
        let fbData = doc.data();
        fbData = replaceFirebaseUrls(fbData);
        
        const row = {
            id: doc.id,
            name: fbData.name || '',
            description: fbData.description || '',
            type: fbData.type || '',
            avatar_part: fbData.avatarPart || '',
            price: fbData.cost || fbData.price || 0,
            image_url: fbData.imageUrl || '',
            active: fbData.active !== undefined ? fbData.active : true,
            rarity: fbData.rarity || 'common',
            data: fbData
        };
        
        const { error } = await supabase.from('store_items').upsert(row);
        if (error) {
            console.error(`Error inserting ${doc.id}:`, error.message);
        } else {
            count++;
        }
    }
    console.log(`Successfully inserted ${count} store items.`);
}

run();
