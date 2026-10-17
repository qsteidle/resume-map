import maplibregl from 'maplibre-gl';
import { store } from '../store.js';

// Easter eggs + flavor. Route 66 line is a GL layer (must be re-added after a
// setStyle theme swap); the sign + Polar Express are DOM markers (persist).
let domMarkersAdded = false;

const ROUTE_66 = [
  [-87.6247, 41.8797], [-87.8624, 41.5868], [-89.6501, 39.7817], [-90.1994, 38.6270],
  [-94.5133, 37.0842], [-94.7356, 37.0208], [-95.9928, 36.1540], [-97.5164, 35.4676],
  [-101.8313, 35.2731], [-102.6729, 35.2707], [-106.6511, 35.0845], [-111.6513, 35.1983],
  [-114.0533, 35.1896], [-114.8183, 34.0489], [-117.7411, 34.0522], [-118.4975, 34.0089],
];

export function addExtras() {
  addRoute66Line();
  if (!domMarkersAdded) {
    addRoute66Sign();
    domMarkersAdded = true;
  }
}

function addRoute66Line() {
  const map = store.map;
  if (map.getSource('route66')) return; // already present for this style
  map.addSource('route66', {
    type: 'geojson',
    data: { type: 'Feature', geometry: { type: 'LineString', coordinates: ROUTE_66 } },
  });
  map.addLayer({
    id: 'route66',
    type: 'line',
    source: 'route66',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#DC143C', 'line-width': 1, 'line-opacity': 0.25 },
  });
}

function brightenRoute66(on) {
  const map = store.map;
  if (!map.getLayer('route66')) return;
  map.setPaintProperty('route66', 'line-width', on ? 3 : 1);
  map.setPaintProperty('route66', 'line-opacity', on ? 0.7 : 0.25);
}

function addRoute66Sign() {
  const el = document.createElement('div');
  el.className = 'egg-marker';
  el.style.width = '22px';
  el.style.height = '22px';
  el.innerHTML =
    '<img class="map-marker__img" src="https://e7.pngegg.com/pngimages/672/121/png-clipart-u-s-route-66-car-sticker-wall-decal-route-text-textile-thumbnail.png" alt="Route 66">';

  const popup = new maplibregl.Popup({ offset: 14 })
    .setHTML('<b>Historic Route 66</b><br>The Mother Road — Chicago to Los Angeles');

  new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat([-102.6729, 35.2707])
    .setPopup(popup)
    .addTo(store.map);

  el.addEventListener('click', () => brightenRoute66(true));
  popup.on('close', () => brightenRoute66(false));
}
