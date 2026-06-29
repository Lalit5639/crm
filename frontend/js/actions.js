function encodeRow(row) {
  return encodeURIComponent(JSON.stringify(row)).replace(/'/g, "%27");
}

function decodeRow(encoded) {
  return JSON.parse(decodeURIComponent(encoded));
}

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN");
}

function fillYearOptions(selectElement, label = "All Years") {
  if (!selectElement) return;
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  selectElement.innerHTML = `<option value="">${label}</option>` + years.map((year) => `<option value="${year}">${year}</option>`).join("");
}

function dateParts(value) {
  if (!value) return {};
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return { year: match[1], month: match[2], date: `${match[1]}-${match[2]}-${match[3]}` };
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return {};
  const year = String(parsedDate.getFullYear());
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  return { year, month, date: `${year}-${month}-${day}` };
}

function filterRowsByDate(rows, fieldName, filters = {}) {
  const monthValue = document.getElementById(filters.monthId || "monthFilter")?.value || "";
  const yearValue = document.getElementById(filters.yearId || "yearFilter")?.value || "";
  const dateValue = document.getElementById(filters.dateId || "dateFilter")?.value || "";

  if (!monthValue && !yearValue && !dateValue) return rows;

  return rows.filter((row) => {
    const parts = dateParts(row[fieldName]);
    return (!dateValue || parts.date === dateValue) &&
      (!monthValue || parts.month === monthValue) &&
      (!yearValue || parts.year === yearValue);
  });
}

