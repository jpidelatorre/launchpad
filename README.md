# Launchpad — Bookmark New Tab Chrome Extension

**Launchpad** is a fast, keyboard-first, zero-dependency **Manifest V3** Chrome Extension that transforms the New Tab page into an interactive application launcher and bookmark manager powered by any folder in your Chrome bookmarks tree.

---

## Highlights

- **100% Local & Private**: Runs entirely offline in your browser with zero external network requests, analytics, or third-party scripts.
- **Native Chrome Bookmarks Sync**: Directly reads and updates your Chrome bookmarks tree—changes made in Launchpad or in Chrome's Bookmark Manager stay in sync automatically.
- **Ergonomic Bottom Dock**: Keeps breadcrumbs, global search, creation tools, sorting controls, and settings within easy reach at the bottom of the viewport, with a floating Selection Action Bar that appears just above the toolbar when items are selected.

---

## Features

### 1. User-Defined Root Folder & Drill-Down Navigation
- **First-Run Onboarding**: Choose which Chrome bookmark folder powers your Launchpad home screen. You can change this root folder at any time in Settings (`,`).
- **Subfolder Drill-Down**: Open any subfolder tile to inspect its contents in place.
- **Interactive Breadcrumb Trail**: Jump back to any ancestor folder via the bottom toolbar breadcrumb bar, click the **Up** (`↑`) button, or press `Backspace`.

### 2. Instant Global Bookmark Search
- Press `/` or `Cmd/Ctrl + K` from anywhere on the page to focus the search bar.
- Searches across **all bookmarks and folders in Chrome**, displaying each item's full parent folder path.
- Click or press `Enter` on any matching folder in search results to clear the search filter and drill directly into that folder.

### 3. Multi-Selection & Batch Operations
- **Marquee (Rubber-Band) Selection**: Click and drag on empty workspace space to draw a selection rectangle over multiple bookmark/folder tiles. Hold `Shift` or `Cmd/Ctrl` while dragging to add to the current selection.
- **Range Selection**: Use `Shift + Click` or `Shift + Arrow` keys to select a contiguous range of items from the active anchor tile.
- **Select All**: Press `Cmd/Ctrl + A` to select all items in the current folder or search results.
- **Floating Selection Action Bar**: Appears directly above the bottom toolbar whenever one or more items are selected, showing the active count (`N selected`) and batch actions:
  - **Open** (`Enter`): Opens all selected bookmarks in new tabs.
  - **New Folder** (`G`): Prompts for a folder name, creates the folder at the position of the first selected item, and moves all selected items into it.
  - **Delete** (`Delete`): Opens a confirmation modal to delete all selected bookmarks and subfolders at once.
  - **Clear** (`Esc` or `✕`): Clears the current selection.

### 4. Drag-and-Drop Reordering & Moving
- **Single & Multi-Item Drag**: Drag a single card—or drag any card within a multi-selection to move all selected items together while preserving their relative order.
- **Reorder in Place**: Drop before or after any tile in the grid or list view to reorder items within the current folder.
- **Move into Subfolders**: Drop items directly onto any **folder tile** in the grid, any **breadcrumb folder button**, or the **Up** (`↑`) breadcrumb button to move them into that destination folder (with cycle protection preventing a folder from being moved into itself or its descendants).

