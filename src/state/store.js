/**
 * Reactive state store for the Launchpad UI.
 * Coordinates between `storage.js` and `bookmarks.js` and notifies subscribers.
 */

import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
} from '../services/storage.js';
import {
  getFolderContents,
  getFolderList,
  getGlobalFolderTrail,
  searchAllBookmarks,
} from '../services/bookmarks.js';

export function createLaunchpadStore() {
  let state = {
    initialized: false,
    settings: { ...DEFAULT_SETTINGS },
    folders: [],
    rootFolderValid: false,
    currentFolderId: null,
    currentFolderTitle: '',
    breadcrumbs: [],
    items: [],
    searchQuery: '',
    focusedIndex: -1,
    selectedIds: [],
    selectionAnchorIndex: -1,
  };

  const subscribers = new Set();

  function getState() {
    return state;
  }

  function setState(patch) {
    state = { ...state, ...patch };
    for (const listener of subscribers) {
      listener(state);
    }
  }

  function subscribe(listener) {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  /**
   * Re-fetches folder list, validates rootFolderId, and populates breadcrumbs and items.
   */
  async function refresh() {
    const folders = await getFolderList();
    const rootId = state.settings.rootFolderId;

    if (!rootId) {
      setState({
        folders,
        rootFolderValid: false,
        currentFolderId: null,
        currentFolderTitle: '',
        breadcrumbs: [],
        items: [],
        focusedIndex: -1,
        selectedIds: [],
        selectionAnchorIndex: -1,
      });
      return state;
    }

    const rootContents = await getFolderContents(rootId);
    if (!rootContents) {
      // Selected root folder was deleted or does not exist
      setState({
        folders,
        rootFolderValid: false,
        currentFolderId: null,
        currentFolderTitle: '',
        breadcrumbs: [],
        items: [],
        focusedIndex: -1,
        selectedIds: [],
        selectionAnchorIndex: -1,
      });
      return state;
    }

    // Ensure currentFolderId exists; if deleted, reset to rootId
    let activeFolderId = state.currentFolderId || rootId;
    let breadcrumbs = await getGlobalFolderTrail(rootId, activeFolderId);

    if (!breadcrumbs) {
      activeFolderId = rootId;
      breadcrumbs = await getGlobalFolderTrail(rootId, rootId);
    }

    const query = state.searchQuery.trim();
    let items = [];
    let currentFolderTitle = rootContents.folder.title;

    if (query) {
      items = await searchAllBookmarks(query);
      const activeFolder = await getFolderContents(activeFolderId);
      if (activeFolder) {
        currentFolderTitle = activeFolder.folder.title;
      }
    } else {
      const activeContents =
        activeFolderId === rootId
          ? rootContents
          : await getFolderContents(activeFolderId);
      items = activeContents ? activeContents.items : [];
      currentFolderTitle = activeContents
        ? activeContents.folder.title
        : rootContents.folder.title;
    }

    const clampedFocus =
      items.length === 0
        ? -1
        : state.focusedIndex >= items.length
          ? items.length - 1
          : state.focusedIndex;

    const validItemIds = new Set(items.map((item) => String(item.id)));
    const prunedSelectedIds = (state.selectedIds || []).filter((id) =>
      validItemIds.has(String(id))
    );
    const clampedAnchor =
      items.length === 0 || state.selectionAnchorIndex >= items.length
        ? -1
        : state.selectionAnchorIndex;

    setState({
      folders,
      rootFolderValid: true,
      currentFolderId: activeFolderId,
      currentFolderTitle,
      breadcrumbs: breadcrumbs || [],
      items,
      focusedIndex: clampedFocus,
      selectedIds: prunedSelectedIds,
      selectionAnchorIndex: clampedAnchor,
    });

    return state;
  }

  /**
   * Initializes store by loading persisted settings and bookmark tree.
   */
  async function init() {
    const settings = await loadSettings();
    state = {
      ...state,
      initialized: true,
      settings,
      currentFolderId: settings.rootFolderId,
    };
    return refresh();
  }

  /**
   * Updates user settings (e.g. theme, accentColor, density, rootFolderId) and persists them.
   * @param {Partial<typeof DEFAULT_SETTINGS>} partial
   */
  async function updateSettings(partial) {
    const rootChanged =
      partial.rootFolderId !== undefined &&
      partial.rootFolderId !== state.settings.rootFolderId;

    const saved = await saveSettings(partial);
    state = {
      ...state,
      settings: saved,
      ...(rootChanged
        ? {
            currentFolderId: saved.rootFolderId,
            searchQuery: '',
            focusedIndex: -1,
            selectedIds: [],
            selectionAnchorIndex: -1,
          }
        : {}),
    };

    return refresh();
  }

  /**
   * Sets the root bookmark folder and navigates to it.
   * @param {string} folderId
   */
  async function selectRootFolder(folderId) {
    return updateSettings({ rootFolderId: folderId });
  }

  /**
   * Drills down (or up via breadcrumbs) into a subfolder inside the root folder.
   * Clears any active search query so the user sees the folder's contents.
   * @param {string} folderId
   */
  async function navigateToFolder(folderId) {
    if (!state.settings.rootFolderId) return state;

    const path = await getGlobalFolderTrail(
      state.settings.rootFolderId,
      String(folderId)
    );
    if (!path) {
      return state;
    }

    state = {
      ...state,
      currentFolderId: String(folderId),
      searchQuery: '',
      focusedIndex: -1,
      selectedIds: [],
      selectionAnchorIndex: -1,
    };
    return refresh();
  }

  /**
   * Navigates one level up in the breadcrumb trail if currently in a subfolder.
   * @returns {Promise<boolean>} True if navigated up, false if already at root.
   */
  async function navigateUp() {
    if (state.breadcrumbs.length <= 1) {
      return false;
    }
    const parentCrumb = state.breadcrumbs[state.breadcrumbs.length - 2];
    await navigateToFolder(parentCrumb.id);
    return true;
  }

  /**
   * Sets the search query and refreshes the displayed items.
   * @param {string} query
   */
  async function setSearchQuery(query) {
    const cleanQuery = query ?? '';
    state = {
      ...state,
      searchQuery: cleanQuery,
      focusedIndex: cleanQuery.trim() ? 0 : -1,
      selectedIds: [],
      selectionAnchorIndex: -1,
    };
    return refresh();
  }

  /**
   * Sets the keyboard-focused item index directly.
   * @param {number} index
   */
  function setFocusedIndex(index) {
    if (state.items.length === 0) {
      setState({ focusedIndex: -1, selectionAnchorIndex: -1 });
      return;
    }
    const clamped = Math.max(-1, Math.min(index, state.items.length - 1));
    setState({
      focusedIndex: clamped,
      selectionAnchorIndex: clamped,
    });
  }

  /**
   * Moves keyboard focus across the grid by `delta` steps.
   * When `extendSelection` is true (e.g. Shift + Arrow), extends selection from the anchor index.
   * @param {number} delta
   * @param {{ extendSelection?: boolean }} [options]
   */
  function moveFocus(delta, { extendSelection = false } = {}) {
    const count = state.items.length;
    if (count === 0) return;

    if (extendSelection) {
      const anchor =
        state.selectionAnchorIndex >= 0 && state.selectionAnchorIndex < count
          ? state.selectionAnchorIndex
          : state.focusedIndex >= 0 && state.focusedIndex < count
            ? state.focusedIndex
            : delta >= 0
              ? 0
              : count - 1;

      const nextFocus =
        state.focusedIndex === -1
          ? anchor
          : Math.max(0, Math.min(count - 1, state.focusedIndex + delta));

      const start = Math.min(anchor, nextFocus);
      const end = Math.max(anchor, nextFocus);
      const rangeIds = state.items
        .slice(start, end + 1)
        .map((item) => String(item.id));

      setState({
        focusedIndex: nextFocus,
        selectionAnchorIndex: anchor,
        selectedIds: rangeIds,
      });
      return;
    }

    if (state.focusedIndex === -1) {
      const initial = delta >= 0 ? 0 : count - 1;
      setState({
        focusedIndex: initial,
        selectionAnchorIndex: initial,
        selectedIds: [],
      });
      return;
    }

    const next = Math.max(0, Math.min(count - 1, state.focusedIndex + delta));
    setState({
      focusedIndex: next,
      selectionAnchorIndex: next,
      selectedIds: [],
    });
  }

  /**
   * Sets the selected item IDs directly (used by marquee drag selection).
   * @param {Array<string>} ids
   * @param {number} [anchorIndex]
   */
  function setSelection(ids, anchorIndex) {
    const validIds = new Set(state.items.map((item) => String(item.id)));
    const seen = new Set();
    const nextSelected = [];

    for (const rawId of ids || []) {
      const id = String(rawId);
      if (validIds.has(id) && !seen.has(id)) {
        seen.add(id);
        nextSelected.push(id);
      }
    }

    const patch = { selectedIds: nextSelected };
    if (typeof anchorIndex === 'number') {
      patch.selectionAnchorIndex = anchorIndex;
      patch.focusedIndex = anchorIndex;
    } else if (nextSelected.length > 0 && state.selectionAnchorIndex === -1) {
      const firstIdx = state.items.findIndex(
        (item) => String(item.id) === nextSelected[0]
      );
      if (firstIdx !== -1) {
        patch.selectionAnchorIndex = firstIdx;
      }
    }

    setState(patch);
  }

  /**
   * Toggles selection state of a single item and updates the anchor/focus index.
   * @param {string} id
   * @param {number} [index]
   */
  function toggleSelectItem(id, index) {
    const targetId = String(id);
    const itemIdx =
      typeof index === 'number'
        ? index
        : state.items.findIndex((item) => String(item.id) === targetId);
    if (itemIdx < 0 || itemIdx >= state.items.length) return;

    const exists = state.selectedIds.includes(targetId);
    const nextSelected = exists
      ? state.selectedIds.filter((item) => item !== targetId)
      : [...state.selectedIds, targetId];

    setState({
      selectedIds: nextSelected,
      focusedIndex: itemIdx,
      selectionAnchorIndex: itemIdx,
    });
  }

  /**
   * Selects a contiguous range of items from the current anchor (or focused item)
   * to `targetIndex` inclusive (used by Shift + Click).
   * @param {number} targetIndex
   * @param {{ additive?: boolean }} [options]
   */
  function selectRange(targetIndex, { additive = false } = {}) {
    const count = state.items.length;
    if (count === 0) return;

    const clampedTarget = Math.max(0, Math.min(count - 1, targetIndex));
    const anchor =
      state.selectionAnchorIndex >= 0 && state.selectionAnchorIndex < count
        ? state.selectionAnchorIndex
        : state.focusedIndex >= 0 && state.focusedIndex < count
          ? state.focusedIndex
          : clampedTarget;

    const start = Math.min(anchor, clampedTarget);
    const end = Math.max(anchor, clampedTarget);
    const rangeIds = state.items
      .slice(start, end + 1)
      .map((item) => String(item.id));

    const nextSelected = additive
      ? Array.from(new Set([...state.selectedIds, ...rangeIds]))
      : rangeIds;

    setState({
      selectedIds: nextSelected,
      selectionAnchorIndex: anchor,
      focusedIndex: clampedTarget,
    });
  }

  /**
   * Selects all items in the current view.
   */
  function selectAll() {
    if (state.items.length === 0) return;
    setState({
      selectedIds: state.items.map((item) => String(item.id)),
      selectionAnchorIndex:
        state.selectionAnchorIndex >= 0 ? state.selectionAnchorIndex : 0,
      focusedIndex: state.focusedIndex >= 0 ? state.focusedIndex : 0,
    });
  }

  /**
   * Clears all selected items.
   */
  function clearSelection() {
    if (state.selectedIds.length === 0 && state.selectionAnchorIndex === -1) {
      return;
    }
    setState({
      selectedIds: [],
      selectionAnchorIndex: -1,
    });
  }

  return {
    getState,
    subscribe,
    init,
    refresh,
    updateSettings,
    selectRootFolder,
    navigateToFolder,
    navigateUp,
    setSearchQuery,
    setFocusedIndex,
    moveFocus,
    setSelection,
    toggleSelectItem,
    selectRange,
    selectAll,
    clearSelection,
  };
}
