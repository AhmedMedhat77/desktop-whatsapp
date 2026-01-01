// Status enum for WhatsApp message processing
// PENDING: Initial state, ready to be processed
// PROCESSING: Claimed by a worker, currently being processed
// SENT: Successfully sent
// FAILED: Failed to send (can be retried)
export enum WhatsAppStatus {
  PENDING = 0,
  PROCESSING = 1,
  SENT = 2,
  FAILED = 3
}

export interface Patient {
  ID: number
  PatientID: number
  Name: string
  Number: string
  Transfer: number
  IsWhatsAppSent: number // Legacy field, kept for backward compatibility
  BranchID: number
  // New status-based fields
  WhatsAppStatus?: number
  WhatsAppWorkerID?: string
  WhatsAppProcessedAt?: Date
  WhatsAppRetryCount?: number
}

export interface CompanyHeader {
  pic: string
  CompanyArbName: string
  CompanyEngName: string
  ArbAddress: string
  EngAddress: string
  ArbTel: string
  EngTel: string
}

export interface Appointment {
  IsScheduleWhatsAppSent: number // Legacy field
  IsWhatsAppSent: number // Legacy field
  DoctorID: number
  PatientID: number
  BranchID: number
  TheTime: number
  TheDate: number
  DoctorArbName: string
  ClinicDepartmentID: number
  SpecialtyArbName: string
  SpecialtyEngName: string
  Number: string
  Name: string
  // New status-based fields for initial appointment messages
  WhatsAppStatus?: number
  WhatsAppWorkerID?: string
  WhatsAppProcessedAt?: Date
  WhatsAppRetryCount?: number
  // New status-based fields for scheduled reminder messages
  ScheduleWhatsAppStatus?: number
  ScheduleWhatsAppWorkerID?: string
  ScheduleWhatsAppProcessedAt?: Date
  ScheduleWhatsAppRetryCount?: number
}
