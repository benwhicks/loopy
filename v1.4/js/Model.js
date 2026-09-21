/**********************************

MODEL!

**********************************/

function Model(loopy){

	var self = this;
	self.loopy = loopy;

	// SET SOME DEFAULT Properties
	self.speed = 0.05;
	self.DEFAULT_SIGNAL_SIZE = 0.1; //Sets size of quantum transferred by one click and size of arrow
	self.DEFAULT_NODE_RADIUS = 80; // Sets size of bubbles
	self.DEFAULT_NODE_GAIN = 1; //Gain multiplier for signal at each node
	self.MAX_SIGNAL_AGE = 5; //Maximum number of nodes a signal can traverse
	self.SIGNAL_SCALE_FACTOR = 100; //sets a scaling factor for the arrows
	self.DEFAULT_EDGE_STRENGTH = 0.75;
	self.MAX_SIGNALS = 200;
	self.MAX_SIGNALS_PER_EDGE = 25;

	// Diagram-level metadata, shown in the Sidebar's "About this model"
	// section (see Sidebar.js's _buildModelInfoSection). Free text, no
	// effect on simulation/rendering. NOTE: named "contextText", NOT
	// "context" - self.context is already used further down for the
	// canvas 2D rendering context (self.context = ctx), and Dragger.js/
	// Label.js both read loopy.model.context expecting that canvas
	// context object. Reusing the name here would silently break drawing.
	self.name = "";
	self.contextText = "";

	//DEFINE CORE COLOURS
	self.COLOUR_CONTROL_ARROWS = "rgba(0,0,0,0.8)";
	self.COLOUR_NODE_TEXT = "rgba(0,0,0,0.8)";
	self.COLOUR_NODE_EMPTY = "rgba(255,255,255,0.3)";
	// Default palette shown before NodeGroups has synced (first 4 colours
	// of the Okabe-Ito palette). Kept in sync with loopy.nodeGroups via
	// refreshColourList(), called on "groups/changed".
	self.COLOUR_NODE_LIST = {
		0: "#E69F00",
		1: "#56B4E9",
		2: "#009E73",
		3: "#F0E442"
		};
	self.refreshColourList = function(){
		if(self.loopy.nodeGroups){
			self.COLOUR_NODE_LIST = self.loopy.nodeGroups.getColourList();
		}
	};
	subscribe("groups/changed", self.refreshColourList);
	self.COLOUR_EDGE_TEXT = "rgba(102,102,102,1)";
	self.COLOUR_EDGE = "rgba(102,102,102,1)";
	self.COLOUR_EDGE_FAST = "rgba(51,171,95,1)";
	self.COLOUR_EDGE_SLOW = "rgba(178,34,34,1)";
	// Always-visible polarity cue: a "-" (balancing) edge is always drawn
	// in this very dark red, regardless of speed colouring or whether the
	// Edge Polarity toggle is on - see Edge.js draw().
	self.COLOUR_EDGE_NEGATIVE = "rgba(75,0,0,1)";

	// Create canvas & context
	var canvas = _createCanvas();
	var ctx = canvas.getContext("2d");
	self.canvas = canvas;
	self.context = ctx;

	///////////////////
	// NODES //////////
	///////////////////

	// Nodes
	self.nodes = [];
	self.nodeByID = {};
	self.getNode = function(id){
		return self.nodeByID[id];
	};

	// Remove Node
	self.addNode = function(config){

		// Model's been changed!
		publish("model/changed");

		// Add Node
		var node = new Node(self,config);
		self.nodeByID[node.id] = node;
		self.nodes.push(node);
		self.update();
		return node;

	};

	// Remove Node
	self.removeNode = function(node){

		// Model's been changed!
		publish("model/changed");

		// Remove from array
		self.nodes.splice(self.nodes.indexOf(node),1);

		// Remove from object
		delete self.nodeByID[node.id];

		// Remove all associated TO and FROM edges
		for(var i=0; i<self.edges.length; i++){
			var edge = self.edges[i];
			if(edge.to==node || edge.from==node){
				edge.kill();
				i--; // move index back, coz it's been killed
			}
		}

	};


	///////////////////
	// EDGES //////////
	///////////////////

	// Edges
	self.edges = [];

	// Remove edge
	self.addEdge = function(config){

		// Model's been changed!
		publish("model/changed");

		// Add Edge
		var edge = new Edge(self,config);
		self.edges.push(edge);
		self.update();
		return edge;
	};

	// Remove edge
	self.removeEdge = function(edge){

		// Model's been changed!
		publish("model/changed");

		// Remove edge
		self.edges.splice(self.edges.indexOf(edge),1);

	};

	// Merge two nodes into one
	self.mergeNodes = function(nodeA, nodeB) {
		// Tag the next history record as a designated merge event
		self.loopy.history.pendingHistoryAction = HistoryTracker.nodeMerged(
			nodeA.label, nodeB.label, nodeA.label + '_' + nodeB.label
		);

		// 1. Snapshot all affected edge configs before killing anything
		var edgeConfigs = [];
		for (var i = 0; i < self.edges.length; i++) {
			var edge = self.edges[i];
			if (edge.from === nodeA || edge.from === nodeB ||
				edge.to === nodeA   || edge.to === nodeB) {
				edgeConfigs.push({
					fromNode:        edge.from,
					toNode:          edge.to,
					arc:             edge.arc,
					rotation:        edge.rotation,
					strength:        edge.strength,
					direction:       edge.direction,
					attenuation:     edge.attenuation,
					speedMultiplier: edge.speedMultiplier,
					edgeType:        edge.edgeType
				});
			}
		}

		// 2. Create merged node at nodeB's position/style

		// Description: concatenate both nodes' notes, each labeled by its
		// original node's name, so a merge never silently loses either
		// side's documentation. A node with no description contributes
		// no line (avoids an orphan "Name: " line for the common case
		// where only one side had notes).
		var descriptionParts = [];
		if(nodeA.description) descriptionParts.push(nodeA.label + ': ' + nodeA.description);
		if(nodeB.description) descriptionParts.push(nodeB.label + ': ' + nodeB.description);
		var mergedDescription = descriptionParts.join('\n');

		// Node Group: keep it if both nodes agree (including both being
		// ungrouped); if only one side has a defined group and the other
		// is ungrouped (null), adopt the defined one - there's no real
		// conflict there. Only two DIFFERENT defined groups are a genuine
		// contradiction, falling back to ungrouped (null), the same value
		// a node gets when its group is removed via NodeGroups.removeLastGroup().
		var mergedHue;
		if(nodeA.hue === nodeB.hue) mergedHue = nodeA.hue;
		else if(nodeA.hue === null) mergedHue = nodeB.hue;
		else if(nodeB.hue === null) mergedHue = nodeA.hue;
		else mergedHue = null;

		// Cluster: same reasoning as Node Group above - keep it if both
		// sides agree (including both being cluster-less), adopt the
		// defined side if only one has one, and fall back to "" (no
		// cluster) if the two sides name different clusters, since that's
		// a genuine contradiction, not something to silently guess at.
		var mergedCluster;
		if(nodeA.cluster === nodeB.cluster) mergedCluster = nodeA.cluster;
		else if(!nodeA.cluster) mergedCluster = nodeB.cluster;
		else if(!nodeB.cluster) mergedCluster = nodeA.cluster;
		else mergedCluster = '';

		var mergedNode = self.addNode({
			x:           nodeB.x,
			y:           nodeB.y,
			label:       nodeA.label + '_' + nodeB.label,
			description: mergedDescription,
			hue:         mergedHue,
			cluster:     mergedCluster,
			radius:      nodeB.radius,
			gain:        nodeB.gain,
			init:        nodeB.init,
			active:      nodeB.active,
			topLabel:    nodeB.topLabel,
			bottomLabel: nodeB.bottomLabel
		});

		// 3. Kill originals (cascade-kills their edges)
		nodeA.kill();
		nodeB.kill();

		// 4. Recreate edges, redirecting A/B to mergedNode, deduplicating identical ones
		var seen = {};
		for (var i = 0; i < edgeConfigs.length; i++) {
			var ec = edgeConfigs[i];
			var fromId = (ec.fromNode === nodeA || ec.fromNode === nodeB) ? mergedNode.id : ec.fromNode.id;
			var toId   = (ec.toNode   === nodeA || ec.toNode   === nodeB) ? mergedNode.id : ec.toNode.id;
			var key = fromId + '/' + toId + '/' + Math.sign(ec.strength);
			if (seen[key]) continue;
			seen[key] = true;
			self.addEdge({
				from:            fromId,
				to:              toId,
				arc:             ec.arc,
				rotation:        ec.rotation,
				strength:        ec.strength,
				direction:       ec.direction,
				attenuation:     ec.attenuation,
				speedMultiplier: ec.speedMultiplier,
				edgeType:        ec.edgeType
			});
		}
	};

	// Split a node into two: the original stays exactly where it is - a
	// new "twin" (full property duplicate, same position) is created for
	// the caller (Dragger.js) to drag away. Every edge touching the
	// original is duplicated onto the twin, and ALL of them - the
	// original's own edges AND the twin's copies - are downgraded to
	// "questionable", since a split creates uncertainty about which node
	// each old connection still belongs to; nothing is left silently
	// delivering signal until the user reviews and re-confirms each
	// edge's type.
	self.splitNode = function(node){
		self.loopy.history.pendingHistoryAction = HistoryTracker.nodeSplit(node.label);

		// 1. Snapshot every edge touching the original before creating anything
		var touchingEdges = [];
		for(var i=0; i<self.edges.length; i++){
			var edge = self.edges[i];
			if(edge.from===node || edge.to===node) touchingEdges.push(edge);
		}

		// 2. Create the twin - full property duplicate, same position
		//    (Dragger.js starts dragging it away immediately). Unlike
		//    mergeNodes (which combines two nodes and intentionally
		//    drops strength/description), a split is an unambiguous full
		//    copy, so nothing is left out.
		var twin = self.addNode({
			x:           node.x,
			y:           node.y,
			label:       node.label,
			description: node.description,
			hue:         node.hue,
			cluster:     node.cluster,
			radius:      node.radius,
			gain:        node.gain,
			init:        node.init,
			strength:    node.strength,
			active:      node.active,
			topLabel:    node.topLabel,
			bottomLabel: node.bottomLabel
		});

		// 3. Duplicate each touching edge onto the twin; downgrade BOTH
		//    the original's own edge and the new copy to "questionable".
		//    (A self-loop naturally duplicates as a self-loop on the
		//    twin too - no special-casing needed.)
		for(var i=0; i<touchingEdges.length; i++){
			var edge = touchingEdges[i];
			var fromId = (edge.from===node) ? twin.id : edge.from.id;
			var toId   = (edge.to===node)   ? twin.id : edge.to.id;
			self.addEdge({
				from:            fromId,
				to:              toId,
				arc:             edge.arc,
				rotation:        edge.rotation,
				strength:        edge.strength,
				direction:       edge.direction,
				attenuation:     edge.attenuation,
				speedMultiplier: edge.speedMultiplier,
				edgeType:        "questionable"
			});
			edge.edgeType = "questionable";
		}
		publish("model/changed");

		return twin;
	};

	// Get all edges with start node
	self.getEdgesByStartNode = function(startNode){
		return self.edges.filter(function(edge){
			return(edge.from==startNode);
		});
	};




	///////////////////
	// LABELS /////////
	///////////////////

	// Labels
	self.labels = [];

	// Remove label
	self.addLabel = function(config){

		// Model's been changed!
		publish("model/changed");

		// Add label
		var label = new Label(self,config);
		self.labels.push(label);
		self.update();
		return label;
	};

	// Remove label
	self.removeLabel = function(label){

		// Model's been changed!
		publish("model/changed");

		// Remove label
		self.labels.splice(self.labels.indexOf(label),1);

	};



	///////////////////
	// UPDATE & DRAW //
	///////////////////

	var _canvasDirty = false;

	self.update = function(){

		// Update edges THEN nodes
		for(var i=0;i<self.edges.length;i++) self.edges[i].update(self.speed);
		for(var i=0;i<self.nodes.length;i++) self.nodes[i].update(self.speed);

		// Dirty!
		_canvasDirty = true;

	};

	// SHOULD WE DRAW?
	var drawCountdownFull = 60; // two-second buffer!
	var drawCountdown = drawCountdownFull;

	// ONLY IF MOUSE MOVE / CLICK
	subscribe("mousemove", function(){ drawCountdown=drawCountdownFull; });
	subscribe("mousedown", function(){ drawCountdown=drawCountdownFull; });

	// OR INFO CHANGED
	subscribe("model/changed", function(){
		if(self.loopy.mode==Loopy.MODE_EDIT) drawCountdown=drawCountdownFull;
	});

	// OR RESIZE or RESET
	subscribe("resize",function(){ drawCountdown=drawCountdownFull; });
	subscribe("model/reset",function(){ drawCountdown=drawCountdownFull; });
	subscribe("loopy/mode",function(){
		if(loopy.mode==Loopy.MODE_PLAY){
			drawCountdown=drawCountdownFull*2;
		}else{
			drawCountdown=drawCountdownFull;
		}
	});

	self.draw = function(){

		// SHOULD WE DRAW?
		// ONLY IF ARROW-SIGNALS ARE MOVING
		for(var i=0;i<self.edges.length;i++){
			if(self.edges[i].signals.length>0){
				drawCountdown = drawCountdownFull;
				break;
			}
		}

		// DRAW???????
		drawCountdown--;
		if(drawCountdown<=0) return;

		// Also only draw if last updated...
		if(!_canvasDirty) return;
		_canvasDirty = false;

		// Clear!
		ctx.clearRect(0,0,self.canvas.width,self.canvas.height);

		// Translate
		ctx.save();

		// Translate to center, (translate, scale, translate) to expand to size
		var canvasses = document.getElementById("canvasses");
		var CW = canvasses.clientWidth - _PADDING - _PADDING;
		var CH = canvasses.clientHeight - _PADDING_BOTTOM - _PADDING;
		var tx = loopy.offsetX*2;
		var ty = loopy.offsetY*2;
		tx -= CW+_PADDING;
		ty -= CH+_PADDING;
		var s = loopy.offsetScale;
		tx = s*tx;
		ty = s*ty;
		tx += CW+_PADDING;
		ty += CH+_PADDING;
		if(loopy.embedded){
			tx += _PADDING; // dunno why but this is needed
			ty += _PADDING; // dunno why but this is needed
		}
		ctx.setTransform(s, 0, 0, s, tx, ty);

		// Draw labels THEN edges THEN nodes
		for(var i=0;i<self.labels.length;i++) self.labels[i].draw(ctx);
		for(var i=0;i<self.edges.length;i++) self.edges[i].draw(ctx);
		for(var i=0;i<self.nodes.length;i++) self.nodes[i].draw(ctx);

		// Restore
		ctx.restore();

	};




	//////////////////////////////
	// SERIALIZE & DE-SERIALIZE //
	//////////////////////////////

	self.serialize = function(){

		var data = [];
		// 0 - nodes
		// 1 - edges
		// 2 - labels
		// 3 - Simulation Settings
		// 4 - UID


		// Nodes
		var nodes = [];
		for(var i=0;i<self.nodes.length;i++){
			var node = self.nodes[i];
			// 0 - id
			// 1 - x
			// 2 - y
			// 3 - init value
			// 4 - label
			// 5 - hue
			// 6 - radius
			// 7 - gain
			// 8 - strength
			// 9 - active
			nodes.push([
				node.id,
				Math.round(node.x),
				Math.round(node.y),
				node.init,
				encodeURIComponent(node.label),
				node.hue,
				node.radius,
				node.gain,
				node.strength,
				node.active,
				// Add split node labels (indices 10, 11)
				node.topLabel !== undefined ? encodeURIComponent(node.topLabel) : "",
				node.bottomLabel !== undefined ? encodeURIComponent(node.bottomLabel) : "",
				// Description (index 12)
				encodeURIComponent(node.description || ""),
				// Cluster name (index 13) - see Clusters.js
				encodeURIComponent(node.cluster || "")
			]);
		}
		data.push(nodes);

		// Edges
		var edges = [];
		for(var i=0;i<self.edges.length;i++){
			var edge = self.edges[i];
			// 0 - from
			// 1 - to
			// 2 - arc
			// 3 - strength
			// 4 - speedMultiplier
			// 5 - rotation (optional)
			// 6 - edgeType ("directed"/"bi-directed"/"questionable")
			var dataEdge = [
				edge.from.id,
				edge.to.id,
				Math.round(edge.arc),
				edge.strength,
				edge.speedMultiplier
			];
			if(dataEdge.f==dataEdge.t){
				dataEdge.push(Math.round(edge.rotation));
			}
			dataEdge.push(edge.edgeType || "directed");
			edges.push(dataEdge);
		}
		data.push(edges);

		// Labels
		var labels = [];
		for(var i=0;i<self.labels.length;i++){
			var label = self.labels[i];
			// 0 - x
			// 1 - y
			// 2 - text
			labels.push([
				Math.round(label.x),
				Math.round(label.y),
				encodeURIComponent(label.text)
			]);
		}
		data.push(labels);

		// Simulation Settings (+ Node Option visibility toggles, indices 3-8)
		var settings = [
			self.MAX_SIGNAL_AGE,
			self.MAX_SIGNALS_PER_EDGE,
			self.MAX_SIGNALS
		].concat(self.loopy.nodeOptions.getDiagramDefaults());

		data.push(settings);

		// META.
		data.push(Node._UID);

		// Node Group names (index 5). Absent in old links -> default groups.
		data.push(self.loopy.nodeGroups.getDiagramState());

		// Cluster registry (index 6): [[name, description], ...]. Absent
		// in old links -> no clusters. See Clusters.js.
		data.push(self.loopy.clusters.getDiagramState());

		// Model info (index 7): [name, context], both encoded. Absent in
		// old links -> both "". See Sidebar.js's "About this model".
		data.push([
			encodeURIComponent(self.name || ""),
			encodeURIComponent(self.contextText || "")
		]);

		// Return as string!
		var dataString = JSON.stringify(data);
		dataString = encodeURIComponent(dataString);
		// dataString = dataString.replace(/"/gi, "%22"); // and ONLY URIENCODE THE QUOTES
		// dataString = dataString.substr(0, dataString.length-1) + "%5D";// also replace THE LAST CHARACTER
		return dataString;

	};

	self.deserialize = function(dataString){

		self.clear();

		let data;
		try {
			data = JSON.parse(decodeURIComponent(dataString));
		} catch(e) {
			console.error("Failed to parse JSON:", e, dataString);
			return;
		}

		const [nodes, edges, labels, settings, UID, groupNames, clusterEntries, modelInfo] = data;

		// Nodes
		for(var i=0;i<nodes.length;i++){
			var node = nodes[i];
			self.addNode({
				id: node[0],
				x: node[1],
				y: node[2],
				init: node[3],
				label: decodeURIComponent(node[4]),
				hue: node[5],
				radius: node[6],
				gain: node[7],
				strength: node[8],
				active: node[9],
				// Restore split node labels
				topLabel: node[10] ? decodeURIComponent(node[10]) : undefined,
				bottomLabel: node[11] ? decodeURIComponent(node[11]) : undefined,
				// Restore description (absent in old v1.3 links -> "")
				description: node[12] ? decodeURIComponent(node[12]) : "",
				// Restore cluster name (absent in older links -> "")
				cluster: node[13] ? decodeURIComponent(node[13]) : ""
			});
		}

		// Edges
		for(var i=0;i<edges.length;i++){
			var edge = edges[i];
			var edgeConfig = {
				from: edge[0],
				to: edge[1],
				arc: edge[2],
				strength: edge[3],
				direction: Math.sign(edge[3]),
				attenuation: Math.abs(edge[3]),
				speedMultiplier: edge[4]
			};
			if(edge[5]) edgeConfig.rotation=edge[5];
			// Absent in older links -> "directed" (matches their look exactly).
			edgeConfig.edgeType = edge[6] || "directed";
			self.addEdge(edgeConfig);
		}

		// Labels
		for(var i=0;i<labels.length;i++){
			var label = labels[i];
			self.addLabel({
				x: label[0],
				y: label[1],
				text: decodeURIComponent(label[2])
			});
		}
		// Settings
		self.MAX_SIGNAL_AGE = settings[0];
		self.MAX_SIGNALS_PER_EDGE = settings[1];
		self.MAX_SIGNALS = settings[2];

		// Node/Edge Option visibility toggles (indices 3 onward). Old saved
		// links only have a 3-entry settings array — slice() safely yields
		// [] in that case, which NodeOptions treats as "no diagram default"
		// (falls through to localStorage override or the all-off default).
		var keyCount = self.loopy.nodeOptions.KEYS.length;
		self.loopy.nodeOptions.loadFromDiagram(settings.slice(3, 3 + keyCount));

		// Node Group names (absent in old links -> default groups).
		self.loopy.nodeGroups.loadFromDiagram(groupNames);

		// Cluster registry (absent in old links -> no clusters).
		self.loopy.clusters.loadFromDiagram(clusterEntries);

		// Model info (absent in old links -> both ""). Published
		// separately from "model/changed" so the Sidebar's "About this
		// model" inputs only refresh on an actual load - refreshing on
		// every "model/changed" would reset those inputs' value (and
		// jump the cursor) while someone's mid-keystroke typing into them.
		self.name = (modelInfo && modelInfo[0]) ? decodeURIComponent(modelInfo[0]) : "";
		self.contextText = (modelInfo && modelInfo[1]) ? decodeURIComponent(modelInfo[1]) : "";
		publish("modelinfo/changed");

		// META.
		Node._UID = UID;

		// Validation patch: remove edges referencing missing nodes
		self.edges = self.edges.filter(edge => {
			const fromNode = self.getNode(edge.from?.id || edge.from);
			const toNode = self.getNode(edge.to?.id || edge.to);
			if (!fromNode || !toNode) {
				console.warn("Removed invalid edge referencing missing node:", edge);
				return false;
			}
			// Repair references if theyÃ¢â‚¬â„¢re numeric
			edge.from = fromNode;
			edge.to = toNode;
			return true;
		});
	};

	self.clear = function(){

		// Just kill ALL nodes.
		while(self.nodes.length>0){
			self.nodes[0].kill();
		}

		// Just kill ALL labels.
		while(self.labels.length>0){
			self.labels[0].kill();
		}

		// Clear any signals
		Edge.allSignals = [];

		// Force canvas clear and redraw
		ctx.clearRect(0, 0, self.canvas.width, self.canvas.height);
		_canvasDirty = true;
		drawCountdown = drawCountdownFull;
	};

	/////////////////////////
	// DOT Export Function //
	/////////////////////////
	self.exportToDOT = function(includePositions) {

		// Escapes free text for safe embedding inside a double-quoted DOT
		// string literal (label=, tooltip=, comment= values). Backslash
		// MUST be escaped before quote - reversing the order lets a real
		// quote in the text pair with our inserted escape-backslash and
		// prematurely close the DOT string (verified against DOT's
		// escaped-unit string grammar - do not reorder).
		var escapeDotString = function(text){
			return (text || "").toString()
				.replace(/\\/g, '\\\\')
				.replace(/"/g, '\\"');
		};

		// Flattens multi-line/whitespace-heavy free text to a single line,
		// for use inside a quoted attribute value (tooltip/comment/graph
		// label) - full multi-line text is only preserved in "//" header
		// comments, which aren't inside a string literal so need none of
		// this.
		var flatten = function(text){
			return (text || "").replace(/\s+/g, ' ').trim();
		};

		var dot = "digraph SystemModel {\n";
		dot += "  rankdir=LR;\n\n";

		// Model metadata (comments: always safe, never affects layout)
		if(self.name || self.contextText){
			dot += "  // === Model Metadata ===\n";
			if(self.name){
				dot += "  // Name: " + self.name.replace(/\r\n|\r|\n/g, ' ') + "\n";
			}
			if(self.contextText){
				dot += "  // Context:\n";
				var contextLines = self.contextText.replace(/\r\n/g, "\n").split("\n");
				for(var ci=0; ci<contextLines.length; ci++){
					dot += "  //   " + contextLines[ci] + "\n";
				}
			}
			dot += "\n";

			// Graph-level label (actually rendered in the image). Context
			// is truncated here so a long blurb doesn't dominate the
			// rendered diagram - the full text is always in the header
			// comment above regardless of length.
			var GRAPH_LABEL_CONTEXT_MAX = 200;
			var labelParts = [];
			if(self.name) labelParts.push(self.name);
			if(self.contextText){
				var flatContext = flatten(self.contextText);
				if(flatContext.length > GRAPH_LABEL_CONTEXT_MAX){
					flatContext = flatContext.substring(0, GRAPH_LABEL_CONTEXT_MAX).trim() + "...";
				}
				if(flatContext) labelParts.push(flatContext);
			}
			if(labelParts.length > 0){
				dot += '  label="' + escapeDotString(labelParts.join(' — ')) + '";\n';
				dot += '  labelloc="t";\n';
				dot += '  fontsize=16;\n\n';
			}
		}

		dot += "  node [shape=circle, style=filled, fillcolor=lightgray];\n\n";

		// Node Group colour legend (comments only) - fillcolor alone
		// doesn't carry the human-readable group name.
		var nodeGroups = self.loopy && self.loopy.nodeGroups;
		var colourList = nodeGroups ? nodeGroups.getColourList() : null;
		if(nodeGroups){
			dot += "  // Node Group colours (fillcolor -> group name):\n";
			for(var gi=0; gi<nodeGroups.groups.length; gi++){
				dot += "  //   " + colourList[gi] + " = \"" + nodeGroups.getName(gi) + "\"\n";
			}
			dot += "  //   " + nodeGroups.NULL_COLOUR + " = (ungrouped)\n\n";
		}

		// Export nodes
		var clusterOrder = [];   // cluster names, first-seen order
		var clusterMembers = {}; // name -> ["n<id>", ...]
		if(self.nodes && self.nodes.length > 0) {
			dot += "  // Nodes\n";
			for(var i=0; i<self.nodes.length; i++){
				var node = self.nodes[i];
				if(!node) continue;

				var nodeLabel = escapeDotString(node.label || "?");
				dot += '  n' + node.id + ' [label="' + nodeLabel + '"';

				// Real, currently-configured Node Group colours, not a
				// hardcoded map - and grey (not red) for an explicitly
				// ungrouped node (hue === null).
				var nodeHue = (node.hue !== undefined) ? node.hue : 0;
				var color = (colourList && colourList[nodeHue] !== undefined)
					? colourList[nodeHue]
					: (nodeGroups ? nodeGroups.NULL_COLOUR : "#999999");
				dot += ', fillcolor="' + color + '", fontcolor="black"';

				// Node Group name, only for a node that actually has one
				// (hue !== null) - reflects the diagram's real data,
				// independent of the Sidebar's own field-visibility state.
				if(nodeHue !== null && nodeGroups){
					dot += ', group="' + escapeDotString(nodeGroups.getName(nodeHue)) + '"';
				}

				// Description - sidebar-only doc text, exposed as both
				// tooltip (hover text in interactive SVG output) and
				// comment (safe, renderer-agnostic metadata).
				if(node.description){
					var descFlat = flatten(node.description);
					if(descFlat){
						var descEscaped = escapeDotString(descFlat);
						dot += ', tooltip="' + descEscaped + '", comment="' + descEscaped + '"';
					}
				}

				// Add position if requested
				if(includePositions && node.x !== undefined && node.y !== undefined){
					var x = (node.x / 100).toFixed(2);
					var y = (node.y / 100).toFixed(2);
					dot += ', pos="' + x + ',' + y + '!"';
				}

				dot += '];\n';

				// Collect cluster membership while we're already here.
				if(node.cluster){
					if(!clusterMembers.hasOwnProperty(node.cluster)){
						clusterMembers[node.cluster] = [];
						clusterOrder.push(node.cluster);
					}
					clusterMembers[node.cluster].push('n' + node.id);
				}
			}
		}

		// Clusters -> real Graphviz subgraphs, rendered as labeled boxes.
		// Re-declaring an already-declared node ID inside a subgraph (bare
		// "n3;", no attribute list) is valid DOT - it doesn't redeclare or
		// reset that node's attributes, it just marks membership. The
		// "cluster_" prefix is a hard Graphviz requirement (case-sensitive)
		// for the box-drawing behaviour to trigger; using the cluster's
		// first-seen index rather than a slugified name avoids both DOT-
		// identifier escaping issues and two different names silently
		// colliding into one box.
		if(clusterOrder.length > 0){
			dot += "\n  // Clusters\n";
			for(var ci=0; ci<clusterOrder.length; ci++){
				var clusterName = clusterOrder[ci];
				var members = clusterMembers[clusterName];
				dot += '  subgraph cluster_' + ci + ' {\n';
				dot += '    label="' + escapeDotString(clusterName) + '";\n';
				var clusterDescription = self.loopy && self.loopy.clusters
					? self.loopy.clusters.getDescription(clusterName) : "";
				if(clusterDescription){
					dot += '    // ' + flatten(clusterDescription).replace(/\r\n|\r|\n/g, ' ') + '\n';
				}
				for(var mi=0; mi<members.length; mi++){
					dot += '    ' + members[mi] + ';\n';
				}
				dot += '  }\n';
			}
		}

		// Export edges
		if(self.edges && self.edges.length > 0) {
			dot += "\n  // Edges\n";
			for(var i=0; i<self.edges.length; i++){
				var edge = self.edges[i];
				if(!edge || !edge.from || !edge.to) continue;

				var fromID = 'n' + edge.from.id;
				var toID = 'n' + edge.to.id;

				// Line style reflects edgeType (matches Edge.js's canvas
				// draw()), independent of polarity - a "-" edge isn't
				// "questionable", and strength===0 basically never occurs
				// / isn't how "questionable" is actually represented.
				var edgeStyle = 'solid';
				if(edge.edgeType === 'bi-directed') edgeStyle = 'dashed';
				else if(edge.edgeType === 'questionable') edgeStyle = 'dotted';

				// Colour, the "+/-" label, and the new polarity attribute
				// all come from the SAME source (direction, the canonical
				// polarity) so they can never disagree with each other.
				// direction is always exactly +/-1 per Edge.js's defaults/
				// setDirection - using it instead of strength also avoids
				// losing sign info if attenuation is ever 0 (strength
				// would become 0/-0). Independent of edgeType - a
				// "questionable" edge still carries real polarity data,
				// it's just not delivering signal until reviewed.
				var edgeLabel = '';
				var edgeColor = '#666666';
				var polarityAttr = null;
				var dir = edge.direction;
				if(dir !== undefined && dir !== null){
					if(dir > 0){ edgeLabel = '+'; edgeColor = '#4CAF50'; polarityAttr = '+'; }
					else if(dir < 0){ edgeLabel = '-'; edgeColor = '#F44336'; polarityAttr = '-'; }
				}

				dot += '  ' + fromID + ' -> ' + toID;
				dot += ' [label="' + edgeLabel + '", style="' + edgeStyle + '", color="' + edgeColor + '"';
				if(polarityAttr){
					dot += ', polarity="' + polarityAttr + '"';
				}

				// Handle self-loops
				if(edge.from === edge.to) {
					dot += ', constraint=false';
				}

				dot += '];\n';
			}
		}

		// Add labels - clean them for DOT format
		if(self.labels && self.labels.length > 0) {
			dot += "\n  // Text Labels\n";
			for(var i=0; i<self.labels.length; i++){
				var label = self.labels[i];
				if(!label || !label.text) continue;

				// Clean text for comment - remove special Unicode characters
				var labelText = label.text
					.replace(/[Ã£Æ’Â»]/g, '*')  // Replace bullet points with asterisks
					.replace(/[""]/g, '"')  // Replace smart quotes with regular quotes
					.replace(/['']/g, "'")  // Replace smart apostrophes
					.replace(/[Ã¢â‚¬â€Ã¢â‚¬â€œ]/g, '-')  // Replace em/en dashes with hyphens
					.replace(/[^\x00-\x7F]/g, '')  // Remove other non-ASCII characters
					.replace(/\n/g, ' ')    // Replace newlines with spaces
					.replace(/\s+/g, ' ')   // Collapse multiple spaces
					.trim();

				// Only add comment if there's text left after cleaning
				if(labelText.length > 0) {
					// Split long comments into multiple lines for readability
					var maxLength = 80;
					if(labelText.length > maxLength) {
						var words = labelText.split(' ');
						var currentLine = '';
						for(var j = 0; j < words.length; j++) {
							if(currentLine.length + words[j].length + 1 > maxLength) {
								if(currentLine.length > 0) {
									dot += '  // ' + currentLine + '\n';
									currentLine = words[j];
								}
							} else {
								currentLine += (currentLine.length > 0 ? ' ' : '') + words[j];
							}
						}
						if(currentLine.length > 0) {
							dot += '  // ' + currentLine + '\n';
						}
					} else {
						dot += '  // ' + labelText + '\n';
					}
				}

				// Add as actual node if positions included
				if(includePositions) {
					var cleanText = label.text
						.replace(/[Ã£Æ’Â»]/g, '*')
						.replace(/[""]/g, '"')
						.replace(/['']/g, "'")
						.replace(/[Ã¢â‚¬â€Ã¢â‚¬â€œ]/g, '-')
						.replace(/[^\x00-\x7F]/g, '')
						.replace(/"/g, '\\"')
						.replace(/\n/g, '\\n');

					dot += '  label' + i + ' [shape=plaintext, label="' + cleanText + '"';
					if(label.x !== undefined && label.y !== undefined) {
						var x = (label.x / 100).toFixed(2);
						var y = (label.y / 100).toFixed(2);
						dot += ', pos="' + x + ',' + y + '!"';
					}
					dot += '];\n';
				}
			}
		}

		dot += "}\n";
		return dot;
	};

	////////////////////
	// HELPER METHODS //
	////////////////////

	self.getNodeByPoint = function(x,y,buffer){
		var result;
		for(var i=self.nodes.length-1; i>=0; i--){ // top-down
			var node = self.nodes[i];
			if(node.isPointInNode(x,y,buffer)) return node;
		}
		return null;
	};

	self.getEdgeByPoint = function(x, y, wholeArrow){
		// TODO: wholeArrow option?
		var result;
		for(var i=self.edges.length-1; i>=0; i--){ // top-down
			var edge = self.edges[i];
			if(edge.isPointOnLabel(x,y)) return edge;
		}
		return null;
	};

	self.getLabelByPoint = function(x, y){
		var result;
		for(var i=self.labels.length-1; i>=0; i--){ // top-down
			var label = self.labels[i];
			if(label.isPointInLabel(x,y)) return label;
		}
		return null;
	};

	// Click to edit!
	subscribe("mouseclick",function(){

		// ONLY WHEN EDITING (and NOT erase)
		if(self.loopy.mode!=Loopy.MODE_EDIT) return;
		if(self.loopy.tool==Loopy.TOOL_ERASE) return;

		// Did you click on a node? If so, edit THAT node.
		var clickedNode = self.getNodeByPoint(Mouse.x, Mouse.y);
		if(clickedNode){
			loopy.sidebar.edit(clickedNode);
			return;
		}

		// Did you click on a label? If so, edit THAT label.
		var clickedLabel = self.getLabelByPoint(Mouse.x, Mouse.y);
		if(clickedLabel){
			loopy.sidebar.edit(clickedLabel);
			return;
		}

		// Did you click on an edge label? If so, edit THAT edge.
		var clickedEdge = self.getEdgeByPoint(Mouse.x, Mouse.y);
		if(clickedEdge){
			loopy.sidebar.edit(clickedEdge);
			return;
		}

		// If the tool LABEL? If so, TRY TO CREATE LABEL.
		if(self.loopy.tool==Loopy.TOOL_LABEL){
			loopy.label.tryMakingLabel();
			return;
		}

		// Otherwise, go to main Edit page.
		loopy.sidebar.showPage("Edit");

	});

	// Centering & Scaling
	self.getBounds = function(){

		// If no nodes & no labels, forget it.
		if(self.nodes.length==0 && self.labels.length==0) return;

		// Get bounds of ALL objects...
		var left = Infinity;
		var top = Infinity;
		var right = -Infinity;
		var bottom = -Infinity;
		var _testObjects = function(objects){
			for(var i=0; i<objects.length; i++){
				var obj = objects[i];
				var bounds = obj.getBoundingBox();
				if(left>bounds.left) left=bounds.left;
				if(top>bounds.top) top=bounds.top;
				if(right<bounds.right) right=bounds.right;
				if(bottom<bounds.bottom) bottom=bounds.bottom;
			}
		};
		_testObjects(self.nodes);
		_testObjects(self.edges);
		_testObjects(self.labels);

		// Return
		return {
			left:left,
			top:top,
			right:right,
			bottom:bottom
		};

	};
	self.center = function(andScale){

		// If no nodes & no labels, forget it.
		if(self.nodes.length==0 && self.labels.length==0) return;

		// Get bounds of ALL objects...
		var bounds = self.getBounds();
		var left = bounds.left;
		var top = bounds.top;
		var right = bounds.right;
		var bottom = bounds.bottom;

		// Re-center!
		var canvasses = document.getElementById("canvasses");
		var fitWidth = canvasses.clientWidth - _PADDING - _PADDING;
		var fitHeight = canvasses.clientHeight - _PADDING_BOTTOM - _PADDING;
		var cx = (left+right)/2;
		var cy = (top+bottom)/2;
		loopy.offsetX = (_PADDING+fitWidth)/2 - cx;
		loopy.offsetY = (_PADDING+fitHeight)/2 - cy;

		// SCALE.
		if(andScale){

			var w = right-left;
			var h = bottom-top;

			// Wider or taller than screen?
			var modelRatio = w/h;
			var screenRatio = fitWidth/fitHeight;
			var scaleRatio;
			if(modelRatio > screenRatio){
				// wider...
				scaleRatio = fitWidth/w;
			}else{
				// taller...
				scaleRatio = fitHeight/h;
			}

			// Loopy, then!
			loopy.offsetScale = scaleRatio;

		}

	};

}
