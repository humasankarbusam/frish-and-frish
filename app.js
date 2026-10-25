const C=window.FRISH_CONFIG||{},ready=C.SUPABASE_URL?.startsWith("https://")&&!C.SUPABASE_URL.includes("PASTE_")&&C.SUPABASE_ANON_KEY&&!C.SUPABASE_ANON_KEY.includes("PASTE_"),db=ready?supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY):null;
let ps=[],basket=[],cat="All",cats=["All"],sessionUser=null,channel=null;
const $=x=>document.getElementById(x),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),rs=n=>"₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});

function init(){
  if(!db){
    $("products").innerHTML='<div class="panel">Website files are ready. Follow SETUP.md to connect Supabase and enable live products/orders.</div>';
    return;
  }
  loadProducts();
  
if (typeof loadOffer === "function") loadOffer();

  // Auth routing is handled by the admin-checked listener below.
  // Do not open the admin dashboard merely because any user signed in via customer OTP.
}
async function loadProducts(){
  let {data,error}=await db
    .from("products")
    .select("*")
    .order("created_at",{ascending:false});

  if(error){
    console.error("PRODUCT LOAD ERROR:",error);
    $("products").textContent="Could not load products. Check setup.";
    return;
  }
  ps=data||[];

  console.log("MANGO CHECK:",ps.filter(p =>
    String(p.name||"").toLowerCase().includes("mango")
  ));
  console.log("LOADED PRODUCTS:",data);
  console.log("PRODUCT COUNT:",data?.length);

  cats=["All",...new Set(ps.map(p=>p.category).filter(Boolean))];

  $("filters").innerHTML=cats.map(x =>
    `<button class="${x===cat?"active":""}" onclick="setCat('${esc(x)}')">${esc(x)}</button>`
  ).join("");

  drawProducts();

  if(channel) db.removeChannel(channel);

  channel=db.channel("products-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"products"},loadProducts)
    .subscribe();
}
window.setCat=x=>{
  cat=x;
  $("filters").querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.textContent===x));
  drawProducts();
};
function drawProducts(){
  let q=$("search").value.toLowerCase();
let list=ps.filter(p=>
    (p.is_available || Number(p.stock_qty)<=0) &&
    (cat==="All"||p.category===cat) &&
    (`${p.name} ${p.category}`).toLowerCase().includes(q)
  );
  $("products").innerHTML=list.map(p=>{
    const soldOut=Number(p.stock_qty)<=0;
    const item=basket.find(i=>i.id===p.id);
    const qty=item?item.qty:0;

    const control=soldOut
      ? `<button class="add" disabled style="opacity:.5;cursor:not-allowed">0</button>`
      : qty>0
        ? `<div class="product-qty">
             <button class="qty-minus" aria-label="Decrease ${esc(p.name)} quantity" onclick="productQty('${p.id}',-1)">−</button>
             <b>${qty}</b>
             <button class="qty-plus" aria-label="Increase ${esc(p.name)} quantity" onclick="productQty('${p.id}',1)">+</button>
           </div>`
        : `<button class="add" aria-label="Add ${esc(p.name)} to basket" onclick="add('${p.id}')">+</button>`;

    return `
      <article class="product ${soldOut?'sold-out':''}">
        <div class="pic">
          ${p.image_url
            ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" onerror="this.style.display='none'">`
            : esc(p.emoji||"🥬")}
          ${soldOut?'<span class="sold-out-label">SOLD OUT</span>':""}
        </div>
        <h3>${esc(p.name)}</h3>
        <small>${esc(p.unit||"each")} · ${esc(p.category)} ${p.offer_text?"· "+esc(p.offer_text):""}</small>
        <div class="pfoot"><b>${rs(p.price)}</b>${control}</div>
      </article>`;
  }).join("")||"<p>No products available currently.</p>";
}
$("search").oninput=drawProducts;

window.add=id=>{
  let p=ps.find(p=>p.id===id),i=basket.find(i=>i.id===id);
  if(!p)return;
  if(i)i.qty=Math.min(i.qty+1,p.stock_qty);
  else basket.push({id,qty:1});
  drawCart();
  drawProducts();
};

window.productQty=(id,delta)=>{
  let item=basket.find(i=>i.id===id),p=ps.find(p=>p.id===id);
  if(!p)return;
  if(!item && delta>0) basket.push({id,qty:1});
  else if(item){
    item.qty+=delta;
    if(item.qty<=0) basket=basket.filter(i=>i.id!==id);
    else item.qty=Math.min(item.qty,p.stock_qty);
  }
  drawCart();
  drawProducts();
};

function drawCart(){
  $("count").textContent=basket.reduce((a,i)=>a+i.qty,0);
  $("cartRows").innerHTML=basket.map(i=>{
    let p=ps.find(p=>p.id===i.id);
    if(!p)return "";
    return `<div class="line"><div><b>${esc(p.name)}</b><div class="qty"><button onclick="qty('${p.id}',-1)">−</button> ${i.qty} <button onclick="qty('${p.id}',1)">+</button></div></div><b>${rs(p.price*i.qty)}</b></div>`;
  }).join("")||"<p>Your basket is empty.</p>";
  $("total").textContent=rs(basket.reduce((a,i)=>a+(ps.find(p=>p.id===i.id)?.price||0)*i.qty,0));
}

window.qty=(id,d)=>{
  let i=basket.find(i=>i.id===id),p=ps.find(p=>p.id===id);
  if(!i||!p)return;
  i.qty+=d;
  if(i.qty<1)basket=basket.filter(x=>x.id!==id);
  else i.qty=Math.min(i.qty,p.stock_qty);
  drawCart();
  drawProducts();
};

function cartOpen(v){
  $("cart").classList.toggle("hidden",!v);
  $("overlay").classList.toggle("hidden",!v);
}

$("openCart").onclick=()=>cartOpen(true);
$("closeCart").onclick=()=>cartOpen(false);
$("overlay").onclick=()=>{
  cartOpen(false);
  $("login").classList.add("hidden");
};

$("place").onclick=async()=>{
  if(!db)return alert("Please connect Supabase first.");
  if(!basket.length)return alert("Basket is empty.");
  const { data: { user: customerUser } } = await db.auth.getUser();
  if (!customerUser) {
    showCustomerAuth(true);
    $("customerAuthMessage").textContent = "Please log in with OTP before placing your order.";
    return;
  }

 let name=$("name").value.trim(),phone=$("phone").value.trim(),address=$("address").value.trim(),notes=$("notes").value.trim();
let paymentMethod=$("paymentMethod")?.value || "cod";
let paymentText=paymentMethod==="upi"
  ? "Google Pay / PhonePe (UPI) - Online Payment"
  : "Cash on Delivery";

if (!phone && customerUser.phone) phone = customerUser.phone;

if(!name||!address||!/^[6-9]\d{9}$/.test(phone))return alert("Enter name, delivery address and valid 10-digit mobile number.");
  let items=basket.map(i=>{
    let p=ps.find(p=>p.id===i.id);
    return {product_id:p.id,name:p.name,price:p.price,qty:i.qty,unit:p.unit,line_total:p.price*i.qty};
  });

  let {data,error}=await db.rpc("place_customer_order",{
    p_customer_name:name,
    p_phone:phone,
    p_address:address,
    p_notes:notes,
    p_items:items
  });

  if(error)return alert("Order failed: "+error.message);

  let total=items.reduce((s,i)=>s+i.line_total,0);
  if (paymentMethod === "upi") {
  const upiId = "huma94@axl";

const upiUrl = `upi://pay?pa=${upiId}&pn=Frish%20%26%20Frish&am=${total.toFixed(2)}&cu=INR&tn=${encodeURIComponent("Order " + data.order_number)}`;

  const payNow = confirm(
    `Order saved successfully!\nTotal: ${rs(total)}\n\nGoogle Pay / PhonePe ద్వారా ఇప్పుడు చెల్లించాలా?`
  );

if (payNow) {
  window.location.href = upiUrl;
  return;
}
  }
let msg=[
  "*Frish & Frish Order*",
  "Order: "+data.order_number,
  ...items.map(i=>`${i.name} × ${i.qty} = ${rs(i.line_total)}`),
  `Total: ${rs(total)}`,
  `Payment Method: ${paymentText}`,
  `Name: ${name}`,
  `Phone: ${phone}`,
  `Address: ${address}`,
  notes
].filter(Boolean).join("\n");
  basket=[];
  drawCart();
  drawProducts(); // Reset product cards so the old quantity disappears after ordering.
  cartOpen(false);
  await loadCustomerOrders();
  window.open("https://wa.me/917729015126?text="+encodeURIComponent(msg),"_blank");
  alert("Order saved! WhatsApp will open so you can send the details.");
};
const adminBtn = document.getElementById("adminShortcut");
const loginPanel = $("login");
const loginOverlay = $("overlay");
const signInBtn = $("signIn");

