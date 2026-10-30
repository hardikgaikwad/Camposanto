const http = require('http');
const fs = require('fs');
const path = require('path');
const { scan } = require('./lib/scan');
const llm = require('./lib/llm');
const cache = require('./lib/cache');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

let repoIndex = new Map(); // path -> repo, so clients only send a path

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve({}); } });
  });

async function sse(res, repo, model, mode) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  const cached = cache.get(repo, model, mode);
  if (cached) { send({ text: cached, cached: true }); return res.end(); }
  let full = '';
  try {
    for await (const t of llm.stream(config.ollamaUrl, model, repo, mode)) { full += t; send({ text: t }); }
    cache.set(repo, model, mode, full);
  } catch (e) {
    send({ error: e.message });
  }
  res.end();
}

async function api(req, res, url) {
  if (url.pathname === '/api/config') {
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (b.scanRoot && fs.existsSync(b.scanRoot)) {
        config.scanRoot = b.scanRoot;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
      }
    }
    return json(res, 200, { scanRoot: config.scanRoot, defaultModel: config.defaultModel });
  }
  if (url.pathname === '/api/models') {
    try { return json(res, 200, { models: await llm.listModels(config.ollamaUrl) }); }
    catch { return json(res, 200, { models: [], error: `Can't reach Ollama at ${config.ollamaUrl}. Is it running?` }); }
  }
  if (url.pathname === '/api/repos') {
    const repos = await scan(config.scanRoot, config.staleDays);
    repoIndex = new Map(repos.map((r) => [r.path, r]));
    return json(res, 200, { root: config.scanRoot, repos: repos.map(({ readme, ...r }) => r) });
  }
  if (req.method === 'POST' && (url.pathname === '/api/epitaph' || url.pathname === '/api/resurrect')) {
    const b = await readBody(req);
    const repo = repoIndex.get(b.repo);
    if (!repo || !b.model) return json(res, 400, { error: 'unknown repo or model' });
    return sse(res, repo, b.model, url.pathname.endsWith('epitaph') ? 'epitaph' : 'resurrect');
  }
  json(res, 404, { error: 'not found' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}).listen(config.port, '127.0.0.1', () => console.log(`Camposanto rests at http://localhost:${config.port}`));
