import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ArrowRight } from 'lucide-react';

const schema = z.object({
  appointmentId: z
    .string()
    .min(3, 'Enter an appointment ID')
    .max(80, 'Must be 80 characters or fewer')
    .regex(/^[A-Za-z0-9_-]+$/, 'Use only letters, numbers, hyphens, or underscores')
});

type FormValues = z.infer<typeof schema>;

/** Compact inline version of the full lookup page, embedded on each dashboard. */
export function QuickLookupForm() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { appointmentId: '' } });

  const onSubmit = (values: FormValues) => navigate(`/appointments/${values.appointmentId}`);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3 sm:flex-row">
      <div className="flex-1">
        <label htmlFor="quick-lookup-id" className="sr-only">
          Appointment ID
        </label>
        <input
          id="quick-lookup-id"
          type="text"
          placeholder="Enter an appointment ID"
          aria-invalid={errors.appointmentId ? true : undefined}
          aria-describedby={errors.appointmentId ? 'quick-lookup-error' : undefined}
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus-visible:border-primary-500"
          {...register('appointmentId')}
        />
        {errors.appointmentId && (
          <p id="quick-lookup-error" role="alert" className="mt-1.5 text-sm text-red-600">
            {errors.appointmentId.message}
          </p>
        )}
      </div>
      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Open
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
}
