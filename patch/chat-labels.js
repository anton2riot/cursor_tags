/*
 * cursor_tags — патч Cursor: ярлыки + замена pin-кнопки + раздел Tagged.
 *
 * Архитектура:
 *  - Подгружается из workbench.html как ES-module.
 *  - Конфиг ярлыков лежит в соседнем labels.js. Hot-reload в DevTools:
 *      __cursorChatLabelsReloadConfig()
 *  - Cursor пересоздаёт DOM строк чата на hover/focus/banner. Восстановление:
 *      1) MutationObserver на body, первая мутация в кадре → синхронный runDecorateNow.
 *      2) Защита от self-loop: `suppressing` + `firedThisFrame` + идемпотентный applyBadge.
 *  - contextmenu делегирован на document (capture=true).
 *  - Pin-slot: если найдена кнопка pin (defensive heuristic), наш бейдж занимает её место,
 *    оригинальная кнопка скрыта (display:none). Pin/unpin доступны через ПКМ-меню — мы
 *    программно кликаем по скрытой кнопке Cursor'а.
 *  - Раздел Tagged: <li class="cl-tagged-section"> вставляется как первый child .ui-sidebar-menu.
 *    Содержит клоны имён чатов с ярлыком. Click клона → click оригинального btn чата.
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
.cl-badge-pin { width: 16px; height: 16px; cursor: default; }

.cl-menu { position: fixed; z-index: 999999; min-width: 200px; background: var(--vscode-menu-background, #2d2d2d); color: var(--vscode-menu-foreground, #f0f0f0); border: 1px solid var(--vscode-menu-border, rgba(255,255,255,0.1)); border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); padding: 4px 0; font-size: 12px; font-family: var(--vscode-font-family, -apple-system, sans-serif); user-select: none; }
.cl-menu-header { padding: 4px 12px 6px; font-size: 11px; text-transform: uppercase; opacity: 0.6; border-bottom: 1px solid var(--vscode-menu-separatorBackground, rgba(255,255,255,0.05)); margin-bottom: 4px; }
.cl-menu-item { display: flex; align-items: center; padding: 5px 12px; cursor: pointer; gap: 8px; }
.cl-menu-item:hover { background: var(--vscode-menu-selectionBackground, #094771); color: var(--vscode-menu-selectionForeground, #ffffff); }
.cl-menu-item.cl-menu-disabled { opacity: 0.4; cursor: not-allowed; }
.cl-menu-item.cl-menu-disabled:hover { background: transparent; color: inherit; }
.cl-menu-sep { height: 1px; background: var(--vscode-menu-separatorBackground, rgba(255,255,255,0.08)); margin: 4px 0; }
.cl-menu-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.cl-menu-dot-none { border: 1px solid currentColor; background: transparent !important; }
.cl-menu-icon { width: 14px; text-align: center; flex-shrink: 0; }

/* Tagged section */
.cl-tagged-section { list-style: none; padding: 0; margin: 0 0 4px 0; }
.cl-tagged-header { padding: 4px 8px 4px 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; opacity: 0.55; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
.cl-tagged-header:hover { opacity: 0.85; }
.cl-tagged-caret { display: inline-block; transition: transform 0.12s; font-size: 9px; opacity: 0.7; }
.cl-tagged-section.cl-collapsed .cl-tagged-caret { transform: rotate(-90deg); }
.cl-tagged-section.cl-collapsed .cl-tagged-list { display: none; }
.cl-tagged-count { margin-left: auto; opacity: 0.6; font-weight: 400; }
.cl-tagged-list { list-style: none; padding: 0; margin: 0; }
.cl-tagged-item { display: flex; align-items: center; gap: 6px; padding: 4px 12px; cursor: pointer; font-size: 12px; border-radius: 4px; margin: 0 4px; min-width: 0; }
.cl-tagged-item:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.06)); }
.cl-tagged-item.cl-active-chat { background: var(--vscode-list-activeSelectionBackground, rgba(80,120,200,0.25)); }
.cl-tagged-item .cl-badge { width: 14px; }
.cl-tagged-item-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cl-tagged-empty { padding: 4px 12px; font-size: 11px; opacity: 0.5; font-style: italic; }
`;

	if (window.__cursorChatLabelsCleanup) {
		try { window.__cursorChatLabelsCleanup(); } catch (e) { /* ignore */ }
	}

	const styleEl = document.createElement('style');
	styleEl.id = 'cursor-chat-labels-style';
	styleEl.textContent = CSS;
	document.head.appendChild(styleEl);

	const STORAGE_KEY = 'cursor-chat-labels-v1';
	const COLLAPSED_KEY = 'cursor-chat-labels-tagged-collapsed';

	const DEFAULT_LABELS = [
		{ id: 'important', title: 'ВАЖНО',     color: '#ffb02e', icon: '⚠️' },
		{ id: 'check',     title: 'ПРОВЕРИТЬ', color: '#e34234', icon: '❓' },
		{ id: 'todo',      title: 'TODO',      color: '#9b59b6', icon: '🔜' }
	];
	const NONE_LABEL = { id: 'none', title: 'Без ярлыка', color: 'transparent', icon: '' };

	let userLabels = DEFAULT_LABELS;
	let LABELS = [NONE_LABEL, ...userLabels];

	const SELECTORS = {
		listContainer: ['.glass-sidebar-agent-list-container', 'ul.ui-sidebar-menu'],
		menu:          ['ul.ui-sidebar-menu', '.glass-sidebar-agent-list-container ul'],
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
		if (titleEl) {
			let txt = '';
			for (const node of titleEl.childNodes) {
				if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('cl-badge')) continue;
				txt += node.textContent || '';
			}
			return txt.trim() || titleEl.textContent.trim();
		}
		return null;
	}

	// Defensive поиск pin/dot-кнопки в строке чата.
	// Если у тебя точный селектор — допиши его в начало списка.
	function findPinButton(row) {
		const explicit = [
			'.glass-sidebar-agent-pin-btn',
			'.glass-sidebar-agent-pin',
			'.glass-sidebar-agent-status-btn',
			'.ui-sidebar-menu-button-pin'
		];
		for (const sel of explicit) {
			const el = row.querySelector(sel);
			if (el && el.dataset.clBadgeSlot !== '1') return el;
		}
		// fallback: любой button/элемент с pin в class/aria/title
		const candidates = row.querySelectorAll('button, [role="button"]');
		for (const el of candidates) {
			const cls = ((el.className || '') + '').toLowerCase();
			const aria = (el.getAttribute('aria-label') || '').toLowerCase();
			const title = (el.getAttribute('title') || '').toLowerCase();
			if (cls.includes('pin') || aria.includes('pin') || title.includes('pin')) {
				if (el.dataset.clBadgeSlot === '1') continue;
				return el;
			}
		}
		return null;
	}

	function isRowPinned(row) {
		const pinBtn = findPinButton(row);
		if (!pinBtn) return false;
		const aria = (pinBtn.getAttribute('aria-label') || '').toLowerCase();
		const title = (pinBtn.getAttribute('title') || '').toLowerCase();
		const cls = ((pinBtn.className || '') + '').toLowerCase();
		return aria.includes('unpin') || title.includes('unpin') ||
		       cls.includes('pinned') || pinBtn.getAttribute('aria-pressed') === 'true';
	}

	function togglePinForRow(row) {
		const pinBtn = findPinButton(row);
		if (!pinBtn) {
			console.warn('[chat-labels] pin button not found in row');
			return false;
		}
		// Если мы его скрыли — на момент click() display не важен (click() работает).
		pinBtn.click();
		return true;
	}

	// Идемпотентный apply.
	function applyBadge(row, labels) {
		const key = getChatKey(row);
		if (!key) return;
		const btn = findFirst(row, SELECTORS.rowButton) || row;
		const labelEl = findFirst(row, SELECTORS.rowTitle);
		const pinBtn = findPinButton(row);

		const labelId = labels[key];
		const label = LABELS.find(l => l.id === labelId);
		const hasLabel = label && label.id !== 'none';

		if (!hasLabel) {
			// Удалить наш бейдж (из обоих возможных мест)
			row.querySelectorAll('.cl-badge').forEach(el => el.remove());
			if (btn.classList.contains('cl-has-label')) btn.classList.remove('cl-has-label');
			if (btn.style.getPropertyValue('--cl-color')) btn.style.removeProperty('--cl-color');
			// Вернуть видимость скрытой Cursor'овской pin-кнопки, если мы её прятали
			if (pinBtn && pinBtn.dataset.clBadgeSlot === '1') {
				pinBtn.style.display = '';
				delete pinBtn.dataset.clBadgeSlot;
			}
			return;
		}

		if (!btn.classList.contains('cl-has-label')) btn.classList.add('cl-has-label');
		if (btn.style.getPropertyValue('--cl-color') !== label.color) {
			btn.style.setProperty('--cl-color', label.color);
		}

		// Pin-slot путь: если pin-кнопка найдена — наш бейдж в её место, оригинал прячем.
		if (pinBtn) {
			if (pinBtn.style.display !== 'none') pinBtn.style.display = 'none';
			pinBtn.dataset.clBadgeSlot = '1';

			// Уберём бейдж из label-слота, если он там оказался от прошлой версии.
			if (labelEl) {
				const inLabel = labelEl.querySelector(':scope > .cl-badge');
				if (inLabel && inLabel.parentElement === labelEl) inLabel.remove();
			}

			const parent = pinBtn.parentElement;
			let badge = parent.querySelector(':scope > .cl-badge-pin');
			if (!badge) {
				badge = document.createElement('span');
				badge.className = 'cl-badge cl-badge-pin';
				parent.insertBefore(badge, pinBtn.nextSibling);
			}
			if (badge.textContent !== label.icon) badge.textContent = label.icon;
			if (badge.title !== label.title) badge.title = label.title;
			return;
		}

		// Fallback: pin-кнопку не нашли — бейдж в начало label.
		if (!labelEl) return;
		const existing = labelEl.querySelector(':scope > .cl-badge') || row.querySelector('.cl-badge');
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

	// ---- Tagged section ------------------------------------------------------
	function isTaggedCollapsed() {
		return localStorage.getItem(COLLAPSED_KEY) === '1';
	}
	function setTaggedCollapsed(v) {
		localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0');
	}

	function ensureTaggedSection(menuEl) {
		let section = menuEl.querySelector(':scope > .cl-tagged-section');
		if (section) return section;
		section = document.createElement('li');
		section.className = 'cl-tagged-section';
		if (isTaggedCollapsed()) section.classList.add('cl-collapsed');
		const header = document.createElement('div');
		header.className = 'cl-tagged-header';
		const caret = document.createElement('span');
		caret.className = 'cl-tagged-caret';
		caret.textContent = '▼';
		const headerText = document.createElement('span');
		headerText.textContent = 'TAGGED';
		const count = document.createElement('span');
		count.className = 'cl-tagged-count';
		header.appendChild(caret);
		header.appendChild(headerText);
		header.appendChild(count);
		header.addEventListener('click', (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			const wasCollapsed = section.classList.contains('cl-collapsed');
			section.classList.toggle('cl-collapsed');
			setTaggedCollapsed(!wasCollapsed);
		});
		const list = document.createElement('ul');
		list.className = 'cl-tagged-list';
		section.appendChild(header);
		section.appendChild(list);
		menuEl.insertBefore(section, menuEl.firstChild);
		return section;
	}

	function updateTaggedSection() {
		const menuEl = findFirst(document, SELECTORS.menu);
		if (!menuEl) return;
		const section = ensureTaggedSection(menuEl);
		const list = section.querySelector(':scope > .cl-tagged-list');
		const countEl = section.querySelector(':scope > .cl-tagged-header > .cl-tagged-count');

		const labels = loadStoredLabels();
		const allRows = findAll(document, SELECTORS.row).filter(r => !r.closest('.cl-tagged-section'));

		// Собираем чаты с ярлыками
		const tagged = [];
		for (const row of allRows) {
			const key = getChatKey(row);
			if (!key) continue;
			const labelId = labels[key];
			if (!labelId || labelId === 'none') continue;
			const label = LABELS.find(l => l.id === labelId);
			if (!label) continue;
			tagged.push({ row, key, label });
		}

		// Идемпотентное обновление списка через data-key
		const wantedKeys = new Set(tagged.map(t => t.key));
		const existingItems = new Map();
		list.querySelectorAll(':scope > .cl-tagged-item').forEach(item => {
			const k = item.dataset.clKey;
			if (k && wantedKeys.has(k)) existingItems.set(k, item);
			else item.remove();
		});

		// Обновить/создать
		for (let i = 0; i < tagged.length; i++) {
			const { row, key, label } = tagged[i];
			let item = existingItems.get(key);
			if (!item) {
				item = document.createElement('li');
				item.className = 'cl-tagged-item';
				item.dataset.clKey = key;
				const badge = document.createElement('span');
				badge.className = 'cl-badge';
				item.appendChild(badge);
				const text = document.createElement('span');
				text.className = 'cl-tagged-item-text';
				item.appendChild(text);
				item.addEventListener('click', (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					const orig = item.__clOriginalRow;
					if (!orig || !orig.isConnected) {
						// Найти заново по ключу
						for (const r of findAll(document, SELECTORS.row)) {
							if (r.closest('.cl-tagged-section')) continue;
							if (getChatKey(r) === item.dataset.clKey) {
								const b = findFirst(r, SELECTORS.rowButton);
								if (b) b.click();
								return;
							}
						}
						return;
					}
					const b = findFirst(orig, SELECTORS.rowButton);
					if (b) b.click();
				});
				list.appendChild(item);
			}
			item.__clOriginalRow = row;
			const badge = item.querySelector(':scope > .cl-badge');
			if (badge.textContent !== label.icon) badge.textContent = label.icon;
			badge.title = label.title;
			const text = item.querySelector(':scope > .cl-tagged-item-text');
			if (text.textContent !== key) text.textContent = key;
		}

		// Восстановим порядок (сортируем по id ярлыка, потом по имени)
		const sorted = [...tagged].sort((a, b) => {
			const ai = LABELS.findIndex(l => l.id === a.label.id);
			const bi = LABELS.findIndex(l => l.id === b.label.id);
			if (ai !== bi) return ai - bi;
			return a.key.localeCompare(b.key);
		});
		for (const t of sorted) {
			const item = list.querySelector(`:scope > .cl-tagged-item[data-cl-key="${CSS.escape(t.key)}"]`);
			if (item) list.appendChild(item);
		}

		// Count в заголовке
		const newCount = tagged.length > 0 ? String(tagged.length) : '';
		if (countEl.textContent !== newCount) countEl.textContent = newCount;

		// Скрыть секцию, если пусто
		const shouldHide = tagged.length === 0;
		const isHidden = section.style.display === 'none';
		if (shouldHide && !isHidden) section.style.display = 'none';
		if (!shouldHide && isHidden) section.style.display = '';
	}

	function decorateAll() {
		const labels = loadStoredLabels();
		// фильтруем наши клоны из Tagged-раздела, чтобы не декорировать самих себя
		const rows = findAll(document, SELECTORS.row).filter(r => !r.closest('.cl-tagged-section'));
		for (const row of rows) applyBadge(row, labels);
		updateTaggedSection();
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
			requestAnimationFrame(() => { suppressing = false; });
		}
	}

	let observerErrors = 0;
	const observer = new MutationObserver(() => {
		if (suppressing || observerDisabled || firedThisFrame) return;
		firedThisFrame = true;
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
		header.textContent = (key.length > 30 ? key.slice(0, 30) + '…' : key);
		menu.appendChild(header);

		// Pin/unpin item
		const pinBtn = findPinButton(row);
		const pinItem = document.createElement('div');
		pinItem.className = 'cl-menu-item';
		if (!pinBtn) pinItem.classList.add('cl-menu-disabled');
		const pinIcon = document.createElement('span');
		pinIcon.className = 'cl-menu-icon';
		pinIcon.textContent = '📌';
		pinItem.appendChild(pinIcon);
		const pinText = document.createElement('span');
		pinText.textContent = isRowPinned(row) ? 'Открепить' : 'Закрепить';
		pinItem.appendChild(pinText);
		if (pinBtn) {
			pinItem.addEventListener('click', () => {
				togglePinForRow(row);
				menu.remove();
				runDecorateNow();
				requestAnimationFrame(runDecorateNow);
			});
		}
		menu.appendChild(pinItem);

		const sep = document.createElement('div');
		sep.className = 'cl-menu-sep';
		menu.appendChild(sep);

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

	const contextMenuHandler = (ev) => {
		const target = ev.target;
		if (!(target instanceof Element)) return;
		const row = target.closest('li.ui-sidebar-menu-item');
		if (!row) return;
		if (row.closest('.cl-tagged-section')) return; // ПКМ на клонах из Tagged — игнорируем
		if (!row.querySelector('.glass-sidebar-agent-menu-btn')) return;
		ev.preventDefault();
		ev.stopPropagation();
		ev.stopImmediatePropagation();
		showMenu(row, ev.clientX, ev.clientY);
	};
	document.addEventListener('contextmenu', contextMenuHandler, true);

	// ---- Загрузка конфига ----------------------------------------------------
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
		console.log('%c[chat-labels v5] booted', 'color: #27ae60; font-weight: bold', { rowsDecorated: initialCount, labels: userLabels.length });
	})();

	// ---- Public helpers ------------------------------------------------------
	window.__cursorChatLabelsReloadConfig = async function() {
		const ok = await loadConfig({ bust: true });
		document.querySelectorAll('.cl-badge').forEach(el => el.remove());
		document.querySelectorAll('.cl-has-label').forEach(el => {
			el.classList.remove('cl-has-label');
			el.style.removeProperty('--cl-color');
		});
		document.querySelectorAll('[data-cl-badge-slot="1"]').forEach(el => {
			el.style.display = '';
			delete el.dataset.clBadgeSlot;
		});
		runDecorateNow();
		return ok ? 'config reloaded' : 'config not loaded — using defaults';
	};

	window.__cursorChatLabelsCleanup = function() {
		observerDisabled = true;
		observer.disconnect();
		document.removeEventListener('contextmenu', contextMenuHandler, true);
		document.querySelectorAll('.cl-badge, .cl-menu, .cl-tagged-section, #cursor-chat-labels-style').forEach(el => el.remove());
		document.querySelectorAll('.cl-has-label').forEach(el => {
			el.classList.remove('cl-has-label');
			el.style.removeProperty('--cl-color');
		});
		document.querySelectorAll('[data-cl-badge-slot="1"]').forEach(el => {
			el.style.display = '';
			delete el.dataset.clBadgeSlot;
		});
		delete window.__cursorChatLabelsCleanup;
		console.log('[chat-labels] cleaned up');
	};

	window.__cursorChatLabelsDebug = function() {
		console.group('[chat-labels] debug');
		console.log('Rows found:', findAll(document, SELECTORS.row).length);
		console.log('Menu container:', findFirst(document, SELECTORS.menu));
		console.log('Stored labels:', loadStoredLabels());
		console.log('Active label set:', LABELS);
		console.log('Suppressing:', suppressing, '| FiredThisFrame:', firedThisFrame, '| Disabled:', observerDisabled);
		console.log('Observer errors:', observerErrors);
		console.groupEnd();
	};

	// Diagnostics: запусти в DevTools и пришли вывод, если что-то не работает.
	window.__cursorChatLabelsInspect = function() {
		const lines = [];
		const log = (s) => lines.push(s);
		log('=== chat-labels inspect ===');

		const rows = document.querySelectorAll('li.ui-sidebar-menu-item');
		log(`Total rows: ${rows.length}`);
		log('');

		if (rows.length > 0) {
			const row = rows[0];
			log('--- ROW [0] outerHTML (truncated 3000) ---');
			log(row.outerHTML.slice(0, 3000));
			log('');
			log('--- ROW [0] element tree (depth + tag.classes) ---');
			function walk(el, depth) {
				const cls = ((el.className || '') + '').trim().split(/\s+/).filter(c => c).join('.');
				const aria = el.getAttribute && el.getAttribute('aria-label');
				const title = el.getAttribute && el.getAttribute('title');
				const role = el.getAttribute && el.getAttribute('role');
				const txt = (el.children.length === 0 && el.textContent) ? `"${el.textContent.trim().slice(0, 30)}"` : '';
				let summary = `${'  '.repeat(depth)}${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
				if (aria) summary += ` aria="${aria}"`;
				if (title) summary += ` title="${title}"`;
				if (role) summary += ` role="${role}"`;
				if (txt) summary += ` ${txt}`;
				log(summary);
				for (const c of el.children) walk(c, depth + 1);
			}
			walk(row, 0);
			log('');
			log('--- Pin button candidate ---');
			const pin = findPinButton(row);
			log(pin ? `Found: ${pin.tagName.toLowerCase()}.${pin.className} aria="${pin.getAttribute('aria-label') || ''}"` : 'NOT FOUND');
		}

		log('');
		log('--- Sidebar section headings (looking for "Pinned" / "Workspaces") ---');
		document.querySelectorAll('h1, h2, h3, h4, h5, [role="heading"], [class*="header" i]').forEach(h => {
			const txt = (h.textContent || '').trim();
			if (!txt || txt.length > 80) return;
			const cls = ((h.className || '') + '').trim().split(/\s+/).filter(c => c).slice(0, 5).join('.');
			log(`  "${txt}" — ${h.tagName.toLowerCase()}${cls ? '.' + cls : ''}`);
		});

		log('');
		log('--- Containers near rows (parents up to 3 levels) ---');
		if (rows.length > 0) {
			let p = rows[0].parentElement;
			let depth = 0;
			while (p && depth < 4) {
				const cls = ((p.className || '') + '').trim().split(/\s+/).filter(c => c).slice(0, 4).join('.');
				log(`  [${depth}] ${p.tagName.toLowerCase()}${cls ? '.' + cls : ''}`);
				p = p.parentElement;
				depth++;
			}
		}

		log('');
		log('--- Elements with "pin" in class/aria/title (whole document) ---');
		document.querySelectorAll('*').forEach(el => {
			const cls = ((el.className || '') + '').toLowerCase();
			const aria = ((el.getAttribute && el.getAttribute('aria-label')) || '').toLowerCase();
			const title = ((el.getAttribute && el.getAttribute('title')) || '').toLowerCase();
			if (/(^|\W)pin(\W|$)/.test(cls) || aria.includes('pin') || title.includes('pin')) {
				const c = ((el.className || '') + '').trim().split(/\s+/).filter(x => x).slice(0, 4).join('.');
				log(`  ${el.tagName.toLowerCase()}.${c} aria="${aria}" title="${title}"`);
			}
		});

		const out = lines.join('\n');
		console.log(out);
		try {
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(out);
				console.log('%c[chat-labels] inspect output copied to clipboard', 'color: #27ae60');
			}
		} catch (e) { /* ignore */ }
		return out;
	};
})();
