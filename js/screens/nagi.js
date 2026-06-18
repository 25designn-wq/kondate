// なぎの食べられないもの設定画面。夫婦共有データ。
// オンボーディング時はSTEP 2/2 表示、通常時はtopbar付き。
import { h, tagInput, topbar } from '../dom.js';
import { navigate } from '../router.js';
import * as fb from '../firebase.js';

export function render({ onboarding } = {}) {
  const root = h('div', { class: 'screen' });
  runLoad(root, onboarding);
  return root;
}

async function runLoad(root, onboarding) {
  // 読み込み中プレースホルダ
  root.append(h('p', { class: 'muted' }, '読み込み中…'));

  let banned = [];
  try {
    const nagi = await fb.getNagi();
    banned = (nagi || {}).banned || [];
  } catch (_) {
    // 取得失敗時は空のまま進む
  }

  // 取得後に中身を差し込む
  root.innerHTML = '';

  // オンボーディング時はSTEP表示、通常時はtopbar
  if (onboarding) {
    root.append(
      h('p', { class: 'muted', style: { fontSize: '13px', marginBottom: '8px' } }, 'STEP 2 / 2')
    );
  } else {
    root.append(topbar('なぎの設定', () => navigate('settings')));
  }

  root.append(
    h('div', { class: 'screen-title' }, 'なぎの食べられないもの'),
    h('p', { class: 'screen-sub' }, 'アレルギー・苦手なものを登録（夫婦で共有）')
  );

  // 食材タグ入力
  const bannedEl = tagInput(banned, '例：トマト');
  root.append(
    h('div', { class: 'field' },
      bannedEl,
      h('p', { class: 'muted', style: { fontSize: '12px', marginTop: '10px' } },
        'ここに入れた食材が使われる日は、会議カードで「なぎはどうする？」のメモが出ます。'
      )
    )
  );

  // フッターボタン
  const btnLabel = onboarding ? 'はじめる' : '保存';
  const saveBtn = h('button', {
    class: 'btn primary',
    onclick: async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
      try {
        await fb.setNagi({ banned: bannedEl.getValue() });
        if (onboarding) {
          navigate('home');
        } else {
          navigate('settings');
        }
      } catch (_) {
        saveBtn.disabled = false;
        saveBtn.textContent = btnLabel;
      }
    },
  }, btnLabel);

  root.append(h('div', { class: 'footer-action' }, saveBtn));
}
