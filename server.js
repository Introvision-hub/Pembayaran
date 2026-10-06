// server.js
require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const GitHubStrategy = require("passport-github2").Strategy;

const db = require("./db");

const app = express();

// ======================================================
// CONFIG
// ======================================================

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const SESSION_SECRET =
  process.env.SESSION_SECRET || "introvision-change-this-secret";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";

const GITHUB_CALLBACK_URL =
  process.env.GITHUB_CALLBACK_URL ||
  (process.env.RENDER_EXTERNAL_URL
    ? `${process.env.RENDER_EXTERNAL_URL}/auth/github/callback`
    : "http://localhost:3000/auth/github/callback");

const ALLOWED_USERS = (process.env.GITHUB_ALLOWED_USERS || "")
  .split(",")
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);

// ======================================================
// EXPRESS
// ======================================================

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
  })
);

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// ======================================================
// PASSPORT GITHUB
// ======================================================

if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: GITHUB_CLIENT_ID,
        clientSecret: GITHUB_CLIENT_SECRET,
        callbackURL: GITHUB_CALLBACK_URL,
      },

      async (accessToken, refreshToken, profile, done) => {
        try {
          const username = String(profile.username || "").toLowerCase();

          // Jika whitelist diaktifkan
          if (
            ALLOWED_USERS.length > 0 &&
            !ALLOWED_USERS.includes(username)
          ) {
            return done(null, false, {
              message: "Akun GitHub tidak diizinkan.",
            });
          }

          const user = {
            id: profile.id,
            username: profile.username,
            displayName:
              profile.displayName ||
              profile.username ||
              "Administrator",
            avatar:
              profile.photos && profile.photos[0]
                ? profile.photos[0].value
                : null,
          };

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );
}

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// ======================================================
// GLOBAL TEMPLATE DATA
// ======================================================

app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.appName = "Introvision Network Solutions";
  res.locals.currentPath = req.path;

  next();
});

// ======================================================
// AUTH MIDDLEWARE
// ======================================================

function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  return res.redirect("/login");
}

// ======================================================
// HELPERS
// ======================================================

function redirectBack(req, res, fallback = "/") {
  const back = req.get("referer");

  if (back) {
    return res.redirect(back);
  }

  return res.redirect(fallback);
}

function parseNumber(value, defaultValue = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : defaultValue;
}

function normalize(value) {
  return String(value || "").trim();
}

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "introvision-admin",
    timestamp: new Date().toISOString(),
  });
});

// ======================================================
// LOGIN
// ======================================================

app.get("/login", (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.redirect("/");
  }

  res.render("login", {
    githubConfigured: Boolean(
      GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET
    ),
  });
});

app.get("/auth/github", (req, res, next) => {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return res.status(500).send(`
      <h2>GitHub Login Belum Dikonfigurasi</h2>
      <p>Isi GITHUB_CLIENT_ID dan GITHUB_CLIENT_SECRET terlebih dahulu.</p>
      <a href="/login">Kembali</a>
    `);
  }

  passport.authenticate("github", {
    scope: ["user:email"],
  })(req, res, next);
});

app.get(
  "/auth/github/callback",
  passport.authenticate("github", {
    failureRedirect: "/login?error=access_denied",
  }),
  (req, res) => {
    res.redirect("/");
  }
);

app.post("/logout", (req, res, next) => {
  req.logout((error) => {
    if (error) {
      return next(error);
    }

    req.session.destroy(() => {
      res.redirect("/login");
    });
  });
});

// ======================================================
// DASHBOARD
// ======================================================

