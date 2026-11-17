'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Info, Undo2 } from 'lucide-react';
import { useStore } from '@/src/lib/store';
import { pesoShort } from '@/src/lib/logic';
import { tripEarnings } from '@/src/components/delivery/helpers';
import { NOTE, hasStep, isAccepted } from './flow';
import { useRider } from './RiderShell';
import { ActiveJob } from './ActiveJob';
import { HEADING, btn, card } from './ui';
import { cn } from '@/src/lib/utils';

function Notice({ icon, tone, title, body, nextId }: { icon: React.ReactNode; tone: 'ok' | 'info'; title: string; body: string; nextId?: string }) {
  return (
    <div className={cn(card, 'mx-auto max-w-lg p-6 text-center')}>
      <div className={cn('mx-auto flex h-16 w-16 items-center justify-center rounded-full', tone === 'ok' ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-600')}>{icon}</div>
      <h1 className="mt-3 text-2xl font-bold text-[#2a2322]" style={HEADING}>{title}</h1>
      <p className="mt-1 text-sm text-stone-600">{body}</p>
      <div className="mt-5 grid gap-2">
        {nextId && <Link href={`/rider/jobs/${nextId}`} className={btn.primary}>Next job <ArrowRight className="h-5 w-5" /></Link>}
        <Link href="/rider" className={nextId ? btn.secondary : btn.primary}>Back to jobs</Link>
      </div>
    </div>
  );
}

/** /rider/jobs/[orderId] — the active job, or a clear message when it is finished or not yours. */
export function RiderJobPage({ orderId }: { orderId: string }) {
  const s = useStore();
  const { rider: r, active } = useRider();
  const o = s.orders.find((x) => x.id === orderId);
  const nextId = active.find((x) => x.id !== orderId)?.id;

  // Put the order number in the browser tab title (the order lives in the browser, not on the server).
  const orderNumber = o?.number;
  useEffect(() => {
    if (orderNumber) document.title = `${orderNumber} · Current job – Rider | Jovanne’s Meat Shop`;
  }, [orderNumber]);

  if (!o || o.riderId !== r.id) {
    return <Notice tone="info" icon={<Info className="h-8 w-8" />} title="Job not available" body="This job isn’t assigned to you. It may have been re-assigned by dispatch." nextId={nextId} />;
  }
  if (o.status === 'delivered') {
    return <Notice tone="ok" icon={<CheckCircle2 className="h-8 w-8" />} title={`${o.number} delivered`} body={`Great work! +${pesoShort(tripEarnings(s, o, r))} added to today’s earnings.`} nextId={nextId} />;
  }
  if (o.status === 'failed_delivery' && hasStep(o, NOTE.returned)) {
    return <Notice tone="info" icon={<Undo2 className="h-8 w-8" />} title="Items returned" body={`${o.number} was returned to the branch. The branch will take it from here.`} nextId={nextId} />;
  }
  if (o.status === 'ready' && !isAccepted(o, r)) {
    return <Notice tone="info" icon={<Info className="h-8 w-8" />} title="Job offer" body={`Accept ${o.number} from your job offers first.`} />;
  }
  if (o.status !== 'ready' && o.status !== 'out_for_delivery' && o.status !== 'failed_delivery') {
    return <Notice tone="info" icon={<Info className="h-8 w-8" />} title="Job no longer active" body={`${o.number} is no longer out for delivery.`} nextId={nextId} />;
  }
  return <ActiveJob key={o.id} order={o} rider={r} />;
}
