/**********************************

SIDEBAR CODE

**********************************/

function Sidebar(loopy){

	var self = this;
	PageUI.call(self, document.getElementById("sidebar"));

	// Edit
    self.edit = function(object){
        self.showPage(object._CLASS_);
        // Set flag so onedit knows this is initial edit (not typing)
        if(self.currentPage && self.currentPage._isInitialEdit !== undefined){
            self.currentPage._isInitialEdit = true;
        }
        self.currentPage.edit(object);
    };

	// Go back to main when the thing you're editing is killed
	subscribe("kill",function(object){
		if(self.currentPage.target==object){
			self.showPage("Edit");
		}
	});

	// Tint the sidebar background based on what's being edited: a hair
	// bluer for a Node, a hair redder for an Edge, plain grey otherwise.
	// Single choke point (wraps showPage) so every path that changes the
	// active page - self.edit(), "back to top", kill, deselect - is covered.
	var _showPage = self.showPage;
	self.showPage = function(id){
		var page = _showPage(id);
		if(id === "Node") self.dom.setAttribute("editing", "node");
		else if(id === "Edge") self.dom.setAttribute("editing", "edge");
		else self.dom.removeAttribute("editing");
		return page;
	};

	////////////////////////////////////////////////////////////////////////////////////////////
	// GLOBAL OPTIONS (built here, placed into the "Edit"/deselected page below) ///////////////
	////////////////////////////////////////////////////////////////////////////////////////////

	// Collapsible Node Fields / Edge Fields / Simulation visibility
	// checkboxes. Node Groups ("hue") is deliberately absent - it's
	// always on, see _buildNodeGroupsSection below.
	var _buildFieldsOptions = function(){

		var FIELD_LABELS = {
			radius: "Size",
			mergeSplit: "Merge & Split",
			direction: "Edge Polarity (+/-)",
			active: "Node Type",
			init: "Start Amount",
			gain: "Gain",
			strength: "Quantum",
			attenuation: "Signal Attenuation",
			speedMultiplier: "Signal Speed"
		};

		var container = document.createElement("div");
		container.id = "sidebar_options";

		var toggleRow = document.createElement("div");
		toggleRow.className = "options_toggle";
		var collapsed = true;
		var setToggleLabel = function(){
			toggleRow.innerHTML = (collapsed ? "&#9656;" : "&#9662;") + " Model options";
		};
		setToggleLabel();
		container.appendChild(toggleRow);

		var body = document.createElement("div");
		body.className = "options_body";
		body.style.display = "none";
		container.appendChild(body);

		toggleRow.onclick = function(){
			collapsed = !collapsed;
			body.style.display = collapsed ? "none" : "block";
			setToggleLabel();
		};

		// Build one "[ ] Label" checkbox row, wired to loopy.nodeOptions.
		var buildOptionCheckbox = function(key, label){
			var row = document.createElement("label");
			row.className = "options_checkbox_row";

			var cb = document.createElement("input");
			cb.type = "checkbox";
			cb.checked = loopy.nodeOptions.get(key);
			cb.onchange = function(){
				loopy.nodeOptions.set(key, cb.checked);
			};
			row.appendChild(cb);
			row.appendChild(document.createTextNode(label));

			subscribe("settings/changed", function(){
				cb.checked = loopy.nodeOptions.get(key);
			});

			return row;
		};

		var addSubheading = function(text){
			var heading = document.createElement("div");
			heading.className = "options_subheading";
			heading.innerHTML = text;
			body.appendChild(heading);
		};

		addSubheading("Node Fields");
		body.appendChild(buildOptionCheckbox("radius", FIELD_LABELS.radius));
		body.appendChild(buildOptionCheckbox("mergeSplit", FIELD_LABELS.mergeSplit));

		addSubheading("Edge Fields");
		body.appendChild(buildOptionCheckbox("direction", FIELD_LABELS.direction));

		addSubheading("Simulation");
		["active", "init", "gain", "strength", "attenuation", "speedMultiplier"].forEach(function(key){
			body.appendChild(buildOptionCheckbox(key, FIELD_LABELS[key]));
		});

		return container;
	};

	// Node Groups: named colour groups (Okabe-Ito palette). Always
	// expanded (not tucked inside the collapsible above) since renaming
	// groups is a more everyday action than the individual field toggles.
	var _buildNodeGroupsSection = function(){

		var container = document.createElement("div");
		container.id = "sidebar_node_groups";

		var heading = document.createElement("div");
		heading.className = "options_subheading";
		heading.innerHTML = "Node Groups";
		container.appendChild(heading);

		var groupsList = document.createElement("div");
		container.appendChild(groupsList);

		var groupsButtons = document.createElement("div");
		groupsButtons.style.marginTop = "12px";
		var addGroupBtn = document.createElement("span");
		addGroupBtn.className = "mini_button";
		addGroupBtn.innerHTML = "+ add group";
		addGroupBtn.onclick = function(){ loopy.nodeGroups.addGroup(); };
		var removeGroupBtn = document.createElement("span");
		removeGroupBtn.className = "mini_button";
		removeGroupBtn.innerHTML = "− remove last";
		removeGroupBtn.style.marginLeft = "6px";
		removeGroupBtn.onclick = function(){ loopy.nodeGroups.removeLastGroup(); };
		groupsButtons.appendChild(addGroupBtn);
		groupsButtons.appendChild(removeGroupBtn);
		container.appendChild(groupsButtons);

		// Rebuilds the whole group list - only called on add/remove (discrete
		// clicks), never on every keystroke, so typing a name never loses focus.
		var renderGroups = function(){
			groupsList.innerHTML = "";
			loopy.nodeGroups.groups.forEach(function(group, index){
				var row = document.createElement("div");
				row.className = "options_group_row";

				var swatch = document.createElement("div");
				swatch.className = "options_group_swatch";
				swatch.style.background = loopy.nodeGroups.PALETTE[index];
				row.appendChild(swatch);

				var nameInput = document.createElement("input");
				nameInput.type = "text";
				nameInput.className = "options_group_name";
				nameInput.value = group.name;
				nameInput.oninput = function(){
					loopy.nodeGroups.setName(index, nameInput.value);
				};
				row.appendChild(nameInput);

				groupsList.appendChild(row);
			});

			var atMax = loopy.nodeGroups.groups.length >= loopy.nodeGroups.MAX_GROUPS;
			var atMin = loopy.nodeGroups.groups.length <= loopy.nodeGroups.MIN_GROUPS;
			addGroupBtn.style.opacity = atMax ? 0.4 : 1;
			addGroupBtn.style.pointerEvents = atMax ? "none" : "auto";
			removeGroupBtn.style.opacity = atMin ? 0.4 : 1;
			removeGroupBtn.style.pointerEvents = atMin ? "none" : "auto";
		};
		renderGroups();
		subscribe("groups/changed", renderGroups);

		return container;
	};

	// Layout: auto-arrange the whole diagram. Force-directed always works
	// (causal loop diagrams are fundamentally cyclic); Sugiyama only makes
	// sense on a true DAG, so its button disables itself live whenever the
	// graph has a cycle (self-loops don't count - see Layout.hasCycle).
	var _buildLayoutSection = function(){

		var container = document.createElement("div");
		container.id = "sidebar_layout";

		var heading = document.createElement("div");
		heading.className = "options_subheading";
		heading.innerHTML = "Layout";
		container.appendChild(heading);

		var buttonsRow = document.createElement("div");

		var forceBtn = document.createElement("span");
		forceBtn.className = "mini_button";
		forceBtn.innerHTML = "Force-directed";
		forceBtn.onclick = function(){ loopy.layoutForceDirected(); };
		buttonsRow.appendChild(forceBtn);

		var sugiyamaBtn = document.createElement("span");
		sugiyamaBtn.className = "mini_button";
		sugiyamaBtn.innerHTML = "Sugiyama";
		sugiyamaBtn.style.marginLeft = "6px";
		sugiyamaBtn.onclick = function(){
			if(sugiyamaBtn.getAttribute("data-disabled") === "yes") return;
			loopy.layoutSugiyama();
		};
		buttonsRow.appendChild(sugiyamaBtn);

		container.appendChild(buttonsRow);

		var refreshSugiyamaState = function(){
			// Deferred to a fresh tick: Model.addNode/addEdge (and their
			// remove counterparts) publish "model/changed" BEFORE actually
			// mutating self.nodes/self.edges, so a synchronous check here
			// would sometimes see the graph as it was a moment ago rather
			// than as it now is. By the time this timeout fires, the
			// triggering add/remove call has fully finished.
			setTimeout(function(){
				var cyclic = loopy.layoutHasCycle();
				sugiyamaBtn.style.opacity = cyclic ? 0.4 : 1;
				sugiyamaBtn.style.pointerEvents = cyclic ? "none" : "auto";
				sugiyamaBtn.setAttribute("data-disabled", cyclic ? "yes" : "no");
				if(cyclic){
					sugiyamaBtn.setAttribute("data-balloon",
						"Sugiyama layout needs an acyclic graph (no loops). Self-loops are fine - only multi-node cycles disable this.");
					sugiyamaBtn.setAttribute("data-balloon-pos", "up");
				}else{
					sugiyamaBtn.removeAttribute("data-balloon");
					sugiyamaBtn.removeAttribute("data-balloon-pos");
				}
			}, 0);
		};
		refreshSugiyamaState();
		subscribe("model/changed", refreshSugiyamaState);

		return container;
	};

	////////////////////////////////////////////////////////////////////////////////////////////
	// ACTUAL PAGES ////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////////////

	// Node!
    (function(){
        var page = new SidebarPage();
        page.addComponent(new ComponentButton({
            header: true,
            label: "Model settings",
            onclick: function(){
                self.showPage("Edit");
            }
        }));
        page.addComponent(new ComponentHTML({
            html: "<br><br><b style='font-size:1.2em'>Node attributes</b>"
        }));

        // Name and Description are always visible.
        page.addComponent("label", new ComponentInput({
            label: "<br><br>Name:"
        }));
        page.addComponent("description", new ComponentInput({
            label: "<br>Description:",
            textarea: true
        }));

        // Just two types now: simulable (default) or non-simulable.
        page.addComponent("active", new ComponentNodeType({
            label: "Node Type:"
        }));
        page.addComponent("hue", new ComponentNodeGroup({
            label: "Node Group:"
        }));
        page.addComponent("init", new ComponentSlider({
            bg: "initial",
            label: "Start Amount:",
            options: [0, 0.25, 0.50, 0.75, 1],
            oninput: function(value){
                Node.defaultValue = value;
            }
        }));
        page.addComponent("radius", new ComponentSlider({
            bg: "radius",
            label: "Size:",
            options: [45, 60, 80, 110, 150],
            oninput: function(value){
                Node.radius = value;
            }
        }));
        page.addComponent("gain", new ComponentSlider({
            bg: "gain",
            label: "Node Gain:",
            options: [0.5, 0.75, 1, 1.33, 2],
            oninput: function(value){
                Node.gain = value;
            }
        }));
        page.addComponent("strength", new ComponentSlider({
            bg: "quantum",
            label: "Node Quantum:",
            options: [0.001, 0.01, 0.1, 0.2, 0.33],
            oninput: function(value){
                Node.strength = value;
            }
        }));

        // Shown instead, when every optional field above is toggled off.
        var noOptionsHint = page.addComponent(new ComponentHTML({
            html: "<div class='sidebar_hint'>These are editable through the global "+
                "settings - accessed by clicking in an empty space in the graph.</div>"
        }));

        // Which fields are globally opt-in (off by default). Toggling one
        // off only hides its Sidebar UI - the underlying Node property is
        // untouched and the node continues to simulate/render normally.
        // "hue" (Node Group) is deliberately absent - it's always on, so
        // its swatch picker is never hidden here.
        var OPTIONAL_KEYS = ["active", "init", "radius", "gain", "strength"];

        page.updateOptionVisibility = function(){
            var nodeOptions = loopy.nodeOptions;
            if(!nodeOptions) return;
            var anyVisible = false;
            for(var i=0; i<OPTIONAL_KEYS.length; i++){
                var key = OPTIONAL_KEYS[i];
                var comp = page.getComponent(key);
                var visible = nodeOptions.get(key);
                if(visible) anyVisible = true;
                if(comp && comp.dom){
                    comp.dom.style.display = visible ? "block" : "none";
                }
            }
            noOptionsHint.dom.style.display = anyVisible ? "none" : "block";

            // "split node" button - only offered when Merge & Split is on
            // (splitBtn is declared further down, after "delete node";
            // guard against the "Initialize immediately" call below,
            // which runs before that declaration executes).
            if(splitBtn && splitBtn.dom){
                splitBtn.dom.style.display = nodeOptions.get("mergeSplit") ? "block" : "none";
            }
        };

        // Initialize immediately so there's no flash of wrongly-visible
        // controls the first time a node is selected.
        page.updateOptionVisibility();

        // Live-update if the settings modal changes toggles while this
        // page is around (whether currently shown or not).
        subscribe("settings/changed", function(){
            page.updateOptionVisibility();
        });

        // Track if this is initial edit vs typing update
        page._isInitialEdit = false;

        page.onedit = function(){
            var node = page.target;
            var color = loopy.model.COLOUR_NODE_LIST[node.hue];
            page.getComponent("init").setBGColor(color);
            page.getComponent("hue").setBGColor(color);
            page.getComponent("radius").setBGColor(color);
            page.getComponent("gain").setBGColor(color);
            page.getComponent("strength").setBGColor(color);
            page.getComponent("active").setBGColor(color);

            // Update visibility
            page.updateOptionVisibility();

            // ONLY auto-focus on INITIAL edit, not on every keystroke
            if(page._isInitialEdit){
                page._isInitialEdit = false;
                var name = node.label;
                if(name=="" || name=="?"){
                    page.getComponent("label").select();
                }
            }
        };

        // "split node" - an explicit alternative to the canvas's Alt+drag
        // split gesture (Dragger.js), for when a click is easier than a
        // drag. Only shown when Merge & Split is on (see
        // updateOptionVisibility above). No drag to place the twin here,
        // so it's just offset to the side, then selected for editing.
        var splitBtn = page.addComponent(new ComponentButton({
            label: "split node",
            onclick: function(node){
                var twin = loopy.model.splitNode(node);
                twin.x = node.x + node.radius*2 + 30;
                twin.y = node.y;
                publish("model/changed");
                loopy.sidebar.edit(twin);
            }
        }));

        page.addComponent(new ComponentButton({
            label: "delete node",
            onclick: function(node){
                node.kill();
                self.showPage("Edit");
            }
        }));
        self.addPage("Node", page);
    })();

	// Edge!
	(function(){
		var page = new SidebarPage();
		page.addComponent(new ComponentButton({
			header: true,
			label: "Model settings",
			onclick: function(){
				self.showPage("Edit");
			}
		}));
		page.addComponent(new ComponentHTML({
			html: "<br><br><b style='font-size:1.2em'>Edge attributes</b>"
		}));
		page.addComponent("direction", new ComponentSlider({
			bg: "strength",
			label: "<br><br>Edge Polarity (+/-):",
			options: [1,-1],
			oninput: function(value,edge){
				edge.setDirection(value);
			}
		}));
		page.addComponent("attenuation", new ComponentSlider({
			bg: "attenuation",
			label: "<br><br>Signal Attenuation:",
			options: [1, 0.99, 0.94, 0.89, 0.79, 0.56, 0.0000001],
			oninput: function(value,edge){
				edge.setAttenuation(value);
			}
		}));
		page.addComponent("speedMultiplier", new ComponentSlider({
			bg: "speed",
			label: "<br><br>Signal Speed:",
			options: [0.5, 0.67, 0.8, 0.91, 1, 1.1, 1.25, 1.5, 2],
			oninput: function(value){
				Edge.speedMultiplier = value;
			}
		}));
		page.addComponent("edgeType", new ComponentEdgeType({
			label: "<br>Edge Type:"
		}));
		// Shown instead, when every optional field above is toggled off.
		var noOptionsHint = page.addComponent(new ComponentHTML({
			html: "<div class='sidebar_hint'>These are editable through the global "+
				"settings - accessed by clicking in an empty space in the graph.</div>"
		}));

		page.addComponent(new ComponentButton({
			label: "delete edge",
			onclick: function(edge){
				edge.kill();
				self.showPage("Edit");
			}
		}));

		// Which fields are globally opt-in (off by default) - same pattern
		// as the Node page. Toggling one off only hides its Sidebar UI.
		// "direction" (Edge Polarity) also gates the +/- glyph drawn on
		// every edge on the canvas - see Edge.js draw(). "edgeType" is
		// deliberately absent - it's always shown, same treatment as the
		// Node page's "hue" (Node Group) picker, so a split's new
		// "questionable" edges can always be reviewed/promoted here
		// without hunting for a toggle first.
		var EDGE_OPTIONAL_KEYS = ["direction", "attenuation", "speedMultiplier"];

		page.updateOptionVisibility = function(){
			var nodeOptions = loopy.nodeOptions;
			if(!nodeOptions) return;
			var anyVisible = false;
			for(var i=0; i<EDGE_OPTIONAL_KEYS.length; i++){
				var key = EDGE_OPTIONAL_KEYS[i];
				var comp = page.getComponent(key);
				var visible = nodeOptions.get(key);
				if(visible) anyVisible = true;
				if(comp && comp.dom){
					comp.dom.style.display = visible ? "block" : "none";
				}
			}
			noOptionsHint.dom.style.display = anyVisible ? "none" : "block";
		};
		page.updateOptionVisibility();
		subscribe("settings/changed", function(){
			page.updateOptionVisibility();
		});

		self.addPage("Edge", page);
	})();

	// Label!
	(function(){
		var page = new SidebarPage();
		page.addComponent(new ComponentButton({
			header: true,
			label: "back to top",
			onclick: function(){
				self.showPage("Edit");
			}
		}));
		page.addComponent("text", new ComponentInput({
			label: "<br><br>Label:",
			textarea: true
		}));
		page.onshow = function(){
			// Focus on the text field
			page.getComponent("text").select();
		};
		page.onhide = function(){

			// If you'd just edited it...
			var label = page.target;
			if(!page.target) return;

			// If text is "" or all spaces, DELETE.
			var text = label.text;
			if(/^\s*$/.test(text)){
				// that was all whitespace, KILL.
				page.target = null;
				label.kill();
			}

		};
		page.addComponent(new ComponentButton({
			label: "delete label",
			onclick: function(label){
				label.kill();
				self.showPage("Edit");
			}
		}));
		self.addPage("Label", page);
	})();

	// Save, share or load: export/import/history/clear - everything that
	// isn't everyday editing gets tucked away here, same collapsible
	// pattern as "Model options". Collapsed by default.
	var _buildSaveShareSection = function(){

		var container = document.createElement("div");
		container.id = "sidebar_save_share";

		var toggleRow = document.createElement("div");
		toggleRow.className = "options_toggle";
		var collapsed = true;
		var setToggleLabel = function(){
			toggleRow.innerHTML = (collapsed ? "&#9656;" : "&#9662;") + " Save, share or load";
		};
		setToggleLabel();
		container.appendChild(toggleRow);

		var body = document.createElement("div");
		body.className = "options_body";
		body.style.display = "none";
		container.appendChild(body);

		toggleRow.onclick = function(){
			collapsed = !collapsed;
			body.style.display = collapsed ? "none" : "block";
			setToggleLabel();
		};

		body.appendChild(new ComponentHTML({
			html: ""+

			"<span class='mini_button' onclick='loopy.sidebar.showPage(\"History\")'>history manager</span><br><br>"+

			"<span class='mini_button' onclick='publish(\"modal\",[\"export_dot\"])'>export as DOT</span> <br><br>"+
			"<span class='mini_button' onclick='publish(\"modal\",[\"save_link\"])'>save as link</span> <br><br>"+
			"<span class='mini_button' onclick='publish(\"export/file\")'>save as file</span> "+
			"<span class='mini_button' onclick='publish(\"import/file\")'>load from file</span> <br><br>"+
			"<span class='mini_button' onclick='publish(\"modal\",[\"embed\"])'>embed in your website</span>"

		}).dom);

		// Clear Graph - deletes all nodes/edges/labels (not history or
		// settings, so an accidental clear is still Ctrl-Z undoable), only
		// after a confirm() warning. Styled as a danger button. Built with
		// the raw _createButton helper (not ComponentButton) since it's not
		// attached to a SidebarPage via addComponent here.
		var clearBtn = _createButton("clear graph", function(){
			if(loopy.model.nodes.length===0 && loopy.model.edges.length===0 && loopy.model.labels.length===0){
				return; // nothing to clear
			}
			var ok = confirm("This will delete every node, edge, and label on the canvas.\n\nThis cannot be undone (well - you can still Ctrl-Z it). Continue?");
			if(ok){
				loopy.model.clear();
				// Blank canvas - back to a clean, centered, 100% view.
				loopy.offsetX = 0;
				loopy.offsetY = 0;
				loopy.zoomReset();
			}
		});
		clearBtn.setAttribute("danger", "yes");
		clearBtn.style.marginTop = "12px";
		body.appendChild(clearBtn);

		return container;
	};

	// Edit (shown when nothing is selected - clicking empty canvas space).
	// The old title/links/zoom header and the bottom credits blurb now
	// live in the floating #loopy_header widget (top-left of the screen,
	// see index.html/Loopy.js) - clicking it pops the credits text up.
	(function(){
		var page = new SidebarPage();

		// 1. Layout (auto-arrange the diagram)
		page.dom.appendChild(_buildLayoutSection());

		// 2. Node Groups (where you name the colours) - always on
		page.dom.appendChild(_buildNodeGroupsSection());

		// 3. Expandable global field-visibility options
		page.dom.appendChild(_buildFieldsOptions());

		// 4. Expandable save/share/load (history, export, embed, clear graph)
		page.dom.appendChild(_buildSaveShareSection());

		self.addPage("Edit", page);
	})();

	// Ctrl-S to SAVE
	subscribe("key/save",function(){
		if(Key.control){ // Ctrl-S or Ã¢Å’Ëœ-S
			publish("modal",["save_link"]);
		}
	});

	// History Manager Page
	(function(){
		var page = new SidebarPage();

		// Back button
		page.addComponent(new ComponentButton({
			header: true,
			label: "back to top",
			onclick: function(){
				self.showPage("Edit");
			}
		}));

		// Title
		page.addComponent(new ComponentHTML({
			html: "<br><br><b style='font-size:1.2em'>History Manager</b><br>"
		}));

		// Current status
		var statusDiv = document.createElement("div");
		statusDiv.id = "history_status";
		statusDiv.style.padding = "10px";
		statusDiv.style.background = "#f0f0f0";
		statusDiv.style.borderRadius = "5px";
		statusDiv.style.marginBottom = "5px";
		statusDiv.style.fontSize = "18px";
		page.dom.appendChild(statusDiv);

		// Recent actions list
		var actionsDiv = document.createElement("div");
		actionsDiv.id = "history_actions";
		actionsDiv.style.padding = "10px";
		actionsDiv.style.background = "#e8e8e8";
		actionsDiv.style.borderRadius = "5px";
		actionsDiv.style.marginBottom = "10px";
		actionsDiv.style.fontSize = "12px";
		actionsDiv.style.maxHeight = "150px";
		actionsDiv.style.overflowY = "auto";
		page.dom.appendChild(actionsDiv);

		// Update status function
		var updateStatus = function(){
			if(!loopy.history) return;

			var session = loopy.history.exportSession();
			var memory = session.memory;

			var html = "<b>Session:</b> " + session.states + " states, " + memory.kilobytes + " KB";
			if(loopy.history.enablePersistence){
				html += " <span style='color:green'>Auto-save</span>";
			}
			statusDiv.innerHTML = html;

			// Update recent actions
			var actionsHtml = "<b>Recent Actions:</b><br>";
			var actions = session.actions || [];
			if(actions.length === 0){
				actionsHtml += "<i style='color:#888'>No actions yet</i>";
			} else {
				for(var i = actions.length - 1; i >= 0; i--){
					var action = actions[i];
					var desc = action.description || 'Unknown';
					var time = action.timestamp || '';
					// Highlight current position
					var isCurrent = (loopy.history.currentIndex === loopy.history.states.length - actions.length + i);
					var style = isCurrent ? 'background:#fff; padding:2px 4px; border-radius:3px;' : '';
					actionsHtml += '<div style="margin:3px 0; ' + style + '">';
					actionsHtml += '<span style="color:#666; font-size:10px;">' + time + '</span><br>';
					actionsHtml += desc;
					actionsHtml += '</div>';
				}
			}
			actionsDiv.innerHTML = actionsHtml;
		};

		// Persistence toggle
		page.addComponent(new ComponentHTML({
			html: "<br><b>Browser Storage:</b>"
		}));

		var persistenceCheckbox = document.createElement("div");
		persistenceCheckbox.innerHTML =
			'<label style="cursor:pointer; font-size:16px;">' +
			'<input type="checkbox" id="history_persistence" style="margin-right:8px;">' +
			'Save history in browser' +
			'</label>' +
			'<div style="font-size:12px; color:#666; margin-top:5px;">' +
			'History will persist after refresh/close' +
			'</div>';
		page.dom.appendChild(persistenceCheckbox);

		// Set checkbox state and handler
		persistenceCheckbox.querySelector('#history_persistence').onchange = function(e){
			if(loopy.history){
				loopy.history.enablePersistence = e.target.checked;
				if(e.target.checked){
					loopy.history.saveToStorage();
					updateStatus();
				} else {
					loopy.history.clearStorage();
					updateStatus();
				}
			}
		};

		// Export button
		page.addComponent(new ComponentButton({
			label: "Export History to JSON",
			onclick: function(){
				if(loopy.history){
					loopy.history.exportToFile();
				}
			}
		}));

		// Import button
		page.addComponent(new ComponentButton({
			label: "Import History from JSON",
			onclick: function(){
				if(loopy.history){
					if(confirm("This will replace your current history. Continue?")){
						loopy.history.importFromFile();
					}
				}
			}
		}));

		// Management section
		page.addComponent(new ComponentHTML({
			html: "<br><b>Management</b><br>"
		}));

		// Complete Reset button
		page.addComponent(new ComponentButton({
			label: "Clear All (Reset)",
			onclick: function(){
				if(confirm("WARNING: This will:\n Clear all history\n Clear browser storage\n Reset canvas to blank\n Reset all settings to defaults\n\nThis cannot be undone. Continue?")){
					if(loopy.history && loopy.model){
						// 1. Clear all history
						loopy.history.clear();

						// 2. Clear browser storage
						loopy.history.clearStorage();

						// 3. Clear the model (blank canvas)
						loopy.model.clear();

						// 4. Reset settings to defaults
						Node.defaultValue = 0.5;
						Node.defaultHue = 0;
						loopy.signalSpeed = 3;
						loopy.offsetX = 0;
						loopy.offsetY = 0;
						loopy.offsetScale = 1;

						// 5. Reset model settings
						loopy.model.speed = 0.05;
						loopy.model.MAX_SIGNAL_AGE = 5;
						loopy.model.MAX_SIGNALS_PER_EDGE = 25;
						loopy.model.MAX_SIGNALS = 200;

						// 6. Reinitialize history with blank state
						loopy.history.initialize();

						// 7. Reset Node UID counter
						Node._UID = 0;

						// 8. Clear URL parameters if any
						if(window.history && window.history.replaceState){
							var cleanURL = window.location.origin + window.location.pathname;
							window.history.replaceState(null, null, cleanURL);
						}

						// 9. Reset to edit mode and main page
						loopy.setMode(Loopy.MODE_EDIT);
						self.showPage("Edit");

						// 10. Update UI
						publish("model/changed");
						updateStatus();

						// 11. Reset dirty flag
						loopy.dirty = false;

						alert("Complete reset successful. Canvas is now blank.");
					}
				}
			}
		}));

		// Clear session history button
		page.addComponent(new ComponentButton({
			label: "Clear Session History",
			onclick: function(){
				if(confirm("This will clear all undo/redo history. Continue?")){
					if(loopy.history){
						loopy.history.clear();
						loopy.history.initialize();
						updateStatus();
						alert("History cleared");
					}
				}
			}
		}));

		// Show page handler
		page.onshow = function(){
			// Update checkboxes
			if(loopy.history){
				var persCheckbox = document.getElementById('history_persistence');
				//var trackCheckbox = document.getElementById('history_tracking');
				if(persCheckbox) persCheckbox.checked = loopy.history.enablePersistence;
				//if(trackCheckbox) trackCheckbox.checked = loopy.history.enableActionTracking;
			}
			updateStatus();

			// Set up periodic update
			page.statusInterval = setInterval(updateStatus, 1000);
		};

		// Hide page handler
		page.onhide = function(){
			// Clear periodic update
			if(page.statusInterval){
				clearInterval(page.statusInterval);
				page.statusInterval = null;
			}
		};

		self.addPage("History", page);
	})();
}

