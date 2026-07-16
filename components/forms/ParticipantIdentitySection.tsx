'use client';

import { Control, Path, useController } from 'react-hook-form';
import { ParticipantIdentityFields } from '@/components/forms/ParticipantIdentityFields';

export type ParticipantIdentityFormValues = {
  participantName: string;
  participantNameKana: string;
  participantGrade: string;
  participantSection: string;
  [key: string]: string | string[];
};

type ParticipantIdentitySectionProps = {
  control: Control<ParticipantIdentityFormValues>;
};

export function ParticipantIdentitySection({ control }: ParticipantIdentitySectionProps) {
  const nameField = useController({
    control,
    name: 'participantName' as Path<ParticipantIdentityFormValues>,
    rules: { required: 'お名前は必須です' },
  });
  const gradeField = useController({
    control,
    name: 'participantGrade' as Path<ParticipantIdentityFormValues>,
    rules: { required: '学年は必須です' },
  });
  const nameKanaField = useController({
    control,
    name: 'participantNameKana' as Path<ParticipantIdentityFormValues>,
    rules: { required: 'ふりがなは必須です' },
  });
  const sectionField = useController({
    control,
    name: 'participantSection' as Path<ParticipantIdentityFormValues>,
    rules: { required: '所属セクションは必須です' },
  });

  return (
    <ParticipantIdentityFields
      name={String(nameField.field.value || '')}
      nameKana={String(nameKanaField.field.value || '')}
      grade={String(gradeField.field.value || '')}
      section={String(sectionField.field.value || '')}
      onNameChange={nameField.field.onChange}
      onNameKanaChange={nameKanaField.field.onChange}
      onGradeChange={gradeField.field.onChange}
      onSectionChange={sectionField.field.onChange}
      nameError={nameField.fieldState.error?.message}
      nameKanaError={nameKanaField.fieldState.error?.message}
      gradeError={gradeField.fieldState.error?.message}
      sectionError={sectionField.fieldState.error?.message}
      sectionDisabled={gradeField.field.value === '4'}
    />
  );
}
