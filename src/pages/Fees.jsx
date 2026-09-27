import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import "../styles/fees.css";
import {
  getFeeStats,
  getStudentFeeRecords,
  recordFeePayment,
  clearExamFeeDues,
  sendFeeReminder,
  bulkGenerateCohortFees,
  getFeeReceipt,
  getFeeCategories,
  getFeeUpiConfig,
  updateFeeUpiConfig,
} from "../services/studentservice";
import {
  FaMoneyBillWave,
  FaReceipt,
  FaCheckCircle,
  FaExclamationTriangle,
  FaSearch,
  FaPaperPlane,
  FaPrint,
  FaPlus,
  FaHistory,
  FaCreditCard,
  FaLock,
  FaUnlock,
  FaTimes,
  FaSync,
  FaCheck,
  FaBuilding,
  FaUserGraduate,
  FaQrcode,
  FaMobileAlt,
} from "react-icons/fa";

function Fees() {
  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedBranch, setSelectedBranch] = useState("ALL");
  const [selectedYear, setSelectedYear] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyDues, setOnlyDues] = useState(false);

  // Modals & Action States
  const [paymentModalRecord, setPaymentModalRecord] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("UPI");
  const [payRef, setPayRef] = useState("");
  const [payRemarks, setPayRemarks] = useState("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const [receiptModalData, setReceiptModalData] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkAcadYear, setBulkAcadYear] = useState("2025-2026");
  const [bulkBranch, setBulkBranch] = useState("ALL");
  const [bulkYear, setBulkYear] = useState(1);
  const [bulkSem, setBulkSem] = useState(1);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkAmount, setBulkAmount] = useState("");
  const [bulkDueDate, setBulkDueDate] = useState("");
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);

  // PhonePe UPI Admin Config States
  const [upiModalOpen, setUpiModalOpen] = useState(false);
  const [upiId, setUpiId] = useState("bursar.spec@ybl");
  const [payeeName, setPayeeName] = useState("St. Peter's Engineering College Accounts");
  const [upiInstructions, setUpiInstructions] = useState("");
  const [customQrImage, setCustomQrImage] = useState("");
  const [isSavingUpi, setIsSavingUpi] = useState(false);

  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const loadUpiConfig = () => {
    getFeeUpiConfig()
      .then((res) => {
        if (res.data) {
          setUpiId(res.data.upi_id || "bursar.spec@ybl");
          setPayeeName(res.data.payee_name || "St. Peter's Engineering College Accounts");
          setUpiInstructions(res.data.instructions || "");
          setCustomQrImage(res.data.custom_qr_image || "");
        }
      })
      .catch(() => {});
  };

  const handleSaveUpiConfig = async (e) => {
    if (e) e.preventDefault();
    setIsSavingUpi(true);
    try {
      await updateFeeUpiConfig({
        upi_id: upiId.trim(),
        payee_name: payeeName.trim(),
        instructions: upiInstructions.trim(),
        custom_qr_image: customQrImage || "",
      });
      setStatusMessage(`PhonePe UPI settings updated successfully! Students will now pay using this QR & VPA.`);
      setUpiModalOpen(false);
    } catch (err) {
      alert("Failed to update UPI settings: " + (err.response?.data?.detail || err.message));
    } finally {
      setIsSavingUpi(false);
    }
  };

  const loadData = () => {
    setLoading(true);
    loadUpiConfig();
    Promise.all([
      getFeeStats(),
      getFeeCategories(),
      getStudentFeeRecords({
        branch: selectedBranch !== "ALL" ? selectedBranch : undefined,
        year: selectedYear !== "ALL" ? selectedYear : undefined,
        status: selectedStatus !== "ALL" ? selectedStatus : undefined,
        category: selectedCategory !== "ALL" ? selectedCategory : undefined,
        q: searchQuery.trim() || undefined,
        has_dues: onlyDues ? "true" : undefined,
      }),
    ])
      .then(([statsRes, catRes, recRes]) => {
        setStats(statsRes.data);
        const cats = catRes.data || [];
        setCategories(cats);
        if (cats.length > 0 && !bulkCategory) {
          setBulkCategory(String(cats[0].id));
        }
        setRecords(recRes.data || []);
      })
      .catch((err) => {
        console.error("Failed to load fee management data:", err);
        setErrorMessage("Could not load fee records from database.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, [selectedBranch, selectedYear, selectedStatus, selectedCategory, onlyDues]);

  // Handle Search submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadData();
  };

  // Open Payment Modal
  const openPaymentModal = (record) => {
    setPaymentModalRecord(record);
    setPayAmount(String(record.balance_due || ""));
    setPayMethod("UPI");
    setPayRef(`UPI-${Date.now().toString().slice(-6)}`);
    setPayRemarks("Semester fee payment");
  };

  // Submit Payment
  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!paymentModalRecord || !payAmount) return;

    setIsSubmittingPayment(true);
    try {
      const res = await recordFeePayment({
        fee_record_id: paymentModalRecord.id,
        amount_paid: parseFloat(payAmount),
        payment_method: payMethod,
        transaction_reference: payRef.trim(),
        remarks: payRemarks.trim(),
      });

      setStatusMessage(`✓ Payment of ₹${payAmount} recorded successfully! Receipt No: ${res.data.receipt_number}`);
      setPaymentModalRecord(null);
      loadData();

      // Open receipt automatically
      if (res.data.receipt_number) {
        handleViewReceipt(res.data.receipt_number);
      }
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to process fee payment.");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Toggle No-Dues Clearance for Exam Hall Tickets
  const handleToggleClearance = async (record) => {
    setActionLoadingId(record.id);
    try {
      const newStatus = !record.is_cleared_for_exam;
      await clearExamFeeDues(record.id, {
        is_cleared: newStatus,
        remarks: newStatus ? "No-Dues Clearance approved by Accounts Office" : "Clearance revoked due to unpaid dues",
      });
      setStatusMessage(`✓ Exam fee clearance ${newStatus ? "GRANTED (No-Dues)" : "REVOKED"} for ${record.student_name}.`);
      loadData();
    } catch (err) {
      alert("Failed to update clearance status.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Dispatch Fee Reminder Notice
  const handleSendReminder = async (record) => {
    setActionLoadingId(`remind-${record.id}`);
    try {
      const res = await sendFeeReminder({ fee_record_id: record.id });
      setStatusMessage(`✓ Official fee reminder email dispatched to ${record.student_name} and parent!`);
    } catch (err) {
      alert("Failed to send reminder.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // View & Print Receipt
  const handleViewReceipt = (receiptNumber) => {
    setReceiptLoading(true);
    getFeeReceipt(receiptNumber)
      .then((res) => {
        setReceiptModalData(res.data);
      })
      .catch(() => {
        alert("Could not load receipt details.");
      })
      .finally(() => {
        setReceiptLoading(false);
      });
  };

  // Bulk Generate Semester Invoices
  const handleBulkGenerate = async (e) => {
    e.preventDefault();
    if (!bulkCategory || !bulkAmount) return;

    setIsGeneratingBulk(true);
    try {
      const res = await bulkGenerateCohortFees({
        academic_year: bulkAcadYear,
        branch: bulkBranch,
        year: parseInt(bulkYear, 10),
        semester: parseInt(bulkSem, 10),
        fee_category_id: parseInt(bulkCategory, 10),
        amount: parseFloat(bulkAmount),
        due_date: bulkDueDate || null,
      });

      setStatusMessage(`✓ ${res.data.message}`);
      setBulkModalOpen(false);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to generate invoices.");
    } finally {
      setIsGeneratingBulk(false);
    }
  };

  return (
    <div className="sideandmain">
      <div className="Sidebarindashboard">
        <Sidebar />
      </div>

      <div className="main-content">
        <Navbar />

        <div className="fees-page-content">
          {/* Header Row */}
          <div className="fees-header-row">
            <div>
              <h2 className="fees-title">
                <FaMoneyBillWave style={{ color: "#10b981" }} />
                Fee Management &amp; Dues Clearance System
              </h2>
              <p className="fees-subtitle">
                Institutional fee ledger, payment collections, digital receipts, and examination hall ticket clearance locks
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="action-btn"
                style={{
                  background: "#0f172a",
                  color: "#ffffff",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 16px",
                  borderRadius: "8px",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
                onClick={() => setBulkModalOpen(true)}
              >
                <FaPlus /> Generate Semester Invoices
              </button>

              <button
                type="button"
                className="action-btn"
                style={{
                  background: "linear-gradient(135deg, #5f259f 0%, #3f156d 100%)",
                  color: "#ffffff",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 16px",
                  borderRadius: "8px",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(95, 37, 159, 0.25)",
                }}
                onClick={() => setUpiModalOpen(true)}
              >
                <FaQrcode /> PhonePe UPI Settings
              </button>

              <button
                type="button"
                className="action-btn"
                style={{
                  background: "#f1f5f9",
                  color: "#334155",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
                onClick={loadData}
                title="Refresh fee records"
              >
                <FaSync />
              </button>
            </div>
          </div>

          {/* Flash Feedback Messages */}
          {statusMessage && (
            <div style={{ background: "#dcfce7", color: "#166534", padding: "12px 18px", borderRadius: "10px", marginBottom: "18px", borderLeft: "4px solid #16a34a", fontSize: "13.5px", fontWeight: 500, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{statusMessage}</span>
              <button type="button" onClick={() => setStatusMessage(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#166534" }}>✕</button>
            </div>
          )}

          {errorMessage && (
            <div style={{ background: "#fee2e2", color: "#991b1b", padding: "12px 18px", borderRadius: "10px", marginBottom: "18px", borderLeft: "4px solid #dc2626", fontSize: "13.5px", fontWeight: 500 }}>
              {errorMessage}
            </div>
          )}

          {/* Executive Analytics Stats Cards */}
          {stats && (
            <div className="fees-stats-grid">
              <div className="fee-stat-card">
                <span className="fee-stat-label">Total Expected Revenue</span>
                <div className="fee-stat-value">₹{stats.total_billed?.toLocaleString()}</div>
                <span className="fee-stat-sub">Across {stats.total_accounts} billed student accounts</span>
              </div>

              <div className="fee-stat-card collected">
                <span className="fee-stat-label" style={{ color: "#15803d" }}>Collected Revenue</span>
                <div className="fee-stat-value" style={{ color: "#16a34a" }}>₹{stats.total_collected?.toLocaleString()}</div>
                <span className="fee-stat-sub" style={{ color: "#15803d" }}>Cleared &amp; verified in bank/cash</span>
              </div>

              <div className="fee-stat-card outstanding">
                <span className="fee-stat-label" style={{ color: "#b91c1c" }}>Outstanding Dues</span>
                <div className="fee-stat-value" style={{ color: "#dc2626" }}>₹{stats.total_outstanding?.toLocaleString()}</div>
                <span className="fee-stat-sub" style={{ color: "#b91c1c" }}>
                  <strong>{stats.total_defaulters_count}</strong> students with pending dues
                </span>
              </div>

              <div className="fee-stat-card rate">
                <span className="fee-stat-label" style={{ color: "#1d4ed8" }}>Collection Rate</span>
                <div className="fee-stat-value" style={{ color: "#2563eb" }}>{stats.collection_rate}%</div>
                <div style={{ background: "#e2e8f0", height: "6px", borderRadius: "4px", overflow: "hidden", marginTop: "4px" }}>
                  <div style={{ width: `${Math.min(100, stats.collection_rate)}%`, height: "100%", background: "#2563eb" }}></div>
                </div>
              </div>
            </div>
          )}

          {/* Control & Filter Bar */}
          <div className="fees-control-bar">
            <form onSubmit={handleSearchSubmit} className="fee-search-box">
              <FaSearch className="fee-search-icon" />
              <input
                type="text"
                placeholder="Search student by name, roll no, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="fee-search-input"
              />
            </form>

            <div className="fees-filters-group">
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="fee-select"
              >
                <option value="ALL">All Departments</option>
                <option value="CSE">CSE</option>
                <option value="AIML">AIML</option>
                <option value="IT">IT</option>
                <option value="ECE">ECE</option>
                <option value="MECH">MECH</option>
                <option value="CIVIL">CIVIL</option>
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="fee-select"
              >
                <option value="ALL">All Years</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="fee-select"
              >
                <option value="ALL">All Statuses</option>
                <option value="PAID">Fully Paid</option>
                <option value="PARTIAL">Partially Paid</option>
                <option value="PENDING">Pending</option>
                <option value="OVERDUE">Overdue</option>
              </select>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="fee-select"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "#475569", cursor: "pointer", marginLeft: "6px" }}>
                <input
                  type="checkbox"
                  checked={onlyDues}
                  onChange={(e) => setOnlyDues(e.target.checked)}
                />
                <span>Only Dues &gt; ₹0</span>
              </label>
            </div>
          </div>

          {/* Student Fee Records Table */}
          <div className="fees-table-card">
            {loading ? (
              <div style={{ padding: "50px", textAlign: "center", color: "#64748b" }}>
                <i className="fa-solid fa-spinner fa-spin"></i> Loading institutional fee accounts...
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="modern-fee-table">
                  <thead>
                    <tr>
                      <th style={{ width: "18%" }}>Student Details</th>
                      <th style={{ width: "14%" }}>Cohort</th>
                      <th style={{ width: "16%" }}>Fee Category</th>
                      <th style={{ width: "14%" }}>Net Fee vs Paid</th>
                      <th style={{ width: "12%" }}>Balance Due</th>
                      <th style={{ width: "10%" }}>Status</th>
                      <th style={{ width: "12%" }}>Exam Clearance</th>
                      <th style={{ width: "14%", textAlign: "center" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.length > 0 ? (
                      records.map((rec) => {
                        const balance = parseFloat(rec.balance_due);
                        const isCleared = rec.is_cleared_for_exam;
                        const hasDues = balance > 0;

                        return (
                          <tr key={rec.id}>
                            <td>
                              <strong>{rec.student_name}</strong>
                              <div style={{ fontSize: "11.5px", color: "#64748b" }}>
                                {rec.student_roll_no}
                              </div>
                            </td>
                            <td>
                              <span style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", fontSize: "12px", fontWeight: 600 }}>
                                {rec.student_branch} Y{rec.year}S{rec.semester}-{rec.student_section || "A"}
                              </span>
                            </td>
                            <td>
                              <div><strong>{rec.category_name}</strong></div>
                              {rec.is_mandatory_for_exam && (
                                <span style={{ fontSize: "10.5px", color: "#dc2626", fontWeight: 600 }}>
                                  * Required for Exam
                                </span>
                              )}
                            </td>
                            <td>
                              <div>₹{parseFloat(rec.paid_amount).toLocaleString()} / ₹{parseFloat(rec.net_amount).toLocaleString()}</div>
                              {parseFloat(rec.discount_amount) > 0 && (
                                <span style={{ fontSize: "10.5px", color: "#059669" }}>
                                  (₹{parseFloat(rec.discount_amount).toLocaleString()} Scholarship)
                                </span>
                              )}
                            </td>
                            <td>
                              <strong style={{ color: hasDues ? "#dc2626" : "#059669", fontSize: "14px" }}>
                                ₹{balance.toLocaleString()}
                              </strong>
                              {rec.due_date && (
                                <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                                  Due: {rec.due_date}
                                </div>
                              )}
                            </td>
                            <td>
                              <span className={`fee-status-pill ${rec.status.toLowerCase()}`}>
                                {rec.status === "PAID" && "✓ Paid"}
                                {rec.status === "PARTIAL" && "⏳ Partial"}
                                {rec.status === "PENDING" && "⚠️ Pending"}
                                {rec.status === "OVERDUE" && "🚨 Overdue"}
                              </span>
                            </td>
                            <td>
                              {isCleared ? (
                                <span className="clearance-pill cleared" title="No Dues - Permitted to write examinations">
                                  <FaCheck /> Cleared (No-Dues)
                                </span>
                              ) : (
                                <span className="clearance-pill debarred" title="Locked - Outstanding fee balance">
                                  <FaLock /> Debarred (Dues)
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
                                {hasDues && (
                                  <button
                                    type="button"
                                    className="fee-action-btn pay-btn"
                                    onClick={() => openPaymentModal(rec)}
                                    title="Collect fee payment (UPI / Cash / Bank)"
                                  >
                                    <FaCreditCard /> Collect
                                  </button>
                                )}

                                <button
                                  type="button"
                                  className="fee-action-btn clear-btn"
                                  onClick={() => handleToggleClearance(rec)}
                                  disabled={actionLoadingId === rec.id}
                                  title={isCleared ? "Revoke clearance" : "Issue No-Dues clearance for exam"}
                                >
                                  {isCleared ? <FaLock /> : <FaUnlock />}
                                  {isCleared ? "Revoke" : "Clear Dues"}
                                </button>

                                {hasDues && (
                                  <button
                                    type="button"
                                    className="fee-action-btn remind-btn"
                                    onClick={() => handleSendReminder(rec)}
                                    disabled={actionLoadingId === `remind-${rec.id}`}
                                    title="Send formal fee dues notice to student & parent email"
                                  >
                                    <FaPaperPlane /> Remind
                                  </button>
                                )}

                                {rec.payments && rec.payments.length > 0 && (
                                  <button
                                    type="button"
                                    className="fee-action-btn receipt-btn"
                                    onClick={() => handleViewReceipt(rec.payments[rec.payments.length - 1].receipt_number)}
                                    title="View & Print Official Digital Receipt"
                                  >
                                    <FaReceipt /> Receipt
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="8" style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                          No fee records found matching selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* MODAL 1: RECORD FEE PAYMENT                               */}
          {/* ========================================================= */}
          {paymentModalRecord && (
            <div className="att-modal-overlay" onClick={() => setPaymentModalRecord(null)}>
              <div className="att-alert-modal-card" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
                <div className="att-alert-modal-header" style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "17px", color: "#ffffff", display: "flex", alignItems: "center", gap: "8px" }}>
                      <FaCreditCard style={{ color: "#60a5fa" }} />
                      Collect Fee Payment
                    </h3>
                    <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#93c5fd" }}>
                      Record payment &amp; issue official digital receipt
                    </p>
                  </div>
                  <button type="button" className="att-modal-close-btn" onClick={() => setPaymentModalRecord(null)}>✕</button>
                </div>

                <form onSubmit={handleRecordPayment} style={{ padding: "24px" }}>
                  {/* Student & Fee details summary */}
                  <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "18px", fontSize: "13px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "#64748b" }}>Student:</span>
                      <strong>{paymentModalRecord.student_name} ({paymentModalRecord.student_roll_no})</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "#64748b" }}>Category:</span>
                      <strong>{paymentModalRecord.category_name}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#64748b" }}>Current Balance Due:</span>
                      <strong style={{ color: "#dc2626", fontSize: "15px" }}>₹{parseFloat(paymentModalRecord.balance_due).toLocaleString()}</strong>
                    </div>
                  </div>

                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <label style={{ fontSize: "12.5px", fontWeight: 600, color: "#334155" }}>
                        Payment Amount (₹): *
                      </label>
                      <button
                        type="button"
                        onClick={() => setPayAmount(String(paymentModalRecord.balance_due))}
                        style={{ background: "none", border: "none", color: "#2563eb", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}
                      >
                        Pay Full Balance
                      </button>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min="1"
                      max={paymentModalRecord.balance_due}
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", fontWeight: 700 }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        Payment Mode:
                      </label>
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value)}
                        style={{ width: "100%", padding: "9px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                      >
                        <option value="UPI">UPI / QR Code</option>
                        <option value="NET_BANKING">Internet Banking / NEFT</option>
                        <option value="CARD">Debit / Credit Card</option>
                        <option value="CASH">Cash Counter</option>
                        <option value="CHEQUE">Cheque / Demand Draft</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        Transaction / UTR Ref:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., UTR / Cheque No"
                        value={payRef}
                        onChange={(e) => setPayRef(e.target.value)}
                        style={{ width: "100%", padding: "9px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Remarks:
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Installment 1 / Paid via PhonePe"
                      value={payRemarks}
                      onChange={(e) => setPayRemarks(e.target.value)}
                      style={{ width: "100%", padding: "9px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingPayment}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "10px",
                      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      color: "#ffffff",
                      border: "none",
                      fontSize: "14px",
                      fontWeight: 700,
                      cursor: isSubmittingPayment ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
                    }}
                  >
                    <FaCheck />
                    {isSubmittingPayment ? "Processing..." : `Confirm Payment of ₹${payAmount || "0"} & Generate Receipt`}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MODAL 2: PRINTABLE OFFICIAL FEE RECEIPT                   */}
          {/* ========================================================= */}
          {receiptModalData && (
            <div className="att-modal-overlay" onClick={() => setReceiptModalData(null)}>
              <div style={{ position: "relative", maxWidth: "680px", width: "100%" }} onClick={(e) => e.stopPropagation()}>
                <div className="printable-receipt-wrap">
                  {/* Close button (hidden on print) */}
                  <div className="no-print" style={{ position: "absolute", top: "12px", right: "12px", display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      style={{
                        padding: "6px 14px",
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        fontWeight: 700,
                        fontSize: "12px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <FaPrint /> Print Receipt
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptModalData(null)}
                      style={{
                        background: "#e2e8f0",
                        color: "#0f172a",
                        border: "none",
                        borderRadius: "6px",
                        padding: "6px 10px",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Header */}
                  <div className="receipt-header">
                    <h1 className="receipt-inst-name">{receiptModalData.institution_name}</h1>
                    <p className="receipt-inst-sub">{receiptModalData.institution_sub}</p>
                    <p className="receipt-inst-sub">{receiptModalData.institution_address}</p>
                    <div className="receipt-badge-title">Official Fee Payment Receipt</div>
                  </div>

                  {/* Details Grid */}
                  <div className="receipt-grid-info">
                    <div>
                      <div><strong>Receipt Number:</strong> <span style={{ color: "#2563eb", fontWeight: 700 }}>{receiptModalData.receipt_number}</span></div>
                      <div><strong>Payment Date:</strong> {receiptModalData.payment_date}</div>
                      <div><strong>Payment Mode:</strong> {receiptModalData.payment_method}</div>
                      <div><strong>Reference:</strong> {receiptModalData.transaction_reference}</div>
                    </div>
                    <div>
                      <div><strong>Student Name:</strong> {receiptModalData.student.name}</div>
                      <div><strong>Roll Number:</strong> {receiptModalData.student.roll_no}</div>
                      <div><strong>Department:</strong> {receiptModalData.student.cohort}</div>
                      <div><strong>Email:</strong> {receiptModalData.student.email || "N/A"}</div>
                    </div>
                  </div>

                  {/* Itemized Table */}
                  <table className="receipt-items-table">
                    <thead>
                      <tr>
                        <th>Particulars / Category</th>
                        <th>Academic Term</th>
                        <th style={{ textAlign: "right" }}>Total Fee</th>
                        <th style={{ textAlign: "right" }}>Amount Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <strong>{receiptModalData.fee_details.category}</strong>
                          {receiptModalData.fee_details.discount_waiver > 0 && (
                            <div style={{ fontSize: "11px", color: "#059669" }}>
                              Includes ₹{receiptModalData.fee_details.discount_waiver.toLocaleString()} Scholarship Waiver
                            </div>
                          )}
                        </td>
                        <td>{receiptModalData.fee_details.academic_year} • {receiptModalData.fee_details.semester}</td>
                        <td style={{ textAlign: "right" }}>₹{receiptModalData.fee_details.net_payable.toLocaleString()}</td>
                        <td style={{ textAlign: "right", color: "#16a34a", fontWeight: 800 }}>
                          ₹{receiptModalData.fee_details.amount_paid_this_transaction.toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Settlement Summary */}
                  <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", marginBottom: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span>Cumulative Amount Paid to Date:</span>
                      <strong>₹{receiptModalData.fee_details.cumulative_paid_amount.toLocaleString()}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span>Remaining Balance Due:</span>
                      <strong style={{ color: receiptModalData.fee_details.remaining_balance_due > 0 ? "#dc2626" : "#059669" }}>
                        ₹{receiptModalData.fee_details.remaining_balance_due.toLocaleString()}
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Examination Clearance Status:</span>
                      <strong style={{ color: receiptModalData.fee_details.is_cleared_for_exam ? "#059669" : "#dc2626" }}>
                        {receiptModalData.fee_details.is_cleared_for_exam ? "Cleared for Semester Examinations ✅" : "Pending Balance ⚠️"}
                      </strong>
                    </div>
                  </div>

                  {/* Footer Stamp & Signatures */}
                  <div className="receipt-footer-stamp">
                    <div className="receipt-seal-box">
                      College Accounts Seal
                    </div>
                    <div className="receipt-signature-line">
                      <div style={{ borderBottom: "1px solid #94a3b8", width: "160px", marginBottom: "4px" }}></div>
                      <div>Authorized Accounts Signatory</div>
                      <div style={{ fontSize: "10.5px", color: "#64748b" }}>{receiptModalData.collected_by}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MODAL 3: BULK COHORT INVOICE GENERATOR                    */}
          {/* ========================================================= */}
          {bulkModalOpen && (
            <div className="att-modal-overlay" onClick={() => setBulkModalOpen(false)}>
              <div className="att-alert-modal-card" style={{ maxWidth: "540px" }} onClick={(e) => e.stopPropagation()}>
                <div className="att-alert-modal-header" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "17px", color: "#ffffff", display: "flex", alignItems: "center", gap: "8px" }}>
                      <FaBuilding style={{ color: "#38bdf8" }} />
                      Generate Semester Fee Invoices
                    </h3>
                    <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#94a3b8" }}>
                      Creates semester fee records for all active students in a cohort
                    </p>
                  </div>
                  <button type="button" className="att-modal-close-btn" onClick={() => setBulkModalOpen(false)}>✕</button>
                </div>

                <form onSubmit={handleBulkGenerate} style={{ padding: "24px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        Academic Year:
                      </label>
                      <input
                        type="text"
                        value={bulkAcadYear}
                        onChange={(e) => setBulkAcadYear(e.target.value)}
                        style={{ width: "100%", padding: "9px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        Department / Branch:
                      </label>
                      <select
                        value={bulkBranch}
                        onChange={(e) => setBulkBranch(e.target.value)}
                        style={{ width: "100%", padding: "9px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                      >
                        <option value="ALL">All Departments</option>
                        <option value="CSE">CSE</option>
                        <option value="AIML">AIML</option>
                        <option value="IT">IT</option>
                        <option value="ECE">ECE</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        Year:
                      </label>
                      <select
                        value={bulkYear}
                        onChange={(e) => setBulkYear(e.target.value)}
                        style={{ width: "100%", padding: "9px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                      >
                        <option value="1">1st Year</option>
                        <option value="2">2nd Year</option>
                        <option value="3">3rd Year</option>
                        <option value="4">4th Year</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        Semester:
                      </label>
                      <select
                        value={bulkSem}
                        onChange={(e) => setBulkSem(e.target.value)}
                        style={{ width: "100%", padding: "9px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                      >
                        <option value="1">Semester 1</option>
                        <option value="2">Semester 2</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Fee Category: *
                    </label>
                    <select
                      value={bulkCategory}
                      onChange={(e) => setBulkCategory(e.target.value)}
                      style={{ width: "100%", padding: "9px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.is_mandatory_for_exam ? "(*Exam Mandatory)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        Fee Amount (₹): *
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 45000"
                        required
                        value={bulkAmount}
                        onChange={(e) => setBulkAmount(e.target.value)}
                        style={{ width: "100%", padding: "9px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", fontWeight: 700 }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                        Payment Due Date:
                      </label>
                      <input
                        type="date"
                        value={bulkDueDate}
                        onChange={(e) => setBulkDueDate(e.target.value)}
                        style={{ width: "100%", padding: "9px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isGeneratingBulk}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "10px",
                      background: "#0f172a",
                      color: "#ffffff",
                      border: "none",
                      fontSize: "14px",
                      fontWeight: 700,
                      cursor: isGeneratingBulk ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    <FaCheck />
                    {isGeneratingBulk ? "Generating Invoices..." : "Generate Invoices for Cohort"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* PhonePe UPI Configuration Modal */}
          {upiModalOpen && (
            <div
              className="fees-modal-overlay"
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(15, 23, 42, 0.7)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                padding: "16px",
              }}
            >
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "16px",
                  maxWidth: "500px",
                  width: "100%",
                  boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
                  overflow: "hidden",
                  border: "1px solid #cbd5e1",
                }}
              >
                <div
                  style={{
                    background: "linear-gradient(135deg, #5f259f 0%, #3f156d 100%)",
                    color: "#ffffff",
                    padding: "18px 24px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <FaQrcode style={{ fontSize: "20px" }} />
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
                      Configure PhonePe UPI for Student Fees
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUpiModalOpen(false)}
                    style={{
                      background: "rgba(255, 255, 255, 0.2)",
                      border: "none",
                      borderRadius: "50%",
                      width: "28px",
                      height: "28px",
                      color: "#ffffff",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveUpiConfig} style={{ padding: "24px" }}>
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#1e293b", marginBottom: "6px" }}>
                      Your PhonePe UPI ID (VPA): *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 9876543210@ybl or college@ybl"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "2px solid #5f259f",
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#0f172a",
                        boxSizing: "border-box",
                      }}
                    />
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                      Enter your PhonePe UPI ID (ends in @ybl, @ibl, or your bank). The QR code will dynamically direct payments to this VPA.
                    </div>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#1e293b", marginBottom: "6px" }}>
                      Payee Display Name: *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. St. Peter's Engineering College Accounts"
                      value={payeeName}
                      onChange={(e) => setPayeeName(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13.5px",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#1e293b", marginBottom: "6px" }}>
                      Upload Your PhonePe QR Code Image (Screenshot or Poster):
                    </label>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const img = new Image();
                              img.onload = () => {
                                const canvas = document.createElement("canvas");
                                const maxDim = 700;
                                let width = img.width;
                                let height = img.height;
                                if (width > maxDim || height > maxDim) {
                                  if (width > height) {
                                    height = Math.round((height * maxDim) / width);
                                    width = maxDim;
                                  } else {
                                    width = Math.round((width * maxDim) / height);
                                    height = maxDim;
                                  }
                                }
                                canvas.width = width;
                                canvas.height = height;
                                const ctx = canvas.getContext("2d");
                                ctx.drawImage(img, 0, 0, width, height);
                                const optimizedBase64 = canvas.toDataURL("image/jpeg", 0.92);
                                setCustomQrImage(optimizedBase64);
                              };
                              img.src = ev.target.result;
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        style={{
                          fontSize: "12px",
                          color: "#475569",
                        }}
                      />
                      {customQrImage && (
                        <button
                          type="button"
                          onClick={() => setCustomQrImage("")}
                          style={{
                            padding: "5px 10px",
                            background: "#fee2e2",
                            color: "#dc2626",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          ✕ Remove Uploaded Image
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                      Upload the screenshot or poster of your PhonePe QR code from your phone. If uploaded, students will see your exact QR image!
                    </div>
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#1e293b", marginBottom: "6px" }}>
                      Payment Instructions for Students:
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Instructions shown to students when scanning..."
                      value={upiInstructions}
                      onChange={(e) => setUpiInstructions(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        boxSizing: "border-box",
                        resize: "vertical",
                      }}
                    />
                  </div>

                  {/* QR Preview Section */}
                  <div
                    style={{
                      textAlign: "center",
                      marginBottom: "20px",
                      padding: "14px",
                      background: "#f8fafc",
                      borderRadius: "10px",
                      border: "1px dashed #cbd5e1",
                    }}
                  >
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      {customQrImage ? "Your Uploaded PhonePe QR Poster" : "Dynamic PhonePe QR Preview"}
                    </div>

                    <div
                      style={{
                        display: "inline-block",
                        background: "#ffffff",
                        padding: "10px",
                        borderRadius: "10px",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      {customQrImage ? (
                        <img
                          src={customQrImage}
                          alt="Custom PhonePe QR"
                          style={{
                            maxWidth: "180px",
                            maxHeight: "180px",
                            objectFit: "contain",
                            display: "block",
                            borderRadius: "6px",
                          }}
                        />
                      ) : upiId ? (
                        <QRCodeSVG
                          value={`upi://pay?pa=${encodeURIComponent(upiId.trim())}&pn=${encodeURIComponent(payeeName.trim() || 'College Fee Counter')}&cu=INR`}
                          size={120}
                          level="M"
                        />
                      ) : null}
                    </div>

                    <div style={{ fontSize: "11.5px", color: "#5f259f", fontWeight: 600, marginTop: "8px" }}>
                      {customQrImage
                        ? "Students will scan your uploaded PhonePe QR poster"
                        : <span>Scans will direct to: <strong>{upiId}</strong></span>}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setUpiModalOpen(false)}
                      style={{
                        flex: 1,
                        padding: "11px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        background: "#f8fafc",
                        color: "#475569",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingUpi}
                      style={{
                        flex: 2,
                        padding: "11px",
                        borderRadius: "8px",
                        border: "none",
                        background: "linear-gradient(135deg, #5f259f 0%, #3f156d 100%)",
                        color: "#ffffff",
                        fontWeight: 700,
                        fontSize: "13px",
                        cursor: isSavingUpi ? "not-allowed" : "pointer",
                      }}
                    >
                      {isSavingUpi ? "Saving..." : "Save UPI Settings"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Fees;
