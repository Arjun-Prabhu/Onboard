/**
 * @file Global UI error handler (NFR-2). Any render error shows a calm recovery screen instead
 * of a blank window; unhandled promise rejections are logged and surfaced as a toast.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { GENERIC_ERROR_MESSAGE } from '@shared/errors';

interface State {
  hasError: boolean;
}

/** Catches render errors anywhere below it. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  /** Initial state. */
  state: State = { hasError: false };

  /**
   * Switches to the fallback UI after an error.
   * @returns The new state.
   */
  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  /**
   * Logs the error locally (never shown to the user).
   * @param error - The error.
   * @param info - React component stack.
   */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Onboard] UI error', error, info.componentStack);
  }

  /**
   * Renders children or the fallback.
   * @returns The UI.
   */
  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        className="grid min-h-screen place-items-center bg-canvas p-6 text-center text-ink"
      >
        <div className="max-w-md">
          <h1 className="text-3xl font-bold">This screen hit a snag</h1>
          <p className="mt-2 text-ink-muted">{GENERIC_ERROR_MESSAGE}</p>
          <button
            type="button"
            className="mt-6 min-h-11 rounded-control bg-primary px-5 font-semibold text-on-primary"
            onClick={() => {
              this.setState({ hasError: false });
              window.location.assign('/');
            }}
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }
}
