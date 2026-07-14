import fs from 'node:fs';
import require$$0$1 from 'node:buffer';
import require$$6 from 'node:stream';
import path__default from 'node:path';
import require$$0$2__default from 'node:util';
import zlib__default from 'node:zlib';
import EventEmitter from 'node:events';

function _mergeNamespaces(n, m) {
	for (var i = 0; i < m.length; i++) {
		const e = m[i];
		if (typeof e !== 'string' && !Array.isArray(e)) { for (const k in e) {
			if (k !== 'default' && !(k in n)) {
				const d = Object.getOwnPropertyDescriptor(e, k);
				if (d) {
					Object.defineProperty(n, k, d.get ? d : {
						enumerable: true,
						get: () => e[k]
					});
				}
			}
		} }
	}
	return Object.freeze(Object.defineProperty(n, Symbol.toStringTag, { value: 'Module' }));
}

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var browser = {exports: {}};

/**
 * Helpers.
 */

var ms;
var hasRequiredMs;

function requireMs () {
	if (hasRequiredMs) return ms;
	hasRequiredMs = 1;
	var s = 1000;
	var m = s * 60;
	var h = m * 60;
	var d = h * 24;
	var w = d * 7;
	var y = d * 365.25;

	/**
	 * Parse or format the given `val`.
	 *
	 * Options:
	 *
	 *  - `long` verbose formatting [false]
	 *
	 * @param {String|Number} val
	 * @param {Object} [options]
	 * @throws {Error} throw an error if val is not a non-empty string or a number
	 * @return {String|Number}
	 * @api public
	 */

	ms = function (val, options) {
	  options = options || {};
	  var type = typeof val;
	  if (type === 'string' && val.length > 0) {
	    return parse(val);
	  } else if (type === 'number' && isFinite(val)) {
	    return options.long ? fmtLong(val) : fmtShort(val);
	  }
	  throw new Error(
	    'val is not a non-empty string or a valid number. val=' +
	      JSON.stringify(val)
	  );
	};

	/**
	 * Parse the given `str` and return milliseconds.
	 *
	 * @param {String} str
	 * @return {Number}
	 * @api private
	 */

	function parse(str) {
	  str = String(str);
	  if (str.length > 100) {
	    return;
	  }
	  var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
	    str
	  );
	  if (!match) {
	    return;
	  }
	  var n = parseFloat(match[1]);
	  var type = (match[2] || 'ms').toLowerCase();
	  switch (type) {
	    case 'years':
	    case 'year':
	    case 'yrs':
	    case 'yr':
	    case 'y':
	      return n * y;
	    case 'weeks':
	    case 'week':
	    case 'w':
	      return n * w;
	    case 'days':
	    case 'day':
	    case 'd':
	      return n * d;
	    case 'hours':
	    case 'hour':
	    case 'hrs':
	    case 'hr':
	    case 'h':
	      return n * h;
	    case 'minutes':
	    case 'minute':
	    case 'mins':
	    case 'min':
	    case 'm':
	      return n * m;
	    case 'seconds':
	    case 'second':
	    case 'secs':
	    case 'sec':
	    case 's':
	      return n * s;
	    case 'milliseconds':
	    case 'millisecond':
	    case 'msecs':
	    case 'msec':
	    case 'ms':
	      return n;
	    default:
	      return undefined;
	  }
	}

	/**
	 * Short format for `ms`.
	 *
	 * @param {Number} ms
	 * @return {String}
	 * @api private
	 */

	function fmtShort(ms) {
	  var msAbs = Math.abs(ms);
	  if (msAbs >= d) {
	    return Math.round(ms / d) + 'd';
	  }
	  if (msAbs >= h) {
	    return Math.round(ms / h) + 'h';
	  }
	  if (msAbs >= m) {
	    return Math.round(ms / m) + 'm';
	  }
	  if (msAbs >= s) {
	    return Math.round(ms / s) + 's';
	  }
	  return ms + 'ms';
	}

	/**
	 * Long format for `ms`.
	 *
	 * @param {Number} ms
	 * @return {String}
	 * @api private
	 */

	function fmtLong(ms) {
	  var msAbs = Math.abs(ms);
	  if (msAbs >= d) {
	    return plural(ms, msAbs, d, 'day');
	  }
	  if (msAbs >= h) {
	    return plural(ms, msAbs, h, 'hour');
	  }
	  if (msAbs >= m) {
	    return plural(ms, msAbs, m, 'minute');
	  }
	  if (msAbs >= s) {
	    return plural(ms, msAbs, s, 'second');
	  }
	  return ms + ' ms';
	}

	/**
	 * Pluralization helper.
	 */

	function plural(ms, msAbs, n, name) {
	  var isPlural = msAbs >= n * 1.5;
	  return Math.round(ms / n) + ' ' + name + (isPlural ? 's' : '');
	}
	return ms;
}

var common;
var hasRequiredCommon;

function requireCommon () {
	if (hasRequiredCommon) return common;
	hasRequiredCommon = 1;
	/**
	 * This is the common logic for both the Node.js and web browser
	 * implementations of `debug()`.
	 */

	function setup(env) {
		createDebug.debug = createDebug;
		createDebug.default = createDebug;
		createDebug.coerce = coerce;
		createDebug.disable = disable;
		createDebug.enable = enable;
		createDebug.enabled = enabled;
		createDebug.humanize = requireMs();
		createDebug.destroy = destroy;

		Object.keys(env).forEach(key => {
			createDebug[key] = env[key];
		});

		/**
		* The currently active debug mode names, and names to skip.
		*/

		createDebug.names = [];
		createDebug.skips = [];

		/**
		* Map of special "%n" handling functions, for the debug "format" argument.
		*
		* Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
		*/
		createDebug.formatters = {};

		/**
		* Selects a color for a debug namespace
		* @param {String} namespace The namespace string for the debug instance to be colored
		* @return {Number|String} An ANSI color code for the given namespace
		* @api private
		*/
		function selectColor(namespace) {
			let hash = 0;

			for (let i = 0; i < namespace.length; i++) {
				hash = ((hash << 5) - hash) + namespace.charCodeAt(i);
				hash |= 0; // Convert to 32bit integer
			}

			return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
		}
		createDebug.selectColor = selectColor;

		/**
		* Create a debugger with the given `namespace`.
		*
		* @param {String} namespace
		* @return {Function}
		* @api public
		*/
		function createDebug(namespace) {
			let prevTime;
			let enableOverride = null;
			let namespacesCache;
			let enabledCache;

			function debug(...args) {
				// Disabled?
				if (!debug.enabled) {
					return;
				}

				const self = debug;

				// Set `diff` timestamp
				const curr = Number(new Date());
				const ms = curr - (prevTime || curr);
				self.diff = ms;
				self.prev = prevTime;
				self.curr = curr;
				prevTime = curr;

				args[0] = createDebug.coerce(args[0]);

				if (typeof args[0] !== 'string') {
					// Anything else let's inspect with %O
					args.unshift('%O');
				}

				// Apply any `formatters` transformations
				let index = 0;
				args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
					// If we encounter an escaped % then don't increase the array index
					if (match === '%%') {
						return '%';
					}
					index++;
					const formatter = createDebug.formatters[format];
					if (typeof formatter === 'function') {
						const val = args[index];
						match = formatter.call(self, val);

						// Now we need to remove `args[index]` since it's inlined in the `format`
						args.splice(index, 1);
						index--;
					}
					return match;
				});

				// Apply env-specific formatting (colors, etc.)
				createDebug.formatArgs.call(self, args);

				const logFn = self.log || createDebug.log;
				logFn.apply(self, args);
			}

			debug.namespace = namespace;
			debug.useColors = createDebug.useColors();
			debug.color = createDebug.selectColor(namespace);
			debug.extend = extend;
			debug.destroy = createDebug.destroy; // XXX Temporary. Will be removed in the next major release.

			Object.defineProperty(debug, 'enabled', {
				enumerable: true,
				configurable: false,
				get: () => {
					if (enableOverride !== null) {
						return enableOverride;
					}
					if (namespacesCache !== createDebug.namespaces) {
						namespacesCache = createDebug.namespaces;
						enabledCache = createDebug.enabled(namespace);
					}

					return enabledCache;
				},
				set: v => {
					enableOverride = v;
				}
			});

			// Env-specific initialization logic for debug instances
			if (typeof createDebug.init === 'function') {
				createDebug.init(debug);
			}

			return debug;
		}

		function extend(namespace, delimiter) {
			const newDebug = createDebug(this.namespace + (typeof delimiter === 'undefined' ? ':' : delimiter) + namespace);
			newDebug.log = this.log;
			return newDebug;
		}

		/**
		* Enables a debug mode by namespaces. This can include modes
		* separated by a colon and wildcards.
		*
		* @param {String} namespaces
		* @api public
		*/
		function enable(namespaces) {
			createDebug.save(namespaces);
			createDebug.namespaces = namespaces;

			createDebug.names = [];
			createDebug.skips = [];

			const split = (typeof namespaces === 'string' ? namespaces : '')
				.trim()
				.replace(' ', ',')
				.split(',')
				.filter(Boolean);

			for (const ns of split) {
				if (ns[0] === '-') {
					createDebug.skips.push(ns.slice(1));
				} else {
					createDebug.names.push(ns);
				}
			}
		}

		/**
		 * Checks if the given string matches a namespace template, honoring
		 * asterisks as wildcards.
		 *
		 * @param {String} search
		 * @param {String} template
		 * @return {Boolean}
		 */
		function matchesTemplate(search, template) {
			let searchIndex = 0;
			let templateIndex = 0;
			let starIndex = -1;
			let matchIndex = 0;

			while (searchIndex < search.length) {
				if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === '*')) {
					// Match character or proceed with wildcard
					if (template[templateIndex] === '*') {
						starIndex = templateIndex;
						matchIndex = searchIndex;
						templateIndex++; // Skip the '*'
					} else {
						searchIndex++;
						templateIndex++;
					}
				} else if (starIndex !== -1) { // eslint-disable-line no-negated-condition
					// Backtrack to the last '*' and try to match more characters
					templateIndex = starIndex + 1;
					matchIndex++;
					searchIndex = matchIndex;
				} else {
					return false; // No match
				}
			}

			// Handle trailing '*' in template
			while (templateIndex < template.length && template[templateIndex] === '*') {
				templateIndex++;
			}

			return templateIndex === template.length;
		}

		/**
		* Disable debug output.
		*
		* @return {String} namespaces
		* @api public
		*/
		function disable() {
			const namespaces = [
				...createDebug.names,
				...createDebug.skips.map(namespace => '-' + namespace)
			].join(',');
			createDebug.enable('');
			return namespaces;
		}

		/**
		* Returns true if the given mode name is enabled, false otherwise.
		*
		* @param {String} name
		* @return {Boolean}
		* @api public
		*/
		function enabled(name) {
			for (const skip of createDebug.skips) {
				if (matchesTemplate(name, skip)) {
					return false;
				}
			}

			for (const ns of createDebug.names) {
				if (matchesTemplate(name, ns)) {
					return true;
				}
			}

			return false;
		}

		/**
		* Coerce `val`.
		*
		* @param {Mixed} val
		* @return {Mixed}
		* @api private
		*/
		function coerce(val) {
			if (val instanceof Error) {
				return val.stack || val.message;
			}
			return val;
		}

		/**
		* XXX DO NOT USE. This is a temporary stub function.
		* XXX It WILL be removed in the next major release.
		*/
		function destroy() {
			console.warn('Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.');
		}

		createDebug.enable(createDebug.load());

		return createDebug;
	}

	common = setup;
	return common;
}

/* eslint-env browser */

var hasRequiredBrowser;

