'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { selectClass, inputClass } from '@/src/components/common';
import { mutate, addAudit } from '@/src/lib/store';
import { Button } from '@/src/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { cn } from '@/src/lib/utils';

export function ScheduleDialog({ open, onOpenChange, defaultReport }: { open: boolean; onOpenChange: (v: boolean) => void; defaultReport: string }) {
  const [email, setEmail] = useState('');
  const [freq, setFreq] = useState('Daily at 9:00 PM');
  const [report, setReport] = useState(defaultReport);
  const [format, setFormat] = useState('CSV + PDF');
  const submit = () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) { toast.error('Enter a valid email address'); return; }
    const name = `${report[0].toUpperCase()}${report.slice(1)} report`;
    mutate((d) => addAudit(d, { module: 'Settings', action: 'Report scheduled', detail: `${name} → ${email} (${freq}, ${format})` }));
    toast.success(`${name} scheduled`, { description: `${freq} to ${email}` });
    onOpenChange(false);
    setEmail('');
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) setReport(defaultReport); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule report</DialogTitle>
          <DialogDescription>Send this report automatically by email (e.g. daily sales to the owner).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block"><span className="text-xs font-medium text-gray-600">Report</span>
            <select className={cn(selectClass, 'w-full mt-1')} value={report} onChange={(e) => setReport(e.target.value)}>
              {['sales', 'products', 'customers', 'operations', 'finance'].map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-xs font-medium text-gray-600">Recipient email</span>
            <input className={cn(inputClass, 'w-full mt-1')} type="email" placeholder="owner@jovannesmeatshop.ph" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-medium text-gray-600">Frequency</span>
              <select className={cn(selectClass, 'w-full mt-1')} value={freq} onChange={(e) => setFreq(e.target.value)}>
                {['Daily at 9:00 PM', 'Daily at 7:00 AM', 'Weekly (Monday 8:00 AM)', 'Monthly (1st, 8:00 AM)'].map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-xs font-medium text-gray-600">Format</span>
              <select className={cn(selectClass, 'w-full mt-1')} value={format} onChange={(e) => setFormat(e.target.value)}>
                {['CSV + PDF', 'CSV only', 'PDF only'].map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
