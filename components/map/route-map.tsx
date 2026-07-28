'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Rectangle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLngBoundsExpression } from 'leaflet';
import { INTENSITY_COLORS, type IntensityRun, type EventMarker } from '@/lib/geo/route-segments';

/** A heat cell drawn as a translucent rectangle over its geohash bounds. */
export interface HeatRect {
  bounds: [[number, number], [number, number]];
  color: string;
  intensity: number;
}

export interface RouteMapProps {
  /** Full route as [lat, lon] pairs, or intensity-coloured runs. */
  runs?: IntensityRun[];
  polyline?: [number, number][];
  markers?: EventMarker[];
  heat?: HeatRect[];
  bounds?: [[number, number], [number, number]] | null;
  /** A moving marker for live drives and replay. */
  cursor?: { lat: number; lon: number; heading?: number } | null;
  interactive?: boolean;
  className?: string;
}

// CARTO Dark Matter: free, no API key, and the right aesthetic. Attribution is
// a licence condition and is kept visible.
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [28, 28], animate: false });
  }, [bounds, map]);
  return null;
}

/** Glides a marker along a position that updates externally (live / replay). */
function CursorLayer({ cursor }: { cursor: RouteMapProps['cursor'] }) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!cursor) return;

    if (!markerRef.current) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,0.18),0 0 14px 2px rgba(0,224,140,0.7)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      markerRef.current = L.marker([cursor.lat, cursor.lon], { icon, interactive: false }).addTo(map);
    } else {
      markerRef.current.setLatLng([cursor.lat, cursor.lon]);
    }
  }, [cursor, map]);

  useEffect(() => {
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, []);

  return null;
}

/**
 * Watches the tile layer and reports when the basemap has failed.
 *
 * Offline — or behind a network that blocks CARTO — Leaflet quietly renders
 * empty tiles, which looks identical to a map centred on the sea. The route,
 * markers and heat cells are all drawn client-side and are still correct, so
 * the fix is to say the basemap is missing rather than to hide the panel.
 */
function TileHealth({ onFailed }: { onFailed: (failed: boolean) => void }) {
  const map = useMap();

  useEffect(() => {
    let loaded = 0;
    let errors = 0;

    const onError = () => {
      errors += 1;
      // A couple of missing tiles at the edge of a zoom level is normal; a
      // basemap that is genuinely unreachable fails far more than that.
      if (errors >= 3 && loaded === 0) onFailed(true);
    };
    const onLoad = () => {
      loaded += 1;
      onFailed(false);
    };

    // A blocked network can hang the requests rather than reject them, in which
    // case `tileerror` never fires and the panel would sit empty and unexplained
    // forever. If nothing has painted after eight seconds, say so.
    const timeout = setTimeout(() => {
      if (loaded === 0) onFailed(true);
    }, 8000);

    map.on('tileerror', onError);
    map.on('tileload', onLoad);
    return () => {
      clearTimeout(timeout);
      map.off('tileerror', onError);
      map.off('tileload', onLoad);
    };
  }, [map, onFailed]);

  return null;
}

function EventMarkers({ markers }: { markers: EventMarker[] }) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    layerRef.current = group;

    for (const marker of markers) {
      const color = marker.kind === 'horn' ? '#FFC043' : '#FF5470';
      const glyph = marker.kind === 'horn' ? '📣' : '🛑';
      const icon = L.divIcon({
        className: '',
        html: `<div style="display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:${color}22;border:1.5px solid ${color};font-size:11px">${glyph}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      L.marker([marker.lat, marker.lon], { icon, interactive: false }).addTo(group);
    }

    return () => {
      group.remove();
    };
  }, [markers, map]);

  return null;
}

/**
 * The Leaflet map. Client-only and never imported directly by a page — always
 * reached through `route-map-lazy`, which applies the `ssr: false` boundary
 * that react-leaflet requires.
 *
 * Rendering is gated on a mounted flag so MapContainer never runs during
 * hydration, and `preferCanvas` is mandatory: SVG with thousands of route
 * vertices janks badly on a phone.
 */
export default function RouteMap({
  runs,
  polyline,
  markers = [],
  heat,
  bounds,
  cursor,
  interactive = true,
  className,
}: RouteMapProps) {
  const [mounted, setMounted] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={className} style={{ background: '#0a0a0d' }} aria-hidden />;
  }

  const center: [number, number] = bounds
    ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]
    : cursor
      ? [cursor.lat, cursor.lon]
      : [51.5074, -0.1278];

  return (
    <div className={`relative ${className ?? ''}`}>
      {tilesFailed ? (
        <div className="pointer-events-none absolute top-2 left-1/2 z-[500] -translate-x-1/2 rounded-pill border border-hairline bg-black/80 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-ink-faint uppercase">
          Basemap offline · route is live
        </div>
      ) : null}
      <MapContainer
        center={center}
        zoom={14}
        preferCanvas
        zoomControl={false}
        attributionControl
        dragging={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} subdomains="abcd" maxZoom={20} />
        <TileHealth onFailed={setTilesFailed} />

        {heat?.map((cell, i) => (
          <Rectangle
            key={`heat-${i}`}
            bounds={cell.bounds}
            pathOptions={{
              color: cell.color,
              weight: 0.5,
              // Scaled with intensity so dense areas read as hot without the
              // whole map turning opaque.
              fillOpacity: 0.18 + cell.intensity * 0.45,
              fillColor: cell.color,
              opacity: 0.5,
            }}
          />
        ))}

        {runs?.map((run, i) => (
          <Polyline
            key={i}
            positions={run.points}
            pathOptions={{
              color: INTENSITY_COLORS[run.level],
              weight: 4,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        ))}

        {polyline && polyline.length > 1 ? (
          <Polyline
            positions={polyline}
            pathOptions={{ color: '#00E08C', weight: 4, opacity: 0.9, lineCap: 'round' }}
          />
        ) : null}

        <EventMarkers markers={markers} />
        <CursorLayer cursor={cursor} />
        {bounds ? <FitBounds bounds={bounds} /> : null}
      </MapContainer>
    </div>
  );
}
