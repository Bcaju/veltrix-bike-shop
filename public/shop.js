
/* =================================
   VELTRIX SERVICE WORKER UPDATE
================================= */
async function vxRegisterServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker дэмжигдэхгүй байна.");
  }

  const registration = await navigator.serviceWorker.register(
    "/sw.js?v=20261110-2",
    { updateViaCache: "none" }
  );

  await registration.update();
  await navigator.serviceWorker.ready;

  return registration;
}

let products = [];
let vxFitResults = null;
let cart = JSON.parse(localStorage.getItem("veltrix-cart") || "[]");
let currentTrackOrder = null;


/* =================================
   VELTRIX PRODUCT COMPARISON
================================= */

let compareProducts = JSON.parse(
  localStorage.getItem("veltrix-compare") || "[]"
);

function saveCompare() {
  localStorage.setItem(
    "veltrix-compare",
    JSON.stringify(compareProducts)
  );
}

function toggleCompare(id) {
  const exists = compareProducts.includes(id);

  if (exists) {
    compareProducts = compareProducts.filter(item => item !== id);
  } else {
    if (compareProducts.length >= 4) {
      alert("Хамгийн ихдээ 4 бараа харьцуулна.");
      return;
    }

    compareProducts.push(id);
  }

  saveCompare();
  render();
  renderCompare();
}

function renderCompare() {
  let section = document.querySelector("#vxCompareSection");

  if (!section) {
    section = document.createElement("section");
    section.id = "vxCompareSection";
    section.className = "vx-compare-section";

    const grid = document.querySelector("#productsGrid");
    if (!grid) return;

    grid.parentNode.insertBefore(section, grid);
  }

  const selected = products.filter(p =>
    compareProducts.includes(p._id)
  );

  if (!selected.length) {
    section.innerHTML = "";
    return;
  }

  const rows = [
    ["Үнэ", p => money(p.price)],
    ["Үлдэгдэл", p => Number(p.stock || 0) + " ширхэг"],
    ["Ангилал", p => p.category || "-"],
    ["Дугуйн хэмжээ", p => (p.compatibility?.wheelSizes || []).join(", ") || "-"],
    ["Тоормос", p => (p.compatibility?.brakeTypes || []).join(", ") || "-"],
    ["Арааны тоо", p => (p.compatibility?.speeds || []).join(", ") || "-"],
    ["Дугуйн төрөл", p => (p.compatibility?.bikeTypes || []).join(", ") || "-"]
  ];

  section.innerHTML = `
    <div class="vx-compare-heading">
      <div>
        <small>VELTRIX / SMART SHOPPING</small>
        <h2>БАРАА ХАРЬЦУУЛАХ</h2>
        <span class="vx-compare-count">${selected.length} / 4 бараа сонгогдсон</span>
      </div>
      <button class="btn" data-action="compare-clear">
        БҮГДИЙГ ЦЭВЭРЛЭХ ✕
      </button>
    </div>

    <div class="vx-compare-table-wrap">
      <table class="vx-compare-table">
        <thead>
          <tr>
            <th>ҮЗҮҮЛЭЛТ</th>
            ${selected.map(p => `
              <th class="vx-compare-product">
                <div class="vx-compare-product-card">
                  <div class="vx-compare-image">
                    ${p.image
                      ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
                      : `<span>VELTRIX</span>`
                    }
                  </div>
                  <strong>${esc(p.name)}</strong>
                  <span class="vx-compare-price">${money(p.price)}</span>
                  <button
                    class="vx-compare-remove"
                    data-action="compare-remove"
                    data-id="${esc(p._id)}">
                    ✕ ХАСАХ
                  </button>
                </div>
              </th>
            `).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.map(([label, getValue]) => `
            <tr>
              <th>${label}</th>
              ${selected.map(p => `
                <td>${esc(getValue(p))}</td>
              `).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}


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
    renderCompare();
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

  grid.innerHTML = list.map(p => {
    const fit = vxFitResults ? vxFitResults[p._id] : null;

    let fitClass = "";
    if (fit) {
      fitClass = fit.missing
        ? "is-missing"
        : fit.score === 100
          ? "is-full"
          : fit.score > 0
            ? "is-partial"
            : "is-none";
    }

    return `
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

          ${fit ? `
            <div class="vx-match-card ${fitClass}">
              <div class="vx-match-top">
                <strong>${fit.score}% MATCH</strong>
                <span>${fit.status}</span>
              </div>
              <div class="vx-match-track">
                <i style="width:${fit.score}%"></i>
              </div>
              <small>
                ${fit.matched}/${fit.selected} үзүүлэлт таарсан
                ${fit.missing ? " · Зарим мэдээлэл бүртгэгдээгүй" : ""}
              </small>
            </div>
          ` : ""}

          <button class="btn details-btn"
            data-action="product-open"
            data-id="${esc(p._id)}">
            ДЭЛГЭРЭНГҮЙ ↗
          </button>

          <button
            class="btn vx-compare-btn"
            data-action="compare-toggle"
            data-id="${esc(p._id)}">
            ${compareProducts.includes(p._id)
              ? "✓ ХАРЬЦУУЛАЛТААС ХАСАХ"
              : "⇄ ХАРЬЦУУЛАХ"}
          </button>

          <button class="btn red wide"
            data-action="cart-add"
            data-id="${esc(p._id)}"
            ${Number(p.stock || 0) <= 0 ? "disabled" : ""}>
            ${Number(p.stock || 0) > 0 ? "САГСАНД НЭМЭХ" : "ДУУССАН"}
          </button>
        </div>
      </article>
    `;
  }).join("") || "<p>Бараа олдсонгүй.</p>";
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

          <form id="productReviewForm" class="product-review-form hidden">
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

  const reviewForm = modal.querySelector("#productReviewForm");
  if (reviewForm) {
    reviewForm.addEventListener("submit", event => {
      window.submitReview(event, p._id);
    });
  }

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
  } else if (code) {
    submitTrack(code, "", true);
  }
}

function closeTrack() {
  const modal = document.querySelector("#trackModal");
  if (modal) modal.classList.remove("active");
  document.body.style.overflow = "";
}