function SidebarPage(){

	// TODO: be able to focus on next component with an "Enter".

	var self = this;
	self.target = null;

	// DOM
	self.dom = document.createElement("div");
	self.show = function(){ self.dom.style.display="block"; self.onshow(); };
	self.hide = function(){ self.dom.style.display="none"; self.onhide(); };

	// Components
	self.components = [];
	self.componentsByID = {};
	self.addComponent = function(propName, component){

		// One or two args
		if(!component){
			component = propName;
			propName = "";
		}

		component.page = self; // tie to self
		component.propName = propName; // tie to propName
		self.dom.appendChild(component.dom); // add to DOM

		// remember component
		self.components.push(component);
		self.componentsByID[propName] = component;

		// return!
		return component;

	};
	self.getComponent = function(propName){
		return self.componentsByID[propName];
	};

	// Edit
	self.edit = function(object){

		// New target to edit!
		self.target = object;

		// Show each property with its component
		for(var i=0;i<self.components.length;i++){
			self.components[i].show();
		}

		// Callback!
		self.onedit();

	};

	// TO IMPLEMENT: callbacks
	self.onedit = function(){};
	self.onshow = function(){};
	self.onhide = function(){};

	// Start hiding!
	self.hide();

}



/////////////////////////////////////////////////////////////////////////////////////////////
// COMPONENTS ///////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////

