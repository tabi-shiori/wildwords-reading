import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, mergeProgress, migrateLegacy, recordChanges, readStudyState, serializeProgress, SET_ID, validateProgress } from './progress.js';
import { GitHubSync, REPOSITORY, encodeProgress, decodeProgress } from './github-sync.js';

const words = ['barn', 'hedge', 'vitamin'];
const baseState = { lesson: 0, mode: 'highlight', translations: false, mastered: [] };
const change = (doc, state, id, now) => recordChanges(doc, readStudyState(doc, words), state, id, now);
const mark = (word, id, time) => change(emptyProgress(), { ...baseState, mastered: [word] }, id, time);

test('independent device edits merge, in either order, without losing either word', () => {
  const a = mark('barn', 'a', 10), b = mark('hedge', 'b', 11);
  assert.deepEqual(readStudyState(mergeProgress(a, b), words).mastered, ['barn', 'hedge']);
  assert.equal(serializeProgress(mergeProgress(a, b)), serializeProgress(mergeProgress(b, a)));
  assert.equal(serializeProgress(mergeProgress(a, a)), serializeProgress(a));
});
test('unmark survives sync and legacy migration; new edits advance observed clock', () => {
  const old = mark('barn', 'a', 100);
  const unmarked = change(old, baseState, 'b', 1);
  assert.equal(unmarked.sets[SET_ID].words.barn.at, 101);
  const legacy = migrateLegacy({ ...baseState, mastered: ['barn'] }, words);
  assert.deepEqual(readStudyState(mergeProgress(unmarked, legacy), words).mastered, []);
  assert.deepEqual(readStudyState(mergeProgress(old, unmarked), words).mastered, []);
});
test('prefs merge independently, unknown sets remain, equal timestamps resolve deterministically', () => {
  const a = change(emptyProgress(), { ...baseState, lesson: 3 }, 'a', 10);
  const b = change(emptyProgress(), { ...baseState, translations: true }, 'b', 10);
  const merged = mergeProgress(a, b);
  assert.deepEqual(readStudyState(merged, words), { ...baseState, lesson: 3, translations: true });
  a.sets.future = { words: { test: { value: true, at: 10, device: 'a' } }, prefs: {} };
  assert.ok(mergeProgress(a, b).sets.future);
  const c = mark('barn', 'a', 10), d = mark('barn', 'z', 10);
  d.sets[SET_ID].words.barn.value = false;
  assert.equal(serializeProgress(mergeProgress(c, d)), serializeProgress(mergeProgress(d, c)));
});
test('invalid file schema and unsafe object keys are rejected', () => {
  for (const doc of [{}, { version: 2, sets: {} }, { version: 1, sets: { a: { words: [], prefs: {} } } }, JSON.parse('{"version":1,"sets":{"__proto__":{"words":{},"prefs":{}}}}')]) assert.throws(() => validateProgress(doc));
  const invalid = mark('barn', 'a', 10); invalid.sets[SET_ID].words.barn.value = 'yes';
  assert.throws(() => validateProgress(invalid));
  assert.deepEqual(decodeProgress(encodeProgress(emptyProgress())), emptyProgress());
});

