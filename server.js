require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { v2: cloudinary } = require("cloudinary");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

const app = express();

// Trust proxy for reverse proxies (Render, Cloudflare, etc.)
app.set("trust proxy", 1);

// Helmet security headers (configured to safely permit Google Fonts, Cloudinary, and dynamic onclicks)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        connectSrc: ["'self'", "https://api.cloudinary.com"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// Strict CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim()).filter(Boolean)
  : [];

const defaultOrigins = [
  "https://veltrix-bike-shop.onrender.com",
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);

    const matches = defaultOrigins.some(pattern =>
      typeof pattern === "string" ? pattern === origin : pattern.test(origin)
    );

    if (matches) return callback(null, true);
    return callback(new Error("CORS бодлогын дагуу хандах эрхгүй байна"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public", {
  maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
  etag: true
}));

/* =========================
   DATABASE MODELS
========================= */

const Product = mongoose.model("Product", new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, default: "Сэлбэг" },
  description: { type: String, default: "" },
  price: { type: Number, required: true, min: 0 },
  oldPrice: { type: Number, default: 0 },
  stock: { type: Number, default: 0, min: 0 },
  image: { type: String, default: "" },
  featured: { type: Boolean, default: false },
  active: { type: Boolean, default: true },

  compatibility: {
    wheelSizes: { type: [String], default: [] },
    brakeTypes: { type: [String], default: [] },
    speeds: { type: [Number], default: [] },
    bikeTypes: { type: [String], default: [] }
  }
}, { timestamps: true }));

const StockMovement = mongoose.model("StockMovement", new mongoose.Schema({
  productId: { type: String, required: true, index: true },
  productName: { type: String, required: true },
  type: { type: String, enum: ["Орлого", "Зарлага"], required: true },
  quantity: { type: Number, required: true, min: 1 },
  before: { type: Number, required: true, min: 0 },
  after: { type: Number, required: true, min: 0 },
  note: { type: String, default: "", maxlength: 300 },
  source: { type: String, default: "manual" },
  orderId: { type: String, default: "" },
  eventKey: { type: String, unique: true, sparse: true, default: undefined }
}, { timestamps: true }));

// Ижил барааны мөрүүдийг нэгтгэнэ
function combineOrderItems(items = []) {
  const grouped = new Map();

  for (const item of items) {
    const productId = String(item?.productId || "").trim();
    const quantity = Number(item?.quantity);

    if (!productId || !Number.isSafeInteger(quantity) || quantity < 1) {
      throw new Error("INVALID_ORDER_STOCK_ITEM");
    }

    const current = grouped.get(productId);

    if (current) {
      const total = current.quantity + quantity;

      if (!Number.isSafeInteger(total)) {
        throw new Error("INVALID_ORDER_STOCK_ITEM");
      }

      current.quantity = total;
    } else {
      grouped.set(productId, {
        productId,
        name: item.name || "Бараа",
        quantity
      });
    }
  }

  return [...grouped.values()];
}

// Захиалгатай холбоотой агуулахын хөдөлгөөнийг давхардуулахгүй бүртгэнэ
async function recordOrderStockMovements(order, type, eventName) {
  const items = combineOrderItems(order.items || []);
  const movements = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const quantity = item.quantity;

    const eventKey = `${order._id}:${eventName}:${i}`;
    const existing = await StockMovement.findOne({ eventKey });

    if (existing) continue;

    const product = await Product.findById(item.productId).select("name stock");

    if (!product) {
      throw new Error(`STOCK_PRODUCT_NOT_FOUND:${item.productId}`);
    }

    const after = product.stock;
    const before = type === "Зарлага"
      ? after + quantity
      : after - quantity;

    if (before < 0 || after < 0) {
      throw new Error("INVALID_STOCK_MOVEMENT_BALANCE");
    }

    movements.push({
      productId: item.productId,
      productName: product.name || item.name || "Бараа",
      type,
      quantity,
      before,
      after,
      note: `Захиалга ${order.code || order._id}`,
      source: "order",
      orderId: String(order._id),
      eventKey
    });
  }

  if (movements.length) {
    try {
      await StockMovement.insertMany(movements, { ordered: true });
    } catch (error) {
      await StockMovement.deleteMany({
        eventKey: { $in: movements.map(m => m.eventKey) }
      });
      throw error;
    }
  }
}

const User = mongoose.model("User", new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
  phone: { type: String, trim: true, sparse: true, unique: true },
  passwordHash: { type: String, required: true }
}, { timestamps: true }));

const Order = mongoose.model("Order", new mongoose.Schema({
  code: { type: String, unique: true },
  userId: { type: String, index: true },
  customer: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  note: { type: String, default: "" },

  items: [{
    productId: String,
    name: String,
    price: Number,
    quantity: Number
  }],

  total: Number,
  subtotal: Number,
  discount: { type: Number, default: 0 },
  pointsUsed: { type: Number, default: 0 },
  deliveryFee: { type: Number, default: 0 },

  status: { type: String, default: "Шинэ" },
  paymentMethod: { type: String, default: "Хүлээн авахдаа төлөх" },
  paymentStatus: { type: String, default: "Төлөөгүй" },

  pointsAwarded: { type: Boolean, default: false },
  stockRestored: { type: Boolean, default: false }
}, { timestamps: true }));

const Coupon = mongoose.model("Coupon", new mongoose.Schema({
  code: { type: String, unique: true, uppercase: true, trim: true },
  percent: { type: Number, min: 1, max: 90 },
  active: { type: Boolean, default: true },
  expiresAt: Date
}, { timestamps: true }));

