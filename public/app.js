const $ = (id) => document.getElementById(id);
const PREFERRED = ['qwen2.5:3b', 'llama3.2:3b', 'qwen3:4b', 'gemma3:4b', 'phi4-mini'];
const SHAPES = {
  round: 'M8 160V62a52 52 0 0 1 104 0v98z',
  slab: 'M10 160V28h100v132z',
  cross: 'M48 160V92H14V62h34V20h24v42h34v30H72v68z',
};
const state = { repos: [], model: '', selected: null, busy: false };

const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const year = (iso) => new Date(iso).getFullYear();
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function notice(msg) {
  $('notice').hidden = !msg;
  $('notice').textContent = msg || '';
}

async function loadModels() {
  const { models, error } = await (await fetch('/api/models')).json();
  const sel = $('model');
  sel.innerHTML = models.map((m) => `<option>${esc(m)}</option>`).join('');
  if (!models.length) {
    notice(error || 'No models installed. Try: ollama pull llama3.2:3b');
    return;
  }
  const cfg = await (await fetch('/api/config')).json();
  state.model = [cfg.defaultModel, ...PREFERRED].find((m) => models.includes(m)) || models[0];
  sel.value = state.model;
}

async function loadRepos() {
  const cfg = await (await fetch('/api/config')).json();
  $('root').value = cfg.scanRoot;
  const { repos } = await (await fetch('/api/repos')).json();
  state.repos = repos;
  $('sub').textContent = repos.length
    ? `${repos.filter((r) => !r.alive).length} resting, ${repos.filter((r) => r.alive).length} still breathing`
    : 'a quiet field for projects that stopped';
  render();
}

function render() {
  const field = $('field');
  field.innerHTML = '';
  if (!state.repos.length) {
    field.append(el('p', 'empty', 'No graves found. Your repos live on.'));
    return;
  }
  const maxCommits = Math.max(...state.repos.map((r) => r.commits), 1);
  for (const r of state.repos) {
    const h = hash(r.name);
    const kind = ['round', 'slab', 'cross'][h % 3];
    const height = 130 + Math.round((r.commits / maxCommits) * 70);
    const b = el('button', `stone ${kind}`);
    b.style.setProperty('--h', `${height}px`);
    b.style.setProperty('--tilt', `${((h >> 3) % 7) - 3}deg`);
    b.dataset.path = r.path;
    b.innerHTML =
      `<svg class="shape" viewBox="0 0 120 160" preserveAspectRatio="none"><path d="${SHAPES[kind]}"/></svg>` +
      `<span class="carve"><span class="nm">${esc(r.name)}</span><span class="yr">${year(r.firstCommit)} – ${year(r.lastCommit)}</span></span>` +
      (r.alive ? '<span class="candle"><b></b><i></i></span>' : '');
    b.addEventListener('mouseenter', () => haunt(b));
    b.addEventListener('focus', () => haunt(b));
    b.addEventListener('click', () => open(r, b));
    field.append(b);
  }
}

function haunt(stone) {
  const g = $('ghost');
  const r = stone.getBoundingClientRect();
  g.classList.add('on');
  g.style.transform = `translate(${r.left + r.width / 2 - 11}px, ${r.top - 34}px)`;
}

// Reads our SSE endpoint and calls onText for each chunk. Resolves when the stream ends.
async function streamPost(url, body, onText) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const line = buf.slice(0, i).replace(/^data: /, '');
      buf = buf.slice(i + 2);
      const msg = JSON.parse(line);
      if (msg.error) throw new Error(msg.error);
      onText(msg.text);
    }
  }
}

async function open(repo, stone) {
  document.querySelectorAll('.stone.sel').forEach((s) => s.classList.remove('sel'));
  stone.classList.add('sel');
  state.selected = repo;
  $('p-name').textContent = repo.name;
  $('p-years').textContent = `${year(repo.firstCommit)} – ${year(repo.lastCommit)}`;
  $('p-stats').innerHTML = [
    ['last breath', repo.lastCommit.slice(0, 10)],
    ['days gone', repo.daysDead],
    ['commits', repo.commits],
    ['files', repo.fileCount],
    ['made of', repo.extensions.join(' ') || 'unknown'],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${esc(String(v))}</dd>`).join('');
  $('p-revive').textContent = '';
  $('panel').classList.add('open');
  await inscribe($('p-text'), '/api/epitaph', repo);
}

async function inscribe(target, url, repo) {
  target.className = target.classList.contains('revive') ? 'revive' : 'inscription';
  target.textContent = '';
  try {
    await streamPost(url, { repo: repo.path, model: state.model }, (t) => { if (state.selected === repo) target.textContent += t; });
  } catch (e) {
    target.classList.add('err');
    target.textContent = e.message;
  }
}

$('resurrect').addEventListener('click', async () => {
  const repo = state.selected;
  if (!repo) return;
  $('resurrect').disabled = true;
  $('p-revive').textContent = 'stirring…';
  await inscribe($('p-revive'), '/api/resurrect', repo);
  $('resurrect').disabled = false;
});

$('close').addEventListener('click', () => {
  $('panel').classList.remove('open');
  document.querySelectorAll('.stone.sel').forEach((s) => s.classList.remove('sel'));
  state.selected = null;
});

$('model').addEventListener('change', (e) => { state.model = e.target.value; });

$('root').addEventListener('change', async (e) => {
  await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scanRoot: e.target.value }) });
  await loadRepos();
});

$('bury').addEventListener('click', async () => {
  const btn = $('bury');
  btn.disabled = true;
  let n = 0;
  for (const r of state.repos) {
    btn.textContent = `burying ${++n}/${state.repos.length}`;
    try { await streamPost('/api/epitaph', { repo: r.path, model: state.model }, () => {}); }
    catch (e) { notice(e.message); break; }
  }
  btn.textContent = 'bury all';
  btn.disabled = false;
});

(async () => {
  await loadModels();
  await loadRepos();
})();
