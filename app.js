// ================================
// Crear el mapa Leaflet
// ================================
const map = L.map('map', {
  center: [-18.810972, -59.794592],
  zoom: 8,
  zoomControl: true
});

// ================================
// Panes (orden de dibujo)
// ================================
// (menor zIndex = más abajo)
map.createPane('pane-vegetacion');  map.getPane('pane-vegetacion').style.zIndex = 300;  // 🔻 más abajo
map.createPane('pane-areas');       map.getPane('pane-areas').style.zIndex = 400;       // 🔻 medio
map.createPane('pane-overlays');    map.getPane('pane-overlays').style.zIndex = 600;    // marcadores/rutas demo
map.createPane('pane-firms');       map.getPane('pane-firms').style.zIndex = 1000;      // 🔺 arriba de todo
map.createPane('pane-caminos');       map.getPane('pane-caminos').style.zIndex = 400;      // 🔺 arriba de todo

// ================================
// Capas base
// ================================
const baseOSM = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { maxZoom: 19, attribution: '&copy; OpenStreetMap' }
).addTo(map);

const baseSat = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { maxZoom: 19, attribution: '&copy; Esri, Maxar' }
);
const basemaps = { osm: baseOSM, sat: baseSat };

// ================================
// Capas demo (en pane-overlays)
// ================================


// ================================
// 1) GEOJSON VEGETACIÓN (debajo de todos)
// ================================
// === CONFIGURA AQUÍ EL NOMBRE DEL CAMPO CATEGÓRICO ===
const FIELD = 'Codigo';

// Mapea t∈[0,1] → HSL (0° rojo → 120° verde)
function tToColor(t) {
  const tt = Math.max(0, Math.min(1, t));
  let hue, lightness;

  if (tt < 0.5) {
    // From yellow (60°) to light green (120°)
    const ratio = tt / 0.5; // Normalize to [0,1]
    hue = 60 + (120 - 60) * ratio; // 60 → 120
    lightness = 70; // Keep lightness high for both yellow and light green
  } else {
    // From light green (120°) to dark green (120°)
    const ratio = (tt - 0.5) / 0.5; // Normalize to [0,1]
    hue = 120; // Stay at green
    lightness = 70 - 40 * ratio; // 70 → 30
  }

  return `hsl(${hue}, 85%, ${lightness}%)`;
}


// Genera un Map categoría→color usando un gradiente
function buildCategoryPalette(categories){
  // Orden estable por defecto (alfabético); si quieres otro orden, pasa tu propio array ordenado
  const cats = Array.from(categories).sort((a,b)=>a.localeCompare(b, undefined, {sensitivity:'base'}));
  const n = cats.length || 1;
  const palette = new Map();
  cats.forEach((cat, i) => {
    const t = (n === 1) ? 0.5 : i / (n - 1); // distribuye de rojo→verde
    palette.set(cat, tToColor(t));
  });
  return palette;
}


// Capa GeoJSON vegetación (debajo de todo)
const rutaLayer = L.geoJSON(null, {
  pane: 'pane-vegetacion',
  style: { color:'#212121ff', weight:1, fillColor:'#888', fillOpacity:1 },
  onEachFeature: (feature, layer) => {
    const props = feature.properties || {};
    const rows = Object.entries(props)
      .map(([k, v]) => `
        <tr>
          <th>${k}</th>
          <td>${v ?? '—'}</td>
        </tr>
      `).join('');

    const html = `
      <div class="popup-wrap">
        <div class="popup-title">Propiedades</div>
        <table class="popup-table">${rows}</table>
      </div>
    `;
    layer.bindPopup(html, { maxWidth: 360 });
  }
});



async function loadVegetacionCategorica(url){
  const res = await fetch(url);
  const data = await res.json();

  // 1) colecta categorías únicas
  const catSet = new Set();
  (data.features || []).forEach(f => {
    const v = f?.properties?.[FIELD];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      catSet.add(String(v));
    }
  });

  // 2) paleta estable rojo→verde según orden alfabético
  const palette = buildCategoryPalette(catSet);

  // 3) añade datos y aplica estilo por categoría
  rutaLayer.clearLayers();
  rutaLayer.addData(data);

  rutaLayer.setStyle(f => {
    const cat = String(f?.properties?.[FIELD] ?? '');
    const col = palette.get(cat) || '#cccccc';
    return {
      color: '#212121ff',       // borde col
      weight: 0.3,
      fillColor: col,   // relleno
      fillOpacity: 1
    };
  });

  // 4) ajusta vista si quieres
  if (rutaLayer.getBounds && rutaLayer.getBounds().isValid()) {
    map.fitBounds(rutaLayer.getBounds(), { padding:[20,20] });
  }

  // 5) leyenda

}

// Llama con tu archivo:
loadVegetacionCategorica('vegetacion_small.geojson');

const puntosLayer = L.geoJSON(null, {
  pane: 'pane-caminos',
  style: { color:'#212121ff', weight:1, fillColor:'#888', fillOpacity:1 }
});


