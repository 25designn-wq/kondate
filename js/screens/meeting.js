// 会議画面：AIが7日分を提案 → ドラムロールで発表 → スワイプで採用/却下 → 確定保存。
//   右スワイプ  = 採用（パチパチ + 紙吹雪）
//   左スワイプ  = 却下（理由なし・ブーブー）→ 予備候補に差し替え
//   下スワイプ  = 却下（理由を選ぶ・ブーブー）→ 予備候補に差し替え
import { h } from '../dom.js';
import { navigate } from '../router.js';
import { state, currentWeekId, next7Days, todayISO, LABEL } from '../state.js';
import * as fb from '../firebase.js';
import { generateMenu } from '../gemini.js';
import { openRecipeModal } from '../recipe.js';

// 材料文字列から名前だけ取り出す（「鶏もも肉 300g」→「鶏もも肉」）
const nameOnly = s => String(s).split(/\s+/)[0];

// Gemini未設定でもUIを試せるデモデータ
const DEMO = {
  days: [
    { weekday: '月', name: '鶏のはちみつ照り焼き', reason: '平日でも手早く満足感', seasonal: '', kidsNote: 'なぎは味付け前に取り分け',
      ingredients: ['鶏もも肉 300g', '玉ねぎ 1個', 'いんげん 6本'], seasonings: ['はちみつ 大さじ1', '醤油 大さじ2', 'みりん 大さじ1'] },
    { weekday: '火', name: '鮭ときのこのホイル焼き', reason: 'きのこが香る季節', seasonal: '秋はきのこが旨みたっぷりで旬', kidsNote: '',
      ingredients: ['生鮭 2切れ', 'しめじ 1袋', 'えのき 1袋', '玉ねぎ 1/2個'], seasonings: ['バター 10g', '醤油 少々', '塩こしょう 適量'] },
    { weekday: '水', name: '豚バラ大根の煮物', reason: '大根が安くて甘い時期', seasonal: '冬大根は煮るととろける', kidsNote: '',
      ingredients: ['豚バラ肉 200g', '大根 1/3本', '生姜 1片'], seasonings: ['醤油 大さじ3', '砂糖 大さじ1', 'みりん 大さじ2'] },
    { weekday: '木', name: '野菜たっぷり塩焼きそば', reason: '冷蔵庫の整理にも◎', seasonal: '', kidsNote: '',
      ingredients: ['焼きそば麺 2玉', 'キャベツ 1/4個', '人参 1/2本', '豚こま 100g'], seasonings: ['鶏ガラスープの素 小さじ2', '塩こしょう 適量', 'ごま油 大さじ1'] },
    { weekday: '金', name: '金曜はおうち餃子', reason: '週末前のお楽しみ', seasonal: '', kidsNote: 'なぎ用はにら少なめで',
      ingredients: ['豚ひき肉 200g', 'キャベツ 1/4個', 'にら 1/2束', '餃子の皮 24枚'], seasonings: ['醤油 小さじ2', 'ごま油 小さじ2', '生姜 1片'] },
    { weekday: '土', name: 'ブリの照り焼き', reason: '脂がのって美味しい', seasonal: '寒ブリは冬が最高に旨い', kidsNote: '',
      ingredients: ['ブリ 2切れ', '長ねぎ 1本'], seasonings: ['醤油 大さじ2', 'みりん 大さじ2', '酒 大さじ1', '砂糖 小さじ1'] },
    { weekday: '日', name: 'おでん', reason: '寒い日にほっとする', seasonal: '', kidsNote: '',
      ingredients: ['大根 1/2本', '卵 4個', 'こんにゃく 1枚', 'ちくわ 4本', 'がんも 4個'], seasonings: ['だしの素 大さじ1', '醤油 大さじ2', '塩 少々'] },
  ],
  alternates: [
    { weekday: '', name: '麻婆豆腐', reason: 'ご飯がすすむ定番', seasonal: '', kidsNote: 'なぎ用は辛さ抜き',
      ingredients: ['豆腐 1丁', '豚ひき肉 150g', '長ねぎ 1/2本'], seasonings: ['豆板醤 小さじ1', '味噌 大さじ1', '醤油 大さじ1'] },
    { weekday: '', name: 'カレーライス', reason: 'みんな大好き', seasonal: '', kidsNote: '',
      ingredients: ['豚こま 200g', 'じゃがいも 2個', '人参 1本', '玉ねぎ 1個'], seasonings: ['カレールー 4皿分'] },
    { weekday: '', name: 'ぶり大根', reason: '旬のぶりで', seasonal: 'ぶりは冬が旬', kidsNote: '',
      ingredients: ['ブリのあら 300g', '大根 1/3本'], seasonings: ['醤油 大さじ3', '砂糖 大さじ1', '酒 大さじ2'] },
    { weekday: '', name: 'オムライス', reason: '休日のお楽しみ', seasonal: '', kidsNote: '',
      ingredients: ['ご飯 2杯', '卵 4個', '玉ねぎ 1/2個', '鶏もも肉 100g'], seasonings: ['ケチャップ 大さじ4', '塩こしょう 適量'] },
    { weekday: '', name: '鶏団子鍋', reason: '体が温まる', seasonal: '', kidsNote: '',
      ingredients: ['鶏ひき肉 250g', '白菜 1/4個', '長ねぎ 1本', '豆腐 1丁'], seasonings: ['だしの素 大さじ1', '醤油 大さじ2'] },
    { weekday: '', name: 'ナポリタン', reason: '懐かしの味', seasonal: '', kidsNote: '',
      ingredients: ['スパゲティ 200g', 'ウインナー 4本', 'ピーマン 2個', '玉ねぎ 1/2個'], seasonings: ['ケチャップ 大さじ5', 'バター 10g'] },
  ],
};

