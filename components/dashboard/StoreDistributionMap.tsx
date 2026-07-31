'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Store } from '@/types';
import { authenticatedFetch } from '@/lib/utils/auth-fetcher';

type LatLngLiteral = {
  lat: number;
  lng: number;
};

type MapLibreMap = {
  setCenter: (center: [number, number]) => MapLibreMap;
  setZoom: (zoom: number) => MapLibreMap;
  addControl: (control: MapLibreControl) => MapLibreMap;
  on: (eventName: string, handler: (event: MapLibreMouseEvent) => void) => void;
  resize: () => void;
  remove: () => void;
};

type MapLibreMarker = {
  setLngLat: (center: [number, number]) => MapLibreMarker;
  addTo: (map: MapLibreMap) => MapLibreMarker;
  setPopup: (popup: MapLibrePopup) => MapLibreMarker;
  remove: () => void;
};

type MapLibrePopup = {
  setText: (text: string) => MapLibrePopup;
};

type MapLibreControl = object;

type MapLibreMouseEvent = {
  lngLat: LatLngLiteral;
};

type MapLibreNamespace = {
  Map: new (options: {
    container: HTMLElement;
    style: string;
    center: [number, number];
    zoom: number;
    attributionControl: boolean;
  }) => MapLibreMap;
  Marker: new (options?: { element?: HTMLElement }) => MapLibreMarker;
  Popup: new (options?: { offset?: number }) => MapLibrePopup;
  AttributionControl: new (options?: { compact?: boolean }) => MapLibreControl;
};

declare global {
  interface Window {
    maplibregl?: MapLibreNamespace;
    kitMapLibreLoader?: Promise<void>;
  }
}

type StoreWithLocation = {
  store: Store;
  location: LatLngLiteral;
  resolvedByGeocode: boolean;
};

type MapStatus = 'all' | 'pending' | 'completed' | 'failed' | 'pickup';
type SelectedMapPlace = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

type NominatimResult = {
  display_name?: string;
  name?: string;
};

const defaultCenter = { lat: 36.529242958649505, lng: 136.62814814587682 };
const mapLibreCssUrl = 'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css';
const mapLibreJsUrl = 'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js';
const openFreeMapStyleUrl = 'https://tiles.openfreemap.org/styles/positron';

