let products = [];
let cart = JSON.parse(localStorage.getItem("veltrix-cart") || "[]");
let currentTrackOrder = null;

const money = n => Number(n || 0).toLocaleString("mn-MN") + "₮";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function dateTime(d) {
  if (!d) return "-";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("mn-MN");
}

/* =================================
   PRODUCT CATALOG
================================= */

async function load() {
  try {
    const res = await fetch("/api/products");
    if (!res.ok) throw new Error();
    products = await res.json();
    render();
  } catch {
    const grid = document.querySelector("#productsGrid");
    if (grid) grid.textContent = "Бараа ачаалж чадсангүй.";
  }
}

function render() {
  const searchInput = document.querySelector("#search");
  const q = (searchInput ? searchInput.value : "").toLowerCase().trim();

  const list = products.filter(p =>
    (p.name + " " + (p.category || "")).toLowerCase().includes(q)
  );

  const grid = document.querySelector("#productsGrid");
  if (!grid) return;

  grid.innerHTML = list.map(p => `
    <article class="product">
      <div class="photo">
        ${p.image
          ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async">`
          : "<span>VELTRIX</span>"}
      </div>

      <div class="product-info">
        <small>${esc(p.category || "Сэлбэг")}</small>
        <h3>${esc(p.name)}</h3>
        <p>${money(p.price)}</p>
        <small>Үлдэгдэл: ${Number(p.stock || 0)}</small>

        <button class="btn details-btn" data-action="product-open" data-id="${esc(p._id)}">
          ДЭЛГЭРЭНГҮЙ ↗
        </button>

        <button class="btn red wide" data-action="cart-add" data-id="${esc(p._id)}" ${Number(p.stock || 0) <= 0 ? "disabled" : ""}>
          ${Number(p.stock || 0) > 0 ? "САГСАНД НЭМЭХ" : "ДУУССАН"}
        </button>
      </div>
    </article>
  `).join("") || "<p>Бараа олдсонгүй.</p>";
}

/* =================================
   PRODUCT DETAILS & REVIEWS
================================= */

async function openProduct(id) {
  const p = products.find(x => x._id === id);
  if (!p) return;

  let modal = document.querySelector("#productModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "productModal";
    modal.className = "product-modal";
    document.body.appendChild(modal);
  }

  const compatibility = p.compatibility || {};
  const specs = [
    ["Дугуйн хэмжээ", compatibility.wheelSizes],
    ["Тоормос", compatibility.brakeTypes],
    ["Арааны тоо", compatibility.speeds],
    ["Дугуйн төрөл", compatibility.bikeTypes]
  ].filter(([key, value]) => value && (Array.isArray(value) ? value.length : true));

  modal.innerHTML = `
    <div class="product-modal-content">
      <button class="modal-close" data-action="product-close">✕</button>

      <div class="modal-image">
        ${p.image
          ? `<img src="${esc(p.image)}" alt="${esc(p.name)}">`
          : "<span>VELTRIX</span>"}
      </div>

      <div class="modal-info">
        <small class="modal-category">${esc(p.category || "Сэлбэг")}</small>
        <h2>${esc(p.name)}</h2>

        <div class="modal-price">${money(p.price)}</div>

        <p class="modal-stock">
          Үлдэгдэл: <b>${Number(p.stock || 0)}</b>
        </p>

        <div class="modal-description">
          ${esc(p.description || "Энэ бүтээгдэхүүний дэлгэрэнгүй тайлбар одоогоор байхгүй байна.")}
        </div>

        ${specs.length ? `
          <div class="modal-specs">
            <h3>ТОХИРОХ ҮЗҮҮЛЭЛТ</h3>
            ${specs.map(([key, value]) => `
              <div><span>${key}</span><b>${esc(Array.isArray(value) ? value.join(", ") : value)}</b></div>
            `).join("")}
          </div>
        ` : ""}

        <button class="btn red wide modal-add"
          data-action="product-add-close" data-id="${esc(p._id)}"
          ${Number(p.stock || 0) <= 0 ? "disabled" : ""}>
          ${Number(p.stock || 0) > 0 ? "САГСАНД НЭМЭХ" : "ДУУССАН"}
        </button>

        <!-- REVIEWS SECTION -->
        <div class="modal-reviews-section">
          <div class="modal-reviews-header">
            <h3>ХЭРЭГЛЭГЧИЙН ҮНЭЛГЭЭ</h3>
            <div id="productReviewSummary" class="review-stars-summary">Уншиж байна...</div>
          </div>

          <div id="productReviewsList" class="reviews-list">
            <p style="color:#aaa;font-size:12px;">Үнэлгээ ачаалж байна...</p>
          </div>

          <button class="review-form-toggle-btn" data-action="review-toggle">
            + Үнэлгээ бичих (хүргэгдсэн захиалгаар)
          </button>

          <form id="productReviewForm" class="product-review-form hidden" onsubmit="submitReview(event, '${esc(p._id)}')">
            <h4>ҮНЭЛГЭЭ ӨГӨХ</h4>
            <input id="revOrderCode" placeholder="Захиалгын код (Жнь: VX1234ABCD)" required autocomplete="off">
            <input id="revPhone" placeholder="Утасны дугаар (Жнь: 99112233)" required autocomplete="off">
            <select id="revRating" required>
              <option value="5">★★★★★ (5 од - Маш сайн)</option>
              <option value="4">★★★★☆ (4 од - Сайн)</option>
              <option value="3">★★★☆☆ (3 од - Дундаж)</option>
              <option value="2">★★☆☆☆ (2 од - Муу)</option>
              <option value="1">★☆☆☆☆ (1 од - Маш муу)</option>
            </select>
            <textarea id="revComment" placeholder="Сэтгэгдэл бичих (заавал биш)..." maxlength="1000"></textarea>
            <button type="submit" class="btn purple wide" id="revSubmitBtn">ҮНЭЛГЭЭ ИЛГЭЭХ</button>
            <p id="revMsg" class="review-msg"></p>
          </form>
        </div>
      </div>
    </div>
  `;

  modal.classList.add("active");
  document.body.style.overflow = "hidden";

  // Load reviews for this product
  loadProductReviews(p._id);
}

function closeProduct() {
  const modal = document.querySelector("#productModal");
  if (modal) modal.classList.remove("active");
  document.body.style.overflow = "";
}

window.toggleReviewForm = () => {
  const form = document.querySelector("#productReviewForm");
  if (form) form.classList.toggle("hidden");
};

async function loadProductReviews(productId) {
  try {
    const res = await fetch(`/api/products/${productId}/reviews`);
    if (!res.ok) throw new Error();
    const data = await res.json();

    const summaryEl = document.querySelector("#productReviewSummary");
    const listEl = document.querySelector("#productReviewsList");

    if (summaryEl) {
      if (data.count > 0) {
        summaryEl.innerHTML = `★ ${data.average} / 5.0 <small style="color:#aaa;font-weight:normal">(${data.count} үнэлгээ)</small>`;
      } else {
        summaryEl.innerHTML = `<small style="color:#aaa;font-weight:normal">Үнэлгээ одоогоор алга</small>`;
      }
    }

    if (listEl) {
      if (!data.reviews || data.reviews.length === 0) {
        listEl.innerHTML = `<p style="color:#888;font-size:12px;margin:10px 0">Одоогоор үнэлгээ бичигдээгүй байна.</p>`;
      } else {
        listEl.innerHTML = data.reviews.map(r => `
          <div class="review-item">
            <div class="review-item-head">
              <b>${esc(r.customer)}</b>
              <span>${"★".repeat(Math.max(0, Math.min(5, Number(r.rating) || 0)))}${"☆".repeat(5 - Math.max(0, Math.min(5, Number(r.rating) || 0)))}</span>
            </div>
            ${r.comment ? `<p>${esc(r.comment)}</p>` : ""}
            <small>${dateTime(r.createdAt)}</small>
          </div>
        `).join("");
      }
    }
  } catch {
    const summaryEl = document.querySelector("#productReviewSummary");
    if (summaryEl) summaryEl.textContent = "";
  }
}

window.submitReview = async (e, productId) => {
  e.preventDefault();
  const btn = document.querySelector("#revSubmitBtn");
  const msg = document.querySelector("#revMsg");
  const orderCode = (document.querySelector("#revOrderCode").value || "").trim();
  const phone = (document.querySelector("#revPhone").value || "").trim();
  const rating = Number(document.querySelector("#revRating").value);
  const comment = (document.querySelector("#revComment").value || "").trim();

  if (!orderCode || !phone) {
    if (msg) {
      msg.textContent = "Захиалгын код болон утсаа оруулна уу.";
      msg.style.color = "#f87171";
    }
    return;
  }

  btn.disabled = true;
  msg.textContent = "Илгээж байна...";
  msg.style.color = "#c084fc";

  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        orderCode,
        phone,
        rating,
        comment
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Үнэлгээ илгээж чадсангүй");

    msg.textContent = "Үнэлгээ амжилттай бүртгэгдлээ! Админы шалгалтын дараа нийтлэгдэнэ.";
    msg.style.color = "#4ade80";
    document.querySelector("#productReviewForm").reset();
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#f87171";
  } finally {
    btn.disabled = false;
  }
};

/* =================================
   SHOPPING CART & LIVE CALCULATIONS
================================= */

function save() {
  localStorage.setItem("veltrix-cart", JSON.stringify(cart));
  const countEl = document.querySelector("#cartCount");
  if (countEl) {
    countEl.textContent = cart.reduce((s, x) => s + x.quantity, 0);
  }
  drawCart();
}

function add(id) {
  if (!localStorage.getItem("vx-user-token")) {
    vxPendingCartProductId = id;
    vxOpenAuth();
    return;
  }

  const p = products.find(x => x._id === id);
  if (!p || Number(p.stock || 0) <= 0) return;

  const existing = cart.find(x => x.productId === id);

  if (existing) {
    if (existing.quantity >= Number(p.stock)) {
      alert("Үлдэгдэл хүрэлцэхгүй байна.");
      return;
    }
    existing.quantity++;
  } else {
    cart.push({
      productId: id,
      name: p.name,
      price: p.price,
      quantity: 1
    });
  }

  save();
}

function updateQty(id, delta) {
  const item = cart.find(x => x.productId === id);
  if (!item) return;

  const p = products.find(x => x._id === id);

  if (delta > 0) {
    if (p && item.quantity >= Number(p.stock)) {
      alert("Барааны үлдэгдэл хүрэлцэхгүй байна.");
      return;
    }
    item.quantity++;
  } else if (delta < 0) {
    item.quantity--;
    if (item.quantity <= 0) {
      cart = cart.filter(x => x.productId !== id);
    }
  }

  save();
}

function removeItem(id) {
  cart = cart.filter(x => x.productId !== id);
  save();
}

function drawCart() {
  const itemsContainer = document.querySelector("#cartItems");
  if (!itemsContainer) return;

  if (!cart.length) {
    itemsContainer.innerHTML = "<p style='color:#888;padding:20px 0;'>Таны сагс хоосон байна.</p>";
  } else {
    itemsContainer.innerHTML = cart.map(x => `
      <div class="cart-row">
        <div class="cart-item-name">
          <b>${esc(x.name)}</b>
          <small>${money(x.price)}</small>
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" data-action="qty-minus" data-id="${esc(x.productId)}">−</button>
          <span>${x.quantity}</span>
          <button class="qty-btn" data-action="qty-plus" data-id="${esc(x.productId)}">+</button>
        </div>
        <b class="cart-item-sub">${money(x.price * x.quantity)}</b>
        <button class="cart-del-btn" data-action="cart-remove" data-id="${esc(x.productId)}">✕</button>
      </div>
    `).join("");
  }

  // Live Calculations
  const subtotal = cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);
  const deliveryFee = subtotal >= 150000 || subtotal === 0 ? 0 : 8000;
  const grandTotal = subtotal > 0 ? (subtotal + deliveryFee) : 0;

  const subtotalEl = document.querySelector("#cartSubtotal");
  const deliveryEl = document.querySelector("#cartDelivery");
  const totalEl = document.querySelector("#cartTotal");
  const noticeEl = document.querySelector("#freeDeliveryNotice");

  if (subtotalEl) subtotalEl.textContent = money(subtotal);
  if (deliveryEl) {
    deliveryEl.textContent = subtotal >= 150000 && subtotal > 0 ? "ҮНЭГҮЙ (0₮)" : money(deliveryFee);
  }
  if (totalEl) totalEl.textContent = money(grandTotal);

  if (noticeEl) {
    if (subtotal > 0 && subtotal < 150000) {
      const remaining = 150000 - subtotal;
      noticeEl.innerHTML = `150,000₮-с дээш үнэгүй хүргэлттэй. (Дахин <strong>${money(remaining)}</strong> нэмбэл үнэгүй!)`;
    } else if (subtotal >= 150000) {
      noticeEl.innerHTML = `✨ Баяр хүргэе! Та <strong>ҮНЭГҮЙ ХҮРГЭЛТИЙН</strong> болзол хангалаа.`;
    } else {
      noticeEl.innerHTML = `150,000₮-с дээш үнийн дүнтэй захиалгад хүргэлт <strong>ҮНЭГҮЙ</strong>!`;
    }
  }
}

/* =================================
   ORDER SUBMISSION
================================= */

const orderBtn = document.querySelector("#orderBtn");
if (orderBtn) {
  orderBtn.onclick = async () => {
    if (!localStorage.getItem("vx-user-token")) {
      vxPendingCheckout = true;
      vxOpenAuth();
      return;
    }

    const customerEl = document.querySelector("#customer");
    const phoneEl = document.querySelector("#phone");
    const addressEl = document.querySelector("#address");
    const couponEl = document.querySelector("#coupon");
    const paymentEl = document.querySelector("#payment");
    const noteEl = document.querySelector("#note");
    const msg = document.querySelector("#orderMsg");

    if (!cart.length) {
      alert("Таны сагс хоосон байна. Эхлээд бараа сонгоно уу.");
      return;
    }

    const customer = (customerEl?.value || "").trim();
    const phone = (phoneEl?.value || "").trim();
    const address = (addressEl?.value || "").trim();

    if (!customer || !phone || !address) {
      if (msg) {
        msg.textContent = "Нэр, утасны дугаар болон хаягаа бүрэн бөглөнө үү.";
        msg.style.color = "#f87171";
      }
      return;
    }

    orderBtn.disabled = true;
    if (msg) {
      msg.textContent = "Захиалга илгээж байна...";
      msg.style.color = "#c084fc";
    }

    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("vx-user-token") || ""}`
        },
        body: JSON.stringify({
          customer,
          phone,
          address,
          note: noteEl?.value || "",
          coupon: couponEl?.value || "",
          paymentMethod: paymentEl?.value || "Хүлээн авахдаа төлөх",
          items: cart
        })
      });

      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Захиалга үүсгэхэд алдаа гарлаа");

      if (msg) {
        msg.innerHTML = `
          <div style="background:rgba(168,85,247,0.15);border:1px solid #a855f7;padding:12px;border-radius:8px;margin-top:10px;">
            <b style="color:#a855f7;display:block;margin-bottom:4px;">🎉 Захиалга амжилттай бүртгэгдлээ!</b>
            <span>Код: <strong>${esc(d.code)}</strong> · Нийт: ${money(d.total)}</span>
            <button class="btn purple wide" style="margin-top:10px" data-action="track-open" data-code="${esc(d.code)}" data-phone="${esc(phone)}">
              Захиалгаа шалгах ↗
            </button>
          </div>
        `;
        msg.style.color = "#fff";
      }

      cart = [];
      save();
      await load();
    } catch (e) {
      if (msg) {
        msg.textContent = e.message;
        msg.style.color = "#f87171";
      }
    } finally {
      orderBtn.disabled = false;
    }
  };
}

