const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '.camposanto', 'cache.json');
let data = null;

function load() {
  if (data) return data;
  try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { data = {}; }
  return data;
}

const key = (repo, model, mode) => `${repo.path}|${repo.head}|${model}|${mode}`;

function get(repo, model, mode) { return load()[key(repo, model, mode)]; }

function set(repo, model, mode, text) {
  load()[key(repo, model, mode)] = text;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

module.exports = { get, set };
