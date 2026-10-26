/**
 * Bookmarks service providing a clean async interface over `chrome.bookmarks`
 * with an in-memory mock bookmark tree fallback for tests and standalone previews.
 */

function createDefaultMockTree() {
  return [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          parentId: '0',
          index: 0,
          title: 'Bookmarks Bar',
          children: [
            {
              id: '10',
              parentId: '1',
              index: 0,
              title: 'Launchpad',
              children: [
                {
                  id: '100',
                  parentId: '10',
                  index: 0,
                  title: 'Engineering',
                  children: [
                    {
                      id: '1001',
                      parentId: '100',
                      index: 0,
                      title: 'GitHub',
                      url: 'https://github.com',
                    },
                    {
                      id: '1002',
                      parentId: '100',
                      index: 1,
                      title: 'MDN Web Docs',
                      url: 'https://developer.mozilla.org',
                    },
                  ],
                },
                {
                  id: '101',
                  parentId: '10',
                  index: 1,
                  title: 'Design',
                  children: [
                    {
                      id: '1011',
                      parentId: '101',
                      index: 0,
                      title: 'Figma',
                      url: 'https://www.figma.com',
                    },
                  ],
                },
                {
                  id: '102',
                  parentId: '10',
                  index: 2,
                  title: 'Chrome Extensions Docs',
                  url: 'https://developer.chrome.com/docs/extensions',
                },
                {
                  id: '103',
                  parentId: '10',
                  index: 3,
                  title: 'Hacker News',
                  url: 'https://news.ycombinator.com',
                },
              ],
            },
            {
              id: '11',
              parentId: '1',
              index: 1,
              title: 'Personal',
              children: [
                {
                  id: '110',
                  parentId: '11',
                  index: 0,
                  title: 'YouTube',
                  url: 'https://www.youtube.com',
                },
              ],
            },
          ],
        },
        {
          id: '2',
          parentId: '0',
          index: 1,
          title: 'Other Bookmarks',
          children: [],
        },
      ],
    },
  ];
}

let mockTree = createDefaultMockTree();
let nextMockId = 5000;
const mockChangeListeners = new Set();

function notifyMockChange() {
  for (const cb of mockChangeListeners) {
    cb();
  }
}

export function resetMockBookmarks(customTree = null) {
  mockTree = customTree ? structuredClone(customTree) : createDefaultMockTree();
  nextMockId = 5000;
}

function hasChromeBookmarks() {
  return (
    typeof globalThis.chrome !== 'undefined' &&
    Boolean(globalThis.chrome?.bookmarks?.getTree)
  );
}

