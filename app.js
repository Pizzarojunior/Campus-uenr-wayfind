import { bounds, destinations, roads } from './campus-data.js';

const svgNamespace = 'http://www.w3.org/2000/svg';
const map = document.querySelector('#campusMap');
const roadLayer = document.querySelector('#roadLayer');
const routeLayer = document.querySelector('#routeLayer');
const routeSignLayer = document.querySelector('#routeSignLayer');
const destinationLayer = document.querySelector('#destinationLayer');
const userLayer = document.querySelector('#userLayer');
const placeList = document.querySelector('#placeList');
const photoButton = document.querySelector('#photoButton');
const photoDialog = document.querySelector('#photoDialog');
const photoImage = document.querySelector('#campusPhoto');
const photoUnavailable = document.querySelector('#photoUnavailable');
const photoCaption = document.querySelector('#photoCaption');
const photoSource = document.querySelector('#photoSource');
const photoCount = document.querySelector('#photoCount');
const searchInput = document.querySelector('#destinationSearch');
const networkStatus = document.querySelector('#networkStatus');
const networkLabel = document.querySelector('#networkLabel');
const locationLabel = document.querySelector('#locationLabel');
const mapHint = document.querySelector('#mapHint');
const toast = document.querySelector('#toast');
const routeTitle = document.querySelector('#routeTitle');
const routeMeta = document.querySelector('#routeMeta');
const turnInstruction = document.querySelector('#turnInstruction');
const routeCaveat = document.querySelector('#routeCaveat');
const aiSummary = document.querySelector('#aiSummary');
const directionList = document.querySelector('#directionList');
const placeCount = document.querySelector('#placeCount');
const locateButton = document.querySelector('#locateButton');
const startPointButton = document.querySelector('#startPointButton');
const followLocationButton = document.querySelector('#followLocationButton');
const mapNoteText = document.querySelector('#mapNoteText');
const coordinateLabel = (lat, lon) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
const toRadians = (degrees) => degrees * Math.PI / 180;
const metersBetween = (a, b) => {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(b.lon - a.lon);
  const haversine = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};
