// Per-field last-write-wins registers keep removals and independent device edits.
export const SET_ID = 'p040-043';
export const DEFAULTS = { lesson: 0, mode: 'highlight', translations: false };
export const emptyProgress = () => ({ version: 1, sets: {} });
const safeKey = key => /^[a-z0-9][a-z0-9-]{0,79}$/.test(key) && !['constructor', 'prototype', '__proto__'].includes(key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const prefValid = (key, value) => key === 'lesson' ? Number.isInteger(value) && value >= 0 && value < 6
  : key === 'mode' ? ['highlight', 'hint', 'mask'].includes(value)
  : key === 'translations' && typeof value === 'boolean';

export function validateProgress(doc) {
  const invalid = () => { throw new Error('进度文件格式无法识别，未覆盖 GitHub 上的文件。'); };
  if (!record(doc) || doc.version !== 1 || !record(doc.sets) || Object.keys(doc.sets).length > 100) invalid();
  for (const [id, set] of Object.entries(doc.sets)) {
    if (!safeKey(id) || !record(set) || !record(set.words) || !record(set.prefs) || Object.keys(set.words).length > 10000) invalid();
    for (const group of ['words', 'prefs']) for (const [key, entry] of Object.entries(set[group])) {
      if (!safeKey(key) || !record(entry) || !Number.isSafeInteger(entry.at) || entry.at < 0 ||
          typeof entry.device !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(entry.device) ||
          !(group === 'words' ? typeof entry.value === 'boolean' : prefValid(key, entry.value))) invalid();
    }
  }
  return doc;
}

function newer(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.at !== b.at) return a.at > b.at ? a : b;
  const left = `${a.device}:${JSON.stringify(a.value)}`;
  const right = `${b.device}:${JSON.stringify(b.value)}`;
  return left >= right ? a : b;
}

export function mergeProgress(left, right) {
  validateProgress(left); validateProgress(right);
  const result = emptyProgress();
  for (const id of [...new Set([...Object.keys(left.sets), ...Object.keys(right.sets)])].sort()) {
    const set = result.sets[id] = { words: {}, prefs: {} };
    for (const group of ['words', 'prefs']) {
      const a = left.sets[id]?.[group] || {}, b = right.sets[id]?.[group] || {};
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
        const entry = newer(a[key], b[key]);
        set[group][key] = { value: entry.value, at: entry.at, device: entry.device };
      }
    }
  }
  return result;
}

export const serializeProgress = doc => JSON.stringify(mergeProgress(emptyProgress(), doc));
export function nextTimestamp(doc, now = Date.now()) {
  let latest = now - 1;
  for (const set of Object.values(doc.sets)) for (const group of ['words', 'prefs']) {
    for (const entry of Object.values(set[group])) latest = Math.max(latest, entry.at);
  }
  return latest + 1;
}

export function readStudyState(doc, vocabulary) {
  const set = doc.sets[SET_ID];
  const state = { ...DEFAULTS, mastered: [] };
  if (set) {
    for (const key of Object.keys(DEFAULTS)) if (set.prefs[key]) state[key] = set.prefs[key].value;
    state.mastered = vocabulary.filter(word => set.words[word]?.value === true);
  }
  return state;
}

export function migrateLegacy(state, vocabulary) {
  const doc = emptyProgress();
  if (!state || typeof state !== 'object') return doc;
  const set = doc.sets[SET_ID] = { words: {}, prefs: {} };
  // Legacy data has no edit time: it must not resurrect newer cloud removals.
  for (const word of vocabulary) if (state.mastered?.includes(word)) {
    set.words[word] = { value: true, at: 1, device: 'legacy' };
  }
  for (const key of Object.keys(DEFAULTS)) if (prefValid(key, state[key])) {
    set.prefs[key] = { value: state[key], at: 1, device: 'legacy' };
  }
  return doc;
}

export function recordChanges(doc, before, after, device, now = Date.now()) {
  const next = mergeProgress(doc, emptyProgress());
  const set = next.sets[SET_ID] ||= { words: {}, prefs: {} };
  const at = nextTimestamp(doc, now);
  const entry = value => ({ value, at, device });
  const oldWords = new Set(before.mastered), newWords = new Set(after.mastered);
  for (const word of new Set([...oldWords, ...newWords])) if (oldWords.has(word) !== newWords.has(word)) {
    set.words[word] = entry(newWords.has(word));
  }
  for (const key of Object.keys(DEFAULTS)) if (before[key] !== after[key]) set.prefs[key] = entry(after[key]);
  return validateProgress(next);
}
