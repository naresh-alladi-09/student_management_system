import React from "react";
import { FaExclamationTriangle, FaRedo } from "react-icons/fa";

const ErrorMessage = ({
  title = "Error Occurred",
  message = "Unable to complete request. Please try again.",
  onRetry = null,
  compact = false,
}) => {
  if (compact) {
    return (
      <div
        role="alert"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          background: "#fff1f2",
          border: "1px solid #fecdd3",
          borderRadius: "6px",
          color: "#9f1239",
          fontSize: "13px",
        }}
      >
        <FaExclamationTriangle style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{message}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              background: "none",
              border: "none",
              color: "#be123c",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "12px",
            }}
          >
            <FaRedo /> Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      style={{
        background: "#fff",
        border: "1px solid #fee2e2",
        borderLeft: "4px solid #ef4444",
        borderRadius: "8px",
        padding: "16px 20px",
        margin: "12px 0",
        display: "flex",
        alignItems: "flex-start",
        gap: "14px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          background: "#fef2f2",
          color: "#ef4444",
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: "16px",
        }}
      >
        <FaExclamationTriangle />
      </div>

      <div style={{ flex: 1 }}>
        <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 600, color: "#991b1b" }}>
          {title}
        </h4>
        <p style={{ margin: 0, fontSize: "13px", color: "#b91c1c", lineHeight: "1.4" }}>
          {message}
        </p>

        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              marginTop: "10px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              background: "#ef4444",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <FaRedo /> Retry Request
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorMessage;
