import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useToast } from '../../../components/ui/ToastProvider';

export function CopyableId({ value, label }: { value: string; label: string }) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      showToast({ variant: 'success', title: 'Copied', description: `${label} copied to clipboard.` });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast({ variant: 'error', title: 'Copy failed', description: 'Your browser blocked clipboard access.' });
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-sm text-slate-700 hover:bg-slate-100"
      aria-label={`Copy ${label}: ${value}`}
    >
      {value}
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
      )}
    </button>
  );
}
