// 無料のキーワード判定で自動フォルダ分け
export const FOLDERS = [
  { key: 'baby',  label: '離乳食',       emoji: '🍼' },
  { key: 'kids',  label: 'こどもごはん', emoji: '🧒' },
  { key: 'meat',  label: 'メイン(肉)',   emoji: '🍖' },
  { key: 'fish',  label: 'メイン(魚)',   emoji: '🐟' },
  { key: 'rice',  label: '米・ごはん',   emoji: '🍚' },
  { key: 'side',  label: '副菜',         emoji: '🥗' },
  { key: 'sweet', label: 'お菓子',       emoji: '🍰' },
  { key: 'bread', label: 'パン',         emoji: '🍞' },
  { key: 'other', label: 'その他',       emoji: '📁' }
];

// [キーワード, 点数]。強い決め手ほど高得点
const RULES = {
  baby:  [['離乳食', 10], ['初期', 2], ['中期', 2], ['後期', 2], ['完了期', 5], ['ゴックン', 6], ['モグモグ期', 6], ['カミカミ期', 6], ['パクパク期', 6], ['ヶ月', 2], ['か月', 2], ['ベビー', 3], ['赤ちゃん', 4], ['bfood', 6], ['離乳', 8]],
  kids:  [['幼児食', 10], ['幼児', 6], ['こどもごはん', 10], ['子どもごはん', 10], ['キッズ', 5], ['子ども', 3], ['子供', 3], ['こども', 3], ['息子', 2], ['娘', 2], ['完食', 3], ['取り分け', 4], ['キャラ弁', 6], ['園', 1]],
  meat:  [['豚', 4], ['牛', 4], ['鶏', 4], ['ひき肉', 5], ['挽肉', 5], ['合挽', 5], ['ささみ', 5], ['むね肉', 5], ['もも肉', 5], ['手羽', 5], ['ベーコン', 2], ['ソーセージ', 2], ['ウインナー', 2], ['ハンバーグ', 6], ['唐揚げ', 6], ['からあげ', 6], ['生姜焼き', 6], ['とんかつ', 6], ['ステーキ', 6], ['肉じゃが', 6], ['チキン', 4], ['ポーク', 4], ['ビーフ', 4], ['焼肉', 5], ['角煮', 6], ['餃子', 4], ['肉', 2]],
  fish:  [['鮭', 5], ['さけ', 3], ['サーモン', 5], ['鯖', 5], ['さば', 4], ['サバ', 5], ['ぶり', 5], ['鰤', 5], ['たら', 3], ['鱈', 5], ['あじ', 3], ['鯵', 5], ['いわし', 5], ['さんま', 5], ['かじき', 5], ['まぐろ', 5], ['マグロ', 5], ['えび', 4], ['海老', 4], ['エビ', 4], ['いか', 3], ['イカ', 4], ['たこ', 3], ['タコ', 4], ['ほたて', 4], ['帆立', 4], ['あさり', 4], ['魚', 4], ['ブリ', 5], ['タラ', 5], ['アジ', 5], ['イワシ', 5], ['サンマ', 5], ['ホタテ', 4], ['アサリ', 4], ['カジキ', 5], ['サケ', 4], ['シャケ', 5], ['照り焼き', 1], ['煮付け', 4], ['ムニエル', 5], ['刺身', 5], ['ツナ', 1], ['しらす', 1]],
  rice:  [['ご飯', 3], ['ごはん', 2], ['炊き込み', 8], ['丼', 7], ['チャーハン', 8], ['炒飯', 8], ['おにぎり', 8], ['リゾット', 7], ['ピラフ', 7], ['オムライス', 7], ['寿司', 6], ['ドリア', 6], ['雑炊', 7], ['おかゆ', 6], ['お粥', 6], ['混ぜご飯', 8], ['炊飯器', 3], ['米', 3], ['ライス', 4], ['パエリア', 7], ['ビビンバ', 7]],
  side:  [['副菜', 10], ['サラダ', 7], ['和え', 6], ['ナムル', 8], ['おひたし', 8], ['お浸し', 8], ['きんぴら', 8], ['小鉢', 7], ['漬け', 4], ['マリネ', 6], ['白和え', 8], ['ごま和え', 8], ['煮浸し', 7], ['作り置き', 3], ['もう一品', 6], ['スープ', 4], ['味噌汁', 5], ['汁', 2], ['ポテト', 3], ['野菜', 2]],
  sweet: [['お菓子', 10], ['おやつ', 7], ['スイーツ', 8], ['ケーキ', 7], ['クッキー', 8], ['マフィン', 8], ['プリン', 8], ['ゼリー', 7], ['チーズケーキ', 9], ['タルト', 8], ['ブラウニー', 8], ['ガトーショコラ', 9], ['ホットケーキ', 7], ['パンケーキ', 7], ['ドーナツ', 7], ['アイス', 6], ['チョコ', 4], ['グラニュー糖', 3], ['バニラ', 4], ['シフォン', 8], ['スコーン', 7], ['和菓子', 9], ['大福', 8], ['白玉', 6]],
  bread: [['パン', 8], ['食パン', 9], ['ベーグル', 9], ['強力粉', 6], ['イースト', 7], ['発酵', 4], ['二次発酵', 8], ['生地', 1], ['フォカッチャ', 9], ['ロールパン', 9], ['ちぎりパン', 9], ['トースト', 5], ['サンドイッチ', 6], ['ホームベーカリー', 8], ['成形', 3]]
};