/* =================================
   ORDER TRACKING & CUSTOMER CHAT
================================= */

function openTrack(code = "", phone = "") {
  const modal = document.querySelector("#trackModal");
  if (!modal) return;

  const codeInput = document.querySelector("#trackCodeInput");
  const phoneInput = document.querySelector("#trackPhoneInput");

  if (codeInput && code) codeInput.value = code;
  if (phoneInput && phone) phoneInput.value = phone;

  modal.classList.add("active");
  document.body.style.overflow = "hidden";

  if (code && phone) {
    submitTrack(code, phone);
  }
}

function closeTrack() {
  const modal = document.querySelector("#trackModal");
  if (modal) modal.classList.remove("active");
  document.body.style.overflow = "";
}

async function submitTrack(code, phone) {
  const loading = document.querySelector("#trackLoading");
  const errorEl = document.querySelector("#trackError");
  const resultEl = document.querySelector("#trackResult");

  if (loading) loading.classList.remove("hidden");
  if (errorEl) errorEl.classList.add("hidden");
  if (resultEl) resultEl.classList.add("hidden");

  try {
    const res = await fetch(`/api/orders/track?code=${encodeURIComponent(code)}&phone=${encodeURIComponent(phone)}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Захиалга олдсонгүй");

    currentTrackOrder = { code: data.code, phone };

    // Populate order details
    const codeEl = document.querySelector("#trackResultCode");
    const dateEl = document.querySelector("#trackResultDate");
    const totalEl = document.querySelector("#trackResultTotal");
    const badgeEl = document.querySelector("#trackStatusBadge");
    const itemsEl = document.querySelector("#trackResultItems");

    if (codeEl) codeEl.textContent = data.code;
    if (dateEl) dateEl.textContent = dateTime(data.createdAt);
    if (totalEl) totalEl.textContent = money(data.total);

    if (badgeEl) {
      badgeEl.textContent = data.status || "Шинэ";
      badgeEl.className = "track-status-badge";
      if (data.status === "Шинэ") badgeEl.classList.add("status-shne");
      if (data.status === "Баталгаажсан") badgeEl.classList.add("status-bat");
      if (data.status === "Хүргэлтэд гарсан") badgeEl.classList.add("status-hurgelt");
      if (data.status === "Хүргэгдсэн") badgeEl.classList.add("status-hurgsen");
      if (data.status === "Цуцалсан") badgeEl.classList.add("status-tsutsalsan");
    }

    if (itemsEl) {
      itemsEl.innerHTML = (data.items || []).map(i => `
        <div>
          <span>${esc(i.name)} × ${i.quantity}</span>
          <b>${money(i.price * i.quantity)}</b>
        </div>
      `).join("");
    }

    if (resultEl) resultEl.classList.remove("hidden");

    // Load chat messages
    await loadCustomerChat(data.code, phone);
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.classList.remove("hidden");
    }
  } finally {
    if (loading) loading.classList.add("hidden");
  }
}

async function loadCustomerChat(code, phone) {
  const container = document.querySelector("#customerChatMessages");
  if (!container) return;

  try {
    const res = await fetch(`/api/orders/chat?code=${encodeURIComponent(code)}&phone=${encodeURIComponent(phone)}`, {
      headers: {
        "Authorization": `Bearer ${localStorage.getItem("vx-user-token") || ""}`
      }
    });
    if (!res.ok) throw new Error();
    const messages = await res.json();

    if (!messages || messages.length === 0) {
      container.innerHTML = "<p class='empty-chat' style='color:#777;font-size:12px;text-align:center;'>Асуулт, хүсэлт байвал доор бичнэ үү.</p>";
    } else {
      container.innerHTML = messages.map(m => `
        <div class="customer-chat-msg ${m.sender === "admin" ? "admin" : "customer"}">
          <small>${m.sender === "admin" ? "VELTRIX Support" : "Та"} · ${dateTime(m.createdAt)}</small>
          <span>${esc(m.message)}</span>
        </div>
      `).join("");
    }

    container.scrollTop = container.scrollHeight;
  } catch {
    container.innerHTML = "<p style='color:#f87171;font-size:12px;'>Чат ачаалж чадсангүй.</p>";
  }
}

// Track Modal & Chat Listeners
const trackOpenBtn = document.querySelector("#trackOpenBtn");
if (trackOpenBtn) {
  trackOpenBtn.onclick = e => {
    e.preventDefault();
    openTrack();
  };
}

const trackCloseBtn = document.querySelector("#trackClose");
if (trackCloseBtn) {
  trackCloseBtn.onclick = closeTrack;
}

const trackForm = document.querySelector("#trackForm");
if (trackForm) {
  trackForm.onsubmit = e => {
    e.preventDefault();
    const code = (document.querySelector("#trackCodeInput")?.value || "").trim().toUpperCase();
    const phone = (document.querySelector("#trackPhoneInput")?.value || "").trim();
    if (code && phone) submitTrack(code, phone);
  };
}

const customerChatForm = document.querySelector("#customerChatForm");
if (customerChatForm) {
  customerChatForm.onsubmit = async e => {
    e.preventDefault();
    if (!currentTrackOrder) return;

    const input = document.querySelector("#customerChatInput");
    const sendBtn = document.querySelector("#customerChatSend");
    const message = (input?.value || "").trim();

    if (!message) return;

    sendBtn.disabled = true;

    try {
      const res = await fetch("/api/orders/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("vx-user-token") || ""}`
        },
        body: JSON.stringify({
          code: currentTrackOrder.code,
          phone: currentTrackOrder.phone,
          message
        })
      });

      if (!res.ok) throw new Error();
      if (input) input.value = "";
      await loadCustomerChat(currentTrackOrder.code, currentTrackOrder.phone);
    } catch {
      alert("Мессеж илгээж чадсангүй. Дахин оролдоно уу.");
    } finally {
      sendBtn.disabled = false;
    }
  };
}

