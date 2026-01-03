CREATE TABLE Appointment_Message_Table  
(
ID  INT IDENTITY(1,1),
PatientID INT NOT NULL, 
DoctorID INT NOT NULL ,
AppointmentDate INT NOT NULL , 
AppointmentTime INT NOT NULL , 
DoctorArbName VARCHAR(120) NOT NULL,
DoctorEngName VARCHAR(120) NOT NULL,
PatientArbName VARCHAR(120) NOT NULL,
PatientEngName VARCHAR(120) NOT NULL,
DoctorSpecialtyID INT NOT NULL ,
SpecialtyArbName VARCHAR(120) NOT NULL,
SpecialtyEngName VARCHAR(120) NOT NULL,
InitialMessage INT NOT NULL DEFAULT 0 , 
ReminderMessage INT NOT NULL DEFAULT 0 ,
 )   
