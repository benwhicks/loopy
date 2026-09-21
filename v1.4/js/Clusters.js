/**********************************

CLUSTERS
- Optional node attribute ("cluster") that tags a node with a free-text
  cluster name - unlike Node Groups (a fixed 1-8 slot palette, see
  NodeGroups.js), any number of clusters can exist, named however the
  user types them, and a node's cluster is just that name (a plain
  string on the node, "" meaning none).
- A cluster's DESCRIPTION is shared by every node with that same
  cluster name, so it can't live on the node itself - it's stored here,
  in a diagram-level name -> description registry, and looked up live
  by name. Editing the description via any one member node updates it
  for every other node in that cluster (they all read the same entry).
- Two distinct operations on a node's cluster, which a plain text field
  can't tell apart on its own:
    REASSIGN - move THIS node to a different (possibly brand new)
      cluster. This is just editing node.cluster directly (Sidebar.js's
      ComponentCluster field) - no method here needed, since membership
      isn't tracked by this registry.
    RENAME - rename the cluster ITSELF, keeping the same membership:
      every node currently tagged with the old name gets retagged to
      the new name, and the description carries over. See
      renameCluster() below.
- Registry entries aren't pruned when a cluster loses its last member -
  a typed-in description shouldn't vanish just because someone
  reassigned the last node away from it.
- Serialized with the diagram as [[name, description], ...] (order
  doesn't matter, just a flat dump of the registry).

**********************************/

function Clusters(loopy){

	var self = this;
	self.loopy = loopy;

	// name -> {description}
	self.registry = {};

	self.getDescription = function(name){
		if(!name) return "";
		return (self.registry[name] && self.registry[name].description) || "";
	};

	// Called from any node currently in that cluster (Sidebar.js's
	// ComponentClusterDescription) - updates the ONE shared entry, so
	// every other node with the same cluster name sees the change too.
	self.setDescription = function(name, description){
		if(!name) return;
		if(!self.registry[name]) self.registry[name] = {description: ""};
		self.registry[name].description = description;
		publish("model/changed");
	};

	// Every distinct cluster name currently in play - the registry's own
	// keys (covers a described cluster with zero current members) union
	// with every node's live "cluster" value (covers a cluster that's
	// been assigned but never described yet). Used to populate the
	// Sidebar's Cluster field autocomplete, so typing offers existing
	// names to pick instead of always minting a new one.
	self.getAllNames = function(){
		var names = {};
		Object.keys(self.registry).forEach(function(name){ names[name] = true; });
		if(self.loopy.model){
			self.loopy.model.nodes.forEach(function(node){
				if(node.cluster) names[node.cluster] = true;
			});
		}
		return Object.keys(names).sort();
	};

	// RENAME (not reassign - see file header): every node tagged
	// oldName is retagged to newName, and the description moves with
	// them. If newName already names a distinct, existing cluster, the
	// two are merged - the existing cluster's description wins (it's
	// the one more nodes were already looking at), falling back to
	// oldName's only if newName had none of its own.
	self.renameCluster = function(oldName, newName){
		if(!oldName || !newName || oldName===newName) return;

		if(self.loopy.model){
			self.loopy.model.nodes.forEach(function(node){
				if(node.cluster === oldName) node.cluster = newName;
			});
		}

		var oldDescription = self.getDescription(oldName);
		var newDescription = self.registry[newName] ? self.registry[newName].description : "";
		delete self.registry[oldName];
		self.registry[newName] = {description: newDescription || oldDescription};

		publish("model/changed");
		publish("clusters/changed");
	};

	// Diagram serialization: flat [[name, description], ...] dump.
	self.getDiagramState = function(){
		return Object.keys(self.registry).map(function(name){
			return [name, self.registry[name].description];
		});
	};

	// entries may be undefined (old links, or a blank diagram) -> empty registry.
	self.loadFromDiagram = function(entries){
		self.registry = {};
		if(entries){
			entries.forEach(function(entry){
				self.registry[entry[0]] = {description: entry[1] || ""};
			});
		}
		publish("clusters/changed");
	};

}
