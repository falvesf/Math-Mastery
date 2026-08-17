const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const serviceAccount = require('./firebase-key.json.json');

initializeApp({ 
    credential: cert(serviceAccount),
    storageBucket: 'math-mastery-db.firebasestorage.app' // Or maybe math-mastery-db.appspot.com
});
const db = getFirestore();

async function run() {
    try {
        console.log("=== FIREBASE COLLECTIONS ===");
        const collections = await db.listCollections();
        for (let collection of collections) {
            console.log(collection.id);
        }

        console.log("\n=== FIREBASE STORAGE ===");
        try {
            const bucket = getStorage().bucket('math-mastery-db.appspot.com');
            const [files] = await bucket.getFiles({ maxResults: 5 });
            console.log(`Found ${files.length} files in appspot.com bucket.`);
            if (files.length > 0) console.log(files[0].name);
        } catch (e) {
            console.error("Storage error:", e.message);
        }
    } catch (e) {
        console.error(e);
    }
}

run();