const REASONS = [
  { key: 'hate',  emoji: '😤', label: 'これは嫌い' },
  { key: 'stock', emoji: '🛒', label: '材料がない' },
  { key: 'heavy', emoji: '😮‍💨', label: '作るのが面倒' },
];

// ボタン演出：毎回ランダムに選ぶ（採用＝ポジティブ／不採用＝ネガティブ）
const POP_VARIANTS = ['pop-a', 'pop-b', 'pop-c'];
const SHAKE_VARIANTS = ['shake-a', 'shake-b', 'shake-c'];
const ACCEPT_EMOJI = ['👍', '🎉', '✨', '😋', '🙌', '💯', '🥳', '🤤', '❤️', '⭐'];
const REJECT_EMOJI = ['👎', '😣', '💦', '🙅', '🥲', '😬', '💔', '🚫', '😵', '🌀'];
const pick = a => a[(Math.random() * a.length) | 0];

/* ===================== 効果音（Web Audio で合成） ===================== */
let actx = null;
const audio = () => (actx ||= new (window.AudioContext || window.webkitAudioContext)());

// iOS Safari 対策：ユーザー操作の瞬間に resume + 無音バッファ再生で完全アンロックする。
// 何度呼んでも安全（冪等）。
function unlockAudio() {
  try {
    const ac = audio();
    if (ac.state === 'suspended') ac.resume();
    const buf = ac.createBuffer(1, 1, ac.sampleRate);
    const src = ac.createBufferSource();
    src.buffer = buf; src.connect(ac.destination); src.start(0);
  } catch {}
}
function buzz() {
  try {
    const ac = audio();
    [0, 0.18].forEach(off => {
      const t = ac.currentTime + off;
      const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = 150;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.15);
    });
  } catch {}
}
// 歓声「わー！」＋拍手「パチパチ」
function cheer() {
  try {
    const ac = audio();
    // わー！＝バンドパスしたノイズをスウェル
    const dur = 1.1;
    const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < data.length; j++) data[j] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
    const g = ac.createGain();
    const t = ac.currentTime;
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.18);   // ぐわっと盛り上がる
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(g).connect(ac.destination); src.start();
    // パチパチ＝細かい拍手を連発
    for (let i = 0; i < 14; i++) {
      const ct = t + 0.05 + Math.random() * 0.9;
      const cb = ac.createBuffer(1, ac.sampleRate * 0.04, ac.sampleRate);
      const cd = cb.getChannelData(0);
      for (let j = 0; j < cd.length; j++) cd[j] = (Math.random() * 2 - 1) * (1 - j / cd.length);
      const cs = ac.createBufferSource(); cs.buffer = cb;
      const cg = ac.createGain(); cg.gain.setValueAtTime(0.3, ct); cg.gain.exponentialRampToValueAtTime(0.01, ct + 0.04);
      cs.connect(cg).connect(ac.destination); cs.start(ct);
    }
  } catch {}
}

function drumrollSound(dur = 1.3) {
  try {
    const ac = audio();
    const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < data.length; j++) {
      const env = 0.2 + 0.8 * (j / data.length);            // だんだん大きく
      const trem = 0.5 + 0.5 * Math.sin(j / ac.sampleRate * 2 * Math.PI * 18);
      data[j] = (Math.random() * 2 - 1) * env * trem * 0.4;
    }
    const src = ac.createBufferSource(); src.buffer = buf;
    src.connect(ac.destination); src.start();
    // 最後に「ドン！」
    const t = ac.currentTime + dur;
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.25);
    const g = ac.createGain(); g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.3);
  } catch {}
}

