// Запись в репозиторий сайта через GitHub API: несколько файлов одним коммитом.

export interface FileChange {
  path: string;
  /** Текст файла (utf-8) или содержимое картинки в base64. */
  content: string;
  encoding: 'utf-8' | 'base64';
}

export class GitHub {
  constructor(
    private token: string,
    private repo: string,
    private branch = 'main',
  ) {}

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`https://api.github.com/repos/${this.repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'evro-element-bot',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) throw new Error(`GitHub ${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  /** Текущее содержимое текстового файла в ветке. */
  async readText(path: string): Promise<string> {
    const data = await this.api<{ content: string; encoding: string }>(`/contents/${encodeURI(path)}?ref=${this.branch}`);
    const bytes = Uint8Array.from(atob(data.content.replace(/\n/g, '')), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  /** Тексты всех файлов в папках и отдельных файлах одним запросом (GraphQL). */
  async readMany(dirs: string[], paths: string[]): Promise<{ dirs: Record<string, Record<string, string>>; files: Record<string, string> }> {
    const [owner, name] = this.repo.split('/');
    const expr = (p: string) => JSON.stringify(`${this.branch}:${p}`);
    const query = `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) {
      ${dirs.map((d, i) => `d${i}: object(expression: ${expr(d)}) { ... on Tree { entries { name object { ... on Blob { text } } } } }`).join('\n')}
      ${paths.map((p, i) => `f${i}: object(expression: ${expr(p)}) { ... on Blob { text } }`).join('\n')}
    } }`;
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', 'User-Agent': 'evro-element-bot' },
      body: JSON.stringify({ query, variables: { owner, name } }),
    });
    type Entry = { name: string; object?: { text?: string | null } };
    const data = (await res.json()) as { data?: { repository: Record<string, { entries?: Entry[]; text?: string | null } | null> }; errors?: unknown };
    if (!res.ok || !data.data) throw new Error(`GitHub GraphQL: ${res.status} ${JSON.stringify(data.errors ?? data)}`);
    const repo = data.data.repository;
    const out = { dirs: {} as Record<string, Record<string, string>>, files: {} as Record<string, string> };
    dirs.forEach((d, i) => {
      out.dirs[d] = {};
      for (const e of repo[`d${i}`]?.entries ?? []) if (e.object?.text != null) out.dirs[d][e.name] = e.object.text;
    });
    paths.forEach((p, i) => (out.files[p] = repo[`f${i}`]?.text ?? ''));
    return out;
  }

  /** Один коммит со всеми файлами. Возвращает sha коммита. */
  async commit(message: string, files: FileChange[]): Promise<string> {
    const ref = await this.api<{ object: { sha: string } }>(`/git/ref/heads/${this.branch}`);
    const parent = await this.api<{ tree: { sha: string } }>(`/git/commits/${ref.object.sha}`);
    // текст кладём прямо в дерево, отдельный blob нужен только картинкам:
    // так прайс на сотню файлов укладывается в лимит запросов Cloudflare
    const tree = await Promise.all(
      files.map(async (f) => {
        if (f.encoding === 'utf-8') return { path: f.path, mode: '100644', type: 'blob', content: f.content };
        const blob = await this.api<{ sha: string }>('/git/blobs', { method: 'POST', body: JSON.stringify({ content: f.content, encoding: f.encoding }) });
        return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha };
      }),
    );
    const newTree = await this.api<{ sha: string }>('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: parent.tree.sha, tree }) });
    const commit = await this.api<{ sha: string }>('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }),
    });
    await this.api(`/git/refs/heads/${this.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
    return commit.sha;
  }
}
