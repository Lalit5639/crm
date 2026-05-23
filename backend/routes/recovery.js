const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { resolveColumn } = require("../utils/schema");

function buildOrderFilter(month, year, date) {
  const filters = ["o.outstanding > 0"];
  const params = [];

  if (date) {
    filters.push("DATE(o.order_date) = ?");
    params.push(date);
  }

  if (month) {
    filters.push("MONTH(o.order_date) = ?");
    params.push(Number(month));
  }

  if (year) {
    filters.push("YEAR(o.order_date) = ?");
    params.push(Number(year));
  }

  return { clause: filters.join(" AND "), params };
}

router.get("/", async (req, res) => {
  try {
    const filter = buildOrderFilter(req.query.month, req.query.year, req.query.date);
    const dealerNameColumn = await resolveColumn("dealers", ["dealer_name", "name"]);
    const dealerMobileColumn = await resolveColumn("dealers", ["phone", "mobile"]);

    const sql = `
      SELECT
        d.${dealerNameColumn} AS dealer_name,
        d.${dealerMobileColumn} AS mobile,
        SUM(CASE WHEN DATEDIFF(CURDATE(), o.order_date) <= 30 THEN o.outstanding ELSE 0 END) AS '0_30',
        SUM(CASE WHEN DATEDIFF(CURDATE(), o.order_date) BETWEEN 31 AND 60 THEN o.outstanding ELSE 0 END) AS '31_60',
        SUM(CASE WHEN DATEDIFF(CURDATE(), o.order_date) BETWEEN 61 AND 90 THEN o.outstanding ELSE 0 END) AS '61_90',
        SUM(CASE WHEN DATEDIFF(CURDATE(), o.order_date) > 90 THEN o.outstanding ELSE 0 END) AS '90_plus',
        SUM(o.outstanding) AS total
      FROM orders o
      JOIN dealers d ON o.dealer_id = d.id
      WHERE ${filter.clause}
      GROUP BY d.id, d.${dealerNameColumn}, d.${dealerMobileColumn}
      ORDER BY d.${dealerNameColumn} ASC
    `;

    db.query(sql, filter.params, (err, result) => {
      if (err) return res.status(500).json(err);
      res.json(result);
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;