// Онооны данс
const Loyalty = mongoose.model("Loyalty", new mongoose.Schema({
  phone: { type: String, unique: true, required: true },
  points: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 }
}, { timestamps: true }));

// Барааны үнэлгээ
const Review = mongoose.model("Review", new mongoose.Schema({
  productId: { type: String, required: true },
  orderCode: { type: String, required: true },
  customer: { type: String, required: true },
  phone: { type: String, required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, default: "", maxlength: 1000 },
  approved: { type: Boolean, default: false }
}, { timestamps: true }));

Review.schema.index({ orderCode: 1, productId: 1 }, { unique: true });

// Захиалгын чат
const ChatMessage = mongoose.model("ChatMessage", new mongoose.Schema({
  orderCode: { type: String, required: true, index: true },
  sender: { type: String, enum: ["customer", "admin"], required: true },
  message: { type: String, required: true, maxlength: 2000 },
  read: { type: Boolean, default: false }
}, { timestamps: true }));

/* =========================
   AUTHENTICATION
========================= */

const isProduction = process.env.NODE_ENV === "production";
const INSECURE_DEFAULT_SECRET = "change-this-secret-before-production";

if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET === INSECURE_DEFAULT_SECRET || process.env.JWT_SECRET.trim().length < 16)) {
  console.error("FATAL: In production, JWT_SECRET must be set to a secure string with at least 16 characters.");
  process.exit(1);
}

const secret = () => {
  if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET === INSECURE_DEFAULT_SECRET)) {
    throw new Error("JWT_SECRET must be configured in production");
  }
  return process.env.JWT_SECRET || INSECURE_DEFAULT_SECRET;
};

function adminOnly(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");

  try {
    const data = jwt.verify(token, secret());

    if (data.role !== "admin") throw new Error();

    req.admin = data;
    next();
  } catch {
    return res.status(401).json({ error: "Админ эрх шаардлагатай" });
  }
}

function userOnly(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");

  try {
    const data = jwt.verify(token, secret());
    if (data.role !== "user" || !data.userId) throw new Error();
    req.userId = data.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Нэвтрэх шаардлагатай" });
  }
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function makeOrderCode() {
  return "VX" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

function cloudinaryReady() {
  return process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET;
}

if (cloudinaryReady()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

/* =========================
   RATE LIMITERS
========================= */

// Rate limiter for Admin Login (prevents brute-force attacks)
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Хэт олон удаа буруу хандсан байна. 15 минутын дараа дахин оролдоно уу."
  }
});

// Rate limiter for Order Placement (prevents spam and stock depletion attacks)
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Захиалгын хязгаар хэтэрсэн байна. Түр хүлээгээд дахин оролдоно уу."
  }
});

/* =========================
   HEALTH
========================= */

app.get("/health", (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;

  if (!isDbConnected) {
    return res.status(503).json({
      ok: false,
      db: false,
      error: "Database disconnected"
    });
  }

  res.status(200).json({
    ok: true,
    db: true,
    uptime: Math.round(process.uptime())
  });
});

/* =========================
   PRODUCTS
========================= */

// Барааны жагсаалт + нийцлийн шүүлтүүр
app.get("/api/products", async (req, res) => {
  try {
    const filter = { active: true };

    if (req.query.wheelSize) {
      filter["compatibility.wheelSizes"] = String(req.query.wheelSize);
    }

    if (req.query.brakeType) {
      filter["compatibility.brakeTypes"] = String(req.query.brakeType);
    }

    if (req.query.speed) {
      filter["compatibility.speeds"] = Number(req.query.speed);
    }

    if (req.query.bikeType) {
      filter["compatibility.bikeTypes"] = String(req.query.bikeType);
    }

    const products = await Product.find(filter)
      .sort({ featured: -1, createdAt: -1 })
      .lean();

    res.json(products);
  } catch (e) {
    res.status(500).json({ error: "Бараа ачаалж чадсангүй" });
  }
});

/* =========================
   CUSTOMER AUTHENTICATION
========================= */

const customerAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Хэт олон удаа оролдлоо. 15 минутын дараа дахин оролдоно уу." }
});

app.post("/api/auth/register", customerAuthLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");

    if (!name || name.length > 80) {
      return res.status(400).json({ error: "Нэрээ зөв оруулна уу" });
    }

    if (!email && !phone) {
      return res.status(400).json({ error: "Утас эсвэл имэйл оруулна уу" });
    }

    if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Имэйл хаягаа шалгана уу" });
    }

    if (phone && (phone.length < 8 || phone.length > 15)) {
      return res.status(400).json({ error: "Утасны дугаараа шалгана уу" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Нууц үг дор хаяж 8 тэмдэгт байна" });
    }

    const conditions = [];
    if (email) conditions.push({ email });
    if (phone) conditions.push({ phone });

    const existing = await User.findOne({ $or: conditions });

    if (existing) {
      return res.status(409).json({
        error: "Энэ утас эсвэл имэйлээр бүртгэл үүссэн байна"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      passwordHash
    });

    const token = jwt.sign(
      { role: "user", userId: String(user._id) },
      secret(),
      { expiresIn: "7d" }
    );

    res.status(201).json({
      ok: true,
      token,
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email || "",
        phone: user.phone || ""
      }
    });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ error: "Энэ мэдээллээр бүртгэл үүссэн байна" });
    }
    console.error("Customer registration error:", e.message);
    res.status(500).json({ error: "Бүртгэл үүсгэхэд алдаа гарлаа" });
  }
});

