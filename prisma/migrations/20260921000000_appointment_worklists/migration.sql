-- Supports the role-scoped appointment worklists without scanning a clinic's
-- complete history for each doctor, patient, or operational dashboard view.
CREATE INDEX "Appointment_doctorId_appointmentTime_idx" ON "Appointment"("doctorId", "appointmentTime");
CREATE INDEX "Appointment_patientId_appointmentTime_idx" ON "Appointment"("patientId", "appointmentTime");
CREATE INDEX "Appointment_status_appointmentTime_idx" ON "Appointment"("status", "appointmentTime");
