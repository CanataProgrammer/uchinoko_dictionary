/* ═══════════════════════════════════════════
   データ読み込み・共通ヘルパー（全ページ共通）
   ═══════════════════════════════════════════ */
(function () {
  const CZ = window.CZ = {};

  // 保存先の GitHub リポジトリ
  CZ.repo = {
    owner: 'CanataProgrammer',
    name: 'uchinoko_dictionary',
    branch: 'main',
    dataPath: 'data/worlds.json'
  };

  const CACHE_KEY = 'cz-data-cache';
  const CACHE_MS = 15 * 60 * 1000;

  CZ.esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  CZ.pad = n => String(n).padStart(2, '0');

  CZ.worldUrl = id => `world.html?id=${encodeURIComponent(id)}`;
  CZ.charUrl = (wid, cid) => `character.html?world=${encodeURIComponent(wid)}&id=${encodeURIComponent(cid)}`;

  CZ.findWorld = (data, wid) => (data.worlds || []).find(w => w.id === wid) || null;
  CZ.findChar = (data, wid, cid) => {
    const w = CZ.findWorld(data, wid);
    return w ? (w.characters || []).find(c => c.id === cid) || null : null;
  };

  /* 管理者としてログイン中か（ログイン情報はこのタブの間だけ保持） */
  CZ.session = () => {
    try {
      const s = JSON.parse(sessionStorage.getItem('cz-admin') || 'null');
      return s && s.exp > Date.now() ? s : null;
    } catch (e) { return null; }
  };
  CZ.isAdmin = () => !!CZ.session();

  /* データ読み込み
     管理画面で保存した直後は、公開サイトへの反映（1〜2分）を待たずに
     このブラウザに残した最新データを使う */
  CZ.loadData = async () => {
    try {
      const local = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (local && Date.now() - local.at < CACHE_MS) return local.data;
    } catch (e) { /* 読めなければ普通に取得する */ }
    const r = await fetch(CZ.repo.dataPath, { cache: 'no-cache' });
    if (!r.ok) throw new Error('worlds.json を読み込めませんでした');
    return r.json();
  };

  CZ.rememberData = data => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch (e) { /* 容量不足などは無視 */ }
  };

  /* 本文の簡易記法
       # 見出し   … 行頭に「# 」で太字の小見出し
       **太字**  … 太字
       URL       … 自動でリンクになる */
  CZ.formatText = s => CZ.esc(s).split('\n').map(line => {
    const inline = t => t
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/https?:\/\/[^\s<>"）)]+/g, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
    const h = line.match(/^#\s+(.*)$/);
    return h ? `<strong class="prose-heading">${inline(h[1])}</strong>` : inline(line);
  }).join('\n');

  CZ.PERSON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>';

  /* ログイン中は画面右下に管理メニューを出す */
  CZ.showAdminBar = editHref => {
    if (!CZ.isAdmin() || document.getElementById('admin-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'admin-bar';
    bar.className = 'admin-bar';
    bar.innerHTML = `
      <span class="admin-bar-label">管理モード</span>
      ${editHref ? `<a href="${CZ.esc(editHref)}">✎ このページを編集</a>` : ''}
      <a href="admin.html">管理画面</a>`;
    document.body.appendChild(bar);
  };
})();
