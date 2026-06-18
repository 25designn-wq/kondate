// 献立一覧画面：確定済みの今週の献立を曜日ごとに表示。なぎメモのインライン編集も可能。
import { h, topbar } from '../dom.js';
import { navigate } from '../router.js';
import { state, LABEL, currentWeekId } from '../state.js';
import * as fb from '../firebase.js';
import { generateRecipe } from '../gemini.js';

export function render() {
  const weekId = currentWeekId();

  const root = h('div', { class: 'screen' });
  const loading = h('p', { class: 'muted' }, '読み込み中…');
  root.append(
    topbar('今週の献立', () => navigate('home')),
    loading
  );

  (async () => {
    const menu = await fb.getMenu(weekId);

    // 読み込み中表示を除去（topbar は再生成しない）
    loading.remove();

    // 献立なし
    if (!menu || !menu.days || menu.days.length === 0) {
      root.append(
        h('div', { class: 'card', style: { textAlign: 'center', padding: '32px 20px', marginBottom: '16px' } },
          h('div', { style: { fontSize: '40px', marginBottom: '12px' } }, '📋'),
          h('p', { style: { fontWeight: 700, fontSize: '16px', marginBottom: '6px' } }, 'まだ今週の献立はありません'),
          h('p', { class: 'muted', style: { fontSize: '13px' } }, 'AIと会議して今週の献立を決めましょう')
        ),
        h('div', { class: 'footer-action', style: { display: 'grid', gap: '10px' } },
          h('button', { class: 'btn primary', onclick: () => navigate('meeting') }, '会議を始める'),
          h('button', { class: 'btn ghost', onclick: () => navigate('home') }, 'ホームへ')
        )
      );
      return;
    }

    // 確定者の表示
    if (menu.confirmedBy) {
      root.append(
        h('p', {
          class: 'muted',
          style: { fontSize: '12px', marginBottom: '16px', textAlign: 'right' },
        }, `（${LABEL[menu.confirmedBy]}が確定）`)
      );
    }

    // days 配列をコピーして保持（インライン編集で更新する）
    const days = menu.days.map(d => ({ ...d }));

    // 各日のカードを描画する関数（再描画のために関数化）
    function buildDayCards() {
      // 既存カードをすべて除去してから再描画
      [...root.querySelectorAll('.day-card')].forEach(el => el.remove());
      // フッターも除去
      const footer = root.querySelector('.footer-action');
      if (footer) footer.remove();

      days.forEach((day, idx) => {
        const card = buildDayCard(day, idx);
        root.append(card);
      });

      root.append(
        h('div', { class: 'footer-action' },
          h('button', { class: 'btn ghost', onclick: () => navigate('meeting') }, '献立を作り直す（会議）')
        )
      );
    }

    // 1日分のカードを構築する関数
    function buildDayCard(day, idx) {
      const card = h('div', { class: 'card day-card', style: { marginBottom: '14px' } });

      // 表示モード
      function renderView() {
        card.innerHTML = '';

        // ヘッダ行: 曜日バッジ + 料理名 + 編集ボタン
        const nameRow = h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '10px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flex: '1' } },
            h('span', {
              style: {
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'var(--accent)', color: '#fff',
                fontSize: '14px', fontWeight: 900, flexShrink: '0',
              },
            }, day.weekday),
            h('span', { style: { fontSize: '20px', fontWeight: 800, lineHeight: 1.3 } }, day.name)
          ),
          h('button', {
            style: {
              fontSize: '13px', padding: '5px 10px', borderRadius: '8px',
              border: '1px solid var(--line)', background: 'var(--surface)',
              cursor: 'pointer', flexShrink: '0', color: 'var(--muted)',
            },
            onclick: () => renderEdit(),
          }, '✏️編集')
        );
        card.append(nameRow);

        // 理由
        if (day.reason) {
          card.append(h('p', { class: 'muted', style: { fontSize: '13px', marginTop: '8px', lineHeight: 1.6 } }, day.reason));
        }

        // 旬ピル
        if (day.seasonal) {
          card.append(h('div', { class: 'mc-seasonal', style: { marginTop: '10px' } }, '🍂 ' + day.seasonal));
        }

        // なぎメモ
        if (day.kidsNote) {
          card.append(
            h('div', { class: 'mc-kids', style: { marginTop: '10px' } },
              h('span', { style: { fontWeight: 700, marginRight: '6px' } }, '👶 なぎ：'),
              day.kidsNote
            )
          );
        } else {
          card.append(
            h('p', {
              class: 'muted',
              style: { fontSize: '12px', marginTop: '10px' },
            }, 'なぎメモなし')
          );
        }

        // 材料・レシピボタン
        card.append(
          h('button', {
            style: {
              marginTop: '14px', width: '100%', padding: '10px',
              borderRadius: '10px', border: '1px solid var(--line)',
              background: 'var(--surface-2)', fontSize: '13px',
              fontWeight: 700, cursor: 'pointer', color: 'var(--muted)',
            },
            onclick: () => openRecipeModal(day.name),
          }, '🍳 材料・レシピを見る')
        );
      }

      // 編集モード
      function renderEdit() {
        card.innerHTML = '';

        const nameInput = h('input', { class: 'input', type: 'text', value: day.name });
        const kidsInput = h('textarea', {
          class: 'textarea',
          placeholder: 'なぎへのメモ（例：辛さ抜き、取り分け）',
          style: { minHeight: '64px' },
        });
        kidsInput.value = day.kidsNote || '';

        const errMsg = h('p', {
          style: { color: 'var(--ng)', fontSize: '12px', marginTop: '4px', display: 'none' },
        }, '料理名を入力してください');

        const saveBtn = h('button', {
          class: 'btn primary',
          style: { marginTop: '12px' },
          onclick: async () => {
            const newName = nameInput.value.trim();
            if (!newName) {
              nameInput.style.borderColor = 'var(--ng)';
              errMsg.style.display = 'block';
              nameInput.focus();
              return;
            }
            nameInput.style.borderColor = '';
            errMsg.style.display = 'none';

            saveBtn.disabled = true;
            saveBtn.textContent = '保存中…';
            days[idx].name = newName;
            days[idx].kidsNote = kidsInput.value.trim();
            try {
              await fb.setMenu(weekId, { days });
              day.name = days[idx].name;
              day.kidsNote = days[idx].kidsNote;
              renderView();
            } catch (e) {
              saveBtn.disabled = false;
              saveBtn.textContent = '保存';
              alert('保存に失敗しました。もう一度お試しください。');
            }
          },
        }, '保存');

        const cancelBtn = h('button', {
          class: 'btn ghost',
          style: { marginTop: '8px' },
          onclick: () => renderView(),
        }, 'キャンセル');

        card.append(
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' } },
            h('span', {
              style: {
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'var(--accent)', color: '#fff',
                fontSize: '14px', fontWeight: 900, flexShrink: '0',
              },
            }, day.weekday),
            h('span', { style: { fontSize: '14px', fontWeight: 700 } }, '編集')
          ),
          h('div', { class: 'field' },
            h('label', {}, '料理名'),
            nameInput,
            errMsg
          ),
          h('div', { class: 'field' },
            h('label', {}, 'なぎメモ（任意）'),
            kidsInput
          ),
          saveBtn,
          cancelBtn
        );
      }

      renderView();
      return card;
    }

    buildDayCards();
  })();

  return root;
}