async function loadshape(url){
  const res = await fetch(url);
  const data = await res.json();
  puntosLayer.addData(data);
}

loadshape('caminos.geojson');

// ================================
// 2) GEOJSON AREAS PROTEGIDAS (medio)
// ================================
const urlGeoJSONAreas = 'areas_prot_line.geojson';
const estiloAreas = {
  color: '#000000',
  weight: 2,
  fillColor: '#000000',
  fillOpacity: 0.0
};

let capaAreasProt = null;

fetch(urlGeoJSONAreas)
  .then(r => r.json())
  .then(data => {
    capaAreasProt = L.geoJSON(data, {
      pane: 'pane-areas',         // 👈 medio
      style: estiloAreas,
      onEachFeature: function (feature, layer) {
        let contenido = '';
        for (let prop in feature.properties) {
          contenido += `<b>${prop}</b>: ${feature.properties[prop]}<br>`;
        }
        layer.bindPopup(contenido);
      }
    }).addTo(map);

    // Ajustar al área (si querés que el fit se base en áreas protegidas)
    // map.fitBounds(capaAreasProt.getBounds());
  })
  .catch(err => console.error('Error al cargar areas_prot:', err));

// ================================
// 3) FIRMS API (arriba de todo)
// ================================
//---------------- Constantes Iniciales -----------------//
const MAP_KEY = '5af33db19b8f702e3a8bfd0db0418a04';
const BBOX_AOI = [-64.9, -22.5, -57.0, -16.0];
const DEFAULT_SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'];
const AUTO_REFRESH_MS = 15 * 60 * 1000;

// Contenedor de la capa de puntos FIRMS
const firmsLayer = L.layerGroup().addTo(map);

// Estado simple
const $status = document.getElementById('status');
function setStatus(msg){ if($status) $status.textContent = msg; }

// UI
const $chkFirms   = document.getElementById('chkFirms');
const $inpDays    = document.getElementById('inpDays');
const $btnRefresh = document.getElementById('btnRefresh');
const $sensorInputs = Array.from(document.querySelectorAll('.sensor'));

