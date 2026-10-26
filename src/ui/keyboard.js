/**
 * Keyboard navigation and shortcut handler for Launchpad.
 *
 * Supported shortcuts:
 * - `/` or `Cmd/Ctrl + K`: Focus search bar
 * - `Escape`: Clear search bar or unfocus grid item
 * - `ArrowRight` / `ArrowLeft` / `ArrowDown` / `ArrowUp`: Navigate grid items
 * - `Enter` (`Cmd/Ctrl + Enter`): Open focused bookmark or drill into subfolder
 * - `Backspace`: Navigate up to parent folder in breadcrumb trail (when not typing)
 * - `n`: Open "New Bookmark" modal
 * - `Shift + N`: Open "New Folder" modal
 * - `e`: Edit currently focused bookmark/folder
 * - `Delete`: Delete currently focused bookmark/folder
 * - `,`: Open Settings drawer
 */

/**
 * Computes the number of columns in the rendered CSS grid by inspecting card offsets.
 * @param {HTMLElement} gridEl
 * @returns {number}
 */
export function detectGridColumnCount(gridEl) {
  if (!gridEl) return 1;
  const cards = Array.from(gridEl.querySelectorAll('[data-item-id]'));
  if (cards.length <= 1) return 1;

  const firstTop = cards[0].offsetTop;
  let cols = 0;
  for (const card of cards) {
    if (Math.abs(card.offsetTop - firstTop) <= 4) {
      cols++;
    } else {
      break;
    }
  }
  return Math.max(1, cols);
}

/**
 * Registers global keyboard listeners for Launchpad navigation and actions.
 * @param {{
 *   store: ReturnType<import('../state/store.js').createLaunchpadStore>,
 *   searchInput: HTMLInputElement,
 *   gridEl: HTMLElement,
 *   onActivateItem: (item: object, forceNewTab: boolean) => void,
 *   onActivateSelected?: (items: Array<object>) => void,
 *   onRequestCreate: (isFolder: boolean) => void,
 *   onRequestEdit: (item: object) => void,
 *   onRequestDelete: (item: object) => void,
 *   onRequestDeleteSelected?: (items: Array<object>) => void,
 *   onRequestSettings: () => void,
 *   isModalOpen: () => boolean
 * }} options
 */
export function setupKeyboardNavigation({
  store,
  searchInput,
  gridEl,
  onActivateItem,
  onActivateSelected,
  onRequestCreate,
  onRequestEdit,
  onRequestDelete,
  onRequestDeleteSelected,
  onRequestSettings,
  isModalOpen,
}) {
  window.addEventListener('keydown', async (e) => {
    // Allow native <dialog> handling when a modal is open
    if (isModalOpen()) {
      return;
    }

    const activeEl = document.activeElement;
    const isTypingInInput =
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable);

    // Cmd/Ctrl + K always focuses search input
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    // `/` focuses search input when not already typing
    if (!isTypingInInput && e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    // Handle Escape inside or outside search input
    if (e.key === 'Escape') {
      const state = store.getState();
      if (state.selectedIds && state.selectedIds.length > 0) {
        e.preventDefault();
        store.clearSelection();
        return;
      }
      if (state.searchQuery) {
        e.preventDefault();
        searchInput.value = '';
        await store.setSearchQuery('');
        searchInput.blur();
        return;
      }
      if (activeEl === searchInput) {
        searchInput.blur();
        return;
      }
      if (state.focusedIndex !== -1) {
        store.setFocusedIndex(-1);
        return;
      }
    }

    // Allow Down Arrow or Enter from the search input to jump into grid results
    if (activeEl === searchInput) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        searchInput.blur();
        const state = store.getState();
        if (state.items.length > 0 && state.focusedIndex === -1) {
          store.setFocusedIndex(0);
        }
        return;
      }
      if (e.key === 'Enter') {
        const state = store.getState();
        if (state.items.length > 0) {
          e.preventDefault();
          const idx = state.focusedIndex >= 0 ? state.focusedIndex : 0;
          onActivateItem(state.items[idx], e.metaKey || e.ctrlKey);
        }
        return;
      }
      return;
    }

    if (isTypingInInput) {
      return;
    }

    const state = store.getState();
    if (!state.rootFolderValid) {
      return;
    }

    // Cmd/Ctrl + A selects all items in current folder
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      store.selectAll();
      return;
    }

    const cols = detectGridColumnCount(gridEl);

    switch (e.key) {
      case 'ArrowRight': {
        e.preventDefault();
        store.moveFocus(1, { extendSelection: e.shiftKey });
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        store.moveFocus(-1, { extendSelection: e.shiftKey });
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        store.moveFocus(cols, { extendSelection: e.shiftKey });
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        store.moveFocus(-cols, { extendSelection: e.shiftKey });
        break;
      }
      case 'Enter': {
        if (state.selectedIds && state.selectedIds.length > 1) {
          e.preventDefault();
          const selectedSet = new Set(state.selectedIds.map((id) => String(id)));
          const selectedItems = state.items.filter((item) =>
            selectedSet.has(String(item.id))
          );
          onActivateSelected?.(selectedItems);
        } else if (state.focusedIndex >= 0 && state.items[state.focusedIndex]) {
          e.preventDefault();
          onActivateItem(
            state.items[state.focusedIndex],
            e.metaKey || e.ctrlKey
          );
        }
        break;
      }
      case 'Backspace': {
        if (!state.searchQuery) {
          e.preventDefault();
          await store.navigateUp();
        }
        break;
      }
      case 'n': {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          onRequestCreate(false);
        }
        break;
      }
      case 'N': {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          onRequestCreate(true);
        }
        break;
      }
      case 'e': {
        if (
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey &&
          state.focusedIndex >= 0 &&
          state.items[state.focusedIndex]
        ) {
          e.preventDefault();
          onRequestEdit(state.items[state.focusedIndex]);
        }
        break;
      }
      case 'Delete': {
        if (state.selectedIds && state.selectedIds.length > 1) {
          e.preventDefault();
          const selectedSet = new Set(state.selectedIds.map((id) => String(id)));
          const selectedItems = state.items.filter((item) =>
            selectedSet.has(String(item.id))
          );
          onRequestDeleteSelected?.(selectedItems);
        } else if (state.focusedIndex >= 0 && state.items[state.focusedIndex]) {
          e.preventDefault();
          onRequestDelete(state.items[state.focusedIndex]);
        }
        break;
      }
      case ',': {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          onRequestSettings();
        }
        break;
      }
      default:
        break;
    }
  });
}
