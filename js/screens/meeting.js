// 会議画面：AIが7日分を提案 → ドラムロールで発表 → スワイプで採用/却下 → 確定保存。
//   右スワイプ  = 採用（パチパチ + 紙吹雪）
//   左スワイプ  = 却下（理由なし・ブーブー）→ 予備候補に差し替え
//   下スワイプ  = 却下（理由を選ぶ・ブーブー）→ 予備候補に差し替え
import { h } from '../dom.js';
import { navigate } from '../router.js';
import { state, currentWeekId, WEEKDAYS, todayISO, LABEL } from '../state.js';
import * as fb from '../firebase.js';
import { generateMenu } from '../gemini.js';

// Gemini未設定でもUIを試せるデモデータ
const DEMO = {
  days: [
    { weekday: '月', name: '鶏のはちみつ照り焼き', reason: '平日でも手早く満足感', seasonal: '', kidsNote: 'なぎは味付け前に取り分け' },
    { weekday: '火', name: '鮭ときのこのホイル焼き', reason: 'きのこが香る季節', seasonal: '秋はきのこが旨みたっぷりで旬', kidsNote: '' },
    { weekday: '水', name: '豚バラ大根の煮物', reason: '大根が安くて甘い時期', seasonal: '冬大根は煮るととろける', kidsNote: '' },
    { weekday: '木', name: '野菜たっぷり塩焼きそば', reason: '冷蔵庫の整理にも◎', seasonal: '', kidsNote: '' },
    { weekday: '金', name: '金曜はおうち餃子', reason: '週末前のお楽しみ', seasonal: '', kidsNote: 'なぎ用はにら少なめで' },
    { weekday: '土', name: 'ブリの照り焼き', reason: '脂がのって美味しい', seasonal: '寒ブリは冬が最高に旨い', kidsNote: '' },
    { weekday: '日', name: 'おでん', reason: '寒い日にほっとする', seasonal: '', kidsNote: '' },
  ],
  alternates: [
    { weekday: '', name: '麻婆豆腐', reason: 'ご飯がすすむ定番', seasonal: '', kidsNote: 'なぎ用は辛さ抜き' },
    { weekday: '', name: 'カレーライス', reason: 'みんな大好き', seasonal: '', kidsNote: '' },
    { weekday: '', name: 'ぶり大根', reason: '旬のぶりで', seasonal: 'ぶりは冬が旬', kidsNote: '' },
    { weekday: '', name: 'オムライス', reason: '休日のお楽しみ', seasonal: '', kidsNote: '' },
    { weekday: '', name: '鶏団子鍋', reason: '体が温まる', seasonal: '', kidsNote: '' },
    { weekday: '', name: 'ナポリタン', reason: '懐かしの味', seasonal: '', kidsNote: '' },
  ],
};

