'use client';

// Customer website sign-in / sign-up (spec v6, Phase 1): Google or username + password (no SMS code),
// then a required Complete Profile step. Demo only: accounts (and passwords) are saved in this browser's localStorage.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Check, Eye, EyeOff, TriangleAlert, X } from 'lucide-react';
import type { AppState, Customer } from '@/src/lib/types';
import { mutate, uid } from '@/src/lib/store';
import { cn } from '@/src/lib/utils';
import { BrandWordmark } from '@/src/components/brand/Brand';
import { Cleavers } from '@/src/components/shop/Cleavers';
import { safeNext } from '@/src/components/shop/RequireAuth';
import { Container, DIGOS_CENTER, PrimaryButton, useShop } from './shared';
import { PinPicker, type Pin } from './PinPicker';

export function signInShopper(id: string) {
  mutate((d) => {
    d.session.shopperId = id;
    d.session.shopperSignedIn = true;
  });
}

/** `?next=` of the current page (a path inside this site). */
function useNext(fallback = '/') {
  const params = useSearchParams();
  return safeNext(params.get('next'), fallback);
}
const withNext = (path: string, next: string) => (next && next !== '/' ? `${path}?next=${encodeURIComponent(next)}` : path);

// ---------- layout ----------
function AuthLayout({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Container className="py-6 md:py-12">
      <div className="max-w-md md:max-w-4xl mx-auto md:grid md:grid-cols-[1fr_1.1fr] rounded-3xl overflow-hidden md:shadow-xl md:border md:border-[#eadfd6] md:bg-white">
        <div className="hidden md:flex relative bg-[#2a2322] text-white p-10 flex-col justify-between overflow-hidden">
          <Cleavers className="absolute -right-16 -bottom-16 w-80 text-[#ae754d] opacity-25" />
          <div className="relative">
            <BrandWordmark size="lg" />
            <p className="mt-4 font-display uppercase tracking-[0.25em] text-[#d9a07a] text-sm">Premium Quality Meats</p>
          </div>
          <ul className="relative space-y-3 text-sm text-white/85">
            {['Cut to order by our butchers', 'Packed cold with ice packs', 'Pay by actual weight', 'Delivery or pickup in Digos City'].map((t) => (
              <li key={t} className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-[#c8151d] flex items-center justify-center shrink-0"><Check className="w-3.5 h-3.5" strokeWidth={3} /></span>{t}</li>
            ))}
          </ul>
        </div>
        <div className="md:p-10">
          <h1 className="font-display uppercase tracking-wide text-2xl md:text-3xl font-semibold text-[#2a2322]">{title}</h1>
          {sub && <p className="text-sm text-gray-600 mt-1">{sub}</p>}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </Container>
  );
}

function GoogleG() {
  return <span className="font-black text-lg leading-none bg-[conic-gradient(#ea4335_0_25%,#fbbc05_0_50%,#34a853_0_75%,#4285f4_0)] bg-clip-text text-transparent" aria-hidden>G</span>;
}

function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full h-12 rounded-full bg-white border border-gray-300 text-sm font-semibold text-gray-800 flex items-center justify-center gap-2.5 shadow-sm hover:bg-gray-50 active:scale-[0.99]">
      <GoogleG /> Continue with Google
    </button>
  );
}

function OrDivider() {
  return <div className="flex items-center gap-3 text-xs text-gray-500 my-5"><span className="flex-1 h-px bg-gray-200" /> or <span className="flex-1 h-px bg-gray-200" /></div>;
}