// Global Modal Overlay & Escape Listeners
document.addEventListener("click", e => {
  if (e.target.id === "productModal") closeProduct();
  if (e.target.id === "trackModal") closeTrack();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeProduct();
    closeTrack();
  }
});

// Search input
const searchEl = document.querySelector("#search");
if (searchEl) searchEl.oninput = render;

// Cart open/close - CSP compatible
const cartOpenEl = document.querySelector("#cartOpen");
const cartCloseEl = document.querySelector("#cartClose");
const cartEl = document.querySelector("#cart");

function openCart() {
  if (cartEl) cartEl.classList.remove("hidden");
}

function closeCart() {
  if (cartEl) cartEl.classList.add("hidden");
}

if (cartOpenEl) {
  cartOpenEl.type = "button";
  cartOpenEl.addEventListener("click", openCart);
}

if (cartCloseEl) {
  cartCloseEl.type = "button";
  cartCloseEl.addEventListener("click", closeCart);
}

// Click on the dark overlay to close the cart
if (cartEl) {
  cartEl.addEventListener("click", event => {
    if (event.target === cartEl) closeCart();
  });
}

// Escape key closes the cart
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeCart();
});


/* =================================
   VELTRIX CUSTOMER AUTHENTICATION
================================= */

let vxUser = null;
let vxAuthMode = "login";
let vxPendingCartProductId = null;
let vxPendingCheckout = false;