// 誤爆しやすい語を先に消す（例：フライパン・パン粉 は「パン」ではない）
const NOISE = ['フライパン', 'パン粉', 'パンチ', 'ジャパン', 'ごはんのお供', 'お米を', '牛乳', '豆乳', '鶏ガラ', '牛脂', '魚焼き', '魚肉ソーセージ'];

export function classify(text) {
  let t = (text || '').replace(/\s+/g, '');
  for (const n of NOISE) t = t.split(n).join('');
  const lower = t.toLowerCase();
  const scores = {};
  for (const [key, rules] of Object.entries(RULES)) {
    let s = 0;
    for (const [kw, pt] of rules) {
      const k = kw.toLowerCase();
      let i = 0, c = 0;
      while ((i = lower.indexOf(k, i)) !== -1 && c < 3) { c++; i += k.length; }
      s += pt * c;
    }
    scores[key] = s;
  }
  // 離乳食・こども向けは「対象」が決め手なので、ある程度当たれば優先
  if (scores.baby >= 8) return 'baby';
  if (scores.kids >= 8) return 'kids';
  // お菓子・パンは材料（肉など）が少し出ても優先
  if (scores.sweet >= 8 && scores.sweet >= scores.meat) return 'sweet';
  if (scores.bread >= 8 && scores.bread >= scores.meat) return 'bread';
  let best = 'other', bs = 3; // 3点以下は「その他」
  for (const [k, s] of Object.entries(scores)) if (s > bs) { best = k; bs = s; }
  return best;
}

// OCR等の文字から「材料」「作り方」をざっくり切り出す
const ING_KW = '材料|用意するもの|ざいりょう';
const STEP_KW = '作り方|作りかた|つくり方|つくりかた|手順|工程';
const STEP_MARK = /^([①-⑳]|[\d０-９]{1,2}\s*[\.\)．）、]|[\(（][\d０-９]{1,2}[\)）]|STEP\s*\d)/i;
// 見出しの判定：「く材料＞」「【作り方】」「材料（2人分）」はOK、「①材料を混ぜる」のような手順文はNG
function heading(l) {
  if (l.length > 24 || STEP_MARK.test(l)) return null;
  const m = l.match(new RegExp(`^[^\\p{L}\\p{N}]{0,3}[くぐ]?(${ING_KW}|${STEP_KW})(.*)$`, 'u'));
  if (!m) return null;
  const tail = m[2].replace(/[\s:：】\]＞>〉》」』)）◆◇■□●○★☆♪・\-–—ー~〜]/g, '');
  if (/コツ|ポイント|POINT|動画|リール|はこちら/i.test(tail)) return null;  // 「作り方のコツ」はメモ扱い
  // 残りは「2人分」「（4個分）」程度まで。助詞や動詞が続くなら本文
  if (tail.length > 10 || /[をにでてがはるた]/.test(tail.replace(/[\d０-９]+.{0,3}分|人前|分量/g, ''))) return null;
  return new RegExp(ING_KW).test(m[1]) ? 'ing' : 'steps';
}
// 「・豚バラ肉 6枚」「砂糖　大さじ1」のような材料らしい行
const QTY = '[\\d０-９]|大さじ|小さじ|大匙|小匙|適量|少々|適宜|お好み|ひとつまみ|少量|半分|半量|ひとかけ|一つまみ|カップ';
const ING_LINE = new RegExp(`^[・\\-◯◎●○◆*＊]?\\s*[^\\s。]{1,20}?[\\s　:：…]+(?:${QTY})[^。！!？?]{0,12}$`);
const BULLET = /^[・◯◎●○＊*]\s*[^。！!？?\s]{1,18}$/;
const SUBHEAD = /^[【\[《〈＜<◆■]?[^\s。、]{1,14}[】\]》〉＞>◆■]?[:：]?$/;
const isIng = l => ING_LINE.test(l);
const SEP = /^[-–—_=─━⸻]{2,}/;

