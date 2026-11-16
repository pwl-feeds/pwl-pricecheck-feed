const fs = require('fs');

const STORE = 'https://photoworldlab.co.za';
const DEFAULT_STOCK_LEVEL = 5;
const INCLUDE_GTIN = false;

const EXCLUDE = [
  'banner', 'banners', 'flag', 'flags', 'bunting', 'gazebo', 'trophy', 'trophies',
  'medal', 'medals', 'calendar', 'calendars', 'lanyard', 'lanyards', 'bib', 'bibs',
  'boot', 'boots', 'jacket', 'jackets', 't-shirt', 't-shirts', 'jeans', 'hat', 'hats',
  'regalia', 'backdrop', 'branded', 'branding', 'printing', 'id card', 'fog machine',
  'custom', 'mug', 'mugs', 'photo frames', 'certificate', 'certificates', 'booklets',
  'shark fins', 'umbrella', 'engraving', 'chip boards', 'diary'
];
const excludeRe = new RegExp('\\b(' + EXCLUDE.join('|') + ')\\b', 'i');

const BRANDS = [
  'Canon', 'Sony', 'Nikon', 'Panasonic', 'Fujifilm', 'Olympus', 'Pentax', 'Ricoh', 'Leica',
  'Hasselblad', 'DJI', 'GoPro', 'Insta360', 'Godox', 'Yongnuo', 'Neewer', 'Viltrox', 'Profoto',
  'Metz', 'Nissin', 'Benro', 'JOBY', 'Zhiyun', 'Manfrotto', 'Gitzo', 'Sirui', 'Vanguard',
  'Hahnel', 'Sigma', 'Tamron', 'Tokina', 'Samyang', 'Rokinon', '7Artisans', 'Meike', 'Hoya',
  'Kenko', 'SanDisk', 'Lexar', 'Kingston', 'Rode', 'BOYA', 'Sennheiser', 'Saramonic',
  'Lowepro', 'Tenba', 'Peak Design', 'Blackmagic', 'Atomos', 'Kodak', 'Ilford', 'Epson',
  'Apple', 'Lenovo', 'Seagate', 'Hollyland', 'LENSGO', 'Kondor', 'Samsung', 'Western Digital'
];
const ALIASES = { fuji: 'Fujifilm' };
const brandRe = new RegExp('\\b(' + [...BRANDS, ...Object.keys(ALIASES)]
  .map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'ig');

function detectBrand(title, vendor) {
  brandRe.lastIndex = 0;
  const m = brandRe.exec(title);
  if (m) {
    const found = m[1].toLowerCase();
    if (ALIASES[found]) return ALIASES[found];
    return BRANDS.find((b) => b.toLowerCase() === found) || m[1];
  }
  return vendor;
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const csv = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;

const clean = (html) => String(html ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/Â/g, '').replace(/,º/g, '°').replace(/º/g, '°')
  .replace(/\?{2,}/g, '')
  .replace(/\s+/g, ' ').trim()
  .slice(0, 500);

function loadOverrides() {
  const map = {};
  if (!fs.existsSync('overrides.csv')) return map;
  const lines = fs.readFileSync('overrides.csv', 'utf8').split(/\r?\n/).filter(Boolean);
  const head = lines.shift().split(',').map((h) => h.trim().toLowerCase());
  for (const line of lines) {
    const cols = line.split(',').map((c) => c.trim());
    const row = {};
    head.forEach((h, i) => (row[h] = cols[i] || ''));
    if (row.handle) map[row.handle] = row;
  }
  return map;
}

async function fetchAll() {
  const all = [];
  for (let page = 1; page < 50; page++) {
    const res = await fetch(`${STORE}/products.json?limit=250&page=${page}`, {
      headers: { 'User-Agent': 'PWL-PriceCheck-Feed/1.0' }
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const { products } = await res.json();
    if (!products.length) break;
    all.push(...products);
  }
  return all;
}

(async () => {
  const overrides = loadOverrides();
  const products = await fetchAll();
  let count = 0, skipped = 0, noModel = 0;
  const offers = [];
  const missing = new Map();

  for (const p of products) {
    const ov = overrides[p.handle] || {};
    const haystack = `${p.title} ${p.product_type} ${(p.tags || []).join(' ')}`;
    if (excludeRe.test(haystack)) { skipped++; continue; }

    for (const v of p.variants) {
      if (!v.available) continue;
      const price = parseFloat(v.price);
      if (!price) continue;
      const compare = parseFloat(v.compare_at_price) || 0;
      const regular = compare > price ? compare : price;

      const name = v.title && v.title !== 'Default Title' ? `${p.title} - ${v.title}` : p.title;
      const img = (p.images || []).find((i) => (i.variant_ids || []).includes(v.id)) || (p.images || [])[0];
      if (!img) continue;

      const brand = ov.brand || detectBrand(p.title, p.vendor);
      const model = ov.mpn || v.sku || '';
      if (!model) {
        noModel++;
        if (!missing.has(p.handle)) missing.set(p.handle, { title: p.title, brand });
      }

      offers.push(`  <Offer>
    <ProductName>${esc(name)}</ProductName>
    <Manufacturer>${esc(brand)}</Manufacturer>
    <Description>${esc(clean(p.body_html) || name)}</Description>
    <Price>${regular.toFixed(2)}</Price>
    <SalePrice>${price.toFixed(2)}</SalePrice>
    <ProductURL>${esc(`${STORE}/products/${p.handle}?variant=${v.id}`)}</ProductURL>
    <ImageURL>${esc(img.src)}</ImageURL>
    <StockAvailability>In Stock</StockAvailability>
    <StockLevel>${DEFAULT_STOCK_LEVEL}</StockLevel>
    <ModelNumber>${esc(model)}</ModelNumber>${INCLUDE_GTIN && (ov.gtin || v.barcode) ? `\n    <GTIN>${esc(ov.gtin || v.barcode)}</GTIN>` : ''}
  </Offer>`);
      count++;
    }
  }

  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync('docs/feed.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<Offers>\n${offers.join('\n')}\n</Offers>\n`);

  const rows = [...missing.entries()].map(([h, m]) => `${csv(h)},${csv(m.title)},${csv(m.brand)}`);
  fs.writeFileSync('docs/needs-data.csv', `handle,title,brand\n${rows.join('\n')}\n`);

  console.log(`Offers: ${count} | Excluded: ${skipped} | Without model number: ${noModel} | Products needing data: ${missing.size}`);
})();
