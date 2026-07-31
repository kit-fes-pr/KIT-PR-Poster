import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import {
  geocodeAddress,
  reverseGeocodeLocation,
  searchGeocodePlaces,
} from '@/lib/server/geocoding';

function parseCoordinate(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const isAdmin = hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown });
    const isTeam = decodedToken.role === 'team' && !!decodedToken.teamId && !!decodedToken.teamCode;
    if (!isAdmin && !isTeam) {
      return NextResponse.json({ error: '利用権限がありません' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (type === 'search') {
      const query = searchParams.get('q') || '';
      if (query.trim().length < 2) return NextResponse.json({ results: [] });
      const results = await searchGeocodePlaces(query);
      return NextResponse.json({ results });
    }

    if (type === 'address') {
      const address = searchParams.get('address') || '';
      const location = await geocodeAddress(address);
      return NextResponse.json({ location });
    }

    if (type === 'reverse') {
      const lat = parseCoordinate(searchParams.get('lat'));
      const lng = parseCoordinate(searchParams.get('lng'));
      if (lat === null || lng === null) {
        return NextResponse.json({ error: 'lat/lng は数値で指定してください' }, { status: 400 });
      }
      const result = await reverseGeocodeLocation({ lat, lng });
      return NextResponse.json({ result });
    }

    return NextResponse.json({ error: 'type が不正です' }, { status: 400 });
  } catch (error) {
    console.error('Geocode API error:', error);
    return NextResponse.json({ error: '住所情報の取得に失敗しました' }, { status: 500 });
  }
}
