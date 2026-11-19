const fs = require('fs');

const STORE = 'https://photoworldlab.co.za';
const DEFAULT_STOCK_LEVEL = 5; // store data only says in/out of stock, so a fixed level is used

// Products that don't belong on a price comparison site
const EXCLUDE = [
  'banner', 'banners', 'flag', 'flags', 'bunting', 'gazebo', 'trophy', 'trophies',
  'medal', 'medals', 'calendar', 'calendars', 'lanyard', 'lanyards', 'bib', 'bibs',
  'boot', 'boots', 'jacket', 'jackets', 't-shirt', 't-shirts', 'jeans', 'hat', 'hats',
  'regalia', 'backdrop', 'branded', 'branding', 'printing', 'id card', 'fog machine',
  'custom', 'mug', 'mugs', 'photo frames', 'certificate', 'certificates', 'booklets',
  'shark fins', 'umbrella', 'engraving', 'chip boards', 'diary',
  'heat press', 'photo booth', 'photo booths', 'correx', 'snow globe', 'foldable',
  'contravision', 'capcut', 'laminating', 'facade', 'megaphone'
];
const excludeRe = new RegExp('\\b(' + EXCLUDE.join('|') + ')\\b', 'i');

// Condition detection
const REFURB_RE = /\brefurbish(ed)?\b/i;
const USED_RE = /\b(used|pre-?owned|pre owned|second[- ]?hand|open[- ]box)\b/i;
const HANDLE_USED_RE = /(^|-)(used|second-?hand)(-|$)|pre-?owned|open-?box/i;
const DESC_USED_RE = new RegExp(
  'condition\\s*:?\\s*\\(?\\s*(used|pre-?owned|second|very good|good|fair|excellent|like new|fairly|\\d)' +
  '|\\b(very good|good|excellent|fair|well maintained)\\s+(working\\s+)?condition\\b' +
  '|\\b(fairly used|pre-?owned|second-?hand)\\b', 'i');

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