app.post("/api/auth/login", customerAuthLimiter, async (req, res) => {
  try {
    const identity = String(req.body.identity || "").trim();
    const password = String(req.body.password || "");

    if (!identity || !password) {
      return res.status(400).json({ error: "Нэвтрэх мэдээллээ бөглөнө үү" });
    }

    const user = identity.includes("@")
      ? await User.findOne({ email: identity.toLowerCase() })
      : await User.findOne({ phone: normalizePhone(identity) });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Нэвтрэх мэдээлэл буруу байна" });
    }

    const token = jwt.sign(
      { role: "user", userId: String(user._id) },
      secret(),
      { expiresIn: "7d" }
    );

    res.json({
      ok: true,
      token,
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email || "",
        phone: user.phone || ""
      }
    });
  } catch (e) {
    console.error("Customer login error:", e.message);
    res.status(500).json({ error: "Нэвтрэхэд алдаа гарлаа" });
  }
});

app.get("/api/auth/me", userOnly, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("name email phone");

    if (!user) {
      return res.status(404).json({ error: "Хэрэглэгч олдсонгүй" });
    }

    res.json({
      id: String(user._id),
      name: user.name,
      email: user.email || "",
      phone: user.phone || ""
    });
  } catch {
    res.status(500).json({ error: "Хэрэглэгчийн мэдээлэл ачаалж чадсангүй" });
  }
});


/* =========================
   CUSTOMER PROFILE SETTINGS
========================= */

app.patch("/api/auth/profile", userOnly, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = normalizePhone(req.body.phone);

    if (!name || name.length > 80) {
      return res.status(400).json({ error: "Нэрээ зөв оруулна уу" });
    }

    if (!email && !phone) {
      return res.status(400).json({ error: "Утас эсвэл имэйлийн аль нэгийг үлдээнэ үү" });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Имэйл хаягаа шалгана уу" });
    }

    if (phone && (phone.length < 8 || phone.length > 15)) {
      return res.status(400).json({ error: "Утасны дугаараа шалгана уу" });
    }

    const duplicateConditions = [];
    if (email) duplicateConditions.push({ email });
    if (phone) duplicateConditions.push({ phone });

    if (duplicateConditions.length) {
      const duplicate = await User.findOne({
        _id: { $ne: req.userId },
        $or: duplicateConditions
      });

      if (duplicate) {
        return res.status(409).json({
          error: "Энэ утас эсвэл имэйл өөр хэрэглэгчид бүртгэлтэй байна"
        });
      }
    }

    const update = { name };
    const unset = {};

    if (email) update.email = email;
    else unset.email = 1;

    if (phone) update.phone = phone;
    else unset.phone = 1;

    const changes = { $set: update };
    if (Object.keys(unset).length) changes.$unset = unset;

    const user = await User.findByIdAndUpdate(req.userId, changes, {
      new: true,
      runValidators: true
    }).select("name email phone");

    if (!user) {
      return res.status(404).json({ error: "Хэрэглэгч олдсонгүй" });
    }

    res.json({
      ok: true,
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email || "",
        phone: user.phone || ""
      }
    });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ error: "Энэ мэдээлэл өөр хэрэглэгчид бүртгэлтэй байна" });
    }
    console.error("Profile update error:", e.message);
    res.status(500).json({ error: "Профайл шинэчлэхэд алдаа гарлаа" });
  }
});

app.post("/api/auth/change-password", userOnly, customerAuthLimiter, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Бүх талбарыг бөглөнө үү" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Шинэ нууц үг дор хаяж 8 тэмдэгт байна" });
    }

    if (newPassword.length > 128) {
      return res.status(400).json({ error: "Нууц үг хэт урт байна" });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "Хэрэглэгч олдсонгүй" });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Хуучин нууц үг буруу байна" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ ok: true, message: "Нууц үг амжилттай солигдлоо" });
  } catch (e) {
    console.error("Password change error:", e.message);
    res.status(500).json({ error: "Нууц үг солиход алдаа гарлаа" });
  }
});

/* =========================
   ORDERS
========================= */

