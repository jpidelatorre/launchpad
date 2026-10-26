/**
 * Entry point for the Launchpad Chrome Extension (New Tab page).
 */

import {
  createItem,
  groupItemsIntoNewFolder,
  onBookmarksChanged,
  recordBookmarkUsed,
  removeItem,
  removeItems,
  sortFolderContents,
  updateItem,
} from './services/bookmarks.js';
import { onSettingsChanged } from './services/storage.js';
import { createLaunchpadStore } from './state/store.js';
import { setupDragAndDrop } from './ui/dragdrop.js';
import { setupKeyboardNavigation } from './ui/keyboard.js';
import {
  applyThemeAndSettings,
  renderBreadcrumbs,
  renderFolderOptions,
  renderLaunchpadMain,
} from './ui/renderer.js';
import { setupMarqueeSelection } from './ui/selection.js';

const ACCENT_PRESETS = [
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Rose', hex: '#f43f5e' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Cyan', hex: '#06b6d4' },
  { name: 'Violet', hex: '#8b5cf6' },
];

export async function bootstrapLaunchpad() {
  const store = createLaunchpadStore();

  // DOM References
  const breadcrumbEl = document.getElementById('breadcrumb-nav');
  const searchInput = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search-btn');
  const toolbarActionsEl = document.getElementById('toolbar-actions');
  const addBookmarkBtn = document.getElementById('add-bookmark-btn');
  const addFolderBtn = document.getElementById('add-folder-btn');
  const sortDropdownEl = document.getElementById('sort-dropdown');
  const sortMenuBtn = document.getElementById('sort-menu-btn');
  const sortMenuPopover = document.getElementById('sort-menu-popover');
  const sortFoldersFirstCheckbox = document.getElementById(
    'sort-folders-first-checkbox'
  );
  const sortDirButtons = document.querySelectorAll('[data-sort-dir]');
  const sortByButtons = document.querySelectorAll('[data-sort-by]');
  const settingsBtn = document.getElementById('settings-btn');
  const shortcutsBtn = document.getElementById('shortcuts-btn');

  const onboardingEl = document.getElementById('onboarding-card');
  const onboardingSelectEl = document.getElementById('onboarding-folder-select');
  const onboardingSaveBtn = document.getElementById('onboarding-save-btn');

  const workspaceEl = document.querySelector('.main-content');
  const gridEl = document.getElementById('launchpad-grid');
  const marqueeEl = document.getElementById('selection-marquee');
  const emptyStateEl = document.getElementById('empty-state');
  const emptyStateTitleEl = document.getElementById('empty-state-title');
  const emptyStateDescEl = document.getElementById('empty-state-desc');
  const emptyAddBookmarkBtn = document.getElementById('empty-add-bookmark-btn');

  // Selection Toolbar Controls
  const selectionBarEl = document.getElementById('selection-bar');
  const selectionCountLabel = document.getElementById('selection-count-label');
  const selectionOpenBtn = document.getElementById('selection-open-btn');
  const selectionGroupBtn = document.getElementById('selection-group-btn');
  const selectionDeleteBtn = document.getElementById('selection-delete-btn');
  const selectionClearBtn = document.getElementById('selection-clear-btn');

  // Item Editor Modal
  const itemDialog = document.getElementById('item-dialog');
  const itemForm = document.getElementById('item-form');
  const itemDialogTitle = document.getElementById('item-dialog-title');
  const itemTitleInput = document.getElementById('item-title-input');
  const itemUrlGroup = document.getElementById('item-url-group');
  const itemUrlInput = document.getElementById('item-url-input');
  const itemFormError = document.getElementById('item-form-error');
  const itemCancelBtn = document.getElementById('item-cancel-btn');

  // Delete Confirmation Modal
  const deleteDialog = document.getElementById('delete-dialog');
  const deleteDialogMessage = document.getElementById('delete-dialog-message');
  const deleteCancelBtn = document.getElementById('delete-cancel-btn');
  const deleteConfirmBtn = document.getElementById('delete-confirm-btn');

  // Settings Modal
  const settingsDialog = document.getElementById('settings-dialog');
  const settingsRootSelect = document.getElementById('settings-root-select');
  const themeButtons = document.querySelectorAll('[data-theme-option]');
  const densityButtons = document.querySelectorAll('[data-density-option]');
  const iconSizeField = document.getElementById('icon-size-field');
  const iconSizeButtons = document.querySelectorAll('[data-icon-size-option]');
  const accentPresetsContainer = document.getElementById('accent-presets');
  const customAccentInput = document.getElementById('custom-accent-input');
  const openNewTabCheckbox = document.getElementById('open-new-tab-checkbox');
  const settingsCloseBtn = document.getElementById('settings-close-btn');

  // Shortcuts Modal
  const shortcutsDialog = document.getElementById('shortcuts-dialog');
  const shortcutsCloseBtn = document.getElementById('shortcuts-close-btn');

  // Toast element
  const toastEl = document.getElementById('launchpad-toast');

  let editingContext = null; // { mode: 'create' | 'edit', isFolder: boolean, item?: object }
  let pendingDeleteItem = null;
  let pendingDeleteItems = null;
  let toastTimeout = null;

  function showToast(message, isError = false) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.dataset.variant = isError ? 'error' : 'info';
    toastEl.hidden = false;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastEl.hidden = true;
    }, 3200);
  }

  function isAnyModalOpen() {
    return Boolean(
      itemDialog?.open ||
        deleteDialog?.open ||
        settingsDialog?.open ||
        shortcutsDialog?.open
    );
  }

  function handleActivateItem(item, forceNewTab = false) {
    if (!item) return;
    if (item.isFolder) {
      searchInput.value = '';
      store.navigateToFolder(item.id);
      return;
    }

    if (!item.url) return;
    recordBookmarkUsed(item.id);
    const state = store.getState();
    const shouldOpenNewTab = forceNewTab || state.settings.openInNewTab;
    if (shouldOpenNewTab) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.assign(item.url);
    }
  }

  function openCreateModal(isFolder = false) {
    const state = store.getState();
    if (!state.rootFolderValid || !state.currentFolderId) return;

    editingContext = { mode: 'create', isFolder };
    itemDialogTitle.textContent = isFolder ? 'New Subfolder' : 'New Bookmark';
    itemTitleInput.value = '';
    itemUrlInput.value = '';
    itemUrlGroup.hidden = isFolder;
    itemUrlInput.required = !isFolder;
    itemFormError.hidden = true;
    itemDialog.showModal();
    itemTitleInput.focus();
  }

  function openEditModal(item) {
    if (!item) return;
    editingContext = { mode: 'edit', isFolder: Boolean(item.isFolder), item };
    itemDialogTitle.textContent = item.isFolder
      ? 'Rename Folder'
      : 'Edit Bookmark';
    itemTitleInput.value = item.title || '';
    itemUrlInput.value = item.url || '';
    itemUrlGroup.hidden = Boolean(item.isFolder);
    itemUrlInput.required = !item.isFolder;
    itemFormError.hidden = true;
    itemDialog.showModal();
    itemTitleInput.focus();
    itemTitleInput.select();
  }

  function openGroupSelectedModal(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const state = store.getState();
    if (!state.rootFolderValid || !state.currentFolderId) return;

    editingContext = { mode: 'group', isFolder: true, items };
    const itemLabel = items.length === 1 ? '1 Item' : `${items.length} Items`;
    itemDialogTitle.textContent = `Group ${itemLabel} into Folder`;
    itemTitleInput.value = '';
    itemUrlInput.value = '';
    itemUrlGroup.hidden = true;
    itemUrlInput.required = false;
    itemFormError.hidden = true;
    itemDialog.showModal();
    itemTitleInput.focus();
  }

  function openDeleteModal(item) {
    if (!item) return;
    pendingDeleteItem = item;
    pendingDeleteItems = null;
    if (item.isFolder) {
      deleteDialogMessage.textContent = `Are you sure you want to delete the folder "${item.title}" and all ${item.childCount} item(s) inside it?`;
    } else {
      deleteDialogMessage.textContent = `Are you sure you want to delete "${item.title}"?`;
    }
    deleteDialog.showModal();
    deleteConfirmBtn.focus();
  }

  function openDeleteSelectedModal(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    if (items.length === 1) {
      openDeleteModal(items[0]);
      return;
    }
    pendingDeleteItem = null;
    pendingDeleteItems = items;
    const folderCount = items.filter((i) => i.isFolder).length;
    if (folderCount > 0) {
      deleteDialogMessage.textContent = `Are you sure you want to delete ${items.length} selected items (including ${folderCount} folder(s) and their contents)?`;
    } else {
      deleteDialogMessage.textContent = `Are you sure you want to delete ${items.length} selected bookmarks?`;
    }
    deleteDialog.showModal();
    deleteConfirmBtn.focus();
  }

  function handleActivateSelected(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    if (items.length === 1) {
      handleActivateItem(items[0], false);
      return;
    }
    const bookmarks = items.filter((item) => !item.isFolder && item.url);
    if (bookmarks.length === 0) {
      showToast('Select at least one bookmark to open in new tabs.');
      return;
    }
    for (const bm of bookmarks) {
      recordBookmarkUsed(bm.id);
      window.open(bm.url, '_blank', 'noopener,noreferrer');
    }
  }

  function syncSettingsModalControls(state) {
    renderFolderOptions(
      settingsRootSelect,
      state.folders,
      state.settings.rootFolderId
    );

    themeButtons.forEach((btn) => {
      btn.classList.toggle(
        'is-selected',
        btn.dataset.themeOption === state.settings.theme
      );
    });

    densityButtons.forEach((btn) => {
      btn.classList.toggle(
        'is-selected',
        btn.dataset.densityOption === state.settings.density
      );
    });

    if (iconSizeField) {
      iconSizeField.hidden = state.settings.density !== 'icon';
    }

    iconSizeButtons.forEach((btn) => {
      btn.classList.toggle(
        'is-selected',
        btn.dataset.iconSizeOption === state.settings.iconSize
      );
    });

    customAccentInput.value = state.settings.accentColor;
    openNewTabCheckbox.checked = Boolean(state.settings.openInNewTab);

    accentPresetsContainer
      .querySelectorAll('.accent-swatch')
      .forEach((swatch) => {
        swatch.classList.toggle(
          'is-selected',
          swatch.dataset.hex === state.settings.accentColor.toLowerCase()
        );
      });
  }

  function openSettingsModal() {
    syncSettingsModalControls(store.getState());
    settingsDialog.showModal();
  }

  // Render accent color swatches inside Settings
  ACCENT_PRESETS.forEach((preset) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'accent-swatch';
    btn.dataset.hex = preset.hex;
    btn.title = preset.name;
    btn.setAttribute('aria-label', `${preset.name} accent color`);
    btn.style.backgroundColor = preset.hex;
    btn.addEventListener('click', () => {
      store.updateSettings({ accentColor: preset.hex });
    });
    accentPresetsContainer.appendChild(btn);
  });

  // Subscribe to store updates
  store.subscribe((state) => {
    applyThemeAndSettings(state.settings);
    clearSearchBtn.hidden = !state.searchQuery;

    renderBreadcrumbs(breadcrumbEl, state, (folderId) => {
      searchInput.value = '';
      store.navigateToFolder(folderId);
    });

    renderLaunchpadMain({
      gridEl,
      onboardingEl,
      onboardingSelectEl,
      emptyStateEl,
      emptyStateTitleEl,
      emptyStateDescEl,
      toolbarActionsEl,
      state,
      onActivateItem: handleActivateItem,
      onEditItem: openEditModal,
      onDeleteItem: openDeleteModal,
      onFocusItem: (idx) => {
        store.clearSelection();
        store.setFocusedIndex(idx);
      },
      onShiftSelect: (idx) => store.selectRange(idx),
    });

    if (selectionBarEl) {
      const selCount = state.selectedIds ? state.selectedIds.length : 0;
      selectionBarEl.hidden = selCount === 0;
      if (selectionCountLabel) {
        selectionCountLabel.textContent = `${selCount} selected`;
      }
    }

    if (settingsDialog.open) {
      syncSettingsModalControls(state);
    }

    if (sortFoldersFirstCheckbox) {
      sortFoldersFirstCheckbox.checked = Boolean(state.settings.foldersFirst);
    }
    sortDirButtons.forEach((btn) => {
      btn.classList.toggle(
        'is-selected',
        btn.dataset.sortDir === (state.settings.sortDirection || 'asc')
      );
    });
  });

  // Search Input Events
  searchInput.addEventListener('input', (e) => {
    store.setSearchQuery(e.target.value);
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    store.setSearchQuery('');
    searchInput.focus();
  });

  // Onboarding Root Folder Selection
  onboardingSaveBtn.addEventListener('click', async () => {
    const selected = onboardingSelectEl.value;
    if (!selected) {
      showToast('Please select a bookmark folder first.', true);
      return;
    }
    await store.selectRootFolder(selected);
    showToast('Launchpad folder configured!');
  });

  // Toolbar Buttons
  addBookmarkBtn.addEventListener('click', () => openCreateModal(false));
  addFolderBtn.addEventListener('click', () => openCreateModal(true));
  emptyAddBookmarkBtn.addEventListener('click', () => openCreateModal(false));
  settingsBtn.addEventListener('click', openSettingsModal);
  shortcutsBtn.addEventListener('click', () => shortcutsDialog.showModal());

  // Sort Menu Popover Logic
  function closeSortMenu() {
    if (!sortMenuPopover) return;
    sortMenuPopover.hidden = true;
    sortMenuBtn?.setAttribute('aria-expanded', 'false');
  }

  sortMenuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = sortMenuPopover.hidden;
    sortMenuPopover.hidden = !isHidden;
    sortMenuBtn.setAttribute('aria-expanded', String(isHidden));
  });

  document.addEventListener('click', (e) => {
    if (
      sortMenuPopover &&
      !sortMenuPopover.hidden &&
      !sortDropdownEl?.contains(e.target)
    ) {
      closeSortMenu();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sortMenuPopover && !sortMenuPopover.hidden) {
      closeSortMenu();
    }
  });

  sortFoldersFirstCheckbox?.addEventListener('change', async (e) => {
    const foldersFirst = Boolean(e.target.checked);
    await store.updateSettings({ foldersFirst });
    const state = store.getState();
    if (foldersFirst && state.currentFolderId && !state.searchQuery.trim()) {
      await sortFolderContents(state.currentFolderId, {
        sortBy: 'foldersOnly',
        foldersFirst: true,
      });
      await store.refresh();
      showToast('Folders moved to top.');
    }
  });

  sortDirButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      store.updateSettings({ sortDirection: btn.dataset.sortDir });
    });
  });

  const SORT_LABELS = {
    name: 'Name',
    dateAdded: 'Date Added',
    lastActivity: 'Last Opened / Modified',
  };

  sortByButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sortBy = btn.dataset.sortBy;
      const state = store.getState();
      if (!state.currentFolderId) return;

      closeSortMenu();
      try {
        await sortFolderContents(state.currentFolderId, {
          sortBy,
          sortDirection: state.settings.sortDirection || 'asc',
          foldersFirst: Boolean(state.settings.foldersFirst),
        });
        await store.refresh();
        showToast(`Sorted by ${SORT_LABELS[sortBy] || sortBy}.`);
      } catch (err) {
        showToast(err.message || 'Unable to sort folder.', true);
      }
    });
  });

  // Create / Edit Form Submit
  itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingContext) return;

    const title = itemTitleInput.value.trim();
    const url = editingContext.isFolder ? undefined : itemUrlInput.value.trim();
    const state = store.getState();

    try {
      if (editingContext.mode === 'create') {
        await createItem({
          parentId: state.currentFolderId,
          title,
          url,
        });
        showToast(
          editingContext.isFolder ? 'Subfolder created.' : 'Bookmark added.'
        );
      } else if (editingContext.mode === 'edit' && editingContext.item) {
        await updateItem(editingContext.item.id, {
          title,
          ...(editingContext.isFolder ? {} : { url }),
        });
        showToast('Changes saved.');
      } else if (editingContext.mode === 'group' && editingContext.items) {
        const itemIds = editingContext.items.map((item) => item.id);
        await groupItemsIntoNewFolder({
          parentId: state.currentFolderId,
          title,
          itemIds,
        });
        store.clearSelection();
        showToast(
          `Grouped ${itemIds.length} ${itemIds.length === 1 ? 'item' : 'items'} into "${title}".`
        );
      }
      itemDialog.close();
      editingContext = null;
      await store.refresh();
    } catch (err) {
      itemFormError.textContent = err.message || 'Could not save item.';
      itemFormError.hidden = false;
    }
  });

  itemCancelBtn.addEventListener('click', () => {
    itemDialog.close();
    editingContext = null;
  });

  // Delete Confirmation Events
  deleteCancelBtn.addEventListener('click', () => {
    deleteDialog.close();
    pendingDeleteItem = null;
    pendingDeleteItems = null;
  });

  deleteConfirmBtn.addEventListener('click', async () => {
    if (pendingDeleteItems && pendingDeleteItems.length > 0) {
      const count = pendingDeleteItems.length;
      try {
        await removeItems(pendingDeleteItems);
        deleteDialog.close();
        pendingDeleteItems = null;
        store.clearSelection();
        showToast(`Deleted ${count} items.`);
        await store.refresh();
      } catch (err) {
        deleteDialog.close();
        pendingDeleteItems = null;
        showToast(err.message || 'Failed to delete selected items.', true);
      }
      return;
    }

    if (!pendingDeleteItem) return;
    try {
      await removeItem(pendingDeleteItem.id, Boolean(pendingDeleteItem.isFolder));
      deleteDialog.close();
      showToast(`Deleted "${pendingDeleteItem.title}".`);
      pendingDeleteItem = null;
      await store.refresh();
    } catch (err) {
      deleteDialog.close();
      showToast(err.message || 'Failed to delete item.', true);
    }
  });

  // Selection Bar Button Events
  function getSelectedItemsFromState() {
    const state = store.getState();
    const selectedSet = new Set((state.selectedIds || []).map((id) => String(id)));
    return state.items.filter((item) => selectedSet.has(String(item.id)));
  }

  selectionOpenBtn?.addEventListener('click', () => {
    handleActivateSelected(getSelectedItemsFromState());
  });

  selectionGroupBtn?.addEventListener('click', () => {
    openGroupSelectedModal(getSelectedItemsFromState());
  });

  selectionDeleteBtn?.addEventListener('click', () => {
    openDeleteSelectedModal(getSelectedItemsFromState());
  });

  selectionClearBtn?.addEventListener('click', () => {
    store.clearSelection();
  });

  // Settings Modal Controls
  settingsRootSelect.addEventListener('change', (e) => {
    if (e.target.value) {
      store.selectRootFolder(e.target.value);
      showToast('Root bookmark folder updated.');
    }
  });

  themeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      store.updateSettings({ theme: btn.dataset.themeOption });
    });
  });

  densityButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      store.updateSettings({ density: btn.dataset.densityOption });
    });
  });

  iconSizeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      store.updateSettings({ iconSize: btn.dataset.iconSizeOption });
    });
  });

  customAccentInput.addEventListener('input', (e) => {
    store.updateSettings({ accentColor: e.target.value });
  });

  openNewTabCheckbox.addEventListener('change', (e) => {
    store.updateSettings({ openInNewTab: e.target.checked });
  });

  settingsCloseBtn.addEventListener('click', () => settingsDialog.close());
  shortcutsCloseBtn.addEventListener('click', () => shortcutsDialog.close());

  // Close dialogs when clicking on backdrop
  [itemDialog, deleteDialog, settingsDialog, shortcutsDialog].forEach((dlg) => {
    dlg?.addEventListener('click', (e) => {
      if (e.target === dlg) {
        dlg.close();
      }
    });
  });

  // Setup Marquee Selection, Drag & Drop, and Keyboard Shortcuts
  setupMarqueeSelection({
    workspaceEl,
    gridEl,
    marqueeEl,
    store,
    isModalOpen: isAnyModalOpen,
  });

  setupDragAndDrop({
    gridEl,
    breadcrumbEl,
    store,
    onError: (msg) => showToast(msg, true),
  });

  setupKeyboardNavigation({
    store,
    searchInput,
    gridEl,
    onActivateItem: handleActivateItem,
    onActivateSelected: handleActivateSelected,
    onRequestCreate: openCreateModal,
    onRequestEdit: openEditModal,
    onRequestDelete: openDeleteModal,
    onRequestDeleteSelected: openDeleteSelectedModal,
    onRequestGroupSelected: openGroupSelectedModal,
    onRequestSettings: openSettingsModal,
    isModalOpen: isAnyModalOpen,
  });

  // Listen to external Chrome Bookmark / Storage changes
  onBookmarksChanged(() => {
    store.refresh();
  });

  onSettingsChanged(() => {
    store.init();
  });

  await store.init();
  return store;
}

if (typeof document !== 'undefined' && document.getElementById('launchpad-app')) {
  bootstrapLaunchpad();
}