/* ===================== 紙吹雪 ===================== */
function confetti(amount = 80) {
  const layer = document.getElementById('fx-layer');
  if (!layer) return;
  const colors = ['#ff6b4a', '#ffd166', '#4ade80', '#5aa9ff', '#c77dff', '#fff'];
  for (let i = 0; i < amount; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[(Math.random() * colors.length) | 0];
    p.style.animationDuration = 1 + Math.random() * 1.2 + 's';
    p.style.animationDelay = Math.random() * 0.2 + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    p.style.width = p.style.height = 6 + Math.random() * 8 + 'px';
    layer.append(p);
    setTimeout(() => p.remove(), 2600);
  }
}

// 左右下スミから中央（ステージ）に向かって舞い上がる紙吹雪
function confettiBurst(perSide = 26) {
  const layer = document.getElementById('fx-layer');
  if (!layer) return;
  const colors = ['#ff6b4a', '#ffd166', '#4ade80', '#5aa9ff', '#c77dff', '#fff'];
  [-1, 1].forEach(side => {                      // -1=左下、+1=右下
    for (let i = 0; i < perSide; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-pop';
      // 中央へ向かう＝左下は右へ、右下は左へ。上にも舞い上がる。
      const inward = (180 + Math.random() * 220) * -side;  // side=-1(左)→+(右へ)、side=+1(右)→-(左へ)
      const up = 180 + Math.random() * 180;
      p.style.setProperty('--dx', inward + 'px');
      p.style.setProperty('--peak', -up + 'px');
      p.style.setProperty('--dy', (-up + 50 + Math.random() * 90) + 'px'); // ピークから少し落ちて止まる
      p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      p.style.left = side < 0 ? '8vw' : '92vw';
      p.style.bottom = '6vh'; p.style.top = 'auto';
      p.style.background = colors[(Math.random() * colors.length) | 0];
      p.style.animationDuration = 1.4 + Math.random() * 0.9 + 's';
      p.style.animationDelay = Math.random() * 0.25 + 's';
      p.style.width = p.style.height = 6 + Math.random() * 7 + 'px';
      layer.append(p);
      setTimeout(() => p.remove(), 2600);
    }
  });
}

// カバー面（裏面デザイン）を canvas に描く。DOM の .card-back と見た目を合わせる。
function drawCover(ctx, W, H, dayLabel) {
  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  ctx.save();
  rr(0, 0, W, H, 26); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, W * 0.6, H);
  g.addColorStop(0, '#ff6b4a'); g.addColorStop(.55, '#ff5a3c'); g.addColorStop(1, '#e8431f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
  rr(14, 14, W - 28, H - 28, 18); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.globalAlpha = .85;
  ctx.font = '800 13px Outfit, system-ui, sans-serif';
  ctx.fillText('K O N D A T E', W / 2, H * 0.28);
  ctx.globalAlpha = 1;
  ctx.font = '900 22px "Zen Kaku Gothic New", system-ui, sans-serif';
  ctx.fillText(dayLabel, W / 2, H * 0.28 + 30);
  ctx.font = '900 96px "Zen Kaku Gothic New", system-ui, sans-serif';
  ctx.fillText('？', W / 2, H * 0.62);
  ctx.restore();
}

// canvas 用：折り返し描画
function wrapText(ctx, text, x, y, maxW, lh, maxLines) {
  const chars = [...String(text || '')];
  let line = '', lines = 0;
  for (let i = 0; i < chars.length; i++) {
    const test = line + chars[i];
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y); y += lh; line = chars[i]; lines++;
      if (lines >= maxLines - 1) {
        // 残りは最終行に収める（はみ出しは…で省略）
        let rest = chars.slice(i).join('');
        while (rest && ctx.measureText(rest + '…').width > maxW) rest = rest.slice(0, -1);
        ctx.fillText(rest + (chars.slice(i).join('').length > rest.length ? '…' : ''), x, y);
        return y + lh;
      }
    } else line = test;
  }
  ctx.fillText(line, x, y); return y + lh;
}

const roundRectPath = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
};