app.get("/", requireAuth, (req, res) => {
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
       WHERE date(created_at) = date('now','localtime')`
    )
    .get().total;

  const totalRegions = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM regions`
    )
    .get().total;

  const totalOdps = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM odps`
    )
    .get().total;

  const totalPackages = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM packages`
    )
    .get().total;

  const recentCustomers = db
    .prepare(
      `SELECT
         c.*,
         r.name AS region_name,
         o.name AS odp_name,
         p.name AS package_name
       FROM customers c
       LEFT JOIN regions r ON r.id = c.region_id
       LEFT JOIN odps o ON o.id = c.odp_id
       LEFT JOIN packages p ON p.id = c.package_id
       ORDER BY c.id DESC
       LIMIT 10`
    )
    .all();

  const billingSummary = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid,
         SUM(CASE WHEN status = 'unpaid' THEN 1 ELSE 0 END) AS unpaid,
         COALESCE(
           SUM(
             CASE
               WHEN status = 'unpaid' THEN amount
               ELSE 0
             END
           ),
           0
         ) AS unpaid_amount
       FROM invoices`
    )
    .get();

  res.render("dashboard", {
    stats: {
      totalCustomers,
      paidCustomers,
      unpaidCustomers,
      noBillCustomers,
      registeredToday,
      totalRegions,
      totalOdps,
      totalPackages,
    },

    recentCustomers,
    billingSummary,
  });
});

// ======================================================
// REGIONS
// ======================================================

app.get("/regions", requireAuth, (req, res) => {
  const regions = db
    .prepare(
      `SELECT
         r.*,
         COUNT(c.id) AS customer_count
       FROM regions r
       LEFT JOIN customers c ON c.region_id = r.id
       GROUP BY r.id
       ORDER BY r.name ASC`
    )
    .all();

  res.render("regions", {
    regions,
  });
});

app.post("/regions", requireAuth, (req, res) => {
  const name = normalize(req.body.name);
  const city = normalize(req.body.city);
  const district = normalize(req.body.district);
  const village = normalize(req.body.village);
  const latitude = normalize(req.body.latitude);
  const longitude = normalize(req.body.longitude);
  const mapsUrl = normalize(req.body.maps_url);

  if (!name) {
    return res.status(400).send("Nama wilayah wajib diisi.");
  }

  db.prepare(
    `INSERT INTO regions
      (
        name,
        city,
        district,
        village,
        latitude,
        longitude,
        maps_url
      )
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name,
    city,
    district,
    village,
    latitude,
    longitude,
    mapsUrl
  );

  res.redirect("/regions");
});

app.post("/regions/:id/update", requireAuth, (req, res) => {
  const id = parseNumber(req.params.id);

  db.prepare(
    `UPDATE regions
     SET
       name = ?,
       city = ?,
       district = ?,
       village = ?,
       latitude = ?,
       longitude = ?,
       maps_url = ?
     WHERE id = ?`
  ).run(
    normalize(req.body.name),
    normalize(req.body.city),
    normalize(req.body.district),
    normalize(req.body.village),
    normalize(req.body.latitude),
    normalize(req.body.longitude),
    normalize(req.body.maps_url),
    id
  );

  res.redirect("/regions");
});

app.post("/regions/:id/delete", requireAuth, (req, res) => {
  const id = parseNumber(req.params.id);

  db.prepare(
    `DELETE FROM regions
     WHERE id = ?`
  ).run(id);

  res.redirect("/regions");
});

// ======================================================
// ODP
// ======================================================

app.get("/odps", requireAuth, (req, res) => {
  const regions = db
    .prepare(
      `SELECT *
       FROM regions
       ORDER BY name ASC`
    )
    .all();

  const odps = db
    .prepare(
      `SELECT
         o.*,
         r.name AS region_name,
         COUNT(c.id) AS used_slots
       FROM odps o
       LEFT JOIN regions r ON r.id = o.region_id
       LEFT JOIN customers c ON c.odp_id = o.id
       GROUP BY o.id
       ORDER BY o.name ASC`
    )
    .all();

  res.render("odps", {
    odps,
    regions,
  });
});

app.post("/odps", requireAuth, (req, res) => {
  const name = normalize(req.body.name);
  const slots = Math.max(
    0,
    parseNumber(req.body.slots, 8)
  );
  const regionId = parseNumber(req.body.region_id);

  if (!name) {
    return res.status(400).send("Nama ODP wajib diisi.");
  }

  db.prepare(
    `INSERT INTO odps
      (name, slots, region_id)
     VALUES (?, ?, ?)`
  ).run(
    name,
    slots,
    regionId || null
  );

  res.redirect("/odps");
});

