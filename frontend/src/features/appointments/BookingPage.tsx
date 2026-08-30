import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { CalendarClock } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { Card, CardHeader } from '../../components/ui/Card';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { DoctorIdInput } from './components/DoctorIdInput';
import { BookingProcessingScreen } from './components/BookingProcessingScreen';
import { bookingFormSchema, type BookingFormValues } from './bookingSchema';
import { useCreateAppointmentMutation } from './hooks/useAppointmentMutations';
import { useAvailableSlotsQuery } from './hooks/useAvailableSlotsQuery';
import { generateIdempotencyKey } from '../../lib/idempotency';
import { formatTime, localTimeZoneLabel, todayDateInputValue } from '../../lib/dateTime';
import { describeError } from '../../lib/apiError';
import { rememberAppointment } from './recentAppointments';

interface BookingResult {
  appointmentId: string;
  wasAlreadyStarted: boolean;
}

export function BookingPage() {
  const { user } = useAuth();
  const isPatient = user?.role === 'PATIENT';
  const mutation = useCreateAppointmentMutation();

  // Retained for the lifetime of one logical submission (including manual
  // retries after a failure); only cleared when the user starts a new
  // booking so the backend's Idempotency-Key semantics hold.
  const idempotencyKeyRef = useRef<string | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      patientId: isPatient ? (user?.patientId ?? '') : '',
      doctorId: '',
      date: '',
      time: ''
    }
  });

  const doctorId = watch('doctorId');
  const date = watch('date');
  const slotsQuery = useAvailableSlotsQuery(doctorId, date);
  const slots = slotsQuery.data?.slots ?? [];

  // A previously-chosen slot belongs to the doctor/date it was fetched for;
  // once either changes the old value can no longer be a valid option.
  useEffect(() => {
    setValue('time', '');
  }, [doctorId, date, setValue]);

  const onSubmit = async (values: BookingFormValues) => {
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = generateIdempotencyKey();

    // Failures are surfaced through mutation.isError/mutation.error below;
    // swallowing the rethrown rejection here just avoids an unhandled
    // promise rejection, it does not hide the error from the user.
    try {
      const response = await mutation.mutateAsync({
        input: {
          patientId: values.patientId,
          doctorId: values.doctorId,
          // Already the exact startAt ISO instant of a slot the backend
          // itself returned — no client-side timezone reconstruction.
          appointmentTime: values.time
        },
        idempotencyKey: idempotencyKeyRef.current
      });

      rememberAppointment(response.appointmentId);
      setResult({
        appointmentId: response.appointmentId,
        wasAlreadyStarted: response.status === 'ALREADY_STARTED'
      });
    } catch {
      // No-op: mutation state already reflects the failure for the UI.
    }
  };

  const bookAnother = () => {
    idempotencyKeyRef.current = null;
    setResult(null);
    reset({
      patientId: isPatient ? (user?.patientId ?? '') : '',
      doctorId: '',
      date: '',
      time: ''
    });
  };

  if (result) {
    return (
      <BookingProcessingScreen
        appointmentId={result.appointmentId}
        wasAlreadyStarted={result.wasAlreadyStarted}
        onBookAnother={bookAnother}
      />
    );
  }

  const canPickTime = doctorId.trim().length >= 3 && date.trim().length > 0;
  const hasOpenSlot = slots.some((slot) => slot.status === 'AVAILABLE');
  const timePlaceholder = !canPickTime
    ? 'Choose a doctor and date first'
    : slotsQuery.isLoading
      ? 'Loading available times…'
      : slotsQuery.isError
        ? 'Could not load available times'
        : slots.length === 0
          ? "The doctor isn't scheduled on this date"
          : !hasOpenSlot
            ? 'Fully booked — every slot below is taken'
            : 'Select a time slot';

  return (
    <Card>
      <CardHeader
        title="Book an appointment"
        description="Requests are processed asynchronously by a durable booking workflow."
      />

      {mutation.isError && (
        <div className="mb-4">
          <Alert variant="error" title="Could not start the booking">
            {describeError(mutation.error)}
          </Alert>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <div>
          <label htmlFor="patientId" className="block text-sm font-medium text-slate-700">
            Patient ID
          </label>
          <input
            id="patientId"
            type="text"
            readOnly={isPatient}
            aria-readonly={isPatient || undefined}
            aria-invalid={errors.patientId ? true : undefined}
            aria-describedby={errors.patientId ? 'patientId-error' : undefined}
            className={`mt-1.5 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus-visible:border-primary-500 ${
              isPatient ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-slate-300'
            }`}
            {...register('patientId')}
          />
          {errors.patientId && (
            <p id="patientId-error" role="alert" className="mt-1.5 text-sm text-red-600">
              {errors.patientId.message}
            </p>
          )}
        </div>

        <DoctorIdInput registration={register('doctorId')} error={errors.doctorId?.message} />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-slate-700">
              Date
            </label>
            <input
              id="date"
              type="date"
              min={todayDateInputValue()}
              aria-invalid={errors.date ? true : undefined}
              aria-describedby={errors.date ? 'date-error' : undefined}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus-visible:border-primary-500"
              {...register('date')}
            />
            {errors.date && (
              <p id="date-error" role="alert" className="mt-1.5 text-sm text-red-600">
                {errors.date.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="time" className="block text-sm font-medium text-slate-700">
              Time slot
            </label>
            <select
              id="time"
              disabled={!canPickTime || slotsQuery.isLoading || slots.length === 0}
              aria-invalid={errors.time ? true : undefined}
              aria-describedby="time-hint time-error"
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:border-primary-500 disabled:bg-slate-50 disabled:text-slate-400"
              {...register('time')}
            >
              <option value="">{timePlaceholder}</option>
              {slots.map((slot) => (
                <option key={slot.startAt} value={slot.startAt} disabled={slot.status !== 'AVAILABLE'}>
                  {formatTime(slot.startAt)} – {formatTime(slot.endAt)}
                  {slot.status === 'RESERVED' && ' · Already booked'}
                  {slot.status === 'PAST' && ' · Time has passed'}
                </option>
              ))}
            </select>
            {slotsQuery.isError && (
              <p className="mt-1.5 text-sm text-red-600">{describeError(slotsQuery.error)}</p>
            )}
            {errors.time && (
              <p id="time-error" role="alert" className="mt-1.5 text-sm text-red-600">
                {errors.time.message}
              </p>
            )}
          </div>
        </div>

        <p id="time-hint" className="flex items-center gap-1.5 text-xs text-slate-400">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          Slot length and hours come from the doctor's own schedule. Times are shown in your local timezone ({localTimeZoneLabel()}).
        </p>

        <Button type="submit" isLoading={isSubmitting || mutation.isPending}>
          Book appointment
        </Button>
      </form>
    </Card>
  );
}