function Component(){
	var self = this;
	self.dom = null;
	self.page = null;
	self.propName = null;
	self.show = function(){
		// TO IMPLEMENT
	};
	self.getValue = function(){
		return self.page.target[self.propName];
	};
	self.setValue = function(value){

		// Model's been changed!
		publish("model/changed");

		// Edit the value!
		self.page.target[self.propName] = value;
		self.page.onedit(); // callback!

	};
}

function ComponentInput(config){

	// Inherit
	var self = this;
	Component.apply(self);

	// DOM: label + text input
	self.dom = document.createElement("div");
	var label = _createLabel(config.label);
	var className = config.textarea ? "component_textarea" : "component_input";
	var input = _createInput(className, config.textarea);
	input.oninput = function(event){
		self.setValue(input.value);
	};
	self.dom.appendChild(label);
	self.dom.appendChild(input);

	// Show
	self.show = function(){
		input.value = self.getValue();
	};

	// Select
	self.select = function(){
		setTimeout(function(){ input.select(); },10);
	};

}

function ComponentSlider(config){

	// Inherit
	var self = this;
	Component.apply(self);

	// TODO: control with + / -, alt keys??

	// DOM: label + slider
	self.dom = document.createElement("div");
	var label = _createLabel(config.label);
	self.dom.appendChild(label);
	var sliderDOM = document.createElement("div");
	sliderDOM.setAttribute("class","component_slider");
	self.dom.appendChild(sliderDOM);

	// Slider DOM: graphic + pointer
	var slider = new Image();
	slider.draggable = true;
	slider.src = "css/sliders/"+config.bg+".png";
	slider.setAttribute("class","component_slider_graphic");
	var pointer = new Image();
	pointer.draggable = false;
	pointer.src = "css/sliders/slider_pointer.png";
	pointer.setAttribute("class","component_slider_pointer");
	sliderDOM.appendChild(slider);
	sliderDOM.appendChild(pointer);
	var movePointer = function(){
		var value = self.getValue();
		var optionIndex = config.options.indexOf(value);
		var x = (optionIndex+0.5) * (250/config.options.length);
		pointer.style.left = (x-7.5)+"px";
	};

	// On click... (or on drag)
	var isDragging = false;
	var onmousedown = function(event){
		isDragging = true;
		sliderInput(event);
	};
	var onmouseup = function(){
		isDragging = false;
	};
	var onmousemove = function(event){
		if(isDragging) sliderInput(event);
	};
	var sliderInput = function(event){

		// What's the option?
		var index = event.x/250;
		var optionIndex = Math.floor(index*config.options.length);
		var option = config.options[optionIndex];
		if(option===undefined) return;
		self.setValue(option);

		// Callback! (if any)
		if(config.oninput){
			config.oninput(option,self.page.target);
		}

		// Move pointer there.
		movePointer();

	};
	_addMouseEvents(slider, onmousedown, onmousemove, onmouseup);

	// Show
	self.show = function(){
		movePointer();
	};

	// BG Color!
	self.setBGColor = function(color){
		slider.style.background = color;
	};

}

