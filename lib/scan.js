const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const SKIP = new Set(['node_modules', '.git', '.venv', 'venv', 'dist', 'build', '__pycache__', 'target']);
const MAX_DEPTH = 3;

function git(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) =>
      resolve(err ? '' : stdout.trim())
    );
  });
}

function findRepos(root, depth = 0, out = []) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  if (entries.some((e) => e.name === '.git')) { out.push(root); return out; }
  if (depth >= MAX_DEPTH) return out;
  for (const e of entries) {
    if (e.isDirectory() && !SKIP.has(e.name)) findRepos(path.join(root, e.name), depth + 1, out);
  }
  return out;
}

function readReadme(dir) {
  const name = fs.readdirSync(dir).find((f) => /^readme(\.(md|txt|rst))?$/i.test(f));
  if (!name) return '';
  try { return fs.readFileSync(path.join(dir, name), 'utf8').slice(0, 1500); } catch { return ''; }
}

function topExtensions(files) {
  const counts = {};
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (ext) counts[ext] = (counts[ext] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([e]) => e);
}

async function inspect(dir, staleDays) {
  const [head, last, first, count, subjects, files] = await Promise.all([
    git(dir, ['rev-parse', 'HEAD']),
    git(dir, ['log', '-1', '--format=%cI']),
    git(dir, ['log', '--reverse', '--format=%cI', '--max-count=1']),
    git(dir, ['rev-list', '--count', 'HEAD']),
    git(dir, ['log', '-8', '--format=%s']),
    git(dir, ['ls-files']),
  ]);
  if (!head) return null; // empty repo, nothing to bury
  const fileList = files ? files.split('\n') : [];
  const lastDate = new Date(last);
  const daysDead = Math.max(0, Math.floor((Date.now() - lastDate.getTime()) / 86400000));
  return {
    path: dir,
    name: path.basename(dir),
    head,
    lastCommit: last,
    firstCommit: first || last,
    commits: Number(count) || 0,
    fileCount: fileList.length,
    extensions: topExtensions(fileList),
    recentSubjects: subjects ? subjects.split('\n') : [],
    readme: readReadme(dir),
    daysDead,
    alive: daysDead < staleDays,
  };
}

async function scan(root, staleDays = 180) {
  const dirs = findRepos(root);
  const repos = (await Promise.all(dirs.map((d) => inspect(d, staleDays)))).filter(Boolean);
  return repos.sort((a, b) => b.daysDead - a.daysDead);
}

module.exports = { scan };
