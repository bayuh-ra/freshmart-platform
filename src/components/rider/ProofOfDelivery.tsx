'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Eraser, KeyRound, PenLine, RefreshCcw } from 'lucide-react';

/** Simulated camera capture (the live site opens the phone camera). */
export function PhotoCapture({ value, onChange, label = 'Take delivery photo' }: { value: string | null; onChange: (v: string | null) => void; label?: string }) {
  if (value) {
    return (
      <div className="relative rounded-xl overflow-hidden h-40 bg-gradient-to-br from-amber-100 via-orange-50 to-stone-200 border border-stone-200">
        <div className="absolute inset-0 flex items-center justify-center text-5xl">📦🚪</div>
        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-xs px-2 py-1 flex justify-between">
          <span>{value}</span><span>GPS ✓</span>
        </div>
        <button type="button" aria-label="Retake photo" onClick={() => onChange(null)} className="absolute top-2 right-2 bg-white/90 rounded-full w-11 h-11 flex items-center justify-center shadow text-stone-700"><RefreshCcw className="w-4 h-4" /></button>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => onChange(`IMG_${Date.now().toString().slice(-6)}.jpg · ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`)}
      className="w-full h-40 rounded-xl border-2 border-dashed border-stone-300 bg-white flex flex-col items-center justify-center gap-2 text-stone-600 hover:border-[#c8151d] hover:text-[#c8151d] transition-colors">
      <Camera className="w-7 h-7" strokeWidth={1.75} />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

export function PinEntry({ value, onChange, expected }: { value: string; onChange: (v: string) => void; expected: string }) {
  const ok = value === expected;
  return (
    <div>
      <p className="text-sm text-stone-700 mb-1.5 flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> Ask the customer for their 4-digit delivery PIN</p>
      <input inputMode="numeric" autoComplete="one-time-code" aria-label="Delivery PIN" maxLength={4} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        className={`w-full h-14 bg-white text-center text-2xl tracking-[0.6em] font-bold rounded-xl border-2 outline-none ${value.length === 4 ? (ok ? 'border-green-600 text-green-700' : 'border-red-600 text-red-700') : 'border-stone-300'}`} placeholder="••••" />
      {value.length === 4 && !ok && <p className="text-sm text-red-700 mt-1">PIN doesn’t match. Check with the customer.</p>}
      <p className="text-xs text-stone-500 mt-1">Demo hint: PIN is {expected} (shown on the customer’s order tracking page)</p>
    </div>
  );
}

export function SignaturePad({ onChange }: { onChange: (signed: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [strokes, setStrokes] = useState(0);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = c.offsetWidth * 2;
    c.height = c.offsetHeight * 2;
    const ctx = c.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2a2322';
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext('2d')!;
    const [x, y] = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d')!;
    const [x, y] = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setStrokes((n) => n + 1);
    onChange(true);
  };
  const clear = () => {
    const c = ref.current;
    if (!c) return;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setStrokes(0);
    onChange(false);
  };

  return (
    <div>
      <p className="text-sm text-stone-700 mb-1.5 flex items-center gap-1.5"><PenLine className="w-4 h-4" /> Ask the customer to sign below</p>
      <div className="relative">
        <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          className="w-full h-40 rounded-xl border-2 border-stone-300 bg-white touch-none cursor-crosshair" aria-label="Signature pad" />
        {strokes === 0 && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stone-400">Sign here</span>}
        <button type="button" aria-label="Clear signature" onClick={clear} className="absolute top-2 right-2 bg-white rounded-full w-11 h-11 flex items-center justify-center shadow border border-stone-200"><Eraser className="w-4 h-4 text-stone-600" /></button>
      </div>
    </div>
  );
}