function findNodeInTree(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeInTree(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function reindexChildren(folderNode) {
  if (!folderNode.children) return;
  folderNode.children.forEach((child, idx) => {
    child.index = idx;
    child.parentId = folderNode.id;
  });
}

/**
 * Returns whether a bookmark node represents a folder (no URL property).
 * @param {object} node
 * @returns {boolean}
 */
export function isFolderNode(node) {
  return Boolean(node && !node.url);
}

/**
 * Fetches the full bookmark tree from Chrome or the mock store.
 * @returns {Promise<Array<object>>}
 */
export async function getRawTree() {
  if (hasChromeBookmarks()) {
    return new Promise((resolve, reject) => {
      globalThis.chrome.bookmarks.getTree((tree) => {
        const err = globalThis.chrome.runtime?.lastError;
        if (err) reject(new Error(err.message));
        else resolve(tree || []);
      });
    });
  }
  return structuredClone(mockTree);
}

/**
 * Lists all bookmark folders in the tree for the Root Folder selector.
 * Returns flat array of `{ id, title, pathLabel, depth, childCount }`.
 * @returns {Promise<Array<{id: string, title: string, pathLabel: string, depth: number, childCount: number}>>}
 */
export async function getFolderList() {
  const tree = await getRawTree();
  const folders = [];

  function walk(node, ancestors, depth) {
    if (!isFolderNode(node)) return;

    const isVirtualRoot = node.id === '0' && !node.title;
    const nextAncestors = isVirtualRoot ? ancestors : [...ancestors, node.title || 'Untitled Folder'];

    if (!isVirtualRoot) {
      const children = node.children || [];
      folders.push({
        id: node.id,
        title: node.title || 'Untitled Folder',
        pathLabel: nextAncestors.join(' / '),
        depth: Math.max(0, depth - 1),
        childCount: children.length,
      });
    }

    if (node.children) {
      for (const child of node.children) {
        if (isFolderNode(child)) {
          walk(child, nextAncestors, depth + 1);
        }
      }
    }
  }

  for (const root of tree) {
    walk(root, [], 0);
  }

  return folders;
}

/**
 * Retrieves a subtree rooted at `folderId`. Returns `null` if not found or if it's a bookmark.
 * @param {string} folderId
 * @returns {Promise<object | null>}
 */
export async function getSubTree(folderId) {
  if (!folderId) return null;

  if (hasChromeBookmarks()) {
    return new Promise((resolve) => {
      globalThis.chrome.bookmarks.getSubTree(String(folderId), (results) => {
        const err = globalThis.chrome.runtime?.lastError;
        if (err || !results || !results[0] || !isFolderNode(results[0])) {
          resolve(null);
        } else {
          resolve(results[0]);
        }
      });
    });
  }

  const found = findNodeInTree(mockTree, String(folderId));
  if (!found || !isFolderNode(found)) return null;
  return structuredClone(found);
}

/**
 * Returns the folder node and its direct children formatted for the Launchpad UI.
 * @param {string} folderId
 * @returns {Promise<{ folder: { id: string, title: string, parentId?: string }, items: Array<object> } | null>}
 */
export async function getFolderContents(folderId) {
  const subtree = await getSubTree(folderId);
  if (!subtree) return null;

  const rawChildren = subtree.children || [];
  const items = rawChildren.map((child, idx) => {
    const folder = isFolderNode(child);
    const subChildren = child.children || [];
    return {
      id: child.id,
      parentId: child.parentId ?? subtree.id,
      index: typeof child.index === 'number' ? child.index : idx,
      title: child.title || (folder ? 'Untitled Folder' : child.url || 'Untitled'),
      url: folder ? undefined : child.url,
      isFolder: folder,
      childCount: folder ? subChildren.length : 0,
    };
  });

  return {
    folder: {
      id: subtree.id,
      title: subtree.title || 'Untitled Folder',
      parentId: subtree.parentId,
    },
    items,
  };
}

/**
 * Resolves the breadcrumb trail from `rootFolderId` down to `currentFolderId`.
 * Returns `null` if `currentFolderId` is not inside `rootFolderId` (nor equal to it).
 * @param {string} rootFolderId
 * @param {string} currentFolderId
 * @returns {Promise<Array<{ id: string, title: string }> | null>}
 */
export async function getBreadcrumbPath(rootFolderId, currentFolderId) {
  const rootSubtree = await getSubTree(rootFolderId);
  if (!rootSubtree) return null;

  function findPath(node, targetId, trail) {
    const currentTrail = [
      ...trail,
      { id: node.id, title: node.title || 'Untitled Folder' },
    ];
    if (node.id === targetId) {
      return currentTrail;
    }
    if (node.children) {
      for (const child of node.children) {
        if (isFolderNode(child)) {
          const found = findPath(child, targetId, currentTrail);
          if (found) return found;
        }
      }
    }
    return null;
  }

  return findPath(rootSubtree, String(currentFolderId), []);
}

/**
 * Recursively searches all subfolders and bookmarks inside `rootFolderId` matching `query`.
 * Matches against title or URL (case-insensitive) and includes relative folder path.
 * @param {string} rootFolderId
 * @param {string} query
 * @returns {Promise<Array<object>>}
 */
export async function searchInSubtree(rootFolderId, query) {
  const trimmed = (query || '').trim().toLowerCase();
  if (!trimmed) return [];

  const rootSubtree = await getSubTree(rootFolderId);
  if (!rootSubtree) return [];

  const matches = [];

  function walk(folderNode, relativePath) {
    const children = folderNode.children || [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const folder = isFolderNode(child);
      const title = child.title || (folder ? 'Untitled Folder' : child.url || '');
      const url = child.url || '';
      const haystack = `${title} ${url}`.toLowerCase();

      if (haystack.includes(trimmed)) {
        matches.push({
          id: child.id,
          parentId: folderNode.id,
          index: typeof child.index === 'number' ? child.index : i,
          title: title || 'Untitled',
          url: folder ? undefined : url,
          isFolder: folder,
          childCount: folder ? (child.children || []).length : 0,
          relativePath: relativePath.length > 0 ? relativePath.join(' / ') : rootSubtree.title || 'Root',
        });
      }

      if (folder && child.children) {
        walk(child, [...relativePath, title]);
      }
    }
  }

  walk(rootSubtree, []);
  return matches;
}

/**
 * Normalizes a user-entered URL, adding `https://` if no scheme is present.
 * @param {string} rawUrl
 * @returns {string}
 */
export function normalizeBookmarkUrl(rawUrl) {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) throw new Error('Bookmark URL is required.');
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Creates a new bookmark or subfolder inside `parentId`.
 * Omit `url` to create a subfolder.
 * @param {{ parentId: string, title: string, url?: string, index?: number }} params
 * @returns {Promise<object>}
 */
export async function createItem({ parentId, title, url, index }) {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) {
    throw new Error('Title is required.');
  }

  const createPayload = {
    parentId: String(parentId),
    title: cleanTitle,
  };

  if (typeof index === 'number') {
    createPayload.index = index;
  }

  if (url !== undefined && url !== null) {
    createPayload.url = normalizeBookmarkUrl(url);
  }

  if (hasChromeBookmarks()) {
    return new Promise((resolve, reject) => {
      globalThis.chrome.bookmarks.create(createPayload, (created) => {
        const err = globalThis.chrome.runtime?.lastError;
        if (err) reject(new Error(err.message));
        else resolve(created);
      });
    });
  }

  const parent = findNodeInTree(mockTree, String(parentId));
  if (!parent || !isFolderNode(parent)) {
    throw new Error(`Parent folder ${parentId} not found.`);
  }
  parent.children = parent.children || [];
  const newNode = {
    id: String(nextMockId++),
    parentId: parent.id,
    title: createPayload.title,
    ...(createPayload.url ? { url: createPayload.url } : { children: [] }),
  };

  const insertIndex =
    typeof index === 'number'
      ? Math.max(0, Math.min(index, parent.children.length))
      : parent.children.length;

  parent.children.splice(insertIndex, 0, newNode);
  reindexChildren(parent);
  notifyMockChange();
  return structuredClone(newNode);
}

/**
 * Updates an existing bookmark or folder.
 * @param {string} id
 * @param {{ title?: string, url?: string }} changes
 * @returns {Promise<object>}
 */
export async function updateItem(id, { title, url }) {
  const payload = {};
  if (title !== undefined) {
    const cleanTitle = title.trim();
    if (!cleanTitle) throw new Error('Title cannot be empty.');
    payload.title = cleanTitle;
  }
  if (url !== undefined) {
    payload.url = normalizeBookmarkUrl(url);
  }

  if (hasChromeBookmarks()) {
    return new Promise((resolve, reject) => {
      globalThis.chrome.bookmarks.update(String(id), payload, (updated) => {
        const err = globalThis.chrome.runtime?.lastError;
        if (err) reject(new Error(err.message));
        else resolve(updated);
      });
    });
  }

  const node = findNodeInTree(mockTree, String(id));
  if (!node) throw new Error(`Bookmark item ${id} not found.`);
  if (payload.title !== undefined) node.title = payload.title;
  if (payload.url !== undefined && !isFolderNode(node)) node.url = payload.url;
  notifyMockChange();
  return structuredClone(node);
}

/**
 * Deletes a bookmark or folder (uses `removeTree` for folders).
 * @param {string} id
 * @param {boolean} [isFolder=false]
 * @returns {Promise<void>}
 */
export async function removeItem(id, isFolder = false) {
  if (hasChromeBookmarks()) {
    return new Promise((resolve, reject) => {
      const fn = isFolder
        ? globalThis.chrome.bookmarks.removeTree.bind(globalThis.chrome.bookmarks)
        : globalThis.chrome.bookmarks.remove.bind(globalThis.chrome.bookmarks);
      fn(String(id), () => {
        const err = globalThis.chrome.runtime?.lastError;
        if (err) reject(new Error(err.message));
        else resolve();
      });
    });
  }

  function removeFrom(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === String(id)) {
        nodes.splice(i, 1);
        return true;
      }
      if (node.children && removeFrom(node.children)) {
        reindexChildren(node);
        return true;
      }
    }
    return false;
  }

  const removed = removeFrom(mockTree);
  if (!removed) throw new Error(`Bookmark item ${id} not found.`);
  notifyMockChange();
}

