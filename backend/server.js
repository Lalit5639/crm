const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5000",
  "http://127.0.0.1:5500",
  "https://lalit5639.github.io",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked request from ${origin}`));
  },
}));
app.use(express.json());
app.use("/frontend", express.static(path.join(__dirname, "..", "frontend")));

console.log("Loading routes...");

try {
  app.use("/api/auth", require("./routes/auth"));
  app.use("/api/dealers", require("./routes/dealers"));
  app.use("/api/orders", require("./routes/orders"));
  app.use("/api/payments", require("./routes/payments"));
  app.use("/api/dashboard", require("./routes/dashboard"));
  app.use("/api/products", require("./routes/products"));
  app.use("/api/ledger", require("./routes/ledger"));
  app.use("/api/recovery", require("./routes/recovery"));
  app.use("/api/pending", require("./routes/pending"));
  app.use("/api/dispatch", require("./routes/dispatch"));
  app.use("/api/delivery", require("./routes/delivery"));
  app.use("/api/employees", require("./routes/employees"));
  app.use("/api/incentive", require("./routes/incentive"));
  app.use("/api/transport", require("./routes/transport"));
  app.use("/uploads", express.static(path.join(__dirname, "uploads")));
} catch (err) {
  console.error("ROUTE ERROR:", err);
}

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    message: "Phoenix CRM API is running",
    baseUrl: `${req.protocol}://${req.get("host")}`,
    endpoints: [
      "/api/auth",
      "/api/dashboard",
      "/api/dealers",
      "/api/products",
      "/api/orders",
      "/api/payments",
      "/api/pending",
      "/api/recovery",
      "/api/dispatch",
      "/api/delivery",
      "/api/employees",
      "/api/incentive",
      "/api/transport",
      "/api/ledger/:dealer_id"
    ]
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({ success: true, status: "ok" });
});

app.get("/api", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Phoenix CRM API</title>
      <style>
        body {
          font-family: Segoe UI, Arial, sans-serif;
          background: linear-gradient(135deg, #e8f5e9, #ffffff);
          color: #163020;
          margin: 0;
          padding: 40px 20px;
        }
        .card {
          max-width: 860px;
          margin: 0 auto;
          background: #ffffff;
          border: 1px solid #d7ead9;
          border-radius: 18px;
          box-shadow: 0 16px 40px rgba(22, 48, 32, 0.08);
          padding: 28px;
        }
        h1 {
          margin-top: 0;
          font-size: 32px;
        }
        .badge {
          display: inline-block;
          background: #e8f7ec;
          color: #177245;
          border: 1px solid #bfe4ca;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 14px;
          margin-bottom: 16px;
        }
        code, a {
          color: #0d683c;
        }
        ul {
          padding-left: 18px;
        }
        li {
          margin: 8px 0;
        }
        .row {
          margin-top: 20px;
          padding: 16px;
          background: #f7fbf8;
          border-radius: 12px;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">API Running</div>
        <h1>Phoenix CRM API</h1>
        <p>Your backend server is working on <code>${req.protocol}://${req.get("host")}</code>.</p>
        <div class="row">
          <strong>API status JSON:</strong>
          <a href="/api/status">/api/status</a>
        </div>
        <div class="row">
          <strong>Available endpoints</strong>
          <ul>
            <li><a href="/api/dealers">/api/dealers</a></li>
            <li><a href="/api/products">/api/products</a></li>
            <li><a href="/api/orders">/api/orders</a></li>
            <li><a href="/api/payments">/api/payments</a></li>
            <li><a href="/api/dashboard">/api/dashboard</a></li>
            <li><a href="/api/pending">/api/pending</a></li>
            <li><a href="/api/recovery">/api/recovery</a></li>
            <li><a href="/api/dispatch">/api/dispatch</a></li>
            <li><a href="/api/delivery">/api/delivery</a></li>
            <li><a href="/api/employees">/api/employees</a></li>
            <li><a href="/api/incentive">/api/incentive</a></li>
            <li><a href="/api/transport">/api/transport</a></li>
          </ul>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.get("/", (req, res) => {
  res.redirect("/frontend/login.html");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
