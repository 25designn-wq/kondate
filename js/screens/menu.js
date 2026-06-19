// 献立一覧画面：確定済みの今週の献立を曜日ごとに表示。
// なぎメモのインライン編集、材料名の表示、ドラッグでの並び替えに対応。
import { h, topbar } from '../dom.js';
import { navigate } from '../router.js';
import { LABEL, currentWeekId, WEEKDAYS } from '../state.js';
import * as fb from '../firebase.js';
import { openRecipeModal } from '../recipe.js';

// 材料文字列から名前だけ取り出す（「鶏もも肉 300g」→「鶏もも肉」）
const nameOnly = s => String(s).split(/\s+/)[0];

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
        h('p', { class: 'muted', style: { fontSize: '12px', marginBottom: '6px', textAlign: 'right' } },
          `（${LABEL[menu.confirmedBy]}が確定）`)
      );
    }
    root.append(
      h('p', { class: 'muted', style: { fontSize: '12px', marginBottom: '14px' } },
        '≡ をドラッグすると曜日を入れ替えできます')
    );

    // days 配列をコピーして保持（編集・並び替えで更新する）
    const days = menu.days.map(d => ({ ...d }));

    // カードを並べるコンテナ（並び替えはこの中で行う）
    const listEl = h('div', { class: 'menu-list' });
    root.append(listEl);
    root.append(
      h('div', { class: 'footer-action' },
        h('button', { class: 'btn ghost', onclick: () => navigate('meeting') }, '献立を作り直す（会議）')
      )
    );

    // days からカードを再構築する
    function buildDayCards() {
      listEl.innerHTML = '';
      days.forEach(day => listEl.append(buildDayCard(day)));
    }

    // 並び替え確定：DOMの順序から days を作り直し、曜日を位置で振り直して保存
    function commitReorder() {
      const order = [...listEl.querySelectorAll('.day-card')].map(c => c._day);
      order.forEach((d, i) => { d.weekday = WEEKDAYS[i]; });
      days.length = 0; days.push(...order);
      buildDayCards();
      fb.setMenu(weekId, { days }).catch(() => {});
    }

    // ドラッグ開始（ハンドルの pointerdown）
    function startDrag(e, card) {
      e.preventDefault();
      card.classList.add('dragging');
      card.setPointerCapture?.(e.pointerId);

      const onMove = ev => {
        const y = ev.clientY;
        const sibs = [...listEl.querySelectorAll('.day-card:not(.dragging)')];
        let target = null;
        for (const sib of sibs) {
          const r = sib.getBoundingClientRect();
          if (y < r.top + r.height / 2) { target = sib; break; }
        }
        if (target) listEl.insertBefore(card, target);
        else listEl.append(card);
      };
      const onUp = () => {
        card.classList.remove('dragging');
        card.removeEventListener('pointermove', onMove);
        card.removeEventListener('pointerup', onUp);
        card.removeEventListener('pointercancel', onUp);
        commitReorder();
      };
      card.addEventListener('pointermove', onMove);
      card.addEventListener('pointerup', onUp);
      card.addEventListener('pointercancel', onUp);
    }

    // 1日分のカード
    function buildDayCard(day) {
      const card = h('div', { class: 'card day-card', style: { marginBottom: '14px' } });
      card._day = day;   // 並び替えのために紐付け

      const dayBadge = () => h('span', {
        style: {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '32px', height: '32px', borderRadius: '8px',
          background: 'var(--accent)', color: '#fff',
          fontSize: '14px', fontWeight: 900, flexShrink: '0',
        },
      }, day.weekday);

      function renderView() {
        card.innerHTML = '';

        const handle = h('div', { class: 'drag-handle', title: 'ドラッグで並び替え' }, '≡');
        handle.addEventListener('pointerdown', e => startDrag(e, card));

        const nameRow = h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '10px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flex: '1' } },
            handle,
            dayBadge(),
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

        if (day.reason) {
          card.append(h('p', { class: 'muted', style: { fontSize: '13px', marginTop: '8px', lineHeight: 1.6 } }, day.reason));
        }
        if (day.seasonal) {
          card.append(h('div', { class: 'mc-seasonal', style: { marginTop: '10px' } }, '🍂 ' + day.seasonal));
        }
        if (day.kidsNote) {
          card.append(
            h('div', { class: 'mc-kids', style: { marginTop: '10px' } },
              h('span', { style: { fontWeight: 700, marginRight: '6px' } }, '👶 なぎ：'),
              day.kidsNote
            )
          );
        } else {
          card.append(h('p', { class: 'muted', style: { fontSize: '12px', marginTop: '10px' } }, 'なぎメモなし'));
        }

        // 材料名（あれば）
        const ing = Array.isArray(day.ingredients) ? day.ingredients : [];
        const sea = Array.isArray(day.seasonings) ? day.seasonings : [];
        if (ing.length) {
          card.append(h('div', { class: 'mc-ing', style: { color: 'var(--text)' } },
            h('span', { class: 'mc-ing-label' }, '🥬 材料'), ing.map(nameOnly).join('、')));
        }
        if (sea.length) {
          card.append(h('div', { class: 'mc-ing', style: { color: 'var(--text)' } },
            h('span', { class: 'mc-ing-label' }, '🧂 調味料'), sea.map(nameOnly).join('、')));
        }

        // 材料・レシピ（分量・作り方）モーダル
        card.append(
          h('button', {
            style: {
              marginTop: '14px', width: '100%', padding: '10px',
              borderRadius: '10px', border: '1px solid var(--line)',
              background: 'var(--surface-2)', fontSize: '13px',
              fontWeight: 700, cursor: 'pointer', color: 'var(--accent)',
            },
            onclick: () => openRecipeModal(day.name),
          }, '🍳 材料・作り方を見る')
        );
      }

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
            day.name = newName;
            day.kidsNote = kidsInput.value.trim();
            try {
              await fb.setMenu(weekId, { days });
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
            dayBadge(),
            h('span', { style: { fontSize: '14px', fontWeight: 700 } }, '編集')
          ),
          h('div', { class: 'field' }, h('label', {}, '料理名'), nameInput, errMsg),
          h('div', { class: 'field' }, h('label', {}, 'なぎメモ（任意）'), kidsInput),
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
