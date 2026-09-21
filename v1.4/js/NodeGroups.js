/**********************************

NODE GROUPS
- A diagram-level list of named colour groups, used to give a node's
  colour (its "hue" index) a meaning: a node coloured group 3 means
  whatever the diagram author typed as Group 3's name (e.g. "Risks").
- Colours come from the Okabe-Ito colour-blind-safe palette (Okabe &
  Ito, 2008) in a fixed order. A group's colour is simply its position
  in that palette - only the NAME and the NUMBER of groups (1-8) are
  editable, so colours can't collide or be reassigned.
- Serialized with the diagram (just the array of names; the group
  count is implied by the array's length) so a shared link carries the
  author's group names along with it.
- A node can also be explicitly ungrouped (hue === null), drawn in a
  fixed grey (NULL_COLOUR). This is what a node reverts to if its
  group is removed via removeLastGroup(), ready for manual reassignment.

**********************************/

function NodeGroups(loopy){

	var self = this;
	self.loopy = loopy;

	// Fixed, colour-blind-safe palette. Group N always uses PALETTE[N].
	self.PALETTE = [
		"#E69F00", // orange
		"#56B4E9", // sky blue
		"#009E73", // bluish green
		"#F0E442", // yellow
		"#0072B2", // blue
		"#D55E00", // vermillion
		"#CC79A7", // reddish purple
		"#000000"  // black
	];

	self.MIN_GROUPS = 1;
	self.MAX_GROUPS = self.PALETTE.length; // 8

	// A node can also be explicitly ungrouped ("hue" === null) - shown in
	// this grey, not part of self.groups/the palette. This is also what
	// a node reverts to when its group is removed entirely.
	self.NULL_COLOUR = "#999999";

	self._defaultGroups = function(){
		return [
			{name: "Group 1"},
			{name: "Group 2"}
		];
	};

	// Start with 2 groups, as requested.
	self.groups = self._defaultGroups();

	// Colour lookup, keyed like the old static COLOUR_NODE_LIST so
	// Model.js/Node.js/Edge.js/Sidebar.js don't need to change how they
	// read a node's colour by hue index.
	self.getColourList = function(){
		var list = {};
		for(var i=0; i<self.groups.length; i++){
			list[i] = self.PALETTE[i];
		}
		list[null] = self.NULL_COLOUR; // node.hue === null -> ungrouped, grey
		return list;
	};

	self.getName = function(index){
		return (self.groups[index] && self.groups[index].name) || ("Group " + (index+1));
	};

	// Deliberately does NOT publish "groups/changed" - that would trigger a
	// full re-render of the group list (and any open swatch pickers) on
	// every keystroke, stealing focus out of the input being typed into.
	// Only publishes model/changed (dirty-flag/save tracking).
	// While "Cluster by groups" is on (Sidebar.js's suboption under
	// Cluster), a group's name IS its members' Cluster name, so renaming
	// it here renames that Cluster too - via Clusters.renameCluster, so
	// the Cluster's description (which lives there, not here) follows
	// the rename instead of being orphaned under the old name.
	self.setName = function(index, name){
		if(!self.groups[index]) return;
		var oldName = self.groups[index].name;
		self.groups[index].name = name;
		var clusterByGroups = self.loopy.nodeOptions && self.loopy.nodeOptions.get("clusterByGroups");
		if(clusterByGroups && self.loopy.clusters && oldName !== name){
			self.loopy.clusters.renameCluster(oldName, name); // publishes model/changed itself
		} else {
			publish("model/changed");
		}
	};

	// Groups can only grow/shrink from the end, so an existing node's
	// hue index never gets silently remapped to a different group.
	self.addGroup = function(){
		if(self.groups.length >= self.MAX_GROUPS) return;
		self.groups.push({name: "Group " + (self.groups.length+1)});
		publish("model/changed");
		publish("groups/changed");
	};

	self.removeLastGroup = function(){
		if(self.groups.length <= self.MIN_GROUPS) return;
		var removedIndex = self.groups.length - 1;
		self.groups.pop();
		// Any node currently in the removed group becomes ungrouped
		// (grey), ready for manual reassignment - never silently
		// remapped to a different, still-existing group.
		if(self.loopy.model){
			self.loopy.model.nodes.forEach(function(node){
				if(node.hue === removedIndex) node.hue = null;
			});
		}
		publish("model/changed");
		publish("groups/changed");
	};

	// Diagram serialization: just the names; count is names.length.
	self.getDiagramState = function(){
		return self.groups.map(function(g){ return g.name; });
	};

	// names may be undefined/empty (old links, or a blank diagram) ->
	// fall back to the default 4 groups.
	self.loadFromDiagram = function(names){
		if(names && names.length){
			self.groups = names.map(function(name){ return {name: name}; });
		} else {
			self.groups = self._defaultGroups();
		}
		publish("groups/changed");
	};

}
