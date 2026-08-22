/**********************************

LAYOUT
- Auto-layout algorithms: Force-directed (always available, handles
  cycles fine - causal loop diagrams are fundamentally cyclic) and
  Sugiyama/layered (only valid on a true DAG - see hasCycle()).
- Stateless function-bag (like helpers.js), not a constructor. Every
  compute* function is pure: it reads node/edge positions and returns
  a plain {nodeId: {x,y}} map of TARGET positions, never mutating the
  model directly. Only startTransition() touches live state, animating
  node.x/node.y from their current values toward a target map.
- Self-loop edges (edge.from === edge.to) are excluded everywhere here:
  they don't have an independent second endpoint to place, don't count
  as a cycle for Sugiyama-eligibility, and are left completely alone
  (rotation/arc untouched) by both algorithms - only the node they're
  attached to moves, and the loop just goes along for the ride.

**********************************/

var Layout = {};

////////////////////////////////////////////////////////////////////////////
// SHARED: ADJACENCY + CYCLE DETECTION ///////////////////////////////////////
////////////////////////////////////////////////////////////////////////////

// Builds directed adjacency keyed by node id, skipping self-loops.
Layout._buildAdjacency = function(nodes, edges){
	var adj = {};
	for(var i=0; i<nodes.length; i++) adj[nodes[i].id] = [];
	var edgeList = [];
	for(var i=0; i<edges.length; i++){
		var e = edges[i];
		if(e.from === e.to) continue; // self-loop: excluded entirely
		if(!adj[e.from.id]) continue; // defensive: unknown node
		adj[e.from.id].push(e.to.id);
		edgeList.push({from: e.from.id, to: e.to.id});
	}
	return {adj: adj, edgeList: edgeList};
};

// True if the graph (ignoring self-loops) has any directed cycle.
// This is the single source of truth for whether Sugiyama may run.
Layout.hasCycle = function(nodes, edges){
	if(nodes.length === 0) return false;
	var built = Layout._buildAdjacency(nodes, edges);
	var adj = built.adj;
	var WHITE = 0, GRAY = 1, BLACK = 2;
	var colour = {};
	for(var i=0; i<nodes.length; i++) colour[nodes[i].id] = WHITE;

	var visit = function(id){
		colour[id] = GRAY;
		var neighbours = adj[id] || [];
		for(var i=0; i<neighbours.length; i++){
			var n = neighbours[i];
			if(colour[n] === GRAY) return true;              // back-edge -> cycle
			if(colour[n] === WHITE && visit(n)) return true;
		}
		colour[id] = BLACK;
		return false;
	};

	for(var i=0; i<nodes.length; i++){
		if(colour[nodes[i].id] === WHITE){
			if(visit(nodes[i].id)) return true;
		}
	}
	return false;
};

////////////////////////////////////////////////////////////////////////////
// FORCE-DIRECTED /////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////

