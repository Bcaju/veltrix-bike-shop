
let token = localStorage.getItem("vx-admin-token") || "";
let allProducts = [];
let allOrders = [];
let activeChat = "";

const $ = id => document.getElementById(id);

const auth = () => ({
  "Content-Type": "application/json",
  "Authorization": "Bearer " + token
});

async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { ...auth(), ...(opts.headers || {}) }
  });

  const d = await r.json().catch(() => ({}));

  if (!r.ok) throw Error(d.error || "Алдаа гарлаа");
  return d;
}

function money(n) {
  return Number(n || 0).toLocaleString("mn-MN") + "₮";
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function formatList(value) {
  return Array.isArray(value) ? value.join(", ") : (value || "");
}

function dateTime(d) {
  if (!d) return "-";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "-" :
    date.toLocaleString("mn-MN");
}

function message(text) {
  $("adminMsg").textContent = text || "";
}

async function start() {
  if (!token) return;

  try {
    $("login").classList.add("hidden");
    $("dashboard").classList.remove("hidden");

    await Promise.all([
      overview(),
      products(),
      orders(),
      coupons(),
      reviews(),
      chats()
    ]);
  } catch (e) {
    token = "";
    localStorage.removeItem("vx-admin-token");
    $("login").classList.remove("hidden");
    $("dashboard").classList.add("hidden");
    $("loginMsg").textContent = e.message;
  }
}

$("loginBtn").onclick = async () => {
  try {
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("password").value })
    });

    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Нэвтрэхэд алдаа гарлаа");

    token = d.token;
    localStorage.setItem("vx-admin-token", token);
    await start();
  } catch (e) {
    $("loginMsg").textContent = e.message;
  }
};

$("password").addEventListener("keydown", e => {
  if (e.key === "Enter") $("loginBtn").click();
});

$("logout").onclick = () => {
  token = "";
  localStorage.removeItem("vx-admin-token");
  location.reload();
};

/* ANALYTICS */

async function overview() {
  const d = await api("/api/admin/overview");

  const stats = [
    ["Идэвхтэй бараа", d.products],
    ["Нийт захиалга", d.orders],
    ["Нийт борлуулалт", money(d.revenue)],
    ["Энэ сарын борлуулалт", money(d.monthly)],
    ["Бага үлдэгдэл", d.lowStock],
    ["Хүргэгдсэн", d.delivered],
    ["Цуцлагдсан", d.cancelled],
    ["Хүлээгдэж буй үнэлгээ", d.pendingReviews],
    ["Уншаагүй мессеж", d.unreadMessages]
  ];

  $("stats").innerHTML = stats.map(x => `
    <div class="stat">
      <small>${esc(x[0])}</small>
      <b>${esc(x[1])}</b>
    </div>
  `).join("");
}

/* PRODUCTS */

async function products() {
  allProducts = await api("/api/admin/products");

  $("productTable").innerHTML = `
    <div class="table-wrap">
      <table>
        <tr>
          <th>Бараа</th>
          <th>Үнэ</th>
          <th>Үлдэгдэл</th>
          <th>Төлөв</th>
          <th>Үйлдэл</th>
        </tr>

        ${allProducts.map(p => `
          <tr>
            <td>
              ${esc(p.name)}
              <small>${esc(p.category)}</small>
            </td>
            <td>${money(p.price)}</td>
            <td>${esc(p.stock)}</td>
            <td>${p.active ? "Идэвхтэй" : "Архивласан"}</td>
            <td>
              <button type="button" data-admin-action="edit-product" data-id="${esc(p._id)}">Засах</button>
              <button type="button" data-admin-action="stock-product" data-id="${esc(p._id)}">Үлдэгдэл</button>
              <button type="button" data-admin-action="archive-product" data-id="${esc(p._id)}">Архивлах</button>
              <button type="button" data-admin-action="permanent-delete-product" data-id="${esc(p._id)}">Устгах</button>
            </td>
          </tr>
        `).join("")}
      </table>
    </div>
  `;
}

/* INVENTORY MANAGEMENT */

