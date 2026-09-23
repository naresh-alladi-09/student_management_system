import React from "react";
import { FaExclamationTriangle, FaTimes } from "react-icons/fa";

const ConfirmationModal = ({
  isOpen = false,
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger", // 'danger' | 'warning' | 'primary'
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      btnBg: "#dc2626",
      btnColor: "#fff",
      iconColor: "#dc2626",
      iconBg: "#fee2e2",
    },
    warning: {
      btnBg: "#d97706",
      btnColor: "#fff",
      iconColor: "#d97706",
      iconBg: "#fef3c7",
    },
    primary: {
      btnBg: "#2563eb",
      btnColor: "#fff",
      iconColor: "#2563eb",
      iconBg: "#eff6ff",
    },
  }[variant] || variantStyles.danger;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "440px",
          padding: "24px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "transparent",
            border: "none",
            fontSize: "16px",
            color: "#94a3b8",
            cursor: "pointer",
          }}
        >
          <FaTimes />
        </button>

        <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: variantStyles.iconBg,
              color: variantStyles.iconColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              flexShrink: 0,
            }}
          >
            <FaExclamationTriangle />
          </div>

          <div style={{ flex: 1 }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              {title}
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b", lineHeight: "1.5" }}>
              {message}
            </p>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            marginTop: "24px",
          }}
        >
          <button
            onClick={onCancel}
            disabled={isLoading}
            style={{
              padding: "8px 16px",
              background: "#f1f5f9",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              color: "#475569",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>

          <button
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              padding: "8px 16px",
              background: variantStyles.btnBg,
              border: "none",
              borderRadius: "6px",
              color: variantStyles.btnColor,
              fontSize: "13px",
              fontWeight: 600,
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            {isLoading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