// Fruchterman-Reingold-style spring/repulsion layout. Works on any
// graph, cyclic or not. Returns {nodeId: {x,y}}.
Layout.computeForceDirected = function(model, opts){
	opts = opts || {};
	var nodes = model.nodes;
	var edges = model.edges;
	if(nodes.length === 0) return {};
	if(nodes.length === 1){
		var only = {};
		only[nodes[0].id] = {x: nodes[0].x, y: nodes[0].y};
		return only;
	}

	var iterations = opts.iterations || 300;

	// Remember the pre-layout centroid so the result can be shifted back
	// onto it, rather than drifting to an arbitrary origin.
	var startCx = 0, startCy = 0;
	for(var i=0; i<nodes.length; i++){ startCx += nodes[i].x; startCy += nodes[i].y; }
	startCx /= nodes.length; startCy /= nodes.length;

	// Working copy of positions - never touch node.x/node.y in here.
	var pos = {};
	for(var i=0; i<nodes.length; i++){
		pos[nodes[i].id] = {x: nodes[i].x, y: nodes[i].y, r: nodes[i].radius};
	}

	// Ideal spring length, derived from average node radius so a typical
	// (radius 80) diagram gets edges roughly matching hand-placed spacing.
	var avgR = 0;
	for(var i=0; i<nodes.length; i++) avgR += nodes[i].radius;
	avgR /= nodes.length;
	var k = opts.idealLength || (avgR * 3.5);
	var repulsionConst = opts.repulsionConst || (k * k);

	var attractEdges = [];
	for(var i=0; i<edges.length; i++){
		if(edges[i].from !== edges[i].to) attractEdges.push(edges[i]);
	}

	var temperature = k; // max displacement per iteration, cools to 0
	for(var iter=0; iter<iterations; iter++){

		var disp = {};
		for(var i=0; i<nodes.length; i++) disp[nodes[i].id] = {x:0, y:0};

		// Repulsion: all pairs (O(n^2) - fine at LOOPY's scale).
		for(var i=0; i<nodes.length; i++){
			for(var j=i+1; j<nodes.length; j++){
				var a = pos[nodes[i].id], b = pos[nodes[j].id];
				var dx = a.x - b.x, dy = a.y - b.y;
				var dist = Math.sqrt(dx*dx + dy*dy) || 0.01;
				var minSep = a.r + b.r + 20; // 20px breathing room
				var force = repulsionConst / dist;
				if(dist < minSep) force *= 3; // extra push while overlapping/too close
				var fx = (dx/dist)*force, fy = (dy/dist)*force;
				disp[nodes[i].id].x += fx; disp[nodes[i].id].y += fy;
				disp[nodes[j].id].x -= fx; disp[nodes[j].id].y -= fy;
			}
		}

		// Attraction: along real (non-self-loop) edges.
		for(var e=0; e<attractEdges.length; e++){
			var edge = attractEdges[e];
			var a = pos[edge.from.id], b = pos[edge.to.id];
			if(!a || !b) continue;
			var dx = a.x - b.x, dy = a.y - b.y;
			var dist = Math.sqrt(dx*dx + dy*dy) || 0.01;
			var force = (dist*dist) / k;
			var fx = (dx/dist)*force, fy = (dy/dist)*force;
			disp[edge.from.id].x -= fx; disp[edge.from.id].y -= fy;
			disp[edge.to.id].x   += fx; disp[edge.to.id].y   += fy;
		}

		// Apply displacement, capped by the current temperature.
		for(var i=0; i<nodes.length; i++){
			var id = nodes[i].id;
			var d = disp[id];
			var len = Math.sqrt(d.x*d.x + d.y*d.y) || 0.01;
			var capped = Math.min(len, temperature);
			pos[id].x += (d.x/len) * capped;
			pos[id].y += (d.y/len) * capped;
		}

		temperature = k * (1 - iter/iterations); // linear cooling
	}

	// Re-centre on the ORIGINAL centroid.
	var endCx = 0, endCy = 0;
	for(var id in pos){ endCx += pos[id].x; endCy += pos[id].y; }
	endCx /= nodes.length; endCy /= nodes.length;
	var shiftX = startCx - endCx, shiftY = startCy - endCy;

	var result = {};
	for(var i=0; i<nodes.length; i++){
		var id = nodes[i].id;
		result[id] = {x: pos[id].x + shiftX, y: pos[id].y + shiftY};
	}
	return result;
};

////////////////////////////////////////////////////////////////////////////
// SUGIYAMA (LAYERED) - DAG ONLY //////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////