async function inventory() {
  const select = $("inventoryProduct");
  const selected = select.value;

  select.innerHTML = '<option value="">Бараа сонгох</option>' +
    allProducts.map(p => `
      <option value="${esc(p._id)}">
        ${esc(p.name)} — үлдэгдэл: ${esc(p.stock)}
      </option>
    `).join("");

  if (allProducts.some(p => String(p._id) === selected)) {
    select.value = selected;
  }

  const history = await api("/api/admin/inventory/movements");

  $("inventoryHistory").innerHTML = history.length ? `
    <div class="table-wrap">
      <table>
        <tr>
          <th>Огноо</th>
          <th>Бараа</th>
          <th>Төрөл</th>
          <th>Тоо</th>
          <th>Өмнө</th>
          <th>Дараа</th>
          <th>Эх сурвалж</th>
          <th>Тайлбар</th>
        </tr>
        ${history.map(m => `
          <tr>
            <td>${dateTime(m.createdAt)}</td>
            <td>${esc(m.productName)}</td>
            <td class="${m.type === "Орлого" ? "stock-in" : "stock-out"}">
              ${esc(m.type)}
            </td>
            <td>${esc(m.quantity)}</td>
            <td>${esc(m.before)}</td>
            <td>${esc(m.after)}</td>
            <td>${m.source === "order" ? "Автомат" : "Гар бүртгэл"}</td>
            <td>${esc(m.note || "-")}</td>
          </tr>
        `).join("")}
      </table>
    </div>
  ` : "<p>Одоогоор агуулахын бүртгэл алга.</p>";
}

window.stockProduct = id => {
  $("inventoryProduct").value = id;
  $("inventoryForm").scrollIntoView({ behavior: "smooth", block: "center" });
};

