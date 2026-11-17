'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ProductImage, isPhoto } from '@/src/components/ProductImage';

/** Resize an image file in the browser to max `size` px (longest side) and return a JPEG data URL. */
export async function fileToPhoto(file: File, size = 720, quality = 0.78): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Not an image'));
      i.src = url;
    });
    const scale = Math.min(1, size / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Product photo picker for the Admin product form.
 * Demo: the resized photo is stored in the browser with the product. Production: uploaded to file storage (S3/CDN).
 */
export function PhotoField({ value, fallbackEmoji, onChange, disabled }: {
  value: string; fallbackEmoji: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const photo = isPhoto(value);

  const pick = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Choose a photo (JPG, PNG or WebP)');
    if (file.size > 15 * 1024 * 1024) return toast.error('Photo is too large (max 15 MB)');
    setBusy(true);
    try {
      const data = await fileToPhoto(file);
      onChange(data);
      toast.success('Photo added', { description: `Resized to ${Math.round((data.length * 0.75) / 1024)} KB` });
    } catch {
      toast.error('Could not read that photo');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-20 h-20 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-[#faf6f2] text-4xl flex items-center justify-center">
        <ProductImage image={photo ? value : (value || fallbackEmoji)} fill alt="Product photo" />
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <button type="button" disabled={disabled || busy} onClick={() => input.current?.click()}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <ImagePlus className="w-4 h-4" /> {busy ? 'Resizing…' : photo ? 'Change photo' : 'Upload photo'}
        </button>
        {photo && (
          <button type="button" disabled={disabled} onClick={() => onChange(fallbackEmoji)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#c8151d] disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" /> Remove photo
          </button>
        )}
        <p className="text-[11px] text-gray-400 leading-tight">JPG/PNG from your phone or computer. Resized automatically.</p>
      </div>
    </div>
  );
}
