import { FOLDERS, classify, splitRecipe, guessTitle, guessServings, baseServings, scaleLine } from './classify.js';

// ---------- DB ----------
let dbp;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('recipe-db', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('recipes')) d.createObjectStore('recipes', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('inbox')) d.createObjectStore('inbox', { keyPath: 'k', autoIncrement: true });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = () => rej(t.error);
  });
}
const all = s => tx(s, 'readonly', st => st.getAll());
const put = r => tx('recipes', 'readwrite', st => st.put(r));
const del = id => tx('recipes', 'readwrite', st => st.delete(id));
const get = id => tx('recipes', 'readonly', st => st.get(id));

// ---------- 小物 ----------
const $ = s => document.querySelector(s);
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// ---------- フォルダ（標準＋自分で追加したもの。設定はこのスマホに保存） ----------
const FKEY = 'recipe-folders';
let fcfg = (() => { try { return JSON.parse(localStorage.getItem(FKEY)) || {}; } catch { return {}; } })();
fcfg.custom ||= []; fcfg.hidden ||= []; fcfg.order ||= [];
function saveFolderCfg() { try { localStorage.setItem(FKEY, JSON.stringify(fcfg)); } catch { } }
const OTHER = FOLDERS.find(f => f.key === 'other');
// 並び順（fcfg.order）に従って並べる。順番に無いものは標準→自分用の順で後ろへ
function sortedFolders() {
  const all = [...FOLDERS.filter(f => f.key !== 'other'), ...fcfg.custom];
  const pos = k => { const i = fcfg.order.indexOf(k); return i < 0 ? 1000 + all.findIndex(f => f.key === k) : i; };
  return all.sort((a, b) => pos(a.key) - pos(b.key));
}
function folders() {
  return [...sortedFolders().filter(f => !fcfg.hidden.includes(f.key)), OTHER];
}
const folder = k => folders().find(f => f.key === k) || OTHER;
// 自分のフォルダのキーワードを優先し、なければ標準の自動判定
function autoFolder(text) {
  const t = (text || '').toLowerCase();
  let best = null, bs = 0;
  for (const f of fcfg.custom) {
    const s = (f.words || []).filter(w => w && t.includes(w.toLowerCase())).length;
    if (s > bs) { best = f.key; bs = s; }
  }
  if (best) return best;
  const k = classify(text);
  return fcfg.hidden.includes(k) ? 'other' : k;
}
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), ms);
}
// ---------- インスタURLからキャプションを自動取得 ----------
// ブラウザから直接インスタは読めないため、公開ページ読み取りサービス(r.jina.ai)を経由する
function cleanIgUrl(u) {
  u = (u || '').match(/https?:\/\/\S+/)?.[0] || '';
  // instagram.com/reel/ID, /p/ID, /ユーザー名/reel/ID などに対応
  const m = u.match(/https?:\/\/(?:www\.|m\.)?instagram\.com\/(?!share\/)(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/i);
  if (m) return `https://www.instagram.com/${m[1].toLowerCase() === 'reels' ? 'reel' : m[1].toLowerCase()}/${m[2]}/`;
  // /share/… や instagr.am などの短縮リンクはそのまま渡す（読み取りサービスがリダイレクトを辿る）
  if (/https?:\/\/(?:www\.)?(instagram\.com|instagr\.am)\//i.test(u)) return u.replace(/[?#].*$/, '');
  return '';
}
async function fetchCaption(url) {
  const ig = cleanIgUrl(url);
  if (!ig) return null;
  let res;
  for (let i = 0; i < 2; i++) {  // 一時的な失敗に備えて1回だけ再試行
    try { res = await fetch('https://r.jina.ai/' + ig, { headers: { 'X-Return-Format': 'html' } }); if (res.ok) break; }
    catch (e) { if (i) throw new Error('通信できませんでした'); }
  }
  if (!res.ok) throw new Error('取得失敗 ' + res.status);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const meta = p => doc.querySelector(`meta[property="${p}"]`)?.getAttribute('content') || '';
  let cap = meta('og:description');
  if (!cap) throw new Error('キャプションが見つかりません（非公開投稿？）');
  // 末尾の「 - 日付、いいね…件 - アカウント名」を除去し、外側の「」を外す
  cap = cap.replace(/\s+-\s+[^\n]*?(いいね|likes)[^\n]*$/i, '').trim();
  cap = cap.replace(/^「([\s\S]*)」$/, '$1').trim();
  cap = cap.replace(/^[\d,.]+\s*(likes?|件)[\s\S]*?:\s*"([\s\S]*)"\.?$/i, '$2').trim();
  let image = null;
  const img = meta('og:image');
  if (img) { try { const r = await fetch(img); if (r.ok) image = await r.blob(); } catch { } }
  return { text: cap, image, imageUrl: img };
}
async function autoCaption(r) {
  if (!r.url || r.captionFetched) return false;
  try {
    toast('キャプションを取得中…', 30000);
    const c = await fetchCaption(r.url);
    if (!c) return false;
    r.text = c.text + (r.text ? '\n\n' + r.text : '');
    if (c.image) r.images = [c.image, ...(r.images || [])];
    else if (c.imageUrl) r.cover = c.imageUrl;
    r.captionFetched = true;
    if (!r.title || r.title === '無題のレシピ') r.title = guessTitle(r.text);
    if (!r.folderManual) r.folder = autoFolder(r.title + '\n' + r.text);
    toast('キャプションを取得しました✅');
    return true;
  } catch (e) { toast('キャプション自動取得に失敗：' + e.message + '（スクショで追加できます）', 5000); return false; }
}
const urls = new Map();
function blobUrl(b) { if (!urls.has(b)) urls.set(b, URL.createObjectURL(b)); return urls.get(b); }

// ---------- 画面点灯キープ ----------
let lock = null, wantLock = false;
async function keepAwake(on) {
  wantLock = on;
  try {
    if (on && !lock && 'wakeLock' in navigator) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) { await lock.release(); lock = null; }
  } catch (e) { console.warn(e); }
  const b = $('#awake'); if (b) b.textContent = lock ? '💡 画面点灯キープ中' : '💤 点灯キープできませんでした';
}
document.addEventListener('visibilitychange', () => { if (wantLock && document.visibilityState === 'visible') keepAwake(true); });

// ---------- OCR（スクショ→文字） ----------
let worker;
async function ocr(blobs, onProg) {
  if (!window.Tesseract) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      s.onload = res; s.onerror = () => rej(new Error('OCRの読み込みに失敗（通信を確認）'));
      document.head.appendChild(s);
    });
  }
  onProg?.('文字認識を準備中…（初回は少し時間がかかります）');
  worker ||= await Tesseract.createWorker('jpn');
  const out = [];
  for (let i = 0; i < blobs.length; i++) {
    onProg?.(`文字を読み取り中… ${i + 1}/${blobs.length}`);
    const { data } = await worker.recognize(blobs[i]);
    out.push(cleanOcr(data.text));
  }
  return out.join('\n\n');
}
function cleanOcr(t) {
  const J = '[\\u3000-\\u30ff\\u4e00-\\u9fff\\uff00-\\uffef]';
  return t.replace(new RegExp(`(${J}) +(?=${J})`, 'g'), '$1').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- 状態・画面遷移 ----------
const state = { folder: 'all', q: '' };
function setHeader(title, back) {
  $('#ttl').textContent = title;
  $('#back').classList.toggle('hidden', !back);
  $('#fab').classList.toggle('hidden', !!back);
}
$('#back').onclick = () => { keepAwake(false); location.hash = '#/'; };
$('#fab').onclick = () => { location.hash = '#/new'; };
$('#menu').onclick = () => { location.hash = '#/settings'; };
window.addEventListener('hashchange', route);

async function route() {
  const h = location.hash || '#/';
  if (!h.startsWith('#/r/')) keepAwake(false);
  window.scrollTo(0, 0);
  if (h === '#/new') return editView(null);
  if (h === '#/settings') return settingsView();
  if (h === '#/inbox') return inboxView();
  let m;
  if ((m = h.match(/^#\/r\/([^/]+)\/edit$/))) return editView(await get(m[1]));
  if ((m = h.match(/^#\/r\/([^/]+)$/))) return detailView(m[1]);
  return listView();
}

// ---------- 一覧 ----------
async function listView() {
  setHeader('🍳 おうちレシピ帳', false);
  const rs = (await all('recipes')).sort((a, b) => b.created - a.created);
  const cnt = k => rs.filter(r => r.folder === k).length;
  const q = state.q.trim().toLowerCase();
  const shown = rs.filter(r => (state.folder === 'all' || r.folder === state.folder || (state.folder === 'fav' && r.fav)) &&
    (!q || (r.title + ' ' + r.text).toLowerCase().includes(q)));
  view.innerHTML = `<div class="wrap">
    <input class="search" id="q" placeholder="🔍 料理名・材料で検索" value="${esc(state.q)}">
    <div class="chips">
      <button class="chip ${state.folder === 'all' ? 'on' : ''}" data-f="all">すべて<b>${rs.length}</b></button>
      <button class="chip ${state.folder === 'fav' ? 'on' : ''}" data-f="fav">⭐ お気に入り<b>${rs.filter(r => r.fav).length}</b></button>
      ${folders().map(f => `<button class="chip ${state.folder === f.key ? 'on' : ''}" data-f="${f.key}">${f.emoji} ${f.label}<b>${cnt(f.key)}</b></button>`).join('')}
    </div>
    ${shown.length ? `<div class="grid">${shown.map(card).join('')}</div>` :
      `<div class="empty">${rs.length ? '該当するレシピがありません' : 'まだレシピがありません<br>インスタの投稿で「シェア」→「レシピ帳」で保存できます<br>右下の＋から手動でも追加できます'}</div>`}
  </div>`;
  const qi = $('#q');
  qi.oninput = () => { state.q = qi.value; listView().then(() => { const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); };
  view.querySelectorAll('.chip').forEach(b => b.onclick = () => { state.folder = b.dataset.f; listView(); });
  view.querySelectorAll('.card').forEach(b => b.onclick = () => { location.hash = '#/r/' + b.dataset.id; });
}
function card(r) {
  const f = folder(r.folder);
  const cv = r.images?.[0] ? `<img src="${blobUrl(r.images[0])}" alt="">` :
    r.cover ? `<img src="${esc(r.cover)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith('${f.emoji}')">` : f.emoji;
  return `<button class="card" data-id="${r.id}"><div class="cv">${cv}</div><div class="t">${esc(r.title)}</div><div class="f">${f.emoji} ${f.label}${r.fav ? ' ⭐' : ''}${(sv => sv ? ` · 🍽${esc(sv)}` : '')(guessServings(r.text))}</div></button>`;
}

// ---------- 詳細（料理モード：画面点灯キープ） ----------
async function detailView(id) {
  const r = await get(id);
  if (!r) { location.hash = '#/'; return; }
  setHeader(r.title, true);
  const { ing, steps, rest } = splitRecipe(r.text);
  const srv = guessServings(r.text);
  const done = new Set(r.done || []);
  // 人数の切り替え：「2人分」と分かれば人数ボタン、分からなければ倍率ボタン
  const base = baseServings(srv), f = r.scale || 1;
  const opts = base ? [...new Set([1, 2, 3, 4, 5, 6, base])].sort((a, b) => a - b).map(n => ({ f: n / base, label: `${n}人` }))
    : [[.5, '×½'], [1, '×1'], [1.5, '×1.5'], [2, '×2'], [3, '×3']].map(([v, label]) => ({ f: v, label }));
  const cur = opts.find(o => Math.abs(o.f - f) < 1e-6);
  const isHead = l => /^[【\[《〈＜<◆■][^】\]》〉＞>]{1,20}[】\]》〉＞>◆■]$/.test(l);
  const ingS = ing.map(l => isHead(l) ? { text: l } : scaleLine(l, f));
  const stepS = steps.map(l => scaleLine(l, f, true));
  const anySeason = ingS.some(x => x.season);
  const li = (arr, p) => arr.map((x, i) => isHead(x.text) ? `<div class="subh"><b>${esc(x.text)}</b></div>` : `<label class="chk ${done.has(p + i) ? 'done' : ''}"><input type="checkbox" data-k="${p + i}" ${done.has(p + i) ? 'checked' : ''}><span>${esc(x.text)}${x.season ? ' <span class="slt">🧂</span>' : ''}</span></label>`).join('');
  view.innerHTML = `<div class="wrap big">
    <span class="awake" id="awake">💡 画面点灯キープ中</span>
    <div class="row">
      <select class="in" id="fsel" style="flex:1">${folders().map(f => `<option value="${f.key}" ${f.key === r.folder ? 'selected' : ''}>${f.emoji} ${f.label}</option>`).join('')}</select>
      <button class="btn sub" id="fav">${r.fav ? '⭐' : '☆'}</button>
    </div>
    ${r.url ? `<div class="row"><a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener">▶ インスタで動画を見る</a></div>` : ''}
    ${srv ? `<div class="srv">🍽 分量：<b>${esc(srv)}</b>${f !== 1 ? ` → <b>${cur ? (base ? cur.label + '分' : cur.label) : '×' + f}</b>で計算中` : ''}</div>` : ''}
    ${ing.length ? `<div class="sec"><h3>🔢 ${base ? '何人分作る？' : '何倍で作る？'}</h3><div class="scl">${opts.map(o => `<button class="sbtn ${cur === o ? 'on' : ''}" data-f="${o.f}">${o.label}</button>`).join('')}</div>
      ${f !== 1 ? `<div class="snote">材料${steps.length ? 'と作り方の中の量（大さじ・g・ml）' : ''}を計算し直しています。${anySeason ? '<br>🧂＝調味料。そのまま掛け算すると濃くなりやすいので「少なめ〜掛け算どおり」の幅で出しています。<b>少なめで入れて味見</b>してから足してください。' : ''}${f > 1 ? '<br>煮込みの水分や加熱時間は鍋の大きさで変わるので様子を見てください。' : ''}</div>` : ''}</div>` : ''}
    ${ing.length ? `<div class="sec"><h3>🧺 材料${srv ? `<span class="srvs">（${f !== 1 && cur && base ? esc(cur.label + '分') : esc(srv)}）</span>` : ''}</h3>${li(ingS, 'i')}</div>` : ''}
    ${steps.length ? `<div class="sec"><h3>👩‍🍳 作り方</h3>${li(stepS, 's')}</div>` : ing.length ? `<div class="sec note">👩‍🍳 作り方は文字で書かれていません（動画の中だけ）。▶で動画を見るか、コメント欄にあればスクショで追加してください。</div>` : ''}
    ${rest.length ? `<div class="sec"><h3>📝 メモ</h3><div class="pre">${esc(rest.join('\n'))}</div></div>` : ''}
    ${r.url && !r.captionFetched ? `<div class="row"><button class="btn sub" id="cap">🔄 インスタのキャプションを取得</button></div>` : ''}
    ${!r.text ? `<div class="sec note">まだレシピの文字がありません。コメントのレシピはスクショを「＋スクショ読取」で追加してください。</div>` : ''}
    ${r.images?.length ? `<div class="sec"><h3>🖼 画像</h3><div class="imgs">${r.images.map(b => `<img src="${blobUrl(b)}">`).join('')}</div></div>` : ''}
    <div class="row">
      <button class="btn sub" id="addShot">＋スクショ読取（コメント等）</button>
      <button class="btn sub" id="edit">✏ 編集</button>
      <button class="btn sub" id="reset">↺ チェックを戻す</button>
    </div>
  </div>`;
  keepAwake(true);
  view.querySelectorAll('.chk input').forEach(c => c.onchange = async () => {
    c.checked ? done.add(c.dataset.k) : done.delete(c.dataset.k);
    c.closest('.chk').classList.toggle('done', c.checked);
    r.done = [...done]; await put(r);
  });
  $('#fsel').onchange = async e => { r.folder = e.target.value; r.folderManual = true; await put(r); toast('フォルダを変更しました'); };
  $('#fav').onclick = async () => { r.fav = !r.fav; await put(r); detailView(id); };
  $('#edit').onclick = () => { location.hash = `#/r/${id}/edit`; };
  const capBtn = $('#cap');
  if (capBtn) capBtn.onclick = async () => { capBtn.disabled = true; if (await autoCaption(r)) { await put(r); } detailView(id); };
  view.querySelectorAll('.sbtn').forEach(b => b.onclick = async () => { r.scale = +b.dataset.f; await put(r); const y = scrollY; await detailView(id); scrollTo(0, y); });
  $('#reset').onclick = async () => { r.done = []; await put(r); detailView(id); };
  $('#addShot').onclick = () => pickImages(async files => { await appendImages(r, files); detailView(id); });
}
function pickImages(cb) {
  const p = $('#pick'); p.value = '';
  p.onchange = () => p.files.length && cb([...p.files]);
  p.click();
}
async function appendImages(r, files) {
  r.images = [...(r.images || []), ...files];
  r.updated = Date.now();
  await put(r);
  try {
    const txt = await ocr(files, m => toast(m, 60000));
    if (txt) {
      r.text = (r.text ? r.text + '\n\n' : '') + txt;
      if (!r.folderManual) r.folder = autoFolder(r.title + '\n' + r.text);
      if (r.title === '無題のレシピ') r.title = guessTitle(r.text);
      await put(r);
    }
    toast('読み取りました✅');
  } catch (e) { toast('読み取り失敗：' + e.message, 4000); }
}

// ---------- 追加・編集 ----------
function editView(r) {
  const isNew = !r;
  r ||= { id: crypto.randomUUID(), title: '', url: '', text: '', folder: 'other', images: [], created: Date.now() };
  setHeader(isNew ? 'レシピを追加' : '編集', true);
  view.innerHTML = `<div class="wrap">
    <label class="f">料理名</label><input class="in" id="t" value="${esc(r.title)}" placeholder="空欄なら本文から自動">
    <label class="f">インスタのURL（任意）</label><input class="in" id="u" value="${esc(r.url)}" placeholder="https://www.instagram.com/...">
    <label class="f">レシピ本文（キャプション・コメントを貼り付け）</label>
    <textarea class="in" id="x" placeholder="【材料】&#10;豚こま 200g&#10;…&#10;&#10;【作り方】&#10;①…">${esc(r.text)}</textarea>
    <div class="row"><button class="btn sub" id="shot">📷 スクショから読み取って追記</button></div>
    <label class="f">フォルダ <span id="auto"></span></label>
    <select class="in" id="fo">${folders().map(f => `<option value="${f.key}" ${f.key === r.folder ? 'selected' : ''}>${f.emoji} ${f.label}</option>`).join('')}</select>
    <div class="row" style="margin-top:20px">
      <button class="btn" id="save" style="flex:1">保存</button>
      ${isNew ? '' : '<button class="btn warn" id="del">削除</button>'}
    </div>
  </div>`;
  let manual = !!r.folderManual;
  const x = $('#x'), fo = $('#fo'), ti = $('#t');
  const autoF = () => {
    const k = autoFolder(ti.value + '\n' + x.value);
    $('#auto').textContent = `（自動判定：${folder(k).emoji}${folder(k).label}）`;
    if (!manual) fo.value = k;
  };
  x.oninput = autoF; ti.oninput = autoF; autoF();
  fo.onchange = () => { manual = true; };
  const newImgs = [];
  // URLを貼った時点でキャプションを取得し、料理名と本文に自動で入れる
  const u = $('#u');
  let fetchedFor = r.captionFetched ? cleanIgUrl(r.url) : '', fetched = null, ft;
  const tryFetch = async () => {
    const ig = cleanIgUrl(u.value);
    if (!ig || ig === fetchedFor) return;
    fetchedFor = ig;
    toast('キャプションを取得中…', 30000);
    try {
      const c = await fetchCaption(u.value);
      if (cleanIgUrl(u.value) !== ig) return;
      fetched = c;
      x.value = c.text + (x.value.trim() ? '\n\n' + x.value : '');
      if (!ti.value.trim()) ti.value = guessTitle(x.value);
      autoF();
      toast('料理名とレシピを入れました✅');
    } catch (e) { fetchedFor = ''; toast('自動取得に失敗：' + e.message + '（スクショで追加できます）', 5000); }
  };
  u.oninput = () => { clearTimeout(ft); ft = setTimeout(tryFetch, 500); };
  u.onchange = tryFetch;
  // 本文欄にURLだけ貼った場合もURL欄へ移して取得する
  x.addEventListener('input', () => {
    if (!u.value.trim() && cleanIgUrl(x.value) && x.value.trim().split(/\s+/).length === 1) {
      u.value = x.value.trim(); x.value = ''; tryFetch();
    }
  });
  $('#shot').onclick = () => pickImages(async files => {
    newImgs.push(...files);
    try { const t = await ocr(files, m => toast(m, 60000)); x.value = (x.value ? x.value + '\n\n' : '') + t; autoF(); toast('読み取りました✅'); }
    catch (e) { toast('読み取り失敗：' + e.message, 4000); }
  });
  $('#save').onclick = async () => {
    r.text = x.value.trim(); r.url = $('#u').value.trim();
    r.title = ti.value.trim();
    r.folder = fo.value; r.folderManual = manual;
    r.images = [...(r.images || []), ...newImgs];
    r.updated = Date.now();
    $('#save').disabled = true;
    if (fetched && cleanIgUrl(r.url) === fetchedFor) {
      if (fetched.image) r.images = [fetched.image, ...r.images];
      else if (fetched.imageUrl) r.cover = fetched.imageUrl;
      r.captionFetched = true;
    }
    const got = await autoCaption(r);
    if (got && manual) r.folder = fo.value;
    if (!r.title) r.title = guessTitle(r.text);
    await put(r); if (!got) toast('保存しました');
    location.replace('#/r/' + r.id);
  };
  if (!isNew) $('#del').onclick = async () => { if (confirm('このレシピを削除しますか？')) { await del(r.id); location.replace('#/'); } };
}

// ---------- インスタ等の「共有」から受け取り ----------
async function inboxView() {
  const items = await all('inbox');
  if (!items.length) { location.replace('#/'); return; }
  setHeader('インスタから受け取り', true);
  const rs = (await all('recipes')).sort((a, b) => (b.updated || b.created) - (a.updated || a.created)).slice(0, 15);
  const it = items[0];
  const recent = rs[0] && Date.now() - (rs[0].updated || rs[0].created) < 30 * 60 * 1000;
  const hasImg = it.images?.length > 0;
  const link = it.url || (it.text.match(/https?:\/\/\S+/) || [''])[0];
  const bodyText = ((it.title ? it.title + '\n' : '') + it.text.replace(link, '')).trim();
  view.innerHTML = `<div class="wrap">
    <div class="sec">
      ${link ? `<div class="note">🔗 ${esc(link)}</div>` : ''}
      ${bodyText ? `<div class="pre">${esc(bodyText)}</div>` : ''}
      ${hasImg ? `<div class="imgs">${it.images.map(b => `<img src="${blobUrl(b)}">`).join('')}</div><div class="note">画像の文字（キャプション・コメント）を読み取ります</div>` : ''}
    </div>
    <label class="f">保存先</label>
    <select class="in" id="dst">
      <option value="new" ${recent && hasImg ? '' : 'selected'}>🆕 新しいレシピとして保存</option>
      ${rs.map((r, i) => `<option value="${r.id}" ${recent && hasImg && i === 0 ? 'selected' : ''}>➕「${esc(r.title)}」に追加</option>`).join('')}
    </select>
    <div class="note" style="margin-top:8px">💡 投稿リンクを保存したあと、キャプションやコメントのスクショを共有すると同じレシピにまとめられます</div>
    <div class="row" style="margin-top:16px"><button class="btn" id="ok" style="flex:1">保存</button><button class="btn sub" id="skip">破棄</button></div>
  </div>`;
  const finish = () => tx('inbox', 'readwrite', st => { st.delete(it.k); });
  $('#skip').onclick = async () => { await finish(); route(); };
  $('#ok').onclick = async () => {
    $('#ok').disabled = true;
    let r = $('#dst').value === 'new' ? null : await get($('#dst').value);
    if (!r) r = { id: crypto.randomUUID(), title: '無題のレシピ', url: '', text: '', folder: 'other', images: [], created: Date.now() };
    if (link && !r.url) r.url = link;
    await autoCaption(r);
    if (bodyText) { r.text = (r.text ? r.text + '\n\n' : '') + bodyText; if (r.title === '無題のレシピ') r.title = guessTitle(r.text); }
    if (!r.folderManual) r.folder = autoFolder(r.title + '\n' + r.text);
    r.updated = Date.now();
    await put(r); await finish();
    if (hasImg) await appendImages(r, it.images);
    const left = await all('inbox');
    if (left.length) inboxView(); else location.replace('#/r/' + r.id);
  };
}

// ---------- 設定（バックアップ） ----------
async function settingsView() {
  setHeader('設定・バックアップ', true);
  const n = (await all('recipes')).length;
  view.innerHTML = `<div class="wrap">
    <div class="sec"><h3>📂 フォルダ</h3>
      <p class="note">自分用のフォルダを追加できます。キーワードを入れておくと、その言葉が入ったレシピは自動でそのフォルダに入ります。使わない標準フォルダは非表示にできます。<b>≡</b> をつまんで上下に動かすと並び順を変えられます。</p>
      <div id="flist"></div>
      <div id="fform"></div>
      <div class="row"><button class="btn" id="fadd">＋ フォルダを追加</button></div></div>
    <div class="sec"><h3>💾 バックアップ</h3>
      <p class="note">レシピはこのスマホの中だけに保存されます（${n}件）。機種変更やブラウザのデータ削除に備えて、ときどき書き出してください。</p>
      <div class="row"><button class="btn" id="exp">書き出し</button><button class="btn sub" id="imp">読み込み</button></div></div>
    <div class="sec"><h3>📱 使い方</h3><p class="note">
      1. このページをChromeで開き「ホーム画面に追加（アプリをインストール）」<br>
      2. インスタの投稿で「シェア ▶ レシピ帳」→ 保存<br>
      3. キャプションやコメントのレシピはスクショして「共有 ▶ レシピ帳」→ 同じレシピに追加（文字を自動読取）<br>
      4. フォルダは自動で振り分け。違っていたら詳細画面で変更できます。上の「📂 フォルダ」で自分用のフォルダも作れます<br>
      5. レシピを開いている間は画面が消えません</p></div>
  </div>`;
  folderSettings();
  $('#exp').onclick = async () => {
    const rs = await all('recipes');
    const toData = b => new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); });
    for (const r of rs) r.images = await Promise.all((r.images || []).map(toData));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ v: 1, recipes: rs, folders: fcfg })], { type: 'application/json' }));
    a.download = `recipes-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $('#imp').onclick = () => {
    const f = $('#importFile'); f.value = '';
    f.onchange = async () => {
      try {
        const d = JSON.parse(await f.files[0].text());
        if (d.folders) {  // 読み込んだフォルダ設定を、今の設定に足し合わせる
          for (const f of d.folders.custom || []) if (!fcfg.custom.some(c => c.key === f.key)) fcfg.custom.push(f);
          fcfg.hidden = [...new Set([...fcfg.hidden, ...(d.folders.hidden || [])])];
          if (!fcfg.order.length && d.folders.order) fcfg.order = d.folders.order;
          saveFolderCfg();
        }
        for (const r of d.recipes) { r.images = await Promise.all((r.images || []).map(u => fetch(u).then(x => x.blob()))); await put(r); }
        toast(`${d.recipes.length}件読み込みました`); settingsView();
      } catch (e) { toast('読み込み失敗：' + e.message, 4000); }
    };
    f.click();
  };
}

// フォルダ一覧の表示と、追加・編集・削除・非表示
function folderSettings() {
  const list = $('#flist'), form = $('#fform');
  const grip = k => `<span class="grip" data-k="${k}" aria-label="ドラッグで並べ替え">≡</span>`;
  const rows = [
    ...sortedFolders().map(f => f.key.startsWith('c_') ? `<div class="frow" data-k="${f.key}">${grip(f.key)}<span>${esc(f.emoji)} ${esc(f.label)}${f.words?.length ? `<small>🔑 ${esc(f.words.join('、'))}</small>` : ''}</span>
      <button class="btn sub" data-ed="${f.key}">編集</button><button class="btn warn" data-rm="${f.key}">削除</button></div>` : (h => `<div class="frow ${h ? 'off' : ''}" data-k="${f.key}">${grip(f.key)}<span>${f.emoji} ${f.label}<small>標準</small></span><button class="btn sub" data-hide="${f.key}">${h ? '表示する' : '非表示'}</button></div>`)(fcfg.hidden.includes(f.key))),
    `<div class="frow"><span>${OTHER.emoji} ${OTHER.label}<small>標準・どこにも当てはまらないレシピ</small></span></div>`
  ];
  list.innerHTML = rows.join('');
  dragSort(list);
  const edit = f => {
    const isNew = !f;
    form.innerHTML = `<div class="fedit">
      <div class="row"><input class="in" id="fe" value="${esc(f?.emoji || '📁')}" style="width:4.2em;text-align:center" maxlength="4">
      <input class="in" id="fl" value="${esc(f?.label || '')}" placeholder="フォルダ名（例：作り置き）" style="flex:1"></div>
      <label class="f">自動で入れるキーワード（任意・「、」やスペース区切り）</label>
      <input class="in" id="fw" value="${esc((f?.words || []).join('、'))}" placeholder="例：作り置き、冷凍、常備菜">
      <div class="row"><button class="btn" id="fok" style="flex:1">${isNew ? '追加' : '保存'}</button><button class="btn sub" id="fno">やめる</button></div></div>`;
    $('#fl').focus();
    $('#fno').onclick = () => { form.innerHTML = ''; };
    $('#fok').onclick = async () => {
      const label = $('#fl').value.trim();
      if (!label) { toast('フォルダ名を入れてください'); return; }
      const g = f || { key: 'c_' + Date.now().toString(36) };
      g.label = label; g.emoji = $('#fe').value.trim() || '📁';
      g.words = $('#fw').value.split(/[、,，\s]+/).map(w => w.trim()).filter(Boolean);
      if (isNew) fcfg.custom.push(g);
      saveFolderCfg();
      const n = await refile();
      toast(`${isNew ? '追加' : '保存'}しました${n ? `（${n}件を振り分け直しました）` : ''}`, 3000);
      settingsView();
    };
  };
  $('#fadd').onclick = () => edit(null);
  list.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => edit(fcfg.custom.find(f => f.key === b.dataset.ed)));
  list.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
    const f = fcfg.custom.find(c => c.key === b.dataset.rm);
    if (!confirm(`フォルダ「${f.label}」を削除しますか？
（中のレシピは消えず、他のフォルダに移ります）`)) return;
    fcfg.custom = fcfg.custom.filter(c => c !== f); saveFolderCfg();
    await refile(f.key); toast('削除しました'); settingsView();
  });
  list.querySelectorAll('[data-hide]').forEach(b => b.onclick = async () => {
    const k = b.dataset.hide;
    fcfg.hidden = fcfg.hidden.includes(k) ? fcfg.hidden.filter(x => x !== k) : [...fcfg.hidden, k];
    saveFolderCfg();
    const n = await refile(k);
    toast(fcfg.hidden.includes(k) ? `非表示にしました${n ? `（${n}件を他のフォルダへ）` : ''}` : '表示に戻しました');
    settingsView();
  });
}
// ≡ をつまんで上下にドラッグ → 離したら並び順を保存（指でもマウスでも動く）
function dragSort(list) {
  list.querySelectorAll('.grip').forEach(g => g.onpointerdown = e => {
    e.preventDefault();
    const row = g.closest('.frow');
    row.classList.add('drag');
    let raf;
    const move = ev => {
      if (ev.pointerId !== e.pointerId) return;
      // 画面の端に来たら自動でスクロール
      const y = ev.clientY, H = innerHeight;
      cancelAnimationFrame(raf);
      if (y < 70 || y > H - 70) { const d = y < 70 ? -12 : 12; const tick = () => { scrollBy(0, d); raf = requestAnimationFrame(tick); }; tick(); }
      const rows = [...list.querySelectorAll('.frow[data-k]')].filter(r => r !== row);
      const after = rows.find(r => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2; });
      if (after) list.insertBefore(row, after);
      else list.insertBefore(row, rows.length ? rows[rows.length - 1].nextSibling : list.firstChild);
    };
    const up = () => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      row.classList.remove('drag');
      const order = [...list.querySelectorAll('.frow[data-k]')].map(r => r.dataset.k);
      if (order.join() !== fcfg.order.join()) { fcfg.order = order; saveFolderCfg(); toast('並び順を保存しました'); }
    };
    // 行を動かすと指のキャプチャが外れるので、画面全体で動きを拾う
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
}
// フォルダ設定が変わったときにレシピを振り分け直す。gone=無くなったフォルダ（手動で入れた分も移す）
async function refile(gone) {
  const valid = new Set(folders().map(f => f.key));
  let n = 0;
  for (const r of await all('recipes')) {
    const lost = !valid.has(r.folder) || r.folder === gone && !valid.has(gone);
    if (r.folderManual && !lost) continue;
    const k = autoFolder(r.title + '\n' + r.text);
    if (lost) r.folderManual = false;
    if (k !== r.folder) { r.folder = k; await put(r); n++; }
    else if (lost) await put(r);
  }
  return n;
}

// ---------- 起動 ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
(async () => {
  if (new URLSearchParams(location.search).has('shared')) history.replaceState(null, '', location.pathname + '#/inbox');
  if (location.hash !== '#/inbox' && (await all('inbox')).length) { location.hash = '#/inbox'; return; }
  route();
})();
