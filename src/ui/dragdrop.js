/**
 * Drag-and-drop controller for reordering tiles and moving items into folders or breadcrumbs.
 */

import { moveItem } from '../services/bookmarks.js';

/**
 * Pure helper that calculates the target index for `moveItem` when dropping `draggedId`
 * `'before'` or `'after'` `targetId` within `items`.
 * Note: Chrome's `bookmarks.move(id, { parentId, index })` expects the index in the
 * parent's children array *before* removal when moving to a higher index in Chrome,
 * and our `moveItem` normalizes that behavior.
 *
 * @param {Array<{ id: string, index?: number }>} items
 * @param {string} draggedId
 * @param {string} targetId
 * @param {'before' | 'after'} position
 * @returns {number | null}
 */
export function calculateReorderIndex(items, draggedId, targetId, position) {
  if (!Array.isArray(items) || draggedId === targetId) return null;

  const targetIdx = items.findIndex((item) => item.id === String(targetId));
  const draggedIdx = items.findIndex((item) => item.id === String(draggedId));
  if (targetIdx === -1 || draggedIdx === -1) return null;

  const targetItem = items[targetIdx];
  const baseIndex =
    typeof targetItem.index === 'number' ? targetItem.index : targetIdx;

  return position === 'after' ? baseIndex + 1 : baseIndex;
}

/**
 * Attaches HTML5 drag-and-drop listeners to the grid container and breadcrumb container.
 * @param {{
 *   gridEl: HTMLElement,
 *   breadcrumbEl: HTMLElement,
 *   store: ReturnType<import('../state/store.js').createLaunchpadStore>,
 *   onError?: (message: string) => void
 * }} options
 */
export function setupDragAndDrop({ gridEl, breadcrumbEl, store, onError }) {
  let draggedId = null;

  function clearDropIndicators() {
    const active = document.querySelectorAll(
      '.drag-over-before, .drag-over-after, .drag-over-folder, .dragging'
    );
    active.forEach((el) => {
      el.classList.remove(
        'drag-over-before',
        'drag-over-after',
        'drag-over-folder',
        'dragging'
      );
    });
  }

  function getDropZone(cardEl, clientX, clientY, isListDensity) {
    const rect = cardEl.getBoundingClientRect();
    const isFolder = cardEl.dataset.isFolder === 'true';

    const ratio = isListDensity
      ? (clientY - rect.top) / Math.max(1, rect.height)
      : (clientX - rect.left) / Math.max(1, rect.width);

    if (isFolder && ratio > 0.25 && ratio < 0.75) {
      return 'inside';
    }
    return ratio <= 0.5 ? 'before' : 'after';
  }

  gridEl.addEventListener('dragstart', (e) => {
    const state = store.getState();
    // Disable drag reordering while filtering via search query
    if (state.searchQuery.trim() !== '') {
      e.preventDefault();
      return;
    }

    const card = e.target.closest('[data-item-id]');
    if (!card) return;

    draggedId = card.dataset.itemId;
    card.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedId);
    }
  });

  gridEl.addEventListener('dragend', () => {
    draggedId = null;
    clearDropIndicators();
  });

  gridEl.addEventListener('dragover', (e) => {
    if (!draggedId) return;
    const card = e.target.closest('[data-item-id]');
    if (!card || card.dataset.itemId === draggedId) return;

    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }

    const state = store.getState();
    const isList = state.settings.density === 'list';
    const zone = getDropZone(card, e.clientX, e.clientY, isList);

    card.classList.remove(
      'drag-over-before',
      'drag-over-after',
      'drag-over-folder'
    );
    if (zone === 'inside') {
      card.classList.add('drag-over-folder');
    } else if (zone === 'before') {
      card.classList.add('drag-over-before');
    } else {
      card.classList.add('drag-over-after');
    }
  });

  gridEl.addEventListener('dragleave', (e) => {
    const card = e.target.closest('[data-item-id]');
    if (!card) return;
    if (!card.contains(e.relatedTarget)) {
      card.classList.remove(
        'drag-over-before',
        'drag-over-after',
        'drag-over-folder'
      );
    }
  });

  gridEl.addEventListener('drop', async (e) => {
    if (!draggedId) return;
    const card = e.target.closest('[data-item-id]');
    const sourceId = draggedId;
    draggedId = null;
    clearDropIndicators();

    if (!card) return;
    const targetId = card.dataset.itemId;
    if (!targetId || targetId === sourceId) return;

    e.preventDefault();
    const state = store.getState();
    const isList = state.settings.density === 'list';
    const zone = getDropZone(card, e.clientX, e.clientY, isList);

    try {
      if (zone === 'inside' && card.dataset.isFolder === 'true') {
        await moveItem(sourceId, { parentId: targetId });
      } else {
        const position = zone === 'before' ? 'before' : 'after';
        const newIndex = calculateReorderIndex(
          state.items,
          sourceId,
          targetId,
          position
        );
        if (newIndex !== null && state.currentFolderId) {
          await moveItem(sourceId, {
            parentId: state.currentFolderId,
            index: newIndex,
          });
        }
      }
      await store.refresh();
    } catch (err) {
      onError?.(err.message || 'Unable to move item.');
    }
  });

  // Allow dropping items onto breadcrumb folders to move them up the hierarchy
  breadcrumbEl.addEventListener('dragover', (e) => {
    if (!draggedId) return;
    const crumb = e.target.closest('[data-folder-id]');
    if (!crumb) return;

    const targetFolderId = crumb.dataset.folderId;
    const state = store.getState();
    if (
      !targetFolderId ||
      targetFolderId === state.currentFolderId ||
      targetFolderId === draggedId
    ) {
      return;
    }

    e.preventDefault();
    crumb.classList.add('drag-over-folder');
  });

  breadcrumbEl.addEventListener('dragleave', (e) => {
    const crumb = e.target.closest('[data-folder-id]');
    if (crumb && !crumb.contains(e.relatedTarget)) {
      crumb.classList.remove('drag-over-folder');
    }
  });

  breadcrumbEl.addEventListener('drop', async (e) => {
    if (!draggedId) return;
    const crumb = e.target.closest('[data-folder-id]');
    const sourceId = draggedId;
    draggedId = null;
    clearDropIndicators();

    if (!crumb) return;
    const targetFolderId = crumb.dataset.folderId;
    const state = store.getState();
    if (
      !targetFolderId ||
      targetFolderId === state.currentFolderId ||
      targetFolderId === sourceId
    ) {
      return;
    }

    e.preventDefault();
    try {
      await moveItem(sourceId, { parentId: targetFolderId });
      await store.refresh();
    } catch (err) {
      onError?.(err.message || 'Unable to move item to folder.');
    }
  });
}