function showLogin(show) {
  if (!loginPanel || !loginOverlay) return;
  loginPanel.classList.toggle("hidden", !show);
  loginOverlay.classList.toggle("hidden", !show);
  if (show) $("email")?.focus();
  else $("password").value = "";
}

function closeStorePanels() {
  $("cart").classList.add("hidden");
  showLogin(false);
  $("overlay").classList.add("hidden");
}

async function isCurrentUserAdmin() {
  if (!db) return false;
  const { data: { user }, error: userError } = await db.auth.getUser();
  if (userError || !user) return false;
  const { data, error } = await db.rpc("is_frish_admin");
  if (error) {
    console.error("Could not verify admin access:", error.message);
    return false;
  }
  return data === true;
}

function openAdmin() {
  const admin = $("admin");
  if (!admin) return;
  closeStorePanels();
  admin.classList.remove("hidden");
  if (typeof renderAdminTab === "function") renderAdminTab("overview");
  else if (typeof adminTab === "function") adminTab("overview");
  else if (typeof loadAdmin === "function") loadAdmin();
}

function closeAdmin() {
  $("admin")?.classList.add("hidden");
}

if (adminBtn) {
  adminBtn.addEventListener("click", async () => {
    if (!db) {
      alert("Supabase connection is not ready. Please check config.js.");
      return;
    }
    const { data: { user } } = await db.auth.getUser();
    if (user) {
      if (await isCurrentUserAdmin()) {
        openAdmin();
      } else {
        alert("This account is not approved as a Frish & Frish admin.");
      }
      return;
    }
    showLogin(true);
  });
}