const project = ({ lat, lon }) => ({
  x: 40 + (lon - bounds.west) / (bounds.east - bounds.west) * 740,
  y: 40 + (bounds.north - lat) / (bounds.north - bounds.south) * 600,
});
const geoPath = (points) => points.map((point, index) => {
  const { x, y } = project(point);
  return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
}).join(' ');
const makeSvg = (name, attributes = {}) => {
  const element = document.createElementNS(svgNamespace, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
};

let selectedId = destinations[0].id;
let userLocation = null;
let locationSource = 'gps pending';
let gpsAccuracy = null;
let activeWatch = null;
let currentRoute = null;
let mapView = { x: 0, y: 0, width: 820, height: 680 };
let followLocation = true;
let toastTimer;
let startSelectionMode = false;
const campusPhotos = [
  {
    placeId: 'auditorium',
    title: 'UENR Auditorium',
    alt: 'Exterior view of the University of Energy and Natural Resources auditorium.',
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/UENR_Auditorium.jpg/960px-UENR_Auditorium.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:UENR_Auditorium.jpg',
  },
  {
    placeId: 'main-gate',
    title: 'UENR Main Entrance',
    alt: 'The entrance to the University of Energy and Natural Resources.',
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/University_of_Energy_and_Natural_Resources_Entrance.jpg/960px-University_of_Energy_and_Natural_Resources_Entrance.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:University_of_Energy_and_Natural_Resources_Entrance.jpg',
  },
  {
    title: 'GETFUND Hostel',
    alt: 'Exterior view of the University of Energy and Natural Resources GETFUND hostel.',
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/GETFUND_Hostel_UENR.jpg/960px-GETFUND_Hostel_UENR.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:GETFUND_Hostel_UENR.jpg',
  },
];
let activePhotoIndex = 0;

function renderCampusPhoto() {
  const photo = campusPhotos[activePhotoIndex];
  photoImage.hidden = false;
  photoUnavailable.hidden = true;
  photoImage.src = photo.src;
  photoImage.alt = photo.alt;
  photoCaption.textContent = photo.title;
  photoSource.href = photo.source;
  photoCount.textContent = `${activePhotoIndex + 1} / ${campusPhotos.length} · Photos load from Wikimedia Commons`;
}

function changePhoto(step) {
  activePhotoIndex = (activePhotoIndex + step + campusPhotos.length) % campusPhotos.length;
  renderCampusPhoto();
}

function drawRoads() {
  roads.forEach(([kind, points]) => {
    const path = geoPath(points.map(([lat, lon]) => ({ lat, lon })));
    const roadClass = kind === 'tertiary' || kind === 'residential' ? 'road-major' : kind === 'footway' || kind === 'path' ? 'road-walk' : 'road-minor';
    const edge = makeSvg('path', { d: path, class: 'road-edge' });
    const line = makeSvg('path', { d: path, class: `road ${roadClass}` });
    roadLayer.append(edge, line);
  });
}

function drawDestinations() {
  destinationLayer.replaceChildren();
  destinations.forEach((place, index) => {
    const { x, y } = project(place);
    const group = makeSvg('g', { class: 'map-place', 'data-id': place.id });
    const title = makeSvg('title');
    title.textContent = place.name;
    const radius = place.id === selectedId ? 7 : 5;
    const ring = makeSvg('circle', { cx: x, cy: y, r: radius + 5, class: 'destination-ring' });
    const dot = makeSvg('circle', { cx: x, cy: y, r: radius, class: `destination-dot${place.id === selectedId ? ' selected' : ''}` });
    const anchor = (index % 3 === 0 || place.id === selectedId) ? 'start' : 'end';
    const dx = anchor === 'start' ? 10 : -10;
    const dy = index % 2 === 0 ? -9 : 15;
    const label = makeSvg('text', { x: x + dx, y: y + dy, 'text-anchor': anchor, class: `destination-label${place.id === selectedId ? ' selected-label' : ''}` });
    label.textContent = place.short;
    group.append(title, ring, dot, label);
    destinationLayer.append(group);
  });
}

function drawUser() {
  userLayer.replaceChildren();
  if (!userLocation) return;
  const { x, y } = project(userLocation);
  const pulse = makeSvg('circle', { cx: x, cy: y, r: 12, class: 'user-pulse' });
  const marker = makeSvg('circle', { cx: x, cy: y, r: 6, class: 'user-marker' });
  const title = makeSvg('title');
  title.textContent = `Starting point: ${locationSource}${gpsAccuracy ? `, accuracy ${Math.round(gpsAccuracy)} metres` : ''}`;
  userLayer.append(pulse, marker, title);
}

function routeGraph() {
  const graph = new Map();
  const addNode = (point, id) => {
    const key = id || `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
    if (!graph.has(key)) graph.set(key, { point, edges: [] });
    return key;
  };
  roads.forEach(([kind, points]) => {
    points.forEach((coordinates, index) => {
      if (index === 0) return;
      const previous = points[index - 1];
      const a = { lat: previous[0], lon: previous[1] };
      const b = { lat: coordinates[0], lon: coordinates[1] };
      const aKey = addNode(a);
      const bKey = addNode(b);
      const length = metersBetween(a, b);
      graph.get(aKey).edges.push({ to: bKey, length, kind });
      graph.get(bKey).edges.push({ to: aKey, length, kind });
    });
  });
  const entries = [...graph.entries()];
  for (let first = 0; first < entries.length; first += 1) {
    for (let second = first + 1; second < entries.length; second += 1) {
      const [aKey, a] = entries[first];
      const [bKey, b] = entries[second];
      if (aKey === bKey || metersBetween(a.point, b.point) > 14) continue;
      const length = metersBetween(a.point, b.point);
      a.edges.push({ to: bKey, length, kind: 'connector' });
      b.edges.push({ to: aKey, length, kind: 'connector' });
    }
  }
  return graph;
}

const baseGraph = routeGraph();

function snapToNetwork(graph, point, id) {
  let nearest = null;
  for (const [, node] of graph) {
    for (const edge of node.edges) {
      const neighbor = graph.get(edge.to);
      if (!neighbor || node.point === neighbor.point) continue;
      const centerLat = toRadians(point.lat);
      const scaleX = 111320 * Math.cos(centerLat);
      const scaleY = 111320;
      const ax = (node.point.lon - point.lon) * scaleX;
      const ay = (node.point.lat - point.lat) * scaleY;
      const bx = (neighbor.point.lon - point.lon) * scaleX;
      const by = (neighbor.point.lat - point.lat) * scaleY;
      const dx = bx - ax;
      const dy = by - ay;
      const fraction = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      const projected = { lat: point.lat + (node.point.lat - point.lat + fraction * (neighbor.point.lat - node.point.lat)), lon: point.lon + (node.point.lon - point.lon + fraction * (neighbor.point.lon - node.point.lon)) };
      const distance = metersBetween(point, projected);
      if (!nearest || distance < nearest.distance) nearest = { node, neighbor, distance, projected, fraction };
    }
  }
  if (!nearest || nearest.distance > 145) return null;
  const key = `snap-${id}`;
  graph.set(key, { point: nearest.projected, edges: [] });
  for (const candidate of [nearest.node, nearest.neighbor]) {
    const candidateKey = [...graph.entries()].find(([, value]) => value === candidate)?.[0];
    if (!candidateKey) continue;
    const length = metersBetween(nearest.projected, candidate.point);
    graph.get(key).edges.push({ to: candidateKey, length, kind: 'connector' });
    candidate.edges.push({ to: key, length, kind: 'connector' });
  }
  return { key, point: nearest.projected, offset: nearest.distance };
}

function shortestPath(graph, start, end) {
  const distances = new Map([[start, 0]]);
  const previous = new Map();
  const unsettled = new Set([start]);
  while (unsettled.size) {
    let current = null;
    let shortest = Infinity;
    for (const key of unsettled) {
      const distance = distances.get(key) ?? Infinity;
      if (distance < shortest) { current = key; shortest = distance; }
    }
    if (current === null || shortest === Infinity) break;
    unsettled.delete(current);
    if (current === end) break;
    for (const edge of graph.get(current).edges) {
      const alternative = shortest + edge.length;
      if (alternative < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, alternative);
        previous.set(edge.to, current);
        unsettled.add(edge.to);
      }
    }
  }
  if (!distances.has(end)) return null;
  const keys = [end];
  while (keys[0] !== start) {
    const parent = previous.get(keys[0]);
    if (!parent) return null;
    keys.unshift(parent);
  }
  return { points: keys.map((key) => graph.get(key).point), meters: distances.get(end) };
}

function findRoute(destination) {
  if (!userLocation) return null;
  const graph = new Map([...baseGraph.entries()].map(([key, node]) => [key, { point: node.point, edges: [...node.edges] }]));
  const start = snapToNetwork(graph, userLocation, 'start');
  const end = snapToNetwork(graph, destination, 'destination');
  if (!start || !end) return null;
  const route = shortestPath(graph, start.key, end.key);
  if (!route) return null;
  const points = [userLocation, start.point, ...route.points, end.point, destination];
  const simplified = points.filter((point, index) => index === 0 || metersBetween(point, points[index - 1]) > 1.5);
  const distance = Math.round(start.offset + route.meters + end.offset);
  return { points: simplified, meters: distance };
}

function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.max(1, Math.round(meters / 10) * 10)} m`;
}

function getCompassDirection(from, to) {
  const latDelta = to.lat - from.lat;
  const lonDelta = to.lon - from.lon;
  const northSouth = Math.abs(latDelta) > Math.abs(lonDelta) ? (latDelta >= 0 ? 'north' : 'south') : null;
  const eastWest = Math.abs(lonDelta) > Math.abs(latDelta) ? (lonDelta >= 0 ? 'east' : 'west') : null;
  if (!northSouth && !eastWest) return 'ahead';
  if (northSouth && eastWest) return `${northSouth}-${eastWest}`;
  return northSouth || eastWest;
}

function renderAiAssistant(destination = null) {
  if (!destination) {
    aiSummary.textContent = 'Choose a destination to generate a route brief.';
    directionList.innerHTML = '<li>Select a campus building to begin.</li>';
    return;
  }
  if (!userLocation) {
    aiSummary.textContent = 'Getting your current location to plan this route.';
    directionList.innerHTML = '<li>Allow location access, or tap the map to set a start point.</li>';
    return;
  }
  if (!currentRoute) {
    aiSummary.textContent = `${destination.name} is not currently reachable from this start point.`;
    directionList.innerHTML = '<li>Move the start marker closer to a mapped campus path.</li><li>Use GPS or tap the map to set a more accurate location.</li>';
    return;
  }
  const routeMinutes = Math.max(1, Math.round(currentRoute.meters / 75));
  const firstWaypoint = currentRoute.points[1] || destination;
  const firstHeading = getCompassDirection(userLocation, firstWaypoint).replace('-', ' ');
  const sourceText = locationSource === 'gps' ? 'your current location' : 'the start point you selected on the map';
  aiSummary.textContent = `AI route briefing from ${sourceText}: ${destination.name} is about ${formatDistance(currentRoute.meters)} away.`;
  const steps = [
    `From your starting point, head ${firstHeading} along the route toward ${destination.name}.`,
    `Follow the green route for about ${routeMinutes} minutes and stay on the marked walking paths.`,
    `When you reach the ${destination.kind.toLowerCase()} area, continue until the route ends at ${destination.name}.`,
  ];
  directionList.innerHTML = steps.map((step) => `<li>${step}</li>`).join('');
}

function drawDirectionalSigns() {
  routeSignLayer.replaceChildren();
  if (!currentRoute) return;

  const points = currentRoute.points;
  if (points.length < 3) return;

  const candidates = [];
  for (let i = 1; i < points.length - 1; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const next = points[i + 1];
    const prevPoint = project(previous);
    const currentPoint = project(current);
    const nextPoint = project(next);
    const incoming = Math.atan2(currentPoint.y - prevPoint.y, currentPoint.x - prevPoint.x);
    const outgoing = Math.atan2(nextPoint.y - currentPoint.y, nextPoint.x - currentPoint.x);
    let turn = (outgoing - incoming) * 180 / Math.PI;
    while (turn > 180) turn -= 360;
    while (turn < -180) turn += 360;

    let label = 'AHEAD';
    if (i > points.length - 3) label = 'DEST';
    else if (Math.abs(turn) > 30) label = turn < 0 ? 'LEFT' : 'RIGHT';

    candidates.push({ index: i, label, turn, point: current, x: currentPoint.x, y: currentPoint.y, angle: outgoing * 180 / Math.PI });
  }

  const selected = [];
  const step = Math.max(1, Math.floor(candidates.length / 3));
  for (let i = 0; i < candidates.length; i += step) {
    if (selected.length >= 4) break;
    selected.push(candidates[i]);
  }
  const last = candidates[candidates.length - 1];
  if (last && !selected.some((item) => item.index === last.index)) selected.push(last);

  selected.forEach((item) => {
    const group = makeSvg('g', {
      class: 'route-sign',
      transform: `translate(${item.x} ${item.y}) rotate(${item.angle})`,
    });

    const board = makeSvg('rect', {
      x: -20,
      y: -12,
      width: 40,
      height: 24,
      rx: 4,
      class: 'direction-sign',
    });

    const arrow = makeSvg('path', {
      d: 'M0 -8 L9 0 L0 8',
      class: 'direction-sign-arrow',
      transform: 'translate(11 0)',
    });

    const text = makeSvg('text', {
      x: -3,
      y: 4,
      class: 'direction-sign-text',
      'text-anchor': 'middle',
    });
    text.textContent = item.label;

    group.append(board, arrow, text);
    routeSignLayer.append(group);
  });
}

function drawRoute() {
  routeLayer.replaceChildren();
  const destination = destinations.find((place) => place.id === selectedId);
  currentRoute = destination ? findRoute(destination) : null;
  if (!userLocation) {
    routeTitle.textContent = destination ? destination.name : 'Choose a building';
    routeMeta.textContent = destination ? 'Waiting for your current location' : 'Your route will appear here';
    turnInstruction.textContent = destination ? 'Locating your current position…' : 'Select a destination to begin';
    routeCaveat.textContent = 'Allow GPS access or tap the map to set a start point.';
    routeSignLayer.replaceChildren();
    renderAiAssistant(destination);
    return;
  }
  if (!currentRoute) {
    routeTitle.textContent = destination ? destination.name : 'Choose a building';
    routeMeta.textContent = destination ? 'No mapped walking route from this starting point' : 'Your route will appear here';
    turnInstruction.textContent = destination ? 'Try moving your start point closer to campus paths' : 'Select a destination to begin';
    routeCaveat.textContent = 'Campus paths are based on community map data. Check signs as you walk.';
    routeSignLayer.replaceChildren();
    renderAiAssistant(destination);
    return;
  }
  const routePath = geoPath(currentRoute.points);
  routeLayer.append(makeSvg('path', { d: routePath, class: 'route-halo' }), makeSvg('path', { d: routePath, class: 'route-line' }));
  drawDirectionalSigns();
  const minutes = Math.max(1, Math.round(currentRoute.meters / 75));
  routeTitle.textContent = destination.name;
  routeMeta.textContent = `${formatDistance(currentRoute.meters)}  ·  about ${minutes} min on foot`;
  const firstWaypoint = currentRoute.points[1] || destination;
  const heading = getCompassDirection(userLocation, firstWaypoint);
  if (locationSource === 'gps') {
    turnInstruction.textContent = `From your GPS location, head ${heading.replace('-', ' ')} along the route`;
    routeCaveat.textContent = gpsAccuracy ? `GPS accuracy about ${Math.round(gpsAccuracy)} m. Re-check the route as you walk.` : 'Campus paths are based on community map data. Check signs as you walk.';
  } else {
    turnInstruction.textContent = `Route preview: head ${heading.replace('-', ' ')} toward ${destination.name}`;
    routeCaveat.textContent = 'Start point selected on the map. Use GPS for live tracking.';
  }
  renderAiAssistant(destination);
}

function renderPlaces(filter = '') {
  const query = filter.trim().toLocaleLowerCase();
  const filtered = destinations.filter((place) => `${place.name} ${place.kind}`.toLocaleLowerCase().includes(query));
  placeCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'PLACE' : 'PLACES'}`;
  placeList.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No campus buildings match that search.';
    placeList.append(empty);
    return;
  }
  filtered.forEach((place, index) => {
    const button = document.createElement('button');
    button.className = 'place-button';
    button.type = 'button';
    button.dataset.id = place.id;
    button.setAttribute('aria-pressed', String(place.id === selectedId));
    const marker = document.createElement('span');
    marker.className = 'place-marker';
    marker.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('span');
    copy.className = 'place-copy';
    const name = document.createElement('span');
    name.className = 'place-name';
    name.textContent = place.name;
    const kind = document.createElement('span');
    kind.className = 'place-kind';
    kind.textContent = place.kind;
    copy.append(name, kind);
    const arrow = document.createElement('span');
    arrow.className = 'place-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    button.append(marker, copy, arrow);
    button.addEventListener('click', () => selectDestination(place.id));
    placeList.append(button);
  });
}

function selectDestination(id) {
  selectedId = id;
  renderPlaces(searchInput.value);
  drawDestinations();
  drawRoute();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function setLocation(point, source, accuracy = null) {
  const firstGpsFix = source === 'gps' && locationSource !== 'gps';
  userLocation = point;
  locationSource = source;
  gpsAccuracy = accuracy;
  if (source === 'gps' && followLocation) centerMapOnLocation(point, firstGpsFix);
  locationLabel.textContent = source === 'gps' ? `GPS fix · ±${Math.round(accuracy || 0)} m` : 'Manual map start point';
  mapHint.classList.add('is-hidden');
  mapNoteText.textContent = source === 'gps' ? `Your location · ±${Math.round(accuracy || 0)} m` : 'Manual start point selected';
  drawUser();
  drawRoute();
}

function startLocation() {
  if (location.protocol === 'file:') {
    locationLabel.textContent = 'Open over localhost to use GPS';
    mapNoteText.textContent = 'GPS needs localhost or HTTPS';
    showToast('GPS works only on a local web server or HTTPS page. Open the app via http://localhost.');
    return;
  }
  if (!('geolocation' in navigator)) {
    locationLabel.textContent = 'GPS unavailable · tap map to set start';
    mapNoteText.textContent = 'Tap the map to choose a start point';
    showToast('This browser does not provide location. Tap the map to set your start.');
    return;
  }
  if (activeWatch !== null) navigator.geolocation.clearWatch(activeWatch);
  locationLabel.textContent = 'Waiting for a GPS fix…';
  mapNoteText.textContent = 'Locating your current position';
  locateButton.disabled = true;
  const onPosition = (position) => {
    setLocation({ lat: position.coords.latitude, lon: position.coords.longitude }, 'gps', position.coords.accuracy);
    locateButton.disabled = false;
  };
  const onError = (error) => {
    locateButton.disabled = false;
    const messages = {
      1: 'Location access was denied. Allow it in your browser or tap the map.',
      2: 'Location is unavailable. Try again outside or tap the map.',
      3: 'GPS took too long. Try again or tap the map to set a start.',
    };
    locationLabel.textContent = 'GPS unavailable · tap map to set start';
    mapNoteText.textContent = 'Tap the map to choose a start point';
    showToast(messages[error.code] || 'Could not get GPS. Tap the map to set a start.');
  };
  activeWatch = navigator.geolocation.watchPosition(onPosition, onError, {
    enableHighAccuracy: true,
    maximumAge: 10000,
    timeout: 18000,
  });
}

function setManualStart(event) {
  const screenPoint = map.createSVGPoint();
  screenPoint.x = event.clientX;
  screenPoint.y = event.clientY;
  const pointOnMap = screenPoint.matrixTransform(map.getScreenCTM().inverse());
  const x = pointOnMap.x;
  const y = pointOnMap.y;
  const point = {
    lon: bounds.west + ((x - 40) / 740) * (bounds.east - bounds.west),
    lat: bounds.north - ((y - 40) / 600) * (bounds.north - bounds.south),
  };
  if (point.lat < bounds.south || point.lat > bounds.north || point.lon < bounds.west || point.lon > bounds.east) {
    showToast('Choose a point inside the mapped campus area.');
    return;
  }
  if (activeWatch !== null) {
    navigator.geolocation.clearWatch(activeWatch);
    activeWatch = null;
  }
  setLocation(point, 'manual');
  startSelectionMode = false;
  startPointButton.classList.remove('active');
  mapHint.classList.remove('is-hidden');
  showToast('Start point set. Use GPS for live tracking.');
}

function enableStartSelectionMode() {
  startSelectionMode = true;
  startPointButton.classList.add('active');
  mapHint.textContent = 'Tap the map to choose a new start point';
  mapHint.classList.remove('is-hidden');
  showToast('Tap anywhere on the map to set your start point.');
}

function zoom(factor) {
  const nextWidth = Math.min(820, Math.max(310, mapView.width * factor));
  const nextHeight = Math.min(680, Math.max(260, mapView.height * factor));
  mapView = {
    x: Math.max(0, Math.min(820 - nextWidth, mapView.x + (mapView.width - nextWidth) / 2)),
    y: Math.max(0, Math.min(680 - nextHeight, mapView.y + (mapView.height - nextHeight) / 2)),
    width: nextWidth,
    height: nextHeight,
  };
  map.setAttribute('viewBox', `${mapView.x} ${mapView.y} ${mapView.width} ${mapView.height}`);
  if (followLocation && locationSource === 'gps' && userLocation) centerMapOnLocation(userLocation);
}

function centerMapOnLocation(point, zoomToUser = false) {
  if (zoomToUser) {
    mapView.width = Math.min(mapView.width, 460);
    mapView.height = Math.min(mapView.height, 381);
  }
  const { x, y } = project(point);
  mapView.x = Math.max(0, Math.min(820 - mapView.width, x - mapView.width / 2));
  mapView.y = Math.max(0, Math.min(680 - mapView.height, y - mapView.height / 2));
  map.setAttribute('viewBox', `${mapView.x} ${mapView.y} ${mapView.width} ${mapView.height}`);
}

function setFollowLocation(enabled) {
  followLocation = enabled;
  followLocationButton.setAttribute('aria-pressed', String(enabled));
  followLocationButton.setAttribute('aria-label', enabled ? 'Stop following my location' : 'Follow my location');
  followLocationButton.title = enabled ? 'Following your location' : 'Follow your location';
  if (enabled && locationSource === 'gps' && userLocation) {
    centerMapOnLocation(userLocation, mapView.width >= 820);
  }
}

function updateNetworkStatus() {
  const offline = !navigator.onLine;
  networkStatus.classList.toggle('is-offline', offline);
  networkLabel.textContent = offline ? 'OFFLINE MAP · GPS ONLY' : 'OFFLINE MAP READY';
}

function escapeShortName(name) {
  const shortNames = {
    'UENR Library Block': 'Library',
    'Administration Block': 'Administration',
    'UENR Auditorium': 'Auditorium',
    'Engineering Laboratory': 'Engineering Lab',
    'School of Medical Science': 'Medical Science',
    'Department of Computer Science': 'Computer Science',
    'School of Sciences Lecture Hall': 'Sciences Lecture Hall',
    'Regional Centre for Energy and Environmental Sustainability': 'RCEES',
    'University Hall 1': 'University Hall 1',
    'University Hall 2': 'University Hall 2',
    'Bank of Ghana Auditorium': 'BoG Auditorium',
    'UENR Clinic': 'Clinic',
    'IT Directorate': 'IT Directorate',
    "Registrar's Office": 'Registrar',
    'Security Office': 'Security',
    'Student Affairs Office': 'Student Affairs',
    'University Cafeteria': 'Cafeteria',
    'School of Business': 'Business School',
    'School of Agriculture': 'Agriculture',
    'Main Gate': 'Main Gate',
  };
  return shortNames[name] || name;
}

destinations.forEach((place) => { place.short = escapeShortName(place.name); });
drawRoads();
renderPlaces();
drawDestinations();
drawUser();
drawRoute();
updateNetworkStatus();
if ('geolocation' in navigator) {
  startLocation();
} else {
  locationLabel.textContent = 'GPS unavailable · tap map to set start';
  mapNoteText.textContent = 'Tap the map to choose a start point';
}
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
searchInput.addEventListener('input', () => renderPlaces(searchInput.value));
document.querySelector('#searchForm').addEventListener('submit', (event) => event.preventDefault());
photoButton.addEventListener('click', () => {
  const matchingPhoto = campusPhotos.findIndex((photo) => photo.placeId === selectedId);
  activePhotoIndex = matchingPhoto >= 0 ? matchingPhoto : 0;
  renderCampusPhoto();
  photoDialog.showModal();
});
document.querySelector('#photoClose').addEventListener('click', () => photoDialog.close());
document.querySelector('#previousPhoto').addEventListener('click', () => changePhoto(-1));
document.querySelector('#nextPhoto').addEventListener('click', () => changePhoto(1));
photoImage.addEventListener('error', () => {
  photoImage.hidden = true;
  photoUnavailable.hidden = false;
});
photoImage.addEventListener('load', () => {
  photoImage.hidden = false;
  photoUnavailable.hidden = true;
});
photoDialog.addEventListener('click', (event) => {
  if (event.target === photoDialog) photoDialog.close();
});
photoDialog.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') changePhoto(-1);
  if (event.key === 'ArrowRight') changePhoto(1);
});
document.querySelector('#locateButton').addEventListener('click', startLocation);
document.querySelector('#startPointButton').addEventListener('click', () => {
  startSelectionMode = false;
  startPointButton.classList.remove('active');
  mapHint.textContent = 'Tap map to set your start';
  startLocation();
});
document.querySelector('#zoomIn').addEventListener('click', () => zoom(.78));
document.querySelector('#zoomOut').addEventListener('click', () => zoom(1.28));
followLocationButton.addEventListener('click', () => setFollowLocation(!followLocation));
document.querySelector('#recenterButton').addEventListener('click', () => {
  mapView = { x: 0, y: 0, width: 820, height: 680 };
  map.setAttribute('viewBox', '0 0 820 680');
  setFollowLocation(false);
});
document.querySelector('#clearRoute').addEventListener('click', () => {
  selectedId = null;
  routeLayer.replaceChildren();
  routeTitle.textContent = 'Choose a building';
  routeMeta.textContent = 'Your route will appear here';
  turnInstruction.textContent = 'Select a destination to begin';
  routeCaveat.textContent = 'Campus paths are based on community map data. Check signs as you walk.';
  renderAiAssistant();
  renderPlaces(searchInput.value);
  drawDestinations();
});
map.querySelector('.map-hit-area').addEventListener('click', (event) => {
  if (startSelectionMode) {
    setManualStart(event);
    return;
  }
  setManualStart(event);
});
map.querySelector('.map-hit-area').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    const rect = map.getBoundingClientRect();
    setManualStart({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    networkLabel.textContent = 'OFFLINE MAP · SAVE TO HOME';
  });
}
