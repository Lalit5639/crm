const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { resolveColumn } = require("../utils/schema");

router.get("/", async (req, res) => {
  const { month, year } = req.query;
  let where = "WHERE COALESCE(o.status, 'PENDING') NOT IN ('DISPATCHED', 'DELIVERED')";

  if (month && year) {
    where += ` AND MONTH(o.order_date) = ${Number(month)} AND YEAR(o.order_date) = ${Number(year)}`;
  }

  try {
    const dealerNameColumn = await resolveColumn("dealers", ["dealer_name", "name"]);
    const dealerMobileColumn = await resolveColumn("dealers", ["phone", "mobile"]);

    const sql = `
      SELECT
        o.id,
        o.order_date,
        d.${dealerNameColumn} AS dealer_name,
        d.${dealerMobileColumn} AS dealer_phone,
        p.name AS product_name,
        p.product_code,
        o.qty,
        o.amount,
        o.paid_amount,
        o.outstanding,
        o.status,
        o.delivered_qty,
        o.pending_qty,
        DATEDIFF(CURDATE(), o.order_date) AS days_pending
      FROM orders o
      LEFT JOIN dealers d ON o.dealer_id = d.id
      LEFT JOIN products p ON o.product_id = p.id
      ${where}
      ORDER BY o.order_date ASC
    `;

    db.query(sql, (err, result) => {
      if (err) return res.status(500).json(err);
      res.json(result);
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;
