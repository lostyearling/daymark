/* Daymark uses a replaceable API adapter so OAuth or a server proxy can be added later. */
(function () {
  'use strict';
  const STORAGE_KEY = 'daymark.github.config';
  const state = { tasks: [], view: 'all', filter: 'upcoming', loading: false };
  const $ = (selector) => document.querySelector(selector);
  const today = () => new Date().toISOString().slice(0, 10);
  const config = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } };
  const saveConfig = (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
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
    update(number, stateValue) { return this.request(`/${number}`, { method: 'PATCH', body: JSON.stringify({ state: stateValue }) }); }
  };
  const formatDate = (date) => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T00:00:00`));
  const dateFromIssue = (issue) => (issue.labels || []).map((label) => label.name).find((name) => /^date:\d{4}-\d{2}-\d{2}$/.test(name))?.slice(5) || issue.created_at.slice(0, 10);
  const escape = (value) => String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3600); }
  function setLoading(value) { state.loading = value; $('#refreshButton').classList.toggle('spin', value); }
  function render() {
    const now = today(); const all = state.tasks; const todayTasks = all.filter((task) => task.date === now);
    const visible = (state.view === 'today' ? todayTasks : all).filter((task) => state.filter === 'done' ? task.closed : state.filter === 'overdue' ? !task.closed && task.date < now : !task.closed && task.date >= now);
    $('#allCount').textContent = all.filter((task) => !task.closed).length; $('#todayCount').textContent = todayTasks.filter((task) => !task.closed).length;
    const done = todayTasks.filter((task) => task.closed).length; const percent = todayTasks.length ? Math.round(done / todayTasks.length * 100) : 0;
    $('#progressDone').textContent = done; $('#progressTotal').textContent = todayTasks.length; $('#progressPercent').textContent = `${percent}%`; $('.progress-ring').style.setProperty('--progress', `${percent}%`); $('#progressMessage').textContent = percent === 100 ? '今天的清单，漂亮地完成了。' : percent ? '保持这个节奏，继续前进。' : '从一件小事开始。';
    $('#listTitle').textContent = state.view === 'today' ? '今日打卡' : '你的任务'; $('#emptyState').hidden = visible.length !== 0;
    const groups = visible.reduce((result, task) => { (result[task.date] ||= []).push(task); return result; }, {});
    $('#taskList').innerHTML = Object.keys(groups).sort().map((date) => `<div class="date-group"><strong>${date === now ? '今天' : date < now ? '已过期' : formatDate(date)}</strong>${date}</div>${groups[date].map(taskTemplate).join('')}`).join('');
    $('#taskList').querySelectorAll('.task-check').forEach((checkbox) => checkbox.addEventListener('change', () => toggleTask(checkbox.dataset.number, checkbox.checked)));
    $('#taskList').querySelectorAll('.archive-button').forEach((button) => button.addEventListener('click', () => archiveTask(button.dataset.number)));
  }
  function taskTemplate(task) { return `<article class="task-item ${task.closed ? 'done' : ''} ${!task.closed && task.date < today() ? 'overdue' : ''}"><input class="task-check" type="checkbox" ${task.closed ? 'checked' : ''} data-number="${task.number}" aria-label="${task.closed ? '取消完成' : '标记完成'}：${escape(task.title)}"><div><div class="task-title">${escape(task.title)}</div>${task.body ? `<p class="task-body">${escape(task.body)}</p>` : ''}</div><div class="task-meta">${task.date}<a href="${escape(task.html_url)}" target="_blank" rel="noreferrer">Issue #${task.number} ↗</a>${!task.closed ? `<button class="archive-button" data-number="${task.number}" type="button">归档</button>` : ''}</div></article>`; }
  async function loadTasks() { if (!config().owner || !config().repo || !config().token) return; setLoading(true); try { state.tasks = (await api.list()).map((issue) => ({ ...issue, date: dateFromIssue(issue), closed: issue.state === 'closed' })); $('#syncStatus').classList.add('connected'); $('#syncStatus').innerHTML = '<i></i> 已连接'; $('#lastUpdated').textContent = `同步于 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`; render(); } catch (error) { $('#syncStatus').classList.remove('connected'); showToast(`${error.message}。请检查仓库信息和 Token 权限。`); } finally { setLoading(false); } }
  async function toggleTask(number, checked) { try { await api.update(number, checked ? 'closed' : 'open'); const task = state.tasks.find((item) => String(item.number) === String(number)); if (task) task.closed = checked; render(); showToast(checked ? '任务已完成' : '任务已重新打开'); } catch (error) { showToast(error.message); render(); } }
  async function archiveTask(number) { if (!confirm('GitHub 不支持真正删除 Issue。归档会将它关闭，并保留在仓库中。继续吗？')) return; await toggleTask(number, true); }
  function openSettings() { const c = config(); $('#ownerInput').value = c.owner || ''; $('#repoInput').value = c.repo || ''; $('#tokenInput').value = c.token || ''; $('#settingsModal').hidden = false; }
  $('#todayLabel').textContent = today().replaceAll('-', '.'); $('#heroDay').textContent = new Date().getDate(); $('#heroMonth').textContent = new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date()).toUpperCase(); $('#taskDate').value = today();
  $('#settingsButton').addEventListener('click', openSettings); $('#closeSettings').addEventListener('click', () => { $('#settingsModal').hidden = true; }); $('#settingsModal').addEventListener('click', (event) => { if (event.target.id === 'settingsModal') $('#settingsModal').hidden = true; });
  $('#settingsForm').addEventListener('submit', async (event) => { event.preventDefault(); saveConfig({ owner: $('#ownerInput').value.trim(), repo: $('#repoInput').value.trim(), token: $('#tokenInput').value.trim() }); $('#settingsModal').hidden = true; showToast('配置已保存，正在同步…'); await loadTasks(); });
  $('#clearSettings').addEventListener('click', () => { localStorage.removeItem(STORAGE_KEY); state.tasks = []; $('#settingsModal').hidden = true; $('#syncStatus').classList.remove('connected'); $('#syncStatus').innerHTML = '<i></i> 未连接'; render(); showToast('本地凭据已清除'); });
  $('#refreshButton').addEventListener('click', loadTasks); $('#taskForm').addEventListener('submit', async (event) => { event.preventDefault(); if (!config().token) return openSettings(); const button = event.target.querySelector('button'); button.disabled = true; try { await api.create($('#taskTitle').value.trim(), $('#taskBody').value.trim(), $('#taskDate').value); event.target.reset(); $('#taskDate').value = today(); showToast('任务已添加到 GitHub Issues'); await loadTasks(); } catch (error) { showToast(error.message); } finally { button.disabled = false; } });
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active')); tab.classList.add('active'); state.view = tab.dataset.view; render(); })); document.querySelectorAll('.filter-button').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.filter-button').forEach((item) => item.classList.remove('active')); button.classList.add('active'); state.filter = button.dataset.filter; render(); }));
  render(); if (config().token) loadTasks(); else setTimeout(openSettings, 250);
}());
