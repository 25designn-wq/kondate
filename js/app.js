// エントリポイント。起動時の状態から最初の画面を決める。
import { state } from './state.js';
import { navigate } from './router.js';

function start() {
  // 合言葉と「自分が誰か」が未設定なら、まずはユーザー選択（オンボーディング）へ
  if (!state.householdId || !state.me) {
    navigate('userselect');
  } else {
    navigate('home');
  }
}

start();
