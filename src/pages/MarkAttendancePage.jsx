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
  FaSmile,
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

// Web Audio synthesizer for futuristic hands-free biometric feedback chimes
const playBiometricChime = (type = "detected") => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (type === "detected") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === "locked") {
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        const startTime = ctx.currentTime + idx * 0.06;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.07, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.22);
      });
    } else if (type === "success") {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        const startTime = ctx.currentTime + idx * 0.08;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.09, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.3);
      });
    }
  } catch {
    // Audio context may be restricted by autoplay policy; fail gracefully
  }
};

const MarkAttendancePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser, user, loginUser, logout } = useAuth();
  const studentUser = (currentUser?.role === "student" ? currentUser : null) || (user?.role === "student" ? user : null);

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

  // Autonomous Face & Iris Auto-Detection states & refs
  const [autoDetectState, setAutoDetectState] = useState("scanning"); // 'scanning' | 'detected' | 'locked' | 'verifying'
  const [detectConfidence, setDetectConfidence] = useState(0);
  const [lockProgress, setLockProgress] = useState(0);
  const [detectedLandmarks, setDetectedLandmarks] = useState(null);

  // Check-in submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultStatus, setResultStatus] = useState("idle"); // 'idle' | 'success' | 'already' | 'error'
  const [resultData, setResultData] = useState(null);

  // Fallback Login states if student not logged in
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const consecutiveHitsRef = useRef(0);
  const isDetectingRef = useRef(false);
  const isVerifyingRef = useRef(false);
  const autoDetectTimerRef = useRef(null);
  const detectorRef = useRef(null);

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

      // If student has already checked in for this period, immediately show status
      if (res.data?.is_already_marked) {
        setResultStatus("already");
        setResultData({
          detail:
            res.data?.already_marked_message ||
            `You have already checked in for this lecture period (${res.data?.timetable_period || res.data?.subject_name}). Attendance can only be marked once per period.`,
          markedAt: res.data?.already_marked_at,
          timetablePeriod: res.data?.timetable_period,
          subject: res.data?.subject_name || res.data?.subject,
          subjectCode: res.data?.subject_code,
        });
        stopCamera();
      }

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

  // 2. Request Geolocation Coordinates with 2-tier fallback
  const acquireGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("error");
      setGeoErrorMsg("Geolocation is not supported by your browser.");
      return;
    }

    setGeoStatus("detecting");
    setGeoErrorMsg("");

    const handleSuccess = (pos) => {
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
    };

    // Tier 1: Try GPS high accuracy with 7s timeout
    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      (err) => {
        // If permission explicitly denied by user (code 1), don't retry
        if (err.code === 1) {
          setGeoStatus("denied");
          setGeoErrorMsg(
            "Location permission denied. GPS geocoordinates are required to prevent proxy attendance."
          );
          return;
        }

        // Tier 2: Fallback to network/cell positioning with lower accuracy and longer timeout
        console.warn("High-accuracy GPS timed out or unavailable, trying network positioning...", err.message);
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          (fallbackErr) => {
            setGeoStatus(fallbackErr.code === 1 ? "denied" : "error");
            setGeoErrorMsg(
              fallbackErr.code === 1
                ? "Location permission denied. GPS geocoordinates are required to prevent proxy attendance."
                : "Unable to retrieve GPS coordinates. Please ensure location services are enabled."
            );
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
        );
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 }
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
    setAutoDetectState("scanning");
    setLockProgress(0);
    consecutiveHitsRef.current = 0;
    isDetectingRef.current = false;
    isVerifyingRef.current = false;

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
    if (autoDetectTimerRef.current) {
      clearInterval(autoDetectTimerRef.current);
      autoDetectTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    // If student is logged in and session is verified, auto-start camera
    if (studentUser && sessionInfo && !capturedPhoto && resultStatus === "idle") {
      startCamera();
    }

    return () => {
      stopCamera();
    };
  }, [studentUser, sessionInfo, capturedPhoto, resultStatus]);

  // 5. Final Submit Attendance to Backend
  const handleConfirmAttendance = async (photoOverride = null) => {
    const cleanToken = token.trim();
    if (!cleanToken) {
      setResultStatus("error");
      setResultData({ detail: "Please provide a valid session QR token." });
      return;
    }

    const facePhotoToUse = photoOverride || capturedPhoto;

    // Biometric check requirement
    if (sessionInfo?.require_face && !facePhotoToUse) {
      alert("Face photo is required for biometric identity verification.");
      return;
    }

    // Geolocation check requirement
    if (sessionInfo?.require_geo && !userCoords) {
      acquireGeolocation();
    }

    setIsSubmitting(true);
    setResultStatus("idle");
    setResultData(null);

    try {
      const payload = {
        qr_token: cleanToken,
        face_image: facePhotoToUse || null,
        latitude: userCoords?.latitude ?? null,
        longitude: userCoords?.longitude ?? null,
        accuracy: userCoords?.accuracy ?? null,
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
        effectiveDistance: res.data.effective_distance,
        accuracy: res.data.accuracy,
        faceConfidence: res.data.face_confidence,
        faceMatched: res.data.face_matched,
      });
      playBiometricChime("success");
      stopCamera();
    } catch (err) {
      stopCamera();
      if (err.response?.status === 409) {
        setResultStatus("already");
        setResultData({
          detail:
            err.response.data?.detail ||
            "You have already checked in for this lecture period. Attendance can only be marked once per period.",
          markedAt: err.response.data?.marked_at,
          recordId: err.response.data?.record_id,
          periodConflict: err.response.data?.period_conflict,
          timetablePeriod: err.response.data?.period_label || sessionInfo?.timetable_period,
          subject: sessionInfo?.subject_name,
          subjectCode: sessionInfo?.subject_code,
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
          effectiveDistance: err.response?.data?.effective_distance,
          accuracy: err.response?.data?.accuracy,
          maxRadius: err.response?.data?.max_radius_meters,
          faceConfidence: err.response?.data?.face_confidence,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Autonomous Face Detection & Instant Verification Loop
  useEffect(() => {
    // Run detection loop only when:
    // 1. Camera is actively streaming
    // 2. Student is authenticated
    // 3. QR session info is active & requires face
    // 4. Photo has not yet been locked
    // 5. Verification is idle
    if (
      !cameraActive ||
      !studentUser ||
      !sessionInfo ||
      !sessionInfo.require_face ||
      capturedPhoto ||
      resultStatus !== "idle" ||
      isSubmitting
    ) {
      if (autoDetectTimerRef.current) {
        clearInterval(autoDetectTimerRef.current);
        autoDetectTimerRef.current = null;
      }
      return;
    }

    consecutiveHitsRef.current = 0;
    isDetectingRef.current = false;
    isVerifyingRef.current = false;
    setAutoDetectState("scanning");
    setLockProgress(0);

    const runDetectionStep = async () => {
      const video = videoRef.current;
      if (
        !video ||
        video.readyState < 2 ||
        isDetectingRef.current ||
        isVerifyingRef.current ||
        isSubmitting
      ) {
        return;
      }

      isDetectingRef.current = true;

      try {
        let hasFace = false;
        let confidenceScore = 0.9;

        // 1. Try native browser FaceDetector API if available (Chrome, Edge, Chromium)
        if (typeof window !== "undefined" && "FaceDetector" in window) {
          try {
            if (!detectorRef.current) {
              detectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
            }
            const detectedFaces = await detectorRef.current.detect(video);
            if (detectedFaces && detectedFaces.length > 0) {
              hasFace = true;
              confidenceScore = 0.95;
            }
          } catch (e) {
            detectorRef.current = null;
          }
        }

        // 2. Query server detector for deep facial and iris/ocular landmarks
        if (video.videoWidth > 0) {
          const vw = video.videoWidth || 640;
          const vh = video.videoHeight || 480;
          const sampleCanvas = document.createElement("canvas");
          sampleCanvas.width = 240;
          sampleCanvas.height = Math.round((240 * vh) / vw) || 180;
          const sCtx = sampleCanvas.getContext("2d");
          sCtx.drawImage(video, 0, 0, sampleCanvas.width, sampleCanvas.height);
          const sampleData = sampleCanvas.toDataURL("image/jpeg", 0.65);

          const res = await detectFaceInImage(sampleData);
          if (res.data?.face_detected) {
            hasFace = true;
            confidenceScore = res.data.confidence || 0.85;
            setDetectedLandmarks(res.data?.landmarks || null);
          } else {
            setDetectedLandmarks(null);
          }
        }

        if (hasFace) {
          consecutiveHitsRef.current += 1;
          const hits = consecutiveHitsRef.current;
          setDetectConfidence(Math.round(confidenceScore * 100));

          if (hits === 1) {
            setAutoDetectState("detected");
            setLockProgress(50);
            playBiometricChime("detected");
          } else if (hits >= 2) {
            // Biometric face & iris locked! Auto-capture and auto-verify immediately!
            setAutoDetectState("locked");
            setLockProgress(100);
            isVerifyingRef.current = true;
            playBiometricChime("locked");

            if (autoDetectTimerRef.current) {
              clearInterval(autoDetectTimerRef.current);
              autoDetectTimerRef.current = null;
            }

            // Capture high resolution photo with mirror orientation matching preview
            const fullCanvas = document.createElement("canvas");
            fullCanvas.width = video.videoWidth || 640;
            fullCanvas.height = video.videoHeight || 480;
            const fCtx = fullCanvas.getContext("2d");
            fCtx.translate(fullCanvas.width, 0);
            fCtx.scale(-1, 1);
            fCtx.drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height);
            const fullPhoto = fullCanvas.toDataURL("image/jpeg", 0.92);

            setCapturedPhoto(fullPhoto);
            stopCamera();
            setAutoDetectState("verifying");

            // Hands-free instant verification submission!
            await handleConfirmAttendance(fullPhoto);
          }
        } else {
          setDetectedLandmarks(null);
          // If no face in current frame, step down gracefully rather than instant drop
          if (consecutiveHitsRef.current > 0) {
            consecutiveHitsRef.current = Math.max(0, consecutiveHitsRef.current - 1);
            if (consecutiveHitsRef.current === 0) {
              setAutoDetectState("scanning");
              setLockProgress(0);
            }
          }
        }
      } catch (err) {
        console.debug("Auto-detect interval exception:", err);
      } finally {
        isDetectingRef.current = false;
      }
    };

    const initDelay = setTimeout(() => {
      runDetectionStep();
      autoDetectTimerRef.current = setInterval(runDetectionStep, 400);
    }, 350);

    return () => {
      clearTimeout(initDelay);
      if (autoDetectTimerRef.current) {
        clearInterval(autoDetectTimerRef.current);
        autoDetectTimerRef.current = null;
      }
    };
  }, [cameraActive, studentUser, sessionInfo, capturedPhoto, resultStatus, isSubmitting]);

  // 4. Manual Fallback Snapshot (if camera takes too long in poor lighting)
  const captureSnapshot = async () => {
    if (!videoRef.current || isSubmitting) return;
    setIsCapturing(true);

    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      setCapturedPhoto(dataUrl);
      stopCamera();
      setAutoDetectState("verifying");
      isVerifyingRef.current = true;
      playBiometricChime("locked");

      // Instantly trigger attendance verification
      await handleConfirmAttendance(dataUrl);
    } catch (err) {
      console.error("Manual capture failed:", err);
    } finally {
      setIsCapturing(false);
    }
  };

  const retakePhoto = () => {
    isVerifyingRef.current = false;
    isDetectingRef.current = false;
    consecutiveHitsRef.current = 0;
    setCapturedPhoto(null);
    setFaceCheckFeedback(null);
    setAutoDetectState("scanning");
    setLockProgress(0);
    startCamera();
  };

  // Student Login Form Handler
  const handleStudentLogin = async (e) => {
    e?.preventDefault();
    setLoginError("");
    setNeedsPasswordSetup(false);

    const cleanIdent = (loginUsername || "").trim();
    const cleanPw = (loginPassword || "").trim();

    if (!cleanIdent || !cleanPw) {
      setLoginError("Please enter both your Student ID and your password.");
      return;
    }

    setIsLoggingIn(true);
    try {
      const res = await loginUser(cleanIdent, cleanPw, "student");
      if (res.success) {
        setLoginError("");
        setNeedsPasswordSetup(false);
        // Once logged in, refresh session data & activate camera
        if (token) {
          setTimeout(() => {
            fetchSessionData(token);
          }, 300);
        }
      } else {
        if (res.needsPasswordSetup || res.needsActivation) {
          setNeedsPasswordSetup(true);
          setLoginError(
            res.message ||
              "Your student password is not set yet. Please set your password using your Student ID to activate your account."
          );
        } else {
          setLoginError(
            res.message ||
              "Invalid credentials. Please verify your Student ID and password."
          );
        }
      }
    } catch (err) {
      const isActivation = Boolean(
        err.response?.data?.needs_password_setup || err.response?.data?.needs_activation
      );
      setNeedsPasswordSetup(isActivation);
      setLoginError(
        err.response?.data?.detail ||
          err.message ||
          "Invalid credentials. Please verify your Student ID and password."
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Apply jitter buffer (up to 25m) matching backend to prevent indoor GPS false alarms
  const effectiveDistance =
    calculatedDistance != null
      ? Math.max(0, calculatedDistance - Math.min(userCoords?.accuracy || 0, 25))
      : null;

  const isGeofenceViolated =
    sessionInfo?.require_geo &&
    sessionInfo?.radius_meters != null &&
    effectiveDistance != null &&
    effectiveDistance > sessionInfo.radius_meters;

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

              {(resultData?.timetable_period || sessionInfo?.timetable_period) && (
                <div style={{ marginBottom: "10px" }}>
                  <span style={{ color: "#64748b", display: "block", fontSize: "12px" }}>Timetable Lecture Slot:</span>
                  <span style={{ color: "#059669", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <span>🕒</span> {resultData?.timetable_period || sessionInfo?.timetable_period}
                  </span>
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
              Attendance Already Recorded
            </h3>

            <div
              style={{
                display: "inline-block",
                padding: "3px 12px",
                borderRadius: "20px",
                background: "#fef3c7",
                color: "#b45309",
                fontWeight: 700,
                fontSize: "12px",
                border: "1px solid #fde68a",
                marginBottom: "14px",
              }}
            >
              🔒 Policy: Marked Once Per Period
            </div>

            <p style={{ color: "#b45309", fontSize: "14px", margin: "0 auto 16px auto", maxWidth: "420px", lineHeight: "1.5" }}>
              {resultData?.detail || "Attendance for this lecture period has already been marked. Each student can only mark attendance once per period."}
            </p>

            {(resultData?.timetablePeriod || sessionInfo?.timetable_period) && (
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "13px",
                  color: "#92400e",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  maxWidth: "400px",
                  margin: "0 auto 20px auto",
                }}
              >
                <span>🕒 <strong>Lecture Period:</strong></span>
                <span>{resultData?.timetablePeriod || sessionInfo?.timetable_period}</span>
              </div>
            )}

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
        {resultStatus === "idle" && studentUser && (
          <div>
            {/* Authenticated Student Identity Banner */}
            <div
              style={{
                background: "#eff6ff",
                borderRadius: "12px",
                padding: "10px 14px",
                marginBottom: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "13px",
                color: "#1e40af",
                border: "1px solid #bfdbfe",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", textAlign: "left" }}>
                <span style={{ fontSize: "16px" }}>🎓</span>
                <div>
                  <div style={{ fontWeight: 700, color: "#1e3a8a" }}>
                    {studentUser.name}
                  </div>
                  <div style={{ fontSize: "11px", color: "#3b82f6" }}>
                    ID / Roll: {studentUser.rollNo || studentUser.username}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  setCapturedPhoto(null);
                  setFaceCheckFeedback(null);
                }}
                style={{
                  background: "#dbeafe",
                  border: "none",
                  color: "#1d4ed8",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Switch Account
              </button>
            </div>

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
                    {sessionInfo.timetable_period && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#059669",
                          fontWeight: 600,
                          marginTop: "3px",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span>🕒</span> Timetable Period: {sessionInfo.timetable_period}
                      </div>
                    )}
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
                {geoStatus === "detecting" && "Acquiring GPS coordinates (calibrating)..."}
                {geoStatus === "available" && (
                  <>
                    <span>
                      GPS Coordinates: {userCoords.latitude.toFixed(4)}, {userCoords.longitude.toFixed(4)}
                      {userCoords.accuracy != null && (
                        <span style={{ opacity: 0.75, fontSize: "11px", marginLeft: "6px" }}>
                          (±{Math.round(userCoords.accuracy)}m)
                        </span>
                      )}
                    </span>
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

            {/* BIOMETRIC CAMERA & AUTODETECT SECTION */}
            {sessionInfo?.require_face && (
              <div style={{ marginBottom: "20px" }}>
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "270px",
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

                      {/* Top Status Pill */}
                      <div
                        style={{
                          position: "absolute",
                          top: "12px",
                          left: "50%",
                          transform: "translateX(-50%)",
                          background:
                            autoDetectState === "locked" || autoDetectState === "verifying"
                              ? "rgba(6, 78, 59, 0.92)"
                              : autoDetectState === "detected"
                              ? "rgba(120, 53, 15, 0.92)"
                              : "rgba(15, 23, 42, 0.88)",
                          color:
                            autoDetectState === "locked" || autoDetectState === "verifying"
                              ? "#34d399"
                              : autoDetectState === "detected"
                              ? "#fbbf24"
                              : "#38bdf8",
                          border: `1px solid ${
                            autoDetectState === "locked" || autoDetectState === "verifying"
                              ? "#10b981"
                              : autoDetectState === "detected"
                              ? "#f59e0b"
                              : "rgba(56, 189, 248, 0.4)"
                          }`,
                          padding: "6px 14px",
                          borderRadius: "20px",
                          fontSize: "12px",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          whiteSpace: "nowrap",
                          boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
                          backdropFilter: "blur(8px)",
                          zIndex: 10,
                        }}
                      >
                        {autoDetectState === "locked" || autoDetectState === "verifying" ? (
                          <>
                            <FaLock /> 🎯 Iris & Face Locked — Auto-Verifying...
                          </>
                        ) : autoDetectState === "detected" ? (
                          <>
                            <FaCheckCircle /> 👁️ Iris Detected! Gaze directly at camera...
                          </>
                        ) : (
                          <>
                            <FaCrosshairs className="fa-spin" style={{ animationDuration: "4s" }} /> 👁️ Auto-detecting Iris & Face...
                          </>
                        )}
                      </div>

                      {/* Dynamic Biometric Oval Reticle */}
                      <div
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: "50%",
                          transform: "translate(-50%, -50%)",
                          width: "165px",
                          height: "215px",
                          border:
                            autoDetectState === "locked" || autoDetectState === "verifying"
                              ? "3px solid #10b981"
                              : autoDetectState === "detected"
                              ? "2.5px solid #f59e0b"
                              : "2px dashed #38bdf8",
                          borderRadius: "50%",
                          boxShadow:
                            autoDetectState === "locked" || autoDetectState === "verifying"
                              ? "0 0 35px rgba(16, 185, 129, 0.85)"
                              : autoDetectState === "detected"
                              ? "0 0 25px rgba(245, 158, 11, 0.7)"
                              : "0 0 20px rgba(56, 189, 248, 0.4)",
                          pointerEvents: "none",
                          transition: "all 0.25s ease-in-out",
                        }}
                      />

                      {/* Real-time Iris Targeting Reticles */}
                      {detectedLandmarks?.left_eye_rel && detectedLandmarks?.right_eye_rel && (
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            pointerEvents: "none",
                          }}
                        >
                          {/* Inter-pupillary caliper line */}
                          <div
                            style={{
                              position: "absolute",
                              left: `${Math.min((1 - detectedLandmarks.right_eye_rel[0]) * 100, (1 - detectedLandmarks.left_eye_rel[0]) * 100)}%`,
                              top: `${((detectedLandmarks.left_eye_rel[1] + detectedLandmarks.right_eye_rel[1]) / 2) * 100}%`,
                              width: `${Math.abs(detectedLandmarks.left_eye_rel[0] - detectedLandmarks.right_eye_rel[0]) * 100}%`,
                              height: "2px",
                              background: "linear-gradient(90deg, #38bdf8, #10b981, #38bdf8)",
                              boxShadow: "0 0 8px rgba(56, 189, 248, 0.8)",
                              transform: "translateY(-50%)",
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                top: "-18px",
                                background: "rgba(15, 23, 42, 0.9)",
                                color: "#38bdf8",
                                border: "1px solid rgba(56, 189, 248, 0.4)",
                                padding: "1px 6px",
                                borderRadius: "8px",
                                fontSize: "9px",
                                fontWeight: 700,
                              }}
                            >
                              IPD: {detectedLandmarks.inter_pupillary_distance}px
                            </span>
                          </div>

                          {/* Left Iris ring */}
                          <div
                            style={{
                              position: "absolute",
                              left: `${(1 - detectedLandmarks.left_eye_rel[0]) * 100}%`,
                              top: `${detectedLandmarks.left_eye_rel[1] * 100}%`,
                              width: "32px",
                              height: "32px",
                              borderRadius: "50%",
                              border: autoDetectState === "locked" ? "2px solid #10b981" : "2px dashed #38bdf8",
                              boxShadow: autoDetectState === "locked" ? "0 0 20px #10b981" : "0 0 12px #38bdf8",
                              transform: "translate(-50%, -50%)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: autoDetectState === "locked" ? "#10b981" : "#38bdf8" }} />
                          </div>

                          {/* Right Iris ring */}
                          <div
                            style={{
                              position: "absolute",
                              left: `${(1 - detectedLandmarks.right_eye_rel[0]) * 100}%`,
                              top: `${detectedLandmarks.right_eye_rel[1] * 100}%`,
                              width: "32px",
                              height: "32px",
                              borderRadius: "50%",
                              border: autoDetectState === "locked" ? "2px solid #10b981" : "2px dashed #38bdf8",
                              boxShadow: autoDetectState === "locked" ? "0 0 20px #10b981" : "0 0 12px #38bdf8",
                              transform: "translate(-50%, -50%)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: autoDetectState === "locked" ? "#10b981" : "#38bdf8" }} />
                          </div>
                        </div>
                      )}

                      {/* Animated Scanning Beam Line */}
                      <div
                        className="face-scan-beam"
                        style={{
                          background:
                            autoDetectState === "locked" || autoDetectState === "verifying"
                              ? "linear-gradient(90deg, transparent, #10b981, #34d399, transparent)"
                              : autoDetectState === "detected"
                              ? "linear-gradient(90deg, transparent, #f59e0b, #fbbf24, transparent)"
                              : "linear-gradient(90deg, transparent, #38bdf8, #60a5fa, transparent)",
                          boxShadow:
                            autoDetectState === "locked"
                              ? "0 0 12px #10b981"
                              : autoDetectState === "detected"
                              ? "0 0 12px #f59e0b"
                              : "0 0 10px #38bdf8",
                        }}
                      />
                      <style>{`
                        @keyframes scanBeam {
                          0% { top: 25px; opacity: 0.8; }
                          50% { top: 235px; opacity: 1; }
                          100% { top: 25px; opacity: 0.8; }
                        }
                        .face-scan-beam {
                          position: absolute;
                          left: 15%;
                          width: 70%;
                          height: 2px;
                          animation: scanBeam 2.2s ease-in-out infinite;
                          pointer-events: none;
                        }
                      `}</style>

                      {/* Bottom Instruction */}
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
                        {autoDetectState === "locked"
                          ? "✓ 🎯 Iris & Face Biometrics Locked! Auto-checking attendance..."
                          : autoDetectState === "detected"
                          ? "👁️ Iris Detected! Gaze into camera lens..."
                          : "Align face inside oval & gaze at camera for automatic iris lock"}
                      </div>

                      {/* Lock-in Progress Bar at Bottom of Video */}
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: "4px",
                          background: "rgba(255,255,255,0.15)",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${lockProgress}%`,
                            background:
                              autoDetectState === "locked" || autoDetectState === "verifying"
                                ? "#10b981"
                                : "#f59e0b",
                            transition: "width 0.3s ease",
                          }}
                        />
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
                          inset: 0,
                          background: "rgba(15, 23, 42, 0.55)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          color: "#fff",
                        }}
                      >
                        <FaSync className="fa-spin" style={{ fontSize: "28px", color: "#34d399" }} />
                        <span style={{ fontWeight: 700, fontSize: "14px" }}>
                          Verifying Face Biometrics...
                        </span>
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

                {/* Autonomous Verification Progress Banner */}
                {isSubmitting || autoDetectState === "verifying" ? (
                  <div
                    style={{
                      background: "linear-gradient(135deg, #064e3b 0%, #065f46 100%)",
                      border: "1px solid #10b981",
                      borderRadius: "14px",
                      padding: "16px",
                      marginTop: "14px",
                      textAlign: "center",
                      color: "#ecfdf5",
                      boxShadow: "0 6px 20px rgba(16, 185, 129, 0.2)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "10px",
                        fontSize: "15px",
                        fontWeight: 700,
                      }}
                    >
                      <FaSync className="fa-spin" style={{ color: "#34d399", fontSize: "18px" }} />
                      <span>Verifying Biometric Signature & Geofence...</span>
                    </div>
                    <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#a7f3d0" }}>
                      Matching face against registered student profile...
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      padding: "12px 16px",
                      marginTop: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <FaShieldAlt style={{ color: "#2563eb", fontSize: "18px" }} />
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>
                          Autonomous Face Auto-Detection
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>
                          Face detection and verification happen automatically.
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "11px",
                        background: autoDetectState === "detected" ? "#fef3c7" : "#e0f2fe",
                        color: autoDetectState === "detected" ? "#b45309" : "#0284c7",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        fontWeight: 600,
                      }}
                    >
                      {autoDetectState === "detected" ? "Locking..." : "Active"}
                    </span>
                  </div>
                )}

                {/* Secondary Fallback Controls (Discrete) */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "14px",
                    marginTop: "12px",
                  }}
                >
                  {capturedPhoto ? (
                    <button
                      type="button"
                      onClick={retakePhoto}
                      disabled={isSubmitting}
                      style={{
                        padding: "8px 16px",
                        background: "#f1f5f9",
                        color: "#334155",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <FaRedo /> Retake Face Scan
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={captureSnapshot}
                      disabled={isCapturing || isSubmitting}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#94a3b8",
                        fontSize: "12px",
                        cursor: "pointer",
                        textDecoration: "underline",
                        padding: "4px 8px",
                      }}
                    >
                      Taking long? Tap to capture & verify manually
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* If session does NOT require face verification */}
            {!sessionInfo?.require_face && (
              <button
                type="button"
                disabled={isSubmitting || (sessionInfo?.require_geo && !userCoords)}
                onClick={() => handleConfirmAttendance(null)}
                style={{
                  width: "100%",
                  marginTop: "16px",
                  padding: "15px",
                  background:
                    isSubmitting || (sessionInfo?.require_geo && !userCoords)
                      ? "#94a3b8"
                      : "#10b981",
                  color: "#fff",
                  border: "none",
                  borderRadius: "12px",
                  fontWeight: 700,
                  fontSize: "15px",
                  cursor:
                    isSubmitting || (sessionInfo?.require_geo && !userCoords)
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
                    <FaSync className="fa-spin" /> Recording Attendance...
                  </>
                ) : (
                  <>
                    <FaCheckCircle /> Confirm & Mark Attendance
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* LOGIN FORM IF STUDENT IS NOT AUTHENTICATED */}
        {/* ============================================================== */}
        {!studentUser && resultStatus === "idle" && (
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
                Sign in with your student credentials to verify attendance.
              </div>
            </div>

            {loginError && (
              <div
                style={{
                  background: "#fef2f2",
                  color: "#991b1b",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  padding: "12px",
                  fontSize: "13px",
                  marginBottom: "16px",
                  textAlign: "left",
                  lineHeight: 1.5,
                }}
              >
                <div>{loginError}</div>
                {needsPasswordSetup && (
                  <div style={{ marginTop: "8px" }}>
                    <Link
                      to={`/login?role=student&mode=set_password&student_id=${encodeURIComponent(loginUsername || "")}`}
                      style={{
                        display: "inline-block",
                        color: "#2563eb",
                        fontWeight: 700,
                        textDecoration: "underline",
                      }}
                    >
                      Set your Student Password now →
                    </Link>
                  </div>
                )}
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
                  Student ID or Roll Number:
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="e.g. STU20240001 or 2024-CSE-001"
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
                  placeholder="Enter the password you set"
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
                  boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)",
                }}
              >
                <FaLock /> {isLoggingIn ? "Authenticating..." : "Sign In & Launch Biometric Check-In"}
              </button>
            </form>

            <div style={{ marginTop: "16px", fontSize: "12px", color: "#64748b" }}>
              Enter your Student ID and password.
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
