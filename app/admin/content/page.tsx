'use client';

import { useState } from 'react';
import {
  Plus, Pencil, Trash2, ArrowUp, ArrowDown, FileText, Palette, Wrench, Bell, Moon, Image as ImageIcon, LayoutList, Save, Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, Panel, Pill, inputClass, selectClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/shadcn/tabs';
import { Textarea } from '@/src/components/ui/shadcn/textarea';
import { Field, Toggle } from '@/src/components/admin/ui';
import { addAudit, mutate, uid, useStore } from '@/src/lib/store';
import { can, cityName } from '@/src/lib/logic';
import type { Banner } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';
import { ProductImage } from '@/src/components/ProductImage';

// Literal class strings so Tailwind generates them.
const GRADIENTS = [
  { label: 'Royal blue', value: 'from-[#c8151d] to-[#ec1b26]' },
  { label: 'Mango', value: 'from-amber-400 to-orange-500' },
  { label: 'Fresh green', value: 'from-emerald-500 to-teal-500' },
  { label: 'Berry', value: 'from-pink-500 to-rose-500' },
  { label: 'Grape', value: 'from-violet-500 to-purple-600' },
  { label: 'Ocean', value: 'from-sky-500 to-cyan-500' },
  { label: 'Charcoal', value: 'from-gray-700 to-gray-900' },
];

function BannerCard({ b, small }: { b: Pick<Banner, 'title' | 'subtitle' | 'color' | 'emoji'>; small?: boolean }) {
  return (
    <div className={cn('relative overflow-hidden rounded-2xl bg-gradient-to-r text-white shadow-sm', b.color, small ? 'p-3 h-20' : 'p-4 h-28')}>
      <div className="relative z-10 max-w-[70%]">
        <p className={cn('font-bold leading-tight', small ? 'text-sm' : 'text-base')}>{b.title || 'Banner title'}</p>
        <p className={cn('opacity-90 mt-0.5', small ? 'text-[11px]' : 'text-xs')}>{b.subtitle || 'Subtitle'}</p>
        {!small && <span className="inline-block mt-2 text-[10px] font-semibold bg-white/25 rounded-full px-2 py-0.5">Shop now</span>}
      </div>
      <span className={cn('absolute right-3 top-1/2 -translate-y-1/2', small ? 'text-4xl' : 'text-6xl')}>{b.emoji}</span>
    </div>
  );
}

export default function ContentPage() {
  const s = useStore();
  if (!can(s, 'promotions.view')) {
    return <DashboardLayout title="App Content" eyebrow="Administration" hideBranch><AccessDenied permission="promotions.view" /></DashboardLayout>;
  }
  const editable = can(s, 'promotions.edit') || can(s, 'settings.edit');
  return (
    <DashboardLayout title="App Content & Branding" eyebrow="Administration" hideBranch>
      <p className="text-sm text-gray-500 mb-4 flex items-start gap-1.5">
        <Smartphone className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />Remote configuration: everything here appears in the Customer and Rider apps without an app update.
      </p>
      <Tabs defaultValue="home" className="space-y-4">
        <TabsList className="max-w-full overflow-x-auto overflow-y-hidden justify-start">
          <TabsTrigger value="home">Home screen</TabsTrigger>
          <TabsTrigger value="pages">Static pages</TabsTrigger>
          <TabsTrigger value="brand">Brand & app status</TabsTrigger>
          <TabsTrigger value="notif">Notification templates</TabsTrigger>
        </TabsList>
        <TabsContent value="home"><HomeTab editable={editable} /></TabsContent>
        <TabsContent value="pages"><PagesTab editable={editable} /></TabsContent>
        <TabsContent value="brand"><BrandTab editable={editable} /></TabsContent>
        <TabsContent value="notif"><NotifTab editable={editable} /></TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------- Home

const DEFAULT_SECTIONS = ['Banners carousel', 'Featured categories', 'Deals of the day', 'Buy again', 'Bulalo weekend', 'Cut fresh today'];

function HomeTab({ editable }: { editable: boolean }) {
  const s = useStore();
  const [dlg, setDlg] = useState<Banner | 'new' | null>(null);
  const [sections, setSections] = useState(DEFAULT_SECTIONS.map((name) => ({ name, on: true })));
  const [previewCity, setPreviewCity] = useState('all');
  const topCats = s.categories.filter((c) => !c.parentId).sort((a, b) => a.sort - b.sort);

  const toggleBanner = (b: Banner) => {
    if (!editable) return;
    mutate((d) => {
      d.banners.find((x) => x.id === b.id)!.active = !b.active;
      addAudit(d, { module: 'Promotions', action: 'Banner status', detail: `Banner “${b.title}” ${b.active ? 'hidden' : 'published'}`, oldValue: b.active ? 'active' : 'inactive', newValue: b.active ? 'inactive' : 'active' });
    });
    toast.success(b.active ? 'Banner hidden' : 'Banner published', { description: 'Customer App home updates instantly.' });
  };
  const delBanner = (b: Banner) => {
    if (!confirm(`Delete banner “${b.title}”?`)) return;
    mutate((d) => {
      d.banners = d.banners.filter((x) => x.id !== b.id);
      addAudit(d, { module: 'Promotions', action: 'Delete banner', detail: `Banner “${b.title}” deleted` });
    });
    toast.success('Banner deleted');
  };
  const moveBanner = (i: number, dir: -1 | 1) => {
    mutate((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.banners.length) return;
      [d.banners[i], d.banners[j]] = [d.banners[j], d.banners[i]];
      addAudit(d, { module: 'Promotions', action: 'Reorder banners', detail: `“${d.banners[j].title}” moved ${dir < 0 ? 'up' : 'down'}` });
    });
  };
  const moveCat = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (!editable || j < 0 || j >= topCats.length) return;
    const a = topCats[i], b = topCats[j];
    mutate((d) => {
      const x = d.categories.find((c) => c.id === a.id)!, y = d.categories.find((c) => c.id === b.id)!;
      [x.sort, y.sort] = [b.sort, a.sort];
      addAudit(d, { module: 'Catalog', action: 'Reorder featured categories', detail: `${a.name} moved ${dir < 0 ? 'up' : 'down'}`, oldValue: `#${i + 1}`, newValue: `#${j + 1}` });
    });
  };
  const moveSection = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const n = [...sections];
    [n[i], n[j]] = [n[j], n[i]];
    setSections(n);
  };

  const previewBanners = s.banners.filter((b) => b.active && (!b.cityId || previewCity === 'all' || b.cityId === previewCity));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
      <div className="space-y-5">
        <Panel title={<h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><ImageIcon className="w-4 h-4 text-[#c8151d]" strokeWidth={1.75} />Banners</h2>}
          action={editable && <Button size="sm" onClick={() => setDlg('new')}><Plus className="w-4 h-4" strokeWidth={1.75} />New banner</Button>} bodyClass="p-0">
          <ul className="divide-y divide-gray-100">
            {s.banners.map((b, i) => (
              <li key={b.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-3 sm:gap-4">
                <div className="w-full sm:w-56 shrink-0"><BannerCard b={b} small /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{b.title}</p>
                  <p className="text-xs text-gray-500 truncate">{b.subtitle}</p>
                  <div className="mt-1 flex gap-1">
                    <Pill>{b.cityId ? cityName(s, b.cityId) : 'All cities'}</Pill>
                    <Pill className={b.active ? 'bg-green-100 text-green-800' : ''}>{b.active ? 'Live' : 'Hidden'}</Pill>
                  </div>
                </div>
                {editable && (
                  <div className="flex items-center gap-1">
                    <Toggle checked={b.active} onChange={() => toggleBanner(b)} label="Active" />
                    <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => moveBanner(i, -1)}><ArrowUp className="w-4 h-4" strokeWidth={1.75} /></Button>
                    <Button size="icon" variant="ghost" disabled={i === s.banners.length - 1} onClick={() => moveBanner(i, 1)}><ArrowDown className="w-4 h-4" strokeWidth={1.75} /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDlg(b)}><Pencil className="w-4 h-4" strokeWidth={1.75} /></Button>
                    <Button size="icon" variant="ghost" className="text-[#dc2626]" onClick={() => delBanner(b)}><Trash2 className="w-4 h-4" strokeWidth={1.75} /></Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Panel title={<h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><LayoutList className="w-4 h-4 text-[#c8151d]" strokeWidth={1.75} />Home sections</h2>} bodyClass="p-2">
            {sections.map((sec, i) => (
              <div key={sec.name} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50">
                <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                <span className={cn('flex-1 text-sm', sec.on ? 'text-gray-800' : 'text-gray-400 line-through')}>{sec.name}</span>
                <Toggle size="sm" checked={sec.on} disabled={!editable} onChange={(v) => setSections(sections.map((x, k) => (k === i ? { ...x, on: v } : x)))} label="Show section" />
                <Button size="icon" variant="ghost" disabled={!editable || i === 0} onClick={() => moveSection(i, -1)}><ArrowUp className="w-3.5 h-3.5" strokeWidth={1.75} /></Button>
                <Button size="icon" variant="ghost" disabled={!editable || i === sections.length - 1} onClick={() => moveSection(i, 1)}><ArrowDown className="w-3.5 h-3.5" strokeWidth={1.75} /></Button>
              </div>
            ))}
            {editable && (
              <div className="px-3 pt-2">
                <Button size="sm" variant="outline" onClick={() => { mutate((d) => addAudit(d, { module: 'Promotions', action: 'Home layout', detail: `Home sections: ${sections.filter((x) => x.on).map((x) => x.name).join(' → ')}` })); toast.success('Home layout published'); }}>
                  <Save className="w-3.5 h-3.5" strokeWidth={1.75} />Publish layout
                </Button>
              </div>
            )}
          </Panel>
          <Panel title="Featured categories" bodyClass="p-2">
            {topCats.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                <span className="text-lg">{c.icon}</span>
                <span className="flex-1 text-sm text-gray-800">{c.name}</span>
                <Button size="icon" variant="ghost" disabled={!editable || i === 0} onClick={() => moveCat(i, -1)}><ArrowUp className="w-3.5 h-3.5" strokeWidth={1.75} /></Button>
                <Button size="icon" variant="ghost" disabled={!editable || i === topCats.length - 1} onClick={() => moveCat(i, 1)}><ArrowDown className="w-3.5 h-3.5" strokeWidth={1.75} /></Button>
              </div>
            ))}
          </Panel>
        </div>
      </div>

      {/* Live phone preview */}
      <div className="xl:sticky xl:top-20 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">Live preview</p>
          <select className={cn(selectClass, 'h-8 text-xs')} value={previewCity} onChange={(e) => setPreviewCity(e.target.value)}>
            <option value="all">Any city</option>
            {s.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="rounded-[32px] bg-[#0f0f1a] p-2.5 shadow-xl">
          <div className="rounded-[24px] bg-white overflow-hidden h-[560px] overflow-y-auto">
            <div className="bg-[#c8151d] text-white px-4 pt-6 pb-4">
              <p className="text-[11px] opacity-80">Deliver to · Home</p>
              <p className="font-semibold">Jovanne’s Meat Shop</p>
              <div className="mt-2 h-8 rounded-lg bg-white/15 text-[11px] flex items-center px-3 opacity-90">Search beef, pork, chicken…</div>
            </div>
            <div className="p-3 space-y-4">
              {sections.filter((x) => x.on).map((sec) => {
                if (sec.name === 'Banners carousel') {
                  return previewBanners.length ? (
                    <div key={sec.name} className="flex gap-2 overflow-x-auto snap-x">
                      {previewBanners.map((b) => <div key={b.id} className="min-w-[260px] snap-start"><BannerCard b={b} /></div>)}
                    </div>
                  ) : <p key={sec.name} className="text-[11px] text-gray-400">No live banners for this city</p>;
                }
                if (sec.name === 'Featured categories') {
                  return (
                    <div key={sec.name}>
                      <p className="text-xs font-semibold text-gray-800 mb-2">Categories</p>
                      <div className="grid grid-cols-4 gap-2">
                        {topCats.slice(0, 8).map((c) => (
                          <div key={c.id} className="flex flex-col items-center gap-1">
                            <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-xl">{c.icon}</div>
                            <span className="text-[9px] text-gray-600 text-center leading-tight">{c.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={sec.name}>
                    <p className="text-xs font-semibold text-gray-800 mb-2">{sec.name}</p>
                    <div className="flex gap-2">
                      {s.products.filter((p) => p.status === 'active').slice(DEFAULT_SECTIONS.indexOf(sec.name) * 3, DEFAULT_SECTIONS.indexOf(sec.name) * 3 + 3).map((p) => (
                        <div key={p.id} className="flex-1 rounded-lg border border-gray-100 p-2">
                          <div className="text-2xl text-center"><ProductImage image={p.image} /></div>
                          <p className="text-[9px] text-gray-700 truncate mt-1">{p.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {dlg && <BannerDialog banner={dlg === 'new' ? null : dlg} onClose={() => setDlg(null)} />}
    </div>
  );
}

function BannerDialog({ banner, onClose }: { banner: Banner | null; onClose: () => void }) {
  const s = useStore();
  const [f, setF] = useState({
    title: banner?.title ?? '', subtitle: banner?.subtitle ?? '', color: banner?.color ?? GRADIENTS[0].value,
    emoji: banner?.emoji ?? '🥩', active: banner?.active ?? true, cityId: banner?.cityId ?? '',
  });
  const save = () => {
    if (!f.title.trim()) return toast.error('Title is required');
    const data = { ...f, cityId: f.cityId || undefined };
    mutate((d) => {
      if (banner) {
        Object.assign(d.banners.find((x) => x.id === banner.id)!, data);
        addAudit(d, { module: 'Promotions', action: 'Edit banner', detail: `Banner “${data.title}” updated`, oldValue: banner.title, newValue: data.title });
      } else {
        d.banners.unshift({ id: uid('bn'), ...data });
        addAudit(d, { module: 'Promotions', action: 'Create banner', detail: `Banner “${data.title}” (${data.cityId ? cityName(d, data.cityId) : 'all cities'})`, newValue: data.active ? 'active' : 'inactive' });
      }
    });
    toast.success(banner ? 'Banner updated' : 'Banner created', { description: data.active ? 'Live in the Customer App now.' : 'Saved as hidden.' });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{banner ? 'Edit banner' : 'New banner'}</DialogTitle>
          <DialogDescription>Shown at the top of the Customer App home screen.</DialogDescription>
        </DialogHeader>
        <BannerCard b={f} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title" className="col-span-2"><input className={inputClass} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Payday Pork Sale" /></Field>
          <Field label="Subtitle" className="col-span-2"><input className={inputClass} value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} placeholder="₱20 off per kg of liempo" /></Field>
          <Field label="Emoji / image"><input className={inputClass} value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} /></Field>
          <Field label="City targeting">
            <select className={selectClass} value={f.cityId} onChange={(e) => setF({ ...f, cityId: e.target.value })}>
              <option value="">All cities</option>
              {s.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <div className="col-span-2">
            <p className="text-xs font-medium text-gray-600 mb-1.5">Colour</p>
            <div className="flex flex-wrap gap-2">
              {GRADIENTS.map((g) => (
                <button key={g.value} type="button" title={g.label} onClick={() => setF({ ...f, color: g.value })}
                  className={cn('w-9 h-9 rounded-lg bg-gradient-to-r ring-offset-2', g.value, f.color === g.value && 'ring-2 ring-[#c8151d]')} />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm col-span-2"><Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" />Publish immediately</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{banner ? 'Save' : 'Create banner'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Static pages

function PagesTab({ editable }: { editable: boolean }) {
  const [pages, setPages] = useState([
    { name: 'Terms of Service', version: '3.2', updated: '2026-09-14', reaccept: true },
    { name: 'Privacy Policy', version: '2.4', updated: '2026-08-01', reaccept: true },
    { name: 'FAQ', version: '5.0', updated: '2026-10-28', reaccept: false },
    { name: 'About Jovanne’s Meat Shop', version: '1.3', updated: '2026-03-02', reaccept: false },
    { name: 'Contact us', version: '1.1', updated: '2026-05-19', reaccept: false },
  ]);
  const publish = (i: number) => {
    const p = pages[i];
    const [maj, min] = p.version.split('.').map(Number);
    const nv = `${maj}.${min + 1}`;
    setPages(pages.map((x, k) => (k === i ? { ...x, version: nv, updated: new Date().toISOString().slice(0, 10) } : x)));
    mutate((d) => addAudit(d, { module: 'Promotions', action: 'Publish page', detail: `${p.name} published${p.reaccept ? ' — customers must re-accept on next open' : ''}`, oldValue: `v${p.version}`, newValue: `v${nv}` }));
    toast.success(`${p.name} v${nv} published`, { description: p.reaccept ? 'Customers will be asked to accept the new version.' : undefined });
  };
  return (
    <Panel title={<h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><FileText className="w-4 h-4 text-[#c8151d]" strokeWidth={1.75} />Static pages</h2>} bodyClass="p-0">
      <ul className="divide-y divide-gray-100">
        {pages.map((p, i) => (
          <li key={p.name} className="px-5 py-3 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <p className="font-medium text-gray-900">{p.name}</p>
              <p className="text-xs text-gray-500">Version <b>v{p.version}</b> · updated {p.updated}</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <Toggle size="sm" checked={p.reaccept} disabled={!editable} onChange={(v) => setPages(pages.map((x, k) => (k === i ? { ...x, reaccept: v } : x)))} label="Require re-acceptance" />
              Require re-acceptance
            </label>
            {editable && <Button size="sm" variant="outline" onClick={() => publish(i)}>Publish new version</Button>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------- Brand

function BrandTab({ editable }: { editable: boolean }) {
  const [brand, setBrand] = useState({ name: 'Jovanne’s Meat Shop', color: '#c8151d', logo: '🥩', tagline: 'Fresh meat, cut your way, delivered cold' });
  const [maintenance, setMaintenance] = useState(false);
  const [maintMsg, setMaintMsg] = useState('We are upgrading our systems. Back by 6:00 AM.');
  const [forced, setForced] = useState(false);
  const [minVersion, setMinVersion] = useState('2.4.0');
  const audit = (action: string, detail: string, oldValue?: string, newValue?: string) =>
    mutate((d) => addAudit(d, { module: 'Settings', action, detail, oldValue, newValue }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Panel title={<h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Palette className="w-4 h-4 text-[#c8151d]" strokeWidth={1.75} />Brand settings</h2>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="App name"><input className={inputClass} disabled={!editable} value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} /></Field>
          <Field label="Logo (emoji / upload)"><input className={inputClass} disabled={!editable} value={brand.logo} onChange={(e) => setBrand({ ...brand, logo: e.target.value })} /></Field>
          <Field label="Primary colour">
            <div className="flex items-center gap-2">
              <input type="color" disabled={!editable} value={brand.color} onChange={(e) => setBrand({ ...brand, color: e.target.value })} className="h-9 w-12 rounded border border-gray-300" />
              <input className={cn(inputClass, 'flex-1 font-mono')} disabled={!editable} value={brand.color} onChange={(e) => setBrand({ ...brand, color: e.target.value })} />
            </div>
          </Field>
          <Field label="Tagline"><input className={inputClass} disabled={!editable} value={brand.tagline} onChange={(e) => setBrand({ ...brand, tagline: e.target.value })} /></Field>
        </div>
        <div className="mt-4 grid grid-cols-1 min-[420px]:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Splash screen</p>
            <div className="rounded-2xl h-48 flex flex-col items-center justify-center text-white" style={{ background: brand.color }}>
              <span className="text-5xl">{brand.logo}</span>
              <p className="font-bold text-lg mt-2">{brand.name}</p>
              <p className="text-[11px] opacity-80">{brand.tagline}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1.5">App header & button</p>
            <div className="rounded-2xl h-48 border border-gray-200 overflow-hidden flex flex-col">
              <div className="px-3 py-3 text-white text-sm font-semibold flex items-center gap-2" style={{ background: brand.color }}><span>{brand.logo}</span>{brand.name}</div>
              <div className="flex-1 p-3 flex flex-col justify-end">
                <button className="h-9 rounded-lg text-white text-sm font-medium" style={{ background: brand.color }}>Checkout</button>
              </div>
            </div>
          </div>
        </div>
        {editable && <Button className="mt-4" onClick={() => { audit('Brand settings', `Brand updated: ${brand.name} · ${brand.color}`); toast.success('Brand published', { description: 'Apps pick it up on next launch — no app release needed.' }); }}><Save className="w-4 h-4" strokeWidth={1.75} />Publish brand</Button>}
      </Panel>

      <Panel title={<h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Wrench className="w-4 h-4 text-[#c8151d]" strokeWidth={1.75} />App status</h2>}>
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <Toggle checked={maintenance} disabled={!editable} onChange={(v) => { setMaintenance(v); audit('Maintenance mode', `Maintenance mode ${v ? 'ON' : 'OFF'}`, v ? 'off' : 'on', v ? 'on' : 'off'); toast[v ? 'warning' : 'success'](v ? 'Maintenance mode is ON' : 'Maintenance mode is OFF', { description: v ? 'Customers see the maintenance screen.' : 'Apps are open again.' }); }} label="Maintenance mode" />
            <div className="flex-1">
              <p className="font-medium text-sm text-gray-900">Maintenance mode</p>
              <p className="text-xs text-gray-500">Customer App shows a maintenance screen; ordering is blocked.</p>
              <input className={cn(inputClass, 'w-full mt-2')} disabled={!editable} value={maintMsg} onChange={(e) => setMaintMsg(e.target.value)} />
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Toggle checked={forced} disabled={!editable} onChange={(v) => { setForced(v); audit('Forced update', `Forced update ${v ? `ON (min v${minVersion})` : 'OFF'}`, v ? 'off' : 'on', v ? 'on' : 'off'); toast.success(v ? `Users below v${minVersion} must update` : 'Forced update off'); }} label="Forced update" />
            <div className="flex-1">
              <p className="font-medium text-sm text-gray-900">Forced update</p>
              <p className="text-xs text-gray-500">Users on an older app version must update before continuing.</p>
              <div className="flex items-center gap-2 mt-2"><span className="text-xs text-gray-500">Minimum version</span><input className={cn(inputClass, 'w-28 font-mono')} disabled={!editable} value={minVersion} onChange={(e) => setMinVersion(e.target.value)} /></div>
            </div>
          </div>
          {(maintenance || forced) && (
            <div className="rounded-2xl border border-gray-200 p-6 text-center bg-gray-50">
              <span className="text-4xl">{maintenance ? '🛠️' : '⬆️'}</span>
              <p className="font-semibold mt-2 text-gray-900">{maintenance ? 'We’ll be right back' : 'Update required'}</p>
              <p className="text-xs text-gray-500 mt-1">{maintenance ? maintMsg : `Please update ${brand.name} to v${minVersion} or later to keep ordering.`}</p>
              <p className="text-[10px] text-gray-400 mt-3">Preview of the customer screen</p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- Notifications

const VARS = ['{customer_name}', '{order_number}', '{eta}', '{branch_name}', '{total}'];
const SAMPLE: Record<string, string> = { '{customer_name}': 'Maria', '{order_number}': 'DGS-10234', '{eta}': '3:45 PM', '{branch_name}': 'Digos', '{total}': '₱1,284.50' };

function NotifTab({ editable }: { editable: boolean }) {
  const [tpls, setTpls] = useState([
    { id: 'placed', name: 'Order placed', channels: { push: true, sms: false, email: true }, title: 'Order received 🥩', body: 'Hi {customer_name}, we got your order {order_number}. We’ll confirm it shortly.' },
    { id: 'confirmed', name: 'Order confirmed', channels: { push: true, sms: true, email: false }, title: 'Order confirmed ✅', body: '{branch_name} is preparing order {order_number}. Estimated arrival {eta}.' },
    { id: 'ofd', name: 'Out for delivery', channels: { push: true, sms: true, email: false }, title: 'On the way 🛵', body: 'Your rider is on the way with {order_number}, packed cold in an insulated bag. Arriving around {eta}.' },
    { id: 'delivered', name: 'Delivered', channels: { push: true, sms: false, email: true }, title: 'Delivered 🎉', body: 'Enjoy, {customer_name}! Order {order_number} ({total}) was delivered. Rate your experience.' },
  ]);
  const [sel, setSel] = useState('placed');
  const [quiet, setQuiet] = useState({ on: true, from: '21:00', to: '07:00' });
  const t = tpls.find((x) => x.id === sel)!;
  const upd = (patch: Partial<typeof t>) => setTpls(tpls.map((x) => (x.id === sel ? { ...x, ...patch } : x)));
  const render = (str: string) => VARS.reduce((a, v) => a.split(v).join(SAMPLE[v]), str);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_300px] gap-5 items-start">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-2">
        {tpls.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={cn('w-full text-left px-3 py-2 rounded-lg text-sm', sel === x.id ? 'bg-[#c8151d]/10 text-[#c8151d] font-medium' : 'text-gray-700 hover:bg-gray-50')}>
            {x.name}
            <span className="block text-[10px] text-gray-400">{Object.entries(x.channels).filter(([, v]) => v).map(([k]) => k.toUpperCase()).join(' · ')}</span>
          </button>
        ))}
      </div>

      <Panel title={<h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Bell className="w-4 h-4 text-[#c8151d]" strokeWidth={1.75} />{t.name}</h2>}>
        <div className="space-y-3">
          <div className="flex gap-4">
            {(['push', 'sms', 'email'] as const).map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm"><Toggle size="sm" disabled={!editable} checked={t.channels[c]} onChange={(v) => upd({ channels: { ...t.channels, [c]: v } })} label={c} />{c === 'sms' ? 'SMS' : c[0].toUpperCase() + c.slice(1)}</label>
            ))}
          </div>
          <Field label="Title"><input className={inputClass} disabled={!editable} value={t.title} onChange={(e) => upd({ title: e.target.value })} /></Field>
          <Field label="Message"><Textarea disabled={!editable} rows={4} value={t.body} onChange={(e) => upd({ body: e.target.value })} /></Field>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-gray-500">Insert variable:</span>
            {VARS.map((v) => (
              <button key={v} disabled={!editable} onClick={() => upd({ body: `${t.body} ${v}` })} className="text-[11px] font-mono rounded bg-gray-100 hover:bg-[#c8151d]/10 hover:text-[#c8151d] px-1.5 py-0.5">{v}</button>
            ))}
          </div>
          {editable && <Button onClick={() => { mutate((d) => addAudit(d, { module: 'Settings', action: 'Notification template', detail: `Template “${t.name}” updated (${Object.entries(t.channels).filter(([, v]) => v).map(([k]) => k).join(', ')})` })); toast.success(`“${t.name}” template saved`); }}><Save className="w-4 h-4" strokeWidth={1.75} />Save template</Button>}
        </div>
      </Panel>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Push preview</p>
          <div className="rounded-2xl bg-gray-900/90 p-3 text-white shadow-lg">
            <div className="flex items-center gap-2 text-[10px] opacity-70"><span className="w-4 h-4 rounded bg-[#c8151d] flex items-center justify-center text-[9px]">🥩</span>FRESHMART MEATS · now</div>
            <p className="text-sm font-semibold mt-1">{render(t.title)}</p>
            <p className="text-xs opacity-90 mt-0.5">{render(t.body)}</p>
          </div>
          {t.channels.sms && (
            <>
              <p className="text-xs font-medium text-gray-500 mt-3 mb-1.5">SMS preview</p>
              <div className="rounded-2xl rounded-bl-sm bg-gray-100 p-3 text-xs text-gray-800">Jovanne’s Meat Shop: {render(t.body)}</div>
            </>
          )}
        </div>
        <Panel title={<h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Moon className="w-4 h-4 text-[#c8151d]" strokeWidth={1.75} />Quiet hours</h2>}>
          <label className="flex items-center gap-2 text-sm mb-3"><Toggle size="sm" disabled={!editable} checked={quiet.on} onChange={(v) => setQuiet({ ...quiet, on: v })} label="Quiet hours" />Hold promotional pushes</label>
          <div className="flex flex-wrap items-center gap-2">
            <input type="time" className={inputClass} disabled={!editable || !quiet.on} value={quiet.from} onChange={(e) => setQuiet({ ...quiet, from: e.target.value })} />
            <span className="text-gray-400 text-sm">to</span>
            <input type="time" className={inputClass} disabled={!editable || !quiet.on} value={quiet.to} onChange={(e) => setQuiet({ ...quiet, to: e.target.value })} />
          </div>
          <p className="text-[11px] text-gray-500 mt-2">Order updates are always delivered; only marketing messages wait until quiet hours end.</p>
          {editable && <Button size="sm" variant="outline" className="mt-3" onClick={() => { mutate((d) => addAudit(d, { module: 'Settings', action: 'Quiet hours', detail: quiet.on ? `Quiet hours ${quiet.from}–${quiet.to}` : 'Quiet hours off' })); toast.success('Quiet hours saved'); }}>Save</Button>}
        </Panel>
      </div>
    </div>
  );
}