function requireBrowser () {
	if (hasRequiredBrowser) return browser.exports;
	hasRequiredBrowser = 1;
	(function (module, exports) {
		/**
		 * This is the web browser implementation of `debug()`.
		 */

		exports.formatArgs = formatArgs;
		exports.save = save;
		exports.load = load;
		exports.useColors = useColors;
		exports.storage = localstorage();
		exports.destroy = (() => {
			let warned = false;

			return () => {
				if (!warned) {
					warned = true;
					console.warn('Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.');
				}
			};
		})();

		/**
		 * Colors.
		 */

		exports.colors = [
			'#0000CC',
			'#0000FF',
			'#0033CC',
			'#0033FF',
			'#0066CC',
			'#0066FF',
			'#0099CC',
			'#0099FF',
			'#00CC00',
			'#00CC33',
			'#00CC66',
			'#00CC99',
			'#00CCCC',
			'#00CCFF',
			'#3300CC',
			'#3300FF',
			'#3333CC',
			'#3333FF',
			'#3366CC',
			'#3366FF',
			'#3399CC',
			'#3399FF',
			'#33CC00',
			'#33CC33',
			'#33CC66',
			'#33CC99',
			'#33CCCC',
			'#33CCFF',
			'#6600CC',
			'#6600FF',
			'#6633CC',
			'#6633FF',
			'#66CC00',
			'#66CC33',
			'#9900CC',
			'#9900FF',
			'#9933CC',
			'#9933FF',
			'#99CC00',
			'#99CC33',
			'#CC0000',
			'#CC0033',
			'#CC0066',
			'#CC0099',
			'#CC00CC',
			'#CC00FF',
			'#CC3300',
			'#CC3333',
			'#CC3366',
			'#CC3399',
			'#CC33CC',
			'#CC33FF',
			'#CC6600',
			'#CC6633',
			'#CC9900',
			'#CC9933',
			'#CCCC00',
			'#CCCC33',
			'#FF0000',
			'#FF0033',
			'#FF0066',
			'#FF0099',
			'#FF00CC',
			'#FF00FF',
			'#FF3300',
			'#FF3333',
			'#FF3366',
			'#FF3399',
			'#FF33CC',
			'#FF33FF',
			'#FF6600',
			'#FF6633',
			'#FF9900',
			'#FF9933',
			'#FFCC00',
			'#FFCC33'
		];

		/**
		 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
		 * and the Firebug extension (any Firefox version) are known
		 * to support "%c" CSS customizations.
		 *
		 * TODO: add a `localStorage` variable to explicitly enable/disable colors
		 */

		// eslint-disable-next-line complexity
		function useColors() {
			// NB: In an Electron preload script, document will be defined but not fully
			// initialized. Since we know we're in Chrome, we'll just detect this case
			// explicitly
			if (typeof window !== 'undefined' && window.process && (window.process.type === 'renderer' || window.process.__nwjs)) {
				return true;
			}

			// Internet Explorer and Edge do not support colors.
			if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
				return false;
			}

			let m;

			// Is webkit? http://stackoverflow.com/a/16459606/376773
			// document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
			// eslint-disable-next-line no-return-assign
			return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
				// Is firebug? http://stackoverflow.com/a/398120/376773
				(typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
				// Is firefox >= v31?
				// https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
				(typeof navigator !== 'undefined' && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31) ||
				// Double check webkit in userAgent just in case we are in a worker
				(typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
		}

		/**
		 * Colorize log arguments if enabled.
		 *
		 * @api public
		 */

		function formatArgs(args) {
			args[0] = (this.useColors ? '%c' : '') +
				this.namespace +
				(this.useColors ? ' %c' : ' ') +
				args[0] +
				(this.useColors ? '%c ' : ' ') +
				'+' + module.exports.humanize(this.diff);

			if (!this.useColors) {
				return;
			}

			const c = 'color: ' + this.color;
			args.splice(1, 0, c, 'color: inherit');

			// The final "%c" is somewhat tricky, because there could be other
			// arguments passed either before or after the %c, so we need to
			// figure out the correct index to insert the CSS into
			let index = 0;
			let lastC = 0;
			args[0].replace(/%[a-zA-Z%]/g, match => {
				if (match === '%%') {
					return;
				}
				index++;
				if (match === '%c') {
					// We only are interested in the *last* %c
					// (the user may have provided their own)
					lastC = index;
				}
			});

			args.splice(lastC, 0, c);
		}

		/**
		 * Invokes `console.debug()` when available.
		 * No-op when `console.debug` is not a "function".
		 * If `console.debug` is not available, falls back
		 * to `console.log`.
		 *
		 * @api public
		 */
		exports.log = console.debug || console.log || (() => {});

		/**
		 * Save `namespaces`.
		 *
		 * @param {String} namespaces
		 * @api private
		 */
		function save(namespaces) {
			try {
				if (namespaces) {
					exports.storage.setItem('debug', namespaces);
				} else {
					exports.storage.removeItem('debug');
				}
			} catch (error) {
				// Swallow
				// XXX (@Qix-) should we be logging these?
			}
		}

		/**
		 * Load `namespaces`.
		 *
		 * @return {String} returns the previously persisted debug modes
		 * @api private
		 */
		function load() {
			let r;
			try {
				r = exports.storage.getItem('debug');
			} catch (error) {
				// Swallow
				// XXX (@Qix-) should we be logging these?
			}

			// If debug isn't set in LS, and we're in Electron, try to load $DEBUG
			if (!r && typeof process !== 'undefined' && 'env' in process) {
				r = process.env.DEBUG;
			}

			return r;
		}

		/**
		 * Localstorage attempts to return the localstorage.
		 *
		 * This is necessary because safari throws
		 * when a user disables cookies/localstorage
		 * and you attempt to access it.
		 *
		 * @return {LocalStorage}
		 * @api private
		 */

		function localstorage() {
			try {
				// TVMLKit (Apple TV JS Runtime) does not have a window object, just localStorage in the global context
				// The Browser also has localStorage in the global context.
				return localStorage;
			} catch (error) {
				// Swallow
				// XXX (@Qix-) should we be logging these?
			}
		}

		module.exports = requireCommon()(exports);

		const {formatters} = module.exports;

		/**
		 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
		 */

		formatters.j = function (v) {
			try {
				return JSON.stringify(v);
			} catch (error) {
				return '[UnexpectedJSONParseError]: ' + error.message;
			}
		}; 
	} (browser, browser.exports));
	return browser.exports;
}

var getStream = {exports: {}};

var once = {exports: {}};

var wrappy_1;
var hasRequiredWrappy;

function requireWrappy () {
	if (hasRequiredWrappy) return wrappy_1;
	hasRequiredWrappy = 1;
	// Returns a wrapper function that returns a wrapped callback
	// The wrapper function should do some stuff, and return a
	// presumably different callback function.
	// This makes sure that own properties are retained, so that
	// decorations and such are not lost along the way.
	wrappy_1 = wrappy;
	function wrappy (fn, cb) {
	  if (fn && cb) return wrappy(fn)(cb)

	  if (typeof fn !== 'function')
	    throw new TypeError('need wrapper function')

	  Object.keys(fn).forEach(function (k) {
	    wrapper[k] = fn[k];
	  });

	  return wrapper

	  function wrapper() {
	    var args = new Array(arguments.length);
	    for (var i = 0; i < args.length; i++) {
	      args[i] = arguments[i];
	    }
	    var ret = fn.apply(this, args);
	    var cb = args[args.length-1];
	    if (typeof ret === 'function' && ret !== cb) {
	      Object.keys(cb).forEach(function (k) {
	        ret[k] = cb[k];
	      });
	    }
	    return ret
	  }
	}
	return wrappy_1;
}

var hasRequiredOnce;

function requireOnce () {
	if (hasRequiredOnce) return once.exports;
	hasRequiredOnce = 1;
	var wrappy = requireWrappy();
	once.exports = wrappy(once$1);
	once.exports.strict = wrappy(onceStrict);

	once$1.proto = once$1(function () {
	  Object.defineProperty(Function.prototype, 'once', {
	    value: function () {
	      return once$1(this)
	    },
	    configurable: true
	  });

	  Object.defineProperty(Function.prototype, 'onceStrict', {
	    value: function () {
	      return onceStrict(this)
	    },
	    configurable: true
	  });
	});

	function once$1 (fn) {
	  var f = function () {
	    if (f.called) return f.value
	    f.called = true;
	    return f.value = fn.apply(this, arguments)
	  };
	  f.called = false;
	  return f
	}

	function onceStrict (fn) {
	  var f = function () {
	    if (f.called)
	      throw new Error(f.onceError)
	    f.called = true;
	    return f.value = fn.apply(this, arguments)
	  };
	  var name = fn.name || 'Function wrapped with `once`';
	  f.onceError = name + " shouldn't be called more than once";
	  f.called = false;
	  return f
	}
	return once.exports;
}

var endOfStream;
var hasRequiredEndOfStream;

function requireEndOfStream () {
	if (hasRequiredEndOfStream) return endOfStream;
	hasRequiredEndOfStream = 1;
	var once = requireOnce();

	var noop = function() {};

	var isRequest = function(stream) {
		return stream.setHeader && typeof stream.abort === 'function';
	};

	var isChildProcess = function(stream) {
		return stream.stdio && Array.isArray(stream.stdio) && stream.stdio.length === 3
	};

	var eos = function(stream, opts, callback) {
		if (typeof opts === 'function') return eos(stream, null, opts);
		if (!opts) opts = {};

		callback = once(callback || noop);

		var ws = stream._writableState;
		var rs = stream._readableState;
		var readable = opts.readable || (opts.readable !== false && stream.readable);
		var writable = opts.writable || (opts.writable !== false && stream.writable);
		var cancelled = false;

		var onlegacyfinish = function() {
			if (!stream.writable) onfinish();
		};

		var onfinish = function() {
			writable = false;
			if (!readable) callback.call(stream);
		};

		var onend = function() {
			readable = false;
			if (!writable) callback.call(stream);
		};

		var onexit = function(exitCode) {
			callback.call(stream, exitCode ? new Error('exited with error code: ' + exitCode) : null);
		};

		var onerror = function(err) {
			callback.call(stream, err);
		};

		var onclose = function() {
			process.nextTick(onclosenexttick);
		};

		var onclosenexttick = function() {
			if (cancelled) return;
			if (readable && !(rs && (rs.ended && !rs.destroyed))) return callback.call(stream, new Error('premature close'));
			if (writable && !(ws && (ws.ended && !ws.destroyed))) return callback.call(stream, new Error('premature close'));
		};

		var onrequest = function() {
			stream.req.on('finish', onfinish);
		};

		if (isRequest(stream)) {
			stream.on('complete', onfinish);
			stream.on('abort', onclose);
			if (stream.req) onrequest();
			else stream.on('request', onrequest);
		} else if (writable && !ws) { // legacy streams
			stream.on('end', onlegacyfinish);
			stream.on('close', onlegacyfinish);
		}

		if (isChildProcess(stream)) stream.on('exit', onexit);

		stream.on('end', onend);
		stream.on('finish', onfinish);
		if (opts.error !== false) stream.on('error', onerror);
		stream.on('close', onclose);

		return function() {
			cancelled = true;
			stream.removeListener('complete', onfinish);
			stream.removeListener('abort', onclose);
			stream.removeListener('request', onrequest);
			if (stream.req) stream.req.removeListener('finish', onfinish);
			stream.removeListener('end', onlegacyfinish);
			stream.removeListener('close', onlegacyfinish);
			stream.removeListener('finish', onfinish);
			stream.removeListener('exit', onexit);
			stream.removeListener('end', onend);
			stream.removeListener('error', onerror);
			stream.removeListener('close', onclose);
		};
	};

	endOfStream = eos;
	return endOfStream;
}

var pump_1;
var hasRequiredPump;

function requirePump () {
	if (hasRequiredPump) return pump_1;
	hasRequiredPump = 1;
	var once = requireOnce();
	var eos = requireEndOfStream();
	var fs;

	try {
	  fs = require('fs'); // we only need fs to get the ReadStream and WriteStream prototypes
	} catch (e) {}

	var noop = function () {};
	var ancient = /^v?\.0/.test(process.version);

	var isFn = function (fn) {
	  return typeof fn === 'function'
	};

	var isFS = function (stream) {
	  if (!ancient) return false // newer node version do not need to care about fs is a special way
	  if (!fs) return false // browser
	  return (stream instanceof (fs.ReadStream || noop) || stream instanceof (fs.WriteStream || noop)) && isFn(stream.close)
	};

	var isRequest = function (stream) {
	  return stream.setHeader && isFn(stream.abort)
	};

	var destroyer = function (stream, reading, writing, callback) {
	  callback = once(callback);

	  var closed = false;
	  stream.on('close', function () {
	    closed = true;
	  });

	  eos(stream, {readable: reading, writable: writing}, function (err) {
	    if (err) return callback(err)
	    closed = true;
	    callback();
	  });

	  var destroyed = false;
	  return function (err) {
	    if (closed) return
	    if (destroyed) return
	    destroyed = true;

	    if (isFS(stream)) return stream.close(noop) // use close for fs streams to avoid fd leaks
	    if (isRequest(stream)) return stream.abort() // request.destroy just do .end - .abort is what we want

	    if (isFn(stream.destroy)) return stream.destroy()

	    callback(err || new Error('stream was destroyed'));
	  }
	};

	var call = function (fn) {
	  fn();
	};

	var pipe = function (from, to) {
	  return from.pipe(to)
	};

	var pump = function () {
	  var streams = Array.prototype.slice.call(arguments);
	  var callback = isFn(streams[streams.length - 1] || noop) && streams.pop() || noop;

	  if (Array.isArray(streams[0])) streams = streams[0];
	  if (streams.length < 2) throw new Error('pump requires two streams per minimum')

	  var error;
	  var destroys = streams.map(function (stream, i) {
	    var reading = i < streams.length - 1;
	    var writing = i > 0;
	    return destroyer(stream, reading, writing, function (err) {
	      if (!error) error = err;
	      if (err) destroys.forEach(call);
	      if (reading) return
	      destroys.forEach(call);
	      callback(error);
	    })
	  });

	  return streams.reduce(pipe)
	};

	pump_1 = pump;
	return pump_1;
}

var bufferStream;
var hasRequiredBufferStream;

function requireBufferStream () {
	if (hasRequiredBufferStream) return bufferStream;
	hasRequiredBufferStream = 1;
	const {PassThrough: PassThroughStream} = require$$6;

	bufferStream = options => {
		options = {...options};

		const {array} = options;
		let {encoding} = options;
		const isBuffer = encoding === 'buffer';
		let objectMode = false;

		if (array) {
			objectMode = !(encoding || isBuffer);
		} else {
			encoding = encoding || 'utf8';
		}

		if (isBuffer) {
			encoding = null;
		}

		const stream = new PassThroughStream({objectMode});

		if (encoding) {
			stream.setEncoding(encoding);
		}

		let length = 0;
		const chunks = [];

		stream.on('data', chunk => {
			chunks.push(chunk);

			if (objectMode) {
				length = chunks.length;
			} else {
				length += chunk.length;
			}
		});

		stream.getBufferedValue = () => {
			if (array) {
				return chunks;
			}

			return isBuffer ? Buffer.concat(chunks, length) : chunks.join('');
		};

		stream.getBufferedLength = () => length;

		return stream;
	};
	return bufferStream;
}

var hasRequiredGetStream;

function requireGetStream () {
	if (hasRequiredGetStream) return getStream.exports;
	hasRequiredGetStream = 1;
	const {constants: BufferConstants} = require$$0$1;
	const pump = requirePump();
	const bufferStream = requireBufferStream();

	class MaxBufferError extends Error {
		constructor() {
			super('maxBuffer exceeded');
			this.name = 'MaxBufferError';
		}
	}

	async function getStream$1(inputStream, options) {
		if (!inputStream) {
			return Promise.reject(new Error('Expected a stream'));
		}

		options = {
			maxBuffer: Infinity,
			...options
		};

		const {maxBuffer} = options;

		let stream;
		await new Promise((resolve, reject) => {
			const rejectPromise = error => {
				// Don't retrieve an oversized buffer.
				if (error && stream.getBufferedLength() <= BufferConstants.MAX_LENGTH) {
					error.bufferedData = stream.getBufferedValue();
				}

				reject(error);
			};

			stream = pump(inputStream, bufferStream(options), error => {
				if (error) {
					rejectPromise(error);
					return;
				}

				resolve();
			});

			stream.on('data', () => {
				if (stream.getBufferedLength() > maxBuffer) {
					rejectPromise(new MaxBufferError());
				}
			});
		});

		return stream.getBufferedValue();
	}

	getStream.exports = getStream$1;
	// TODO: Remove this for the next major release
	getStream.exports.default = getStream$1;
	getStream.exports.buffer = (stream, options) => getStream$1(stream, {...options, encoding: 'buffer'});
	getStream.exports.array = (stream, options) => getStream$1(stream, {...options, array: true});
	getStream.exports.MaxBufferError = MaxBufferError;
	return getStream.exports;
}

var yauzl = {};

var fdSlicer = {};

var pend;
var hasRequiredPend;

function requirePend () {
	if (hasRequiredPend) return pend;
	hasRequiredPend = 1;
	pend = Pend;

	function Pend() {
	  this.pending = 0;
	  this.max = Infinity;
	  this.listeners = [];
	  this.waiting = [];
	  this.error = null;
	}

	Pend.prototype.go = function(fn) {
	  if (this.pending < this.max) {
	    pendGo(this, fn);
	  } else {
	    this.waiting.push(fn);
	  }
	};

	Pend.prototype.wait = function(cb) {
	  if (this.pending === 0) {
	    cb(this.error);
	  } else {
	    this.listeners.push(cb);
	  }
	};

	Pend.prototype.hold = function() {
	  return pendHold(this);
	};

	function pendHold(self) {
	  self.pending += 1;
	  var called = false;
	  return onCb;
	  function onCb(err) {
	    if (called) throw new Error("callback called twice");
	    called = true;
	    self.error = self.error || err;
	    self.pending -= 1;
	    if (self.waiting.length > 0 && self.pending < self.max) {
	      pendGo(self, self.waiting.shift());
	    } else if (self.pending === 0) {
	      var listeners = self.listeners;
	      self.listeners = [];
	      listeners.forEach(cbListener);
	    }
	  }
	  function cbListener(listener) {
	    listener(self.error);
	  }
	}

	function pendGo(self, fn) {
	  fn(pendHold(self));
	}
	return pend;
}

var hasRequiredFdSlicer;

function requireFdSlicer () {
	if (hasRequiredFdSlicer) return fdSlicer;
	hasRequiredFdSlicer = 1;
	// This was adapted from https://github.com/andrewrk/node-fd-slicer by Andrew Kelley under the MIT License.
	var fs$1 = fs;
	var util = require$$0$2__default;
	var stream = require$$6;
	var Readable = stream.Readable;
	var Writable = stream.Writable;
	var PassThrough = stream.PassThrough;
	var Pend = requirePend();
	var EventEmitter$1 = EventEmitter.EventEmitter;

	fdSlicer.createFromBuffer = createFromBuffer;
	fdSlicer.createFromFd = createFromFd;
	fdSlicer.BufferSlicer = BufferSlicer;
	fdSlicer.FdSlicer = FdSlicer;

	util.inherits(FdSlicer, EventEmitter$1);
	function FdSlicer(fd, options) {
	  options = options || {};
	  EventEmitter$1.call(this);

	  this.fd = fd;
	  this.pend = new Pend();
	  this.pend.max = 1;
	  this.refCount = 0;
	  this.autoClose = !!options.autoClose;
	}

	FdSlicer.prototype.read = function(buffer, offset, length, position, callback) {
	  var self = this;
	  self.pend.go(function(cb) {
	    fs$1.read(self.fd, buffer, offset, length, position, function(err, bytesRead, buffer) {
	      cb();
	      callback(err, bytesRead, buffer);
	    });
	  });
	};

	FdSlicer.prototype.write = function(buffer, offset, length, position, callback) {
	  var self = this;
	  self.pend.go(function(cb) {
	    fs$1.write(self.fd, buffer, offset, length, position, function(err, written, buffer) {
	      cb();
	      callback(err, written, buffer);
	    });
	  });
	};

	FdSlicer.prototype.createReadStream = function(options) {
	  return new ReadStream(this, options);
	};

	FdSlicer.prototype.createWriteStream = function(options) {
	  return new WriteStream(this, options);
	};

	FdSlicer.prototype.ref = function() {
	  this.refCount += 1;
	};

	FdSlicer.prototype.unref = function() {
	  var self = this;
	  self.refCount -= 1;

	  if (self.refCount > 0) return;
	  if (self.refCount < 0) throw new Error("invalid unref");

	  if (self.autoClose) {
	    fs$1.close(self.fd, onCloseDone);
	  }

	  function onCloseDone(err) {
	    if (err) {
	      self.emit('error', err);
	    } else {
	      self.emit('close');
	    }
	  }
	};

	util.inherits(ReadStream, Readable);
	function ReadStream(context, options) {
	  options = options || {};
	  Readable.call(this, options);

	  this.context = context;
	  this.context.ref();

	  this.start = options.start || 0;
	  this.endOffset = options.end;
	  this.pos = this.start;
	  this.destroyed = false;
	}

	ReadStream.prototype._read = function(n) {
	  var self = this;
	  if (self.destroyed) return;

	  var toRead = Math.min(self._readableState.highWaterMark, n);
	  if (self.endOffset != null) {
	    toRead = Math.min(toRead, self.endOffset - self.pos);
	  }
	  if (toRead <= 0) {
	    self.destroyed = true;
	    self.push(null);
	    self.context.unref();
	    return;
	  }
	  self.context.pend.go(function(cb) {
	    if (self.destroyed) return cb();
	    var buffer = Buffer.allocUnsafe(toRead);
	    fs$1.read(self.context.fd, buffer, 0, toRead, self.pos, function(err, bytesRead) {
	      if (err) {
	        self.destroy(err);
	      } else if (bytesRead === 0) {
	        self.destroyed = true;
	        self.push(null);
	        self.context.unref();
	      } else {
	        self.pos += bytesRead;
	        self.push(buffer.slice(0, bytesRead));
	      }
	      cb();
	    });
	  });
	};

	ReadStream.prototype.destroy = function(err) {
	  if (this.destroyed) return;
	  err = err || new Error("stream destroyed");
	  this.destroyed = true;
	  this.emit('error', err);
	  this.context.unref();
	};

	util.inherits(WriteStream, Writable);
	function WriteStream(context, options) {
	  options = options || {};
	  Writable.call(this, options);

	  this.context = context;
	  this.context.ref();

	  this.start = options.start || 0;
	  this.endOffset = (options.end == null) ? Infinity : +options.end;
	  this.bytesWritten = 0;
	  this.pos = this.start;
	  this.destroyed = false;

	  this.on('finish', this.destroy.bind(this));
	}

	WriteStream.prototype._write = function(buffer, encoding, callback) {
	  var self = this;
	  if (self.destroyed) return;

	  if (self.pos + buffer.length > self.endOffset) {
	    var err = new Error("maximum file length exceeded");
	    err.code = 'ETOOBIG';
	    self.destroy();
	    callback(err);
	    return;
	  }
	  self.context.pend.go(function(cb) {
	    if (self.destroyed) return cb();
	    fs$1.write(self.context.fd, buffer, 0, buffer.length, self.pos, function(err, bytes) {
	      if (err) {
	        self.destroy();
	        cb();
	        callback(err);
	      } else {
	        self.bytesWritten += bytes;
	        self.pos += bytes;
	        self.emit('progress');
	        cb();
	        callback();
	      }
	    });
	  });
	};

	WriteStream.prototype.destroy = function() {
	  if (this.destroyed) return;
	  this.destroyed = true;
	  this.context.unref();
	};

	util.inherits(BufferSlicer, EventEmitter$1);
	function BufferSlicer(buffer, options) {
	  EventEmitter$1.call(this);

	  options = options || {};
	  this.refCount = 0;
	  this.buffer = buffer;
	  this.maxChunkSize = options.maxChunkSize || Number.MAX_SAFE_INTEGER;
	}

	BufferSlicer.prototype.read = function(buffer, offset, length, position, callback) {
	  if (!(0 <= offset && offset <= buffer.length)) throw new RangeError("offset outside buffer: 0 <= " + offset + " <= " + buffer.length);
	  if (position < 0) throw new RangeError("position is negative: " + position);
	  if (offset + length > buffer.length) {
	    // The caller's buffer can't hold all the bytes they're trying to read.
	    // Clamp the length instead of giving an error.
	    // The callback will be informed of fewer than expected bytes written.
	    length = buffer.length - offset;
	  }
	  if (position + length > this.buffer.length) {
	    // Clamp any attempt to read past the end of the source buffer.
	    length = this.buffer.length - position;
	  }
	  if (length <= 0) {
	    // After any clamping, we're fully out of bounds or otherwise have nothing to do.
	    // This isn't an error; it's just zero bytes written.
	    setImmediate(function() {
	      callback(null, 0);
	    });
	    return;
	  }
	  this.buffer.copy(buffer, offset, position, position + length);
	  setImmediate(function() {
	    callback(null, length);
	  });
	};

	BufferSlicer.prototype.write = function(buffer, offset, length, position, callback) {
	  buffer.copy(this.buffer, position, offset, offset + length);
	  setImmediate(function() {
	    callback(null, length, buffer);
	  });
	};

	BufferSlicer.prototype.createReadStream = function(options) {
	  options = options || {};
	  var readStream = new PassThrough(options);
	  readStream.destroyed = false;
	  readStream.start = options.start || 0;
	  readStream.endOffset = options.end;
	  // by the time this function returns, we'll be done.
	  readStream.pos = readStream.endOffset || this.buffer.length;

	  // respect the maxChunkSize option to slice up the chunk into smaller pieces.
	  var entireSlice = this.buffer.slice(readStream.start, readStream.pos);
	  var offset = 0;
	  while (true) {
	    var nextOffset = offset + this.maxChunkSize;
	    if (nextOffset >= entireSlice.length) {
	      // last chunk
	      if (offset < entireSlice.length) {
	        readStream.write(entireSlice.slice(offset, entireSlice.length));
	      }
	      break;
	    }
	    readStream.write(entireSlice.slice(offset, nextOffset));
	    offset = nextOffset;
	  }

	  readStream.end();
	  readStream.destroy = function() {
	    readStream.destroyed = true;
	  };
	  return readStream;
	};

	BufferSlicer.prototype.createWriteStream = function(options) {
	  var bufferSlicer = this;
	  options = options || {};
	  var writeStream = new Writable(options);
	  writeStream.start = options.start || 0;
	  writeStream.endOffset = (options.end == null) ? this.buffer.length : +options.end;
	  writeStream.bytesWritten = 0;
	  writeStream.pos = writeStream.start;
	  writeStream.destroyed = false;
	  writeStream._write = function(buffer, encoding, callback) {
	    if (writeStream.destroyed) return;

	    var end = writeStream.pos + buffer.length;
	    if (end > writeStream.endOffset) {
	      var err = new Error("maximum file length exceeded");
	      err.code = 'ETOOBIG';
	      writeStream.destroyed = true;
	      callback(err);
	      return;
	    }
	    buffer.copy(bufferSlicer.buffer, writeStream.pos, 0, buffer.length);

	    writeStream.bytesWritten += buffer.length;
	    writeStream.pos = end;
	    writeStream.emit('progress');
	    callback();
	  };
	  writeStream.destroy = function() {
	    writeStream.destroyed = true;
	  };
	  return writeStream;
	};

	BufferSlicer.prototype.ref = function() {
	  this.refCount += 1;
	};

	BufferSlicer.prototype.unref = function() {
	  this.refCount -= 1;

	  if (this.refCount < 0) {
	    throw new Error("invalid unref");
	  }
	};

	function createFromBuffer(buffer, options) {
	  return new BufferSlicer(buffer, options);
	}

	function createFromFd(fd, options) {
	  return new FdSlicer(fd, options);
	}
	return fdSlicer;
}

var bufferCrc32;
var hasRequiredBufferCrc32;

function requireBufferCrc32 () {
	if (hasRequiredBufferCrc32) return bufferCrc32;
	hasRequiredBufferCrc32 = 1;
	var Buffer = require$$0$1.Buffer;

	var CRC_TABLE = [
	  0x00000000, 0x77073096, 0xee0e612c, 0x990951ba, 0x076dc419,
	  0x706af48f, 0xe963a535, 0x9e6495a3, 0x0edb8832, 0x79dcb8a4,
	  0xe0d5e91e, 0x97d2d988, 0x09b64c2b, 0x7eb17cbd, 0xe7b82d07,
	  0x90bf1d91, 0x1db71064, 0x6ab020f2, 0xf3b97148, 0x84be41de,
	  0x1adad47d, 0x6ddde4eb, 0xf4d4b551, 0x83d385c7, 0x136c9856,
	  0x646ba8c0, 0xfd62f97a, 0x8a65c9ec, 0x14015c4f, 0x63066cd9,
	  0xfa0f3d63, 0x8d080df5, 0x3b6e20c8, 0x4c69105e, 0xd56041e4,
	  0xa2677172, 0x3c03e4d1, 0x4b04d447, 0xd20d85fd, 0xa50ab56b,
	  0x35b5a8fa, 0x42b2986c, 0xdbbbc9d6, 0xacbcf940, 0x32d86ce3,
	  0x45df5c75, 0xdcd60dcf, 0xabd13d59, 0x26d930ac, 0x51de003a,
	  0xc8d75180, 0xbfd06116, 0x21b4f4b5, 0x56b3c423, 0xcfba9599,
	  0xb8bda50f, 0x2802b89e, 0x5f058808, 0xc60cd9b2, 0xb10be924,
	  0x2f6f7c87, 0x58684c11, 0xc1611dab, 0xb6662d3d, 0x76dc4190,
	  0x01db7106, 0x98d220bc, 0xefd5102a, 0x71b18589, 0x06b6b51f,
	  0x9fbfe4a5, 0xe8b8d433, 0x7807c9a2, 0x0f00f934, 0x9609a88e,
	  0xe10e9818, 0x7f6a0dbb, 0x086d3d2d, 0x91646c97, 0xe6635c01,
	  0x6b6b51f4, 0x1c6c6162, 0x856530d8, 0xf262004e, 0x6c0695ed,
	  0x1b01a57b, 0x8208f4c1, 0xf50fc457, 0x65b0d9c6, 0x12b7e950,
	  0x8bbeb8ea, 0xfcb9887c, 0x62dd1ddf, 0x15da2d49, 0x8cd37cf3,
	  0xfbd44c65, 0x4db26158, 0x3ab551ce, 0xa3bc0074, 0xd4bb30e2,
	  0x4adfa541, 0x3dd895d7, 0xa4d1c46d, 0xd3d6f4fb, 0x4369e96a,
	  0x346ed9fc, 0xad678846, 0xda60b8d0, 0x44042d73, 0x33031de5,
	  0xaa0a4c5f, 0xdd0d7cc9, 0x5005713c, 0x270241aa, 0xbe0b1010,
	  0xc90c2086, 0x5768b525, 0x206f85b3, 0xb966d409, 0xce61e49f,
	  0x5edef90e, 0x29d9c998, 0xb0d09822, 0xc7d7a8b4, 0x59b33d17,
	  0x2eb40d81, 0xb7bd5c3b, 0xc0ba6cad, 0xedb88320, 0x9abfb3b6,
	  0x03b6e20c, 0x74b1d29a, 0xead54739, 0x9dd277af, 0x04db2615,
	  0x73dc1683, 0xe3630b12, 0x94643b84, 0x0d6d6a3e, 0x7a6a5aa8,
	  0xe40ecf0b, 0x9309ff9d, 0x0a00ae27, 0x7d079eb1, 0xf00f9344,
	  0x8708a3d2, 0x1e01f268, 0x6906c2fe, 0xf762575d, 0x806567cb,
	  0x196c3671, 0x6e6b06e7, 0xfed41b76, 0x89d32be0, 0x10da7a5a,
	  0x67dd4acc, 0xf9b9df6f, 0x8ebeeff9, 0x17b7be43, 0x60b08ed5,
	  0xd6d6a3e8, 0xa1d1937e, 0x38d8c2c4, 0x4fdff252, 0xd1bb67f1,
	  0xa6bc5767, 0x3fb506dd, 0x48b2364b, 0xd80d2bda, 0xaf0a1b4c,
	  0x36034af6, 0x41047a60, 0xdf60efc3, 0xa867df55, 0x316e8eef,
	  0x4669be79, 0xcb61b38c, 0xbc66831a, 0x256fd2a0, 0x5268e236,
	  0xcc0c7795, 0xbb0b4703, 0x220216b9, 0x5505262f, 0xc5ba3bbe,
	  0xb2bd0b28, 0x2bb45a92, 0x5cb36a04, 0xc2d7ffa7, 0xb5d0cf31,
	  0x2cd99e8b, 0x5bdeae1d, 0x9b64c2b0, 0xec63f226, 0x756aa39c,
	  0x026d930a, 0x9c0906a9, 0xeb0e363f, 0x72076785, 0x05005713,
	  0x95bf4a82, 0xe2b87a14, 0x7bb12bae, 0x0cb61b38, 0x92d28e9b,
	  0xe5d5be0d, 0x7cdcefb7, 0x0bdbdf21, 0x86d3d2d4, 0xf1d4e242,
	  0x68ddb3f8, 0x1fda836e, 0x81be16cd, 0xf6b9265b, 0x6fb077e1,
	  0x18b74777, 0x88085ae6, 0xff0f6a70, 0x66063bca, 0x11010b5c,
	  0x8f659eff, 0xf862ae69, 0x616bffd3, 0x166ccf45, 0xa00ae278,
	  0xd70dd2ee, 0x4e048354, 0x3903b3c2, 0xa7672661, 0xd06016f7,
	  0x4969474d, 0x3e6e77db, 0xaed16a4a, 0xd9d65adc, 0x40df0b66,
	  0x37d83bf0, 0xa9bcae53, 0xdebb9ec5, 0x47b2cf7f, 0x30b5ffe9,
	  0xbdbdf21c, 0xcabac28a, 0x53b39330, 0x24b4a3a6, 0xbad03605,
	  0xcdd70693, 0x54de5729, 0x23d967bf, 0xb3667a2e, 0xc4614ab8,
	  0x5d681b02, 0x2a6f2b94, 0xb40bbe37, 0xc30c8ea1, 0x5a05df1b,
	  0x2d02ef8d
	];

	if (typeof Int32Array !== 'undefined') {
	  CRC_TABLE = new Int32Array(CRC_TABLE);
	}

	function ensureBuffer(input) {
	  if (Buffer.isBuffer(input)) {
	    return input;
	  }

	  var hasNewBufferAPI =
	      typeof Buffer.alloc === "function" &&
	      typeof Buffer.from === "function";

	  if (typeof input === "number") {
	    return hasNewBufferAPI ? Buffer.alloc(input) : new Buffer(input);
	  }
	  else if (typeof input === "string") {
	    return hasNewBufferAPI ? Buffer.from(input) : new Buffer(input);
	  }
	  else {
	    throw new Error("input must be buffer, number, or string, received " +
	                    typeof input);
	  }
	}

	function bufferizeInt(num) {
	  var tmp = ensureBuffer(4);
	  tmp.writeInt32BE(num, 0);
	  return tmp;
	}

	function _crc32(buf, previous) {
	  buf = ensureBuffer(buf);
	  if (Buffer.isBuffer(previous)) {
	    previous = previous.readUInt32BE(0);
	  }
	  var crc = ~~previous ^ -1;
	  for (var n = 0; n < buf.length; n++) {
	    crc = CRC_TABLE[(crc ^ buf[n]) & 0xff] ^ (crc >>> 8);
	  }
	  return (crc ^ -1);
	}

	function crc32() {
	  return bufferizeInt(_crc32.apply(null, arguments));
	}
	crc32.signed = function () {
	  return _crc32.apply(null, arguments);
	};
	crc32.unsigned = function () {
	  return _crc32.apply(null, arguments) >>> 0;
	};

	bufferCrc32 = crc32;
	return bufferCrc32;
}

var hasRequiredYauzl;

function requireYauzl () {
	if (hasRequiredYauzl) return yauzl;
	hasRequiredYauzl = 1;
	var fs$1 = fs;
	var zlib = zlib__default;
	var fd_slicer = requireFdSlicer();
	var crc32 = requireBufferCrc32();
	var util = require$$0$2__default;
	var EventEmitter$1 = EventEmitter.EventEmitter;
	var Transform = require$$6.Transform;
	var PassThrough = require$$6.PassThrough;
	var Writable = require$$6.Writable;

	yauzl.open = open;
	yauzl.fromFd = fromFd;
	yauzl.fromBuffer = fromBuffer;
	yauzl.fromRandomAccessReader = fromRandomAccessReader;
	yauzl.dosDateTimeToDate = dosDateTimeToDate;
	yauzl.getFileNameLowLevel = getFileNameLowLevel;
	yauzl.validateFileName = validateFileName;
	yauzl.parseExtraFields = parseExtraFields;
	yauzl.ZipFile = ZipFile;
	yauzl.Entry = Entry;
	yauzl.LocalFileHeader = LocalFileHeader;
	yauzl.RandomAccessReader = RandomAccessReader;

	function open(path, options, callback) {
	  if (typeof options === "function") {
	    callback = options;
	    options = null;
	  }
	  if (options == null) options = {};
	  if (options.autoClose == null) options.autoClose = true;
	  if (options.lazyEntries == null) options.lazyEntries = false;
	  if (options.decodeStrings == null) options.decodeStrings = true;
	  if (options.validateEntrySizes == null) options.validateEntrySizes = true;
	  if (options.strictFileNames == null) options.strictFileNames = false;
	  if (callback == null) callback = defaultCallback;
	  fs$1.open(path, "r", function(err, fd) {
	    if (err) return callback(err);
	    fromFd(fd, options, function(err, zipfile) {
	      if (err) fs$1.close(fd, defaultCallback);
	      callback(err, zipfile);
	    });
	  });
	}

	function fromFd(fd, options, callback) {
	  if (typeof options === "function") {
	    callback = options;
	    options = null;
	  }
	  if (options == null) options = {};
	  if (options.autoClose == null) options.autoClose = false;
	  if (options.lazyEntries == null) options.lazyEntries = false;
	  if (options.decodeStrings == null) options.decodeStrings = true;
	  if (options.validateEntrySizes == null) options.validateEntrySizes = true;
	  if (options.strictFileNames == null) options.strictFileNames = false;
	  if (callback == null) callback = defaultCallback;
	  fs$1.fstat(fd, function(err, stats) {
	    if (err) return callback(err);
	    var reader = fd_slicer.createFromFd(fd, {autoClose: true});
	    fromRandomAccessReader(reader, stats.size, options, callback);
	  });
	}

	function fromBuffer(buffer, options, callback) {
	  if (typeof options === "function") {
	    callback = options;
	    options = null;
	  }
	  if (options == null) options = {};
	  options.autoClose = false;
	  if (options.lazyEntries == null) options.lazyEntries = false;
	  if (options.decodeStrings == null) options.decodeStrings = true;
	  if (options.validateEntrySizes == null) options.validateEntrySizes = true;
	  if (options.strictFileNames == null) options.strictFileNames = false;
	  // limit the max chunk size. see https://github.com/thejoshwolfe/yauzl/issues/87
	  var reader = fd_slicer.createFromBuffer(buffer, {maxChunkSize: 0x10000});
	  fromRandomAccessReader(reader, buffer.length, options, callback);
	}

	function fromRandomAccessReader(reader, totalSize, options, callback) {
	  if (typeof options === "function") {
	    callback = options;
	    options = null;
	  }
	  if (options == null) options = {};
	  if (options.autoClose == null) options.autoClose = true;
	  if (options.lazyEntries == null) options.lazyEntries = false;
	  if (options.decodeStrings == null) options.decodeStrings = true;
	  var decodeStrings = !!options.decodeStrings;
	  if (options.validateEntrySizes == null) options.validateEntrySizes = true;
	  if (options.strictFileNames == null) options.strictFileNames = false;
	  if (callback == null) callback = defaultCallback;
	  if (typeof totalSize !== "number") throw new Error("expected totalSize parameter to be a number");
	  if (totalSize > Number.MAX_SAFE_INTEGER) {
	    throw new Error("zip file too large. only file sizes up to 2^52 are supported due to JavaScript's Number type being an IEEE 754 double.");
	  }

	  // the matching unref() call is in zipfile.close()
	  reader.ref();

	  // eocdr means End of Central Directory Record.
	  // search backwards for the eocdr signature.
	  // the last field of the eocdr is a variable-length comment.
	  // the comment size is encoded in a 2-byte field in the eocdr, which we can't find without trudging backwards through the comment to find it.
	  // as a consequence of this design decision, it's possible to have ambiguous zip file metadata if a coherent eocdr was in the comment.
	  // we search backwards for a eocdr signature, and hope that whoever made the zip file was smart enough to forbid the eocdr signature in the comment.
	  var eocdrWithoutCommentSize = 22;
	  var zip64EocdlSize = 20; // Zip64 end of central directory locator
	  var maxCommentSize = 0xffff; // 2-byte size
	  var bufferSize = Math.min(zip64EocdlSize + eocdrWithoutCommentSize + maxCommentSize, totalSize);
	  var buffer = newBuffer(bufferSize);
	  var bufferReadStart = totalSize - buffer.length;
	  readAndAssertNoEof(reader, buffer, 0, bufferSize, bufferReadStart, function(err) {
	    if (err) return callback(err);
	    for (var i = bufferSize - eocdrWithoutCommentSize; i >= 0; i -= 1) {
	      if (buffer.readUInt32LE(i) !== 0x06054b50) continue;
	      // found eocdr
	      var eocdrBuffer = buffer.subarray(i);

	      // 0 - End of central directory signature = 0x06054b50
	      // 4 - Number of this disk
	      var diskNumber = eocdrBuffer.readUInt16LE(4);
	      // 6 - Disk where central directory starts
	      // 8 - Number of central directory records on this disk
	      // 10 - Total number of central directory records
	      var entryCount = eocdrBuffer.readUInt16LE(10);
	      // 12 - Size of central directory (bytes)
	      // 16 - Offset of start of central directory, relative to start of archive
	      var centralDirectoryOffset = eocdrBuffer.readUInt32LE(16);
	      // 20 - Comment length
	      var commentLength = eocdrBuffer.readUInt16LE(20);
	      var expectedCommentLength = eocdrBuffer.length - eocdrWithoutCommentSize;
	      if (commentLength !== expectedCommentLength) {
	        return callback(new Error("Invalid comment length. Expected: " + expectedCommentLength + ". Found: " + commentLength + ". Are there extra bytes at the end of the file? Or is the end of central dir signature `PK☺☻` in the comment?"));
	      }
	      // 22 - Comment
	      // the encoding is always cp437.
	      var comment = decodeStrings ? decodeBuffer(eocdrBuffer.subarray(22), false)
	                                  : eocdrBuffer.subarray(22);

	      // Look for a Zip64 end of central directory locator
	      if (i - zip64EocdlSize >= 0 && buffer.readUInt32LE(i - zip64EocdlSize) === 0x07064b50) {
	        // ZIP64 format
	        var zip64EocdlBuffer = buffer.subarray(i - zip64EocdlSize, i - zip64EocdlSize + zip64EocdlSize);
	        // 0 - zip64 end of central dir locator signature = 0x07064b50
	        // 4 - number of the disk with the start of the zip64 end of central directory
	        // 8 - relative offset of the zip64 end of central directory record
	        var zip64EocdrOffset = readUInt64LE(zip64EocdlBuffer, 8);
	        // 16 - total number of disks

	        // ZIP64 end of central directory record
	        var zip64EocdrBuffer = newBuffer(56);
	        return readAndAssertNoEof(reader, zip64EocdrBuffer, 0, zip64EocdrBuffer.length, zip64EocdrOffset, function(err) {
	          if (err) return callback(err);

	          // 0 - zip64 end of central dir signature                           4 bytes  (0x06064b50)
	          if (zip64EocdrBuffer.readUInt32LE(0) !== 0x06064b50) {
	            return callback(new Error("invalid zip64 end of central directory record signature"));
	          }
	          // 4 - size of zip64 end of central directory record                8 bytes
	          // 12 - version made by                                             2 bytes
	          // 14 - version needed to extract                                   2 bytes
	          // 16 - number of this disk                                         4 bytes
	          diskNumber = zip64EocdrBuffer.readUInt32LE(16);
	          if (diskNumber !== 0) {
	            // Check this only after zip64 overrides. See #118.
	            return callback(new Error("multi-disk zip files are not supported: found disk number: " + diskNumber));
	          }
	          // 20 - number of the disk with the start of the central directory  4 bytes
	          // 24 - total number of entries in the central directory on this disk         8 bytes
	          // 32 - total number of entries in the central directory            8 bytes
	          entryCount = readUInt64LE(zip64EocdrBuffer, 32);
	          // 40 - size of the central directory                               8 bytes
	          // 48 - offset of start of central directory with respect to the starting disk number     8 bytes
	          centralDirectoryOffset = readUInt64LE(zip64EocdrBuffer, 48);
	          // 56 - zip64 extensible data sector                                (variable size)
	          return callback(null, new ZipFile(reader, centralDirectoryOffset, totalSize, entryCount, comment, options.autoClose, options.lazyEntries, decodeStrings, options.validateEntrySizes, options.strictFileNames));
	        });
	      }

	      // Not ZIP64 format
	      if (diskNumber !== 0) {
	        return callback(new Error("multi-disk zip files are not supported: found disk number: " + diskNumber));
	      }
	      return callback(null, new ZipFile(reader, centralDirectoryOffset, totalSize, entryCount, comment, options.autoClose, options.lazyEntries, decodeStrings, options.validateEntrySizes, options.strictFileNames));

	    }

	    // Not a zip file.
	    callback(new Error("End of central directory record signature not found. Either not a zip file, or file is truncated."));
	  });
	}

	util.inherits(ZipFile, EventEmitter$1);
	function ZipFile(reader, centralDirectoryOffset, fileSize, entryCount, comment, autoClose, lazyEntries, decodeStrings, validateEntrySizes, strictFileNames) {
	  var self = this;
	  EventEmitter$1.call(self);
	  self.reader = reader;
	  // forward close events
	  self.reader.on("error", function(err) {
	    // error closing the fd
	    emitError(self, err);
	  });
	  self.reader.once("close", function() {
	    self.emit("close");
	  });
	  self.readEntryCursor = centralDirectoryOffset;
	  self.fileSize = fileSize;
	  self.entryCount = entryCount;
	  self.comment = comment;
	  self.entriesRead = 0;
	  self.autoClose = !!autoClose;
	  self.lazyEntries = !!lazyEntries;
	  self.decodeStrings = !!decodeStrings;
	  self.validateEntrySizes = !!validateEntrySizes;
	  self.strictFileNames = !!strictFileNames;
	  self.isOpen = true;
	  self.emittedError = false;

	  if (!self.lazyEntries) self._readEntry();
	}
	ZipFile.prototype.close = function() {
	  if (!this.isOpen) return;
	  this.isOpen = false;
	  this.reader.unref();
	};

	function emitErrorAndAutoClose(self, err) {
	  if (self.autoClose) self.close();
	  emitError(self, err);
	}
	function emitError(self, err) {
	  if (self.emittedError) return;
	  self.emittedError = true;
	  self.emit("error", err);
	}

	ZipFile.prototype.readEntry = function() {
	  if (!this.lazyEntries) throw new Error("readEntry() called without lazyEntries:true");
	  this._readEntry();
	};
	ZipFile.prototype._readEntry = function() {
	  var self = this;
	  if (self.entryCount === self.entriesRead) {
	    // done with metadata
	    setImmediate(function() {
	      if (self.autoClose) self.close();
	      if (self.emittedError) return;
	      self.emit("end");
	    });
	    return;
	  }
	  if (self.emittedError) return;
	  var buffer = newBuffer(46);
	  readAndAssertNoEof(self.reader, buffer, 0, buffer.length, self.readEntryCursor, function(err) {
	    if (err) return emitErrorAndAutoClose(self, err);
	    if (self.emittedError) return;
	    var entry = new Entry();
	    // 0 - Central directory file header signature
	    var signature = buffer.readUInt32LE(0);
	    if (signature !== 0x02014b50) return emitErrorAndAutoClose(self, new Error("invalid central directory file header signature: 0x" + signature.toString(16)));
	    // 4 - Version made by
	    entry.versionMadeBy = buffer.readUInt16LE(4);
	    // 6 - Version needed to extract (minimum)
	    entry.versionNeededToExtract = buffer.readUInt16LE(6);
	    // 8 - General purpose bit flag
	    entry.generalPurposeBitFlag = buffer.readUInt16LE(8);
	    // 10 - Compression method
	    entry.compressionMethod = buffer.readUInt16LE(10);
	    // 12 - File last modification time
	    entry.lastModFileTime = buffer.readUInt16LE(12);
	    // 14 - File last modification date
	    entry.lastModFileDate = buffer.readUInt16LE(14);
	    // 16 - CRC-32
	    entry.crc32 = buffer.readUInt32LE(16);
	    // 20 - Compressed size
	    entry.compressedSize = buffer.readUInt32LE(20);
	    // 24 - Uncompressed size
	    entry.uncompressedSize = buffer.readUInt32LE(24);
	    // 28 - File name length (n)
	    entry.fileNameLength = buffer.readUInt16LE(28);
	    // 30 - Extra field length (m)
	    entry.extraFieldLength = buffer.readUInt16LE(30);
	    // 32 - File comment length (k)
	    entry.fileCommentLength = buffer.readUInt16LE(32);
	    // 34 - Disk number where file starts
	    // 36 - Internal file attributes
	    entry.internalFileAttributes = buffer.readUInt16LE(36);
	    // 38 - External file attributes
	    entry.externalFileAttributes = buffer.readUInt32LE(38);
	    // 42 - Relative offset of local file header
	    entry.relativeOffsetOfLocalHeader = buffer.readUInt32LE(42);

	    if (entry.generalPurposeBitFlag & 0x40) return emitErrorAndAutoClose(self, new Error("strong encryption is not supported"));

	    self.readEntryCursor += 46;

	    buffer = newBuffer(entry.fileNameLength + entry.extraFieldLength + entry.fileCommentLength);
	    readAndAssertNoEof(self.reader, buffer, 0, buffer.length, self.readEntryCursor, function(err) {
	      if (err) return emitErrorAndAutoClose(self, err);
	      if (self.emittedError) return;
	      // 46 - File name
	      entry.fileNameRaw = buffer.subarray(0, entry.fileNameLength);
	      // 46+n - Extra field
	      var fileCommentStart = entry.fileNameLength + entry.extraFieldLength;
	      entry.extraFieldRaw = buffer.subarray(entry.fileNameLength, fileCommentStart);
	      // 46+n+m - File comment
	      entry.fileCommentRaw = buffer.subarray(fileCommentStart, fileCommentStart + entry.fileCommentLength);

	      // Parse the extra fields, which we need for processing other fields.
	      try {
	        entry.extraFields = parseExtraFields(entry.extraFieldRaw);
	      } catch (err) {
	        return emitErrorAndAutoClose(self, err);
	      }

	      // Interpret strings according to bit flags, extra fields, and options.
	      if (self.decodeStrings) {
	        var isUtf8 = (entry.generalPurposeBitFlag & 0x800) !== 0;
	        entry.fileComment = decodeBuffer(entry.fileCommentRaw, isUtf8);
	        entry.fileName = getFileNameLowLevel(entry.generalPurposeBitFlag, entry.fileNameRaw, entry.extraFields, self.strictFileNames);
	        var errorMessage = validateFileName(entry.fileName);
	        if (errorMessage != null) return emitErrorAndAutoClose(self, new Error(errorMessage));
	      } else {
	        entry.fileComment = entry.fileCommentRaw;
	        entry.fileName = entry.fileNameRaw;
	      }
	      // Maintain API compatibility. See https://github.com/thejoshwolfe/yauzl/issues/47
	      entry.comment = entry.fileComment;

	      self.readEntryCursor += buffer.length;
	      self.entriesRead += 1;

	      // Check for the Zip64 Extended Information Extra Field.
	      for (var i = 0; i < entry.extraFields.length; i++) {
	        var extraField = entry.extraFields[i];
	        if (extraField.id !== 0x0001) continue;
	        // Found it.

	        var zip64EiefBuffer = extraField.data;
	        var index = 0;
	        // 0 - Original Size          8 bytes
	        if (entry.uncompressedSize === 0xffffffff) {
	          if (index + 8 > zip64EiefBuffer.length) {
	            return emitErrorAndAutoClose(self, new Error("zip64 extended information extra field does not include uncompressed size"));
	          }
	          entry.uncompressedSize = readUInt64LE(zip64EiefBuffer, index);
	          index += 8;
	        }
	        // 8 - Compressed Size        8 bytes
	        if (entry.compressedSize === 0xffffffff) {
	          if (index + 8 > zip64EiefBuffer.length) {
	            return emitErrorAndAutoClose(self, new Error("zip64 extended information extra field does not include compressed size"));
	          }
	          entry.compressedSize = readUInt64LE(zip64EiefBuffer, index);
	          index += 8;
	        }
	        // 16 - Relative Header Offset 8 bytes
	        if (entry.relativeOffsetOfLocalHeader === 0xffffffff) {
	          if (index + 8 > zip64EiefBuffer.length) {
	            return emitErrorAndAutoClose(self, new Error("zip64 extended information extra field does not include relative header offset"));
	          }
	          entry.relativeOffsetOfLocalHeader = readUInt64LE(zip64EiefBuffer, index);
	          index += 8;
	        }
	        // 24 - Disk Start Number      4 bytes

	        break;
	      }

	      // validate file size
	      if (self.validateEntrySizes && entry.compressionMethod === 0) {
	        var expectedCompressedSize = entry.uncompressedSize;
	        if (entry.isEncrypted()) {
	          // traditional encryption prefixes the file data with a header
	          expectedCompressedSize += 12;
	        }
	        if (entry.compressedSize !== expectedCompressedSize) {
	          var msg = "compressed/uncompressed size mismatch for stored file: " + entry.compressedSize + " != " + entry.uncompressedSize;
	          return emitErrorAndAutoClose(self, new Error(msg));
	        }
	      }

	      self.emit("entry", entry);

	      if (!self.lazyEntries) self._readEntry();
	    });
	  });
	};

	ZipFile.prototype.openReadStream = function(entry, options, callback) {
	  var self = this;
	  // parameter validation
	  var relativeStart = 0;
	  var relativeEnd = entry.compressedSize;
	  if (callback == null) {
	    callback = options;
	    options = null;
	  }
	  if (options == null) {
	    options = {};
	  } else {
	    // validate options that the caller has no excuse to get wrong
	    if (options.decrypt != null) {
	      if (!entry.isEncrypted()) {
	        throw new Error("options.decrypt can only be specified for encrypted entries");
	      }
	      if (options.decrypt !== false) throw new Error("invalid options.decrypt value: " + options.decrypt);
	      if (entry.isCompressed()) {
	        if (options.decompress !== false) throw new Error("entry is encrypted and compressed, and options.decompress !== false");
	      }
	    }
	    if (options.decompress != null) {
	      if (!entry.isCompressed()) {
	        throw new Error("options.decompress can only be specified for compressed entries");
	      }
	      if (!(options.decompress === false || options.decompress === true)) {
	        throw new Error("invalid options.decompress value: " + options.decompress);
	      }
	    }
	    if (options.start != null || options.end != null) {
	      if (entry.isCompressed() && options.decompress !== false) {
	        throw new Error("start/end range not allowed for compressed entry without options.decompress === false");
	      }
	      if (entry.isEncrypted() && options.decrypt !== false) {
	        throw new Error("start/end range not allowed for encrypted entry without options.decrypt === false");
	      }
	    }
	    if (options.start != null) {
	      relativeStart = options.start;
	      if (relativeStart < 0) throw new Error("options.start < 0");
	      if (relativeStart > entry.compressedSize) throw new Error("options.start > entry.compressedSize");
	    }
	    if (options.end != null) {
	      relativeEnd = options.end;
	      if (relativeEnd < 0) throw new Error("options.end < 0");
	      if (relativeEnd > entry.compressedSize) throw new Error("options.end > entry.compressedSize");
	      if (relativeEnd < relativeStart) throw new Error("options.end < options.start");
	    }
	  }
	  // any further errors can either be caused by the zipfile,
	  // or were introduced in a minor version of yauzl,
	  // so should be passed to the client rather than thrown.
	  if (!self.isOpen) return callback(new Error("closed"));
	  if (entry.isEncrypted()) {
	    if (options.decrypt !== false) return callback(new Error("entry is encrypted, and options.decrypt !== false"));
	  }
	  var decompress;
	  if (entry.compressionMethod === 0) {
	    // 0 - The file is stored (no compression)
	    decompress = false;
	  } else if (entry.compressionMethod === 8) {
	    // 8 - The file is Deflated
	    decompress = options.decompress != null ? options.decompress : true;
	  } else {
	    return callback(new Error("unsupported compression method: " + entry.compressionMethod));
	  }

	  self.readLocalFileHeader(entry, {minimal: true}, function(err, localFileHeader) {
	    if (err) return callback(err);
	    self.openReadStreamLowLevel(
	      localFileHeader.fileDataStart, entry.compressedSize,
	      relativeStart, relativeEnd,
	      decompress, entry.uncompressedSize,
	      callback);
	  });
	};

	ZipFile.prototype.openReadStreamLowLevel = function(fileDataStart, compressedSize, relativeStart, relativeEnd, decompress, uncompressedSize, callback) {
	  var self = this;
	  var readStream = self.reader.createReadStream({
	    start: fileDataStart + relativeStart,
	    end: fileDataStart + relativeEnd,
	  });
	  var endpointStream = readStream;
	  if (decompress) {
	    var destroyed = false;
	    var inflateFilter = zlib.createInflateRaw();
	    readStream.on("error", function(err) {
	      // setImmediate here because errors can be emitted during the first call to pipe()
	      setImmediate(function() {
	        if (!destroyed) inflateFilter.emit("error", err);
	      });
	    });
	    readStream.pipe(inflateFilter);

	    if (self.validateEntrySizes) {
	      endpointStream = new AssertByteCountStream(uncompressedSize);
	      inflateFilter.on("error", function(err) {
	        // forward zlib errors to the client-visible stream
	        setImmediate(function() {
	          if (!destroyed) endpointStream.emit("error", err);
	        });
	      });
	      inflateFilter.pipe(endpointStream);
	    } else {
	      // the zlib filter is the client-visible stream
	      endpointStream = inflateFilter;
	    }
	    // this is part of yauzl's API, so implement this function on the client-visible stream
	    installDestroyFn(endpointStream, function() {
	      destroyed = true;
	      if (inflateFilter !== endpointStream) inflateFilter.unpipe(endpointStream);
	      readStream.unpipe(inflateFilter);
	      // TODO: the inflateFilter may cause a memory leak. see Issue #27.
	      readStream.destroy();
	    });
	  }
	  callback(null, endpointStream);
	};

	ZipFile.prototype.readLocalFileHeader = function(entry, options, callback) {
	  var self = this;
	  if (callback == null) {
	    callback = options;
	    options = null;
	  }
	  if (options == null) options = {};

	  self.reader.ref();
	  var buffer = newBuffer(30);
	  readAndAssertNoEof(self.reader, buffer, 0, buffer.length, entry.relativeOffsetOfLocalHeader, function(err) {
	    try {
	      if (err) return callback(err);
	      // 0 - Local file header signature = 0x04034b50
	      var signature = buffer.readUInt32LE(0);
	      if (signature !== 0x04034b50) {
	        return callback(new Error("invalid local file header signature: 0x" + signature.toString(16)));
	      }

	      var fileNameLength = buffer.readUInt16LE(26);
	      var extraFieldLength = buffer.readUInt16LE(28);
	      var fileDataStart = entry.relativeOffsetOfLocalHeader + 30 + fileNameLength + extraFieldLength;
	      // We now have enough information to do this bounds check.
	      if (fileDataStart + entry.compressedSize > self.fileSize) {
	        return callback(new Error("file data overflows file bounds: " +
	            fileDataStart + " + " + entry.compressedSize + " > " + self.fileSize));
	      }

	      if (options.minimal) {
	        return callback(null, {fileDataStart: fileDataStart});
	      }

	      var localFileHeader = new LocalFileHeader();
	      localFileHeader.fileDataStart = fileDataStart;

	      // 4 - Version needed to extract (minimum)
	      localFileHeader.versionNeededToExtract = buffer.readUInt16LE(4);
	      // 6 - General purpose bit flag
	      localFileHeader.generalPurposeBitFlag = buffer.readUInt16LE(6);
	      // 8 - Compression method
	      localFileHeader.compressionMethod = buffer.readUInt16LE(8);
	      // 10 - File last modification time
	      localFileHeader.lastModFileTime = buffer.readUInt16LE(10);
	      // 12 - File last modification date
	      localFileHeader.lastModFileDate = buffer.readUInt16LE(12);
	      // 14 - CRC-32
	      localFileHeader.crc32 = buffer.readUInt32LE(14);
	      // 18 - Compressed size
	      localFileHeader.compressedSize = buffer.readUInt32LE(18);
	      // 22 - Uncompressed size
	      localFileHeader.uncompressedSize = buffer.readUInt32LE(22);
	      // 26 - File name length (n)
	      localFileHeader.fileNameLength = fileNameLength;
	      // 28 - Extra field length (m)
	      localFileHeader.extraFieldLength = extraFieldLength;
	      // 30 - File name
	      // 30+n - Extra field

	      buffer = newBuffer(fileNameLength + extraFieldLength);
	      self.reader.ref();
	      readAndAssertNoEof(self.reader, buffer, 0, buffer.length, entry.relativeOffsetOfLocalHeader + 30, function(err) {
	        try {
	          if (err) return callback(err);
	          localFileHeader.fileName = buffer.subarray(0, fileNameLength);
	          localFileHeader.extraField = buffer.subarray(fileNameLength);
	          return callback(null, localFileHeader);
	        } finally {
	          self.reader.unref();
	        }
	      });
	    } finally {
	      self.reader.unref();
	    }
	  });
	};

	function Entry() {
	}
	Entry.prototype.getLastModDate = function(options) {
	  if (options == null) options = {};

	  if (!options.forceDosFormat) {
	    // Check extended fields.
	    for (var i = 0; i < this.extraFields.length; i++) {
	      var extraField = this.extraFields[i];
	      if (extraField.id === 0x5455) {
	        // InfoZIP "universal timestamp" extended field (`0x5455` aka `"UT"`).
	        // See the InfoZIP source code unix/unix.c:set_extra_field() and zipfile.c:ef_scan_ut_time().
	        var data = extraField.data;
	        if (data.length < 5) continue; // Too short.
	        // The flags define which of the three fields are present: mtime, atime, ctime.
	        // We only care about mtime.
	        // Also, ctime is never included in practice.
	        // And also, atime is only included in the local file header for some reason
	        // despite the flags lying about its inclusion in the central header.
	        var flags = data[0];
	        var HAS_MTIME = 1;
	        if (!(flags & HAS_MTIME)) continue; // This will realistically never happen.
	        // Although the positions of all of the fields shift around depending on the presence of other fields,
	        // mtime is always first if present, and that's the only one we care about.
	        var posixTimestamp = data.readInt32LE(1);
	        return new Date(posixTimestamp * 1000);
	      } else if (extraField.id === 0x000a) {
	        var data = extraField.data;
	        // 4 bytes reserved
	        var cursor = 4;
	        while (cursor < data.length + 4) {
	          // 2 bytes Tag
	          var tag = data.readUInt16LE(cursor);
	          cursor += 2;
	          // 2 bytes Size
	          var size = data.readUInt16LE(cursor);
	          cursor += 2;
	          if (tag !== 1) {
	            // Wrong tag. This will realistically never happen.
	            cursor += size;
	            continue;
	          }
	          // Tag1 is actually the only defined Tag.
	          if (size < 8 || cursor + size > data.length) break; // Invalid. Ignore.
	          // 8 bytes Mtime
	          var hundredNanoSecondsSince1601 = 4294967296 * data.readInt32LE(cursor + 4) + data.readUInt32LE(cursor);
	          // Convert from NTFS to POSIX milliseconds.
	          // The big number below is the milliseconds between year 1601 and year 1970
	          // (i.e. the negative POSIX timestamp of 1601-01-01 00:00:00Z)
	          var millisecondsSince1970 = hundredNanoSecondsSince1601 / 10000 - 11644473600000;
	          // Note on numeric precision: JavaScript Number objects lose precision above Number.MAX_SAFE_INTEGER,
	          // and NTFS timestamps are typically much bigger than that limit.
	          // (MAX_SAFE_INTEGER would represent 1629-07-17T23:58:45.475Z.)
	          // However, we're losing precision in the conversion from 100nanosecond units to millisecond units anyway,
	          // and the time at which we also lose 1-millisecond precision is just past the JavaScript Date limit (by design).
	          // Up through the year 2057, this conversion only drops 4 bits of precision,
	          // which is well under the 13-14 bits ratio between the milliseconds and 100nanoseconds.
	          return new Date(millisecondsSince1970);
	        }
	      }
	    }
	  }

	  // Fallback to non-extended encoding.
	  return dosDateTimeToDate(this.lastModFileDate, this.lastModFileTime, options.timezone);
	};
	Entry.prototype.isEncrypted = function() {
	  return (this.generalPurposeBitFlag & 0x1) !== 0;
	};
	Entry.prototype.isCompressed = function() {
	  return this.compressionMethod === 8;
	};

	function LocalFileHeader() {
	}

	function dosDateTimeToDate(date, time, timezone) {
	  var day = date & 0x1f; // 1-31
	  var month = (date >> 5 & 0xf) - 1; // 1-12, 0-11
	  var year = (date >> 9 & 0x7f) + 1980; // 0-128, 1980-2108

	  var millisecond = 0;
	  var second = (time & 0x1f) * 2; // 0-29, 0-58 (even numbers)
	  var minute = time >> 5 & 0x3f; // 0-59
	  var hour = time >> 11 & 0x1f; // 0-23

	  if (timezone == null || timezone === "local") {
	    return new Date(year, month, day, hour, minute, second, millisecond);
	  } else if (timezone === "UTC") {
	    return new Date(Date.UTC(year, month, day, hour, minute, second, millisecond));
	  } else {
	    throw new Error("unrecognized options.timezone: " + options.timezone);
	  }
	}

	function getFileNameLowLevel(generalPurposeBitFlag, fileNameBuffer, extraFields, strictFileNames) {
	  var fileName = null;

	  // check for Info-ZIP Unicode Path Extra Field (0x7075)
	  // see https://github.com/thejoshwolfe/yauzl/issues/33
	  for (var i = 0; i < extraFields.length; i++) {
	    var extraField = extraFields[i];
	    if (extraField.id === 0x7075) {
	      if (extraField.data.length < 6) {
	        // too short to be meaningful
	        continue;
	      }
	      // Version       1 byte      version of this extra field, currently 1
	      if (extraField.data.readUInt8(0) !== 1) {
	        // > Changes may not be backward compatible so this extra
	        // > field should not be used if the version is not recognized.
	        continue;
	      }
	      // NameCRC32     4 bytes     File Name Field CRC32 Checksum
	      var oldNameCrc32 = extraField.data.readUInt32LE(1);
	      if (crc32.unsigned(fileNameBuffer) !== oldNameCrc32) {
	        // > If the CRC check fails, this UTF-8 Path Extra Field should be
	        // > ignored and the File Name field in the header should be used instead.
	        continue;
	      }
	      // UnicodeName   Variable    UTF-8 version of the entry File Name
	      fileName = decodeBuffer(extraField.data.subarray(5), true);
	      break;
	    }
	  }

	  if (fileName == null) {
	    // The typical case.
	    var isUtf8 = (generalPurposeBitFlag & 0x800) !== 0;
	    fileName = decodeBuffer(fileNameBuffer, isUtf8);
	  }

	  if (!strictFileNames) {
	    // Allow backslash.
	    fileName = fileName.replace(/\\/g, "/");
	  }
	  return fileName;
	}

	function validateFileName(fileName) {
	  if (fileName.indexOf("\\") !== -1) {
	    return "invalid characters in fileName: " + fileName;
	  }
	  if (/^[a-zA-Z]:/.test(fileName) || /^\//.test(fileName)) {
	    return "absolute path: " + fileName;
	  }
	  if (fileName.split("/").indexOf("..") !== -1) {
	    return "invalid relative path: " + fileName;
	  }
	  // all good
	  return null;
	}

	function parseExtraFields(extraFieldBuffer) {
	  var extraFields = [];
	  var i = 0;
	  while (i < extraFieldBuffer.length - 3) {
	    var headerId = extraFieldBuffer.readUInt16LE(i + 0);
	    var dataSize = extraFieldBuffer.readUInt16LE(i + 2);
	    var dataStart = i + 4;
	    var dataEnd = dataStart + dataSize;
	    if (dataEnd > extraFieldBuffer.length) throw new Error("extra field length exceeds extra field buffer size");
	    var dataBuffer = extraFieldBuffer.subarray(dataStart, dataEnd);
	    extraFields.push({
	      id: headerId,
	      data: dataBuffer,
	    });
	    i = dataEnd;
	  }
	  return extraFields;
	}

	function readAndAssertNoEof(reader, buffer, offset, length, position, callback) {
	  if (length === 0) {
	    // fs.read will throw an out-of-bounds error if you try to read 0 bytes from a 0 byte file
	    return setImmediate(function() { callback(null, newBuffer(0)); });
	  }
	  reader.read(buffer, offset, length, position, function(err, bytesRead) {
	    if (err) return callback(err);
	    if (bytesRead < length) {
	      return callback(new Error("unexpected EOF"));
	    }
	    callback();
	  });
	}

	util.inherits(AssertByteCountStream, Transform);
	function AssertByteCountStream(byteCount) {
	  Transform.call(this);
	  this.actualByteCount = 0;
	  this.expectedByteCount = byteCount;
	}
	AssertByteCountStream.prototype._transform = function(chunk, encoding, cb) {
	  this.actualByteCount += chunk.length;
	  if (this.actualByteCount > this.expectedByteCount) {
	    var msg = "too many bytes in the stream. expected " + this.expectedByteCount + ". got at least " + this.actualByteCount;
	    return cb(new Error(msg));
	  }
	  cb(null, chunk);
	};
	AssertByteCountStream.prototype._flush = function(cb) {
	  if (this.actualByteCount < this.expectedByteCount) {
	    var msg = "not enough bytes in the stream. expected " + this.expectedByteCount + ". got only " + this.actualByteCount;
	    return cb(new Error(msg));
	  }
	  cb();
	};

	util.inherits(RandomAccessReader, EventEmitter$1);
	function RandomAccessReader() {
	  EventEmitter$1.call(this);
	  this.refCount = 0;
	}
	RandomAccessReader.prototype.ref = function() {
	  this.refCount += 1;
	};
	RandomAccessReader.prototype.unref = function() {
	  var self = this;
	  self.refCount -= 1;

	  if (self.refCount > 0) return;
	  if (self.refCount < 0) throw new Error("invalid unref");

	  self.close(onCloseDone);

	  function onCloseDone(err) {
	    if (err) return self.emit('error', err);
	    self.emit('close');
	  }
	};
	RandomAccessReader.prototype.createReadStream = function(options) {
	  if (options == null) options = {};
	  var start = options.start;
	  var end = options.end;
	  if (start === end) {
	    var emptyStream = new PassThrough();
	    setImmediate(function() {
	      emptyStream.end();
	    });
	    return emptyStream;
	  }
	  var stream = this._readStreamForRange(start, end);

	  var destroyed = false;
	  var refUnrefFilter = new RefUnrefFilter(this);
	  stream.on("error", function(err) {
	    setImmediate(function() {
	      if (!destroyed) refUnrefFilter.emit("error", err);
	    });
	  });
	  installDestroyFn(refUnrefFilter, function() {
	    stream.unpipe(refUnrefFilter);
	    refUnrefFilter.unref();
	    stream.destroy();
	  });

	  var byteCounter = new AssertByteCountStream(end - start);
	  refUnrefFilter.on("error", function(err) {
	    setImmediate(function() {
	      if (!destroyed) byteCounter.emit("error", err);
	    });
	  });
	  installDestroyFn(byteCounter, function() {
	    destroyed = true;
	    refUnrefFilter.unpipe(byteCounter);
	    refUnrefFilter.destroy();
	  });

	  return stream.pipe(refUnrefFilter).pipe(byteCounter);
	};
	RandomAccessReader.prototype._readStreamForRange = function(start, end) {
	  throw new Error("not implemented");
	};
	RandomAccessReader.prototype.read = function(buffer, offset, length, position, callback) {
	  var readStream = this.createReadStream({start: position, end: position + length});
	  var writeStream = new Writable();
	  var written = 0;
	  writeStream._write = function(chunk, encoding, cb) {
	    chunk.copy(buffer, offset + written, 0, chunk.length);
	    written += chunk.length;
	    cb();
	  };
	  writeStream.on("finish", callback);
	  readStream.on("error", function(error) {
	    callback(error);
	  });
	  readStream.pipe(writeStream);
	};
	RandomAccessReader.prototype.close = function(callback) {
	  setImmediate(callback);
	};

	util.inherits(RefUnrefFilter, PassThrough);
	function RefUnrefFilter(context) {
	  PassThrough.call(this);
	  this.context = context;
	  this.context.ref();
	  this.unreffedYet = false;
	}
	RefUnrefFilter.prototype._flush = function(cb) {
	  this.unref();
	  cb();
	};
	RefUnrefFilter.prototype.unref = function(cb) {
	  if (this.unreffedYet) return;
	  this.unreffedYet = true;
	  this.context.unref();
	};

	var cp437 = '\u0000☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼ !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~⌂ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
	function decodeBuffer(buffer, isUtf8) {
	  if (isUtf8) {
	    return buffer.toString("utf8");
	  } else {
	    var result = "";
	    for (var i = 0; i < buffer.length; i++) {
	      result += cp437[buffer[i]];
	    }
	    return result;
	  }
	}

	function readUInt64LE(buffer, offset) {
	  // There is no native function for this, because we can't actually store 64-bit integers precisely.
	  // after 53 bits, JavaScript's Number type (IEEE 754 double) can't store individual integers anymore.
	  // but since 53 bits is a whole lot more than 32 bits, we do our best anyway.
	  // As of 2020, Node has added support for BigInt, which obviates this whole function,
	  // but yauzl hasn't been updated to depend on BigInt (yet?).
	  var lower32 = buffer.readUInt32LE(offset);
	  var upper32 = buffer.readUInt32LE(offset + 4);
	  // we can't use bitshifting here, because JavaScript bitshifting only works on 32-bit integers.
	  return upper32 * 0x100000000 + lower32;
	  // as long as we're bounds checking the result of this function against the total file size,
	  // we'll catch any overflow errors, because we already made sure the total file size was within reason.
	}

	// Node 10 deprecated new Buffer().
	var newBuffer;
	if (typeof Buffer.allocUnsafe === "function") {
	  newBuffer = function(len) {
	    return Buffer.allocUnsafe(len);
	  };
	} else {
	  newBuffer = function(len) {
	    return new Buffer(len);
	  };
	}

	// Node 8 introduced a proper destroy() implementation on writable streams.
	function installDestroyFn(stream, fn) {
	  if (typeof stream.destroy === "function") {
	    // New API.
	    stream._destroy = function(err, cb) {
	      fn();
	      if (cb != null) cb(err);
	    };
	  } else {
	    // Old API.
	    stream.destroy = fn;
	  }
	}

	function defaultCallback(err) {
	  if (err) throw err;
	}
	return yauzl;
}

/**
 * Copyright (c) 2014 Max Ogden and other contributors
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

var extractZip$1;
var hasRequiredExtractZip;

function requireExtractZip () {
	if (hasRequiredExtractZip) return extractZip$1;
	hasRequiredExtractZip = 1;
	const debug = requireBrowser()('extract-zip');
	// eslint-disable-next-line node/no-unsupported-features/node-builtins
	const { createWriteStream, promises: fs$1 } = fs;
	const getStream = requireGetStream();
	const path = path__default;
	const { promisify } = require$$0$2__default;
	const stream = require$$6;
	const yauzl = requireYauzl();

	const openZip = promisify(yauzl.open);
	const pipeline = promisify(stream.pipeline);

	class Extractor {
	  constructor (zipPath, opts) {
	    this.zipPath = zipPath;
	    this.opts = opts;
	  }

	  async extract () {
	    debug('opening', this.zipPath, 'with opts', this.opts);

	    this.zipfile = await openZip(this.zipPath, { lazyEntries: true });
	    this.canceled = false;

	    return new Promise((resolve, reject) => {
	      this.zipfile.on('error', err => {
	        this.canceled = true;
	        reject(err);
	      });
	      this.zipfile.readEntry();

	      this.zipfile.on('close', () => {
	        if (!this.canceled) {
	          debug('zip extraction complete');
	          resolve();
	        }
	      });

	      this.zipfile.on('entry', async entry => {
	        /* istanbul ignore if */
	        if (this.canceled) {
	          debug('skipping entry', entry.fileName, { cancelled: this.canceled });
	          return
	        }

	        debug('zipfile entry', entry.fileName);

	        if (entry.fileName.startsWith('__MACOSX/')) {
	          this.zipfile.readEntry();
	          return
	        }

	        const destDir = path.dirname(path.join(this.opts.dir, entry.fileName));

	        try {
	          await fs$1.mkdir(destDir, { recursive: true });

	          const canonicalDestDir = await fs$1.realpath(destDir);
	          const relativeDestDir = path.relative(this.opts.dir, canonicalDestDir);

	          if (relativeDestDir.split(path.sep).includes('..')) {
	            throw new Error(`Out of bound path "${canonicalDestDir}" found while processing file ${entry.fileName}`)
	          }

	          await this.extractEntry(entry);
	          debug('finished processing', entry.fileName);
	          this.zipfile.readEntry();
	        } catch (err) {
	          this.canceled = true;
	          this.zipfile.close();
	          reject(err);
	        }
	      });
	    })
	  }

	  async extractEntry (entry) {
	    /* istanbul ignore if */
	    if (this.canceled) {
	      debug('skipping entry extraction', entry.fileName, { cancelled: this.canceled });
	      return
	    }

	    if (this.opts.onEntry) {
	      this.opts.onEntry(entry, this.zipfile);
	    }

	    const dest = path.join(this.opts.dir, entry.fileName);

	    // convert external file attr int into a fs stat mode int
	    const mode = (entry.externalFileAttributes >> 16) & 0xFFFF;
	    // check if it's a symlink or dir (using stat mode constants)
	    const IFMT = 61440;
	    const IFDIR = 16384;
	    const IFLNK = 40960;
	    const symlink = (mode & IFMT) === IFLNK;
	    let isDir = (mode & IFMT) === IFDIR;

	    // Failsafe, borrowed from jsZip
	    if (!isDir && entry.fileName.endsWith('/')) {
	      isDir = true;
	    }

	    // check for windows weird way of specifying a directory
	    // https://github.com/maxogden/extract-zip/issues/13#issuecomment-154494566
	    const madeBy = entry.versionMadeBy >> 8;
	    if (!isDir) isDir = (madeBy === 0 && entry.externalFileAttributes === 16);

	    debug('extracting entry', { filename: entry.fileName, isDir: isDir, isSymlink: symlink });

	    const procMode = this.getExtractedMode(mode, isDir) & 0o777;

	    // always ensure folders are created
	    const destDir = isDir ? dest : path.dirname(dest);

	    const mkdirOptions = { recursive: true };
	    if (isDir) {
	      mkdirOptions.mode = procMode;
	    }
	    debug('mkdir', { dir: destDir, ...mkdirOptions });
	    await fs$1.mkdir(destDir, mkdirOptions);
	    if (isDir) return

	    debug('opening read stream', dest);
	    const readStream = await promisify(this.zipfile.openReadStream.bind(this.zipfile))(entry);

	    if (symlink) {
	      const link = await getStream(readStream);
	      debug('creating symlink', link, dest);
	      await fs$1.symlink(link, dest);
	    } else {
	      await pipeline(readStream, createWriteStream(dest, { mode: procMode }));
	    }
	  }

	  getExtractedMode (entryMode, isDir) {
	    let mode = entryMode;
	    // Set defaults, if necessary
	    if (mode === 0) {
	      if (isDir) {
	        if (this.opts.defaultDirMode) {
	          mode = parseInt(this.opts.defaultDirMode, 10);
	        }

	        if (!mode) {
	          mode = 0o755;
	        }
	      } else {
	        if (this.opts.defaultFileMode) {
	          mode = parseInt(this.opts.defaultFileMode, 10);
	        }

	        if (!mode) {
	          mode = 0o644;
	        }
	      }
	    }

	    return mode
	  }
	}

	extractZip$1 = async function (zipPath, opts) {
	  debug('creating target directory', opts.dir);

	  if (!path.isAbsolute(opts.dir)) {
	    throw new Error('Target directory is expected to be absolute')
	  }

	  await fs$1.mkdir(opts.dir, { recursive: true });
	  opts.dir = await fs$1.realpath(opts.dir);
	  return new Extractor(zipPath, opts).extract()
	};
	return extractZip$1;
}

