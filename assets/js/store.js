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
    dataPath: 'data/worlds.json',
    // 公開サイトの URL（埋め込み表示の画像などは絶対 URL で書く必要がある）
    siteUrl: 'https://canataprogrammer.github.io/uchinoko_dictionary/'
  };

  const CACHE_KEY = 'cz-data-cache';
  const CACHE_MS = 15 * 60 * 1000;

  CZ.esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  CZ.pad = n => String(n).padStart(2, '0');

  /* ─── 番地（8626番地 / 1086番地） ───
     世界・都市はどれか1つの番地に属する（worlds.json の "address"。未設定なら 8626番地）。
     1086番地では「世界」を「都市」と呼び、青を基調にした見た目になる（style.css の
     :root[data-address="1086"]、背景の絵は site.js の city 版） */
  CZ.ADDRESSES = [
    { id: '8626', kanji: '八六二六', unit: '世界', unitEn: 'World', unitEnPlural: 'Worlds', eyebrow: 'World Setting', themeColor: '#c8442e' },
    { id: '1086', kanji: '一〇八六', unit: '都市', unitEn: 'City', unitEnPlural: 'Cities', eyebrow: 'City Setting', themeColor: '#2678d4' }
  ];
  CZ.DEFAULT_ADDRESS = CZ.ADDRESSES[0].id;
  CZ.address = id => CZ.ADDRESSES.find(a => a.id === id) || CZ.ADDRESSES[0];
  CZ.worldAddress = w => (w && CZ.ADDRESSES.some(a => a.id === w.address)) ? w.address : CZ.DEFAULT_ADDRESS;
  CZ.worldsIn = (data, addr) => (data.worlds || []).filter(w => CZ.worldAddress(w) === addr);
  // いま表示している番地（site.js がページの読み込み時に <html data-address> に入れている）
  CZ.currentAddress = () => CZ.address(document.documentElement.dataset.address).id;

  // URL の末尾に番地を付ける（8626番地のときは付けない）
  const addrParam = (addr, first) => (addr && addr !== CZ.DEFAULT_ADDRESS ? `${first ? '?' : '&'}addr=${addr}` : '');
  CZ.indexUrl = (addr, hash = '') => `index.html${addrParam(addr, true)}${hash}`;
  CZ.worldUrl = (id, addr) => `world.html?id=${encodeURIComponent(id)}${addrParam(addr)}`;
  CZ.charUrl = (wid, cid, addr) => `character.html?world=${encodeURIComponent(wid)}&id=${encodeURIComponent(cid)}${addrParam(addr)}`;

  /* 番地ごとに変わる文言。data-addr-text="キー" を付けた要素の文字が入れ替わる */
  CZ.addressTexts = addr => {
    const a = CZ.address(addr);
    return {
      logo: a.id,
      kvSub: `${a.id}番地 ― Uchinoko Archive`,
      kvVertical: `彼方ノ世界　${a.kanji}番地`,
      navWorlds: a.unitEnPlural,
      worldsLabel: a.unitEnPlural,
      worldsLead: `${a.unit}を、えらぶ。`,
      worldsText: `${a.unit}を選択すると、その${a.unit}に生きるキャラクターたちが表示されます。`,
      charsLead: `その${a.unit}に、生きるひとびと。`,
      footerLogo: a.id,
      footerTitle: `彼方の世界(${a.id}番地) 設定資料集`
    };
  };

  /* 番地を切り替える：配色・背景の絵・文言・リンクを入れ替える */
  CZ.applyAddress = addr => {
    addr = CZ.address(addr).id;
    if (window.applyAddressTheme) window.applyAddressTheme(addr);
    const texts = CZ.addressTexts(addr);
    let changed = false;
    document.querySelectorAll('[data-addr-text]').forEach(el => {
      const v = texts[el.dataset.addrText];
      if (v == null || el.dataset.addrValue === v) return;
      el.dataset.addrValue = v;
      if (el.dataset.splitDone) {
        // 1文字ずつのアニメーションをかけ直す
        delete el.dataset.splitDone;
        el.classList.remove('split', 'is-in');
        changed = true;
      }
      el.textContent = v;
    });
    // 他のページから一覧へ戻るリンクにも番地を付ける
    document.querySelectorAll('[data-addr-link]').forEach(el => { el.href = CZ.indexUrl(addr, el.dataset.addrLink); });
    document.querySelectorAll('.addr-switch [data-addr]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.addr === addr)));
    if (changed && window.animateIn) window.animateIn(document);
    return addr;
  };

  /* 番地スイッチ（ボタンに data-addr）。onSwitch がなければトップページへ移動する */
  CZ.bindAddressSwitch = onSwitch => {
    document.querySelectorAll('.addr-switch [data-addr]').forEach(b => b.addEventListener('click', () => {
      const addr = b.dataset.addr;
      if (addr === CZ.currentAddress() && onSwitch) return;
      if (onSwitch) onSwitch(addr);
      else {
        try { localStorage.setItem('cz-address', addr); } catch (e) { /* 保存できなくても移動はする */ }
        location.href = CZ.indexUrl(addr);
      }
    }));
  };

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

  /* ─── 共有用ページ（Discord・X の埋め込み表示用） ───
     world.html / character.html は JavaScript で中身を描くため、JavaScript を実行しない
     Discord などには名前も画像も見えない。そこで OGP だけを書いた静的ページを
     s/世界ID.html・s/世界ID/キャラID.html に置き（管理画面で保存するたびに作り直す）、
     開いた人は本来のページへ自動で移動させる */
  CZ.SHARE_DIR = 's/';
  CZ.sharePath = (wid, cid) => cid ? `${CZ.SHARE_DIR}${wid}/${cid}.html` : `${CZ.SHARE_DIR}${wid}.html`;
  CZ.shareUrl = (wid, cid) => CZ.repo.siteUrl + CZ.sharePath(wid, cid);
  // 以前の URL（同じ中身で更新し続ける）
  CZ.legacyPath = (wid, cid) => cid ? `characters/${wid}/${cid}.html` : `worlds/${wid}.html`;

  const SITE_NAME = '彼方の世界 設定資料集';
  const absUrl = p => /^https?:\/\//i.test(p) ? p : CZ.repo.siteUrl + encodeURI(String(p).replace(/^\.?\//, ''));
  const oneLine = (s, max) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };

  /* 共有用ページの HTML（世界 / キャラが見つからなければ null） */
  CZ.sharePage = (data, wid, cid) => {
    const w = CZ.findWorld(data, wid);
    const c = cid ? CZ.findChar(data, wid, cid) : null;
    if (!w || (cid && !c)) return null;
    const title = c ? c.name : w.name;
    const desc = oneLine(c
      ? c.short_description || c.catch || `${w.name} のキャラクター`
      : w.description || w.catch || `${w.name} の${CZ.address(CZ.worldAddress(w)).unit}設定`, 160);
    const img = c ? c.thumbnail || c.image : w.banner || w.thumbnail;
    const root = cid ? '../../' : '../';
    const addr = CZ.address(CZ.worldAddress(w));
    const target = c ? CZ.charUrl(wid, cid, addr.id) : CZ.worldUrl(wid, addr.id);
    const fallbackImage = addr.id === CZ.DEFAULT_ADDRESS ? 'assets/brand/og-image.png' : `assets/brand/og-image-${addr.id}.png`;
    const e = CZ.esc;
    const image = img
      ? `  <meta property="og:image" content="${e(absUrl(img))}" />
  <meta property="og:image:alt" content="${e(c ? `${title}のイラスト` : title)}" />`
      : `  <meta property="og:image" content="${e(absUrl(fallbackImage))}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${addr.id === CZ.DEFAULT_ADDRESS ? '城・神社と鳥居・大都市' : '夜の大都市と塔'}のシルエットに「彼方の世界、設定資料集。」の文字" />`;
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${e(title)} | ${SITE_NAME}</title>
  <!-- 共有用ページ（管理画面で保存すると自動で作り直されます。直接編集しないでください）
       Discord・X などの埋め込み表示のための情報だけを置き、開いた人は本来のページに移動します -->
  <link rel="icon" href="${root}favicon.ico" sizes="any" />
  <link rel="icon" href="${root}assets/brand/icon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="${root}assets/brand/apple-touch-icon.png" />
  <meta name="theme-color" content="${addr.themeColor}" />
  <meta name="description" content="${e(desc)}" />
  <meta property="og:type" content="${c ? 'profile' : 'website'}" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:title" content="${e(title)}" />
  <meta property="og:description" content="${e(desc)}" />
  <meta property="og:url" content="${e(CZ.shareUrl(wid, cid))}" />
${image}
  <meta property="og:locale" content="ja_JP" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta http-equiv="refresh" content="0; url=${e(root + target)}" />
  <link rel="canonical" href="${e(absUrl(target))}" />
</head>
<body>
  <p><a href="${e(root + target)}">${e(title)} のページへ移動します</a></p>
</body>
</html>
`;
  };

  /* クリップボードにコピー（使えない環境では選択状態の入力欄で代用） */
  CZ.copyText = async text => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (x) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (y) { /* 下で false を返す */ }
      ta.remove();
      return ok;
    }
  };

  CZ.PERSON_ICON ='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>';

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
