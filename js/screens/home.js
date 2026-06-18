// ホーム画面：アンケート状況と献立確定状況を示すハブ。リアルタイム更新対応。
import { h } from '../dom.js';
import { navigate } from '../router.js';
import { state, LABEL, currentWeekId, partner } from '../state.js';
import * as fb from '../firebase.js';

export function render() {
  const weekId = currentWeekId();

  // ページ全体のルート
  const root = h('div', { class: 'screen' });

  // ヘッダー（歯車ボタン付き）
  const header = h('div', { class: 'row', style: { marginBottom: '24px' } },
    h('div', {},
      h('div', { class: 'font-display', style: { fontSize: '22px', fontWeight: 900 } },
        `こんにちは、${LABEL[state.me]}さん`),
      h('p', { class: 'muted', style: { fontSize: '13px', marginTop: '2px' } }, '今週の献立')
    ),
    h('button', {
      style: {
        width: '40px', height: '40px', borderRadius: '50%',
        border: '1px solid var(--line)', background: 'var(--surface)',
        fontSize: '18px', cursor: 'pointer', display: 'grid', placeItems: 'center',
        flexShrink: '0',
      },
      onclick: () => navigate('settings'),
    }, '⚙️')
  );

  // アクション領域（paint で差し替える）
  const actionArea = h('div', {});

  root.append(header, actionArea);

  // 現在の状態を変数で保持（watchDoc コールバックで更新）
  let currentSurvey = {};
  let currentMenu = null;

  // 状態に応じてアクション領域を描画する
  function paint(survey, menu) {
    currentSurvey = survey || {};
    currentMenu = menu;

    actionArea.innerHTML = '';

    const me = state.me;

    // 状態1: 献立が確定済み
    if (menu && menu.days && menu.days.length > 0) {
      actionArea.append(
        h('div', { class: 'card', style: { marginBottom: '16px', textAlign: 'center' } },
          h('div', { style: { fontSize: '32px', marginBottom: '8px' } }, '🎉'),
          h('p', { style: { fontWeight: 700, fontSize: '16px' } }, '今週の献立は決定済み'),
          h('p', { class: 'muted', style: { fontSize: '13px', marginTop: '4px' } }, '献立画面で確認できます')
        ),
        h('div', { class: 'footer-action', style: { display: 'grid', gap: '10px' } },
          h('button', { class: 'btn primary', onclick: () => navigate('menu') }, '今週の献立を見る'),
          h('button', { class: 'btn ghost', onclick: () => navigate('meeting') }, 'もう一度 会議する')
        )
      );
      return;
    }

    // 状態2: 二人とも入力済み → 会議へ
    if (currentSurvey.husband?.done && currentSurvey.wife?.done) {
      actionArea.append(
        h('div', { class: 'card', style: { marginBottom: '16px', textAlign: 'center' } },
          h('div', { style: { fontSize: '32px', marginBottom: '8px' } }, '✅'),
          h('p', { style: { fontWeight: 700, fontSize: '16px' } }, '二人の入力が揃いました！'),
          h('p', { class: 'muted', style: { fontSize: '13px', marginTop: '4px' } }, 'AIが献立を提案します')
        ),
        h('div', { class: 'footer-action', style: { display: 'grid', gap: '10px' } },
          h('button', { class: 'btn primary', onclick: () => navigate('meeting') }, '🥁 会議を始める'),
          h('button', { class: 'btn ghost', onclick: () => navigate('survey') }, '自分のアンケートを直す')
        )
      );
      return;
    }

    // 状態3: 入力状況を表示
    const rows = ['husband', 'wife'].map(who => {
      const done = currentSurvey[who]?.done;
      const isMe = who === me;
      return h('div', {
        class: 'row',
        style: {
          padding: '14px 16px',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--line)',
          marginBottom: '10px',
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          h('span', { style: { fontSize: '14px', fontWeight: 700 } }, LABEL[who]),
          isMe && h('span', {
            style: {
              fontSize: '11px', padding: '2px 8px', borderRadius: '99px',
              background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700,
            },
          }, 'あなた')
        ),
        h('span', {
          style: { fontSize: '14px', fontWeight: 700, color: done ? 'var(--ok)' : 'var(--muted)' },
        }, done ? '✓ 入力済み' : '… 未入力')
      );
    });

    actionArea.append(...rows);

    // 自分が未入力: 入力を促す
    if (!currentSurvey[me]?.done) {
      actionArea.append(
        h('div', { class: 'footer-action' },
          h('button', { class: 'btn primary', onclick: () => navigate('survey') }, 'アンケートを入力する')
        )
      );
      return;
    }

    // 自分は入力済み、相手が未入力
    actionArea.append(
      h('div', { class: 'footer-action', style: { display: 'grid', gap: '10px' } },
        h('button', { class: 'btn primary', disabled: true }, 'パートナーの入力待ち…'),
        h('button', { class: 'btn ghost', onclick: () => navigate('survey') }, '自分のアンケートを直す')
      )
    );
  }

  // 初回描画: まず読み込み中を表示
  actionArea.append(h('p', { class: 'muted' }, '読み込み中…'));

  // 非同期でデータ取得 → paint → watchDoc でリアルタイム更新
  (async () => {
    try {
      const [survey, menu] = await Promise.all([
        fb.getSurvey(weekId),
        fb.getMenu(weekId),
      ]);
      paint(survey, menu);

      // リアルタイム更新: 相手の入力や献立確定を即反映
      // watchDoc は unsubscribe 関数を返すため、画面破棄時に解除してリーク防止
      const unsubSurvey = fb.watchDoc(`${fb.base()}/surveys/${weekId}`, s => {
        paint(s || {}, currentMenu);
      });
      const unsubMenu = fb.watchDoc(`${fb.base()}/menus/${weekId}`, m => {
        paint(currentSurvey, m);
      });

      // root が DOM から切り離されたら購読を解除する
      const observer = new MutationObserver(() => {
        if (!document.contains(root)) {
          if (typeof unsubSurvey === 'function') unsubSurvey();
          if (typeof unsubMenu === 'function') unsubMenu();
          observer.disconnect();
        }
      });
      observer.observe(document.getElementById('app') || document.body, { childList: true });
    } catch (e) {
      // Firebase 未設定時は初回取得で {} / null が返るのでエラーになりにくいが念のため
      paint({}, null);
    }
  })();

  return root;
}
