import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f172a",
            color: "#ffffff",
            padding: "24px",
            fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
          }}
        >
          <div
            style={{
              background: "#1e293b",
              borderRadius: "16px",
              padding: "36px",
              maxWidth: "520px",
              width: "100%",
              textAlign: "center",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
              border: "1px solid #334155",
            }}
          >
            <div
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: "#fef2f2",
                color: "#dc2626",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "28px",
                marginBottom: "20px",
              }}
            >
              ⚠️
            </div>
            <h2 style={{ margin: "0 0 10px 0", fontSize: "22px", fontWeight: 800 }}>
              Something Went Wrong
            </h2>
            <p style={{ margin: "0 0 20px 0", color: "#94a3b8", fontSize: "14px", lineHeight: "1.6" }}>
              An unexpected error occurred while rendering this view. Your session and data are secure.
            </p>
            {this.state.error?.message && (
              <div
                style={{
                  background: "#0f172a",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  color: "#f87171",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  textAlign: "left",
                  marginBottom: "20px",
                  overflowX: "auto",
                }}
              >
                {this.state.error.message}
              </div>
            )}
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  padding: "10px 24px",
                  background: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                🔄 Refresh Page
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = "/";
                }}
                style={{
                  padding: "10px 20px",
                  background: "#334155",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
