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
  printHtml(section.innerHTML, title);
}

function printHtml(html, title) {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    showApiStatus("Please allow popups to use print preview.", "info");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
        h1, h2, h3 { margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        .no-print { display: none !important; }
      </style>
    </head>
    <body>
      <h2>${title}</h2>
      ${html}
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
