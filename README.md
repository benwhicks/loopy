![](https://i.imgur.com/S8c7E8o.gif)

### LOOPY - a tool for thinking in systems
### [Version 1.2 enhanced by John Kennedy](https://efa.unisa.edu.au/Loopy)

[Zero Rights Reserved](http://creativecommons.org/publicdomain/zero/1.0/):
LOOPY is entirely open source/public domain.

To mirror LOOPY, just clone this Github Repo with the 1.2 branch.
([learn more about these free Github Pages](https://pages.github.com/))

Other Peeps' Open Source Code I Used:
- [minpubsub](https://github.com/daniellmb/MinPubSub)
- [balloon.css](https://kazzkiq.github.io/balloon.css/)
- [simple sharing buttons](https://simplesharingbuttons.com/)
- [the original Loopy](https://github.com/ncase/loopy)

Check out these [user-made LOOPY's!](http://ncase.me/loopy/v1.1/pages/examples)
---
Version 1.4:

New Features:
  - Node description field: a paragraph of documentation per node, shown only in the sidebar (never drawn on the canvas)
  - Node Groups: named colour categories using the Okabe-Ito colour-blind-safe palette, 1-8 groups, renameable, plus a "clear group" option that leaves a node explicitly ungrouped (grey)
  - Global, per-field visibility toggles ("Model options"): almost every node/edge field is off by default until switched on, keeping the sidebar minimal until you need more
  - Edge Polarity is now a single global setting with two mutually exclusive display modes: off (default) always shows a "-" edge in dark red; on shows the +/- glyph on every edge instead (editable from the sidebar) and the dark-red colouring falls back to normal/speed-based colouring
  - Edge Types: Directed (default), Bi-directed (dashed line, arrowheads at both ends), and Questionable (dotted line, "?" marker, never delivers its signal during simulation)
  - Auto-layout: re-arrange the whole diagram in one click, either Force-Directed (always available) or Sugiyama/layered (enabled only on an acyclic graph), animated into place and fully undoable
  - "Clear graph" button to wipe the canvas, behind a confirmation prompt
  - Merge & Split (opt-in "Merge & Split" toggle, off by default): drag one node onto another to merge them - matching Node Groups are kept (an ungrouped side adopts the other's group; two different groups fall back to ungrouped) and descriptions concatenate as "NodeA: ...\nNodeB: ..."; Alt+drag a node (or use the Node sidebar's "split node" button) to peel off a full duplicate instead, downgrading every affected edge to "Questionable" so old connections get reviewed before they're trusted again
  - Cluster: an optional, free-text node attribute for grouping nodes outside the fixed 1-8 Node Groups - any number of clusters, each with its own shared description, plus a "rename" action that retags every member at once; a "Cluster by groups" option keeps cluster names automatically in sync with Node Group names
  - "About this model": a collapsible sidebar section for a Model name and a longer Model context blurb - diagram-level notes that travel with the saved/shared link
  - DOT export rewritten for full metadata coverage: clusters as Graphviz subgraphs, node descriptions, model name/context, real Node Group colours, and edge type/polarity as structured attributes

Fixes & Changes:
  - Retired the "split" node type from the sidebar - only Simulable and Non-simulable remain (older diagrams with split nodes still load and display correctly)
  - Edges now leave a small gap at both ends, instead of starting from the node's centre
  - Sidebar redesigned: shows only the selected node's or edge's own fields, background-tinted to match the canvas selection highlight; a collapsible "Model options" section, the Node Groups editor, and export controls live on the deselected page
  - Default zoom on load is less zoomed in; "clear graph" resets pan/zoom back to 100%
  - Removed the Ctrl +/- keyboard zoom shortcut, which was clashing with the browser's own page zoom (Ctrl+Scroll and the toolbar buttons still zoom LOOPY's canvas)
  - Sidebar reorganized again: the title/links/zoom block moved out into a small floating widget top-left (click it for the credits); the deselected page now runs Layout -> Node Groups -> collapsible Model options -> collapsible "Save, share or load" (bundling the history manager, DOT/link/file export, embed, and clear graph); Node Groups now starts with 2 groups instead of 4
  - Fixed a stray, disconnected node being created when drawing a stroke through an existing node with the Ink tool
  - Node split now zooms to fit afterwards so the new twin can't end up off-screen
  - Model context text in the sidebar is now a smaller, more appropriate size for a long note

Version 1.3:

New Features:
  - Detailed action tracking with timestamps
  - New split node with top and bottom labels
  - History export/import in JSON format
  - Edge +/- label visibility toggle
  - Undo/Redo support
  - Automatic history saving to browser storage
  - Multi-object movement via rectangular selection
  - Export to DOT format
  - Zoom in/out support
  - Multiline node text support

Fixes & Changes:
  - Node text now wraps to the next line and auto-fits within the node
  - Limited selectable configuration options to five per category:
      Start Amount: 0, 0.25, 0.50, 0.75, 1
      Node Radius: 45, 60, 80, 110, 150
      Node Gain: 0.5, 0.75, 1, 1.33, 2
      Node Quantum: 0.001, 0.01, 0.1, 0.2, 0.33

Version 1.2:
- Various Changes made to Nodes including
  - Node Type added. Nodes can now be active with arrows or inactive like instruments.
  - There are 10 colours to choose from in the colour palette
  - The node radius can be set noting that this only increases the size of the node not its capacity
  - The node gain can now be set.  Gain is the ratio of the output signal from a node to its input signal when prodded by a signal.
  - The node quantum can now be set. Quantum is the size of the signal emitted from an active node when the arrows are pressed.
- Various Changes made to Edges including
  - Signal Attenuation added. How much should a signal deteriorate as it passes along an edge.  The actual attenuation happens at the mid point.
  - Signal Speed added. The speed of the signal along the edge can now be controlled as a percentage of normal speed as well as by using longer edges.
- General Changes
  - The serialise and deserialise functions have been modified to take into account the new node and edge properties (these functions are in js/model.js).
  - Simulation Settings have been added to the Serialise and Deserialise functions. This includes a maximum signal age setting by default set to 5.  That is a signal will not propagate along more than 5 edges.  This is changed at the top of js/model.js or through the data query string.

Version 1.1:
- node amounts are now "uncapped"
- better distribution of "signals"

Version 1.0: the whole everything.