const REASONS = [
  { key: 'hate',  emoji: '😤', label: 'これは嫌い' },
  { key: 'stock', emoji: '🛒', label: '材料がない' },
  { key: 'heavy', emoji: '😮‍💨', label: '作るのが面倒' },
];

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
function clap() {
  try {
    const ac = audio();
    for (let i = 0; i < 3; i++) {
      const t = ac.currentTime + i * 0.09;
      const buf = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1) * (1 - j / data.length);
      const src = ac.createBufferSource(); src.buffer = buf;
      const g = ac.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      src.connect(g).connect(ac.destination); src.start(t);
    }
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
    ctx = { profiles, nagi, survey, learning, today: todayISO() };
  } catch (e) {
    ctx = { profiles: {}, nagi: {}, survey: {}, learning: {}, today: todayISO() };
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
        'カードをめくって1日ずつ発表。\n右に弾けば採用、左で却下、下で理由つき却下。'
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
  const days = result.days.slice(0, 7);
  const alternates = [...(result.alternates || [])];
  const session = {
    dayIndex: 0,
    current: days.map(d => ({ ...d })),     // 各曜日の現在の料理（差し替えで変わる）
    original: days.map(d => d.name),         // 最初に提案された料理名（変更ログ用）
    accepted: [],                            // 確定した7日分
    rejected: [],                            // {name, reason}
    altPtr: 0,
  };

  root.innerHTML = '';
  const progress = h('div', { class: 'meeting-progress' });
  const stack = h('div', { class: 'card-stack' });
  const toast = h('div', { class: 'toast' });
  root.append(
    h('div', { class: 'meeting-head' },
      h('div', { class: 'font-display', style: { fontSize: '12px', letterSpacing: '.2em', color: 'var(--muted)' } }, 'KONDATE MEETING'),
      progress
    ),
    stack, toast
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
      confetti(140);
    });
  }

  function nextDay() {
    session.dayIndex++;
    renderProgress();
    if (session.dayIndex >= 7) { finish(); return; }
    mountTop();
  }

  function accept() {
    const dish = session.current[session.dayIndex];
    session.accepted.push({ ...dish, weekday: WEEKDAYS[session.dayIndex] });
    clap(); confetti(60);
    nextDay();
  }

  function reject(reason) {
    const dish = session.current[session.dayIndex];
    session.rejected.push({ name: dish.name, reason });
    buzz();
    // 予備候補に差し替え
    if (session.altPtr < alternates.length) {
      const alt = alternates[session.altPtr++];
      session.current[session.dayIndex] = { ...alt, weekday: WEEKDAYS[session.dayIndex] };
      mountTop();
    } else {
      showToast('予備の候補がもうないよ。これで採用してね');
      mountTop();   // 同じ料理を出し直す（採用してもらう）
    }
  }

  // 現在の曜日のカードを積む（裏向きで出す → タップで発表 → 表に回転）
  function mountTop() {
    stack.innerHTML = '';
    const i = session.dayIndex;
    const dish = session.current[i];
    const card = dishCard(WEEKDAYS[i], dish, i);
    stack.append(card);

    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      unlockAudio();

      // カードの裏面にスポットライトを当てる
      const spotlight = h('div', { class: 'spotlight-overlay' });
      document.body.append(spotlight);
      card.classList.add('drumroll-shake');
      drumrollSound(0.85);

      setTimeout(() => {
        card.classList.remove('drumroll-shake');
        card.classList.add('revealed');           // ここで表に回転
        spotlight.classList.add('out');
        setTimeout(() => spotlight.remove(), 400);
        confetti(34);
        // 回転が終わってからスワイプを有効化
        setTimeout(() => {
          attachSwipe(card, {
            onAccept: accept,
            onRejectQuick: () => reject('skip'),
            onRejectReason: () => openReasonOverlay(card, reject),
          });
        }, 220);
      }, 880);
    };

    // 裏面タップ（=発表）で表に
    card.addEventListener('click', reveal);
  }

  renderProgress();
  mountTop();
}

function dishCard(weekday, dish, idx) {
  // 表面：料理の中身
  const front = h('div', { class: 'card-face card-front' },
    h('div', { class: 'mc-day font-display' }, weekday + 'よう日'),
    h('div', { class: 'mc-name' }, dish.name),
    dish.reason && h('div', { class: 'mc-reason' }, dish.reason),
    dish.seasonal && h('div', { class: 'mc-seasonal' }, '🍂 ' + dish.seasonal),
    dish.kidsNote && h('div', { class: 'mc-kids' }, '👶 なぎ：' + dish.kidsNote),
    h('div', { class: 'mc-hint muted' }, '→ 採用 ／ ← 却下 ／ ↓ 理由つき却下')
  );
  // 裏面：めくる前のデザイン
  const back = h('div', { class: 'card-face card-back' },
    h('div', { class: 'cb-mark font-display' }, 'KONDATE'),
    h('div', { class: 'cb-day' }, weekday + 'よう日'),
    h('div', { class: 'cb-q' }, '？'),
    h('div', { class: 'cb-hint' }, 'タップして発表 🥁')
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

// スワイプ操作（pointer events）
function attachSwipe(card, { onAccept, onRejectQuick, onRejectReason }) {
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
    if (dy > TH && Math.abs(dy) > Math.abs(dx)) {        // 下：理由つき却下
      card.style.transform = 'translateY(40px) scale(.98)';
      onRejectReason();
    } else if (dx > TH) {                                 // 右：採用
      card.style.transform = `translate(${innerWidth}px, ${dy}px) rotate(20deg)`;
      setTimeout(onAccept, 180);
    } else if (dx < -TH) {                                // 左：却下
      card.style.transform = `translate(${-innerWidth}px, ${dy}px) rotate(-20deg)`;
      setTimeout(onRejectQuick, 180);
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
