import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/** Shows a way out instead of a blank page if rendering throws. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-bg text-fg flex items-center justify-center p-6">
        <div className="max-w-lg space-y-3">
          <h1 className="text-lg font-semibold">The editor crashed</h1>
          <p className="text-sm text-muted">
            Your code is saved in this browser. Reloading usually helps; if it keeps happening, reset the saved workspace.
          </p>
          <pre className="text-xs font-mono text-danger bg-danger-soft rounded-md p-3 whitespace-pre-wrap">{this.state.error.message}</pre>
          <div className="flex gap-2">
            <button className="h-8 px-3 bg-accent text-accent-fg rounded-md text-[13px] font-medium" onClick={() => location.reload()}>
              Reload
            </button>
            <button
              className="h-8 px-3 border border-line-strong rounded-md text-[13px] font-medium"
              onClick={() => {
                try {
                  localStorage.clear();
                } catch {
                  /* unavailable */
                }
                location.hash = "";
                location.reload();
              }}
            >
              Reset workspace
            </button>
          </div>
        </div>
      </div>
    );
  }
}