/**
 * Moves a bookmark or folder to a new parent folder and/or index.
 * Guards against moving a folder into itself or one of its own descendants.
 * @param {string} id
 * @param {{ parentId: string, index?: number }} destination
 * @returns {Promise<object>}
 */
export async function moveItem(id, { parentId, index }) {
  if (String(id) === String(parentId)) {
    throw new Error('Cannot move a folder into itself.');
  }

  // Prevent moving a folder into its own descendant
  const draggedSubtree = await getSubTree(String(id));
  if (draggedSubtree) {
    const descendantCheck = await getBreadcrumbPath(String(id), String(parentId));
    if (descendantCheck) {
      throw new Error('Cannot move a folder into its own subfolder.');
    }
  }

  if (hasChromeBookmarks()) {
    const dest = { parentId: String(parentId) };
    if (typeof index === 'number') {
      dest.index = index;
    }
    return new Promise((resolve, reject) => {
      globalThis.chrome.bookmarks.move(String(id), dest, (moved) => {
        const err = globalThis.chrome.runtime?.lastError;
        if (err) reject(new Error(err.message));
        else resolve(moved);
      });
    });
  }

  const node = findNodeInTree(mockTree, String(id));
  if (!node) throw new Error(`Item ${id} not found.`);
  const oldParent = findNodeInTree(mockTree, String(node.parentId));
  const newParent = findNodeInTree(mockTree, String(parentId));
  if (!oldParent || !newParent || !isFolderNode(newParent)) {
    throw new Error(`Invalid destination folder ${parentId}.`);
  }

  const oldIndex = oldParent.children.findIndex((c) => c.id === String(id));
  if (oldIndex === -1) throw new Error(`Item ${id} missing from parent.`);
  oldParent.children.splice(oldIndex, 1);
  reindexChildren(oldParent);

  newParent.children = newParent.children || [];
  let targetIndex =
    typeof index === 'number' ? index : newParent.children.length;

  // Match Chrome's bookmarks.move behavior when moving within the same parent to a higher index
  if (oldParent.id === newParent.id && typeof index === 'number' && index > oldIndex) {
    targetIndex = Math.max(0, index - 1);
  }
  targetIndex = Math.max(0, Math.min(targetIndex, newParent.children.length));

  newParent.children.splice(targetIndex, 0, node);
  reindexChildren(newParent);
  notifyMockChange();
  return structuredClone(node);
}