/** Google sign-in (demo chooser). Existing complete accounts sign in; new or unfinished ones go to Complete Profile. */
function useGoogleSignIn(next: string) {
  const { s, replace } = useShop();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const pick = (email: string) => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setError('Enter a valid email address.'); return; }
    const c = s.customers.find((x) => x.googleEmail?.toLowerCase() === e);
    if (c?.blocked) { setError('This account is blocked. Please call the branch.'); return; }
    setError('');
    setOpen(false);
    let id = c?.id;
    if (!id) {
      const newId = uid('cu');
      id = newId;
      mutate((d) => {
        d.customers.push({
          id: newId, name: e.split('@')[0], mobile: '', email: e, googleEmail: e, cityId: 'c-dgs', addresses: [], createdAt: new Date().toISOString(),
          blocked: false, storeCredit: 0, points: 0, source: 'app', profileComplete: false,
        });
      });
    }
    signInShopper(id);
    replace(c?.profileComplete ? next : withNext('/signup/profile', next));
  };
  const chooser = open ? <GoogleChooser s={s} error={error} onPick={pick} onClose={() => { setOpen(false); setError(''); }} /> : null;
  return { openGoogle: () => setOpen(true), chooser };
}

/** Signed-in customers with a complete profile do not need the sign-in pages. */
function useLeaveIfSignedIn(next: string) {
  const { shopper, replace } = useShop();
  const done = !!shopper?.profileComplete;
  useEffect(() => { if (done) replace(next); }, [done, next, replace]);
  return done;
}

// ====================== SIGN IN ======================
export function SignInScreen() {
  const { s, replace } = useShop();
  const next = useNext('/');
  const leaving = useLeaveIfSignedIn(next);
  const { openGoogle, chooser } = useGoogleSignIn(next);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const submit = () => {
    const u = username.trim().toLowerCase();
    const c = s.customers.find((x) => x.username?.toLowerCase() === u);
    if (!u || !password) { setErr('Enter your username and password.'); return; }
    if (!c || c.password !== password) { setErr('Wrong username or password.'); return; }
    if (c.blocked) { setErr('This account is blocked. Please call the branch.'); return; }
    signInShopper(c.id);
    replace(c.profileComplete ? next : withNext('/signup/profile', next));
  };
  if (leaving) return null;
  return (
    <AuthLayout title="Sign in" sub="Welcome back to Jovanne’s Meat Shop">
      <GoogleButton onClick={openGoogle} />
      <OrDivider />
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3" noValidate>
        <Field label="Username">
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" className={inputCls} placeholder="e.g. mariasantos" />
        </Field>
        <Field label="Password">
          <PasswordInput value={password} onChange={setPassword} show={show} setShow={setShow} autoComplete="current-password" />
        </Field>
        {err && <p className="text-sm text-[#a3111a] flex items-center gap-1" role="alert"><TriangleAlert className="w-4 h-4" /> {err}</p>}
        <PrimaryButton type="submit" className="mt-2">Sign in</PrimaryButton>
        <p className="text-xs text-gray-500 text-center">Demo account: mariasantos / demo1234</p>
      </form>
      <p className="text-sm text-gray-700 text-center mt-6">New to Jovanne’s? <Link href={withNext('/signup', next)} className="font-semibold text-[#c8151d] hover:underline">Create an account</Link></p>
      {chooser}
    </AuthLayout>
  );
}

// ====================== SIGN UP ======================
export function SignUpScreen() {
  const next = useNext('/');
  const leaving = useLeaveIfSignedIn(next);
  const { openGoogle, chooser } = useGoogleSignIn(next);
  if (leaving) return null;
  return (
    <AuthLayout title="Create your account" sub="Order fresh meat for delivery or pickup in a few clicks.">
      <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-700 mb-5 md:hidden">
        <div className="rounded-2xl bg-white border border-[#eadfd6] py-3"><p className="text-xl" aria-hidden>🔪</p><p className="mt-1 font-medium">Cut to order</p></div>
        <div className="rounded-2xl bg-white border border-[#eadfd6] py-3"><p className="text-xl" aria-hidden>🧊</p><p className="mt-1 font-medium">Packed cold</p></div>
        <div className="rounded-2xl bg-white border border-[#eadfd6] py-3"><p className="text-xl" aria-hidden>⚖️</p><p className="mt-1 font-medium">Pay by weight</p></div>
      </div>
      <GoogleButton onClick={openGoogle} />
      <OrDivider />
      <Link href={withNext('/signup/profile', next)} className="w-full h-12 rounded-full border-2 border-[#c8151d] text-[#c8151d] hover:bg-[#fdf5f5] text-sm font-semibold flex items-center justify-center">Sign up with a username</Link>
      <p className="text-sm text-gray-700 text-center mt-6">Already have an account? <Link href={withNext('/signin', next)} className="font-semibold text-[#c8151d] hover:underline">Sign in</Link></p>
      <p className="text-xs text-gray-500 text-center mt-3">Demo website · accounts are saved in this browser only.</p>
      {chooser}
    </AuthLayout>
  );
}

