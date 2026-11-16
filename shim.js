// Offline guard v3 — blokir semua request eksternal, tanpa jejak domain asli
(function () {
	const realFetch = window.fetch;
	const origin = window.location.origin;

	// ==== FETCH interceptor ====
	window.fetch = async function (input, init) {
		const url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
		// same-origin: lewatkan
		if (url.startsWith('/') || url.startsWith(origin)) {
			return realFetch.call(this, input, init);
		}
		// YouTube iframe API: dummy biar musik toggle gak crash
		if (url.includes('youtube.com')) {
			return new Response('// offline', { status: 200, headers: { 'Content-Type': 'text/javascript' } });
		}
		// semua domain eksternal: block senyap
		return new Response(JSON.stringify({ success: false, error: { code: 'OFFLINE', message: 'blocked' } }),
			{ status: 200, headers: { 'Content-Type': 'application/json' } });
	};

	// ==== XMLHttpRequest interceptor ====
	const OrigOpen = XMLHttpRequest.prototype.open;
	XMLHttpRequest.prototype.open = function (method, url, ...rest) {
		this.__blocked = !String(url).startsWith('/') && !String(url).startsWith(origin);
		return OrigOpen.call(this, method, url, ...rest);
	};
	const OrigSend = XMLHttpRequest.prototype.send;
	XMLHttpRequest.prototype.send = function (...args) {
		if (this.__blocked) {
			Object.defineProperty(this, 'readyState', { value: 4 });
			Object.defineProperty(this, 'status', { value: 200 });
			Object.defineProperty(this, 'responseText', { value: '{"success":true,"data":[]}' });
			Object.defineProperty(this, 'response', { value: '{"success":true,"data":[]}' });
			if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
			if (typeof this.onload === 'function') this.onload();
			return;
		}
		return OrigSend.apply(this, args);
	};

	// ==== sendBeacon neutered ====
	navigator.sendBeacon = function () { return true; };

	// ==== WebSocket eksternal diblok ====
	const OrigWS = window.WebSocket;
	window.WebSocket = function (url, ...rest) {
		const u = String(url);
		if (!u.includes(window.location.hostname)) {
			return { close() {}, send() {}, addEventListener() {}, readyState: 3 };
		}
		return new OrigWS(url, ...rest);
	};
})();