// レシピ面（裏面）を canvas に簡易描画。めくり完了後は本物のDOMに切り替わる。
function drawRecipe(ctx, W, H, dish, dayLabel) {
  ctx.save();
  roundRectPath(ctx, 0, 0, W, H, 26); ctx.clip();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const pad = 26;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ff5a3c'; ctx.font = '800 15px Outfit, system-ui, sans-serif';
  ctx.fillText(dayLabel, pad, 46);
  ctx.fillStyle = '#16181d'; ctx.font = '900 27px "Zen Kaku Gothic New", system-ui, sans-serif';
  let y = wrapText(ctx, dish.name, pad, 86, W - pad * 2, 34, 2);
  if (dish.reason) {
    ctx.fillStyle = '#8a909c'; ctx.font = '400 14px "Zen Kaku Gothic New", system-ui, sans-serif';
    y = wrapText(ctx, dish.reason, pad, y + 16, W - pad * 2, 22, 2);
  }
  const ing = (Array.isArray(dish.ingredients) ? dish.ingredients : []).map(nameOnly).join('、');
  if (ing) {
    ctx.fillStyle = '#16181d'; ctx.font = '700 13px "Zen Kaku Gothic New", system-ui, sans-serif';
    y = wrapText(ctx, '🥬 ' + ing, pad, y + 18, W - pad * 2, 20, 2);
  }
  ctx.restore();
}

