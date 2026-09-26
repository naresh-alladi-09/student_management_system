import { useState, useEffect, useRef, useCallback } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { verifyHallTicketQR, checkInExamCandidate } from "../services/studentservice";
import { FaTimes, FaCheckCircle, FaTimesCircle, FaExclamationTriangle, FaUserGraduate } from "react-icons/fa";

const ExamScannerModal = ({ onClose }) => {
  const [candidateData, setCandidateData] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInSuccessMsg, setCheckInSuccessMsg] = useState(null);
  const scannerRef = useRef(null);
  const lastScannedTokenRef = useRef("");

  const cleanExtractedToken = (rawText) => {
    if (!rawText) return "";
    const trimmed = rawText.trim();
    if (trimmed.includes("token=")) {
      try {
        const url = new URL(trimmed);
        return url.searchParams.get("token") || trimmed;
      } catch {
        const match = trimmed.match(/token=([a-zA-Z0-9_-]+)/);
        if (match) return match[1];
      }
    }
    return trimmed;
  };

  const handleVerifyToken = useCallback(async (rawCode) => {
    const token = cleanExtractedToken(rawCode);
    if (!token) return;

    if (lastScannedTokenRef.current === token && candidateData) {
      return;
    }
    lastScannedTokenRef.current = token;

    setVerifying(true);
    setScanError(null);
    setCheckInSuccessMsg(null);

    try {
      const res = await verifyHallTicketQR(token);
      setCandidateData({ ...res.data, rawToken: token });
    } catch (err) {
      setScanError(
        err.response?.data?.error ||
        err.response?.data?.detail ||
        "Invalid, expired, or unrecognized examination QR code."
      );
      setCandidateData(null);
    } finally {
      setVerifying(false);
    }
  }, [candidateData]);

  useEffect(() => {
    let scanner = null;
    const scannerElementId = "exam-scanner-modal-reader";

    const timeout = setTimeout(() => {
      const elem = document.getElementById(scannerElementId);
      if (!elem) return;

      try {
        scanner = new Html5QrcodeScanner(scannerElementId, {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          showTorchButtonIfSupported: true,
          rememberLastUsedCamera: true,
        });

        scanner.render(
          (decodedText) => {
            handleVerifyToken(decodedText);
          },
          () => {} // Ignored errorMessage
        );

        scannerRef.current = scanner;
      } catch { // Ignored err
        setScanError("Camera unavailable or permission denied.");
      }
    }, 150);

    return () => {
      clearTimeout(timeout);
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch {
          // ignore
        }
        scannerRef.current = null;
      }
    };
  }, [handleVerifyToken]);

  const handleCheckInCandidate = async () => {
    if (!candidateData?.rawToken) return;
    setCheckingIn(true);
    setCheckInSuccessMsg(null);

    try {
      const res = await checkInExamCandidate(candidateData.rawToken);
      if (res.data?.success) {
        setCheckInSuccessMsg(res.data.message || "Candidate successfully checked in.");
        setCandidateData((prev) => ({
          ...prev,
          is_verified_in_hall: true,
          verified_in_hall_at: res.data.verified_in_hall_at,
          verified_by_name: res.data.verified_by_name,
        }));
      }
    } catch (err) {
      alert(err.response?.data?.error || "Failed to check-in candidate.");
    } finally {
      setCheckingIn(false);
    }
  };

  const handleScanNext = () => {
    setCandidateData(null);
    setScanError(null);
    setCheckInSuccessMsg(null);
    lastScannedTokenRef.current = "";
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px"
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "800px",
          maxHeight: "90vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          position: "relative"
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "none",
            border: "none",
            fontSize: "20px",
            cursor: "pointer",
            color: "#64748b",
            zIndex: 10
          }}
        >
          <FaTimes />
        </button>

        <div style={{ padding: "24px", borderBottom: "1px solid #e2e8f0" }}>
          <h2 style={{ margin: 0, fontSize: "20px", color: "#0f172a" }}>Exam Hall Ticket Scanner</h2>
          <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "14px" }}>
            Scan the permanent QR code on the student's hall ticket.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {/* Scanner Side */}
          <div style={{ flex: "1 1 300px", padding: "24px", borderRight: "1px solid #e2e8f0" }}>
            <div id="exam-scanner-modal-reader" style={{ width: "100%" }}></div>
            {verifying && <p style={{ color: "#2563eb", fontWeight: "bold", textAlign: "center" }}>Verifying...</p>}
          </div>

          {/* Details Side */}
          <div style={{ flex: "1 1 400px", padding: "24px" }}>
            {scanError && (
              <div style={{ textAlign: "center" }}>
                <FaTimesCircle style={{ fontSize: "48px", color: "#ef4444" }} />
                <h3 style={{ color: "#ef4444" }}>Verification Failed</h3>
                <p>{scanError}</p>
                <button
                  onClick={handleScanNext}
                  style={{ padding: "8px 16px", background: "#0f172a", color: "#fff", borderRadius: "8px", border: "none", cursor: "pointer" }}
                >
                  Scan Next
                </button>
              </div>
            )}

            {!scanError && !candidateData && (
              <div style={{ textAlign: "center", color: "#94a3b8", paddingTop: "50px" }}>
                <FaUserGraduate style={{ fontSize: "48px", marginBottom: "16px" }} />
                <p>Waiting for QR scan...</p>
              </div>
            )}

            {candidateData && (
              <div>
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    background: candidateData.status === "VERIFIED_AUTHENTIC" ? "#dcfce7" : "#fee2e2",
                    color: candidateData.status === "VERIFIED_AUTHENTIC" ? "#166534" : "#991b1b",
                    marginBottom: "16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px"
                  }}
                >
                  {candidateData.status === "VERIFIED_AUTHENTIC" ? <FaCheckCircle size={24} /> : <FaExclamationTriangle size={24} />}
                  <div>
                    <h3 style={{ margin: 0, fontSize: "16px" }}>{candidateData.status_display}</h3>
                    <p style={{ margin: "4px 0 0 0", fontSize: "14px" }}>Hall Ticket: {candidateData.hall_ticket_number}</p>
                  </div>
                </div>

                {checkInSuccessMsg && (
                  <div style={{ padding: "12px", background: "#dbeafe", color: "#1e40af", borderRadius: "8px", marginBottom: "16px" }}>
                    {checkInSuccessMsg}
                  </div>
                )}

                <div style={{ display: "flex", gap: "16px", marginBottom: "24px" }}>
                  <div style={{ width: "100px", height: "100px", background: "#e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
                    {candidateData.student?.profile_pic ? (
                      <img src={candidateData.student.profile_pic} alt="student" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                         <FaUserGraduate size={32} color="#94a3b8" />
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 style={{ margin: "0 0 4px 0", fontSize: "18px" }}>{candidateData.student?.name}</h4>
                    <p style={{ margin: "0 0 4px 0", color: "#475569" }}>Roll No: {candidateData.student?.roll_no}</p>
                    <p style={{ margin: 0, color: "#475569" }}>{candidateData.student?.branch} • Sem {candidateData.student?.semester}</p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px" }}>
                  {!candidateData.is_verified_in_hall && (candidateData.attendance?.is_eligible || candidateData.attendance?.is_condoned) ? (
                    <button
                      onClick={handleCheckInCandidate}
                      disabled={checkingIn}
                      style={{ padding: "10px 20px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}
                    >
                      {checkingIn ? "Admitting..." : "Admit Candidate"}
                    </button>
                  ) : null}
                  <button
                    onClick={handleScanNext}
                    style={{ padding: "10px 20px", background: "#e2e8f0", color: "#334155", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}
                  >
                    Scan Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamScannerModal;
