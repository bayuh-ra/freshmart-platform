'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Eraser, KeyRound, PenLine, RefreshCcw } from 'lucide-react';

/** Simulated camera capture (the real app opens the device camera). */
export function PhotoCapture({ value, onChange, label = 'Take delivery photo' }: { value: string | null; onChange: (v: string | null) => void; label?: string }) {
  if (value) {
    return (
      <div className="relative rounded-xl overflow-hidden h-36 bg-gradient-to-br from-amber-100 via-orange-50 to-stone-200 border border-gray-200">
        <div className="absolute inset-0 flex items-center justify-center text-5xl">📦🚪</div>
        <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-2 py-1 flex justify-between">
          <span>{value}</span><span>GPS ✓</span>
        </div>
        <button onClick={() => onChange(null)} className="absolute top-2 right-2 bg-white/90 rounded-full p-1.5 shadow"><RefreshCcw className="w-3.5 h-3.5" /></button>
      </div>
    );
  }
  return (
    <button onClick={() => onChange(`IMG_${Date.now().toString().slice(-6)}.jpg · ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`)}
      className="w-full h-36 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-[#1e40af] hover:text-[#1e40af] transition-colors">
      <Camera className="w-7 h-7" strokeWidth={1.75} />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

export function PinEntry({ value, onChange, expected }: { value: string; onChange: (v: string) => void; expected: string }) {
  const ok = value === expected;
  return (
    <div>
      <p className="text-xs text-gray-600 mb-1.5 flex items-center gap-1"><KeyRound className="w-3.5 h-3.5" /> Ask the shopper for their 4-digit delivery PIN</p>
      <input inputMode="numeric" maxLength={4} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        className={`w-full h-12 text-center text-2xl tracking-[0.6em] font-bold rounded-xl border-2 outline-none ${value.length === 4 ? (ok ? 'border-green-500 text-green-700' : 'border-[#dc2626] text-[#dc2626]') : 'border-gray-300'}`} placeholder="••••" />
      {value.length === 4 && !ok && <p className="text-xs text-[#dc2626] mt-1">PIN doesn&apos;t match. Check with the shopper.</p>}
      <p className="text-[10px] text-gray-400 mt-1">Demo hint: PIN is {expected} (shown in the Shopper App tracking screen)</p>
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
    ctx.strokeStyle = '#0f0f1a';
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
      <p className="text-xs text-gray-600 mb-1.5 flex items-center gap-1"><PenLine className="w-3.5 h-3.5" /> Ask the shopper to sign below</p>
      <div className="relative">
        <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          className="w-full h-32 rounded-xl border-2 border-gray-300 bg-white touch-none cursor-crosshair" />
        {strokes === 0 && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-300">Sign here</span>}
        <button onClick={clear} className="absolute top-2 right-2 bg-white rounded-full p-1.5 shadow border border-gray-100"><Eraser className="w-3.5 h-3.5 text-gray-500" /></button>
      </div>
    </div>
  );
}
