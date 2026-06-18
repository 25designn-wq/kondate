// オンボーディング：合言葉（夫婦共有）と「自分が誰か」を決める。
// 【この画面が全画面のテンプレート】render(params) で screen 要素を返す書き方に揃える。
import { h } from '../dom.js';
import { navigate } from '../router.js';
import { state, setMe, setHousehold, LABEL } from '../state.js';

export function render() {
  let who = state.me || 'husband';

  const word = h('input', {
    class: 'input', type: 'text', placeholder: '例：tanaka-dinner',
    value: state.householdId || '',
  });

  const seg = h('div', { class: 'seg' },
    ...['husband', 'wife'].map(k =>
      h('button', {
        class: who === k ? 'on' : '',
        onclick: e => {
          who = k;
          [...seg.children].forEach(b => b.classList.remove('on'));
          e.currentTarget.classList.add('on');
        },
      }, LABEL[k])
    )
  );

  const start = h('button', { class: 'btn primary', onclick: () => {
    const w = word.value.trim();
    if (!w) { word.focus(); word.style.borderColor = 'var(--ng)'; return; }
    setHousehold(w);
    setMe(who);
    // 初回はプロフィール設定へ。以降の編集は設定画面から。
    navigate('profile', { onboarding: true });
  }}, 'はじめる');

  return h('div', { class: 'screen' },
    h('div', { class: 'mt-32' }),
    h('div', { class: 'font-display', style: { fontSize: '40px', fontWeight: 800, letterSpacing: '-.03em' } }, 'こんだて'),
    h('p', { class: 'screen-sub' }, '夕飯をAIにおまかせ。夫婦ふたりで決める献立アプリ。'),

    h('div', { class: 'field mt-24' },
      h('label', {}, 'あいことば（夫婦で同じ言葉を入れてね）'),
      word,
      h('p', { class: 'muted', style: { fontSize: '12px', marginTop: '8px' } },
        '二人が同じ合言葉を入れると、同じ献立データを共有します。')
    ),
    h('div', { class: 'field' },
      h('label', {}, 'あなたは？'),
      seg
    ),
    h('div', { class: 'footer-action' }, start)
  );
}