// Phase 1: longest-path layering via topological sort.
// layer(v) = 1 + max(layer(u)) over predecessors u->v, 0 for sources.
// Returns {nodeId: layerIndex}, or null if the graph isn't actually a DAG
// (shouldn't happen given the hasCycle() gate upstream, but this is the
// second line of defense against being called incorrectly).
Layout._assignLayers = function(nodes, built){
	var adj = built.adj;

	var indeg = {};
	for(var i=0; i<nodes.length; i++) indeg[nodes[i].id] = 0;
	for(var id in adj){
		adj[id].forEach(function(t){ indeg[t]++; });
	}

	var queue = [];
	for(var i=0; i<nodes.length; i++){
		if(indeg[nodes[i].id] === 0) queue.push(nodes[i].id);
	}
	var indegWork = {};
	for(var id in indeg) indegWork[id] = indeg[id];

	var topoOrder = [];
	while(queue.length){
		var id = queue.shift();
		topoOrder.push(id);
		(adj[id] || []).forEach(function(t){
			indegWork[t]--;
			if(indegWork[t] === 0) queue.push(t);
		});
	}
	if(topoOrder.length !== nodes.length) return null; // not actually acyclic

	var layer = {};
	topoOrder.forEach(function(id){ layer[id] = 0; });
	topoOrder.forEach(function(id){
		(adj[id] || []).forEach(function(t){
			layer[t] = Math.max(layer[t], layer[id] + 1);
		});
	});
	return layer;
};

function _layoutRangeArr(from, to){ // inclusive, ascending or descending
	var out = [];
	if(from <= to){ for(var i=from; i<=to; i++) out.push(i); }
	else{ for(var i=from; i>=to; i--) out.push(i); }
	return out;
}

// Phase 2: crossing minimization via alternating barycenter sweeps.
// Returns {layerIndex: [nodeId,...]} in (hopefully) low-crossing order.
Layout._orderLayers = function(nodes, built, layer){
	var layers = {};
	nodes.forEach(function(n){
		var l = layer[n.id];
		(layers[l] = layers[l] || []).push(n.id);
	});
	var maxLayer = 0;
	for(var l in layers) maxLayer = Math.max(maxLayer, +l);

	var down = built.adj; // parent -> children
	var up = {};
	nodes.forEach(function(n){ up[n.id] = []; });
	built.edgeList.forEach(function(e){ up[e.to].push(e.from); });

	var positionIndex = {};
	var reindex = function(){
		for(var l=0; l<=maxLayer; l++){
			(layers[l] || []).forEach(function(id, idx){ positionIndex[id] = idx; });
		}
	};
	reindex();

	var barycenter = function(id, neighbourIds){
		if(neighbourIds.length === 0) return positionIndex[id]; // keep put
		var sum = 0;
		neighbourIds.forEach(function(n){ sum += positionIndex[n]; });
		return sum / neighbourIds.length;
	};

	var SWEEPS = 8; // small fixed count - plenty at LOOPY's scale
	for(var pass=0; pass<SWEEPS; pass++){
		var downward = (pass % 2 === 0);
		var range = downward
			? _layoutRangeArr(1, maxLayer)       // layer 0 fixed; use predecessors ("up")
			: _layoutRangeArr(maxLayer-1, 0);    // use successors ("down")
		var neighboursOf = downward ? up : down;
		range.forEach(function(l){
			(layers[l] || []).sort(function(a, b){
				return barycenter(a, neighboursOf[a]) - barycenter(b, neighboursOf[b]);
			});
			reindex();
		});
	}
	return layers;
};

