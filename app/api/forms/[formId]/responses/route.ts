/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { FormResponse, FormAnswer, SurveyForm, ParticipantSurveyResponse } from '@/types/forms';
import { validateAvailabilitySelection } from '@/lib/utils/availability/availability';
import { getAvailabilityDateSlotKeys } from '@/lib/utils/availability/availability';
import {
  expandAvailabilitySlotsForStorage,
  filterVisibleFormFieldsForParticipant,
  prepareAnswersForStorage,
  resolveResponseAvailabilitySlots,
  validateFormAnswersPayload,
} from '@/lib/utils/forms/forms';
import { buildFormResponseRecord } from '@/lib/utils/forms/forms-api';
import { buildResponsesParticipantGradeValidation } from '@/lib/utils/grade/grade-route';

export async function GET(
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

    // 管理者のみ回答一覧を取得可能
    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const resolvedParams = await params;

    // フォームの存在確認
    const formDoc = await adminDb.collection('forms').doc(resolvedParams.formId).get();

    if (!formDoc.exists) {
      return NextResponse.json({ error: 'フォームが見つかりません' }, { status: 404 });
    }

    // 回答一覧を取得
    const responsesSnapshot = await adminDb
      .collection('forms')
      .doc(resolvedParams.formId)
      .collection('responses')
      .orderBy('submittedAt', 'desc')
      .get();

    const responses = responsesSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        responseId: doc.id,
        submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate() : data.submittedAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
      };
    }) as any[];

    return NextResponse.json({ responses });
  } catch (error) {
    console.error('回答一覧取得エラー:', error);
    return NextResponse.json({ error: '回答一覧の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> },
) {
  try {
    const resolvedParams = await params;

    // フォームの存在確認とアクティブ状態チェック
    const formDoc = await adminDb.collection('forms').doc(resolvedParams.formId).get();

    if (!formDoc.exists) {
      return NextResponse.json({ error: 'フォームが見つかりません' }, { status: 404 });
    }

    const formData = formDoc.data() as SurveyForm;

    if (!formData.isActive) {
      return NextResponse.json(
        { error: 'このフォームは現在回答を受け付けていません' },
        { status: 403 },
      );
    }

    const { answers, participantData, submitterInfo } = await request.json();

    // 回答データのバリデーション
    const answersValidation = validateFormAnswersPayload(answers);
    if (!answersValidation.valid) {
      return NextResponse.json({ error: answersValidation.error }, { status: 400 });
    }

    // 参加者データのバリデーション
    let participantGradeNum = 0;
    const availableSlots = participantData
      ? resolveResponseAvailabilitySlots(answers, participantData.availableSlots)
      : [];
    if (participantData) {
      const participantValidationErrors: string[] = [];

      if (
        !participantData.name ||
        typeof participantData.name !== 'string' ||
        participantData.name.trim() === ''
      ) {
        participantValidationErrors.push('お名前は必須です');
      }

      if (
        !participantData.nameKana ||
        typeof participantData.nameKana !== 'string' ||
        participantData.nameKana.trim() === ''
      ) {
        participantValidationErrors.push('ふりがなは必須です');
      }

      if (
        !participantData.section ||
        typeof participantData.section !== 'string' ||
        participantData.section.trim() === ''
      ) {
        participantValidationErrors.push('所属セクションは必須です');
      }

      const gradeValidation = buildResponsesParticipantGradeValidation({
        grade: participantData.grade,
        section: participantData.section,
      });
      participantValidationErrors.push(...gradeValidation.errors);
      participantGradeNum = gradeValidation.gradeNum || 0;

      if (availableSlots.length === 0) {
        participantValidationErrors.push('参加可能日時は一つ以上選択してください');
      }
      const availabilitySelectionError = validateAvailabilitySelection(availableSlots);
      if (availabilitySelectionError) {
        participantValidationErrors.push(availabilitySelectionError);
      }

      if (participantValidationErrors.length > 0) {
        return NextResponse.json(
          { error: '参加者情報の入力エラーがあります', details: participantValidationErrors },
          { status: 400 },
        );
      }
    }

    // 各フィールドのバリデーション
    const validationErrors: string[] = [];
    const visibleFields = filterVisibleFormFieldsForParticipant(
      formData.fields,
      participantGradeNum,
      availableSlots,
    );
    const visibleFieldIds = new Set(visibleFields.map((field) => field.fieldId));

    for (const field of visibleFields) {
      const answer = answers.find((a: FormAnswer) => a.fieldId === field.fieldId);

      // 必須フィールドのチェック
      if (field.required) {
        if (
          !answer ||
          !answer.value ||
          (Array.isArray(answer.value) && answer.value.length === 0) ||
          (typeof answer.value === 'string' && answer.value.trim() === '')
        ) {
          validationErrors.push(`${field.label}は必須です`);
          continue;
        }
      }

      if (answer && answer.value) {
        // 型別バリデーション
        switch (field.type) {
          case 'text':
          case 'textarea':
            if (typeof answer.value !== 'string') {
              validationErrors.push(`${field.label}は文字列で入力してください`);
            } else {
              if (field.validation?.minLength && answer.value.length < field.validation.minLength) {
                validationErrors.push(
                  `${field.label}は${field.validation.minLength}文字以上で入力してください`,
                );
              }
              if (field.validation?.maxLength && answer.value.length > field.validation.maxLength) {
                validationErrors.push(
                  `${field.label}は${field.validation.maxLength}文字以下で入力してください`,
                );
              }
              if (field.validation?.pattern) {
                const regex = new RegExp(field.validation.pattern);
                if (!regex.test(answer.value)) {
                  validationErrors.push(`${field.label}の形式が正しくありません`);
                }
              }
            }
            break;

          case 'number':
            const numValue = Number(answer.value);
            if (isNaN(numValue)) {
              validationErrors.push(`${field.label}は数値で入力してください`);
            } else {
              if (field.validation?.min !== undefined && numValue < field.validation.min) {
                validationErrors.push(
                  `${field.label}は${field.validation.min}以上で入力してください`,
                );
              }
              if (field.validation?.max !== undefined && numValue > field.validation.max) {
                validationErrors.push(
                  `${field.label}は${field.validation.max}以下で入力してください`,
                );
              }
            }
            break;

          case 'select':
          case 'radio':
            if (typeof answer.value !== 'string' || !field.options?.includes(answer.value)) {
              validationErrors.push(`${field.label}の選択肢が正しくありません`);
            }
            break;

          case 'checkbox':
            if (!Array.isArray(answer.value)) {
              validationErrors.push(`${field.label}は配列で入力してください`);
            } else {
              for (const val of answer.value) {
                if (typeof val !== 'string' || !field.options?.includes(val)) {
                  validationErrors.push(`${field.label}の選択肢が正しくありません`);
                  break;
                }
              }
            }
            break;
        }
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: '入力エラーがあります', details: validationErrors },
        { status: 400 },
      );
    }

    const availabilityField = formData.fields.find((field) => field.fieldId === 'availability');
    const availabilityDateSlotKeys = getAvailabilityDateSlotKeys(
      (availabilityField?.options || []).map((option) => ({ key: option })),
    );
    const storedAnswers = prepareAnswersForStorage(
      answers,
      visibleFieldIds,
      availabilityDateSlotKeys,
    );

    // 回答データを保存
    const editToken = randomUUID();
    const now = new Date();
    let responseData: Omit<FormResponse | ParticipantSurveyResponse, 'responseId'>;

    if (participantData) {
      const gradeValidation = buildResponsesParticipantGradeValidation({
        grade: participantData.grade,
        section: participantData.section,
      });
      const availabilitySelectionError = validateAvailabilitySelection(availableSlots);
      if (availabilitySelectionError) {
        return NextResponse.json(
          { error: '参加者情報の入力エラーがあります', details: [availabilitySelectionError] },
          { status: 400 },
        );
      }
      responseData = buildFormResponseRecord({
        formId: resolvedParams.formId,
        answers: storedAnswers,
        participantData: {
          name: participantData.name,
          nameKana: participantData.nameKana,
          section: participantData.section,
          grade: gradeValidation.gradeNum,
          availableSlots: expandAvailabilitySlotsForStorage(
            availableSlots,
            availabilityDateSlotKeys,
          ),
        },
        submitterInfo: submitterInfo || {},
        editToken,
        now,
      });
    } else {
      responseData = buildFormResponseRecord({
        formId: resolvedParams.formId,
        answers: storedAnswers,
        submitterInfo: submitterInfo || {},
        editToken,
        now,
      });
    }

    const responseRef = await adminDb
      .collection('forms')
      .doc(resolvedParams.formId)
      .collection('responses')
      .add(responseData);

    // 親フォームに集計を反映（レスポンス数 +1, 最終回答日時を更新）
    try {
      await adminDb
        .collection('forms')
        .doc(resolvedParams.formId)
        .update({
          responseCount: FieldValue.increment(1),
          lastResponseAt: new Date(),
          updatedAt: new Date(),
        });
    } catch (e) {
      console.error('フォーム集計更新エラー:', e);
      // 集計更新失敗は致命的ではないため継続
    }

    return NextResponse.json({
      message: '回答を送信しました',
      responseId: responseRef.id,
      editToken,
    });
  } catch (error) {
    console.error('回答送信エラー:', error);
    return NextResponse.json({ error: '回答の送信に失敗しました' }, { status: 500 });
  }
}
