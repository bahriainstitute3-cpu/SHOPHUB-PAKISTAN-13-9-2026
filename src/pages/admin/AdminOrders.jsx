import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { listAllOrders, updateOrderStatus, updatePaymentStatus, ORDER_STATUSES } from "../../lib/orders";
import { migrateOldOrdersSellerInfo } from "../../lib/migrateSellerInfo";

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [viewOrder, setViewOrder] = useState(null);
  const [customerViewOrder, setCustomerViewOrder] = useState(null);
  const [sellerViewOrder, setSellerViewOrder] = useState(null);
  const [adminViewOrder, setAdminViewOrder] = useState(null);
  const [migrating, setMigrating] = useState(false);

  // One-time helper for fixing OLD orders that were placed before the
  // seller-info fix. Safe to click more than once — it only touches items
  // that are still missing seller info.
  async function handleRunMigration() {
    if (migrating) return;
    setMigrating(true);
    try {
      const result = await migrateOldOrdersSellerInfo();
      alert(`Migration done.\nOrders checked: ${result.ordersChecked}\nOrders updated: ${result.ordersUpdated}\nItems fixed: ${result.itemsFixed}`);
      refresh();
    } catch (err) {
      console.error(err);
      alert("Migration failed — check the browser console for details.");
    } finally {
      setMigrating(false);
    }
  }

  // --- EXISTING CODE (NOTIFICATIONS & POLLING) ---
  const seenOrderIdsKey = "shophub_admin_seen_order_ids";

  function showNewOrderNotification(order) {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const show = () => {
      try {
        const notification = new Notification("ShopHub — New Order", {
          body: `Order #${order.orderNumber || order.id} received${order.total != null ? ` · Rs ${Number(order.total).toLocaleString()}` : ""}`,
          tag: `shophub-order-${order.id}`,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
          setViewOrder(order);
        };
      } catch {}
    };
    if (Notification.permission === "granted") show();
    else if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") show();
      }).catch(() => {});
    }
  }

  function refresh({ notify = false } = {}) {
    listAllOrders().then((nextOrders) => {
      if (!Array.isArray(nextOrders)) { setOrders([]); return; }
      if (notify) {
        let seenIds = [];
        try {
          seenIds = JSON.parse(localStorage.getItem(seenOrderIdsKey) || "[]");
          if (!Array.isArray(seenIds)) seenIds = [];
        } catch { seenIds = []; }
        const seenSet = new Set(seenIds);
        const newOrders = nextOrders.filter((order) => order?.id && !seenSet.has(order.id));
        const nextSeenIds = Array.from(new Set([...seenIds, ...nextOrders.map((order) => order?.id).filter(Boolean)])).slice(-500);
        try { localStorage.setItem(seenOrderIdsKey, JSON.stringify(nextSeenIds)); } catch {}
        newOrders.forEach(showNewOrderNotification);
      }
      setOrders(nextOrders);
    }).finally(() => setLoading(false));
  }

  useEffect(() => {
    setLoading(true);
    listAllOrders().then((initialOrders) => {
      const safeOrders = Array.isArray(initialOrders) ? initialOrders : [];
      setOrders(safeOrders);
      try {
        const existingIds = safeOrders.map((order) => order?.id).filter(Boolean);
        localStorage.setItem(seenOrderIdsKey, JSON.stringify(existingIds.slice(-500)));
      } catch {}
    }).finally(() => setLoading(false));
    const interval = setInterval(() => refresh({ notify: true }), 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleStatusChange(id, status) {
    await updateOrderStatus(id, status);
    refresh();
  }

  async function handlePaymentChange(id, status) {
    await updatePaymentStatus(id, status);
    refresh();
  }

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);
  // --- END EXISTING CODE ---

  // --- HELPER FUNCTIONS ---
  function getOrderDate(o) {
    const raw = o.createdAt || o.date || o.orderDate || o.timestamp || o.created_at;
    if (!raw) return null;
    try {
      const d = raw.toDate ? raw.toDate() : new Date(raw);
      return isNaN(d.getTime()) ? String(raw) : d.toLocaleString();
    } catch { return String(raw); }
  }

  function getOrderDay(o) {
    const raw = o.createdAt || o.date || o.orderDate || o.timestamp || o.created_at;
    if (!raw) return null;
    try {
      const d = raw.toDate ? raw.toDate() : new Date(raw);
      return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { weekday: "long" });
    } catch { return ""; }
  }

  function getOrderTime(o) {
    const raw = o.createdAt || o.date || o.orderDate || o.timestamp || o.created_at;
    if (!raw) return null;
    try {
      const d = raw.toDate ? raw.toDate() : new Date(raw);
      return isNaN(d.getTime()) ? "" : d.toLocaleTimeString();
    } catch { return ""; }
  }

  function formatPrice(val) {
    const num = Number(val);
    return isNaN(num) ? "—" : `Rs ${num.toLocaleString()}`;
  }

  // 🔥 SELLER RESOLVER — normalizes seller info for one order item into a
  // single object: { name, phone, email, paymentMethod, accountTitle, accountNumber, bankName }.
  //
  // Priority:
  //  1. A nested seller/store/vendor OBJECT on the item (older/alternate data shapes).
  //  2. Flat fields on the item — this is what src/lib/orders.js saves today
  //     (ownerName, ownerEmail, sellerPhone, sellerPaymentMethod, sellerAccountTitle,
  //     sellerAccountNumber, sellerBankName), so this is the common case for new orders.
  //  3. null if nothing usable is found (receipt shows "Unknown Seller").
  function getItemSeller(item) {
    if (!item) return null;

    const nested = item.seller || item.store || item.vendor || item.productOwner || item.owner ||
      item.sellerInfo || item.storeInfo || item.vendorInfo || item.productOwnerInfo || item.ownerInfo;

    if (nested && typeof nested === "object") {
      const name = nested.name || nested.storeName || nested.sellerName || nested.ownerName || nested.shopName || null;
      const phone = nested.phone || nested.sellerPhone || nested.ownerPhone || nested.contact || nested.mobile || nested.phoneNumber || null;
      const email = nested.email || nested.sellerEmail || nested.ownerEmail || nested.emailAddress || nested.emailId || null;
      const pay = nested.paymentInfo || nested.bankDetails || nested.payment || {};
      const paymentMethod = nested.sellerPaymentMethod || nested.paymentMethod || null;
      const accountTitle = pay.accountTitle || pay.title || nested.sellerAccountTitle || nested.accountTitle || null;
      const accountNumber = pay.accountNumber || pay.account || nested.sellerAccountNumber || nested.accountNumber || null;
      const bankName = pay.bankName || pay.bank || nested.sellerBankName || nested.bankName || null;
      if (!name && !phone && !email) return null;
      return { name, phone, email, paymentMethod, accountTitle, accountNumber, bankName };
    }

    // Flat fields — matches what lib/orders.js saves on each order item today.
    const name = item.ownerName || item.sellerName || item.vendorName || item.storeName || item.shopName || null;
    const email = item.ownerEmail || item.sellerEmail || item.vendorEmail || null;
    const phone = item.sellerPhone || item.ownerPhone || item.vendorPhone || null;
    const paymentMethod = item.sellerPaymentMethod || null;
    const accountTitle = item.sellerAccountTitle || null;
    const accountNumber = item.sellerAccountNumber || null;
    const bankName = item.sellerBankName || null;

    if (!name && !email && !phone) return null;
    return { name, phone, email, paymentMethod, accountTitle, accountNumber, bankName };
  }

  // Per-product-item summary used inline in the Admin receipt (name/phone/email only).
  function getItemSellerSummary(item) {
    const seller = getItemSeller(item);
    return {
      name: seller?.name || null,
      phone: seller?.phone || null,
      email: seller?.email || null,
    };
  }

  // Groups order items by seller (keyed by email, falling back to name) so the
  // Seller/Admin receipts can show one card per seller with all their products
  // and their bank/payment details together.
  function getUniqueSellers(order) {
    if (!order?.items || !Array.isArray(order.items)) return [];

    const sellersMap = new Map();

    order.items.forEach((item) => {
      const seller = getItemSeller(item);
      const key = seller ? (seller.email || seller.name || JSON.stringify(seller)) : "unknown";
      if (!sellersMap.has(key)) {
        sellersMap.set(key, { seller: seller || { name: "Unknown Seller", phone: null, email: null }, items: [] });
      }
      sellersMap.get(key).items.push(item);
    });

    return Array.from(sellersMap.values());
  }

  // Extract payment/bank details for a normalized seller object (from getItemSeller).
  function getBankDetails(order, seller) {
    if (!seller) return null;
    if (!seller.accountNumber && !seller.bankName && !seller.accountTitle) return null;
    return {
      accountNumber: seller.accountNumber || "—",
      accountTitle: seller.accountTitle || "—",
      bankName: seller.bankName || "—",
      iban: "—",
      branchCode: "—",
      otherDetails: "",
    };
  }

  // Builds a plain-text summary of a receipt for sharing via WhatsApp.
  function buildWhatsAppText(type, order) {
    const lines = [];
    lines.push(`*ShopHub — ${type} Receipt*`);
    lines.push(`Order #: ${order.orderNumber || order.id}`);
    if (getOrderDate(order)) lines.push(`Date: ${getOrderDate(order)}`);
    lines.push("");
    lines.push("*Items:*");
    (order.items || []).forEach((item) => {
      const qty = item.quantity || item.qty || 1;
      lines.push(`- ${item.productName || item.name || "—"} x${qty} — ${formatPrice(item.price)}`);
      if (type !== "Customer") {
        const s = getItemSellerSummary(item);
        if (s.name) lines.push(`  Seller: ${s.name}${s.phone ? " · " + s.phone : ""}`);
      }
    });
    lines.push("");
    lines.push(`*Total: ${formatPrice(order.total)}*`);
    if (type !== "Seller") {
      lines.push("");
      lines.push("*Customer:*");
      lines.push(order.address?.fullName || order.customer?.name || "—");
      lines.push(order.address?.phone || order.customer?.phone || "—");
    }
    return lines.join("\n");
  }

  function shareOnWhatsApp(type, order) {
    const text = buildWhatsAppText(type, order);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // --- DOWNLOAD AND PRINT FUNCTIONS ---
  function downloadReceipt(type, order) {
    const printContent = document.getElementById(`receipt-${type}-${order.id}`);
    if (!printContent) return;
    const originalTitle = document.title;
    document.title = `ShopHub-${type}-Order-${order.orderNumber || order.id}`;
    const originalBody = document.body.innerHTML;
    document.body.innerHTML = printContent.outerHTML;
    window.print();
    document.body.innerHTML = originalBody;
    document.title = originalTitle;
  }

  function printReceipt(type, order) {
    downloadReceipt(type, order);
  }
  // --- END HELPERS ---

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 24 }}>Orders</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleRunMigration}
            disabled={migrating}
            title="Backfills seller info into old orders placed before the fix"
            style={{ padding: "8px 12px", fontSize: 12.5, fontWeight: 700, borderRadius: 8, border: "1.5px solid var(--line)", background: "#fff", cursor: migrating ? "not-allowed" : "pointer" }}
          >
            {migrating ? "🔄 Fixing…" : "🔄 Fix Old Orders"}
          </button>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid var(--line)" }}>
            <option value="all">All statuses</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </div>
      </div>

      {loading && <p>Loading…</p>}
      {!loading && filtered.length === 0 && <div className="empty-state">No orders found.</div>}

      <div className="card" style={{ overflow: "hidden" }}>
        {filtered.map((o) => (
          <div key={o.id} style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700 }}>#{o.orderNumber}</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                  {o.address?.fullName || o.customer?.name} · {o.address?.phone || o.customer?.phone} · {o.items?.length || 0} item(s)
                  {getOrderDate(o) && <> · {getOrderDate(o)}</>}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>Rs {o.total?.toLocaleString()}</div>
                <button
                  onClick={() => setViewOrder(o)}
                  style={{ padding: "6px 12px", fontSize: 12.5, fontWeight: 700, borderRadius: 8, border: "1.5px solid var(--line)", background: "#fff", cursor: "pointer" }}
                >
                  View
                </button>
                <button
                  onClick={() => setCustomerViewOrder(o)}
                  style={{ padding: "6px 12px", fontSize: 12.5, fontWeight: 700, borderRadius: 8, border: "1.5px solid var(--line)", background: "#fff", cursor: "pointer" }}
                >
                  View as Customer
                </button>
                <button
                  onClick={() => setSellerViewOrder(o)}
                  style={{ padding: "6px 12px", fontSize: 12.5, fontWeight: 700, borderRadius: 8, border: "1.5px solid var(--line)", background: "#fff", cursor: "pointer" }}
                >
                  View as Seller
                </button>
                <button
                  onClick={() => setAdminViewOrder(o)}
                  style={{ padding: "6px 12px", fontSize: 12.5, fontWeight: 700, borderRadius: 8, border: "1.5px solid var(--line)", background: "#fff", cursor: "pointer" }}
                >
                  View as Admin
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>ORDER STATUS</label>
                <select value={o.status} onChange={(e) => handleStatusChange(o.id, e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid var(--line)" }}>
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>PAYMENT</label>
                <select value={o.paymentStatus} onChange={(e) => handlePaymentChange(o.id, e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid var(--line)" }}>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* --- EXISTING VIEW MODAL --- */}
      {viewOrder && (
        <div
          onClick={() => setViewOrder(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ maxWidth: 480, width: "100%", maxHeight: "85vh", overflowY: "auto", padding: 20, background: "#fff", borderRadius: 12, position: "relative" }}
          >
            <button onClick={() => setViewOrder(null)} style={{ position: "absolute", top: 10, right: 10, border: "none", background: "transparent", fontSize: 18, cursor: "pointer" }}>✕</button>
            <h3 style={{ fontSize: 18, marginBottom: 14 }}>Order #{viewOrder.orderNumber}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(viewOrder).map(([key, value]) => (
                <div key={key} style={{ fontSize: 13.5, borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
                  <div style={{ fontWeight: 700, color: "var(--ink-soft)", fontSize: 11, textTransform: "uppercase", marginBottom: 2 }}>
                    {key.replace(/([A-Z])/g, " $1")}
                  </div>
                  <div>{typeof value === "object" ? JSON.stringify(value) : String(value)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- CUSTOMER RECEIPT MODAL --- */}
      {customerViewOrder && (
        <div
          onClick={() => setCustomerViewOrder(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, overflowY: "auto" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 800, width: "100%", background: "#fff", borderRadius: 12, position: "relative", padding: 20 }}
          >
            <div style={{ textAlign: "right", marginBottom: 20 }}>
              <button onClick={() => setCustomerViewOrder(null)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--line)", background: "#fff", cursor: "pointer", marginRight: 10 }}>✕ Close</button>
              <button onClick={() => printReceipt("Customer", customerViewOrder)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--line)", background: "#fff", cursor: "pointer", marginRight: 10 }}>🖨️ Print</button>
              <button onClick={() => downloadReceipt("Customer", customerViewOrder)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--line)", background: "#fff", cursor: "pointer", marginRight: 10 }}>⬇️ Download</button>
              <button onClick={() => shareOnWhatsApp("Customer", customerViewOrder)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #25D366", background: "#25D366", color: "#fff", cursor: "pointer" }}>📱 WhatsApp</button>
            </div>

            {/* CUSTOMER RECEIPT CONTENT */}
            <div id={`receipt-Customer-${customerViewOrder.id}`} style={{ border: "1px solid #eee", padding: "30px", maxWidth: 700, margin: "0 auto", background: "#fff", color: "#000" }}>
              <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 48, fontWeight: 900, marginBottom: 10 }}>SHOPHUB</div>
                <div style={{ fontSize: 16, letterSpacing: 2 }}>ORDER RECEIPT</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>Order #{customerViewOrder.orderNumber || customerViewOrder.id}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>ORDER DETAILS</div>
                  <div style={{ fontWeight: 700 }}>Order #: {customerViewOrder.orderNumber || customerViewOrder.id}</div>
                  <div style={{ fontSize: 14 }}>Date: {getOrderDate(customerViewOrder) || "—"}</div>
                  <div style={{ fontSize: 14 }}>Day: {getOrderDay(customerViewOrder) || "—"}</div>
                  <div style={{ fontSize: 14 }}>Time: {getOrderTime(customerViewOrder) || "—"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>PAYMENT</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{customerViewOrder.paymentMethod || "COD"}</div>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>CUSTOMER DETAILS</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{customerViewOrder.address?.fullName || customerViewOrder.customer?.name || "—"}</div>
                <div style={{ fontSize: 14 }}>Phone: {customerViewOrder.address?.phone || customerViewOrder.customer?.phone || "—"}</div>
                <div style={{ fontSize: 14 }}>Email: {customerViewOrder.address?.email || customerViewOrder.customer?.email || "—"}</div>
                <div style={{ fontSize: 14, marginTop: 4 }}>
                  {[
                    customerViewOrder.address?.address,
                    customerViewOrder.address?.city,
                    customerViewOrder.address?.area,
                    customerViewOrder.address?.province,
                    customerViewOrder.address?.postalCode
                  ].filter(Boolean).join(", ") || "—"}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>ITEMS</div>
                {Array.isArray(customerViewOrder.items) && customerViewOrder.items.length > 0 ? (
                  customerViewOrder.items.map((item, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #eee" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{item.productName || item.name || "—"}</div>
                        <div style={{ fontSize: 12, color: "#666" }}>Qty: {item.quantity || 1} × Price: {formatPrice(item.price || item.unitPrice)}</div>
                      </div>
                      <div style={{ fontWeight: 700 }}>{formatPrice(item.subtotal || (item.price * item.quantity))}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: "#666" }}>No items found.</div>
                )}
              </div>

              <div style={{ borderTop: "2px solid #000", paddingTop: 10, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span>Subtotal</span>
                  <span>{formatPrice(customerViewOrder.subtotal || customerViewOrder.total)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span>Delivery</span>
                  <span>{formatPrice(customerViewOrder.shipping || 0)}</span>
                </div>
                {customerViewOrder.discount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span>Discount</span>
                    <span>- {formatPrice(customerViewOrder.discount)}</span>
                  </div>
                )}
                {customerViewOrder.tax > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span>Tax</span>
                    <span>{formatPrice(customerViewOrder.tax)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 900, borderTop: "1px solid #000", paddingTop: 10, marginTop: 5 }}>
                  <span>TOTAL</span>
                  <span>{formatPrice(customerViewOrder.total)}</span>
                </div>
              </div>

              <div style={{ textAlign: "center", borderTop: "1px solid #eee", paddingTop: 20 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>PAYMENT METHOD</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {(customerViewOrder.paymentMethod || "COD").toUpperCase() === "COD" ? "CASH ON DELIVERY" : (customerViewOrder.paymentMethod || "ONLINE PAYMENT").toUpperCase()}
                </div>
                
                {customerViewOrder.paymentMethod && customerViewOrder.paymentMethod.toUpperCase() !== "COD" && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ textAlign: "left", maxWidth: 400, margin: "0 auto" }}>
                      {getUniqueSellers(customerViewOrder).map(({ seller, items: sellerItems }, idx) => {
                        const bank = getBankDetails(customerViewOrder, seller);
                        return (
                          <div key={idx} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #eee" }}>
                            <div style={{ fontWeight: 700, marginBottom: 6, textAlign: "center" }}>
                              PAY TO: {seller?.name || "Seller"}
                              {sellerItems.length > 0 && <span style={{ fontWeight: 400, color: "#666" }}> ({sellerItems.map((i) => i.productName || i.name).join(", ")})</span>}
                            </div>
                            {bank ? (
                              <>
                                <div style={{ fontSize: 14, marginBottom: 4 }}><strong>Account Number:</strong> {bank.accountNumber}</div>
                                <div style={{ fontSize: 14, marginBottom: 4 }}><strong>Account Title:</strong> {bank.accountTitle}</div>
                                <div style={{ fontSize: 14, marginBottom: 4 }}><strong>Bank Name:</strong> {bank.bankName}</div>
                              </>
                            ) : (
                              <div style={{ fontSize: 13, color: "#666", textAlign: "center" }}>Contact seller for payment details.</div>
                            )}
                          </div>
                        );
                      })}

                      <div style={{ fontSize: 14, marginTop: 10, borderTop: "1px solid #eee", paddingTop: 10, textAlign: "center" }}>
                        <strong>Amount to Pay:</strong> {formatPrice(customerViewOrder.total)}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ textAlign: "center", marginTop: 30, borderTop: "1px solid #eee", paddingTop: 20 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>VISIT SHOPHUB</div>
                <QRCodeCanvas value="https://shophub1-pk.netlify.app/" size={120} />
                <div style={{ fontSize: 12, marginTop: 5 }}>SCAN TO VISIT SHOPHUB</div>
                <div style={{ fontSize: 12, color: "#666" }}>https://shophub1-pk.netlify.app/</div>
              </div>

              <div style={{ textAlign: "center", marginTop: 20, fontSize: 14 }}>
                Thank you for shopping with ShopHub.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- SELLER RECEIPT MODAL --- */}
      {sellerViewOrder && (
        <div
          onClick={() => setSellerViewOrder(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, overflowY: "auto" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 800, width: "100%", background: "#fff", borderRadius: 12, position: "relative", padding: 20 }}
          >
            <div style={{ textAlign: "right", marginBottom: 20 }}>
              <button onClick={() => setSellerViewOrder(null)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--line)", background: "#fff", cursor: "pointer", marginRight: 10 }}>✕ Close</button>
              <button onClick={() => printReceipt("Seller", sellerViewOrder)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--line)", background: "#fff", cursor: "pointer", marginRight: 10 }}>🖨️ Print</button>
              <button onClick={() => downloadReceipt("Seller", sellerViewOrder)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--line)", background: "#fff", cursor: "pointer", marginRight: 10 }}>⬇️ Download</button>
              <button onClick={() => shareOnWhatsApp("Seller", sellerViewOrder)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #25D366", background: "#25D366", color: "#fff", cursor: "pointer" }}>📱 WhatsApp</button>
            </div>

            {/* SELLER RECEIPT CONTENT */}
            <div id={`receipt-Seller-${sellerViewOrder.id}`} style={{ border: "1px solid #eee", padding: "30px", maxWidth: 700, margin: "0 auto", background: "#fff", color: "#000" }}>
              <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 48, fontWeight: 900, marginBottom: 10 }}>SHOPHUB</div>
                <div style={{ fontSize: 16, letterSpacing: 2 }}>SELLER RECEIPT</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>Order #{sellerViewOrder.orderNumber || sellerViewOrder.id}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>ORDER DETAILS</div>
                  <div style={{ fontWeight: 700 }}>Order #: {sellerViewOrder.orderNumber || sellerViewOrder.id}</div>
                  <div style={{ fontSize: 14 }}>Date: {getOrderDate(sellerViewOrder) || "—"}</div>
                  <div style={{ fontSize: 14 }}>Day: {getOrderDay(sellerViewOrder) || "—"}</div>
                  <div style={{ fontSize: 14 }}>Time: {getOrderTime(sellerViewOrder) || "—"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>PAYMENT</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{sellerViewOrder.paymentMethod || "COD"}</div>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>CUSTOMER SHIPPING INFO</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{sellerViewOrder.address?.fullName || sellerViewOrder.customer?.name || "—"}</div>
                <div style={{ fontSize: 14 }}>Phone: {sellerViewOrder.address?.phone || sellerViewOrder.customer?.phone || "—"}</div>
                <div style={{ fontSize: 14, marginTop: 4 }}>
                  {[
                    sellerViewOrder.address?.address,
                    sellerViewOrder.address?.city,
                    sellerViewOrder.address?.area,
                    sellerViewOrder.address?.province,
                    sellerViewOrder.address?.postalCode
                  ].filter(Boolean).join(", ") || "—"}
                </div>
              </div>

              {getUniqueSellers(sellerViewOrder).map(({ seller, items }, idx) => (
                <div key={idx} style={{ marginBottom: 20, border: "1px solid #eee", borderRadius: 8, padding: 15 }}>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>SELLER / PRODUCT OWNER DETAILS</div>

                  <div style={{ fontSize: 16, fontWeight: 700 }}>{seller?.name || "Unknown Seller"}</div>
                  <div style={{ fontSize: 14 }}>Phone: {seller?.phone || "—"}</div>
                  <div style={{ fontSize: 14 }}>Email: {seller?.email || "—"}</div>

                  {/* Real bank/payment details from the seller (as saved on the product) */}
                  {(seller?.accountNumber || seller?.bankName || seller?.accountTitle || seller?.paymentMethod) && (
                    <div style={{ fontSize: 14, marginTop: 8, borderTop: "1px solid #eee", paddingTop: 8 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>BANK / PAYMENT DETAILS</div>
                      {seller?.paymentMethod && <div><strong>Method:</strong> {seller.paymentMethod}</div>}
                      <div><strong>Account:</strong> {seller?.accountNumber || "—"}</div>
                      <div><strong>Title:</strong> {seller?.accountTitle || "—"}</div>
                      <div><strong>Bank:</strong> {seller?.bankName || "—"}</div>
                    </div>
                  )}

                  <div style={{ marginTop: 10, borderTop: "1px solid #eee", paddingTop: 10 }}>
                    <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>PRODUCTS</div>
                    {items.map((item, itemIdx) => (
                      <div key={itemIdx} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #eee" }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{item.productName || item.name || "—"}</div>
                          <div style={{ fontSize: 12, color: "#666" }}>Qty: {item.quantity || 1} × Price: {formatPrice(item.price || item.unitPrice)}</div>
                        </div>
                        <div style={{ fontWeight: 700 }}>{formatPrice(item.subtotal || (item.price * item.quantity))}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div style={{ borderTop: "2px solid #000", paddingTop: 10, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 900 }}>
                  <span>TOTAL</span>
                  <span>{formatPrice(sellerViewOrder.total)}</span>
                </div>
              </div>

              <div style={{ textAlign: "center", marginTop: 30, borderTop: "1px solid #eee", paddingTop: 20 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>VISIT SHOPHUB</div>
                <QRCodeCanvas value="https://shophub1-pk.netlify.app/" size={120} />
                <div style={{ fontSize: 12, marginTop: 5 }}>SCAN TO VISIT SHOPHUB</div>
                <div style={{ fontSize: 12, color: "#666" }}>https://shophub1-pk.netlify.app/</div>
              </div>

              <div style={{ textAlign: "center", marginTop: 20, fontSize: 14 }}>
                Thank you for partnering with ShopHub.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ADMIN RECEIPT MODAL --- */}
      {adminViewOrder && (
        <div
          onClick={() => setAdminViewOrder(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, overflowY: "auto" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 800, width: "100%", background: "#fff", borderRadius: 12, position: "relative", padding: 20 }}
          >
            <div style={{ textAlign: "right", marginBottom: 20 }}>
              <button onClick={() => setAdminViewOrder(null)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--line)", background: "#fff", cursor: "pointer", marginRight: 10 }}>✕ Close</button>
              <button onClick={() => printReceipt("Admin", adminViewOrder)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--line)", background: "#fff", cursor: "pointer", marginRight: 10 }}>🖨️ Print</button>
              <button onClick={() => downloadReceipt("Admin", adminViewOrder)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--line)", background: "#fff", cursor: "pointer", marginRight: 10 }}>⬇️ Download</button>
              <button onClick={() => shareOnWhatsApp("Admin", adminViewOrder)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #25D366", background: "#25D366", color: "#fff", cursor: "pointer" }}>📱 WhatsApp</button>
            </div>

            {/* ADMIN RECEIPT CONTENT */}
            <div id={`receipt-Admin-${adminViewOrder.id}`} style={{ border: "1px solid #eee", padding: "30px", maxWidth: 700, margin: "0 auto", background: "#fff", color: "#000" }}>
              <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 48, fontWeight: 900, marginBottom: 10 }}>SHOPHUB</div>
                <div style={{ fontSize: 16, letterSpacing: 2 }}>ADMIN RECEIPT</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>Order #{adminViewOrder.orderNumber || adminViewOrder.id}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>ORDER DETAILS</div>
                  <div style={{ fontWeight: 700 }}>Order #: {adminViewOrder.orderNumber || adminViewOrder.id}</div>
                  <div style={{ fontSize: 14 }}>Date: {getOrderDate(adminViewOrder) || "—"}</div>
                  <div style={{ fontSize: 14 }}>Day: {getOrderDay(adminViewOrder) || "—"}</div>
                  <div style={{ fontSize: 14 }}>Time: {getOrderTime(adminViewOrder) || "—"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>PAYMENT</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{adminViewOrder.paymentMethod || "COD"}</div>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>CUSTOMER DETAILS</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{adminViewOrder.address?.fullName || adminViewOrder.customer?.name || "—"}</div>
                <div style={{ fontSize: 14 }}>Phone: {adminViewOrder.address?.phone || adminViewOrder.customer?.phone || "—"}</div>
                <div style={{ fontSize: 14 }}>Email: {adminViewOrder.address?.email || adminViewOrder.customer?.email || "—"}</div>
                <div style={{ fontSize: 14, marginTop: 4 }}>
                  {[
                    adminViewOrder.address?.address,
                    adminViewOrder.address?.city,
                    adminViewOrder.address?.area,
                    adminViewOrder.address?.province,
                    adminViewOrder.address?.postalCode
                  ].filter(Boolean).join(", ") || "—"}
                </div>
              </div>

              {/* 🆕 ALL PRODUCTS — ab har product ke sath uske owner/seller ki details bhi inline show hongi */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>ALL PRODUCTS</div>
                {Array.isArray(adminViewOrder.items) && adminViewOrder.items.length > 0 ? (
                  adminViewOrder.items.map((item, idx) => {
                    const itemSeller = getItemSellerSummary(item);
                    return (
                      <div key={idx} style={{ padding: "10px 0", borderBottom: "1px solid #eee" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <div>
                            <div style={{ fontWeight: 700 }}>{item.productName || item.name || "—"}</div>
                            <div style={{ fontSize: 12, color: "#666" }}>Qty: {item.quantity || 1} × Price: {formatPrice(item.price || item.unitPrice)}</div>
                          </div>
                          <div style={{ fontWeight: 700 }}>{formatPrice(item.subtotal || (item.price * item.quantity))}</div>
                        </div>
                        {/* Owner/Seller details inline, isi product ke neeche */}
                        <div style={{ fontSize: 12, color: "#444", marginTop: 6, background: "#f7f7f7", borderRadius: 6, padding: "6px 8px" }}>
                          <strong>Owner:</strong> {itemSeller.name || "—"}
                          {itemSeller.phone && <> · {itemSeller.phone}</>}
                          {itemSeller.email && <> · {itemSeller.email}</>}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ color: "#666" }}>No items found.</div>
                )}
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>ALL SELLERS (SUMMARY + BANK DETAILS)</div>
                {getUniqueSellers(adminViewOrder).map(({ seller, items }, idx) => (
                  <div key={idx} style={{ marginBottom: 15, padding: "10px", border: "1px solid #eee", borderRadius: "8px" }}>
                    <div style={{ fontWeight: 700, marginBottom: 5 }}>{seller?.name || "Unknown Seller"}</div>
                    <div style={{ fontSize: 14 }}>Phone: {seller?.phone || "—"}</div>
                    <div style={{ fontSize: 14 }}>Email: {seller?.email || "—"}</div>

                    {/* Real bank details */}
                    {(seller?.accountNumber || seller?.bankName || seller?.accountTitle) && (
                      <div style={{ fontSize: 14, marginTop: 5, borderTop: "1px solid #eee", paddingTop: 5 }}>
                        {seller?.paymentMethod && <div><strong>Method:</strong> {seller.paymentMethod}</div>}
                        <div><strong>Account:</strong> {seller?.accountNumber || "—"}</div>
                        <div><strong>Title:</strong> {seller?.accountTitle || "—"}</div>
                        <div><strong>Bank:</strong> {seller?.bankName || "—"}</div>
                      </div>
                    )}

                    <div style={{ marginTop: 5, fontSize: 14 }}>
                      <strong>Products:</strong> {items.length} item(s)
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: "2px solid #000", paddingTop: 10, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span>Subtotal</span>
                  <span>{formatPrice(adminViewOrder.subtotal || adminViewOrder.total)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span>Delivery</span>
                  <span>{formatPrice(adminViewOrder.shipping || 0)}</span>
                </div>
                {adminViewOrder.discount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span>Discount</span>
                    <span>- {formatPrice(adminViewOrder.discount)}</span>
                  </div>
                )}
                {adminViewOrder.tax > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span>Tax</span>
                    <span>{formatPrice(adminViewOrder.tax)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 900, borderTop: "1px solid #000", paddingTop: 10, marginTop: 5 }}>
                  <span>TOTAL</span>
                  <span>{formatPrice(adminViewOrder.total)}</span>
                </div>
              </div>

              <div style={{ textAlign: "center", marginTop: 30, borderTop: "1px solid #eee", paddingTop: 20 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>VISIT SHOPHUB</div>
                <QRCodeCanvas value="https://shophub1-pk.netlify.app/" size={120} />
                <div style={{ fontSize: 12, marginTop: 5 }}>SCAN TO VISIT SHOPHUB</div>
                <div style={{ fontSize: 12, color: "#666" }}>https://shophub1-pk.netlify.app/</div>
              </div>

              <div style={{ textAlign: "center", marginTop: 20, fontSize: 14 }}>
                ShopHub Admin Order Record
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}