$("closeLogin")?.addEventListener("click", () => showLogin(false));
loginOverlay?.addEventListener("click", () => {
  cartOpen(false);
  showLogin(false);
});

if (signInBtn) {
  signInBtn.addEventListener("click", async () => {
    if (!db) {
      alert("Supabase connection is not ready. Please check config.js.");
      return;
    }
    const email = $("email").value.trim();
    const password = $("password").value;
    if (!email || !password) {
      alert("Please enter your admin email and password.");
      return;
    }

    signInBtn.disabled = true;
    signInBtn.textContent = "Signing in…";
    try {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) {
        alert("Login failed: " + error.message);
        return;
      }
      if (!(await isCurrentUserAdmin())) {
        await db.auth.signOut();
        alert("Login succeeded, but this user is not listed in admin_users. Add this user's auth ID as an approved admin first.");
        return;
      }
      showLogin(false);
      openAdmin();
    } catch (err) {
      alert("Login failed. Please check your connection and try again.");
    } finally {
      signInBtn.disabled = false;
      signInBtn.textContent = "Sign in";
    }
  });
}
$("back")?.addEventListener("click", closeAdmin);

$("logout")?.addEventListener("click", async () => {
  if (db) await db.auth.signOut();
  closeAdmin();
});

db?.auth.onAuthStateChange((_event, session) => {
  sessionUser = session?.user || null;
  updateCustomerLoginStatus();

  if (sessionUser) {
    setTimeout(async () => {
      if (await isCurrentUserAdmin()) openAdmin();
    }, 0);
  } else {
    closeAdmin();
    $("orderHistory")?.classList.add("hidden");
  }
});


/* Customer OTP login. Email OTP works when the Supabase Email provider and email template are configured.
   Phone OTP also requires a configured SMS provider (for example Twilio) in Supabase. */
function showCustomerAuth(show) {
  $("customerAuth")?.classList.toggle("hidden", !show);
  $("overlay")?.classList.toggle("hidden", !show);
  if (show) $("customerAuthMethod")?.focus();
}