function fixture({ local = emptyProgress(), remote = emptyProgress(), repoPrivate = true, conflict, putError, getError, corrupt = false, writeHook } = {}) {
  let doc = local, cloudDoc = remote, sha = 1, writes = 0;
  const statuses = [], calls = [];
  const response = (status, json) => ({ status, ok: status >= 200 && status < 300, json: async () => json });
  const sync = new GitHubSync({ getDocument: () => doc, mergeDocument: other => { doc = mergeProgress(doc, other); }, status: s => statuses.push(s), fetcher: async (url, options) => {
    calls.push({ url, method: options.method || 'GET' });
    assert.ok(url.startsWith(`https://api.github.com/repos/${REPOSITORY}`));
    assert.equal(options.redirect, 'error');
    if (!url.includes('/contents/')) return response(200, { private: repoPrivate, full_name: REPOSITORY });
    if (options.method === 'PUT') {
      writes++;
      if (putError) return response(putError);
      if (conflict && writes === 1) { cloudDoc = conflict; sha++; return response(409); }
      const body = JSON.parse(options.body);
      assert.equal(body.sha, String(sha));
      cloudDoc = decodeProgress(body.content); sha++;
      if (writeHook && writes === 1) doc = writeHook(doc);
      return response(200, {});
    }
    if (getError) return response(getError);
    return response(200, { encoding: 'base64', sha: String(sha), size: 300, content: corrupt ? 'bad JSON' : encodeProgress(cloudDoc) });
  } });
  return { sync, statuses, calls, get doc() { return doc; }, get remote() { return cloudDoc; }, get writes() { return writes; } };
}

test('first connect pulls and merges before write; unchanged sync creates no commit', async () => {
  const f = fixture({ local: mark('barn', 'a', 10), remote: mark('hedge', 'b', 11) });
  assert.equal(await f.sync.connect('test-placeholder'), true);
  assert.deepEqual(readStudyState(f.remote, words).mastered, ['barn', 'hedge']);
  assert.equal(f.writes, 1);
  await f.sync.sync(); assert.equal(f.writes, 1);
  assert.equal(f.statuses.at(-1).kind, 'synced'); f.sync.disconnect();
});
test('SHA conflict re-reads and merges rather than overwriting another device', async () => {
  const f = fixture({ local: mark('barn', 'a', 10), conflict: mark('hedge', 'b', 20) });
  assert.equal(await f.sync.connect('test-placeholder'), true);
  assert.deepEqual(readStudyState(f.remote, words).mastered, ['barn', 'hedge']);
  assert.equal(f.writes, 2); f.sync.disconnect();
});
test('edits during an in-flight write are uploaded before showing synced', async () => {
  const f = fixture({ local: mark('barn', 'a', 10), writeHook: doc => change(doc, { ...baseState, mastered: ['barn', 'vitamin'] }, 'a', 20) });
  assert.equal(await f.sync.connect('test-placeholder'), true);
  assert.equal(f.writes, 2);
  assert.deepEqual(readStudyState(f.remote, words).mastered, ['barn', 'vitamin']); f.sync.disconnect();
});
test('public repository and corrupt remote never receive progress writes', async () => {
  for (const options of [{ repoPrivate: false }, { corrupt: true }]) {
    const f = fixture({ local: mark('barn', 'a', 10), ...options });
    assert.equal(await f.sync.connect('test-placeholder'), false);
    assert.equal(f.writes, 0); assert.equal(f.statuses.at(-1).kind, 'error'); f.sync.disconnect();
  }
});
test('permission failures never claim sync success and preserve local progress', async () => {
  for (const code of [401, 403, 429, 500]) {
    const local = mark('barn', 'a', 10), f = fixture({ local, putError: code });
    assert.equal(await f.sync.connect('test-placeholder'), false);
    assert.equal(f.statuses.at(-1).kind, 'error');
    assert.deepEqual(f.doc, local);
    if (code === 401) assert.equal(f.sync.connected, false);
    f.sync.disconnect();
  }
});
test('disconnect cancels pending read without merging or writing', async () => {
  let finish; const statuses = []; let merged = false;
  const sync = new GitHubSync({ getDocument: emptyProgress, mergeDocument: () => { merged = true; }, status: s => statuses.push(s), fetcher: () => new Promise(resolve => { finish = resolve; }) });
  const result = sync.connect('test-placeholder');
  sync.disconnect();
  finish({ ok: true, json: async () => ({ private: true, full_name: REPOSITORY }) });
  assert.equal(await result, false); assert.equal(merged, false);
  assert.equal(statuses.at(-1).kind, 'local');
});