app.post("/api/orders", userOnly, orderLimiter, async (req, res) => {
  let reservedPoints = 0;
  let reservedPhone = "";

  try {
    const {
      customer,
      phone,
      address,
      note,
      items,
      paymentMethod,
      coupon
    } = req.body;

    if (
      !customer ||
      !phone ||
      !address ||
      !Array.isArray(items) ||
      !items.length
    ) {
      return res.status(400).json({
        error: "Мэдээллээ бүрэн бөглөнө үү"
      });
    }

    const cleanPhone = normalizePhone(phone);

    if (cleanPhone.length < 8) {
      return res.status(400).json({
        error: "Утасны дугаараа шалгана уу"
      });
    }

    // Ижил барааны захиалгын мөрүүдийг эхлээд нэгтгэнэ
    const groupedItems = new Map();

    for (const item of items) {
      const productId = String(item?.productId || "").trim();
      const quantity = Number(item?.quantity);

      if (
        !/^[a-f0-9]{24}$/i.test(productId) ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1
      ) {
        return res.status(400).json({
          error: "Барааны мэдээлэл эсвэл тоо ширхэг буруу байна"
        });
      }

      const previous = groupedItems.get(productId);
      const combinedQuantity = (previous?.quantity || 0) + quantity;

      if (!Number.isSafeInteger(combinedQuantity)) {
        return res.status(400).json({
          error: "Барааны тоо ширхэг хэт их байна"
        });
      }

      groupedItems.set(productId, {
        productId,
        quantity: combinedQuantity
      });
    }

    const clean = [];
    let subtotal = 0;

    for (const item of groupedItems.values()) {
      const p = await Product.findOne({
        _id: item.productId,
        active: true
      });

      if (!p || p.stock < item.quantity) {
        return res.status(400).json({
          error: `${p?.name || "Бараа"} үлдэгдэл хүрэлцэхгүй байна`
        });
      }

      const lineTotal = p.price * item.quantity;

      if (!Number.isFinite(lineTotal)) {
        return res.status(400).json({
          error: "Захиалгын үнийн мэдээлэл буруу байна"
        });
      }

      clean.push({
        productId: String(p._id),
        name: p.name,
        price: p.price,
        quantity: item.quantity
      });

      subtotal += lineTotal;

      if (!Number.isFinite(subtotal)) {
        return res.status(400).json({
          error: "Захиалгын нийт үнэ хэт их байна"
        });
      }
    }

    let discount = 0;

    if (coupon) {
      const c = await Coupon.findOne({
        code: String(coupon).toUpperCase(),
        active: true
      });

      if (c && (!c.expiresAt || c.expiresAt > Date.now())) {
        discount = Math.round(subtotal * c.percent / 100);
      }
    }

    const deliveryFee = subtotal >= 150000 ? 0 : 8000;

    const deducted = [];
    let createdOrder = null;

    try {
      // Барааны үлдэгдлийг дахин шалгаж хасна
      for (const item of clean) {
        const result = await Product.updateOne(
          { _id: item.productId, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } }
        );

        if (!result.modifiedCount) {
          throw new Error("STOCK_CHANGED");
        }
        deducted.push(item);
      }

      const total = Math.max(0, subtotal - discount) + deliveryFee;

      createdOrder = await Order.create({
        code: makeOrderCode(),
        userId: String(req.userId),
        customer: String(customer).trim(),
        phone: cleanPhone,
        address: String(address).trim(),
        note: String(note || "").slice(0, 1000),
        items: clean,
        subtotal,
        discount,
        total,
        deliveryFee,
        paymentMethod: "Хүлээн авахдаа төлөх",
        paymentStatus: "Төлөөгүй"
      });

      await recordOrderStockMovements(createdOrder, "Зарлага", "placed");

      res.status(201).json({
        ok: true,
        code: createdOrder.code,
        total: createdOrder.total,
        message: "Захиалга амжилттай бүртгэгдлээ"
      });
    } catch (orderErr) {
      if (createdOrder) {
        await StockMovement.deleteMany({ orderId: String(createdOrder._id) }).catch(() => {});
        await Order.deleteOne({ _id: createdOrder._id }).catch(() => {});
      }

      // Захиалга үүсэх явцад алдаа гарвал хасагдсан бараануудыг буцаан сэргээнэ
      for (const item of deducted) {
        await Product.updateOne(
          { _id: item.productId },
          { $inc: { stock: item.quantity } }
        ).catch(rollbackErr => {
          console.error(`Rollback error for product ${item.productId}:`, rollbackErr.message);
        });
      }
      throw orderErr;
    }
  } catch (e) {
    console.error("Order error:", e.message);

    if (e.message === "STOCK_CHANGED") {
      return res.status(409).json({
        error: "Барааны үлдэгдэл өөрчлөгдсөн тул захиалга үүсгэх боломжгүй боллоо. Та дахин оролдоно уу."
      });
    }

    res.status(500).json({
      error: "Захиалга үүсгэхэд алдаа гарлаа. Дахин шалгана уу."
    });
  }
});

/* =========================
   CUSTOMER MY ORDERS
========================= */

app.get("/api/my/orders", userOnly, async (req, res) => {
  try {
    const orders = await Order.find({
      userId: String(req.userId)
    })
      .select("code items total subtotal discount deliveryFee status paymentMethod paymentStatus createdAt updatedAt")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(orders);
  } catch (error) {
    console.error("My orders error:", error.message);
    res.status(500).json({ error: "Захиалгын түүх ачаалж чадсангүй" });
  }
});

/* =========================
   ORDER TRACKING
========================= */

// Захиалгын код + утсаар шалгана
app.get("/api/orders/track", async (req, res) => {
  try {
    const code = String(req.query.code || "").trim().toUpperCase();
    const phone = normalizePhone(req.query.phone);

    if (!code || !phone) {
      return res.status(400).json({
        error: "Захиалгын код болон утасны дугаараа оруулна уу"
      });
    }

    const order = await Order.findOne({
      code,
      phone
    }).lean();

    if (!order) {
      return res.status(404).json({
        error: "Захиалга олдсонгүй. Мэдээллээ шалгана уу."
      });
    }

    res.json({
      code: order.code,
      status: order.status,
      items: order.items,
      total: order.total,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    });
  } catch {
    res.status(500).json({ error: "Захиалга шалгахад алдаа гарлаа" });
  }
});

/* =========================
   LOYALTY POINTS
========================= */

// Онооны үлдэгдэл шалгах
app.get("/api/loyalty", async (req, res) => {
  try {
    const phone = normalizePhone(req.query.phone);

    if (phone.length < 8) {
      return res.status(400).json({ error: "Утасны дугаараа шалгана уу" });
    }

    const account = await Loyalty.findOne({ phone }).lean();

    res.json({
      points: account?.points || 0,
      totalEarned: account?.totalEarned || 0,
      rule: "Хүргэгдсэн захиалгын үнийн дүнгийн 1%-ийг оноо болгон авна."
    });
  } catch {
    res.status(500).json({ error: "Оноо шалгахад алдаа гарлаа" });
  }
});

/* =========================
   PRODUCT REVIEWS
========================= */

