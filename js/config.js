// Firebase の公開設定。Firebase Console で作成したプロジェクトの値に置き換える。
// ※ これらは公開してよい値（Firestore のセキュリティルールで保護する前提）。
//    Gemini APIキーはここには書かない（設定画面で各端末に保存する）。
export const firebaseConfig = {
  apiKey:            "AIzaSyAfyhQv-x27U2t25gjqlOPVMpQ8UFK2Tz0",
  authDomain:        "kondate-ffc8a.firebaseapp.com",
  projectId:         "kondate-ffc8a",
  storageBucket:     "kondate-ffc8a.firebasestorage.app",
  messagingSenderId: "354433767297",
  appId:             "1:354433767297:web:f178c2b6386abb3a18fa80",
};

export const isFirebaseConfigured = () => firebaseConfig.apiKey !== "PLACEHOLDER";
