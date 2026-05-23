'use client';

import React, { ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: React.ErrorInfo | null;
}

/**
 * Error Boundary Component
 * Catches React component errors and displays a user-friendly error message
 * Prevents white screen of death and allows graceful recovery
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        this.setState({
            errorInfo,
        });

        // Log to console for debugging
        console.error('ErrorBoundary caught an error:', error, errorInfo);

        // Call optional error callback (could be used to send to error tracking service)
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
    };

    render() {
        if (this.state.hasError) {
            // Use custom fallback if provided
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // Default error UI
            return (
                <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
                    <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-red-200 overflow-hidden">
                        {/* Header */}
                        <div className="h-2 bg-gradient-to-r from-red-400 to-orange-400" />

                        {/* Content */}
                        <div className="p-6">
                            {/* Icon */}
                            <div className="flex justify-center mb-4">
                                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                                    <AlertTriangle className="w-8 h-8 text-red-600" />
                                </div>
                            </div>

                            {/* Message */}
                            <h1 className="text-2xl font-bold text-center text-slate-900 mb-2">
                                Oops! Something went wrong
                            </h1>
                            <p className="text-sm text-center text-slate-600 mb-4">
                                We encountered an unexpected error. Our team has been notified.
                            </p>

                            {/* Error Details (Development only) */}
                            {process.env.NODE_ENV === 'development' && this.state.error && (
                                <div className="mb-4 p-3 bg-slate-100 rounded-lg border border-slate-200">
                                    <p className="text-xs font-mono text-slate-700 break-words">
                                        <span className="font-bold text-red-600">Error: </span>
                                        {this.state.error.message}
                                    </p>
                                    {this.state.errorInfo?.componentStack && (
                                        <details className="mt-2">
                                            <summary className="text-xs font-semibold text-slate-600 cursor-pointer hover:text-slate-700">
                                                Stack trace
                                            </summary>
                                            <pre className="text-[10px] text-slate-600 mt-2 overflow-auto max-h-32 bg-white p-2 rounded border border-slate-200">
                                                {this.state.errorInfo.componentStack}
                                            </pre>
                                        </details>
                                    )}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={this.handleReset}
                                    className="w-full py-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Try Again
                                </button>
                                <button
                                    onClick={() => window.location.href = '/'}
                                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-semibold rounded-lg transition-all"
                                >
                                    Go to Home
                                </button>
                            </div>

                            {/* Footer */}
                            <p className="text-xs text-center text-slate-500 mt-4">
                                If this problem persists, please contact support.
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

/**
 * Hook to use error boundary functionality in functional components
 * Note: Error Boundaries must be class components, but this helps document the pattern
 */
export function useErrorHandler() {
    return (error: Error) => {
        console.error('Handled error:', error);
        throw error;
    };
}

export default ErrorBoundary;