// Зөвшөөрөгдсөн үнэлгээнүүд
app.get("/api/products/:id/reviews", async (req, res) => {
  try {
    const reviews = await Review.find({
      productId: req.params.id,
      approved: true
    })
      .select("customer rating comment createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const average = reviews.length
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    res.json({
      reviews,
      count: reviews.length,
      average: Number(average.toFixed(1))
    });
  } catch {
    res.status(500).json({ error: "Үнэлгээ ачаалж чадсангүй" });
  }
});

// Зөвхөн хүргэгдсэн захиалгын бараанд үнэлгээ өгнө
app.post("/api/reviews", async (req, res) => {
  try {
    const {
      orderCode,
      phone,
      productId,
      rating,
      comment
    } = req.body;

    const cleanCode = String(orderCode || "").trim().toUpperCase();
    const cleanPhone = normalizePhone(phone);
    const stars = Number(rating);

    if (
      !cleanCode ||
      cleanPhone.length < 8 ||
      !productId ||
      !Number.isInteger(stars) ||
      stars < 1 ||
      stars > 5
    ) {
      return res.status(400).json({
        error: "Мэдээллээ зөв бөглөнө үү"
      });
    }

    const order = await Order.findOne({
      code: cleanCode,
      phone: cleanPhone,
      status: "Хүргэгдсэн"
    });

    if (!order) {
      return res.status(403).json({
        error: "Зөвхөн хүргэгдсэн захиалгад үнэлгээ өгөх боломжтой"
      });
    }

    const purchased = order.items.some(
      item => item.productId === String(productId)
    );

    if (!purchased) {
      return res.status(403).json({
        error: "Энэ бараа тухайн захиалгад байхгүй байна"
      });
    }

    const review = await Review.create({
      productId: String(productId),
      orderCode: cleanCode,
      customer: order.customer,
      phone: cleanPhone,
      rating: stars,
      comment: String(comment || "").slice(0, 1000)
    });

    res.status(201).json({
      ok: true,
      message: "Үнэлгээ админы шалгалтад илгээгдлээ",
      reviewId: review._id
    });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({
        error: "Та энэ захиалгын бараанд аль хэдийн үнэлгээ өгсөн байна"
      });
    }

    res.status(500).json({ error: "Үнэлгээ илгээж чадсангүй" });
  }
});

/* =========================
   CUSTOMER CHAT
========================= */

// Хэрэглэгч захиалгын чатаа харах
app.get("/api/orders/chat", userOnly, async (req, res) => {
  try {
    const code = String(req.query.code || "").trim().toUpperCase();
    const phone = normalizePhone(req.query.phone);

    const order = await Order.findOne({ code, phone, userId: String(req.userId) }).select("_id");

    if (!order) {
      return res.status(404).json({ error: "Захиалга олдсонгүй" });
    }

    const messages = await ChatMessage.find({ orderCode: code })
      .sort({ createdAt: 1 })
      .lean();

    res.json(messages);
  } catch {
    res.status(500).json({ error: "Чат ачаалж чадсангүй" });
  }
});

// Хэрэглэгч чат бичих
app.post("/api/orders/chat", userOnly, async (req, res) => {
  try {
    const code = String(req.body.code || "").trim().toUpperCase();
    const phone = normalizePhone(req.body.phone);
    const message = String(req.body.message || "").trim();

    if (!message || message.length > 2000) {
      return res.status(400).json({
        error: "Мессеж 1-2000 тэмдэгт байх ёстой"
      });
    }

    const order = await Order.findOne({ code, phone, userId: String(req.userId) });

    if (!order) {
      return res.status(404).json({ error: "Захиалга олдсонгүй" });
    }

    const saved = await ChatMessage.create({
      orderCode: code,
      sender: "customer",
      message
    });

    res.status(201).json(saved);
  } catch {
    res.status(500).json({ error: "Мессеж илгээж чадсангүй" });
  }
});

/* =========================
   ADMIN LOGIN
========================= */

app.post("/api/admin/login", adminLoginLimiter, async (req, res) => {
  const password = String(req.body.password || "");

  if (!process.env.ADMIN_PASSWORD) {
    return res.status(503).json({
      error: "Render дээр ADMIN_PASSWORD тохируулаагүй байна"
    });
  }

  const ok =
    await bcrypt.compare(password, process.env.ADMIN_PASSWORD).catch(() => false) ||
    password === process.env.ADMIN_PASSWORD;

  if (!ok) {
    return res.status(401).json({ error: "Нууц үг буруу байна" });
  }

  res.json({
    token: jwt.sign({ role: "admin" }, secret(), { expiresIn: "12h" })
  });
});

/* =========================
   ADMIN ANALYTICS
========================= */

app.get("/api/admin/overview", adminOnly, async (req, res) => {
  try {
    const [
      products,
      orders,
      all,
      lowStock,
      pendingReviews,
      unreadMessages
    ] = await Promise.all([
      Product.countDocuments({ active: true }),
      Order.countDocuments(),
      Order.find({ status: { $ne: "Цуцалсан" } })
        .select("total createdAt status"),
      Product.countDocuments({ active: true, stock: { $lte: 3 } }),
      Review.countDocuments({ approved: false }),
      ChatMessage.countDocuments({ sender: "customer", read: false })
    ]);

    const revenue = all.reduce((sum, order) => sum + (order.total || 0), 0);

    const month = new Date();
    month.setDate(1);
    month.setHours(0, 0, 0, 0);

    const monthly = all
      .filter(order => order.createdAt >= month)
      .reduce((sum, order) => sum + (order.total || 0), 0);

    const delivered = all.filter(o => o.status === "Хүргэгдсэн").length;
    const cancelled = await Order.countDocuments({ status: "Цуцалсан" });

    res.json({
      products,
      orders,
      revenue,
      monthly,
      lowStock,
      delivered,
      cancelled,
      pendingReviews,
      unreadMessages
    });
  } catch {
    res.status(500).json({ error: "Статистик ачаалж чадсангүй" });
  }
});

