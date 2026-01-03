
ALTER TABLE [dbo].[Clinic_PatientsAppointments] DROP CONSTRAINT DF__Clinic_Pa__IsWha__5E4ADDA8;

ALTER TABLE Clinic_PatientsAppointments DROP COLUMN IsWhatsAppSent 
ALTER TABLE Clinic_PatientsAppointments DROP COLUMN IsScheduleWhatsAppSent 
