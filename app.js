import { lessons } from './data.js?v=p040-043-20261020';
import { segments, plainText, buildQuiz } from './core.js';

const $ = id => document.getElementById(id);
const allWords = lessons.flatMap(lesson => lesson.words);
const dictionary = new Map(allWords.map(item => [item.word, item]));
const storageKey = 'fieldnotes-wildwords-p040-043-v1';
const stored = localStorage.getItem(storageKey);
const state = stored === null
  ? { lesson: 0, mode: 'highlight', translations: false, mastered: [] }
  : JSON.parse(stored);
const mastered = new Set(state.mastered);
let activeWord = null;
let quiz = null;
let reading = false;
let activeUtterance = null;
const audioAvailable = 'speechSynthesis' in window;
const audioIcon = '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 7v6h3l4 3V4L6 7H3Z"/><path d="M13 6c3 2 3 6 0 8M15 3c5 4 5 10 0 14"/></svg>';

function save() {
  state.mastered = [...mastered];
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function stopReading() {
  if (activeUtterance !== null) {
    activeUtterance.onend = null;
    activeUtterance.onerror = null;
    activeUtterance = null;
  }
  if (audioAvailable) window.speechSynthesis.cancel();
  reading = false;
  $('readAll').innerHTML = '<span aria-hidden="true">▷</span> 朗读全文';
  $('readAll').setAttribute('aria-pressed', 'false');
}

function speak(text, fullArticle = false) {
  stopReading();
  const utterance = new SpeechSynthesisUtterance(text);
  activeUtterance = utterance;
  utterance.lang = 'en-GB';
  utterance.rate = 0.85;
  if (fullArticle) {
    reading = true;
    $('readAll').innerHTML = '<span aria-hidden="true">■</span> 停止朗读';
    $('readAll').setAttribute('aria-pressed', 'true');
    utterance.onend = () => { reading = false; $('readAll').innerHTML = '<span aria-hidden="true">▷</span> 朗读全文'; $('readAll').setAttribute('aria-pressed', 'false'); };
    utterance.onerror = () => { reading = false; $('readAll').textContent = '朗读未完成 · 点击重试'; $('readAll').setAttribute('aria-pressed', 'false'); };
  }
  window.speechSynthesis.speak(utterance);
}

function updateProgress() {
  $('totalProgress').innerHTML = `${mastered.size} <span>/ ${allWords.length}</span>`;
  $('progressFill').style.width = `${mastered.size / allWords.length * 100}%`;
  document.querySelector('.progress-track').setAttribute('aria-valuenow', String(mastered.size));
  const currentWords = lessons[state.lesson].words;
  const count = currentWords.filter(item => mastered.has(item.word)).length;
  $('lessonProgress').textContent = `${count} / ${currentWords.length} 已掌握`;
}

function toggleMastery(word) {
  if (mastered.has(word)) mastered.delete(word);
  else mastered.add(word);
  save();
  updateProgress();
  document.querySelectorAll('.word[data-word]').forEach(button => button.classList.toggle('mastered', mastered.has(button.dataset.word)));
  document.querySelectorAll('.mastery[data-word]').forEach(button => {
    const known = mastered.has(button.dataset.word);
    button.setAttribute('aria-pressed', String(known));
    button.textContent = known ? '✓ 已掌握' : '+ 掌握';
    button.setAttribute('aria-label', `${known ? '取消掌握' : '掌握'} ${button.dataset.word}`);
  });
  if (activeWord !== null) updateDialogMastery();
}

function updateDialogMastery() {
  const known = mastered.has(activeWord.word);
  $('dialogMastery').textContent = known ? '✓ 已掌握 · 点击取消' : '+ 标记为已掌握';
  $('dialogMastery').setAttribute('aria-pressed', String(known));
}

function openWord(word) {
  activeWord = dictionary.get(word);
  const lesson = lessons[activeWord.lesson];
  const paragraph = lesson.paragraphs.find(item => segments(item.en).some(part => part.word === word));
  $('dialogWord').textContent = activeWord.word;
  $('dialogIPA').textContent = activeWord.ipa;
  $('dialogMeaning').textContent = activeWord.meaning;
  const parts = segments(paragraph.en);
  $('dialogExample').replaceChildren();
  for (const part of parts) {
    if (part.word === word) $('dialogExample').append(el('mark', '', part.text));
    else $('dialogExample').append(document.createTextNode(part.text));
  }
  $('dialogTranslation').textContent = paragraph.zh;
  updateDialogMastery();
  $('wordDialog').showModal();
}

function renderParagraphs() {
  const fragment = document.createDocumentFragment();
  for (const paragraph of lessons[state.lesson].paragraphs) {
    const block = el('div', 'paragraph-block');
    const english = el('p', 'en');
    english.lang = 'en';
    for (const part of segments(paragraph.en)) {
      if (part.word === undefined) { english.append(document.createTextNode(part.text)); continue; }
      const item = dictionary.get(part.word);
      const button = el('button', 'word');
      button.type = 'button';
      button.dataset.word = item.word;
      button.classList.toggle('mastered', mastered.has(item.word));
      if (state.mode === 'highlight') {
        button.textContent = part.text;
        button.setAttribute('aria-label', `${part.text}，查看释义`);
      } else if (state.mode === 'hint') {
        button.lang = 'zh-CN';
        button.textContent = item.meaning;
        button.classList.add('hint');
        button.setAttribute('aria-label', `${item.meaning}，查看英文`);
      } else {
        button.textContent = '·'.repeat(Math.max(4, Math.min(12, part.text.length)));
        button.classList.add('masked');
        button.setAttribute('aria-label', '遮挡单词，点击揭晓');
      }
      button.addEventListener('click', () => openWord(item.word));
      english.append(button);
    }
    const translation = el('p', 'translation', paragraph.zh);
    translation.hidden = !state.translations;
    block.append(english, translation);
    fragment.append(block);
  }
  $('paragraphs').replaceChildren(fragment);
}

function renderWords() {
  const query = $('wordSearch').value.trim().toLowerCase();
  const words = lessons[state.lesson].words.filter(item => `${item.word} ${item.meaning}`.toLowerCase().includes(query));
  const fragment = document.createDocumentFragment();
  for (const item of words) {
    const row = el('div', 'vocab-row');
    const heading = el('div', 'word-heading');
    const wordButton = el('button', 'word-name', item.word);
    wordButton.lang = 'en';
    wordButton.type = 'button';
    wordButton.addEventListener('click', () => openWord(item.word));
    const audio = el('button', 'audio');
    audio.type = 'button';
    audio.innerHTML = audioIcon;
    audio.setAttribute('aria-label', `朗读 ${item.word}`);
    audio.disabled = !audioAvailable;
    if (!audioAvailable) audio.title = '当前浏览器不支持语音朗读';
    audio.addEventListener('click', () => speak(item.word));
    heading.append(wordButton, audio);
    const known = mastered.has(item.word);
    const mastery = el('button', 'mastery', known ? '✓ 已掌握' : '+ 掌握');
    mastery.type = 'button';
    mastery.dataset.word = item.word;
    mastery.setAttribute('aria-pressed', String(known));
    mastery.setAttribute('aria-label', `${known ? '取消掌握' : '掌握'} ${item.word}`);
    mastery.addEventListener('click', () => toggleMastery(item.word));
    row.append(heading, el('span', 'ipa', item.ipa), el('p', 'meaning', item.meaning), mastery);
    fragment.append(row);
  }
  if (words.length === 0) fragment.append(el('p', 'empty-state', '本篇没有匹配的词汇。'));
  $('wordList').replaceChildren(fragment);
}

function renderModes() {
  document.querySelectorAll('.mode').forEach(button => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const notes = {
    highlight: '点击高亮单词查看释义。虚线下划线表示已掌握。',
    hint: '根据中文提示回忆英文，点击提示查看答案与原句。',
    mask: '读上下文，回忆被遮挡的单词。点击圆点揭晓答案。'
  };
  $('modeNote').textContent = notes[state.mode];
  $('translationToggle').checked = state.translations;
}

function renderLesson() {
  const lesson = lessons[state.lesson];
  document.querySelectorAll('.tab').forEach((button, index) => {
    button.classList.toggle('active', index === state.lesson);
    button.setAttribute('aria-pressed', String(index === state.lesson));
  });
  $('pageLabel').textContent = `READING ${String(state.lesson + 1).padStart(2, '0')} / 06`;
  $('lessonCount').textContent = `${lesson.words.length} 个词汇`;
  $('articleTitle').textContent = lesson.title;
  $('articleSubtitle').textContent = lesson.zhTitle;
  $('wordSearch').value = '';
  $('wordList').scrollTop = 0;
  const previous = $('previousLesson');
  previous.hidden = state.lesson === 0;
  if (state.lesson > 0) previous.textContent = `← ${lessons[state.lesson - 1].label}`;
  const next = $('nextLesson');
  next.hidden = state.lesson === lessons.length - 1;
  if (state.lesson < lessons.length - 1) next.textContent = `${lessons[state.lesson + 1].label} →`;
  renderParagraphs();
  renderWords();
  renderModes();
  updateProgress();
}

function selectLesson(index, scroll = false) {
  stopReading();
  state.lesson = index;
  save();
  renderLesson();
  if ($('quizScope').value === 'lesson') { quiz = null; renderQuiz(); }
  if (scroll) {
    $('articleTitle').focus({ preventScroll: true });
    document.querySelector('.toolbar').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}

function startQuiz() {
  const scope = $('quizScope').value;
  let pool;
  if (scope === 'lesson') pool = lessons[state.lesson].words;
  else if (scope === 'all') pool = allWords;
  else pool = allWords.filter(item => !mastered.has(item.word));
  quiz = {
    questions: buildQuiz(pool, allWords),
    direction: $('quizDirection').value,
    index: 0,
    answers: [],
    score: 0
  };
  renderQuiz();
}

function chooseAnswer(word) {
  if (quiz.answers.length > quiz.index) return;
  const correct = word === quiz.questions[quiz.index].answer.word;
  quiz.answers.push({ selected: word, correct });
  if (correct) quiz.score++;
  renderQuiz();
  const next = $('nextQuestion');
  next.focus({ preventScroll: true });
}

function renderQuiz() {
  const card = $('quizCard');
  card.replaceChildren();
  if (quiz === null) {
    card.append(el('p', 'empty-state', '选好范围和题型，开始这一轮练习。'));
    return;
  }
  if (quiz.questions.length === 0) {
    card.append(el('p', 'empty-state', `全部 ${allWords.length} 个词都已标记掌握。选择「全部 ${allWords.length} 词」再复习一次吧。`));
    return;
  }
  if (quiz.index === quiz.questions.length) {
    const percent = Math.round(quiz.score / quiz.questions.length * 100);
    card.append(el('p', 'section-kicker', 'ROUND COMPLETE / 本轮完成'));
    card.append(el('p', 'result-score', `${quiz.score} / ${quiz.questions.length}`));
    card.append(el('p', 'feedback', `正确率 ${percent}% · ${percent === 100 ? '这一轮全部答对，继续保持！' : '回到语境里，再认识一次这些词。'}`));
    const misses = quiz.questions.filter((_, index) => !quiz.answers[index].correct);
    if (misses.length) {
      const list = el('div', 'results-list');
      for (const question of misses) {
        const row = el('div', 'result-row');
        const button = el('button', 'word-name', question.answer.word);
        button.type = 'button';
        button.addEventListener('click', () => openWord(question.answer.word));
        row.append(button, el('span', '', question.answer.meaning));
        list.append(row);
      }
      card.append(el('p', 'context-label', '本轮需要巩固'), list);
    }
    const again = el('button', 'again-button', '再练一轮 →');
    again.type = 'button';
    again.addEventListener('click', startQuiz);
    card.append(again);
    return;
  }
  const question = quiz.questions[quiz.index];
  const progress = el('div', 'quiz-progress');
  progress.append(el('span', '', `第 ${quiz.index + 1} / ${quiz.questions.length} 题`), el('span', '', `答对 ${quiz.score} 题`));
  card.append(progress, el('p', 'question', quiz.direction === 'zh-en' ? question.answer.meaning : question.answer.word));
  const choices = el('div', 'answers');
  const answered = quiz.answers.length > quiz.index;
  for (const option of question.options) {
    const button = el('button', 'answer', quiz.direction === 'zh-en' ? option.word : option.meaning);
    button.lang = quiz.direction === 'zh-en' ? 'en' : 'zh-CN';
    button.type = 'button';
    if (answered) {
      button.disabled = true;
      if (option.word === question.answer.word) { button.classList.add('correct'); button.textContent += ' ✓'; }
      else if (option.word === quiz.answers[quiz.index].selected) { button.classList.add('incorrect'); button.textContent += ' ×'; }
    }
    button.addEventListener('click', () => chooseAnswer(option.word));
    choices.append(button);
  }
  card.append(choices);
  if (answered) {
    const wasCorrect = quiz.answers[quiz.index].correct;
    const feedback = el('p', 'feedback', `${wasCorrect ? '回答正确。' : '再记住它：'} ${question.answer.word} — ${question.answer.meaning}`);
    feedback.setAttribute('role', 'status');
    const next = el('button', 'next-question', quiz.index === quiz.questions.length - 1 ? '查看结果 →' : '下一题 →');
    next.id = 'nextQuestion';
    next.type = 'button';
    next.addEventListener('click', () => { quiz.index++; renderQuiz(); $('quizCard').focus({ preventScroll: true }); });
    card.append(feedback, next);
  }
}

lessons.forEach((lesson, index) => {
  const button = el('button', 'tab');
  button.type = 'button';
  button.append(el('span', 'num', String(index + 1)), document.createTextNode(lesson.label));
  button.addEventListener('click', () => selectLesson(index));
  $('lessonTabs').append(button);
});
document.querySelectorAll('.mode').forEach(button => button.addEventListener('click', () => {
  state.mode = button.dataset.mode;
  save(); renderModes(); renderParagraphs();
}));
$('translationToggle').addEventListener('change', event => { state.translations = event.target.checked; save(); renderParagraphs(); });
$('wordSearch').addEventListener('input', renderWords);
$('previousLesson').addEventListener('click', () => selectLesson(state.lesson - 1, true));
$('nextLesson').addEventListener('click', () => selectLesson(state.lesson + 1, true));
$('closeDialog').addEventListener('click', () => $('wordDialog').close());
$('wordDialog').addEventListener('click', event => { if (event.target === $('wordDialog')) { const box = $('wordDialog').getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) $('wordDialog').close(); } });
$('dialogMastery').addEventListener('click', () => toggleMastery(activeWord.word));
$('speakWord').addEventListener('click', () => speak(activeWord.word));
$('readAll').setAttribute('aria-pressed', 'false');
$('readAll').addEventListener('click', () => { if (reading) stopReading(); else speak(lessons[state.lesson].paragraphs.map(item => plainText(item.en)).join('\n\n'), true); });
$('startQuiz').addEventListener('click', startQuiz);
for (const id of ['quizScope', 'quizDirection']) $(id).addEventListener('change', () => { quiz = null; renderQuiz(); });
$('quizCard').tabIndex = -1;
if (!audioAvailable) {
  $('readAll').disabled = true; $('readAll').title = '当前浏览器不支持语音朗读';
  $('speakWord').disabled = true; $('speakWord').title = '当前浏览器不支持语音朗读';
}
window.addEventListener('pagehide', stopReading);
renderLesson();
renderQuiz();
