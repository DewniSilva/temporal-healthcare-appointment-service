const DEMO_ACCOUNTS = [
  { label: 'Patient (patient-001)', email: 'patient1@example.test' },
  { label: 'Patient (patient-002)', email: 'patient2@example.test' },
  { label: 'Doctor (doctor-001)', email: 'doctor1@example.test' },
  { label: 'Admin', email: 'admin@example.test' }
] as const;

const DEMO_PASSWORD = 'DemoPass123!';

interface DemoCredentialsProps {
  onSelect: (email: string, password: string) => void;
}

const buttonClasses = [
  'rounded-lg border border-slate-200 bg-white px-3 py-2',
  'text-left text-xs font-medium text-slate-600',
  'hover:border-primary-300 hover:bg-primary-50',
  'hover:text-primary-700'
].join(' ');

/** Development-only convenience; never rendered in a production build. */
export function DemoCredentials({ onSelect }: DemoCredentialsProps) {
  if (!import.meta.env.DEV) return null;

  return (
    <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Demo accounts (development only)
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.email}
            type="button"
            onClick={() => onSelect(account.email, DEMO_PASSWORD)}
            className={buttonClasses}
          >
            {account.label}
            <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
              {account.email}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