/* =========================
   ADMIN PRODUCTS
========================= */

app.get("/api/admin/products", adminOnly, async (req, res) => {
  res.json(await Product.find().sort({ createdAt: -1 }));
});

app.post("/api/admin/products", adminOnly, async (req, res) => {
  try {
    const p = await Product.create(req.body);
    res.status(201).json(p);
  } catch (e) {
    res.status(400).json({
      error: "Барааны мэдээллээ шалгана уу"
    });
  }
});

app.put("/api/admin/products/:id", adminOnly, async (req, res) => {
  try {
    const p = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!p) {
      return res.status(404).json({ error: "Бараа олдсонгүй" });
    }

    res.json(p);
  } catch {
    res.status(400).json({ error: "Шинэчлэхэд алдаа гарлаа" });
  }
});

app.delete("/api/admin/products/:id", adminOnly, async (req, res) => {
  const p = await Product.findByIdAndUpdate(
    req.params.id,
    { active: false },
    { new: true }
  );

  if (!p) {
    return res.status(404).json({ error: "Бараа олдсонгүй" });
  }

  res.json({ ok: true });
});

// Барааг бүр мөсөн устгах
app.delete("/api/admin/products/:id/permanent", adminOnly, async (req, res) => {
  try {
    const productId = String(req.params.id);

    // Идэвхтэй захиалгад байгаа барааг устгахгүй
    const activeOrder = await Order.exists({
      "items.productId": productId,
      $or: [
        { status: { $nin: ["Хүргэгдсэн", "Цуцалсан"] } },
        { status: "Цуцалсан", stockRestored: { $ne: true } }
      ]
    });

    if (activeOrder) {
      return res.status(409).json({
        error: "Энэ бараа дуусаагүй захиалгад байгаа тул одоогоор устгах боломжгүй."
      });
    }

    const product = await Product.findByIdAndDelete(productId);

    if (!product) {
      return res.status(404).json({ error: "Бараа олдсонгүй" });
    }

    res.json({ ok: true, message: "Бараа бүр мөсөн устгагдлаа." });
  } catch (error) {
    console.error("Permanent product delete error:", error.message);
    res.status(500).json({ error: "Бараа устгахад алдаа гарлаа." });
  }
});

/* =========================
   ADMIN INVENTORY
========================= */

app.get("/api/admin/inventory/movements", adminOnly, async (req, res) => {
  try {
    const movements = await StockMovement.find()
      .sort({ createdAt: -1 })
      .limit(300);

    res.json(movements);
  } catch (error) {
    console.error("Inventory history error:", error.message);
    res.status(500).json({ error: "Агуулахын түүх ачаалж чадсангүй." });
  }
});

app.post("/api/admin/inventory/movements", adminOnly, async (req, res) => {
  let changedProduct = null;

  try {
    const productId = String(req.body.productId || "");
    const type = String(req.body.type || "");
    const quantity = Number(req.body.quantity);
    const note = String(req.body.note || "").trim().slice(0, 300);

    if (!["Орлого", "Зарлага"].includes(type)) {
      return res.status(400).json({ error: "Үйлдлийн төрөл буруу байна." });
    }

    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000) {
      return res.status(400).json({ error: "Тоо ширхэг 1-100000 бүхэл тоо байх ёстой." });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ error: "Бараа олдсонгүй." });
    }

    const before = product.stock;
    const after = type === "Орлого"
      ? before + quantity
      : before - quantity;

    if (after < 0) {
      return res.status(409).json({ error: "Агуулахад хүрэлцэхүйц үлдэгдэл алга." });
    }

    changedProduct = await Product.findOneAndUpdate(
      { _id: productId, stock: before },
      { $inc: { stock: type === "Орлого" ? quantity : -quantity } },
      { new: true }
    );

    if (!changedProduct) {
      return res.status(409).json({
        error: "Үлдэгдэл зэрэг өөрчлөгдсөн байна. Дахин оролдоно уу."
      });
    }

    try {
      const movement = await StockMovement.create({
        productId: String(product._id),
        productName: product.name,
        type,
        quantity,
        before,
        after,
        note,
        source: "manual"
      });

      return res.status(201).json({
        ok: true,
        product: changedProduct,
        movement
      });
    } catch (historyError) {
      await Product.updateOne(
        { _id: productId, stock: after },
        { $inc: { stock: type === "Орлого" ? -quantity : quantity } }
      );

      changedProduct = null;
      throw historyError;
    }
  } catch (error) {
    console.error("Inventory movement error:", error.message);
    res.status(500).json({ error: "Агуулахын бүртгэл хадгалж чадсангүй." });
  }
});

/* =========================
   ADMIN ORDERS
========================= */

app.get("/api/admin/orders", adminOnly, async (req, res) => {
  res.json(
    await Order.find()
      .sort({ createdAt: -1 })
      .limit(300)
  );
});