async function submitTrack(code, phone, useAccount = false) {
  const loading = document.querySelector("#trackLoading");
  const errorEl = document.querySelector("#trackError");
  const resultEl = document.querySelector("#trackResult");

  if (loading) loading.classList.remove("hidden");
  if (errorEl) errorEl.classList.add("hidden");
  if (resultEl) resultEl.classList.add("hidden");

  try {
    const res = await fetch(
      useAccount
        ? `/api/my/orders/${encodeURIComponent(code)}/track`
        : `/api/orders/track?code=${encodeURIComponent(code)}&phone=${encodeURIComponent(phone)}`,
      useAccount
        ? { headers: { "Authorization": `Bearer ${localStorage.getItem("vx-user-token") || ""}` } }
        : {}
    );
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Захиалга олдсонгүй");

    currentTrackOrder = { code: data.code, phone: phone || "" };

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
    const res = await fetch(`/api/orders/chat?code=${encodeURIComponent(code)}`, {
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

function vxBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}


async function vxSyncPushSubscription(token) {
  if (!token || !("serviceWorker" in navigator) || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    let subscriptionData = null;
    const pending = localStorage.getItem("vx-pending-push-subscription");

    if (pending) {
      subscriptionData = JSON.parse(pending);
    } else {
      const registration = await vxRegisterServiceWorker();
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) subscriptionData = subscription.toJSON();
    }

    if (!subscriptionData?.endpoint) return;

    const response = await fetch("/api/my/push-subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(subscriptionData)
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Subscription хадгалж чадсангүй");
    }

    localStorage.removeItem("vx-pending-push-subscription");
    localStorage.setItem("vx-push-prompt-choice", "enabled");
  } catch (error) {
    console.error("VELTRIX push sync error:", error);
  }
}

async function vxEnablePushNotifications() {
  const button = document.querySelector("#vxPushPromptAllow");
  const message = document.querySelector("#vxPushPromptMessage");

  const showMessage = text => {
    if (message) message.textContent = text;
  };

  if (!("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)) {
    showMessage("Таны браузер мэдэгдэл дэмжихгүй байна.");
    return;
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;

  if (isIOS && !isStandalone) {
    showMessage("iPhone дээр Safari → Share → Add to Home Screen сонгож VELTRIX-ийг нэмээд, тэндээсээ нээнэ үү.");
    return;
  }

  if (button) button.disabled = true;
  showMessage("Мэдэгдлийн тохиргоо хийж байна...");

  try {
    // Permission хүсэлт хэрэглэгчийн товч дарсан үйлдлийн шууд үргэлжлэл байх ёстой.
    let permission = Notification.permission;

    if (permission === "default") {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      localStorage.setItem("vx-push-prompt-choice", "declined");
      showMessage("Мэдэгдэл зөвшөөрөгдсөнгүй. Browser-ийн Site settings хэсгээс дараа өөрчилж болно.");
      return;
    }

    const registration = await vxRegisterServiceWorker();
    await navigator.serviceWorker.ready;

    const keyResponse = await fetch("/api/push/public-key");
    const keyData = await keyResponse.json();

    if (!keyResponse.ok || !keyData.publicKey) {
      throw new Error(keyData.error || "Push серверийн тохиргоо бэлэн биш байна.");
    }

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vxBase64ToUint8Array(keyData.publicKey)
      });
    }

    const subscriptionData = subscription.toJSON();

    // Нэвтрээгүй хэрэглэгчийн subscription-ийг түр хадгална.
    localStorage.setItem(
      "vx-pending-push-subscription",
      JSON.stringify(subscriptionData)
    );

    const token = localStorage.getItem("vx-user-token");

    if (token) {
      await vxSyncPushSubscription(token);
    }

    localStorage.setItem("vx-push-prompt-choice", "enabled");
    showMessage("Амжилттай! Захиалгын төлөв өөрчлөгдөхөд мэдэгдэл ирнэ.");

    document.querySelector("#vxPushPrompt")?.classList.remove("active");

  } catch (error) {
    console.error("VELTRIX push setup error:", error);
    showMessage(error.message || "Мэдэгдэл тохируулахад алдаа гарлаа.");
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

function vxShowPushPrompt() {
  if (!("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)) return;

  if (Notification.permission === "denied") {
    localStorage.setItem("vx-push-prompt-choice", "declined");
    document.querySelector("#vxPushPrompt")?.classList.remove("active", "expanded");
    return;
  }

  if (Notification.permission === "granted") {
    localStorage.setItem("vx-push-prompt-choice", "enabled");

    const token = localStorage.getItem("vx-user-token");

    if (token) {
      void vxSyncPushSubscription(token);
    } else {
      void (async () => {
        try {
          const registration = await vxRegisterServiceWorker();
          await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();

          if (subscription) {
            localStorage.setItem(
              "vx-pending-push-subscription",
              JSON.stringify(subscription.toJSON())
            );
          }
        } catch (error) {
          console.error("VELTRIX existing subscription check:", error);
        }
      })();
    }

    document.querySelector("#vxPushPrompt")?.classList.add("active");
    return;
  }

  // Permission default үед хонхыг харуулна.
  document.querySelector("#vxPushPrompt")?.classList.add("active");
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

async function vxLoadNotifications() {
  const container = document.querySelector("#vxNotifications");
  const countEl = document.querySelector("#vxUnreadCount");
  const token = localStorage.getItem("vx-user-token");

  if (!container || !token) return;

  try {
    const res = await fetch("/api/my/notifications", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Мэдэгдэл ачаалж чадсангүй");
    }

    const notifications = Array.isArray(data.notifications)
      ? data.notifications
      : [];

    countEl.textContent = `${Number(data.unreadCount || 0)} УНШААГҮЙ`;

    if (!notifications.length) {
      container.innerHTML = `
        <div class="vx-notification-empty">
          <span>🔔</span>
          <strong>Одоогоор мэдэгдэл алга</strong>
          <small>Захиалгын шинэ мэдээлэл энд харагдана.</small>
        </div>
      `;
      return;
    }

    container.innerHTML = notifications.map(notification => {
      const unread = !notification.read;

      return `
        <button
          type="button"
          class="vx-notification-card ${unread ? "unread" : ""}"
          data-vx-notification
          data-id="${esc(notification._id)}"
          data-code="${esc(notification.orderCode || "")}"
          data-read="${notification.read ? "true" : "false"}">
          <span class="vx-notification-icon">🔔</span>
          <span class="vx-notification-content">
            <strong class="vx-notification-title">${esc(notification.title)}</strong>
            <span class="vx-notification-message">${esc(notification.message)}</span>
            <small class="vx-notification-meta">${esc(dateTime(notification.createdAt))}</small>
          </span>
          ${unread ? '<span class="vx-notification-dot"></span>' : ""}
        </button>
      `;
    }).join("");

    container.onclick = async event => {
      const button = event.target.closest("[data-vx-notification]");
      if (!button) return;

      const id = button.dataset.id;
      const code = button.dataset.code;
      const wasUnread = button.dataset.read !== "true";

      if (wasUnread && id) {
        button.disabled = true;

        try {
          const readRes = await fetch(
            `/api/my/notifications/${encodeURIComponent(id)}/read`,
            {
              method: "PATCH",
              headers: { Authorization: `Bearer ${token}` }
            }
          );

          if (!readRes.ok) {
            const result = await readRes.json().catch(() => ({}));
            throw new Error(result.error || "Мэдэгдэл уншсан болгож чадсангүй");
          }

          button.dataset.read = "true";
          button.classList.remove("unread");
          button.querySelector(".vx-notification-dot")?.remove();

          const currentCount = Number.parseInt(
            countEl.textContent,
            10
          ) || 0;

          countEl.textContent = `${Math.max(0, currentCount - 1)} УНШААГҮЙ`;
        } catch (error) {
          alert(error.message);
        } finally {
          button.disabled = false;
        }
      }

      if (code) {
        openTrack(code);
      }
    };
  } catch (error) {
    container.innerHTML = `
      <p class="vx-orders-error">${esc(error.message)}</p>
    `;
  }
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
            <button
              type="button"
              class="vx-order-track-btn"
              data-vx-track-order
              data-code="${esc(order.code)}"
              data-phone="${esc(order.phone || "")}">
              📦 Бараа шалгах
            </button>
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

    container.onclick = event => {
      const button = event.target.closest("[data-vx-track-order]");
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      const code = button.dataset.code || "";
      if (!code) {
        alert("Захиалгын код олдсонгүй.");
        return;
      }

      openTrack(code);
    };
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
  const activeToken = localStorage.getItem("vx-user-token");
  if (activeToken && vxUser) void vxSyncPushSubscription(activeToken);
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
      void vxSyncPushSubscription(result.token);

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

const vxPushPrompt = document.querySelector("#vxPushPrompt");
const vxPushPromptAllow = document.querySelector("#vxPushPromptAllow");
const vxPushPromptDecline = document.querySelector("#vxPushPromptDecline");
const vxPushPromptClose = document.querySelector("#vxPushPromptClose");

vxPushPromptAllow?.addEventListener("click", () => {
  void vxEnablePushNotifications();
});

const vxPushPromptLauncher = document.querySelector("#vxPushPromptLauncher");

function vxCollapsePushPrompt() {
  vxPushPrompt?.classList.remove("expanded");
  vxPushPromptLauncher?.setAttribute("aria-expanded", "false");
}

function vxExpandPushPrompt() {
  vxPushPrompt?.classList.add("expanded");
  vxPushPromptLauncher?.setAttribute("aria-expanded", "true");
}

function vxDismissPushPrompt() {
  localStorage.setItem("vx-push-prompt-choice", "declined");
  vxPushPrompt?.classList.remove("active", "expanded");
}

vxPushPromptLauncher?.addEventListener("click", vxExpandPushPrompt);
vxPushPromptDecline?.addEventListener("click", vxDismissPushPrompt);
vxPushPromptClose?.addEventListener("click", vxCollapsePushPrompt);

vxShowPushPrompt();


// Initialize VELTRIX product catalog
load();



/* =================================
   VELTRIX UNIFIED BUTTON HANDLER
================================= */

document.addEventListener("click", function (event) {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;

  const action = button.dataset.action;
  const id = button.dataset.id;

  switch (action) {
        case "compare-toggle":
      if (id) toggleCompare(id);
      break;

    case "compare-remove":
      if (id) toggleCompare(id);
      break;

    case "compare-clear":
      compareProducts = [];
      saveCompare();
      render();
      renderCompare();
      break;
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

    const definitions = [
      {
        key: "wheelSizes",
        selector: "#vxWheelSize",
        label: "Дугуйн хэмжээ"
      },
      {
        key: "brakeTypes",
        selector: "#vxBrakeType",
        label: "Тоормос"
      },
      {
        key: "speeds",
        selector: "#vxSpeed",
        label: "Арааны тоо"
      },
      {
        key: "bikeTypes",
        selector: "#vxBikeType",
        label: "Дугуйн төрөл"
      }
    ];

    const selected = definitions
      .map(item => ({
        ...item,
        value: document.querySelector(item.selector)?.value || ""
      }))
      .filter(item => item.value !== "");

    if (!selected.length) {
      message.textContent = "Эхлээд дор хаяж нэг үзүүлэлт сонгоно уу.";
      return;
    }

    message.textContent = "VELTRIX SMART MATCH бараануудыг шалгаж байна...";
    if (grid) grid.innerHTML = "<p>Нийцлийг шалгаж байна...</p>";

    try {
      // Бүх идэвхтэй барааг авч нийцлийг frontend дээр тооцно.
      const response = await fetch("/api/products");

      if (!response.ok) {
        throw new Error("Бараа ачааллахад алдаа гарлаа");
      }

      const allProducts = await response.json();

      vxFitResults = {};

      allProducts.forEach(product => {
        const compatibility = product.compatibility || {};

        let matched = 0;
        let missing = false;

        selected.forEach(item => {
          const values = compatibility[item.key];

          if (!Array.isArray(values) || values.length === 0) {
            missing = true;
            return;
          }

          const isMatch = values.some(value =>
            String(value) === String(item.value)
          );

          if (isMatch) matched++;
        });

        const score = Math.round(
          (matched / selected.length) * 100
        );

        let status;

        if (missing) {
          status = "МЭДЭЭЛЭЛ ДУТУУ";
        } else if (score === 100) {
          status = "БҮРЭН ТОХИРНО";
        } else if (score > 0) {
          status = "ХЭСЭГЧЛЭН ТОХИРНО";
        } else {
          status = "ТОХИРОХГҮЙ";
        }

        vxFitResults[product._id] = {
          score,
          matched,
          selected: selected.length,
          missing,
          status
        };
      });

      products = allProducts.sort((a, b) =>
        vxFitResults[b._id].score - vxFitResults[a._id].score
      );

      const search = document.querySelector("#search");
      if (search) search.value = "";

      render();
      renderCompare();

      const results = Object.values(vxFitResults);

      const full = results.filter(x =>
        x.score === 100 && !x.missing
      ).length;

      const partial = results.filter(x =>
        x.score > 0 && x.score < 100 && !x.missing
      ).length;

      const missingCount = results.filter(x => x.missing).length;

      const none = results.filter(x =>
        x.score === 0 && !x.missing
      ).length;

      message.textContent =
        `${results.length} барааг шалгалаа: ` +
        `${full} бүрэн, ${partial} хэсэгчлэн тохирно. ` +
        `${missingCount} мэдээлэл дутуу, ${none} тохирохгүй.`;

      document.querySelector("#products")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    } catch (error) {
      console.error("VELTRIX SMART MATCH:", error);

      message.textContent =
        "Хайлт хийхэд алдаа гарлаа. Дахин оролдоно уу.";

      if (grid) {
        grid.innerHTML = "<p>Бараа хайж чадсангүй.</p>";
      }
    }
  });

  document.querySelector("#vxFitReset")?.addEventListener(
    "click",
    async () => {
      vxFitForm.reset();
      vxFitResults = null;

      const message = document.querySelector("#vxFitMessage");
      if (message) message.textContent = "";

      const search = document.querySelector("#search");
      if (search) search.value = "";

      await load();
    }
  );
}

/* =================================
   VELTRIX PARTS KNOWLEDGE CENTER
================================= */
(() => {
  const grid = document.querySelector("#vxKnowledgeGrid");
  const search = document.querySelector("#vxKnowledgeSearch");
  const categoryBox = document.querySelector("#vxKnowledgeCategories");
  const count = document.querySelector("#vxKnowledgeCount");

  if (!grid || !search || !categoryBox) return;

  const parts = [
    {
      name: "Тоормосны наклад", english: "Brake Pad",
      category: "Тоормос",
      icon: "🛑",
      description: "Дугуйг удаашруулж, зогсоохын тулд роторыг хавчиж үрэлт үүсгэдэг.",
      failures: ["Тоормос гишгэхэд шаржигнах", "Тоормосны хүч сулрах", "Наклад хэт нимгэрэх"],
      causes: ["Наклад элэгдэх", "Тос болон бохирдол хүрэх", "Ротор муруйх эсвэл бохирдох"],
      steps: ["Накладны зузаан болон элэгдлийг шалга.", "Калипер болон роторын бохирдлыг шалга.", "Шаардлагатай бол тохирох накладыг солино.", "Сольсны дараа үйлдвэрлэгчийн зааврын дагуу тоормосыг суулгаж, аюулгүй газар турш."],
      warning: "Тос хүрсэн накладыг зүгээр арчиж дахин ашиглах нь найдвартай биш. Тоормосны ажиллагаанд эргэлзээ байвал механикаар шалгуул."
    },
    {
      name: "Тоормосны ротор", english: "Brake Rotor",
      category: "Тоормос",
      icon: "⚙️",
      description: "Дугуйн голд бэхлэгдэж, накладтай хавсран тоормосны үрэлтийг үүсгэнэ.",
      failures: ["Тоормос чичирхийлэх", "Эргэх үед үрэх чимээ гарах", "Ротор халж өнгө өөрчлөгдөх"],
      causes: ["Ротор мурийх", "Боолт сулрах", "Тос, шороо тогтох"],
      steps: ["Роторыг гэрэлд харж мурийлт байгаа эсэхийг шалга.", "Бэхэлгээний боолтуудыг үйлдвэрлэгчийн заасан моментоор шалгуул.", "Роторыг зориулалтын цэвэрлэгчээр цэвэрлэ.", "Хэт нимгэрсэн эсвэл гэмтсэн бол солино."],
      warning: "Халсан ротор болон тоормосны гадаргууг гараар шууд бүү хүр."
    },
    {
      name: "Тоормосны калипер", english: "Brake Caliper",
      category: "Тоормос",
      icon: "🔧",
      description: "Накладыг роторын хоёр талаас шахаж тоормослох үүрэгтэй.",
      failures: ["Нэг талын наклад илүү элэгдэх", "Поршен буцаж орохгүй байх", "Тоормос барьж гацах"],
      causes: ["Поршен бохирдох", "Калипер буруу байрлах", "Гидравлик системийн гэмтэл"],
      steps: ["Дугуйг аюулгүй тогтоож, калиперын байрлалыг шалга.", "Накладны элэгдлийг хоёр талаас нь харьцуул.", "Поршен болон шингэний алдагдлыг шалгуул.", "Гэмтэлтэй бол зориулалтын засварын иж бүрдэл ашиглан мэргэжлийн түвшинд засварлуул."],
      warning: "Гидравлик калиперийг буруу задлах нь тоормос бүрэн ажиллагаагүй болоход хүргэнэ."
    },
    {
      name: "Гинж", english: "Chain",
      category: "Хөтлөгч",
      icon: "⛓️",
      description: "Арааны системээр дамжуулан дөрөөнөөс ирэх хүчийг хойд дугуйд дамжуулна.",
      failures: ["Араа солиход үсрэх", "Гинж дуугарах", "Гинж тасрах"],
      causes: ["Гинж сунах", "Тосолгоо муудах", "Буруу урттай эсвэл буруу угсарсан байх"],
      steps: ["Гинжний элэгдлийг зориулалтын хэмжигчээр шалга.", "Хэт хуурай эсвэл бохир бол цэвэрлэж хатаа.", "Дугуйн нөхцөлд тохирох гинжний тос түрх.", "Элэгдлийн хэмжээнээс хэтэрсэн бол солино."],
      warning: "Гинж тасарсан эсвэл холбоос гэмтсэн бол хүчтэй гишгэж туршиж болохгүй."
    },
    {
      name: "Арын шилжүүлэгч", english: "Rear Derailleur",
      category: "Хөтлөгч",
      icon: "🚲",
      description: "Гинжийг хойд араануудын хооронд шилжүүлдэг механизм.",
      failures: ["Араа шилжихгүй байх", "Гинж араанаас унах", "Шилжүүлэгч дугуйн хигээст хүрэх"],
      causes: ["Тросс сунах", "Шилжүүлэгчийн өлгүүр мурийх", "Тохируулга алдагдах"],
      steps: ["Троссны бүрэн бүтэн байдлыг шалга.", "Арааны өлгүүр мурийсан эсэхийг шалгуул.", "Хязгаарын болон индексийн тохируулгыг шалга.", "Бага ачаалалтайгаар араа бүрийг турш."],
      warning: "Шилжүүлэгч хигээст хүрч байвал унахаа зогсоо. Дугуй түгжигдэх эрсдэлтэй."
    },
    {
      name: "Урд араа ба кроп", english: "Chainring & Crankset",
      category: "Хөтлөгч",
      icon: "🔩",
      description: "Дөрөөний хүчийг гинж рүү дамжуулах урд арааны хэсэг.",
      failures: ["Гинж урд араанаас унах", "Дөрөө гишгэхэд дуу гарах", "Араа ганхах"],
      causes: ["Араа элэгдэх", "Кропны боолт сулрах", "Гинжний шугам алдагдах"],
      steps: ["Шүдний хэлбэр болон элэгдлийг шалга.", "Кропны хөдөлгөөн, сул зайг шалга.", "Боолтуудын бэхэлгээг шалгуул.", "Гэмтсэн араа, холхивчийг тохирох эд ангиар солино."],
      warning: "Кроп болон голын холхивчийн сул зайг үл тоомсорлож болохгүй."
    },
    {
      name: "Дугуйн покрышк", english: "Tire",
      category: "Дугуй",
      icon: "⭕",
      description: "Замтай харьцаж барьц, тогтвортой байдал болон хамгаалалтыг хангана.",
      failures: ["Агаар байнга алдах", "Хээ элэгдэх", "Хажуу хананд цууралт гарах"],
      causes: ["Хурц зүйлд цоорох", "Даралт буруу байх", "Хэт элэгдэх эсвэл буруу хадгалах"],
      steps: ["Хээ болон хажуу ханыг шалга.", "Дугуйнд хадаас, шил зэрэг зүйл байгаа эсэхийг үз.", "Үйлдвэрлэгчийн зөвлөсөн даралтыг баримтал.", "Гүн цууралт, утас ил гарсан бол солино."],
      warning: "Хажуу хана гэмтсэн дугуйгаар өндөр хурдтай явах аюултай."
    },
    {
      name: "Дугуйн камер", english: "Inner Tube",
      category: "Дугуй",
      icon: "⭕",
      description: "Покрышкны дотор агаар хадгалж дугуйг хэлбэртэй байлгана.",
      failures: ["Агаар алдах", "Хийлсний дараа дахин сулрах", "Хийлгэх үед хавхлагаас алдах"],
      causes: ["Цооролт", "Обудны хурц ирмэг", "Хавхлагын гэмтэл"],
      steps: ["Камерыг авч, цоорсон хэсгийг ол.", "Покрышкны дотор талд хурц зүйл үлдсэн эсэхийг шалга.", "Засварын нөхөөс эсвэл тохирох шинэ камер хэрэглэ.", "Угсралтын дараа бага даралтаар хийлж шалга."],
      warning: "Камер угсрахдаа покрышк болон обудны завсарт хавчуулагдаагүйг шалга."
    },
    {
      name: "Обуд ба хигээс", english: "Rim & Spokes",
      category: "Дугуй",
      icon: "🛞",
      description: "Дугуйн хэлбэр, бат бөх байдлыг хадгалж ачааллыг хуваарилна.",
      failures: ["Дугуй хажуу тийш савлах", "Хигээс сулрах", "Обуд цуурах"],
      causes: ["Хигээсний таталт жигд бус байх", "Хүчтэй цохилт", "Хэт ачаалал"],
      steps: ["Дугуйг өргөж эргүүлэн савлалтыг ажигла.", "Хигээс тасарсан эсвэл сул эсэхийг шалга.", "Обудны цууралтыг шалга.", "Төвлөрүүлэлт болон хигээсний таталтыг мэргэжлийн багажаар тохируул."],
      warning: "Обуд цуурсан эсвэл олон хигээс тасарсан бол унаж болохгүй."
    },
    {
      name: "Амортизатор сэрээ", english: "Suspension Fork",
      category: "Удирдлага",
      icon: "🔱",
      description: "Урд дугуйн цохилтыг шингээж, барьц болон жолоодлогын хяналтыг сайжруулна.",
      failures: ["Тос гоожих", "Агаарын даралт алдах", "Сэрээ гацах эсвэл дуугарах"],
      causes: ["Жийргэвч элэгдэх", "Агаарын систем алдагдах", "Засвар үйлчилгээ хийгдээгүй байх"],
      steps: ["Гадна хөл болон штокны гэмтлийг шалга.", "Үйлдвэрлэгчийн зааврын дагуу даралтыг шалга.", "Тос, агаар алдагдаж байгаа эсэхийг үз.", "Үйлчилгээний хугацаа хэтэрсэн бол мэргэжлийн засварт өг."],
      warning: "Сэрээний агаарын камер, дотоод эд ангийг туршлагагүйгээр задлахгүй."
    },
    {
      name: "Жолооны хүрд ба иш", english: "Handlebar & Stem",
      category: "Удирдлага",
      icon: "🧭",
      description: "Унадаг дугуйн чиглэлийг удирдах, жолоодлогын хүчийг дамжуулах хэсэг.",
      failures: ["Хүрд хөдөлгөөнтэй болох", "Жолоо хазайх", "Ишнээс дуу гарах"],
      causes: ["Боолт сулрах", "Буруу угсралт", "Эд анги цуурах"],
      steps: ["Хүрд болон ишний цууралтыг шалга.", "Бэхэлгээний боолтуудыг шалгуул.", "Урд дугуйтай харьцуулан хүрдний байрлалыг шалга.", "Үйлдвэрлэгчийн заасан моментоор бэхэлгээг тохируул."],
      warning: "Жолооны эд ангийн боолтыг таамгаар хэт чангалж болохгүй. Цуурсан эд ангийг солино."
    },
    {
      name: "Педаль", english: "Pedals",
      category: "Хөтлөгч",
      icon: "🦶",
      description: "Хөлийн хүчийг кроп руу дамжуулах гишгүүр.",
      failures: ["Педаль шаржигнах", "Эргэхгүй гацах", "Педаль голоос сулрах"],
      causes: ["Холхивч элэгдэх", "Угсралтын утас гэмтэх", "Тосолгоо муудах"],
      steps: ["Педалийг гараар эргүүлж холхивчийг шалга.", "Гол болон резьбаг шалга.", "Зориулалтын тосолгоо хэрэглэ.", "Гэмтсэн резьба эсвэл холхивчийг засварлуул."],
      warning: "Педалийн баруун, зүүн талын резьба өөр чиглэлтэй тул угсрахдаа анхаар."
    },
    {
      name: "Рам", english: "Frame",
      category: "Рам ба сэрээ",
      icon: "🚴",
      description: "Дугуйн бүх үндсэн эд ангийг холбож, унаачийн ачааллыг даана.",
      failures: ["Гагнаас орчим цуурах", "Рамнаас тачигнах", "Холболтын хэсэгт хөдөлгөөн үүсэх"],
      causes: ["Хүчтэй цохилт", "Ядаргааны хагарал", "Буруу угсралт эсвэл хэт ачаалал"],
      steps: ["Рамны гагнаас болон холбоосуудыг гэрэлд шалга.", "Цууралт, хонхойлт, хэлбэр алдалтыг хай.", "Сэжигтэй бол унахаа зогсоож мэргэжлийн үзлэг хийлгэ.", "Үйлдвэрлэгчийн зөвшөөрөлгүйгээр гагнаж засахгүй."],
      warning: "Рам цуурсан байж болзошгүй бол унаж болохгүй."
    }
  ];

  const categories = [
    "Бүгд",
    "Тоормос",
    "Хөтлөгч",
    "Дугуй",
    "Удирдлага",
    "Рам ба сэрээ"
  ];
  let activeCategory = "Бүгд";



  function renderCategories() {
    categoryBox.innerHTML = categories.map(category => `
      <button type="button"
        class="vx-knowledge-filter ${category === activeCategory ? "active" : ""}"
        data-knowledge-category="${category}">
        ${category}
      </button>
    `).join("");
  }

  function renderParts() {
    const term = search.value.trim().toLowerCase();

    const filtered = parts.filter(part => {
      const categoryMatch =
        activeCategory === "Бүгд" || part.category === activeCategory;

      const searchable = [
        part.name,
        part.category,
        part.description,
        ...part.failures,
        ...part.causes
      ].join(" ").toLowerCase();

      return categoryMatch && searchable.includes(term);
    });

    count.textContent = filtered.length;

    if (!filtered.length) {
      grid.innerHTML = `
        <div class="vx-knowledge-empty">
          <h3>Эд анги олдсонгүй</h3>
          <p>Өөр нэрээр хайх эсвэл өөр ангилал сонгоно уу.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(part => `
      <article class="vx-knowledge-card">
        <div class="vx-knowledge-visual">${part.icon}</div>
        <span class="vx-knowledge-tag">${part.category}</span>
        <h3 class="vx-knowledge-title">${part.name} <span>| ${part.english}</span></h3>
        <span class="vx-knowledge-english">${part.english}</span>
        <p>${part.description}</p>

        <details class="vx-knowledge-details">
          <summary>ДЭЛГЭРЭНГҮЙ МЭДЭХ +</summary>

          <h4>ЗОРИУЛАЛТ</h4>
          <p>${part.description}</p>

          <h4>ТҮГЭЭМЭЛ ЭВДРЭЛ</h4>
          <ul>${part.failures.map(item => `<li>${item}</li>`).join("")}</ul>

          <h4>БОЛОМЖИТ ШАЛТГААН</h4>
          <ul>${part.causes.map(item => `<li>${item}</li>`).join("")}</ul>

          <h4>ШАЛГАХ / ЗАСВАРЛАХ ДАРААЛАЛ</h4>
          <ol>${part.steps.map(item => `<li>${item}</li>`).join("")}</ol>

          <div class="vx-knowledge-warning">⚠ ${part.warning}</div>

          <a class="vx-knowledge-product-link" href="#products">
            VELTRIX БАРАА ҮЗЭХ ↗
          </a>
        </details>
      </article>
    `).join("");
  }

  categoryBox.addEventListener("click", event => {
    const button = event.target.closest("[data-knowledge-category]");
    if (!button) return;

    activeCategory = button.dataset.knowledgeCategory;
    renderCategories();
    renderParts();
  });

  search.addEventListener("input", renderParts);

  renderCategories();
  renderParts();
})();

/* =================================
   VELTRIX BIKE REPAIR CENTER LOGIC
================================= */
(() => {
  const grid = document.getElementById("vxRepairGrid");
  const search = document.getElementById("vxRepairSearch");
  const categoryBox = document.getElementById("vxRepairCategories");
  const count = document.getElementById("vxRepairCount");

  if (!grid || !search || !categoryBox || !count) return;

  const repairs = [
    {
      name: "Тоормос дуугарах | Brake Noise",
      category: "Тоормос",
      icon: "🛑",
      description: "Тоормос дарахад исгэрэх, шаржигнах эсвэл үрэх чимээ гарах.",
      causes: ["Наклад бохирдсон байх", "Ротор тос болсон байх", "Ротор мурийсан байх"],
      steps: ["Дугуйг аюулгүй тогтоож, ротор болон накладыг гэрэлд шалга.", "Ротор дээр тос, бохирдол байгаа эсэхийг үз.", "Наклад хэт элэгдсэн эсэхийг шалга.", "Бохирдсон эд ангийг зориулалтын тоормос цэвэрлэгчээр цэвэрлүүл."],
      warning: "Тоормосны гадаргуу дээр тос, WD-40 болон тосолгооны материал бүү хэрэглэ."
    },
    {
      name: "Тоормос сулрах | Weak Brakes",
      category: "Тоормос",
      icon: "⚠️",
      description: "Тоормосны бариул хэт дотогш орж, дугуй сайн зогсохгүй байх.",
      causes: ["Наклад элэгдсэн", "Кабель сунасан эсвэл сул", "Гидравлик системд агаар орсон"],
      steps: ["Накладны элэгдлийг шалга.", "Механик тоормос бол кабелийн таталтыг шалгуул.", "Гидравлик тоормос бол шингэн алдагдсан эсэхийг шалгуул.", "Засварын дараа дугуйг хөдөлгөөнгүй үед шалга."],
      warning: "Гидравлик тоормосны агаар авах, шингэн солих ажлыг тохирох багажтай механикаар хийлгэ."
    },
    {
      name: "Гинж мултрах | Chain Dropping",
      category: "Хөтлөгч",
      icon: "⛓️",
      description: "Гинж араанаас унах, сулрах эсвэл хөтлөгчөөс мултрах.",
      causes: ["Арааны тохиргоо алдагдсан", "Гинж сунасан", "Шилжүүлэгч мурийсан"],
      steps: ["Гинж болон арааны шүдийг шалга.", "Арын шилжүүлэгч мурийсан эсэхийг хар.", "Гинжний элэгдлийг хэмжүүрээр шалга.", "Арааны тохиргоог зөв тааруул."],
      warning: "Гинж мултарсан үед хүчтэй педальдаж болохгүй. Шилжүүлэгч, спиц болон рам гэмтэж болно."
    },
    {
      name: "Араа шилжихгүй байх | Gear Shifting Problem",
      category: "Хөтлөгч",
      icon: "⚙️",
      description: "Араа солиход шилжихгүй, үсрэх эсвэл дуу гарах.",
      causes: ["Кабель бохирдсон эсвэл сунасан", "Шилжүүлэгчийн тохиргоо алдагдсан", "Арааны өлгүүр мурийсан"],
      steps: ["Кабель болон гадна бүрээсийг шалга.", "Арын шилжүүлэгчийн байрлалыг шалга.", "Арааны өлгүүр мурийсан эсэхийг механикаар шалгуул.", "Тохиргоог араа бүр дээр шалга."],
      warning: "Шилжүүлэгчийн өлгүүр мурийсан бол хүчээр тэгшлэх гэж оролдохгүй."
    },
    {
      name: "Дугуй хагарах | Flat Tire",
      category: "Дугуй",
      icon: "🚲",
      description: "Дугуйн хий алдах, зам дээр гэнэт зөөлрөх эсвэл хагарах.",
      causes: ["Хурц зүйлд хатгуулах", "Хэт бага даралттай явах", "Обудны ирмэгт камер хавчигдах"],
      steps: ["Дугуйг салгаж, камер болон покрышкыг шалга.", "Хурц зүйл үлдсэн эсэхийг покрышкны дотор талаас болгоомжтой шалга.", "Гэмтлийг засах боломжгүй бол камерыг солино.", "Үйлдвэрлэгчийн заасан даралтаар хийл."],
      warning: "Камер угсрахдаа покрышкны ирмэгт хавчуулагдаагүй эсэхийг шалга."
    },
    {
      name: "Камер цоорох | Inner Tube Puncture",
      category: "Дугуй",
      icon: "🔧",
      description: "Камер жижиг нүхтэй болж агаар алдах.",
      causes: ["Шил, хадаас зэрэг хурц зүйл", "Обудны тууз гэмтсэн", "Камер буруу угсарсан"],
      steps: ["Камерыг авч, цоорсон хэсгийг ол.", "Покрышк болон обудны туузыг шалга.", "Нөхөөс эсвэл тохирох шинэ камер хэрэглэ.", "Угсарсны дараа даралтыг шалга."],
      warning: "Покрышкны доторх хурц зүйлийг олж аваагүй бол шинэ камер дахин цоорно."
    },
    {
      name: "Педаль дуугарах | Pedal Noise",
      category: "Бусад",
      icon: "🔩",
      description: "Педаль эргүүлэх эсвэл хүч өгөх үед тачигнах, дуугарах.",
      causes: ["Педалийн холхивч элэгдсэн", "Педалийн резьба сул", "Кривошип сул болсон"],
      steps: ["Педалийг гараар эргүүлж холхивчийг шалга.", "Педалийн бэхэлгээ сул эсэхийг шалга.", "Кривошип болон голын бэхэлгээг шалгуул.", "Элэгдсэн холхивчийг солиул."],
      warning: "Резьба гэмтсэн үед хүчээр чангалах нь кривошипийг гэмтээж болно."
    },
    {
      name: "Амортизатор агаар алдах | Fork Air Leak",
      category: "Сэрээ",
      icon: "🏁",
      description: "Агаарын сэрээ даралтаа барихгүй, зөөлрөх эсвэл доош суух.",
      causes: ["Жийргэвч элэгдсэн", "Агаарын клапан алдагдалтай", "Үйлчилгээний хугацаа хэтэрсэн"],
      steps: ["Сэрээний загвар болон үйлдвэрлэгчийн зааврыг шалга.", "Зөв насосоор даралтыг шалга.", "Клапан болон жийргэвчийн алдагдлыг шалгуул.", "Шаардлагатай бол зориулалтын үйлчилгээ хийлгэ."],
      warning: "Сэрээг задлахын өмнө үйлдвэрлэгчийн зааврыг дага. Даралттай эд ангийг буруу задлах аюултай."
    }
  ];

  const categories = ["Бүгд", "Тоормос", "Хөтлөгч", "Дугуй", "Сэрээ", "Бусад"];
  let activeCategory = "Бүгд";

  const repairMeta = {
    "Тоормос дуугарах | Brake Noise": {
      tools: "Тоормос цэвэрлэгч, цэвэр даавуу, гэрэл",
      difficulty: "Хялбар",
      time: "15–30 минут"
    },
    "Тоормос сулрах | Weak Brakes": {
      tools: "Аллен түлхүүр, тохирох тоормосны багаж",
      difficulty: "Мэргэжлийн",
      time: "30–60 минут"
    },
    "Гинж мултрах | Chain Dropping": {
      tools: "Гинжний хэмжүүр, аллен түлхүүр",
      difficulty: "Дунд",
      time: "15–30 минут"
    },
    "Араа шилжихгүй байх | Gear Shifting Problem": {
      tools: "Аллен түлхүүр, кабель таслагч, арааны тохируулагч",
      difficulty: "Дунд",
      time: "20–45 минут"
    },
    "Дугуй хагарах | Flat Tire": {
      tools: "Дугуй салгагч, насос, нөхөөс эсвэл шинэ камер",
      difficulty: "Хялбар",
      time: "15–30 минут"
    },
    "Камер цоорох | Inner Tube Puncture": {
      tools: "Дугуй салгагч, нөхөөс, цавуу, насос",
      difficulty: "Хялбар",
      time: "15–25 минут"
    },
    "Педаль дуугарах | Pedal Noise": {
      tools: "Педалийн түлхүүр, аллен түлхүүр, тосолгоо",
      difficulty: "Дунд",
      time: "15–30 минут"
    },
    "Амортизатор агаар алдах | Fork Air Leak": {
      tools: "Сэрээний зориулалтын насос, даралт хэмжигч",
      difficulty: "Мэргэжлийн",
      time: "30–90 минут"
    }
  };

  function renderRepairMeta(repair) {
    const meta = repairMeta[repair.name];
    if (!meta) return "";

    return `
      <div class="vx-repair-meta">
        <div><span>🧰 БАГАЖ</span><p>${meta.tools}</p></div>
        <div><span>📊 ХҮНДРЭЛ</span><p>${meta.difficulty}</p></div>
        <div><span>⏱️ ХУГАЦАА</span><p>${meta.time}</p></div>
        <div><span>💰 ҮНЭ</span><p>Оношилгооноос хамаарна</p></div>
      </div>
    `;
  }





  function renderRepairGuide(repair) {
    const illustrations = {
      brake: '<circle cx="120" cy="65" r="42" fill="none" stroke="#a78bfa" stroke-width="9"/><circle cx="120" cy="65" r="8" fill="#64748b"/><path d="M120 23V107 M78 65H162 M90 35L150 95 M150 35L90 95" stroke="#64748b" stroke-width="3"/><rect x="153" y="45" width="18" height="38" rx="5" fill="#22c55e"/>',
      pad: '<rect x="75" y="35" width="90" height="22" rx="7" fill="#ef4444"/><rect x="75" y="75" width="90" height="22" rx="7" fill="#22c55e"/><path d="M120 57V75 M110 67L120 77L130 67" stroke="#f8fafc" stroke-width="4" fill="none"/>',
      chain: '<path d="M45 55H195 M45 80H195" stroke="#a78bfa" stroke-width="9" stroke-linecap="round"/><g fill="#22c55e"><circle cx="65" cy="55" r="9"/><circle cx="95" cy="55" r="9"/><circle cx="125" cy="55" r="9"/><circle cx="155" cy="55" r="9"/><circle cx="185" cy="55" r="9"/></g><path d="M120 85V108 M110 98L120 108L130 98" stroke="#f59e0b" stroke-width="4" fill="none"/>',
      gear: '<circle cx="120" cy="65" r="38" fill="none" stroke="#a78bfa" stroke-width="10"/><circle cx="120" cy="65" r="13" fill="#64748b"/><path d="M120 18V35 M120 95V112 M73 65H90 M150 65H167 M87 32L99 44 M141 86L153 98" stroke="#22c55e" stroke-width="7"/>',
      wheel: '<circle cx="120" cy="65" r="44" fill="none" stroke="#a78bfa" stroke-width="9"/><circle cx="120" cy="65" r="7" fill="#22c55e"/><path d="M120 21V109 M76 65H164 M89 34L151 96 M151 34L89 96" stroke="#64748b" stroke-width="3"/>',
      tube: '<path d="M55 65C55 20 185 20 185 65C185 110 55 110 55 65Z" fill="none" stroke="#a78bfa" stroke-width="12"/><circle cx="120" cy="65" r="9" fill="#ef4444"/><path d="M120 40V52 M120 78V90 M95 65H107 M133 65H145" stroke="#22c55e" stroke-width="4"/>',
      pedal: '<path d="M120 65L165 35 M120 65L75 95" stroke="#a78bfa" stroke-width="9" stroke-linecap="round"/><rect x="145" y="20" width="48" height="18" rx="6" fill="#22c55e" transform="rotate(-30 145 20)"/><rect x="48" y="85" width="48" height="18" rx="6" fill="#22c55e" transform="rotate(-30 48 85)"/><circle cx="120" cy="65" r="10" fill="#f59e0b"/>',
      fork: '<path d="M95 20V65L75 110 M145 20V65L165 110" stroke="#a78bfa" stroke-width="13" stroke-linecap="round" fill="none"/><path d="M95 65H145 M110 20V48 M130 20V48" stroke="#22c55e" stroke-width="5"/><circle cx="120" cy="65" r="9" fill="#f59e0b"/>'
    };

    const guides = {
      "Тоормос дуугарах | Brake Noise": {
        title: "Тоормосны дууг шалгах",
        steps: [
          ["brake", "1. Роторыг шалгах", "Дугуйг эргүүлж ротор мурийсан эсэх, гадаргуу бохирдсон эсэхийг шалга."],
          ["pad", "2. Накладыг шалгах", "Наклад тос болсон, элэгдсэн эсвэл жигд бус болсон эсэхийг үз."],
          ["brake", "3. Цэвэрлэж турших", "Зориулалтын brake cleaner хэрэглэж, бүрэн хатсаны дараа бага хурдтай турш."]
        ]
      },
      "Тоормос сулрах | Weak Brakes": {
        title: "Тоормосны ажиллагааг шалгах",
        steps: [
          ["pad", "1. Накладны элэгдэл", "Накладны үлдсэн зузаан болон роторын байдлыг шалга."],
          ["brake", "2. Кабель эсвэл шингэн", "Механик тоормосны кабель, гидравлик тоормосны шингэн алдагдсан эсэхийг шалгуул."],
          ["brake", "3. Аюулгүй ажиллагааны тест", "Дугуйг хөдөлгөөнгүй байлгаж бариулыг шалга. Сул хэвээр бол унахгүй, механикт үзүүл."]
        ]
      },
      "Гинж мултрах | Chain Dropping": {
        title: "Гинж мултрахыг засах",
        steps: [
          ["chain", "1. Гинжийг зөв байрлуулах", "Педальдахгүйгээр гинжийг араан дээр зөв суулгана."],
          ["gear", "2. Арааг шалгах", "Арааны шүд, шилжүүлэгч, гинжний элэгдлийг шалга."],
          ["chain", "3. Удаанаар турших", "Дугуйг өргөж, араа бүр дээр зөөлөн эргүүлж шалга."]
        ]
      },
      "Араа шилжихгүй байх| Gear Shifting Problem": {
        title: "Арааны тохиргоог шалгах",
        steps: [
          ["gear", "1. Кабелийг шалгах", "Кабель болон гадна бүрээс тасарсан, зэвэрсэн, гацсан эсэхийг үз."],
          ["chain", "2. Шилжүүлэгчийг шалгах", "Шилжүүлэгч болон өлгүүр мурийсан эсэхийг механикаар шалгуул."],
          ["gear", "3. Арааг тохируулах", "Тохируулагчийг бага багаар тааруулж, араа бүрийг шалга."]
        ]
      },
      "Дугуй хагарах | Flat Tire": {
        title: "Дугуй хагарсан үед",
        steps: [
          ["wheel", "1. Дугуйг салгах", "Тоормос болон голын түгжээг зөв суллаж дугуйг салга."],
          ["tube", "2. Камерыг шалгах", "Камерт хий үлээж нүхийг ол. Покрышкны доторх хурц зүйлийг болгоомжтой шалга."],
          ["tube", "3. Нөхөх эсвэл солих", "Нөхөөсийг зааврын дагуу наах эсвэл тохирох шинэ камер хэрэглэ."],
          ["wheel", "4. Угсарч хийлэх", "Камерыг хавчуулахгүй угсарч, покрышкны заасан даралтаар хийл."]
        ]
      },
      "Камер цоорох | Inner Tube Puncture": {
        title: "Камерын цооролтыг засах",
        steps: [
          ["wheel", "1. Камерыг гаргах", "Дугуйг салгаж, покрышкны нэг талыг дугуй салгагчаар гарга."],
          ["tube", "2. Нүхийг олох", "Камерт бага зэрэг хий үлээж, нүхийг усны хөөс эсвэл дуугаар ол."],
          ["tube", "3. Нөхөөс наах", "Гадаргууг цэвэрлэж, нөхөөсний үйлдвэрлэгчийн зааврыг дага."]
        ]
      },
      "Педаль дуугарах | Pedal Noise": {
        title: "Педалийн дууг шалгах",
        steps: [
          ["pedal", "1. Педалийг шалгах", "Педалийг гараар эргүүлж холхивч жигд эргэж байгаа эсэхийг үз."],
          ["pedal", "2. Бэхэлгээг шалгах", "Педаль болон кривошипийн бэхэлгээ сул эсэхийг шалга."],
          ["pedal", "3. Зөв угсрах", "Резьба гэмтээгүй бол үйлдвэрлэгчийн зааврын дагуу тосолж, зөв багажаар чангал."]
        ]
      },
      "Амортизатор агаар алдах | Fork Air Leak": {
        title: "Агаарын сэрээг шалгах",
        steps: [
          ["fork", "1. Сэрээний загварыг шалгах", "Сэрээний загвар, үйлдвэрлэгчийн зөвшөөрсөн даралтын хэмжээг ол."],
          ["fork", "2. Даралтыг хэмжих", "Зөвхөн зориулалтын shock pump ашиглан даралтыг шалга."],
          ["fork", "3. Алдагдлыг оношлох", "Клапан болон жийргэвчийг мэргэжлийн механикаар шалгуул."]
        ]
      }
    };

    const guide = guides[repair.name];
    if (!guide) return "";

    return `
      <div class="vx-flat-guide">
        <h4>ЗУРАГТАЙ ЗАСВАРЫН ЗААВАР — ${guide.title}</h4>
        <div class="vx-flat-guide-grid">
          ${guide.steps.map((step, index) => `
            <div class="vx-flat-step">
              <svg viewBox="0 0 240 130" role="img" aria-label="${step[1]}">
                ${illustrations[step[0]]}
              </svg>
              <b>${step[1]}</b>
              <p>${step[2]}</p>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderCategories() {
    categoryBox.innerHTML = categories.map(category => `
      <button type="button"
        class="vx-repair-filter ${category === activeCategory ? "active" : ""}"
        data-repair-category="${category}">
        ${category}
      </button>
    `).join("");
  }

  function renderRepairs() {
    const term = search.value.trim().toLowerCase();

    const filtered = repairs.filter(repair => {
      const categoryMatch =
        activeCategory === "Бүгд" || repair.category === activeCategory;

      const searchable = [
        repair.name,
        repair.category,
        repair.description,
        ...repair.causes,
        ...repair.steps
      ].join(" ").toLowerCase();

      return categoryMatch && searchable.includes(term);
    });

    count.textContent = filtered.length;

    if (!filtered.length) {
      grid.innerHTML = `
        <div class="vx-repair-empty">
          <h3>Засварын заавар олдсонгүй</h3>
          <p>Өөр үгээр хайх эсвэл өөр ангилал сонгоно уу.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(repair => `
      <article class="vx-repair-card">
        <div class="vx-repair-icon">${repair.icon}</div>
        <span class="vx-repair-tag">${repair.category}</span>
        <h3>${repair.name}</h3>
        <p>${repair.description}</p>
        ${renderRepairMeta(repair)}

        <details class="vx-repair-details">
          <summary>ЗАСВАРЫН ЗААВАР ҮЗЭХ +</summary>

          <h4>БОЛОМЖИТ ШАЛТГААН</h4>
          <ul>${repair.causes.map(item => `<li>${item}</li>`).join("")}</ul>

          <h4>ШАЛГАХ / ЗАСВАРЛАХ ДАРААЛАЛ</h4>
          <ol>${repair.steps.map(item => `<li>${item}</li>`).join("")}</ol>

          ${renderRepairGuide(repair)}
        <div class="vx-repair-warning">⚠ ${repair.warning}</div>
        </details>
      </article>
    `).join("");
  }

  categoryBox.addEventListener("click", event => {
    const button = event.target.closest("[data-repair-category]");
    if (!button) return;

    activeCategory = button.dataset.repairCategory;
    renderCategories();
    renderRepairs();
  });

  search.addEventListener("input", renderRepairs);

  renderCategories();
  renderRepairs();
})();
