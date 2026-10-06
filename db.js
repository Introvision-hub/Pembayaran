// db.js
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

// ======================================================
// DATABASE CONFIG
// ======================================================

const dbPath =
  process.env.DB_PATH ||
  path.join(__dirname, "data", "introvision.db");

// Pastikan folder database tersedia
fs.mkdirSync(path.dirname(dbPath), {
  recursive: true,
});

const db = new Database(dbPath);

// Performance & safety
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ======================================================
// DATABASE SCHEMA
// ======================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS regions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    city TEXT DEFAULT '',
    district TEXT DEFAULT '',
    village TEXT DEFAULT '',
    latitude TEXT DEFAULT '',
    longitude TEXT DEFAULT '',
    maps_url TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS odps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slots INTEGER NOT NULL DEFAULT 8,
    region_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (region_id)
      REFERENCES regions(id)
      ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    speed TEXT DEFAULT '',
    price INTEGER NOT NULL DEFAULT 0,
    description TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    customer_no TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',

    region_id INTEGER,
    odp_id INTEGER,
    package_id INTEGER,

    city TEXT DEFAULT '',
    district TEXT DEFAULT '',
    village TEXT DEFAULT '',
    address TEXT DEFAULT '',

    status TEXT NOT NULL DEFAULT 'active',

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (region_id)
      REFERENCES regions(id)
      ON DELETE SET NULL,

    FOREIGN KEY (odp_id)
      REFERENCES odps(id)
      ON DELETE SET NULL,

    FOREIGN KEY (package_id)
      REFERENCES packages(id)
      ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    customer_id INTEGER NOT NULL,

    billing_month TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'unpaid',

    due_date TEXT DEFAULT '',
    paid_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (customer_id)
      REFERENCES customers(id)
      ON DELETE CASCADE,

    UNIQUE(customer_id, billing_month)
  );

  CREATE TABLE IF NOT EXISTS message_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL,
    type TEXT DEFAULT 'general',
    content TEXT NOT NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ======================================================
// INDEXES
// ======================================================

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_customers_name
    ON customers(name);

  CREATE INDEX IF NOT EXISTS idx_customers_phone
    ON customers(phone);

  CREATE INDEX IF NOT EXISTS idx_customers_region
    ON customers(region_id);

  CREATE INDEX IF NOT EXISTS idx_customers_odp
    ON customers(odp_id);

  CREATE INDEX IF NOT EXISTS idx_customers_package
    ON customers(package_id);

  CREATE INDEX IF NOT EXISTS idx_customers_status
    ON customers(status);

  CREATE INDEX IF NOT EXISTS idx_invoices_customer
    ON invoices(customer_id);

  CREATE INDEX IF NOT EXISTS idx_invoices_status
    ON invoices(status);

  CREATE INDEX IF NOT EXISTS idx_invoices_month
    ON invoices(billing_month);

  CREATE INDEX IF NOT EXISTS idx_odps_region
    ON odps(region_id);
`);

// ======================================================
// SEED DEFAULT PACKAGES
// ======================================================

const packageCount = db
  .prepare(
    `SELECT COUNT(*) AS total
     FROM packages`
  )
  .get().total;

if (packageCount === 0) {
  const insertPackage = db.prepare(`
    INSERT INTO packages
      (
        name,
        speed,
        price,
        description
      )
    VALUES (?, ?, ?, ?)
  `);

  const seedPackages = [
    [
      "Home 10 Mbps",
      "10 Mbps",
      150000,
      "Paket internet rumahan 10 Mbps",
    ],

    [
      "Home 20 Mbps",
      "20 Mbps",
      200000,
      "Paket internet rumahan 20 Mbps",
    ],

    [
      "Home 30 Mbps",
      "30 Mbps",
      250000,
      "Paket internet rumahan 30 Mbps",
    ],
  ];

  const insertMany = db.transaction(() => {
    for (const item of seedPackages) {
      insertPackage.run(...item);
    }
  });

  insertMany();
}

// ======================================================
// SEED MESSAGE TEMPLATES
// ======================================================

const templateCount = db
  .prepare(
    `SELECT COUNT(*) AS total
     FROM message_templates`
  )
  .get().total;

if (templateCount === 0) {
  const insertTemplate = db.prepare(`
    INSERT INTO message_templates
      (
        name,
        type,
        content
      )
    VALUES (?, ?, ?)
  `);

  const templates = [
    [
      "Pengingat Pembayaran",
      "collection",
      `Halo {nama},

