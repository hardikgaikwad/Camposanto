const year = (repo) => repo.lastCommit.slice(0, 4);

function ctx(repo) {
  return [
    `Project: ${repo.name}`,
    `First commit: ${repo.firstCommit.slice(0, 10)}  Last commit: ${repo.lastCommit.slice(0, 10)}  (${repo.daysDead} days ago)`,
    `Commits: ${repo.commits}  Files: ${repo.fileCount}  Main file types: ${repo.extensions.join(', ') || 'unknown'}`,
    `Last commit messages:\n- ${repo.recentSubjects.join('\n- ') || '(none)'}`,
    `README excerpt:\n${repo.readme || '(no README)'}`,
  ].join('\n');
}

// Small models loop on short prose; cap length, stop at the first blank line, discourage repeats.
const OPTIONS = {
  epitaph: { temperature: 0.7, num_predict: 100, repeat_penalty: 1.15, stop: ['\n\n'] },
  resurrect: { temperature: 0.5, num_predict: 450, repeat_penalty: 1.1 },
};

function messages(repo, mode) {
  if (mode === 'epitaph') {
    return [
      { role: 'system', content: 'You write gravestone inscriptions for abandoned software projects. Tone: dry, tender, slightly spooky. Use only facts from the data given; never invent features.' },
      { role: 'user', content: `${ctx(repo)}\n\nReply with exactly three lines, nothing else. The format (a made-up example, do not reuse its words):\n\nHere lies <name>, who <what it did> and then <how it ended>.\nCause of death: <one sentence drawn from the project's real last commit messages>.\nRests in: ${year(repo)}, <a short image>.\n\nWrite them for the project above.` },
    ];
  }
  return [
    { role: 'system', content: 'You are a careful necromancer who revives dead software projects. Use only facts from the data given; say "unknown" rather than guess.' },
    { role: 'user', content: `${ctx(repo)}\n\nIn markdown, answer with three short sections:\n## What it was\n## How to revive it\n## Three next steps` },
  ];
}

async function listModels(url) {
  const res = await fetch(`${url}/api/tags`);
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  return (await res.json()).models.map((m) => m.name);
}

// Yields text chunks from Ollama's NDJSON chat stream.
async function* stream(url, model, repo, mode) {
  const chat = (extra) => fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: messages(repo, mode), stream: true, options: OPTIONS[mode], ...extra }),
  });
  // think:false silences reasoning models (qwen3); models without thinking support reject it.
  let res = await chat({ think: false });
  if (res.status === 400) res = await chat({});
  if (!res.ok) throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.error) throw new Error(msg.error);
      if (msg.message?.content) yield msg.message.content;
    }
  }
}

module.exports = { listModels, stream };