function sendWhatsAppMessage(mobile, message) {
  if (!mobile) {
    showApiStatus("Mobile number not available for this entry.", "info");
    return;
  }

  const cleanMobile = mobile.startsWith("91") ? mobile : `91${mobile}`;
  const url = `https://wa.me/${cleanMobile}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
}

function printSectionById(sectionId, title = document.title) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  printHtml(section.outerHTML, title, sectionId);
}

function printHtml(html, title, sectionId = "") {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    showApiStatus("Please allow popups to use print preview.", "info");
    return;
  }

  const isLedgerInvoice = sectionId === "ledgerInvoice";

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        @page { size: A4 ${isLedgerInvoice ? "landscape" : "portrait"}; margin: ${isLedgerInvoice ? "8mm" : "12mm"}; }
        * { box-sizing: border-box; }
        html {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        body {
          margin: 0;
          background: #fff;
          color: #031833;
          font-family: Arial, sans-serif;
          font-size: ${isLedgerInvoice ? "10px" : "12px"};
          line-height: 1.35;
        }
        .print-document {
          width: 100%;
          padding: ${isLedgerInvoice ? "0" : "16px"};
        }
        .print-title {
          margin: 0 0 14px;
          color: #031833;
          font-size: 18px;
        }
        .no-print { display: none !important; }
        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        thead {
          display: table-header-group;
        }
        tr {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        th,
        td {
          border: 1px solid #cfd8e3;
          padding: 6px;
          text-align: left;
          vertical-align: top;
          word-break: break-word;
        }
        th {
          background: #0f7358;
          color: #fff;
          font-weight: 700;
          text-transform: uppercase;
        }
        #ledgerInvoice {
          overflow: visible !important;
          border: 0;
          border-radius: 0;
          background: #fff;
          box-shadow: none;
          padding: 0;
        }
        #ledgerInvoice .mb-6 { margin-bottom: 16px; }
        #ledgerInvoice .mb-5 { margin-bottom: 14px; }
        #ledgerInvoice .mt-1 { margin-top: 4px; }
        #ledgerInvoice .mt-2 { margin-top: 6px; }
        #ledgerInvoice .p-4 { padding: 12px; }
        #ledgerInvoice .p-5 { padding: 0; }
        #ledgerInvoice .p-2 { padding: 6px; }
        #ledgerInvoice .pb-5 { padding-bottom: 14px; }
        #ledgerInvoice .border,
        #ledgerInvoice .border-b {
          border-color: #dbe3ec;
        }
        #ledgerInvoice .border {
          border: 1px solid #dbe3ec;
        }
        #ledgerInvoice .border-b {
          border-bottom: 1px solid #dbe3ec;
        }
        #ledgerInvoice .rounded-lg {
          border-radius: 8px;
        }
        #ledgerInvoice .flex {
          display: flex;
        }
        #ledgerInvoice .grid {
          display: grid;
        }
        #ledgerInvoice .gap-3 {
          gap: 12px;
        }
        #ledgerInvoice .gap-4 {
          gap: 14px;
        }
        #ledgerInvoice .items-start {
          align-items: flex-start;
        }
        #ledgerInvoice .justify-between {
          justify-content: space-between;
        }
        #ledgerInvoice .sm\\:flex-row {
          flex-direction: row;
        }
        #ledgerInvoice .md\\:grid-cols-2 {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        #ledgerInvoice .md\\:text-right,
        #ledgerInvoice .sm\\:text-right {
          text-align: right;
        }
        #ledgerInvoice .uppercase {
          text-transform: uppercase;
        }
        #ledgerInvoice .font-semibold {
          font-weight: 700;
        }
        #ledgerInvoice .font-bold {
          font-weight: 800;
        }
        #ledgerInvoice .text-xs {
          font-size: 10px;
        }
        #ledgerInvoice .text-sm {
          font-size: 11px;
        }
        #ledgerInvoice .text-lg {
          font-size: 15px;
        }
        #ledgerInvoice .text-xl {
          font-size: 17px;
        }
        #ledgerInvoice .text-2xl {
          font-size: 21px;
        }
        #ledgerInvoice .text-gray-500,
        #ledgerInvoice .text-gray-600 {
          color: #475569;
        }
        #ledgerInvoice .text-gray-800,
        #ledgerInvoice .text-gray-900 {
          color: #031833;
        }
        #ledgerInvoice .text-green-700 {
          color: #007a3d;
        }
        #ledgerInvoice .text-red-700 {
          color: #bd0000;
        }
        #ledgerInvoice .bg-green-700 {
          background: #0f7358;
        }
        #ledgerInvoice h2,
        #ledgerInvoice h3,
        #ledgerInvoice p {
          margin-bottom: 0;
        }
        #ledgerInvoice .overflow-x-auto {
          overflow: visible;
        }
        #ledgerInvoice table {
          min-width: 0 !important;
          font-size: 9px;
        }
        #ledgerInvoice th:nth-child(1), #ledgerInvoice td:nth-child(1) { width: 8%; }
        #ledgerInvoice th:nth-child(2), #ledgerInvoice td:nth-child(2) { width: 7%; }
        #ledgerInvoice th:nth-child(3), #ledgerInvoice td:nth-child(3) { width: 6%; }
        #ledgerInvoice th:nth-child(4), #ledgerInvoice td:nth-child(4) { width: 15%; }
        #ledgerInvoice th:nth-child(5), #ledgerInvoice td:nth-child(5) { width: 5%; }
        #ledgerInvoice th:nth-child(6), #ledgerInvoice td:nth-child(6) { width: 8%; }
        #ledgerInvoice th:nth-child(7), #ledgerInvoice td:nth-child(7) { width: 15%; }
        #ledgerInvoice th:nth-child(8), #ledgerInvoice td:nth-child(8) { width: 9%; }
        #ledgerInvoice th:nth-child(9), #ledgerInvoice td:nth-child(9) { width: 8%; }
        #ledgerInvoice th:nth-child(10), #ledgerInvoice td:nth-child(10) { width: 10%; }
        #ledgerInvoice th:nth-child(11), #ledgerInvoice td:nth-child(11) { width: 9%; }
      </style>
    </head>
    <body>
      <main class="print-document">
        ${isLedgerInvoice ? "" : `<h2 class="print-title">${title}</h2>`}
        ${html}
      </main>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 300);
}

async function deleteEntry(apiPath, id, reloadFn, label = "entry") {
  if (!id) return;

  if (!confirm(`Delete this ${label}?`)) {
    return;
  }

  try {
    const data = await apiFetch(`${apiPath}/${id}`, { method: "DELETE" });
    if (data.success) {
      showApiStatus(`${label.charAt(0).toUpperCase()}${label.slice(1)} deleted successfully.`, "success");
      if (typeof reloadFn === "function") {
        await reloadFn();
      }
    }
  } catch (err) {
  }
}

function deleteButton(apiPath, id, reloadFnName, label = "entry") {
  return `<button onclick="deleteEntry('${apiPath}', ${id}, ${reloadFnName}, '${label}')" class="rounded bg-red-600 px-2 py-1 text-xs text-white no-print">Delete</button>`;
}
