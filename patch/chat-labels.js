/*
 * cursor_tags — патч Cursor: ярлыки для чатов через ПКМ.
 *
 * Архитектура (важно для будущих правок):
 *  - Подгружается из workbench.html как ES-module.
 *  - Конфиг ярлыков лежит в соседнем labels.js (его можно править).
 *  - Ярлык применённый к чату сохраняется в localStorage по ключу заголовка.
 *  - DOM обновляется через MutationObserver с защитой от self-loop:
 *      1) флаг `suppressing` пока идут наши мутации (сбрасывается через rAF);
 *      2) дебаунс scheduleDecorate (мин. интервал 100ms);
 *      3) applyBadge / setFilter идемпотентны — DOM трогается только если
 *         реальное состояние отличается. Каждый слой независимо разрывает
 *         цикл self-trigger'а observer'а.
 */
(function() {
	'use strict';

	const CSS = `
.cl-has-label .ui-sidebar-menu-button-label { display: inline-flex !important; align-items: center; gap: 6px; min-width: 0; }
.cl-has-label .ui-sidebar-menu-button-label > .cl-badge { flex-shrink: 0; }
.cl-has-label .ui-sidebar-menu-button-label > *:not(.cl-badge) { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.cl-has-label { box-shadow: inset 3px 0 0 0 var(--cl-color, transparent); border-radius: 4px; }
.cl-has-label .ui-sidebar-menu-button-label { color: var(--cl-color, inherit) !important; font-weight: 500; }
.cl-badge { display: inline-flex; align-items: center; justify-content: center; font-size: 12px; line-height: 1; vertical-align: middle; flex-shrink: 0; }
.cl-menu { position: fixed; z-index: 999999; min-width: 180px; background: var(--vscode-menu-background, #2d2d2d); color: var(--vscode-menu-foreground, #f0f0f0); border: 1px solid var(--vscode-menu-border, rgba(255,255,255,0.1)); border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); padding: 4px 0; font-size: 12px; font-family: var(--vscode-font-family, -apple-system, sans-serif); user-select: none; }
.cl-menu-header { padding: 4px 12px 6px; font-size: 11px; text-transform: uppercase; opacity: 0.6; border-bottom: 1px solid var(--vscode-menu-separatorBackground, rgba(255,255,255,0.05)); margin-bottom: 4px; }
.cl-menu-item { display: flex; align-items: center; padding: 5px 12px; cursor: pointer; gap: 8px; }
.cl-menu-item:hover { background: var(--vscode-menu-selectionBackground, #094771); color: var(--vscode-menu-selectionForeground, #ffffff); }
.cl-menu-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.cl-menu-dot-none { border: 1px solid currentColor; background: transparent !important; }
.cl-menu-icon { width: 14px; text-align: center; flex-shrink: 0; }
`;

	// Re-run protection
	if (window.__cursorChatLabelsCleanup) {
		try { window.__cursorChatLabelsCleanup(); } catch (e) { /* ignore */ }
	}

	const styleEl = document.createElement('style');
	styleEl.id = 'cursor-chat-labels-style';
	styleEl.textContent = CSS;
	document.head.appendChild(styleEl);

	const STORAGE_KEY = 'cursor-chat-labels-v1';
	const MIN_DECORATE_INTERVAL_MS = 100;

	// Fallback на случай если labels.js не загрузился.
	const DEFAULT_LABELS = [
		{ id: 'important', title: 'ВАЖНО',     color: '#e34234', icon: '🔴' },
		{ id: 'check',     title: 'ПРОВЕРИТЬ', color: '#9b59b6', icon: '🔍' },
		{ id: 'todo',      title: 'TODO',      color: '#3498db', icon: '📌' }
	];
	const NONE_LABEL = { id: 'none', title: 'Без ярлыка', color: 'transparent', icon: '' };

	let userLabels = DEFAULT_LABELS;
	let LABELS = [NONE_LABEL, ...userLabels];

	const SELECTORS = {
		listContainer: ['.glass-sidebar-agent-list-container', 'ul.ui-sidebar-menu'],
		row:           ['li.ui-sidebar-menu-item'],
		rowButton:     ['.glass-sidebar-agent-menu-btn'],
		rowContent:    ['.ui-sidebar-menu-button-content'],
		rowTitle:      ['.ui-sidebar-menu-button-label']
	};

	function loadStoredLabels() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return {};
			const parsed = JSON.parse(raw);
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch (err) { return {}; }
	}

	function saveStoredLabels(map) {
		try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); }
		catch (err) { console.warn('[chat-labels] save failed', err); }
	}

	function findFirst(root, list) {
		for (const sel of list) { const el = root.querySelector(sel); if (el) return el; }
		return null;
	}

	function findAll(root, list) {
		const all = [];
		for (const sel of list) root.querySelectorAll(sel).forEach(el => all.push(el));
		return Array.from(new Set(all));
	}

	function getChatKey(row) {
		const dataKeys = ['data-id', 'data-chat-id', 'data-agent-id'];
		for (const k of dataKeys) {
			const v = row.getAttribute(k);
			if (v) return v;
		}
		const titleEl = findFirst(row, SELECTORS.rowTitle);
		if (titleEl && titleEl.textContent) return titleEl.textContent.trim();
		return null;
	}

	// Идемпотентно: трогает DOM только при реальных отличиях. Защищает от
	// self-loop, даже если флаг suppressing случайно пропустит мутацию.
	function applyBadge(row, labels) {
		const key = getChatKey(row);
		if (!key) return;
		const btn = findFirst(row, SELECTORS.rowButton) || row;
		const labelEl = findFirst(row, SELECTORS.rowTitle);
		if (!labelEl) return;

		const existing = labelEl.querySelector(':scope > .cl-badge') || row.querySelector('.cl-badge');
		const labelId = labels[key];
		const label = LABELS.find(l => l.id === labelId);

		if (!label || label.id === 'none') {
			if (existing) existing.remove();
			if (btn.classList.contains('cl-has-label')) btn.classList.remove('cl-has-label');
			if (btn.style.getPropertyValue('--cl-color')) btn.style.removeProperty('--cl-color');
			return;
		}

		if (!btn.classList.contains('cl-has-label')) btn.classList.add('cl-has-label');
		if (btn.style.getPropertyValue('--cl-color') !== label.color) {
			btn.style.setProperty('--cl-color', label.color);
		}

		if (existing) {
			// Если бейдж не в правильном родителе — переместить, а не дублировать.
			if (existing.parentElement !== labelEl) {
				labelEl.insertBefore(existing, labelEl.firstChild);
			}
			if (existing.textContent !== label.icon) existing.textContent = label.icon;
			if (existing.title !== label.title) existing.title = label.title;
			return;
		}
		const badge = document.createElement('span');
		badge.className = 'cl-badge';
		badge.textContent = label.icon;
		badge.title = label.title;
		labelEl.insertBefore(badge, labelEl.firstChild);
	}

	function showMenu(row, x, y) {
		document.querySelectorAll('.cl-menu').forEach(m => m.remove());
		const key = getChatKey(row);
		if (!key) return;
		const menu = document.createElement('div');
		menu.className = 'cl-menu';
		menu.style.left = x + 'px';
		menu.style.top = y + 'px';
		const header = document.createElement('div');
		header.className = 'cl-menu-header';
		header.textContent = 'Set label · ' + (key.length > 30 ? key.slice(0, 30) + '…' : key);
		menu.appendChild(header);
		for (const label of LABELS) {
			const item = document.createElement('div');
			item.className = 'cl-menu-item';
			const dot = document.createElement('span');
			dot.className = 'cl-menu-dot';
			dot.style.background = label.color;
			if (label.id === 'none') dot.classList.add('cl-menu-dot-none');
			item.appendChild(dot);
			const icon = document.createElement('span');
			icon.className = 'cl-menu-icon';
			icon.textContent = label.icon || ' ';
			item.appendChild(icon);
			const text = document.createElement('span');
			text.textContent = label.title;
			item.appendChild(text);
			item.addEventListener('click', () => {
				const current = loadStoredLabels();
				if (label.id === 'none') delete current[key];
				else current[key] = label.id;
				saveStoredLabels(current);
				runDecorateNow();
				menu.remove();
			});
			menu.appendChild(item);
		}
		document.body.appendChild(menu);
		const closeOnce = (ev) => {
			if (!menu.contains(ev.target)) {
				menu.remove();
				document.removeEventListener('mousedown', closeOnce, true);
				document.removeEventListener('keydown', escListener, true);
			}
		};
		const escListener = (ev) => {
			if (ev.key === 'Escape') {
				menu.remove();
				document.removeEventListener('mousedown', closeOnce, true);
				document.removeEventListener('keydown', escListener, true);
			}
		};
		setTimeout(() => {
			document.addEventListener('mousedown', closeOnce, true);
			document.addEventListener('keydown', escListener, true);
		}, 0);
	}

	function bindRow(row) {
		if (row.dataset.clBound === '1') return;
		const btn = findFirst(row, SELECTORS.rowButton);
		if (!btn) return;
		row.dataset.clBound = '1';
		const handler = (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			showMenu(row, ev.clientX, ev.clientY);
		};
		row.addEventListener('contextmenu', handler, true);
		btn.addEventListener('contextmenu', handler, true);
	}

	function decorateAll() {
		const labels = loadStoredLabels();
		const rows = findAll(document, SELECTORS.row);
		for (const row of rows) { bindRow(row); applyBadge(row, labels); }
		return rows.length;
	}

	// ---- Цикло-безопасный планировщик ----------------------------------------
	let suppressing = false;
	let scheduled = false;
	let inDecorate = false;
	let lastDecorate = 0;
	let observerDisabled = false;

	function runDecorateNow() {
		if (inDecorate) return;
		inDecorate = true;
		suppressing = true;
		try {
			decorateAll();
		} catch (err) {
			console.warn('[chat-labels] decorate err', err);
		} finally {
			inDecorate = false;
			lastDecorate = performance.now();
			requestAnimationFrame(() => { suppressing = false; });
		}
	}

	function scheduleDecorate() {
		if (scheduled || suppressing || observerDisabled) return;
		scheduled = true;
		const elapsed = performance.now() - lastDecorate;
		const wait = Math.max(0, MIN_DECORATE_INTERVAL_MS - elapsed);
		setTimeout(() => {
			scheduled = false;
			if (observerDisabled) return;
			requestAnimationFrame(runDecorateNow);
		}, wait);
	}

	let observerErrors = 0;
	const observer = new MutationObserver(() => {
		if (suppressing || observerDisabled) return;
		try {
			scheduleDecorate();
		} catch (err) {
			observerErrors++;
			console.warn('[chat-labels] observer err', err);
			if (observerErrors > 5) {
				console.error('[chat-labels] too many errors, disabling observer');
				observer.disconnect();
				observerDisabled = true;
			}
		}
	});

	// ---- Загрузка конфига labels.js и запуск ---------------------------------
	(async () => {
		try {
			const configUrl = new URL('./labels.js', import.meta.url).href;
			const mod = await import(configUrl);
			const loaded = mod.labels || mod.default;
			if (Array.isArray(loaded) && loaded.length > 0) {
				userLabels = loaded.filter(l => l && l.id && l.id !== 'none');
				LABELS = [NONE_LABEL, ...userLabels];
				console.log('[chat-labels] config loaded from labels.js', userLabels.length, 'labels');
			} else {
				console.warn('[chat-labels] labels.js exports пустой / некорректный, используются дефолты');
			}
		} catch (err) {
			console.warn('[chat-labels] labels.js не загрузился, используются дефолты', err);
		}

		observer.observe(document.body, { childList: true, subtree: true });
		runDecorateNow();
		const initialCount = findAll(document, SELECTORS.row).length;
		console.log('%c[chat-labels v3] booted', 'color: #27ae60; font-weight: bold', { rowsDecorated: initialCount, labels: userLabels.length });
	})();

	window.__cursorChatLabelsCleanup = function() {
		observerDisabled = true;
		observer.disconnect();
		document.querySelectorAll('.cl-badge, .cl-menu, #cursor-chat-labels-style').forEach(el => el.remove());
		document.querySelectorAll('.cl-has-label').forEach(el => {
			el.classList.remove('cl-has-label');
			el.style.removeProperty('--cl-color');
		});
		document.querySelectorAll('[data-cl-bound="1"]').forEach(el => delete el.dataset.clBound);
		delete window.__cursorChatLabelsCleanup;
		console.log('[chat-labels] cleaned up');
	};

	window.__cursorChatLabelsDebug = function() {
		console.group('[chat-labels] debug');
		console.log('Rows found:', findAll(document, SELECTORS.row).length);
		console.log('Container found:', !!findFirst(document, SELECTORS.listContainer));
		console.log('Stored labels:', loadStoredLabels());
		console.log('Active label set:', LABELS);
		console.log('Suppressing:', suppressing, '| Scheduled:', scheduled, '| Disabled:', observerDisabled);
		console.log('Last decorate (ms ago):', Math.round(performance.now() - lastDecorate));
		console.log('Observer errors:', observerErrors);
		console.groupEnd();
	};
})();
