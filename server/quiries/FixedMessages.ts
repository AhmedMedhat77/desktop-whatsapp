import { AppointmentMessage, CompanyHeader, Patient } from '../constants/Types'
import { formatDbDate, formatDbTime } from '../utils'

export const FixedMessages = {
  AppointmentMessage: (appointment: AppointmentMessage, company: CompanyHeader) => {
    const message = `
مرحباً ${appointment.PatientArbName || 'مريض'}،

تم حجز موعدك بنجاح مع الدكتور/ة ${appointment.DoctorArbName || 'غير محدد'} في قسم ${appointment.SpecialtyArbName || 'غير محدد'}.
📅 التاريخ: ${formatDbDate(appointment.AppointmentDate)}
⏰ الوقت: ${formatDbTime(appointment.AppointmentTime)}
${company?.CompanyArbName ? `في *${company.CompanyArbName}*` : ''}
${company?.ArbAddress ? `📍 العنوان: ${company.ArbAddress}` : ''}
${company?.ArbTel ? `📞 الهاتف: ${company.ArbTel}` : ''}

نتمنى لك الصحة والعافية 🌹
      `.trim()
    return message
  },

  ScheduleMessage: (appointment: AppointmentMessage, company: CompanyHeader) => {
    const message = `
    مرحباً ${appointment.PatientArbName || 'مريض'}،
    
    تذكير: لديك موعد قادم مع الدكتور/ة ${appointment.DoctorArbName || 'غير محدد'} في قسم ${appointment.SpecialtyArbName || 'غير محدد'}.
    📅 التاريخ: ${formatDbDate(appointment.AppointmentDate)}
    ⏰ الوقت: ${formatDbTime(appointment.AppointmentTime)}
    ${company?.CompanyArbName ? `في *${company.CompanyArbName}*` : ''}
    ${company?.ArbAddress ? `📍 العنوان: ${company.ArbAddress}` : ''}
    ${company?.ArbTel ? `📞 الهاتف: ${company.ArbTel}` : ''}
    
    نتمنى لك الصحة والعافية 🌹
            `.trim()
    return message
  },

  PatientMessage: (patient: Patient, company: CompanyHeader) => {
    const message = `
    مرحباً ${patient.Name || 'مريض'}،
    
    يسعدنا انضمامكم إلى *${company?.CompanyArbName || 'العيادة'}*  
    📍 العنوان: ${company?.ArbAddress || 'غير متوفر'}  
    ${company?.ArbTel ? `📞 الهاتف: ${company.ArbTel}` : ''}
    
    ✅ تم إنشاء حسابكم بنجاح.  
    🔖 رقم الملف: ${patient.PatientID}
    
    نشكر لكم ثقتكم ونتمنى لكم دوام الصحة والعافية 🌹
          `.trim()

    return message
  }
}
