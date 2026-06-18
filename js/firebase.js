// Firestore 接続とデータアクセス。各画面はこのモジュール経由で読み書きする。
//
// データ構造（households/{合言葉} の下）：
//   meta/profiles  → { husband:{...}, wife:{...} }
//   meta/nagi      → { banned:[...] }                       なぎの食べられないもの
//   meta/learning  → { rejected:[], accepted:[], changes:[] } 学習DB
//   surveys/{週ID} → { husband:{mood,want,avoid,done}, wife:{...} }
//   menus/{週ID}   → { days:[...], status, confirmedAt }
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, isFirebaseConfigured } from './config.js';
import { state } from './state.js';

let db = null;
function getDb() {
  if (db) return db;
  if (!isFirebaseConfigured()) { console.warn('[firebase] 未設定です（config.js を埋めてください）'); return null; }
  db = getFirestore(initializeApp(firebaseConfig));
  return db;
}

const base = () => `households/${state.householdId}`;

async function read(path, fallback = {}) {
  const d = getDb(); if (!d) return fallback;
  try {
    // 8秒で諦める（DB未作成・オフライン・ルール反映前でもUIを止めない）
    const snap = await Promise.race([
      getDoc(doc(d, path)),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    return snap.exists() ? snap.data() : fallback;
  } catch (e) {
    console.warn('[firebase] 読み込み失敗:', path, e.message);
    return fallback;
  }
}
async function write(path, data) {
  const d = getDb(); if (!d) return;
  await setDoc(doc(d, path), data, { merge: true });
}

// --- プロフィール（個人別） ---
export const getProfiles = ()          => read(`${base()}/meta/profiles`);
export const setProfile  = (who, data) => write(`${base()}/meta/profiles`, { [who]: data });

// --- なぎ（共通） ---
export const getNagi = () => read(`${base()}/meta/nagi`, { banned: [] });
export const setNagi = (data) => write(`${base()}/meta/nagi`, data);

// --- 学習DB ---
export const getLearning = () => read(`${base()}/meta/learning`, { rejected: [], accepted: [], changes: [] });
export const setLearning = (data) => write(`${base()}/meta/learning`, data);

// --- 週次アンケート ---
export const getSurvey = (weekId)            => read(`${base()}/surveys/${weekId}`, {});
export const setSurvey = (weekId, who, data) => write(`${base()}/surveys/${weekId}`, { [who]: { ...data, done: true } });

// --- 確定献立 ---
export const getMenu = (weekId)       => read(`${base()}/menus/${weekId}`, null);
export const setMenu = (weekId, data) => write(`${base()}/menus/${weekId}`, data);

// リアルタイム購読（ホーム画面で相手の入力状況を見るのに使う）
export function watchDoc(path, cb) {
  const d = getDb(); if (!d) { cb(null); return () => {}; }
  return onSnapshot(doc(d, path), s => cb(s.exists() ? s.data() : null));
}

export { base, isFirebaseConfigured };
