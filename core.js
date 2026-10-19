export function segments(text) {
  const parts = [];
  let cursor = 0;
  for (const match of text.matchAll(/\[\[([a-z]+)(?:\|([^\]]+))?\]\]/g)) {
    if (match.index > cursor) parts.push({ text: text.slice(cursor, match.index) });
    parts.push({ word: match[1], text: match[2] === undefined ? match[1] : match[2] });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}

export function plainText(text) {
  return segments(text).map(part => part.text).join('');
}

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildQuiz(pool, allWords, random = Math.random) {
  return shuffle(pool, random).slice(0, 10).map(answer => {
    const sameLesson = allWords.filter(item => item.lesson === answer.lesson && item.word !== answer.word);
    const distractors = shuffle(sameLesson, random).slice(0, 3);
    return { answer, options: shuffle([answer, ...distractors], random) };
  });
}
