import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import { FirestoreCache } from '@/lib/utils/server-cache';
import { SurveyForm, FormUpdateData } from '@/types/forms';

function serializeDate(value: unknown): string | unknown {
  if (!value) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return value;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> },
) {
  try {
    const resolvedParams = await params;

    // 公開されたフォームは認証なしでアクセス可能
    const formDoc = await adminDb.collection('forms').doc(resolvedParams.formId).get();

    if (!formDoc.exists) {
      return NextResponse.json({ error: 'フォームが見つかりません' }, { status: 404 });
    }

    const formData = formDoc.data() as SurveyForm;

    // フォームが非アクティブの場合は管理者のみアクセス可能
    if (!formData.isActive) {
      const authHeader = request.headers.get('authorization');

      if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'このフォームは現在利用できません' }, { status: 403 });
      }

      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await adminAuth.verifyIdToken(idToken);

      if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
        return NextResponse.json({ error: 'このフォームは現在利用できません' }, { status: 403 });
      }
    }

    return NextResponse.json({
      ...formData,
      formId: formDoc.id,
      createdAt: serializeDate(formData.createdAt),
      updatedAt: serializeDate(formData.updatedAt),
    });
  } catch (error) {
    console.error('フォーム取得エラー:', error);
    return NextResponse.json({ error: 'フォームの取得に失敗しました' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> },
) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    // 管理者のみフォーム更新可能
    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const resolvedParams = await params;
    const updateData: FormUpdateData = await request.json();

    // フォームの存在確認
    const formDoc = await adminDb.collection('forms').doc(resolvedParams.formId).get();

    if (!formDoc.exists) {
      return NextResponse.json({ error: 'フォームが見つかりません' }, { status: 404 });
    }

    // 更新データの準備
    const now = new Date();
    const updateFields: Record<string, unknown> = {
      updatedAt: now,
    };

    if (updateData.title !== undefined) {
      if (!updateData.title.trim()) {
        return NextResponse.json({ error: 'フォームタイトルは必須です' }, { status: 400 });
      }
      updateFields.title = updateData.title.trim();
    }

    if (updateData.description !== undefined) {
      updateFields.description = updateData.description.trim();
    }

    if (updateData.isActive !== undefined) {
      updateFields.isActive = updateData.isActive;
    }

    if (updateData.fields !== undefined) {
      // フィールドのバリデーション
      for (let i = 0; i < updateData.fields.length; i++) {
        const field = updateData.fields[i];
        if (!field.label?.trim()) {
          return NextResponse.json(
            { error: `フィールド${i + 1}のラベルは必須です` },
            { status: 400 },
          );
        }
        if (
          ['select', 'radio', 'checkbox'].includes(field.type) &&
          (!Array.isArray(field.options) || field.options.length === 0)
        ) {
          return NextResponse.json(
            { error: `フィールド${i + 1}の選択肢を設定してください` },
            { status: 400 },
          );
        }
      }
      updateFields.fields = updateData.fields.map((field, index) => ({
        ...field,
        fieldId: field.fieldId || `field_${index + 1}`,
        order: index,
      }));
    }

    // フォームを更新
    await adminDb.collection('forms').doc(resolvedParams.formId).update(updateFields);

    // 更新されたフォームを取得
    const updatedFormDoc = await adminDb.collection('forms').doc(resolvedParams.formId).get();
    const updatedFormData = updatedFormDoc.data() as SurveyForm;

    return NextResponse.json({
      message: 'フォームが更新されました',
      form: {
        ...updatedFormData,
        formId: updatedFormDoc.id,
        createdAt: serializeDate(updatedFormData.createdAt),
        updatedAt: serializeDate(updatedFormData.updatedAt),
      },
    });
  } catch (error) {
    console.error('フォーム更新エラー:', error);
    return NextResponse.json({ error: 'フォームの更新に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> },
) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    // 管理者のみフォーム削除可能
    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const resolvedParams = await params;

    // フォームの存在確認
    const formDoc = await adminDb.collection('forms').doc(resolvedParams.formId).get();

    if (!formDoc.exists) {
      return NextResponse.json({ error: 'フォームが見つかりません' }, { status: 404 });
    }
    const formData = formDoc.data() as Record<string, unknown>;
    const yearsToInvalidate = new Set<number>();
    const formYear =
      typeof formData.year === 'number'
        ? formData.year
        : typeof formData.year === 'string' && formData.year.trim()
          ? Number(formData.year)
          : NaN;
    if (Number.isFinite(formYear)) {
      yearsToInvalidate.add(formYear);
    }

    // 回答を含めて削除する
    const responsesCollection = adminDb
      .collection('forms')
      .doc(resolvedParams.formId)
      .collection('responses');

    const responseDocs = await responsesCollection.listDocuments();

    for (let index = 0; index < responseDocs.length; index += 400) {
      const batch = adminDb.batch();
      const chunk = responseDocs.slice(index, index + 400);
      chunk.forEach((doc) => batch.delete(doc));
      await batch.commit();
    }

    const assignmentsSnapshot = await adminDb
      .collection('assignments')
      .where('formId', '==', resolvedParams.formId)
      .get();
    const assignmentRefs = assignmentsSnapshot.docs.map((doc) => {
      const assignmentYear = Number(doc.data().year);
      if (Number.isFinite(assignmentYear)) {
        yearsToInvalidate.add(assignmentYear);
      }
      return doc.ref;
    });

    for (let index = 0; index < assignmentRefs.length; index += 400) {
      const batch = adminDb.batch();
      const chunk = assignmentRefs.slice(index, index + 400);
      chunk.forEach((doc) => batch.delete(doc));
      await batch.commit();
    }

    // フォームを削除
    await adminDb.collection('forms').doc(resolvedParams.formId).delete();
    yearsToInvalidate.forEach((year) => FirestoreCache.invalidateYear(year));

    return NextResponse.json({
      message: 'フォームが削除されました',
      deletedAssignments: assignmentRefs.length,
    });
  } catch (error) {
    console.error('フォーム削除エラー:', error);
    return NextResponse.json({ error: 'フォームの削除に失敗しました' }, { status: 500 });
  }
}
