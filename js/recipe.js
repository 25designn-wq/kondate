// 共有レシピモーダル。会議カード・献立画面の両方から呼ぶ。
// 分量・作り方は generateRecipe をタップ時に都度取得する（自動・ループ呼び出しはしない）。
import { h } from './dom.js';
import { generateRecipe } from './gemini.js';

export async function openRecipeModal(dishName) {
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