async function loadCustomerOrders() {
  const section = $("orderHistory");
  const list = $("myOrdersList");
  if (!section || !list) return;
  const { data: { user }, error: authError } = await db.auth.getUser();
if (!db || authError || !user) {
  section.classList.add("hidden");
  list.innerHTML = "";
  return;
}

list.innerHTML = '<div class="order-empty">Loading your orders…</div>';
  const { data, error } = await db.from("orders")
    .select("id,order_number,items,total,status,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    list.innerHTML = `<div class="order-empty">Could not load orders: ${esc(error.message)}<br><small>Check the Customers read own orders policy.</small></div>`;
    return;
  }
  if (!data || !data.length) {
    list.innerHTML = '<div class="order-empty">No orders yet. Your orders will appear here after you place one.</div>';
    return;
  }
  list.innerHTML = data.map(o => {
    const date = o.created_at ? new Date(o.created_at).toLocaleString("en-IN", { dateStyle:"medium", timeStyle:"short" }) : "";
    const items = Array.isArray(o.items) ? o.items : [];
    const lines = items.map(i => `<li>${esc(i.name || "Product")} × ${Number(i.qty || 1)} — ${rs(i.line_total ?? (Number(i.price||0)*Number(i.qty||1)))}</li>`).join("");
    return `<article class="order-card">
      <div class="order-card-head"><div><small>ORDER NUMBER</small><strong>${esc(o.order_number || o.id)}</strong><span class="order-date">${esc(date)}</span></div><span class="order-status status-${esc(String(o.status||"new").toLowerCase().replace(/[^a-z0-9_-]/g,""))}">${esc(String(o.status||"new").replaceAll("_"," "))}</span></div>
      <ul class="order-items">${lines}</ul>
      <div class="order-card-foot"><strong>Total: ${rs(o.total)}</strong><button type="button" class="btn reorder-btn" data-reorder="${esc(o.id)}">🔁 Reorder</button></div>
    </article>`;
  }).join("");
  list.querySelectorAll("[data-reorder]").forEach(btn => btn.addEventListener("click", () => {
    const order = data.find(o => String(o.id) === btn.dataset.reorder);
    if (!order) return;
    let added = 0, unavailable = [];
    (Array.isArray(order.items) ? order.items : []).forEach(old => {
      const p = ps.find(x => String(x.id) === String(old.product_id));
      if (!p || !p.is_available || Number(p.stock_qty) <= 0) { unavailable.push(old.name || "A product"); return; }
      const qty = Math.min(Math.max(1, Number(old.qty)||1), Number(p.stock_qty));
      const current = basket.find(x => String(x.id) === String(p.id));
      if (current) current.qty = Math.min(Number(p.stock_qty), current.qty + qty);
      else basket.push({id:p.id, qty});
      added++;
    });
    drawCart(); drawProducts(); cartOpen(true);
    if (unavailable.length) alert("Some products are currently unavailable: " + unavailable.join(", "));
    else if (!added) alert("These products are currently unavailable.");
  }));
}

function updateCustomerLoginStatus() {
  const status = $("customerLoginStatus");
  const button = $("customerLoginBtn");
  if (!status || !button) return;
  const user = sessionUser;
  status.textContent = user ? (user.email || user.phone || "Logged in") : "";
  button.textContent = user ? "Account / Sign out" : "Login";
}
$("myOrdersBtn")?.addEventListener("click", async () => {
  if (!db) return alert("Supabase connection is not ready. Please check config.js.");
  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    showCustomerAuth(true);
    $("customerAuthMessage").textContent = "Please log in to view your orders.";
    return;
  }
  $("orderHistory")?.classList.remove("hidden");
  await loadCustomerOrders();
  $("orderHistory")?.scrollIntoView({ behavior:"smooth", block:"start" });
});
$("refreshOrders")?.addEventListener("click", loadCustomerOrders);

