import React from "react";

interface Props { children: React.ReactNode; fallback?: React.ReactNode; }
interface State { hasError: boolean; error: string; }

export class RenderErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[RMS] Renderer crash:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{ padding: 12, color: "#FF4757", fontSize: 11, fontFamily: "monospace" }}>
          ⚠️ Render error: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}
