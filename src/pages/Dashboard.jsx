import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Dashboardcard from "../components/Dashboardcard";
import Navbar from "../components/Navbar";
import "../styles/dashboard.css";
import { Link } from "react-router-dom";
import { getStudents, getTodayTimetable, startAttendanceFromSlot, getSessionAttendees } from "../services/studentservice";
import { QRCodeSVG } from "qrcode.react";
import {
  FaClock,
  FaQrcode,
  FaPlayCircle,
  FaCheckCircle,
  FaTimes,
  FaCopy,
  FaExternalLinkAlt,
  FaCalendarAlt,
  FaUsers,
} from "react-icons/fa";

const Dashboard = () => {
  const [students, setStudents] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Today's Timetable States
  const [todaySchedule, setTodaySchedule] = useState({ day: "", count: 0, slots: [] });
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [selectedDayOverride, setSelectedDayOverride] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [startingSlotId, setStartingSlotId] = useState(null);

  // Active QR Session Modal State
  const [activeSessionModal, setActiveSessionModal] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(120);
  const [copiedLink, setCopiedLink] = useState(false);

  // 10-Minute Present Review Modal State
  const [reviewSessionModal, setReviewSessionModal] = useState(null);
  const [reviewTimeRemaining, setReviewTimeRemaining] = useState(600);
  const [loadingReview, setLoadingReview] = useState(false);

  const fetchDashboardData = () => {
    let isMounted = true;
    setLoading(true);
    getStudents()
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
        const count = res.data?.count ?? list.length;
        if (isMounted) {
          setStudents(list);
          setTotalCount(count);
        }
      })
      .catch((err) => {
        console.error("Dashboard failed to fetch students:", err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  };

  const fetchSchedule = (day = selectedDayOverride, showAll = showCompleted) => {
    setScheduleLoading(true);
    const params = {};
    if (day) params.day = day;
    if (showAll) params.all = true;
    getTodayTimetable(params)
      .then((res) => {
        setTodaySchedule(res.data || { day: "", count: 0, slots: [] });
      })
      .catch((err) => {
        console.error("Failed to load today's schedule:", err);
      })
      .finally(() => {
        setScheduleLoading(false);
      });
  };

  useEffect(() => {
    fetchDashboardData();
    fetchSchedule(selectedDayOverride, showCompleted);

    // Auto-refresh schedule every 30 seconds so concluded slots vanish automatically
    const ticker = setInterval(() => {
      fetchSchedule(selectedDayOverride, showCompleted);
    }, 30000);

    return () => clearInterval(ticker);
  }, [selectedDayOverride, showCompleted]);

  // Timer countdown for active QR session modal
  useEffect(() => {
    if (!activeSessionModal) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          const sessId = activeSessionModal.session_id || activeSessionModal.id;
          if (sessId) {
            getSessionAttendees(sessId)
              .then((res) => {
                setActiveSessionModal(null);
                setReviewSessionModal(res.data);
                setReviewTimeRemaining(res.data.review_remaining_seconds || 600);
              })
              .catch(() => {
                setActiveSessionModal(null);
              });
          } else {
            setActiveSessionModal(null);
          }
          fetchSchedule(selectedDayOverride, showCompleted);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSessionModal, selectedDayOverride, showCompleted]);

  // Timer countdown for 10-minute review modal
  useEffect(() => {
    if (!reviewSessionModal) return;

    const interval = setInterval(() => {
      setReviewTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setReviewSessionModal(null);
          fetchSchedule(selectedDayOverride, showCompleted);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [reviewSessionModal, selectedDayOverride, showCompleted]);

  const handleOpenReview = async (sessionId) => {
    if (!sessionId) return;
    setLoadingReview(true);
    try {
      const res = await getSessionAttendees(sessionId);
      setReviewSessionModal(res.data);
      setReviewTimeRemaining(res.data.review_remaining_seconds || 600);
    } catch (err) {
      alert("Unable to fetch attendance review: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoadingReview(false);
    }
  };

  const handleStartAttendance = async (slot) => {
    setStartingSlotId(slot.id);
    try {
      const res = await startAttendanceFromSlot(slot.id);
      const data = res.data;
      if (!data.qr_value && (data.token || data.qr_token)) {
        data.qr_value = `${window.location.origin}/mark-attendance?token=${data.token || data.qr_token}`;
      }
      setActiveSessionModal(data);
      setTimeRemaining(data.duration_seconds || 120);
      fetchSchedule(selectedDayOverride, showCompleted);
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to start attendance session for this class.");
    } finally {
      setStartingSlotId(null);
    }
  };

  const recentStudents = Array.isArray(students) ? students.slice(0, 5) : [];

  return (
    <div className="sideandmain">
      <div className="Sidebarindashboard">
        <Sidebar />
      </div>
      <div className="main-content">
        <Navbar />

        <div className="dashboard-body">
          <Dashboardcard studentCount={totalCount} />

          {/* Today's Academic Timetable & 1-Click QR Launch */}
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "24px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <div>
                <h3
                  style={{
                    margin: "0 0 4px 0",
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#0f172a",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <FaClock style={{ color: "#2563eb" }} />
                  Today's Lecture Schedule & Live QR Launch
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                  Active scheduled teaching periods for{" "}
                  <strong>{todaySchedule.day || "Today"}</strong>. Start QR attendance instantly without manual re-entry.
                </p>
              </div>

              {/* Day filter selector and Concluded toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                {todaySchedule.completed_count > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextShow = !showCompleted;
                      setShowCompleted(nextShow);
                      fetchSchedule(selectedDayOverride || null, nextShow);
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                      fontWeight: 600,
                      background: showCompleted ? "#e0e7ff" : "#f8fafc",
                      color: showCompleted ? "#3730a3" : "#475569",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {showCompleted
                      ? "Hide Concluded"
                      : `Show Concluded (${todaySchedule.completed_count})`}
                  </button>
                )}

                <span style={{ fontSize: "13px", color: "#64748b" }}>Filter Day:</span>
                <select
                  value={selectedDayOverride}
                  onChange={(e) => {
                    setSelectedDayOverride(e.target.value);
                    fetchSchedule(e.target.value || null, showCompleted);
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    background: "#f8fafc",
                    color: "#334155",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Today ({new Date().toLocaleDateString('en-US', { weekday: 'long' })})</option>
                  <option value="Monday">Monday</option>
                  <option value="Tuesday">Tuesday</option>
                  <option value="Wednesday">Wednesday</option>
                  <option value="Thursday">Thursday</option>
                  <option value="Friday">Friday</option>
                  <option value="Saturday">Saturday</option>
                </select>
              </div>
            </div>

            {scheduleLoading ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "14px" }}>
                Loading scheduled lecture slots...
              </div>
            ) : todaySchedule.slots && todaySchedule.slots.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: "16px",
                }}
              >
                {todaySchedule.slots.map((slot) => {
                  const isCurrentStarting = startingSlotId === slot.id;
                  const hasActive = slot.has_active_session;
                  const isReview = slot.status === "review" || slot.has_review_session;
                  const isCompleted = slot.status === "completed" && !isReview;
                  const isUpcoming = slot.status === "upcoming";
                  const isActivePeriod = slot.status === "active" || slot.can_open_qr;

                  return (
                    <div
                      key={slot.id}
                      style={{
                        border: hasActive
                          ? "2px solid #10b981"
                          : isReview
                          ? "2px solid #059669"
                          : isActivePeriod
                          ? "2px solid #2563eb"
                          : isCompleted
                          ? "1px dashed #cbd5e1"
                          : "1px solid #e2e8f0",
                        borderRadius: "12px",
                        padding: "18px",
                        background: hasActive
                          ? "#f0fdf4"
                          : isReview
                          ? "#f0fdf4"
                          : isActivePeriod
                          ? "#f8faff"
                          : isCompleted
                          ? "#f8fafc"
                          : "#ffffff",
                        opacity: isCompleted ? 0.75 : 1,
                        transition: "all 0.2s ease",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "10px",
                          }}
                        >
                          <span
                            style={{
                              background: hasActive || isReview
                                ? "#dcfce7"
                                : isActivePeriod
                                ? "#eff6ff"
                                : isCompleted
                                ? "#f1f5f9"
                                : "#eff6ff",
                              color: hasActive || isReview
                                ? "#15803d"
                                : isActivePeriod
                                ? "#2563eb"
                                : isCompleted
                                ? "#64748b"
                                : "#2563eb",
                              padding: "4px 10px",
                              borderRadius: "20px",
                              fontSize: "12px",
                              fontWeight: 700,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            {(isActivePeriod || isReview) && (
                              <span
                                style={{
                                  width: "8px",
                                  height: "8px",
                                  borderRadius: "50%",
                                  background: isReview ? "#059669" : "#2563eb",
                                  display: "inline-block",
                                }}
                              ></span>
                            )}
                            {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                          </span>

                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              color: isReview ? "#047857" : isActivePeriod ? "#1d4ed8" : isCompleted ? "#64748b" : "#475569",
                              background: isReview ? "#d1fae5" : isActivePeriod ? "#dbeafe" : isCompleted ? "#e2e8f0" : "#f1f5f9",
                              padding: "3px 8px",
                              borderRadius: "6px",
                            }}
                          >
                            {slot.time_status_label || slot.room}
                          </span>
                        </div>

                        <h4 style={{ margin: "0 0 4px 0", fontSize: "16px", color: isCompleted ? "#64748b" : "#0f172a" }}>
                          {slot.subject_details?.name || `Subject #${slot.subject}`}
                        </h4>
                        <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "8px" }}>
                          Code: <strong>{slot.subject_details?.code || "—"}</strong> • {slot.room}
                        </div>

                        <div
                          style={{
                            fontSize: "12px",
                            color: "#475569",
                            background: "rgba(0,0,0,0.03)",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            marginBottom: "14px",
                          }}
                        >
                          Cohort: <strong>{slot.academic_class_name}</strong> • Sec {slot.section}
                        </div>
                      </div>

                      <div>
                        {hasActive ? (
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="button"
                              onClick={() => handleStartAttendance(slot)}
                              style={{
                                flex: 1,
                                padding: "10px 14px",
                                background: "#10b981",
                                color: "#fff",
                                borderRadius: "8px",
                                fontSize: "13px",
                                fontWeight: 600,
                                border: "none",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "6px",
                              }}
                            >
                              <FaCheckCircle /> Session Active (View QR)
                            </button>
                          </div>
                        ) : isReview ? (
                          <button
                            type="button"
                            disabled={loadingReview}
                            onClick={() => handleOpenReview(slot.active_session_id)}
                            style={{
                              width: "100%",
                              padding: "10px 14px",
                              background: "#059669",
                              color: "#fff",
                              border: "none",
                              borderRadius: "8px",
                              fontSize: "13px",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "8px",
                              boxShadow: "0 2px 8px rgba(5, 150, 105, 0.2)",
                            }}
                          >
                            <FaUsers /> View Present Students ({slot.present_count || 0})
                          </button>
                        ) : isCompleted ? (
                          <button
                            type="button"
                            disabled
                            style={{
                              width: "100%",
                              padding: "10px 14px",
                              background: "#e2e8f0",
                              color: "#64748b",
                              border: "none",
                              borderRadius: "8px",
                              fontSize: "13px",
                              fontWeight: 600,
                              cursor: "not-allowed",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "8px",
                            }}
                          >
                            Period Concluded
                          </button>
                        ) : isUpcoming ? (
                          <button
                            type="button"
                            disabled
                            style={{
                              width: "100%",
                              padding: "10px 14px",
                              background: "#f1f5f9",
                              color: "#64748b",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              fontSize: "13px",
                              fontWeight: 600,
                              cursor: "not-allowed",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "8px",
                            }}
                          >
                            <FaClock /> Opens at {slot.start_time.slice(0, 5)}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isCurrentStarting}
                            onClick={() => handleStartAttendance(slot)}
                            style={{
                              width: "100%",
                              padding: "10px 14px",
                              background: "#2563eb",
                              color: "#fff",
                              border: "none",
                              borderRadius: "8px",
                              fontSize: "13px",
                              fontWeight: 600,
                              cursor: isCurrentStarting ? "not-allowed" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "8px",
                            }}
                          >
                            <FaPlayCircle />
                            {isCurrentStarting ? "Spawning QR Session..." : "Start QR Attendance"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  padding: "36px",
                  textAlign: "center",
                  background: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px dashed #cbd5e1",
                }}
              >
                <FaCalendarAlt style={{ fontSize: "32px", color: "#94a3b8", marginBottom: "8px" }} />
                <h4 style={{ margin: "0 0 4px 0", color: "#334155" }}>
                  {todaySchedule.completed_count > 0 && !showCompleted
                    ? "All Scheduled Periods For Today Have Completed"
                    : `No Lecture Slots Scheduled for ${todaySchedule.day || "Today"}`}
                </h4>
                <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                  {todaySchedule.completed_count > 0 && !showCompleted ? (
                    <>
                      All {todaySchedule.completed_count} earlier lecture period(s) have concluded and vanished on time.
                      <br />
                      <button
                        type="button"
                        onClick={() => {
                          setShowCompleted(true);
                          fetchSchedule(selectedDayOverride || null, true);
                        }}
                        style={{
                          marginTop: "10px",
                          background: "none",
                          border: "none",
                          color: "#2563eb",
                          cursor: "pointer",
                          fontWeight: 600,
                          textDecoration: "underline",
                        }}
                      >
                        Show concluded periods for today
                      </button>
                    </>
                  ) : (
                    "You do not have any teaching lectures assigned for this day. You can review attendance or examine student performance."
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Quick Actions & Recent Students */}
          <div className="dashboard-grid-layout">
            <div className="dashboard-panel recent-students-panel">
              <div className="panel-header">
                <h3>Recently Registered Students</h3>
                <Link to="/students" className="panel-link">
                  View All ({totalCount}) →
                </Link>
              </div>

              {loading ? (
                <div className="panel-loading">Loading students...</div>
              ) : recentStudents.length > 0 ? (
                <div className="panel-table-wrap">
                  <table className="recent-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Branch</th>
                        <th>Year</th>
                        <th>Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentStudents.map((s) => (
                        <tr key={s.id}>
                          <td><strong>#{s.id}</strong></td>
                          <td>
                            <div className="student-name-pill">
                              <span className="avatar-dot">{s.name ? s.name[0].toUpperCase() : "S"}</span>
                              {s.name}
                            </div>
                          </td>
                          <td>
                            <span className="dash-branch-badge">{s.branch}</span>
                          </td>
                          <td>Year {s.year}</td>
                          <td>{s.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="panel-empty">
                  <p>No students registered yet.</p>
                  <Link to="/AddStudents" className="action-btn-primary">
                    + Add First Student
                  </Link>
                </div>
              )}
            </div>

            <div className="dashboard-panel quick-actions-panel">
              <div className="panel-header">
                <h3>Quick Actions</h3>
              </div>

              <div className="quick-action-cards">
                <Link to="/AddStudents" className="quick-action-item">
                  <div className="quick-icon add">
                    <i className="fa-solid fa-user-plus"></i>
                  </div>
                  <div className="quick-text">
                    <h4>Add Student</h4>
                    <p>Register a new student</p>
                  </div>
                </Link>

                <Link to="/students" className="quick-action-item">
                  <div className="quick-icon list">
                    <i className="fa-solid fa-users"></i>
                  </div>
                  <div className="quick-text">
                    <h4>All Students</h4>
                    <p>Edit or delete records</p>
                  </div>
                </Link>

                <Link to="/attendance" className="quick-action-item">
                  <div className="quick-icon att">
                    <i className="fa-regular fa-calendar-check"></i>
                  </div>
                  <div className="quick-text">
                    <h4>Take Attendance</h4>
                    <p>Live QR or manual entry</p>
                  </div>
                </Link>

                <Link to="/performance" className="quick-action-item">
                  <div className="quick-icon perf">
                    <i className="fa-solid fa-chart-pie"></i>
                  </div>
                  <div className="quick-text">
                    <h4>Performance</h4>
                    <p>Grades & academic marks</p>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live QR Attendance Modal */}
      {activeSessionModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "20px",
              padding: "32px",
              maxWidth: "460px",
              width: "100%",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              textAlign: "center",
              position: "relative",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveSessionModal(null)}
              style={{
                position: "absolute",
                top: "20px",
                right: "20px",
                background: "none",
                border: "none",
                fontSize: "20px",
                color: "#64748b",
                cursor: "pointer",
              }}
            >
              <FaTimes />
            </button>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 14px",
                borderRadius: "20px",
                background: "#ecfdf5",
                color: "#059669",
                fontSize: "12px",
                fontWeight: 700,
                marginBottom: "12px",
              }}
            >
              ● LIVE SESSION ACTIVATED
            </div>

            <h3 style={{ margin: "0 0 6px 0", fontSize: "20px", color: "#0f172a" }}>
              {activeSessionModal.subject_name}
            </h3>
            <p style={{ margin: "0 0 18px 0", fontSize: "14px", color: "#64748b" }}>
              {activeSessionModal.subject_code} • {activeSessionModal.room} • {activeSessionModal.academic_class_name}
            </p>

            {/* QR Code Container */}
            <div
              style={{
                background: "#ffffff",
                padding: "16px",
                borderRadius: "16px",
                display: "inline-block",
                border: "2px dashed #2563eb",
                boxShadow: "0 8px 24px rgba(37, 99, 235, 0.12)",
                marginBottom: "18px",
              }}
            >
              <QRCodeSVG
                value={activeSessionModal.qr_value}
                size={220}
                level="M"
                includeMargin={true}
              />
            </div>

            {/* Countdown Timer */}
            <div
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: timeRemaining <= 0 ? "#ef4444" : timeRemaining < 60 ? "#f97316" : "#2563eb",
                marginBottom: "16px",
              }}
            >
              {timeRemaining <= 0 ? (
                <div style={{ color: "#ef4444", fontWeight: 700 }}>
                  ● Period Concluded • QR Session Closed & Vanished
                </div>
              ) : (
                <>
                  Closes at {activeSessionModal.end_time || "Period End"} (
                  <strong>
                    {Math.floor(timeRemaining / 60)}m {timeRemaining % 60}s remaining
                  </strong>
                  )
                </>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginBottom: "16px" }}>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(activeSessionModal.qr_value);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2500);
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: copiedLink ? "#ecfdf5" : "#f8fafc",
                  color: copiedLink ? "#059669" : "#334155",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <FaCopy /> {copiedLink ? "Copied!" : "Copy Link"}
              </button>

              <a
                href={activeSessionModal.qr_value}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  color: "#334155",
                  fontSize: "12px",
                  fontWeight: 600,
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <FaExternalLinkAlt /> Open Scanner
              </a>
            </div>

            <button
              type="button"
              onClick={() => setActiveSessionModal(null)}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "10px",
                background: "#0f172a",
                color: "#fff",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              Done / Close Window
            </button>
          </div>
        </div>
      )}

      {/* 10-Minute Present Students Review Modal */}
      {reviewSessionModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "20px",
              padding: "28px",
              maxWidth: "620px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "1px solid #e2e8f0",
            }}
          >
            {/* Header with Close */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#ecfdf5",
                    color: "#059669",
                    padding: "4px 12px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: 700,
                    marginBottom: "8px",
                  }}
                >
                  <FaCheckCircle /> SAVED TO DATABASE • 10-MIN REVIEW
                </div>
                <h3 style={{ margin: "0 0 4px 0", fontSize: "20px", color: "#0f172a" }}>
                  {reviewSessionModal.subject_name}
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                  {reviewSessionModal.subject_code} • Date: {reviewSessionModal.date}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setReviewSessionModal(null)}
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  borderRadius: "50%",
                  width: "34px",
                  height: "34px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "#64748b",
                }}
              >
                <FaTimes />
              </button>
            </div>

            {/* 10-Minute Countdown Banner */}
            <div
              style={{
                background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)",
                border: "1px solid #a7f3d0",
                borderRadius: "12px",
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <FaClock style={{ color: "#059669", fontSize: "18px" }} />
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#065f46" }}>
                    Present list appearing for 10 minutes post-session
                  </div>
                  <div style={{ fontSize: "11px", color: "#047857" }}>
                    Attendance permanently stored in database. Vanishes after countdown.
                  </div>
                </div>
              </div>
              <div
                style={{
                  background: "#059669",
                  color: "#ffffff",
                  padding: "4px 10px",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "13px",
                  fontFamily: "monospace",
                }}
              >
                {Math.floor(reviewTimeRemaining / 60)}m {String(reviewTimeRemaining % 60).padStart(2, "0")}s
              </div>
            </div>

            {/* Quick Stat Tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "20px" }}>
              <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "10px", textAlign: "center", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>Enrolled</div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>{reviewSessionModal.total_enrolled ?? 0}</div>
              </div>
              <div style={{ background: "#f0fdf4", padding: "12px", borderRadius: "10px", textAlign: "center", border: "1px solid #bbf7d0" }}>
                <div style={{ fontSize: "11px", color: "#15803d", fontWeight: 600 }}>Present</div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#15803d" }}>{reviewSessionModal.present_count ?? 0}</div>
              </div>
              <div style={{ background: "#fef2f2", padding: "12px", borderRadius: "10px", textAlign: "center", border: "1px solid #fecaca" }}>
                <div style={{ fontSize: "11px", color: "#b91c1c", fontWeight: 600 }}>Absent</div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#b91c1c" }}>{reviewSessionModal.absent_count ?? 0}</div>
              </div>
            </div>

            {/* Present Students Table */}
            <div style={{ marginBottom: "20px" }}>
              <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
                <FaUsers style={{ color: "#059669" }} />
                Students Marked Present ({reviewSessionModal.attendees?.length || 0}):
              </h4>

              {reviewSessionModal.attendees && reviewSessionModal.attendees.length > 0 ? (
                <div
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    overflow: "hidden",
                    maxHeight: "260px",
                    overflowY: "auto",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>#</th>
                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Roll No</th>
                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Name</th>
                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Status</th>
                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewSessionModal.attendees.map((att, idx) => (
                        <tr key={att.student_id || idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "10px 12px", color: "#94a3b8" }}>{idx + 1}</td>
                          <td style={{ padding: "10px 12px", fontWeight: 600, color: "#0f172a" }}>{att.roll_no}</td>
                          <td style={{ padding: "10px 12px", color: "#334155" }}>{att.name}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <span
                              style={{
                                background: "#dcfce7",
                                color: "#15803d",
                                padding: "2px 8px",
                                borderRadius: "12px",
                                fontSize: "11px",
                                fontWeight: 700,
                              }}
                            >
                              ✓ Present
                            </span>
                          </td>
                          <td style={{ padding: "10px 12px", color: "#64748b", fontSize: "12px" }}>
                            {att.marked_at ? new Date(att.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div
                  style={{
                    padding: "24px",
                    textAlign: "center",
                    background: "#f8fafc",
                    borderRadius: "10px",
                    color: "#94a3b8",
                    fontSize: "13px",
                    border: "1px dashed #cbd5e1",
                  }}
                >
                  No students scanned QR during this period. All enrolled students are marked Absent in the database.
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setReviewSessionModal(null)}
                style={{
                  flex: 1,
                  padding: "11px",
                  borderRadius: "10px",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "13px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Close Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;