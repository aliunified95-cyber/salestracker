// Fallback for confirmed tags when the tracker and billing report differ by date or sale type.
// Work only on the server; raw imported report records must never be sent to the browser.
const normSub = value => {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length > 8 && digits.startsWith('973')) digits = digits.slice(3);
  return digits;
};
const phone = value => /^[36]\d{7}$/.test(normSub(value)) ? normSub(value) : '';
const sameMonth = (a, b) => /^\d{4}-\d{2}-\d{2}$/.test(String(a || '')) && String(a).slice(0, 7) === String(b || '').slice(0, 7);
const tagged = row => Boolean(String(row.tag_agent_id ?? '').trim() || String(row.tag_pay_desk ?? '').trim());
const candidateIds = record => {
  const raw = normSub(record?.msisdn);
  const primary = /^\d{6,15}$/.test(raw) ? raw : '';
  // Sometimes a subscriber number is entered as an order number.
  const orderAsPhone = phone(record?.orderNo);
  return [...new Set([primary, orderAsPhone].filter(Boolean))];
};
export function missingTagCandidates(sales, statuses) {
  const states = new Map(statuses.map(s => [s.sale_id, s.status]));
  return [...new Set(sales.filter(s => states.get(s.id) === 'No')
    .flatMap(s => candidateIds(s.record)))];
}
export function reconcileTagStatuses(sales, statuses, reportRows) {
  const bySubscriber = new Map();
  for (const row of reportRows) {
    const subscriber = normSub(row.subscriber);
    if (!subscriber) continue;
    if (!bySubscriber.has(subscriber)) bySubscriber.set(subscriber, []);
    bySubscriber.get(subscriber).push(row);
  }
  const bySaleId = new Map(sales.map(s => [s.id, s.record]));
  return statuses.map(entry => {
    // NA means no report covers this sale date/type. Never infer a tag after the latest upload.
    if (entry.status !== 'No') return entry;
    const record = bySaleId.get(entry.sale_id);
    if (!record) return entry;
    const type = record.saleType === 'upgrade' ? 'upgrade' : 'new';
    for (const subscriber of candidateIds(record)) {
      const same = (bySubscriber.get(subscriber) || []).filter(row => sameMonth(row.sale_date, record.date));
      if (!same.length) continue;
      // An exact match in the imported source is stronger than an outdated status calculation.
      const exact = same.filter(row => row.report_type === type && row.sale_date === record.date);
      if (exact.length) return exact.every(tagged) ? {...entry, status: 'Yes'} : entry;
      // Prefer same date, then same type, then a unique/unambiguous month-level match.
      const onDate = same.filter(row => row.sale_date === record.date);
      const onType = same.filter(row => row.report_type === type);
      const preferred = onDate.length ? onDate : onType.length ? onType : same;
      // Do not infer Yes when tagged and untagged report entries conflict.
      if (preferred.length && preferred.every(tagged)) return {...entry, status: 'Yes'};
      return entry;
    }
    return entry;
  });
}
