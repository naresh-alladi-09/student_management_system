import React from "react";
import { FaSpinner } from "react-icons/fa";

const LoadingSpinner = ({
  message = "Loading...",
  size = "medium", // 'small' | 'medium' | 'large'
  fullscreen = false,
}) => {
  const sizeMap = {
    small: { icon: "16px", text: "12px", padding: "12px" },
    medium: { icon: "24px", text: "14px", padding: "24px" },
    large: { icon: "36px", text: "16px", padding: "48px" },
  };

  const currentSize = sizeMap[size] || sizeMap.medium;

  const content = (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: currentSize.padding,
        gap: "12px",
        color: "#2563eb",
      }}
    >
      <FaSpinner
        className="fa-spin"
        style={{
          fontSize: currentSize.icon,
          animation: "spin 1s linear infinite",
        }}
      />
      {message && (
        <span
          style={{
            fontSize: currentSize.text,
            fontWeight: 500,
            color: "#475569",
          }}
        >
          {message}
        </span>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(255, 255, 255, 0.8)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        }}
      >
        {content}
      </div>
    );
  }

  return content;
};

export default LoadingSpinner;
