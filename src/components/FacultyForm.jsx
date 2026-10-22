import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { registerFaculty, sendTeacherCredentials } from "../services/studentservice";
import "../styles/studentform.css";
import {
  FaCamera,
  FaRedo,
  FaCheckCircle,
  FaExclamationTriangle,
  FaUpload,
  FaTrash,
  FaUserTie,
  FaSpinner,
  FaCopy,
  FaPaperPlane,
  FaIdBadge,
  FaShieldAlt,
} from "react-icons/fa";

const COLLEGE_DEPARTMENTS = [
  "Computer Science & Engineering",
  "Artificial Intelligence & Machine Learning",
  "Information Technology",
  "Electronics & Communication Engineering",
  "Electrical & Electronics Engineering",
  "Mechanical Engineering",
  "Civil Engineering",
  "General Studies & Basic Sciences",
  "University Administration",
];

const FACULTY_DESIGNATIONS = [
  "Assistant Professor",
  "Associate Professor",
  "Professor",
  "Head of Department (HOD)",
  "Senior Lecturer",
  "Lecturer",
  "Adjunct Faculty",
  "Visiting Professor",
];

const FacultyForm = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("Computer Science & Engineering");
  const [designation, setDesignation] = useState("Assistant Professor");
  const [qualification, setQualification] = useState("");
  const [customTeacherId, setCustomTeacherId] = useState("");

  // Photo & Camera States
  const [photo, setPhoto] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Submission & Feedback States
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successData, setSuccessData] = useState(null);
  const [copiedId, setCopiedId] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (isCameraActive && streamRef.current && videoRef.current) {
      const video = videoRef.current;
      if (video.srcObject !== streamRef.current) {
        video.srcObject = streamRef.current;
      }
      video.play().catch((err) => console.warn("Camera video error:", err));
    }
  }, [isCameraActive]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraError("Camera permission denied or camera not available. You can upload a photo instead.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setPhoto(dataUrl);
    stopCamera();
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please select a valid image file (JPEG or PNG).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("Photo file size must be less than 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        setPhoto(dataUrl);
        if (errorMessage) setErrorMessage("");
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhoto(null);
    stopCamera();
  };

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessData(null);
    setResendStatus(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setErrorMessage("Please enter the faculty member's full name.");
      return;
    }
    if (/\d/.test(trimmedName)) {
      setErrorMessage("Faculty name cannot contain numeric digits.");
      return;
    }
    if (trimmedName.length < 2) {
      setErrorMessage("Faculty name must be at least 2 characters long.");
      return;
    }

    if (!trimmedEmail) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    const emailPattern = /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|gmail\.com)$/;
    if (!emailPattern.test(trimmedEmail)) {
      setErrorMessage("Please enter a valid email address (e.g. faculty@gmail.com or prof@university.edu).");
      return;
    }

    if (!trimmedPhone) {
      setErrorMessage("Please enter a contact phone number.");
      return;
    }
    if (trimmedPhone.length < 10 || trimmedPhone.length > 15) {
      setErrorMessage("Phone number must be between 10 and 15 digits.");
      return;
    }

    const payload = {
      name: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone,
      department,
      designation,
      qualification: qualification.trim(),
      teacher_id: customTeacherId.trim(),
      profile_photo: photo || "",
    };

    try {
      setSubmitting(true);
      const res = await registerFaculty(payload);
      const assignedId = res.data?.teacher_id || res.data?.employee_id || "Assigned";
      setSuccessData({
        name: trimmedName,
        teacher_id: assignedId,
        user_id: res.data?.user_id,
        email: trimmedEmail,
        department,
        designation,
      });

      // Clear form inputs
      setName("");
      setEmail("");
      setPhone("");
      setQualification("");
      setCustomTeacherId("");
      setPhoto(null);
      stopCamera();
    } catch (err) {
      console.error("Failed to register faculty:", err);
      const detail =
        err.response?.data?.detail ||
        (err.response?.data && Object.values(err.response.data).flat().join(" | ")) ||
        "Failed to register faculty member. Please check input values.";
      setErrorMessage(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyTeacherId = () => {
    if (successData?.teacher_id) {
      navigator.clipboard.writeText(successData.teacher_id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleResendCredentials = async () => {
    if (!successData?.user_id) return;
    setIsResending(true);
    setResendStatus(null);
    try {
      const res = await sendTeacherCredentials(successData.user_id);
      setResendStatus({
        type: "success",
        text: res.data?.detail || `Teacher ID credentials re-sent to ${successData.email}!`,
      });
    } catch (err) {
      setResendStatus({
        type: "error",
        text: err.response?.data?.detail || "Failed to dispatch email. Please check server SMTP configuration.",
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleReset = () => {
    setName("");
    setEmail("");
    setPhone("");
    setDepartment("Computer Science & Engineering");
    setDesignation("Assistant Professor");
    setQualification("");
    setCustomTeacherId("");
    setPhoto(null);
    setErrorMessage("");
    setSuccessData(null);
    setResendStatus(null);
    stopCamera();
  };

  return (
    <div className="form-wrapper">
      <div className="form-page-header">
        <div>
          <h2>👨‍🏫 Faculty Member Registration</h2>
          <p>
            Enroll institution teaching faculty, configure department & designation, and auto-dispatch official Teacher ID with password setup link to their email.
          </p>
          <div style={{ marginTop: "8px" }}>
            <span
              style={{
                background: "#eff6ff",
                color: "#1d4ed8",
                padding: "5px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                border: "1px solid #bfdbfe",
              }}
            >
              <FaShieldAlt /> Administrator Authority: Permitted to Create Faculty Accounts
            </span>
          </div>
        </div>
        <Link to={isAdmin ? "/admin" : "/dashboard"} className="back-link">
          ← {isAdmin ? "Back to Admin Console" : "Back to Dashboard"}
        </Link>
      </div>

      <div className="stu-form-cont">
        {/* Success Feedback Card */}
        {successData && (
          <div
            style={{
              background: "#f5f3ff",
              border: "1.5px solid #c4b5fd",
              borderRadius: "14px",
              padding: "24px",
              marginBottom: "28px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <FaCheckCircle style={{ color: "#7c3aed", fontSize: "24px", flexShrink: 0 }} />
              <div>
                <h3 style={{ margin: 0, color: "#4c1d95", fontSize: "18px", fontWeight: 700 }}>
                  Faculty Profile Registered Successfully!
                </h3>
                <span style={{ color: "#6d28d9", fontSize: "13px" }}>
                  An official onboarding email has been sent to <strong>{successData.email}</strong>.
                </span>
              </div>
            </div>

            <div
              style={{
                background: "#ffffff",
                border: "1px solid #ddd6fe",
                borderRadius: "10px",
                padding: "16px 20px",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "14px",
                marginBottom: "16px",
              }}
            >
              <div>
                <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 600, display: "block" }}>
                  ASSIGNED TEACHER ID
                </span>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "22px",
                    fontWeight: 800,
                    color: "#7c3aed",
                    letterSpacing: "1px",
                  }}
                >
                  {successData.teacher_id}
                </span>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleCopyTeacherId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "1px solid #c4b5fd",
                    background: "#ede9fe",
                    color: "#5b21b6",
                    fontWeight: 600,
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  <FaCopy /> {copiedId ? "Copied!" : "Copy Teacher ID"}
                </button>

                <button
                  type="button"
                  onClick={handleResendCredentials}
                  disabled={isResending}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#7c3aed",
                    color: "#ffffff",
                    fontWeight: 600,
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  {isResending ? <FaSpinner className="spin-icon" /> : <FaPaperPlane />}
                  <span>{isResending ? "Sending..." : "Resend Email"}</span>
                </button>
              </div>
            </div>

            {resendStatus && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "14px",
                  background: resendStatus.type === "success" ? "#dcfce7" : "#fee2e2",
                  color: resendStatus.type === "success" ? "#166534" : "#991b1b",
                  border: `1px solid ${resendStatus.type === "success" ? "#86efac" : "#fca5a5"}`,
                }}
              >
                {resendStatus.text}
              </div>
            )}

            <div style={{ fontSize: "12.5px", color: "#5b21b6", lineHeight: 1.6 }}>
              <strong>Next Steps for Teacher:</strong>
              <ol style={{ margin: "6px 0 0", paddingLeft: "20px" }}>
                <li>Go to the Faculty Login tab.</li>
                <li>Click <strong>&quot;Set Password with Teacher ID&quot;</strong>.</li>
                <li>Enter Teacher ID <strong>{successData.teacher_id}</strong> and choose a password.</li>
                <li>Sign in anytime with their Teacher ID and new password.</li>
              </ol>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="form-error-alert">
            <FaExclamationTriangle style={{ marginRight: "8px" }} />
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Section: Profile Photo / Biometrics */}
          <div style={{ marginBottom: "28px" }}>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                color: "#334155",
                marginBottom: "8px",
              }}
            >
              Faculty Profile Photo (Optional)
            </label>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "20px",
                background: "#f8fafc",
                padding: "18px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
              }}
            >
              {/* Photo Preview / Camera Box */}
              <div
                style={{
                  width: "140px",
                  height: "140px",
                  borderRadius: "12px",
                  overflow: "hidden",
                  background: "#e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  border: "2px solid #cbd5e1",
                  flexShrink: 0,
                }}
              >
                {photo ? (
                  <img
                    src={photo}
                    alt="Faculty Preview"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : isCameraActive ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <FaUserTie style={{ fontSize: "52px", color: "#94a3b8" }} />
                )}
              </div>

              {/* Photo Controls */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {!isCameraActive && !photo && (
                    <button
                      type="button"
                      className="photo-action-btn camera-btn"
                      onClick={startCamera}
                    >
                      <FaCamera /> Use Webcam
                    </button>
                  )}

                  {isCameraActive && (
                    <button
                      type="button"
                      className="photo-action-btn capture-btn"
                      onClick={capturePhoto}
                    >
                      <FaCamera /> Snap Photo
                    </button>
                  )}

                  {!photo && (
                    <button
                      type="button"
                      className="photo-action-btn upload-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FaUpload /> Upload Image
                    </button>
                  )}

                  {photo && (
                    <button
                      type="button"
                      className="photo-action-btn remove-btn"
                      onClick={handleRemovePhoto}
                    >
                      <FaTrash /> Remove Photo
                    </button>
                  )}
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }}
                  onChange={handleFileUpload}
                />

                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  Accepted formats: JPG, PNG. Used for teacher directory & ID badge cards.
                </span>

                {cameraError && (
                  <span style={{ fontSize: "12px", color: "#dc2626" }}>{cameraError}</span>
                )}
              </div>
            </div>
          </div>

          <canvas ref={canvasRef} style={{ display: "none" }} />

          {/* Row 1: Full Name & Official Email */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="facultyName">
                Full Name <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                id="facultyName"
                type="text"
                placeholder="e.g. Dr. Ramesh Sharma"
                value={name}
                required
                onChange={handleNameChange}
              />
              <span className="field-hint">Enter full name without numeric digits.</span>
            </div>

            <div className="form-group">
              <label htmlFor="facultyEmail">
                Official Email Address <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                id="facultyEmail"
                type="email"
                placeholder="e.g. ramesh.sharma@gmail.com"
                value={email}
                required
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
              />
              <span className="field-hint">Teacher ID & password setup link will be delivered here.</span>
            </div>
          </div>

          {/* Row 2: Phone & Department */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="facultyPhone">
                Contact Phone <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                id="facultyPhone"
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                required
                maxLength={15}
                onChange={handlePhoneChange}
              />
              <span className="field-hint">10 to 15 numeric digits.</span>
            </div>

            <div className="form-group">
              <label htmlFor="facultyDept">
                Academic Department <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <select
                id="facultyDept"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                {COLLEGE_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 3: Designation & Highest Qualification */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="facultyDesignation">
                Academic Designation <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <select
                id="facultyDesignation"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
              >
                {FACULTY_DESIGNATIONS.map((desig) => (
                  <option key={desig} value={desig}>
                    {desig}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="facultyQualification">
                Qualification / Specialization
              </label>
              <input
                id="facultyQualification"
                type="text"
                placeholder="e.g. Ph.D in Computer Science / AI & ML"
                value={qualification}
                onChange={(e) => setQualification(e.target.value)}
              />
            </div>
          </div>

          {/* Row 4: Custom Teacher ID (Optional) */}
          <div className="form-group" style={{ marginBottom: "26px" }}>
            <label htmlFor="facultyCustomId">
              Custom Teacher ID (Optional)
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <input
                id="facultyCustomId"
                type="text"
                placeholder="Leave blank to auto-generate (e.g. TCH-005)"
                value={customTeacherId}
                onChange={(e) => setCustomTeacherId(e.target.value.toUpperCase())}
                style={{ flex: 1 }}
              />
              <span
                style={{
                  background: "#f1f5f9",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#475569",
                  border: "1px solid #cbd5e1",
                  whiteSpace: "nowrap",
                }}
              >
                <FaIdBadge style={{ marginRight: "6px" }} />
                Prefix: TCH-
              </span>
            </div>
            <span className="field-hint">
              If left blank, the next sequential ID will be assigned automatically.
            </span>
          </div>

          {/* Form Action Buttons */}
          <div className="form-actions">
            <button
              type="submit"
              className="submit-btn"
              disabled={submitting}
              style={{
                background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "13px 26px",
                fontSize: "15px",
                fontWeight: 700,
              }}
            >
              {submitting ? (
                <>
                  <FaSpinner className="spin-icon" /> Enrolling Faculty & Sending ID...
                </>
              ) : (
                <>
                  <FaPaperPlane /> Register Faculty & Dispatch Teacher ID
                </>
              )}
            </button>

            <button
              type="button"
              className="reset-btn"
              onClick={handleReset}
              disabled={submitting}
            >
              <FaRedo /> Reset Form
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FacultyForm;