// Category paths (PriceCheck wants the full path joined with " > ")
const CATS = [
  [/projector/i, 'Electronics > Video Equipment > Projectors'],
  [/\b(energizer|duracell)\b|\b9v\b|extension cord|multi-?plug/i, 'Electronics > Batteries & Power'],
  [/\bled\b.*\blight\b|\blight kit\b|softbox|soft box|monolight|light stand|reflector|strobe|beauty dish/i, 'Electronics > Photography > Lighting & Studio'],
  [/battery grip/i, 'Electronics > Photography > Camera Accessories > Battery Grips'],
  [/charger|battery|batteries|\ben-el|\blp-e|\bnp-f|\bnb-\d|\bbp-/i, 'Electronics > Photography > Camera Accessories > Batteries & Chargers'],
  [/tripod|monopod/i, 'Electronics > Photography > Camera Accessories > Tripods & Supports'],
  [/\bbag\b|backpack|pouch|holster|strap|\bcover\b|wrist|\bcase\b/i, 'Electronics > Photography > Camera Accessories > Bags & Straps'],
  [/lens cap|lens hood|body cap|\bcap\b|\bhood\b|filter|\buv\b|\bcpl\b|adapt(er|or|e)\b|eyecup|cleaning|colorchecker/i, 'Electronics > Photography > Camera Accessories > Lens Accessories'],
  [/flash|speedl/i, 'Electronics > Photography > Lighting & Studio > Flashes'],
  [/osmo (pocket|action)/i, 'Electronics > Photography > Digital Cameras'],
  [/slider|gimbal|stabili[sz]er|ronin|\brs ?\d|osmo mobile|handle|\bcage\b|\brig\b|bracket|selfie|matte box|plate/i, 'Electronics > Photography > Camera Accessories > Tripods & Supports'],
  [/\b(led|light|softbox|soft box|reflector|background|seamless|light stand|monolight|beauty dish|bowens|strobe|panel|tube)\b/i, 'Electronics > Photography > Lighting & Studio'],
  [/\bxa ?\d|\bxf ?\d|hxr|pxw|\bag-|\bhc-|fdr|legria|cr-n100|ptz/i, 'Electronics > Photography > Camcorders'],
  [/headphone|hd 280|mdr-/i, 'Electronics > Audio > Headphones'],
  [/microphone|\bmic\b|lavalier|wireless go|videomic|xlr|recorder|rodecaster|podmic|boom|windshield|shotgun|\blark\b|minifuse/i, 'Electronics > Audio > Microphones & Recorders'],
  [/\bcable\b|\bdrum\b/i, 'Electronics > Cables & Adapters'],
  [/drone|mavic|mini 5|mini 4k|air 3/i, 'Electronics > Drones & Accessories'],
  [/camcorder/i, 'Electronics > Photography > Camcorders'],
  [/(mirrorless|dslr|digital)\b.*\bcamera\b/i, 'Electronics > Photography > Digital Cameras'],
  [/sd card|sdhc|sdxc|cfexpress|memory card|card reader/i, 'Electronics > Computers > Storage > Memory Cards'],
  [/hard drive|\bssd\b|passport|external/i, 'Electronics > Computers > Storage > External Drives'],
  [/macbook|laptop|lenovo|\bloq\b/i, 'Electronics > Computers > Laptops'],
  [/apple pencil|ipad/i, 'Electronics > Computers > Tablet Accessories'],
  [/instax|instant film/i, 'Electronics > Photography > Instant Film & Cameras'],
  [/printer|selphy|photo paper|ribbon|variety pack|cd-r|dvd-r|pvc|\bpaper\b/i, 'Electronics > Computers > Printers & Supplies'],
  [/hdmi|capture|transmitter|teleprompter|\bsdi\b|monitor|atem|pyro|cosmo/i, 'Electronics > Video Equipment'],
  [/^\S+\s+(\S+\s+)?\d{2,3}([-\u2013]\d{2,3})?\s?mm\b/i, 'Electronics > Photography > Camera Lenses'],
  [/mirrorless|dslr|\beos\b|\bd\d{2,4}\b|\b\d{2,4}d\b|\b[5-7]d\b|\bz\d{1,2}\b|alpha|\ba\d{1,4}[a-z]{0,2}\b|ilce|zv-|powershot|coolpix|ixus|\belph\b|lumix|\bdmc|cinema camera|\bfx3|\bfx30|digital camera|\bslr\b|gopro|insta360|\bm50\b/i, 'Electronics > Photography > Digital Cameras'],
  [/\blens(e)?\b|\d+(-\d+)?mm|f\/\d|nikkor|sigma|tamron/i, 'Electronics > Photography > Camera Lenses']
];
const categoryFor = (text) => {
  for (const [re, path] of CATS) if (re.test(text)) return path;
  return 'Electronics > Photography > Camera Accessories';
};

