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
| `Node.js` | A circular node. `active`: 0 = non-simulable, 1 = simulable (default). `2` (split) is retired from the UI but still renders via `SplitNodeRenderer.js` for old saved links. Handles signal propagation, draw, kill. |
| `Edge.js` | A directed arrow between nodes. Carries signals (particles that travel along the edge). Handles arc/curvature, speed, attenuation. Shows a "-" (balancing) edge's polarity one of two mutually-exclusive ways, picked globally by the `NodeOptions` "direction" toggle (not a per-edge setting): OFF (default) colours it dark red (`COLOUR_EDGE_NEGATIVE`), taking priority over speed-colouring; ON shows the +/- glyph on every edge instead and the colouring falls back to normal/speed-based. `edgeType` ("directed"/"bi-directed"/"questionable") always controls line style (solid/dashed/dotted), arrowhead count, and the "?" glyph, regardless of the "Edge Type" toggle; a "questionable" edge never delivers its signal. |
| `SplitNodeRenderer.js` | Renders split nodes (legacy `active===2` only - no longer creatable) with separate top/bottom labels and a divider line. |
| `Sidebar.js` | Right-hand panel UI. Shows ONLY the selected node's/edge's own fields (per `NodeOptions`) when something is selected - `#sidebar` gets an `editing="node"/"edge"` attribute (tinting the background) via a wrapped `showPage`. When nothing is selected (the "Edit" page, reached by clicking empty canvas space), it shows the title/links, a collapsible "Model options" section (Node/Edge field toggles), the Node Groups editor, export controls, a "clear graph" button, and credits — in that order. Built from `ComponentSlider`, `ComponentInput`, `ComponentButton`, `ComponentNodeGroup`, `ComponentNodeType`, `ComponentEdgeType` components. |
| `Toolbar.js` | Top toolbar: tool selection (Ink, Drag, Erase, Label). |
| `PlayControls.js` | Bottom bar: play/edit mode toggle. |
| `Modal.js` | Overlay modal used for share/embed dialogs and help pages. |
| `Ink.js` | Drawing tool — creates nodes (click) and edges (drag from node to node). |
| `Dragger.js` | Move tool — drags nodes/labels; also supports rectangular multi-select. Dropping one node onto another offers to merge them (`Model.mergeNodes`, with a confirm dialog); holding Alt/Option while starting to drag a node instead peels off a full duplicate ("twin", spawned on the first `mousemove` via `Model.splitNode`) that the rest of the gesture drags around like any other node — including being droppable onto a third node to merge there. Both are gated behind the "Merge & Split" toggle (`NodeOptions.js`'s `mergeSplit`, off by default); when off, dropping a node on another just leaves them overlapping, and Alt+drag behaves like an ordinary drag. A split duplicates every edge touching the original onto the twin and downgrades ALL of them (the original's own edges too) to `edgeType: "questionable"`, since neither node's inherited connections are "confirmed" until reviewed. |
| `Eraser.js` | Erase tool — deletes nodes and edges on click. |
| `Labeller.js` | Label tool — creates free-floating text labels. |
| `History.js` | Undo/redo stack using snapshots of the full model state. Also persists history to `localStorage`. |
| `HistoryTracker.js` | Generates human-readable descriptions of model changes (used for the action log). |
| `NodeOptions.js` | Global, per-field visibility toggles for the Node and Edge sidebar pages, shown in the Sidebar's collapsible "Model options" grouped as Node Fields (Size), Edge Fields (Edge Polarity), and Simulation (Node Type, Start Amount, Gain, Quantum, Signal Attenuation, Signal Speed) — all off by default; a Node's Name, Description, and Node Group, and an Edge's Edge Type, are always shown (not toggleable). Also holds the non-field "Merge & Split" interaction toggle (`mergeSplit`, off by default, under Node Fields) that gates `Dragger.js`'s drag-node-onto-node merge and Alt+drag split. Merges a diagram-serialized default with a per-browser `localStorage` override and publishes `settings/changed` on change. "direction" (Edge Polarity) is special: it picks between two mutually-exclusive canvas display modes for a "-" edge's polarity (colour vs +/- icon) rather than just showing/hiding a field — see `Edge.js`. |
| `NodeGroups.js` | Diagram-level list of 1-8 named colour groups (a node's `hue` is an index into this list), using the fixed, colour-blind-safe Okabe-Ito palette — group *N* always uses palette colour *N*; only a group's name and the group count are editable. A node can also be explicitly ungrouped (`hue === null`), rendered in a fixed grey (`NULL_COLOUR`) — the "clear node group" swatch in the sidebar sets this, and it's also what a node reverts to if its group is removed via `removeLastGroup()`. Publishes `groups/changed` on add/remove/load; `Model.js` listens to rebuild `COLOUR_NODE_LIST`. |
| `Layout.js` | Auto-layout algorithms: `computeForceDirected` (always available, handles cycles) and `computeSugiyama` (DAG-only layered layout, top-to-bottom; `hasCycle` gates whether it's offered — self-loops don't count as cycles). Both are pure functions returning `{nodeId:{x,y}}`; `startTransition` animates the model to a target layout over ~1s, driven by `Loopy.js`'s 30fps update tick. Triggered via `loopy.layoutForceDirected()`/`loopy.layoutSugiyama()` (`Loopy.js`), each one History-checkpointed as a single undoable action. |
| `Mouse.js` | Normalises mouse/touch events; publishes `mousemove`, `mousedown`, `mouseup`, `mouseclick`. |
| `Key.js` | Keyboard handler; publishes `key/undo`, `key/redo`, `key/zoomin`, etc. Also tracks live modifier flags the same way for both keys pressed and released (`Key.control`, `Key.alt`) that other modules read synchronously rather than via pub/sub — e.g. `Dragger.js` checks `Key.alt` at `mousedown` to distinguish an ordinary node drag from an Alt+drag split. |
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

Edge fields: `fromId, toId, arc, strength, speedMultiplier, [rotation], edgeType`

`settings[]` holds `[MAX_SIGNAL_AGE, MAX_SIGNALS_PER_EDGE, MAX_SIGNALS, showType, showGroup, showStartAmount, showRadius, showGain, showStrength, showEdgePolarity, showAttenuation, showSpeed, showEdgeType, allowMergeSplit]` — entries 3+ are the diagram-embedded defaults for `NodeOptions.js`'s toggles (6 node keys, then 4 edge keys, then the 1 interaction key `mergeSplit` appended last so old links' indices don't shift) and may be absent/short in links saved by older versions (treated as "no diagram default" rather than an error).

`groupNames[]` is a flat array of Node Group names (e.g. `["Risks","Mitigations"]`); the group count is `groupNames.length` (1-8) and each name's colour is `NodeGroups.PALETTE[index]` (fixed, not stored). Absent in older links, which fall back to the default 2 groups.

## Embedding

Add `?embed=1&data=...` to the URL. When embedded: toolbar and sidebar are hidden, the canvas goes fullscreen, and the simulation auto-plays. Add `&no_ui=1` to also hide the play bar. Add `&signal=[nodeId, delta]` to auto-trigger a signal on load.

## Canvas Rendering

All drawing uses the HTML5 Canvas API at 2× resolution (retina). The model canvas is transformed with `ctx.setTransform` using `loopy.offsetX`, `loopy.offsetY`, and `loopy.offsetScale` for pan/zoom. Drawing is lazy: a `drawCountdown` timer prevents unnecessary redraws when nothing is moving.

## Node Active Types

- `0` = non-simulable (no up/down controls in play mode, does not propagate signals)
- `1` = simulable (shows up/down controls, propagates signals) — **the default**, including when the "Node Type" field is toggled off
- `2` = split node (rendered with top/bottom labels and a horizontal divider; no controls) — legacy only, no longer selectable from the sidebar's `ComponentNodeType` picker, but old saved links with it still render correctly via `SplitNodeRenderer.js`

## Edge Types

- `"directed"` (default) — solid line, single arrowhead at "to", normal signal propagation
- `"bi-directed"` — dashed line, arrowheads at both ends, normal signal propagation
- `"questionable"` — dotted line, a "?" glyph at ~30% along the arrow, signal visibly travels but is never delivered to "to" (see `Edge.updateSignals`)
