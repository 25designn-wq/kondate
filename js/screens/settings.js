// 設定画面。端末の設定（自分・APIキー・あいことば）とプロフィール・なぎ設定へのナビを束ねる。
import { h, topbar } from '../dom.js';
import { navigate } from '../router.js';
import { state, LABEL, setMe, setGeminiKey, setHousehold, resetIdentity } from '../state.js';

export function render() {
  const root = h('div', { class: 'screen' });
  root.append(topbar('設定', () => navigate('home')));

  // ---- a) 自分（夫/妻の切替） ----
  let currentMe = state.me || 'husband';
  const segButtons = ['husband', 'wife'].map(k =>
    h('button', {
      class: currentMe === k ? 'on' : '',
      onclick: e => {
        currentMe = k;
        setMe(k);
        [...seg.children].forEach(b => b.classList.remove('on'));
        e.currentTarget.classList.add('on');
      },
    }, LABEL[k])
  );
  const seg = h('div', { class: 'seg' }, ...segButtons);

  root.append(
    h('div', { class: 'card', style: { marginBottom: '16px' } },
      h('div', { class: 'field', style: { marginBottom: '10px' } },
        h('label', {}, 'この端末はどちら？'),
        seg,
        h('p', { class: 'muted', style: { fontSize: '12px', marginTop: '8px' } }, 'この端末をどちらとして使うか')
      )
    )
  );

  // ---- b) プロフィール編集 ----
  root.append(
    h('div', { class: 'card', style: { marginBottom: '16px' } },
      h('label', { style: { display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '10px' } }, 'プロフィール'),
      h('button', { class: 'btn', onclick: () => navigate('profile') }, 'プロフィールを編集')
    )
  );

  // ---- c) なぎの設定 ----
  root.append(
    h('div', { class: 'card', style: { marginBottom: '16px' } },
      h('label', { style: { display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '10px' } }, 'なぎの設定'),
      h('button', { class: 'btn', onclick: () => navigate('nagi') }, 'なぎの食べられないものを編集')
    )
  );

  // ---- d) Gemini APIキー ----
  const keyInput = h('input', {
    class: 'input', type: 'password',
    placeholder: 'AIza...',
    value: state.geminiKey || '',
  });
  const keySaved = h('p', { class: 'muted', style: { fontSize: '12px', marginTop: '8px', display: 'none' } }, '保存しました');
  const keyBtn = h('button', {
    class: 'btn', style: { marginTop: '10px' },
    onclick: () => {
      // 空文字は null（未設定）として扱い、setGeminiKey の挙動と一致させる
      const v = keyInput.value.trim() || null;
      setGeminiKey(v);
      keySaved.style.display = '';
      setTimeout(() => { keySaved.style.display = 'none'; }, 2000);
    },
  }, '保存');

  root.append(
    h('div', { class: 'card', style: { marginBottom: '16px' } },
      h('div', { class: 'field', style: { marginBottom: '0' } },
        h('label', {}, 'Gemini APIキー'),
        keyInput,
        keyBtn,
        keySaved,
        h('p', { class: 'muted', style: { fontSize: '12px', marginTop: '10px' } },
          'AIに献立を作ってもらうのに必要。このキーはこの端末にのみ保存され、外部サーバーには送信されません。'
        ),
        h('a', {
          href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener',
          style: { color: 'var(--accent)', fontSize: '13px', display: 'inline-block', marginTop: '6px' },
        }, 'APIキーを取得（Google AI Studio）')
      )
    )
  );

  // ---- e) あいことば ----
  const hhInput = h('input', {
    class: 'input', type: 'text',
    placeholder: '例：tanaka-dinner',
    value: state.householdId || '',
    style: { marginTop: '8px' },
  });
  const hhBtn = h('button', {
    class: 'btn', style: { marginTop: '10px' },
    onclick: () => {
      const v = hhInput.value.trim();
      if (!v) { hhInput.focus(); hhInput.style.borderColor = 'var(--ng)'; return; }
      hhInput.style.borderColor = '';
      setHousehold(v);
      location.reload();
    },
  }, '変更');

  root.append(
    h('div', { class: 'card', style: { marginBottom: '16px' } },
      h('div', { class: 'field', style: { marginBottom: '0' } },
        h('label', {}, 'あいことば'),
        h('p', { class: 'muted', style: { fontSize: '13px', marginBottom: '4px' } },
          `現在: ${state.householdId || '（未設定）'}`
        ),
        hhInput,
        hhBtn,
        h('p', { class: 'muted', style: { fontSize: '12px', marginTop: '8px' } }, '変更すると別の献立データに切り替わります')
      )
    )
  );

  // ---- f) リセット ----
  root.append(
    h('div', { class: 'card', style: { marginBottom: '16px' } },
      h('button', {
        class: 'btn ghost', style: { color: 'var(--ng)' },
        onclick: () => {
          if (confirm('設定をリセットしますか？')) {
            resetIdentity();
            setGeminiKey(null);
            location.reload();
          }
        },
      }, 'この端末の設定をリセット')
    )
  );

  return root;
}
