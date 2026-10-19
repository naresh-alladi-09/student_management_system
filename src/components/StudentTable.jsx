import "../styles/studenttable.css";

const StudentTable = ({
  students,
  onEdit,
  onDeactivate,
  onActivate,
  onRegisterFace,
  onSendCredentials,
  sendingStudentId,
}) => {
  const getBranchClass = (branch) => {
    const b = (branch || "").toLowerCase();
    if (b.includes("cse")) return "cse";
    if (b.includes("ece")) return "ece";
    if (b.includes("aiml")) return "aiml";
    if (b.includes("it")) return "it";
    if (b.includes("mech")) return "mech";
    return "civil";
  };

  return (
    <div className="student-table-card">
      <div className="table-responsive">
        <table className="modern-student-table">
          <thead>
            <tr>
              <th className="student-id-col">Roll No / ID</th>
              <th>Student Name</th>
              <th>Branch</th>
              <th>Academic Class</th>
              <th>Contact Details</th>
              <th>Biometrics</th>
              <th>Status</th>
              <th style={{ textAlign: "center" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {students && students.length > 0 ? (
              students.map((student) => {
                const isActive = student.is_active !== false;
                const hasFace = Boolean(student.face_registered || student.profile_photo);
                const rollDisplay = student.roll_no || student.student_id || `#${student.id}`;
                const hasAlternateId = student.roll_no && student.student_id && student.roll_no !== student.student_id;

                return (
                  <tr key={student.id} style={{ opacity: isActive ? 1 : 0.72 }}>
                    {/* Roll No / ID */}
                    <td className="student-id-col">
                      <div className="roll-id-cell">
                        <span className="roll-no-badge" title={`Student Record #${student.id}`}>
                          {rollDisplay}
                        </span>
                        {hasAlternateId && (
                          <span className="student-sub-id" title="Institutional Student ID">
                            {student.student_id}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Student Avatar & Name */}
                    <td>
                      <div className="student-name-container">
                        <div className="avatar-circle-wrapper">
                          <div className="avatar-circle">
                            {student.profile_photo ? (
                              <img
                                src={student.profile_photo}
                                alt={student.name}
                                className="avatar-img"
                              />
                            ) : (
                              <span>{student.name ? student.name[0].toUpperCase() : "S"}</span>
                            )}
                          </div>
                          <span
                            className={`status-dot ${isActive ? "active" : "inactive"}`}
                            title={isActive ? "Active Enrollment" : "Deactivated Enrollment"}
                          ></span>
                        </div>
                        <div className="student-info-meta">
                          <span className="student-display-name">{student.name}</span>
                          <span className="student-meta-id">
                            ID: {student.student_id || student.id}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Branch */}
                    <td>
                      <span className={`badge-branch ${getBranchClass(student.branch)}`}>
                        {student.branch || "General"}
                      </span>
                    </td>

                    {/* Academic Class (Year, Sem, Sec) */}
                    <td>
                      <div className="academic-badge">
                        <span className="academic-year-tag">Year {student.year || "1"}</span>
                        <span className="academic-sem-sec">
                          Sem {student.semester || "1"} • Sec {student.section || "A"}
                        </span>
                      </div>
                    </td>

                    {/* Contact Details (Stacked Email & Phone) */}
                    <td>
                      <div className="contact-info-cell">
                        <div className="contact-line email" title={student.email || "No email"}>
                          <i className="fa-regular fa-envelope"></i>
                          <span>{student.email || "—"}</span>
                        </div>
                        <div className="contact-line phone" title={student.phone || "No phone"}>
                          <i className="fa-solid fa-phone"></i>
                          <span>{student.phone || "—"}</span>
                        </div>
                      </div>
                    </td>

                    {/* Biometrics Status */}
                    <td>
                      <span className={`badge-face ${hasFace ? "registered" : "pending"}`}>
                        <i className={`fa-solid ${hasFace ? "fa-shield-halved" : "fa-triangle-exclamation"}`}></i>
                        {hasFace ? "Verified" : "Pending"}
                      </span>
                    </td>

                    {/* Enrollment Status */}
                    <td>
                      <span className={`badge-status ${isActive ? "active" : "inactive"}`}>
                        {isActive ? "● Active" : "○ Deactivated"}
                      </span>
                    </td>

                    {/* Action Buttons */}
                    <td style={{ textAlign: "center" }}>
                      <div className="action-buttons-cell">
                        {onRegisterFace && (
                          <button
                            type="button"
                            className="tbl-action-btn face-btn"
                            onClick={() => onRegisterFace(student)}
                            title="Register or update facial biometrics photo"
                          >
                            <i className="fa-solid fa-camera"></i>
                            <span className="btn-text">Face</span>
                          </button>
                        )}

                        {onSendCredentials && (
                          <button
                            type="button"
                            className={`tbl-action-btn send-id-btn ${sendingStudentId === student.id ? "loading" : ""}`}
                            disabled={sendingStudentId === student.id || !student.email}
                            onClick={() => onSendCredentials(student)}
                            title={
                              student.email
                                ? `Send Student ID (${student.student_id || student.roll_no}) & login guide to ${student.email}`
                                : "No registered email address for this student"
                            }
                          >
                            {sendingStudentId === student.id ? (
                              <>
                                <i className="fa-solid fa-spinner fa-spin"></i>
                                <span className="btn-text">Sending...</span>
                              </>
                            ) : (
                              <>
                                <i className="fa-solid fa-paper-plane"></i>
                                <span className="btn-text">Send ID</span>
                              </>
                            )}
                          </button>
                        )}

                        <button
                          type="button"
                          className="tbl-action-btn edit-btn"
                          onClick={() => onEdit(student)}
                          title="Edit student details"
                        >
                          <i className="fa-solid fa-pen-to-square"></i>
                          <span className="btn-text">Edit</span>
                        </button>

                        {isActive ? (
                          <button
                            type="button"
                            className="tbl-action-btn deactivate-btn"
                            onClick={() => onDeactivate(student.id, student.name)}
                            title="Soft-delete / Deactivate student account"
                          >
                            <i className="fa-solid fa-user-slash"></i>
                            <span className="btn-text">Deactivate</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="tbl-action-btn restore-btn"
                            onClick={() => onActivate(student.id, student.name)}
                            title="Restore student account to active"
                          >
                            <i className="fa-solid fa-user-check"></i>
                            <span className="btn-text">Restore</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="8">
                  <div className="table-empty-state">
                    <i className="fa-solid fa-users-slash"></i>
                    <h3>No Students Found</h3>
                    <p>No matching student records found. Try adjusting your search query or filters.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StudentTable;