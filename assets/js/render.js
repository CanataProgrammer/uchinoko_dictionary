/* ═══════════════════════════════════════════
   世界ページ（world.html）・キャラクターページ（character.html）の表示
   data/worlds.json の内容から組み立てる
   ═══════════════════════════════════════════ */
(function () {
  const { esc } = CZ;
  const params = new URLSearchParams(location.search);
  const page = document.body.dataset.page; // "world" | "character"
  const wid = params.get(page === 'world' ? 'id' : 'world') || '';
  const cid = page === 'character' ? params.get('id') || '' : '';

  // 背景シルエットの形をページごとに変える（site.js が描く前に設定）
  const scenery = document.querySelector('[data-scenery="band"]');
  if (scenery) {
    let h = 0;
    for (const ch of wid + cid) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    scenery.dataset.seed = String(h % 90000 + 1000);
  }

  const heroEl = document.getElementById('hero');
  const contentEl = document.getElementById('content');

  /* ─── ブロック（本文の各セクション） ─── */
  const BLOCKS = {
    stats: b => `
      <table class="stats-table"><tbody>
        ${(b.rows || []).filter(([, v]) => String(v || '').trim()).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
      </tbody></table>`,

    text: b => `<div class="prose">${CZ.formatText(b.body || '')}</div>`,

    cards: b => `
      <div class="faction-grid">
        ${(b.items || []).map(it => `
          <div class="faction-card">
            <div class="faction-name">${esc(it.name)}</div>
            <div class="faction-desc">${esc(it.desc)}</div>
          </div>`).join('')}
      </div>`,

    gallery: b => `
      <div class="gallery-grid">
        ${(b.items || []).map(it => `
          <figure>
            <button type="button" class="gallery-item" data-src="${esc(it.src)}" aria-label="${esc(it.caption || '画像')}を拡大">
              <img src="${esc(it.src)}" alt="${esc(it.caption)}" loading="lazy" />
            </button>
            ${it.caption ? `<figcaption class="gallery-caption">${esc(it.caption)}</figcaption>` : ''}
          </figure>`).join('')}
      </div>`,

    relations: (b, data) => `
      <div class="relation-list">
        ${(b.items || []).map(it => {
          const [rw, rc] = String(it.target || '').split('/');
          const target = it.target ? CZ.findChar(data, rw, rc) : null;
          const name = it.name || (target && target.name) || '';
          const thumb = it.thumbnail || (target && target.thumbnail) || '';
          const href = target ? CZ.charUrl(rw, rc) : (it.href || '');
          const inner = `
            ${thumb
              ? `<img class="relation-thumb" src="${esc(thumb)}" alt="" />`
              : `<span class="relation-thumb relation-thumb-empty">${esc(name.slice(0, 1))}</span>`}
            <div class="relation-info">
              <div class="relation-name">${esc(name)}</div>
              <div class="relation-label">${esc(it.label)}</div>
            </div>`;
          return href
            ? `<a class="relation-item" href="${esc(href)}">${inner}</a>`
            : `<div class="relation-item is-static">${inner}</div>`;
        }).join('')}
      </div>`,

    characters: (b, data) => {
      const w = CZ.findWorld(data, wid);
      const chars = (w && w.characters) || [];
      return `
        <div class="char-list">
          ${chars.map(c => `
            <a class="char-list-item" href="${CZ.charUrl(wid, c.id)}">
              ${c.thumbnail
                ? `<img class="char-list-thumb" src="${esc(c.thumbnail)}" alt="" loading="lazy" />`
                : `<div class="char-list-thumb-placeholder">${CZ.PERSON_ICON}</div>`}
              <div class="char-list-name">${esc(c.name)}</div>
            </a>`).join('')}
        </div>`;
    }
  };

  function renderBlocks(blocks, data) {
    return (blocks || []).map(b => {
      const body = BLOCKS[b.type] ? BLOCKS[b.type](b, data) : '';
      return `
        <section class="section">
          <h2 class="section-title">${esc(b.title)}</h2>
          ${body}
        </section>`;
    }).join('');
  }

  const tagsHtml = tags => (tags || []).length
    ? `<div class="hero-tags">${tags.map(t => `<span class="hero-tag">${esc(t)}</span>`).join('')}</div>`
    : '';

  /* ─── 世界ページ ─── */
  function renderWorld(data) {
    const w = CZ.findWorld(data, wid);
    if (!w) return notFound('この世界は見つかりませんでした。');
    document.title = `${w.name} | 彼方の世界 設定資料集`;
    heroEl.innerHTML = `
      ${w.banner ? `<img class="hero-banner" src="${esc(w.banner)}" alt="" />` : ''}
      <div class="hero-eyebrow">${esc(w.eyebrow || 'World Setting')}</div>
      <h1 class="hero-title">${esc(w.name)}</h1>
      ${w.reading ? `<div class="hero-reading">${esc(w.reading)}</div>` : ''}
      ${tagsHtml(w.tags)}
      ${w.catch ? `<p class="hero-catch">${esc(w.catch)}</p>` : ''}`;
    contentEl.innerHTML = renderBlocks(w.blocks, data);
    CZ.showAdminBar(`admin.html#world/${encodeURIComponent(w.id)}`);
  }

  /* ─── キャラクターページ ─── */
  function renderCharacter(data) {
    const w = CZ.findWorld(data, wid);
    const c = CZ.findChar(data, wid, cid);
    if (!c) return notFound('このキャラクターは見つかりませんでした。');
    const name = c.display_name || c.name;
    document.title = `${name} | 彼方の世界 設定資料集`;
    const img = c.image || c.thumbnail;
    heroEl.innerHTML = `
      ${img ? `<div class="hero-image-wrap"><img class="hero-image" src="${esc(img)}" alt="${esc(name)}の立ち絵" /></div>` : ''}
      <div class="hero-info">
        <div class="hero-world">${esc(c.affiliation || (w && w.name) || '')}</div>
        <h1 class="hero-name">${esc(name)}</h1>
        ${(c.reading_full || c.reading) ? `<div class="hero-reading">${esc(c.reading_full || c.reading)}</div>` : ''}
        ${tagsHtml(c.tags)}
        ${c.catch ? `<p class="hero-short-desc">${esc(c.catch)}</p>` : ''}
      </div>`;
    contentEl.innerHTML = renderBlocks(c.blocks, data);
    const back = document.querySelector('.back-link');
    if (back) back.href = `index.html?world=${encodeURIComponent(wid)}#characters`;
    CZ.showAdminBar(`admin.html#char/${encodeURIComponent(wid)}/${encodeURIComponent(c.id)}`);
  }

  function notFound(msg) {
    heroEl.innerHTML = `<h1 class="hero-title">${esc(msg)}</h1>`;
    contentEl.innerHTML = '<p class="section-text"><a href="index.html">一覧に戻る</a></p>';
    CZ.showAdminBar('');
  }

  /* ─── 画像の拡大表示 ─── */
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const closeLightbox = () => { lightbox.classList.remove('open'); lightboxImg.src = ''; };
  document.addEventListener('click', e => {
    const item = e.target.closest('.gallery-item');
    if (item) { lightboxImg.src = item.dataset.src; lightbox.classList.add('open'); }
  });
  lightbox.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

  CZ.loadData()
    .then(data => {
      if (page === 'world') renderWorld(data); else renderCharacter(data);
    })
    .catch(() => notFound('データの読み込みに失敗しました。'))
    .finally(() => {
      // 描画した見出しにアニメーションとタグ色を付ける
      if (window.colorTags) window.colorTags();
      if (window.animateIn) window.animateIn(document);
    });
})();
