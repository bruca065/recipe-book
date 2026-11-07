import { FOLDERS, classify, splitRecipe } from './classify.js';

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
const folder = k => FOLDERS.find(f => f.key === k) || FOLDERS[FOLDERS.length - 1];
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), ms);
}
function guessTitle(text) {
  for (const l of (text || '').split(/\r?\n/)) {
    const s = l.replace(/#\S+/g, '').replace(/https?:\/\/\S+/g, '').trim();
    if (s.length >= 2) return s.slice(0, 40);
  }
  return '無題のレシピ';
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
      ${FOLDERS.map(f => `<button class="chip ${state.folder === f.key ? 'on' : ''}" data-f="${f.key}">${f.emoji} ${f.label}<b>${cnt(f.key)}</b></button>`).join('')}
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
  const cv = r.images?.[0] ? `<img src="${blobUrl(r.images[0])}" alt="">` : f.emoji;
  return `<button class="card" data-id="${r.id}"><div class="cv">${cv}</div><div class="t">${esc(r.title)}</div><div class="f">${f.emoji} ${f.label}${r.fav ? ' ⭐' : ''}</div></button>`;
}

// ---------- 詳細（料理モード：画面点灯キープ） ----------
async function detailView(id) {
  const r = await get(id);
  if (!r) { location.hash = '#/'; return; }
  setHeader(r.title, true);
  const { ing, steps, rest } = splitRecipe(r.text);
  const done = new Set(r.done || []);
  const li = (arr, p) => arr.map((l, i) => `<label class="chk ${done.has(p + i) ? 'done' : ''}"><input type="checkbox" data-k="${p + i}" ${done.has(p + i) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('');
  view.innerHTML = `<div class="wrap big">
    <span class="awake" id="awake">💡 画面点灯キープ中</span>
    <div class="row">
      <select class="in" id="fsel" style="flex:1">${FOLDERS.map(f => `<option value="${f.key}" ${f.key === r.folder ? 'selected' : ''}>${f.emoji} ${f.label}</option>`).join('')}</select>
      <button class="btn sub" id="fav">${r.fav ? '⭐' : '☆'}</button>
    </div>
    ${r.url ? `<div class="row"><a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener">▶ インスタで動画を見る</a></div>` : ''}
    ${ing.length ? `<div class="sec"><h3>🧺 材料</h3>${li(ing, 'i')}</div>` : ''}
    ${steps.length ? `<div class="sec"><h3>👩‍🍳 作り方</h3>${li(steps, 's')}</div>` : ''}
    ${rest.length ? `<div class="sec"><h3>📝 メモ</h3><div class="pre">${esc(rest.join('\n'))}</div></div>` : ''}
    ${!r.text ? `<div class="sec note">まだレシピの文字がありません。キャプションやコメントのスクショを「＋スクショ読取」で追加してください。</div>` : ''}
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
      if (!r.folderManual) r.folder = classify(r.title + '\n' + r.text);
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
    <select class="in" id="fo">${FOLDERS.map(f => `<option value="${f.key}" ${f.key === r.folder ? 'selected' : ''}>${f.emoji} ${f.label}</option>`).join('')}</select>
    <div class="row" style="margin-top:20px">
      <button class="btn" id="save" style="flex:1">保存</button>
      ${isNew ? '' : '<button class="btn warn" id="del">削除</button>'}
    </div>
  </div>`;
  let manual = !!r.folderManual;
  const x = $('#x'), fo = $('#fo'), ti = $('#t');
  const autoF = () => {
    const k = classify(ti.value + '\n' + x.value);
    $('#auto').textContent = `（自動判定：${folder(k).emoji}${folder(k).label}）`;
    if (!manual) fo.value = k;
  };
  x.oninput = autoF; ti.oninput = autoF; autoF();
  fo.onchange = () => { manual = true; };
  const newImgs = [];
  $('#shot').onclick = () => pickImages(async files => {
    newImgs.push(...files);
    try { const t = await ocr(files, m => toast(m, 60000)); x.value = (x.value ? x.value + '\n\n' : '') + t; autoF(); toast('読み取りました✅'); }
    catch (e) { toast('読み取り失敗：' + e.message, 4000); }
  });
  $('#save').onclick = async () => {
    r.text = x.value.trim(); r.url = $('#u').value.trim();
    r.title = ti.value.trim() || guessTitle(r.text);
    r.folder = fo.value; r.folderManual = manual;
    r.images = [...(r.images || []), ...newImgs];
    r.updated = Date.now();
    await put(r); toast('保存しました');
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
    if (bodyText) { r.text = (r.text ? r.text + '\n\n' : '') + bodyText; if (r.title === '無題のレシピ') r.title = guessTitle(r.text); }
    if (!r.folderManual) r.folder = classify(r.title + '\n' + r.text);
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
    <div class="sec"><h3>💾 バックアップ</h3>
      <p class="note">レシピはこのスマホの中だけに保存されます（${n}件）。機種変更やブラウザのデータ削除に備えて、ときどき書き出してください。</p>
      <div class="row"><button class="btn" id="exp">書き出し</button><button class="btn sub" id="imp">読み込み</button></div></div>
    <div class="sec"><h3>📱 使い方</h3><p class="note">
      1. このページをChromeで開き「ホーム画面に追加（アプリをインストール）」<br>
      2. インスタの投稿で「シェア ▶ レシピ帳」→ 保存<br>
      3. キャプションやコメントのレシピはスクショして「共有 ▶ レシピ帳」→ 同じレシピに追加（文字を自動読取）<br>
      4. フォルダは自動で振り分け。違っていたら詳細画面で変更できます<br>
      5. レシピを開いている間は画面が消えません</p></div>
  </div>`;
  $('#exp').onclick = async () => {
    const rs = await all('recipes');
    const toData = b => new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); });
    for (const r of rs) r.images = await Promise.all((r.images || []).map(toData));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ v: 1, recipes: rs })], { type: 'application/json' }));
    a.download = `recipes-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $('#imp').onclick = () => {
    const f = $('#importFile'); f.value = '';
    f.onchange = async () => {
      try {
        const d = JSON.parse(await f.files[0].text());
        for (const r of d.recipes) { r.images = await Promise.all((r.images || []).map(u => fetch(u).then(x => x.blob()))); await put(r); }
        toast(`${d.recipes.length}件読み込みました`);
      } catch (e) { toast('読み込み失敗：' + e.message, 4000); }
    };
    f.click();
  };
}

// ---------- 起動 ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
(async () => {
  if (new URLSearchParams(location.search).has('shared')) history.replaceState(null, '', location.pathname + '#/inbox');
  if (location.hash !== '#/inbox' && (await all('inbox')).length) { location.hash = '#/inbox'; return; }
  route();
})();
