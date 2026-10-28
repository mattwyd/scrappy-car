// Model lists come from NHTSA's vPIC database: free, no key, and it knows the
// body style, which is what actually sets the price band.
const CACHE = new Map();

// Brands that actually show up for scrap in the GTA, most common first so most
// people tap theirs without typing (the dropdown keeps this order until you
// type). Order is a rough guess at the local scrap mix. Luxury and exotic
// brands are left out; anything missing can still be typed in.
const MAKES = [
  'Honda','Toyota','Ford','Chevrolet','Nissan','Hyundai','Dodge','Mazda','Kia','Volkswagen',
  'Jeep','GMC','Chrysler','Pontiac','Subaru','Mitsubishi','Ram','Buick','Saturn','Acura',
  'BMW','Mercedes-Benz','Audi','Lexus','Infiniti','Cadillac','Lincoln','Volvo','Mercury',
  'Mini','Suzuki','Scion','Fiat','Oldsmobile',
];

async function vpic(make, year, type) {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelYear/${year}/vehicleType/${type}?format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const body = await res.json();
  return (body.Results || []).map((r) => r.Model_Name).filter(Boolean);
}

module.exports = async (req, res) => {
  const { year, make, makes } = req.query || {};

  if (makes !== undefined) {
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    return res.status(200).json({ makes: MAKES });
  }

  const y = parseInt(year, 10);
  if (!make || !Number.isFinite(y) || y < 1950 || y > 2100) {
    return res.status(400).json({ error: 'year and make required' });
  }

  const key = `${y}|${make.toLowerCase()}`;
  if (CACHE.has(key)) {
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    return res.status(200).json(CACHE.get(key));
  }

  const [cars, trucks, mpvs] = await Promise.all([
    vpic(make, y, 'car'),
    vpic(make, y, 'truck'),
    vpic(make, y, 'mpv'),
  ]);

  const byName = new Map();
  // Truck and MPV win over car when vPIC lists a name under both, since the
  // heavier body is the one worth more at the scrapyard.
  cars.forEach((m) => byName.set(m, 'car'));
  mpvs.forEach((m) => byName.set(m, 'truck'));
  trucks.forEach((m) => byName.set(m, 'truck'));

  const models = [...byName.entries()]
    .map(([name, type]) => ({ name, type }))
    // vPIC carries coachbuilders and replica shells under real makes; anything
    // not starting with a letter is that noise, not a car someone owns.
    .filter((m) => /^[A-Za-z]/.test(m.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const payload = { models };
  CACHE.set(key, payload);
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
  return res.status(200).json(payload);
};
