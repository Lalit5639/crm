CREATE DATABASE IF NOT EXISTS phoenix_crm;

USE phoenix_crm;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'admin'
);

INSERT INTO users (username, password, role)
SELECT 'admin', '1234', 'admin'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE username = 'admin'
);

CREATE TABLE IF NOT EXISTS dealers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dealer_code VARCHAR(30) DEFAULT NULL,
  dealer_name VARCHAR(100) NOT NULL,
  party_type ENUM('PACS', 'NON_PACS') NOT NULL DEFAULT 'PACS',
  phone VARCHAR(20) NOT NULL,
  address TEXT NOT NULL,
  district VARCHAR(100) DEFAULT NULL,
  state VARCHAR(100) DEFAULT NULL,
  credit_limit DECIMAL(12,2) DEFAULT 0,
  active_flag CHAR(1) DEFAULT 'Y',
  total_selling_bags INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_code VARCHAR(30) DEFAULT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(100) DEFAULT NULL,
  unit VARCHAR(30) DEFAULT NULL,
  hsn VARCHAR(20) DEFAULT NULL,
  mrp DECIMAL(10,2) DEFAULT 0,
  rate DECIMAL(10,2) NOT NULL,
  gst DECIMAL(5,2) DEFAULT 0,
  active_qty INT DEFAULT 0,
  active_flag CHAR(1) DEFAULT 'Y'
);

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  emp_code VARCHAR(30) DEFAULT NULL,
  name VARCHAR(100) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  designation VARCHAR(100) NOT NULL,
  region_district VARCHAR(150) DEFAULT NULL,
  zm_name VARCHAR(100) DEFAULT NULL,
  active_flag CHAR(1) DEFAULT 'Y',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_date DATETIME NOT NULL,
  dealer_id INT NOT NULL,
  product_id INT NOT NULL,
  employee_id INT DEFAULT NULL,
  qty INT NOT NULL,
  rate DECIMAL(10,2) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_type VARCHAR(20) NOT NULL,
  credit_due_date DATE DEFAULT NULL,
  payment_status VARCHAR(30) DEFAULT 'Pending',
  paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  outstanding DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivered_qty INT DEFAULT 0,
  pending_qty INT DEFAULT 0,
  recovery_due_date DATE DEFAULT NULL,
  confirmation_message VARCHAR(255) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  CONSTRAINT fk_orders_dealer
    FOREIGN KEY (dealer_id) REFERENCES dealers(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_orders_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_orders_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  mode VARCHAR(30) DEFAULT NULL,
  reference_no VARCHAR(100) DEFAULT NULL,
  status VARCHAR(30) DEFAULT 'Paid',
  notes TEXT DEFAULT NULL,
  date DATETIME NOT NULL,
  CONSTRAINT fk_payments_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS dispatch (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  dispatch_qty INT NOT NULL DEFAULT 0,
  invoice_no VARCHAR(50) DEFAULT NULL,
  transport_name VARCHAR(100) NOT NULL,
  vehicle_no VARCHAR(50) DEFAULT NULL,
  driver_name VARCHAR(100) DEFAULT NULL,
  driver_phone VARCHAR(20) DEFAULT NULL,
  lr_no VARCHAR(50) DEFAULT NULL,
  eway_bill VARCHAR(100) DEFAULT NULL,
  dispatch_remarks TEXT DEFAULT NULL,
  dispatch_date DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dispatch_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS advance_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dealer_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  mode VARCHAR(30) DEFAULT 'NEFT/RTGS',
  reference_no VARCHAR(100) DEFAULT NULL,
  remarks TEXT DEFAULT NULL,
  payment_date DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_advance_payments_dealer
    FOREIGN KEY (dealer_id) REFERENCES dealers(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS advance_payment_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  advance_payment_id INT NOT NULL,
  order_id INT NOT NULL,
  payment_id INT DEFAULT NULL,
  adjusted_amount DECIMAL(12,2) NOT NULL,
  adjustment_date DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_adjust_advance_payment
    FOREIGN KEY (advance_payment_id) REFERENCES advance_payments(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_adjust_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_adjust_payment
    FOREIGN KEY (payment_id) REFERENCES payments(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS transport (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transport_name VARCHAR(100) NOT NULL,
  contact_person VARCHAR(100) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delivery_proof (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  image VARCHAR(255) NOT NULL,
  delivery_date DATE DEFAULT NULL,
  received_by VARCHAR(100) DEFAULT NULL,
  receiver_phone VARCHAR(20) DEFAULT NULL,
  condition_status VARCHAR(50) DEFAULT NULL,
  proof_link VARCHAR(255) DEFAULT NULL,
  employee_ref VARCHAR(50) DEFAULT NULL,
  delivered_qty INT DEFAULT 0,
  pending_qty INT DEFAULT 0,
  notes TEXT DEFAULT NULL,
  upload_date DATETIME NOT NULL,
  CONSTRAINT fk_delivery_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);
