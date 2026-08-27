import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Search } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

const lookupSchema = z.object({
  appointmentId: z
    .string()
    .min(3, 'Enter an appointment ID')
    .max(80, 'Must be 80 characters or fewer')
    .regex(/^[A-Za-z0-9_-]+$/, 'Use only letters, numbers, hyphens, or underscores')
});

type LookupFormValues = z.infer<typeof lookupSchema>;

export function AppointmentLookupPage() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LookupFormValues>({ resolver: zodResolver(lookupSchema), defaultValues: { appointmentId: '' } });

  const onSubmit = (values: LookupFormValues) => {
    navigate(`/appointments/${values.appointmentId}`);
  };

  return (
    <Card>
      <CardHeader
        title="Find an appointment"
        description="Enter an appointment ID to open its details. There is no list endpoint yet, so lookups must be by ID."
      />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="appointmentId" className="block text-sm font-medium text-slate-700">
            Appointment ID
          </label>
          <input
            id="appointmentId"
            type="text"
            placeholder="apt-1a2b3c4d5e6f7890abcd1234"
            aria-invalid={errors.appointmentId ? true : undefined}
            aria-describedby={errors.appointmentId ? 'appointmentId-error' : undefined}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus-visible:border-primary-500"
            {...register('appointmentId')}
          />
          {errors.appointmentId && (
            <p id="appointmentId-error" role="alert" className="mt-1.5 text-sm text-red-600">
              {errors.appointmentId.message}
            </p>
          )}
        </div>
        <Button type="submit">
          <Search className="h-4 w-4" aria-hidden="true" />
          Find appointment
        </Button>
      </form>
    </Card>
  );
}
