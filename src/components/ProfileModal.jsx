import React, { useState, useRef } from "react";
import {
  FaTimes,
  FaCamera,
  FaTrashAlt,
  FaCheck,
  FaUserShield,
  FaUserTie,
  FaUserGraduate,
  FaBuilding,
  FaEnvelope,
  FaIdBadge,
} from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { updateProfilePicture } from "../services/studentservice";

const ProfileModal = ({ isOpen, onClose }) => {
  const { currentUser, updateUserProfilePicState, isAdmin, isTeacher, isStudent } = useAuth();
  const fileInputRef = useRef(null);

  const [previewPic, setPreviewPic] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null); // { type: 'success' | 'error', text: '' }

  if (!isOpen) return null;

  const currentPic = previewPic !== null ? previewPic : currentUser?.profilePic || "";
  const roleName = isAdmin
    ? "System Administrator"
    : isTeacher
    ? "Faculty Member"
    : "Registered Student";

  // Compress image to ensure fast uploads and manageable base64 size
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setStatusMsg({ type: "error", text: "Please select a valid image file (JPEG, PNG, WEBP)." });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setPreviewPic(compressedDataUrl);
        setSelectedFile(compressedDataUrl);
        setStatusMsg(null);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSavePicture = async () => {
    if (!selectedFile && previewPic === null) return;
    setLoading(true);
    setStatusMsg(null);

    try {
      const picToSend = previewPic || "";
      const res = await updateProfilePicture(picToSend);
      if (res.data?.success) {
        updateUserProfilePicState(res.data.profile_pic);
        setStatusMsg({
          type: "success",
          text: "Profile picture saved successfully! It will now appear on your badges, attendance records, and hall tickets.",
        });
        setSelectedFile(null);
      } else {
        setStatusMsg({ type: "error", text: res.data?.error || "Failed to update profile picture." });
      }
    } catch (err) {
      setStatusMsg({
        type: "error",
        text: err.response?.data?.error || "Error connecting to server. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePicture = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await updateProfilePicture("");
      if (res.data?.success) {
        updateUserProfilePicState("");
        setPreviewPic("");
        setSelectedFile(null);
        setStatusMsg({ type: "success", text: "Profile picture removed." });
      }
    } catch (err) {
      setStatusMsg({ type: "error", text: "Failed to remove profile picture." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        padding: "16px",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "460px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          border: "1px solid #e2e8f0",
          animation: "modalFadeIn 0.25s ease-out",
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            background: isAdmin
              ? "linear-gradient(135deg, #5b21b6, #7c3aed)"
              : isTeacher
              ? "linear-gradient(135deg, #1e40af, #3b82f6)"
              : "linear-gradient(135deg, #065f46, #10b981)",
            padding: "20px 24px",
            color: "#ffffff",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {isAdmin ? <FaUserShield size={20} /> : isTeacher ? <FaUserTie size={20} /> : <FaUserGraduate size={20} />}
            <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#ffffff" }}>
              My Profile &amp; Avatar
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.2)",
              border: "none",
              color: "#ffffff",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <FaTimes />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "24px" }}>
          {statusMsg && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                marginBottom: "18px",
                fontSize: "13px",
                fontWeight: 600,
                background: statusMsg.type === "success" ? "#ecfdf5" : "#fef2f2",
                color: statusMsg.type === "success" ? "#065f46" : "#991b1b",
                border: `1px solid ${statusMsg.type === "success" ? "#a7f3d0" : "#fecaca"}`,
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {statusMsg.type === "success" ? <FaCheck /> : <FaTimes />}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* Avatar Upload Container */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "120px",
                height: "120px",
                borderRadius: "50%",
                padding: "4px",
                background: isAdmin
                  ? "linear-gradient(135deg, #7c3aed, #c084fc)"
                  : isTeacher
                  ? "linear-gradient(135deg, #2563eb, #60a5fa)"
                  : "linear-gradient(135deg, #10b981, #6ee7b7)",
                boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: "#f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {currentPic ? (
                  <img
                    src={currentPic}
                    alt="Profile Avatar"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span
                    style={{
                      fontSize: "42px",
                      fontWeight: 800,
                      color: isAdmin ? "#7c3aed" : isTeacher ? "#2563eb" : "#059669",
                    }}
                  >
                    {(currentUser?.name || currentUser?.username || "U").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Camera Trigger Badge */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Choose new photo"
                style={{
                  position: "absolute",
                  bottom: "4px",
                  right: "4px",
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "#0f172a",
                  color: "#ffffff",
                  border: "2px solid #ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                }}
              >
                <FaCamera size={14} />
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            {/* Action Buttons for Avatar */}
            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  color: "#334155",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Browse Image
              </button>

              {selectedFile && (
                <button
                  type="button"
                  onClick={handleSavePicture}
                  disabled={loading}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "8px",
                    border: "none",
                    background: isAdmin ? "#7c3aed" : isTeacher ? "#2563eb" : "#059669",
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: loading ? "wait" : "pointer",
                  }}
                >
                  {loading ? "Saving..." : "Save Picture"}
                </button>
              )}

              {currentPic && !selectedFile && (
                <button
                  type="button"
                  onClick={handleRemovePicture}
                  disabled={loading}
                  title="Remove picture"
                  style={{
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    color: "#dc2626",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: loading ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <FaTrashAlt size={11} /> Remove
                </button>
              )}
            </div>
            <span style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px" }}>
              Recommended: Passport photo / Square aspect ratio (JPG, PNG)
            </span>
          </div>

          {/* User Details Details Card */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "16px",
              fontSize: "13px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
                borderBottom: "1px solid #e2e8f0",
                paddingBottom: "10px",
              }}
            >
              <span style={{ color: "#64748b", fontWeight: 600 }}>Designation</span>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: "11.5px",
                  padding: "3px 10px",
                  borderRadius: "20px",
                  background: isAdmin ? "#ede9fe" : isTeacher ? "#eff6ff" : "#ecfdf5",
                  color: isAdmin ? "#6d28d9" : isTeacher ? "#1d4ed8" : "#047857",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {roleName}
              </span>
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b", display: "flex", alignItems: "center", gap: "6px" }}>
                  <FaIdBadge /> Name:
                </span>
                <strong style={{ color: "#0f172a" }}>{currentUser?.name || currentUser?.username}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b", display: "flex", alignItems: "center", gap: "6px" }}>
                  <FaEnvelope /> Email:
                </span>
                <span style={{ color: "#334155" }}>{currentUser?.email || "—"}</span>
              </div>

              {currentUser?.rollNo && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b" }}>Roll Number:</span>
                  <strong style={{ color: "#2563eb" }}>{currentUser.rollNo}</strong>
                </div>
              )}

              {currentUser?.department && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b", display: "flex", alignItems: "center", gap: "6px" }}>
                    <FaBuilding /> Department:
                  </span>
                  <span style={{ color: "#334155" }}>{currentUser.department}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            background: "#f1f5f9",
            padding: "12px 24px",
            textAlign: "right",
            borderTop: "1px solid #e2e8f0",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "7px 18px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#334155",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