// ====================== COMPLETE PROFILE ======================
export function CompleteProfileScreen() {
  const { s, shopper, replace, signOut } = useShop();
  const next = useNext('/');
  const complete = !!shopper?.profileComplete;
  useEffect(() => { if (complete) replace(next); }, [complete, next, replace]);
  if (complete) return null;
  return (
    <AuthLayout title="Complete your profile" sub={shopper?.googleEmail ? `Google account: ${shopper.googleEmail}` : 'Create your Jovanne’s Meat Shop account'}>
      <ProfileForm key={shopper?.id ?? 'new'} s={s} customer={shopper} mode="complete" onSaved={(id) => { signInShopper(id); replace(next); }} />
      {shopper ? (
        <button onClick={signOut} className="mt-4 w-full min-h-11 text-sm text-gray-600 hover:text-[#c8151d]">Cancel and sign out</button>
      ) : (
        <p className="text-sm text-gray-700 text-center mt-5">Already have an account? <Link href={withNext('/signin', next)} className="font-semibold text-[#c8151d] hover:underline">Sign in</Link></p>
      )}
    </AuthLayout>
  );
}

// ====================== GOOGLE (demo chooser) ======================
function GoogleChooser({ s, error, onPick, onClose }: { s: AppState; error: string; onPick: (email: string) => void; onClose: () => void }) {
  const [email, setEmail] = useState('new.customer@gmail.com');
  const accounts = s.customers.filter((c) => c.googleEmail).slice(0, 6);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label="Sign in with Google">
      <div className="absolute inset-0 bg-black/45 fm-fade" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden fm-pop">
        <div className="px-5 pt-5 pb-3 text-center border-b border-gray-100">
          <button onClick={onClose} className="absolute right-2 top-2 w-11 h-11 rounded-full hover:bg-gray-100 flex items-center justify-center" aria-label="Close"><X className="w-5 h-5" /></button>
          <p className="text-lg"><GoogleG /> <span className="text-sm font-medium text-gray-700">Sign in with Google</span></p>
          <p className="text-base font-semibold mt-1">Choose an account</p>
          <p className="text-xs text-gray-600">to continue to Jovanne’s Meat Shop</p>
        </div>
        <div className="max-h-56 overflow-y-auto">
          {accounts.map((c) => (
            <button key={c.id} onClick={() => onPick(c.googleEmail!)} className="w-full flex items-center gap-3 px-5 min-h-14 py-2 text-left border-b border-gray-50 hover:bg-gray-50">
              <span className="w-9 h-9 rounded-full bg-[#2a2322] text-white text-sm font-bold flex items-center justify-center shrink-0">{(c.firstName ?? c.name)[0]?.toUpperCase()}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate">{c.profileComplete ? c.name : 'Profile not finished'}</span>
                <span className="block text-xs text-gray-600 truncate">{c.googleEmail}</span>
              </span>
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onPick(email); }} className="px-5 py-4">
          <label htmlFor="google-email" className="block text-xs font-semibold text-gray-700 mb-1.5">Use another account</label>
          <div className="flex gap-2">
            <input id="google-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={cn(inputCls, 'flex-1 min-w-0')} />
            <button type="submit" className="h-11 px-4 rounded-xl bg-[#c8151d] hover:bg-[#a3111a] text-white text-sm font-semibold">Next</button>
          </div>
          {error && <p className="text-xs text-[#a3111a] mt-2" role="alert">{error}</p>}
          <p className="text-[11px] text-gray-500 mt-2">Demo: no real Google sign-in happens.</p>
        </form>
      </div>
    </div>
  );
}

