import React, { useState, useEffect, useRef } from "react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { Html5QrcodeScanner } from "html5-qrcode";
import {
  verifyHallTicketQR,
  checkInExamCandidate,
  getExamHallCheckins,
} from "../services/studentservice";
import {
  FaQrcode,
  FaCamera,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle,
  FaUserGraduate,
  FaVolumeUp,
  FaVolumeMute,
  FaSync,
  FaCheck,
  FaDownload,
  FaCalendarAlt,
  FaUniversity,
  FaShieldAlt,
  FaBook,
  FaClock,
  FaIdBadge,
} from "react-icons/fa";

const ExamHallScanner = () => {
  const [activeTab, setActiveTab] = useState("scanner"); // "scanner" | "admitted"
  const [manualToken, setManualToken] = useState("");
  const [scanning, setScanning] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [candidateData, setCandidateData] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInSuccessMsg, setCheckInSuccessMsg] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cameraError, setCameraError] = useState(null);

  // Admitted Candidates History
  const [admittedList, setAdmittedList] = useState([]);
  const [loadingAdmitted, setLoadingAdmitted] = useState(false);
  const [searchAdmitted, setSearchAdmitted] = useState("");

  const scannerRef = useRef(null);
  const lastScannedTokenRef = useRef("");

  // Synthesized Web Audio Beeper
  const playBeep = (type = "success") => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      if (type === "success") {
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        osc.frequency.setValueAtTime(880.0, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      } else {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        osc.frequency.setValueAtTime(164.81, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      }
    } catch {
      // ignore
    }
  };

  const loadAdmittedList = () => {
    setLoadingAdmitted(true);
    getExamHallCheckins()
      .then((res) => {
        setAdmittedList(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {})
      .finally(() => setLoadingAdmitted(false));
  };

  useEffect(() => {
    loadAdmittedList();
  }, []);

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

  const handleVerifyToken = async (rawCode) => {
    const token = cleanExtractedToken(rawCode);
    if (!token) return;

    // Prevent immediate repeated scans of same code
    if (lastScannedTokenRef.current === token && candidateData) {
      return;
    }
    lastScannedTokenRef.current = token;

    setVerifying(true);
    setScanError(null);
    setCheckInSuccessMsg(null);

    try {
      const res = await verifyHallTicketQR(token);
      const data = res.data;
      setCandidateData({ ...data, rawToken: token });

      if (data.status === "VERIFIED_AUTHENTIC" || data.attendance?.is_eligible || data.attendance?.is_condoned) {
        playBeep("success");
      } else {
        playBeep("error");
      }
    } catch (err) {
      playBeep("error");
      const errDetail =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        "Invalid, expired, or unrecognized examination QR code.";
      setScanError(errDetail);
      setCandidateData(null);
    } finally {
      setVerifying(false);
    }
  };

  // Initialize Html5QrcodeScanner
  useEffect(() => {
    if (activeTab !== "scanner") return;

    let scanner = null;
    const scannerElementId = "exam-gate-qr-reader";

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
          (errorMessage) => {
            // normal per-frame scan misses, ignore
          }
        );

        scannerRef.current = scanner;
      } catch (err) {
        setCameraError("Camera unavailable or permission denied. You can type or paste tokens manually below.");
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
  }, [activeTab]);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualToken.trim()) {
      handleVerifyToken(manualToken.trim());
    }
  };

  const handleCheckInCandidate = async () => {
    if (!candidateData?.rawToken) return;
    setCheckingIn(true);
    setCheckInSuccessMsg(null);

    try {
      const res = await checkInExamCandidate(candidateData.rawToken);
      if (res.data?.success) {
        playBeep("success");
        setCheckInSuccessMsg(res.data.message || "Candidate officially checked in to examination hall.");
        setCandidateData((prev) => ({
          ...prev,
          is_verified_in_hall: true,
          verified_in_hall_at: res.data.verified_in_hall_at,
          verified_by_name: res.data.verified_by_name,
        }));
        loadAdmittedList();
      }
    } catch (err) {
      playBeep("error");
      alert(err.response?.data?.error || "Failed to check-in candidate.");
    } finally {
      setCheckingIn(false);
    }
  };

  const handleScanNext = () => {
    setCandidateData(null);
    setScanError(null);
    setCheckInSuccessMsg(null);
    setManualToken("");
    lastScannedTokenRef.current = "";
  };

  const filteredAdmitted = admittedList.filter((item) => {
    if (!searchAdmitted.trim()) return true;
    const q = searchAdmitted.toLowerCase();
    return (
      item.student_name?.toLowerCase().includes(q) ||
      item.roll_no?.toLowerCase().includes(q) ||
      item.hall_ticket_number?.toLowerCase().includes(q) ||
      item.branch?.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc" }}>
      <Sidebar />

      <div style={{ flex: 1, padding: "24px 32px", overflowY: "auto", minWidth: 0 }}>
        <Navbar />

        {/* Top Header Banner */}
        <div
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
            color: "#ffffff",
            padding: "24px 28px",
            borderRadius: "16px",
            marginBottom: "24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
            boxShadow: "0 10px 25px rgba(15, 23, 42, 0.15)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "rgba(255, 255, 255, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                }}
              >
                <FaQrcode />
              </div>
              <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#ffffff" }}>
                Invigilator Exam Hall QR Gate
              </h1>
            </div>
            <p style={{ margin: 0, fontSize: "13.5px", color: "#bfdbfe" }}>
              Verify students' official admit cards, check candidate photographs, and admit students into the examination hall.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                background: soundEnabled ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.1)",
                color: soundEnabled ? "#34d399" : "#cbd5e1",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
              }}
              title="Toggle audio chime feedback"
            >
              {soundEnabled ? <FaVolumeUp /> : <FaVolumeMute />}
              <span>{soundEnabled ? "Audio Chime ON" : "Muted"}</span>
            </button>

            <button
              type="button"
              onClick={loadAdmittedList}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                background: "rgba(255, 255, 255, 0.15)",
                color: "#ffffff",
                border: "none",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <FaSync className={loadingAdmitted ? "fa-spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        {/* Tab Toggle: Live Scanner vs Admitted Roster */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          <button
            type="button"
            onClick={() => setActiveTab("scanner")}
            style={{
              padding: "10px 20px",
              borderRadius: "10px",
              border: "none",
              background: activeTab === "scanner" ? "#0f172a" : "#e2e8f0",
              color: activeTab === "scanner" ? "#ffffff" : "#475569",
              fontSize: "13.5px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FaCamera /> Live QR Camera Scanner
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("admitted")}
            style={{
              padding: "10px 20px",
              borderRadius: "10px",
              border: "none",
              background: activeTab === "admitted" ? "#0f172a" : "#e2e8f0",
              color: activeTab === "admitted" ? "#ffffff" : "#475569",
              fontSize: "13.5px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FaCheckCircle /> Admitted Candidates Roster ({admittedList.length})
          </button>
        </div>

        {/* TAB 1: SCANNER WORKSTATION */}
        {activeTab === "scanner" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: candidateData || scanError ? "420px 1fr" : "1fr",
              gap: "24px",
              alignItems: "start",
            }}
          >
            {/* Left Column: Camera Feed & Manual Input */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                border: "1px solid #e2e8f0",
                padding: "20px",
                boxShadow: "0 4px 15px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "14px",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                  <FaCamera style={{ color: "#2563eb" }} /> Active Camera Stream
                </div>
                {verifying && (
                  <span style={{ fontSize: "12px", color: "#2563eb", fontWeight: 700 }}>
                    Verifying QR code...
                  </span>
                )}
              </div>

              {cameraError && (
                <div
                  style={{
                    background: "#fef3c7",
                    border: "1px solid #fde68a",
                    color: "#92400e",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    marginBottom: "14px",
                  }}
                >
                  {cameraError}
                </div>
              )}

              {/* QR Scanner Container */}
              <div
                id="exam-gate-qr-reader"
                style={{
                  borderRadius: "12px",
                  overflow: "hidden",
                  border: "1px solid #cbd5e1",
                  background: "#0f172a",
                }}
              ></div>

              {/* Manual Input Alternative */}
              <form onSubmit={handleManualSubmit} style={{ marginTop: "18px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", marginBottom: "6px" }}>
                  Manual Token / Barcode Gun Input:
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    placeholder="Paste QR token / URL..."
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                      outline: "none",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={verifying || !manualToken.trim()}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      background: "#0f172a",
                      color: "#ffffff",
                      border: "none",
                      fontWeight: 600,
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    {verifying ? "Checking..." : "Verify"}
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Candidate Verification Card */}
            {(candidateData || scanError) && (
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "16px",
                  border: `2px solid ${
                    scanError
                      ? "#fecaca"
                      : candidateData?.status === "VERIFIED_AUTHENTIC"
                      ? "#bbf7d0"
                      : "#fed7aa"
                  }`,
                  padding: "24px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
                }}
              >
                {/* Error Box */}
                {scanError && (
                  <div style={{ textAlign: "center", padding: "20px" }}>
                    <div
                      style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "50%",
                        background: "#fee2e2",
                        color: "#dc2626",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "28px",
                        margin: "0 auto 14px auto",
                      }}
                    >
                      <FaTimesCircle />
                    </div>
                    <h3 style={{ margin: "0 0 6px 0", color: "#991b1b", fontSize: "18px" }}>
                      Verification Failed
                    </h3>
                    <p style={{ margin: "0 0 16px 0", color: "#475569", fontSize: "13.5px" }}>
                      {scanError}
                    </p>
                    <button
                      type="button"
                      onClick={handleScanNext}
                      style={{
                        padding: "8px 18px",
                        borderRadius: "8px",
                        background: "#0f172a",
                        color: "#ffffff",
                        border: "none",
                        fontWeight: 600,
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      Scan Next Candidate
                    </button>
                  </div>
                )}

                {/* Candidate Verified Details Card */}
                {candidateData && (
                  <div>
                    {/* Status Badge */}
                    <div
                      style={{
                        padding: "14px 18px",
                        borderRadius: "12px",
                        marginBottom: "20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "10px",
                        background:
                          candidateData.status === "VERIFIED_AUTHENTIC"
                            ? "#ecfdf5"
                            : candidateData.attendance?.is_condoned
                            ? "#f5f3ff"
                            : "#fef2f2",
                        border: `1.5px solid ${
                          candidateData.status === "VERIFIED_AUTHENTIC"
                            ? "#86efac"
                            : candidateData.attendance?.is_condoned
                            ? "#c4b5fd"
                            : "#fca5a5"
                        }`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div
                          style={{
                            fontSize: "24px",
                            color:
                              candidateData.status === "VERIFIED_AUTHENTIC"
                                ? "#16a34a"
                                : candidateData.attendance?.is_condoned
                                ? "#7c3aed"
                                : "#dc2626",
                          }}
                        >
                          {candidateData.status === "VERIFIED_AUTHENTIC" ? (
                            <FaCheckCircle />
                          ) : candidateData.attendance?.is_condoned ? (
                            <FaShieldAlt />
                          ) : (
                            <FaExclamationTriangle />
                          )}
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: "15px",
                              fontWeight: 800,
                              color:
                                candidateData.status === "VERIFIED_AUTHENTIC"
                                  ? "#166534"
                                  : candidateData.attendance?.is_condoned
                                  ? "#5b21b6"
                                  : "#991b1b",
                            }}
                          >
                            {candidateData.attendance?.is_condoned
                              ? "SPECIAL CONDONATION GRANTED • ADMIT CANDIDATE"
                              : candidateData.status === "VERIFIED_AUTHENTIC"
                              ? "AUTHENTIC & VERIFIED • ADMIT TO EXAM HALL"
                              : "DETAINED • DO NOT ADMIT (ATTENDANCE SHORTAGE)"}
                          </div>
                          <div style={{ fontSize: "12px", color: "#475569", marginTop: "2px" }}>
                            Hall Ticket No: <strong>{candidateData.hall_ticket_number}</strong> • Attendance:{" "}
                            <strong>{candidateData.attendance?.percentage}%</strong> (Required: ≥{" "}
                            {candidateData.attendance?.required_percentage}%)
                          </div>
                        </div>
                      </div>

                      {candidateData.is_verified_in_hall ? (
                        <span
                          style={{
                            padding: "4px 12px",
                            borderRadius: "20px",
                            background: "#dcfce7",
                            color: "#166534",
                            fontSize: "12px",
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <FaCheck /> Already Admitted
                        </span>
                      ) : null}
                    </div>

                    {checkInSuccessMsg && (
                      <div
                        style={{
                          background: "#ecfdf5",
                          border: "1px solid #a7f3d0",
                          color: "#065f46",
                          padding: "10px 16px",
                          borderRadius: "8px",
                          fontSize: "13px",
                          fontWeight: 700,
                          marginBottom: "16px",
                        }}
                      >
                        {checkInSuccessMsg}
                      </div>
                    )}

                    {/* Candidate Photo & Identification Grid */}
                    <div
                      style={{
                        display: "flex",
                        gap: "20px",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "14px",
                        padding: "18px",
                        marginBottom: "20px",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      {/* Candidate Photograph Frame */}
                      <div
                        style={{
                          width: "110px",
                          height: "135px",
                          borderRadius: "6px",
                          border: "3px solid #1e3a8a",
                          overflow: "hidden",
                          background: "#ffffff",
                          boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {candidateData.student?.profile_pic ? (
                          <img
                            src={candidateData.student.profile_pic}
                            alt={candidateData.student?.name}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <div style={{ textAlign: "center", color: "#94a3b8" }}>
                            <FaUserGraduate style={{ fontSize: "36px" }} />
                            <div style={{ fontSize: "9px", fontWeight: 700, marginTop: "4px" }}>No Photo</div>
                          </div>
                        )}
                      </div>

                      {/* Student Identification Meta */}
                      <div style={{ flex: 1, minWidth: "220px" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                          Candidate Credentials
                        </div>
                        <h3 style={{ margin: "2px 0 4px 0", color: "#0f172a", fontSize: "19px", fontWeight: 800 }}>
                          {candidateData.student?.name}
                        </h3>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "13px" }}>
                          <div>
                            <span style={{ color: "#64748b", fontSize: "11px" }}>University Roll No:</span>
                            <div style={{ fontWeight: 700, color: "#2563eb", fontSize: "14px" }}>
                              {candidateData.student?.roll_no}
                            </div>
                          </div>

                          <div>
                            <span style={{ color: "#64748b", fontSize: "11px" }}>Branch &amp; Specialization:</span>
                            <div style={{ fontWeight: 600, color: "#334155" }}>
                              {candidateData.student?.branch}
                            </div>
                          </div>

                          <div>
                            <span style={{ color: "#64748b", fontSize: "11px" }}>Semester &amp; Section:</span>
                            <div style={{ fontWeight: 600, color: "#334155" }}>
                              Sem {candidateData.student?.semester} (Sec {candidateData.student?.section || "A"})
                            </div>
                          </div>

                          <div>
                            <span style={{ color: "#64748b", fontSize: "11px" }}>Exam Session:</span>
                            <div style={{ fontWeight: 600, color: "#334155" }}>
                              {candidateData.exam?.name}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Scheduled Papers */}
                    {candidateData.timetable && candidateData.timetable.length > 0 && (
                      <div style={{ marginBottom: "20px" }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#1e3a8a", marginBottom: "8px", textTransform: "uppercase" }}>
                          Scheduled Examination Papers ({candidateData.timetable.length}):
                        </div>
                        <div style={{ display: "grid", gap: "6px" }}>
                          {candidateData.timetable.map((paper, idx) => (
                            <div
                              key={idx}
                              style={{
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                padding: "8px 12px",
                                borderRadius: "8px",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontSize: "12.5px",
                              }}
                            >
                              <div>
                                <strong style={{ color: "#0f172a" }}>{paper.subject_code}</strong>: {paper.subject_name}
                              </div>
                              <div style={{ color: "#64748b", fontSize: "11.5px" }}>
                                📅 {paper.exam_date} • 🏛️ {paper.hall_number}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Invigilator Action Buttons */}
                    <div style={{ display: "flex", gap: "12px", marginTop: "10px", flexWrap: "wrap" }}>
                      {!candidateData.is_verified_in_hall && (candidateData.attendance?.is_eligible || candidateData.attendance?.is_condoned) ? (
                        <button
                          type="button"
                          onClick={handleCheckInCandidate}
                          disabled={checkingIn}
                          style={{
                            padding: "10px 24px",
                            borderRadius: "10px",
                            border: "none",
                            background: "#16a34a",
                            color: "#ffffff",
                            fontSize: "14px",
                            fontWeight: 700,
                            cursor: checkingIn ? "wait" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            boxShadow: "0 4px 12px rgba(22, 163, 74, 0.25)",
                          }}
                        >
                          <FaCheck /> {checkingIn ? "Admitting..." : "Admit Candidate & Mark Entry"}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={handleScanNext}
                        style={{
                          padding: "10px 20px",
                          borderRadius: "10px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff",
                          color: "#0f172a",
                          fontSize: "14px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Scan Next Candidate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ADMITTED CANDIDATES ROSTER */}
        {activeTab === "admitted" && (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              border: "1px solid #e2e8f0",
              padding: "24px",
              boxShadow: "0 4px 15px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div>
                <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: "18px", fontWeight: 700 }}>
                  Exam Hall Admitted Candidates
                </h3>
                <span style={{ fontSize: "13px", color: "#64748b" }}>
                  Official audit roster of candidates scanned and verified at examination hall entrance.
                </span>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  type="text"
                  placeholder="Search name, roll no, ticket..."
                  value={searchAdmitted}
                  onChange={(e) => setSearchAdmitted(e.target.value)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    outline: "none",
                    width: "240px",
                  }}
                />
              </div>
            </div>

            {loadingAdmitted ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                Loading admitted candidates...
              </div>
            ) : filteredAdmitted.length === 0 ? (
              <div style={{ textAlign: "center", padding: "50px", color: "#64748b" }}>
                <FaUserGraduate style={{ fontSize: "36px", marginBottom: "10px", color: "#94a3b8" }} />
                <div style={{ fontWeight: 600, fontSize: "15px" }}>No candidates scanned yet</div>
                <p style={{ margin: "4px 0 0 0", fontSize: "13px" }}>
                  Switch to the Live Camera Scanner tab to scan hall tickets at the exam door.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                      <th style={{ padding: "10px 12px", width: "50px" }}>Photo</th>
                      <th style={{ padding: "10px 12px" }}>Candidate Name</th>
                      <th style={{ padding: "10px 12px" }}>University Roll No</th>
                      <th style={{ padding: "10px 12px" }}>Branch &amp; Sem</th>
                      <th style={{ padding: "10px 12px" }}>Hall Ticket No</th>
                      <th style={{ padding: "10px 12px" }}>Admitted At</th>
                      <th style={{ padding: "10px 12px" }}>Verified By</th>
                      <th style={{ padding: "10px 12px" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdmitted.map((item) => (
                      <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <div
                            style={{
                              width: "36px",
                              height: "44px",
                              borderRadius: "4px",
                              overflow: "hidden",
                              background: "#e2e8f0",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {item.profile_pic ? (
                              <img
                                src={item.profile_pic}
                                alt={item.student_name}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : (
                              <FaUserGraduate color="#94a3b8" />
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 700, color: "#0f172a" }}>
                          {item.student_name}
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "#2563eb" }}>
                          {item.roll_no}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#475569" }}>
                          {item.branch} (Sem {item.semester})
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "#334155" }}>
                          {item.hall_ticket_number}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#64748b" }}>
                          {item.verified_in_hall_at
                            ? new Date(item.verified_in_hall_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#475569" }}>
                          {item.verified_by_name}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "12px",
                              fontSize: "11px",
                              fontWeight: 700,
                              background: item.is_condoned ? "#f3e8ff" : "#dcfce7",
                              color: item.is_condoned ? "#7e22ce" : "#15803d",
                            }}
                          >
                            {item.is_condoned ? "Condoned & Admitted" : "Admitted"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamHallScanner;
