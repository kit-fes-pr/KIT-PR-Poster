'use client';

import { useEffect, useRef, useState } from 'react';
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

type MapLibreMouseEvent = {
  lngLat: LatLngLiteral;
};

type MapLibreControl = object;

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

type NominatimResult = {
  display_name: string;
  lat?: string;
  lon?: string;
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

declare global {
  interface Window {
    maplibregl?: MapLibreNamespace;
    kitMapLibreLoader?: Promise<void>;
  }
}

type StorePlacePickerProps = {
  onSelectPlace: (place: {
    name: string;
    address: string;
    latitude?: number;
    longitude?: number;
  }) => void;
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

function createCurrentLocationElement() {
  const marker = document.createElement('div');
  marker.className =
    'h-4 w-4 rounded-full border-2 border-white bg-blue-500 shadow ring-2 ring-blue-500/35';
  return marker;
}

function createStoreMarkerElement(name: string, selected = false) {
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = 'flex max-w-40 -translate-y-2 flex-col items-center gap-1';
  marker.setAttribute('aria-label', name);

  const pin = document.createElement('span');
  pin.className = selected
    ? 'h-4 w-4 rounded-full border-2 border-white bg-indigo-600 shadow ring-2 ring-indigo-600/35'
    : 'h-3.5 w-3.5 rounded-full border-2 border-white bg-rose-600 shadow ring-2 ring-rose-600/25';

  const label = document.createElement('span');
  label.className =
    'max-w-40 truncate rounded bg-white px-2 py-1 text-xs font-semibold text-gray-900 shadow';
  label.textContent = name;

  marker.append(pin, label);
  return marker;
}

function buildPlaceFromResult(result: NominatimResult, fallbackName = '') {
  const address = result.display_name.trim();
  const name = (result.name || fallbackName || address.split(',')[0] || address).trim();
  return { name, address };
}

async function searchPlaces(query: string) {
  const params = new URLSearchParams({
    type: 'search',
    q: query,
  });
  const response = await authenticatedFetch(`/api/geocode?${params.toString()}`);
  if (!response.ok) throw new Error('店舗候補の検索に失敗しました');
  const data = (await response.json()) as { results?: NominatimResult[] };
  return data.results || [];
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
  return data.result || { display_name: '' };
}

export function StorePlacePicker({ onSelectPlace }: StorePlacePickerProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<MapLibreMap | null>(null);
  const selectedMarkerRef = useRef<MapLibreMarker | null>(null);
  const currentLocationMarkerRef = useRef<MapLibreMarker | null>(null);
  const candidateMarkersRef = useRef<MapLibreMarker[]>([]);
  const queryRef = useRef('');
  const currentLocationRef = useRef<LatLngLiteral | null>(null);
  const hasCenteredCurrentLocationRef = useRef(false);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<NominatimResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<{ name: string; address: string } | null>(
    null,
  );
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const [message, setMessage] = useState('');

  const clearCandidateMarkers = () => {
    candidateMarkersRef.current.forEach((marker) => marker.remove());
    candidateMarkersRef.current = [];
  };

  const showCandidateMarkers = (results: NominatimResult[]) => {
    const maplibregl = window.maplibregl;
    const map = mapInstanceRef.current;
    if (!maplibregl || !map) return;
    clearCandidateMarkers();
    results.forEach((candidate) => {
      const place = buildPlaceFromResult(candidate, queryRef.current);
      const location = {
        lat: Number(candidate.lat),
        lng: Number(candidate.lon),
      };
      const element = createStoreMarkerElement(place.name);
      element.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedLocation(location, place);
      });
      const marker = new maplibregl.Marker({ element })
        .setLngLat([location.lng, location.lat])
        .setPopup(new maplibregl.Popup({ offset: 20 }).setText(place.name))
        .addTo(map);
      candidateMarkersRef.current.push(marker);
    });
  };

  const setSelectedLocation = (
    location: LatLngLiteral,
    place: { name: string; address: string },
  ) => {
    if (!window.maplibregl || !mapInstanceRef.current) return;
    const center: [number, number] = [location.lng, location.lat];
    setMapView(mapInstanceRef.current, location, 17);
    if (selectedMarkerRef.current) {
      selectedMarkerRef.current.remove();
    }
    selectedMarkerRef.current = new window.maplibregl.Marker({
      element: createStoreMarkerElement(place.name, true),
    })
      .setLngLat(center)
      .setPopup(new window.maplibregl.Popup({ offset: 25 }).setText(place.name))
      .addTo(mapInstanceRef.current);
    setSelectedPlace(place);
    onSelectPlace({ ...place, latitude: location.lat, longitude: location.lng });
  };

  const updateCurrentLocationMarker = (location: LatLngLiteral, shouldCenter: boolean) => {
    if (!window.maplibregl || !mapInstanceRef.current) return;
    const center: [number, number] = [location.lng, location.lat];
    currentLocationRef.current = location;
    if (shouldCenter) {
      setMapView(mapInstanceRef.current, location, 17);
      hasCenteredCurrentLocationRef.current = true;
    }
    if (currentLocationMarkerRef.current) {
      currentLocationMarkerRef.current.setLngLat(center);
    } else {
      currentLocationMarkerRef.current = new window.maplibregl.Marker({
        element: createCurrentLocationElement(),
      })
        .setLngLat(center)
        .setPopup(new window.maplibregl.Popup({ offset: 12 }).setText('現在地'))
        .addTo(mapInstanceRef.current);
    }
  };

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    loadMapLibre()
      .then(() => {
        if (cancelled || !mapRef.current || !window.maplibregl) return;
        const map = new window.maplibregl.Map({
          container: mapRef.current,
          style: openFreeMapStyleUrl,
          center: [defaultCenter.lng, defaultCenter.lat],
          zoom: 15,
          attributionControl: false,
        });
        map.addControl(new window.maplibregl.AttributionControl({ compact: true }));

        map.on('click', async (event) => {
          try {
            setMessage('地図上の住所を取得しています...');
            const location = { lat: event.lngLat.lat, lng: event.lngLat.lng };
            const result = await reverseGeocode(location);
            setSelectedLocation(location, buildPlaceFromResult(result, queryRef.current));
            setMessage('');
          } catch (error) {
            console.error(error);
            setMessage('地図上の住所取得に失敗しました');
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
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      selectedMarkerRef.current = null;
      currentLocationMarkerRef.current = null;
      candidateMarkersRef.current = [];
    };
  }, [onSelectPlace]);

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
    if (!navigator.geolocation) {
      setMessage('このブラウザでは現在地を取得できません');
      return;
    }

    setIsTrackingLocation(true);
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        updateCurrentLocationMarker(
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          !hasCenteredCurrentLocationRef.current,
        );
        setIsTrackingLocation(false);
      },
      () => {
        setIsTrackingLocation(false);
        setMessage('現在地を表示するにはブラウザの位置情報を許可してください。');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setIsTrackingLocation(false);
    };
  }, [status]);

  const handleSearch = async () => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setMessage('店名を2文字以上入力してください');
      return;
    }

    setIsSearching(true);
    setMessage('');
    try {
      const results = await searchPlaces(trimmedQuery);
      setCandidates(results);
      showCandidateMarkers(results);
      if (results[0] && mapInstanceRef.current) {
        setMapView(
          mapInstanceRef.current,
          { lat: Number(results[0].lat), lng: Number(results[0].lon) },
          16,
        );
      }
      if (results.length === 0) {
        clearCandidateMarkers();
        setMessage('候補が見つかりませんでした。店名を変えて検索してください。');
      }
    } catch (error) {
      console.error(error);
      setMessage('店舗候補の検索に失敗しました');
    } finally {
      setIsSearching(false);
    }
  };

  const selectCandidate = (candidate: NominatimResult) => {
    const location = {
      lat: Number(candidate.lat),
      lng: Number(candidate.lon),
    };
    setSelectedLocation(location, buildPlaceFromResult(candidate, query));
  };

  const showCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage('このブラウザでは現在地を取得できません');
      return;
    }
    if (!mapInstanceRef.current || !window.maplibregl) {
      setMessage('地図の読み込み後に現在地を取得してください');
      return;
    }

    setIsLocating(true);
    setMessage('');
    if (currentLocationRef.current) {
      updateCurrentLocationMarker(currentLocationRef.current, true);
      setIsLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateCurrentLocationMarker(
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          true,
        );
        setIsLocating(false);
      },
      () => {
        setMessage('現在地を取得できませんでした。ブラウザの位置情報許可を確認してください。');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-3">
          <label className="block text-sm font-medium text-gray-700">
            店名で検索（金沢市・野々市市・白山市）
          </label>
          <button
            type="button"
            onClick={showCurrentLocation}
            disabled={status !== 'ready' || isLocating}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {isLocating || isTrackingLocation ? '取得中...' : '現在地へ移動'}
          </button>
        </div>
        <div className="mt-1 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSearch();
              }
            }}
            placeholder="店名を入力"
            className="block min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            disabled={status !== 'ready'}
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={status !== 'ready' || isSearching}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isSearching ? '検索中...' : '検索'}
          </button>
        </div>
      </div>

      {candidates.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200">
          {candidates.map((candidate) => (
            <button
              key={`${candidate.lat}-${candidate.lon}-${candidate.display_name}`}
              type="button"
              onClick={() => selectCandidate(candidate)}
              className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-50"
            >
              <span className="block font-medium text-gray-900">
                {candidate.name || candidate.display_name.split(',')[0]}
              </span>
              <span className="mt-1 block text-xs text-gray-500">{candidate.display_name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="relative h-64 w-full overflow-hidden rounded-md border border-gray-200 bg-gray-100">
        <div ref={mapRef} className="h-full w-full" aria-label="OpenFreeMap" />
        {status === 'loading' && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-gray-100 text-sm text-gray-500">
            地図を読み込んでいます...
          </div>
        )}
        {status === 'error' && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-gray-100 px-4 text-sm text-red-600">
            地図の読み込みに失敗しました。フォーム入力で登録してください。
          </div>
        )}
      </div>

      {status === 'ready' && (
        <p className="text-xs text-gray-500">
          店名検索は金沢市・野々市市・白山市の候補のみ表示します。候補を選択、または地図上の店舗位置をクリックすると店名と住所に反映されます。
          地図データ: © OpenFreeMap / © OpenMapTiles / © OpenStreetMap contributors
        </p>
      )}
      {message && <p className="text-xs text-gray-600">{message}</p>}
      {selectedPlace && (
        <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
          <div className="font-medium text-gray-900">{selectedPlace.name}</div>
          <div className="mt-1">{selectedPlace.address}</div>
        </div>
      )}
    </div>
  );
}