app.patch("/api/admin/orders/:id", adminOnly, async (req, res) => {
  try {
    const allowed = [
      "Шинэ",
      "Баталгаажсан",
      "Хүргэлтэд гарсан",
      "Хүргэгдсэн",
      "Цуцалсан"
    ];

    const patch = {};
    let stockAction = null;

    if (allowed.includes(req.body.status)) {
      patch.status = req.body.status;
    }

    if (["Төлөөгүй", "Төлсөн", "Буцаасан"].includes(req.body.paymentStatus)) {
      patch.paymentStatus = req.body.paymentStatus;
    }

    const existingOrder = await Order.findById(req.params.id);

    if (!existingOrder) {
      return res.status(404).json({ error: "Захиалга олдсонгүй" });
    }

    // Захиалга цуцлах үед үлдэгдлийг буцаан нэмнэ
    if (patch.status === "Цуцалсан" && !existingOrder.stockRestored) {
      const restoredItems = [];

      try {
        const combinedItems = combineOrderItems(existingOrder.items || []);

        for (const item of combinedItems) {
          const result = await Product.updateOne(
            { _id: item.productId },
            { $inc: { stock: item.quantity } }
          );

          if (!result.modifiedCount) {
            throw new Error(`${item.name || "Бараа"} олдсонгүй.`);
          }

          restoredItems.push(item);
        }

        await recordOrderStockMovements(existingOrder, "Орлого", "cancelled");
      } catch (stockError) {
        await StockMovement.deleteMany({
          orderId: String(existingOrder._id),
          eventKey: { $regex: `^${existingOrder._id}:cancelled:` }
        }).catch(() => {});
        let rollbackFailed = false;

        for (const item of restoredItems) {
          try {
            const result = await Product.updateOne(
              { _id: item.productId, stock: { $gte: item.quantity } },
              { $inc: { stock: -item.quantity } }
            );

            if (!result.modifiedCount) rollbackFailed = true;
          } catch (rollbackError) {
            rollbackFailed = true;
            console.error("Stock restore rollback failed:", rollbackError.message);
          }
        }

        console.error("Order cancellation stock error:", stockError.message);

        return res.status(rollbackFailed ? 500 : 409).json({
          error: rollbackFailed
            ? "Үлдэгдэл буцаах явцад алдаа гарлаа. Админ үлдэгдлийг шалгана уу."
            : `Захиалга цуцлагдсангүй: ${stockError.message}`
        });
      }

      patch.stockRestored = true;
      stockAction = { type: "cancelled", items: restoredItems };
    }

    // Цуцалсан захиалгыг дахин идэвхжүүлэх үед үлдэгдлийг хасна
    if (
      existingOrder.status === "Цуцалсан" &&
      existingOrder.stockRestored &&
      patch.status &&
      patch.status !== "Цуцалсан"
    ) {
      const deductedItems = [];

      try {
        const combinedItems = combineOrderItems(existingOrder.items || []);

        for (const item of combinedItems) {
          const result = await Product.updateOne(
            {
              _id: item.productId,
              stock: { $gte: item.quantity }
            },
            { $inc: { stock: -item.quantity } }
          );

          if (!result.modifiedCount) {
            throw new Error(
              `${item.name || "Бараа"}-ны үлдэгдэл хүрэлцэхгүй байна.`
            );
          }

          deductedItems.push(item);
        }

        await recordOrderStockMovements(existingOrder, "Зарлага", "reactivated");
      } catch (stockError) {
        await StockMovement.deleteMany({
          orderId: String(existingOrder._id),
          eventKey: { $regex: `^${existingOrder._id}:reactivated:` }
        }).catch(() => {});
        let rollbackFailed = false;

        for (const item of deductedItems) {
          try {
            const result = await Product.updateOne(
              { _id: item.productId },
              { $inc: { stock: item.quantity } }
            );

            if (!result.modifiedCount) rollbackFailed = true;
          } catch (rollbackError) {
            rollbackFailed = true;
            console.error("Stock deduction rollback failed:", rollbackError.message);
          }
        }

        console.error("Order reactivation stock error:", stockError.message);

        return res.status(rollbackFailed ? 500 : 409).json({
          error: rollbackFailed
            ? "Үлдэгдэл буцаах явцад алдаа гарлаа. Админ үлдэгдлийг шалгана уу."
            : `Захиалгыг сэргээсэнгүй: ${stockError.message}`
        });
      }

      patch.stockRestored = false;
      stockAction = { type: "reactivated", items: deductedItems };
    }

    let order;

    try {
      order = await Order.findByIdAndUpdate(
        req.params.id,
        patch,
        { new: true }
      );

      if (!order) {
        throw new Error("ORDER_SAVE_FAILED");
      }
    } catch (saveError) {
      let rollbackFailed = false;

      if (stockAction) {
        for (const item of stockAction.items) {
          try {
            const isCancellation = stockAction.type === "cancelled";

            const result = await Product.updateOne(
              isCancellation
                ? {
                    _id: item.productId,
                    stock: { $gte: item.quantity }
                  }
                : { _id: item.productId },
              {
                $inc: {
                  stock: isCancellation
                    ? -item.quantity
                    : item.quantity
                }
              }
            );

            if (!result.modifiedCount) {
              rollbackFailed = true;
            }
          } catch (rollbackError) {
            rollbackFailed = true;
            console.error(
              "Order save rollback failed:",
              rollbackError.message
            );
          }
        }

        if (!rollbackFailed) {
          try {
            const eventName = stockAction.type;

            await StockMovement.deleteMany({
              orderId: String(existingOrder._id),
              eventKey: {
                $regex: `^${existingOrder._id}:${eventName}:`
              }
            });
          } catch (historyError) {
            rollbackFailed = true;
            console.error(
              "Movement history rollback failed:",
              historyError.message
            );
          }
        }
      }

      console.error("Order save error:", saveError.message);

      return res.status(500).json({
        error: rollbackFailed
          ? "Захиалгын хадгалалт бүтэлгүйтлээ. Агуулахын үлдэгдэл болон түүхийг админ шалгана уу."
          : "Захиалга хадгалагдсангүй. Агуулахын өөрчлөлтийг буцаалаа."
      });
    }

    // Онооны тэмдэглэгээ болон онооны нэмэгдлийг нэг transaction-д гүйцэтгэнэ
    if (order.status === "Хүргэгдсэн" && !order.pointsAwarded) {
      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          const claim = await Order.updateOne(
            {
              _id: order._id,
              status: "Хүргэгдсэн",
              pointsAwarded: { $ne: true }
            },
            {
              $set: { pointsAwarded: true }
            },
            { session }
          );

          if (claim.modifiedCount === 1) {
            const earned = Math.floor((order.total || 0) * 0.01);

            if (earned > 0) {
              await Loyalty.findOneAndUpdate(
                { phone: order.phone },
                {
                  $inc: {
                    points: earned,
                    totalEarned: earned
                  }
                },
                {
                  upsert: true,
                  new: true,
                  setDefaultsOnInsert: true,
                  session
                }
              );
            }
          }
        });

        const latestOrder = await Order.findById(order._id)
          .select("pointsAwarded")
          .lean();

        order.pointsAwarded = Boolean(latestOrder?.pointsAwarded);
      } finally {
        await session.endSession();
      }
    }

    res.json(order);
  } catch {
    res.status(500).json({ error: "Захиалга шинэчилж чадсангүй" });
  }
});

