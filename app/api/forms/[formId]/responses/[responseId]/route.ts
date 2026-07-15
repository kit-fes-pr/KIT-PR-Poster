/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FormAnswer, SurveyForm } from '@/types/forms';
import { validateAvailabilitySelection } from '@/lib/utils/availability/availability';
import { getAvailabilityDateSlotKeys } from '@/lib/utils/availability/availability';
import {
  expandAvailabilitySlotsForStorage,
  filterEditableFormFieldsForParticipant,
  filterVisibleFormFieldsForParticipant,
  prepareAnswersForStorage,
  resolveResponseAvailabilitySlots,
  validateFormAnswersPayload,
} from '@/lib/utils/forms/forms';
import { buildFormResponseRecord } from '@/lib/utils/forms/forms-api';
import { buildResponsesParticipantGradeValidation } from '@/lib/utils/grade/grade-route';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string; responseId: string }> },
) {
  try {
    const resolvedParams = await params;

    // フォームの存在確認
    const formDoc = await adminDb.collection('forms').doc(resolvedParams.formId).get();

    if (!formDoc.exists) {
      return NextResponse.json({ error: 'フォームが見つかりません' }, { status: 404 });
    }

    const formData = formDoc.data() as SurveyForm;

    // 回答の存在確認
    const responseRef = adminDb
      .collection('forms')
      .doc(resolvedParams.formId)
      .collection('responses')
      .doc(resolvedParams.responseId);

    const responseDoc = await responseRef.get();

    if (!responseDoc.exists) {
      return NextResponse.json({ error: '回答が見つかりません' }, { status: 404 });
    }

    const body = await request.json();
    const { answers, participantData } = body;

    let isAdmin = false;
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];
      try {
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        isAdmin = decodedToken.role === 'admin';
      } catch (error) {
        console.error('管理者認証エラー:', error);
      }
    }

    const responseData = responseDoc.data() as Record<string, unknown>;
    const existingParticipantData = responseData.participantData as
      | {
          name: string;
          nameKana?: string;
          section: string;
          grade: number;
          availableSlots?: string[];
        }
      | undefined;
    const effectiveParticipantData = participantData
      ? { ...existingParticipantData, ...participantData }
      : existingParticipantData;
    const editToken = typeof body.editToken === 'string' ? body.editToken : '';
    if (!isAdmin) {
      if (!editToken || editToken !== responseData.editToken) {
        return NextResponse.json({ error: '編集権限がありません' }, { status: 403 });
      }
    }

    // 回答データのバリデーション
    const answersValidation = validateFormAnswersPayload(answers);
    if (!answersValidation.valid) {
      return NextResponse.json({ error: answersValidation.error }, { status: 400 });
    }

    const gradeValidation = effectiveParticipantData
      ? buildResponsesParticipantGradeValidation({
          grade: effectiveParticipantData.grade,
          section: effectiveParticipantData.section,
        })
      : null;
    const gradeNum = gradeValidation?.gradeNum || 0;
    const availableSlots = effectiveParticipantData
      ? resolveResponseAvailabilitySlots(answers, effectiveParticipantData.availableSlots)
      : [];
    const existingAnswers = Array.isArray(responseData.answers)
      ? (responseData.answers as FormAnswer[])
      : [];
    const answerValues = Object.fromEntries(
      [...existingAnswers, ...answers].map((answer) => [answer.fieldId, answer.value]),
    );
    const visibleFields = filterEditableFormFieldsForParticipant(
      formData.fields,
      gradeNum,
      availableSlots,
      answerValues,
    );
    const visibleFieldIds = new Set(visibleFields.map((field) => field.fieldId));

    // 参加者データのバリデーション
    if (effectiveParticipantData) {
      const participantValidationErrors: string[] = [];

      if (
        !effectiveParticipantData.name ||
        typeof effectiveParticipantData.name !== 'string' ||
        effectiveParticipantData.name.trim() === ''
      ) {
        participantValidationErrors.push('お名前は必須です');
      }

      if (
        effectiveParticipantData.nameKana != null &&
        (typeof effectiveParticipantData.nameKana !== 'string' ||
          effectiveParticipantData.nameKana.trim() === '')
      ) {
        participantValidationErrors.push('ふりがなの形式が正しくありません');
      }

      if (
        !effectiveParticipantData.section ||
        typeof effectiveParticipantData.section !== 'string' ||
        effectiveParticipantData.section.trim() === ''
      ) {
        participantValidationErrors.push('所属セクションは必須です');
      }

      if (gradeValidation) {
        participantValidationErrors.push(...gradeValidation.errors);
      }

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

    // 回答データを更新
    const now = new Date();

    // 更新データを構築
    let updateData: { [key: string]: any };

    if (effectiveParticipantData) {
      const availabilitySelectionError = validateAvailabilitySelection(availableSlots);
      if (availabilitySelectionError) {
        return NextResponse.json(
          { error: '参加者情報の入力エラーがあります', details: [availabilitySelectionError] },
          { status: 400 },
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { submittedAt, submitterInfo, ...rest } = buildFormResponseRecord({
        formId: resolvedParams.formId,
        answers: storedAnswers,
        participantData: {
          name: effectiveParticipantData.name,
          nameKana: effectiveParticipantData.nameKana || '',
          section: effectiveParticipantData.section,
          grade: gradeNum,
          availableSlots: expandAvailabilitySlotsForStorage(
            availableSlots,
            availabilityDateSlotKeys,
          ),
        },
        editToken: responseData.editToken as string,
        now,
      });
      updateData = {
        ...rest,
        updatedAt: now,
      };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { submittedAt, submitterInfo, ...rest } = buildFormResponseRecord({
        formId: resolvedParams.formId,
        answers: storedAnswers,
        editToken: responseData.editToken as string,
        now,
      });
      updateData = {
        ...rest,
        updatedAt: now,
      };
    }

    await responseRef.update(updateData);

    return NextResponse.json({
      message: '回答を更新しました',
      responseId: resolvedParams.responseId,
    });
  } catch (error) {
    console.error('回答更新エラー:', error);
    return NextResponse.json({ error: '回答の更新に失敗しました' }, { status: 500 });
  }
}
