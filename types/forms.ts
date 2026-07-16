/**
 * アンケートフォーム関連の型定義
 */

export interface SurveyForm {
  formId: string;
  title: string;
  description?: string;
  isActive: boolean;
  eventId: string;
  year: number;
  fields: FormField[];
  createdBy: string; // 管理者ID
  createdAt: Date;
  updatedAt: Date;
  // 非正規化された集計フィールド（任意）
  responseCount?: number;
  lastResponseAt?: Date;
}

export interface FormField {
  fieldId: string;
  type: 'text' | 'select' | 'radio' | 'checkbox' | 'textarea' | 'number';
  label: string;
  placeholder?: string;
  required: boolean;
  visibleFromGrade?: number;
  options?: string[]; // select, radio, checkbox用
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number; // number用
    max?: number; // number用
    pattern?: string; // 正規表現
  };
  order: number;
}

export interface FormResponse {
  responseId: string;
  formId: string;
  answers: FormAnswer[];
  submittedAt: Date;
  editToken?: string;
  submitterInfo?: {
    name?: string;
    email?: string;
    ipAddress?: string;
  };
}

export interface FormAnswer {
  fieldId: string;
  value: string | string[]; // checkbox は配列
}

// フォーム作成・編集用のデータ
export interface FormCreateData {
  title: string;
  description?: string;
  fields: Omit<FormField, 'fieldId'>[];
}

export interface FormUpdateData {
  title?: string;
  description?: string;
  isActive?: boolean;
  fields?: FormField[];
}

// 参加者管理用（工大祭特化型）
export interface ParticipantSurveyResponse extends FormResponse {
  participantData: {
    name: string;
    nameKana?: string;
    section: string; // 所属セクション
    grade: number; // 学年
    availableSlots?: string[]; // 参加可能日時の複数選択
  };
}

// フォーム統計用
export interface FormStats {
  formId: string;
  totalResponses: number;
  responsesByField: {
    [fieldId: string]: {
      fieldLabel: string;
      responseCount: number;
      answers: {
        value: string;
        count: number;
        percentage: number;
      }[];
    };
  };
  participantStats?: {
    bySection: { [section: string]: number };
    byGrade: { [grade: string]: number };
    byAvailabilitySummary: {
      morning: number;
      afternoon: number;
      both: number;
      other: number;
    };
  };
}

// APIレスポンス用
export interface FormListResponse {
  forms: (SurveyForm & {
    responseCount: number;
    lastResponseAt?: Date;
  })[];
}

export interface FormDetailResponse extends SurveyForm {
  responses: FormResponse[];
  stats: FormStats;
}
