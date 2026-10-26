import test from 'node:test';
import assert from 'node:assert/strict';

import { resetMockBookmarks } from '../src/services/bookmarks.js';
import {
  normalizeSettings,
  resetMemoryStorage,
  VALID_ICON_SIZES,
} from '../src/services/storage.js';
import { createLaunchpadStore } from '../src/state/store.js';

test('launchpad store — state transitions, drill-down, search & keyboard focus', async (t) => {
  t.beforeEach(() => {
    resetMockBookmarks();
    resetMemoryStorage();
  });

  await t.test('starts unconfigured when no rootFolderId is stored, then configures root folder', async () => {
    const store = createLaunchpadStore();
    await store.init();

    assert.equal(store.getState().rootFolderValid, false);
    assert.equal(store.getState().items.length, 0);

    await store.selectRootFolder('10');
    const state = store.getState();
    assert.equal(state.rootFolderValid, true);
    assert.equal(state.currentFolderId, '10');
    assert.equal(state.currentFolderTitle, 'Launchpad');
    assert.equal(state.items.length, 4);
    assert.deepEqual(state.breadcrumbs, [{ id: '10', title: 'Launchpad' }]);
  });

  await t.test('drills down into subfolder and navigates up via navigateUp()', async () => {
    const store = createLaunchpadStore();
    await store.init();
    await store.selectRootFolder('10');

    // Drill into Engineering ('100')
    await store.navigateToFolder('100');
    let state = store.getState();
    assert.equal(state.currentFolderId, '100');
    assert.equal(state.items.length, 2);
    assert.deepEqual(state.breadcrumbs, [
      { id: '10', title: 'Launchpad' },
      { id: '100', title: 'Engineering' },
    ]);

    // Navigate back up to Launchpad ('10')
    const movedUp = await store.navigateUp();
    assert.equal(movedUp, true);
    state = store.getState();
    assert.equal(state.currentFolderId, '10');
    assert.equal(state.breadcrumbs.length, 1);

    // At root folder, navigateUp returns false
    const movedAgain = await store.navigateUp();
    assert.equal(movedAgain, false);
  });

  await t.test('filters items across all bookmarks globally when search query is set and allows drilling into any folder', async () => {
    const store = createLaunchpadStore();
    await store.init();
    await store.selectRootFolder('10');

    // Match inside Launchpad
    await store.setSearchQuery('figma');
    let state = store.getState();
    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].title, 'Figma');
    assert.equal(state.items[0].relativePath, 'Bookmarks Bar / Launchpad / Design');
    assert.equal(state.focusedIndex, 0);

    // Match outside Launchpad ('Personal' / 'YouTube')
    await store.setSearchQuery('youtube');
    state = store.getState();
    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].title, 'YouTube');
    assert.equal(state.items[0].relativePath, 'Bookmarks Bar / Personal');

    // Drill into 'Personal' ('11') folder from global search
    await store.navigateToFolder('11');
    state = store.getState();
    assert.equal(state.currentFolderId, '11');
    assert.equal(state.searchQuery, '');
    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].title, 'YouTube');
    assert.equal(state.breadcrumbs[0].id, '10'); // First breadcrumb returns to Launchpad root
    assert.equal(state.breadcrumbs[state.breadcrumbs.length - 1].id, '11');

    // Return to Launchpad root
    await store.navigateToFolder('10');
    assert.equal(store.getState().currentFolderId, '10');
    assert.equal(store.getState().items.length, 4);
  });

  await t.test('manages keyboard focus bounds and theme/density settings', async () => {
    const store = createLaunchpadStore();
    await store.init();
    await store.selectRootFolder('10');

    assert.equal(store.getState().focusedIndex, -1);
    store.moveFocus(1);
    assert.equal(store.getState().focusedIndex, 0);
    store.moveFocus(2);
    assert.equal(store.getState().focusedIndex, 2);
    store.moveFocus(99);
    assert.equal(store.getState().focusedIndex, 3);
    store.moveFocus(-99);
    assert.equal(store.getState().focusedIndex, 0);

    await store.updateSettings({
      theme: 'dark',
      density: 'compact',
      accentColor: '#10b981',
      openInNewTab: true,
    });

    const { settings } = store.getState();
    assert.equal(settings.theme, 'dark');
    assert.equal(settings.density, 'compact');
    assert.equal(settings.iconSize, 'medium');
    assert.equal(settings.accentColor, '#10b981');
    assert.equal(settings.openInNewTab, true);
  });

  await t.test('supports icon view density and all 5 icon sizes (tiny, small, medium, large, huge)', async () => {
    const store = createLaunchpadStore();
    await store.init();

    assert.deepEqual(VALID_ICON_SIZES, ['tiny', 'small', 'medium', 'large', 'huge']);

    for (const size of VALID_ICON_SIZES) {
      await store.updateSettings({
        density: 'icon',
        iconSize: size,
      });
      const { settings } = store.getState();
      assert.equal(settings.density, 'icon');
      assert.equal(settings.iconSize, size);
    }

    // Invalid icon size or density falls back to defaults
    const normalized = normalizeSettings({
      density: 'invalid-density',
      iconSize: 'gigantic',
    });
    assert.equal(normalized.density, 'comfortable');
    assert.equal(normalized.iconSize, 'medium');
  });
});
