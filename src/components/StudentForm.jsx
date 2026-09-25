import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { addStudent } from "../services/studentservice";
import "../styles/studentform.css";

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

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [createdStudentId, setCreatedStudentId] = useState(null);

  // Field change handlers enforcing strict type restrictions
  const handleNameChange = (e) => {
    const val = e.target.value;
    // Don't allow numbers to be typed into the name field
    if (!/[0-9]/.test(val)) {
      setName(val);
      if (errorMessage) setErrorMessage("");
    }
  };

  const handlePhoneChange = (e) => {
    // Only accept numeric digits, strip anything else
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
    // Reset semester to the first semester of the newly selected year if current selection is invalid
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

    // 1. Name validation: must contain letters, no numbers, min length 2
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

    // 2. Email validation: must end with @gmail.com only
    if (!trimmedEmail) {
      setErrorMessage("Please enter an email address.");
      return;
    }
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!gmailRegex.test(trimmedEmail)) {
      if (!trimmedEmail.endsWith("@gmail.com")) {
        setErrorMessage("Email address must end with @gmail.com only (e.g. student@gmail.com).");
      } else {
        setErrorMessage("Please enter a valid Gmail address format before @gmail.com.");
      }
      return;
    }

    // 3. Phone validation: numbers only, 10 to 15 digits
    if (!trimmedPhone) {
      setErrorMessage("Please enter a phone number.");
      return;
    }
    if (!/^\d+$/.test(trimmedPhone)) {
      setErrorMessage("Phone number must contain only numeric digits (no letters or special characters).");
      return;
    }
    if (trimmedPhone.length < 10 || trimmedPhone.length > 15) {
      setErrorMessage("Phone number must be between 10 and 15 digits.");
      return;
    }

    // 4. Year & Semester validation (2 semesters per year)
    const parsedYear = parseInt(year, 10);
    if (isNaN(parsedYear) || parsedYear < 1 || parsedYear > 4) {
      setErrorMessage("Academic year must be a number between 1 and 4.");
      return;
    }

    const parsedSem = parseInt(semester, 10);
    const validSems = YEAR_SEMESTERS[String(parsedYear)]?.map((s) => Number(s.value)) || [];
    if (isNaN(parsedSem) || !validSems.includes(parsedSem)) {
      setErrorMessage(
        `For Academic Year ${parsedYear}, valid semesters are: ${validSems.map((s) => `Semester ${s}`).join(", ")}.`
      );
      return;
    }

    const newStudent = {
      name: trimmedName,
      year: parsedYear,
      email: trimmedEmail,
      phone: trimmedPhone,
      branch,
      semester: String(parsedSem),
      section: section.trim().toUpperCase() || "A",
    };

    try {
      setSubmitting(true);
      const res = await addStudent(newStudent);
      const assignedId = res.data?.student_id || res.data?.roll_no || "Generated";
      setCreatedStudentId(assignedId);
      setSuccessMessage(
        `✓ Student "${trimmedName}" enrolled successfully! Assigned Student ID: ${assignedId} (Used for student login: Username = ${assignedId}, Password = ${assignedId}).`
      );

      // Clear form inputs
      setName("");
      setEmail("");
      setPhone("");
      setYear("1");
      setSemester("1");
      setSection("A");
      setBranch("CSE");

      // Auto redirect after delay
      setTimeout(() => {
        navigate("/students");
      }, 3000);
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
    setErrorMessage("");
    setSuccessMessage("");
    setCreatedStudentId(null);
  };

  // 2 semesters per academic year
  const availableSemesters = YEAR_SEMESTERS[year] || [
    { value: "1", label: "Semester 1" },
    { value: "2", label: "Semester 2" },
  ];

  return (
    <div className="form-wrapper">
      <div className="form-page-header">
        <div>
          <h2>Enroll New Student</h2>
          <p>Register a student record into the central cloud database with verified input credentials</p>
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
                Credentials saved in backend: <strong>Username:</strong> <code>{createdStudentId}</code> | <strong>Password:</strong> <code>{createdStudentId}</code>
              </div>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="form-error-alert">{errorMessage}</div>
        )}

        <form onSubmit={handleSubmit} noValidate>
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
              <select
                id="stu-year"
                value={year}
                onChange={handleYearChange}
              >
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
              <select
                id="stu-branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
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
              <select
                id="stu-section"
                value={section}
                onChange={(e) => setSection(e.target.value)}
              >
                <option value="A">Section A</option>
                <option value="B">Section B</option>
                <option value="C">Section C</option>
              </select>
            </div>
          </div>

          <div className="form-actions-bar">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleReset}
              disabled={submitting}
            >
              Reset Form
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
            >
              {submitting ? (
                <span><i className="fa-solid fa-spinner fa-spin"></i> Enrolling...</span>
              ) : (
                <span><i className="fa-solid fa-user-plus"></i> Add Student</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StudentForm;