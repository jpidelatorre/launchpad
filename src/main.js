/**
 * Entry point for the Launchpad Chrome Extension (New Tab page).
 */

import {
  createItem,
  onBookmarksChanged,
  removeItem,
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
  const settingsBtn = document.getElementById('settings-btn');
  const shortcutsBtn = document.getElementById('shortcuts-btn');

  const onboardingEl = document.getElementById('onboarding-card');
  const onboardingSelectEl = document.getElementById('onboarding-folder-select');
  const onboardingSaveBtn = document.getElementById('onboarding-save-btn');

  const gridEl = document.getElementById('launchpad-grid');
  const emptyStateEl = document.getElementById('empty-state');
  const emptyStateTitleEl = document.getElementById('empty-state-title');
  const emptyStateDescEl = document.getElementById('empty-state-desc');
  const emptyAddBookmarkBtn = document.getElementById('empty-add-bookmark-btn');

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

  function openDeleteModal(item) {
    if (!item) return;
    pendingDeleteItem = item;
    if (item.isFolder) {
      deleteDialogMessage.textContent = `Are you sure you want to delete the folder "${item.title}" and all ${item.childCount} item(s) inside it?`;
    } else {
      deleteDialogMessage.textContent = `Are you sure you want to delete "${item.title}"?`;
    }
    deleteDialog.showModal();
    deleteConfirmBtn.focus();
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
      onFocusItem: (idx) => store.setFocusedIndex(idx),
    });

    if (settingsDialog.open) {
      syncSettingsModalControls(state);
    }
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
  });

  deleteConfirmBtn.addEventListener('click', async () => {
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

  // Setup Drag & Drop and Keyboard Shortcuts
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
    onRequestCreate: openCreateModal,
    onRequestEdit: openEditModal,
    onRequestDelete: openDeleteModal,
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