app.post("/odps/:id/update", requireAuth, (req, res) => {
  const id = parseNumber(req.params.id);

  const name = normalize(req.body.name);
  const slots = Math.max(
    0,
    parseNumber(req.body.slots, 8)
  );
  const regionId = parseNumber(req.body.region_id);

  db.prepare(
    `UPDATE odps
     SET
       name = ?,
       slots = ?,
       region_id = ?
     WHERE id = ?`
  ).run(
    name,
    slots,
    regionId || null,
    id
  );

  res.redirect("/odps");
});

app.post("/odps/:id/delete", requireAuth, (req, res) => {
  const id = parseNumber(req.params.id);

  db.prepare(
    `DELETE FROM odps
     WHERE id = ?`
  ).run(id);

  res.redirect("/odps");
});

// API status slot ODP

app.get("/api/odps/:id/slots", requireAuth, (req, res) => {
  const id = parseNumber(req.params.id);

  const odp = db
    .prepare(
      `SELECT *
       FROM odps
       WHERE id = ?`
    )
    .get(id);

  if (!odp) {
    return res.status(404).json({
      error: "ODP tidak ditemukan",
    });
  }

  const used = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM customers
       WHERE odp_id = ?`
    )
    .get(id).total;

  const available = Math.max(
    0,
    odp.slots - used
  );

  res.json({
    odp_id: odp.id,
    name: odp.name,
    total_slots: odp.slots,
    used_slots: used,
    available_slots: available,
  });
});

// ======================================================
// PACKAGES
// ======================================================

app.get("/packages", requireAuth, (req, res) => {
  const packages = db
    .prepare(
      `SELECT
         p.*,
         COUNT(c.id) AS customer_count
       FROM packages p
       LEFT JOIN customers c ON c.package_id = p.id
       GROUP BY p.id
       ORDER BY p.price ASC`
    )
    .all();

  res.render("packages", {
    packages,
  });
});

app.post("/packages", requireAuth, (req, res) => {
  const name = normalize(req.body.name);
  const speed = normalize(req.body.speed);
  const price = Math.max(
    0,
    parseNumber(req.body.price)
  );
  const description = normalize(
    req.body.description
  );

  if (!name) {
    return res.status(400).send("Nama paket wajib diisi.");
  }

  db.prepare(
    `INSERT INTO packages
      (
        name,
        speed,
        price,
        description
      )
     VALUES (?, ?, ?, ?)`
  ).run(
    name,
    speed,
    price,
    description
  );

  res.redirect("/packages");
});

app.post("/packages/:id/update", requireAuth, (req, res) => {
  const id = parseNumber(req.params.id);

  db.prepare(
    `UPDATE packages
     SET
       name = ?,
       speed = ?,
       price = ?,
       description = ?
     WHERE id = ?`
  ).run(
    normalize(req.body.name),
    normalize(req.body.speed),
    Math.max(
      0,
      parseNumber(req.body.price)
    ),
    normalize(req.body.description),
    id
  );

  res.redirect("/packages");
});

app.post("/packages/:id/delete", requireAuth, (req, res) => {
  const id = parseNumber(req.params.id);

  db.prepare(
    `DELETE FROM packages
     WHERE id = ?`
  ).run(id);

  res.redirect("/packages");
});

// ======================================================
// CUSTOMERS
// ======================================================

app.get("/customers", requireAuth, (req, res) => {
  const search = normalize(req.query.search);
  const regionId = parseNumber(req.query.region_id);
  const odpId = parseNumber(req.query.odp_id);
  const packageId = parseNumber(req.query.package_id);
  const status = normalize(req.query.status);

  let sql = `
    SELECT
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
    LEFT JOIN regions r ON r.id = c.region_id
    LEFT JOIN odps o ON o.id = c.odp_id
    LEFT JOIN packages p ON p.id = c.package_id
    WHERE 1 = 1
  `;

  const params = [];

  if (search) {
    sql += `
      AND (
        c.name LIKE ?
        OR c.customer_no LIKE ?
        OR c.phone LIKE ?
      )
    `;

    const keyword = `%${search}%`;

    params.push(
      keyword,
      keyword,
      keyword
    );
  }

  if (regionId) {
    sql += ` AND c.region_id = ?`;
    params.push(regionId);
  }

  if (odpId) {
    sql += ` AND c.odp_id = ?`;
    params.push(odpId);
  }

  if (packageId) {
    sql += ` AND c.package_id = ?`;
    params.push(packageId);
  }

  if (status) {
    sql += ` AND c.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY c.id DESC`;

  const customers = db
    .prepare(sql)
    .all(...params);

  const regions = db
    .prepare(
      `SELECT *
       FROM regions
       ORDER BY name ASC`
    )
    .all();

  const odps = db
    .prepare(
      `SELECT *
       FROM odps
       ORDER BY name ASC`
    )
    .all();

  const packages = db
    .prepare(
      `SELECT *
       FROM packages
       ORDER BY price ASC`
    )
    .all();

  res.render("customers", {
    customers,
    regions,
    odps,
    packages,

    filters: {
      search,
      regionId,
      odpId,
      packageId,
      status,
    },
  });
});

// ======================================================
// ADD CUSTOMER
// ======================================================

app.get("/customers/new", requireAuth, (req, res) => {
  const regions = db
    .prepare(
      `SELECT *
       FROM regions
       ORDER BY name ASC`
    )
    .all();

  const odps = db
    .prepare(
      `SELECT *
       FROM odps
       ORDER BY name ASC`
    )
    .all();

  const packages = db
    .prepare(
      `SELECT *
       FROM packages
       ORDER BY price ASC`
    )
    .all();

  res.render("customer_form", {
    customer: null,
    regions,
    odps,
    packages,
  });
});

app.post("/customers", requireAuth, (req, res) => {
  const customerNo = normalize(
    req.body.customer_no
  );

  const name = normalize(req.body.name);
  const phone = normalize(req.body.phone);

  const regionId = parseNumber(
    req.body.region_id
  );

  const odpId = parseNumber(
    req.body.odp_id
  );

  const packageId = parseNumber(
    req.body.package_id
  );

  const city = normalize(req.body.city);
  const district = normalize(
    req.body.district
  );

  const village = normalize(
    req.body.village
  );

  const address = normalize(
    req.body.address
  );

  const status =
    normalize(req.body.status) ||
    "active";

  if (!name) {
    return res.status(400).send(
      "Nama pelanggan wajib diisi."
    );
  }

  const generatedCustomerNo =
    customerNo ||
    `IVN-${Date.now().toString().slice(-8)}`;

  db.prepare(
    `INSERT INTO customers
      (
        customer_no,
        name,
        phone,
        region_id,
        odp_id,
        package_id,
        city,
        district,
        village,
        address,
        status
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    generatedCustomerNo,
    name,
    phone,
    regionId || null,
    odpId || null,
    packageId || null,
    city,
    district,
    village,
    address,
    status
  );

  res.redirect("/customers");
});

