'use client';

// OpenStreetMap map (spec decision: OSM for low/no cost), via Leaflet.
// Markers are plain HTML so no image assets are needed.

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  /** emoji or short text shown in the pin */
  label: string;
  color?: string; // background color
  title?: string; // tooltip
  pulse?: boolean;
  onClick?: () => void;
  /** Custom marker HTML (replaces the round pin); `size` is its box in px, anchored at the centre. */
  html?: string;
  size?: [number, number];
  /** Popup HTML shown on click. */
  popup?: string;
  /** Stacking order among markers (higher = on top). */
  z?: number;
}
export interface MapCircle {
  lat: number; lng: number; radiusKm: number; color?: string;
  /** Optional styling (defaults: fill 0.07, weight 1.5, solid stroke). */
  fillOpacity?: number; weight?: number; dashed?: boolean;
  /** Draw a ring (annulus) from innerKm to radiusKm instead of a full disc. */
  innerKm?: number;
}

/** Points of a circle `km` around a centre (for annulus polygons). */
function ring(lat: number, lng: number, km: number, steps = 72): [number, number][] {
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI;
    return [lat + dLat * Math.sin(a), lng + dLng * Math.cos(a)] as [number, number];
  });
}
export interface MapLine { points: [number, number][]; color?: string; dashed?: boolean; weight?: number; opacity?: number }

export function MapView({ center, zoom = 13, markers = [], circles = [], lines = [], className = 'h-80', fitToMarkers = false, frameClass = 'rounded-xl border border-gray-200', zoomPosition = 'topleft' }: {
  center: [number, number]; zoom?: number; markers?: MapMarker[]; circles?: MapCircle[]; lines?: MapLine[]; className?: string; fitToMarkers?: boolean;
  /** Border/radius classes of the map box (pass '' when the map sits inside a card). */
  frameClass?: string;
  /** Corner of the + / − zoom buttons (default top-left). */
  zoomPosition?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const fitted = useRef(false);
  /** Last drawn data; skip redraws when nothing changed (keeps open popups and tooltips alive). */
  const drawn = useRef('');
  /** Latest fit() (the resize observer is created once, so it calls through this ref). */
  const fitLatest = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | undefined;
    import('leaflet').then((mod) => {
      if (cancelled || !el.current || map.current) return;
      const lf = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      L.current = lf;
      map.current = lf.map(el.current, { zoomControl: false, attributionControl: true }).setView(center, zoom);
      lf.control.zoom({ position: zoomPosition }).addTo(map.current);
      lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
      layer.current = lf.layerGroup().addTo(map.current);
      // The box can get its size after the map is created (e.g. a grid column laid out later):
      // re-measure on resize, and fit the markers once the box has a size.
      ro = new ResizeObserver(() => {
        map.current?.invalidateSize();
        fitLatest.current();
      });
      ro.observe(el.current);
      draw();
    });
    return () => {
      cancelled = true;
      ro?.disconnect();
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const lf = L.current;
    if (!lf || !layer.current || !map.current) return;
    const sig = JSON.stringify([markers, circles, lines]);
    if (sig === drawn.current) return;
    drawn.current = sig;
    layer.current.clearLayers();
    for (const c of circles) {
      const style = { color: c.color ?? '#c8151d', weight: c.weight ?? 1.5, fillOpacity: c.fillOpacity ?? 0.07, dashArray: c.dashed ? '6 6' : undefined };
      if (c.innerKm && c.innerKm > 0) lf.polygon([ring(c.lat, c.lng, c.radiusKm), ring(c.lat, c.lng, c.innerKm)], style).addTo(layer.current);
      else lf.circle([c.lat, c.lng], { radius: c.radiusKm * 1000, ...style }).addTo(layer.current);
    }
    for (const l of lines) {
      lf.polyline(l.points, { color: l.color ?? '#c8151d', weight: l.weight ?? 3, opacity: l.opacity ?? 1, dashArray: l.dashed ? '6 6' : undefined }).addTo(layer.current);
    }
    for (const m of markers) {
      const size = m.size ?? [34, 34];
      const html = m.html ?? `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:999px;background:${m.color ?? '#c8151d'};color:#fff;font-size:16px;font-weight:700;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">${m.pulse ? `<span class="rider-pulse" style="position:absolute;inset:-3px;border-radius:999px;border:3px solid ${m.color ?? '#c8151d'}"></span>` : ''}${m.label}</div>`;
      const mk = lf.marker([m.lat, m.lng], { icon: lf.divIcon({ html, className: '', iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2] }), zIndexOffset: m.z ?? 0 }).addTo(layer.current);
      if (m.title) mk.bindTooltip(m.title);
      if (m.popup) mk.bindPopup(m.popup, { closeButton: false });
      if (m.onClick) mk.on('click', m.onClick);
    }
    fit();
  }

  /** Fit the markers once (only when the map box has a size, else Leaflet zooms all the way in). */
  function fit() {
    const lf = L.current;
    if (!lf || !map.current || !fitToMarkers || fitted.current || markers.length < 2) return;
    const size = map.current.getSize();
    if (!size.x || !size.y) return;
    map.current.fitBounds(lf.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number])), { padding: [40, 40] });
    fitted.current = true;
  }

  useEffect(() => {
    fitLatest.current = fit;
    draw();
  });

  return <div ref={el} className={`w-full overflow-hidden z-0 ${frameClass} ${className}`} />;
}
