/* ═══════════════════════════════════════════
   8626 設定資料集 共通スクリプト
   ・[data-scenery] に「城・神社と鳥居・大都市」のシルエットを描く
       kv     … トップページの大きな背景（月・光輪・魔素の粒つき）
       band   … 詳細ページのヒーロー下に敷く細い帯
       footer … フッター上端の夜景（自動で追加）
   ・見出しなどを1文字ずつアニメーション表示
   ・.reveal / .wipe をスクロールで表示
   ・タグに色を割り当てる
   ═══════════════════════════════════════════ */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const TAG_COLORS = ['var(--tag-shu)', 'var(--tag-ai)', 'var(--tag-kin)', 'var(--tag-take)'];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 毎回同じ形になるよう、シード付きの乱数を使う
  function seeded(seed) {
    let s = seed % 2147483647 || 1;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  const f = n => Math.round(n * 10) / 10;

  /* ─────────────────────────────
     シルエットの部品
     ───────────────────────────── */

  // 中世の城（左）
  function drawCastle(g, cx, withWindows, win) {
    const base = 520;
    // 岩山
    el('path', { d: `M${cx - 230} ${base} L${cx - 190} 445 Q${cx - 110} 398 ${cx} 402 Q${cx + 110} 398 ${cx + 180} 440 L${cx + 230} ${base} Z` }, g);

    // 城壁（胸壁つき）
    const wl = cx - 135, wr = cx + 135, wt = 362;
    let d = `M${wl} ${base} L${wl} ${wt}`;
    for (let x = wl; x < wr; x += 14) d += ` L${x} ${wt - 9} L${x + 8} ${wt - 9} L${x + 8} ${wt} L${Math.min(x + 14, wr)} ${wt}`;
    d += ` L${wr} ${base} Z`;
    el('path', { d }, g);

    // 塔（四角い胴 + 円錐屋根 + 旗）
    const tower = (x, w, top, roofH, flag) => {
      el('rect', { x, y: top, width: w, height: base - top }, g);
      el('path', { d: `M${x - 4} ${top} L${x + w / 2} ${top - roofH} L${x + w + 4} ${top} Z` }, g);
      if (flag) {
        const px = x + w / 2, py = top - roofH;
        el('rect', { x: px - 0.8, y: py - 20, width: 1.6, height: 20 }, g);
        el('path', { d: `M${px + 0.8} ${py - 20} L${px + 16} ${py - 15} L${px + 0.8} ${py - 10} Z`, class: 'flag' }, g);
      }
    };
    tower(wl - 18, 34, 300, 48, true);
    tower(wr - 16, 34, 300, 48, true);
    tower(cx - 70, 16, 238, 32, false);
    tower(cx + 54, 16, 238, 32, false);

    // 天守（胸壁つき）と中央の尖塔
    const kl = cx - 45, kr = cx + 45, kt = 252;
    d = `M${kl} ${base} L${kl} ${kt}`;
    for (let x = kl; x < kr; x += 12) d += ` L${x} ${kt - 8} L${x + 7} ${kt - 8} L${x + 7} ${kt} L${Math.min(x + 12, kr)} ${kt}`;
    d += ` L${kr} ${base} Z`;
    el('path', { d }, g);
    tower(cx - 16, 32, 196, 70, true);

    if (withWindows) {
      // アーチ窓
      [[cx - 26, 280], [cx + 16, 280], [cx - 5, 220], [cx - 26, 320], [cx + 16, 320]].forEach(([x, y], i) => {
        el('path', { d: `M${x} ${y + 14} L${x} ${y + 4} Q${x + 5} ${y - 3} ${x + 10} ${y + 4} L${x + 10} ${y + 14} Z`, class: 'win tw', style: `--d:${(i * 0.9).toFixed(1)}s;--t:${3 + i}s` }, win);
      });
      // 城門
      el('path', { d: `M${cx - 14} ${base - 100} L${cx - 14} ${base - 128} Q${cx} ${base - 146} ${cx + 14} ${base - 128} L${cx + 14} ${base - 100} Z`, class: 'win dim' }, win);
    }
  }

  // 大都市（右）
  function drawCity(g, x0, x1, rand, withWindows, win, ground) {
    let x = x0;
    while (x < x1) {
      const w = 34 + rand() * 58;
      const progress = (x - x0) / (x1 - x0);
      const maxH = 130 + progress * 210;
      const h = 70 + rand() * maxH;
      const top = ground - h;
      el('rect', { x: f(x), y: f(top), width: f(w), height: f(520 - top) }, g);

      const crown = rand();
      if (crown < 0.22) {
        el('rect', { x: f(x + w / 2 - 1), y: f(top - 36), width: 2, height: 36 }, g);
      } else if (crown < 0.45) {
        el('rect', { x: f(x + w * 0.18), y: f(top - 16), width: f(w * 0.64), height: 16 }, g);
        el('rect', { x: f(x + w * 0.34), y: f(top - 28), width: f(w * 0.32), height: 12 }, g);
      } else if (crown < 0.58) {
        el('path', { d: `M${f(x)} ${f(top)} L${f(x + w)} ${f(top - 26)} L${f(x + w)} ${f(top)} Z` }, g);
      }

      if (withWindows) {
        for (let wx = x + 6; wx < x + w - 8; wx += 10) {
          for (let wy = top + 10; wy < ground - 10; wy += 14) {
            const r = rand();
            if (r < 0.2) {
              const tw = r < 0.035;
              el('rect', {
                x: f(wx), y: f(wy), width: 4, height: 6,
                class: tw ? 'win tw' : 'win',
                ...(tw ? { style: `--d:${(rand() * 6).toFixed(1)}s;--t:${(2 + rand() * 4).toFixed(1)}s` } : {})
              }, win);
            }
          }
        }
      }
      x += w + 2 + rand() * 7;
    }

    // ランドマークの電波塔
    const tx = x0 + (x1 - x0) * 0.72;
    el('path', { d: `M${tx - 26} 520 L${tx - 6} 170 L${tx - 3} 120 L${tx + 3} 120 L${tx + 6} 170 L${tx + 26} 520 Z` }, g);
    el('rect', { x: tx - 12, y: 210, width: 24, height: 12 }, g);
    el('rect', { x: tx - 1, y: 60, width: 2, height: 62 }, g);
    if (withWindows) el('circle', { cx: tx, cy: 60, r: 2.5, class: 'beacon' }, win);
  }

  // 神社と鳥居（中央）
  function drawShrine(near, accent, cx, rand) {
    // 丘
    el('path', { d: `M${cx - 260} 520 Q${cx - 170} 438 ${cx - 100} 410 Q${cx} 380 ${cx + 100} 410 Q${cx + 170} 438 ${cx + 260} 520 Z` }, near);

    // 鎮守の森（杉）
    const cedar = (x, base, h, w) => el('path', { d: `M${f(x - w / 2)} ${f(base)} L${f(x)} ${f(base - h)} L${f(x + w / 2)} ${f(base)} Z` }, near);
    for (let i = 0; i < 7; i++) {
      const lx = cx - 210 + i * 18 + rand() * 8;
      const rx = cx + 210 - i * 18 - rand() * 8;
      const baseL = 470 - i * 9, baseR = 470 - i * 9;
      cedar(lx, baseL, 60 + rand() * 50, 26 + rand() * 10);
      cedar(rx, baseR, 60 + rand() * 50, 26 + rand() * 10);
    }

    // 社殿
    el('rect', { x: cx - 64, y: 376, width: 128, height: 14 }, near);
    el('rect', { x: cx - 50, y: 344, width: 100, height: 34 }, near);
    el('path', { d: `M${cx - 86} 350 Q${cx - 52} 346 ${cx - 32} 304 L${cx + 32} 304 Q${cx + 52} 346 ${cx + 86} 350 L${cx + 86} 354 L${cx - 86} 354 Z` }, near);
    // 千木と鰹木
    el('path', { d: `M${cx - 38} 310 L${cx - 26} 290 L${cx - 23} 292 L${cx - 33} 310 Z M${cx - 26} 310 L${cx - 38} 290 L${cx - 41} 292 L${cx - 31} 310 Z`, }, near);
    el('path', { d: `M${cx + 38} 310 L${cx + 26} 290 L${cx + 23} 292 L${cx + 33} 310 Z M${cx + 26} 310 L${cx + 38} 290 L${cx + 41} 292 L${cx + 31} 310 Z`, }, near);
    [-15, -5, 5, 15].forEach(o => el('rect', { x: cx + o - 3, y: 298, width: 6, height: 6 }, near));

    // 参道の石段
    el('path', { d: `M${cx - 16} 390 L${cx + 16} 390 L${cx + 34} 520 L${cx - 34} 520 Z`, class: 'stairs' }, near);
    for (let y = 398; y < 520; y += 8) {
      const t = (y - 390) / 130;
      el('line', { x1: f(cx - 16 - 18 * t), y1: y, x2: f(cx + 16 + 18 * t), y2: y, class: 'stair-line' }, near);
    }

    // 鳥居（朱色）
    const t = el('g', { class: 'torii' }, accent);
    el('path', { d: `M${cx - 74} 404 Q${cx} 420 ${cx + 74} 404 L${cx + 72} 413 Q${cx} 427 ${cx - 72} 413 Z` }, t);
    el('rect', { x: cx - 62, y: 418, width: 124, height: 6 }, t);
    el('rect', { x: cx - 4, y: 424, width: 8, height: 14 }, t);
    el('rect', { x: cx - 60, y: 438, width: 120, height: 7 }, t);
    el('rect', { x: cx - 50, y: 418, width: 10, height: 102 }, t);
    el('rect', { x: cx + 40, y: 418, width: 10, height: 102 }, t);
  }

  // 手前の茂み（地面をつなぐ）
  function drawBushes(g, rand, W) {
    for (let x = -20; x < W + 40; x += 26 + rand() * 30) {
      el('circle', { cx: f(x), cy: f(522 + rand() * 6), r: f(14 + rand() * 22) }, g);
    }
  }

  // 遠景の山並み + 遠くのビル
  function drawFar(g, rand, W) {
    let d = `M0 520 L0 ${f(420 + rand() * 20)}`;
    for (let x = 0; x < W; x += 160) {
      d += ` Q${f(x + 80)} ${f(350 + rand() * 70)} ${f(x + 160)} ${f(410 + rand() * 25)}`;
    }
    d += ` L${W} 520 Z`;
    el('path', { d }, g);
    for (let x = 960; x < W; x += 20 + rand() * 26) {
      const h = 60 + rand() * 120;
      el('rect', { x: f(x), y: f(430 - h), width: f(14 + rand() * 22), height: f(90 + h) }, g);
    }
  }

  function buildScene(host) {
    const mode = host.dataset.scenery || 'kv';
    const W = 1600, H = 520;
    const rand = seeded(Number(host.dataset.seed) || 8626);
    const lit = mode !== 'band';

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': 'true', class: 'scene' });

    // 奥から順にレイヤーを重ねる（外側の g はパララックス用、内側の g は登場アニメ用）
    const layer = (name, depth) => {
      const outer = el('g', { class: 'parallax', 'data-depth': depth }, svg);
      return el('g', { class: `scene-layer scene-${name}` }, outer);
    };

    if (mode === 'kv') {
      const sky = layer('sky', 0.45);
      el('circle', { cx: 1060, cy: 150, r: 46, class: 'moon' }, sky);
      el('circle', { cx: 1060, cy: 150, r: 72, class: 'halo' }, sky);
      el('circle', { cx: 1060, cy: 150, r: 92, class: 'halo halo-2' }, sky);
    }

    const far = layer('far', 0.3);
    drawFar(far, rand, W);

    // 窓明かりは建物の上に重なる別レイヤーへ、建物と同時に描く
    const mid = layer('mid', 0.16);
    const lights = layer('lights', 0.16);
    drawCastle(mid, 400, lit, lights);
    drawCity(mid, 1010, W + 20, rand, lit, lights, 440);

    const near = layer('near', 0.06);
    const accent = layer('accent', 0.06);
    drawShrine(near, accent, 800, rand);
    drawBushes(near, rand, W);

    if (mode === 'kv') {
      // ふわふわ漂う魔素の粒
      const motes = layer('motes', 0.1);
      for (let i = 0; i < 28; i++) {
        el('circle', {
          cx: f(rand() * W), cy: f(200 + rand() * 280), r: f(1.4 + rand() * 2.4),
          class: `mote mote-${i % 3}`,
          style: `--d:${(rand() * 8).toFixed(1)}s;--t:${(6 + rand() * 6).toFixed(1)}s`
        }, motes);
      }
    }

    host.appendChild(svg);
    return svg;
  }

  function setupParallax() {
    const groups = [...document.querySelectorAll('.kv .parallax, .detail-hero .parallax')];
    if (!groups.length || reduceMotion) return;
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      if (y < window.innerHeight * 1.2) {
        groups.forEach(g => { g.style.transform = `translateY(${(y * Number(g.dataset.depth)).toFixed(1)}px)`; });
      }
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
  }

  /* ─────────────────────────────
     テキストアニメーション
     ───────────────────────────── */

  const SPLIT_TARGETS = [
    '.kv-title', '.kv-sub', '.kv-vertical',
    '.section-headline-label', '.section-lead',
    '.hero-title', '.hero-name', '.hero-eyebrow', '.hero-world', '.hero-reading',
    '.section-title', '.footer-logo', '.world-name'
  ].join(',');

  const WIPE_TARGETS = '.section-text, .hero-catch, .hero-short-desc, .world-card';

  // 英数字の単語はまとめ、それ以外（日本語）は1文字ずつ分ける
  const TOKEN = /[A-Za-z0-9'’.\-]+|\s+|./gu;

  function splitText(root) {
    if (root.dataset.splitDone) return;
    root.dataset.splitDone = '1';
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) { walk(child); return; }
        if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) return;

        const frag = document.createDocumentFragment();
        const sr = document.createElement('span');
        sr.className = 'sr-only';
        sr.textContent = child.textContent;
        frag.appendChild(sr);

        const vis = document.createElement('span');
        vis.setAttribute('aria-hidden', 'true');
        for (const tok of child.textContent.match(TOKEN) || []) {
          if (/^\s+$/.test(tok)) { vis.appendChild(document.createTextNode(' ')); continue; }
          const word = document.createElement('span');
          word.className = 'word';
          for (const ch of tok) {
            const c = document.createElement('span');
            c.className = 'char';
            c.style.setProperty('--i', i++);
            c.textContent = ch;
            word.appendChild(c);
          }
          vis.appendChild(word);
        }
        frag.appendChild(vis);
        node.replaceChild(frag, child);
      });
    };
    walk(root);
    root.classList.add('split');
  }

  let observer = null;

  function observe(items) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(e => e.classList.add('is-in'));
      return;
    }
    if (!observer) {
      observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) { e.target.classList.add('is-in'); observer.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px' });
    }
    items.forEach(e => observer.observe(e));
  }

  // root の中の見出しを分割し、画面に入ったらアニメーションさせる
  // （index のカードなど、後から追加された要素にも使う）
  window.animateIn = function (root) {
    root.querySelectorAll(SPLIT_TARGETS).forEach(splitText);
    root.querySelectorAll(WIPE_TARGETS).forEach(e => e.classList.add('wipe'));
    if (root !== document && root.matches && root.matches(WIPE_TARGETS)) root.classList.add('wipe');
    observe(root.querySelectorAll('.reveal:not(.is-in), .split:not(.is-in), .wipe:not(.is-in)'));
  };

  // タグ名から常に同じ色を返す（index の絞り込みチップとカードで色をそろえる）
  window.tagColor = function (name) {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return TAG_COLORS[h % TAG_COLORS.length];
  };

  window.colorTags = colorTags;
  function colorTags() {
    document.querySelectorAll('.hero-tag').forEach(tag => {
      tag.style.setProperty('--tag-color', window.tagColor(tag.textContent.trim()));
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // フッター上端に夜景を自動で追加
    const footer = document.querySelector('.site-footer');
    if (footer && !footer.querySelector('[data-scenery]')) {
      const s = document.createElement('div');
      s.className = 'footer-scenery';
      s.dataset.scenery = 'footer';
      s.dataset.seed = '2668';
      footer.prepend(s);
    }

    document.querySelectorAll('[data-scenery]').forEach(buildScene);
    setupParallax();
    colorTags();
    window.animateIn(document);
  });
})();
