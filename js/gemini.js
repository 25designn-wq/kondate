// Gemini 連携。APIキーは state.geminiKey（この端末の localStorage）から取得する。
// 無料枠の gemini-2.0-flash を使用。呼び出しは「会議を始める」時の1回だけ。
import { state, LABEL } from './state.js';

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = key =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

// 学習DBが肥大化するとトークン消費が増えるため、各ログは直近のみ渡す。
const CAP = { rejected: 60, accepted: 40, changes: 30 };
const tail = (arr, n) => (Array.isArray(arr) ? arr.slice(-n) : []);

// プロンプト生成。ctx = { profiles, nagi, survey, learning, today }
export function buildPrompt(ctx) {
  const { profiles = {}, nagi = {}, survey = {}, learning = {}, today } = ctx;
  const prof = who => {
    const p = profiles[who] || {};
    return [
      `■ ${LABEL[who]}`,
      `  好きなジャンル: ${(p.genres || []).join('、') || '指定なし'}`,
      `  嫌い・NG食材: ${(p.dislikes || []).join('、') || 'なし'}`,
      `  目標: ${p.goal || 'なし'}`,
      `  使える調理器具: ${(p.tools || []).join('、') || '指定なし'}`,
    ].join('\n');
  };
  const sv = who => {
    const s = survey[who] || {};
    let text = `■ ${LABEL[who]}の今週の気分: ${s.mood || '特になし'}`;
    if (s.want)  text += `／食べたい: ${s.want}`;
    if (s.avoid) text += `／避けたい: ${s.avoid}`;
    if (s.fixed) text += `\n  ▷ 今週決まっているメニュー: ${s.fixed}`;
    return text;
  };

  const rejected = tail(learning.rejected, CAP.rejected);
  const neverAgain = rejected.filter(r => r.reason === 'hate').map(r => r.name);
  const heavy = rejected.filter(r => r.reason === 'heavy').map(r => r.name);
  const accepted = tail(learning.accepted, CAP.accepted).map(a => a.name);
  const changes = tail(learning.changes, CAP.changes);

  return `あなたは夫婦の夕食を提案する、気の利いた献立アシスタントです。
今日の日付は ${today} です。季節・旬を考慮し、暑い時期は冷たいもの・さっぱり、寒い時期は温かいものへ自然に寄せてください。

# 家族のプロフィール
${prof('husband')}
${prof('wife')}

# 子ども（なぎ）が食べられないもの
${(nagi.banned || []).join('、') || 'なし'}

# 今週のリクエスト
${sv('husband')}
${sv('wife')}

# これまでの学習（重要・必ず反映）
- 【二度と提案しない】嫌いと言われた料理: ${neverAgain.join('、') || 'なし'}
- 【頻度を下げる】面倒と言われた料理: ${heavy.join('、') || 'なし'}
- 最近採用された料理（似た系統を時々入れてよい）: ${accepted.join('、') || 'なし'}
- 過去の差し替え（左が却下→右が採用。好みのヒント）: ${changes.map(c => `${c.from}→${c.to}`).join('、') || 'なし'}

# 出力ルール
- 月曜から日曜までの7日分の夕食を提案する。「今週決まっているメニュー」がある場合はその曜日にそのメニューを使い、他の曜日には提案しない。
- 「二度と提案しない」料理は絶対に出さない。「頻度を下げる」料理は今週は避ける。
- 最近採用された料理と全く同じものは7日内で繰り返さない。
- 旬の食材を使う日は seasonal に一言（30字程度）コメントを入れる。旬でない日は seasonal を空文字に。
- なぎが食べられない食材を使う日は kidsNote に取り分け・代替の短い提案を入れる。問題ない日は空文字に。
- 各料理に、なぜ今日それを薦めるかの reason を20字程度で添える。
- 各料理に、主な材料 ingredients（5〜8個）と調味料 seasonings（3〜6個）を、買い物の判断に使えるよう簡潔な分量つきで入れる（例「鶏もも肉 300g」「醤油 大さじ2」）。
- 却下されたとき用に、days とは別の予備候補 alternates を6品用意する（同じ条件・形式）。

# 出力形式（このJSON以外は何も出力しない）
{
  "days": [
    { "weekday": "月", "name": "料理名", "reason": "理由", "seasonal": "", "kidsNote": "",
      "ingredients": ["鶏もも肉 300g", "玉ねぎ 1個"], "seasonings": ["醤油 大さじ2", "みりん 大さじ1"] }
    // 火〜日も同様に、合計7要素
  ],
  "alternates": [
    { "name": "予備の料理名", "reason": "理由", "seasonal": "", "kidsNote": "",
      "ingredients": ["..."], "seasonings": ["..."] }
    // 合計6要素
  ]
}`;
}

export async function generateRecipe(dishName) {
  if (!state.geminiKey) throw new Error('NO_KEY');
  const res = await fetch(ENDPOINT(state.geminiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `「${dishName}」のレシピを教えてください。2〜3人分の目安で。
JSON形式のみで出力（他は何も書かない）：
{
  "ingredients": ["食材1 量", "食材2 量"],
  "seasonings": ["調味料1 量", "調味料2 量"],
  "steps": ["手順1", "手順2"]
}` }] }],
      generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`API_${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  try { return JSON.parse(text); }
  catch { throw new Error('PARSE'); }
}

export async function generateMenu(ctx) {
  if (!state.geminiKey) throw new Error('NO_KEY');
  const res = await fetch(ENDPOINT(state.geminiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(ctx) }] }],
      generationConfig: { temperature: 0.95, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`API_${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('PARSE: ' + text.slice(0, 200)); }
  if (!parsed?.days || !Array.isArray(parsed.days)) throw new Error('SHAPE');
  return { days: parsed.days, alternates: Array.isArray(parsed.alternates) ? parsed.alternates : [] };
}
