const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-key.json.json');

initializeApp({ credential: cert(serviceAccount) });
const fbDb = getFirestore();

async function run() {
    const snap = await fbDb.collection('user_items').get();
    console.log(`Firebase user_items: ${snap.size} rows`);
}
run();
