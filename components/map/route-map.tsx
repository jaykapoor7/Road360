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
  /** Where to sit before there is a route to frame. Defaults to a world view. */
  center?: [number, number] | null;
  /** Initial zoom. */
  zoom?: number;
  /** Keep the view centred on the cursor as it moves (live navigation). */
  follow?: boolean;
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

/**
 * Keeps the view on the cursor during a live drive.
 *
 * Only re-centres when the marker drifts past the middle half of the viewport,
 * not on every fix — a map that hard-recentres on every GPS update is
 * genuinely nauseating to watch. The first fix snaps; after that it eases.
 */
function FollowCursor({ cursor, zoom }: { cursor: RouteMapProps['cursor']; zoom: number }) {
  const map = useMap();
  const framedOnce = useRef(false);

  useEffect(() => {
    if (!cursor) return;
    const point = map.latLngToContainerPoint([cursor.lat, cursor.lon]);
    const size = map.getSize();
    const outside =
      point.x < size.x * 0.25 ||
      point.x > size.x * 0.75 ||
      point.y < size.y * 0.25 ||
      point.y > size.y * 0.75;

    if (!framedOnce.current) {
      map.setView([cursor.lat, cursor.lon], zoom, { animate: false });
      framedOnce.current = true;
    } else if (outside) {
      map.panTo([cursor.lat, cursor.lon], { animate: true, duration: 0.6 });
    }
  }, [cursor, map, zoom]);

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
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#34d9a0;border:2.5px solid #fff;box-shadow:0 0 0 5px rgba(52,217,160,0.22),0 1px 6px 1px rgba(0,0,0,0.5)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
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
      // A small ringed dot, colour-coded by kind — no emoji. Emoji markers
      // render at the mercy of the platform font and never look like part of a
      // designed map; a 9px dot always does.
      const color = marker.kind === 'horn' ? '#D2A45E' : '#CD6D6D';
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:11px;height:11px;border-radius:50%;background:${color};box-shadow:0 0 0 3px ${color}33,0 0 0 4px rgba(0,0,0,0.4)"></div>`,
        iconSize: [11, 11],
        iconAnchor: [5.5, 5.5],
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
  center: centerProp,
  zoom = 15,
  follow = false,
  interactive = true,
  className,
}: RouteMapProps) {
  const [mounted, setMounted] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={className} style={{ background: '#0a0a0d' }} aria-hidden />;
  }

  // Prefer, in order: an explicit route to frame, the moving cursor, a supplied
  // device centre, and only then a wide world view. Falling back to a fixed
  // London default made every pre-fix map look like it was in the wrong city.
  const center: [number, number] = bounds
    ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]
    : cursor
      ? [cursor.lat, cursor.lon]
      : centerProp
        ? centerProp
        : [20, 0];
  const initialZoom = !bounds && !cursor && !centerProp ? 2 : zoom;

  return (
    <div className={`relative ${className ?? ''}`}>
      {tilesFailed ? (
        <div className="pointer-events-none absolute top-2 left-1/2 z-[500] -translate-x-1/2 rounded-pill border border-hairline bg-black/80 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-ink-faint uppercase">
          Basemap offline · route is live
        </div>
      ) : null}
      <MapContainer
        center={center}
        zoom={initialZoom}
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
        {follow ? <FollowCursor cursor={cursor} zoom={zoom} /> : null}

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

        {/* A soft dark casing under the coloured runs so the line reads on
            both light roads and dark parks — the trick every good nav map uses
            to keep a route legible over any basemap. */}
        {runs && runs.length > 0
          ? runs.map((run, i) => (
              <Polyline
                key={`casing-${i}`}
                positions={run.points}
                pathOptions={{
                  color: '#000000',
                  weight: 7,
                  opacity: 0.5,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            ))
          : null}

        {runs?.map((run, i) => (
          <Polyline
            key={i}
            positions={run.points}
            pathOptions={{
              color: INTENSITY_COLORS[run.level],
              weight: 4,
              opacity: 0.95,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        ))}

        {polyline && polyline.length > 1 ? (
          <>
            <Polyline
              positions={polyline}
              pathOptions={{ color: '#000000', weight: 7, opacity: 0.5, lineCap: 'round', lineJoin: 'round' }}
            />
            <Polyline
              positions={polyline}
              pathOptions={{ color: '#34D9A0', weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
            />
          </>
        ) : null}

        <EventMarkers markers={markers} />
        <CursorLayer cursor={cursor} />
        {bounds ? <FitBounds bounds={bounds} /> : null}
      </MapContainer>
    </div>
  );
}