function ComponentButton(config){

	// Inherit
	var self = this;
	Component.apply(self);

	// DOM: just a button
	self.dom = document.createElement("div");
	var button = _createButton(config.label, function(){
		config.onclick(self.page.target);
	});
	self.dom.appendChild(button);

	// Unless it's a HEADER button!
	if(config.header){
		button.setAttribute("header","yes");
	}

	// Or a DANGER button (e.g. "clear graph")!
	if(config.danger){
		button.setAttribute("danger","yes");
	}

}

function ComponentHTML(config){

	// Inherit
	var self = this;
	Component.apply(self);

	// just a div
	self.dom = document.createElement("div");
	self.dom.innerHTML = config.html;

}

function ComponentOutput(config){

	// Inherit
	var self = this;
	Component.apply(self);

	// DOM: just a readonly input that selects all when clicked
	self.dom = _createInput("component_output");
	self.dom.setAttribute("readonly", "true");
	self.dom.onclick = function(){
		self.dom.select();
	};

	// Output the string!
	self.output = function(string){
		self.dom.value = string;
	};

}

function ComponentToggle(config){

	// Inherit
	var self = this;
	Component.apply(self);

	// DOM: label + checkbox
	self.dom = document.createElement("div");
	self.dom.style.marginTop = "10px";
	self.dom.style.marginBottom = "10px";

	var label = document.createElement("label");
	label.style.cursor = "pointer";
	label.style.display = "flex";
	label.style.alignItems = "center";
	label.style.gap = "8px";

	var checkbox = document.createElement("input");
	checkbox.type = "checkbox";
	checkbox.checked = false; // Default to unchecked (invisible)
	checkbox.style.width = "18px";
	checkbox.style.height = "18px";
	checkbox.style.cursor = "pointer";

	var labelText = document.createElement("span");
	labelText.innerHTML = config.label;

	label.appendChild(checkbox);
	label.appendChild(labelText);
	self.dom.appendChild(label);

	checkbox.onchange = function(){
		self.setValue(checkbox.checked);
		if(config.oninput){
			config.oninput(checkbox.checked, self.page.target);
		}
	};

	// Show - sync checkbox with current value
	self.show = function(){
		var value = self.getValue();
		checkbox.checked = (value === true || value === 1);
	};

}

