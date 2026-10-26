/**
 * DOM renderer for Launchpad.
 * Renders breadcrumbs, onboarding state, folder/bookmark tiles, and theme attributes.
 */

import {
  createMonogramSvgDataUrl,
  formatDisplayHostname,
  getFaviconUrl,
} from '../services/bookmarks.js';

/**
 * Applies theme mode, custom accent color, and layout density onto `document.documentElement`.
 * @param {import('../services/storage.js').DEFAULT_SETTINGS} settings
 */
export function applyThemeAndSettings(settings) {
  const root = document.documentElement;
  root.dataset.theme = settings.theme || 'system';
  root.dataset.density = settings.density || 'comfortable';
  root.dataset.iconSize = settings.iconSize || 'medium';
  root.style.setProperty('--accent-color', settings.accentColor || '#6366f1');
}

/**
 * Populates a `<select>` element with the indented folder hierarchy.
 * @param {HTMLSelectElement} selectEl
 * @param {Array<{ id: string, title: string, pathLabel: string, depth: number, childCount: number }>} folders
 * @param {string | null} selectedId
 */
export function renderFolderOptions(selectEl, folders, selectedId) {
  selectEl.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— Select a bookmark folder —';
  placeholder.disabled = Boolean(selectedId);
  placeholder.selected = !selectedId;
  selectEl.appendChild(placeholder);

  for (const folder of folders) {
    const opt = document.createElement('option');
    opt.value = folder.id;
    const indent = '\u00A0\u00A0'.repeat(folder.depth);
    opt.textContent = `${indent}📁 ${folder.title} (${folder.childCount})`;
    opt.title = folder.pathLabel;
    if (folder.id === selectedId) {
      opt.selected = true;
    }
    selectEl.appendChild(opt);
  }
}

/**
 * Renders the interactive breadcrumb bar.
 * @param {HTMLElement} container
 * @param {ReturnType<import('../state/store.js').createLaunchpadStore>['getState'] extends () => infer S ? S : never} state
 * @param {(folderId: string) => void} onSelectCrumb
 */
