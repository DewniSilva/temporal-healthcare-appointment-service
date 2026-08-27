import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon } from 'lucide-react';
import { Button } from './ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Intentionally no request bodies, tokens, or patient data ever reach logs.
    console.error('Unhandled UI error', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
    window.location.assign('/dashboard');
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl2 border border-slate-200 bg-white p-8 text-center shadow-card">
          <AlertOctagon className="mx-auto h-10 w-10 text-red-500" aria-hidden="true" />
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-500">
            An unexpected error occurred while rendering this page. You can return to your dashboard and try again.
          </p>
          <Button className="mt-6" onClick={this.reset}>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }
}