async function openRecipeModal(dishName) {
  const overlay = h('div', { class: 'recipe-modal',
    onclick: e => { if (e.target === overlay) overlay.remove(); }
  });
  const loadingEl = h('div', { class: 'recipe-loading' },
    h('div', { class: 'spinner' }),
    h('p', { class: 'muted mt-8' }, 'レシピを取得中…')
  );
  const box = h('div', { class: 'recipe-box' },
    h('div', { class: 'recipe-header' },
      h('span', { style: { fontWeight: 900, fontSize: '17px' } }, dishName),
      h('button', { class: 'recipe-close', onclick: () => overlay.remove() }, '✕')
    ),
    loadingEl
  );
  overlay.append(box);
  document.body.append(overlay);

  try {
    const recipe = await generateRecipe(dishName);
    loadingEl.remove();
    box.append(
      h('div', { class: 'recipe-section' },
        h('div', { class: 'recipe-section-title' }, '🥬 材料'),
        h('ul', { class: 'recipe-list' },
          ...(recipe.ingredients || []).map(i => h('li', {}, i))
        )
      ),
      h('div', { class: 'recipe-section' },
        h('div', { class: 'recipe-section-title' }, '🧂 調味料'),
        h('ul', { class: 'recipe-list' },
          ...(recipe.seasonings || []).map(i => h('li', {}, i))
        )
      ),
      h('div', { class: 'recipe-section' },
        h('div', { class: 'recipe-section-title' }, '📋 手順'),
        h('ol', { class: 'recipe-steps' },
          ...(recipe.steps || []).map(s => h('li', {}, s))
        )
      )
    );
  } catch (e) {
    loadingEl.innerHTML = '';
    loadingEl.append(
      h('p', { style: { color: 'var(--ng)', textAlign: 'center', padding: '8px' } },
        e.message === 'NO_KEY' ? '⚙️ Gemini APIキーが未設定です' : 'レシピの取得に失敗しました')
    );
  }
}
