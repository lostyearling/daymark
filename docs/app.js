/* Daymark uses a replaceable API adapter so OAuth or a server proxy can be added later. */
(function () {
  'use strict';
  const STORAGE_KEY = 'daymark.github.config';
  const state = { tasks: [], month: new Date(), selected: null };
  const $ = (selector) => document.querySelector(selector);
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dateStr(new Date());
  const config = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } };
  const saveConfig = (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  const getDailyDone = (date) => { try { const store = JSON.parse(localStorage.getItem('daymark.daily') || '{}'); return store[date] || {}; } catch { return {}; } };
  const setDailyDone = (date, number, done) => { let store = {}; try { store = JSON.parse(localStorage.getItem('daymark.daily') || '{}'); } catch {} store[date] = store[date] || {}; store[date][number] = !!done; localStorage.setItem('daymark.daily', JSON.stringify(store)); };
  const api = {
    headers() { const c = config(); return { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(c.token ? { Authorization: `token ${c.token}` } : {}) }; },
    base() { const c = config(); return `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/issues`; },
    async request(path = '', options = {}) {
      const response = await fetch(`${this.base()}${path}`, { ...options, headers: { ...this.headers(), ...(options.headers || {}) } });
      if (!response.ok) { let message = `请求失败（${response.status}）`; try { const data = await response.json(); message = data.message || message; } catch {} throw new Error(message); }
      return response.status === 204 ? null : response.json();
    },
    async list() { const items = []; for (let page = 1; page <= 5; page += 1) { const batch = await this.request(`?state=all&per_page=100&page=${page}`); items.push(...batch.filter((item) => !item.pull_request)); if (batch.length < 100) break; } return items; },
    create(title, body, date) { return this.request('', { method: 'POST', body: JSON.stringify({ title, body, labels: [`date:${date}`] }) }); },
    update(number, stateValue) { return this.request(`/${number}`, { method: 'PATCH', body: JSON.stringify({ state: stateValue }) }); },
    async remove(number) {
      const task = state.tasks.find((item) => String(item.number) === String(number));
      if (!task || !task.node_id) throw new Error('缺少节点信息');
      const response = await fetch('https://api.github.com/graphql', { method: 'POST', headers: { ...this.headers() }, body: JSON.stringify({ query: 'mutation($id: ID!){ deleteIssue(input:{issueId:$id}){ clientMutationId } }', variables: { id: task.node_id } }) });
      const data = await response.json();
      if (data.errors) throw new Error(data.errors.map((e) => e.message).join('；'));
    }
  };
  const formatDate = (d) => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(d);
  const formatFull = (ds) => { const d = new Date(`${ds}T00:00:00`); return d.getFullYear() === new Date().getFullYear() ? formatDate(d) : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(d); };
  const dateFromIssue = (issue) => (issue.labels || []).map((label) => label.name).find((name) => /^date:\d{4}-\d{2}-\d{2}$/.test(name))?.slice(5) || issue.created_at.slice(0, 10);
  const escape = (value) => String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3600); }
  function taskTemplate(task) { return `<article class="task-item ${task.closed ? 'done' : ''}"><input class="task-check" type="checkbox" ${task.closed ? 'checked' : ''} data-number="${task.number}" aria-label="${task.closed ? '取消完成' : '标记完成'}：${escape(task.title)}"><div><div class="task-title">${escape(task.title)}</div>${task.body ? `<p class="task-body">${escape(task.body)}</p>` : ''}</div><div class="task-meta"><a href="${escape(task.html_url)}" target="_blank" rel="noreferrer">#${task.number} ↗</a>${!task.closed ? `<button class="archive-button" data-number="${task.number}" type="button">归档</button>` : ''}<button class="delete-button" data-number="${task.number}" type="button">删除</button></div></article>`; }
  function bindTasks() { $('#dayList').querySelectorAll('.task-check').forEach((box) => box.addEventListener('change', () => toggleTask(box.dataset.number, box.checked))); $('#dayList').querySelectorAll('.archive-button').forEach((button) => button.addEventListener('click', () => archiveTask(button.dataset.number))); $('#dayList').querySelectorAll('.delete-button').forEach((button) => button.addEventListener('click', () => deleteTask(button.dataset.number))); }
  function bindDaily() { $('#dailySection').querySelectorAll('.daily-check').forEach((box) => box.addEventListener('change', () => { setDailyDone(state.selected, box.dataset.number, box.checked); renderDay(); showToast(box.checked ? '已完成每日任务' : '已取消每日任务'); })); $('#dailySection').querySelectorAll('.delete-button').forEach((button) => button.addEventListener('click', () => deleteTask(button.dataset.number))); }
  function renderCalendar() {
    const year = state.month.getFullYear(); const month = state.month.getMonth();
    $('#monthTitle').textContent = `${year}年${month + 1}月`;
    const now = new Date(); $('#backToday').hidden = !(year === now.getFullYear() && month === now.getMonth());
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const counts = {};
    state.tasks.forEach((task) => { if (task.date) counts[task.date] = (counts[task.date] || 0) + 1; });
    let html = '';
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(year, month, 1 - offset + i); const ds = dateStr(d);
      html += `<button class="day${d.getMonth() !== month ? ' other' : ''}${ds === today() ? ' today' : ''}" data-date="${ds}" type="button"><span class="day-num">${d.getDate()}</span>${counts[ds] ? `<span class="day-count">${counts[ds]}</span>` : ''}</button>`;
    }
    $('#calendarGrid').innerHTML = html;
    $('#calendarGrid').querySelectorAll('.day').forEach((button) => button.addEventListener('click', () => openDay(button.dataset.date)));
  }
  function openDay(date) { state.selected = date; $('#dayView').hidden = false; $('#calendarView').hidden = true; renderDay(); }
  function backToCalendar() { state.selected = null; $('#calendarView').hidden = false; $('#dayView').hidden = true; renderCalendar(); }
  function renderDay() {
    const ds = state.selected;
    const daily = state.tasks.filter((task) => task.daily && !task.closed).sort((a, b) => a.number - b.number);
    const dated = state.tasks.filter((task) => !task.daily && task.date === ds).sort((a, b) => (a.closed === b.closed ? 0 : a.closed ? 1 : -1));
    const dailyDone = getDailyDone(ds);
    $('#dayTitle').textContent = formatFull(ds);
    const done = daily.filter((task) => dailyDone[task.number]).length + dated.filter((task) => task.closed).length;
    const total = daily.length + dated.length;
    $('#dayProgress').textContent = total ? `${done}/${total} 已完成` : '';
    $('#dailySection').innerHTML = daily.length ? `<div class="daily-section"><h2 class="section-title">每日任务</h2><div class="daily-list">${daily.map((task) => `<div class="daily-item${dailyDone[task.number] ? ' done' : ''}"><label class="daily-box"><input class="daily-check" type="checkbox" ${dailyDone[task.number] ? 'checked' : ''} data-number="${task.number}" aria-label="标记完成：${escape(task.title)}"><span>${escape(task.title)}</span></label><button class="delete-button" data-number="${task.number}" type="button">删除</button></div>`).join('')}</div></div>` : '';
    $('#datedHead').hidden = dated.length === 0;
    $('#emptyState').hidden = dated.length !== 0;
    $('#dayList').innerHTML = dated.map(taskTemplate).join('');
    bindDaily();
    bindTasks();
  }
  async function loadTasks() {
    if (!config().owner || !config().repo || !config().token) return;
    try {
      state.tasks = (await api.list()).map((issue) => { const daily = (issue.labels || []).some((label) => label.name === 'daily'); return { ...issue, daily, date: daily ? null : (dateFromIssue(issue) || issue.created_at.slice(0, 10)), closed: issue.state === 'closed' }; });
      $('#syncStatus').classList.add('connected'); $('#syncStatus').innerHTML = '<i></i> 已连接';
      state.selected ? renderDay() : renderCalendar();
    } catch (error) { $('#syncStatus').classList.remove('connected'); showToast(`${error.message}。请检查仓库信息和 Token 权限。`); }
  }
  async function toggleTask(number, checked) { try { await api.update(number, checked ? 'closed' : 'open'); const task = state.tasks.find((item) => String(item.number) === String(number)); if (task) task.closed = checked; renderDay(); } catch (error) { showToast(error.message); renderDay(); } }
  async function archiveTask(number) { if (!confirm('归档会关闭该 Issue（GitHub 不提供真正删除）。继续吗？')) return; await toggleTask(number, true); }
  async function deleteTask(number) {
    if (!confirm('确认删除这个任务吗？操作不可恢复。')) return;
    try { await api.remove(number); state.tasks = state.tasks.filter((item) => String(item.number) !== String(number)); renderDay(); showToast('已删除'); }
    catch (error) { showToast(`无法删除（${error.message}），已改为归档`); await toggleTask(number, true); }
  }
  function openSettings() { const c = config(); $('#ownerInput').value = c.owner || ''; $('#repoInput').value = c.repo || ''; $('#tokenInput').value = c.token || ''; $('#settingsModal').hidden = false; }
  $('#settingsButton').addEventListener('click', openSettings);
  $('#refreshButton').addEventListener('click', () => location.reload());
  $('#closeSettings').addEventListener('click', () => { $('#settingsModal').hidden = true; });
  $('#settingsModal').addEventListener('click', (event) => { if (event.target.id === 'settingsModal') $('#settingsModal').hidden = true; });
  $('#settingsForm').addEventListener('submit', async (event) => { event.preventDefault(); saveConfig({ owner: $('#ownerInput').value.trim(), repo: $('#repoInput').value.trim(), token: $('#tokenInput').value.trim() }); $('#settingsModal').hidden = true; showToast('已保存，正在同步…'); await loadTasks(); });
  $('#clearSettings').addEventListener('click', () => { localStorage.removeItem(STORAGE_KEY); state.tasks = []; $('#settingsModal').hidden = true; $('#syncStatus').classList.remove('connected'); $('#syncStatus').innerHTML = '<i></i> 未连接'; renderCalendar(); showToast('已清除'); });
  $('#taskForm').addEventListener('submit', async (event) => { event.preventDefault(); if (!config().token) return openSettings(); const button = event.target.querySelector('button'); button.disabled = true; try { await api.create($('#taskTitle').value.trim(), $('#taskBody').value.trim(), state.selected); event.target.reset(); showToast('已添加'); await loadTasks(); } catch (error) { showToast(error.message); } finally { button.disabled = false; } });
  $('#prevMonth').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); });
  $('#nextMonth').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); });
  $('#backToday').addEventListener('click', () => { state.month = new Date(); renderCalendar(); });
  $('#backButton').addEventListener('click', backToCalendar);
  renderCalendar();
  if (config().token) loadTasks(); else setTimeout(openSettings, 250);
}());