var yazl = {};

var hasRequiredYazl;

function requireYazl () {
	if (hasRequiredYazl) return yazl;
	hasRequiredYazl = 1;
	var fs$1 = fs;
	var Transform = require$$6.Transform;
	var PassThrough = require$$6.PassThrough;
	var zlib = zlib__default;
	var util = require$$0$2__default;
	var EventEmitter$1 = EventEmitter.EventEmitter;
	var crc32 = requireBufferCrc32();

	yazl.ZipFile = ZipFile;
	yazl.dateToDosDateTime = dateToDosDateTime;

	util.inherits(ZipFile, EventEmitter$1);
	function ZipFile() {
	  this.outputStream = new PassThrough();
	  this.entries = [];
	  this.outputStreamCursor = 0;
	  this.ended = false; // .end() sets this
	  this.allDone = false; // set when we've written the last bytes
	  this.forceZip64Eocd = false; // configurable in .end()
	}

	ZipFile.prototype.addFile = function(realPath, metadataPath, options) {
	  var self = this;
	  metadataPath = validateMetadataPath(metadataPath, false);
	  if (options == null) options = {};

	  var entry = new Entry(metadataPath, false, options);
	  self.entries.push(entry);
	  fs$1.stat(realPath, function(err, stats) {
	    if (err) return self.emit("error", err);
	    if (!stats.isFile()) return self.emit("error", new Error("not a file: " + realPath));
	    entry.uncompressedSize = stats.size;
	    if (options.mtime == null) entry.setLastModDate(stats.mtime);
	    if (options.mode == null) entry.setFileAttributesMode(stats.mode);
	    entry.setFileDataPumpFunction(function() {
	      var readStream = fs$1.createReadStream(realPath);
	      entry.state = Entry.FILE_DATA_IN_PROGRESS;
	      readStream.on("error", function(err) {
	        self.emit("error", err);
	      });
	      pumpFileDataReadStream(self, entry, readStream);
	    });
	    pumpEntries(self);
	  });
	};

	ZipFile.prototype.addReadStream = function(readStream, metadataPath, options) {
	  var self = this;
	  metadataPath = validateMetadataPath(metadataPath, false);
	  if (options == null) options = {};
	  var entry = new Entry(metadataPath, false, options);
	  self.entries.push(entry);
	  entry.setFileDataPumpFunction(function() {
	    entry.state = Entry.FILE_DATA_IN_PROGRESS;
	    pumpFileDataReadStream(self, entry, readStream);
	  });
	  pumpEntries(self);
	};

	ZipFile.prototype.addBuffer = function(buffer, metadataPath, options) {
	  var self = this;
	  metadataPath = validateMetadataPath(metadataPath, false);
	  if (buffer.length > 0x3fffffff) throw new Error("buffer too large: " + buffer.length + " > " + 0x3fffffff);
	  if (options == null) options = {};
	  if (options.size != null) throw new Error("options.size not allowed");
	  var entry = new Entry(metadataPath, false, options);
	  entry.uncompressedSize = buffer.length;
	  entry.crc32 = crc32.unsigned(buffer);
	  entry.crcAndFileSizeKnown = true;
	  self.entries.push(entry);
	  if (!entry.compress) {
	    setCompressedBuffer(buffer);
	  } else {
	    zlib.deflateRaw(buffer, function(err, compressedBuffer) {
	      setCompressedBuffer(compressedBuffer);
	    });
	  }
	  function setCompressedBuffer(compressedBuffer) {
	    entry.compressedSize = compressedBuffer.length;
	    entry.setFileDataPumpFunction(function() {
	      writeToOutputStream(self, compressedBuffer);
	      writeToOutputStream(self, entry.getDataDescriptor());
	      entry.state = Entry.FILE_DATA_DONE;

	      // don't call pumpEntries() recursively.
	      // (also, don't call process.nextTick recursively.)
	      setImmediate(function() {
	        pumpEntries(self);
	      });
	    });
	    pumpEntries(self);
	  }
	};

	ZipFile.prototype.addEmptyDirectory = function(metadataPath, options) {
	  var self = this;
	  metadataPath = validateMetadataPath(metadataPath, true);
	  if (options == null) options = {};
	  if (options.size != null) throw new Error("options.size not allowed");
	  if (options.compress != null) throw new Error("options.compress not allowed");
	  var entry = new Entry(metadataPath, true, options);
	  self.entries.push(entry);
	  entry.setFileDataPumpFunction(function() {
	    writeToOutputStream(self, entry.getDataDescriptor());
	    entry.state = Entry.FILE_DATA_DONE;
	    pumpEntries(self);
	  });
	  pumpEntries(self);
	};

	var eocdrSignatureBuffer = bufferFrom([0x50, 0x4b, 0x05, 0x06]);

	ZipFile.prototype.end = function(options, finalSizeCallback) {
	  if (typeof options === "function") {
	    finalSizeCallback = options;
	    options = null;
	  }
	  if (options == null) options = {};
	  if (this.ended) return;
	  this.ended = true;
	  this.finalSizeCallback = finalSizeCallback;
	  this.forceZip64Eocd = !!options.forceZip64Format;
	  if (options.comment) {
	    if (typeof options.comment === "string") {
	      this.comment = encodeCp437(options.comment);
	    } else {
	      // It should be a Buffer
	      this.comment = options.comment;
	    }
	    if (this.comment.length > 0xffff) throw new Error("comment is too large");
	    // gotta check for this, because the zipfile format is actually ambiguous.
	    if (bufferIncludes(this.comment, eocdrSignatureBuffer)) throw new Error("comment contains end of central directory record signature");
	  } else {
	    // no comment.
	    this.comment = EMPTY_BUFFER;
	  }
	  pumpEntries(this);
	};

	function writeToOutputStream(self, buffer) {
	  self.outputStream.write(buffer);
	  self.outputStreamCursor += buffer.length;
	}

	function pumpFileDataReadStream(self, entry, readStream) {
	  var crc32Watcher = new Crc32Watcher();
	  var uncompressedSizeCounter = new ByteCounter();
	  var compressor = entry.compress ? new zlib.DeflateRaw() : new PassThrough();
	  var compressedSizeCounter = new ByteCounter();
	  readStream.pipe(crc32Watcher)
	            .pipe(uncompressedSizeCounter)
	            .pipe(compressor)
	            .pipe(compressedSizeCounter)
	            .pipe(self.outputStream, {end: false});
	  compressedSizeCounter.on("end", function() {
	    entry.crc32 = crc32Watcher.crc32;
	    if (entry.uncompressedSize == null) {
	      entry.uncompressedSize = uncompressedSizeCounter.byteCount;
	    } else {
	      if (entry.uncompressedSize !== uncompressedSizeCounter.byteCount) return self.emit("error", new Error("file data stream has unexpected number of bytes"));
	    }
	    entry.compressedSize = compressedSizeCounter.byteCount;
	    self.outputStreamCursor += entry.compressedSize;
	    writeToOutputStream(self, entry.getDataDescriptor());
	    entry.state = Entry.FILE_DATA_DONE;
	    pumpEntries(self);
	  });
	}

	function pumpEntries(self) {
	  if (self.allDone) return;
	  // first check if finalSize is finally known
	  if (self.ended && self.finalSizeCallback != null) {
	    var finalSize = calculateFinalSize(self);
	    if (finalSize != null) {
	      // we have an answer
	      self.finalSizeCallback(finalSize);
	      self.finalSizeCallback = null;
	    }
	  }

	  // pump entries
	  var entry = getFirstNotDoneEntry();
	  function getFirstNotDoneEntry() {
	    for (var i = 0; i < self.entries.length; i++) {
	      var entry = self.entries[i];
	      if (entry.state < Entry.FILE_DATA_DONE) return entry;
	    }
	    return null;
	  }
	  if (entry != null) {
	    // this entry is not done yet
	    if (entry.state < Entry.READY_TO_PUMP_FILE_DATA) return; // input file not open yet
	    if (entry.state === Entry.FILE_DATA_IN_PROGRESS) return; // we'll get there
	    // start with local file header
	    entry.relativeOffsetOfLocalHeader = self.outputStreamCursor;
	    var localFileHeader = entry.getLocalFileHeader();
	    writeToOutputStream(self, localFileHeader);
	    entry.doFileDataPump();
	  } else {
	    // all cought up on writing entries
	    if (self.ended) {
	      // head for the exit
	      self.offsetOfStartOfCentralDirectory = self.outputStreamCursor;
	      self.entries.forEach(function(entry) {
	        var centralDirectoryRecord = entry.getCentralDirectoryRecord();
	        writeToOutputStream(self, centralDirectoryRecord);
	      });
	      writeToOutputStream(self, getEndOfCentralDirectoryRecord(self));
	      self.outputStream.end();
	      self.allDone = true;
	    }
	  }
	}

	function calculateFinalSize(self) {
	  var pretendOutputCursor = 0;
	  var centralDirectorySize = 0;
	  for (var i = 0; i < self.entries.length; i++) {
	    var entry = self.entries[i];
	    // compression is too hard to predict
	    if (entry.compress) return -1;
	    if (entry.state >= Entry.READY_TO_PUMP_FILE_DATA) {
	      // if addReadStream was called without providing the size, we can't predict the final size
	      if (entry.uncompressedSize == null) return -1;
	    } else {
	      // if we're still waiting for fs.stat, we might learn the size someday
	      if (entry.uncompressedSize == null) return null;
	    }
	    // we know this for sure, and this is important to know if we need ZIP64 format.
	    entry.relativeOffsetOfLocalHeader = pretendOutputCursor;
	    var useZip64Format = entry.useZip64Format();

	    pretendOutputCursor += LOCAL_FILE_HEADER_FIXED_SIZE + entry.utf8FileName.length;
	    pretendOutputCursor += entry.uncompressedSize;
	    if (!entry.crcAndFileSizeKnown) {
	      // use a data descriptor
	      if (useZip64Format) {
	        pretendOutputCursor += ZIP64_DATA_DESCRIPTOR_SIZE;
	      } else {
	        pretendOutputCursor += DATA_DESCRIPTOR_SIZE;
	      }
	    }

	    centralDirectorySize += CENTRAL_DIRECTORY_RECORD_FIXED_SIZE + entry.utf8FileName.length + entry.fileComment.length;
	    if (useZip64Format) {
	      centralDirectorySize += ZIP64_EXTENDED_INFORMATION_EXTRA_FIELD_SIZE;
	    }
	  }

	  var endOfCentralDirectorySize = 0;
	  if (self.forceZip64Eocd ||
	      self.entries.length >= 0xffff ||
	      centralDirectorySize >= 0xffff ||
	      pretendOutputCursor >= 0xffffffff) {
	    // use zip64 end of central directory stuff
	    endOfCentralDirectorySize += ZIP64_END_OF_CENTRAL_DIRECTORY_RECORD_SIZE + ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE;
	  }
	  endOfCentralDirectorySize += END_OF_CENTRAL_DIRECTORY_RECORD_SIZE + self.comment.length;
	  return pretendOutputCursor + centralDirectorySize + endOfCentralDirectorySize;
	}

	var ZIP64_END_OF_CENTRAL_DIRECTORY_RECORD_SIZE = 56;
	var ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE = 20;
	var END_OF_CENTRAL_DIRECTORY_RECORD_SIZE = 22;
	function getEndOfCentralDirectoryRecord(self, actuallyJustTellMeHowLongItWouldBe) {
	  var needZip64Format = false;
	  var normalEntriesLength = self.entries.length;
	  if (self.forceZip64Eocd || self.entries.length >= 0xffff) {
	    normalEntriesLength = 0xffff;
	    needZip64Format = true;
	  }
	  var sizeOfCentralDirectory = self.outputStreamCursor - self.offsetOfStartOfCentralDirectory;
	  var normalSizeOfCentralDirectory = sizeOfCentralDirectory;
	  if (self.forceZip64Eocd || sizeOfCentralDirectory >= 0xffffffff) {
	    normalSizeOfCentralDirectory = 0xffffffff;
	    needZip64Format = true;
	  }
	  var normalOffsetOfStartOfCentralDirectory = self.offsetOfStartOfCentralDirectory;
	  if (self.forceZip64Eocd || self.offsetOfStartOfCentralDirectory >= 0xffffffff) {
	    normalOffsetOfStartOfCentralDirectory = 0xffffffff;
	    needZip64Format = true;
	  }

	  var eocdrBuffer = bufferAlloc(END_OF_CENTRAL_DIRECTORY_RECORD_SIZE + self.comment.length);
	  // end of central dir signature                       4 bytes  (0x06054b50)
	  eocdrBuffer.writeUInt32LE(0x06054b50, 0);
	  // number of this disk                                2 bytes
	  eocdrBuffer.writeUInt16LE(0, 4);
	  // number of the disk with the start of the central directory  2 bytes
	  eocdrBuffer.writeUInt16LE(0, 6);
	  // total number of entries in the central directory on this disk  2 bytes
	  eocdrBuffer.writeUInt16LE(normalEntriesLength, 8);
	  // total number of entries in the central directory   2 bytes
	  eocdrBuffer.writeUInt16LE(normalEntriesLength, 10);
	  // size of the central directory                      4 bytes
	  eocdrBuffer.writeUInt32LE(normalSizeOfCentralDirectory, 12);
	  // offset of start of central directory with respect to the starting disk number  4 bytes
	  eocdrBuffer.writeUInt32LE(normalOffsetOfStartOfCentralDirectory, 16);
	  // .ZIP file comment length                           2 bytes
	  eocdrBuffer.writeUInt16LE(self.comment.length, 20);
	  // .ZIP file comment                                  (variable size)
	  self.comment.copy(eocdrBuffer, 22);

	  if (!needZip64Format) return eocdrBuffer;

	  // ZIP64 format
	  // ZIP64 End of Central Directory Record
	  var zip64EocdrBuffer = bufferAlloc(ZIP64_END_OF_CENTRAL_DIRECTORY_RECORD_SIZE);
	  // zip64 end of central dir signature                                             4 bytes  (0x06064b50)
	  zip64EocdrBuffer.writeUInt32LE(0x06064b50, 0);
	  // size of zip64 end of central directory record                                  8 bytes
	  writeUInt64LE(zip64EocdrBuffer, ZIP64_END_OF_CENTRAL_DIRECTORY_RECORD_SIZE - 12, 4);
	  // version made by                                                                2 bytes
	  zip64EocdrBuffer.writeUInt16LE(VERSION_MADE_BY, 12);
	  // version needed to extract                                                      2 bytes
	  zip64EocdrBuffer.writeUInt16LE(VERSION_NEEDED_TO_EXTRACT_ZIP64, 14);
	  // number of this disk                                                            4 bytes
	  zip64EocdrBuffer.writeUInt32LE(0, 16);
	  // number of the disk with the start of the central directory                     4 bytes
	  zip64EocdrBuffer.writeUInt32LE(0, 20);
	  // total number of entries in the central directory on this disk                  8 bytes
	  writeUInt64LE(zip64EocdrBuffer, self.entries.length, 24);
	  // total number of entries in the central directory                               8 bytes
	  writeUInt64LE(zip64EocdrBuffer, self.entries.length, 32);
	  // size of the central directory                                                  8 bytes
	  writeUInt64LE(zip64EocdrBuffer, sizeOfCentralDirectory, 40);
	  // offset of start of central directory with respect to the starting disk number  8 bytes
	  writeUInt64LE(zip64EocdrBuffer, self.offsetOfStartOfCentralDirectory, 48);
	  // zip64 extensible data sector                                                   (variable size)
	  // nothing in the zip64 extensible data sector


	  // ZIP64 End of Central Directory Locator
	  var zip64EocdlBuffer = bufferAlloc(ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE);
	  // zip64 end of central dir locator signature                               4 bytes  (0x07064b50)
	  zip64EocdlBuffer.writeUInt32LE(0x07064b50, 0);
	  // number of the disk with the start of the zip64 end of central directory  4 bytes
	  zip64EocdlBuffer.writeUInt32LE(0, 4);
	  // relative offset of the zip64 end of central directory record             8 bytes
	  writeUInt64LE(zip64EocdlBuffer, self.outputStreamCursor, 8);
	  // total number of disks                                                    4 bytes
	  zip64EocdlBuffer.writeUInt32LE(1, 16);


	  return Buffer.concat([
	    zip64EocdrBuffer,
	    zip64EocdlBuffer,
	    eocdrBuffer,
	  ]);
	}

	function validateMetadataPath(metadataPath, isDirectory) {
	  if (metadataPath === "") throw new Error("empty metadataPath");
	  metadataPath = metadataPath.replace(/\\/g, "/");
	  if (/^[a-zA-Z]:/.test(metadataPath) || /^\//.test(metadataPath)) throw new Error("absolute path: " + metadataPath);
	  if (metadataPath.split("/").indexOf("..") !== -1) throw new Error("invalid relative path: " + metadataPath);
	  var looksLikeDirectory = /\/$/.test(metadataPath);
	  if (isDirectory) {
	    // append a trailing '/' if necessary.
	    if (!looksLikeDirectory) metadataPath += "/";
	  } else {
	    if (looksLikeDirectory) throw new Error("file path cannot end with '/': " + metadataPath);
	  }
	  return metadataPath;
	}

	var EMPTY_BUFFER = bufferAlloc(0);

	// this class is not part of the public API
	function Entry(metadataPath, isDirectory, options) {
	  this.utf8FileName = bufferFrom(metadataPath);
	  if (this.utf8FileName.length > 0xffff) throw new Error("utf8 file name too long. " + utf8FileName.length + " > " + 0xffff);
	  this.isDirectory = isDirectory;
	  this.state = Entry.WAITING_FOR_METADATA;
	  this.setLastModDate(options.mtime != null ? options.mtime : new Date());
	  if (options.mode != null) {
	    this.setFileAttributesMode(options.mode);
	  } else {
	    this.setFileAttributesMode(isDirectory ? 0o40775 : 0o100664);
	  }
	  if (isDirectory) {
	    this.crcAndFileSizeKnown = true;
	    this.crc32 = 0;
	    this.uncompressedSize = 0;
	    this.compressedSize = 0;
	  } else {
	    // unknown so far
	    this.crcAndFileSizeKnown = false;
	    this.crc32 = null;
	    this.uncompressedSize = null;
	    this.compressedSize = null;
	    if (options.size != null) this.uncompressedSize = options.size;
	  }
	  if (isDirectory) {
	    this.compress = false;
	  } else {
	    this.compress = true; // default
	    if (options.compress != null) this.compress = !!options.compress;
	  }
	  this.forceZip64Format = !!options.forceZip64Format;
	  if (options.fileComment) {
	    if (typeof options.fileComment === "string") {
	      this.fileComment = bufferFrom(options.fileComment, "utf-8");
	    } else {
	      // It should be a Buffer
	      this.fileComment = options.fileComment;
	    }
	    if (this.fileComment.length > 0xffff) throw new Error("fileComment is too large");
	  } else {
	    // no comment.
	    this.fileComment = EMPTY_BUFFER;
	  }
	}
	Entry.WAITING_FOR_METADATA = 0;
	Entry.READY_TO_PUMP_FILE_DATA = 1;
	Entry.FILE_DATA_IN_PROGRESS = 2;
	Entry.FILE_DATA_DONE = 3;
	Entry.prototype.setLastModDate = function(date) {
	  var dosDateTime = dateToDosDateTime(date);
	  this.lastModFileTime = dosDateTime.time;
	  this.lastModFileDate = dosDateTime.date;
	};
	Entry.prototype.setFileAttributesMode = function(mode) {
	  if ((mode & 0xffff) !== mode) throw new Error("invalid mode. expected: 0 <= " + mode + " <= " + 0xffff);
	  // http://unix.stackexchange.com/questions/14705/the-zip-formats-external-file-attribute/14727#14727
	  this.externalFileAttributes = (mode << 16) >>> 0;
	};
	// doFileDataPump() should not call pumpEntries() directly. see issue #9.
	Entry.prototype.setFileDataPumpFunction = function(doFileDataPump) {
	  this.doFileDataPump = doFileDataPump;
	  this.state = Entry.READY_TO_PUMP_FILE_DATA;
	};
	Entry.prototype.useZip64Format = function() {
	  return (
	    (this.forceZip64Format) ||
	    (this.uncompressedSize != null && this.uncompressedSize > 0xfffffffe) ||
	    (this.compressedSize != null && this.compressedSize > 0xfffffffe) ||
	    (this.relativeOffsetOfLocalHeader != null && this.relativeOffsetOfLocalHeader > 0xfffffffe)
	  );
	};
	var LOCAL_FILE_HEADER_FIXED_SIZE = 30;
	var VERSION_NEEDED_TO_EXTRACT_UTF8 = 20;
	var VERSION_NEEDED_TO_EXTRACT_ZIP64 = 45;
	// 3 = unix. 63 = spec version 6.3
	var VERSION_MADE_BY = (3 << 8) | 63;
	var FILE_NAME_IS_UTF8 = 1 << 11;
	var UNKNOWN_CRC32_AND_FILE_SIZES = 1 << 3;
	Entry.prototype.getLocalFileHeader = function() {
	  var crc32 = 0;
	  var compressedSize = 0;
	  var uncompressedSize = 0;
	  if (this.crcAndFileSizeKnown) {
	    crc32 = this.crc32;
	    compressedSize = this.compressedSize;
	    uncompressedSize = this.uncompressedSize;
	  }

	  var fixedSizeStuff = bufferAlloc(LOCAL_FILE_HEADER_FIXED_SIZE);
	  var generalPurposeBitFlag = FILE_NAME_IS_UTF8;
	  if (!this.crcAndFileSizeKnown) generalPurposeBitFlag |= UNKNOWN_CRC32_AND_FILE_SIZES;

	  // local file header signature     4 bytes  (0x04034b50)
	  fixedSizeStuff.writeUInt32LE(0x04034b50, 0);
	  // version needed to extract       2 bytes
	  fixedSizeStuff.writeUInt16LE(VERSION_NEEDED_TO_EXTRACT_UTF8, 4);
	  // general purpose bit flag        2 bytes
	  fixedSizeStuff.writeUInt16LE(generalPurposeBitFlag, 6);
	  // compression method              2 bytes
	  fixedSizeStuff.writeUInt16LE(this.getCompressionMethod(), 8);
	  // last mod file time              2 bytes
	  fixedSizeStuff.writeUInt16LE(this.lastModFileTime, 10);
	  // last mod file date              2 bytes
	  fixedSizeStuff.writeUInt16LE(this.lastModFileDate, 12);
	  // crc-32                          4 bytes
	  fixedSizeStuff.writeUInt32LE(crc32, 14);
	  // compressed size                 4 bytes
	  fixedSizeStuff.writeUInt32LE(compressedSize, 18);
	  // uncompressed size               4 bytes
	  fixedSizeStuff.writeUInt32LE(uncompressedSize, 22);
	  // file name length                2 bytes
	  fixedSizeStuff.writeUInt16LE(this.utf8FileName.length, 26);
	  // extra field length              2 bytes
	  fixedSizeStuff.writeUInt16LE(0, 28);
	  return Buffer.concat([
	    fixedSizeStuff,
	    // file name (variable size)
	    this.utf8FileName,
	    // extra field (variable size)
	    // no extra fields
	  ]);
	};
	var DATA_DESCRIPTOR_SIZE = 16;
	var ZIP64_DATA_DESCRIPTOR_SIZE = 24;
	Entry.prototype.getDataDescriptor = function() {
	  if (this.crcAndFileSizeKnown) {
	    // the Mac Archive Utility requires this not be present unless we set general purpose bit 3
	    return EMPTY_BUFFER;
	  }
	  if (!this.useZip64Format()) {
	    var buffer = bufferAlloc(DATA_DESCRIPTOR_SIZE);
	    // optional signature (required according to Archive Utility)
	    buffer.writeUInt32LE(0x08074b50, 0);
	    // crc-32                          4 bytes
	    buffer.writeUInt32LE(this.crc32, 4);
	    // compressed size                 4 bytes
	    buffer.writeUInt32LE(this.compressedSize, 8);
	    // uncompressed size               4 bytes
	    buffer.writeUInt32LE(this.uncompressedSize, 12);
	    return buffer;
	  } else {
	    // ZIP64 format
	    var buffer = bufferAlloc(ZIP64_DATA_DESCRIPTOR_SIZE);
	    // optional signature (unknown if anyone cares about this)
	    buffer.writeUInt32LE(0x08074b50, 0);
	    // crc-32                          4 bytes
	    buffer.writeUInt32LE(this.crc32, 4);
	    // compressed size                 8 bytes
	    writeUInt64LE(buffer, this.compressedSize, 8);
	    // uncompressed size               8 bytes
	    writeUInt64LE(buffer, this.uncompressedSize, 16);
	    return buffer;
	  }
	};
	var CENTRAL_DIRECTORY_RECORD_FIXED_SIZE = 46;
	var ZIP64_EXTENDED_INFORMATION_EXTRA_FIELD_SIZE = 28;
	Entry.prototype.getCentralDirectoryRecord = function() {
	  var fixedSizeStuff = bufferAlloc(CENTRAL_DIRECTORY_RECORD_FIXED_SIZE);
	  var generalPurposeBitFlag = FILE_NAME_IS_UTF8;
	  if (!this.crcAndFileSizeKnown) generalPurposeBitFlag |= UNKNOWN_CRC32_AND_FILE_SIZES;

	  var normalCompressedSize = this.compressedSize;
	  var normalUncompressedSize = this.uncompressedSize;
	  var normalRelativeOffsetOfLocalHeader = this.relativeOffsetOfLocalHeader;
	  var versionNeededToExtract;
	  var zeiefBuffer;
	  if (this.useZip64Format()) {
	    normalCompressedSize = 0xffffffff;
	    normalUncompressedSize = 0xffffffff;
	    normalRelativeOffsetOfLocalHeader = 0xffffffff;
	    versionNeededToExtract = VERSION_NEEDED_TO_EXTRACT_ZIP64;

	    // ZIP64 extended information extra field
	    zeiefBuffer = bufferAlloc(ZIP64_EXTENDED_INFORMATION_EXTRA_FIELD_SIZE);
	    // 0x0001                  2 bytes    Tag for this "extra" block type
	    zeiefBuffer.writeUInt16LE(0x0001, 0);
	    // Size                    2 bytes    Size of this "extra" block
	    zeiefBuffer.writeUInt16LE(ZIP64_EXTENDED_INFORMATION_EXTRA_FIELD_SIZE - 4, 2);
	    // Original Size           8 bytes    Original uncompressed file size
	    writeUInt64LE(zeiefBuffer, this.uncompressedSize, 4);
	    // Compressed Size         8 bytes    Size of compressed data
	    writeUInt64LE(zeiefBuffer, this.compressedSize, 12);
	    // Relative Header Offset  8 bytes    Offset of local header record
	    writeUInt64LE(zeiefBuffer, this.relativeOffsetOfLocalHeader, 20);
	    // Disk Start Number       4 bytes    Number of the disk on which this file starts
	    // (omit)
	  } else {
	    versionNeededToExtract = VERSION_NEEDED_TO_EXTRACT_UTF8;
	    zeiefBuffer = EMPTY_BUFFER;
	  }

	  // central file header signature   4 bytes  (0x02014b50)
	  fixedSizeStuff.writeUInt32LE(0x02014b50, 0);
	  // version made by                 2 bytes
	  fixedSizeStuff.writeUInt16LE(VERSION_MADE_BY, 4);
	  // version needed to extract       2 bytes
	  fixedSizeStuff.writeUInt16LE(versionNeededToExtract, 6);
	  // general purpose bit flag        2 bytes
	  fixedSizeStuff.writeUInt16LE(generalPurposeBitFlag, 8);
	  // compression method              2 bytes
	  fixedSizeStuff.writeUInt16LE(this.getCompressionMethod(), 10);
	  // last mod file time              2 bytes
	  fixedSizeStuff.writeUInt16LE(this.lastModFileTime, 12);
	  // last mod file date              2 bytes
	  fixedSizeStuff.writeUInt16LE(this.lastModFileDate, 14);
	  // crc-32                          4 bytes
	  fixedSizeStuff.writeUInt32LE(this.crc32, 16);
	  // compressed size                 4 bytes
	  fixedSizeStuff.writeUInt32LE(normalCompressedSize, 20);
	  // uncompressed size               4 bytes
	  fixedSizeStuff.writeUInt32LE(normalUncompressedSize, 24);
	  // file name length                2 bytes
	  fixedSizeStuff.writeUInt16LE(this.utf8FileName.length, 28);
	  // extra field length              2 bytes
	  fixedSizeStuff.writeUInt16LE(zeiefBuffer.length, 30);
	  // file comment length             2 bytes
	  fixedSizeStuff.writeUInt16LE(this.fileComment.length, 32);
	  // disk number start               2 bytes
	  fixedSizeStuff.writeUInt16LE(0, 34);
	  // internal file attributes        2 bytes
	  fixedSizeStuff.writeUInt16LE(0, 36);
	  // external file attributes        4 bytes
	  fixedSizeStuff.writeUInt32LE(this.externalFileAttributes, 38);
	  // relative offset of local header 4 bytes
	  fixedSizeStuff.writeUInt32LE(normalRelativeOffsetOfLocalHeader, 42);

	  return Buffer.concat([
	    fixedSizeStuff,
	    // file name (variable size)
	    this.utf8FileName,
	    // extra field (variable size)
	    zeiefBuffer,
	    // file comment (variable size)
	    this.fileComment,
	  ]);
	};
	Entry.prototype.getCompressionMethod = function() {
	  var NO_COMPRESSION = 0;
	  var DEFLATE_COMPRESSION = 8;
	  return this.compress ? DEFLATE_COMPRESSION : NO_COMPRESSION;
	};

	function dateToDosDateTime(jsDate) {
	  var date = 0;
	  date |= jsDate.getDate() & 0x1f; // 1-31
	  date |= ((jsDate.getMonth() + 1) & 0xf) << 5; // 0-11, 1-12
	  date |= ((jsDate.getFullYear() - 1980) & 0x7f) << 9; // 0-128, 1980-2108

	  var time = 0;
	  time |= Math.floor(jsDate.getSeconds() / 2); // 0-59, 0-29 (lose odd numbers)
	  time |= (jsDate.getMinutes() & 0x3f) << 5; // 0-59
	  time |= (jsDate.getHours() & 0x1f) << 11; // 0-23

	  return {date: date, time: time};
	}

	function writeUInt64LE(buffer, n, offset) {
	  // can't use bitshift here, because JavaScript only allows bitshifting on 32-bit integers.
	  var high = Math.floor(n / 0x100000000);
	  var low = n % 0x100000000;
	  buffer.writeUInt32LE(low, offset);
	  buffer.writeUInt32LE(high, offset + 4);
	}

	util.inherits(ByteCounter, Transform);
	function ByteCounter(options) {
	  Transform.call(this, options);
	  this.byteCount = 0;
	}
	ByteCounter.prototype._transform = function(chunk, encoding, cb) {
	  this.byteCount += chunk.length;
	  cb(null, chunk);
	};

	util.inherits(Crc32Watcher, Transform);
	function Crc32Watcher(options) {
	  Transform.call(this, options);
	  this.crc32 = 0;
	}
	Crc32Watcher.prototype._transform = function(chunk, encoding, cb) {
	  this.crc32 = crc32.unsigned(chunk, this.crc32);
	  cb(null, chunk);
	};

	var cp437 = '\u0000☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼ !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~⌂ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
	if (cp437.length !== 256) throw new Error("assertion failure");
	var reverseCp437 = null;

	function encodeCp437(string) {
	  if (/^[\x20-\x7e]*$/.test(string)) {
	    // CP437, ASCII, and UTF-8 overlap in this range.
	    return bufferFrom(string, "utf-8");
	  }

	  // This is the slow path.
	  if (reverseCp437 == null) {
	    // cache this once
	    reverseCp437 = {};
	    for (var i = 0; i < cp437.length; i++) {
	      reverseCp437[cp437[i]] = i;
	    }
	  }

	  var result = bufferAlloc(string.length);
	  for (var i = 0; i < string.length; i++) {
	    var b = reverseCp437[string[i]];
	    if (b == null) throw new Error("character not encodable in CP437: " + JSON.stringify(string[i]));
	    result[i] = b;
	  }

	  return result;
	}

	function bufferAlloc(size) {
	  bufferAlloc = modern;
	  try {
	    return bufferAlloc(size);
	  } catch (e) {
	    bufferAlloc = legacy;
	    return bufferAlloc(size);
	  }
	  function modern(size) {
	    return Buffer.allocUnsafe(size);
	  }
	  function legacy(size) {
	    return new Buffer(size);
	  }
	}
	function bufferFrom(something, encoding) {
	  bufferFrom = modern;
	  try {
	    return bufferFrom(something, encoding);
	  } catch (e) {
	    bufferFrom = legacy;
	    return bufferFrom(something, encoding);
	  }
	  function modern(something, encoding) {
	    return Buffer.from(something, encoding);
	  }
	  function legacy(something, encoding) {
	    return new Buffer(something, encoding);
	  }
	}
	function bufferIncludes(buffer, content) {
	  bufferIncludes = modern;
	  try {
	    return bufferIncludes(buffer, content);
	  } catch (e) {
	    bufferIncludes = legacy;
	    return bufferIncludes(buffer, content);
	  }
	  function modern(buffer, content) {
	    return buffer.includes(content);
	  }
	  function legacy(buffer, content) {
	    for (var i = 0; i <= buffer.length - content.length; i++) {
	      for (var j = 0;; j++) {
	        if (j === content.length) return true;
	        if (buffer[i + j] !== content[j]) break;
	      }
	    }
	    return false;
	  }
	}
	return yazl;
}

var yazlExports = requireYazl();
const index$2 = /*@__PURE__*/getDefaultExportFromCjs(yazlExports);

const index$3 = /*#__PURE__*/_mergeNamespaces({
	__proto__: null,
	default: index$2
}, [yazlExports]);

var yauzlExports = requireYauzl();
const index = /*@__PURE__*/getDefaultExportFromCjs(yauzlExports);

const index$1 = /*#__PURE__*/_mergeNamespaces({
	__proto__: null,
	default: index
}, [yauzlExports]);

const extractZip = requireExtractZip();
const extract = extractZip;

export { extract, index$1 as yauzl, index$3 as yazl };