$("inventoryForm").addEventListener("submit", async event => {
  event.preventDefault();

  const submit = $("inventoryForm").querySelector('button[type="submit"]');
  submit.disabled = true;
  $("inventoryMessage").textContent = "Бүртгэж байна...";

  try {
    await api("/api/admin/inventory/movements", {
      method: "POST",
      body: JSON.stringify({
        productId: $("inventoryProduct").value,
        type: $("inventoryType").value,
        quantity: Number($("inventoryQuantity").value),
        note: $("inventoryNote").value
      })
    });

    $("inventoryQuantity").value = "";
    $("inventoryNote").value = "";
    $("inventoryMessage").textContent = "Агуулахын бүртгэл амжилттай хадгалагдлаа.";

    await products();
    await inventory();
    await overview();
  } catch (error) {
    $("inventoryMessage").textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

function showPreview(url) {
  const img = $("imagePreview");

  if (url) {
    img.src = url;
    img.style.display = "block";
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
  }
}

$("pimage").addEventListener("input", () => {
  showPreview($("pimage").value.trim());
});

$("pimageFile").addEventListener("change", async () => {
  const file = $("pimageFile").files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    $("uploadMsg").textContent = "Зөвхөн зураг сонгоно уу.";
    $("pimageFile").value = "";
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    $("uploadMsg").textContent = "Зураг 10MB-аас бага байх ёстой.";
    $("pimageFile").value = "";
    return;
  }

  $("uploadMsg").textContent = "Зураг байршуулж байна...";

  try {
    const signed = await api("/api/admin/upload-signature", {
      method: "POST",
      body: JSON.stringify({})
    });

    const form = new FormData();
    form.append("file", file);
    form.append("api_key", signed.apiKey);
    form.append("timestamp", signed.timestamp);
    form.append("signature", signed.signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`,
      { method: "POST", body: form }
    );

    const result = await response.json();

    if (!response.ok) {
      throw Error(result.error?.message || "Зураг upload амжилтгүй.");
    }

    $("pimage").value = result.secure_url;
    showPreview(result.secure_url);
    $("uploadMsg").textContent = "Зураг амжилттай байршууллаа!";
  } catch (e) {
    $("uploadMsg").textContent = "Алдаа: " + e.message;
  }
});

window.editProduct = id => {
  const p = allProducts.find(x => x._id === id);
  if (!p) return;

  $("pid").value = p._id;
  $("pname").value = p.name || "";
  $("pcat").value = p.category || "";
  $("pprice").value = p.price || 0;
  $("pold").value = p.oldPrice || 0;
  $("pstock").value = p.stock || 0;
  $("pimage").value = p.image || "";
  const compatibility = p.compatibility || {};

$("pwheelSizes").value = formatList(compatibility.wheelSizes);
$("pbrakeTypes").value = formatList(compatibility.brakeTypes);
$("pspeeds").value = formatList(compatibility.speeds);
$("pbikeTypes").value = formatList(compatibility.bikeTypes);
  $("pfeatured").checked = !!p.featured;
  $("pimageFile").value = "";

  $("uploadMsg").textContent = "Одоо байгаа зураг";
  showPreview(p.image || "");
  $("productForm").classList.remove("hidden");
};

window.deleteProduct = async id => {
  if (!confirm("Энэ барааг дэлгүүрээс архивлах уу?")) return;

  try {
    await api("/api/admin/products/" + id, { method: "DELETE" });
    await products();
    await overview();
    message("Бараа архивлагдлаа.");
  } catch (e) {
    message(e.message);
  }
};

window.permanentlyDeleteProduct = async id => {
  if (!confirm("АНХААР! Энэ барааг бүр мөсөн устгах уу? Энэ үйлдлийг буцаах боломжгүй.")) return;

  if (!confirm("Та үнэхээр бүр мөсөн устгахдаа итгэлтэй байна уу?")) return;

  try {
    await api("/api/admin/products/" + id + "/permanent", {
      method: "DELETE"
    });
    await products();
    await overview();
    message("Бараа бүр мөсөн устгагдлаа.");
  } catch (e) {
    message(e.message);
  }
};

$("newProduct").onclick = () => {
  $("productForm").reset();
  $("pid").value = "";
  $("uploadMsg").textContent = "Зураг сонгоогүй байна.";
  showPreview("");
  $("productForm").classList.remove("hidden");
};

$("cancelForm").onclick = () => {
  $("productForm").classList.add("hidden");
  $("productForm").reset();
  $("pid").value = "";
  $("uploadMsg").textContent = "Зураг сонгоогүй байна.";
  showPreview("");
};

$("productForm").onsubmit = async e => {
  e.preventDefault();

  const id = $("pid").value;

  const body = {
  name: $("pname").value.trim(),
  category: $("pcat").value.trim(),
  price: Number($("pprice").value),
  oldPrice: Number($("pold").value),
  stock: Number($("pstock").value),
  image: $("pimage").value.trim(),
  description: $("pdesc").value.trim(),
  featured: $("pfeatured").checked,

  compatibility: {
    wheelSizes: parseList($("pwheelSizes").value),
    brakeTypes: parseList($("pbrakeTypes").value),
    speeds: parseList($("pspeeds").value),
    bikeTypes: parseList($("pbikeTypes").value)
  }
};

  try {
    await api(
      id ? "/api/admin/products/" + id : "/api/admin/products",
      {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(body)
      }
    );

    $("productForm").classList.add("hidden");
    await products();
    await overview();
    message("Бараа хадгалагдлаа.");
  } catch (e) {
    message(e.message);
  }
};

/* ORDERS */

async function orders() {
  allOrders = await api("/api/admin/orders");
  renderOrders();
}

function renderOrders() {
  const query = ($("orderSearch")?.value || "").trim().toLowerCase();
  const status = $("orderStatusFilter")?.value || "";

  const filtered = allOrders.filter(o => {
    const searchText = [
      o.code, o.customer, o.phone, o.address
    ].join(" ").toLowerCase();

    return searchText.includes(query) &&
      (!status || o.status === status);
  });

  $("orderTable").innerHTML = `
    <div class="order-result-count">${filtered.length} захиалга</div>
    <div class="table-wrap">
      <table>
        <tr>
          <th>Захиалга</th>
          <th>Харилцагч</th>
          <th>Бараа</th>
          <th>Нийт</th>
          <th>Төлөв</th>
          <th>Төлбөр</th>
          <th>Дэлгэрэнгүй</th>
        </tr>
        ${filtered.map(o => `
          <tr>
            <td>
              <b>${esc(o.code)}</b>
              <small>${dateTime(o.createdAt)}</small>
            </td>
            <td>
              ${esc(o.customer)}
              <small>${esc(o.phone)} · ${esc(o.address)}</small>
            </td>
            <td>
              ${(o.items || []).map(i =>
                esc(i.name) + " × " + esc(i.quantity)
              ).join("<br>")}
            </td>
            <td><b>${money(o.total)}</b></td>
            <td>
              <select data-admin-action="change-order"
                data-id="${esc(o._id)}" data-key="status">
                ${["Шинэ","Баталгаажсан","Хүргэлтэд гарсан","Хүргэгдсэн","Цуцалсан"].map(s =>
                  `<option ${o.status === s ? "selected" : ""}>${s}</option>`
                ).join("")}
              </select>
            </td>
            <td>
              <select data-admin-action="change-order"
                data-id="${esc(o._id)}" data-key="paymentStatus">
                ${["Төлөөгүй","Төлсөн","Буцаасан"].map(s =>
                  `<option ${o.paymentStatus === s ? "selected" : ""}>${s}</option>`
                ).join("")}
              </select>
            </td>
            <td>
              <button type="button" class="btn"
                data-admin-action="view-order"
                data-id="${esc(o._id)}">Харах</button>
            </td>
          </tr>
        `).join("")}
      </table>
    </div>
    ${filtered.length ? "" : "<p>Захиалга олдсонгүй.</p>"}
  `;
}

window.viewOrder = id => {
  const o = allOrders.find(x => String(x._id) === String(id));
  if (!o) return message("Захиалга олдсонгүй.");

  const box = $("orderDetails");
  box.classList.remove("hidden");

  const orderHistory = Array.isArray(o.statusHistory) && o.statusHistory.length
    ? o.statusHistory
    : [{
        status: o.status || "Шинэ",
        changedAt: o.updatedAt || o.createdAt,
        note: "Одоогийн төлөв"
      }];

  box.innerHTML = `
    <div class="section-head">
      <h3>ЗАХИАЛГЫН ДЭЛГЭРЭНГҮЙ</h3>
      <button type="button" class="btn"
        data-admin-action="close-order-details">Хаах ✕</button>
    </div>
    <div class="order-info-grid">
      <div><small>Захиалгын код</small><b>${esc(o.code)}</b></div>
      <div><small>Огноо</small><b>${dateTime(o.createdAt)}</b></div>
      <div><small>Харилцагч</small><b>${esc(o.customer)}</b></div>
      <div><small>Утас</small><b>${esc(o.phone)}</b></div>
      <div><small>Хүргэлтийн хаяг</small><b>${esc(o.address)}</b></div>
      <div><small>Захиалгын төлөв</small><b>${esc(o.status)}</b></div>
      <div><small>Төлбөрийн арга</small><b>${esc(o.paymentMethod || "-")}</b></div>
      <div><small>Төлбөрийн төлөв</small><b>${esc(o.paymentStatus || "-")}</b></div>
    </div>

    <section class="order-history">
      <h4>ТӨЛӨВИЙН ТҮҮХ</h4>
      <ol class="order-history-list">
        ${orderHistory.map(item => `
          <li class="order-history-item">
            <span class="order-history-dot"></span>
            <div>
              <b>${esc(item.status || "-")}</b>
              <small>${dateTime(item.changedAt)}</small>
              <p>${esc(item.note || "Төлөв шинэчлэгдсэн")}</p>
            </div>
          </li>
        `).join("")}
      </ol>
    </section>

    <h4>ЗАХИАЛСАН БАРАА</h4>
    <div class="table-wrap">
      <table>
        <tr><th>Бараа</th><th>Үнэ</th><th>Тоо</th><th>Дүн</th></tr>
        ${(o.items || []).map(i => `
          <tr>
            <td>${esc(i.name)}</td>
            <td>${money(i.price)}</td>
            <td>${esc(i.quantity)}</td>
            <td>${money(Number(i.price || 0) * Number(i.quantity || 0))}</td>
          </tr>
        `).join("")}
      </table>
    </div>
    <div class="order-totals">
      <p>Барааны дүн: <b>${money(o.subtotal)}</b></p>
      <p>Хямдрал: <b>${money(o.discount)}</b></p>
      <p>Хүргэлт: <b>${money(o.deliveryFee)}</b></p>
      <h3>НИЙТ: ${money(o.total)}</h3>
    </div>
    <p><b>Нэмэлт тэмдэглэл:</b> ${esc(o.note || "Байхгүй")}</p>
  `;

  box.scrollIntoView({ behavior: "smooth", block: "start" });
};

$("orderSearch").addEventListener("input", renderOrders);
$("orderStatusFilter").addEventListener("change", renderOrders);

window.changeOrder = async (id, key, value) => {
  try {
    await api("/api/admin/orders/" + id, {
      method: "PATCH",
      body: JSON.stringify({ [key]: value })
    });

    await Promise.all([overview(), orders()]);
    message("Захиалга шинэчлэгдлээ.");
  } catch (e) {
    await orders().catch(() => {});
    message(e.message);
  }
};

/* COUPONS */

async function coupons() {
  const cs = await api("/api/admin/coupons");

  $("couponTable").innerHTML = cs.map(c => `
    <div class="cart-row">
      <div>
        <b>${esc(c.code)} — ${esc(c.percent)}%</b>
        ${c.expiresAt ? `<small style="color:#a855f7">Дуусах: ${dateTime(c.expiresAt)}</small>` : "<small style=\"color:var(--muted)\">Хугацаагүй</small>"}
      </div>
      <button type="button" data-admin-action="remove-coupon" data-id="${esc(c._id)}">Устгах</button>
    </div>
  `).join("") || "<p>Купон алга.</p>";
}

window.removeCoupon = async id => {
  try {
    await api("/api/admin/coupons/" + id, { method: "DELETE" });
    await coupons();
    message("Купон устгагдлаа.");
  } catch (e) {
    message(e.message);
  }
};

$("couponForm").onsubmit = async e => {
  e.preventDefault();

  try {
    const expiresVal = $("couponExpires")?.value;
    await api("/api/admin/coupons", {
      method: "POST",
      body: JSON.stringify({
        code: $("couponCode").value,
        percent: Number($("couponPercent").value),
        expiresAt: expiresVal ? new Date(expiresVal) : null
      })
    });

    $("couponForm").reset();
    await coupons();
    message("Купон үүсгэлээ.");
  } catch (e) {
    message(e.message);
  }
};

/* REVIEWS */

async function reviews() {
  const list = await api("/api/admin/reviews");

  $("reviewTable").innerHTML = list.map(r => `
    <article class="panel" style="margin-top:12px">
      <div class="section-head">
        <div>
          <b>${esc(r.customer)}</b>
          <small>${esc(r.phone)} · ${dateTime(r.createdAt)}</small>
        </div>
        <b>${"★".repeat(Math.max(0, Math.min(5, Number(r.rating) || 0)))}${"☆".repeat(5 - Math.max(0, Math.min(5, Number(r.rating) || 0)))}</b>
      </div>

      <p>${esc(r.comment || "Сэтгэгдэл бичээгүй")}</p>
      <small>Захиалгын код: ${esc(r.orderCode)}</small>
      <small>Барааны ID: ${esc(r.productId)}</small>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        ${r.approved
          ? '<span>Нийтэлсэн</span>'
          : `<button type="button" class="btn red" data-admin-action="approve-review" data-id="${esc(r._id)}">Батлах</button>`
        }
        <button type="button" class="btn" data-admin-action="delete-review" data-id="${esc(r._id)}">Устгах</button>
      </div>
    </article>
  `).join("") || "<p>Одоогоор үнэлгээ алга байна.</p>";
}

window.approveReview = async id => {
  try {
    await api("/api/admin/reviews/" + id, {
      method: "PATCH",
      body: JSON.stringify({ approved: true })
    });

    await Promise.all([reviews(), overview()]);
    message("Үнэлгээ нийтлэгдлээ.");
  } catch (e) {
    message(e.message);
  }
};

window.deleteReview = async id => {
  if (!confirm("Энэ үнэлгээг устгах уу?")) return;

  try {
    await api("/api/admin/reviews/" + id, { method: "DELETE" });
    await Promise.all([reviews(), overview()]);
    message("Үнэлгээ устгагдлаа.");
  } catch (e) {
    message(e.message);
  }
};

/* CUSTOMER CHATS */

async function chats() {
  const list = await api("/api/admin/chats");

  $("chatList").innerHTML = list.map(c => `
    <button class="admin-chat-item ${activeChat === c._id ? "active" : ""}"
      data-admin-action="open-chat" data-id="${esc(c._id)}">
      <b>${esc(c._id)}</b>
      <small>${esc(c.lastMessage || "")}</small>
      <small>${dateTime(c.updatedAt)}</small>
      ${c.unread ? `<span class="chat-unread">${c.unread} шинэ</span>` : ""}
    </button>
  `).join("") || "<p>Одоогоор чат алга.</p>";
}

window.openChat = async code => {
  activeChat = code;

  $("chatTitle").textContent = "Захиалга: " + code;
  $("chatInput").disabled = false;
  $("chatSend").disabled = false;
  $("chatMessages").innerHTML = "<p>Мессеж ачаалж байна...</p>";

  try {
    const list = await api("/api/admin/chats/" + encodeURIComponent(code));

    $("chatMessages").innerHTML = list.map(m => `
      <div class="admin-message ${m.sender === "admin" ? "admin" : "customer"}">
        <small>${m.sender === "admin" ? "VELTRIX ADMIN" : "ХАРИЛЦАГЧ"} · ${dateTime(m.createdAt)}</small>
        <p>${esc(m.message)}</p>
      </div>
    `).join("") || "<p>Мессеж алга.</p>";

    $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
    await chats();
    await overview();
  } catch (e) {
    $("chatMessages").textContent = e.message;
  }
};

$("chatForm").onsubmit = async e => {
  e.preventDefault();

  const text = $("chatInput").value.trim();
  if (!text || !activeChat) return;

  $("chatSend").disabled = true;

  try {
    await api("/api/admin/chats/" + encodeURIComponent(activeChat), {
      method: "POST",
      body: JSON.stringify({ message: text })
    });

    $("chatInput").value = "";
    await openChat(activeChat);
    message("Мессеж илгээгдлээ.");
  } catch (e) {
    message(e.message);
  } finally {
    $("chatSend").disabled = false;
  }
};


/* CSP-SAFE ADMIN EVENT DELEGATION */

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-admin-action]");
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.adminAction;

  try {
    switch (action) {
      case "edit-product":
        window.editProduct(id);
        break;
      case "stock-product":
        window.stockProduct(id);
        break;
      case "archive-product":
        await window.deleteProduct(id);
        break;
      case "permanent-delete-product":
        await window.permanentlyDeleteProduct(id);
        break;
      case "remove-coupon":
        await window.removeCoupon(id);
        break;
      case "approve-review":
        await window.approveReview(id);
        break;
      case "delete-review":
        await window.deleteReview(id);
        break;
      case "open-chat":
        await window.openChat(id);
        break;
      case "view-order":
        window.viewOrder(id);
        break;
      case "close-order-details":
        $("orderDetails").classList.add("hidden");
        break;
    }
  } catch (error) {
    message(error.message || "Үйлдэл амжилтгүй боллоо.");
  }
});

document.addEventListener("change", async event => {
  const select = event.target.closest(
    'select[data-admin-action="change-order"]'
  );
  if (!select) return;

  await window.changeOrder(
    select.dataset.id,
    select.dataset.key,
    select.value
  );
});

/* NAVIGATION */

async function loadTab(tab) {
  try {
    if (tab === "products") {
      await products();
      await inventory();
    }
    if (tab === "orders") await orders();
    if (tab === "coupons") await coupons();
    if (tab === "reviews") await reviews();
    if (tab === "chats") await chats();
  } catch (e) {
    message(e.message);
  }
}

document.querySelectorAll("[data-tab]").forEach(b => {
  b.onclick = async () => {
    document.querySelectorAll("[data-tab]").forEach(x =>
      x.classList.toggle("active", x === b)
    );

    ["products", "orders", "coupons", "reviews", "chats"].forEach(t =>
      $("tab-" + t).classList.toggle("hidden", t !== b.dataset.tab)
    );

    await loadTab(b.dataset.tab);
  };
});

$("refreshOrders").onclick = orders;
$("refreshReviews").onclick = reviews;
$("refreshChats").onclick = chats;

start();
