/**
 * Marquee (rubber-band) area selection controller and geometry helpers.
 */

/**
 * Computes a normalized bounding box from two points.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {{ left: number, top: number, right: number, bottom: number, width: number, height: number }}
 */
export function computeNormalizedRect(x1, y1, x2, y2) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * Returns true if two bounding boxes (`{ left, top, right, bottom }`) overlap.
 * @param {{ left: number, top: number, right: number, bottom: number }} rectA
 * @param {{ left: number, top: number, right: number, bottom: number }} rectB
 * @returns {boolean}
 */
export function rectsIntersect(rectA, rectB) {
  if (!rectA || !rectB) return false;
  return (
    rectA.left < rectB.right &&
    rectA.right > rectB.left &&
    rectA.top < rectB.bottom &&
    rectA.bottom > rectB.top
  );
}

/**
 * Sets up rubber-band / marquee drag selection on empty workspace areas.
 * Holding Shift (or Cmd/Ctrl) while dragging adds to the existing selection.
 * Clicking empty workspace space without dragging clears the selection.
 *
 * @param {{
 *   workspaceEl: HTMLElement,
 *   gridEl: HTMLElement,
 *   marqueeEl: HTMLElement,
 *   store: ReturnType<import('../state/store.js').createLaunchpadStore>,
 *   isModalOpen?: () => boolean
 * }} options
 */
export function setupMarqueeSelection({
  workspaceEl,
  gridEl,
  marqueeEl,
  store,
  isModalOpen,
}) {
  if (!workspaceEl || !gridEl || !marqueeEl) return;

  let activePointer = false;
  let isDraggingMarquee = false;
  let startX = 0;
  let startY = 0;
  let initialSelectedIds = [];
  let initialAdditive = false;

  const DRAG_THRESHOLD_PX = 4;

  function shouldIgnoreTarget(target) {
    if (!(target instanceof Element)) return true;
    return Boolean(
      target.closest(
        '[data-item-id], .topbar, .selection-bar, dialog, button, input, select, textarea, a, label, .onboarding-card'
      )
    );
  }

  function updateMarqueeElement(rect) {
    marqueeEl.style.left = `${rect.left}px`;
    marqueeEl.style.top = `${rect.top}px`;
    marqueeEl.style.width = `${rect.width}px`;
    marqueeEl.style.height = `${rect.height}px`;
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return;
    if (isModalOpen?.()) return;
    const state = store.getState();
    if (!state.rootFolderValid) return;
    if (shouldIgnoreTarget(e.target)) return;

    activePointer = true;
    isDraggingMarquee = false;
    startX = e.clientX;
    startY = e.clientY;
    initialSelectedIds = [...(state.selectedIds || [])];
    initialAdditive = Boolean(e.shiftKey || e.metaKey || e.ctrlKey);
  }

  function handleMouseMove(e) {
    if (!activePointer) return;

    const rect = computeNormalizedRect(startX, startY, e.clientX, e.clientY);
    if (
      !isDraggingMarquee &&
      rect.width < DRAG_THRESHOLD_PX &&
      rect.height < DRAG_THRESHOLD_PX
    ) {
      return;
    }

    if (!isDraggingMarquee) {
      isDraggingMarquee = true;
      marqueeEl.hidden = false;
      document.body.classList.add('is-marquee-selecting');
    }

    e.preventDefault();
    updateMarqueeElement(rect);

    const cards = Array.from(gridEl.querySelectorAll('[data-item-id]'));
    const hitIds = [];
    let lastHitIndex = -1;

    cards.forEach((card, idx) => {
      const cardRect = card.getBoundingClientRect();
      if (rectsIntersect(rect, cardRect)) {
        hitIds.push(card.dataset.itemId);
        lastHitIndex = idx;
      }
    });

    const additive = initialAdditive || e.shiftKey || e.metaKey || e.ctrlKey;
    const combinedIds = additive
      ? Array.from(new Set([...initialSelectedIds, ...hitIds]))
      : hitIds;

    store.setSelection(
      combinedIds,
      lastHitIndex >= 0 ? lastHitIndex : undefined
    );
  }

  function finishMarquee() {
    if (!activePointer) return;
    const wasDragging = isDraggingMarquee;
    const wasAdditive = initialAdditive;

    activePointer = false;
    isDraggingMarquee = false;
    marqueeEl.hidden = true;
    document.body.classList.remove('is-marquee-selecting');

    if (!wasDragging && !wasAdditive) {
      store.clearSelection();
      store.setFocusedIndex(-1);
    }
  }

  document.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', finishMarquee);
}