const vxAuthModal = document.querySelector("#authModal");
const vxAuthContent = document.querySelector("#authContent");
const vxAuthOpen = document.querySelector("#authOpen");
const vxAuthClose = document.querySelector("#authClose");

function vxOpenAuth() {
  if (!vxAuthModal) return;
  vxRenderAuth();
  vxAuthModal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function vxCloseAuth() {
  if (!vxAuthModal) return;
  vxAuthModal.classList.remove("active");
  document.body.style.overflow = "";
}

function vxUpdateAuthButton() {
  if (!vxAuthOpen) return;
  vxAuthOpen.textContent = vxUser
    ? vxUser.name
    : "НЭВТРЭХ";
}

function vxRenderAuth() {
  if (!vxAuthContent) return;

  if (vxUser) {
    vxAuthContent.innerHTML = `
      <span class="auth-tag">VELTRIX MEMBER</span>
      <h2>МИНИЙ БҮРТГЭЛ</h2>
      <p class="auth-description">Тавтай морилно уу!</p>
      <div class="auth-user-name">${esc(vxUser.name)}</div>

      <div class="vx-profile-info">
        <div><small>УТАСНЫ ДУГААР</small><strong>${esc(vxUser.phone || "Бүртгэгдээгүй")}</strong></div>
        <div><small>ИМЭЙЛ</small><strong>${esc(vxUser.email || "Бүртгэгдээгүй")}</strong></div>
      </div>

      <div class="vx-profile-settings">
        <details class="vx-settings-panel">
          <summary>ПРОФАЙЛЫН МЭДЭЭЛЭЛ ЗАСАХ</summary>
          <form id="vxProfileForm" class="auth-form">
            <input name="name" value="${esc(vxUser.name)}" maxlength="80" placeholder="Нэр" required>
            <input name="phone" type="tel" value="${esc(vxUser.phone || "")}" placeholder="Утасны дугаар">
            <input name="email" type="email" value="${esc(vxUser.email || "")}" placeholder="Имэйл">
            <div class="vx-settings-message" id="vxProfileMessage"></div>
            <button class="auth-submit" type="submit">МЭДЭЭЛЭЛ ХАДГАЛАХ</button>
          </form>
        </details>

        <details class="vx-settings-panel">
          <summary>НУУЦ ҮГ СОЛИХ</summary>
          <form id="vxPasswordForm" class="auth-form">
            <input name="currentPassword" type="password" placeholder="Хуучин нууц үг" required>
            <input name="newPassword" type="password" placeholder="Шинэ нууц үг (8+ тэмдэгт)" minlength="8" maxlength="128" required>
            <input name="confirmPassword" type="password" placeholder="Шинэ нууц үгээ давтах" minlength="8" maxlength="128" required>
            <div class="vx-settings-message" id="vxPasswordMessage"></div>
            <button class="auth-submit" type="submit">НУУЦ ҮГ ШИНЭЧЛЭХ</button>
          </form>
        </details>
      </div>

      <div class="vx-my-orders">
        <div class="vx-my-orders-heading">
          <h3>МИНИЙ ЗАХИАЛГУУД</h3>
          <span>ORDER HISTORY</span>
        </div>
        <div id="vxMyOrders" class="vx-my-orders-list">
          <p class="vx-orders-loading">Захиалгууд ачаалж байна...</p>
        </div>
      </div>

      <button id="vxLogout" class="auth-submit" type="button">СИСТЕМЭЭС ГАРАХ</button>
    `;
    vxLoadMyOrders();
    return;
  }

  const register = vxAuthMode === "register";

  vxAuthContent.innerHTML = `
    <span class="auth-tag">VELTRIX ACCOUNT</span>
    <h2>${register ? "БҮРТГҮҮЛЭХ" : "НЭВТРЭХ"}</h2>
    <p class="auth-description">
      ${register ? "VELTRIX хэрэглэгчийн бүртгэл үүсгээрэй." : "Бүртгэлдээ нэвтэрнэ үү."}
    </p>

    <form id="vxAuthForm" class="auth-form">
      ${register ? `
        <input name="name" placeholder="Таны нэр" maxlength="80" required>
        <input name="email" type="email" placeholder="Имэйл (заавал биш)">
        <input name="phone" type="tel" placeholder="Утасны дугаар (заавал биш)">
      ` : `
        <input name="identity" placeholder="Утас эсвэл имэйл" required>
      `}

      <input name="password" type="password"
        placeholder="Нууц үг (дор хаяж 8 тэмдэгт)"
        minlength="8" required>

      <div id="vxAuthMessage" class="auth-message"></div>

      <button class="auth-submit" type="submit">
        ${register ? "БҮРТГҮҮЛЭХ ↗" : "НЭВТРЭХ ↗"}
      </button>
    </form>

    <div class="auth-switch">
      ${register ? "Бүртгэлтэй юу?" : "Бүртгэл байхгүй юу?"}
      <button id="vxAuthSwitch" type="button">
        ${register ? "Нэвтрэх" : "Бүртгүүлэх"}
      </button>
    </div>
  `;
}

async function vxLoadMyOrders() {
  const container = document.querySelector("#vxMyOrders");
  const token = localStorage.getItem("vx-user-token");

  if (!container || !token) return;

  try {
    const res = await fetch("/api/my/orders", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error("Захиалгууд ачаалж чадсангүй");

    const orders = await res.json();

    if (!orders.length) {
      container.innerHTML = `
        <div class="vx-orders-empty">
          <span>📦</span>
          <strong>Одоогоор захиалга алга</strong>
          <small>Таны хийсэн захиалгууд энд харагдана.</small>
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map(order => {
      const date = order.createdAt
        ? new Date(order.createdAt).toLocaleString("mn-MN")
        : "Огноо тодорхойгүй";

      const items = (order.items || []).map(item => `
        <div class="vx-order-item">
          <span>${esc(item.name)} × ${Number(item.quantity || 0)}</span>
          <strong>${Number(item.price || 0).toLocaleString("mn-MN")}₮</strong>
        </div>
      `).join("");

      return `
        <details class="vx-order-card">
          <summary>
            <div class="vx-order-main">
              <strong>${esc(order.code)}</strong>
              <small>${esc(date)}</small>
            </div>
            <div class="vx-order-side">
              <b>${Number(order.total || 0).toLocaleString("mn-MN")}₮</b>
              <span>${esc(order.status || "Шинэ")}</span>
            </div>
          </summary>
          <div class="vx-order-details">
            ${items}
            <div class="vx-order-total">
              <span>Нийт төлбөр</span>
              <strong>${Number(order.total || 0).toLocaleString("mn-MN")}₮</strong>
            </div>
            <p>Төлбөр: ${esc(order.paymentStatus || "Төлөөгүй")}</p>
            <p>Төлбөрийн хэлбэр: ${esc(order.paymentMethod || "Хүлээн авахдаа төлөх")}</p>
          </div>
        </details>
      `;
    }).join("");
  } catch (error) {
    container.innerHTML = `<p class="vx-orders-error">${esc(error.message)}</p>`;
  }
}

async function vxLoadUser() {
  const token = localStorage.getItem("vx-user-token");

  if (!token) {
    vxUpdateAuthButton();
    return;
  }

  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error();

    vxUser = await res.json();
  } catch {
    localStorage.removeItem("vx-user-token");
    vxUser = null;
  }

  vxUpdateAuthButton();
}

if (vxAuthOpen) {
  vxAuthOpen.addEventListener("click", vxOpenAuth);
}

if (vxAuthClose) {
  vxAuthClose.addEventListener("click", vxCloseAuth);
}

if (vxAuthModal) {
  vxAuthModal.addEventListener("click", event => {
    if (event.target === vxAuthModal) vxCloseAuth();
  });

  vxAuthModal.addEventListener("click", event => {
    if (event.target.id === "vxAuthSwitch") {
      vxAuthMode = vxAuthMode === "login" ? "register" : "login";
      vxRenderAuth();
    }

    if (event.target.id === "vxLogout") {
      localStorage.removeItem("vx-user-token");
      vxUser = null;
      vxAuthMode = "login";
      vxUpdateAuthButton();
      vxRenderAuth();
    }
  });

  vxAuthModal.addEventListener("submit", async event => {
    const form = event.target;
    const token = localStorage.getItem("vx-user-token") || "";

    if (form.id === "vxProfileForm") {
      event.preventDefault();

      const data = Object.fromEntries(new FormData(form).entries());
      const message = document.querySelector("#vxProfileMessage");
      const button = form.querySelector('button[type="submit"]');

      button.disabled = true;
      message.textContent = "Хадгалж байна...";

      try {
        const res = await fetch("/api/auth/profile", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(data)
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Шинэчлэхэд алдаа гарлаа");

        vxUser = result.user;
        vxUpdateAuthButton();
        vxRenderAuth();
      } catch (error) {
        message.textContent = error.message;
      } finally {
        if (button.isConnected) button.disabled = false;
      }
      return;
    }

    if (form.id === "vxPasswordForm") {
      event.preventDefault();

      const data = Object.fromEntries(new FormData(form).entries());
      const message = document.querySelector("#vxPasswordMessage");
      const button = form.querySelector('button[type="submit"]');

      if (data.newPassword !== data.confirmPassword) {
        message.textContent = "Шинэ нууц үг хоорондоо таарахгүй байна.";
        return;
      }

      button.disabled = true;
      message.textContent = "Шалгаж байна...";

      try {
        const res = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            currentPassword: data.currentPassword,
            newPassword: data.newPassword
          })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Нууц үг солиход алдаа гарлаа");

        form.reset();
        message.textContent = "✓ " + (result.message || "Нууц үг солигдлоо");
      } catch (error) {
        message.textContent = error.message;
      } finally {
        if (button.isConnected) button.disabled = false;
      }
      return;
    }
  });

  vxAuthModal.addEventListener("submit", async event => {
    if (event.target.id !== "vxAuthForm") return;

    event.preventDefault();

    const form = event.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const message = document.querySelector("#vxAuthMessage");
    const submit = form.querySelector("button[type=submit]");

    if (vxAuthMode === "register" && !data.email.trim() && !data.phone.trim()) {
      message.textContent = "Утас эсвэл имэйлийн аль нэгийг оруулна уу.";
      return;
    }

    submit.disabled = true;
    message.textContent = "Түр хүлээнэ үү...";

    try {
      const endpoint = vxAuthMode === "register"
        ? "/api/auth/register"
        : "/api/auth/login";

      const body = vxAuthMode === "register"
        ? data
        : { identity: data.identity, password: data.password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Алдаа гарлаа.");
      }

      localStorage.setItem("vx-user-token", result.token);
      vxUser = result.user;
      vxUpdateAuthButton();

      const pendingProduct = vxPendingCartProductId;
      const continueCheckout = vxPendingCheckout;

      vxPendingCartProductId = null;
      vxPendingCheckout = false;

      vxCloseAuth();

      if (pendingProduct) {
        add(pendingProduct);
      }

      if (continueCheckout) {
        orderBtn?.click();
      }

    } catch (error) {
      message.textContent = error.message;
    } finally {
      if (submit.isConnected) submit.disabled = false;
    }
  });
}

vxLoadUser();


// Initialize VELTRIX product catalog
load();



/* =================================
   VELTRIX UNIFIED BUTTON HANDLER
================================= */

document.addEventListener("click", function(event) {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;

  const action = button.dataset.action;
  const id = button.dataset.id;

  switch (action) {
    case "product-open":
      if (id) openProduct(id);
      break;

    case "product-close":
      closeProduct();
      break;

    case "cart-add":
      if (id) add(id);
      break;

    case "product-add-close":
      if (id) add(id);
      closeProduct();
      break;

    case "review-toggle":
      window.toggleReviewForm();
      break;

    case "qty-minus":
      if (id) updateQty(id, -1);
      break;

    case "qty-plus":
      if (id) updateQty(id, 1);
      break;

    case "cart-remove":
      if (id) removeItem(id);
      break;

    case "track-open": {
      const code = button.dataset.code || "";
      const phone = button.dataset.phone || "";

      const codeInput = document.querySelector("#trackCodeInput");
      const phoneInput = document.querySelector("#trackPhoneInput");

      if (codeInput) codeInput.value = code;
      if (phoneInput) phoneInput.value = phone;

      openTrack();

      const form = document.querySelector("#trackForm");
      if (form) form.requestSubmit();
      break;
    }
  }
});



/* =================================
   VELTRIX COMPATIBILITY FINDER
================================= */

const vxFitForm = document.querySelector("#vxCompatibilityForm");

if (vxFitForm) {
  vxFitForm.addEventListener("submit", async event => {
    event.preventDefault();

    const message = document.querySelector("#vxFitMessage");
    const grid = document.querySelector("#productsGrid");

    const params = new URLSearchParams();

    const filters = [
      ["wheelSize", "#vxWheelSize"],
      ["brakeType", "#vxBrakeType"],
      ["speed", "#vxSpeed"],
      ["bikeType", "#vxBikeType"]
    ];

    filters.forEach(([key, selector]) => {
      const value = document.querySelector(selector)?.value;
      if (value) params.set(key, value);
    });

    if (!params.toString()) {
      message.textContent = "Эхлээд дор хаяж нэг үзүүлэлт сонгоно уу.";
      return;
    }

    message.textContent = "Тохирох бараа хайж байна...";
    if (grid) grid.innerHTML = "<p>Хайж байна...</p>";

    try {
      const response = await fetch("/api/products?" + params.toString());
      if (!response.ok) throw new Error("Хайлт амжилтгүй");

      products = await response.json();

      const search = document.querySelector("#search");
      if (search) search.value = "";

      render();

      message.textContent = products.length
        ? `${products.length} тохирох бараа олдлоо.`
        : "Тохирох бараа олдсонгүй. Үзүүлэлтээ өөрчлөөд дахин хайгаарай.";

      document.querySelector("#products")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    } catch {
      message.textContent = "Хайлт хийхэд алдаа гарлаа. Дахин оролдоно уу.";
      if (grid) grid.innerHTML = "<p>Бараа хайж чадсангүй.</p>";
    }
  });

  document.querySelector("#vxFitReset")?.addEventListener("click", async () => {
    vxFitForm.reset();

    const message = document.querySelector("#vxFitMessage");
    if (message) message.textContent = "";

    const search = document.querySelector("#search");
    if (search) search.value = "";

    await load();
  });
}
