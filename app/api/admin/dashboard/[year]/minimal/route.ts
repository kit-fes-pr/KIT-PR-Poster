import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import { FirestoreCache, ServerCache } from '@/lib/utils/server-cache';
import {
  countResponsesWithAvailability,
  serializeDateLikeValue,
} from '@/lib/utils/availability/availability-api';
import { buildMinimalDashboardResponseData } from '@/lib/utils/availability/availability-route';
import { logInfo, logPerformance } from '@/lib/utils/logger';

export async function GET(request: NextRequest, context: { params: Promise<{ year: string }> }) {
  const startTime = Date.now();
  let yearNum: number = 0;

  try {
    const { year } = await context.params;
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('認証トークンの検証に失敗しました', error);
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    yearNum = parseInt(year);
    if (isNaN(yearNum)) {
      return NextResponse.json({ error: '不正な年度です' }, { status: 400 });
    }

    logInfo('データ取得開始', {
      component: 'minimal-dashboard-api',
      year: yearNum,
      operation: 'data_fetch_start',
    });

    // キャッシュされた最小限データを取得
    const minimalData = await FirestoreCache.getCachedMinimalData(yearNum, async () => {
      // 超並列クエリ（カウントのみで高速化）
      const [eventSnapshot, formSnapshot, areasCountSnapshot] = await Promise.all([
        // イベント情報（1件のみ）
        adminDb.collection('distributionEvents').where('year', '==', yearNum).limit(1).get(),

        // 1年度1フォームを取得
        adminDb.collection('forms').where('year', '==', yearNum).limit(1).get(),

        // 配布区域数（共通）
        ServerCache.getOrSet(
          'firestore:areas:global:count',
          () =>
            adminDb
              .collection('areas')
              .count()
              .get()
              .then((snapshot) => snapshot.data().count),
          5 * 60 * 1000,
        ),
      ]);

      // イベント情報（軽量）
      let event = null;
      if (!eventSnapshot.empty) {
        const doc = eventSnapshot.docs[0];
        event = {
          id: doc.id,
          eventName: doc.data().eventName,
          year: doc.data().year,
          distributionStartDate: serializeDateLikeValue(doc.data().distributionStartDate),
          distributionEndDate: serializeDateLikeValue(doc.data().distributionEndDate),
        };
      }

      let totalTeams = 0;
      if (event?.id) {
        const [teamsByYear, teamsByEvent] = await Promise.all([
          adminDb.collection('teams').where('year', '==', yearNum).get(),
          adminDb.collection('teams').where('eventId', '==', event.id).get(),
        ]);

        const mergedTeams = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
        teamsByYear.docs.forEach((doc) => mergedTeams.set(doc.id, doc));
        teamsByEvent.docs.forEach((doc) => mergedTeams.set(doc.id, doc));
        totalTeams = Array.from(mergedTeams.values()).length;
      } else {
        totalTeams = await FirestoreCache.getCachedCount('teams', yearNum, () =>
          adminDb
            .collection('teams')
            .where('year', '==', yearNum)
            .count()
            .get()
            .then((snapshot) => snapshot.data().count),
        );
      }

      let totalResponses = 0;
      let availableResponses = 0;
      if (!formSnapshot.empty) {
        const formDoc = formSnapshot.docs[0];
        const responsesCollection = adminDb
          .collection('forms')
          .doc(formDoc.id)
          .collection('responses');

        const [totalResponsesSnapshot, availableResponsesSnapshot] = await Promise.all([
          responsesCollection.count().get(),
          responsesCollection.select('participantData.availableSlots').get(),
        ]);

        totalResponses = totalResponsesSnapshot.data().count;
        availableResponses = countResponsesWithAvailability(
          availableResponsesSnapshot.docs.map(
            (doc) => doc.data() as { participantData?: { availableSlots?: unknown } },
          ),
        );
      }

      return {
        event,
        totalTeams,
        totalMembers: totalResponses,
        totalResponses,
        availableResponses,
        totalAreas: areasCountSnapshot,
      };
    });

    const { event, totalTeams, totalMembers, totalResponses, availableResponses, totalAreas } =
      minimalData as {
        event: unknown;
        totalTeams: number;
        totalMembers: number;
        totalResponses?: number;
        availableResponses?: number;
        totalAreas: number;
      };

    const responseTime = Date.now() - startTime;
    logPerformance('minimal-dashboard-complete', responseTime, {
      component: 'minimal-dashboard-api',
      year: yearNum,
      operation: 'complete',
    });

    const responseData = buildMinimalDashboardResponseData(
      year,
      {
        event,
        totalTeams,
        totalMembers,
        totalResponses,
        availableResponses,
        totalAreas,
      },
      responseTime,
    );

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Response-Type': 'minimal',
      },
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('最小限データ取得エラー', {
      component: 'minimal-dashboard-api',
      year: yearNum,
      duration: responseTime,
      operation: 'error',
      error,
    });

    return NextResponse.json(
      {
        error: 'データ取得に失敗しました',
        performance: { responseTime },
      },
      { status: 500 },
    );
  }
}