/* =========================
   ADMIN REVIEWS
========================= */

app.get("/api/admin/reviews", adminOnly, async (req, res) => {
  res.json(await Review.find().sort({ createdAt: -1 }).limit(300));
});

app.patch("/api/admin/reviews/:id", adminOnly, async (req, res) => {
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { approved: Boolean(req.body.approved) },
    { new: true }
  );

  if (!review) {
    return res.status(404).json({ error: "Үнэлгээ олдсонгүй" });
  }

  res.json(review);
});

app.delete("/api/admin/reviews/:id", adminOnly, async (req, res) => {
  await Review.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

/* =========================
   ADMIN CHAT
========================= */

app.get("/api/admin/chats", adminOnly, async (req, res) => {
  const chats = await ChatMessage.aggregate([
    {
      $sort: { createdAt: -1 }
    },
    {
      $group: {
        _id: "$orderCode",
        lastMessage: { $first: "$message" },
        sender: { $first: "$sender" },
        updatedAt: { $first: "$createdAt" },
        unread: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$sender", "customer"] }, { $eq: ["$read", false] }] },
              1,
              0
            ]
          }
        }
      }
    },
    { $sort: { updatedAt: -1 } }
  ]);

  res.json(chats);
});

app.get("/api/admin/chats/:code", adminOnly, async (req, res) => {
  const code = String(req.params.code).toUpperCase();

  await ChatMessage.updateMany(
    { orderCode: code, sender: "customer" },
    { read: true }
  );

  const messages = await ChatMessage.find({ orderCode: code })
    .sort({ createdAt: 1 });

  res.json(messages);
});

app.post("/api/admin/chats/:code", adminOnly, async (req, res) => {
  const message = String(req.body.message || "").trim();

  if (!message || message.length > 2000) {
    return res.status(400).json({ error: "Мессежээ шалгана уу" });
  }

  const code = String(req.params.code).toUpperCase();
  const order = await Order.findOne({ code });

  if (!order) {
    return res.status(404).json({ error: "Захиалга олдсонгүй" });
  }

  const saved = await ChatMessage.create({
    orderCode: code,
    sender: "admin",
    message
  });

  res.status(201).json(saved);
});

/* =========================
   ADMIN COUPONS
========================= */

app.get("/api/admin/coupons", adminOnly, async (req, res) => {
  res.json(await Coupon.find().sort({ createdAt: -1 }));
});

app.post("/api/admin/coupons", adminOnly, async (req, res) => {
  try {
    const c = await Coupon.create({
      code: String(req.body.code || "").toUpperCase(),
      percent: Number(req.body.percent),
      expiresAt: req.body.expiresAt || null
    });

    res.status(201).json(c);
  } catch {
    res.status(400).json({
      error: "Купоны код давхардсан эсвэл мэдээлэл буруу байна"
    });
  }
});

app.delete("/api/admin/coupons/:id", adminOnly, async (req, res) => {
  await Coupon.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

/* =========================
   CLOUDINARY UPLOAD
========================= */

app.post("/api/admin/upload-signature", adminOnly, async (req, res) => {
  if (!cloudinaryReady()) {
    return res.status(503).json({
      error: "Cloudinary тохируулаагүй. Зургийн шууд URL ашиглаж болно."
    });
  }

  const timestamp = Math.round(Date.now() / 1000);
  const params = { timestamp };

  const signature = cloudinary.utils.api_sign_request(
    params,
    process.env.CLOUDINARY_API_SECRET
  );

  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    timestamp,
    signature
  });
});

/* =========================
   ADMIN PAGE
========================= */

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

/* =========================
   START SERVER & DB CONNECTION
========================= */

const port = process.env.PORT || 3000;

mongoose.connection.on("connected", () => {
  console.log("VELTRIX database connected");
});

mongoose.connection.on("disconnected", () => {
  console.warn("VELTRIX database disconnected!");
});

mongoose.connection.on("error", err => {
  console.error("VELTRIX database connection error:", err.message);
});

async function startServerWithRetry(maxRetries = 5, delayMs = 3000) {
  const uri = process.env.MONGODB_URI || "";

  if (!uri) {
    console.error("FATAL: MONGODB_URI environment variable is not defined!");
    process.exit(1);
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 8000
      });

      app.listen(port, () => {
        console.log("VELTRIX ULTIMATE running on " + port);
      });
      return;
    } catch (err) {
      console.error(`Database connection attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt === maxRetries) {
        console.error("FATAL: Could not connect to MongoDB after multiple attempts.");
        process.exit(1);
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

startServerWithRetry();