// Phase 3: coordinate assignment, top-to-bottom, radius-aware spacing.
Layout._assignCoordinates = function(nodes, layers, opts){
	opts = opts || {};
	var nodeById = {};
	nodes.forEach(function(n){ nodeById[n.id] = n; });

	var maxLayer = 0;
	for(var l in layers) maxLayer = Math.max(maxLayer, +l);

	var LAYER_GAP = opts.layerGap || 160; // vertical gap between layer edges
	var NODE_GAP = opts.nodeGap || 40;    // horizontal gap between node edges

	var result = {};
	var y = 0;
	for(var l=0; l<=maxLayer; l++){
		var ids = layers[l] || [];
		if(ids.length === 0) continue;

		var maxR = 0;
		ids.forEach(function(id){ maxR = Math.max(maxR, nodeById[id].radius); });

		// Pack left-to-right, then centre the row on x=0.
		var x = 0;
		var xs = {};
		ids.forEach(function(id, idx){
			var r = nodeById[id].radius;
			if(idx > 0) x += NODE_GAP;
			x += r; // move to this node's centre
			xs[id] = x;
			x += r; // advance past its far edge
		});
		var rowWidth = x;
		var offset = -rowWidth / 2;
		ids.forEach(function(id){
			result[id] = {x: xs[id] + offset, y: y + maxR};
		});

		y += 2*maxR + LAYER_GAP; // advance past this layer, into the gap
	}
	return result;
};

// Top-level Sugiyama entry point. Returns {nodeId:{x,y}}, or null if the
// graph isn't a DAG (callers should have already checked hasCycle() and
// kept this from being reachable, but this is a defensive second gate).
Layout.computeSugiyama = function(model){
	var nodes = model.nodes;
	var edges = model.edges;
	if(nodes.length === 0) return {};
	if(nodes.length === 1){
		var only = {};
		only[nodes[0].id] = {x: nodes[0].x, y: nodes[0].y};
		return only;
	}
	if(Layout.hasCycle(nodes, edges)){
		console.warn("Layout.computeSugiyama called on a cyclic graph - aborting.");
		return null;
	}

	var built = Layout._buildAdjacency(nodes, edges);
	var layer = Layout._assignLayers(nodes, built);
	if(!layer) return null;
	var layers = Layout._orderLayers(nodes, built, layer);
	var coords = Layout._assignCoordinates(nodes, layers);

	// Re-centre on the pre-layout centroid, same as force-directed.
	var startCx = 0, startCy = 0;
	nodes.forEach(function(n){ startCx += n.x; startCy += n.y; });
	startCx /= nodes.length; startCy /= nodes.length;
	var endCx = 0, endCy = 0;
	nodes.forEach(function(n){ endCx += coords[n.id].x; endCy += coords[n.id].y; });
	endCx /= nodes.length; endCy /= nodes.length;
	var shiftX = startCx - endCx, shiftY = startCy - endCy;

	var result = {};
	nodes.forEach(function(n){
		result[n.id] = {x: coords[n.id].x + shiftX, y: coords[n.id].y + shiftY};
	});
	return result;
};

////////////////////////////////////////////////////////////////////////////
// ANIMATED TRANSITION ////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////

// Animates every node from its current position to targetPositions[id]
// over opts.duration ms (default 1000), wall-clock timed so it's accurate
// regardless of the 30fps tick's timing jitter. Returns {done, step(now)}
// for the caller (Loopy.js's update tick) to drive.
Layout.startTransition = function(loopy, targetPositions, opts){
	opts = opts || {};
	var duration = opts.duration || 1000;
	var nodes = loopy.model.nodes;

	var startPositions = {};
	nodes.forEach(function(n){ startPositions[n.id] = {x: n.x, y: n.y}; });

	var startTime = null; // set on first step()

	var easeInOutCubic = function(t){
		return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
	};

	var transition = {
		done: false,
		step: function(now){
			if(startTime === null) startTime = now;
			var t = Math.min(1, (now - startTime) / duration);
			var e = easeInOutCubic(t);
			nodes.forEach(function(n){
				var start = startPositions[n.id];
				var target = targetPositions[n.id];
				if(!start || !target) return; // node removed mid-animation
				n.x = start.x + (target.x - start.x) * e;
				n.y = start.y + (target.y - start.y) * e;
			});
			loopy.model.update(); // recompute edge geometry immediately
			publish("model/changed");
			if(t >= 1){
				transition.done = true;
				if(opts.onComplete) opts.onComplete();
			}
		}
	};
	return transition;
};
