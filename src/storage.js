import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = process.env.VERCEL ? path.join(os.tmpdir(), 'signalcraft-data') : path.join(root, 'data');
const storePath = path.join(dataDir, 'store.json');
const collectionNames = ['users', 'campaigns', 'recipients', 'audit', 'sessions'];
let cachedFirestore;

function normalizeStore(store = {}) {
  return Object.fromEntries(collectionNames.map(name => [name, Array.isArray(store[name]) ? store[name] : []]));
}

function firestore() {
  if (cachedFirestore) return cachedFirestore;
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawServiceAccount) {
    return null;
  }

  try {
    const serviceAccount = typeof rawServiceAccount === 'string' ? JSON.parse(rawServiceAccount) : rawServiceAccount;
    const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id || 'email-510117';
    const app = getApps().find(existing => existing.name === 'signalcraft') || initializeApp({
      credential: cert(serviceAccount),
      projectId
    }, 'signalcraft');
    cachedFirestore = getFirestore(app);
    return cachedFirestore;
  } catch (err) {
    console.error('Firestore initialization error:', err);
    return null;
  }
}

export async function readStore() {
  const db = firestore();
  if (db) {
    const snapshots = await Promise.all(collectionNames.map(name => db.collection(name).get()));
    return Object.fromEntries(collectionNames.map((name, index) => [
      name,
      snapshots[index].docs.map(document => document.data())
    ]));
  }

  try {
    return normalizeStore(JSON.parse(await fs.readFile(storePath, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.mkdir(dataDir, { recursive: true });
    const initialStore = normalizeStore();
    await writeStore(initialStore);
    return initialStore;
  }
}

export async function writeStore(store) {
  const normalized = normalizeStore(store);
  const db = firestore();
  if (db) {
    const entries = collectionNames.flatMap(name => normalized[name].map(document => [name, document]));
    for (let offset = 0; offset < entries.length; offset += 400) {
      const batch = db.batch();
      for (const [name, document] of entries.slice(offset, offset + 400)) {
        batch.set(db.collection(name).doc(document.id), document);
      }
      await batch.commit();
    }
    return;
  }

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(normalized, null, 2));
}