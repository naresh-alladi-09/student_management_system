import React from "react";
import { FaInbox } from "react-icons/fa";

const EmptyState = ({
  icon: Icon = FaInbox,
  title = "No Data Found",
  message = "No records are available for the selected filters.",
  actionLabel = null,
  onAction = null,
}) => {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "#f1f5f9",
          color: "#94a3b8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "24px",
          marginBottom: "16px",
        }}
      >
        <Icon />
      </div>

      <h4 style={{ margin: "0 0 6px 0", fontSize: "16px", fontWeight: 600, color: "#1e293b" }}>
        {title}
      </h4>
      <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#64748b", maxWidth: "360px", lineHeight: "1.5" }}>
        {message}
      </p>

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            padding: "8px 16px",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
