import React, { useEffect } from "react";
import {
  FaCheckCircle,
  FaExclamationCircle,
  FaExclamationTriangle,
  FaInfoCircle,
  FaTimes,
} from "react-icons/fa";

const Toast = ({
  message,
  type = "success", // 'success' | 'error' | 'warning' | 'info'
  duration = 4000,
  onClose,
}) => {
  useEffect(() => {
    if (!message || !duration) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  const typeConfig = {
    success: {
      bg: "#ecfdf5",
      border: "#a7f3d0",
      color: "#065f46",
      icon: <FaCheckCircle style={{ color: "#10b981", fontSize: "16px" }} />,
    },
    error: {
      bg: "#fff1f2",
      border: "#fecdd3",
      color: "#9f1239",
      icon: <FaExclamationCircle style={{ color: "#f43f5e", fontSize: "16px" }} />,
    },
    warning: {
      bg: "#fffbeb",
      border: "#fde68a",
      color: "#92400e",
      icon: <FaExclamationTriangle style={{ color: "#f59e0b", fontSize: "16px" }} />,
    },
    info: {
      bg: "#eff6ff",
      border: "#bfdbfe",
      color: "#1e40af",
      icon: <FaInfoCircle style={{ color: "#3b82f6", fontSize: "16px" }} />,
    },
  }[type] || typeConfig.info;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "12px 18px",
        background: typeConfig.bg,
        border: `1px solid ${typeConfig.border}`,
        borderRadius: "8px",
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
        maxWidth: "400px",
        animation: "slideIn 0.25s ease-out",
      }}
    >
      <div style={{ flexShrink: 0 }}>{typeConfig.icon}</div>
      <div style={{ flex: 1, fontSize: "13px", fontWeight: 500, color: typeConfig.color }}>
        {message}
      </div>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          color: typeConfig.color,
          opacity: 0.6,
          cursor: "pointer",
          padding: "2px",
          display: "flex",
          alignItems: "center",
          fontSize: "14px",
        }}
      >
        <FaTimes />
      </button>
    </div>
  );
};

export default Toast;