// Node Group picker: a row of clickable colour swatches (one per
// loopy.nodeGroups entry) in place of the old fixed 10-colour slider.
// propName is "hue" - same underlying Node property as before.
function ComponentNodeGroup(config){

	// Inherit
	var self = this;
	Component.apply(self);

	// DOM: label + row of swatches
	self.dom = document.createElement("div");
	var label = _createLabel(config.label);
	self.dom.appendChild(label);

	var row = document.createElement("div");
	row.className = "component_node_group_row";
	self.dom.appendChild(row);

	// The other sliders get their background tinted to the node's own
	// colour in Sidebar's onedit(); this widget shows colour via its own
	// swatches instead, so that call is a no-op here.
	self.setBGColor = function(){};

	self.show = function(){
		var nodeGroups = window.loopy.nodeGroups;
		var currentValue = self.getValue();
		row.innerHTML = "";
		nodeGroups.groups.forEach(function(group, index){
			var swatch = document.createElement("div");
			swatch.className = "component_node_group_swatch";
			swatch.style.background = nodeGroups.PALETTE[index];
			var name = nodeGroups.getName(index);
			swatch.title = name;
			swatch.innerHTML = name.trim().charAt(0).toUpperCase();
			if(index === currentValue){
				swatch.setAttribute("selected", "yes");
			}
			swatch.onclick = function(){
				self.setValue(index);
				self.show(); // re-render selection state
			};
			row.appendChild(swatch);
		});

		// "Clear node group" - reverts to ungrouped (grey), same fixed
		// value a node gets when its group is removed entirely.
		var clearSwatch = document.createElement("div");
		clearSwatch.className = "component_node_group_swatch component_node_group_clear";
		clearSwatch.style.background = nodeGroups.NULL_COLOUR;
		clearSwatch.title = "Clear node group";
		clearSwatch.innerHTML = "&times;";
		if(currentValue === null || currentValue === undefined){
			clearSwatch.setAttribute("selected", "yes");
		}
		clearSwatch.onclick = function(){
			self.setValue(null);
			self.show();
		};
		row.appendChild(clearSwatch);
	};

	// Group count/colours changed (add/remove group) - re-render if a
	// node is currently being edited.
	subscribe("groups/changed", function(){
		if(self.page && self.page.target) self.show();
	});

}

