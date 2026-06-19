// 画面遷移。各画面は js/screens/<name>.js で `export function render(params)` を持ち、
// HTMLElement を返す。画面は動的importで読み込むので、未実装の画面があっても他は動く。
//
// APP_VERSION：デプロイのたびに数字を上げると、画面ファイルのキャッシュを確実に破棄できる。
// （スマホ・PWAは強くキャッシュするため、更新が反映されない時はここを上げる）
const APP_VERSION = '11';
const appEl = () => document.getElementById('app');

export async function navigate(name, params = {}) {
  try {
    const mod = await import(`./screens/${name}.js?v=${APP_VERSION}`);
    const root = mod.render(params);
    const app = appEl();
    app.innerHTML = '';
    app.append(root);
    window.scrollTo(0, 0);
    history.replaceState({ name }, '', `#${name}`);
  } catch (e) {
    console.error(`[router] 画面 "${name}" の表示に失敗:`, e);
    appEl().innerHTML = `<div class="screen"><p class="muted">画面の読み込みに失敗しました（${name}）。<br>${e.message}</p></div>`;
  }
}
