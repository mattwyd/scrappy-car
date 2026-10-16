#!/usr/bin/env node
// One-time HubSpot setup for the Scrappy Car instant-offer form.
//
//   HUBSPOT_TOKEN=... node scripts/hubspot-setup.mjs          # dry run: shows what's missing
//   HUBSPOT_TOKEN=... node scripts/hubspot-setup.mjs --apply  # creates what's missing
//
// Creates (only if missing): a "Scrappy Car" deal property group, the deal
// properties api/quote.js writes, and a "Scrappy Car" deal pipeline. Never
// edits or deletes anything that already exists.
//
// Token scopes: crm.objects.contacts.read/write, crm.objects.deals.read/write,
// crm.schemas.deals.read/write.

const TOKEN = process.env.HUBSPOT_TOKEN;
const APPLY = process.argv.includes('--apply');
if (!TOKEN) { console.error('Set HUBSPOT_TOKEN first.'); process.exit(1); }

const GROUP = { name: 'scrappy_car', label: 'Scrappy Car' };
const PIPELINE = {
  label: 'Scrappy Car',
  stages: [
    { label: 'New lead', probability: '0.1' },
    { label: 'Offer sent', probability: '0.3' },
    { label: 'Offer accepted', probability: '0.7' },
    { label: 'Booked', probability: '0.9' },
    { label: 'Picked up', probability: '1.0', isClosed: 'true' },
    { label: 'Lost', probability: '0.0', isClosed: 'true' },
  ],
};

const text = (name, label) => ({ name, label, type: 'string', fieldType: 'text' });
const textarea = (name, label) => ({ name, label, type: 'string', fieldType: 'textarea' });
const number = (name, label) => ({ name, label, type: 'number', fieldType: 'number' });
const bool = (name, label) => ({
  name, label, type: 'enumeration', fieldType: 'booleancheckbox',
  options: [{ label: 'Yes', value: 'true', displayOrder: 0 }, { label: 'No', value: 'false', displayOrder: 1 }],
});
const select = (name, label, values) => ({
  name, label, type: 'enumeration', fieldType: 'select',
  options: values.map((v, i) => ({ label: v, value: v, displayOrder: i })),
});

const PROPERTIES = [
  select('lead_source_detail', 'Lead source detail', ['instant_offer_form', 'phone_call', 'sms', 'walk_in', 'referral', 'other']),
  number('vehicle_year', 'Vehicle year'),
  text('vehicle_make', 'Vehicle make'),
  text('vehicle_model', 'Vehicle model'),
  select('vehicle_body_type', 'Vehicle body type', ['car', 'truck']),
  bool('vehicle_running', 'Runs and drives'),
  number('vehicle_km', 'Odometer (km)'),
  select('vehicle_rust', 'Rust', ['none', 'mild', 'heavy']),
  bool('vehicle_keys_ownership', 'Has keys and ownership'),
  text('vehicle_city', 'Vehicle location'),
  textarea('vehicle_photos', 'Vehicle photo URLs'),
  text('sc_channel', 'Channel (last touch)'),
  text('sc_first_channel', 'Channel (first touch)'),
  text('sc_landing_page', 'Landing page'),
  text('sc_posthog_id', 'PostHog distinct id'),
  text('sc_gclid', 'Google click id (gclid)'),
  text('sc_gbraid', 'Google gbraid'),
  text('sc_wbraid', 'Google wbraid'),
  text('sc_utm_source', 'UTM source'),
  text('sc_utm_medium', 'UTM medium'),
  text('sc_utm_campaign', 'UTM campaign'),
  text('sc_utm_term', 'UTM term'),
  text('sc_utm_content', 'UTM content'),
];

async function hs(path, options = {}) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${path} → ${res.status} ${body.slice(0, 400)}`);
  return body ? JSON.parse(body) : null;
}

const todo = [];

const groups = (await hs('/crm/v3/properties/deals/groups')).results.map((g) => g.name);
if (!groups.includes(GROUP.name)) todo.push(['property group', GROUP.label, () =>
  hs('/crm/v3/properties/deals/groups', { method: 'POST', body: JSON.stringify({ ...GROUP, displayOrder: -1 }) })]);

const existing = new Set((await hs('/crm/v3/properties/deals')).results.map((p) => p.name));
for (const p of PROPERTIES) {
  if (!existing.has(p.name)) todo.push(['deal property', `${p.label} (${p.name})`, () =>
    hs('/crm/v3/properties/deals', { method: 'POST', body: JSON.stringify({ ...p, groupName: GROUP.name }) })]);
}

const pipelines = (await hs('/crm/v3/pipelines/deals')).results;
const pipeline = pipelines.find((p) => p.label === PIPELINE.label);
if (!pipeline) {
  todo.push(['deal pipeline', `${PIPELINE.label}: ${PIPELINE.stages.map((s) => s.label).join(' → ')}`, () =>
    hs('/crm/v3/pipelines/deals', {
      method: 'POST',
      body: JSON.stringify({
        label: PIPELINE.label,
        displayOrder: pipelines.length,
        stages: PIPELINE.stages.map((s, i) => ({
          label: s.label, displayOrder: i,
          metadata: { probability: s.probability, ...(s.isClosed ? { isClosed: s.isClosed } : {}) },
        })),
      }),
    })]);
} else {
  const missing = PIPELINE.stages.map((s) => s.label).filter((l) => !pipeline.stages.some((s) => s.label === l));
  console.log(`Pipeline "${PIPELINE.label}" exists.${missing.length ? ' Missing stages (add in HubSpot UI): ' + missing.join(', ') : ''}`);
}

console.log(`Existing pipelines: ${pipelines.map((p) => p.label).join(', ') || 'none'}`);
if (!todo.length) { console.log('Nothing to create. HubSpot is ready.'); process.exit(0); }

console.log(`\n${APPLY ? 'Creating' : 'Would create'} ${todo.length} item(s):`);
for (const [kind, label, run] of todo) {
  if (!APPLY) { console.log(`  - ${kind}: ${label}`); continue; }
  try {
    await run();
    console.log(`  ✓ ${kind}: ${label}`);
  } catch (err) {
    console.log(`  ✗ ${kind}: ${label}\n    ${err.message}`);
    if (kind === 'deal pipeline') {
      console.log('    Free HubSpot allows one deal pipeline. Either rename your existing pipeline to "Scrappy Car" with the');
      console.log('    stages above (Settings → Objects → Deals → Pipelines), or set HUBSPOT_PIPELINE_LABEL in Vercel to your');
      console.log('    pipeline\'s name and add stages named exactly "Offer sent" and "Offer accepted".');
    }
  }
}
if (!APPLY) console.log('\nRe-run with --apply to create them.');
