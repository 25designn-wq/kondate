// アプリ全体の状態。端末ローカルの情報は localStorage に保持する。
// （夫婦の共有データは firebase.js 側で Firestore に保存する）
const K = { me: 'kondate_me', hh: 'kondate_household', key: 'kondate_gemini_key' };

export const LABEL = { husband: '夫', wife: '妻' };

export const state = {
  me:          localStorage.getItem(K.me)  || null,   // 'husband' | 'wife'
  householdId: localStorage.getItem(K.hh)  || null,   // 夫婦で共有する合言葉
  geminiKey:   localStorage.getItem(K.key) || null,   // Gemini APIキー（この端末のみ）
};

export function setMe(v)        { state.me = v; localStorage.setItem(K.me, v); }
export function setHousehold(v) { state.householdId = v; localStorage.setItem(K.hh, v); }
export function setGeminiKey(v) {
  state.geminiKey = v || null;
  v ? localStorage.setItem(K.key, v) : localStorage.removeItem(K.key);
}
export function resetIdentity() {
  state.me = state.householdId = null;
  localStorage.removeItem(K.me); localStorage.removeItem(K.hh);
}

export const partner = () => (state.me === 'husband' ? 'wife' : 'husband');

// 週ID：月曜始まりの ISO 週番号（例 "2026-W25"）。夫婦で必ず同じ値になる。
export function currentWeekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;               // 月=1 … 日=7
  d.setUTCDate(d.getUTCDate() + 4 - day);        // その週の木曜へ
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// 月曜始まりの曜日ラベル
export const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

export function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