export function splitRecipe(text) {
  // 改行が消えて1行に詰まった本文でも、見出しや①②の前で区切り直す
  const src = (text || '')
    .replace(new RegExp(`([^\\n])\\s*((?:[【\\[＜<〈《◆■●★]|[くぐ](?=(?:${ING_KW}|${STEP_KW})[＞>〉》]))(?:${ING_KW}|${STEP_KW}))`, 'g'), '$1\n$2')
    .replace(new RegExp(`^(.{0,3}(?:${ING_KW}|${STEP_KW}).{0,10}?[＞>〉》】\\]])[ \\t　]*(?=\\S)`, 'gm'), '$1\n')
    .replace(/([^\n①-⑳〜~、])\s*([①-⑳])(?![をでのとにへ、〜~ー\-①-⑳])/g, '$1\n$2')
    .replace(/[ \t　]+(?=[・◯◎●○]|[-–—_=─━⸻]{2,}|📍|#)/g, '\n');
  const lines = src.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const ing = [], steps = [], rest = [];
  let mode = 'rest', auto = false;  // auto=見出しなしで材料らしい行を拾っている途中
  lines.forEach((l, i) => {
    const h = heading(l);
    if (h) { mode = h; auto = false; return; }
    if (SEP.test(l) || /^.{0,3}(POINT|ポイント|コツ)/i.test(l) || /^【[^】]*(コツ|ポイント)[^】]*】/.test(l)) { mode = 'rest'; auto = false; rest.push(l); return; }
    if (/^#/.test(l)) { mode = 'rest'; auto = false; rest.push(l); return; }
    // 材料の途中でも ①・1. が出てきたら作り方に切り替える
    if (mode === 'ing' && STEP_MARK.test(l)) { mode = 'steps'; auto = false; }
    if (mode === 'ing') {
      // 見出しなしで拾った材料ブロックは、材料らしくない行が来たら終わり
      if (!auto || isIng(l) || BULLET.test(l)) { ing.push(l); return; }
      mode = 'rest'; auto = false;
    }
    // 見出しが無くても「【甘辛タレ】＋材料行」「材料行が続く」は材料として拾う
    if (!STEP_MARK.test(l)) {
      const next = lines[i + 1] || '', next2 = lines[i + 2] || '';
      const ingNext = isIng(next) || (BULLET.test(next) && isIng(next2));
      if (SUBHEAD.test(l) && !BULLET.test(l) && ingNext) { ing.push(l); mode = 'ing'; auto = true; return; }
      if (isIng(l) && (ingNext || BULLET.test(next))) { ing.push(l); mode = 'ing'; auto = true; return; }
      if (mode !== 'steps' && BULLET.test(l) && isIng(next)) { ing.push(l); mode = 'ing'; auto = true; return; }
    }
    if (mode === 'steps') steps.push(l);
    else if (STEP_MARK.test(l)) steps.push(l);
    else rest.push(l);
  });
  return { ing, steps, rest };
}

// 料理名の推定：【れんこんメンチカツ】のような見出しを優先
export function guessTitle(text) {
  const m = (text || '').match(/[【\[]([^】\]\n]{2,30})[】\]]/g) || [];
  for (const b of m) {
    const s = b.slice(1, -1).trim();
    if (!/材料|作り方|作りかた|手順|ポイント|POINT/i.test(s)) return s;
  }
  for (const l of (text || '').split(/\r?\n/)) {
    const s = l.replace(/#\S+/g, '').replace(/https?:\/\/\S+/g, '').replace(/^[「『]/, '').trim();
    if (s.length >= 2) return s.slice(0, 40);
  }
  return '無題のレシピ';
}

// 「2人分」「3〜4人前」「材料（4個分）」などの分量表記を拾う（人数を最優先）
const SV_NUM = String.raw`(?:約\s*)?[\d一二三四五六七八九十]+(?:\.\d+)?(?:\s*[〜~\-−・]\s*[\d一二三四五六七八九十]+)?`;
const SV_PEOPLE = new RegExp(String.raw`${SV_NUM}\s*(?:人前|人分|人份|名分|食分|皿分|人用)`);
const SV_OTHER = new RegExp(String.raw`(?:(?:直径)?\s*\d+\s*(?:cm|センチ)\s*(?:の|パウンド|丸|角)?\s*型\s*)?${SV_NUM}\s*(?:個分|枚分|本分|台分|杯分|切れ分|カップ分|合分|回分|食分|玉分)`);
export function guessServings(text) {
  const t = (text || '').normalize('NFKC');
  // 「個分・枚分」は材料行（ご飯 1杯分 等）と紛らわしいので、材料見出し・分量・カッコ書きの行だけで探す
  const m = t.match(SV_PEOPLE) ||
    t.split(/\n/).filter(l => /材料|分量|できあがり|出来上がり|[(（【<＜]/.test(l)).map(l => l.match(SV_OTHER)).find(Boolean);
  return m ? m[0].replace(/\s+/g, '').replace(/[~\-−]/g, '〜') : '';
}

// ---------- 人数に合わせた分量の計算 ----------
// 基準の人数（「2〜3人分」なら少ない方の2）。人数の書き方でなければ 0
export function baseServings(srv) {
  const m = (srv || '').match(/(\d+(?:\.\d+)?)(?:〜\d+)?(?:人前|人分|人份|名分|食分|皿分|人用)/);
  return m ? parseFloat(m[1]) : 0;
}
const SEASON = /塩|醤油|しょうゆ|しょう油|砂糖|さとう|みりん|酒|味噌|みそ|酢|こしょう|胡椒|コショウ|だし|ダシ|コンソメ|鶏がら|鶏ガラ|顆粒|ソース|ケチャップ|マヨ|オイスター|豆板醤|コチュジャン|甜麺醤|めんつゆ|ポン酢|ぽん酢|塩麹|はちみつ|蜂蜜|カレー粉|ルー|ナンプラー|にんにくチューブ|しょうがチューブ|わさび|からし|ラー油|ごま油|味の素|うま味|ほんだし|昆布茶|焼肉のたれ|たれ|タレ/;
const SPOON = /大さじ|小さじ|大匙|小匙|カップ/;
const NUM_RE = /(\d+)\s*と\s*(\d+)\s*\/\s*(\d+)|(\d+)\s*\/\s*(\d+)|(\d+(?:\.\d+)?)|([½⅓⅔¼¾])/g;
const VULGAR = { '½': .5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': .25, '¾': .75 };
function tokVal(m) {
  if (m[1]) return +m[1] + m[2] / m[3];
  if (m[4]) return m[4] / m[5];
  if (m[6]) return parseFloat(m[6]);
  return VULGAR[m[7]];
}
function fmtSpoon(v) {        // 大さじ・小さじは分数で（1以上は 1/2 刻み、1未満は 1/4 刻み）
  const q = v >= 1 ? Math.round(v * 2) * 2 : Math.max(1, Math.round(v * 4)), w = Math.floor(q / 4), r = q % 4;
  const fr = ['', '1/4', '1/2', '3/4'][r];
  return w && fr ? `${w}と${fr}` : w ? `${w}` : fr;
}
function fmtNum(v, unit) {
  if (/^(g|グラム|ml|mL|cc|ミリ)/i.test(unit)) {
    if (v >= 100) return String(Math.round(v / 10) * 10);
    if (v >= 20) return String(Math.round(v / 5) * 5);
    return String(Math.max(1, Math.round(v)));
  }
  // 個・本・枚などは 1/2個 のような分数で（1/3本 → 2/3本 のような3等分も残す）
  const t3 = Math.round(v * 3);
  if (v < 3 && t3 % 3 && Math.abs(v * 3 - t3) < 0.05) { const w = Math.floor(t3 / 3), r = t3 % 3; return w ? `${w}と${r}/3` : `${r}/3`; }
  return fmtSpoon(v);
}
// 1行の数量を f 倍する。onlyUnits=true なら単位付きの量（大さじ・g・ml等）だけ変える（作り方の文向け）
export function scaleLine(line, f, onlyUnits = false) {
  if (!f || f === 1) return { text: line, season: false, changed: false };
  // 全角数字だけ半角に（NFKCは①や½まで崩すので使わない）
  const src = line.replace(/[０-９．／]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const season = onlyUnits ? SPOON.test(src) : (SEASON.test(src) || SPOON.test(src));
  let changed = false;
  const text = src.replace(NUM_RE, (all, ...g) => {
    const off = g[7], m = [all, ...g.slice(0, 7)];
    const before = src.slice(Math.max(0, off - 4), off), after = src.slice(off + all.length, off + all.length + 4);
    if (/^\s*(℃|度|W|秒|%|分(?!の)|時間|cm\s*角|mm)/.test(after) || /[①-⑳]$/.test(before)) return all;
    const spoon = /(大さじ|小さじ|大匙|小匙|カップ)\s*$/.test(before);
    const unit = (after.match(/^\s*(\S+)/) || [, ''])[1];
    if (onlyUnits && !spoon && !/^(g|グラム|ml|mL|cc)/i.test(unit)) return all;
    // 「〜3」のような範囲の後ろ側、名前の中の数字以外は全部対象
    const v = tokVal(m) * f;
    changed = true;
    const out = v2 => spoon ? fmtSpoon(v2) : fmtNum(v2, unit);
    if (season && f > 1 && (!onlyUnits || spoon)) {
      // 調味料は単純に掛けると濃くなりやすいので「少なめ〜そのまま掛け算」の幅で出す
      const lo = out(tokVal(m) * (1 + (f - 1) * 0.7)), hi = out(v);
      return lo === hi ? hi : `${lo}〜${hi}`;
    }
    return out(v);
  });
  return { text, season: season && f > 1 && changed, changed };
}
