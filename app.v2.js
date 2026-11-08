'use strict';
const {words, lessons} = window.COURSE;
const byId = new Map(words.map(w => [w.id, w]));
const lessonById = new Map(lessons.map(l => [l.id, l]));
const KEY = 'fieldnotes-2026-v2';
const stored = localStorage.getItem(KEY);
const state = stored ? JSON.parse(stored) : {version:2, mastered:[], saved:[], read:[], history:[], translation:false, voice:'', speed:0.9};
let view = 'read', current = lessons[0].id, hiddenWords = false, activeWord = '', review = null;
let search = '', wordFilter = 'all', lessonFilter = 'all';
let quizAnswers = {}, quizRecorded = new Set(), utterance = null;
const main = document.querySelector('#main');
const dialog = document.querySelector('#word-dialog');
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(text) { document.querySelector('#notice').textContent = text; }
function save() { localStorage.setItem(KEY, JSON.stringify(state)); renderProgress(); }
function record(type, label, score, total) {
  state.history.unshift({type, label, score, total, at:new Date().toISOString()});
  state.history = state.history.slice(0, 100);
  save();
}
function renderProgress() {
  document.querySelector('#mastered-count').textContent = state.mastered.length + ' / ' + words.length;
  document.querySelector('#mastered-bar').value = state.mastered.length;
}
function renderSidebar() {
  document.querySelector('#lesson-list').innerHTML = lessons.map((l,i) => '<button class="lesson-link '+(l.id===current && view==='read'?'active':'')+'" data-lesson="'+l.id+'" '+(l.id===current && view==='read'?'aria-current="page"':'')+'><span class="lesson-num">'+String(i+1).padStart(2,'0')+'</span><span><strong>'+l.label+'</strong><small>'+l.words.length+' 个词 · 约 2 分钟</small></span><span class="check">'+(state.read.includes(l.id)?'✓':'')+'</span></button>').join('');
  renderProgress();
}
function art(type) {
 const drawings = {
 logic:'<path d="M25 42h35v32H25zM25 94h35v32H25zM105 67h35v32h-35z"/><path d="M60 58h22v25h23M60 110h22V83"/><text x="37" y="64">1</text><text x="37" y="116">0</text><text x="116" y="90">1</text><circle cx="82" cy="83" r="3" fill="#537451"/>',
 numbers:'<text x="28" y="54">1 · 6</text><text x="28" y="85">4 · 24</text><text x="28" y="116">8 · 48</text><path d="M23 130h112"/><text x="105" y="52" fill="#bd672c">+</text>',
 paper:'<path d="M41 22h83v117H41z" fill="#e8efdf"/><path d="M41 81h83M41 22l83 117" stroke-dasharray="4 4"/><path d="M34 22v117M41 148h83"/><text x="66" y="72">A4</text><text x="62" y="116" font-size="13">1 : √2</text>',
 chart:'<path d="M80 83V23A60 60 0 0 1 137 102Z" fill="#dce7d3"/><path d="M80 83l57 19a60 60 0 0 1-75 38Z" fill="#b6ccaa"/><path d="M80 83l-18 57a60 60 0 0 1-40-72Z" fill="#e9d5bd"/><path d="M80 83L22 68a60 60 0 0 1 58-45Z" fill="#edf1e8"/><circle cx="80" cy="83" r="21" fill="#fcfcf7"/>',
 temperature:'<path d="M72 31a10 10 0 0 1 20 0v75a21 21 0 1 1-20 0Z" fill="#edf2e6"/><path d="M82 57v61" stroke="#b77648" stroke-width="5"/><circle cx="82" cy="122" r="12" fill="#b77648" stroke="none"/><path d="M99 45h13M99 65h8M99 85h13"/><text x="40" y="49" font-size="14">°F</text>',
 container:'<path d="M20 106h123l-17 23H39Z" fill="#d3e0cb"/><path d="M30 70h49v36H30zM80 70h49v36H80zM55 35h49v35H55z" fill="#edf0e5"/><path d="M41 76v23M53 76v23M65 76v23M91 76v23M103 76v23M116 76v23M67 41v23M80 41v23M92 41v23"/><path d="M23 140q13-9 26 0t26 0t26 0t26 0" stroke="#8caa83"/>',
 space:'<path d="M63 59l28-16 29 16v35l-29 17-28-17Z" fill="#e8efdf"/><path d="M63 59l28 17 29-17M91 76v35M62 69L23 85v30l40-17M120 58l29-15v31l-29 16"/><path d="M43 78v28M135 51v30" stroke-dasharray="3 3"/><circle cx="43" cy="31" r="3"/><path d="M35 138h15M42 131v15"/><circle cx="131" cy="130" r="3"/>',
 growth:'<path d="M22 23v110h124"/><path d="M28 120l26-8 26-16 26-31 26-43" stroke-width="2.5"/><circle cx="28" cy="120" r="3" fill="#698761"/><circle cx="54" cy="112" r="3" fill="#698761"/><circle cx="80" cy="96" r="3" fill="#698761"/><circle cx="106" cy="65" r="3" fill="#698761"/><text x="93" y="146" font-size="12">× 2</text>',
 battery:'<rect x="41" y="32" width="84" height="105" rx="10" fill="#e8efdf"/><path d="M66 32v-9h34v9M51 65h64M51 105h64" stroke-dasharray="3 4"/><path d="M72 49h20M82 40v18M73 121h18"/><circle cx="67" cy="83" r="4" fill="#b77648" stroke="none"/><circle cx="99" cy="87" r="4" fill="#b77648" stroke="none"/><path d="M64 91l29-15M87 75l6 1-2 6"/>'
 };
 return '<svg viewBox="0 0 165 165" fill="none" stroke="#66825b" stroke-width="1.3" aria-hidden="true"><g font-family="Georgia,serif" font-size="20" fill="#537451" stroke="none"></g>'+drawings[type]+'</svg>';
}
function annotate(text, lesson) {
 const ids = words.filter(w=>w.lesson===lesson.id);
 const pattern = ids.map(w=>w.word.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')).sort((a,b)=>b.length-a.length).join('|');
 const re = new RegExp('\\b('+pattern+')\\b','gi');
 let end = 0, html = '';
 for(const m of text.matchAll(re)) {
   const w = ids.find(w=>w.word.toLowerCase()===m[0].toLowerCase());
   html += escapeHTML(text.slice(end,m.index)) + '<button class="word '+(state.mastered.includes(w.id)?'known':'')+'" data-word="'+w.id+'" aria-label="'+(hiddenWords?'查看遮挡词':'查看 '+escapeHTML(w.word)+' 释义')+'">'+escapeHTML(m[0])+'</button>';
   end = m.index + m[0].length;
 }
 return html + escapeHTML(text.slice(end));
}
function renderRead() {
 const l = lessonById.get(current), i = lessons.indexOf(l);
 const count = l.paragraphs.map(p=>p.en).join(' ').split(/\s+/).length;
 main.innerHTML = '<div class="crumb"><span>阅读 / '+l.label+'</span><span>FIELD NOTE '+String(i+1).padStart(2,'0')+' / 09</span></div><article class="reading"><div class="article-head"><div><span class="badge">● 真实案例 · '+l.year+'</span><h2>'+l.title+'</h2><p class="zh-title">'+l.zhTitle+'</p><div class="article-meta"><span>约 2 分钟阅读</span><span>'+count+' 词</span><span>'+l.words.length+' 个目标词</span><span>B1–B2</span></div></div><div class="art">'+art(l.art)+'</div></div><div class="toolbar"><button class="btn primary" data-action="read-aloud">▶ 朗读全文</button><button class="btn" data-action="stop-audio" aria-label="停止朗读">■ 停止</button><button class="btn toggle" aria-pressed="'+state.translation+'" data-action="translation">译 显示译文</button><button class="btn toggle" aria-pressed="'+hiddenWords+'" data-action="cloze">◌ 遮挡自测</button><details class="voice-settings"><summary>语音设置</summary><div><select id="voice" aria-label="朗读语音"></select><select id="speed" aria-label="朗读速度"><option value="0.75">0.75× 慢速</option><option value="0.9">0.9×</option><option value="1">1× 正常</option></select></div></details></div><p class="tip">'+(hiddenWords?'根据上下文回忆空白处，点开即可核对单词。':'点绿色单词，查看音标、中文释义和文中例句。')+'</p><div class="article-body '+(hiddenWords?'cloze':'')+'">'+l.paragraphs.map(p=>'<section class="paragraph"><p class="en" lang="en">'+annotate(p.en,l)+'</p><p class="zh '+(state.translation?'':'hidden')+'">'+p.zh+'</p></section>').join('')+'</div><div class="source">事实来源：<a target="_blank" rel="noopener" href="'+l.source.url+'">'+l.source.name+' ↗</a><span>基于真实资料编写的学习短文，非媒体原文转载；教学算例已在文中注明。</span></div><div class="article-bottom"><button class="btn '+(state.read.includes(l.id)?'reading-done':'')+'" data-action="mark-read">'+(state.read.includes(l.id)?'✓ 已完成阅读':'✓ 读完了，记一笔')+'</button><button class="btn ghost" data-lesson="'+lessons[(i+1)%lessons.length].id+'">'+(i===lessons.length-1?'回到第一篇':'下一篇')+' →</button></div></article><div class="below-head"><h3>把这些词带走</h3><span>'+l.words.length+' 个目标词 · 点开词卡</span></div><div class="word-chips">'+words.filter(w=>w.lesson===l.id).map(w=>'<button class="chip" data-word="'+w.id+'">'+w.word+'<small>'+(state.mastered.includes(w.id)?'✓ 已掌握':w.meaning.split(' ')[0])+'</small></button>').join('')+'</div><section class="quiz"><h3>读懂了吗？</h3><p class="muted">仅根据短文判断。选完三题后保存本次成绩。</p><div id="quiz-questions"></div><button class="btn primary" data-action="submit-quiz">保存测验成绩</button><button class="btn ghost" data-action="restart-quiz">重新作答</button><p id="quiz-result" class="quiz-result" role="status"></p></section>';
 renderQuiz();
 renderVoices();
 document.querySelector('#speed').value = String(state.speed);
}
function renderQuiz() {
 const l=lessonById.get(current), answers=quizAnswers[current] || {};
 document.querySelector('#quiz-questions').innerHTML=l.questions.map((q,i)=>{
 const selected=answers[i];
 return '<div class="question"><p>'+String(i+1).padStart(2,'0')+'. '+escapeHTML(q.q)+'</p><div class="answers">'+['True','False','Not Given'].map(a=>'<button class="answer '+(selected===a?'selected '+(a===q.a?'right':'wrong'):'')+'" data-question="'+i+'" data-answer="'+a+'" '+(selected?'disabled':'')+'>'+a+'</button>').join('')+'</div>'+(selected?'<div class="feedback '+(selected===q.a?'':'error')+'">'+(selected===q.a?'✓ 正确':'正确答案：'+q.a)+' · '+q.why+'</div>':'')+'</div>';
 }).join('');
 document.querySelector('[data-action="submit-quiz"]').disabled=quizRecorded.has(current);
}
function wordCard(w) {
 document.querySelector('#word-card').innerHTML='<div class="dialog-top"><span>WORD NOTE / '+lessonById.get(w.lesson).label+'</span><button class="close" data-action="close-word" aria-label="关闭词卡">×</button></div><h2 class="word-title" id="word-title">'+w.word+'</h2><div class="pronunciation"><span>'+w.ipa+'</span><button data-action="speak-word">▶ 读单词</button></div><p class="definition">'+w.meaning+'</p><p class="example" lang="en">'+escapeHTML(w.example)+'</p>'+(w.note?'<p class="note">'+w.note+'</p>':'')+'<div class="dialog-actions"><button class="btn '+(state.mastered.includes(w.id)?'reading-done':'primary')+'" data-action="master-word">'+(state.mastered.includes(w.id)?'✓ 已掌握':'标记已掌握')+'</button><button class="btn" data-action="save-word">'+(state.saved.includes(w.id)?'★ 已加入复习':'☆ 加入复习')+'</button></div><div class="word-source">词表原图：第 '+w.page+' 页 · 例句来自本期学习短文</div>';
}
function openWord(id) { activeWord=id; wordCard(byId.get(id)); dialog.showModal(); }
function toggle(list,id) { const index=list.indexOf(id); if(index>=0)list.splice(index,1); else list.push(id); }
function renderWords() {
 main.innerHTML='<span class="eyebrow">WORDS IN CONTEXT</span><h2 class="page-title">每个词，都有一个故事。</h2><p class="page-lead">本期 75 个主词条，逐项对应你上传的第 066–071 页。点开词卡，回到它出现的句子。</p><div class="filters"><input class="search" id="word-search" placeholder="搜索单词或中文释义…" aria-label="搜索单词" value="'+escapeHTML(search)+'"><select id="word-filter" aria-label="掌握状态"><option value="all">全部单词</option><option value="new">尚未掌握</option><option value="mastered">已掌握</option><option value="saved">已加入复习</option></select><select id="lesson-filter" aria-label="按短文筛选"><option value="all">所有短文</option>'+lessons.map(l=>'<option value="'+l.id+'">'+l.label+'</option>').join('')+'</select></div><p class="muted" id="word-count"></p><div id="word-grid" class="word-grid"></div>';
 document.querySelector('#word-filter').value=wordFilter;
 document.querySelector('#lesson-filter').value=lessonFilter;
 renderWordGrid();
}
function renderWordGrid() {
 const filtered=words.filter(w=>(w.word+' '+w.meaning).toLowerCase().includes(search.toLowerCase())&&(lessonFilter==='all'||w.lesson===lessonFilter)&&(wordFilter==='all'||wordFilter==='new'&&!state.mastered.includes(w.id)||wordFilter==='mastered'&&state.mastered.includes(w.id)||wordFilter==='saved'&&state.saved.includes(w.id)));
 document.querySelector('#word-count').textContent=filtered.length+' 个词';
 document.querySelector('#word-grid').innerHTML=filtered.length?filtered.map(w=>'<button class="vocab-card" data-word="'+w.id+'"><strong>'+w.word+'</strong><span class="ipa">'+w.ipa+'</span><span class="saved-tag">'+(state.mastered.includes(w.id)?'✓':state.saved.includes(w.id)?'★':'')+'</span><p>'+w.meaning+'</p></button>').join(''):'<div class="empty">没有匹配的单词。试试其他关键词或筛选条件。</div>';
}
function renderReview() {
 main.innerHTML='<span class="eyebrow">A LITTLE RECALL</span><h2 class="page-title">把“眼熟”变成“记得”。</h2><p class="page-lead">看中文，写英文。每组最多 10 个词，完成后保存成绩。</p><div id="review-content"></div>';
 if(!review) {
 document.querySelector('#review-content').innerHTML='<div class="review-box"><h3>今天从哪里开始？</h3><p class="muted">选一组词，先试着回忆，再看答案。</p><div class="data-tools"><button class="btn primary" data-start="new">尚未掌握 · '+(words.length-state.mastered.length)+' 词</button><button class="btn" data-start="saved">我的复习 · '+state.saved.length+' 词</button><button class="btn" data-start="all">全部词汇 · 75 词</button></div></div>'; return;
 }
 renderReviewCard();
}
function beginReview(scope) {
 const pool=words.filter(w=>scope==='all'||scope==='new'&&!state.mastered.includes(w.id)||scope==='saved'&&state.saved.includes(w.id)).map(w=>w.id);
 if(!pool.length){notify(scope==='saved'?'还没有加入复习的词。点开词卡，选择“加入复习”。':'这些词都已掌握，可以选择全部词汇练习。');return;}
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 review={ids:pool.slice(0,10),index:0,correct:0,answered:false,lastCorrect:false,completed:false};
 renderReview();
}
function renderReviewCard() {
 const root=document.querySelector('#review-content');
 if(review.completed) {
 root.innerHTML='<div class="review-box"><span class="eyebrow">SESSION COMPLETE</span><h3 class="review-question">这组完成了。</h3><p class="page-title">'+review.correct+' / '+review.ids.length+'</p><p class="muted">成绩已保存。答错的词已经加入“我的复习”。</p><div class="data-tools"><button class="btn primary" data-action="review-again">再来一组</button><button class="btn" data-view="progress">查看记录</button></div></div>';return;
 }
 const w=byId.get(review.ids[review.index]);
 root.innerHTML='<div class="review-box"><div class="review-top"><span>词汇回忆</span><span>'+String(review.index+1).padStart(2,'0')+' / '+review.ids.length+'</span></div><progress value="'+review.index+'" max="'+review.ids.length+'"></progress><h3 class="review-question">'+w.meaning+'</h3><p class="muted">来自「'+lessonById.get(w.lesson).label+'」</p><form class="review-form" id="spelling-form"><input id="spelling" aria-label="输入英文单词" placeholder="输入英文单词" autocomplete="off" autocapitalize="none" spellcheck="false" '+(review.answered?'disabled':'')+'><button class="btn primary" type="submit" '+(review.answered?'disabled':'')+'>核对答案</button></form>'+(review.answered?'<div class="review-answer"><div class="feedback '+(review.lastCorrect?'':'error')+'">'+(review.lastCorrect?'✓ 答对了':'再记一下这个词')+'</div><strong>'+w.word+'</strong><p class="muted">'+w.ipa+'</p><p class="example">'+escapeHTML(w.example)+'</p><button class="btn" data-word="'+w.id+'">查看完整词卡</button></div><button class="btn primary" data-action="next-word">'+(review.index+1===review.ids.length?'完成本组':'下一个词 →')+'</button>':'<button class="btn ghost" data-action="reveal-answer">想不起来，看看答案</button>')+'</div>';
 if(!review.answered)document.querySelector('#spelling').focus();
}
function gradeWord(value) {
 if(review.answered)return;
 const w=byId.get(review.ids[review.index]);
 const normalized=value.toLowerCase().trim().replace(/\s+/g,' ');
 const correct=normalized===w.word.toLowerCase()||(w.id==='per-cent'&&normalized==='percent');
 review.answered=true;review.lastCorrect=correct;if(correct)review.correct++;
 if(!correct&&!state.saved.includes(w.id))state.saved.push(w.id);
 save();renderReviewCard();
}
function renderHistory() {
 const dates=new Set(state.history.map(h=>new Date(h.at).toLocaleDateString('zh-CN')));
 main.innerHTML='<span class="eyebrow">YOUR READING TRAIL</span><h2 class="page-title">每一点进步，都算数。</h2><p class="page-lead">学习记录保存在当前浏览器。换设备时，可导出进度，再在新设备导入。</p><div class="stats"><div class="stat"><strong>'+state.mastered.length+'<small> / 75</small></strong><small>已掌握词汇</small></div><div class="stat"><strong>'+state.read.length+'<small> / 9</small></strong><small>已读短文</small></div><div class="stat"><strong>'+dates.size+'</strong><small>有记录的学习日</small></div></div><div class="data-tools"><button class="btn primary" data-action="export">↓ 导出学习进度</button><button class="btn" data-action="import">↑ 导入并合并进度</button></div><p class="muted">导出文件只包含本版的学习标记和成绩，不包含账号或密钥。导入会合并两份记录。</p><div class="below-head"><h3>最近的足迹</h3><span>最多保留 100 条</span></div><div class="history-list">'+(state.history.length?state.history.map(h=>'<div class="history-row"><span>'+escapeHTML(h.label)+(h.type==='read'?' · 已读':' · '+h.score+' / '+h.total)+'</span><small>'+new Date(h.at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})+'</small></div>').join(''):'<div class="empty">还没有记录。读完一篇短文，或者完成一组小测，从这里开始积累。</div>')+'</div>';
}
function stopAudio() { if('speechSynthesis' in window)speechSynthesis.cancel(); utterance=null; const b=document.querySelector('[data-action="read-aloud"]');if(b)b.textContent='▶ 朗读全文'; }
function renderVoices() {
 const select=document.querySelector('#voice');if(!select)return;
 if(!('speechSynthesis' in window)){select.innerHTML='<option>此浏览器不支持朗读</option>';document.querySelector('[data-action="read-aloud"]').disabled=true;return;}
 const voices=speechSynthesis.getVoices().filter(v=>v.lang.toLowerCase().startsWith('en'));
 if(!state.voice){const british=voices.find(v=>v.lang.toLowerCase()==='en-gb');if(british)state.voice=british.voiceURI;}
 select.innerHTML='<option value="">请选择英语语音</option>'+voices.map(v=>'<option value="'+escapeHTML(v.voiceURI)+'">'+escapeHTML(v.name)+' ('+v.lang+')</option>').join('');
 select.value=state.voice;
}
function speak(text) {
 if(!('speechSynthesis' in window)){notify('此浏览器不支持朗读。');return;}
 const voices=speechSynthesis.getVoices();
 const voice=voices.find(v=>v.voiceURI===state.voice);
 if(!voice){notify('请在“语音设置”中选择英语语音。系统需已安装英语语音包。');return;}
 stopAudio();utterance=new SpeechSynthesisUtterance(text);utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=state.speed;
 utterance.onend=()=>{const b=document.querySelector('[data-action="read-aloud"]');if(b)b.textContent='▶ 朗读全文';utterance=null;};
 utterance.onerror=e=>{if(e.error!=='canceled'&&e.error!=='interrupted')notify('朗读未成功：'+e.error+'。请检查所选语音。');const b=document.querySelector('[data-action="read-aloud"]');if(b)b.textContent='▶ 朗读全文';};
 speechSynthesis.speak(utterance);
 if(view==='read'&&!dialog.open)document.querySelector('[data-action="read-aloud"]').textContent='♫ 正在朗读';
}
function render() {
 document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 renderSidebar();
 if(view==='read')renderRead();else if(view==='words')renderWords();else if(view==='review')renderReview();else renderHistory();
}
function navigate(next,id) {
 stopAudio();notify('');view=next;if(id)current=id;
 history.replaceState(null,'','#'+view+(view==='read'?'/'+current:''));
 render();window.scrollTo({top:0,behavior:'instant'});
}
function exportProgress() {
 const blob=new Blob([JSON.stringify({app:'fieldnotes',exportedAt:new Date().toISOString(),...state},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='fieldnotes-progress-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(url);notify('学习进度已导出。');
}
async function importProgress(file) {
 try {
 const incoming=JSON.parse(await file.text());
 if(incoming.app!=='fieldnotes'||incoming.version!==2||!['mastered','saved','read','history'].every(k=>Array.isArray(incoming[k])))throw new Error('请选择本版导出的 FIELDNOTES 进度文件。');
 if(!incoming.mastered.every(id=>byId.has(id))||!incoming.saved.every(id=>byId.has(id))||!incoming.read.every(id=>lessonById.has(id)))throw new Error('文件含有不属于本课程的词汇或阅读记录。');
 if(!incoming.history.every(h=>typeof h.label==='string'&&['read','quiz','spelling'].includes(h.type)&&Number.isFinite(Date.parse(h.at))&&Number.isFinite(h.score)&&Number.isFinite(h.total)))throw new Error('成绩记录格式不正确。');
 for(const k of ['mastered','saved','read'])state[k]=[...new Set([...state[k],...incoming[k]])];
 state.history=[...new Map([...state.history,...incoming.history].map(h=>[h.at+'|'+h.type+'|'+h.label,h])).values()].sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,100);
 save();render();notify('已合并导入的学习进度。');
 }catch(e){notify(e instanceof SyntaxError?'文件不是有效的 JSON，请选择导出的进度文件。':e.message);}
}
document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.view){navigate(button.dataset.view);return;}
 if(button.dataset.lesson){navigate('read',button.dataset.lesson);return;}
 if(button.dataset.word){openWord(button.dataset.word);return;}
 if(button.dataset.start){beginReview(button.dataset.start);return;}
 if(button.dataset.question!==undefined){(quizAnswers[current]||= {})[button.dataset.question]=button.dataset.answer;renderQuiz();return;}
 const action=button.dataset.action;
 if(action==='close-word'){dialog.close();return;}
 if(action==='speak-word'){speak(byId.get(activeWord).word);return;}
 if(action==='master-word'||action==='save-word'){toggle(action==='master-word'?state.mastered:state.saved,activeWord);save();wordCard(byId.get(activeWord));if(view==='words')renderWordGrid();return;}
 if(action==='translation'){state.translation=!state.translation;save();document.querySelectorAll('.zh').forEach(p=>p.classList.toggle('hidden',!state.translation));button.setAttribute('aria-pressed',String(state.translation));return;}
 if(action==='cloze'){hiddenWords=!hiddenWords;document.querySelector('.article-body').classList.toggle('cloze',hiddenWords);button.setAttribute('aria-pressed',String(hiddenWords));document.querySelector('.tip').textContent=hiddenWords?'根据上下文回忆空白处，点开即可核对单词。':'点绿色单词，查看音标、中文释义和文中例句。';return;}
 if(action==='read-aloud'){speak(lessonById.get(current).paragraphs.map(p=>p.en).join('\n\n'));return;}
 if(action==='stop-audio'){stopAudio();return;}
 if(action==='mark-read'){if(!state.read.includes(current)){state.read.push(current);record('read',lessonById.get(current).zhTitle,0,0);renderSidebar();button.textContent='✓ 已完成阅读';button.classList.add('reading-done');notify('已记录这篇阅读。');}return;}
 if(action==='submit-quiz'){
 const l=lessonById.get(current), answers=quizAnswers[current]||{};
 if(Object.keys(answers).length<l.questions.length){document.querySelector('#quiz-result').textContent='请先完成全部三题。';return;}
 const score=l.questions.filter((q,i)=>answers[i]===q.a).length;
 if(!quizRecorded.has(current)){record('quiz',l.zhTitle,score,l.questions.length);quizRecorded.add(current);}
 document.querySelector('#quiz-result').textContent='本次 '+score+' / '+l.questions.length+'，成绩已保存。';button.disabled=true;return;
 }
 if(action==='restart-quiz'){quizAnswers[current]={};quizRecorded.delete(current);renderQuiz();document.querySelector('#quiz-result').textContent='';return;}
 if(action==='reveal-answer'){gradeWord('');return;}
 if(action==='next-word'){review.index++;review.answered=false;if(review.index===review.ids.length){review.completed=true;record('spelling','词汇拼写',review.correct,review.ids.length);}renderReviewCard();return;}
 if(action==='review-again'){review=null;renderReview();return;}
 if(action==='export'){exportProgress();return;}
 if(action==='import'){document.querySelector('#import-file').click();}
});
document.addEventListener('input',e=>{if(e.target.id==='word-search'){search=e.target.value;renderWordGrid();}});
document.addEventListener('change',e=>{
 if(e.target.id==='word-filter'){wordFilter=e.target.value;renderWordGrid();}
 if(e.target.id==='lesson-filter'){lessonFilter=e.target.value;renderWordGrid();}
 if(e.target.id==='voice'){state.voice=e.target.value;save();}
 if(e.target.id==='speed'){state.speed=Number(e.target.value);save();}
 if(e.target.id==='import-file'&&e.target.files[0]){importProgress(e.target.files[0]);e.target.value='';}
});
document.addEventListener('submit',e=>{if(e.target.id==='spelling-form'){e.preventDefault();gradeWord(document.querySelector('#spelling').value);}});
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
window.addEventListener('pagehide',stopAudio);
if('speechSynthesis' in window)speechSynthesis.addEventListener('voiceschanged',renderVoices);
function readRoute() {
 const parts=location.hash.slice(1).split('/');
 if(parts[0]&& !['read','words','review','progress'].includes(parts[0])){main.innerHTML='<div class="empty">这个页面不存在。<a href="#read">回到阅读首页</a></div>';return;}
 view=parts[0]||'read';
 if(parts[1]&&!lessonById.has(parts[1])){main.innerHTML='<div class="empty">找不到这篇短文。<a href="#read">回到阅读首页</a></div>';return;}
 if(parts[1])current=parts[1];
 render();
}
window.addEventListener('hashchange',()=>{stopAudio();readRoute();});
readRoute();
