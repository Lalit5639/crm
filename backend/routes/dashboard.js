const express = require("express");
const router = express.Router();
const { ensureTableColumn, query, resolveColumn } = require("../utils/schema");

function buildOrderFilter(month, year, alias = "o", date = null) {
  const filters = [];
  const params = [];

  if (date) {
    filters.push(`DATE(${alias}.order_date) = ?`);
    params.push(date);
  }

  if (month) {
    filters.push(`MONTH(${alias}.order_date) = ?`);
    params.push(Number(month));
  }

  if (year) {
    filters.push(`YEAR(${alias}.order_date) = ?`);
    params.push(Number(year));
  }

  return {
    clause: filters.length ? `WHERE ${filters.join(" AND ")}` : "",
    andClause: filters.length ? `AND ${filters.join(" AND ")}` : "",
    params,
  };
}

router.get("/", async (req, res) => {
  const { month, year, date } = req.query;
  const filter = buildOrderFilter(month, year, "o", date);

  try {
    await ensureTableColumn("dealers", "party_type", "VARCHAR(20) NOT NULL DEFAULT 'PACS'");
    const dealerNameColumn = await resolveColumn("dealers", ["dealer_name", "name"]);

    const kpiSql = `
      SELECT
        COUNT(*) AS totalOrders,
        SUM(CASE WHEN UPPER(COALESCE(o.status, '')) = 'PENDING' THEN 1 ELSE 0 END) AS pendingOrders,
        (SELECT COUNT(DISTINCT d.order_id) FROM dispatch d INNER JOIN orders o2 ON o2.id = d.order_id ${buildOrderFilter(month, year, "o2", date).clause}) AS dispatchedOrders,
        SUM(CASE WHEN UPPER(COALESCE(o.status, '')) = 'DELIVERED' OR COALESCE(o.pending_qty, o.qty) = 0 THEN 1 ELSE 0 END) AS deliveredOrders,
        SUM(CASE WHEN COALESCE(o.delivered_qty, 0) > 0 AND COALESCE(o.pending_qty, 0) > 0 THEN 1 ELSE 0 END) AS partiallyDeliveredOrders,
        COALESCE(SUM(o.amount), 0) AS totalSales,
        COALESCE(SUM(o.paid_amount), 0) AS totalCollection,
        COALESCE((SELECT SUM(p.amount) FROM payments p INNER JOIN orders o3 ON o3.id = p.order_id ${buildOrderFilter(month, year, "o3", date).clause}), 0) AS totalPayment,
        COALESCE(SUM(o.outstanding), 0) AS outstanding,
        COALESCE(SUM(CASE WHEN o.outstanding > 0 AND COALESCE(o.recovery_due_date, o.credit_due_date) < CURDATE() THEN o.outstanding ELSE 0 END), 0) AS overdueOutstanding,
        COUNT(DISTINCT o.dealer_id) AS totalDealers,
        COALESCE(SUM(o.qty), 0) AS totalSaleBags,
        COUNT(DISTINCT CASE WHEN o.outstanding > 0 THEN o.dealer_id END) AS overdueDealers,
        COUNT(CASE WHEN o.outstanding > 0 AND COALESCE(o.recovery_due_date, o.credit_due_date) <= CURDATE() THEN 1 END) AS reminderReady
      FROM orders o
      ${filter.clause}
    `;

    const productSql = `
      SELECT
        COALESCE(p.name, CONCAT('Product #', o.product_id)) AS product_name,
        COUNT(*) AS orders,
        COALESCE(SUM(o.amount), 0) AS sales
      FROM orders o
      LEFT JOIN products p ON o.product_id = p.id
      ${filter.clause}
      GROUP BY COALESCE(p.name, CONCAT('Product #', o.product_id))
      ORDER BY sales DESC
      LIMIT 10
    `;

    const rdmSql = `
      SELECT
        COALESCE(e.name, 'Unassigned') AS rdm_name,
        COUNT(o.id) AS orders,
        COALESCE(SUM(o.amount), 0) AS sales,
        COALESCE(SUM(o.outstanding), 0) AS outstanding
      FROM orders o
      LEFT JOIN employees e ON o.employee_id = e.id
      ${filter.clause}
      GROUP BY COALESCE(e.name, 'Unassigned')
      ORDER BY sales DESC, orders DESC
      LIMIT 12
    `;

    const overdueSql = `
      SELECT
        COALESCE(d.${dealerNameColumn}, 'Unknown Dealer') AS dealer_name,
        COALESCE(SUM(o.outstanding), 0) AS total_due,
        COALESCE(SUM(CASE WHEN COALESCE(o.recovery_due_date, o.credit_due_date) < CURDATE() THEN o.outstanding ELSE 0 END), 0) AS overdue_due
      FROM orders o
      LEFT JOIN dealers d ON o.dealer_id = d.id
      WHERE o.outstanding > 0
      ${filter.andClause}
      GROUP BY COALESCE(d.${dealerNameColumn}, 'Unknown Dealer')
      ORDER BY total_due DESC
      LIMIT 10
    `;

    const productCountSql = "SELECT COUNT(*) AS totalProducts FROM products";
    const activeDealerSql = "SELECT COUNT(*) AS totalActiveDealer FROM dealers WHERE COALESCE(active_flag, 'Y') = 'Y'";
    const incentiveTotalExpression = "ROUND(COALESCE(SUM(o.amount - (o.amount * CASE WHEN COALESCE(d.party_type, 'PACS') = 'NON_PACS' THEN 0.125 ELSE 0.225 END)), 0) * 0.02, 2)";

    const rdmIncentiveSql = `
      SELECT
        COALESCE(e.name, 'Unassigned') AS rdm_name,
        ${incentiveTotalExpression} AS total_incentive
      FROM orders o
      LEFT JOIN employees e ON o.employee_id = e.id
      LEFT JOIN dealers d ON o.dealer_id = d.id
      ${filter.clause}
      GROUP BY COALESCE(e.name, 'Unassigned')
      HAVING ${incentiveTotalExpression} > 0
      ORDER BY total_incentive DESC
      LIMIT 10
    `;

    const zmIncentiveSql = `
      SELECT
        COALESCE(e.zm_name, 'Unassigned') AS zm_name,
        ${incentiveTotalExpression} AS total_incentive
      FROM orders o
      LEFT JOIN employees e ON o.employee_id = e.id
      LEFT JOIN dealers d ON o.dealer_id = d.id
      ${filter.clause}
      GROUP BY COALESCE(e.zm_name, 'Unassigned')
      HAVING ${incentiveTotalExpression} > 0
      ORDER BY total_incentive DESC
      LIMIT 10
    `;

    const orderFilter2 = buildOrderFilter(month, year, "o2", date);
    const orderFilter3 = buildOrderFilter(month, year, "o3", date);
    const paramsForKpi = [
      ...orderFilter2.params,
      ...orderFilter3.params,
      ...filter.params,
    ];

    const [
      kpiRows,
      productWise,
      rdmWise,
      overdue,
      productCountRows,
      activeDealerRows,
      rdmIncentive,
      zmIncentive,
    ] = await Promise.all([
      query(kpiSql, paramsForKpi),
      query(productSql, filter.params),
      query(rdmSql, filter.params),
      query(overdueSql, filter.params),
      query(productCountSql),
      query(activeDealerSql),
      query(rdmIncentiveSql, filter.params),
      query(zmIncentiveSql, filter.params),
    ]);

    const kpi = kpiRows[0] || {};
    kpi.totalProducts = productCountRows[0]?.totalProducts || 0;
    kpi.totalActiveDealer = activeDealerRows[0]?.totalActiveDealer || 0;
    kpi.totalInvoiceAmount = kpi.totalSales || 0;
    kpi.totalRdmIncentive = rdmIncentive.reduce((sum, row) => sum + Number(row.total_incentive || 0), 0);
    kpi.totalZmIncentive = zmIncentive.reduce((sum, row) => sum + Number(row.total_incentive || 0), 0);
    kpi.totalPayment = kpi.totalPayment || 0;

    res.json({
      kpi,
      productWise,
      rdmWise,
      overdue,
      rdmIncentive,
      zmIncentive,
      outstandingSnapshot: {
        totalOrderValue: kpi.totalSales || 0,
        totalSaleBags: kpi.totalSaleBags || 0,
        overdueDealers: kpi.overdueDealers || 0,
        reminderReady: kpi.reminderReady || 0,
      },
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;
