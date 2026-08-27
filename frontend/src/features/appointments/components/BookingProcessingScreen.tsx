import { Link } from 'react-router-dom';
import { CheckCircle2, RotateCw } from 'lucide-react';
import { Card, CardHeader } from '../../../components/ui/Card';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';
import { Timeline } from './Timeline';
import { useBookingProgress } from '../hooks/useBookingProgress';

interface BookingProcessingScreenProps {
  appointmentId: string;
  wasAlreadyStarted: boolean;
  onBookAnother: () => void;
}

export function BookingProcessingScreen({
  appointmentId,
  wasAlreadyStarted,
  onBookAnother
}: BookingProcessingScreenProps) {
  const progress = useBookingProgress(appointmentId);
  const dbStatus = progress.appointment?.status ?? 'PENDING';

  return (
    <Card>
      <CardHeader
        title="Processing your booking request"
        description={`Appointment ${appointmentId}`}
      />

      {wasAlreadyStarted && (
        <div className="mb-4">
          <Alert variant="info" title="Already submitted">
            This idempotency key was already used for this request, so no
            duplicate booking was created.
          </Alert>
        </div>
      )}

      {progress.phase === 'locating' && (
        <Spinner label="Creating your appointment record..." />
      )}

      {progress.phase === 'orchestrating' && (
        <Spinner label="Waiting for the booking workflow to progress..." />
      )}

      {progress.phase === 'complete' && (
        <Alert variant="success" title="Booking workflow reached a final state">
          Review the timeline below, or open the full appointment details.
        </Alert>
      )}

      {progress.phase === 'stalled' && (
        <Alert variant="warning" title="This is taking longer than expected">
          The request may still be processing on the server. You can keep
          waiting or check again now.
        </Alert>
      )}

      <div className="mt-6">
        <Timeline dbStatus={dbStatus} workflow={progress.workflow} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {progress.phase === 'stalled' && (
          <Button variant="secondary" onClick={progress.retry}>
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Check again
          </Button>
        )}
        {progress.appointment && (
          <Link
            to={`/appointments/${appointmentId}`}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            View appointment details
          </Link>
        )}
        <Button variant="ghost" onClick={onBookAnother}>
          Book another appointment
        </Button>
      </div>
    </Card>
  );
}
