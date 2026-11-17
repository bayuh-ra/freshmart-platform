import type { Metadata } from 'next';
import credits from '@/src/lib/photoCredits.json';

export const metadata: Metadata = { title: 'Photo credits' };

type Credit = { file: string; title: string; author: string; license: string; licenseUrl: string; source: string };

// Demo product photos come from Wikimedia Commons under free licences.
// CC BY / CC BY-SA require naming the author and licence, which this page does.
export default function CreditsPage() {
  const list = Object.values(credits as Record<string, Credit>).sort((a, b) => a.title.localeCompare(b.title));
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 md:py-12">
      <h1 className="font-display uppercase tracking-wide text-2xl md:text-3xl font-semibold text-[#2a2322]">Photo credits</h1>
      <p className="text-sm text-gray-600 mt-1 max-w-2xl">
        The product photos on this demo website are from Wikimedia Commons, used under the free licences shown.
        Some photos are used for several similar products. Jovanne’s Meat Shop will replace them with its own photos.
      </p>
      <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((c) => (
          <li key={c.file} className="flex gap-3 rounded-2xl bg-white border border-[#eadfd6] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.file} alt="" loading="lazy" className="w-20 h-20 rounded-xl object-cover shrink-0" />
            <div className="min-w-0 text-xs text-gray-600">
              <a href={c.source} target="_blank" rel="noopener noreferrer" className="block font-semibold text-[#2a2322] hover:text-[#c8151d] break-words">{c.title}</a>
              <p className="mt-0.5 break-words">By {c.author}</p>
              <p className="mt-0.5">
                {c.licenseUrl ? <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-[#c8151d]">{c.license}</a> : c.license}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