export function renderBreadcrumbs(container, state, onSelectCrumb) {
  container.innerHTML = '';

  if (!state.rootFolderValid) {
    const span = document.createElement('span');
    span.className = 'breadcrumb-placeholder';
    span.textContent = 'Select a bookmark folder to get started';
    container.appendChild(span);
    return;
  }

  if (state.breadcrumbs.length > 1 && !state.searchQuery.trim()) {
    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'breadcrumb-up-btn';
    upBtn.title = 'Up one level (Backspace)';
    upBtn.setAttribute('aria-label', 'Navigate up one folder level');
    const parentId = state.breadcrumbs[state.breadcrumbs.length - 2].id;
    upBtn.dataset.folderId = parentId;
    upBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
    upBtn.addEventListener('click', () => onSelectCrumb(parentId));
    container.appendChild(upBtn);
  }

  state.breadcrumbs.forEach((crumb, idx) => {
    if (idx > 0) {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-separator';
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = '/';
      container.appendChild(sep);
    }

    const isCurrent = idx === state.breadcrumbs.length - 1 && !state.searchQuery.trim();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `breadcrumb-item ${isCurrent ? 'is-active' : ''}`;
    btn.dataset.folderId = crumb.id;

    if (idx === 0) {
      btn.innerHTML = `<svg class="crumb-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    }

    const label = document.createElement('span');
    label.textContent = crumb.title;
    btn.appendChild(label);

    btn.addEventListener('click', () => onSelectCrumb(crumb.id));
    container.appendChild(btn);
  });

  if (state.searchQuery.trim()) {
    const sep = document.createElement('span');
    sep.className = 'breadcrumb-separator';
    sep.textContent = '/';
    container.appendChild(sep);

    const searchBadge = document.createElement('span');
    searchBadge.className = 'breadcrumb-search-badge';
    searchBadge.textContent = `Search: "${state.searchQuery.trim()}" (${state.items.length})`;
    container.appendChild(searchBadge);
  }
}

/**
 * Renders the main Launchpad grid, onboarding view, or empty state.
 * @param {{
 *   gridEl: HTMLElement,
 *   onboardingEl: HTMLElement,
 *   onboardingSelectEl: HTMLSelectElement,
 *   emptyStateEl: HTMLElement,
 *   emptyStateTitleEl: HTMLElement,
 *   emptyStateDescEl: HTMLElement,
 *   toolbarActionsEl: HTMLElement,
 *   state: object,
 *   onActivateItem: (item: object, forceNewTab: boolean) => void,
 *   onEditItem: (item: object) => void,
 *   onDeleteItem: (item: object) => void,
 *   onFocusItem: (index: number) => void,
 *   onShiftSelect?: (index: number) => void
 * }} params
 */
export function renderLaunchpadMain({
  gridEl,
  onboardingEl,
  onboardingSelectEl,
  emptyStateEl,
  emptyStateTitleEl,
  emptyStateDescEl,
  toolbarActionsEl,
  state,
  onActivateItem,
  onEditItem,
  onDeleteItem,
  onFocusItem,
  onShiftSelect,
}) {
  // 1. Handle unconfigured or missing root folder
  if (!state.rootFolderValid) {
    onboardingEl.hidden = false;
    gridEl.hidden = true;
    emptyStateEl.hidden = true;
    toolbarActionsEl.hidden = true;
    gridEl._renderSignature = '';
    renderFolderOptions(
      onboardingSelectEl,
      state.folders,
      state.settings.rootFolderId
    );
    return;
  }

  onboardingEl.hidden = true;
  toolbarActionsEl.hidden = false;

  // 2. Handle empty folder or no search matches
  if (state.items.length === 0) {
    gridEl.hidden = true;
    emptyStateEl.hidden = false;
    gridEl._renderSignature = '';

    if (state.searchQuery.trim()) {
      emptyStateTitleEl.textContent = 'No matching bookmarks found';
      emptyStateDescEl.textContent = `No bookmarks or folders matched "${state.searchQuery.trim()}". Press Escape to clear your search.`;
    } else {
      emptyStateTitleEl.textContent = `"${state.currentFolderTitle}" is empty`;
      emptyStateDescEl.textContent =
        'Add a bookmark (press N) or create a subfolder (Shift+N) to populate this folder.';
    }
    return;
  }

  emptyStateEl.hidden = true;
  gridEl.hidden = false;

  const selectedSet = new Set((state.selectedIds || []).map((id) => String(id)));
  const isSearching = Boolean(state.searchQuery.trim());

  const nextSignature = JSON.stringify({
    folder: state.currentFolderId,
    q: state.searchQuery,
    density: state.settings?.density,
    iconSize: state.settings?.iconSize,
    items: state.items.map(
      (i) =>
        `${i.id}:${i.title}:${i.url || ''}:${i.childCount}:${i.relativePath || ''}`
    ),
  });

  // Fast path: if only selection or focus changed, update existing card elements in-place
  if (
    gridEl._renderSignature === nextSignature &&
    gridEl.children.length === state.items.length
  ) {
    Array.from(gridEl.children).forEach((card, idx) => {
      const itemId = String(card.dataset.itemId || '');
      const isSelected = selectedSet.has(itemId);
      const isFocused = idx === state.focusedIndex;
      card.dataset.index = String(idx);
      card.dataset.focused = String(isFocused);
      card.dataset.selected = String(isSelected);
      card.classList.toggle('is-selected', isSelected);
      card.setAttribute('aria-selected', String(isSelected));
    });

    if (state.focusedIndex >= 0) {
      const focusedCard = gridEl.querySelector(
        `[data-index="${state.focusedIndex}"]`
      );
      if (focusedCard && typeof focusedCard.scrollIntoView === 'function') {
        focusedCard.scrollIntoView({ block: 'nearest' });
      }
    }
    return;
  }

  gridEl._renderSignature = nextSignature;
  gridEl.innerHTML = '';

  state.items.forEach((item, idx) => {
    const isSelected = selectedSet.has(String(item.id));
    const card = document.createElement('article');
    card.className = `launchpad-card ${item.isFolder ? 'is-folder' : 'is-bookmark'}${isSelected ? ' is-selected' : ''}`;
    card.dataset.itemId = item.id;
    card.dataset.isFolder = String(Boolean(item.isFolder));
    card.dataset.index = String(idx);
    card.dataset.focused = String(idx === state.focusedIndex);
    card.dataset.selected = String(isSelected);
    card.draggable = !isSearching;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-selected', String(isSelected));
    card.setAttribute(
      'aria-label',
      item.isFolder
        ? `Folder ${item.title}, ${item.childCount} items`
        : `Bookmark ${item.title}, ${item.url}`
    );

    // Selection checkmark badge
    const selectBadge = document.createElement('div');
    selectBadge.className = 'card-select-badge';
    selectBadge.setAttribute('aria-hidden', 'true');
    selectBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    // Icon wrapper
    const iconWrap = document.createElement('div');
    iconWrap.className = 'card-icon-wrap';

    if (item.isFolder) {
      iconWrap.innerHTML = `
        <svg class="folder-glyph" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      `;
    } else {
      const faviconSize =
        state.settings?.density === 'icon' &&
        (state.settings?.iconSize === 'large' || state.settings?.iconSize === 'huge')
          ? 128
          : 64;
      const img = document.createElement('img');
      img.className = 'bookmark-favicon';
      img.alt = '';
      img.draggable = false;
      img.loading = 'lazy';
      img.src = getFaviconUrl(item.url, item.title, faviconSize);
      img.addEventListener('error', () => {
        const fallback = createMonogramSvgDataUrl(item.url, item.title, faviconSize);
        if (img.src !== fallback) {
          img.src = fallback;
        }
      });
      iconWrap.appendChild(img);
    }

    // Text content wrapper
    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'card-body';

    const titleEl = document.createElement('div');
    titleEl.className = 'card-title';
    titleEl.textContent = item.title;
    titleEl.title = item.title;
    bodyWrap.appendChild(titleEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'card-meta';
    if (item.isFolder) {
      const countText =
        item.childCount === 1 ? '1 item' : `${item.childCount} items`;
      metaEl.textContent = isSearching && item.relativePath
        ? `${countText} • ${item.relativePath}`
        : countText;
    } else {
      const host = formatDisplayHostname(item.url);
      metaEl.textContent =
        isSearching && item.relativePath ? `${host} • ${item.relativePath}` : host;
      metaEl.title = item.url || '';
    }
    bodyWrap.appendChild(metaEl);

    // Quick hover action buttons (Edit & Delete)
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'card-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'card-action-btn';
    editBtn.title = `Edit ${item.isFolder ? 'folder' : 'bookmark'} (E)`;
    editBtn.setAttribute('aria-label', `Edit ${item.title}`);
    editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onEditItem(item);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'card-action-btn is-danger';
    deleteBtn.title = `Delete ${item.isFolder ? 'folder' : 'bookmark'} (Del)`;
    deleteBtn.setAttribute('aria-label', `Delete ${item.title}`);
    deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDeleteItem(item);
    });

    actionsWrap.appendChild(editBtn);
    actionsWrap.appendChild(deleteBtn);

    card.appendChild(selectBadge);
    card.appendChild(iconWrap);
    card.appendChild(bodyWrap);
    card.appendChild(actionsWrap);

    card.addEventListener('click', (e) => {
      if (e.shiftKey) {
        e.preventDefault();
        onShiftSelect?.(idx, item);
        return;
      }
      onFocusItem(idx);
      onActivateItem(item, e.metaKey || e.ctrlKey || e.button === 1);
    });

    card.addEventListener('auxclick', (e) => {
      if (e.button === 1 && !item.isFolder) {
        e.preventDefault();
        onActivateItem(item, true);
      }
    });

    gridEl.appendChild(card);
  });

  // Scroll focused card into view smoothly if needed
  if (state.focusedIndex >= 0) {
    const focusedCard = gridEl.querySelector(
      `[data-index="${state.focusedIndex}"]`
    );
    if (focusedCard && typeof focusedCard.scrollIntoView === 'function') {
      focusedCard.scrollIntoView({ block: 'nearest' });
    }
  }
}
