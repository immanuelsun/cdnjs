// Packaging/modules magic dance. This code is inserted before all other
// code when the dist is built.
(function (factory) {
    var L;
    if (typeof define === 'function' && define.amd) {
        // AMD
        define(['leaflet'], factory);
    } else if (typeof module !== 'undefined') {
        // Node/CommonJS
        L = require('leaflet');
        module.exports = factory(L);
    } else {
        // Browser globals
        if (typeof window.L === 'undefined')
            throw 'Leaflet must be loaded first';
        factory(window.L);
    }
}(function (L) {
(function() {
	'use strict';

	L.Routing = L.Routing || {};

	L.Routing.Autocomplete = L.Class.extend({
		options: {
			timeout: 500
		},

		initialize: function(elem, callback, context, options) {
			L.setOptions(this, options);

			this._elem = elem;
			this._resultFn = options.resultFn ? L.Util.bind(options.resultFn, options.resultContext) : null;
			this._autocomplete = options.autocompleteFn ? L.Util.bind(options.autocompleteFn, options.autocompleteContext) : null;
			this._selectFn = L.Util.bind(callback, context);
			this._container = L.DomUtil.create('div', 'leaflet-routing-geocoder-result');
			this._resultTable = L.DomUtil.create('table', '', this._container);

			L.DomEvent.addListener(this._elem, 'keypress', this._keyPressed, this);
			L.DomEvent.addListener(this._elem, 'keydown', this._keyDown, this);
			L.DomEvent.addListener(this._elem, 'blur', function() {
				if (this._isOpen) {
					// TODO: setTimeout here looks like a hack, but is needed
					// to get click events to fire before hiding the container.
					setTimeout(L.Util.bind(function() { this.close(); }, this), 100);
				}
			}, this);
		},

		close: function() {
			L.DomUtil.removeClass(this._container, 'leaflet-routing-geocoder-result-open');
			this._isOpen = false;
		},

		_open: function() {
			var sibling = this._elem.nextSibling;
			if (!this._container.parentElement) {
				if (sibling) {
					this._elem.parentElement.insertBefore(this._container, sibling);
				} else {
					this._elem.parentElement.appendChild(this._container);
				}
				this._container.style.left = this._elem.offsetLeft + 'px';
				this._container.style.top = (this._elem.offsetTop + this._elem.offsetHeight) + 'px';
				this._container.style.width = this._elem.offsetWidth + 'px';
			}

			L.DomUtil.addClass(this._container, 'leaflet-routing-geocoder-result-open');
			this._isOpen = true;
		},

		_setResults: function(results) {
			var i,
			    tr,
			    td;

			delete this._selection;
			this._results = results;

			while (this._resultTable.firstChild) {
				this._resultTable.removeChild(this._resultTable.firstChild);
			}

			for (i = 0; i < results.length; i++) {
				tr = L.DomUtil.create('tr', '', this._resultTable);
				tr.setAttribute('data-result-index', i);
				td = L.DomUtil.create('td', '', tr);
				td.textContent = results[i].name;
				L.DomEvent.addListener(td, 'click', this._resultSelected(results[i]), this);
			}

			if (results.length > 0) {
				this._open();
				// Select the first entry
				this._select(1);
			}
		},

		_resultSelected: function(r) {
			return function() {
				this.close();
				this._selectFn(r);
			};
		},

		_keyPressed: function(e) {
			var index;

			if (this._isOpen && e.keyCode === 13 && this._selection) {
				index = parseInt(this._selection.getAttribute('data-result-index'), 10);
				this._resultSelected(this._results[index]).call(this);
				L.DomEvent.preventDefault(e);
				return;
			}

			if (e.keyCode === 13) {
				this._complete(this._resultFn, true);
			}

			if (this._autocomplete) {
				if (this._timer) {
					clearTimeout(this._timer);
				}
				this._timer = setTimeout(L.Util.bind(function() { this._complete(this._autocomplete); }, this),
					this.options.timeout);
			}
		},

		_select: function(dir) {
			var sel = this._selection;
			if (sel) {
				L.DomUtil.removeClass(sel.firstChild, 'leaflet-routing-geocoder-selected');
				sel = sel[dir > 0 ? 'nextSibling' : 'previousSibling'];
			}
			if (!sel) {
				sel = this._resultTable[dir > 0 ? 'firstChild' : 'lastChild'];
			}

			if (sel) {
				L.DomUtil.addClass(sel.firstChild, 'leaflet-routing-geocoder-selected');
				this._selection = sel;
			}
		},

		_keyDown: function(e) {
			if (this._isOpen) {
				switch (e.keyCode) {
				// Up
				case 38:
					this._select(-1);
					L.DomEvent.preventDefault(e);
					return;
				// Up
				case 40:
					this._select(1);
					L.DomEvent.preventDefault(e);
					return;
				}
			}
		},

		_complete: function(completeFn, trySelect) {
			completeFn(this._elem.value, function(results) {
				if (trySelect && results.length === 1) {
					this._resultSelected(results[0]);
				} else {
					this._setResults(results);
				}
			}, this);
		}
	});
})();
(function() {
	'use strict';

	L.Routing = L.Routing || {};

	L.Routing._jsonpCallbackId = 0;
	L.Routing._jsonp = function(url, callback, context, jsonpParam) {
		var callbackId = '_l_routing_machine_' + (L.Routing._jsonpCallbackId++),
		    script;
		url += '&' + jsonpParam + '=' + callbackId;
		window[callbackId] = L.Util.bind(callback, context);
		script = document.createElement('script');
		script.type = 'text/javascript';
		script.src = url;
		script.id = callbackId;
		document.getElementsByTagName('head')[0].appendChild(script);
	};

	L.Routing.OSRM = L.Class.extend({
		options: {
			serviceUrl: '//router.project-osrm.org/viaroute',
			geometryPrecision: 6
		},

		initialize: function(options) {
			L.Util.setOptions(this, options);
			this._hints = {
				locations: {}
			};
		},

		route: function(waypoints, callback, context) {
			var url = this._buildRouteUrl(waypoints);

			L.Routing._jsonp(url, function(data) {
				this._routeDone(data, waypoints, callback, context);
			}, this, 'jsonp');
		},

		_routeDone: function(response, waypoints, callback, context) {
			context = context || callback;
			if (response.status !== 0) {
				callback.call(context, {
					status: response.status,
					message: response.message
				});
				return;
			}

			var alts = [{
					name: response.route_name.join(', '),
					coordinates: this._decode(response.route_geometry, this.options.geometryPrecision),
					instructions: this._convertInstructions(response.route_instructions),
					summary: this._convertSummary(response.route_summary),
					waypoints: response.via_points
				}],
			    i;

		    if (response.alternative_geometries) {
				for (i = 0; i < response.alternative_geometries.length; i++) {
					alts.push({
						name: response.alternative_names[i].join(', '),
						coordinates: this._decode(response.alternative_geometries[i], this.options.geometryPrecision),
						instructions: this._convertInstructions(response.alternative_instructions[i]),
						summary: this._convertSummary(response.alternative_summaries[i]),
						waypoints: response.via_points
					});
				}
		    }

			this._saveHintData(response, waypoints);
			callback.call(context, null, alts);
		},

		_buildRouteUrl: function(waypoints) {
			var locs = [],
			    locationKey,
			    hint;

			for (var i = 0; i < waypoints.length; i++) {
				locationKey = this._locationKey(waypoints[i].latLng);
				locs.push('loc=' + locationKey);

				hint = this._hints.locations[locationKey];
				if (hint) {
					locs.push('hint=' + hint);
				}
			}

			return this.options.serviceUrl + '?' +
				'instructions=true&' +
				locs.join('&') +
				(this._hints.checksum !== undefined ? '&checksum=' + this._hints.checksum : '');
		},

		_locationKey: function(location) {
			return location.lat + ',' + location.lng;
		},

		_saveHintData: function(route, waypoints) {
			var hintData = route.hint_data,
			    loc;
			this._hints = {
				checksum: hintData.checksum,
				locations: {}
			};
			for (var i = hintData.locations.length - 1; i >= 0; i--) {
				loc = waypoints[i].latLng;
				this._hints.locations[this._locationKey(loc)] = hintData.locations[i];
			}
		},

		// Adapted from
		// https://github.com/DennisSchiefer/Project-OSRM-Web/blob/develop/WebContent/routing/OSRM.RoutingGeometry.js
		_decode: function(encoded, precision) {
			var len = encoded.length,
			    index=0,
			    lat=0,
			    lng = 0,
			    array = [];

			precision = Math.pow(10, -precision);

			while (index < len) {
				var b,
				    shift = 0,
				    result = 0;
				do {
					b = encoded.charCodeAt(index++) - 63;
					result |= (b & 0x1f) << shift;
					shift += 5;
				} while (b >= 0x20);
				var dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
				lat += dlat;
				shift = 0;
				result = 0;
				do {
					b = encoded.charCodeAt(index++) - 63;
					result |= (b & 0x1f) << shift;
					shift += 5;
				} while (b >= 0x20);
				var dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
				lng += dlng;
				//array.push( {lat: lat * precision, lng: lng * precision} );
				array.push( [lat * precision, lng * precision] );
			}
			return array;
		},

		_convertSummary: function(osrmSummary) {
			return {
				totalDistance: osrmSummary.total_distance,
				totalTime: osrmSummary.total_time
			};
		},

		_convertInstructions: function(osrmInstructions) {
			var result = [],
			    i,
			    instr,
			    type,
			    driveDir;

			for (i = 0; i < osrmInstructions.length; i++) {
				instr = osrmInstructions[i];
				type = this._drivingDirectionType(instr[0]);
				driveDir = instr[0].split('-');
				if (type) {
					result.push({
						type: type,
						distance: instr[2],
						time: instr[4],
						road: instr[1],
						direction: instr[6],
						exit: driveDir.length > 1 ? driveDir[1] : undefined,
						index: instr[3]
					});
				}
			}

			return result;
		},

		_drivingDirectionType: function(d) {
			switch (parseInt(d, 10)) {
			case 1:
				return 'Straight';
			case 2:
				return 'SlightRight';
			case 3:
				return 'Right';
			case 4:
				return 'SharpRight';
			case 5:
				return 'TurnAround';
			case 6:
				return 'SharpLeft';
			case 7:
				return 'Left';
			case 8:
				return 'SlightRight';
			case 9:
				return 'WaypointReached';
			case 10:
				// TODO: "Head on"
				// https://github.com/DennisOSRM/Project-OSRM/blob/master/DataStructures/TurnInstructions.h#L48
				return 'Straight';
			case 11:
			case 12:
				return 'Roundabout';
			case 15:
				return 'DestinationReached';
			default:
				return null;
			}
		}
	});

	L.Routing.osrm = function(options) {
		return new L.Routing.OSRM(options);
	};
})();
(function() {
	'use strict';

	L.Routing = L.Routing || {};

	L.Routing.Line = L.Class.extend({
		includes: L.Mixin.Events,

		options: {
			styles: [
				{color: 'black', opacity: 0.15, weight: 7},
				{color: 'white', opacity: 0.8, weight: 4},
				{color: 'orange', opacity: 1, weight: 2}
			],
			addWaypoints: true
		},

		initialize: function(route, options) {
			L.Util.setOptions(this, options);
			this._route = route;

			this._wpIndices = this._findWaypointIndices();
		},

		addTo: function(map) {
			map.addLayer(this);
		},

		onAdd: function(map) {
			var geom = this._route.coordinates,
			    i,
			    pl;

			this._map = map;
			this._layers = [];
			for (i = 0; i < this.options.styles.length; i++) {
				pl = L.polyline(geom, this.options.styles[i])
					.addTo(map);
				if (this.options.addWaypoints) {
					pl.on('mousedown', this._onLineTouched, this);
				}
				this._layers.push(pl);
			}
		},

		onRemove: function(map) {
			var i;
			for (i = 0; i < this._layers.length; i++) {
				map.removeLayer(this._layers[i]);
			}

			delete this._map;
		},

		getBounds: function() {
			return L.latLngBounds(this._route.coordinates);
		},

		_findWaypointIndices: function() {
			var wps = this._route.waypoints,
			    indices = [],
			    i;
			for (i = 0; i < wps.length; i++) {
				indices.push(this._findClosestRoutePoint(L.latLng(wps[i])));
			}

			return indices;
		},

		_findClosestRoutePoint: function(latlng) {
			var minDist = Number.MAX_VALUE,
				minIndex,
			    i,
			    d;

			for (i = this._route.coordinates.length - 1; i >= 0 ; i--) {
				// TODO: maybe do this in pixel space instead?
				d = latlng.distanceTo(this._route.coordinates[i]);
				if (d < minDist) {
					minIndex = i;
					minDist = d;
				}
			}

			return minIndex;
		},

		_findNearestWpBefore: function(i) {
			var j = this._wpIndices.length - 1;
			while (j >= 0 && this._wpIndices[j] > i) {
				j--;
			}

			return j;
		},

		_onLineTouched: function(e) {
			var afterIndex = this._findNearestWpBefore(this._findClosestRoutePoint(e.latlng));
			this.fire('linetouched', {
				afterIndex: afterIndex,
				latlng: e.latlng
			});
		},
	});

	L.Routing.line = function(route, options) {
		return new L.Routing.Line(route, options);
	};
})();
(function() {
	'use strict';

	L.Routing = L.Routing || {};

	L.Routing.Itinerary = L.Control.extend({
		includes: L.Mixin.Events,

		options: {
			units: 'metric',
			pointMarkerStyle: {
				radius: 5,
				color: '#03f',
				fillColor: 'white',
				opacity: 1,
				fillOpacity: 0.7
			}
		},

		initialize: function(options) {
			L.setOptions(this, options);
		},

		onAdd: function() {
			this._container = L.DomUtil.create('div', 'leaflet-routing-container leaflet-bar');
			L.DomEvent.disableClickPropagation(this._container);
			L.DomEvent.addListener(this._container, 'mousewheel', function(e) {
				L.DomEvent.stopPropagation(e);
			});
			return this._container;
		},

		onRemove: function() {
		},

		setAlternatives: function(routes) {
			var i,
			    alt,
			    altDiv;

			this._clearAlts();

			this._routes = routes;

			for (i = 0; i < this._routes.length; i++) {
				alt = this._routes[i];
				altDiv = L.DomUtil.create('div', 'leaflet-routing-alt' +
					(i > 0 ? ' leaflet-routing-alt-minimized' : ''),
					this._container);
				altDiv.innerHTML = '<h2>' + alt.name + '</h2>' +
					'<h3>' + this._formatDistance(alt.summary.totalDistance) +
					', ' + this._formatTime(alt.summary.totalTime) + '</h3>';
				L.DomEvent.addListener(altDiv, 'click', this._onAltClicked, this);

				altDiv.appendChild(this._createItineraryTable(alt));
				this._altElements.push(altDiv);
			}

			this.fire('routeselected', {route: this._routes[0]});
		},

		_clearAlts: function() {
			var i,
				alt;
			// TODO: this is really inelegant
			for (i = 0; this._container && i < this._container.children.length; i++) {
				alt = this._container.children[i];
				if (L.DomUtil.hasClass(alt, 'leaflet-routing-alt')) {
					this._container.removeChild(alt);
					i--;
				}
			}

			this._altElements = [];
		},

		_createItineraryTable: function(r) {
			var table = L.DomUtil.create('table', ''),
			    body = L.DomUtil.create('tbody', '', table),
			    i,
			    instr,
			    row,
			    td;

			for (i = 0; i < r.instructions.length; i++) {
				instr = r.instructions[i];
				row = L.DomUtil.create('tr', '', body);
				td = L.DomUtil.create('td', '', row);
				td.appendChild(document.createTextNode(this._instruction(instr, i)));
				td = L.DomUtil.create('td', '', row);
				td.appendChild(document.createTextNode(this._formatDistance(instr.distance)));
				this._addRowListeners(row, r.coordinates[instr.index]);
			}

			return table;
		},

		_addRowListeners: function(row, coordinate) {
			var _this = this,
			    marker;
			L.DomEvent.addListener(row, 'mouseover', function() {
				marker = L.circleMarker(coordinate,
					_this.options.pointMarkerStyle).addTo(_this._map);
			});
			L.DomEvent.addListener(row, 'mouseout', function() {
				if (marker) {
					_this._map.removeLayer(marker);
					marker = null;
				}
			});
			L.DomEvent.addListener(row, 'click', function(e) {
				_this._map.panTo(coordinate);
				L.DomEvent.stopPropagation(e);
			});
		},

		_onAltClicked: function(e) {
			var altElem,
			    j,
			    n,
			    isCurrentSelection;

			altElem = e.target;
			while (!L.DomUtil.hasClass(altElem, 'leaflet-routing-alt')) {
				altElem = altElem.parentElement;
			}

			if (L.DomUtil.hasClass(altElem, 'leaflet-routing-alt-minimized')) {
				for (j = 0; j < this._altElements.length; j++) {
					n = this._altElements[j];
					isCurrentSelection = altElem === n;
					L.DomUtil[isCurrentSelection ? 'removeClass' : 'addClass'](n, 'leaflet-routing-alt-minimized');

					if (isCurrentSelection) {
						// TODO: don't fire if the currently active is clicked
						this.fire('routeselected', {route: this._routes[j]});
					}
				}
			}

			L.DomEvent.stop(e);
		},

		_formatDistance: function(d /* Number (meters) */) {
			var v;

			if (this.options.units === 'imperial') {
				d = d / 1.609344;
				if (d >= 1000) {
					return (this._round(d) / 1000) + ' mi';
				} else {
					return this._round(d / 1.760) + ' yd';
				}
			} else {
				v = this._round(d);
				return v >= 1000 ? ((v / 1000) + ' km') : (v + ' m');
			}
		},

		_round: function(d) {
			var pow10 = Math.pow(10, (Math.floor(d) + '').length - 1),
				r = Math.floor(d / pow10 * 2),
				p = r % 2 ? pow10 / 2 : pow10;

			return Math.round(d / p) * p;
		},

		_formatTime: function(t /* Number (seconds) */) {
			if (t > 86400) {
				return Math.round(t / 3600) + ' h';
			} else if (t > 3600) {
				return Math.floor(t / 3600) + ' h ' +
					Math.round((t % 3600) / 60) + ' min';
			} else if (t > 300) {
				return Math.round(t / 60) + ' min';
			} else if (t > 60) {
				return Math.floor(t / 60) + ' min ' +
					(t % 60) + ' s';
			} else {
				return t + ' s';
			}
		},

		_instruction: function(instr, i) {
			if (instr.type !== undefined) {
				return L.Util.template(this._getInstructionTemplate(instr, i),
					L.extend({exit: this._formatOrder(instr.exit), dir: this._dir[instr.direction]},
						instr));
			} else {
				return instr.text;
			}
		},

		_getInstructionTemplate: function(instr, i) {
			switch (instr.type) {
			case 'Straight':
				return (i === 0 ? 'Head' : 'Continue') + ' {dir}' + (instr.road ? ' on {road}' : '');
			case 'SlightRight':
				return 'Slight right' + (instr.road ? ' onto {road}' : '');
			case 'Right':
				return 'Right' + (instr.road ? ' onto {road}' : '');
			case 'SharpRight':
				return 'Sharp right' + (instr.road ? ' onto {road}' : '');
			case 'TurnAround':
				return 'Turn around';
			case 'SharpLeft':
				return 'Sharp left' + (instr.road ? ' onto {road}' : '');
			case 'Left':
				return 'Left' + (instr.road ? ' onto {road}' : '');
			case 'SlightLeft':
				return 'Slight left' + (instr.road ? ' onto {road}' : '');
			case 'WaypointReached':
				return 'Waypoint reached';
			case 'Roundabout':
				return  'Take the {exit} exit in the roundabout';
			case 'DestinationReached':
				return  'Destination reached';
			}
		},

		_formatOrder: function(n) {
			var i = n % 10 - 1,
				suffix = ['st', 'nd', 'rd'];

			return suffix[i] ? n + suffix[i] : n + 'th';
		},

		_dir: {
			N: 'north',
			NE: 'northeast',
			E: 'east',
			SE: 'southeast',
			S: 'south',
			SW: 'southwest',
			W: 'west',
			NW: 'northwest'
		}
	});

	L.Routing.Itinerary._instructions = {
	};

	L.Routing.itinerary = function(router) {
		return new L.Routing.Itinerary(router);
	};
})();
(function() {
	'use strict';

	var Waypoint = L.Class.extend({
			initialize: function(latLng, name) {
				this.latLng = latLng;
				this.name = name;
			}
		});

	L.Routing = L.Routing || {};

	L.Routing.Plan = L.Class.extend({
		includes: L.Mixin.Events,

		options: {
			dragStyles: [
				{color: 'black', opacity: 0.15, weight: 7},
				{color: 'white', opacity: 0.8, weight: 4},
				{color: 'orange', opacity: 1, weight: 2, dashArray: '7,12'}
			],
			draggableWaypoints: true,
			addWaypoints: true
		},

		initialize: function(waypoints, options) {
			L.Util.setOptions(this, options);
			this._waypoints = [];
			this.setWaypoints(waypoints);
		},

		isReady: function() {
			var i;
			for (i = 0; i < this._waypoints.length; i++) {
				if (!this._waypoints[i].latLng) {
					return false;
				}
			}

			return true;
		},

		getWaypoints: function() {
			var i,
				wps = [];

			for (i = 0; i < this._waypoints.length; i++) {
				wps.push(this._waypoints[i]);
			}

			return wps;
		},

		setWaypoints: function(waypoints) {
			var args = [0, this._waypoints.length].concat(waypoints);
			this.spliceWaypoints.apply(this, args);
		},

		spliceWaypoints: function() {
			var args = [arguments[0], arguments[1]],
			    i,
			    wp;

			for (i = 2; i < arguments.length; i++) {
				args.push(arguments[i] && arguments[i].latLng ? arguments[i] : new Waypoint(arguments[i]));
			}

			[].splice.apply(this._waypoints, args);

			while (this._waypoints.length < 2) {
				wp = new Waypoint();
				this._waypoints.push(wp);
				args.push(wp);
			}

			this._updateMarkers();
			this._fireChanged.apply(this, args);
		},

		onAdd: function(map) {
			this._map = map;
			this._updateMarkers();
		},

		onRemove: function() {
			var i;
			this._removeMarkers();

			if (this._newWp) {
				for (i = 0; i < this._newWp.lines.length; i++) {
					this._map.removeLayer(this._newWp.lines[i]);
				}
			}

			delete this._map;
		},

		createGeocoders: function() {
			var container = L.DomUtil.create('div', 'leaflet-routing-geocoders'),
				waypoints = this._waypoints,
			    i,
			    geocoderElem,
			    addWpBtn;

			this._geocoderContainer = container;
			this._geocoderElems = [];

			for (i = 0; i < waypoints.length; i++) {
				geocoderElem = this._createGeocoder(i);
				container.appendChild(geocoderElem);
				this._geocoderElems.push(geocoderElem);
			}

			addWpBtn = L.DomUtil.create('button', '', container);
			addWpBtn.setAttribute('type', 'button');
			addWpBtn.innerHTML = '+';
			L.DomEvent.addListener(addWpBtn, 'click', function() {
				this.spliceWaypoints(waypoints.length, 0, null);
			}, this);

			this.on('waypointsspliced', this._updateGeocoders);

			return container;
		},

		_createGeocoder: function(i) {
			var geocoderElem;

			geocoderElem = L.DomUtil.create('input', '');
			geocoderElem.placeholder = this._geocoderPlaceholder(i);

			this._updateWaypointName(i);

			L.DomEvent.addListener(geocoderElem, 'click', function() {
				this.select();
			}, geocoderElem);

			new L.Routing.Autocomplete(geocoderElem, function(r) {
					geocoderElem.value = r.name;
					this._waypoints[i].name = r.name;
					this._waypoints[i].latLng = r.center;
					this._updateMarkers();
					this._fireChanged();
				}, this, {
					resultFn: this.options.geocoder.geocode,
					resultContext: this.options.geocoder,
					autocompleteFn: this.options.geocoder.suggest,
					autocompleteContext: this.options.geocoder
				});

			return geocoderElem;
		},

		_updateGeocoders: function(e) {
			var newElems = [],
			    i,
			    geocoderElem,
			    beforeElem;
			for (i = e.added.length - 1; i >= 0 ; i--) {
				geocoderElem = this._createGeocoder(e.index + i);
				if (e.index >= this._geocoderElems.length) {
					// lastChild is the "add new wp" button
					beforeElem = this._geocoderContainer.lastChild;
				} else {
					beforeElem = this._geocoderElems[e.index];
				}
				this._geocoderContainer.insertBefore(geocoderElem, beforeElem);
				newElems.push(geocoderElem);
			}
			newElems.reverse();

			for (i = e.index; i < e.index + e.nRemoved; i++) {
				this._geocoderContainer.removeChild(this._geocoderElems[i]);
			}

			newElems.splice(0, 0, e.index, e.nRemoved);
			[].splice.apply(this._geocoderElems, newElems);

			for (i = 0; i < this._geocoderElems.length; i++) {
				this._geocoderElems[i].placeholder = this._geocoderPlaceholder(i);
			}
		},

		_geocoderPlaceholder: function(i) {
			return i === 0 ?
				'Start' :
				(i < this._geocoderElems.length - 1 ?
								'Via ' + i :
								'End');
		},

		_updateWaypointName: function(i, force) {
			var wp = this._waypoints[i];

			function updateGeocoder() {
				var value = wp && wp.name ? wp.name : '';
				if (this._geocoderElems[i]) {
					this._geocoderElems[i].value = value;
				}
			}

			if (wp.latLng && (force || !wp.name)) {
				if (this.options.geocoder && this.options.geocoder.reverse) {
					this.options.geocoder.reverse(wp.latLng, 67108864 /* zoom 18 */, function(rs) {
						if (rs.length > 0 && rs[0].center.distanceTo(wp.latLng) < 200) {
							wp.name = rs[0].name;
						} else {
							wp.name = '';
						}
						updateGeocoder.call(this);
					}, this);
				} else {
					wp.name = '';
				}

				updateGeocoder.call(this);
			}
		},

		_removeMarkers: function() {
			var i;
			if (this._markers) {
				for (i = 0; i < this._markers.length; i++) {
					if (this._markers[i]) {
						this._map.removeLayer(this._markers[i]);
					}
				}
			}
			this._markers = [];
		},

		_updateMarkers: function() {
			var i,
			    icon,
			    options,
			    m;

			if (!this._map) {
				return;
			}

			this._removeMarkers();

			for (i = 0; i < this._waypoints.length; i++) {
				if (this._waypoints[i].latLng) {
					icon = (typeof(this.options.waypointIcon) === 'function') ?
						this.options.waypointIcon(i, this._waypoints[i].name, this._waypoints.length) :
						this.options.waypointIcon;
					options = {
						draggable: true
					};
					if (icon) {
						options.icon = icon;
					}

					m = L.marker(this._waypoints[i].latLng, options).addTo(this._map);
					if (this.options.draggableWaypoints) {
						this._hookWaypointEvents(m, i);
					}
				} else {
					m = null;
				}
				this._markers.push(m);
			}
		},

		_fireChanged: function() {
			this.fire('waypointschanged', {waypoints: this.getWaypoints()});

			if (arguments.length >= 2) {
				this.fire('waypointsspliced', {
					index: Array.prototype.shift.call(arguments),
					nRemoved: Array.prototype.shift.call(arguments),
					added: arguments
				});
			}
		},

		_hookWaypointEvents: function(m, i) {
			m.on('dragstart', function(e) {
				this.fire('waypointdragstart', this._createWaypointEvent(i, e));
			}, this);
			m.on('drag', function(e) {
				this.fire('waypointdrag', this._createWaypointEvent(i, e));
			}, this);
			m.on('dragend', function(e) {
				this.fire('waypointdragend', this._createWaypointEvent(i, e));
				this._waypoints[i].latLng = e.target.getLatLng();
				this._waypoints[i].name = '';
				this._updateWaypointName(i, true);
				this._fireChanged();
			}, this);
		},

		_createWaypointEvent: function(i, e) {
			return {index: i, latlng: e.target.getLatLng()};
		},

		dragNewWaypoint: function(e) {
			var i;
			this._newWp = {
				afterIndex: e.afterIndex,
				marker: L.marker(e.latlng).addTo(this._map),
				lines: []
			};

			for (i = 0; i < this.options.dragStyles.length; i++) {
				this._newWp.lines.push(L.polyline([
					this._waypoints[e.afterIndex].latLng,
					e.latlng,
					this._waypoints[e.afterIndex + 1].latLng
				], this.options.dragStyles[i]).addTo(this._map));
			}

			this._markers.splice(e.afterIndex + 1, 0, this._newWp.marker);
			this._map.on('mousemove', this._onDragNewWp, this);
			this._map.on('mouseup', this._onWpRelease, this);
		},

		_onDragNewWp: function(e) {
			var i;
			this._newWp.marker.setLatLng(e.latlng);
			for (i = 0; i < this._newWp.lines.length; i++) {
				this._newWp.lines[i].spliceLatLngs(1, 1, e.latlng);
			}
		},

		_onWpRelease: function(e) {
			var i;
			this._map.off('mouseup', this._onWpRelease, this);
			this._map.off('mousemove', this._onDragNewWp, this);
			for (i = 0; i < this._newWp.lines.length; i++) {
				this._map.removeLayer(this._newWp.lines[i]);
			}
			this.spliceWaypoints(this._newWp.afterIndex + 1, 0, e.latlng);
			delete this._newWp;
		}
	});

	L.Routing.plan = function(waypoints, options) {
		return new L.Routing.Plan(waypoints, options);
	};
})();
(function() {
	'use strict';

	L.Routing.Control = L.Routing.Itinerary.extend({
		options: {
			fitSelectedRoutes: true
		},

		initialize: function(options) {
			L.Util.setOptions(this, options);

			this._router = this.options.router || new L.Routing.OSRM();
			this._plan = this.options.plan || L.Routing.plan(undefined, { geocoder: this.options.geocoder });
			if (this.options.geocoder) {
				this._plan.options.geocoder = this.options.geocoder;
			}
			if (this.options.waypoints) {
				this._plan.setWaypoints(this.options.waypoints);
			}

			L.Routing.Itinerary.prototype.initialize.call(this, options);

			this.on('routeselected', this._routeSelected, this);
			this._plan.on('waypointschanged', this._route, this);

			this._route();
		},

		onAdd: function(map) {
			var container = L.Routing.Itinerary.prototype.onAdd.call(this, map);

			this._map = map;
			this._map.addLayer(this._plan);

			if (this.options.geocoder) {
				container.insertBefore(this._plan.createGeocoders(), container.firstChild);
			}

			return container;
		},

		onRemove: function(map) {
			if (this._line) {
				map.removeLayer(this._line);
			}
			map.removeLayer(this._plan);
			return L.Routing.Itinerary.prototype.onRemove.call(this, map);
		},

		getWaypoints: function() {
			return this._plan.getWaypoints();
		},

		setWaypoints: function(waypoints) {
			this._plan.setWaypoints(waypoints);
		},

		spliceWaypoints: function() {
			var removed = this._plan.spliceWaypoints.apply(this._plan, arguments);
			return removed;
		},

		getPlan: function() {
			return this._plan;
		},

		_routeSelected: function(e) {
			var route = e.route;
			this._clearLine();

			this._line = L.Routing.line(route, this.options.lineOptions);
			this._line.addTo(this._map);
			this._hookEvents(this._line);

			if (this.options.fitSelectedRoutes) {
				this._map.fitBounds(this._line.getBounds());
			}
		},

		_hookEvents: function(l) {
			l.on('linetouched', function(e) {
				this._plan.dragNewWaypoint(e);
			}, this);
		},

		_route: function() {
			this._clearLine();
			this._clearAlts();
			if (this._plan.isReady()) {
				this._router.route(this._plan.getWaypoints(), function(err, routes) {
					if (err) {
						console.log(err);
						return;
					}
					this.setAlternatives(routes);
				}, this);
			}
		},

		_clearLine: function() {
			if (this._line) {
				this._map.removeLayer(this._line);
				delete this._line;
			}
		}
	});

	L.Routing.control = function(options) {
		return new L.Routing.Control(options);
	};
})();
    return L.Routing;
}));
// Packaging/modules magic dance end. This code is inserted after all other
// code when the dist is built.
