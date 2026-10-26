/**
 * Drag-and-drop controller for live-preview reordering of tiles
 * and moving items into subfolders or breadcrumbs.
 */

import { moveItem } from '../services/bookmarks.js';

/**
 * Pure helper that calculates the target index for `moveItem` when dropping `draggedId`
 * `'before'` or `'after'` `targetId` within `items`.
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
 * Pure helper that converts an item's old visual index and new visual index
 * (from live DOM reordering) into the `index` parameter expected by
 * `chrome.bookmarks.move(id, { parentId, index })`.
 *
 * In Chrome's `bookmarks.move`, moving an item within the same folder to a
 * higher index (`newVisualIndex > oldVisualIndex`) requires `newVisualIndex + 1`
 * because Chrome decrements `index` when `index > oldIndex`.
 *
 * @param {Array<{ id: string }>} items
 * @param {number} oldVisualIndex
 * @param {number} newVisualIndex
 * @returns {number | null}
 */
export function calculateMoveIndexFromVisualIndices(
  items,
  oldVisualIndex,
  newVisualIndex
) {
  if (
    !Array.isArray(items) ||
    oldVisualIndex < 0 ||
    newVisualIndex < 0 ||
    oldVisualIndex >= items.length ||
    newVisualIndex >= items.length ||
    oldVisualIndex === newVisualIndex
  ) {
    return null;
  }

  return newVisualIndex > oldVisualIndex ? newVisualIndex + 1 : newVisualIndex;
}

/**
 * Attaches HTML5 drag-and-drop listeners to the grid container and breadcrumb container.
 * Supports live DOM reordering preview as the user drags across the grid, plus dropping
 * onto the center of a folder's icon or onto a breadcrumb item to move into that folder.
 *
 * @param {{
 *   gridEl: HTMLElement,
 *   breadcrumbEl: HTMLElement,
 *   store: ReturnType<import('../state/store.js').createLaunchpadStore>,
 *   onError?: (message: string) => void
 * }} options
 */