### 5. Bookmark & Folder CRUD + Permanent Folder Sorting
- **Quick Create & Edit**: Add bookmarks (`N`), add subfolders (`Shift + N`), rename or edit URLs (`E`), and delete items (`Delete`) via accessible native `<dialog>` modals.
- **Permanent Folder Sorting**: Open the **Sort** popover in the bottom toolbar to permanently reorder the current folder in Chrome by:
  - **Name** (`A–Z` / `Z–A`)
  - **Date Added** (creation timestamp)
  - **Last Opened / Modified** (uses recorded bookmark open timestamps + Chrome's `dateLastUsed` and `dateGroupModified`)
  - Includes **Asc ↑ / Desc ↓** direction toggle and a **Folders first** option.

### 6. Theme & Layout Customization
All visual preferences are synced via `chrome.storage.sync`:
- **Theme Appearance**: `System` (follows OS dark/light mode), `Dark`, or `Light`.
- **Layout Views**:
  - `Comfortable`: Detailed cards with favicon, title, domain/folder metadata, and hover actions.
  - `Compact`: Dense single-line pill cards for large collections.
  - `List`: Centered single-column list showing full titles and URLs.
  - `Icon`: App-launcher icon grid with customizable icon sizes.
- **Icon Sizes** (when in `Icon` view): `Tiny`, `Small`, `Medium`, `Large`, and `Huge`.
- **Accent Colors**: 6 curated swatches (*Indigo*, *Emerald*, *Rose*, *Amber*, *Cyan*, *Violet*) plus a custom hex color picker.
- **Link Opening Behavior**: Toggle whether bookmarks open in the current tab or always open in a new tab (`Cmd/Ctrl + Click` or `Cmd/Ctrl + Enter` always opens in a new tab).

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `/` or `⌘/Ctrl + K` | Focus the search bar |
| `←` `↑` `↓` `→` | Navigate focus across grid tiles |
| `Shift + Click` | Select a range of tiles from the anchor item |
| `Shift + ←/↑/↓/→` | Extend selection range with arrow keys |
| `⌘/Ctrl + A` | Select all items in the current view |
| `G` | Group selected items into a new folder |
| `Enter` | Open focused item (or open all selected bookmarks in new tabs) |
| `⌘/Ctrl + Enter` | Open focused bookmark in a new tab |
| `Backspace` | Navigate up one folder level |
| `N` | Create a new bookmark in the current folder |
| `Shift + N` | Create a new subfolder in the current folder |
| `E` | Edit the focused bookmark or folder |
| `Delete` | Delete the focused item or all selected items |
| `,` | Open Launchpad Settings |
| `?` | Open the Keyboard Shortcuts dialog |
| `Esc` | Clear selection, clear search query, unfocus grid tile, or close active modal |

---

## Permissions Rationale

Launchpad requests only the minimum Chrome API permissions required to function:

- **`bookmarks`**: Required to read your bookmark tree, display folder contents, perform global searches, create/edit/delete bookmarks and folders, and reorder or move items via drag-and-drop and sorting.
- **`storage`**: Required to save your UI preferences (`rootFolderId`, `theme`, `density`, `iconSize`, `accentColor`, `openInNewTab`, `foldersFirst`, `sortDirection`) in `chrome.storage.sync` and bookmark last-opened timestamps in `chrome.storage.local`.
- **`favicon`**: Required to display website favicons using Chrome's built-in local `chrome-extension://<id>/_favicon/` endpoint without making external network requests to third-party favicon services.

---

## Installation & Development

### Load Unpacked in Chrome (Developer Mode)
1. Clone or download this repository.
2. Open Google Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the project root directory (`/path/to/launchpad`).
5. Open a New Tab (`Cmd/Ctrl + T`) and select your desired Launchpad root folder.

### Run Automated Tests
The test suite uses Node's built-in test runner (`node:test`) with an in-memory Chrome API mock covering the bookmarks service, marquee geometry helpers, batch operations, folder sorting, and store state transitions:

```bash
npm test
```

### Package for Chrome Web Store Publication
To generate a clean `.zip` archive ready for uploading to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole):

```bash
npm run package
```

This creates `dist/launchpad-v1.0.0.zip` containing only the production extension files (`manifest.json`, `newtab.html`, `icons/`, and `src/`).

---

## Project Structure

```text
launchpad/
├── icons/
│   ├── icon-16.png          # 16×16 extension icon
│   ├── icon-48.png          # 48×48 extension icon
│   └── icon-128.png         # 128×128 Chrome Web Store & extension icon
├── src/
│   ├── main.js              # Application entry point, modal controllers, and event wiring
│   ├── services/
│   │   ├── bookmarks.js     # Chrome Bookmarks API wrapper (CRUD, search, move, batch ops, sort)
│   │   └── storage.js       # Chrome Storage sync/local settings persistence
│   ├── state/
│   │   └── store.js         # Reactive state store (navigation, search, focus, multi-selection)
│   ├── styles/
│   │   └── main.css         # Theme variables, grid densities, bottom dock, and modal styles
│   └── ui/
│       ├── dragdrop.js      # HTML5 drag-and-drop controller for single & multi-item moves
│       ├── keyboard.js      # Global keyboard navigation and shortcut handler
│       ├── renderer.js      # DOM rendering for breadcrumbs, cards, favicons, and empty states
│       └── selection.js     # Rubber-band marquee drag selection controller & geometry helpers
├── tests/
│   ├── bookmarks.test.js    # Unit tests for bookmarks service, sorting, batch ops & geometry
│   └── store.test.js        # Unit tests for store state, drill-down, search & multi-selection
├── manifest.json            # Chrome Extension Manifest V3 configuration
├── newtab.html              # New Tab page markup and modal templates
├── package.json             # Scripts and package metadata
└── README.md                # Project documentation
```
