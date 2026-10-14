import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[360px] flex items-center justify-center p-6 bg-slate-50/80 rounded-2xl border border-red-100 my-4 shadow-sm">
          <div className="max-w-md w-full text-center">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-200/60 shadow-sm">
              <AlertTriangle className="w-7 h-7" />
            </div>
            
            <h3 className="text-lg font-bold text-slate-800 mb-1">
              {this.props.fallbackTitle || 'Component Error Occurred'}
            </h3>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">
              An unexpected display issue occurred in this workspace view. You can reload this view or return to the main dashboard.
            </p>

            {this.state.error && (
              <details className="text-left bg-white p-3 rounded-xl border border-slate-200 text-xs text-red-700 font-mono mb-5 overflow-auto max-h-36">
                <summary className="cursor-pointer text-slate-500 font-sans font-medium mb-1 hover:text-slate-700">
                  Technical Diagnostics
                </summary>
                {this.state.error.toString()}
              </details>
            )}

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reload View
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/';
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-sm font-medium rounded-xl transition-colors"
              >
                <Home className="w-4 h-4" />
                Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
