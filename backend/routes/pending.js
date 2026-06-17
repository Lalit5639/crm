const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { resolveColumn } = require("../utils/schema");

router.get("/", async (req, res) => {
  const { month, year } = req.query;
  const whereParts = ["1=1"];
  const params = [];

  if (month && year) {
    whereParts.push("MONTH(o.order_date) = ?", "YEAR(o.order_date) = ?");
    params.push(Number(month), Number(year));
  }

  try {
    const dealerNameColumn = await resolveColumn("dealers", ["dealer_name", "name"]);
    const dealerMobileColumn = await resolveColumn("dealers", ["phone", "mobile"]);
    const dispatchQtyColumn = await resolveColumn("dispatch", ["dispatch_qty", "qty", "quantity", "dispatched_qty"]);
    const dispatchedQtySql = dispatchQtyColumn
      ? `COALESCE((
          SELECT SUM(CASE WHEN disp.${dispatchQtyColumn} > 0 THEN disp.${dispatchQtyColumn} ELSE 1 END)
          FROM dispatch disp
          WHERE disp.order_id = o.id
        ), 0)`
      : `COALESCE((
          SELECT COUNT(*)
          FROM dispatch disp
          WHERE disp.order_id = o.id
        ), 0)`;

    const sql = `
      SELECT *
      FROM (
      SELECT
        o.id,
        o.order_date,
        d.${dealerNameColumn} AS dealer_name,
        d.${dealerMobileColumn} AS dealer_phone,
        p.name AS product_name,
        p.product_code,
        o.qty AS ordered_qty,
        ${dispatchedQtySql} AS dispatched_qty,
        (o.qty - ${dispatchedQtySql}) AS pending_qty,
        ((o.qty - ${dispatchedQtySql}) * o.rate) AS pending_amount,
        o.amount AS total_amount,
        o.paid_amount,
        o.outstanding,
        o.status,
        DATEDIFF(CURDATE(), o.order_date) AS days_pending
      FROM orders o
      LEFT JOIN dealers d ON o.dealer_id = d.id
      LEFT JOIN products p ON o.product_id = p.id
      WHERE ${whereParts.join(" AND ")}
      ) pending_orders
      WHERE pending_qty > 0
      ORDER BY order_date ASC, id ASC
    `;

    db.query(sql, params, (err, result) => {
      if (err) {
        console.error("Pending orders query error:", err);
        return res.status(500).json({ error: err.message });
      }
      res.json(result);
    });
  } catch (err) {
    console.error("Pending orders catch error:", err);
    res.status(500).json(err);
  }
});

module.exports = router;
