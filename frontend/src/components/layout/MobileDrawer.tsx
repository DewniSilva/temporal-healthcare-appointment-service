import { useEffect, useRef } from 'react';
import { HeartPulse, X } from 'lucide-react';
import { NavLinks } from './NavLinks';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Native <dialog> gives us focus trapping and Escape-to-close for free; it is
 * styled to sit flush against the left edge instead of centered.
 */
export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-label="Navigation menu"
      className="m-0 h-full max-h-full w-72 max-w-[85vw] p-0 backdrop:bg-slate-900/40"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-200 px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
              <HeartPulse className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-slate-900">Menu</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks onNavigate={onClose} />
        </div>
      </div>
    </dialog>
  );
}
