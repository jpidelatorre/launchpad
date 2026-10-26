/**
 * Storage service for persisting Launchpad settings and root bookmark folder.
 * Uses `chrome.storage.sync` when running as an extension, with a fallback
 * to `localStorage` or an in-memory map for standalone dev/test environments.
 */

export const STORAGE_KEY = 'launchpad_settings_v1';

export const VALID_THEMES = Object.freeze(['system', 'dark', 'light']);
export const VALID_DENSITIES = Object.freeze([
  'comfortable',
  'compact',
  'list',
  'icon',
]);
export const VALID_ICON_SIZES = Object.freeze([
  'tiny',
  'small',
  'medium',
  'large',
  'huge',
]);

export const DEFAULT_SETTINGS = Object.freeze({
  rootFolderId: null,
  theme: 'system',         // 'system' | 'dark' | 'light'
  accentColor: '#6366f1',  // Indigo default
  density: 'comfortable',  // 'comfortable' | 'compact' | 'list' | 'icon'
  iconSize: 'medium',      // 'tiny' | 'small' | 'medium' | 'large' | 'huge'
  openInNewTab: false,     // false = current tab, true = new tab
});

const memoryStore = new Map();
const localListeners = new Set();

function hasChromeStorage() {
  return (
    typeof globalThis.chrome !== 'undefined' &&
    globalThis.chrome?.storage?.sync
  );
}

function hasLocalStorage() {
  try {
    return typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage !== null;
  } catch {
    return false;
  }
}

/**
 * Normalizes and validates raw settings object against defaults.
 * @param {Partial<typeof DEFAULT_SETTINGS>} raw
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function normalizeSettings(raw = {}) {
  return {
    rootFolderId:
      typeof raw.rootFolderId === 'string' && raw.rootFolderId.trim() !== ''
        ? raw.rootFolderId.trim()
        : null,
    theme: VALID_THEMES.includes(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme,
    accentColor:
      typeof raw.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.accentColor)
        ? raw.accentColor.toLowerCase()
        : DEFAULT_SETTINGS.accentColor,
    density: VALID_DENSITIES.includes(raw.density)
      ? raw.density
      : DEFAULT_SETTINGS.density,
    iconSize: VALID_ICON_SIZES.includes(raw.iconSize)
      ? raw.iconSize
      : DEFAULT_SETTINGS.iconSize,
    openInNewTab:
      typeof raw.openInNewTab === 'boolean'
        ? raw.openInNewTab
        : DEFAULT_SETTINGS.openInNewTab,
  };
}

/**
 * Loads the persisted Launchpad settings.
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function loadSettings() {
  if (hasChromeStorage()) {
    return new Promise((resolve) => {
      globalThis.chrome.storage.sync.get([STORAGE_KEY], (result) => {
        const stored = result?.[STORAGE_KEY] || {};
        resolve(normalizeSettings(stored));
      });
    });
  }

  if (hasLocalStorage()) {
    try {
      const raw = globalThis.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return normalizeSettings(JSON.parse(raw));
      }
    } catch {
      // Fall through to memory store
    }
  }

  const mem = memoryStore.get(STORAGE_KEY) || {};
  return normalizeSettings(mem);
}

/**
 * Saves partial settings updates and returns the merged settings.
 * @param {Partial<typeof DEFAULT_SETTINGS>} partial
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function saveSettings(partial) {
  const current = await loadSettings();
  const next = normalizeSettings({ ...current, ...partial });

  if (hasChromeStorage()) {
    await new Promise((resolve) => {
      globalThis.chrome.storage.sync.set({ [STORAGE_KEY]: next }, () => resolve());
    });
  } else if (hasLocalStorage()) {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      memoryStore.set(STORAGE_KEY, next);
    }
  } else {
    memoryStore.set(STORAGE_KEY, next);
  }

  for (const listener of localListeners) {
    listener(next);
  }

  return next;
}

/**
 * Resets in-memory storage (useful for unit tests).
 */
export function resetMemoryStorage() {
  memoryStore.clear();
  localListeners.clear();
}

/**
 * Subscribes to settings changes from either local saves or `chrome.storage.onChanged`.
 * @param {(settings: typeof DEFAULT_SETTINGS) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export function onSettingsChanged(callback) {
  localListeners.add(callback);

  let chromeHandler = null;
  if (
    typeof globalThis.chrome !== 'undefined' &&
    globalThis.chrome?.storage?.onChanged
  ) {
    chromeHandler = (changes, areaName) => {
      if (areaName === 'sync' && changes[STORAGE_KEY]) {
        callback(normalizeSettings(changes[STORAGE_KEY].newValue || {}));
      }
    };
    globalThis.chrome.storage.onChanged.addListener(chromeHandler);
  }

  return () => {
    localListeners.delete(callback);
    if (chromeHandler && globalThis.chrome?.storage?.onChanged) {
      globalThis.chrome.storage.onChanged.removeListener(chromeHandler);
    }
  };
}
