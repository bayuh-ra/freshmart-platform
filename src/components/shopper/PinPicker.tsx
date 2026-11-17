'use client';

// Map pin for the delivery address (OpenStreetMap via Leaflet, same as MapView).
// Tap the map or drag the pin to move it; "Use my location" asks the browser for GPS
// and falls back to the branch area when it is not allowed or not available.

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import { LocateFixed } from 'lucide-react';
import { DIGOS_CENTER } from './shared';

export interface Pin { lat: number; lng: number }

const PIN_HTML = '<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:999px;background:#c8151d;color:#fff;font-size:16px;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">🏠</div>';

export function PinPicker({ value, onChange, className = 'h-44' }: { value: Pin; onChange: (p: Pin) => void; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const marker = useRef<Leaflet.Marker | null>(null);
  const changeRef = useRef(onChange);
  const [locating, setLocating] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { changeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    import('leaflet').then((mod) => {
      if (cancelled || !el.current || map.current) return;
      const lf = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      const m = lf.map(el.current, { zoomControl: true, attributionControl: true }).setView([value.lat, value.lng], 15);
      lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
      const mk = lf.marker([value.lat, value.lng], { draggable: true, icon: lf.divIcon({ html: PIN_HTML, className: '', iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(m);
      mk.on('dragend', () => { const ll = mk.getLatLng(); changeRef.current({ lat: round(ll.lat), lng: round(ll.lng) }); });
      m.on('click', (e: Leaflet.LeafletMouseEvent) => { mk.setLatLng(e.latlng); changeRef.current({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) }); });
      map.current = m;
      marker.current = mk;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin in sync when the value changes from outside (e.g. "Use my location").
  useEffect(() => {
    const mk = marker.current;
    if (!mk || !map.current) return;
    const cur = mk.getLatLng();
    if (round(cur.lat) !== value.lat || round(cur.lng) !== value.lng) {
      mk.setLatLng([value.lat, value.lng]);
      map.current.panTo([value.lat, value.lng]);
    }
  }, [value.lat, value.lng]);

  const useMyLocation = () => {
    setMsg('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onChange(DIGOS_CENTER);
      setMsg('Location is not available on this device — pin set to the branch area. Move it to your house.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({ lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) });
        setMsg('Pin set to your current location. Drag it if it is not exact.');
      },
      () => {
        setLocating(false);
        onChange(DIGOS_CENTER);
        setMsg('We could not get your location — pin set to the branch area. Move it to your house.');
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div>
      <div ref={el} className={`w-full rounded-xl overflow-hidden border border-gray-200 z-0 ${className}`} />
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <p className="text-xs text-gray-600">Tap the map or drag the pin to your gate.</p>
        <button type="button" onClick={useMyLocation} disabled={locating} className="shrink-0 h-11 md:h-8 px-3 rounded-full border border-gray-200 bg-white text-xs font-semibold text-[#c8151d] hover:border-[#c8151d] flex items-center gap-1 disabled:opacity-50">
          <LocateFixed className="w-3.5 h-3.5" /> {locating ? 'Locating…' : 'Use my location'}
        </button>
      </div>
      {msg && <p className="text-xs text-gray-600 mt-1" role="status">{msg}</p>}
    </div>
  );
}

function round(n: number) {
  return Math.round(n * 1e5) / 1e5;
}
