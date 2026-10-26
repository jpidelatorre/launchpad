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
  getBreadcrumbPath,
  getFolderContents,
  getFolderList,
  searchInSubtree,
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
      });
      return state;
    }

    // Ensure currentFolderId is inside rootId; otherwise reset to rootId
    let activeFolderId = state.currentFolderId || rootId;
    let breadcrumbs = await getBreadcrumbPath(rootId, activeFolderId);

    if (!breadcrumbs) {
      activeFolderId = rootId;
      breadcrumbs = await getBreadcrumbPath(rootId, rootId);
    }

    const query = state.searchQuery.trim();
    let items = [];
    let currentFolderTitle = rootContents.folder.title;

    if (query) {
      items = await searchInSubtree(rootId, query);
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

    setState({
      folders,
      rootFolderValid: true,
      currentFolderId: activeFolderId,
      currentFolderTitle,
      breadcrumbs: breadcrumbs || [],
      items,
      focusedIndex: clampedFocus,
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

    const path = await getBreadcrumbPath(
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
    };
    return refresh();
  }

  /**
   * Sets the keyboard-focused item index directly.
   * @param {number} index
   */
  function setFocusedIndex(index) {
    if (state.items.length === 0) {
      setState({ focusedIndex: -1 });
      return;
    }
    const clamped = Math.max(-1, Math.min(index, state.items.length - 1));
    setState({ focusedIndex: clamped });
  }

  /**
   * Moves keyboard focus across the grid by `delta` steps.
   * @param {number} delta
   */
  function moveFocus(delta) {
    const count = state.items.length;
    if (count === 0) return;

    if (state.focusedIndex === -1) {
      const initial = delta >= 0 ? 0 : count - 1;
      setState({ focusedIndex: initial });
      return;
    }

    const next = Math.max(0, Math.min(count - 1, state.focusedIndex + delta));
    setState({ focusedIndex: next });
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
  };
}
