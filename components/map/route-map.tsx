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
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#818cf8;box-shadow:0 0 0 4px rgba(129,140,248,0.3),0 0 12px 2px rgba(129,140,248,0.8);border:2px solid #fff"></div>`,
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

function EventMarkers({ markers }: { markers: EventMarker[] }) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    layerRef.current = group;

    for (const marker of markers) {
      const color = marker.kind === 'horn' ? '#fbbf24' : '#fb7185';
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
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={className} style={{ background: '#0b0c11' }} aria-hidden />;
  }

  const center: [number, number] = bounds
    ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]
    : cursor
      ? [cursor.lat, cursor.lon]
      : [51.5074, -0.1278];

  return (
    <div className={className}>
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
            pathOptions={{ color: '#818cf8', weight: 4, opacity: 0.9, lineCap: 'round' }}
          />
        ) : null}

        <EventMarkers markers={markers} />
        <CursorLayer cursor={cursor} />
        {bounds ? <FitBounds bounds={bounds} /> : null}
      </MapContainer>
    </div>
  );
}
