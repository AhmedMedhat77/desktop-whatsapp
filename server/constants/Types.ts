export interface Patient {
  ID: number
  PatientID: number
  Name: string
  Number: string
  Transfer: number
  IsWhatsAppSent: number
  BranchID: number
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
  IsScheduleWhatsAppSent: number
  IsWhatsAppSent: number
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
}
