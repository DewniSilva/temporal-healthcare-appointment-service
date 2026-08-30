import type { Request, Response } from 'express';
import {
  availableSlotsQuerySchema,
  clinicClosureParamsSchema,
  createAvailabilitySchema,
  createClinicClosureSchema,
  createScheduleExceptionSchema,
  doctorIdParamsSchema,
  doctorScheduleItemParamsSchema,
  updateAvailabilitySchema
} from './doctorSchedule.schema';
import {
  createAvailability,
  createClinicClosure,
  createScheduleException,
  deleteAvailability,
  deleteClinicClosure,
  deleteScheduleException,
  getAvailableSlots,
  listAvailability,
  listClinicClosures,
  listScheduleExceptions,
  updateAvailability
} from './doctorSchedule.service';

export async function readAvailableSlots(req: Request, res: Response): Promise<void> {
  const { doctorId } = doctorIdParamsSchema.parse(req.params);
  const { date } = availableSlotsQuerySchema.parse(req.query);
  res.json(await getAvailableSlots(doctorId, date, req.auth!));
}

export async function readAvailability(req: Request, res: Response): Promise<void> {
  const { doctorId } = doctorIdParamsSchema.parse(req.params);
  res.json(await listAvailability(doctorId));
}

export async function addAvailability(req: Request, res: Response): Promise<void> {
  const { doctorId } = doctorIdParamsSchema.parse(req.params);
  const body = createAvailabilitySchema.parse(req.body);
  res.status(201).json(await createAvailability(doctorId, body, req.auth!));
}

export async function editAvailability(req: Request, res: Response): Promise<void> {
  const { doctorId, itemId } = doctorScheduleItemParamsSchema.parse(req.params);
  const body = updateAvailabilitySchema.parse(req.body);
  res.json(await updateAvailability(doctorId, itemId, body, req.auth!));
}

export async function removeAvailability(req: Request, res: Response): Promise<void> {
  const { doctorId, itemId } = doctorScheduleItemParamsSchema.parse(req.params);
  await deleteAvailability(doctorId, itemId, req.auth!);
  res.status(204).send();
}

export async function readScheduleExceptions(req: Request, res: Response): Promise<void> {
  const { doctorId } = doctorIdParamsSchema.parse(req.params);
  res.json(await listScheduleExceptions(doctorId));
}

export async function addScheduleException(req: Request, res: Response): Promise<void> {
  const { doctorId } = doctorIdParamsSchema.parse(req.params);
  const body = createScheduleExceptionSchema.parse(req.body);
  res.status(201).json(await createScheduleException(doctorId, body, req.auth!));
}

export async function removeScheduleException(req: Request, res: Response): Promise<void> {
  const { doctorId, itemId } = doctorScheduleItemParamsSchema.parse(req.params);
  await deleteScheduleException(doctorId, itemId, req.auth!);
  res.status(204).send();
}

export async function readClinicClosures(_req: Request, res: Response): Promise<void> {
  res.json(await listClinicClosures());
}

export async function addClinicClosure(req: Request, res: Response): Promise<void> {
  const body = createClinicClosureSchema.parse(req.body);
  res.status(201).json(await createClinicClosure(body, req.auth!));
}

export async function removeClinicClosure(req: Request, res: Response): Promise<void> {
  const { itemId } = clinicClosureParamsSchema.parse(req.params);
  await deleteClinicClosure(itemId, req.auth!);
  res.status(204).send();
}
