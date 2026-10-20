import { emptyProgress, validateProgress, serializeProgress } from './progress.js?v=github-sync-1';

export const REPOSITORY = 'tabi-shiori/wildwords-progress';
const API = `https://api.github.com/repos/${REPOSITORY}`;
const FILE = `${API}/contents/progress.json`;
export const encodeProgress = doc => btoa(Array.from(new TextEncoder().encode(serializeProgress(doc)), byte => String.fromCharCode(byte)).join(''));
export const decodeProgress = content => validateProgress(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(content.replace(/\s/g, '')), c => c.charCodeAt(0)))));

class ApiError extends Error {
  constructor(status) {
    super(status === 401 ? '授权已失效，请重新连接 GitHub。'
      : status === 403 ? 'GitHub 拒绝写入：请检查仓库 Contents 读写权限，或稍后重试。'
      : status === 404 ? '找不到进度仓库，请检查授权是否选中了 wildwords-progress。'
      : status === 409 ? '另一台设备刚更新了进度，请点击立即同步重试。'
      : `GitHub 暂未完成同步（${status}），请稍后重试。`);
    this.status = status;
  }
}

export class GitHubSync {
  constructor({ getDocument, mergeDocument, status, fetcher = globalThis.fetch.bind(globalThis) }) {
    Object.assign(this, { getDocument, mergeDocument, status, fetcher });
    this.token = ''; this.task = null; this.generation = 0; this.timer = null;
    this.lastSynced = null;
  }
  get connected() { return Boolean(this.token); }
  notify(kind, message) { this.status({ kind, message, connected: this.connected, lastSynced: this.lastSynced }); }
  async request(url, options, generation) {
    if (generation !== this.generation) throw new DOMException('Disconnected', 'AbortError');
    const timeout = new AbortController();
    const cancel = () => timeout.abort();
    const connectionSignal = this.controller.signal;
    connectionSignal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, 20000);
    let response;
    try { response = await this.fetcher(url, {
      ...options, cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${this.token}`, ...(options?.method === 'PUT' ? { 'Content-Type': 'application/json' } : {}) },
      signal: timeout.signal
    }); } catch (error) {
      if (generation === this.generation && timeout.signal.aborted) throw new Error('同步请求超时，请检查网络后重试。');
      throw error;
    } finally { clearTimeout(timer); connectionSignal.removeEventListener('abort', cancel); }
    if (generation !== this.generation) throw new DOMException('Disconnected', 'AbortError');
    return response;
  }
  async connect(token) {
    this.disconnect(false);
    this.token = token.trim();
    this.controller = new AbortController();
    return this.sync();
  }
  disconnect(announce = true) {
    this.generation++; this.controller?.abort(); clearTimeout(this.timer);
    this.token = ''; this.task = null; this.lastSynced = null;
    if (announce) this.notify('local', '未连接 GitHub · 当前进度保存在本机');
  }
  changed() {
    if (!this.connected) { this.notify('local', '未连接 GitHub · 当前进度保存在本机'); return; }
    this.notify('pending', '本机已保存 · 等待同步到 GitHub');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), 1800);
  }
  sync() {
    clearTimeout(this.timer);
    if (!this.connected) return Promise.resolve(false);
    if (this.task) return this.task;
    const generation = this.generation;
    this.notify('syncing', '正在同步 GitHub…');
    this.task = this.run(generation).catch(error => {
      if (generation !== this.generation) return false;
      if (error.status === 401) { this.token = ''; this.controller.abort(); }
      this.notify('error', `${error instanceof TypeError ? '网络未连接或 GitHub 暂不可用，请稍后重试。' : error.message} 进度仍保存在本机。`);
      return false;
    }).finally(() => { if (generation === this.generation) this.task = null; });
    return this.task;
  }
  async run(generation) {
    // Require a private repository before every sync batch.
    const repoResponse = await this.request(API, {}, generation);
    if (!repoResponse.ok) throw new ApiError(repoResponse.status);
    const repo = await repoResponse.json();
    if (repo.private !== true || repo.full_name !== REPOSITORY) throw new Error('进度仓库必须保持私有；本次未上传进度。');
    let conflicts = 0;
    for (let round = 0; round < 8; round++) {
      const response = await this.request(`${FILE}?ref=main`, {}, generation);
      let remote = emptyProgress(), sha;
      if (response.ok) {
        const file = await response.json();
        if (file.encoding !== 'base64' || typeof file.content !== 'string' || file.size > 1000000 || typeof file.sha !== 'string') throw new Error('进度文件无法安全读取，本次未覆盖文件。');
        try { remote = decodeProgress(file.content); } catch { throw new Error('进度文件格式无法识别，本次未覆盖 GitHub 文件。'); }
        sha = file.sha;
      } else if (response.status !== 404) throw new ApiError(response.status);
      if (generation !== this.generation) return false;
      this.mergeDocument(remote);
      const snapshot = serializeProgress(this.getDocument());
      if (!sha || snapshot !== serializeProgress(remote)) {
        const written = await this.request(FILE, { method: 'PUT', body: JSON.stringify({
          message: 'Sync FIELDNOTES study progress', content: encodeProgress(JSON.parse(snapshot)), branch: 'main', ...(sha ? { sha } : {})
        }) }, generation);
        if (written.status === 409 && conflicts++ < 2) continue;
        if (!written.ok) throw new ApiError(written.status);
      }
      if (generation !== this.generation) return false;
      if (snapshot !== serializeProgress(this.getDocument())) continue;
      this.lastSynced = new Date();
      this.notify('synced', `已同步 GitHub · ${this.lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      return true;
    }
    this.changed();
    return false;
  }
}
