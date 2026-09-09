const ZONE_LABELS = {
  courte: 'Courte distance',
  moyenne: 'Moyenne distance',
  longue: 'Longue distance',
};

export default function ZoneBadge({ zone }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border bg-slate-100 text-slate-700 border-slate-200">
      {ZONE_LABELS[zone] || zone}
    </span>
  );
}

export function DelaiBadge({ delaiGaranti }) {
  if (delaiGaranti) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border bg-green-100 text-green-800 border-green-300">
        ⏱️ 30 min garanties
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border bg-amber-100 text-amber-800 border-amber-300">
      ⚠️ Délai non garanti
    </span>
  );
}
