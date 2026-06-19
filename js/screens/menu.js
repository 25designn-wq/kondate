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

    // ドラッグ開始：カードを浮かせて指に追従させ、隙間（プレースホルダ）で挿入先を示す
    function startDrag(e, card) {
      e.preventDefault();
      const pointerId = e.pointerId;
      const rect = card.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;

      // 元の位置に隙間を作る
      const ph = h('div', { class: 'day-placeholder' });
      ph.style.height = rect.height + 'px';
      listEl.insertBefore(ph, card);

      // カードを浮かせて固定（指に追従）
      card.classList.add('dragging');
      card.style.position = 'fixed';
      card.style.left = rect.left + 'px';
      card.style.top = rect.top + 'px';
      card.style.width = rect.width + 'px';
      card.style.zIndex = '999';

      const onMove = ev => {
        if (ev.pointerId !== pointerId) return;
        ev.preventDefault();
        const y = ev.clientY;
        card.style.top = (y - offsetY) + 'px';
        const sibs = [...listEl.querySelectorAll('.day-card:not(.dragging)')];
        let target = null;
        for (const sib of sibs) {
          const r = sib.getBoundingClientRect();
          if (y < r.top + r.height / 2) { target = sib; break; }
        }
        if (target) listEl.insertBefore(ph, target);
        else listEl.append(ph);
      };
      const onUp = ev => {
        if (ev.pointerId !== pointerId) return;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        listEl.insertBefore(card, ph);
        ph.remove();
        card.classList.remove('dragging');
        card.style.position = card.style.left = card.style.top = card.style.width = card.style.zIndex = '';
        commitReorder();
      };
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    }

    // 1日分のカード（既定は折りたたみ。タップで詳細を開く）
    function buildDayCard(day) {
      const card = h('div', { class: 'card day-card' });
      card._day = day;   // 並び替えのために紐付け

      const nameEl = h('span', { class: 'day-name' }, day.name);
      const handle = h('div', { class: 'drag-handle', title: 'ドラッグで並び替え' }, '≡');
      handle.addEventListener('pointerdown', e => startDrag(e, card));
      const chevron = h('span', { class: 'day-chevron' }, '▾');
      const details = h('div', { class: 'day-details', style: { display: 'none' } });
      let open = false;

      const header = h('div', { class: 'day-header' },
        handle,
        h('span', { class: 'day-badge' }, day.weekday),
        nameEl,
        chevron
      );
      header.addEventListener('click', e => {
        if (handle.contains(e.target)) return;   // ハンドルは開閉に使わない
        open = !open;
        details.style.display = open ? 'block' : 'none';
        chevron.textContent = open ? '▴' : '▾';
        if (open) renderDetails();
      });

      function renderDetails() {
        details.innerHTML = '';
        if (day.reason) {
          details.append(h('p', { class: 'muted', style: { fontSize: '13px', marginTop: '10px', lineHeight: 1.6 } }, day.reason));
        }
        if (day.seasonal) {
          details.append(h('div', { class: 'mc-seasonal', style: { marginTop: '10px' } }, '🍂 ' + day.seasonal));
        }
        if (day.kidsNote) {
          details.append(h('div', { class: 'mc-kids', style: { marginTop: '10px' } },
            h('span', { style: { fontWeight: 700, marginRight: '6px' } }, '👶 なぎ：'), day.kidsNote));
        }
        const ing = Array.isArray(day.ingredients) ? day.ingredients : [];
        const sea = Array.isArray(day.seasonings) ? day.seasonings : [];
        if (ing.length || sea.length) {
          const box = h('div', { class: 'mc-ing-box', style: { marginTop: '12px' } });
          if (ing.length) box.append(h('div', { class: 'mc-ing' },
            h('span', { class: 'mc-ing-label' }, '🥬 材料'), ing.map(nameOnly).join('、')));
          if (sea.length) box.append(h('div', { class: 'mc-ing', style: { marginTop: '7px' } },
            h('span', { class: 'mc-ing-label' }, '🧂 調味料'), sea.map(nameOnly).join('、')));
          details.append(box);
        }
        details.append(
          h('div', { style: { display: 'flex', gap: '8px', marginTop: '14px' } },
            h('button', { class: 'day-action', onclick: () => openRecipeModal(day.name) }, '🍳 作り方'),
            h('button', { class: 'day-action', onclick: renderEdit }, '✏️ 編集')
          )
        );
      }

      function renderEdit() {
        details.innerHTML = '';
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
          class: 'btn primary', style: { marginTop: '12px' },
          onclick: async () => {
            const newName = nameInput.value.trim();
            if (!newName) { nameInput.style.borderColor = 'var(--ng)'; errMsg.style.display = 'block'; nameInput.focus(); return; }
            saveBtn.disabled = true; saveBtn.textContent = '保存中…';
            day.name = newName;
            day.kidsNote = kidsInput.value.trim();
            try {
              await fb.setMenu(weekId, { days });
              nameEl.textContent = day.name;
              renderDetails();
            } catch (e) {
              saveBtn.disabled = false; saveBtn.textContent = '保存';
              alert('保存に失敗しました。もう一度お試しください。');
            }
          },
        }, '保存');
        const cancelBtn = h('button', { class: 'btn ghost', style: { marginTop: '8px' }, onclick: renderDetails }, 'キャンセル');

        details.append(
          h('div', { class: 'field', style: { marginTop: '12px' } }, h('label', {}, '料理名'), nameInput, errMsg),
          h('div', { class: 'field' }, h('label', {}, 'なぎメモ（任意）'), kidsInput),
          saveBtn, cancelBtn
        );
      }

      card.append(header, details);
      return card;
    }

    buildDayCards();
  })();

  return root;
}