// ====================== PROFILE FORM (complete + edit) ======================
const inputCls = 'w-full h-11 rounded-xl border border-gray-300 px-3 text-base md:text-sm outline-none focus:border-[#c8151d] focus:ring-4 focus:ring-[#c8151d]/10 bg-white';

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-gray-800 mb-1">{label}</span>
      {children}
      {error ? <span className="block text-xs text-[#a3111a] mt-1" role="alert">{error}</span> : hint ? <span className="block text-xs text-gray-500 mt-1">{hint}</span> : null}
    </label>
  );
}

function PasswordInput({ value, onChange, show, setShow, autoComplete }: { value: string; onChange: (v: string) => void; show: boolean; setShow: (v: boolean) => void; autoComplete: string }) {
  return (
    <div className="relative">
      <input value={value} onChange={(e) => onChange(e.target.value)} type={show ? 'text' : 'password'} autoComplete={autoComplete} className={cn(inputCls, 'pr-12')} />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-gray-500 hover:text-gray-800" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

/** Normalizes a PH mobile number to "09XX XXX XXXX", or returns null when invalid. */
export function normalizePhMobile(v: string) {
  let d = v.replace(/\D/g, '');
  if (d.startsWith('63')) d = `0${d.slice(2)}`;
  if (!/^09\d{9}$/.test(d)) return null;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

interface ProfileValues {
  firstName: string; lastName: string; username: string; password: string; confirm: string; mobile: string; line: string; landmark: string; pin: Pin;
}

export function ProfileForm({ s, customer, mode, onSaved }: { s: AppState; customer?: Customer; mode: 'complete' | 'edit'; onSaved: (id: string) => void }) {
  const home = customer?.addresses[0];
  const [f, setF] = useState<ProfileValues>(() => ({
    firstName: customer?.firstName ?? (customer?.profileComplete ? customer.name.split(' ')[0] : ''),
    lastName: customer?.lastName ?? (customer?.profileComplete ? customer.name.split(' ').slice(1).join(' ') : ''),
    username: customer?.username ?? '',
    password: '', confirm: '',
    mobile: customer?.mobile ?? '',
    line: home?.line ?? '', landmark: home?.landmark ?? '',
    pin: home ? { lat: home.lat, lng: home.lng } : DIGOS_CENTER,
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileValues, string>>>({});
  const [show, setShow] = useState(false);
  const set = <K extends keyof ProfileValues>(k: K, v: ProfileValues[K]) => setF((x) => ({ ...x, [k]: v }));
  const needsPassword = mode === 'complete' || !customer?.password;

  const save = () => {
    const e: Partial<Record<keyof ProfileValues, string>> = {};
    if (!f.firstName.trim()) e.firstName = 'Enter your first name.';
    if (!f.lastName.trim()) e.lastName = 'Enter your last name.';
    const u = f.username.trim();
    if (!/^[A-Za-z0-9._]{4,}$/.test(u)) e.username = 'At least 4 characters: letters, numbers, dot or underscore.';
    else if (s.customers.some((c) => c.id !== customer?.id && c.username?.toLowerCase() === u.toLowerCase())) e.username = 'This username is already taken.';
    if (needsPassword || f.password) {
      if (f.password.length < 8) e.password = 'Use at least 8 characters.';
      else if (f.password !== f.confirm) e.confirm = 'Passwords do not match.';
    }
    const mobile = normalizePhMobile(f.mobile);
    if (!mobile) e.mobile = 'Enter a PH mobile number, e.g. 0917 123 4567.';
    if (!f.line.trim()) e.line = 'Enter your house no., street and barangay.';
    setErrors(e);
    if (Object.keys(e).length) return;

    const id = customer?.id ?? uid('cu');
    mutate((d) => {
      let c = d.customers.find((x) => x.id === id);
      if (!c) {
        c = { id, name: '', mobile: '', email: '', cityId: 'c-dgs', addresses: [], createdAt: new Date().toISOString(), blocked: false, storeCredit: 0, points: 0, source: 'app' };
        d.customers.push(c);
      }
      c.firstName = f.firstName.trim();
      c.lastName = f.lastName.trim();
      c.name = `${c.firstName} ${c.lastName}`;
      c.username = u;
      if (f.password) c.password = f.password;
      c.mobile = mobile!;
      if (!c.email && c.googleEmail) c.email = c.googleEmail;
      const addr = { label: c.addresses[0]?.label ?? ('Home' as const), line: f.line.trim(), landmark: f.landmark.trim() || undefined, lat: f.pin.lat, lng: f.pin.lng };
      if (c.addresses.length) c.addresses[0] = addr; else c.addresses.push(addr);
      c.profileComplete = true;
      c.source = 'app';
      c.cityId = 'c-dgs';
    });
    onSaved(id);
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-3" noValidate>
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
        <Field label="First name" error={errors.firstName}><input value={f.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="given-name" className={inputCls} /></Field>
        <Field label="Last name" error={errors.lastName}><input value={f.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="family-name" className={inputCls} /></Field>
      </div>
      <Field label="Username" hint="At least 4 characters: letters, numbers, . or _" error={errors.username}>
        <input value={f.username} onChange={(e) => set('username', e.target.value)} autoComplete="username" autoCapitalize="none" className={inputCls} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={needsPassword ? 'Password' : 'New password (optional)'} hint={needsPassword ? 'At least 8 characters' : 'Leave blank to keep your current password'} error={errors.password}>
          <PasswordInput value={f.password} onChange={(v) => set('password', v)} show={show} setShow={setShow} autoComplete="new-password" />
        </Field>
        {(needsPassword || f.password) && (
          <Field label="Confirm password" error={errors.confirm}>
            <input value={f.confirm} onChange={(e) => set('confirm', e.target.value)} type={show ? 'text' : 'password'} autoComplete="new-password" className={inputCls} />
          </Field>
        )}
      </div>
      <Field label="Mobile number" hint="We call this number about your order" error={errors.mobile}>
        <input value={f.mobile} onChange={(e) => set('mobile', e.target.value)} onBlur={() => { const n = normalizePhMobile(f.mobile); if (n) set('mobile', n); }} inputMode="tel" autoComplete="tel" placeholder="09XX XXX XXXX" className={inputCls} />
      </Field>

      <div className="pt-3">
        <p className="font-display uppercase tracking-wide text-base font-semibold">Delivery address</p>
        <p className="text-xs text-gray-600">Digos City and nearby areas</p>
      </div>
      <Field label="House no., street, barangay" error={errors.line}>
        <input value={f.line} onChange={(e) => set('line', e.target.value)} autoComplete="street-address" placeholder="e.g. Purok 3, Aplaya, Digos City" className={inputCls} />
      </Field>
      <Field label="Landmark (optional)">
        <input value={f.landmark} onChange={(e) => set('landmark', e.target.value)} placeholder="e.g. Blue gate near the chapel" className={inputCls} />
      </Field>
      <div>
        <span className="block text-sm font-semibold text-gray-800 mb-1">Map pin</span>
        <PinPicker value={f.pin} onChange={(p) => set('pin', p)} className="h-56 md:h-64" />
      </div>
      <PrimaryButton type="submit" className="mt-3">{mode === 'complete' ? 'Save and start shopping' : 'Save changes'}</PrimaryButton>
      {mode === 'complete' && <p className="text-xs text-gray-500 text-center">Demo: your profile is saved in this browser only.</p>}
    </form>
  );
}
