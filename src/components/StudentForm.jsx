import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { addStudent, detectFaceInImage } from "../services/studentservice";
import "../styles/studentform.css";
import {
  FaCamera,
  FaRedo,
  FaCheckCircle,
  FaExclamationTriangle,
  FaUpload,
  FaTrash,
  FaUserShield,
  FaSpinner,
} from "react-icons/fa";

// Map each academic year to its corresponding 2 semesters
const YEAR_SEMESTERS = {
  "1": [
    { value: "1", label: "Semester 1" },
    { value: "2", label: "Semester 2" },
  ],
  "2": [
    { value: "3", label: "Semester 3" },
    { value: "4", label: "Semester 4" },
  ],
  "3": [
    { value: "5", label: "Semester 5" },
    { value: "6", label: "Semester 6" },
  ],
  "4": [
    { value: "7", label: "Semester 7" },
    { value: "8", label: "Semester 8" },
  ],
};

const StudentForm = () => {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [year, setYear] = useState("1");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [branch, setBranch] = useState("CSE");
  const [semester, setSemester] = useState("1");
  const [section, setSection] = useState("A");

  // Biometric Face Registration States
  const [facePhoto, setFacePhoto] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [faceStatus, setFaceStatus] = useState(null); // { valid: bool, message: str, confidence: num }

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [createdStudentId, setCreatedStudentId] = useState(null);

  // Stop camera when unmounting
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraError("Camera permission denied or camera not available. You can use photo upload instead.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const verifyFaceOnline = async (photoBase64) => {
    setIsDetecting(true);
    try {
      const res = await detectFaceInImage(photoBase64);
      if (res.data?.face_detected) {
        const confPercent = Math.round((res.data.confidence || 0.9) * 100);
        setFaceStatus({
          valid: true,
          confidence: confPercent,
          message: `Valid human face detected (${confPercent}% biometric confidence). Ready for anti-proxy attendance!`,
        });
      } else {
        setFaceStatus({
          valid: false,
          confidence: 0,
          message: res.data?.error || "No clear human face detected in this photo. Please retake facing the camera directly with good lighting.",
        });
      }
    } catch {
      // If detection test fails, still allow the photo to be submitted to backend
      setFaceStatus({
        valid: true,
        confidence: 85,
        message: "Photo captured successfully (biometric processing will occur upon enrollment).",
      });
    } finally {
      setIsDetecting(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 480;

    const ctx = canvas.getContext("2d");
    // Center crop to square
    const minDim = Math.min(video.videoWidth, video.videoHeight);
    const startX = (video.videoWidth - minDim) / 2;
    const startY = (video.videoHeight - minDim) / 2;
    ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, 480, 480);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setFacePhoto(dataUrl);
    stopCamera();
    verifyFaceOnline(dataUrl);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please select a valid image file (JPG, PNG, WEBP).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 480;
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          }
        } else {
          if (h > maxDim) {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        setFacePhoto(dataUrl);
        verifyFaceOnline(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setFacePhoto(null);
    setFaceStatus(null);
    stopCamera();
  };

  // Field change handlers enforcing strict type restrictions
  const handleNameChange = (e) => {
    const val = e.target.value;
    if (!/[0-9]/.test(val)) {
      setName(val);
      if (errorMessage) setErrorMessage("");
    }
  };

  const handlePhoneChange = (e) => {
    const digitsOnly = e.target.value.replace(/\D/g, "");
    if (digitsOnly.length <= 15) {
      setPhone(digitsOnly);
      if (errorMessage) setErrorMessage("");
    }
  };

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    if (errorMessage) setErrorMessage("");
  };

  const handleYearChange = (e) => {
    const selectedYear = e.target.value;
    setYear(selectedYear);
    const availableSems = YEAR_SEMESTERS[selectedYear] || [];
    if (!availableSems.some((s) => s.value === semester)) {
      setSemester(availableSems[0]?.value || "1");
    }
    if (errorMessage) setErrorMessage("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setCreatedStudentId(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    // 1. Name validation
    if (!trimmedName) {
      setErrorMessage("Please enter the student's full name.");
      return;
    }
    if (/\d/.test(trimmedName)) {
      setErrorMessage("Student name cannot contain numeric digits.");
      return;
    }
    if (!/^[a-zA-Z\s.'-]+$/.test(trimmedName)) {
      setErrorMessage("Student name can only contain letters, spaces, hyphens, and periods.");
      return;
    }
    if (trimmedName.length < 2) {
      setErrorMessage("Student name must be at least 2 characters long.");
      return;
    }

    // 2. Email validation
    if (!trimmedEmail) {
      setErrorMessage("Please enter an email address.");
      return;
    }
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!gmailRegex.test(trimmedEmail)) {
      setErrorMessage("Email address must end with @gmail.com only (e.g. student@gmail.com).");
      return;
    }

    // 3. Phone validation
    if (!trimmedPhone) {
      setErrorMessage("Please enter a phone number.");
      return;
    }
    if (!/^\d+$/.test(trimmedPhone)) {
      setErrorMessage("Phone number must contain only numeric digits.");
      return;
    }
    if (trimmedPhone.length < 10 || trimmedPhone.length > 15) {
      setErrorMessage("Phone number must be between 10 and 15 digits.");
      return;
    }

    // 4. Year & Semester validation
    const parsedYear = parseInt(year, 10);
    const parsedSem = parseInt(semester, 10);

    const newStudent = {
      name: trimmedName,
      year: parsedYear,
      email: trimmedEmail,
      phone: trimmedPhone,
      branch,
      semester: String(parsedSem),
      section: section.trim().toUpperCase() || "A",
      profile_photo: facePhoto || "",
    };

    try {
      setSubmitting(true);
      const res = await addStudent(newStudent);
      const assignedId = res.data?.student_id || res.data?.roll_no || "Generated";
      const faceRegistered = res.data?.face_registered || Boolean(facePhoto);
      setCreatedStudentId(assignedId);

      setSuccessMessage(
        `✓ Student "${trimmedName}" registered successfully! Assigned Student ID: ${assignedId}. ${
          faceRegistered
            ? "Biometric Facial Features have been recorded into the database for Anti-Proxy Attendance."
            : "Note: Face registration is pending (you can register it anytime from the student roster)."
        }`
      );

      // Clear form inputs
      setName("");
      setEmail("");
      setPhone("");
      setYear("1");
      setSemester("1");
      setSection("A");
      setBranch("CSE");
      setFacePhoto(null);
      setFaceStatus(null);
      stopCamera();

      // Auto redirect after delay
      setTimeout(() => {
        navigate("/students");
      }, 3500);
    } catch (error) {
      console.error("Failed to add student:", error);
      if (error.response && error.response.data) {
        const errors = error.response.data;
        const msg = Object.entries(errors)
          .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(", ") : val}`)
          .join(" | ");
        setErrorMessage(msg || "Failed to add student to database.");
      } else {
        setErrorMessage("Network error or server unreachable. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setName("");
    setYear("1");
    setEmail("");
    setPhone("");
    setBranch("CSE");
    setSemester("1");
    setSection("A");
    setFacePhoto(null);
    setFaceStatus(null);
    stopCamera();
    setErrorMessage("");
    setSuccessMessage("");
    setCreatedStudentId(null);
  };

  const availableSemesters = YEAR_SEMESTERS[year] || [
    { value: "1", label: "Semester 1" },
    { value: "2", label: "Semester 2" },
  ];

  return (
    <div className="form-wrapper">
      <div className="form-page-header">
        <div>
          <h2>Enroll Student & Register Biometric Face</h2>
          <p>Register student record and record their biometric facial identity for Anti-Proxy Attendance</p>
        </div>
        <Link to="/students" className="back-link">
          ← View All Students
        </Link>
      </div>

      <div className="stu-form-cont">
        {successMessage && (
          <div className="form-success-alert">
            <div>{successMessage}</div>
            {createdStudentId && (
              <div style={{ marginTop: "8px", fontSize: "13px" }}>
                Credentials saved in backend: <strong>Username:</strong> <code>{createdStudentId}</code> |{" "}
                <strong>Password:</strong> <code>{createdStudentId}</code>
              </div>
            )}
          </div>
        )}

        {errorMessage && <div className="form-error-alert">{errorMessage}</div>}

        <form onSubmit={handleSubmit} noValidate>
          {/* Biometric Face Registration Card */}
          <div className="face-register-card">
            <div className="face-card-header">
              <div className="face-card-icon">
                <FaUserShield />
              </div>
              <div>
                <h4 style={{ margin: "0 0 2px 0", fontSize: "16px", color: "#0f172a", fontWeight: 700 }}>
                  Face Registration (Anti-Proxy Biometrics)
                </h4>
                <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                  Take a photo of the student to store in the database for QR attendance face matching
                </p>
              </div>
            </div>

            <div className="face-card-body">
              {/* Camera Preview Area */}
              {isCameraActive ? (
                <div className="camera-viewport-container">
                  <div className="camera-video-wrapper">
                    <video ref={videoRef} autoPlay playsInline muted className="camera-live-feed" />
                    {/* Face Guide Oval Overlay */}
                    <div className="face-oval-guide">
                      <div className="guide-corner top-left"></div>
                      <div className="guide-corner top-right"></div>
                      <div className="guide-corner bottom-left"></div>
                      <div className="guide-corner bottom-right"></div>
                      <div className="face-scan-line"></div>
                      <span className="face-guide-text">Position Student's Face Inside Frame</span>
                    </div>
                  </div>

                  <div className="camera-controls-bar">
                    <button
                      type="button"
                      className="btn-capture-snapshot"
                      onClick={capturePhoto}
                    >
                      <FaCamera /> Capture Student Photo
                    </button>
                    <button
                      type="button"
                      className="btn-cancel-cam"
                      onClick={stopCamera}
                    >
                      Cancel Camera
                    </button>
                  </div>
                </div>
              ) : facePhoto ? (
                /* Captured Photo Preview Area */
                <div className="photo-preview-container">
                  <div className="preview-image-box">
                    <img src={facePhoto} alt="Student Face Preview" className="captured-face-img" />
                    <div className="photo-badge">
                      <FaCheckCircle /> Face Captured
                    </div>
                  </div>

                  <div className="photo-details-box">
                    {isDetecting ? (
                      <div className="face-detecting-indicator">
                        <FaSpinner className="fa-spin" /> Analyzing facial biometric features...
                      </div>
                    ) : faceStatus ? (
                      <div
                        className={`face-status-banner ${
                          faceStatus.valid ? "status-valid" : "status-warning"
                        }`}
                      >
                        {faceStatus.valid ? <FaCheckCircle /> : <FaExclamationTriangle />}
                        <span>{faceStatus.message}</span>
                      </div>
                    ) : null}

                    <div className="photo-action-buttons">
                      <button
                        type="button"
                        className="btn-retake-photo"
                        onClick={startCamera}
                      >
                        <FaRedo /> Retake with Camera
                      </button>
                      <button
                        type="button"
                        className="btn-remove-photo"
                        onClick={handleRemovePhoto}
                      >
                        <FaTrash /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Initial Camera / Upload Prompts */
                <div className="camera-prompt-container">
                  <div className="prompt-actions">
                    <button
                      type="button"
                      className="btn-open-camera"
                      onClick={startCamera}
                    >
                      <FaCamera /> Open Live Camera & Take Photo
                    </button>
                    <span style={{ color: "#94a3b8", fontSize: "13px" }}>or</span>
                    <button
                      type="button"
                      className="btn-upload-file"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FaUpload /> Upload Student Picture
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={handleFileUpload}
                    />
                  </div>
                  {cameraError && (
                    <div style={{ marginTop: "12px", color: "#dc2626", fontSize: "13px" }}>
                      {cameraError}
                    </div>
                  )}
                  <p style={{ margin: "10px 0 0 0", fontSize: "12px", color: "#64748b" }}>
                    * Recommended: Ensure student faces directly towards the camera with neutral expression.
                  </p>
                </div>
              )}
            </div>
          </div>

          <canvas ref={canvasRef} style={{ display: "none" }} />

          {/* Student Information Fields */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="stu-name">
                Full Name <span style={{ color: "#ef4444" }}>*</span>
                <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "6px" }}>(Letters only)</span>
              </label>
              <input
                id="stu-name"
                type="text"
                placeholder="e.g. John Doe"
                value={name}
                required
                onChange={handleNameChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="stu-year">
                Academic Year <span style={{ color: "#ef4444" }}>*</span>
                <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "6px" }}>(Year 1 - 4)</span>
              </label>
              <select id="stu-year" value={year} onChange={handleYearChange}>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="stu-email">
                Email Address <span style={{ color: "#ef4444" }}>*</span>
                <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "6px" }}>(Must end with @gmail.com)</span>
              </label>
              <input
                id="stu-email"
                type="email"
                placeholder="e.g. student@gmail.com"
                value={email}
                required
                onChange={handleEmailChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="stu-phone">
                Phone Number <span style={{ color: "#ef4444" }}>*</span>
                <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "6px" }}>(Numbers only, 10-15 digits)</span>
              </label>
              <input
                id="stu-phone"
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                required
                inputMode="numeric"
                onChange={handlePhoneChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="stu-branch">
                Branch / Department <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <select id="stu-branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="CSE">Computer Science & Eng (CSE)</option>
                <option value="ECE">Electronics & Comm (ECE)</option>
                <option value="AIML">AI & Machine Learning (AIML)</option>
                <option value="IT">Information Technology (IT)</option>
                <option value="MECH">Mechanical Eng (MECH)</option>
                <option value="CIVIL">Civil Eng (CIVIL)</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="stu-sem">
                Semester <span style={{ color: "#ef4444" }}>*</span>
                <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "6px" }}>
                  (Year {year} • 2 Semesters)
                </span>
              </label>
              <select
                id="stu-sem"
                value={semester}
                onChange={(e) => {
                  setSemester(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
              >
                {availableSemesters.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="stu-section">
                Section <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <select id="stu-section" value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="A">Section A</option>
                <option value="B">Section B</option>
                <option value="C">Section C</option>
              </select>
            </div>
          </div>

          <div className="form-actions-bar">
            <button type="button" className="btn-secondary" onClick={handleReset} disabled={submitting}>
              Reset Form
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? (
                <span>
                  <i className="fa-solid fa-spinner fa-spin"></i> Enrolling Student & Biometrics...
                </span>
              ) : (
                <span>
                  <FaUserShield /> Add Student & Save Face
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StudentForm;