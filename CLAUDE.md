# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LOOPY is a browser-based, static HTML/JS tool for building and simulating causal loop diagrams (systems thinking). There is no build system, bundler, package manager, or test framework — everything runs directly in the browser from flat files.

**To run locally:** Open `v1.4/index.html` in a browser, or serve from the repo root with any static file server (e.g. `python3 -m http.server`). The landing page is `index.html`; the latest working version is under `v1.4/`.

## Repository Structure

- `index.html` — landing/splash page linking to `v1.4/`
- `v1/`, `v1.1/`, `v1.2/`, `v1.3/` — older versions, kept for reference only
- `v1.4/` — **active version** (always work here)
  - `index.html` — app entry point; loads all JS scripts in order
  - `js/` — all application logic (no modules, no imports — plain globals)
  - `css/` — stylesheets
  - `pages/` — static HTML pages (howto, examples, credits)
- `splash/` — animated logo used on the landing page

## Architecture

The app is a classic OOP-style single-page application using vanilla JS globals. All components are instantiated in `js/Loopy.js` and communicate exclusively via a pub/sub message bus (`publish`/`subscribe`/`unsubscribe` from `minpubsub.js`, exposed as window globals).

**Core objects and their roles:**

| File | Role |
|------|------|
| `Loopy.js` | Top-level controller. Owns mode (edit/play), zoom, save/load, keyboard shortcuts. Entry point: `window.loopy = new Loopy()`. |
| `Model.js` | Data layer. Owns arrays of `Node`, `Edge`, `Label`. Handles `serialize`/`deserialize` (URL-encoded JSON), `exportToDOT`, canvas drawing loop, and centering/scaling. |
| `Node.js` | A circular node. Three types: inactive (0), active (1), split (2). Handles signal propagation, draw, kill. |
| `Edge.js` | A directed arrow between nodes. Carries signals (particles that travel along the edge). Handles arc/curvature, speed, attenuation, +/- label. |
| `SplitNodeRenderer.js` | Renders split nodes (type 2) with separate top/bottom labels and a divider line. |
| `Sidebar.js` | Right-hand panel UI for editing selected nodes/edges/labels. Built from `ComponentSlider`, `ComponentInput`, `ComponentButton`, `ComponentNodeGroup` components. Also owns a persistent "Options" section (`#sidebar_options`, collapsed by default) pinned above every page, with Node/Edge field toggles and the Node Groups editor. |
| `Toolbar.js` | Top toolbar: tool selection (Ink, Drag, Erase, Label). |
| `PlayControls.js` | Bottom bar: play/edit mode toggle. |
| `Modal.js` | Overlay modal used for share/embed dialogs and help pages. |
| `Ink.js` | Drawing tool — creates nodes (click) and edges (drag from node to node). |
| `Dragger.js` | Move tool — drags nodes/labels; also supports rectangular multi-select. |
| `Eraser.js` | Erase tool — deletes nodes and edges on click. |
| `Labeller.js` | Label tool — creates free-floating text labels. |
| `History.js` | Undo/redo stack using snapshots of the full model state. Also persists history to `localStorage`. |
| `HistoryTracker.js` | Generates human-readable descriptions of model changes (used for the action log). |
| `NodeOptions.js` | Global, per-field visibility toggles for the Node and Edge sidebar pages (Node: Node Type, Node Group, Start Amount, Radius, Gain, Strength; Edge: Relationship Type, Show +/- Label, Signal Attenuation, Signal Speed — all off by default; a Node's Name and Description are always shown). Merges a diagram-serialized default with a per-browser `localStorage` override and publishes `settings/changed` on change. |
| `NodeGroups.js` | Diagram-level list of 1-8 named colour groups (a node's `hue` is an index into this list), using the fixed, colour-blind-safe Okabe-Ito palette — group *N* always uses palette colour *N*; only a group's name and the group count are editable. Publishes `groups/changed` on add/remove/load; `Model.js` listens to rebuild `COLOUR_NODE_LIST`. |
| `Mouse.js` | Normalises mouse/touch events; publishes `mousemove`, `mousedown`, `mouseup`, `mouseclick`. |
| `Key.js` | Keyboard handler; publishes `key/undo`, `key/redo`, `key/zoomin`, etc. |
| `helpers.js` | Global utility functions (`_configureProperties`, `_createCanvas`, `_getParameterByName`, `_isPointInCircle`, etc.) and global constants (`_PADDING`, `Math.TAU`, `HIGHLIGHT_COLOR`). |

## Key Pub/Sub Topics

- `model/changed` — fired whenever nodes/edges/labels are mutated; marks the model dirty for saving
- `model/reset` — resets node values to initial state (triggered on switching back to edit mode)
- `loopy/mode` — fired when switching between edit and play mode
- `mousemove`, `mousedown`, `mouseup`, `mouseclick` — normalised input events
- `resize` — window resize event
- `kill` — fired when a node/edge/label is deleted (passed the deleted object)
- `export/file`, `import/file` — trigger file save/load dialogs
- `key/undo`, `key/redo`, `key/zoomin`, `key/zoomout`, `key/zoomreset`
- `settings/changed` — fired whenever the global Node/Edge field visibility toggles change (`NodeOptions.js`); the Sidebar's Node/Edge pages and Options header listen to show/hide fields live
- `groups/changed` — fired whenever Node Groups are added/removed/reloaded (not on rename, to avoid stealing focus while typing a name — renames only publish `model/changed`); `Model.js` rebuilds `COLOUR_NODE_LIST`, the Sidebar's Node Group swatch picker and Options header re-render

## Serialization Format

Model state is stored as a URL-encoded JSON array passed in the `?data=` query parameter:

```
[nodes[], edges[], labels[], settings[], UID, groupNames[]]
```

Node fields (by index): `id, x, y, init, label(encoded), hue, radius, gain, strength, active, topLabel(encoded), bottomLabel(encoded), description(encoded)`

Edge fields: `fromId, toId, arc, strength, speedMultiplier, [rotation], showLabel(0|1)`

`settings[]` holds `[MAX_SIGNAL_AGE, MAX_SIGNALS_PER_EDGE, MAX_SIGNALS, showType, showGroup, showStartAmount, showRadius, showGain, showStrength, showRelationshipType, showEdgeLabel, showAttenuation, showSpeed]` — entries 3+ are the diagram-embedded defaults for `NodeOptions.js`'s toggles (6 node keys then 4 edge keys) and may be absent/short in links saved by older versions (treated as "no diagram default" rather than an error).

`groupNames[]` is a flat array of Node Group names (e.g. `["Risks","Mitigations"]`); the group count is `groupNames.length` (1-8) and each name's colour is `NodeGroups.PALETTE[index]` (fixed, not stored). Absent in older links, which fall back to the default 4 groups.

## Embedding

Add `?embed=1&data=...` to the URL. When embedded: toolbar and sidebar are hidden, the canvas goes fullscreen, and the simulation auto-plays. Add `&no_ui=1` to also hide the play bar. Add `&signal=[nodeId, delta]` to auto-trigger a signal on load.

## Canvas Rendering

All drawing uses the HTML5 Canvas API at 2× resolution (retina). The model canvas is transformed with `ctx.setTransform` using `loopy.offsetX`, `loopy.offsetY`, and `loopy.offsetScale` for pan/zoom. Drawing is lazy: a `drawCountdown` timer prevents unnecessary redraws when nothing is moving.

## Node Active Types

- `0` = inactive (no up/down controls in play mode, does not propagate signals)
- `1` = active (shows up/down controls, propagates signals)
- `2` = split node (rendered with top/bottom labels and a horizontal divider; no controls)