// ======================================================
// EDIT CUSTOMER
// ======================================================

app.get(
  "/customers/:id/edit",
  requireAuth,
  (req, res) => {
    const id = parseNumber(req.params.id);

    const customer = db
      .prepare(
        `SELECT *
         FROM customers
         WHERE id = ?`
      )
      .get(id);

    if (!customer) {
      return res.status(404).send(
        "Pelanggan tidak ditemukan."
      );
    }

    const regions = db
      .prepare(
        `SELECT *
         FROM regions
         ORDER BY name ASC`
      )
      .all();

    const odps = db
      .prepare(
        `SELECT *
         FROM odps
         ORDER BY name ASC`
      )
      .all();

    const packages = db
      .prepare(
        `SELECT *
         FROM packages
         ORDER BY price ASC`
      )
      .all();

    res.render("customer_form", {
      customer,
      regions,
      odps,
      packages,
    });
  }
);

app.post(
  "/customers/:id/update",
  requireAuth,
  (req, res) => {
    const id = parseNumber(req.params.id);

    db.prepare(
      `UPDATE customers
       SET
         customer_no = ?,
         name = ?,
         phone = ?,
         region_id = ?,
         odp_id = ?,
         package_id = ?,
         city = ?,
         district = ?,
         village = ?,
         address = ?,
         status = ?
       WHERE id = ?`
    ).run(
      normalize(req.body.customer_no),
      normalize(req.body.name),
      normalize(req.body.phone),
      parseNumber(req.body.region_id) || null,
      parseNumber(req.body.odp_id) || null,
      parseNumber(req.body.package_id) || null,
      normalize(req.body.city),
      normalize(req.body.district),
      normalize(req.body.village),
      normalize(req.body.address),
      normalize(req.body.status) || "active",
      id
    );

    res.redirect("/customers");
  }
);

