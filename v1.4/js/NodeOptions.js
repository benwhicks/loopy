/**********************************

NODE OPTIONS
- Global, per-field visibility toggles for the Node and Edge sidebar
  pages. Every field EXCEPT a Node's "label" (Name), "description"
  (Description), "hue" (Node Group), and an Edge's "edgeType" (Edge
  Type) - all always shown, see below - is opt-in and OFF by default:
    Node:  Node Type, Start Amount, Radius, Gain, Strength
    Edge:  Edge Polarity (+/-), Signal Attenuation, Signal Speed

IMPORTANT: toggling a field OFF only hides its editing UI in the Sidebar.
The underlying Node/Edge property is completely untouched - a node with
a field turned off still simulates and renders identically. Only the
ability to *edit* that field from the sidebar goes away.

NOTE - "hue" (Node Group) and "edgeType" (Edge Type): both kept in
NODE_KEYS/EDGE_KEYS/self.visibility purely so the settings[]
serialization layout (Model.js) doesn't shift for old saved links, but
neither is exposed as a toggle in the Sidebar's "Model options"
checkboxes any more - Sidebar.js's Node page always shows the Node
Group swatch picker, and its Edge page always shows the Edge Type
picker, regardless of these values (see Sidebar.js's
_buildNodeGroupsSection and the Edge page's EDGE_OPTIONAL_KEYS).

SPECIAL CASE - "direction" (Edge Polarity): this one also picks which of
two mutually-exclusive ways a "-" edge's polarity is shown on the canvas
(see Edge.js draw()), not just the sidebar editing control:
  OFF (default) - COLOUR: a "-" edge is always dark red
    (COLOUR_EDGE_NEGATIVE), a passive cue that needs no toggle.
  ON - ICON: every edge shows its +/- glyph instead, and the dark-red
    colouring switches off (a "-" edge falls back to normal/speed
    colouring) since the icon is now the polarity cue.
Either way, turning the toggle off never touches any edge's underlying
direction value - only which display mode is used, and whether the
sidebar's Edge Polarity slider is shown for editing it.

SPECIAL CASE - "edgeType": its visuals (dash pattern, arrowheads, the
"?" glyph) and its effect on simulation (a "questionable" edge never
delivers its signal) always apply on the canvas - this was true even
back when it was still a toggle-gated sidebar field, and remains true
now that the field itself is always shown too (see the NOTE above).

SPECIAL CASE - "mergeSplit": not a field-visibility toggle at all (it's
in INTERACTION_KEYS, not NODE_KEYS/EDGE_KEYS) - it gates the Drag tool's
merge-on-drop behaviour (dragging one node onto another, see
Dragger.js's mergeTarget detection/mouseup handler and Model.mergeNodes)
and its symmetric Alt+drag split-off-a-twin gesture (Dragger.js's
pendingSplitNode/Model.splitNode). OFF by default like everything else
here - merging and splitting only work once this is turned on.

Precedence when computing the merged, currently-active visibility state:
  localStorage override (this browser) > diagram default (this file) > off

**********************************/

function NodeOptions(loopy){

	var self = this;
	self.loopy = loopy;

	// Fixed order == settings[] indices 3-8 (node) / 9-12 (edge) in
	// Model.serialize/deserialize, and the checkbox order in the
	// Sidebar's persistent Options header.
	self.NODE_KEYS = ["active", "hue", "init", "radius", "gain", "strength"];
	self.EDGE_KEYS = ["direction", "attenuation", "speedMultiplier", "edgeType"];
	// Interaction toggles (not a per-node/per-edge editable field, so not
	// part of NODE_KEYS/EDGE_KEYS above - those also drive which Sidebar
	// page a field's checkbox lives under). Appended AFTER NODE_KEYS/
	// EDGE_KEYS in self.KEYS/settings[] (index 13) so existing indices
	// 3-12 - and thus old saved links - are untouched.
	self.INTERACTION_KEYS = ["mergeSplit"];
	self.KEYS = self.NODE_KEYS.concat(self.EDGE_KEYS).concat(self.INTERACTION_KEYS);

	self.storageKey = "loopy_node_options";

	// Merged runtime state: { active:bool, hue:bool, ..., direction:bool, ... }
	self.visibility = {};

	// Read this browser's saved overrides, if any.
	self._loadLocalOverrides = function(){
		try {
			var raw = localStorage.getItem(self.storageKey);
			return raw ? JSON.parse(raw) : null;
		} catch(e){
			return null;
		}
	};

	// Persist the FULL current visibility snapshot to this browser.
	// (All-or-nothing, like History.js's persistence - the first toggle
	// pins all keys locally, not just the one that was clicked.)
	self._saveLocalOverrides = function(){
		try {
			localStorage.setItem(self.storageKey, JSON.stringify(self.visibility));
		} catch(e){
			// localStorage unavailable (private browsing, etc) - ignore.
		}
	};

	// Recompute self.visibility from a diagram's defaults + local overrides,
	// then notify anything listening (e.g. an open Sidebar page).
	// diagramDefaults: array of 0/1 (or undefined), index-aligned to self.KEYS.
	self._recompute = function(diagramDefaults){
		var overrides = self._loadLocalOverrides();
		var next = {};
		for(var i=0; i<self.KEYS.length; i++){
			var key = self.KEYS[i];
			var diagVal = (diagramDefaults && diagramDefaults[i] !== undefined)
				? !!diagramDefaults[i] : false;
			next[key] = (overrides && overrides[key] !== undefined)
				? !!overrides[key] : diagVal;
		}
		self.visibility = next;
		publish("settings/changed");
	};

	// Called by Model.deserialize with settings.slice(3, 3+self.KEYS.length).
	self.loadFromDiagram = function(diagramDefaults){
		self._recompute(diagramDefaults);
	};

	// Called by Model.serialize to embed the current state as the
	// diagram's shared default.
	self.getDiagramDefaults = function(){
		return self.KEYS.map(function(key){
			return self.visibility[key] ? 1 : 0;
		});
	};

	// Called by the Options header's checkboxes.
	self.set = function(key, value){
		self.visibility[key] = !!value;
		self._saveLocalOverrides();
		publish("settings/changed");
	};

	self.get = function(key){
		return !!self.visibility[key];
	};

	// Initial state at app boot, before any diagram is loaded (the blank
	// canvas case, where Model.deserialize is never called): local
	// override if present, else all off.
	self._recompute(null);

}
