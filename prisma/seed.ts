import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('DemoPass123!', 12);
  const users = [
    { id: 'user-patient-001', email: 'patient1@example.test', role: UserRole.PATIENT },
    { id: 'user-patient-002', email: 'patient2@example.test', role: UserRole.PATIENT },
    { id: 'user-doctor-001', email: 'doctor1@example.test', role: UserRole.DOCTOR },
    { id: 'user-admin-001', email: 'admin@example.test', role: UserRole.ADMIN }
  ];
  for (const user of users) {
    await prisma.user.upsert({ where: { id: user.id }, update: {}, create: { ...user, passwordHash } });
  }
  await prisma.patient.upsert({ where: { id: 'patient-001' }, update: {}, create: { id: 'patient-001', displayName: 'Demo Patient One', userId: 'user-patient-001' } });
  await prisma.patient.upsert({ where: { id: 'patient-002' }, update: {}, create: { id: 'patient-002', displayName: 'Demo Patient Two', userId: 'user-patient-002' } });
  await prisma.doctor.upsert({ where: { id: 'doctor-001' }, update: {}, create: { id: 'doctor-001', displayName: 'Demo Doctor', userId: 'user-doctor-001' } });
}

main().finally(() => prisma.$disconnect());