/**
 * Generates a favicon URL using Chrome's MV3 `_favicon` API, with an SVG monogram fallback.
 * @param {string} pageUrl
 * @param {string} [title='']
 * @param {number} [sizePx=64]
 * @returns {string}
 */
export function getFaviconUrl(pageUrl, title = '', sizePx = 64) {
  if (
    pageUrl &&
    typeof globalThis.chrome !== 'undefined' &&
    typeof globalThis.chrome?.runtime?.getURL === 'function' &&
    Boolean(globalThis.chrome?.bookmarks)
  ) {
    try {
      const faviconUrl = new URL(globalThis.chrome.runtime.getURL('/_favicon/'));
      faviconUrl.searchParams.set('pageUrl', pageUrl);
      faviconUrl.searchParams.set('size', String(sizePx));
      return faviconUrl.toString();
    } catch {
      // Fall back to SVG monogram
    }
  }

  return createMonogramSvgDataUrl(pageUrl, title, sizePx);
}

/**
 * Creates a clean SVG data URL displaying the domain's or title's initial letter.
 * @param {string} pageUrl
 * @param {string} [title='']
 * @param {number} [sizePx=64]
 * @returns {string}
 */
export function createMonogramSvgDataUrl(pageUrl, title = '', sizePx = 64) {
  let letter = '?';
  let seed = title || pageUrl || 'launchpad';

  try {
    if (pageUrl) {
      const host = new URL(pageUrl).hostname.replace(/^www\./, '');
      if (host) {
        letter = host[0].toUpperCase();
        seed = host;
      }
    }
  } catch {
    if (title) {
      letter = title.trim()[0]?.toUpperCase() || '?';
    }
  }

  const palette = [
    '#6366f1',
    '#10b981',
    '#f43f5e',
    '#f59e0b',
    '#06b6d4',
    '#8b5cf6',
    '#3b82f6',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const color = palette[hash % palette.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${color}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui,-apple-system,sans-serif" font-size="30" font-weight="700">${letter.replace(/[<>&"']/g, '')}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Extracts a clean hostname for display on bookmark tiles.
 * @param {string} url
 * @returns {string}
 */
export function formatDisplayHostname(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

/**
 * Subscribes to external bookmark changes (`onCreated`, `onRemoved`, `onChanged`, `onMoved`, `onChildrenReordered`).
 * @param {() => void} callback
 * @returns {() => void} Unsubscribe function
 */
export function onBookmarksChanged(callback) {
  mockChangeListeners.add(callback);

  const events = [
    'onCreated',
    'onRemoved',
    'onChanged',
    'onMoved',
    'onChildrenReordered',
    'onImportEnded',
  ];

  if (hasChromeBookmarks()) {
    for (const evt of events) {
      globalThis.chrome.bookmarks[evt]?.addListener(callback);
    }
  }

  return () => {
    mockChangeListeners.delete(callback);
    if (hasChromeBookmarks()) {
      for (const evt of events) {
        globalThis.chrome.bookmarks[evt]?.removeListener(callback);
      }
    }
  };
}
