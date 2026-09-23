import React from "react";

const Pagination = ({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 20,
  onPageChange,
  onPageSizeChange = null,
  pageSizeOptions = [10, 20, 50, 100],
  isLoading = false,
}) => {
  const startItem = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "12px",
        marginTop: "16px",
        paddingTop: "16px",
        borderTop: "1px solid #e2e8f0",
      }}
    >
      <div style={{ fontSize: "13px", color: "#64748b" }}>
        Showing <strong>{startItem} - {endItem}</strong> of <strong>{totalItems}</strong> entries
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {onPageSizeChange && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              style={{
                padding: "4px 8px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "12px",
                background: "#fff",
              }}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: "flex", gap: "6px" }}>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1 || isLoading}
            style={{
              padding: "6px 12px",
              background: currentPage <= 1 ? "#f1f5f9" : "#fff",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 600,
              color: currentPage <= 1 ? "#94a3b8" : "#1e293b",
              cursor: currentPage <= 1 ? "not-allowed" : "pointer",
            }}
          >
            Previous
          </button>

          <div
            style={{
              padding: "6px 12px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 600,
              color: "#334155",
            }}
          >
            Page {currentPage} of {totalPages || 1}
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || isLoading}
            style={{
              padding: "6px 12px",
              background: currentPage >= totalPages ? "#f1f5f9" : "#fff",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 600,
              color: currentPage >= totalPages ? "#94a3b8" : "#1e293b",
              cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default Pagination;
