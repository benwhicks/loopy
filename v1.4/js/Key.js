((exports) => {
	// Singleton object
	const Key = {};
	exports.Key = Key;

	// Keycodes to words mapping
	const KEY_CODES = {
		17: "control",
		91: "control", // mac
		13: "enter",

		78: "ink",   // (N) - Pencil
		86: "drag",  // (V) - Move
		69: "erase", // (E) - Erase
		84: "label", // (T) - Text
		83: "save",  // (S) - Save
		90: "undo",  // (Z) - Undo
		89: "redo",  // (Y) - Redo

		// No Ctrl/Cmd +, -, or 0 here on purpose: those are the browser's
		// own zoom shortcuts, and this app used to hijack them (requiring
		// Ctrl/Cmd to actually zoom, same as undo/redo below) - which
		// clashed with the browser's native page zoom. Zooming LOOPY's
		// canvas is still available via Ctrl+Scroll or the toolbar buttons.
	};

	// Helper: check if key should be handled by the app
	const isAppKey = (keyCode) => KEY_CODES.hasOwnProperty(keyCode);

	// Key Down Handler
	Key.onKeyDown = (event) => {
		// Ignore keys when a modal is showing
		if (window.loopy?.modal?.isShowing) return;

		const code = KEY_CODES[event.keyCode];
		if (!code) return; // allow browser shortcuts (like F12)

		// Handle Ctrl+Z / Ctrl+Y for undo/redo
		if (event.ctrlKey && code === "undo") publish("key/undo");
		else if (event.ctrlKey && code === "redo") publish("key/redo");
		else {
			Key[code] = true;
			publish(`key/${code}`);
		}

		event.stopPropagation();
		event.preventDefault();
	};

	// Key Up Handler
	Key.onKeyUp = (event) => {
		if (window.loopy?.modal?.isShowing) return;

		const code = KEY_CODES[event.keyCode];
		if (!code) return; // let other keys behave normally

		Key[code] = false;

		event.stopPropagation();
		event.preventDefault();
	};

	// Event listeners
	window.addEventListener("keydown", Key.onKeyDown, false);
	window.addEventListener("keyup", Key.onKeyUp, false);

})(window);
