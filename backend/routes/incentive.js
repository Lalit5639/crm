const express = require("express");
const router = express.Router();
const { ensureTableColumn, query, resolveColumn } = require("../utils/schema");

function resolveIncentiveRate(value) {
  const rate = Number(value || 2);
  return [2, 3, 4].includes(rate) ? rate : 2;
}

function buildOrderFilter(month, year, date) {
  const filters = [];
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

  return {
    clause: filters.length ? `WHERE ${filters.join(" AND ")}` : "",
    params,
  };
}

router.get("/", async (req, res) => {
  const incentiveRate = resolveIncentiveRate(req.query.rate);
  const filter = buildOrderFilter(req.query.month, req.query.year, req.query.date);
  const incentiveExpression = `
    ROUND(
      (
        COALESCE(SUM(o.amount), 0) -
        COALESCE(SUM(o.amount), 0) * (CASE WHEN COALESCE(d.party_type, 'PACS') = 'NON_PACS' THEN 0.125 ELSE 0.225 END)
      ) * (? / 100),
      2
    )
  `;

  try {
    await ensureTableColumn("dealers", "party_type", "VARCHAR(20) NOT NULL DEFAULT 'PACS'");
    const dealerNameColumn = await resolveColumn("dealers", ["dealer_name", "name"]);

    const sql = `
      SELECT
        DATE(o.order_date) AS incentive_date,
        d.${dealerNameColumn} AS party_name,
        COALESCE(d.party_type, 'PACS') AS party_type,
        COALESCE(e.emp_code, CONCAT('Emp', LPAD(CONCAT('', e.id), 3, '0'))) AS employee_code,
        e.name AS employee_name,
        e.designation,
        e.zm_name,
        COUNT(o.id) AS total_orders,
        COALESCE(SUM(o.amount), 0) AS total_sales,
        CASE WHEN COALESCE(d.party_type, 'PACS') = 'NON_PACS' THEN 12.5 ELSE 22.5 END AS deduction_percent,
        ROUND(COALESCE(SUM(o.amount), 0) * (CASE WHEN COALESCE(d.party_type, 'PACS') = 'NON_PACS' THEN 0.125 ELSE 0.225 END), 2) AS deducted_amount,
        ? AS incentive_percent,
        ${incentiveExpression} AS incentive
      FROM orders o
      LEFT JOIN employees e ON o.employee_id = e.id
      LEFT JOIN dealers d ON o.dealer_id = d.id
      ${filter.clause}
      GROUP BY
        DATE(o.order_date),
        d.${dealerNameColumn},
        d.party_type,
        e.id,
        e.emp_code,
        e.name,
        e.designation,
        e.zm_name
      HAVING ${incentiveExpression} > 0
      ORDER BY incentive_date ASC, incentive ASC, e.name ASC
    `;

    const result = await query(sql, [incentiveRate, incentiveRate, ...filter.params, incentiveRate]);
    res.json(result);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;