export function setupDragAndDrop({ gridEl, breadcrumbEl, store, onError }) {
  let draggedId = null;
  let draggedEl = null;
  let pendingFolderDropId = null;
  let dropCommitted = false;

  function clearFolderIndicators() {
    pendingFolderDropId = null;
    const active = document.querySelectorAll('.drag-over-folder');
    active.forEach((el) => el.classList.remove('drag-over-folder'));
  }

  function clearAllDragClasses() {
    clearFolderIndicators();
    const active = document.querySelectorAll(
      '.drag-over-before, .drag-over-after, .dragging'
    );
    active.forEach((el) => {
      el.classList.remove('drag-over-before', 'drag-over-after', 'dragging');
    });
  }

  /**
   * Returns true only when `cardEl` is a folder and the pointer is inside
   * the central 65% of its `.card-icon-wrap` element.
   */
  function isOverFolderIconCenter(cardEl, clientX, clientY) {
    if (!cardEl || cardEl.dataset.isFolder !== 'true') return false;
    const iconWrap = cardEl.querySelector('.card-icon-wrap');
    if (!iconWrap) return false;

    const rect = iconWrap.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const rx = (clientX - rect.left) / rect.width;
    const ry = (clientY - rect.top) / rect.height;
    return rx >= 0.175 && rx <= 0.825 && ry >= 0.175 && ry <= 0.825;
  }

  /**
   * Determines whether the cursor is in the `'before'` or `'after'` half of `cardEl`.
   */
  function getReorderSide(cardEl, clientX, clientY, isListDensity) {
    const rect = cardEl.getBoundingClientRect();
    const ratio = isListDensity
      ? (clientY - rect.top) / Math.max(1, rect.height)
      : (clientX - rect.left) / Math.max(1, rect.width);
    return ratio <= 0.5 ? 'before' : 'after';
  }

  gridEl.addEventListener('dragstart', (e) => {
    const state = store.getState();
    // Disable drag reordering while filtering via search query
    if (state.searchQuery.trim() !== '') {
      e.preventDefault();
      return;
    }

    const target = e.target instanceof Element ? e.target : null;
    const card = target ? target.closest('[data-item-id]') : null;
    if (!card) return;

    draggedId = card.dataset.itemId;
    draggedEl = card;
    pendingFolderDropId = null;
    dropCommitted = false;

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedId);
    }

    // Apply `.dragging` placeholder class on the next frame so the browser
    // captures a crisp drag ghost image first.
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        if (draggedEl === card) {
          card.classList.add('dragging');
        }
      });
    } else {
      card.classList.add('dragging');
    }
  });

  gridEl.addEventListener('dragover', (e) => {
    if (!draggedId || !draggedEl) return;

    // Always allow dropping anywhere inside the grid container (including grid gaps)
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }

    const target = e.target instanceof Element ? e.target : null;
    const card = target ? target.closest('[data-item-id]') : null;

    if (!card || card === draggedEl) {
      clearFolderIndicators();
      return;
    }

    // 1. Check if hovering over the center of a folder's icon to drop INSIDE the folder
    if (isOverFolderIconCenter(card, e.clientX, e.clientY)) {
      if (pendingFolderDropId !== card.dataset.itemId) {
        clearFolderIndicators();
        pendingFolderDropId = card.dataset.itemId;
        card.classList.add('drag-over-folder');
      }
      return;
    }

    // 2. Otherwise, shift the dragged card live in the DOM before or after `card`
    clearFolderIndicators();
    const state = store.getState();
    const isList = state.settings.density === 'list';
    const side = getReorderSide(card, e.clientX, e.clientY, isList);

    if (side === 'before') {
      if (draggedEl.nextElementSibling !== card) {
        gridEl.insertBefore(draggedEl, card);
      }
    } else if (card.nextElementSibling !== draggedEl) {
      gridEl.insertBefore(draggedEl, card.nextElementSibling);
    }
  });

  gridEl.addEventListener('drop', async (e) => {
    if (!draggedId) return;
    e.preventDefault();

    dropCommitted = true;
    const sourceId = draggedId;
    const folderTargetId = pendingFolderDropId;

    draggedId = null;
    draggedEl = null;
    clearAllDragClasses();

    const state = store.getState();

    try {
      if (folderTargetId && folderTargetId !== sourceId) {
        await moveItem(sourceId, { parentId: folderTargetId });
      } else {
        const domCards = Array.from(gridEl.querySelectorAll('[data-item-id]'));
        const newVisualIndex = domCards.findIndex(
          (el) => el.dataset.itemId === sourceId
        );
        const oldVisualIndex = state.items.findIndex(
          (item) => item.id === sourceId
        );
        const moveIndex = calculateMoveIndexFromVisualIndices(
          state.items,
          oldVisualIndex,
          newVisualIndex
        );

        if (moveIndex !== null && state.currentFolderId) {
          await moveItem(sourceId, {
            parentId: state.currentFolderId,
            index: moveIndex,
          });
        }
      }
      await store.refresh();
    } catch (err) {
      await store.refresh();
      onError?.(err.message || 'Unable to move item.');
    }
  });

  gridEl.addEventListener('dragend', async () => {
    const wasCommitted = dropCommitted;
    draggedId = null;
    draggedEl = null;
    dropCommitted = false;
    clearAllDragClasses();

    if (!wasCommitted) {
      // Restore original DOM order if drag was cancelled (e.g. Escape)
      await store.refresh();
    }
  });

  // Allow dropping items onto breadcrumb folders to move them up the hierarchy
  breadcrumbEl.addEventListener('dragover', (e) => {
    if (!draggedId) return;
    const target = e.target instanceof Element ? e.target : null;
    const crumb = target ? target.closest('[data-folder-id]') : null;
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
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    crumb.classList.add('drag-over-folder');
  });

  breadcrumbEl.addEventListener('dragleave', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const crumb = target ? target.closest('[data-folder-id]') : null;
    if (crumb && !crumb.contains(e.relatedTarget)) {
      crumb.classList.remove('drag-over-folder');
    }
  });

  breadcrumbEl.addEventListener('drop', async (e) => {
    if (!draggedId) return;
    const target = e.target instanceof Element ? e.target : null;
    const crumb = target ? target.closest('[data-folder-id]') : null;

    dropCommitted = true;
    const sourceId = draggedId;
    draggedId = null;
    draggedEl = null;
    clearAllDragClasses();

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
