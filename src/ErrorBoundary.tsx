import { Component, type ErrorInfo, type ReactNode } from 'react';
import { APP_NAME } from './app-brand';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`${APP_NAME} render error:`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="error-fallback" style={{ padding: '2rem', maxWidth: '40rem' }}>
          <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
          <p style={{ opacity: 0.85 }}>{this.state.error.message}</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => window.location.reload()}
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
