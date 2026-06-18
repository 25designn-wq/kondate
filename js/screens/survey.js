// アンケート画面：今週の気分・食べたいもの・避けたいものを入力して送信する。
import { h, topbar } from '../dom.js';
import { navigate } from '../router.js';
import { state, LABEL, currentWeekId } from '../state.js';
import * as fb from '../firebase.js';

export function render() {
  const weekId = currentWeekId();

  const root = h('div', { class: 'screen' });
  root.append(
    topbar('今週のアンケート', () => navigate('home')),
    h('p', { class: 'screen-sub', style: { marginBottom: '4px' } },
      `あなた（${LABEL[state.me]}）の今週の気分を教えて`),
    h('p', { class: 'muted', style: { fontSize: '12px', marginBottom: '24px' } }, '読み込み中…')
  );

  // 非同期でデータ取得後に中身を差し込む
  (async () => {
    const survey = await fb.getSurvey(weekId);
    // getSurvey は {} を fallback で返すが、念のため null/undefined も吸収する
    const existing = ((survey || {})[state.me]) || {};

    // サブテキスト部分を更新
    const sub = root.querySelector('.muted');
    if (sub) sub.remove();

    // フォームフィールドを構築
    const moodInput = h('textarea', {
      class: 'textarea',
      placeholder: '例：仕事が忙しい週。さっぱり＆時短で。週末は少し凝ってもOK',
      style: { minHeight: '100px' },
    });
    moodInput.value = existing.mood || '';

    const wantInput = h('input', {
      class: 'input',
      type: 'text',
      placeholder: '例：鍋、魚',
    });
    wantInput.value = existing.want || '';

    const avoidInput = h('input', {
      class: 'input',
      type: 'text',
      placeholder: '例：揚げ物',
    });
    avoidInput.value = existing.avoid || '';

    const fixedInput = h('textarea', {
      class: 'textarea',
      placeholder: '例：月曜はカレー、木曜は外食',
      style: { minHeight: '64px' },
    });
    fixedInput.value = existing.fixed || '';

    // エラー表示用要素
    const errMsg = h('p', {
      style: { color: 'var(--ng)', fontSize: '13px', marginTop: '6px', display: 'none' },
    }, '「今週はこんな気分」は必須です');

    const btnLabel = existing.done ? 'アンケートを更新する' : 'アンケートを出す';
    const submitBtn = h('button', {
      class: 'btn primary',
      onclick: async () => {
        const mood = moodInput.value.trim();
        if (!mood) {
          // エラー表示
          moodInput.style.borderColor = 'var(--ng)';
          errMsg.style.display = 'block';
          moodInput.focus();
          return;
        }
        // エラーをリセット
        moodInput.style.borderColor = '';
        errMsg.style.display = 'none';

        submitBtn.disabled = true;
        submitBtn.textContent = '送信中…';
        try {
          await fb.setSurvey(weekId, state.me, {
            mood,
            want: wantInput.value.trim(),
            avoid: avoidInput.value.trim(),
            fixed: fixedInput.value.trim(),
          });
          navigate('home');
        } catch (e) {
          submitBtn.disabled = false;
          submitBtn.textContent = btnLabel;
          alert('送信に失敗しました。もう一度お試しください。');
        }
      },
    }, btnLabel);

    // mood フィールドの変更でエラーをリセット
    moodInput.addEventListener('input', () => {
      if (moodInput.value.trim()) {
        moodInput.style.borderColor = '';
        errMsg.style.display = 'none';
      }
    });

    root.append(
      h('div', { class: 'field' },
        h('label', {}, '今週はこんな気分（必須）'),
        moodInput,
        errMsg
      ),
      h('div', { class: 'field' },
        h('label', {}, '食べたいもの（任意）'),
        wantInput
      ),
      h('div', { class: 'field' },
        h('label', {}, '避けたいもの（任意）'),
        avoidInput
      ),
      h('div', { class: 'field' },
        h('label', {}, '今週すでに決まっているメニュー（任意）'),
        fixedInput,
        h('p', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } }, 'AIがその曜日に自動で組み込みます')
      ),
      h('div', { class: 'footer-action' }, submitBtn)
    );
  })();

  return root;
}