app.post(
  "/customers/:id/delete",
  requireAuth,
  (req, res) => {
    const id = parseNumber(req.params.id);

    db.prepare(
      `DELETE FROM customers
       WHERE id = ?`
    ).run(id);

    res.redirect("/customers");
  }
);

// ======================================================
// BILLING
// ======================================================

app.get("/billing", requireAuth, (req, res) => {
  const status = normalize(req.query.status);
  const month = normalize(req.query.month);

  let sql = `
    SELECT
      i.*,
      c.customer_no,
      c.name AS customer_name,
      c.phone,
      p.name AS package_name,
      p.price AS package_price
    FROM invoices i
    JOIN customers c
      ON c.id = i.customer_id
    LEFT JOIN packages p
      ON p.id = c.package_id
    WHERE 1 = 1
  `;

  const params = [];

  if (status) {
    sql += ` AND i.status = ?`;
    params.push(status);
  }

  if (month) {
    sql += ` AND i.billing_month = ?`;
    params.push(month);
  }

  sql += `
    ORDER BY
      i.status ASC,
      i.id DESC
  `;

  const invoices = db
    .prepare(sql)
    .all(...params);

  const summary = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(
           CASE
             WHEN status = 'paid'
             THEN 1 ELSE 0
           END
         ) AS paid,
         SUM(
           CASE
             WHEN status = 'unpaid'
             THEN 1 ELSE 0
           END
         ) AS unpaid,
         COALESCE(
           SUM(
             CASE
               WHEN status = 'unpaid'
               THEN amount
               ELSE 0
             END
           ),
           0
         ) AS unpaid_amount
       FROM invoices`
    )
    .get();

  res.render("billing", {
    invoices,
    summary,
    filters: {
      status,
      month,
    },
  });
});

// Generate invoice untuk pelanggan

app.post(
  "/billing/generate",
  requireAuth,
  (req, res) => {
    const billingMonth =
      normalize(req.body.billing_month);

    if (!billingMonth) {
      return res.status(400).send(
        "Bulan tagihan wajib diisi."
      );
    }

    const customers = db
      .prepare(
        `SELECT
           c.id,
           p.price
         FROM customers c
         LEFT JOIN packages p
           ON p.id = c.package_id
         WHERE c.status = 'active'`
      )
      .all();

    const insertInvoice = db.prepare(
      `INSERT INTO invoices
        (
          customer_id,
          billing_month,
          amount,
          status,
          due_date
        )
       VALUES (?, ?, ?, 'unpaid', ?)`
    );

    const transaction =
      db.transaction(() => {
        for (const customer of customers) {
          const exists = db
            .prepare(
              `SELECT id
               FROM invoices
               WHERE customer_id = ?
                 AND billing_month = ?`
            )
            .get(
              customer.id,
              billingMonth
            );

          if (exists) {
            continue;
          }

          const amount =
            Number(customer.price) || 0;

          insertInvoice.run(
            customer.id,
            billingMonth,
            amount,
            `${billingMonth}-10`
          );
        }
      });

    transaction();

    res.redirect("/billing");
  }
);

// Tandai lunas

app.post(
  "/billing/:id/pay",
  requireAuth,
  (req, res) => {
    const id = parseNumber(req.params.id);

    db.prepare(
      `UPDATE invoices
       SET
         status = 'paid',
         paid_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(id);

    redirectBack(req, res, "/billing");
  }
);

// Tandai belum lunas

app.post(
  "/billing/:id/unpay",
  requireAuth,
  (req, res) => {
    const id = parseNumber(req.params.id);

    db.prepare(
      `UPDATE invoices
       SET
         status = 'unpaid',
         paid_at = NULL
       WHERE id = ?`
    ).run(id);

    redirectBack(req, res, "/billing");
  }
);

// Hapus invoice

app.post(
  "/billing/:id/delete",
  requireAuth,
  (req, res) => {
    const id = parseNumber(req.params.id);

    db.prepare(
      `DELETE FROM invoices
       WHERE id = ?`
    ).run(id);

    redirectBack(req, res, "/billing");
  }
);