$("customerLoginBtn")?.addEventListener("click", async () => {
  if (!db) return alert("Supabase connection is not ready. Please check config.js.");
  const { data: { user } } = await db.auth.getUser();
  if (user) {
    if (confirm("Sign out of this account?")) {
      await db.auth.signOut();
      sessionUser = null;
      updateCustomerLoginStatus();
      $("orderHistory")?.classList.add("hidden");
      alert("Signed out.");
    }
    return;
  }
  showCustomerAuth(true);
});
$("closeCustomerAuth")?.addEventListener("click", () => showCustomerAuth(false));
$("customerAuthMethod")?.addEventListener("change", () => {
  const isEmail = $("customerAuthMethod").value === "email";
  $("customerEmailLabel").classList.toggle("hidden", !isEmail);
  $("customerPhoneLabel").classList.toggle("hidden", isEmail);
  $("customerOtpLabel").classList.add("hidden");
  $("verifyCustomerOtp").classList.add("hidden");
  $("customerAuthMessage").textContent = "";
});
$("sendCustomerOtp")?.addEventListener("click", async () => {
  if (!db) return alert("Supabase connection is not ready. Please check config.js.");
  const method = $("customerAuthMethod").value;
  const email = $("customerEmail").value.trim();
  const phone = $("customerPhone").value.trim();
  if (method === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    $("customerAuthMessage").textContent = "Enter a valid email address.";
    return;
  }
  if (method === "phone" && !/^\+[1-9]\d{7,14}$/.test(phone)) {
    $("customerAuthMessage").textContent = "Enter phone number with country code, e.g. +919876543210.";
    return;
  }
  const button = $("sendCustomerOtp");
  button.disabled = true;
  $("customerAuthMessage").textContent = "Sending OTP…";
  try {
    const result = method === "email"
      ? await db.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
      : await db.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
    if (result.error) throw result.error;
    $("customerOtpLabel").classList.remove("hidden");
    $("verifyCustomerOtp").classList.remove("hidden");
    $("customerAuthMessage").textContent = method === "email"
      ? "OTP sent to your email. Check Inbox and Spam."
      : "OTP request sent. Check your SMS.";
  } catch (err) {
    $("customerAuthMessage").textContent = "Could not send OTP: " + (err.message || "Please check Supabase provider settings.");
  } finally {
    button.disabled = false;
  }
});
$("verifyCustomerOtp")?.addEventListener("click", async () => {
  if (!db) return alert("Supabase connection is not ready. Please check config.js.");
  const method = $("customerAuthMethod").value;
  const token = $("customerOtp").value.trim();
  const email = $("customerEmail").value.trim();
  const phone = $("customerPhone").value.trim();
  if (!token) {
    $("customerAuthMessage").textContent = "Enter the OTP first.";
    return;
  }
  const button = $("verifyCustomerOtp");
  button.disabled = true;
  $("customerAuthMessage").textContent = "Verifying OTP…";
  try {
    const result = method === "email"
      ? await db.auth.verifyOtp({ email, token, type: "email" })
      : await db.auth.verifyOtp({ phone, token, type: "sms" });
    if (result.error) throw result.error;
    sessionUser = result.data.user || null;
    if (method === "phone" && phone && !$("phone").value.trim()) $("phone").value = phone.replace(/^\+91/, "");
    $("customerAuthMessage").textContent = "Login successful. You can now place your order.";
    showCustomerAuth(false);
    updateCustomerLoginStatus();
    await loadCustomerOrders();
    if (!$("name").value.trim()) $("name").focus();
  } catch (err) {
    $("customerAuthMessage").textContent = "OTP verification failed: " + (err.message || "Check the code and try again.");
  } finally {
    button.disabled = false;
  }
});
updateCustomerLoginStatus();