// Node Type picker: exactly two options (no more "split") - simulable
// (passes signal, has up/down controls in Play mode) or non-simulable
// (does not pass signal). propName is "active": 1 or 0.
function ComponentNodeType(config){

	// Inherit
	var self = this;
	Component.apply(self);

	self.dom = document.createElement("div");
	var label = _createLabel(config.label);
	self.dom.appendChild(label);

	var row = document.createElement("div");
	row.className = "component_node_group_row";
	self.dom.appendChild(row);

	var OPTIONS = [
		{value: 1, glyph: "&#8645;", title: "Simulable - passes signal, has up/down controls in Play mode"},
		{value: 0, glyph: "&#10005;", title: "Non-simulable - does not pass signal"}
	];

	var buttons = [];
	OPTIONS.forEach(function(opt){
		var btn = document.createElement("div");
		btn.className = "component_node_type_swatch";
		btn.innerHTML = opt.glyph;
		btn.title = opt.title;
		btn.onclick = function(){
			self.setValue(opt.value);
			self.show();
		};
		row.appendChild(btn);
		buttons.push(btn);
	});

	self.show = function(){
		var currentValue = self.getValue();
		OPTIONS.forEach(function(opt, i){
			buttons[i].setAttribute("selected", (opt.value === currentValue) ? "yes" : "no");
		});
	};

	// Tint, same as the other node-editing sliders (Sidebar's onedit()).
	self.setBGColor = function(color){
		buttons.forEach(function(btn){ btn.style.background = color; });
	};

}

