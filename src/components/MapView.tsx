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
}
export interface MapCircle { lat: number; lng: number; radiusKm: number; color?: string }
export interface MapLine { points: [number, number][]; color?: string; dashed?: boolean }

export function MapView({ center, zoom = 13, markers = [], circles = [], lines = [], className = 'h-80', fitToMarkers = false }: {
  center: [number, number]; zoom?: number; markers?: MapMarker[]; circles?: MapCircle[]; lines?: MapLine[]; className?: string; fitToMarkers?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    import('leaflet').then((mod) => {
      if (cancelled || !el.current || map.current) return;
      const lf = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      L.current = lf;
      map.current = lf.map(el.current, { zoomControl: true, attributionControl: true }).setView(center, zoom);
      lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
      layer.current = lf.layerGroup().addTo(map.current);
      draw();
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const lf = L.current;
    if (!lf || !layer.current || !map.current) return;
    layer.current.clearLayers();
    for (const c of circles) {
      lf.circle([c.lat, c.lng], { radius: c.radiusKm * 1000, color: c.color ?? '#c8151d', weight: 1.5, fillOpacity: 0.07 }).addTo(layer.current);
    }
    for (const l of lines) {
      lf.polyline(l.points, { color: l.color ?? '#c8151d', weight: 3, dashArray: l.dashed ? '6 6' : undefined }).addTo(layer.current);
    }
    for (const m of markers) {
      const html = `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:999px;background:${m.color ?? '#c8151d'};color:#fff;font-size:16px;font-weight:700;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">${m.pulse ? `<span class="rider-pulse" style="position:absolute;inset:-3px;border-radius:999px;border:3px solid ${m.color ?? '#c8151d'}"></span>` : ''}${m.label}</div>`;
      const mk = lf.marker([m.lat, m.lng], { icon: lf.divIcon({ html, className: '', iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(layer.current);
      if (m.title) mk.bindTooltip(m.title);
      if (m.onClick) mk.on('click', m.onClick);
    }
    if (fitToMarkers && !fitted.current && markers.length > 1) {
      map.current.fitBounds(lf.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number])), { padding: [40, 40] });
      fitted.current = true;
    }
  }

  useEffect(() => {
    draw();
  });

  return <div ref={el} className={`w-full rounded-xl overflow-hidden border border-gray-200 z-0 ${className}`} />;
}
