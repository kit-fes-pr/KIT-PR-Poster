import type { FormAnswer, FormField } from './forms';

export interface AssignmentParticipant {
  responseId: string;
  name: string;
  nameKana?: string;
  grade: number;
  section: string;
  availableSlots: string[];
  carUsage?: string;
  submittedAt: Date;
}

export interface AssignmentTeam {
  teamId: string;
  teamCode: string;
  teamName: string;
  timeSlot: string;
  areaId?: string;
  assignedArea: string;
  maxMembers: number;
  memberCount?: number;
  leaderId?: string;
  preferredGrades?: number[];
  requiresCar?: boolean;
}

export interface AssignmentRecord {
  formId?: string;
  responseId: string;
  teamId: string;
  assignedAt: Date;
  assignedBy: 'auto' | 'manual';
  timeSlot: string;
}

export interface AssignmentExportRow {
  team: string;
  grade: number;
  name: string;
}

export interface AssignmentForm {
  formId: string;
  title: string;
  fields: FormField[];
  isActive?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface AssignmentResponseRecord {
  responseId: string;
  participantData?: {
    name: string;
    nameKana?: string;
    grade: number;
    section: string;
    availableSlots?: string[];
  };
  answers?: FormAnswer[];
  submittedAt: string | Date;
}