// 本物のめくり：カードを縦の薄片に分割し、各片を回転（しなり）させて裏返す。
// 表＝カバー、裏＝レシピ。右端が先に回り込み、波打ちながら裏面（レシピ）が現れる。
function curlReveal(card, dish, dayLabel, done) {
  const back = card.querySelector('.card-back');
  const front = card.querySelector('.card-front');
  const flipper = card.querySelector('.card-flipper');
  const W = Math.round(card.clientWidth), H = Math.round(card.clientHeight);
  if (!back || !flipper || !W || !H) { back && (back.style.visibility = 'hidden'); done && done(); return; }
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  const mk = (drawFn) => {
    const cnv = document.createElement('canvas');
    cnv.width = W * dpr; cnv.height = H * dpr;
    const c = cnv.getContext('2d'); c.scale(dpr, dpr); drawFn(c);
    return cnv;
  };
  const cover = mk(c => drawCover(c, W, H, dayLabel));     // 表
  const recipe = mk(c => drawRecipe(c, W, H, dish, dayLabel)); // 裏

  const cv = document.createElement('canvas');
  cv.className = 'card-curl';
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  flipper.appendChild(cv);
  back.style.visibility = 'hidden';
  if (front) front.style.visibility = 'hidden';   // 完了まで本物は隠す（canvasで描く）

  const dur = 1050, startT = performance.now();
  const BEND = 1.2;                                  // しなりの強さ（右端が先行する角度差）
  const step = 2;
  const ease = p => (p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  ctx.imageSmoothingEnabled = true;
  const mapPhi = (x, base) => {
    let phi = base + BEND * (x / W - 0.5);            // 中央回転フリップ＋右が先行
    return phi < 0 ? 0 : phi > Math.PI ? Math.PI : phi;
  };

  function frame(now) {
    let p = (now - startT) / dur; if (p > 1) p = 1;
    const base = ease(p) * Math.PI;
    ctx.clearRect(0, 0, W, H);
    // 1) 各列を素のまま、隙間なくタイル状に描く（影は重ねない＝縦縞を防ぐ）
    for (let x = 0; x < W; x += step) {
      const phi = mapPhi(x, base), phi2 = mapPhi(x + step, base);
      const xa = W / 2 + (x - W / 2) * Math.cos(phi);
      const xb = W / 2 + ((x + step) - W / 2) * Math.cos(phi2);
      const left = Math.min(xa, xb), w = Math.abs(xb - xa) + 0.8;
      const isFront = phi < Math.PI / 2;
      const img = isFront ? cover : recipe;
      const srcX = isFront ? x : (W - (x + step));     // 裏面は左右反転してサンプル
      ctx.drawImage(img, srcX * dpr, 0, step * dpr, H * dpr, left, 0, w, H);
    }
    // 2) 折り目(phi=π/2)の画面x位置を逆算し、そこを谷にした柔らかい影を1回だけ重ねる
    const xf = W * ((Math.PI / 2 - base) / BEND + 0.5);
    const bandW = W * 0.5;
    const g = ctx.createLinearGradient(xf - bandW, 0, xf + bandW, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.34)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    if (p < 1) requestAnimationFrame(frame);
    else { cv.remove(); if (front) front.style.visibility = ''; done && done(); }
  }
  requestAnimationFrame(frame);
}

// 複数のライトが動き回って中央に集まるスポットライト演出（初回のみ）
function buildSpotlightStage() {
  return h('div', { class: 'spotlight-stage' },
    h('div', { class: 'beam b1' }),
    h('div', { class: 'beam b2' }),
    h('div', { class: 'beam b3' })
  );
}

/* ===================== 画面本体 ===================== */
export function render({ demo } = {}) {
  const root = h('div', { class: 'screen meeting' });
  if (demo) {
    // デバッグ用：Geminiもアンケートも使わず、デモ献立で発表フローを試す
    showIntro(root, currentWeekId(), DEMO, {});
  } else {
    runLoading(root);
  }
  return root;
}

async function runLoading(root) {
  root.innerHTML = '';
  root.append(
    h('div', { class: 'meeting-center' },
      h('div', { class: 'spinner' }),
      h('p', { class: 'mt-16', style: { fontWeight: 700 } }, 'AIが今週の献立を考えています…'),
      h('p', { class: 'muted mt-8', style: { fontSize: '13px' } }, '二人のリクエストと好みを読み込み中')
    )
  );

  const weekId = currentWeekId();
  let ctx;
  try {
    const [profiles, nagi, survey, learning] = await Promise.all([
      fb.getProfiles(), fb.getNagi(), fb.getSurvey(weekId), fb.getLearning(),
    ]);
    ctx = { profiles, nagi, survey, learning, today: todayISO(), plan: next7Days() };
  } catch (e) {
    ctx = { profiles: {}, nagi: {}, survey: {}, learning: {}, today: todayISO(), plan: next7Days() };
  }

  try {
    const result = await generateMenu(ctx);
    showIntro(root, weekId, result, ctx.learning || {});
  } catch (e) {
    if (e.message === 'NO_KEY') return showNoKey(root, weekId, ctx.learning || {});
    showError(root, weekId, e, ctx.learning || {});
  }
}

function showNoKey(root, weekId, learning) {
  root.innerHTML = '';
  root.append(
    h('div', { class: 'meeting-center' },
      h('div', { style: { fontSize: '40px' } }, '🔑'),
      h('p', { class: 'mt-16', style: { fontWeight: 700 } }, 'Gemini APIキーが未設定です'),
      h('p', { class: 'muted mt-8', style: { fontSize: '13px', textAlign: 'center' } },
        'AIに献立を作ってもらうにはキーが必要です。設定画面で入力してください。'),
      h('div', { class: 'mt-24', style: { width: '100%', display: 'grid', gap: '12px' } },
        h('button', { class: 'btn primary', onclick: () => navigate('settings') }, '設定でキーを入れる'),
        h('button', { class: 'btn ghost', onclick: () => showIntro(root, weekId, DEMO, learning) }, 'デモで試す'),
        h('button', { class: 'btn ghost', onclick: () => navigate('home') }, 'ホームに戻る')
      )
    )
  );
}

function showError(root, weekId, e, learning) {
  root.innerHTML = '';
  root.append(
    h('div', { class: 'meeting-center' },
      h('div', { style: { fontSize: '40px' } }, '⚠️'),
      h('p', { class: 'mt-16', style: { fontWeight: 700 } }, 'うまく提案できませんでした'),
      h('p', { class: 'muted mt-8', style: { fontSize: '12px', textAlign: 'center', wordBreak: 'break-all' } }, e.message),
      h('div', { class: 'mt-24', style: { width: '100%', display: 'grid', gap: '12px' } },
        h('button', { class: 'btn primary', onclick: () => runLoading(root) }, 'もう一度ためす'),
        h('button', { class: 'btn ghost', onclick: () => showIntro(root, weekId, DEMO, learning) }, 'デモで試す'),
        h('button', { class: 'btn ghost', onclick: () => navigate('home') }, 'ホームに戻る')
      )
    )
  );
}

// 発表前のドラムロール画面
function showIntro(root, weekId, result, learning) {
  root.innerHTML = '';
  root.append(
    h('div', { class: 'meeting-center' },
      h('div', { class: 'font-display', style: { fontSize: '13px', letterSpacing: '.3em', color: 'var(--muted)' } }, 'THIS WEEK'),
      h('h1', { class: 'mt-8', style: { fontSize: '30px', fontWeight: 900, textAlign: 'center', lineHeight: 1.3 } },
        '今週の献立、\n発表します'.split('\n').reduce((f, t, i) => (i ? [...f, h('br'), t] : [t]), [])),
      h('p', { class: 'muted mt-16', style: { fontSize: '13px', textAlign: 'center' } },
        'カードをめくって1日ずつ発表。\n右で採用、左で不採用（理由を選ぶ）。下のボタンでもOK。'
          .split('\n').reduce((f, t, i) => (i ? [...f, h('br'), t] : [t]), [])),
      h('button', {
        class: 'btn primary mt-32', style: { maxWidth: '240px' },
        onclick: () => {
          // ここがユーザー操作の起点。iOSの音声アンロックを確実に行う。
          unlockAudio();
          startCards(root, weekId, result, learning);
        },
      }, '🥁 発表をはじめる')
    )
  );
}

/* ===================== カードスタック（スワイプ） ===================== */
function startCards(root, weekId, result, learning) {
  const plan = next7Days();                  // 明日からの7日 [{label,date}×7]
  const days = result.days.slice(0, 7);
  const alternates = [...(result.alternates || [])];
  const session = {
    dayIndex: 0,
    current: days.map(d => ({ ...d })),     // 各日の現在の料理（差し替えで変わる）
    original: days.map(d => d.name),         // 最初に提案された料理名（変更ログ用）
    accepted: [],                            // 確定した7日分
    rejected: [],                            // {name, reason}
    altPtr: 0,
  };

  root.innerHTML = '';
  const progress = h('div', { class: 'meeting-progress' });
  const stack = h('div', { class: 'card-stack' });
  const toast = h('div', { class: 'toast' });

  // カード外の操作ボタン（スワイプと同じ動作。発表後に有効化）
  const rejectBtn = h('button', { class: 'mc-ctrl reject', disabled: true },
    h('span', { class: 'ctrl-emoji' }, '👎'),
    h('span', { class: 'ctrl-label' }, '不採用')
  );
  const acceptBtn = h('button', { class: 'mc-ctrl accept', disabled: true },
    h('span', { class: 'ctrl-emoji' }, '👍'),
    h('span', { class: 'ctrl-label' }, '採用')
  );
  const controls = h('div', { class: 'meeting-controls' }, rejectBtn, acceptBtn);
  function setControls(on) { acceptBtn.disabled = rejectBtn.disabled = !on; }

  root.append(
    h('div', { class: 'meeting-head' },
      h('div', { class: 'font-display', style: { fontSize: '12px', letterSpacing: '.2em', color: 'var(--muted)' } }, 'KONDATE MEETING'),
      progress
    ),
    stack, toast, controls
  );

  function showToast(msg) {
    toast.textContent = msg; toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1400);
  }

  function renderProgress() {
    progress.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      progress.append(h('span', {
        class: 'dot' + (i < session.dayIndex ? ' done' : i === session.dayIndex ? ' now' : ''),
      }));
    }
  }

  function finish() {
    saveResult(weekId, session, learning).finally(() => {
      root.innerHTML = '';
      root.append(
        h('div', { class: 'meeting-center' },
          h('div', { style: { fontSize: '52px' } }, '🎉'),
          h('h1', { class: 'mt-16', style: { fontSize: '28px', fontWeight: 900 } }, '今週の献立、決定！'),
          h('p', { class: 'muted mt-8' }, 'おつかれさま。いただきます。'),
          h('button', { class: 'btn primary mt-32', style: { maxWidth: '240px' }, onclick: () => navigate('menu') }, '献立を見る')
        )
      );
      cheer(); confettiBurst(40); confetti(80);
    });
  }

  function nextDay() {
    session.dayIndex++;
    renderProgress();
    if (session.dayIndex >= 7) { finish(); return; }
    mountTop();
  }

  // 毎回ランダムなアニメを再生
  function pulse(btn, variants) {
    variants.forEach(v => btn.classList.remove(v));
    void btn.offsetWidth;        // リフローでアニメをリスタート
    const cls = pick(variants);
    btn.classList.add(cls);
    setTimeout(() => btn.classList.remove(cls), 800);
  }

  // ボタン中心から衝撃波リングを出す
  function shockwave(btn, tone) {
    const r = btn.getBoundingClientRect();
    const w = document.createElement('div');
    w.className = 'fx-shock ' + tone;
    w.style.left = (r.left + r.width / 2) + 'px';
    w.style.top = (r.top + r.height / 2) + 'px';
    document.body.append(w);
    setTimeout(() => w.remove(), 650);
  }

  // ボタンから絵文字をド派手に飛び散らせる
  function burstEmoji(btn, emojis, n) {
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'fx-emoji';
      s.textContent = pick(emojis);
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      s.style.setProperty('--dx', (Math.random() * 280 - 140).toFixed(0) + 'px');
      s.style.setProperty('--rot', (Math.random() * 140 - 70).toFixed(0) + 'deg');
      s.style.setProperty('--sc', (1.1 + Math.random() * 1.2).toFixed(2));
      s.style.fontSize = (26 + Math.random() * 22).toFixed(0) + 'px';
      s.style.animationDelay = (Math.random() * 0.12).toFixed(2) + 's';
      document.body.append(s);
      setTimeout(() => s.remove(), 1100);
    }
  }

  function accept() {
    const i = session.dayIndex;
    const dish = session.current[i];
    session.accepted.push({ ...dish, weekday: plan[i].label, date: plan[i].date });
    pulse(acceptBtn, POP_VARIANTS);
    shockwave(acceptBtn, 'ok');
    burstEmoji(acceptBtn, ACCEPT_EMOJI, 14 + (Math.random() * 4 | 0));
    cheer(); confettiBurst(36);
    nextDay();
  }

  function reject(reason) {
    const dish = session.current[session.dayIndex];
    session.rejected.push({ name: dish.name, reason });
    pulse(rejectBtn, SHAKE_VARIANTS);
    shockwave(rejectBtn, 'ng');
    burstEmoji(rejectBtn, REJECT_EMOJI, 10 + (Math.random() * 4 | 0));
    buzz();
    // 予備候補に差し替え
    if (session.altPtr < alternates.length) {
      const alt = alternates[session.altPtr++];
      session.current[session.dayIndex] = { ...alt };
      mountTop();
    } else {
      showToast('予備の候補がもうないよ。これで採用してね');
      mountTop();   // 同じ料理を出し直す（採用してもらう）
    }
  }

  // 現在の曜日のカードを積む（裏向きで出す → タップで発表 → 表に回転）
  function mountTop() {
    stack.innerHTML = '';
    setControls(false);   // 発表前は操作ボタンを無効化
    const i = session.dayIndex;
    const dish = session.current[i];
    const card = dishCard(plan[i], dish, i);
    stack.append(card);

    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      unlockAudio();

      // スポットライト演出は会議で一度きり（却下でやり直しても再生しない）
      const showStage = !session.spotlightShown;
      let stage = null;
      if (showStage) {
        session.spotlightShown = true;
        stage = buildSpotlightStage();
        document.body.append(stage);
      }
      card.classList.add('drumroll-shake');
      drumrollSound(showStage ? 1.5 : 0.85);

      const dayLabel = `${plan[i].date}（${plan[i].label}）`;
      const wait = showStage ? 1550 : 880;
      setTimeout(() => {
        card.classList.remove('drumroll-shake');
        if (stage) { stage.classList.add('out'); setTimeout(() => stage.remove(), 450); }
        // カードをしならせて裏返し、裏面のレシピを出す。完了後に操作を有効化
        curlReveal(card, dish, dayLabel, () => {
          const doReject = () => openReasonOverlay(card, reject);   // 却下は必ず理由を選ぶ
          attachSwipe(card, { onAccept: accept, onReject: doReject });
          acceptBtn.onclick = accept;
          rejectBtn.onclick = doReject;
          setControls(true);
        });
      }, wait);
    };

    // 最初の1枚だけタップで発表。2枚目以降は自動でめくる。
    if (session.dayIndex === 0) {
      card.addEventListener('click', reveal);
    } else {
      setTimeout(reveal, 550);
    }
  }

  renderProgress();
  mountTop();
}

