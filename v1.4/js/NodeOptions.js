/**********************************

NODE OPTIONS
- Global, per-field visibility toggles for the Node and Edge sidebar
  pages. Every field EXCEPT a Node's "label" (Name) and "description"
  (Description) is opt-in and OFF by default:
    Node:  Node Type, Node Group, Start Amount, Radius, Gain, Strength
    Edge:  Edge Polarity (+/-), Signal Attenuation, Signal Speed

IMPORTANT: toggling a field OFF only hides its editing UI in the Sidebar.
The underlying Node/Edge property is completely untouched - a node with
"Node Group" turned off still has a hue, still simulates, still renders
identically. Only the ability to *edit* that field from the sidebar goes
away.

SPECIAL CASE - "direction" (Edge Polarity): this one also gates whether
the +/- glyph is drawn on EVERY edge on the canvas (see Edge.js draw()),
not just the sidebar editing control - turning it on both shows every
edge's polarity and lets you change it; turning it off hides the glyph
everywhere but leaves each edge's direction value untouched. Independent
of this toggle, a negative edge is always drawn dark red (Edge.js), as a
passive cue that doesn't require the toggle to be on.

Precedence when computing the merged, currently-active visibility state:
  localStorage override (this browser) > diagram default (this file) > off

**********************************/

function NodeOptions(loopy){

	var self = this;
	self.loopy = loopy;

	// Fixed order == settings[] indices 3-8 (node) / 9-11 (edge) in
	// Model.serialize/deserialize, and the checkbox order in the
	// Sidebar's persistent Options header.
	self.NODE_KEYS = ["active", "hue", "init", "radius", "gain", "strength"];
	self.EDGE_KEYS = ["direction", "attenuation", "speedMultiplier"];
	self.KEYS = self.NODE_KEYS.concat(self.EDGE_KEYS);

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
