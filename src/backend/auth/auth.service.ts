import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '../../shared/database/prisma';
import { getEnv } from '../../shared/config/env';
import { AppError } from '../api/errors';

export interface AuthenticatedUser {
  userId: string;
  role: 'PATIENT' | 'DOCTOR' | 'ADMIN';
  patientId?: string;
  doctorId?: string;
}

export async function login(email: string, password: string): Promise<{ token: string; expiresIn: string }> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, role: true, patient: { select: { id: true } }, doctor: { select: { id: true } } }
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  const env = getEnv();
  const claims: AuthenticatedUser = {
    userId: user.id,
    role: user.role,
    patientId: user.patient?.id,
    doctorId: user.doctor?.id
  };
  const token = jwt.sign(claims, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as SignOptions);
  return { token, expiresIn: env.JWT_EXPIRES_IN };
}

export function verifyToken(token: string): AuthenticatedUser {
  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET);
    if (typeof payload === 'string' || !payload.sub && !('userId' in payload)) throw new Error('Invalid token payload');
    return payload as unknown as AuthenticatedUser;
  } catch {
    throw new AppError(401, 'INVALID_TOKEN', 'Authentication token is invalid or expired.');
  }
}