// Helpers
function buildAreaUrl({ mapKey, source, bbox, days }){
  const d = Math.max(1, Math.min(10, Number(days) || 1));
  if (!Array.isArray(bbox) || bbox.length !== 4) throw new Error('BBOX inválido');
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${source}/${bbox.join(',')}/${d}`;
}

async function fetchCSV(url){
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) {
    const txt = await resp.text().catch(()=> '');
    throw new Error(`HTTP ${resp.status} – ${txt.slice(0,120)}`);
  }
  return resp.text();
}

function parseCSVtoFeatures(csvText){
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const headers = lines.shift().split(',');
  const idx = (name) => headers.indexOf(name);

  const iLat = idx('latitude');
  const iLon = idx('longitude');
  const iDate= idx('acq_date');
  const iTime= idx('acq_time');
  const iConf= idx('confidence');
  const iFRP = idx('frp');
  const iSat = idx('satellite');
  const iInst= idx('instrument');

  const feats = [];
  for (const raw of lines) {
    const cols = raw.split(',');
    const lat = parseFloat(cols[iLat]);
    const lon = parseFloat(cols[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    let hhmm = (cols[iTime] || '').padStart(4,'0');
    const timeFmt = `${hhmm.slice(0,2)}:${hhmm.slice(2,4)}`;

    feats.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        acq_date: cols[iDate] || '',
        acq_time: timeFmt,
        confidence: cols[iConf] || '',
        frp: cols[iFRP] || '',
        satellite: cols[iSat] || '',
        instrument: cols[iInst] || ''
      }
    });
  }
  return feats;
}

function dedupeFeatures(feats){
  const seen = new Set();
  const out = [];
  for (const f of feats) {
    const p = f.properties;
    const g = f.geometry && f.geometry.coordinates;
    if (!g) continue;
    const key = `${g[0].toFixed(5)}|${g[1].toFixed(5)}|${p.acq_date}|${p.acq_time}`;
    if (!seen.has(key)) { seen.add(key); out.push(f); }
  }
  return out;
}

// Colores válidos (corrijo hex de 8 dígitos)
function styleByConfidence(conf){
  const v = String(conf).toLowerCase();
  if (v.includes('h') || Number(v) >= 80) return { color:'#000000ff', fillColor:'#ff0000' };
  if (v.includes('n') || Number(v) >= 40) return { color:'#000000ff', fillColor:'#ff8c00' };
  if (v.includes('l') || Number(v) >= 1)  return { color:'#000000ff', fillColor:'#ffd000' };
  return { color:'#0d00ff', fillColor:'#2f00ff' };
}

// Render FIRMS en pane-firms (arriba de todo)
function renderFirms(feats){
  firmsLayer.clearLayers();

  const geojson = { type: 'FeatureCollection', features: feats };

  const layer = L.geoJSON(geojson, {
    pane: 'pane-firms', // 👈 ARRIBA
    pointToLayer: (feature, latlng) => {
      const { confidence, frp } = feature.properties;
      const base = styleByConfidence(confidence);
      let r = 4;
      const frpNum = Number(frp);
      if (Number.isFinite(frpNum)) {
        if (frpNum > 50) r = 8;
        else if (frpNum > 20) r = 6;
      }
      return L.circleMarker(latlng, {
        radius: r,
        color: base.color,
        fillColor: base.fillColor,
        weight: 1,
        fillOpacity: 0.8
      });
    },
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      layer.bindPopup(
        `<b>Foco VIIRS</b><br>
        Fecha: ${p.acq_date} ${p.acq_time}<br>
        Confianza: ${p.confidence}<br>
        FRP: ${p.frp}<br>
        Satélite: ${p.satellite}`
      );
    }
  });

  layer.addTo(firmsLayer);
  setStatus?.(`Mostrando ${feats.length} focos (VIIRS).`);
}

// Descarga + pinta FIRMS
async function loadFirmsAndRender(){
  try {
    setStatus?.('Descargando datos de FIRMS…');

    const sources = $sensorInputs.length
      ? $sensorInputs.filter(inp => inp.checked).map(inp => inp.value)
      : DEFAULT_SOURCES;

    if (sources.length === 0) {
      firmsLayer.clearLayers();
      setStatus?.('Sin sensores seleccionados.');
      return;
    }

    const days = Math.max(1, Math.min(10, Number($inpDays?.value) || 3));
    const urls = sources.map(src => buildAreaUrl({
      mapKey: MAP_KEY, source: src, bbox: BBOX_AOI, days
    }));

    const csvs = await Promise.all(urls.map(fetchCSV));
    let allFeats = [];
    for (const csv of csvs) allFeats = allFeats.concat(parseCSVtoFeatures(csv));
    const unique = dedupeFeatures(allFeats);

    renderFirms(unique);

    if ($chkFirms && !$chkFirms.checked && map.hasLayer(firmsLayer)) {
      map.removeLayer(firmsLayer);
    }
    if ($chkFirms && $chkFirms.checked && !map.hasLayer(firmsLayer)) {
      firmsLayer.addTo(map);
    }

  } catch (err) {
    console.error(err);
    setStatus?.(`Error: ${err.message}`);
  }
}

// ================================
// Control del menú (tu UI)
// ================================
const menuBtn = document.getElementById('menuToggle');
const dropdown = document.getElementById('dropdown');

function toggleMenu(){
  const hidden = dropdown.getAttribute('aria-hidden') !== 'false';
  dropdown.setAttribute('aria-hidden', hidden ? 'false' : 'true');
}
if (menuBtn && dropdown) {
  menuBtn.addEventListener('click', toggleMenu);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-wrap')) dropdown.setAttribute('aria-hidden', 'true');
  });
}

// ================================
// Eventos de UI
// ================================
document.querySelectorAll('input[name="basemap"]').forEach(radio => {
  radio.addEventListener('change', e => {
    Object.values(basemaps).forEach(l => map.removeLayer(l));
    basemaps[e.target.value].addTo(map);
  });
});

const $chkPuntos = document.getElementById('chkPuntos');
if ($chkPuntos) {
  $chkPuntos.addEventListener('change', e => {
    e.target.checked ? puntosLayer.addTo(map) : map.removeLayer(puntosLayer);
  });
}

const $chkRutas = document.getElementById('chkRutas');
if ($chkRutas) {
  $chkRutas.addEventListener('change', e => {
    e.target.checked ? rutaLayer.addTo(map) : map.removeLayer(rutaLayer);
  });
}

const $btnCentrar = document.getElementById('btnCentrar');
if ($btnCentrar) {
  $btnCentrar.addEventListener('click', () => map.setView([-18.810972, -59.794592], 7));
}

// ================================
// AUTO REFRESH FIRMS + Inicio
// ================================
const $inpDaysSafe = document.getElementById('inpDays');
const $btnRefreshSafe = document.getElementById('btnRefresh');

$chkFirms?.addEventListener('change', () => {
  if ($chkFirms.checked)   firmsLayer.addTo(map);
  else                      map.removeLayer(firmsLayer);
});

$btnRefreshSafe?.addEventListener('click', () => loadFirmsAndRender());

$inpDaysSafe?.addEventListener('change', () => {
  const v = Math.max(1, Math.min(10, Number($inpDaysSafe.value) || 3));
  $inpDaysSafe.value = v;
  loadFirmsAndRender();
});

$sensorInputs.forEach(inp => {
  inp.addEventListener('change', () => loadFirmsAndRender());
});

// AUTO: refresca cada 15 min
setInterval(() => {
  if (!$chkFirms || $chkFirms.checked) loadFirmsAndRender();
}, AUTO_REFRESH_MS);

// Inicio
(async function init(){
  setStatus?.('Inicializando…');
  // Añade capas base por defecto si quieres:
  // puntosLayer.addTo(map);
  // rutaLayer.addTo(map); // vegetación ya se carga con loadGeoJSONInto
  await loadFirmsAndRender();
})();