Kami dari Introvision Network Solutions.

Kami mengingatkan bahwa tagihan internet Anda:

Pelanggan : {customer_no}
Paket     : {paket}
Periode   : {periode}
Tagihan   : {tagihan}
Jatuh Tempo : {jatuh_tempo}

Mohon melakukan pembayaran sebelum jatuh tempo.

Terima kasih.
Introvision Network Solutions`,
    ],

    [
      "Konfirmasi Pembayaran",
      "payment",
      `Halo {nama},

Pembayaran internet Anda telah kami terima.

Pelanggan : {customer_no}
Paket     : {paket}
Periode   : {periode}
Nominal   : {tagihan}

Status pembayaran: LUNAS

Terima kasih telah menggunakan layanan Introvision Network Solutions.`,
    ],

    [
      "Tagihan Belum Dibayar",
      "invoice",
      `Halo {nama},

Saat ini tagihan internet Anda masih tercatat BELUM LUNAS.

Pelanggan : {customer_no}
Paket     : {paket}
Periode   : {periode}
Total     : {tagihan}
Jatuh Tempo : {jatuh_tempo}

Mohon segera melakukan pembayaran.

Terima kasih.
Introvision Network Solutions`,
    ],

    [
      "Gangguan Layanan",
      "general",
      `Halo {nama},

Kami dari Introvision Network Solutions.

Saat ini terdapat informasi terkait layanan internet Anda.

Mohon menunggu informasi selanjutnya dari tim teknis kami.

Terima kasih atas pengertiannya.`,
    ],
  ];

  const insertManyTemplates = db.transaction(() => {
    for (const template of templates) {
      insertTemplate.run(...template);
    }
  });

  insertManyTemplates();
}

// ======================================================
// DATABASE HELPERS
// ======================================================

function getCustomerById(id) {
  return db
    .prepare(
      `SELECT
         c.*,

         r.name AS region_name,
         r.city AS region_city,
         r.district AS region_district,
         r.village AS region_village,

         o.name AS odp_name,

         p.name AS package_name,
         p.speed AS package_speed,
         p.price AS package_price

       FROM customers c

       LEFT JOIN regions r
         ON r.id = c.region_id

       LEFT JOIN odps o
         ON o.id = c.odp_id

       LEFT JOIN packages p
         ON p.id = c.package_id

       WHERE c.id = ?`
    )
    .get(id);
}

function getInvoiceById(id) {
  return db
    .prepare(
      `SELECT
         i.*,

         c.customer_no,
         c.name AS customer_name,
         c.phone,

         p.name AS package_name,
         p.speed AS package_speed,
         p.price AS package_price

       FROM invoices i

       JOIN customers c
         ON c.id = i.customer_id

       LEFT JOIN packages p
         ON p.id = c.package_id

       WHERE i.id = ?`
    )
    .get(id);
}

function getDashboardStats() {
  const totalCustomers = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM customers`
    )
    .get().total;

  const paidCustomers = db
    .prepare(
      `SELECT COUNT(DISTINCT customer_id) AS total
       FROM invoices
       WHERE status = 'paid'`
    )
    .get().total;

  const unpaidCustomers = db
    .prepare(
      `SELECT COUNT(DISTINCT customer_id) AS total
       FROM invoices
       WHERE status = 'unpaid'`
    )
    .get().total;

  const noBillCustomers = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM customers c
       WHERE NOT EXISTS (
         SELECT 1
         FROM invoices i
         WHERE i.customer_id = c.id
       )`
    )
    .get().total;

  const registeredToday = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM customers
       WHERE date(created_at)
         = date('now', 'localtime')`
    )
    .get().total;

  return {
    totalCustomers,
    paidCustomers,
    unpaidCustomers,
    noBillCustomers,
    registeredToday,
  };
}

// ======================================================
// EXPORT
// ======================================================

module.exports = db;

// Helper functions juga bisa dipanggil
// jika dibutuhkan file lain.

module.exports.getCustomerById =
  getCustomerById;

module.exports.getInvoiceById =
  getInvoiceById;

module.exports.getDashboardStats =
  getDashboardStats;
