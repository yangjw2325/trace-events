/*
 * 交互评审稿：沿用既有灰底、白卡、绿色强调和单时间线结构。
 * 本轮只调整原型：登录入口；摘要/说法/原文三层；关注后的新增与变化提醒。
 * 全部公司、金额、原文为虚构样例。演示状态仅存于当前原型的 localStorage。
 * 已确认：公司总览不清空未读，打开对应事件变化后，关联入口同步已读。
 */
const root = document.querySelector('#app');
const page = location.pathname.split('/').pop() || 'index.html';
const params = new URLSearchParams(location.search);
const STORAGE = 'trace-prototype-review-20261102';
const fresh = () => ({ logged: false, updated: false, company: null, events: {}, notices: [] });
let state;
try { state = JSON.parse(localStorage.getItem(STORAGE)) || fresh(); } catch { state = fresh(); }
let searchType = params.get('type') || 'company';
let query = params.get('q') || '';
let eventTab = params.get('view') === 'versions' ? 'versions' : 'timeline';
let selectedDoc = params.get('doc');
let userMenuOpen = false;
let enteredNotice = null;
const companyName = '云川科技';
const documents = {
 announcement: { title: '收购事项提示性公告', date: '2026-10-30', kind: '公司公告', source: '云川科技', category: '收购及出售资产', number: '2026-041', quote: '公司正在筹划收购星河半导体，拟交易对价10亿元，尚未签署正式协议。' },
 correction: { title: '关于收购事项提示性公告的更正公告', date: '2026-11-01', kind: '公司公告', source: '云川科技', category: '收购及出售资产', number: '2026-042', quote: '原公告中拟交易对价“10亿元”更正为“8亿元”。除上述更正内容外，原公告其他内容不变。' },
 news: { title: '云川科技Q3利润增长，新业务加快发展', date: '2026-11-01', kind: '新闻报道', source: '财经观察', category: '新闻片段', paragraphs: [
  '云川科技2026年前三季度营收19.6亿元，同比增长11.5%；归母净利润2.2亿元，同比增长10.7%。',
  '其中Q3单季度营收6.7亿元，同比增长18.0%；归母净利润0.7亿元，同比增长29.9%。',
  '报道援引机构观点认为，公司Q3增长主要来自终端需求旺盛、产品结构优化及运营效率提升。',
  '该机构认为低温存储业务持续恢复，新业务有望成为后续增长来源。'
 ] },
 financing: { title: '向特定对象发行股票预案', date: '2026-11-02', kind: '公司公告', source: '云川科技', category: '再融资', number: '2026-043', quote: '公司拟向特定对象发行股票，募集资金不超过5亿元，用于研发产线建设。发行方案尚需履行相关审议程序。' }
};
function save() { localStorage.setItem(STORAGE, JSON.stringify(state)); }
function esc(value = '') { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function original(doc) { return `source.html?doc=${encodeURIComponent(doc)}`; }
function eventHref(id, extra = {}) { return 'event.html?' + new URLSearchParams({ id: String(id), ...extra }).toString(); }
function catalog() {
 return [
  { id: 0, title: '云川科技收购星河半导体', state: '筹划中', kind: '收购事件', date: state.updated ? '2026-11-01' : '2026-10-30', version: state.updated ? 2 : 1,
    desc: state.updated ? '交易对价更正为8亿元，正式协议尚未签署。' : '拟以10亿元收购星河半导体，正式协议尚未签署。', keywords: '收购 重组 星河 金额 更正' },
  { id: 1, title: '云川科技2026年前三季度业绩与机构观点', state: '待核实', kind: '业绩披露', date: '2026-11-01', version: 1,
    desc: '媒体报道季度业绩增长，已收录新闻片段。', keywords: '业绩 财报 季报 研报 新闻 Q3' },
  ...(state.updated ? [{ id: 2, title: '云川科技拟定增建设研发产线', state: '筹划中', kind: '再融资', date: '2026-11-02', version: 1,
    desc: '公司披露定增预案，拟募资不超过5亿元。', keywords: '定增 再融资 募资 产线' }] : [])
 ];
}
function unread() { return state.logged ? state.notices.filter(n => !n.read) : []; }
function unreadFor(kind, id = 0) {
 const subscription = kind === 'company' ? state.company : state.events[id];
 if (!state.logged || !subscription) return [];
 return unread().filter(n => n.seq > subscription.baseline && (kind === 'company' || n.eventId === Number(id)));
}
function badge(kind, id = 0, detailed = false) {
 const count = unreadFor(kind, id).length;
 return count ? `<em class="update-badge">${detailed ? count + '条更新' : '有更新'}</em>` : '';
}
function login() { state.logged = true; save(); render(); toast('已进入测试账号'); }
function toggleUser() { userMenuOpen = !userMenuOpen; render(); }
function follow(kind, id = 0) {
 const wasGuest = !state.logged;
 state.logged = true;
 const existing = kind === 'company' ? state.company : state.events[id];
 if (existing) { if (kind === 'company') state.company = null; else delete state.events[id]; }
 else {
  const record = { baseline: Math.max(0, ...state.notices.map(n => n.seq)), at: state.updated ? '2026-11-02 09:05' : '2026-11-02 08:55' };
  if (kind === 'company') state.company = record; else state.events[id] = record;
 }
 save(); render();
 toast(existing ? '已取消关注' : wasGuest ? '已使用测试账号关注' : '已关注');
}
function followButton(kind, id = 0) {
 const active = state.logged && (kind === 'company' ? state.company : state.events[id]);
 return `<button class="follow-button" onclick="follow('${kind}',${id})">${active ? '✓ 已关注' : '＋ 关注' + (kind === 'company' ? '公司' : '事件')}</button>`;
}
function simulateUpdate(quiet = false) {
 if (state.updated) return;
 if (!state.logged || (!state.company && !Object.keys(state.events).length)) { toast('先登录并关注公司或事件，再演示更新'); return; }
 state.updated = true;
 const reasons = [];
 if (state.company) reasons.push('关注公司：云川科技');
 if (state.events[0]) reasons.push('关注事件：收购星河半导体');
 if (reasons.length) state.notices.push({ id: 'change-acquisition-v2', seq: 1, eventId: 0, kind: 'correction', time: '2026-11-02 09:04', read: false, reasons });
 if (state.company) state.notices.push({ id: 'new-financing-v1', seq: 2, eventId: 2, kind: 'new', time: '2026-11-02 09:04', read: false, reasons: ['关注公司：云川科技'] });
 save();
 if (!quiet) { render(); toast(state.notices.length ? '演示更新已到达，可查看关注提示和变化通知' : '本次更新未涉及你关注的事件'); }
}
function setScene(scene) {
 state = fresh();
 if (scene !== 'guest') { state.logged = true; state.company = { baseline: 0, at: '2026-11-02 08:55' }; state.events[0] = { baseline: 0, at: '2026-11-02 08:55' }; }
 if (scene === 'updated') simulateUpdate(true); else save();
}
if (params.has('scene')) {
 setScene(params.get('scene'));
 const url = new URL(location.href); url.searchParams.delete('scene'); history.replaceState(null, '', url);
}
if (page === 'event.html') {
 const id = Number(params.get('id') || 0);
 enteredNotice = unread().find(n => n.eventId === id) || null;
 state.notices.filter(n => n.eventId === id).forEach(n => { n.read = true; });
 save();
}
function shell(body) {
 const count = unread().length;
 root.innerHTML = `<header><a class="brand" href="index.html">◈ 溯源<span class="brand-en">TRACE</span></a><nav aria-label="主导航"><a href="index.html" class="${['index.html', 'search.html', 'company.html', 'event.html'].includes(page) ? 'on' : ''}">事件研究</a><a href="following.html" class="${page === 'following.html' ? 'on' : ''}">我的关注${state.company && unreadFor('company').length || Object.keys(state.events).some(id => unreadFor('event', id).length) ? '<i class="nav-dot" aria-label="关注内容有更新"></i>' : ''}</a><a href="notifications.html" class="${page === 'notifications.html' ? 'on' : ''}">变化通知${count ? `<span class="notification-count">${count}</span>` : ''}</a></nav><span class="muted prototype-label">交互评审原型</span><div class="user-area">${state.logged ? `<button class="avatar" aria-label="测试账号" aria-expanded="${userMenuOpen}" onclick="toggleUser()">研</button>${userMenuOpen ? '<div class="user-menu"><strong>测试账号</strong><span>当前浏览器的体验身份</span></div>' : ''}` : '<button class="login-button" onclick="login()">登录</button>'}</div></header><main class="wrap">${body}<footer><span>溯源 · 投资事件与证据研究台</span><span>虚构交互样例 · 每日09:00自动更新</span></footer><aside class="prototype-demo" aria-label="原型演示工具"><span>原型演示</span><a href="review.html">评审说明</a><a href="index.html?scene=guest">重置为未登录</a><a href="following.html?scene=followed">已关注，无更新</a><button onclick="simulateUpdate()" ${state.updated ? 'disabled' : ''}>${state.updated ? '本次更新已演示' : '模拟下一次更新'}</button><small>仅用于演示，不是产品功能</small></aside></main>`;
 wireNavigation();
}
function toast(text) { document.querySelector('.toast')?.remove(); const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = text; document.body.append(el); setTimeout(() => el.remove(), 2400); }
function search() {
 return `<div class="searchbox">${page === 'search.html' ? '' : `<div class="switch"><button class="${searchType === 'company' ? 'active' : ''}" onclick="setType('company')">搜公司</button><button class="${searchType === 'event' ? 'active' : ''}" onclick="setType('event')">搜事件</button></div>`}<form class="searchline" onsubmit="submitSearch(event)">${page === 'search.html' ? `<select class="search-type-select" aria-label="搜索类型" onchange="setType(this.value)"><option value="company" ${searchType === 'company' ? 'selected' : ''}>公司</option><option value="event" ${searchType === 'event' ? 'selected' : ''}>事件</option></select>` : ''}<input id="query" autocomplete="off" aria-label="搜索" placeholder="${searchType === 'company' ? '输入公司名称或股票代码' : '输入事件关键词，如收购、业绩'}" value="${esc(query)}" oninput="suggest(this.value)"><button class="primary">搜索 →</button></form><div id="suggestions"></div></div>`;
}
function setType(value) { searchType = value; query = document.querySelector('#query')?.value || ''; render(); }
function suggest(value) {
 const text = value.trim().toLowerCase();
 const options = searchType === 'company' ? ['云川科技', '688XXX'] : catalog().map(e => e.title);
 const matches = options.filter(x => x.toLowerCase().includes(text));
 document.querySelector('#suggestions').innerHTML = text && matches.length ? `<div class="suggest"><div class="muted small" style="padding:3px 12px">联想词</div>${matches.map(x => `<button type="button" onclick="fill('${esc(x)}')">↖　${esc(x)}</button>`).join('')}</div>` : '';
}
function fill(value) { document.querySelector('#query').value = value; document.querySelector('#suggestions').innerHTML = ''; document.querySelector('#query').focus(); }
function submitSearch(e) { e.preventDefault(); const q = document.querySelector('#query').value.trim(); if (q) location.href = 'search.html?' + new URLSearchParams({ type: searchType, q }); else toast('请输入搜索内容'); }
function card(event, showUpdate = true) {
 const notice = showUpdate ? unread().find(n => n.eventId === event.id) : null;
 return `<a class="card event-card ${notice ? 'has-update' : ''}" href="${eventHref(event.id, notice?.kind === 'correction' ? { view: 'versions' } : {})}"><div class="row between"><div class="row"><span class="tag">${event.state}</span>${notice ? `<span class="tag ${notice.kind === 'new' ? '' : 'amber'}">${notice.kind === 'new' ? '新增事件' : '金额更正'}</span>` : ''}</div><time class="muted small">${event.date}</time></div><h3 style="margin-top:15px">${event.title}</h3><p class="muted">${event.desc}</p><div class="meta"><span>云川科技 · 688XXX</span><span style="margin-left:auto;color:#27725f">${notice?.kind === 'correction' ? '查看变化' : '查看事件'} →</span></div></a>`;
}
function titleRow(title, href, date, update = '') { return `<a href="${href}"><span>${title}${update}</span><time>${date}</time></a>`; }
function empty(text, button = '') { return `<div class="panel empty"><p>${text}</p>${button}</div>`; }
function home() {
 const events = catalog();
 const watched = state.logged && (state.company || Object.keys(state.events).length);
 shell(`<div class="home-head"><h1>追踪投资事件，查清每次变化</h1>${search()}</div><div class="home-columns"><section class="home-section"><div class="row between"><h2>我的关注</h2><a class="muted small" href="following.html">查看全部 →</a></div><div class="title-list">${watched ? `${state.company ? titleRow(companyName, 'company.html', state.updated ? '2026-11-02' : '2026-11-01', badge('company')) : ''}${Object.keys(state.events).map(id => { const e = events.find(e => e.id === Number(id)); return e ? titleRow(e.title, eventHref(e.id), e.date, badge('event', e.id)) : ''; }).join('')}` : `<div class="list-empty">${state.logged ? '暂无关注' : '登录后查看关注内容'}</div>`}</div></section><section class="home-section"><h2>推荐事件</h2><div class="title-list">${events.slice(0, 2).map(e => titleRow(e.title, eventHref(e.id), e.date)).join('')}</div></section></div><div class="home-status"><span class="dot"></span><span>最近更新 ${state.updated ? '2026-11-02 09:04' : '2026-11-01 09:04'}</span><span class="status-sep">·</span><span>每日09:00自动采集</span></div>`);
}
function results() {
 const matches = catalog().filter(e => (e.title + e.keywords).toLowerCase().includes(query.toLowerCase()));
 const companyMatch = ['云川科技', '688XXX'].some(s => s.toLowerCase().includes(query.toLowerCase()));
 shell(`<div class="search-toolbar"><a class="backlink" href="index.html">← 返回主页</a><div class="results-search">${search()}</div></div><div class="row between"><span class="muted">“${esc(query)}” · ${searchType === 'company' ? Number(companyMatch) : matches.length} 个${searchType === 'company' ? '公司' : '事件'}结果</span><select aria-label="排序" onchange="sortResults(this.value)"><option value="relevance">相关性</option><option value="date">日期最新</option></select></div><p class="muted small">日期：最近重要变化的披露日期</p><div id="results">${searchType === 'company' ? companyMatch ? `<a class="card" href="company.html"><h3>云川科技 <span class="muted">688XXX · 示例代码</span></h3><p class="muted">半导体 · 科创板</p><p class="meta">${catalog().length} 个相关事件</p></a>` : empty('暂无匹配公司') : matches.length ? matches.map(e => card(e)).join('') : empty('暂无匹配事件')}</div>`);
}
function sortResults(sort) { if (searchType !== 'event') return; const matches = catalog().filter(e => (e.title + e.keywords).toLowerCase().includes(query.toLowerCase())); if (sort === 'date') matches.sort((a, b) => b.date.localeCompare(a.date)); document.querySelector('#results').innerHTML = matches.length ? matches.map(e => card(e)).join('') : empty('暂无匹配事件'); wireNavigation(); }
function updateStatus() { return `<div class="panel"><h3>数据状态</h3><p><span class="dot"></span>最近任务已完成</p><div class="sideitem muted">最近成功更新<br><strong>${state.updated ? '2026-11-02 09:04' : '2026-11-01 09:04'}</strong></div><p class="muted small">每日北京时间09:00开始采集。</p></div>`; }
function company() {
 const events = catalog().toSorted((a, b) => b.date.localeCompare(a.date));
 shell(`<div class="row between company-heading"><div><h1>云川科技 <span class="muted">688XXX · 示例</span></h1><p class="muted">半导体 / 科创板</p></div>${followButton('company')}</div><div class="grid" style="margin-top:30px"><section><div class="row between"><h2>相关事件 <span class="muted">${events.length}</span></h2><span class="muted small">按最近重要变化排序</span></div>${events.map(e => card(e)).join('')}</section><aside>${updateStatus()}</aside></div>`);
}
function following() {
 if (!state.logged) { shell(`<h1>我的关注</h1>${empty('登录后查看关注内容', '<button class="primary" onclick="login()">登录</button>')}`); return; }
 const updates = unreadFor('company');
 const companySection = state.company ? `<div class="watch-company"><div class="watch-company-head"><a href="company.html"><strong>云川科技</strong><span class="muted">688XXX</span></a><div class="row">${badge('company', 0, true)}<time>${state.updated ? '2026-11-02' : '2026-11-01'}</time></div></div>${updates.length ? `<div class="watch-updates">${updates.toReversed().map(n => { const e = catalog().find(e => e.id === n.eventId); return `<a href="${eventHref(n.eventId, n.kind === 'correction' ? { view: 'versions' } : {})}"><span class="tag ${n.kind === 'new' ? '' : 'amber'}">${n.kind === 'new' ? '新增' : '更正'}</span><span>${e.title}</span><span class="muted small">查看${n.kind === 'new' ? '事件' : '变化'} →</span></a>`; }).join('')}</div>` : ''}</div>` : empty('尚未关注公司', '<a class="text-link" href="index.html">去搜索 →</a>');
 const eventSection = Object.keys(state.events).map(id => catalog().find(e => e.id === Number(id))).filter(Boolean);
 shell(`<h1>我的关注</h1><h2 class="section-heading">公司</h2>${companySection}<h2 class="section-heading">事件</h2>${eventSection.length ? `<div class="follow-event-list">${eventSection.map(e => `<a class="follow-event-row" href="${eventHref(e.id, unreadFor('event', e.id).length ? { view: 'versions' } : {})}"><div><strong>${e.title}</strong>${badge('event', e.id)}<span class="muted small">${e.state}</span></div><time>${e.date}</time></a>`).join('')}</div>` : empty('尚未关注事件', '<a class="text-link" href="index.html">去搜索 →</a>')}`);
}
function notificationTarget(n) { return eventHref(n.eventId, n.kind === 'correction' ? { view: 'versions', notice: n.id } : { notice: n.id }); }
function notifications() {
 if (!state.logged) { shell(`<h1>变化通知</h1>${empty('登录后查看变化通知', '<button class="primary" onclick="login()">登录</button>')}`); return; }
 shell(`<h1>变化通知</h1>${!state.notices.length ? empty('暂无新通知。关注后出现的新事件和重要变化会显示在这里。') : state.notices.toReversed().map(n => {
  const event = catalog().find(e => e.id === n.eventId);
  return `<article class="card notification-card ${n.read ? 'is-read' : ''}"><div class="row between"><div class="row"><span class="tag ${n.kind === 'new' ? '' : 'amber'}">${n.kind === 'new' ? '新增事件' : '事件变化 · 金额更正'}</span><span class="read-state">${n.read ? '已读' : '<i class="unread-dot"></i>未读'}</span></div><time class="muted">${n.time}</time></div><a class="notification-title" href="${notificationTarget(n)}"><h3>${event.title}</h3></a>${n.kind === 'new' ? '<p>公司披露定增预案，拟募资不超过5亿元，用于研发产线建设。</p>' : '<div class="notification-diff"><span class="diff-field">拟交易对价</span><span class="previous-value">10亿元</span><span class="diff-arrow">→</span><strong>8亿元</strong><span class="muted small">V1 → V2</span></div><p class="muted small">筹划状态未变，正式协议尚未签署。</p>'}<div class="notification-source"><span>依据</span><a href="${original(n.kind === 'new' ? 'financing' : 'correction')}" target="_blank" rel="noopener">${n.kind === 'new' ? documents.financing.title : documents.correction.title} ↗</a></div><div class="notification-bottom"><span class="muted small" title="${esc(n.reasons.join('；'))}">${n.reasons.length > 1 ? '来自关注公司与关注事件 · 同一变化合并提醒' : n.reasons[0]}</span><a class="text-link" href="${notificationTarget(n)}">${n.kind === 'new' ? '查看新增事件' : '查看本次变化'} →</a></div></article>`;
 }).join('')}`);
}
function reference(quote, position = '第1页 · 第1段') { return `<details class="quote-toggle"><summary>查看原文引用</summary><blockquote>${esc(quote)}</blockquote><span class="muted small">${position}</span></details>`; }
function toggleTableQuote(id, button) { const row = document.getElementById(id); row.hidden = !row.hidden; button.textContent = row.hidden ? '查看引用 ＋' : '收起引用 −'; button.setAttribute('aria-expanded', String(!row.hidden)); }
function tableQuote(id, text, position) { return `<tr id="${id}" class="full-quote" hidden><td colspan="4"><blockquote>${esc(text)}</blockquote><span class="muted small">${position}</span></td></tr>`; }
function financialEvidence() {
 return `<section class="claim-section"><div class="claim-section-heading"><span class="tag gray" title="按来源材料的陈述方式分类，不代表已由公司公告核实">事实陈述</span><span class="muted small">新闻转述</span></div><table class="facts-table"><thead><tr><th>期间</th><th>营收</th><th>归母净利润</th><th>依据</th></tr></thead><tbody><tr><th>2026年前三季度</th><td><strong>19.6亿元</strong><span>同比 +11.5%</span></td><td><strong>2.2亿元</strong><span>同比 +10.7%</span></td><td><button class="quote-inline-button" aria-expanded="false" aria-controls="news-fact-1" onclick="toggleTableQuote('news-fact-1',this)">查看引用 ＋</button></td></tr>${tableQuote('news-fact-1', documents.news.paragraphs[0], '新闻片段 · 第1段')}<tr><th>2026年Q3</th><td><strong>6.7亿元</strong><span>同比 +18.0%</span></td><td><strong>0.7亿元</strong><span>同比 +29.9%</span></td><td><button class="quote-inline-button" aria-expanded="false" aria-controls="news-fact-2" onclick="toggleTableQuote('news-fact-2',this)">查看引用 ＋</button></td></tr>${tableQuote('news-fact-2', documents.news.paragraphs[1], '新闻片段 · 第2段')}</tbody></table></section><section class="claim-section"><div class="claim-section-heading"><span class="tag gray">观点</span><span class="muted small">报道援引机构观点，未提供研报原文</span></div><div class="claim-row"><p>机构将Q3增长归因于终端需求、产品结构优化和运营效率提升。</p>${reference(documents.news.paragraphs[2], '新闻片段 · 第3段')}</div><div class="claim-row"><p>机构预计低温存储业务持续恢复，新业务提供后续增长动力。</p>${reference(documents.news.paragraphs[3], '新闻片段 · 第4段')}</div></section>`;
}
function evidence(docId, content) {
 const d = documents[docId];
 return `<details id="evidence-${docId}" class="evidence ${selectedDoc === docId ? 'evidence-focus' : ''}" ${selectedDoc === docId ? 'open' : ''}><summary><span><span class="source-type">${d.kind}${docId === 'news' ? ' · 片段' : ''}</span><strong>${d.title}</strong>${docId === 'news' ? '<span class="evidence-counts">2项事实陈述 · 2项观点</span>' : ''}</span><span class="expand-label"></span></summary><div class="evidence-body"><p class="evidence-meta">${d.source} · ${d.date}${d.number ? ' · 公告编号 ' + d.number : ''}</p>${content}<div class="evidence-footer"><a class="text-link" href="${original(docId)}" target="_blank" rel="noopener">${docId === 'news' ? '来源原文' : '公告原文'} ↗</a><details class="source-metadata"><summary>材料信息</summary><p>发生时间：未单独披露<br>披露：${d.date}<br>采集：2026-11-02 09:01<br>系统更新：2026-11-02 09:04<br>文件分类：${d.category} · 示例映射${docId === 'news' ? '<br>留存范围：新闻片段' : ''}</p></details></div></div></details>`;
}
function docIds(id) { return id === 0 ? state.updated ? ['correction', 'announcement'] : ['announcement'] : id === 1 ? ['news'] : ['financing']; }
function timeline(id) {
 if (id === 1) return `<div class="timeline-caption">按披露日期倒序 · 1个节点</div><div class="timeline"><article class="node"><time>2026-11-01 · 披露</time><h3>媒体报道季度业绩，援引机构观点</h3>${evidence('news', financialEvidence())}</article></div>`;
 if (id === 2) return `<div class="timeline-caption">按披露日期倒序 · 1个节点</div><div class="timeline"><article class="node"><time>2026-11-02 · 披露</time><h3>公司披露定增预案</h3>${evidence('financing', `<div class="claim-section-heading"><span class="tag gray">事实陈述</span><span class="muted small">公司公告</span></div><dl class="fact-fields"><div><dt>募资上限</dt><dd>5亿元</dd></div><div><dt>用途</dt><dd>研发产线建设</dd></div><div><dt>进展</dt><dd>尚需履行审议程序</dd></div></dl>${reference(documents.financing.quote)}`)}</article></div>`;
 return `<div class="timeline-caption">按披露日期倒序 · ${state.updated ? '2' : '1'}个节点</div><div class="timeline">${state.updated ? `<article class="node"><time>2026-11-01 18:30 · 披露</time><h3>公司更正拟交易金额 <span class="tag amber">更正</span></h3>${evidence('correction', `<div class="claim-section-heading"><span class="tag gray">事实陈述</span><span class="muted small">公司明确更正自己的原公告</span></div><div class="compare"><div class="old"><div class="label">原公告 2026-041 · 已更正</div><del>拟交易对价10亿元</del></div><div class="new"><div class="label">更正公告 2026-042 · 当前有效</div>拟交易对价8亿元</div></div><p class="muted small" style="margin-top:14px">更正范围：交易金额。目标：10月30日提示性公告中的金额表述。</p>${reference(documents.correction.quote)}`)}</article>` : ''}<article class="node"><time>2026-10-30 19:00 · 披露</time><h3>公司披露正在筹划收购</h3>${evidence('announcement', `<div class="claim-section-heading"><span class="tag gray">事实陈述</span><span class="muted small">公司公告</span></div><dl class="fact-fields"><div><dt>交易对象</dt><dd>星河半导体</dd></div><div><dt>拟交易对价</dt><dd>${state.updated ? '<del>10亿元</del><span class="tag amber">已更正为8亿元</span>' : '10亿元'}</dd></div><div><dt>协议状态</dt><dd>正式协议尚未签署</dd></div></dl>${reference(documents.announcement.quote)}`)}</article></div>`;
}
function versions(id) {
 if (id === 0 && state.updated) return `<div class="panel version"><div class="row between"><span class="tag">V2 · 当前版本</span><time class="muted small">2026-11-02 09:04</time></div><h3 style="margin-top:16px">交易金额更正，筹划状态未变</h3><div class="notification-diff"><span class="diff-field">拟交易对价</span><span class="previous-value">10亿元</span><span class="diff-arrow">→</span><strong>8亿元</strong></div><p class="muted">更正公告明确修订金额；正式协议尚未签署。</p><button class="source-button" onclick="openEvidence('correction')">定位触发证据 ↓</button></div><div class="panel"><span class="tag gray">V1 · 历史版本</span><h3 style="margin-top:16px">拟以10亿元收购，正式协议尚未签署</h3><p class="muted">当时依据：10月30日提示性公告。</p><p class="history-note">旧金额保留供追溯，当前金额为8亿元。</p><button class="source-button" onclick="openEvidence('announcement')">查看当时依据 ↓</button></div>`;
 const e = catalog().find(e => e.id === id);
 return `<div class="panel version"><span class="tag">V1 · 当前版本</span><h3 style="margin-top:16px">${e.desc}</h3><p class="muted small">目前仅有首次收录版本。</p><button class="source-button" onclick="openEvidence('${docIds(id)[0]}')">查看该版本依据 ↓</button></div>`;
}
function evidenceOverview(id) {
 const ids = docIds(id), kinds = [...new Set(ids.map(key => documents[key].kind))];
 return `<div class="panel"><h3>证据概览</h3>${kinds.map(kind => `<details class="evidence-group"><summary><span>${kind}</span><span>${ids.filter(key => documents[key].kind === kind).length}　⌄</span></summary>${ids.filter(key => documents[key].kind === kind).map(key => `<div class="evidence-item">${documents[key].title}<time>${documents[key].date}${key === 'news' ? ' · 新闻片段' : ''}</time><div class="evidence-actions"><a href="${original(key)}" target="_blank" rel="noopener">${key === 'news' ? '来源原文' : '公告原文'} ↗</a><button onclick="openEvidence('${key}')">定位证据 ↓</button></div></div>`).join('')}</details>`).join('')}</div>`;
}
function eventPage() {
 const id = Number(params.get('id') || 0), e = catalog().find(e => e.id === id);
 if (!e) { shell(empty('当前演示状态尚未出现这个事件', '<a href="company.html">返回公司总览 →</a>')); return; }
 const headline = id === 0 ? state.updated ? '交易金额已更正，收购仍在筹划。' : '收购仍在筹划，正式协议尚未签署。' : id === 1 ? '媒体报道季度业绩增长，关键数据待公告核实。' : '公司披露定增预案，发行方案尚需审议。';
 const recent = enteredNotice ? `<div class="arrival-strip"><span class="tag ${enteredNotice.kind === 'new' ? '' : 'amber'}">${enteredNotice.kind === 'new' ? '关注后新增' : '本次变化'}</span><span>${enteredNotice.kind === 'new' ? '来自你关注的云川科技' : '拟交易对价10亿元 → 8亿元'}</span><span class="muted small">${enteredNotice.time}</span></div>` : '';
 shell(`<div class="breadcrumb">云川科技 / ${e.kind}</div><div class="row between event-heading"><div><span class="tag ${e.state === '待核实' ? 'amber' : ''}">${e.state}</span><h1>${e.title}</h1><p class="muted">最近重要变化 ${e.date} · 当前版本 V${e.version}</p></div>${followButton('event', id)}</div>${recent}<div class="grid event-grid"><section><div class="panel event-brief"><div class="row between"><h2>事件摘要</h2><span class="muted small">V${e.version}</span></div><p class="brief-headline">${headline}</p>${id === 1 ? '<div class="brief-detail"><span>当前依据</span><strong>1篇新闻片段</strong><span>待补证据</span><strong>公司三季报原文</strong></div>' : id === 0 ? `<div class="brief-detail"><span>拟交易对价</span><strong>${state.updated ? '8' : '10'}亿元</strong><span>正式协议</span><strong>尚未签署</strong></div>` : '<div class="brief-detail"><span>募资上限</span><strong>5亿元</strong><span>用途</span><strong>研发产线建设</strong></div>'}<button class="brief-source" onclick="openEvidence('${docIds(id)[0]}')">查看依据 ↓</button></div><div class="tabs"><button class="${eventTab === 'timeline' ? 'selected' : ''}" onclick="changeTab('timeline')">事件时间线</button><button class="${eventTab === 'versions' ? 'selected' : ''}" onclick="changeTab('versions')">历史版本 ${e.version}</button></div>${eventTab === 'timeline' ? timeline(id) : versions(id)}</section><aside><div class="panel"><h3>关联标的</h3><div class="sideitem"><a href="company.html"><strong>云川科技 ↗</strong></a><p class="muted">688XXX · ${id === 0 ? '收购方' : id === 1 ? '业绩披露主体' : '发行主体'}</p></div>${id === 0 ? '<div class="sideitem"><strong>星河半导体</strong><p class="muted">交易标的 · 直接涉及</p></div>' : ''}</div>${evidenceOverview(id)}</aside></div>`);
 if (selectedDoc && eventTab === 'timeline') document.getElementById('evidence-' + selectedDoc)?.scrollIntoView({ block: 'center' });
}
function changeTab(value) { eventTab = value; selectedDoc = null; eventPage(); }
function openEvidence(key) { selectedDoc = key; eventTab = 'timeline'; eventPage(); }
function sourcePage() {
 const id = params.get('doc') || 'news', d = documents[id];
 if (!d) { shell(empty('未找到示例材料')); return; }
 shell(`<div class="source-preview"><span class="tag gray">虚构示例材料</span><h1>${d.title}</h1><p class="muted">${d.source} · ${d.date}${d.number ? ' · 公告编号 ' + d.number : ''}</p><div class="source-paper">${(d.paragraphs || [d.quote]).map(p => `<p>${p}</p>`).join('')}</div><p class="muted small">此页面用于演示原文入口，不是真实公司公告或新闻。</p></div>`);
}
function reviewPage() {
 shell(`<h1>本轮原型评审</h1><div class="review-grid"><a class="panel review-link" href="index.html?scene=guest"><span class="tag">01</span><h2>登录入口</h2><p>未登录显示“登录”，点击后直接进入测试账号。</p><span class="text-link">查看未登录首页 →</span></a><a class="panel review-link" href="event.html?id=1&doc=news"><span class="tag">02</span><h2>摘要与证据分层</h2><p>顶部只讲事件现状。材料内按类型组织内容，原文引用按需展开。</p><span class="text-link">查看新闻证据示例 →</span></a><a class="panel review-link" href="notifications.html?scene=updated"><span class="tag">03</span><h2>新增与变化提醒</h2><p>演示一条新增事件、一条金额更正，以及查看后同步已读。</p><span class="text-link">查看更新后的通知 →</span></a></div><div class="panel"><h2>完整体验路径</h2><ol><li>重置为未登录，点击“登录”。</li><li>搜索“云川”，进入公司总览，关注公司；也可同时关注收购事件。</li><li>打开“我的关注”，此时没有未读标记，也没有历史通知。</li><li>点击底部原型演示中的“模拟下一次更新”。</li><li>首页与关注页出现“有更新”，导航显示2条未读；同一更正不会重复提醒。</li><li>通知区分“新增事件”和“事件变化”，点击分别进入新事件或版本对照。</li><li>打开对应事件后，该条通知及关联关注提示同步已读，其余未读保留。</li></ol><a class="text-link" href="index.html?scene=guest">从头体验 →</a></div><p class="muted small">此页保留已确认的原型方案，正式实现按PRD v0.4同步。</p>`);
}
function wireNavigation() {
 if (['company.html', 'event.html'].includes(page)) {
  const allowed = /^(index|search|company|following|notifications|event|review)\.html(?:\?|$)/;
  const fallback = page === 'company.html' ? 'index.html' : 'company.html';
  const from = params.get('from'); const target = from && allowed.test(from) ? from : fallback;
  const names = { 'index.html': '首页', 'search.html': '搜索结果', 'company.html': '公司总览', 'following.html': '我的关注', 'notifications.html': '变化通知', 'event.html': '事件详情', 'review.html': '原型评审' };
  const a = document.createElement('a'); a.className = 'backlink'; a.href = target; a.textContent = '← 返回' + (names[target.split('?')[0]] || '首页'); root.querySelector('main').prepend(a);
 }
 document.querySelectorAll('a[href]').forEach(a => {
  const href = a.getAttribute('href');
  if (!/^(company|event)\.html(?:\?|$)/.test(href) || a.classList.contains('backlink')) return;
  const url = new URL(href, location.href); url.searchParams.set('from', page + location.search); a.setAttribute('href', url.pathname.split('/').pop() + url.search);
 });
}
function render() {
 if (page === 'index.html') home();
 else if (page === 'search.html') results();
 else if (page === 'company.html') company();
 else if (page === 'event.html') eventPage();
 else if (page === 'following.html') following();
 else if (page === 'notifications.html') notifications();
 else if (page === 'source.html') sourcePage();
 else reviewPage();
}
render();