const cdata = (s) => `<![CDATA[${String(s ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const csv = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;

const stripHtml = (html) => String(html ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/Â/g, '').replace(/,º/g, '°').replace(/,°/g, '°').replace(/º/g, '°')
  .replace(/\?{2,}/g, '')
  .replace(/\s+/g, ' ').trim();

const limitWords = (s, n) => s.split(/\s+/).slice(0, n).join(' ');

// Barcodes: EAN = 13 digits, UPC = 12 digits, otherwise "0"
function barcodes(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 14 && d.startsWith('00')) return { upc: d.slice(2), ean: '0' };
  if (d.length === 14 && d.startsWith('0')) return { upc: '0', ean: d.slice(1) };
  if (d.length === 13 && d.startsWith('0')) return { upc: d.slice(1), ean: d };
  if (d.length === 13) return { upc: '0', ean: d };
  if (d.length === 12) return { upc: d, ean: '0' };
  return { upc: '0', ean: '0' };
}

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

function clean(desc, fallback) {
  const t = String(desc || '').slice(0, 500).trim();
  return t || fallback;
}

(async () => {
  const overrides = loadOverrides();
  const products = await fetchAll();
  let count = 0, skipped = 0, noModel = 0, used = 0, refurb = 0;
  const offers = [];
  const missing = new Map();

  for (const p of products) {
    const ov = overrides[p.handle] || {};
    const tagText = Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags || '');
    const haystack = `${p.title} ${p.product_type} ${tagText}`;
    if (excludeRe.test(haystack)) { skipped++; continue; }

    const desc = stripHtml(p.body_html);
    let condition = 'New';
    if (REFURB_RE.test(haystack)) condition = 'Refurbished';
    else if (USED_RE.test(haystack) || HANDLE_USED_RE.test(p.handle)) condition = 'Used';
    else if (REFURB_RE.test(desc)) condition = 'Refurbished';
    else if (DESC_USED_RE.test(desc)) condition = 'Used';

    let title = p.title.replace(/\s+/g, ' ').trim();
    if (condition === 'Used' && !USED_RE.test(title)) title += ' (Used)';
    const name = limitWords(title, 25);

    for (const v of p.variants) {
      if (!v.available) continue;
      const price = parseFloat(v.price);
      if (!price) continue;
      const compare = parseFloat(v.compare_at_price) || 0;
      const regular = compare > price ? compare : price;

      const img = (p.images || []).find((i) => (i.variant_ids || []).includes(v.id)) || (p.images || [])[0];
      if (!img) continue;

      const variantName = v.title && v.title !== 'Default Title' ? limitWords(`${title} - ${v.title}`, 25) : name;
      const brand = ov.brand || detectBrand(p.title, p.vendor);
      const cleanSku = /^\d{1,3}$/.test(String(v.sku || '').trim()) ? '' : (v.sku || '');
      const model = ov.mpn || cleanSku;
      if (!model) {
        noModel++;
        if (!missing.has(p.handle)) missing.set(p.handle, { title: p.title, brand });
      }
      const codes = barcodes(ov.gtin || v.barcode);
      const category = categoryFor(`${p.title} ${p.product_type}`);

      let notes = '';
      if (condition === 'Used') { notes = 'SecondHand - pre-owned product'; used++; }
      else if (condition === 'Refurbished') { notes = 'Refurbished'; refurb++; }

      offers.push(`  <Offer>
    <Category>${cdata(category)}</Category>
    <ProductName>${cdata(variantName)}</ProductName>
    <Manufacturer>${cdata(brand)}</Manufacturer>
    <ModelNumber>${cdata(model)}</ModelNumber>
    <UPC>${codes.upc}</UPC>
    <EAN>${codes.ean}</EAN>
    <ShopSKU>${esc(String(v.id))}</ShopSKU>
    <Description>${cdata(clean(desc, variantName))}</Description>
    <Price>${regular.toFixed(2)}</Price>
    <SalePrice>${price.toFixed(2)}</SalePrice>
    <ProductURL>${esc(`${STORE}/products/${encodeURIComponent(p.handle)}?variant=${v.id}`)}</ProductURL>
    <ImageURL>${esc(img.src)}</ImageURL>
    <Notes>${cdata(notes)}</Notes>
    <StockAvailability>In Stock</StockAvailability>
    <StockLevel>${DEFAULT_STOCK_LEVEL}</StockLevel>
    <Attributes>
      <Attribute>
        <Name>Condition</Name>
        <Value>${condition}</Value>
      </Attribute>
    </Attributes>
  </Offer>`);
      count++;
    }
  }

  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync('docs/feed.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<Offers>\n${offers.join('\n')}\n</Offers>\n`);

  const rows = [...missing.entries()].map(([h, m]) => `${csv(h)},${csv(m.title)},${csv(m.brand)}`);
  fs.writeFileSync('docs/needs-data.csv', `handle,title,brand\n${rows.join('\n')}\n`);

  console.log(`Offers: ${count} | Excluded: ${skipped} | Used: ${used} | Refurbished: ${refurb} | Without model number: ${noModel} | Products needing data: ${missing.size}`);
})();
