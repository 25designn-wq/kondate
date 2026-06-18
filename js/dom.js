// 軽量DOMヘルパー。各画面はこの h() でDOMを組み立てる。
//   h('div', { class:'card', onclick: fn }, '文字', childEl, [配列もOK])
export function h(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// 戻るボタン付きトップバー
export function topbar(title, onBack) {
  return h('div', { class: 'topbar' },
    h('button', { class: 'back', onclick: onBack }, '←'),
    h('div', { class: 'title' }, title)
  );
}

// 複数選択チップ。要素に .getValue() が生え、選択中の配列を返す。
//   const g = chipGroup(['和食','洋食'], profile.genres); ... g.getValue()
export function chipGroup(options, selected = []) {
  const sel = new Set(selected);
  const wrap = h('div', { class: 'chips' });
  options.forEach(opt => {
    const chip = h('button', {
      class: 'chip' + (sel.has(opt) ? ' on' : ''), type: 'button',
      onclick: () => { sel.has(opt) ? sel.delete(opt) : sel.add(opt); chip.classList.toggle('on'); },
    }, opt);
    wrap.append(chip);
  });
  wrap.getValue = () => options.filter(o => sel.has(o));
  return wrap;
}

// 自由入力タグ（Enterで追加・×で削除）。要素に .getValue() が生える。
export function tagInput(initial = [], placeholder = '入力してEnter') {
  const tags = [...initial];
  const list = h('div', { class: 'taglist' });
  const input = h('input', { class: 'input', type: 'text', placeholder });
  const draw = () => {
    list.innerHTML = '';
    tags.forEach((t, i) => list.append(
      h('span', { class: 'tag' }, t, h('button', { type: 'button', onclick: () => { tags.splice(i, 1); draw(); } }, '×'))
    ));
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value.trim();
      if (v && !tags.includes(v)) { tags.push(v); input.value = ''; draw(); }
    }
  });
  const wrap = h('div', {}, input, list);
  wrap.getValue = () => [...tags];
  draw();
  return wrap;
}