// Edge Type picker: directed (default) / bi-directed / questionable.
// propName is "edgeType". The chosen type's visuals (dash pattern,
// arrowheads, "?" glyph) always render on the canvas regardless of
// whether this field is toggled visible - only the ability to *change*
// it from the sidebar is gated, same as every other optional field.
function ComponentEdgeType(config){

	// Inherit
	var self = this;
	Component.apply(self);

	self.dom = document.createElement("div");
	var label = _createLabel(config.label);
	self.dom.appendChild(label);

	var row = document.createElement("div");
	row.className = "component_edge_type_row";
	self.dom.appendChild(row);

	var OPTIONS = [
		{value: "directed", label: "Directed", title: "Solid line, single arrowhead (default)"},
		{value: "bi-directed", label: "Bi-directed", title: "Dashed line, arrowheads at both ends"},
		{value: "questionable", label: "Questionable", title: "Dotted line with a \"?\" - does not pass signal"}
	];

	var buttons = [];
	OPTIONS.forEach(function(opt){
		var btn = document.createElement("div");
		btn.className = "component_edge_type_pill";
		btn.innerHTML = opt.label;
		btn.title = opt.title;
		btn.onclick = function(){
			self.setValue(opt.value);
			self.show();
		};
		row.appendChild(btn);
		buttons.push(btn);
	});

	self.show = function(){
		var currentValue = self.getValue();
		OPTIONS.forEach(function(opt, i){
			buttons[i].setAttribute("selected", (opt.value === currentValue) ? "yes" : "no");
		});
	};

}