function loadMapLibre() {
  if (typeof window === 'undefined') return Promise.reject(new Error('ブラウザでのみ利用できます'));
  if (window.maplibregl) return Promise.resolve();
  if (window.kitMapLibreLoader) return window.kitMapLibreLoader;

  window.kitMapLibreLoader = new Promise<void>((resolve, reject) => {
    if (!document.querySelector(`link[href="${mapLibreCssUrl}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = mapLibreCssUrl;
      document.head.appendChild(link);
    }

    const script = document.createElement('script');
    script.src = mapLibreJsUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      window.kitMapLibreLoader = undefined;
      reject(new Error('地図ライブラリの読み込みに失敗しました'));
    };
    document.head.appendChild(script);
  });

  return window.kitMapLibreLoader;
}

function setMapView(map: MapLibreMap, location: LatLngLiteral, zoom: number) {
  map.setCenter([location.lng, location.lat]).setZoom(zoom);
}

function isPosterPickupStore(store: Store) {
  return store.requiresPosterPickup === true || store.distributionStatus === 'revisit';
}

function getDisplayStatus(store: Store) {
  return store.distributionStatus === 'revisit' ? 'completed' : store.distributionStatus;
}

function getStatusLabel(store: Store) {
  switch (getDisplayStatus(store)) {
    case 'completed':
      return '配布済み';
    case 'failed':
      return '配布不可';
    default:
      return '未配布';
  }
}

function getMarkerColor(store: Store) {
  if (isPosterPickupStore(store)) return 'bg-yellow-500 ring-yellow-500/30';
  switch (getDisplayStatus(store)) {
    case 'completed':
      return 'bg-green-600 ring-green-600/30';
    case 'failed':
      return 'bg-red-600 ring-red-600/30';
    default:
      return 'bg-gray-600 ring-gray-600/30';
  }
}

function createStoreMarkerElement(store: Store) {
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = 'flex max-w-44 -translate-y-2 flex-col items-center gap-1';
  marker.setAttribute('aria-label', store.storeName);

  const pin = document.createElement('span');
  pin.className = `h-3.5 w-3.5 rounded-full border-2 border-white shadow ring-2 ${getMarkerColor(
    store,
  )}`;

  const label = document.createElement('span');
  label.className =
    'max-w-44 truncate rounded bg-white px-2 py-1 text-xs font-semibold text-gray-900 shadow';
  label.textContent = store.storeName;

  marker.append(pin, label);
  return marker;
}

function hasStoredLocation(store: Store) {
  return Number.isFinite(store.latitude) && Number.isFinite(store.longitude);
}

async function geocodeAddress(address: string) {
  const key = address.trim();
  if (!key) return null;

  const params = new URLSearchParams({
    type: 'address',
    address: key,
  });
  const response = await authenticatedFetch(`/api/geocode?${params.toString()}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { location?: LatLngLiteral | null };
  return data.location || null;
}

async function persistStoreLocation(storeId: string, location: LatLngLiteral) {
  const response = await authenticatedFetch(`/api/stores/${storeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: location.lat, longitude: location.lng }),
  });
  return response.ok;
}

function buildPlaceFromReverseGeocode(result: NominatimResult, location: LatLngLiteral) {
  const address =
    typeof result.display_name === 'string' && result.display_name.trim()
      ? result.display_name.trim()
      : `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
  const name =
    typeof result.name === 'string' && result.name.trim()
      ? result.name.trim()
      : address.split(',')[0]?.trim() || address;
  return { name, address };
}

async function reverseGeocode(location: LatLngLiteral) {
  const params = new URLSearchParams({
    type: 'reverse',
    lat: String(location.lat),
    lng: String(location.lng),
  });
  const response = await authenticatedFetch(`/api/geocode?${params.toString()}`);
  if (!response.ok) throw new Error('地図上の住所取得に失敗しました');
  const data = (await response.json()) as { result?: NominatimResult | null };
  return data.result || {};
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function StoreDistributionMap({
  stores,
  title = '配布店舗マップ',
  showList = true,
  initialStatus = 'all',
  addMode = false,
  persistResolvedLocations = false,
  onSelectCreateLocation,
}: {
  stores: Store[];
  title?: string;
  showList?: boolean;
  initialStatus?: MapStatus;
  addMode?: boolean;
  persistResolvedLocations?: boolean;
  onSelectCreateLocation?: (place: SelectedMapPlace) => void;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const addModeRef = useRef(addMode);
  const onSelectCreateLocationRef = useRef(onSelectCreateLocation);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filterStatus, setFilterStatus] = useState<MapStatus>(initialStatus);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [locatedStores, setLocatedStores] = useState<StoreWithLocation[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [isResolving, setIsResolving] = useState(false);
  const [mapMessage, setMapMessage] = useState('');

  const visibleStores = useMemo(() => {
    return locatedStores.filter(({ store }) => {
      if (filterStatus === 'all') return true;
      if (filterStatus === 'pickup') return isPosterPickupStore(store);
      return getDisplayStatus(store) === filterStatus;
    });
  }, [locatedStores, filterStatus]);

  useEffect(() => {
    addModeRef.current = addMode;
    onSelectCreateLocationRef.current = onSelectCreateLocation;
  }, [addMode, onSelectCreateLocation]);

  useEffect(() => {
    let cancelled = false;
    loadMapLibre()
      .then(() => {
        if (cancelled || !mapRef.current || !window.maplibregl) return;
        const map = new window.maplibregl.Map({
          container: mapRef.current,
          style: openFreeMapStyleUrl,
          center: [defaultCenter.lng, defaultCenter.lat],
          zoom: 13,
          attributionControl: false,
        });
        map.addControl(new window.maplibregl.AttributionControl({ compact: true }));
        map.on('click', async (event) => {
          if (!addModeRef.current || !onSelectCreateLocationRef.current) return;
          const location = { lat: event.lngLat.lat, lng: event.lngLat.lng };
          try {
            setMapMessage('押下した地点の住所を取得しています...');
            const result = await reverseGeocode(location);
            const place = buildPlaceFromReverseGeocode(result, location);
            onSelectCreateLocationRef.current({
              ...place,
              latitude: location.lat,
              longitude: location.lng,
            });
            setMapMessage('');
          } catch (error) {
            console.error(error);
            const fallbackAddress = `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
            onSelectCreateLocationRef.current({
              name: '',
              address: fallbackAddress,
              latitude: location.lat,
              longitude: location.lng,
            });
            setMapMessage('住所を取得できませんでした。店名と住所を確認して保存してください。');
          }
        });
        mapInstanceRef.current = map;
        setStatus('ready');
        window.setTimeout(() => map.resize(), 0);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      mapInstanceRef.current?.resize();
    });
    observer.observe(mapRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    let cancelled = false;

    const resolveLocations = async () => {
      setIsResolving(true);
      const resolved: StoreWithLocation[] = [];
      let unresolved = 0;
      let geocodeRequests = 0;

      for (const store of stores) {
        if (cancelled) return;
        if (hasStoredLocation(store)) {
          resolved.push({
            store,
            location: { lat: Number(store.latitude), lng: Number(store.longitude) },
            resolvedByGeocode: false,
          });
          continue;
        }

        const location = await geocodeAddress(store.address);
        geocodeRequests += 1;
        if (location) {
          let persisted = false;
          if (persistResolvedLocations) {
            try {
              persisted = await persistStoreLocation(store.storeId, location);
            } catch (error) {
              console.error('Store coordinate persistence failed:', error);
            }
          }
          resolved.push({
            store: persisted
              ? { ...store, latitude: location.lat, longitude: location.lng }
              : store,
            location,
            resolvedByGeocode: !persisted,
          });
        } else {
          unresolved += 1;
        }
        await sleep(1100);
      }

      if (!cancelled) {
        setLocatedStores(resolved);
        setUnresolvedCount(unresolved);
        setIsResolving(false);
      }
    };

    resolveLocations();
    return () => {
      cancelled = true;
    };
  }, [persistResolvedLocations, stores, status]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const maplibregl = window.maplibregl;
    if (!map || !maplibregl) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    visibleStores.forEach(({ store, location }) => {
      const element = createStoreMarkerElement(store);
      element.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedStoreId(store.storeId);
        setMapView(map, location, 16);
      });
      const marker = new maplibregl.Marker({ element })
        .setLngLat([location.lng, location.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 24 }).setText(
            `${store.storeName} / ${getStatusLabel(store)}${
              isPosterPickupStore(store) ? ' / 回収対象' : ''
            }`,
          ),
        )
        .addTo(map);
      markersRef.current.push(marker);
    });

    if (visibleStores[0]) {
      setMapView(map, visibleStores[0].location, visibleStores.length === 1 ? 17 : 13);
    }
  }, [visibleStores]);

  const selectedStore = visibleStores.find(({ store }) => store.storeId === selectedStoreId);

  return (
    <div className="rounded-lg bg-white shadow">
      <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500">
              表示中: {visibleStores.length}件 / 座標未解決: {unresolvedCount}件
              {isResolving ? ' / 住所を確認中...' : ''}
            </p>
            {mapMessage && <p className="mt-1 text-xs text-gray-600">{mapMessage}</p>}
          </div>
          <select
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value as MapStatus)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm md:w-44"
          >
            <option value="all">すべて</option>
            <option value="pending">未配布</option>
            <option value="completed">配布済み</option>
            <option value="failed">配布不可</option>
            <option value="pickup">回収対象</option>
          </select>
        </div>
        {addMode && (
          <div className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800">
            地図上の追加したい場所を押してください。
          </div>
        )}
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="relative h-[70vh] min-h-[28rem] w-full overflow-hidden bg-gray-100">
          <div
            ref={mapRef}
            className={`h-full w-full ${addMode ? 'cursor-crosshair' : ''}`}
            aria-label="配布店舗マップ"
          />
          {status === 'loading' && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-gray-100 text-sm text-gray-500">
              地図を読み込んでいます...
            </div>
          )}
          {status === 'error' && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-gray-100 px-4 text-sm text-red-600">
              地図の読み込みに失敗しました。
            </div>
          )}
        </div>

        {showList && (
          <div className="max-h-[70vh] overflow-y-auto border-t border-gray-200 p-4 lg:border-l lg:border-t-0">
            {selectedStore && (
              <div className="mb-3 rounded-md border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-sm font-semibold text-indigo-900">
                  {selectedStore.store.storeName}
                </p>
                <p className="mt-1 text-xs text-indigo-800">{selectedStore.store.address}</p>
              </div>
            )}
            <div className="space-y-2">
              {visibleStores.map(({ store, location }) => (
                <button
                  key={store.storeId}
                  type="button"
                  onClick={() => {
                    setSelectedStoreId(store.storeId);
                    if (mapInstanceRef.current) setMapView(mapInstanceRef.current, location, 17);
                  }}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    selectedStoreId === store.storeId ? 'border-indigo-300 bg-indigo-50' : ''
                  }`}
                >
                  <span className="block font-medium text-gray-900">{store.storeName}</span>
                  <span className="mt-1 block text-xs text-gray-500">{store.address}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      {getStatusLabel(store)}
                    </span>
                    {isPosterPickupStore(store) && (
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                        回収対象
                      </span>
                    )}
                  </span>
                </button>
              ))}
              {visibleStores.length === 0 && (
                <p className="text-sm text-gray-500">表示できる店舗がありません。</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