// ======================================================
// MESSAGE TEMPLATES
// ======================================================

app.get(
  "/templates",
  requireAuth,
  (req, res) => {
    const templates = db
      .prepare(
        `SELECT *
         FROM message_templates
         ORDER BY id DESC`
      )
      .all();

    res.render("templates", {
      templates,
    });
  }
);

app.post(
  "/templates",
  requireAuth,
  (req, res) => {
    const name = normalize(req.body.name);
    const type = normalize(req.body.type);
    const content = normalize(
      req.body.content
    );

    if (!name || !content) {
      return res.status(400).send(
        "Nama dan isi template wajib diisi."
      );
    }

    db.prepare(
      `INSERT INTO message_templates
        (
          name,
          type,
          content
        )
       VALUES (?, ?, ?)`
    ).run(
      name,
      type || "general",
      content
    );

    res.redirect("/templates");
  }
);

app.post(
  "/templates/:id/update",
  requireAuth,
  (req, res) => {
    const id = parseNumber(req.params.id);

    db.prepare(
      `UPDATE message_templates
       SET
         name = ?,
         type = ?,
         content = ?
       WHERE id = ?`
    ).run(
      normalize(req.body.name),
      normalize(req.body.type),
      normalize(req.body.content),
      id
    );

    res.redirect("/templates");
  }
);

app.post(
  "/templates/:id/delete",
  requireAuth,
  (req, res) => {
    const id = parseNumber(req.params.id);

    db.prepare(
      `DELETE FROM message_templates
       WHERE id = ?`
    ).run(id);

    res.redirect("/templates");
  }
);

// ======================================================
// WHATSAPP MESSAGE HELPER
// ======================================================

app.get(
  "/api/customer/:id/whatsapp",
  requireAuth,
  (req, res) => {
    const id = parseNumber(req.params.id);

    const customer = db
      .prepare(
        `SELECT
           c.*,
           p.name AS package_name,
           p.price AS package_price
         FROM customers c
         LEFT JOIN packages p
           ON p.id = c.package_id
         WHERE c.id = ?`
      )
      .get(id);

    if (!customer) {
      return res.status(404).json({
        error: "Pelanggan tidak ditemukan",
      });
    }

    const phone = String(
      customer.phone || ""
    ).replace(/\D/g, "");

    let whatsappNumber = phone;

    if (
      whatsappNumber.startsWith("0")
    ) {
      whatsappNumber =
        "62" + whatsappNumber.slice(1);
    }

    const message =
      `Halo ${customer.name},\n\n` +
      `Kami dari Introvision Network Solutions.\n\n` +
      `Pelanggan: ${customer.customer_no}\n` +
      `Paket: ${customer.package_name || "-"}\n\n` +
      `Terima kasih.`;

    const url =
      `https://wa.me/${whatsappNumber}` +
      `?text=${encodeURIComponent(message)}`;

    res.json({
      phone: whatsappNumber,
      url,
    });
  }
);

// ======================================================
// 404
// ======================================================

app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>404 - Introvision</title>
        <meta name="viewport"
          content="width=device-width,initial-scale=1">
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            text-align: center;
          }

          a {
            text-decoration: none;
          }
        </style>
      </head>

      <body>
        <h1>404</h1>
        <p>Halaman tidak ditemukan.</p>
        <a href="/">Kembali ke Dashboard</a>
      </body>
    </html>
  `);
});

// ======================================================
// ERROR HANDLER
// ======================================================

app.use((error, req, res, next) => {
  console.error("INTROVISION ERROR:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).send(`
    <h2>Terjadi kesalahan pada server.</h2>
    <p>Silakan cek log aplikasi.</p>
    <a href="/">Kembali</a>
  `);
});

// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, HOST, () => {
  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    " INTROVISION NETWORK SOLUTIONS"
  );
  console.log(
    " Admin Panel Server"
  );
  console.log(
    "=============================================="
  );

  console.log(
    `Server : http://${HOST}:${PORT}`
  );

  console.log(
    `GitHub : ${
      GITHUB_CLIENT_ID
        ? "Configured"
        : "Not configured"
    }`
  );

  console.log(
    `Environment : ${
      process.env.NODE_ENV || "development"
    }`
  );

  console.log(
    "=============================================="
  );
});
