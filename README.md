# Launchpad — Bookmark New Tab Chrome Extension

A fast, customizable **Manifest V3** Chrome Extension that replaces the New Tab page with an interactive launchpad powered by any user-selected bookmark folder.

## Features

- **User-Defined Root Bookmark Folder**: Pick any folder from your Chrome bookmarks tree to serve as your Launchpad root (persisted via `chrome.storage.sync`).
- **Drill-Down Folder Navigation with Breadcrumbs**: Click any subfolder tile to drill into it, and navigate back up using the breadcrumb trail or `Backspace`.
- **Instant Global Bookmark Search**: Press `/` or `Cmd/Ctrl + K` to search across all bookmarks and folders in Chrome (with full folder paths and drill-down support).
- **Full Keyboard Navigation**:
  - `ArrowLeft` / `ArrowRight` / `ArrowUp` / `ArrowDown` to move focus across grid tiles
  - `Enter` (`Cmd/Ctrl + Enter`) to open the focused bookmark or folder
  - `Backspace` to go up one folder level
  - `N` to add a new bookmark, `Shift + N` to create a subfolder
  - `E` to edit the focused item, `Delete` to remove it, `,` to open Settings
- **Bookmark & Folder Management (CRUD + Drag & Drop)**:
  - Add, rename, edit URL, or delete bookmarks and subfolders directly from the launchpad
  - Drag and drop tiles to reorder items or drop items directly onto a subfolder tile or breadcrumb item to move them
- **Theme & Layout Customization**:
  - **Themes**: `System`, `Dark`, or `Light`
  - **Views / Densities**: `Comfortable` cards, `Compact` pills, single-column `List`, or app-launcher `Icon` view
  - **Icon Sizes**: `Tiny`, `Small`, `Medium`, `Large`, or `Huge` (available in Icon view)
  - **Accent Colors**: 6 curated presets plus a custom hex color picker

## Loading in Chrome

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** on (top-right corner).
3. Click **Load unpacked** and select `/home/box/projects/launchpad`.
4. Open a New Tab (`Cmd/Ctrl + T`) and select your desired Launchpad bookmark folder.

## Running Automated Tests

```bash
npm test
```