function dishCard(day, dish, idx) {
  const dayLabel = `${day.date}（${day.label}）`;
  // 表面：料理の中身
  const ingredients = Array.isArray(dish.ingredients) ? dish.ingredients : [];
  const seasonings = Array.isArray(dish.seasonings) ? dish.seasonings : [];
  const front = h('div', { class: 'card-face card-front' },
    h('div', { class: 'mc-day font-display' }, dayLabel),
    h('div', { class: 'mc-name' }, dish.name),
    dish.reason && h('div', { class: 'mc-reason' }, dish.reason),
    dish.seasonal && h('div', { class: 'mc-seasonal' }, '🍂 ' + dish.seasonal),
    // 材料名だけ即時表示（採否の判断用。APIは呼ばない）
    (ingredients.length > 0 || seasonings.length > 0) && h('div', { class: 'mc-ing-box' },
      ingredients.length > 0 && h('div', { class: 'mc-ing' },
        h('span', { class: 'mc-ing-label' }, '🥬 材料'), ingredients.map(nameOnly).join('、')),
      seasonings.length > 0 && h('div', { class: 'mc-ing', style: { marginTop: '7px' } },
        h('span', { class: 'mc-ing-label' }, '🧂 調味料'), seasonings.map(nameOnly).join('、'))
    ),
    dish.kidsNote && h('div', { class: 'mc-kids' }, '👶 なぎ：' + dish.kidsNote),
    // 下部：作り方ボタン（カプセル）
    h('div', { class: 'mc-foot' },
      h('button', {
        class: 'mc-recipe-btn',
        onclick: e => { e.stopPropagation(); openRecipeModal(dish.name); },
        onpointerdown: e => e.stopPropagation(),     // スワイプ判定に食われないように
      }, '🍳 作り方')
    )
  );
  // 裏面：めくる前のデザイン
  const back = h('div', { class: 'card-face card-back' },
    h('div', { class: 'cb-mark font-display' }, 'KONDATE'),
    h('div', { class: 'cb-day' }, dayLabel),
    h('div', { class: 'cb-q' }, '？'),
    h('div', { class: 'cb-hint' }, idx === 0 ? 'タップして発表 🥁' : '🥁 発表！')
  );
  return h('div', { class: 'menu-card', 'data-idx': idx },
    h('div', { class: 'swipe-badge ok' }, '採用'),
    h('div', { class: 'swipe-badge ng' }, '却下'),
    h('div', { class: 'card-flipper' }, back, front)
  );
}

