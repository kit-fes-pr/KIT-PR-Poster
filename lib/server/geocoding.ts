type LatLngLiteral = {
  lat: number;
  lng: number;
};

export type GeocodeSearchResult = {
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state_district?: string;
  };
};

export type ReverseGeocodeResult = {
  display_name?: string;
  name?: string;
};

const allowedSearchMunicipalities = [
  '金沢市',
  '野々市市',
  '白山市',
  'Kanazawa',
  'Nonoichi',
  'Hakusan',
];
const allowedSearchViewbox = '136.39,36.74,136.85,36.18';
const cacheTtlMs = 1000 * 60 * 60 * 24;
const minRequestIntervalMs = 1100;
const cache = new Map<string, { expiresAt: number; value: unknown }>();
let nextRequestAt = 0;
let throttleQueue = Promise.resolve();

function getCached<T>(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached(key: string, value: unknown) {
  cache.set(key, { value, expiresAt: Date.now() + cacheTtlMs });
}

function isAllowedSearchResult(result: GeocodeSearchResult) {
  const addressParts = result.address
    ? [
        result.address.city,
        result.address.town,
        result.address.village,
        result.address.municipality,
        result.address.county,
        result.address.state_district,
      ]
    : [];
  const searchableText = [result.display_name, ...addressParts].filter(Boolean).join(' ');
  return allowedSearchMunicipalities.some((municipality) => searchableText.includes(municipality));
}

async function throttledFetchJson<T>(url: string) {
  const fetchAfterThrottle = async () => {
    const waitMs = Math.max(0, nextRequestAt - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    nextRequestAt = Date.now() + minRequestIntervalMs;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'KIT-PR-Poster/1.0',
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  };

  const request = throttleQueue.then(fetchAfterThrottle, fetchAfterThrottle);
  throttleQueue = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
}

export async function searchGeocodePlaces(query: string) {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) return [];
  const cacheKey = `search:${trimmedQuery}`;
  const cached = getCached<GeocodeSearchResult[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    q: trimmedQuery,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '10',
    countrycodes: 'jp',
    viewbox: allowedSearchViewbox,
    bounded: '1',
    extratags: '1',
    namedetails: '1',
    'accept-language': 'ja',
  });
  const results =
    (await throttledFetchJson<GeocodeSearchResult[]>(
      `https://nominatim.openstreetmap.org/search?${params}`,
    )) || [];
  const filtered = results.filter(isAllowedSearchResult).slice(0, 5);
  setCached(cacheKey, filtered);
  return filtered;
}

export async function geocodeAddress(address: string) {
  const trimmedAddress = address.trim();
  if (!trimmedAddress) return null;
  const cacheKey = `address:${trimmedAddress}`;
  const cached = getCached<LatLngLiteral | null>(cacheKey);
  if (cached !== null) return cached;
  if (cache.has(cacheKey)) return null;

  const params = new URLSearchParams({
    q: trimmedAddress,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'jp',
    'accept-language': 'ja',
  });
  const results =
    (await throttledFetchJson<Array<{ lat?: string; lon?: string }>>(
      `https://nominatim.openstreetmap.org/search?${params}`,
    )) || [];
  const first = results[0];
  const lat = Number(first?.lat);
  const lng = Number(first?.lon);
  const location = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  setCached(cacheKey, location);
  return location;
}

export async function reverseGeocodeLocation(location: LatLngLiteral) {
  const cacheKey = `reverse:${location.lat.toFixed(7)},${location.lng.toFixed(7)}`;
  const cached = getCached<ReverseGeocodeResult | null>(cacheKey);
  if (cached !== null) return cached;
  if (cache.has(cacheKey)) return null;

  const params = new URLSearchParams({
    lat: String(location.lat),
    lon: String(location.lng),
    format: 'jsonv2',
    addressdetails: '1',
    'accept-language': 'ja',
  });
  const result = await throttledFetchJson<ReverseGeocodeResult>(
    `https://nominatim.openstreetmap.org/reverse?${params}`,
  );
  setCached(cacheKey, result);
  return result;
}
