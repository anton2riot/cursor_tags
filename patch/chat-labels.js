/*
 * cursor_tags — патч Cursor: ярлыки + замена pin-слота + раздел Tagged.
 *
 * Точная разметка Cursor 3.5.x (определена через __cursorChatLabelsInspect):
 *   li.ui-sidebar-menu-item
 *     div.ui-button.ui-sidebar-menu-button.glass-sidebar-agent-menu-btn[role="button"]
 *       div.ui-sidebar-menu-button-icon-wrapper          ← слот для точки/пина
 *         span.ui-sidebar-menu-button-status-icon         ← точка (.agent-status-dot)
 *         span.ui-sidebar-menu-button-pin-button          ← обёртка pin-кнопки
 *           button.ui-icon-button[aria-label="Pin"|"Unpin"]
 *       div.ui-sidebar-menu-button-content
 *         span.ui-sidebar-menu-button-label "Имя чата"
 *       div.ui-sidebar-menu-button-end
 *
 * Группы Pinned/Workspaces — это div.ui-sidebar-group с
 * span.ui-sidebar-label-row-title.ui-sidebar-group-label-title в хедере.
 */
(function() {
	'use strict';

	const CSS = `
/* Прячем нативную точку и pin-кнопку только когда показываем СВОЙ бейдж.
   Когда чат "думает" — у Cursor свой spinner/анимация в status-icon, мы
   её НЕ скрываем (оставляем нативную), и cl-hide-status НЕ ставится. */
.cl-hide-status .ui-sidebar-menu-button-status-icon,
.cl-hide-status .ui-sidebar-menu-button-pin-button { display: none !important; }

/* Наш бейдж в слоте иконки */
.cl-badge { display: inline-flex; align-items: center; justify-content: center; font-size: 12px; line-height: 1; flex-shrink: 0; }
.cl-badge-pin { width: 14px; height: 14px; }

/* Левая цветная полоска через ::before pseudo-element.
   Раньше использовался box-shadow, но Cursor на focus/contextmenu выставляет
   свой box-shadow inline (inline побеждает stylesheet !important), и полоска
   пропадала. Pseudo-element не конфликтует с box-shadow вообще. */
.cl-has-label { position: relative; }
.cl-has-label::before {
	content: '';
	position: absolute;
	left: 0;
	top: 2px;
	bottom: 2px;
	width: 3px;
	background: var(--cl-color, transparent);
	border-radius: 2px;
	pointer-events: none;
	z-index: 1;
}

/* Контекстное меню */
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

/* Unread-индикация: раньше Cursor показывал точку (синюю/серую), но мы её
   скрываем — переносим состояние на цвет label. */
.cl-status-unseen .ui-sidebar-menu-button-label { color: #2371a8 !important; }

/* Имена воркспейсов (Home / am_miroai / aquascapes / …) — жирным. У них
   ui-sidebar-label-row-title без ui-sidebar-group-label-title (последний
   только у заголовков групп Pinned/Workspaces/Tagged). */
.ui-sidebar-label-row-title:not(.ui-sidebar-group-label-title) { font-weight: 600 !important; }

/* Tagged group — клонированный header из Pinned даёт нам typography бесплатно. */
.cl-tagged-header { cursor: pointer; user-select: none; }
/* Когда наша группа свёрнута, поворачиваем chevron нативного header'а */
.cl-tagged-group.cl-collapsed [class*="chevron"],
.cl-tagged-group.cl-collapsed [class*="caret"],
.cl-tagged-group.cl-collapsed .codicon-chevron-down { transform: rotate(-90deg); transition: transform 0.12s; }
.cl-tagged-group.cl-collapsed > .ui-sidebar-group-content { display: none; }
.cl-tagged-count { margin-left: 6px; opacity: 0.55; font-size: 11px; font-weight: 400; }
.cl-tagged-count:empty { display: none; }
.cl-tagged-item.cl-active-chat .glass-sidebar-agent-menu-btn { background: var(--vscode-list-activeSelectionBackground, rgba(80,120,200,0.25)) !important; }

/* Cost item в контекстном меню — не закрывает меню на клик, можно ткнуть для refresh */
.cl-cost-item { cursor: default; }
.cl-cost-item.cl-cost-clickable { cursor: pointer; }
.cl-cost-text-secondary { opacity: 0.55; font-size: 11px; margin-left: 4px; }
.cl-cost-error { color: var(--vscode-errorForeground, #f48771); }
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
	const COST_CACHE_KEY = 'cursor-chat-labels-cost-cache-v1';
	const COST_AUTH_KEY = 'cursor-chat-labels-cost-auth-v1';
	const COST_RUNTIME_COMPOSERS_KEY = 'cursor-chat-labels-runtime-composers-v1';
	const COST_CACHE_TTL_MS = 10 * 60 * 1000;
	const COST_RECENT_CLICK_TTL_MS = 30000;
	const COST_API_URL = 'https://api2.cursor.sh/aiserver.v1.DashboardService/GetFilteredUsageEvents';

	const DEFAULT_LABELS = [
		{ id: 'important', title: 'ВАЖНО',     color: '#ffb02e', icon: '⚠️' },
		{ id: 'check',     title: 'ПРОВЕРИТЬ', color: '#e34234', icon: '❓' },
		{ id: 'todo',      title: 'TODO',      color: '#9b59b6', icon: '🔜' }
	];
	const NONE_LABEL = { id: 'none', title: 'Без ярлыка', color: 'transparent', icon: '' };

	let userLabels = DEFAULT_LABELS;
	let LABELS = [NONE_LABEL, ...userLabels];

	const SELECTORS = {
		row:           ['li.ui-sidebar-menu-item'],
		rowButton:     ['.glass-sidebar-agent-menu-btn'],
		rowContent:    ['.ui-sidebar-menu-button-content'],
		rowTitle:      ['.ui-sidebar-menu-button-label'],
		// слот, в который нативный Cursor рисует точку статуса / pin-кнопку:
		pinSlot:       ['.ui-sidebar-menu-button-icon-wrapper'],
		// сам button pin/unpin (его и кликаем для toggle):
		pinAction:     ['.ui-sidebar-menu-button-pin-button button'],
		// группы вида Pinned/Workspaces:
		groupRoot:     ['.ui-sidebar-group'],
		groupTitle:    ['.ui-sidebar-group-label-title', '.ui-sidebar-label-row-title'],
		groupContent:  ['.ui-sidebar-group-content']
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
		if (titleEl) return (titleEl.textContent || '').trim();
		return null;
	}

	function findPinSlot(row)   { return findFirst(row, SELECTORS.pinSlot); }
	function findPinAction(row) { return findFirst(row, SELECTORS.pinAction); }

	function isRowPinned(row) {
		const btn = findPinAction(row);
		if (!btn) return false;
		const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
		return aria.includes('unpin');
	}

	function togglePinForRow(row) {
		const btn = findPinAction(row);
		if (!btn) return false;
		// Cursor мог реагировать не на click, а на pointer/mouse-цепочку
		// (Solid/React handlers часто слушают pointerdown). И сама pin-button у
		// нас скрыта через CSS — это могло мешать обработчику. Сейчас:
		//  1. Временно показываем pin-button (через inline !important, чтобы
		//     перебить наш CSS hide).
		//  2. Палим всю цепочку pointer/mouse событий + click().
		//  3. На след. rAF возвращаем display обратно (наш CSS снова скроет
		//     элемент, но к этому моменту Cursor уже обработал событие).
		const wrap = btn.closest('.ui-sidebar-menu-button-pin-button');
		const oldDisplay = wrap ? wrap.style.getPropertyValue('display') : '';
		const oldPriority = wrap ? wrap.style.getPropertyPriority('display') : '';
		if (wrap) {
			wrap.style.setProperty('display', 'flex', 'important');
			void wrap.offsetWidth;
		}
		const rect = btn.getBoundingClientRect();
		const opts = {
			bubbles: true, cancelable: true,
			clientX: rect.left + rect.width / 2,
			clientY: rect.top + rect.height / 2,
			button: 0
		};
		try {
			btn.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse' }));
			btn.dispatchEvent(new MouseEvent('mousedown', opts));
			btn.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse' }));
			btn.dispatchEvent(new MouseEvent('mouseup', opts));
			btn.dispatchEvent(new MouseEvent('click', opts));
			btn.click();
		} catch (err) {
			console.warn('[chat-labels] pin dispatch failed', err);
		}
		if (wrap) {
			requestAnimationFrame(() => requestAnimationFrame(() => {
				if (oldDisplay) wrap.style.setProperty('display', oldDisplay, oldPriority);
				else wrap.style.removeProperty('display');
			}));
		}
		return true;
	}

	function isRowActive(row) {
		if (!row) return false;
		if (row.getAttribute('aria-selected') === 'true' || row.getAttribute('aria-current') === 'true') return true;
		const cls = (row.className + '');
		if (/(?:^|\s)(?:active|selected|is-active|is-selected)(?:\s|$)/.test(cls)) return true;
		const btn = findFirst(row, SELECTORS.rowButton);
		if (btn) {
			if (btn.getAttribute('aria-selected') === 'true' || btn.getAttribute('aria-current') === 'true') return true;
			const bcls = (btn.className + '');
			if (/(?:^|\s)(?:active|selected|is-active|is-selected)(?:\s|$)/.test(bcls)) return true;
		}
		return false;
	}

	// Defensive: "думает" ли чат прямо сейчас. Маркеры в Cursor для thinking
	// точно не известны (через __cursorChatLabelsInspect видели только
	// agent-status-dot--done-seen и --done-unseen). Ловим всё, что похоже
	// на in-progress: модификаторы класса, aria-busy, spinner-элементы.
	const THINKING_RE = /think|progress|streaming|working|loading|busy|pending|running|generating|in-progress|in_progress/i;
	function isRowThinking(row) {
		const btn = findFirst(row, SELECTORS.rowButton);
		for (const el of [row, btn]) {
			if (!el) continue;
			if (el.getAttribute && el.getAttribute('aria-busy') === 'true') return true;
			if (THINKING_RE.test((el.className || '') + '')) return true;
		}
		const dot = row.querySelector('.agent-status-dot');
		if (dot) {
			const cls = (dot.className || '') + '';
			const aria = dot.getAttribute('aria-label') || '';
			if (THINKING_RE.test(cls) || THINKING_RE.test(aria)) return true;
		}
		const wrapper = findPinSlot(row);
		if (wrapper) {
			// Любой явный spinner/loader/анимация в слоте иконки = думает.
			if (wrapper.querySelector('[class*="spinner" i], [class*="loader" i], [class*="loading" i], [class*="working" i], [class*="thinking" i], [class*="progress" i], [class*="streaming" i]')) {
				return true;
			}
			// SVG с animate/animation атрибутом — тоже признак анимации (рендерим её "как есть").
			const svg = wrapper.querySelector('svg');
			if (svg && (svg.querySelector('animate, animateTransform') || /(?:^|\s)(?:cursor-spinner|animate-spin)(?:\s|$)/i.test((svg.className.baseVal || svg.className || '') + ''))) {
				return true;
			}
		}
		return false;
	}

	// Идемпотентный apply: наш бейдж в слоте иконки нативной точки.
	// Когда чат "думает" — наш бейдж убираем, нативную анимацию НЕ скрываем
	// (cl-hide-status снимаем), но cl-has-label оставляем — полоска видна.
	function applyBadge(row, labels) {
		const key = getChatKey(row);
		if (!key) return;
		const btn = findFirst(row, SELECTORS.rowButton) || row;
		const slot = findPinSlot(row);

		const labelId = labels[key];
		const label = LABELS.find(l => l.id === labelId);
		const hasLabel = label && label.id !== 'none';
		const thinking = hasLabel ? isRowThinking(row) : false;
		const showOurBadge = hasLabel && !thinking;

		if (!hasLabel) {
			row.querySelectorAll('.cl-badge').forEach(el => el.remove());
			if (btn.classList.contains('cl-has-label')) btn.classList.remove('cl-has-label');
			if (btn.classList.contains('cl-hide-status')) btn.classList.remove('cl-hide-status');
			if (btn.style.getPropertyValue('--cl-color')) btn.style.removeProperty('--cl-color');
			return;
		}

		// Полоска (cl-has-label) показывается всегда при наличии ярлыка — даже когда думает.
		if (!btn.classList.contains('cl-has-label')) btn.classList.add('cl-has-label');
		if (btn.style.getPropertyValue('--cl-color') !== label.color) {
			btn.style.setProperty('--cl-color', label.color);
		}

		// Скрытие нативной точки/пина — только когда показываем СВОЙ бейдж.
		const wantHide = showOurBadge;
		if (btn.classList.contains('cl-hide-status') !== wantHide) {
			btn.classList.toggle('cl-hide-status', wantHide);
		}

		// Бейдж в слоте — только если не думает. Иначе убираем, Cursor сам рисует анимацию.
		if (!showOurBadge) {
			row.querySelectorAll('.cl-badge').forEach(el => el.remove());
			return;
		}

		if (slot) {
			let badge = slot.querySelector(':scope > .cl-badge-pin');
			if (!badge) {
				badge = document.createElement('span');
				badge.className = 'cl-badge cl-badge-pin';
				slot.appendChild(badge);
			}
			if (badge.textContent !== label.icon) badge.textContent = label.icon;
			if (badge.title !== label.title) badge.title = label.title;
			const labelEl = findFirst(row, SELECTORS.rowTitle);
			if (labelEl) {
				const inLabel = labelEl.querySelector(':scope > .cl-badge:not(.cl-badge-pin)');
				if (inLabel) inLabel.remove();
			}
			return;
		}

		const labelEl = findFirst(row, SELECTORS.rowTitle);
		if (!labelEl) return;
		const existing = labelEl.querySelector(':scope > .cl-badge');
		if (existing) {
			if (existing.textContent !== label.icon) existing.textContent = label.icon;
			return;
		}
		const badge = document.createElement('span');
		badge.className = 'cl-badge';
		badge.textContent = label.icon;
		badge.title = label.title;
		labelEl.insertBefore(badge, labelEl.firstChild);
	}

	// ---- Tagged group --------------------------------------------------------
	function isTaggedCollapsed() { return localStorage.getItem(COLLAPSED_KEY) === '1'; }
	function setTaggedCollapsed(v) { localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0'); }

	function findPinnedGroup() {
		const titles = document.querySelectorAll('.ui-sidebar-group-label-title');
		for (const t of titles) {
			if ((t.textContent || '').trim().toLowerCase() === 'pinned') {
				return t.closest('.ui-sidebar-group');
			}
		}
		return null;
	}

	function findGroupsContainer() {
		// Любая существующая группа Pinned/Workspaces даёт нам контейнер.
		const anyGroup = document.querySelector('.ui-sidebar-group:not(.cl-tagged-group)');
		return anyGroup ? anyGroup.parentElement : null;
	}

	function buildHeaderFromPinned(pinned) {
		// Header — первый child Pinned-группы, который НЕ group-content.
		const headerSrc = Array.from(pinned.children).find(c => !c.classList.contains('ui-sidebar-group-content'));
		if (!headerSrc) return null;
		// cloneNode(true) копирует DOM, но не event listeners — Cursor сюда уже не подключится.
		const cloned = headerSrc.cloneNode(true);
		// Снимаем state-атрибуты Pinned (свёрнут/раскрыт, выбранный, действия).
		const stateAttrs = ['aria-expanded', 'aria-collapsed', 'aria-selected', 'aria-pressed', 'data-state', 'data-collapsed', 'data-expanded'];
		const purgeClasses = ['collapsed', 'expanded', 'is-collapsed', 'is-expanded', 'active', 'selected', 'is-active', 'is-selected'];
		const purgeNode = (el) => {
			if (!(el instanceof Element)) return;
			for (const a of stateAttrs) el.removeAttribute(a);
			for (const c of purgeClasses) el.classList.remove(c);
		};
		purgeNode(cloned);
		cloned.querySelectorAll('*').forEach(purgeNode);
		// Убираем action-кнопки Pinned (Add chat / Pin all / …) — они не относятся к Tagged
		// и могли бы случайно сработать через делегацию click на parent.
		cloned.querySelectorAll('button, [role="button"]').forEach(b => b.remove());
		// После удаления кнопок могут остаться пустые wrapper-divs (spacer / actions-area),
		// которые держат «лишние пробелы» перед нативным chevron'ом. Удаляем рекурсивно.
		const isKeeper = (el) => {
			const cls = ((el.className || '') + '').toLowerCase();
			if (/chevron|caret|codicon/.test(cls)) return true;
			if (cls.includes('group-label-title') || cls.includes('label-row-title')) return true;
			return false;
		};
		let removedAny = true;
		while (removedAny) {
			removedAny = false;
			for (const el of Array.from(cloned.querySelectorAll('*'))) {
				if (!el.isConnected) continue;
				if (isKeeper(el)) continue;
				if (el.children.length === 0 && (el.textContent || '').trim() === '') {
					el.remove();
					removedAny = true;
				}
			}
		}
		// Меняем текст "Pinned" → "Tagged"
		let titleReplaced = false;
		const allText = cloned.querySelectorAll('*');
		for (const el of allText) {
			if (el.children.length === 0 && el.textContent) {
				const t = el.textContent.trim();
				if (t.toLowerCase() === 'pinned') {
					el.textContent = 'Tagged';
					titleReplaced = true;
				}
			}
		}
		if (!titleReplaced) {
			// fallback: добавить наш title если в шаблоне не нашлось
			const span = document.createElement('span');
			span.className = 'ui-sidebar-label-row-title ui-sidebar-group-label-title';
			span.textContent = 'Tagged';
			cloned.insertBefore(span, cloned.firstChild);
		}
		return cloned;
	}

	function ensureTaggedGroup() {
		const container = findGroupsContainer();
		if (!container) return null;
		let group = container.querySelector(':scope > .cl-tagged-group');
		if (group) return group;

		group = document.createElement('div');
		group.className = 'ui-sidebar-group cl-tagged-group';
		if (isTaggedCollapsed()) group.classList.add('cl-collapsed');

		const pinned = findPinnedGroup();
		let header = pinned ? buildHeaderFromPinned(pinned) : null;
		if (!header) {
			// Fallback — собираем сами (старый путь)
			header = document.createElement('div');
			const title = document.createElement('span');
			title.className = 'ui-sidebar-label-row-title ui-sidebar-group-label-title';
			title.textContent = 'Tagged';
			header.appendChild(title);
		}
		header.classList.add('cl-tagged-header');

		// Счётчик ставим после текста, перед нативным chevron'ом (если он есть).
		const count = document.createElement('span');
		count.className = 'cl-tagged-count';
		const titleSpan = header.querySelector('.ui-sidebar-group-label-title, .ui-sidebar-label-row-title');
		if (titleSpan && titleSpan.parentElement) {
			titleSpan.parentElement.insertBefore(count, titleSpan.nextSibling);
		} else {
			header.appendChild(count);
		}

		header.addEventListener('click', (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			const wasCollapsed = group.classList.contains('cl-collapsed');
			group.classList.toggle('cl-collapsed');
			setTaggedCollapsed(!wasCollapsed);
		});

		const content = document.createElement('div');
		content.className = 'ui-sidebar-group-content';
		const list = document.createElement('ul');
		list.className = 'ui-sidebar-menu cl-tagged-list';
		content.appendChild(list);

		group.appendChild(header);
		group.appendChild(content);

		if (pinned && pinned.parentElement === container) {
			container.insertBefore(group, pinned.nextSibling);
		} else {
			container.insertBefore(group, container.firstChild);
		}
		return group;
	}

	function createTaggedItem(key, label) {
		const li = document.createElement('li');
		li.className = 'ui-sidebar-menu-item cl-tagged-item';
		li.dataset.clKey = key;

		const btn = document.createElement('div');
		btn.className = 'ui-button ui-sidebar-menu-button glass-sidebar-agent-menu-btn cl-tagged-btn';
		btn.setAttribute('role', 'button');
		btn.tabIndex = 0;
		btn.setAttribute('data-variant', 'ghost');
		btn.setAttribute('data-label-tone', 'default');

		const iconWrap = document.createElement('div');
		iconWrap.className = 'ui-sidebar-menu-button-icon-wrapper';
		const badge = document.createElement('span');
		badge.className = 'cl-badge cl-badge-pin';
		iconWrap.appendChild(badge);

		const content = document.createElement('div');
		content.className = 'ui-sidebar-menu-button-content';
		const labelEl = document.createElement('span');
		labelEl.className = 'ui-text ui-sidebar-menu-button-label';
		labelEl.setAttribute('data-variant', 'default');
		labelEl.setAttribute('data-size', 'md');
		labelEl.setAttribute('data-weight', 'regular');
		content.appendChild(labelEl);

		btn.appendChild(iconWrap);
		btn.appendChild(content);
		li.appendChild(btn);

		const clickHandler = (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			ev.stopImmediatePropagation();
			const orig = li.__clOriginalRow;
			const tryClick = (r) => {
				const b = findFirst(r, SELECTORS.rowButton);
				if (b) { b.click(); return true; }
				return false;
			};
			if (orig && orig.isConnected && tryClick(orig)) return;
			for (const r of findAll(document, SELECTORS.row)) {
				if (r.closest('.cl-tagged-group')) continue;
				if (getChatKey(r) === li.dataset.clKey) { tryClick(r); return; }
			}
		};
		btn.addEventListener('click', clickHandler, true);
		btn.addEventListener('mousedown', (ev) => { ev.stopPropagation(); }, true);

		return li;
	}

	function updateTaggedGroup() {
		const group = ensureTaggedGroup();
		if (!group) return;
		const list = group.querySelector('.cl-tagged-list');
		const countEl = group.querySelector('.cl-tagged-count');

		const labels = loadStoredLabels();
		const rows = findAll(document, SELECTORS.row).filter(r => !r.closest('.cl-tagged-group'));

		const tagged = [];
		for (const row of rows) {
			const key = getChatKey(row);
			if (!key) continue;
			const labelId = labels[key];
			if (!labelId || labelId === 'none') continue;
			const label = LABELS.find(l => l.id === labelId);
			if (!label) continue;
			tagged.push({ row, key, label });
		}
		tagged.sort((a, b) => {
			const ai = LABELS.findIndex(l => l.id === a.label.id);
			const bi = LABELS.findIndex(l => l.id === b.label.id);
			if (ai !== bi) return ai - bi;
			return a.key.localeCompare(b.key);
		});

		// Идемпотентное обновление
		const wantedKeys = new Set(tagged.map(t => t.key));
		const existing = new Map();
		list.querySelectorAll(':scope > .cl-tagged-item').forEach(item => {
			const k = item.dataset.clKey;
			if (k && wantedKeys.has(k)) existing.set(k, item);
			else item.remove();
		});
		for (const { row, key, label } of tagged) {
			let item = existing.get(key);
			if (!item) {
				item = createTaggedItem(key, label);
				list.appendChild(item);
			}
			item.__clOriginalRow = row;
			const badge = item.querySelector('.cl-badge');
			if (badge && badge.textContent !== label.icon) badge.textContent = label.icon;
			if (badge) badge.title = label.title;
			const labelEl = item.querySelector('.ui-sidebar-menu-button-label');
			if (labelEl && labelEl.textContent !== key) labelEl.textContent = key;

			// Цветная полоска и статус unread/seen — переносим с оригинала на клон.
			const cloneBtn = item.querySelector('.cl-tagged-btn');
			if (cloneBtn) {
				if (!cloneBtn.classList.contains('cl-has-label')) cloneBtn.classList.add('cl-has-label');
				if (cloneBtn.style.getPropertyValue('--cl-color') !== label.color) {
					cloneBtn.style.setProperty('--cl-color', label.color);
				}
				const status = getRowStatus(row);
				const wantSeen = status === 'seen';
				const wantUnseen = status === 'unseen';
				if (cloneBtn.classList.contains('cl-status-seen') !== wantSeen) cloneBtn.classList.toggle('cl-status-seen', wantSeen);
				if (cloneBtn.classList.contains('cl-status-unseen') !== wantUnseen) cloneBtn.classList.toggle('cl-status-unseen', wantUnseen);
				setLabelColor(cloneBtn.querySelector('.ui-sidebar-menu-button-label'), wantUnseen ? UNSEEN_COLOR : null);
			}

			const isActive = isRowActive(row);
			if (item.classList.contains('cl-active-chat') !== isActive) item.classList.toggle('cl-active-chat', isActive);
		}
		// порядок по sorted
		for (const t of tagged) {
			const item = list.querySelector(`:scope > .cl-tagged-item[data-cl-key="${CSS.escape(t.key)}"]`);
			if (item) list.appendChild(item);
		}

		const newCount = tagged.length > 0 ? String(tagged.length) : '';
		if (countEl && countEl.textContent !== newCount) countEl.textContent = newCount;
		const shouldHide = tagged.length === 0;
		const isHidden = group.style.display === 'none';
		if (shouldHide && !isHidden) group.style.display = 'none';
		if (!shouldHide && isHidden) group.style.display = '';
	}

	// Unread/seen статус — берём из нативного .agent-status-dot, переносим
	// на btn классом, CSS красит/жирнит label. Применяется ко всем чатам,
	// даже без ярлыка — индикация полезна сама по себе.
	function getRowStatus(row) {
		const dot = row.querySelector('.agent-status-dot');
		if (!dot) return null;
		const cls = (dot.className + '').toLowerCase();
		if (cls.includes('done-unseen') || cls.includes('--unseen')) return 'unseen';
		if (cls.includes('done-seen') || cls.includes('--seen')) return 'seen';
		return null;
	}

	const UNSEEN_COLOR = '#2371a8';

	// Применяет цвет label через inline-style !important — это побеждает любой
	// CSS-in-JS Cursor'а (stylesheet даже с !important проигрывает inline !important).
	// Идемпотентно: проверяем текущее значение/priority перед записью.
	function setLabelColor(labelEl, color) {
		if (!labelEl) return;
		const cur = labelEl.style.getPropertyValue('color');
		const prio = labelEl.style.getPropertyPriority('color');
		if (color) {
			if (cur !== color || prio !== 'important') {
				labelEl.style.setProperty('color', color, 'important');
			}
		} else if (cur) {
			labelEl.style.removeProperty('color');
		}
	}

	function applyStatus(row) {
		const btn = findFirst(row, SELECTORS.rowButton);
		if (!btn) return null;
		const labelEl = findFirst(row, SELECTORS.rowTitle);
		const state = getRowStatus(row);
		const wantSeen = state === 'seen';
		const wantUnseen = state === 'unseen';
		if (btn.classList.contains('cl-status-seen') !== wantSeen) btn.classList.toggle('cl-status-seen', wantSeen);
		if (btn.classList.contains('cl-status-unseen') !== wantUnseen) btn.classList.toggle('cl-status-unseen', wantUnseen);
		setLabelColor(labelEl, wantUnseen ? UNSEEN_COLOR : null);
		return state;
	}

	// Тег хранится по имени чата (стабильного id в DOM у строк нет — проверено
	// через __cursorChatLabelsInspect). При переименовании ключ протухает и тег
	// "теряется". Детектор ниже ловит переименование и переносит тег на новое имя.
	//
	// Как отличаем переименование от переключения чата / реюза DOM-узла:
	//  - WeakMap помнит последний заголовок КАЖДОГО узла-строки. Переключение
	//    активного чата НЕ меняет текст у существующих строк (меняется лишь класс
	//    активности), поэтому само по себе не триггерит детектор.
	//  - Срабатываем, только если у того же узла сменился собственный текст И
	//    старого имени больше нет ни на одной видимой строке (старое имя исчезло
	//    => это именно переименование, а не подмена содержимого узла при скролле).
	const _rowTitles = new WeakMap();
	function migrateRenamedChats(rows) {
		const currentTitles = new Set();
		for (const r of rows) { const k = getChatKey(r); if (k) currentTitles.add(k); }

		let stored = null, storedChanged = false;
		let rt = null, rtChanged = false;
		for (const row of rows) {
			const cur = getChatKey(row);
			const prev = _rowTitles.get(row);
			if (cur) _rowTitles.set(row, cur);
			if (prev === undefined || prev === cur || !cur) continue;
			if (currentTitles.has(prev)) continue; // старое имя ещё живо — не переименование

			if (!stored) stored = loadStoredLabels();
			if (stored[prev] != null && stored[cur] == null) {
				stored[cur] = stored[prev];
				delete stored[prev];
				storedChanged = true;
				console.log('[chat-labels] rename: тег перенесён', JSON.stringify(prev), '→', JSON.stringify(cur));
			}
			// live-capture composerId тоже переносим, чтобы cost-фича и резолв
			// продолжали находить чат по новому имени.
			if (!rt) rt = loadRuntimeComposers();
			if (rt[prev] && !rt[cur]) {
				rt[cur] = rt[prev];
				delete rt[prev];
				rtChanged = true;
			}
		}
		if (storedChanged) saveStoredLabels(stored);
		if (rtChanged) saveRuntimeComposers(rt);
		return storedChanged;
	}

	function decorateAll() {
		const rows = findAll(document, SELECTORS.row).filter(r => !r.closest('.cl-tagged-group'));
		migrateRenamedChats(rows);
		const labels = loadStoredLabels();
		for (const row of rows) {
			applyBadge(row, labels);
			applyStatus(row);
		}
		updateTaggedGroup();
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
		try { decorateAll(); }
		catch (err) { console.warn('[chat-labels] decorate err', err); }
		finally {
			inDecorate = false;
			requestAnimationFrame(() => { suppressing = false; });
		}
	}

	let observerErrors = 0;
	const observer = new MutationObserver(() => {
		if (suppressing || observerDisabled || firedThisFrame) return;
		firedThisFrame = true;
		requestAnimationFrame(() => { firedThisFrame = false; });
		try { runDecorateNow(); }
		catch (err) {
			observerErrors++;
			console.warn('[chat-labels] observer err', err);
			if (observerErrors > 10) { observer.disconnect(); observerDisabled = true; }
		}
	});

	// ---- Стоимость чата ------------------------------------------------------
	// composers.json генерируется install.ps1'ом из state.vscdb (composer.composerHeaders).
	// Карта: name -> [composer, ...] отсортировано по lastUpdatedAt desc, чтобы для
	// дублирующихся имён брать самый свежий чат (так чаще выберется тот, что
	// сейчас в сайдбаре).
	let composersByName = null;     // Map<string, Array<{composerId,name,lastUpdatedAt,createdAt}>>
	let composersSyncedAt = 0;
	let composersSeedTeamId = null; // teamId, вытащенный install'ом из state.vscdb

	async function loadComposers() {
		try {
			const url = new URL('./composers.js', import.meta.url).href;
			const mod = await import(url);
			const list = Array.isArray(mod.composers) ? mod.composers : [];
			const map = new Map();
			for (const c of list) {
				if (!c || !c.composerId) continue;
				const name = (c.name || '').trim();
				if (!name) continue;
				if (!map.has(name)) map.set(name, []);
				map.get(name).push(c);
			}
			for (const arr of map.values()) {
				arr.sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));
			}
			composersByName = map;
			composersSyncedAt = mod.syncedAt || 0;
			composersSeedTeamId = (typeof mod.teamId === 'number' && mod.teamId > 0) ? mod.teamId : null;
			// Если интерсептор ещё не успел поймать teamId — кладём из снапшота.
			// Это устраняет «нет teamId, открой Settings…» сразу после установки.
			if (composersSeedTeamId && !loadCostAuth().teamId) {
				saveCostAuth({ teamId: composersSeedTeamId });
			}
			console.log('[chat-labels] composers loaded:', list.length,
				'teamId:', composersSeedTeamId,
				'syncedAt:', composersSyncedAt ? new Date(composersSyncedAt).toLocaleString() : 'n/a');
		} catch (err) {
			composersByName = null;
			console.warn('[chat-labels] composers.js не загрузился — кост-фичу выключаем', err);
		}
	}

	// Runtime-captured composers: дополняем снапшот composers.js парами, которые
	// мы успели подслушать из живых запросов Cursor'а к api2.cursor.sh. Это нужно
	// для чатов, созданных уже после install.ps1 — для них в статическом снапшоте
	// записи нет, но как только пользователь кликнул на чат и Cursor сходил с
	// composerId в API, мы запоминаем title → composerId.
	function loadRuntimeComposers() {
		try {
			const raw = localStorage.getItem(COST_RUNTIME_COMPOSERS_KEY);
			return raw ? (JSON.parse(raw) || {}) : {};
		} catch { return {}; }
	}
	function saveRuntimeComposers(map) {
		try { localStorage.setItem(COST_RUNTIME_COMPOSERS_KEY, JSON.stringify(map)); }
		catch { /* ignore */ }
	}

	function findComposersForKey(key) {
		if (!key) return [];
		const out = [];
		const seen = new Set();
		const rt = loadRuntimeComposers();
		const rtEntry = rt[key];
		if (rtEntry && rtEntry.composerId) {
			out.push({
				composerId: rtEntry.composerId,
				name: key,
				lastUpdatedAt: rtEntry.capturedAt || 0,
				createdAt: 0,
				source: 'runtime'
			});
			seen.add(rtEntry.composerId);
		}
		if (composersByName) {
			for (const c of (composersByName.get(key) || [])) {
				if (seen.has(c.composerId)) continue;
				out.push({ ...c, source: 'static' });
				seen.add(c.composerId);
			}
		}
		return out;
	}

	// Click-tracker для live capture: помним последние клики по чатам в сайдбаре.
	// Когда fetch к api2.cursor.sh уходит с composerId/cloudAgentId в теле — пара
	// «свежий клик → composerId» сохраняется в runtime map.
	let recentClicks = []; // [{ title, at }]
	function rememberClickedTitle(title) {
		if (!title) return;
		const now = Date.now();
		recentClicks.push({ title, at: now });
		// Подрезаем устаревшее, плюс держим максимум 12 чтоб не разрастаться.
		recentClicks = recentClicks.filter(c => now - c.at < COST_RECENT_CLICK_TTL_MS).slice(-12);
	}
	function captureComposerFromFetch(composerId) {
		if (!composerId || typeof composerId !== 'string' || composerId.length < 30) return;
		const now = Date.now();
		// Берём самый свежий клик, который ещё не «вышел». Если в окне восемь
		// секунд было два клика, второй вероятнее — он перезапишет первый.
		let title = null;
		for (let i = recentClicks.length - 1; i >= 0; i--) {
			if (now - recentClicks[i].at < COST_RECENT_CLICK_TTL_MS) { title = recentClicks[i].title; break; }
		}
		// Fallback: новый чат через «New chat» (кнопка, не строка сайдбара) —
		// клика по строке нет, но активная строка сайдбара указывает на нужный чат.
		// Без этого composerId «новорождённых» чатов ловится только после рестарта,
		// когда юзер впервые тыкает их в сайдбаре.
		if (!title) {
			for (const r of findAll(document, SELECTORS.row)) {
				if (r.closest('.cl-tagged-group')) continue;
				if (isRowActive(r)) { title = getChatKey(r); break; }
			}
		}
		if (!title) return;
		const rt = loadRuntimeComposers();
		if (rt[title] && rt[title].composerId === composerId) return;
		rt[title] = { composerId, capturedAt: now };
		saveRuntimeComposers(rt);
		console.log('[chat-labels] live-captured composerId', composerId.slice(0, 8) + '…', '→', title);
	}

	const _clickTracker = (ev) => {
		const t = ev.target;
		if (!(t instanceof Element)) return;
		const row = t.closest('li.ui-sidebar-menu-item');
		if (!row) return;
		if (row.closest('.cl-tagged-group')) {
			// клон в Tagged — берём имя оригинала
			const key = row.dataset.clKey;
			if (key) rememberClickedTitle(key);
			return;
		}
		rememberClickedTitle(getChatKey(row));
	};
	document.addEventListener('click', _clickTracker, true);
	document.addEventListener('mousedown', _clickTracker, true);

	// Перехватываем fetch к api2.cursor.sh — Cursor сам ходит туда регулярно (usage,
	// dashboard, autocomplete telemetry). На лету учим:
	//  - Bearer-токен (из Authorization header)
	//  - teamId (из тела запроса, если оно JSON)
	// Сохраняем в localStorage чтобы пережить рестарт renderer'а.
	function loadCostAuth() {
		try {
			const raw = localStorage.getItem(COST_AUTH_KEY);
			return raw ? (JSON.parse(raw) || {}) : {};
		} catch { return {}; }
	}
	function saveCostAuth(patch) {
		try {
			const cur = loadCostAuth();
			const next = { ...cur, ...patch };
			localStorage.setItem(COST_AUTH_KEY, JSON.stringify(next));
		} catch { /* ignore */ }
	}

	const _origFetch = window.fetch.bind(window);
	function isCursorApiUrl(u) {
		return typeof u === 'string' && u.includes('api2.cursor.sh');
	}
	// gRPC-web endpoints, на которых composerId реально едет в теле запроса.
	// Auto-complete telemetry / usage dashboard сюда не попадают — там composerId
	// либо отсутствует, либо чужой (другой чат). Фильтр спасает от ложных пар.
	const COMPOSER_URL_RE = /Compose|Chat|Agent|Bubble|Generate|Stream|Conversation/i;
	const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
	// Извлекает все UUID из body любого формата (string / ArrayBuffer / Uint8Array /
	// Blob — Blob async, его пропускаем). Cursor шлёт protobuf, но composerId внутри
	// него — обычная ASCII-строка UUID, поэтому grep по тексту работает.
	function extractUuidsFromBody(body) {
		if (!body) return [];
		try {
			let s = '';
			if (typeof body === 'string') {
				s = body;
			} else if (body instanceof ArrayBuffer) {
				s = new TextDecoder('utf-8', { fatal: false }).decode(body);
			} else if (ArrayBuffer.isView(body)) {
				s = new TextDecoder('utf-8', { fatal: false }).decode(body);
			} else if (body instanceof URLSearchParams) {
				s = body.toString();
			}
			if (!s) return [];
			const m = s.match(UUID_RE);
			return m ? Array.from(new Set(m.map(u => u.toLowerCase()))) : [];
		} catch { return []; }
	}
	function maybeCaptureFromUrlAndBody(url, body) {
		if (!url || !COMPOSER_URL_RE.test(url)) return;
		const uuids = extractUuidsFromBody(body);
		for (const u of uuids) captureComposerFromFetch(u);
	}
	function maybeCaptureTeamIdFromBody(body) {
		if (!body) return;
		try {
			// teamId — обычно в JSON-теле (например на usage-endpoint'ах). Парсим только JSON.
			if (typeof body !== 'string') return;
			if (body.length === 0 || body.charCodeAt(0) !== 0x7b) return;
			const parsed = JSON.parse(body);
			if (parsed && typeof parsed.teamId === 'number' && parsed.teamId > 0) {
				const stored = loadCostAuth();
				if (stored.teamId !== parsed.teamId) saveCostAuth({ teamId: parsed.teamId });
			}
		} catch { /* ignore */ }
	}
	const _ourFetch = function(input, init) {
		try {
			let url = '';
			let reqHeaders = null;
			if (typeof input === 'string') url = input;
			else if (input && typeof input.url === 'string') { url = input.url; reqHeaders = input.headers; }
			if (isCursorApiUrl(url)) {
				let auth = null;
				if (init && init.headers) {
					const h = init.headers instanceof Headers ? init.headers : new Headers(init.headers);
					auth = h.get('authorization');
				} else if (reqHeaders && typeof reqHeaders.get === 'function') {
					auth = reqHeaders.get('authorization');
				}
				if (auth && /^Bearer\s+/i.test(auth)) {
					const stored = loadCostAuth();
					if (stored.token !== auth) saveCostAuth({ token: auth });
				}
				const body = init && init.body;
				maybeCaptureTeamIdFromBody(body);
				maybeCaptureFromUrlAndBody(url, body);
			}
		} catch (err) { /* never break fetch */ }
		return _origFetch(input, init);
	};
	window.fetch = _ourFetch;

	// Hook XMLHttpRequest — Cursor может ходить и через XHR (особенно для
	// streamed чатов). Без этого composerId «холодных» чатов не подхватывается.
	const _origXhrOpen = XMLHttpRequest.prototype.open;
	const _origXhrSend = XMLHttpRequest.prototype.send;
	XMLHttpRequest.prototype.open = function(method, url) {
		try { this.__clUrl = url; } catch { /* ignore */ }
		return _origXhrOpen.apply(this, arguments);
	};
	XMLHttpRequest.prototype.send = function(body) {
		try {
			const u = this.__clUrl;
			if (isCursorApiUrl(u || '')) {
				maybeCaptureFromUrlAndBody(u, body);
				maybeCaptureTeamIdFromBody(body);
			}
		} catch { /* never break xhr */ }
		return _origXhrSend.apply(this, arguments);
	};

	function loadCostCache() {
		try { return JSON.parse(localStorage.getItem(COST_CACHE_KEY) || '{}') || {}; }
		catch { return {}; }
	}
	function saveCostCache(cache) {
		try { localStorage.setItem(COST_CACHE_KEY, JSON.stringify(cache)); }
		catch { /* ignore quota errors */ }
	}

	async function fetchChatCost(composerId, { force = false } = {}) {
		const cache = loadCostCache();
		const cached = cache[composerId];
		if (!force && cached && (Date.now() - cached.at) < COST_CACHE_TTL_MS) {
			return { ...cached.data, fromCache: true, cachedAt: cached.at };
		}
		const auth = loadCostAuth();
		if (!auth.token) throw new Error('нет токена — открой любой чат и попробуй снова');
		if (!auth.teamId) throw new Error('нет teamId — перезапусти install.ps1 (composers.js без teamId)');

		let totalCents = 0, chargedCents = 0, tokenCents = 0, eventCount = 0;
		const pageSize = 100;
		const maxPages = 20; // safety: до 2000 событий на чат
		for (let page = 1; page <= maxPages; page++) {
			const res = await _origFetch(COST_API_URL, {
				method: 'POST',
				headers: {
					'Authorization': auth.token,
					'Connect-Protocol-Version': '1',
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					teamId: auth.teamId,
					startDate: 0,
					endDate: Date.now(),
					cloudAgentId: composerId,
					page,
					pageSize
				})
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				if (res.status === 401 || res.status === 403) {
					// токен протух — стираем, чтоб следующий перехват его обновил
					saveCostAuth({ token: null });
					throw new Error(`API ${res.status} (токен устарел?)`);
				}
				throw new Error(`API ${res.status}${txt ? ': ' + txt.slice(0, 120) : ''}`);
			}
			const data = await res.json().catch(() => ({}));
			const events = Array.isArray(data.usageEventsDisplay) ? data.usageEventsDisplay : [];
			if (events.length === 0) break;
			for (const ev of events) {
				const c = Number(ev.chargedCents) || 0;
				const t = Number(ev.tokenUsage && ev.tokenUsage.totalCents) || 0;
				chargedCents += c;
				tokenCents += t;
				totalCents += Math.max(c, t);
				eventCount++;
			}
			if (events.length < pageSize) break;
		}
		const result = { totalCents, chargedCents, tokenCents, eventCount };
		const next = loadCostCache();
		next[composerId] = { data: result, at: Date.now() };
		saveCostCache(next);
		return { ...result, fromCache: false };
	}

	function fmtCents(cents) {
		if (!cents) return '$0.00';
		return '$' + (cents / 100).toFixed(2);
	}

	function fmtCostLine(data) {
		const main = fmtCents(data.totalCents);
		let suffix = ` (${data.eventCount} событий)`;
		// Если chargedCents сильно меньше totalCents — это "included" usage.
		// Показываем оба, чтобы не путать с billing dashboard.
		if (data.chargedCents !== data.totalCents && data.eventCount > 0) {
			suffix += `, charged ${fmtCents(data.chargedCents)}`;
		}
		return main + suffix;
	}

	// ---- Контекстное меню ----------------------------------------------------
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

		// Pin / Unpin
		const pinBtn = findPinAction(row);
		const pinned = isRowPinned(row);
		const pinItem = document.createElement('div');
		pinItem.className = 'cl-menu-item';
		if (!pinBtn) pinItem.classList.add('cl-menu-disabled');
		const pinIcon = document.createElement('span');
		pinIcon.className = 'cl-menu-icon';
		pinIcon.textContent = pinned ? '📍' : '📌';
		pinItem.appendChild(pinIcon);
		const pinText = document.createElement('span');
		pinText.textContent = pinned ? 'Открепить' : 'Закрепить';
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

		// Fork Chat — дёргаем нативное действие Cursor.
		const forkItem = document.createElement('div');
		forkItem.className = 'cl-menu-item';
		const forkIcon = document.createElement('span');
		forkIcon.className = 'cl-menu-icon';
		forkIcon.textContent = '🍴';
		forkItem.appendChild(forkIcon);
		const forkText = document.createElement('span');
		forkText.textContent = 'Fork Chat';
		forkItem.appendChild(forkText);
		forkItem.addEventListener('click', () => {
			menu.remove();
			forkChatForRow(row);
		});
		menu.appendChild(forkItem);

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
		// Clamp в viewport: если меню вылезает за нижний/правый край — сдвигаем
		// вверх/влево от курсора. Защита от верха/лева — минимум 4px от края.
		const rect = menu.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const margin = 4;
		let left = x;
		let top = y;
		if (left + rect.width + margin > vw) left = Math.max(margin, x - rect.width);
		if (top + rect.height + margin > vh) top = Math.max(margin, y - rect.height);
		if (left < margin) left = margin;
		if (top < margin) top = margin;
		menu.style.left = left + 'px';
		menu.style.top = top + 'px';
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

	// ---- Fork Chat -----------------------------------------------------------
	// Нативное меню Cursor (React onContextMenu на строке) мы перехватываем своим,
	// и пункт "Fork Chat" пропал. Возвращаем его: на клик по нашему пункту заново
	// открываем нативное меню для строки (флаг _bypassContextMenu пропускает наш
	// перехватчик) и кликаем в нём пункт с текстом "Fork Chat" (точный лейбл взят
	// из исходников Cursor: {id:'fork-chat', label:'Fork Chat', icon:'git-fork'}).
	const FORK_LABEL = 'Fork Chat';
	let _bypassContextMenu = false;

	// Ищем пункт нативного меню по точному тексту: самый глубокий элемент с таким
	// текстом, затем поднимаемся к кликабельному контейнеру. Исключаем наше меню.
	function findNativeMenuItemByText(label) {
		let best = null;
		const nodes = document.querySelectorAll('[role="menuitem"], [class*="menu"] *, [role="menu"] *');
		for (const el of nodes) {
			if (el.closest('.cl-menu')) continue;
			if ((el.textContent || '').replace(/\s+/g, ' ').trim() !== label) continue;
			if (!best || best.contains(el)) best = el; // глубже = точнее
		}
		if (!best) return null;
		return best.closest('[role="menuitem"], [class*="menu-item"], [class*="menuItem"], button, [role="button"], li') || best;
	}

	function forkChatForRow(row) {
		const btn = findFirst(row, SELECTORS.rowButton) || row;
		const rect = btn.getBoundingClientRect();
		const opts = {
			bubbles: true, cancelable: true,
			clientX: rect.left + rect.width / 2,
			clientY: rect.top + rect.height / 2,
			button: 2
		};
		// Переоткрываем нативное меню (наш перехватчик пропускаем флагом).
		_bypassContextMenu = true;
		try {
			btn.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse', button: 2, buttons: 2 }));
			btn.dispatchEvent(new MouseEvent('contextmenu', opts));
		} catch (err) {
			console.warn('[chat-labels] fork: contextmenu dispatch failed', err);
		}
		requestAnimationFrame(() => { _bypassContextMenu = false; });

		// Ждём появления нативного меню и кликаем "Fork Chat" РОВНО один раз.
		// Полная pointer+click цепочка тут даёт два срабатывания onSelect (пункт
		// реагирует и на dispatched click, и на .click()) — поэтому одиночный click.
		const deadline = Date.now() + 1000;
		let done = false;
		const tryClick = () => {
			if (done) return;
			const item = findNativeMenuItemByText(FORK_LABEL);
			if (item) {
				done = true;
				const r = item.getBoundingClientRect();
				item.dispatchEvent(new MouseEvent('click', {
					bubbles: true, cancelable: true,
					clientX: r.left + r.width / 2,
					clientY: r.top + r.height / 2,
					button: 0
				}));
				return;
			}
			if (Date.now() < deadline) { requestAnimationFrame(tryClick); return; }
			console.warn('[chat-labels] пункт "Fork Chat" не найден в нативном меню');
		};
		requestAnimationFrame(tryClick);
	}

	const contextMenuHandler = (ev) => {
		if (_bypassContextMenu) return; // наш же синтетический ПКМ для форка — пропускаем
		const target = ev.target;
		if (!(target instanceof Element)) return;
		const row = target.closest('li.ui-sidebar-menu-item');
		if (!row) return;
		if (!row.querySelector('.glass-sidebar-agent-menu-btn')) return;

		// Если ПКМ на клоне в Tagged — открыть меню для оригинального чата.
		let actual = row;
		if (row.closest('.cl-tagged-group')) {
			actual = row.__clOriginalRow && row.__clOriginalRow.isConnected ? row.__clOriginalRow : null;
			if (!actual) {
				const key = row.dataset.clKey;
				for (const r of findAll(document, SELECTORS.row)) {
					if (r.closest('.cl-tagged-group')) continue;
					if (getChatKey(r) === key) { actual = r; break; }
				}
			}
			if (!actual) return;
		}

		ev.preventDefault();
		ev.stopPropagation();
		ev.stopImmediatePropagation();
		showMenu(actual, ev.clientX, ev.clientY);
	};
	document.addEventListener('contextmenu', contextMenuHandler, true);

	// ---- Циклирование моделей по хоткею --------------------------------------
	// Разметка пикера (Cursor 3.5.x): кнопка-триггер button.ui-model-picker__trigger
	// с текстом текущей модели в span.ui-model-picker__trigger-text; раскрытое
	// меню — [data-testid="model-picker-menu"], пункты — [data-testid="model-item-<id>"].
	const MODEL_TRIGGER_SEL = 'button.ui-model-picker__trigger';
	const MODEL_TRIGGER_TEXT_SEL = '.ui-model-picker__trigger-text';
	const MODEL_MENU_SEL = '[data-testid="model-picker-menu"]';

	const MODELS_BASE_URL = new URL('./models.js', import.meta.url).href;
	let modelCycle = [];
	let cycleHotkey = { ctrl: true, meta: false, alt: false, shift: false, code: 'Space' };

	async function loadModelCycle({ bust = false } = {}) {
		const url = bust ? `${MODELS_BASE_URL}?t=${Date.now()}` : MODELS_BASE_URL;
		try {
			const mod = await import(url);
			const loaded = mod.modelCycle || mod.default;
			if (Array.isArray(loaded)) modelCycle = loaded.filter(m => m && m.id);
			if (mod.cycleHotkey && typeof mod.cycleHotkey === 'object') {
				cycleHotkey = { ...cycleHotkey, ...mod.cycleHotkey };
			}
			console.log('[chat-labels] model cycle loaded:', modelCycle.length, 'models');
			return true;
		} catch (err) {
			console.warn('[chat-labels] models.js не загрузился', err);
			return false;
		}
	}

	// Полная цепочка pointer/mouse событий — Solid слушает pointerdown, голого
	// click() может не хватить (та же причина, что в togglePinForRow).
	function fireClickChain(el) {
		if (!el) return false;
		const rect = el.getBoundingClientRect();
		const opts = {
			bubbles: true, cancelable: true,
			clientX: rect.left + rect.width / 2,
			clientY: rect.top + rect.height / 2,
			button: 0
		};
		try {
			el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse' }));
			el.dispatchEvent(new MouseEvent('mousedown', opts));
			el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse' }));
			el.dispatchEvent(new MouseEvent('mouseup', opts));
			el.dispatchEvent(new MouseEvent('click', opts));
			if (typeof el.click === 'function') el.click();
			return true;
		} catch (err) {
			console.warn('[chat-labels] model click dispatch failed', err);
			return false;
		}
	}

	function waitForSelector(sel, timeout = 600) {
		return new Promise(resolve => {
			const immediate = document.querySelector(sel);
			if (immediate) return resolve(immediate);
			const start = Date.now();
			const tick = () => {
				const el = document.querySelector(sel);
				if (el) return resolve(el);
				if (Date.now() - start > timeout) return resolve(null);
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
	}

	// Триггер пикера в том же композере, где сейчас фокус. Поднимаемся от
	// activeElement вверх и ищем предка, внутри которого есть кнопка модели —
	// это и есть инпут чата (а не редактор кода). Завязка только на селектор
	// триггера, без хардкода классов панели — устойчиво к ре-вёрстке Cursor.
	function modelTriggerForFocus() {
		let el = document.activeElement;
		for (let i = 0; el && i < 25; i++, el = el.parentElement) {
			if (el.querySelector) {
				const t = el.querySelector(MODEL_TRIGGER_SEL);
				if (t) return t;
			}
		}
		return null;
	}

	let modelCycling = false;
	async function cycleModel() {
		if (modelCycling) return;
		if (!modelCycle.length) { console.warn('[chat-labels] model cycle пуст — заполни models.js'); return; }
		const trigger = modelTriggerForFocus() || document.querySelector(MODEL_TRIGGER_SEL);
		if (!trigger) return;

		const curText = (
			trigger.querySelector(MODEL_TRIGGER_TEXT_SEL)?.textContent ||
			trigger.textContent || ''
		).trim().toLowerCase();
		const idx = modelCycle.findIndex(m => curText.includes((m.match || m.id).toLowerCase()));
		const next = modelCycle[(idx + 1) % modelCycle.length] || modelCycle[0];

		modelCycling = true;
		try {
			let menu = document.querySelector(MODEL_MENU_SEL);
			if (!menu) {
				fireClickChain(trigger);
				menu = await waitForSelector(MODEL_MENU_SEL, 600);
			}
			if (!menu) { console.warn('[chat-labels] меню моделей не открылось'); return; }
			const item = menu.querySelector(`[data-testid="model-item-${next.id}"]`);
			if (!item) {
				console.warn('[chat-labels] модель не найдена в меню:', next.id, '(проверь id через __cursorChatLabelsInspectModel)');
				fireClickChain(trigger); // закрыть меню
				return;
			}
			fireClickChain(item);
		} finally {
			// небольшая пауза, чтобы повторное нажатие в момент анимации не сбоило
			setTimeout(() => { modelCycling = false; }, 120);
		}
	}

	function modelHotkeyHandler(e) {
		const hk = cycleHotkey;
		if (!hk) return;
		if (e.repeat) return;
		if (!!hk.ctrl !== e.ctrlKey) return;
		if (!!hk.meta !== e.metaKey) return;
		if (!!hk.alt !== e.altKey) return;
		if (!!hk.shift !== e.shiftKey) return;
		const codeMatch = hk.code && e.code === hk.code;
		const keyMatch = hk.key && e.key === hk.key;
		if (!codeMatch && !keyMatch) return;
		// срабатываем только когда фокус в инпуте чата (рядом есть триггер модели),
		// иначе не перехватываем хоткей у редактора кода (Ctrl+Space = автокомплит)
		if (!modelTriggerForFocus()) return;
		e.preventDefault();
		e.stopPropagation();
		cycleModel();
	}
	document.addEventListener('keydown', modelHotkeyHandler, true);

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
			console.warn('[chat-labels] labels.js пустой / некорректный, используются дефолты');
		} catch (err) {
			console.warn('[chat-labels] labels.js не загрузился', err);
		}
		return false;
	}

	(async () => {
		await Promise.all([loadConfig(), loadModelCycle(), loadComposers()]);
		observer.observe(document.body, { childList: true, subtree: true });
		runDecorateNow();
		const initialCount = findAll(document, SELECTORS.row).length;
		console.log('%c[chat-labels v8] booted', 'color: #27ae60; font-weight: bold', {
			rowsDecorated: initialCount,
			labels: userLabels.length,
			composers: composersByName ? composersByName.size : 0,
			cost: { hasToken: !!loadCostAuth().token, hasTeamId: !!loadCostAuth().teamId }
		});
	})();

	// ---- Public helpers ------------------------------------------------------
	window.__cursorChatLabelsReloadConfig = async function() {
		const ok = await loadConfig({ bust: true });
		await loadModelCycle({ bust: true });
		document.querySelectorAll('.cl-badge').forEach(el => el.remove());
		document.querySelectorAll('.cl-has-label, .cl-hide-status').forEach(el => {
			el.classList.remove('cl-has-label');
			el.classList.remove('cl-hide-status');
			el.style.removeProperty('--cl-color');
		});
		runDecorateNow();
		return ok ? 'config reloaded' : 'config not loaded — using defaults';
	};

	window.__cursorChatLabelsCleanup = function() {
		observerDisabled = true;
		observer.disconnect();
		document.removeEventListener('contextmenu', contextMenuHandler, true);
		document.removeEventListener('keydown', modelHotkeyHandler, true);
		document.removeEventListener('click', _clickTracker, true);
		document.removeEventListener('mousedown', _clickTracker, true);
		// Снимаем подмену fetch ТОЛЬКО если наш wrapper всё ещё активен —
		// иначе можем затереть чужой wrapper, который пришёл после нас.
		if (window.fetch === _ourFetch) {
			try { window.fetch = _origFetch; } catch { /* readonly? */ }
		}
		try {
			if (XMLHttpRequest.prototype.open !== _origXhrOpen) XMLHttpRequest.prototype.open = _origXhrOpen;
			if (XMLHttpRequest.prototype.send !== _origXhrSend) XMLHttpRequest.prototype.send = _origXhrSend;
		} catch { /* ignore */ }
		document.querySelectorAll('.cl-badge, .cl-menu, .cl-tagged-group, #cursor-chat-labels-style').forEach(el => el.remove());
		document.querySelectorAll('.cl-has-label, .cl-hide-status').forEach(el => {
			el.classList.remove('cl-has-label');
			el.classList.remove('cl-hide-status');
			el.style.removeProperty('--cl-color');
		});
		document.querySelectorAll('.cl-status-seen, .cl-status-unseen').forEach(el => {
			el.classList.remove('cl-status-seen');
			el.classList.remove('cl-status-unseen');
			const lbl = el.querySelector('.ui-sidebar-menu-button-label');
			if (lbl) lbl.style.removeProperty('color');
		});
		delete window.__cursorChatLabelsCleanup;
		console.log('[chat-labels] cleaned up');
	};

	window.__cursorChatLabelsDebug = function() {
		console.group('[chat-labels] debug');
		console.log('Rows found:', findAll(document, SELECTORS.row).length);
		console.log('Stored labels:', loadStoredLabels());
		console.log('Active label set:', LABELS);
		console.log('Composers loaded:', composersByName ? composersByName.size : 0, 'unique names; syncedAt:', composersSyncedAt ? new Date(composersSyncedAt).toLocaleString() : 'n/a');
		console.log('Runtime composers:', Object.keys(loadRuntimeComposers()).length, 'entries');
		console.log('Recent clicks (last 8s):', recentClicks.filter(c => Date.now() - c.at < COST_RECENT_CLICK_TTL_MS));
		console.log('Cost auth:', { hasToken: !!loadCostAuth().token, teamId: loadCostAuth().teamId || null });
		console.log('Cost cache entries:', Object.keys(loadCostCache()).length);
		console.log('Suppressing:', suppressing, '| FiredThisFrame:', firedThisFrame, '| Disabled:', observerDisabled);
		console.log('Observer errors:', observerErrors);
		console.groupEnd();
	};

	window.__cursorChatLabelsClearCostCache = function() {
		try { localStorage.removeItem(COST_CACHE_KEY); }
		catch { /* ignore */ }
		console.log('[chat-labels] cost cache cleared');
	};

	// Диагностика live-capture: что мы знаем про composerId'ы новых чатов,
	// и видит ли наш wrapper вообще запросы Cursor'а. Запусти, побеседуй
	// 10–20 секунд, запусти ещё раз — должно расти.
	window.__cursorChatLabelsInspectCost = function() {
		const rt = loadRuntimeComposers();
		const auth = loadCostAuth();
		console.group('[chat-labels] cost inspect');
		console.log('Bearer token captured:', !!auth.token, auth.token ? '(len ' + auth.token.length + ')' : '');
		console.log('teamId:', auth.teamId || '(none yet — open Settings → Usage)');
		console.log('Static composers (composers.js) loaded:', composersByName ? composersByName.size : 'NO');
		console.log('Runtime-captured composers:', Object.keys(rt).length);
		for (const [title, info] of Object.entries(rt)) {
			console.log('  ', title.slice(0, 60), '→', info.composerId.slice(0, 8) + '…');
		}
		console.log('Recent clicks (titles in last ' + (COST_RECENT_CLICK_TTL_MS/1000) + 's):', recentClicks.map(c => c.title));
		console.log('window.fetch hooked:', window.fetch === _ourFetch);
		console.log('XHR.send hooked:', XMLHttpRequest.prototype.send !== _origXhrSend);
		console.groupEnd();
		return { rt, auth, recentClicks };
	};

	window.__cursorChatLabelsClearRuntimeComposers = function() {
		try { localStorage.removeItem(COST_RUNTIME_COMPOSERS_KEY); }
		catch { /* ignore */ }
		console.log('[chat-labels] runtime composers cleared');
	};

	// Дамп пикера моделей: текущая модель (с триггера) и, если меню открыто,
	// список доступных id для models.js. Открой пикер моделей перед вызовом,
	// чтобы увидеть список.
	window.__cursorChatLabelsInspectModel = function() {
		const trigger = document.querySelector(MODEL_TRIGGER_SEL);
		const curText = trigger
			? (trigger.querySelector(MODEL_TRIGGER_TEXT_SEL)?.textContent || trigger.textContent || '').trim()
			: '(триггер не найден)';
		console.group('[chat-labels] model picker');
		console.log('Триггер найден:', !!trigger, '| текущая модель:', curText);
		console.log('Хоткей:', cycleHotkey);
		console.log('Список циклирования (models.js):', modelCycle);
		const menu = document.querySelector(MODEL_MENU_SEL);
		if (menu) {
			const items = [...menu.querySelectorAll('[data-testid^="model-item-"]')].map(el => ({
				id: el.getAttribute('data-testid').replace('model-item-', ''),
				text: (el.innerText || '').replace(/\s+/g, ' ').trim()
			}));
			console.table(items);
		} else {
			console.log('Меню закрыто — открой пикер моделей и вызови ещё раз, чтобы увидеть доступные id.');
		}
		console.groupEnd();
		return menu ? 'см. таблицу выше' : 'открой дропдаун моделей и вызови снова';
	};

	// Дампит computed CSS заголовков и items группы Pinned (или Workspaces),
	// чтобы можно было точно подогнать стиль Tagged.
	window.__cursorChatLabelsInspectStyles = function() {
		const lines = [];
		const log = (s) => lines.push(s);
		log('=== chat-labels inspect styles ===');

		const props = [
			'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'textTransform',
			'color', 'opacity', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
			'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
			'display', 'alignItems', 'gap', 'lineHeight', 'background', 'borderRadius'
		];
		function dumpComputed(label, el) {
			if (!el) { log(`--- ${label}: NOT FOUND ---\n`); return; }
			const cs = getComputedStyle(el);
			log(`--- ${label} ---`);
			log(`tag: ${el.tagName.toLowerCase()}, class: "${el.className}"`);
			for (const p of props) log(`  ${p}: ${cs[p]}`);
			log('');
		}

		// Заголовки нативных групп
		const allTitles = Array.from(document.querySelectorAll('.ui-sidebar-group-label-title'));
		const pinnedTitle = allTitles.find(t => (t.textContent || '').trim().toLowerCase() === 'pinned');
		const workspacesTitle = allTitles.find(t => (t.textContent || '').trim().toLowerCase() === 'workspaces');
		dumpComputed('Pinned title span', pinnedTitle);
		dumpComputed('Workspaces title span', workspacesTitle);

		// Контейнер заголовка (parent span'а)
		if (pinnedTitle) {
			dumpComputed('Pinned title parent', pinnedTitle.parentElement);
			let p = pinnedTitle.parentElement;
			let depth = 0;
			while (p && depth < 5 && !p.classList.contains('ui-sidebar-group')) {
				dumpComputed(`Pinned ancestor [${depth}]`, p);
				p = p.parentElement;
				depth++;
			}
			if (p) dumpComputed('Pinned group root', p);
		}

		// Один item чата
		const firstRow = document.querySelector('li.ui-sidebar-menu-item:not(.cl-tagged-item)');
		if (firstRow) {
			dumpComputed('Row item li', firstRow);
			dumpComputed('Row btn', firstRow.querySelector('.glass-sidebar-agent-menu-btn'));
			dumpComputed('Row label', firstRow.querySelector('.ui-sidebar-menu-button-label'));
			dumpComputed('Row icon-wrapper', firstRow.querySelector('.ui-sidebar-menu-button-icon-wrapper'));
		}

		// Наш заголовок Tagged для сравнения
		const taggedHeader = document.querySelector('.cl-tagged-header');
		if (taggedHeader) {
			dumpComputed('OUR Tagged header div', taggedHeader);
			dumpComputed('OUR Tagged title span', taggedHeader.querySelector('.ui-sidebar-group-label-title'));
		}

		const out = lines.join('\n');
		console.log(out);
		try { if (navigator.clipboard) navigator.clipboard.writeText(out); } catch(e) {}
		return out;
	};

	window.__cursorChatLabelsInspect = function() {
		const lines = [];
		const log = (s) => lines.push(s);
		log('=== chat-labels inspect ===');
		log('UA: ' + navigator.userAgent);
		log('');
		const rows = Array.from(document.querySelectorAll('li.ui-sidebar-menu-item')).filter(r => !r.closest('.cl-tagged-group'));
		log(`Total rows (excl. Tagged clones): ${rows.length}`);
		const pinned = rows.find(r => isRowPinned(r));
		const unpinned = rows.find(r => !isRowPinned(r));
		const active = rows.find(r => isRowActive(r));
		function dump(label, row) {
			if (!row) { log(`--- ${label}: NOT FOUND ---\n`); return; }
			log(`--- ${label}: outerHTML (3500) ---`);
			log(row.outerHTML.slice(0, 3500));
			log(`--- ${label}: pinSlot=${!!findPinSlot(row)} pinAction=${!!findPinAction(row)} isPinned=${isRowPinned(row)} isActive=${isRowActive(row)} ---\n`);
		}
		dump('UNPINNED', unpinned);
		dump('PINNED', pinned);
		if (active && active !== unpinned && active !== pinned) dump('ACTIVE', active);

		const out = lines.join('\n');
		console.log(out);
		try { if (navigator.clipboard) navigator.clipboard.writeText(out); } catch(e) {}
		return out;
	};
})();
