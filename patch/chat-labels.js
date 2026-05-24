/*
 * cursor_tags — патч Cursor: ярлыки для чатов через ПКМ.
 *
 * Архитектура (важно для будущих правок):
 *  - Подгружается из workbench.html как ES-module.
 *  - Конфиг ярлыков лежит в соседнем labels.js (его можно править).
 *  - Ярлык применённый к чату сохраняется в localStorage по ключу заголовка.
 *  - DOM Cursor'а на Solid: любое событие (hover, banner, focus) пересоздаёт
 *    строку чата целиком, поэтому наш бейдж/класс теряются. Мы их восстанавливаем:
 *      1) MutationObserver на body → при первой мутации в кадре runDecorateNow
 *         выполняется СИНХРОННО (не ждём дебаунса) — восстановление почти мгновенно.
 *      2) Защита от self-loop: флаг `suppressing` пока идут наши мутации
 *         (сбрасывается через rAF) + флаг `firedThisFrame` (не больше одного раза за кадр).
 *      3) applyBadge идемпотентен — DOM трогается только если реальное состояние
 *         отличается. Каждый слой независимо разрывает цикл.
 *  - contextmenu делегирован на document (capture=true) — listener никогда не теряется
 *    при ререндере, ПКМ работает мгновенно.
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

	if (window.__cursorChatLabelsCleanup) {
		try { window.__cursorChatLabelsCleanup(); } catch (e) { /* ignore */ }
	}

	const styleEl = document.createElement('style');
	styleEl.id = 'cursor-chat-labels-style';
	styleEl.textContent = CSS;
	document.head.appendChild(styleEl);

	const STORAGE_KEY = 'cursor-chat-labels-v1';

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
		if (titleEl && titleEl.textContent) {
			// Текст может содержать наш бейдж как первый child — берём только trailing text.
			let txt = '';
			for (const node of titleEl.childNodes) {
				if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('cl-badge')) continue;
				txt += node.textContent || '';
			}
			return txt.trim() || titleEl.textContent.trim();
		}
		return null;
	}

	// Идемпотентно: трогает DOM только при реальных отличиях.
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

	function decorateAll() {
		const labels = loadStoredLabels();
		const rows = findAll(document, SELECTORS.row);
		for (const row of rows) applyBadge(row, labels);
		return rows.length;
	}

	// ---- Цикло-безопасный планировщик ----------------------------------------
	let suppressing = false;
	let inDecorate = false;
	let observerDisabled = false;
	let firedThisFrame = false;

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
			// Сбрасываем suppressing через rAF: все наши мутации к этому моменту
			// уже придут в observer (он async) и будут проигнорированы.
			requestAnimationFrame(() => { suppressing = false; });
		}
	}

	let observerErrors = 0;
	const observer = new MutationObserver(() => {
		if (suppressing || observerDisabled || firedThisFrame) return;
		firedThisFrame = true;
		// Сбрасываем флаг ровно на следующем кадре. Это даёт не больше одного
		// runDecorateNow за кадр (если Cursor мутирует часто), но первый — синхронный.
		requestAnimationFrame(() => { firedThisFrame = false; });
		try {
			runDecorateNow();
		} catch (err) {
			observerErrors++;
			console.warn('[chat-labels] observer err', err);
			if (observerErrors > 10) {
				console.error('[chat-labels] too many errors, disabling observer');
				observer.disconnect();
				observerDisabled = true;
			}
		}
	});

	// ---- Меню ----------------------------------------------------------------
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
				menu.remove();
				// Применяем мгновенно + ещё раз после rAF, на случай если закрытие меню
				// вызовет ререндер row (потеря hover/focus).
				runDecorateNow();
				requestAnimationFrame(runDecorateNow);
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

	// Делегированный contextmenu listener — не теряется при ререндере строк.
	const contextMenuHandler = (ev) => {
		const target = ev.target;
		if (!(target instanceof Element)) return;
		const row = target.closest('li.ui-sidebar-menu-item');
		if (!row) return;
		if (!row.querySelector('.glass-sidebar-agent-menu-btn')) return; // разделитель
		ev.preventDefault();
		ev.stopPropagation();
		ev.stopImmediatePropagation();
		showMenu(row, ev.clientX, ev.clientY);
	};
	document.addEventListener('contextmenu', contextMenuHandler, true);

	// ---- Загрузка конфига labels.js (с cache-bust для hot-reload) -----------
	const CONFIG_BASE_URL = new URL('./labels.js', import.meta.url).href;

	async function loadConfig({ bust = false } = {}) {
		const url = bust ? `${CONFIG_BASE_URL}?t=${Date.now()}` : CONFIG_BASE_URL;
		try {
			const mod = await import(url);
			const loaded = mod.labels || mod.default;
			if (Array.isArray(loaded) && loaded.length > 0) {
				userLabels = loaded.filter(l => l && l.id && l.id !== 'none');
				LABELS = [NONE_LABEL, ...userLabels];
				console.log('[chat-labels] config loaded:', userLabels.length, 'labels');
				return true;
			}
			console.warn('[chat-labels] labels.js exports пустой / некорректный, используются дефолты');
		} catch (err) {
			console.warn('[chat-labels] labels.js не загрузился, используются дефолты', err);
		}
		return false;
	}

	(async () => {
		await loadConfig();
		observer.observe(document.body, { childList: true, subtree: true });
		runDecorateNow();
		const initialCount = findAll(document, SELECTORS.row).length;
		console.log('%c[chat-labels v4] booted', 'color: #27ae60; font-weight: bold', { rowsDecorated: initialCount, labels: userLabels.length });
	})();

	// Hot-reload конфига без перезапуска Cursor: вызови в DevTools после правки labels.js.
	window.__cursorChatLabelsReloadConfig = async function() {
		const ok = await loadConfig({ bust: true });
		// Удалить ВСЕ существующие бейджи и cl-has-label, чтобы applyBadge
		// пересоздал их с новыми icon/color из обновлённого конфига.
		document.querySelectorAll('.cl-badge').forEach(el => el.remove());
		document.querySelectorAll('.cl-has-label').forEach(el => {
			el.classList.remove('cl-has-label');
			el.style.removeProperty('--cl-color');
		});
		runDecorateNow();
		return ok ? 'config reloaded' : 'config not loaded — using defaults';
	};

	window.__cursorChatLabelsCleanup = function() {
		observerDisabled = true;
		observer.disconnect();
		document.removeEventListener('contextmenu', contextMenuHandler, true);
		document.querySelectorAll('.cl-badge, .cl-menu, #cursor-chat-labels-style').forEach(el => el.remove());
		document.querySelectorAll('.cl-has-label').forEach(el => {
			el.classList.remove('cl-has-label');
			el.style.removeProperty('--cl-color');
		});
		delete window.__cursorChatLabelsCleanup;
		console.log('[chat-labels] cleaned up');
	};

	window.__cursorChatLabelsDebug = function() {
		console.group('[chat-labels] debug');
		console.log('Rows found:', findAll(document, SELECTORS.row).length);
		console.log('Container found:', !!findFirst(document, SELECTORS.listContainer));
		console.log('Stored labels:', loadStoredLabels());
		console.log('Active label set:', LABELS);
		console.log('Suppressing:', suppressing, '| FiredThisFrame:', firedThisFrame, '| Disabled:', observerDisabled);
		console.log('Observer errors:', observerErrors);
		console.groupEnd();
	};
})();
