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

  /** Один коммит со всеми файлами. Возвращает sha коммита. */
  async commit(message: string, files: FileChange[]): Promise<string> {
    const ref = await this.api<{ object: { sha: string } }>(`/git/ref/heads/${this.branch}`);
    const parent = await this.api<{ tree: { sha: string } }>(`/git/commits/${ref.object.sha}`);
    const tree = await Promise.all(
      files.map(async (f) => {
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
