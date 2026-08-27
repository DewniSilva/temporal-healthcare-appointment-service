import type { UseFormRegisterReturn } from 'react-hook-form';

interface DoctorIdInputProps {
  registration: UseFormRegisterReturn;
  error?: string;
}

/**
 * The backend does not expose a doctor directory endpoint, so this is a
 * plain ID field for the demo. Isolated as its own component so a future
 * GET /doctors endpoint can back a real picker here without touching the
 * booking form around it.
 */
export function DoctorIdInput({ registration, error }: DoctorIdInputProps) {
  return (
    <div>
      <label htmlFor="doctorId" className="block text-sm font-medium text-slate-700">
        Doctor ID
      </label>
      <input
        id="doctorId"
        type="text"
        placeholder="doctor-001"
        aria-invalid={error ? true : undefined}
        aria-describedby="doctorId-hint doctorId-error"
        className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus-visible:border-primary-500"
        {...registration}
      />
      <p id="doctorId-hint" className="mt-1.5 text-xs text-slate-400">
        There is no doctor directory yet, so enter the doctor's ID directly.
      </p>
      {error && (
        <p id="doctorId-error" role="alert" className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