/* Basic admin dashboard sections backed by the existing Supabase schema. */
async function renderAdminTab(tab = "overview") {
  const title = $("title");
  const content = $("content");
  if (!title || !content || !db) return;
  const labels = {
    overview: "Overview",
    productsTab: "Products & stock",
    ordersTab: "Customer orders",
    offersTab: "Offers"
  };
  title.textContent = labels[tab] || "Overview";
  content.innerHTML = '<div class="panel">Loading dashboard…</div>';

  if (tab === "overview") {
    const [productsRes, ordersRes] = await Promise.all([
      db.from("products").select("id", { count: "exact", head: true }),
      db.from("orders").select("id", { count: "exact", head: true })
    ]);
    content.innerHTML = `
      <div class="metrics">
        <div class="metric">Products<b>${productsRes.count ?? "—"}</b></div>
        <div class="metric">Orders<b>${ordersRes.count ?? "—"}</b></div>
      </div>
      <div class="panel" style="margin-top:16px"><h2>Welcome to Frish &amp; Frish</h2><p>Manage products, stock, customer orders and offers from the menu.</p></div>`;
    if (productsRes.error || ordersRes.error) content.insertAdjacentHTML("beforeend", '<p class="muted">Some totals could not load. Verify the admin account and database policies.</p>');
    return;
  }

  if (tab === "productsTab") {
    const { data, error } = await db.from("products").select("*").order("created_at", { ascending: false });
    if (error) {
      content.innerHTML = `<div class="panel">Could not load products: ${esc(error.message)}</div>`;
      return;
    }
    const rows = data || [];
    content.innerHTML = `
      <div class="panel" style="margin-bottom:16px">
        <h2 id="productFormHeading">Add product</h2>
        <form id="productForm">
          <input type="hidden" id="productId">
          <label>Product name<input id="productName" required maxlength="120" placeholder="e.g. Mango"></label>
          <label>Category<input id="productCategory" required maxlength="80" placeholder="Fruits or Vegetables"></label>
          <label>Price (₹)<input id="productPrice" type="number" min="0" step="0.01" required></label>
          <label>Unit<input id="productUnit" maxlength="40" placeholder="kg, dozen, each"></label>
          <label>Stock quantity<input id="productStock" type="number" min="0" step="1" required value="0"></label>
          <label>Image URL<input id="productImage" type="url" placeholder="https://..."></label>
          <label>Offer text<input id="productOffer" maxlength="120" placeholder="Optional offer"></label>
          <label><input id="productAvailable" type="checkbox" checked> Available for sale</label>
          <button class="btn" type="submit" id="saveProduct">Add product</button>
          <button class="btn" type="button" id="cancelProductEdit" style="display:none">Cancel edit</button>
        </form>
      </div>
      <div class="tablewrap"><table class="data"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Available</th><th>Actions</th></tr></thead><tbody>${
        rows.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${rs(p.price)}</td><td>${esc(p.stock_qty)}</td><td>${p.is_available ? "Yes" : "No"}</td><td><button type="button" class="btn" data-edit-product="${esc(p.id)}">Edit</button> <button type="button" class="btn" data-stock-product="${esc(p.id)}">${p.is_available && Number(p.stock_qty)>0 ? "Mark sold out" : "Restock / enable"}</button></td></tr>`).join("")
      }</tbody></table></div>`;

    const form = $("productForm");
    const resetProductForm = () => {
      form.reset();
      $("productId").value = "";
      $("productStock").value = "0";
      $("productAvailable").checked = true;
      $("productFormHeading").textContent = "Add product";
      $("saveProduct").textContent = "Add product";
      $("cancelProductEdit").style.display = "none";
    };
    $("cancelProductEdit").addEventListener("click", resetProductForm);
    content.querySelectorAll("[data-edit-product]").forEach(button => button.addEventListener("click", () => {
      const p = rows.find(item => String(item.id) === button.dataset.editProduct);
      if (!p) return;
      $("productId").value = p.id;
      $("productName").value = p.name || "";
      $("productCategory").value = p.category || "";
      $("productPrice").value = p.price ?? 0;
      $("productUnit").value = p.unit || "each";
      $("productStock").value = p.stock_qty ?? 0;
      $("productImage").value = p.image_url || "";
      $("productOffer").value = p.offer_text || "";
      $("productAvailable").checked = !!p.is_available;
      $("productFormHeading").textContent = "Edit product";
      $("saveProduct").textContent = "Save changes";
      $("cancelProductEdit").style.display = "inline-block";
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    content.querySelectorAll("[data-stock-product]").forEach(button => button.addEventListener("click", async () => {
      const p = rows.find(item => String(item.id) === button.dataset.stockProduct);
      if (!p) return;
      const currentlyAvailable = !!p.is_available && Number(p.stock_qty) > 0;
      const patch = currentlyAvailable ? { is_available: false } : { is_available: true, stock_qty: Math.max(1, Number(p.stock_qty) || 1) };
      const { error: updateError } = await db.from("products").update(patch).eq("id", p.id);
      if (updateError) alert("Could not update stock: " + updateError.message);
      else renderAdminTab("productsTab");
    }));
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const name = $("productName").value.trim();
      const category = $("productCategory").value.trim();
      const price = Number($("productPrice").value);
      const stock_qty = Number($("productStock").value);
      if (!name || !category || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock_qty) || stock_qty < 0) {
        alert("Enter a product name, category, valid price and non-negative whole-number stock quantity.");
        return;
      }
      const payload = {
        name, category, price, stock_qty,
        unit: $("productUnit").value.trim() || "each",
        image_url: $("productImage").value.trim() || null,
        offer_text: $("productOffer").value.trim() || null,
        is_available: $("productAvailable").checked && stock_qty > 0
      };
      const id = $("productId").value;
      const saveButton = $("saveProduct");
      saveButton.disabled = true;
      try {
        const result = id
          ? await db.from("products").update(payload).eq("id", id)
          : await db.from("products").insert(payload);
        if (result.error) {
          alert("Could not save product: " + result.error.message);
          return;
        }
        alert(id ? "Product updated successfully." : "Product added successfully.");
        await renderAdminTab("productsTab");
      } finally {
        saveButton.disabled = false;
      }
    });
    return;
  }

  if (tab === "ordersTab") {
    const { data, error } = await db.from("orders").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) {
      content.innerHTML = `<div class="panel">Could not load orders: ${esc(error.message)}</div>`;
      return;
    }
    content.innerHTML = `<div class="tablewrap"><table class="data"><thead><tr><th>Order</th><th>Customer</th><th>Phone</th><th>Total</th><th>Status</th><th>Update</th></tr></thead><tbody>${
      (data || []).map(o => `<tr><td>${esc(o.order_number)}</td><td>${esc(o.customer_name)}</td><td>${esc(o.phone)}</td><td>${rs(o.total)}</td><td>${esc(o.status)}</td><td><select data-order-status="${esc(o.id)}">${["new","confirmed","packing","out_for_delivery","delivered","cancelled"].map(s => `<option value="${s}" ${o.status===s?"selected":""}>${s.replaceAll("_"," ")}</option>`).join("")}</select></td></tr>`).join("")
    }</tbody></table></div>`;
    content.querySelectorAll("[data-order-status]").forEach(sel => sel.addEventListener("change", async () => {
      const { error: updateError } = await db.from("orders").update({ status: sel.value }).eq("id", sel.dataset.orderStatus);
      if (updateError) alert("Could not update order: " + updateError.message);
      else renderAdminTab("ordersTab");
    }));
    return;
  }

  if (tab === "offersTab") {
    const { data, error } = await db.from("store_settings").select("*").eq("id", 1).maybeSingle();
    if (error) {
      content.innerHTML = `<div class="panel">Could not load offer settings: ${esc(error.message)}</div>`;
      return;
    }
    const s = data || {};
    content.innerHTML = `<div class="panel"><h2>Store offer</h2>
      <label>Offer title<input id="offerTitle" value="${esc(s.offer_title || "")}"></label>
      <label>Offer text<input id="offerText" value="${esc(s.offer_text || "")}"></label>
      <label>Coupon code<input id="couponCode" value="${esc(s.coupon_code || "")}"></label>
      <label>Discount percent<input id="discountPercent" type="number" min="0" max="100" value="${Number(s.discount_percent || 0)}"></label>
      <label><input id="offerActive" type="checkbox" ${s.is_offer_active ? "checked" : ""}> Offer active</label>
      <button id="saveOffer" class="btn">Save offer</button></div>`;
    $("saveOffer").addEventListener("click", async () => {
      const payload = {
        id: 1,
        offer_title: $("offerTitle").value.trim(),
        offer_text: $("offerText").value.trim(),
        coupon_code: $("couponCode").value.trim(),
        discount_percent: Math.max(0, Math.min(100, Number($("discountPercent").value || 0))),
        is_offer_active: $("offerActive").checked
      };
      const { error: saveError } = await db.from("store_settings").upsert(payload);
      if (saveError) alert("Could not save offer: " + saveError.message);
      else alert("Offer settings saved.");
    });
  }
}

document.querySelectorAll("[data-tab]").forEach(button => {
  button.addEventListener("click", () => renderAdminTab(button.dataset.tab));
});
init();

