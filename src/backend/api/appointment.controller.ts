import type { Request, Response } from 'express';
import { appointmentListQuerySchema, appointmentParamsSchema, createAppointmentSchema, idempotencyKeySchema } from './appointment.schema';
import { getAuthorizedAppointment, getWorkflowState, listAppointments, signalAppointment, startAppointment } from './appointment.service';
import { AppError } from './errors';

export async function createAppointment(req: Request, res: Response): Promise<void> {
  const body = createAppointmentSchema.parse(req.body);
  const rawKey = req.header('idempotency-key');
  if (!rawKey) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'The Idempotency-Key header is required.');
  const key = idempotencyKeySchema.parse(rawKey);
  const result = await startAppointment(body, req.auth!, req.requestId, key);
  res.status(result.status === 'STARTED' ? 202 : 200).json(result);
}

export async function readAppointment(req: Request, res: Response): Promise<void> {
  const { id } = appointmentParamsSchema.parse(req.params);
  res.json(await getAuthorizedAppointment(id, req.auth!));
}

export async function readAppointments(req: Request, res: Response): Promise<void> {
  const query = appointmentListQuerySchema.parse(req.query);
  res.json(await listAppointments(query, req.auth!));
}

export async function readWorkflow(req: Request, res: Response): Promise<void> {
  const { id } = appointmentParamsSchema.parse(req.params);
  res.json(await getWorkflowState(id, req.auth!));
}

export async function confirm(req: Request, res: Response): Promise<void> {
  const { id } = appointmentParamsSchema.parse(req.params);
  await signalAppointment(id, 'confirm', req.auth!, req.requestId);
  res.status(202).json({ appointmentId: id, status: 'CONFIRM_SIGNAL_ACCEPTED' });
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const { id } = appointmentParamsSchema.parse(req.params);
  await signalAppointment(id, 'cancel', req.auth!, req.requestId);
  res.status(202).json({ appointmentId: id, status: 'CANCEL_SIGNAL_ACCEPTED' });
}

export async function complete(req: Request, res: Response): Promise<void> {
  const { id } = appointmentParamsSchema.parse(req.params);
  await signalAppointment(id, 'complete', req.auth!, req.requestId);
  res.status(202).json({ appointmentId: id, status: 'COMPLETE_SIGNAL_ACCEPTED' });
}

export async function markNoShow(req: Request, res: Response): Promise<void> {
  const { id } = appointmentParamsSchema.parse(req.params);
  await signalAppointment(id, 'no-show', req.auth!, req.requestId);
  res.status(202).json({ appointmentId: id, status: 'NO_SHOW_SIGNAL_ACCEPTED' });
}