// 理由選択オーバーレイ（下スワイプ後）
function openReasonOverlay(card, rejectFn) {
  const overlay = h('div', { class: 'reason-overlay' },
    h('p', { style: { fontWeight: 700, marginBottom: '14px' } }, 'どうして却下？'),
    ...REASONS.map(r => h('button', {
      class: 'reason-btn',
      onclick: () => { overlay.remove(); rejectFn(r.key); },
    }, h('span', { style: { fontSize: '20px' } }, r.emoji), r.label)),
    h('button', { class: 'reason-btn cancel', onclick: () => { overlay.remove(); card.style.transform = ''; } }, 'やめる')
  );
  card.append(overlay);
}

// スワイプ操作（pointer events）右＝採用／左＝却下（必ず理由を選ぶ）
function attachSwipe(card, { onAccept, onReject }) {
  let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false;
  const TH = 90;
  const okBadge = card.querySelector('.swipe-badge.ok');
  const ngBadge = card.querySelector('.swipe-badge.ng');

  const down = e => {
    if (card.querySelector('.reason-overlay')) return;
    dragging = true; startX = e.clientX; startY = e.clientY;
    card.style.transition = 'none'; card.setPointerCapture?.(e.pointerId);
  };
  const move = e => {
    if (!dragging) return;
    dx = e.clientX - startX; dy = e.clientY - startY;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
    okBadge.style.opacity = dx > 20 ? Math.min(1, dx / TH) : 0;
    ngBadge.style.opacity = dx < -20 ? Math.min(1, -dx / TH) : 0;
  };
  const up = () => {
    if (!dragging) return;
    dragging = false; card.style.transition = '';
    if (dx > TH) {                                        // 右：採用（飛ばす）
      card.style.transform = `translate(${innerWidth}px, ${dy}px) rotate(20deg)`;
      setTimeout(onAccept, 180);
    } else if (dx < -TH) {                                // 左：却下 → 理由を選ぶ（カードは中央に戻す）
      card.style.transform = '';
      okBadge.style.opacity = ngBadge.style.opacity = 0;
      onReject();
    } else {                                              // 戻す
      card.style.transform = '';
      okBadge.style.opacity = ngBadge.style.opacity = 0;
    }
  };
  card.addEventListener('pointerdown', down);
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', up);
}

/* ===================== 保存（献立 + 学習DB） ===================== */
async function saveResult(weekId, session, learning) {
  const date = todayISO();
  // 献立を保存
  await fb.setMenu(weekId, {
    days: session.accepted,
    status: 'confirmed',
    confirmedAt: Date.now(),
    confirmedBy: state.me,
  });
  // 学習DBを追記
  const next = {
    rejected: [...(learning.rejected || [])],
    accepted: [...(learning.accepted || [])],
    changes:  [...(learning.changes  || [])],
  };
  session.rejected.forEach(r => { if (r.reason !== 'skip') next.rejected.push({ name: r.name, reason: r.reason, date }); });
  session.accepted.forEach((a, i) => {
    next.accepted.push({ name: a.name, date });
    const orig = session.original[i];
    if (orig && orig !== a.name) next.changes.push({ from: orig, to: a.name, date });
  });
  await fb.setLearning(next);
}
