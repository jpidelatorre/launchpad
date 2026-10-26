import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createItem,
  formatDisplayHostname,
  getBreadcrumbPath,
  getFaviconUrl,
  getFolderContents,
  getFolderList,
  getGlobalFolderTrail,
  moveItem,
  normalizeBookmarkUrl,
  removeItem,
  resetMockBookmarks,
  searchAllBookmarks,
  searchInSubtree,
  updateItem,
} from '../src/services/bookmarks.js';
import { calculateReorderIndex } from '../src/ui/dragdrop.js';

test('bookmarks service — folder listing & subtree contents', async (t) => {
  t.beforeEach(() => {
    resetMockBookmarks();
  });

  await t.test('getFolderList returns all bookmark folders with depth and child counts', async () => {
    const folders = await getFolderList();
    assert.ok(folders.length >= 5);

    const launchpadFolder = folders.find((f) => f.id === '10');
    assert.ok(launchpadFolder);
    assert.equal(launchpadFolder.title, 'Launchpad');
    assert.equal(launchpadFolder.pathLabel, 'Bookmarks Bar / Launchpad');
    assert.equal(launchpadFolder.depth, 1);
    assert.equal(launchpadFolder.childCount, 4);
  });

  await t.test('getFolderContents returns subfolders and direct bookmarks', async () => {
    const contents = await getFolderContents('10');
    assert.ok(contents);
    assert.equal(contents.folder.title, 'Launchpad');
    assert.equal(contents.items.length, 4);

    assert.equal(contents.items[0].title, 'Engineering');
    assert.equal(contents.items[0].isFolder, true);
    assert.equal(contents.items[0].childCount, 2);

    assert.equal(contents.items[2].title, 'Chrome Extensions Docs');
    assert.equal(contents.items[2].isFolder, false);
    assert.equal(
      contents.items[2].url,
      'https://developer.chrome.com/docs/extensions'
    );
  });

  await t.test('getBreadcrumbPath scopes trail strictly within rootFolderId', async () => {
    // Path from Launchpad ('10') to Engineering ('100')
    const trail = await getBreadcrumbPath('10', '100');
    assert.deepEqual(trail, [
      { id: '10', title: 'Launchpad' },
      { id: '100', title: 'Engineering' },
    ]);

    // Folder outside rootFolderId ('11' Personal) returns null
    const outsideTrail = await getBreadcrumbPath('10', '11');
    assert.equal(outsideTrail, null);
  });

  await t.test('searchAllBookmarks finds bookmarks and folders across the entire tree', async () => {
    // Finds YouTube inside 'Personal' ('11') even though it is outside 'Launchpad' ('10')
    const ytMatches = await searchAllBookmarks('youtube');
    assert.equal(ytMatches.length, 1);
    assert.equal(ytMatches[0].title, 'YouTube');
    assert.equal(ytMatches[0].relativePath, 'Bookmarks Bar / Personal');

    // Finds 'Personal' folder itself
    const folderMatches = await searchAllBookmarks('personal');
    assert.equal(folderMatches.length, 1);
    assert.equal(folderMatches[0].id, '11');
    assert.equal(folderMatches[0].isFolder, true);
    assert.equal(folderMatches[0].relativePath, 'Bookmarks Bar');

    // getGlobalFolderTrail resolves external folders and prepends rootFolderId ('10')
    const externalTrail = await getGlobalFolderTrail('10', '11');
    assert.deepEqual(externalTrail, [
      { id: '10', title: 'Launchpad' },
      { id: '1', title: 'Bookmarks Bar' },
      { id: '11', title: 'Personal' },
    ]);
  });

  await t.test('searchInSubtree finds nested items strictly inside rootFolderId', async () => {
    const matches = await searchInSubtree('10', 'github');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].title, 'GitHub');
    assert.equal(matches[0].relativePath, 'Engineering');

    // Searching for YouTube (which is in '11' Personal, outside '10' Launchpad) returns empty
    const outsideMatches = await searchInSubtree('10', 'youtube');
    assert.equal(outsideMatches.length, 0);
  });

  await t.test('CRUD: createItem, updateItem, removeItem work on bookmarks and folders', async () => {
    const createdBookmark = await createItem({
      parentId: '10',
      title: 'Example Docs',
      url: 'example.com/docs',
    });
    assert.equal(createdBookmark.title, 'Example Docs');
    assert.equal(createdBookmark.url, 'https://example.com/docs');

    const updated = await updateItem(createdBookmark.id, {
      title: 'Updated Example',
      url: 'https://example.org',
    });
    assert.equal(updated.title, 'Updated Example');
    assert.equal(updated.url, 'https://example.org');

    await removeItem(createdBookmark.id, false);
    const afterDelete = await getFolderContents('10');
    assert.ok(!afterDelete.items.some((i) => i.id === createdBookmark.id));
  });

  await t.test('moveItem reorders items and prevents moving folder into itself or descendant', async () => {
    // Prevent moving folder '10' into its own child '100'
    await assert.rejects(
      () => moveItem('10', { parentId: '100' }),
      /Cannot move a folder into its own subfolder/
    );

    // Move Hacker News ('103') into Engineering ('100')
    await moveItem('103', { parentId: '100' });
    const eng = await getFolderContents('100');
    assert.ok(eng.items.some((i) => i.id === '103'));
  });

  await t.test('calculateReorderIndex and URL/favicon helpers', () => {
    const items = [
      { id: 'a', index: 0 },
      { id: 'b', index: 1 },
      { id: 'c', index: 2 },
    ];
    assert.equal(calculateReorderIndex(items, 'c', 'a', 'before'), 0);
    assert.equal(calculateReorderIndex(items, 'a', 'b', 'after'), 2);

    assert.equal(normalizeBookmarkUrl('news.ycombinator.com'), 'https://news.ycombinator.com');
    assert.equal(formatDisplayHostname('https://www.github.com/features'), 'github.com');
    assert.ok(getFaviconUrl('https://github.com', 'GitHub').startsWith('data:image/svg+xml'));
  });
});
