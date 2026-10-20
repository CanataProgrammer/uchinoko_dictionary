/* ═══════════════════════════════════════════
   管理画面（admin.html）
   ・ID / パスワードでログイン
   ・世界・キャラクターの追加 / 編集 / 削除、タグ一覧の編集、画像のアップロード
   ・保存すると GitHub のリポジトリへ直接コミットする
     （data/worlds.json と、Discord・X の埋め込み用の共有ページ s/… を 1 回のコミットで）
   ═══════════════════════════════════════════ */
(function () {
  'use strict';

  const R = CZ.repo;

  /* ─── ログイン情報 ───
     パスワードそのものは置かず、PBKDF2 でハッシュ化した値だけを持つ。
     変更したいときは同じ方式で salt / hash を作り直して差し替える */
  const LOGIN = {
    salt: '33e272050cad917b1172f3939e131bc3',
    hash: 'df76477567a8ab9de5ef829f46570cd00586d18e172380b1c6f76313f1b1b81c',
    iterations: 250000
  };
  const TOKEN_SALT = 'ca6c0e71d351f585617640e273a64287';
  const TOKEN_STORE = 'cz-admin-token';   // localStorage：パスワードで暗号化した GitHub トークン
  const SESSION_HOURS = 8;

  const $ = id => document.getElementById(id);
  const views = { login: $('login-view'), token: $('token-view'), app: $('app-view') };
  const editor = $('editor');
  const clone = v => JSON.parse(JSON.stringify(v));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let token = sessionStorage.getItem('cz-token');
  let secret = null; // ログイン中だけメモリに置く（トークンの暗号化に使う）

  const state = {
    data: null,      // GitHub 上の最新データ
    sha: null,       // data/worlds.json の sha（別の場所での更新に気づくため）
    edit: null,      // 編集中の内容
    dirty: false,    // 未保存の変更があるか
    hash: location.hash,
    busy: false
  };
  const localPreviews = {}; // アップロード直後の画像を、公開前でも表示するため

  function show(name) {
    for (const k in views) views[k].hidden = k !== name;
    $('logout').hidden = name === 'login';
  }

  /* ═══════════ 暗号まわり ═══════════ */
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const fromHex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
  const toB64 = bytes => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const fromB64 = b64 => {
    const s = atob(String(b64).replace(/\s/g, ''));
    const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  };

  const baseKey = text => crypto.subtle.importKey('raw', new TextEncoder().encode(text), 'PBKDF2', false, ['deriveBits', 'deriveKey']);

  async function loginHash(text) {
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(LOGIN.salt), iterations: LOGIN.iterations },
      await baseKey(text), 256);
    return hex(bits);
  }

  async function aesKey(text) {
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(TOKEN_SALT), iterations: LOGIN.iterations },
      await baseKey(text), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function encryptToken(plain, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(text), new TextEncoder().encode(plain));
    return JSON.stringify({ iv: hex(iv), ct: toB64(new Uint8Array(ct)) });
  }

  async function decryptToken(stored, text) {
    const { iv, ct } = JSON.parse(stored);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(iv) }, await aesKey(text), fromB64(ct));
    return new TextDecoder().decode(plain);
  }

  /* ═══════════ ログイン ═══════════ */
  $('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const err = $('login-error');
    err.textContent = '';
    btn.disabled = true;
    try {
      const text = `${$('login-id').value.trim()}\u0000${$('login-pass').value}`;
      if ((await loginHash(text)) !== LOGIN.hash) {
        await sleep(800);
        err.textContent = 'ID またはパスワードが違います。';
        return;
      }
      secret = text;
      sessionStorage.setItem('cz-admin', JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600 * 1000 }));
      $('login-pass').value = '';

      const stored = localStorage.getItem(TOKEN_STORE);
      if (stored) {
        try {
          token = await decryptToken(stored, secret);
          sessionStorage.setItem('cz-token', token);
          startApp();
          return;
        } catch (x) {
          localStorage.removeItem(TOKEN_STORE);
        }
      }
      show('token');
      $('token-input').focus();
    } catch (x) {
      err.textContent = 'ログイン処理に失敗しました。https のページ（または localhost）で開いているか確認してください。';
    } finally {
      btn.disabled = false;
    }
  });

  $('token-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const err = $('token-error');
    err.textContent = '';
    const value = $('token-input').value.trim();
    if (!secret) { show('login'); return; }
    btn.disabled = true;
    token = value;
    try {
      await gh(`contents/${R.dataPath}?ref=${R.branch}`);
      localStorage.setItem(TOKEN_STORE, await encryptToken(value, secret));
      sessionStorage.setItem('cz-token', value);
      $('token-input').value = '';
      startApp();
    } catch (x) {
      token = null;
      err.textContent = x.message;
    } finally {
      btn.disabled = false;
    }
  });

  function logout() {
    if (state.dirty && !confirm('保存していない変更があります。破棄してログアウトしますか？')) return;
    state.dirty = false;
    sessionStorage.removeItem('cz-admin');
    sessionStorage.removeItem('cz-token');
    token = null;
    secret = null;
    location.hash = '';
    show('login');
    $('login-id').focus();
  }

  $('logout').addEventListener('click', logout);

  $('reset-token').addEventListener('click', () => {
    if (!confirm('この端末に保存した GitHub トークンを削除して、登録し直しますか？')) return;
    localStorage.removeItem(TOKEN_STORE);
    sessionStorage.removeItem('cz-token');
    token = null;
    if (secret) { show('token'); $('token-input').focus(); } else logout();
  });

  /* ═══════════ GitHub API ═══════════ */
  function ghMessage(status) {
    if (status === 401) return 'GitHub トークンが無効か期限切れです。「GitHub トークンを再設定」から登録し直してください。';
    if (status === 403 || status === 404) return 'トークンにこのリポジトリへのアクセス権がありません。Contents を「Read and write」にしたか確認してください。';
    if (status === 409 || status === 422) return '保存先のファイルが別の場所で更新されていました。最新の内容を読み込み直したので、もう一度「保存」を押してください。';
    return `GitHub との通信に失敗しました（エラー ${status}）。時間をおいて試してください。`;
  }

  async function gh(path, opts = {}) {
    let res;
    try {
      res = await fetch(`https://api.github.com/repos/${R.owner}/${R.name}/${path}`, {
        method: opts.method || 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          ...(opts.body ? { 'Content-Type': 'application/json' } : {})
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: 'no-store'
      });
    } catch (x) {
      throw new Error('GitHub に接続できませんでした。ネットワークを確認してください。');
    }
    if (!res.ok) {
      const e = new Error(ghMessage(res.status));
      e.status = res.status;
      throw e;
    }
    return res.json();
  }

  async function fetchData() {
    const f = await gh(`contents/${R.dataPath}?ref=${R.branch}`);
    // 1MB を超えるファイルは content が空になるので blob API で取り直す
    const b64 = f.content || (await gh(`git/blobs/${f.sha}`)).content;
    state.data = JSON.parse(new TextDecoder().decode(fromB64(b64)));
    state.data.worlds = state.data.worlds || [];
    state.data.all_tags = state.data.all_tags || [];
    state.sha = f.sha;
  }

  const utf8 = text => new TextEncoder().encode(text);

  /* git が付けるファイルの sha（中身が変わっていないファイルは書き直さないため） */
  async function blobSha(text) {
    const body = utf8(text);
    const head = utf8(`blob ${body.length}\u0000`);
    const all = new Uint8Array(head.length + body.length);
    all.set(head);
    all.set(body, head.length);
    return hex(await crypto.subtle.digest('SHA-1', all));
  }

  /* 保存するファイルの一覧（パス → 中身）：data/worlds.json と、すべての世界・キャラの共有用ページ。
     以前の URL（characters/…, worlds/…）のページが残っていれば、それも同じ中身で更新する */
  function siteFiles(next, existing) {
    const files = new Map([[R.dataPath, JSON.stringify(next, null, 2) + '\n']]);
    const add = (wid, cid) => {
      const html = CZ.sharePage(next, wid, cid);
      files.set(CZ.sharePath(wid, cid), html);
      if (existing.has(CZ.legacyPath(wid, cid))) files.set(CZ.legacyPath(wid, cid), html);
    };
    next.worlds.forEach(w => {
      add(w.id);
      (w.characters || []).forEach(c => add(w.id, c.id));
    });
    return files;
  }

  /* data/worlds.json と共有用ページを、1 回のコミットにまとめて保存する（Git Data API）
     共有用フォルダ（s/）にある、もう存在しない世界・キャラのページは削除する */
  async function putData(next, message) {
    const ref = await gh(`git/ref/heads/${R.branch}`);
    const parent = ref.object.sha;
    const base = (await gh(`git/commits/${parent}`)).tree.sha;
    const tree = await gh(`git/trees/${base}?recursive=1`);
    const existing = new Map(tree.tree.filter(t => t.type === 'blob').map(t => [t.path, t.sha]));
    if (existing.get(R.dataPath) !== state.sha) {
      const e = new Error(ghMessage(409));
      e.status = 409;
      throw e;
    }

    const files = siteFiles(next, existing);
    const changes = [];
    let dataSha = state.sha;
    for (const [path, text] of files) {
      const sha = await blobSha(text);
      if (path === R.dataPath) dataSha = sha;
      if (existing.get(path) === sha) continue;
      const blob = await gh('git/blobs', { method: 'POST', body: { content: toB64(utf8(text)), encoding: 'base64' } });
      changes.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    for (const path of existing.keys()) {
      if (path.startsWith(CZ.SHARE_DIR) && path.endsWith('.html') && !files.has(path)) {
        changes.push({ path, mode: '100644', type: 'blob', sha: null });
      }
    }
    if (!changes.length) return;

    const newTree = await gh('git/trees', { method: 'POST', body: { base_tree: base, tree: changes } });
    const commit = await gh('git/commits', { method: 'POST', body: { message, tree: newTree.sha, parents: [parent] } });
    // 途中で別のコミットが入っていたら 422 になる（上書きはしない）
    await gh(`git/refs/heads/${R.branch}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
    state.sha = dataSha;
  }

  async function uploadImage(file, folder) {
    const ext = ((file.name.match(/\.(png|jpe?g|gif|webp|avif)$/i) || [])[1] || '').toLowerCase();
    if (!ext) throw new Error('png / jpg / gif / webp の画像を選んでください。');
    if (file.size > 15 * 1024 * 1024) throw new Error('画像は 15MB 以下にしてください。');
    const base = file.name.replace(/\.[^.]+$/, '').toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
    const dir = String(folder || 'common').replace(/[^a-z0-9_-]/gi, '') || 'common';
    const path = `assets/${dir}/${base}-${Date.now().toString(36)}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await gh(`contents/${path}`, {
      method: 'PUT',
      body: { message: `管理画面: 画像を追加 (${path})`, content: toB64(bytes), branch: R.branch }
    });
    localPreviews[path] = URL.createObjectURL(file);
    return path;
  }

  /* 変更後のデータ（next）を GitHub に保存する */
  async function commit(next, message) {
    setBusy(true);
    try {
      await putData(next, message);
      state.data = next;
      state.dirty = false;
      CZ.rememberData(next);
      toast('保存しました。公開サイトへの反映には 1〜2 分かかります。');
      renderTree();
      return true;
    } catch (x) {
      if (x.status === 409 || x.status === 422) {
        try { await fetchData(); renderTree(); } catch (y) { /* 下のメッセージで十分 */ }
      }
      toast(x.message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  /* ═══════════ 起動 ═══════════ */
  async function startApp() {
    show('app');
    editor.innerHTML = '<p class="editor-loading">データを読み込んでいます…</p>';
    try {
      await fetchData();
    } catch (x) {
      editor.innerHTML = '';
      editor.append(h('div', { class: 'editor-error' },
        h('p', {}, x.message),
        h('button', { type: 'button', class: 'btn-pill', onclick: startApp }, '再読み込み')));
      return;
    }
    renderTree();
    route();
  }

  /* ═══════════ 画面の切り替え（URL の # で管理） ═══════════
     #world/世界ID  #char/世界ID/キャラID  #new-world/番地  #new-char/世界ID  #tags
     （「世界」は 1086番地では「都市」と呼ぶ。中身は同じ） */
  window.addEventListener('hashchange', () => {
    if (!state.data) return;
    if (state.dirty && !confirm('保存していない変更があります。破棄して移動しますか？')) {
      history.replaceState(null, '', state.hash || location.pathname);
      return;
    }
    state.dirty = false;
    route();
  });

  window.addEventListener('beforeunload', e => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && state.edit && state.edit.save) {
      e.preventDefault();
      state.edit.save();
    }
  });

  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.go; }));

  function route() {
    state.hash = location.hash;
    state.dirty = false;
    const [kind, a, b] = location.hash.slice(1).split('/').map(decodeURIComponent);
    state.edit = null;
    setTheme(CZ.DEFAULT_ADDRESS);
    if (kind === 'world' && a) editWorld(a);
    else if (kind === 'new-world') editWorld(null, a);
    else if (kind === 'char' && a && b) editChar(a, b);
    else if (kind === 'new-char' && a) editChar(a, null);
    else if (kind === 'tags') editTags();
    else welcome();
    renderTree();
    editor.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  // 編集中の世界（都市）の番地の配色にする（1086番地なら青）
  function setTheme(addr) { document.documentElement.dataset.address = CZ.address(addr).id; }
  const unitOf = w => CZ.address(CZ.worldAddress(w)).unit;

  /* ═══════════ DOM ヘルパー ═══════════ */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function touch() {
    state.dirty = true;
    const s = $('save-status');
    if (s) { s.textContent = '未保存の変更があります'; s.classList.add('is-dirty'); }
  }

  function setBusy(on) {
    state.busy = on;
    document.querySelectorAll('[data-save]').forEach(b => {
      b.disabled = on;
      b.textContent = on ? '保存中…' : b.dataset.save;
    });
  }

  let toastTimer = null;
  function toast(msg, type) {
    const t = $('toast');
    t.textContent = msg;
    t.className = `toast is-show${type === 'error' ? ' is-error' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, type === 'error' ? 9000 : 4500);
  }

  function autoGrow(ta) {
    const fit = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
    ta.addEventListener('input', fit);
    requestAnimationFrame(fit);
  }

  function label(text, opt = {}) {
    return h('span', { class: 'field-label' }, text, opt.required ? h('span', { class: 'req' }, '必須') : null);
  }

  /* テキスト入力（obj[key] と連動） */
  function textField(text, obj, key, opt = {}) {
    const input = opt.multiline
      ? h('textarea', { rows: opt.rows || 3, placeholder: opt.placeholder })
      : h('input', { type: 'text', placeholder: opt.placeholder, spellcheck: opt.code ? 'false' : null, inputmode: opt.code ? 'latin' : null });
    input.value = obj[key] == null ? '' : obj[key];
    input.addEventListener('input', () => {
      obj[key] = input.value;
      touch();
      if (opt.onInput) opt.onInput(input.value);
    });
    if (opt.multiline) autoGrow(input);
    return h('label', { class: `field${opt.wide ? ' field-wide' : ''}` },
      label(text, opt), input, opt.help ? h('span', { class: 'field-help' }, opt.help) : null);
  }

  /* 画像（パスの入力 + アップロード + プレビュー） */
  function imageField(text, obj, key, folderFn, opt = {}) {
    const preview = h('div', { class: 'img-preview' });
    const input = h('input', { type: 'text', placeholder: 'assets/…/image.png', spellcheck: 'false' });
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/avif', hidden: true });
    const status = h('span', { class: 'field-help' }, opt.help || '');
    const draw = () => {
      const v = obj[key] || '';
      preview.innerHTML = '';
      preview.append(v ? h('img', { src: localPreviews[v] || v, alt: '' }) : h('span', { class: 'img-empty' }, '画像なし'));
    };
    input.value = obj[key] || '';
    input.addEventListener('input', () => { obj[key] = input.value.trim(); touch(); draw(); });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      status.textContent = 'アップロード中…';
      try {
        const path = await uploadImage(f, folderFn());
        obj[key] = path;
        input.value = path;
        touch();
        draw();
        status.textContent = 'アップロードしました。「保存」を押すとページに反映されます。';
      } catch (x) {
        status.textContent = x.message;
      }
    });
    draw();
    return h('div', { class: 'field field-image' },
      label(text, opt),
      h('div', { class: 'img-row' },
        preview,
        h('div', { class: 'img-controls' },
          input,
          h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn-small', onclick: () => file.click() }, '画像をアップロード'),
            h('button', { type: 'button', class: 'btn-small btn-ghost', onclick: () => { obj[key] = ''; input.value = ''; touch(); draw(); } }, 'はずす')),
          status)),
      file);
  }

  /* タグ（チップで追加・削除） */
  function tagsField(obj) {
    obj.tags = obj.tags || [];
    const list = h('div', { class: 'chip-list' });
    const suggest = h('div', { class: 'chip-suggest' });
    const input = h('input', { type: 'text', placeholder: '新しいタグを入力して Enter' });
    const add = v => {
      v = v.trim();
      if (v && !obj.tags.includes(v)) { obj.tags.push(v); touch(); }
      draw();
    };
    function draw() {
      list.innerHTML = '';
      obj.tags.forEach((t, i) => list.append(h('span', { class: 'chip is-on' }, t,
        h('button', { type: 'button', 'aria-label': `${t} をはずす`, onclick: () => { obj.tags.splice(i, 1); touch(); draw(); } }, '×'))));
      if (!obj.tags.length) list.append(h('span', { class: 'field-help' }, 'タグなし'));
      suggest.innerHTML = '';
      state.data.all_tags.filter(t => !obj.tags.includes(t)).forEach(t =>
        suggest.append(h('button', { type: 'button', class: 'chip', onclick: () => add(t) }, `＋ ${t}`)));
    }
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(input.value); input.value = ''; }
    });
    draw();
    return h('div', { class: 'field field-wide' }, label('タグ'), list, input,
      h('span', { class: 'field-help' }, 'よく使うタグ（クリックで追加）'), suggest);
  }

  /* 並べ替え・削除ができるリスト */
  function listEditor(arr, itemFn, newItem, addText, opt = {}) {
    const box = h('div', { class: 'list-editor' });
    const move = (i, j) => { [arr[i], arr[j]] = [arr[j], arr[i]]; touch(); draw(); };
    function draw() {
      box.innerHTML = '';
      arr.forEach((item, i) => {
        box.append(h('div', { class: `list-row ${opt.rowClass || ''}` },
          h('div', { class: 'list-row-body' }, itemFn(item, i, draw)),
          h('div', { class: 'row-ctrl' },
            h('button', { type: 'button', class: 'icon-btn', title: '上へ', 'aria-label': '上へ', disabled: i === 0, onclick: () => move(i, i - 1) }, '↑'),
            h('button', { type: 'button', class: 'icon-btn', title: '下へ', 'aria-label': '下へ', disabled: i === arr.length - 1, onclick: () => move(i, i + 1) }, '↓'),
            h('button', {
              type: 'button', class: 'icon-btn is-danger', title: '削除', 'aria-label': '削除',
              onclick: () => {
                if (opt.confirmText && !confirm(opt.confirmText(item))) return;
                arr.splice(i, 1); touch(); draw();
              }
            }, '×'))));
      });
      if (!arr.length && opt.emptyText) box.append(h('p', { class: 'field-help' }, opt.emptyText));
      if (newItem) box.append(h('button', { type: 'button', class: 'btn-small btn-add', onclick: () => { arr.push(newItem()); touch(); draw(); } }, `＋ ${addText}`));
    }
    box.redraw = draw;
    draw();
    return box;
  }

  /* 配列の i 番目に直接つながった入力欄 */
  function cellInput(arr, i, placeholder) {
    const input = h('input', { type: 'text', placeholder });
    input.value = arr[i] == null ? '' : arr[i];
    input.addEventListener('input', () => { arr[i] = input.value; touch(); });
    return input;
  }

  /* ═══════════ 本文ブロック ═══════════ */
  const BLOCK_TYPES = {
    stats: { label: '項目の表', title: '基本情報', make: () => ({ rows: [['', '']] }) },
    text: { label: '文章', title: '', make: () => ({ body: '' }) },
    cards: { label: 'カード（勢力・組織など）', title: '主な勢力・組織', make: () => ({ items: [{ name: '', desc: '' }] }) },
    gallery: { label: '画像ギャラリー', title: 'イラスト', make: () => ({ items: [] }) },
    relations: { label: '関係キャラクター', title: '関係するキャラクター', make: () => ({ items: [] }) },
    characters: { label: 'この世界・都市のキャラ一覧（自動）', title: '登場キャラクター', make: () => ({}), worldOnly: true }
  };

  function allCharOptions() {
    const out = [];
    state.data.worlds.forEach(w => (w.characters || []).forEach(c =>
      out.push({ value: `${w.id}/${c.id}`, text: `${w.name} ／ ${c.name}` })));
    return out;
  }

  function relationItem(it, folderFn) {
    const box = h('div', { class: 'relation-edit' });
    function draw() {
      box.innerHTML = '';
      const select = h('select', {},
        h('option', { value: '' }, '（サイトに載っていないキャラ・自由入力）'),
        allCharOptions().map(o => h('option', { value: o.value, selected: o.value === it.target }, o.text)));
      select.addEventListener('change', () => { it.target = select.value; touch(); draw(); });
      box.append(
        h('label', { class: 'field field-wide' }, label('相手'), select),
        textField('関係（例：相棒、幼なじみ）', it, 'label'),
        textField(it.target ? '表示名（空欄なら相手の名前）' : '名前', it, 'name'));
      if (!it.target) {
        box.append(
          imageField('アイコン画像（任意）', it, 'thumbnail', folderFn),
          textField('リンク先 URL（任意）', it, 'href', { code: true, placeholder: 'https://…' }));
      }
    }
    draw();
    return box;
  }

  function blockBody(b, folderFn) {
    const type = BLOCK_TYPES[b.type];
    const parts = [
      h('div', { class: 'block-type' }, type ? type.label : b.type),
      textField('見出し', b, 'title', { placeholder: '例：性格・特徴' })
    ];
    if (b.type === 'stats') {
      b.rows = b.rows || [];
      parts.push(h('div', { class: 'field field-wide' }, label('項目'),
        listEditor(b.rows, row => h('div', { class: 'pair' }, cellInput(row, 0, '項目名（例：年齢）'), cellInput(row, 1, '内容')),
          () => ['', ''], '行を追加', { rowClass: 'is-compact' })));
    } else if (b.type === 'text') {
      parts.push(textField('本文', b, 'body', {
        multiline: true, rows: 8, wide: true,
        help: '行の先頭に「# 」を付けると小見出し、**文字** で太字、URL は自動でリンクになります。'
      }));
    } else if (b.type === 'cards') {
      b.items = b.items || [];
      parts.push(h('div', { class: 'field field-wide' }, label('カード'),
        listEditor(b.items, it => [textField('名前', it, 'name'), textField('説明', it, 'desc', { multiline: true, rows: 2 })],
          () => ({ name: '', desc: '' }), 'カードを追加')));
    } else if (b.type === 'gallery') {
      b.items = b.items || [];
      parts.push(h('div', { class: 'field field-wide' }, label('画像'),
        listEditor(b.items, it => [imageField('画像', it, 'src', folderFn), textField('キャプション', it, 'caption')],
          () => ({ src: '', caption: '' }), '画像を追加', { emptyText: 'まだ画像がありません。' })));
    } else if (b.type === 'relations') {
      b.items = b.items || [];
      parts.push(h('div', { class: 'field field-wide' }, label('キャラクター'),
        listEditor(b.items, it => relationItem(it, folderFn),
          () => ({ target: '', name: '', label: '' }), 'キャラクターを追加', { emptyText: 'まだ登録がありません。' })));
    } else if (b.type === 'characters') {
      parts.push(h('p', { class: 'field-help' }, 'この世界・都市に登録されているキャラクターの一覧を自動で表示します。'));
    }
    return h('div', { class: 'block-edit' }, parts);
  }

  function blocksEditor(obj, folderFn, isWorld) {
    obj.blocks = obj.blocks || [];
    const list = listEditor(obj.blocks, b => blockBody(b, folderFn), null, '', {
      rowClass: 'is-block',
      emptyText: 'ブロックがありません。下から追加してください。',
      confirmText: b => `ブロック「${b.title || BLOCK_TYPES[b.type]?.label || ''}」を削除しますか？`
    });
    const select = h('select', {},
      Object.entries(BLOCK_TYPES)
        .filter(([, t]) => isWorld || !t.worldOnly)
        .map(([k, t]) => h('option', { value: k }, t.label)));
    const add = h('button', {
      type: 'button', class: 'btn-small btn-add',
      onclick: () => {
        const t = BLOCK_TYPES[select.value];
        obj.blocks.push({ type: select.value, title: t.title, ...t.make() });
        touch();
        list.redraw();
      }
    }, '＋ ブロックを追加');
    return h('div', {}, list, h('div', { class: 'block-add' }, select, add));
  }

  /* ═══════════ 編集画面の共通枠 ═══════════ */
  function panel({ crumbs, title, viewHref, shareUrl, onDelete, onSave, sections }) {
    editor.innerHTML = '';
    const titleEl = h('h1', { class: 'editor-title' }, title || '（名前未設定）');
    const saveBtn = h('button', { type: 'button', class: 'btn-pill', 'data-save': '保存する', onclick: onSave }, '保存する');
    editor.append(
      h('div', { class: 'editor-head' },
        h('p', { class: 'editor-crumbs' }, crumbs),
        titleEl,
        h('div', { class: 'btn-row' },
          viewHref ? h('a', { class: 'btn-small btn-ghost', href: viewHref }, 'ページを見る') : null,
          shareUrl ? h('button', {
            type: 'button', class: 'btn-small btn-ghost', title: shareUrl,
            onclick: async () => toast(await CZ.copyText(shareUrl)
              ? '共有用URLをコピーしました。Discord・X に貼ると名前と画像が表示されます。'
              : `コピーできませんでした：${shareUrl}`, 'info')
          }, '共有用URLをコピー') : null,
          onDelete ? h('button', { type: 'button', class: 'btn-small is-danger', onclick: onDelete }, '削除') : null)),
      ...sections.map(([heading, help, ...fields]) => h('section', { class: 'editor-section' },
        h('h2', { class: 'editor-section-title' }, heading),
        help ? h('p', { class: 'field-help' }, help) : null,
        h('div', { class: 'field-grid' }, fields))),
      h('div', { class: 'save-bar' },
        h('span', { class: 'save-status', id: 'save-status' }, '変更はまだありません'),
        h('span', { class: 'save-hint' }, 'Ctrl + S でも保存できます'),
        saveBtn));
    state.edit.save = onSave;
    return titleEl;
  }

  const ID_RE = /^[a-z0-9_-]+$/;
  function checkId(id) {
    if (!id) return 'ID を入力してください。';
    if (!ID_RE.test(id)) return 'ID は半角の小文字英数字・ハイフン・アンダーバーだけで入力してください。';
    return '';
  }

  function addTags(data, tags) {
    (tags || []).forEach(t => { if (!data.all_tags.includes(t)) data.all_tags.push(t); });
  }

  function renameRefs(data, from, to) {
    const match = typeof from === 'string' ? (t => t === from) : from;
    data.worlds.forEach(w => (w.characters || []).forEach(c => (c.blocks || []).forEach(b => {
      if (b.type === 'relations') (b.items || []).forEach(it => { if (it.target && match(it.target)) it.target = to(it.target); });
    })));
  }

  function uniqueId(prefix, taken) {
    let n = taken.length + 1;
    while (taken.includes(`${prefix}${n}`)) n++;
    return `${prefix}${n}`;
  }

  /* 空の項目を取り除いてデータを整える */
  function tidy(obj) {
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'string') obj[k] = obj[k].trim();
      if (obj[k] === '' && !['name', 'id'].includes(k)) delete obj[k];
    }
    (obj.blocks || []).forEach(b => {
      if (b.rows) b.rows = b.rows.filter(r => (r[0] || '').trim() || (r[1] || '').trim());
      if (b.items) b.items = b.items.filter(it => Object.values(it).some(v => String(v || '').trim()));
    });
    return obj;
  }

  /* ═══════════ キャラクター編集 ═══════════ */
  function newCharacter(world) {
    return {
      id: uniqueId('chara', (world.characters || []).map(c => c.id)),
      name: '',
      reading: '',
      thumbnail: '',
      tags: [],
      short_description: '',
      blocks: [
        { type: 'stats', title: '基本情報', rows: ['年齢', '身長', '体重', '誕生日', '性別', '種族', '出身'].map(k => [k, '']) },
        { type: 'text', title: '性格・特徴', body: '' },
        { type: 'text', title: '背景・設定', body: '' },
        { type: 'text', title: 'デザインメモ', body: '' },
        { type: 'gallery', title: 'イラスト', items: [] },
        { type: 'relations', title: '関係するキャラクター', items: [] }
      ]
    };
  }

  function editChar(wid, cid) {
    const world = CZ.findWorld(state.data, wid);
    const src = world && (cid ? CZ.findChar(state.data, wid, cid) : newCharacter(world));
    if (!src) return missing();
    const draft = clone(src);
    const e = state.edit = { wid, cid, draft, worldSel: wid };
    const folder = () => e.worldSel;
    const unit = unitOf(world);
    setTheme(CZ.worldAddress(world));

    // 番地ごとにまとめた「所属する世界・都市」の選択肢
    const worldSelect = h('select', {},
      CZ.ADDRESSES.map(a => h('optgroup', { label: `${a.id}番地（${a.unit}）` },
        CZ.worldsIn(state.data, a.id).map(w => h('option', { value: w.id, selected: w.id === wid }, w.name)))));
    worldSelect.addEventListener('change', () => {
      e.worldSel = worldSelect.value;
      setTheme(CZ.worldAddress(CZ.findWorld(state.data, e.worldSel)));
      touch();
    });

    let titleEl;
    const save = async () => {
      if (state.busy) return;
      const d = tidy(clone(draft));
      const problem = checkId(d.id) || (!d.name ? '名前を入力してください。' : '');
      if (problem) return toast(problem, 'error');
      const next = clone(state.data);
      const target = CZ.findWorld(next, e.worldSel);
      target.characters = target.characters || [];
      if (target.characters.some(c => c.id === d.id && !(e.wid === e.worldSel && c.id === e.cid))) {
        return toast(`この ID は同じ${unitOf(target)}の別のキャラクターが使っています。`, 'error');
      }
      if (e.cid) {
        const from = CZ.findWorld(next, e.wid);
        const idx = from.characters.findIndex(c => c.id === e.cid);
        if (from === target) from.characters[idx] = d;
        else { from.characters.splice(idx, 1); target.characters.push(d); }
        const oldRef = `${e.wid}/${e.cid}`, newRef = `${e.worldSel}/${d.id}`;
        if (oldRef !== newRef) renameRefs(next, oldRef, () => newRef);
      } else {
        target.characters.push(d);
      }
      addTags(next, d.tags);
      const ok = await commit(next, `管理画面: キャラクター「${d.name}」を${e.cid ? '更新' : '追加'}`);
      if (ok) goTo(`char/${e.worldSel}/${d.id}`);
    };

    const remove = async () => {
      if (!confirm(`「${src.name}」を削除しますか？\nこの操作は元に戻せません。`)) return;
      const next = clone(state.data);
      const w = CZ.findWorld(next, wid);
      w.characters = w.characters.filter(c => c.id !== cid);
      const ok = await commit(next, `管理画面: キャラクター「${src.name}」を削除`);
      if (ok) goTo(`world/${wid}`);
    };

    titleEl = panel({
      crumbs: [h('a', { href: `#world/${encodeURIComponent(wid)}` }, world.name), ' ／ ', cid ? 'キャラクターを編集' : 'キャラクターを追加'],
      title: draft.name,
      viewHref: cid ? CZ.charUrl(wid, cid, CZ.worldAddress(world)) : null,
      shareUrl: cid ? CZ.shareUrl(wid, cid) : null,
      onDelete: cid ? remove : null,
      onSave: save,
      sections: [
        ['一覧に表示される情報', 'トップページのキャラクター一覧に表示されます。',
          h('label', { class: 'field' }, label('所属する世界・都市'), worldSelect),
          textField('ID', draft, 'id', { required: true, code: true, help: 'ページの URL に使われます（半角小文字の英数字・-・_）。後から変えると URL も変わります。' }),
          textField('名前', draft, 'name', { required: true, placeholder: '例：□□ 彼方', onInput: v => { titleEl.textContent = v || '（名前未設定）'; } }),
          textField('読み', draft, 'reading', { placeholder: '例：はてな かなた' }),
          textField('一言紹介', draft, 'short_description', { wide: true, placeholder: '一覧カードに表示される短い紹介文' }),
          tagsField(draft),
          imageField('サムネイル画像', draft, 'thumbnail', folder, { help: '縦長（3:4）がおすすめです。' })],
        ['キャラクターページの上部', '空欄の項目は、上の「一覧に表示される情報」が使われます。',
          textField('ページの見出し名', draft, 'display_name', { placeholder: '空欄なら「名前」と同じ' }),
          textField('ページの読み・英語表記', draft, 'reading_full', { placeholder: '例：はてな 彼方/Hatena Canata' }),
          textField('所属の表記', draft, 'affiliation', { placeholder: `空欄なら${unit}名` }),
          textField('キャッチコピー', draft, 'catch', { placeholder: '例：冒険者・救世主・相棒・職員' }),
          imageField('立ち絵', draft, 'image', folder, { help: '空欄ならサムネイル画像を使います。' })],
        ['本文', 'キャラクターページに上から順に表示されます。↑↓ で並べ替えできます。',
          blocksEditor(draft, folder, false)]
      ]
    });
  }

  /* ═══════════ 世界（都市）編集 ═══════════ */
  function newWorld(addr) {
    const a = CZ.address(addr);
    return {
      id: uniqueId(a.id === CZ.DEFAULT_ADDRESS ? 'world' : 'city', state.data.worlds.map(w => w.id)),
      address: a.id,
      name: '',
      reading: '',
      eyebrow: a.eyebrow,
      description: '',
      tags: [],
      characters: [],
      blocks: [
        { type: 'stats', title: '基本設定', rows: ['舞台・時代', '技術水準', '主な種族', `${a.unit}の規模`].map(k => [k, '']) },
        { type: 'text', title: a.unit === '世界' ? '世界観・概要' : '都市の概要', body: '' },
        { type: 'cards', title: '主な勢力・組織', items: [] },
        { type: 'text', title: '補足設定', body: '' },
        { type: 'characters', title: '登場キャラクター' },
        { type: 'gallery', title: '画像資料集', items: [] }
      ]
    };
  }

  function editWorld(wid, newAddr) {
    const src = wid ? CZ.findWorld(state.data, wid) : newWorld(newAddr);
    if (!src) return missing();
    const draft = clone(src);
    delete draft.characters; // キャラクターは別画面で編集する
    draft.address = CZ.worldAddress(src);
    const e = state.edit = { wid, draft };
    const folder = () => draft.id || 'common';
    const count = (src.characters || []).length;
    const A = CZ.address(draft.address);
    const unit = A.unit;
    setTheme(A.id);

    // 番地（8626番地 / 1086番地）。変えるとその番地の一覧に移る
    const addrSelect = h('select', {},
      CZ.ADDRESSES.map(a => h('option', { value: a.id, selected: a.id === draft.address }, `${a.id}番地（${a.unit}）`)));
    addrSelect.addEventListener('change', () => { draft.address = addrSelect.value; setTheme(draft.address); touch(); });

    let titleEl;
    const save = async () => {
      if (state.busy) return;
      const d = tidy(clone(draft));
      const problem = checkId(d.id) || (!d.name ? '名前を入力してください。' : '');
      if (problem) return toast(problem, 'error');
      const next = clone(state.data);
      if (next.worlds.some(w => w.id === d.id && w.id !== wid)) return toast('この ID は別の世界・都市が使っています。', 'error');
      if (wid) {
        const idx = next.worlds.findIndex(w => w.id === wid);
        d.characters = next.worlds[idx].characters || [];
        next.worlds[idx] = d;
        if (wid !== d.id) renameRefs(next, t => t.startsWith(`${wid}/`), t => `${d.id}/${t.slice(wid.length + 1)}`);
      } else {
        d.characters = [];
        next.worlds.push(d);
      }
      const ok = await commit(next, `管理画面: ${CZ.address(d.address).unit}「${d.name}」を${wid ? '更新' : '追加'}`);
      if (ok) goTo(`world/${d.id}`);
    };

    const remove = async () => {
      const msg = count
        ? `${unit}「${src.name}」と、所属する ${count} 人のキャラクターをすべて削除しますか？\nこの操作は元に戻せません。`
        : `${unit}「${src.name}」を削除しますか？\nこの操作は元に戻せません。`;
      if (!confirm(msg)) return;
      const next = clone(state.data);
      next.worlds = next.worlds.filter(w => w.id !== wid);
      const ok = await commit(next, `管理画面: ${unit}「${src.name}」を削除`);
      if (ok) goTo('');
    };

    titleEl = panel({
      crumbs: [`${A.id}番地 ／ ${unit}を${wid ? '編集' : '追加'}`],
      title: draft.name,
      viewHref: wid ? CZ.worldUrl(wid, draft.address) : null,
      shareUrl: wid ? CZ.shareUrl(wid) : null,
      onDelete: wid ? remove : null,
      onSave: save,
      sections: [
        ['一覧に表示される情報', `トップページの${unit}カードに表示されます。`,
          h('label', { class: 'field' }, label('番地'), addrSelect),
          textField('ID', draft, 'id', { required: true, code: true, help: 'ページの URL と画像の保存先フォルダ名に使われます（半角小文字の英数字・-・_）。' }),
          textField('名前', draft, 'name', { required: true, placeholder: '例：ファボトス', onInput: v => { titleEl.textContent = v || '（名前未設定）'; } }),
          textField('説明', draft, 'description', { wide: true, multiline: true, rows: 2, placeholder: `${unit}カードに表示される説明文` }),
          imageField('サムネイル画像（任意）', draft, 'thumbnail', folder)],
        [`${unit}ページの上部`, '',
          textField('読み・英語表記', draft, 'reading', { placeholder: '例：Fabotus' }),
          textField('見出しの上の小さな英字', draft, 'eyebrow', { placeholder: A.eyebrow }),
          textField('キャッチコピー', draft, 'catch', { wide: true, placeholder: '例：ねじれにねじれた先の世界。' }),
          tagsField(draft),
          imageField('バナー画像（任意・横長）', draft, 'banner', folder)],
        ['本文', `${unit}ページに上から順に表示されます。↑↓ で並べ替えできます。`,
          blocksEditor(draft, folder, true)]
      ]
    });

    if (wid) {
      // 保存バーより上に差し込む
      editor.insertBefore(h('section', { class: 'editor-section' },
        h('h2', { class: 'editor-section-title' }, `この${unit}のキャラクター（${count} 人）`),
        h('div', { class: 'btn-row' },
          (src.characters || []).map(c => h('a', { class: 'chip', href: `#char/${encodeURIComponent(wid)}/${encodeURIComponent(c.id)}` }, c.name)),
          h('a', { class: 'btn-small btn-add', href: `#new-char/${encodeURIComponent(wid)}` }, '＋ キャラクターを追加'))),
      editor.querySelector('.save-bar'));
    }
  }

  /* ═══════════ タグ一覧 ═══════════ */
  function editTags() {
    const draft = clone(state.data.all_tags);
    state.edit = { draft };
    const used = {};
    state.data.worlds.forEach(w => (w.characters || []).forEach(c => (c.tags || []).forEach(t => { used[t] = (used[t] || 0) + 1; })));

    const save = async () => {
      if (state.busy) return;
      const next = clone(state.data);
      next.all_tags = [...new Set(draft.map(t => String(t).trim()).filter(Boolean))];
      const ok = await commit(next, '管理画面: タグ一覧を更新');
      if (ok) route();
    };

    panel({
      crumbs: ['設定'],
      title: 'タグ一覧',
      onSave: save,
      sections: [
        ['絞り込みに使うタグ', 'トップページの「タグで絞り込む」に、この順番で表示されます。キャラクターに新しいタグを付けると自動でここにも追加されます。',
          h('div', { class: 'field field-wide' },
            listEditor(draft, (t, i) => h('div', { class: 'pair' },
              cellInput(draft, i, 'タグ名'),
              h('span', { class: 'field-help' }, used[t] ? `${used[t]} 人が使用中` : '未使用')),
              () => '', 'タグを追加', { rowClass: 'is-compact' }))]
      ]
    });
  }

  /* ═══════════ その他の画面 ═══════════ */
  function welcome() {
    editor.innerHTML = '';
    const summary = CZ.ADDRESSES.map(a => {
      const worlds = CZ.worldsIn(state.data, a.id);
      const chars = worlds.reduce((n, w) => n + (w.characters || []).length, 0);
      return h('li', {}, `${a.id}番地：${a.unit} ${worlds.length} 件・キャラクター ${chars} 人`);
    });
    editor.append(h('div', { class: 'editor-head' },
      h('p', { class: 'editor-crumbs' }, 'ようこそ'),
      h('h1', { class: 'editor-title' }, '管理画面'),
      h('ul', { class: 'tips' }, summary),
      h('p', { class: 'section-text' },
        '左の一覧から編集したい世界・都市やキャラクターを選ぶか、「＋」から追加してください。')),
      h('section', { class: 'editor-section' },
        h('h2', { class: 'editor-section-title' }, '使い方のメモ'),
        h('ul', { class: 'tips' },
          h('li', {}, '「保存する」を押すと GitHub に保存され、1〜2 分ほどで公開サイトに反映されます。'),
          h('li', {}, 'このブラウザでは保存した内容がすぐに表示されます。'),
          h('li', {}, '画像は「画像をアップロード」を押すとすぐ GitHub に送られます。そのあと「保存する」でページに反映されます。'),
          h('li', {}, '文章では、行の先頭に「# 」で小見出し、**文字** で太字になります。'),
          h('li', {}, '8626番地では「世界」、1086番地では「都市」と呼びます。世界・都市の編集画面の「番地」で、あとから移すこともできます。'),
          h('li', {}, 'ログイン中は、公開ページの右下に「このページを編集」ボタンが出ます。'),
          h('li', {}, 'Discord や X に貼るときは「共有用URLをコピー」の URL を使うと、キャラ名・紹介文・画像が埋め込み表示されます（保存のたびに自動で更新されます）。'))));
  }

  function missing() {
    editor.innerHTML = '';
    editor.append(h('div', { class: 'editor-error' },
      h('p', {}, '見つかりませんでした。削除されたか、ID が変わった可能性があります。'),
      h('a', { class: 'btn-small', href: '#' }, 'トップに戻る')));
  }

  function goTo(hash) {
    state.dirty = false;
    if (location.hash.slice(1) === hash) route();
    else location.hash = hash;
  }

  /* ═══════════ 左の一覧 ═══════════ */
  async function reorder(mutate, message) {
    if (state.busy) return;
    if (state.dirty) return toast('先に編集中の内容を保存してください。', 'error');
    const next = clone(state.data);
    mutate(next);
    if (await commit(next, message)) route();
  }

  function moveBtns(arr, i, onMove) {
    return h('span', { class: 'tree-move' },
      h('button', { type: 'button', class: 'icon-btn', title: '上へ', 'aria-label': '上へ', disabled: i === 0, onclick: () => onMove(i, i - 1) }, '↑'),
      h('button', { type: 'button', class: 'icon-btn', title: '下へ', 'aria-label': '下へ', disabled: i === arr.length - 1, onclick: () => onMove(i, i + 1) }, '↓'));
  }

  function renderTree() {
    const tree = $('tree');
    if (!state.data) return;
    const current = location.hash.slice(1).split('/').map(decodeURIComponent);
    tree.innerHTML = '';
    CZ.ADDRESSES.forEach(a => {
      const worlds = CZ.worldsIn(state.data, a.id);
      tree.append(h('div', { class: `tree-addr tree-addr-${a.id}` },
        h('span', { class: 'tree-addr-name' }, `${a.id}番地`, h('small', {}, a.unitEnPlural)),
        h('a', { class: `btn-small${current[0] === 'new-world' && current[1] === a.id ? ' is-on' : ''}`, href: `#new-world/${a.id}` }, `＋ ${a.unit}を追加`)));
      worlds.forEach((w, wi) => {
        const chars = w.characters || [];
        const worldActive = (current[0] === 'world' && current[1] === w.id);
        tree.append(h('div', { class: 'tree-world' },
          h('div', { class: `tree-row${worldActive ? ' is-active' : ''}` },
            h('a', { class: 'tree-link tree-link-world', href: `#world/${encodeURIComponent(w.id)}` },
              h('span', { class: 'tree-num' }, CZ.pad(wi + 1)), w.name || w.id),
            // 並べ替えは同じ番地の中で入れ替える
            moveBtns(worlds, wi, (x, y) => reorder(d => {
              const ix = d.worlds.findIndex(v => v.id === worlds[x].id);
              const iy = d.worlds.findIndex(v => v.id === worlds[y].id);
              [d.worlds[ix], d.worlds[iy]] = [d.worlds[iy], d.worlds[ix]];
            }, `管理画面: ${a.id}番地の${a.unit}の並び順を変更`))),
          h('ul', { class: 'tree-chars' },
            chars.map((c, ci) => h('li', { class: `tree-row${current[0] === 'char' && current[1] === w.id && current[2] === c.id ? ' is-active' : ''}` },
              h('a', { class: 'tree-link', href: `#char/${encodeURIComponent(w.id)}/${encodeURIComponent(c.id)}` }, c.name || c.id),
              moveBtns(chars, ci, (x, y) => reorder(d => {
                const list = CZ.findWorld(d, w.id).characters;
                [list[x], list[y]] = [list[y], list[x]];
              }, `管理画面: 「${w.name}」のキャラクターの並び順を変更`))))),
          h('a', { class: `tree-add${current[0] === 'new-char' && current[1] === w.id ? ' is-active' : ''}`, href: `#new-char/${encodeURIComponent(w.id)}` }, '＋ キャラクターを追加')));
      });
      if (!worlds.length) tree.append(h('p', { class: 'field-help tree-empty' }, `まだ${a.unit}がありません。`));
    });
  }

  /* ═══════════ はじめに ═══════════ */
  $('repo-name').textContent = `${R.owner}/${R.name}`;
  if (CZ.isAdmin() && token) {
    startApp();
  } else {
    sessionStorage.removeItem('cz-admin');
    sessionStorage.removeItem('cz-token');
    token = null;
    show('login');
    $('login-id').focus();
  }
})();
