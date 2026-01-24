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
  PatientID: number
  DoctorID: number
  AppointmentDate: number
  AppointmentTime: number
  DoctorArbName: string
  DoctorEngName: string
  PatientArbName: string
  PatientEngName: string
  DoctorSpecialtyID: number
  SpecialtyArbName: string
  SpecialtyEngName: string
  Number: string
}

export interface AppointmentMessage {
  ID: number
  PatientID: number
  DoctorID: number
  AppointmentDate: number
  AppointmentTime: number
  DoctorArbName: string
  DoctorEngName: string
  PatientArbName: string
  PatientEngName: string
  DoctorSpecialtyID: number
  SpecialtyArbName: string
  SpecialtyEngName: string
  InitialMessage: number
  ReminderMessage: number
  Number: string
  CleanNumber?: string // Cleaned phone number (commas and spaces removed)
}
