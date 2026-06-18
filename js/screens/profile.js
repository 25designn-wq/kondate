// 個人プロフィール設定画面。オンボーディング時は STEP 1/2 表示、通常時はtopbar付き。
import { h, chipGroup, tagInput, topbar } from '../dom.js';
import { navigate } from '../router.js';
import { state, LABEL } from '../state.js';
import * as fb from '../firebase.js';

// 好きなジャンル選択肢
const GENRES = ['和食', '洋食', '中華', 'イタリアン', 'エスニック', '韓国料理', '麺類', '丼もの', '鍋もの', 'あっさり系', 'がっつり系'];
// 使える調理器具選択肢
const TOOLS = ['電子レンジ', 'オーブン', 'トースター', '圧力鍋', 'ホットプレート', '魚焼きグリル', '炊飯器', 'フライパンのみ'];
// 食事の目標選択肢
const GOALS = ['特になし', 'ダイエット中', 'たくさん食べたい', '健康重視', '節約したい'];

export function render({ onboarding } = {}) {
  const root = h('div', { class: 'screen' });
  runLoad(root, onboarding);
  return root;
}

async function runLoad(root, onboarding) {
  // 読み込み中プレースホルダ
  root.append(h('p', { class: 'muted' }, '読み込み中…'));

  // state.me が未設定の場合は続行不可
  if (!state.me) {
    root.innerHTML = '';
    root.append(h('p', { class: 'muted' }, '先にあいことばと「自分が誰か」を設定してください。'));
    return;
  }

  let p = {};
  try {
    const profiles = await fb.getProfiles();
    p = profiles[state.me] || {};
  } catch (_) {
    // 取得失敗時は空のまま進む
  }

  // 取得後に中身を差し込む
  root.innerHTML = '';

  // オンボーディング時はSTEP表示、通常時はtopbar
  if (onboarding) {
    root.append(
      h('p', { class: 'muted', style: { fontSize: '13px', marginBottom: '8px' } }, 'STEP 1 / 2')
    );
  } else {
    root.append(topbar('プロフィール', () => navigate('settings')));
  }

  root.append(
    h('div', { class: 'screen-title' }, 'あなたの好み'),
    h('p', { class: 'screen-sub' }, `${LABEL[state.me]}の設定`)
  );

  // 好きなジャンル
  const genresEl = chipGroup(GENRES, p.genres || []);
  root.append(
    h('div', { class: 'field' },
      h('label', {}, '好きなジャンル'),
      genresEl
    )
  );

  // 嫌い・苦手な食材
  const dislikesEl = tagInput(p.dislikes || [], '例：パクチー');
  root.append(
    h('div', { class: 'field' },
      h('label', {}, '嫌い・苦手な食材'),
      dislikesEl
    )
  );

  // 食事の目標
  const goalSelect = h('select', { class: 'input' },
    ...GOALS.map(g => {
      const opt = h('option', { value: g }, g);
      if (g === (p.goal || '特になし')) opt.selected = true;
      return opt;
    })
  );
  root.append(
    h('div', { class: 'field' },
      h('label', {}, '食事の目標'),
      goalSelect
    )
  );

  // 使える調理器具
  const toolsEl = chipGroup(TOOLS, p.tools || []);
  root.append(
    h('div', { class: 'field' },
      h('label', {}, '使える調理器具'),
      toolsEl
    )
  );

  // フッターボタン
  const btnLabel = onboarding ? '次へ（なぎの設定）' : '保存';
  const saveBtn = h('button', {
    class: 'btn primary',
    onclick: async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
      try {
        await fb.setProfile(state.me, {
          genres:   genresEl.getValue(),
          dislikes: dislikesEl.getValue(),
          goal:     goalSelect.value,
          tools:    toolsEl.getValue(),
        });
        if (onboarding) {
          navigate('nagi', { onboarding: true });
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
