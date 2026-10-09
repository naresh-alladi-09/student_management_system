import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  verifySessionToken,
  markQrAttendance,
  detectFaceInImage,
} from "../services/studentservice";
import {
  FaQrcode,
  FaCheckCircle,
  FaExclamationTriangle,
  FaClock,
  FaUserGraduate,
  FaArrowRight,
  FaLock,
  FaCamera,
  FaSync,
  FaMapMarkerAlt,
  FaShieldAlt,
  FaUserCheck,
  FaRedo,
  FaTimes,
  FaCrosshairs,
  FaCheck,
} from "react-icons/fa";

// Helper for client-side haversine distance calculation in meters
const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

const MarkAttendancePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, login } = useAuth();

  const tokenParam = searchParams.get("token") || "";
  const [token, setToken] = useState(tokenParam);

  // Session metadata from backend
  const [sessionInfo, setSessionInfo] = useState(null);
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [timeRemaining, setTimeRemaining] = useState(null);

  // Geolocation states
  const [userCoords, setUserCoords] = useState(null);
  const [geoStatus, setGeoStatus] = useState("detecting"); // 'detecting' | 'available' | 'denied' | 'error'
  const [geoErrorMsg, setGeoErrorMsg] = useState("");
  const [calculatedDistance, setCalculatedDistance] = useState(null);

  // Camera & Face Biometrics states
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [faceCheckFeedback, setFaceCheckFeedback] = useState(null);

  // Check-in submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultStatus, setResultStatus] = useState("idle"); // 'idle' | 'success' | 'already' | 'error'
  const [resultData, setResultData] = useState(null);

  // Fallback Login states if student not logged in
  const [loginUsername, setLoginUsername] = useState("STU001");
  const [loginPassword, setLoginPassword] = useState("Student@123");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // 1. Fetch Session Info when token or user changes
  const fetchSessionData = async (targetToken) => {
    const clean = (targetToken || token).trim();
    if (!clean) return;

    setIsVerifyingToken(true);
    setTokenError("");

    try {
      const res = await verifySessionToken(clean);
      setSessionInfo(res.data);
      setTimeRemaining(res.data?.time_remaining || 0);

      // If session has coordinates and user already has coords, calculate distance
      if (
        userCoords &&
        res.data.latitude != null &&
        res.data.longitude != null
      ) {
        const d = calculateDistanceMeters(
          userCoords.latitude,
          userCoords.longitude,
          res.data.latitude,
          res.data.longitude
        );
        setCalculatedDistance(d);
      }
    } catch (err) {
      setSessionInfo(null);
      setTokenError(
        err.response?.data?.detail ||
          "Session QR code has expired or is invalid. Please scan again."
      );
    } finally {
      setIsVerifyingToken(false);
    }
  };

  useEffect(() => {
    if (tokenParam) {
      setToken(tokenParam);
      fetchSessionData(tokenParam);
    }
  }, [tokenParam, user]);

  // Countdown timer for session expiration
  useEffect(() => {
    if (timeRemaining == null || timeRemaining <= 0) return;
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeRemaining]);

  // 2. Request Geolocation Coordinates
  const acquireGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("error");
      setGeoErrorMsg("Geolocation is not supported by your browser.");
      return;
    }

    setGeoStatus("detecting");
    setGeoErrorMsg("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setUserCoords(coords);
        setGeoStatus("available");

        if (sessionInfo?.latitude != null && sessionInfo?.longitude != null) {
          const dist = calculateDistanceMeters(
            coords.latitude,
            coords.longitude,
            sessionInfo.latitude,
            sessionInfo.longitude
          );
          setCalculatedDistance(dist);
        }
      },
      (err) => {
        setGeoStatus("denied");
        setGeoErrorMsg(
          "Location permission denied. GPS geocoordinates are required to prevent proxy attendance."
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    acquireGeolocation();
  }, [sessionInfo?.session_id]);

  // Re-calculate distance when userCoords or sessionInfo changes
  useEffect(() => {
    if (
      userCoords &&
      sessionInfo?.latitude != null &&
      sessionInfo?.longitude != null
    ) {
      const dist = calculateDistanceMeters(
        userCoords.latitude,
        userCoords.longitude,
        sessionInfo.latitude,
        sessionInfo.longitude
      );
      setCalculatedDistance(dist);
    }
  }, [userCoords, sessionInfo]);

  // 3. Camera Lifecycle
  const startCamera = async () => {
    setCameraError("");
    setCapturedPhoto(null);
    setFaceCheckFeedback(null);

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      streamRef.current = stream;
      setCameraActive(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch (err) {
      console.warn("Camera init failed:", err);
      setCameraError(
        "Could not access your camera. Please allow camera permissions in your browser."
      );
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    // If student is logged in and session is verified, auto-start camera
    if (user && user.role === "student" && sessionInfo && !capturedPhoto && resultStatus === "idle") {
      startCamera();
    }

    return () => {
      stopCamera();
    };
  }, [user, sessionInfo]);

  // 4. Capture Face Snapshot
  const captureSnapshot = async () => {
    if (!videoRef.current) return;
    setIsCapturing(true);

    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      setCapturedPhoto(dataUrl);
      stopCamera();

      // Quick visual validation of face
      setFaceCheckFeedback({ checking: true, text: "Analyzing face quality..." });
      try {
        const checkRes = await detectFaceInImage(dataUrl);
        if (checkRes.data?.face_detected) {
          setFaceCheckFeedback({
            valid: true,
            text: `Face detected (${Math.round(checkRes.data.confidence * 100)}% clarity). Ready to verify!`,
          });
        } else {
          setFaceCheckFeedback({
            valid: false,
            text: "No clear face detected in the photo. Please ensure good lighting and look directly into camera.",
          });
        }
      } catch {
        setFaceCheckFeedback({ valid: true, text: "Photo captured. Ready for verification." });
      }
    } catch (err) {
      console.error("Capture failed:", err);
    } finally {
      setIsCapturing(false);
    }
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    setFaceCheckFeedback(null);
    startCamera();
  };

  // 5. Final Submit Attendance to Backend
  const handleConfirmAttendance = async () => {
    const cleanToken = token.trim();
    if (!cleanToken) {
      setResultStatus("error");
      setResultData({ detail: "Please provide a valid session QR token." });
      return;
    }

    // Biometric check requirement
    if (sessionInfo?.require_face && !capturedPhoto) {
      alert("Please capture your face photo first for biometric identity verification.");
      return;
    }

    // Geolocation check requirement
    if (sessionInfo?.require_geo && !userCoords) {
      alert(
        "GPS Coordinates are required for classroom geofence verification. Please enable location services."
      );
      acquireGeolocation();
      return;
    }

    setIsSubmitting(true);
    setResultStatus("idle");
    setResultData(null);

    try {
      const payload = {
        qr_token: cleanToken,
        face_image: capturedPhoto || null,
        latitude: userCoords?.latitude ?? null,
        longitude: userCoords?.longitude ?? null,
        device_fingerprint: `${navigator.platform} | ${navigator.userAgent.slice(0, 80)}`,
      };

      const res = await markQrAttendance(payload);
      setResultStatus("success");
      setResultData({
        message: res.data.message || "Attendance recorded successfully!",
        subject: res.data.subject,
        subjectCode: res.data.subject_code,
        faculty: res.data.faculty,
        date: res.data.date,
        markedAt: res.data.marked_at,
        status: res.data.status,
        distanceMeters: res.data.distance_meters,
        faceConfidence: res.data.face_confidence,
        faceMatched: res.data.face_matched,
      });
      stopCamera();
    } catch (err) {
      if (err.response?.status === 409) {
        setResultStatus("already");
        setResultData({
          detail:
            err.response.data?.detail ||
            "You have already checked in for this session.",
          markedAt: err.response.data?.marked_at,
          recordId: err.response.data?.record_id,
        });
      } else {
        setResultStatus("error");
        setResultData({
          detail:
            err.response?.data?.detail ||
            err.response?.data?.error ||
            "Verification failed. The token may be expired or proxy security rejected the scan.",
          errorType: err.response?.data?.error_type || "UNKNOWN",
          distance: err.response?.data?.distance_meters,
          maxRadius: err.response?.data?.max_radius_meters,
          faceConfidence: err.response?.data?.face_confidence,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Student Login Form Handler
  const handleStudentLogin = async (e) => {
    e?.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);
    try {
      await login(loginUsername, loginPassword);
      // Once logged in, refresh session data
      if (token) {
        setTimeout(() => {
          fetchSessionData(token);
        }, 300);
      }
    } catch (err) {
      setLoginError(
        err.response?.data?.detail ||
          "Invalid credentials. Please enter your student username & password."
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const isGeofenceViolated =
    sessionInfo?.require_geo &&
    sessionInfo?.radius_meters != null &&
    calculatedDistance != null &&
    calculatedDistance > sessionInfo.radius_meters;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0b1329 0%, #172554 50%, #0f172a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "#ffffff",
          borderRadius: "24px",
          padding: "36px 28px",
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.5)",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Anti-Proxy Top Security Badge */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            background: "linear-gradient(90deg, #1e3a8a 0%, #2563eb 50%, #3b82f6 100%)",
            color: "#fff",
            padding: "6px 12px",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.5px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            textTransform: "uppercase",
          }}
        >
          <FaShieldAlt /> Anti-Proxy AI Biometrics & Geofence Verification
        </div>

        {/* Brand Icon Header */}
        <div
          style={{
            width: "60px",
            height: "60px",
            background: "#eff6ff",
            color: "#2563eb",
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "26px",
            marginTop: "16px",
            marginBottom: "12px",
            boxShadow: "0 4px 12px rgba(37, 99, 235, 0.15)",
          }}
        >
          <FaUserCheck />
        </div>

        <h2 style={{ margin: "0 0 6px 0", color: "#0f172a", fontSize: "22px", fontWeight: 800 }}>
          Biometric Attendance Check-In
        </h2>
        <p style={{ margin: "0 0 20px 0", color: "#64748b", fontSize: "13px" }}>
          Live Facial Recognition & Anti-Proxy Geolocation
        </p>

        {/* ============================================================== */}
        {/* RESULT: SUCCESS */}
        {/* ============================================================== */}
        {resultStatus === "success" && (
          <div style={{ padding: "10px 0" }}>
            <div
              style={{
                width: "72px",
                height: "72px",
                background: "#ecfdf5",
                color: "#059669",
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "36px",
                marginBottom: "16px",
                border: "3px solid #10b981",
              }}
            >
              <FaCheckCircle />
            </div>

            <h3 style={{ margin: "0 0 6px 0", color: "#065f46", fontSize: "22px", fontWeight: 800 }}>
              Attendance Verified & Marked!
            </h3>
            <p style={{ color: "#047857", fontSize: "14px", margin: "0 0 20px 0" }}>
              Identity validated via AI facial recognition & GPS classroom geofence.
            </p>

            <div
              style={{
                background: "#f8fafc",
                borderRadius: "14px",
                padding: "18px",
                textAlign: "left",
                fontSize: "14px",
                border: "1px solid #e2e8f0",
                marginBottom: "24px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                <span style={{ color: "#64748b" }}>Status:</span>
                <span
                  style={{
                    background: "#dcfce7",
                    color: "#15803d",
                    padding: "3px 10px",
                    borderRadius: "12px",
                    fontWeight: 700,
                    fontSize: "12px",
                  }}
                >
                  ● PRESENT
                </span>
              </div>

              {resultData?.subject && (
                <div style={{ marginBottom: "10px" }}>
                  <span style={{ color: "#64748b", display: "block", fontSize: "12px" }}>Course:</span>
                  <strong style={{ color: "#0f172a" }}>
                    {resultData.subject} {resultData.subjectCode ? `(${resultData.subjectCode})` : ""}
                  </strong>
                </div>
              )}

              {resultData?.faculty && (
                <div style={{ marginBottom: "10px" }}>
                  <span style={{ color: "#64748b", display: "block", fontSize: "12px" }}>Instructor:</span>
                  <span style={{ color: "#334155", fontWeight: 600 }}>{resultData.faculty}</span>
                </div>
              )}

              <div style={{ borderTop: "1px dashed #cbd5e1", margin: "12px 0" }} />

              {/* Biometrics badge */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{ color: "#4f46e5", fontSize: "16px" }}>👤</span>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e1b4b" }}>
                    Biometric Face Match
                  </div>
                  <div style={{ fontSize: "12px", color: "#4338ca" }}>
                    {resultData?.faceConfidence
                      ? `Confidence: ${Math.round(resultData.faceConfidence)}% (YuNet + SFace verified)`
                      : "Identity matched with student record"}
                  </div>
                </div>
              </div>

              {/* Geolocation badge */}
              {resultData?.distanceMeters != null && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: "#059669", fontSize: "16px" }}>📍</span>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#064e3b" }}>
                      Classroom Geofence
                    </div>
                    <div style={{ fontSize: "12px", color: "#047857" }}>
                      Verified distance: ~{Math.round(resultData.distanceMeters)}m from instructor
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigate("/student/dashboard")}
              style={{
                width: "100%",
                padding: "14px",
                background: "#10b981",
                color: "#fff",
                border: "none",
                borderRadius: "12px",
                fontWeight: 700,
                fontSize: "15px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: "0 4px 14px rgba(16, 185, 129, 0.3)",
              }}
            >
              Return to Student Dashboard <FaArrowRight />
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* RESULT: ALREADY CHECKED IN (409) */}
        {/* ============================================================== */}
        {resultStatus === "already" && (
          <div style={{ padding: "10px 0" }}>
            <div
              style={{
                width: "68px",
                height: "68px",
                background: "#fef3c7",
                color: "#d97706",
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "32px",
                marginBottom: "16px",
              }}
            >
              <FaClock />
            </div>

            <h3 style={{ margin: "0 0 8px 0", color: "#92400e", fontSize: "20px", fontWeight: 700 }}>
              Already Checked In
            </h3>
            <p style={{ color: "#b45309", fontSize: "14px", margin: "0 0 20px 0" }}>
              {resultData?.detail || "You have already marked attendance for this session."}
            </p>

            <button
              type="button"
              onClick={() => navigate("/student/dashboard")}
              style={{
                width: "100%",
                padding: "12px",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                fontWeight: 700,
                fontSize: "15px",
                cursor: "pointer",
              }}
            >
              View My Attendance Dashboard
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* RESULT: PROXY / MISMATCH / ERROR */}
        {/* ============================================================== */}
        {resultStatus === "error" && (
          <div style={{ padding: "10px 0" }}>
            <div
              style={{
                width: "68px",
                height: "68px",
                background: "#fee2e2",
                color: "#ef4444",
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "32px",
                marginBottom: "16px",
              }}
            >
              <FaExclamationTriangle />
            </div>

            <h3 style={{ margin: "0 0 8px 0", color: "#991b1b", fontSize: "20px", fontWeight: 700 }}>
              Check-In Rejected (Anti-Proxy Alert)
            </h3>
            <p style={{ color: "#b91c1c", fontSize: "14px", margin: "0 0 16px 0", lineHeight: 1.5 }}>
              {resultData?.detail || "Attendance could not be verified."}
            </p>

            {resultData?.errorType === "FACE_MISMATCH" && (
              <div
                style={{
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                  borderRadius: "10px",
                  padding: "12px",
                  fontSize: "13px",
                  color: "#9f1239",
                  marginBottom: "18px",
                  textAlign: "left",
                }}
              >
                <strong>Face Biometrics Mismatch:</strong> The scanned facial signature does not match your enrolled profile picture in the database.
              </div>
            )}

            {resultData?.errorType === "GEOFENCE_VIOLATION" && (
              <div
                style={{
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                  borderRadius: "10px",
                  padding: "12px",
                  fontSize: "13px",
                  color: "#9f1239",
                  marginBottom: "18px",
                  textAlign: "left",
                }}
              >
                <strong>Outside Classroom Range:</strong> You are {resultData.distance}m away (maximum allowed radius is {resultData.maxRadius}m). Physical presence is mandatory.
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  setResultStatus("idle");
                  retakePhoto();
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "#f1f5f9",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <FaRedo /> Retry Verification
              </button>
              <button
                type="button"
                onClick={() => navigate("/student/dashboard")}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Dashboard
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* ACTIVE FLOW: IDLE & STUDENT LOGGED IN */}
        {/* ============================================================== */}
        {resultStatus === "idle" && user && user.role === "student" && (
          <div>
            {/* Session Card Info */}
            {sessionInfo ? (
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "14px",
                  padding: "14px 16px",
                  border: "1px solid #e2e8f0",
                  marginBottom: "18px",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                      Class Session
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                      {sessionInfo.subject_name}
                    </div>
                    <div style={{ fontSize: "12px", color: "#475569" }}>
                      Instructor: {sessionInfo.faculty_name}
                    </div>
                  </div>
                  {timeRemaining != null && (
                    <div
                      style={{
                        background: timeRemaining > 15 ? "#eff6ff" : "#fef2f2",
                        color: timeRemaining > 15 ? "#1d4ed8" : "#b91c1c",
                        padding: "4px 10px",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <FaClock /> {timeRemaining}s
                    </div>
                  )}
                </div>

                {/* Face Registration Warning if not enrolled */}
                {sessionInfo.require_face && sessionInfo.student_face_registered === false && (
                  <div
                    style={{
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                      color: "#b45309",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      marginTop: "10px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <FaExclamationTriangle style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Face Biometrics Not Enrolled:</strong> Your faculty must register your face photo in the student directory before taking attendance.
                    </div>
                  </div>
                )}
              </div>
            ) : isVerifyingToken ? (
              <div style={{ padding: "16px", color: "#64748b", fontSize: "13px" }}>
                <FaSync className="fa-spin" style={{ marginRight: "6px" }} /> Verifying session QR token...
              </div>
            ) : tokenError ? (
              <div
                style={{
                  background: "#fee2e2",
                  color: "#991b1b",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  marginBottom: "16px",
                  textAlign: "left",
                }}
              >
                {tokenError}
              </div>
            ) : (
              <div style={{ marginBottom: "16px", textAlign: "left" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Session QR Token:
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Scan or paste QR token..."
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fetchSessionData(token)}
                    style={{
                      padding: "10px 14px",
                      background: "#2563eb",
                      color: "#fff",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    Load
                  </button>
                </div>
              </div>
            )}

            {/* Anti-Proxy Geolocation Status Banner */}
            <div
              style={{
                borderRadius: "12px",
                padding: "12px 14px",
                marginBottom: "18px",
                fontSize: "12px",
                textAlign: "left",
                border: "1px solid",
                background:
                  geoStatus === "available" && !isGeofenceViolated
                    ? "#f0fdf4"
                    : isGeofenceViolated
                    ? "#fff1f2"
                    : geoStatus === "denied"
                    ? "#fef2f2"
                    : "#f8fafc",
                borderColor:
                  geoStatus === "available" && !isGeofenceViolated
                    ? "#bbf7d0"
                    : isGeofenceViolated
                    ? "#fecdd3"
                    : geoStatus === "denied"
                    ? "#fecaca"
                    : "#e2e8f0",
                color:
                  geoStatus === "available" && !isGeofenceViolated
                    ? "#15803d"
                    : isGeofenceViolated
                    ? "#be123c"
                    : geoStatus === "denied"
                    ? "#991b1b"
                    : "#475569",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                  <FaMapMarkerAlt /> Anti-Proxy Geofence:
                </span>
                <button
                  type="button"
                  onClick={acquireGeolocation}
                  style={{
                    background: "none",
                    border: "none",
                    color: "inherit",
                    cursor: "pointer",
                    fontSize: "11px",
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  Refresh GPS
                </button>
              </div>

              <div style={{ marginTop: "4px" }}>
                {geoStatus === "detecting" && "Acquiring high-accuracy GPS coordinates..."}
                {geoStatus === "available" && (
                  <>
                    <span>GPS Coordinates: {userCoords.latitude.toFixed(4)}, {userCoords.longitude.toFixed(4)}</span>
                    {calculatedDistance != null && (
                      <div style={{ marginTop: "2px", fontWeight: 600 }}>
                        {isGeofenceViolated ? (
                          <span style={{ color: "#e11d48" }}>
                            ⚠️ {calculatedDistance}m from instructor (Exceeds {sessionInfo?.radius_meters || 50}m radius)
                          </span>
                        ) : (
                          <span style={{ color: "#059669" }}>
                            ✓ Inside classroom boundary (~{calculatedDistance}m from instructor)
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
                {geoStatus === "denied" && (
                  <span>⚠️ Location denied. Browser location access is required to take attendance.</span>
                )}
              </div>
            </div>

            {/* BIOMETRIC CAMERA SECTION */}
            <div style={{ marginBottom: "20px" }}>
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "260px",
                  background: "#0f172a",
                  borderRadius: "16px",
                  overflow: "hidden",
                  boxShadow: "inset 0 0 20px rgba(0,0,0,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* Live Video Feed */}
                {!capturedPhoto ? (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transform: "scaleX(-1)", // Mirror selfie
                      }}
                    />

                    {/* Biometric Oval Reticle & Scanner Line */}
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: "160px",
                        height: "210px",
                        border: "2px dashed #38bdf8",
                        borderRadius: "50%",
                        boxShadow: "0 0 25px rgba(56, 189, 248, 0.4)",
                        pointerEvents: "none",
                      }}
                    />

                    {/* Animated Scanning Beam Line */}
                    <div className="face-scan-beam" />
                    <style>{`
                      @keyframes scanBeam {
                        0% { top: 20px; opacity: 0.8; }
                        50% { top: 230px; opacity: 1; }
                        100% { top: 20px; opacity: 0.8; }
                      }
                      .face-scan-beam {
                        position: absolute;
                        left: 15%;
                        width: 70%;
                        height: 2px;
                        background: linear-gradient(90deg, transparent, #38bdf8, #60a5fa, transparent);
                        box-shadow: 0 0 10px #38bdf8;
                        animation: scanBeam 2.5s ease-in-out infinite;
                        pointer-events: none;
                      }
                    `}</style>

                    <div
                      style={{
                        position: "absolute",
                        bottom: "10px",
                        left: 0,
                        right: 0,
                        textAlign: "center",
                        color: "#f8fafc",
                        fontSize: "11px",
                        textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                        fontWeight: 600,
                        pointerEvents: "none",
                      }}
                    >
                      Align face within oval frame
                    </div>
                  </>
                ) : (
                  /* Captured Snapshot Preview */
                  <div style={{ position: "relative", width: "100%", height: "100%" }}>
                    <img
                      src={capturedPhoto}
                      alt="Captured Face"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "10px",
                        right: "10px",
                        background: "rgba(15, 23, 42, 0.75)",
                        color: "#38bdf8",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <FaCheck /> Frame Captured
                    </div>
                  </div>
                )}
              </div>

              {/* Camera Error Message */}
              {cameraError && (
                <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "8px" }}>
                  {cameraError}
                </div>
              )}

              {/* Face Quality Feedback */}
              {faceCheckFeedback && (
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: faceCheckFeedback.valid ? "#059669" : "#e11d48",
                    marginTop: "6px",
                  }}
                >
                  {faceCheckFeedback.text}
                </div>
              )}

              {/* Camera Action Buttons */}
              <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                {!capturedPhoto ? (
                  <button
                    type="button"
                    onClick={captureSnapshot}
                    disabled={isCapturing}
                    style={{
                      flex: 1,
                      padding: "12px",
                      background: "#2563eb",
                      color: "#fff",
                      border: "none",
                      borderRadius: "10px",
                      fontWeight: 700,
                      fontSize: "14px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)",
                    }}
                  >
                    <FaCamera /> {isCapturing ? "Capturing..." : "Capture Face"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={retakePhoto}
                    style={{
                      flex: 1,
                      padding: "10px",
                      background: "#f1f5f9",
                      color: "#334155",
                      border: "1px solid #cbd5e1",
                      borderRadius: "10px",
                      fontWeight: 600,
                      fontSize: "13px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    <FaRedo /> Retake Photo
                  </button>
                )}
              </div>
            </div>

            {/* Final Check-In Submission Button */}
            <button
              type="button"
              disabled={
                isSubmitting ||
                !token ||
                (sessionInfo?.require_face && !capturedPhoto) ||
                (sessionInfo?.require_geo && !userCoords)
              }
              onClick={handleConfirmAttendance}
              style={{
                width: "100%",
                padding: "15px",
                background:
                  isSubmitting || !token || (sessionInfo?.require_face && !capturedPhoto)
                    ? "#94a3b8"
                    : "#10b981",
                color: "#fff",
                border: "none",
                borderRadius: "12px",
                fontWeight: 700,
                fontSize: "15px",
                cursor:
                  isSubmitting || !token || (sessionInfo?.require_face && !capturedPhoto)
                    ? "not-allowed"
                    : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: "0 4px 14px rgba(16, 185, 129, 0.25)",
              }}
            >
              {isSubmitting ? (
                <>
                  <FaSync className="fa-spin" /> Verifying Face & Coordinates...
                </>
              ) : (
                <>
                  <FaCheckCircle /> Verify Face & Mark Attendance
                </>
              )}
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* LOGIN FORM IF STUDENT IS NOT AUTHENTICATED */}
        {/* ============================================================== */}
        {(!user || user.role !== "student") && resultStatus === "idle" && (
          <div>
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "12px",
                padding: "14px",
                marginBottom: "20px",
                fontSize: "13px",
                color: "#166534",
                textAlign: "left",
              }}
            >
              <strong>Session Scanned Successfully!</strong>
              <div style={{ marginTop: "4px" }}>
                Please sign in to verify your identity and activate your camera for attendance check-in.
              </div>
            </div>

            {loginError && (
              <div
                style={{
                  background: "#fef2f2",
                  color: "#991b1b",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  padding: "10px",
                  fontSize: "13px",
                  marginBottom: "14px",
                }}
              >
                {loginError}
              </div>
            )}

            <form onSubmit={handleStudentLogin} style={{ textAlign: "left" }}>
              <div style={{ marginBottom: "14px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#475569",
                    marginBottom: "4px",
                  }}
                >
                  Student Username / ID:
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "11px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#475569",
                    marginBottom: "4px",
                  }}
                >
                  Password:
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "11px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                style={{
                  width: "100%",
                  padding: "13px",
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: isLoggingIn ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <FaLock /> {isLoggingIn ? "Authenticating..." : "Sign In & Launch Biometric Check-In"}
              </button>
            </form>

            <div style={{ marginTop: "16px", fontSize: "12px", color: "#64748b" }}>
              Default Student Demo: <code>STU001</code> / <code>Student@123</code>
            </div>
          </div>
        )}

        <div style={{ marginTop: "24px", borderTop: "1px solid #f1f5f9", paddingTop: "14px" }}>
          <Link
            to="/login"
            style={{ color: "#64748b", fontSize: "13px", textDecoration: "none" }}
          >
            ← Back to Portal Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default MarkAttendancePage;
