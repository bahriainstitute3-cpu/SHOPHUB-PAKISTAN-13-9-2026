import { sendAdminOrderEmail } from "../lib/email";
// Firestore mein order save hone ke baad:
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { placeOrder } from "../lib/orders";
import { getProduct } from "../lib/products";
import { addAddress, listAddresses, removeAddress, setDefaultAddress, updateAddress } from "../lib/addresses";
import { DEFAULT_ZONE_CITY, listDeliveryZones, resolveDeliveryCharge } from "../lib/deliveryZones";


const PAYMENT_METHOD_LABELS = {
  bank: "Bank Transfer",
  jazzcash: "JazzCash",
  easypaisa: "EasyPaisa",
  cod: "Cash on Delivery",
};

export default function Checkout() {
  const { items, subtotal, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [address, setAddress] = useState({ fullName: "", phone: "", city: "", area: "", address: "", landmark: "", postalCode: "" });
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  // NEW — city-based delivery charges. "deliveryZones" holds every rate the
  // admin configured (plus the DEFAULT_ZONE_CITY fallback doc); "cityMode"
  // controls whether the City field shows the dropdown of configured cities
  // or a free-text box for a city that isn't in that list yet.
  const [deliveryZones, setDeliveryZones] = useState([]);
  const [cityMode, setCityMode] = useState("select"); // "select" | "other"
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [sellerPaymentInfo, setSellerPaymentInfo] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [addressBusy, setAddressBusy] = useState(false);
  // Tracks whether the customer has started typing into the address form.
  // Without this, the saved-address fetch below can resolve AFTER someone
  // has already filled the form (common on slower connections/devices) and
  // silently wipe out what they typed right before they hit "Place Order" —
  // that's what was causing the false "missing fields" error.
  const userEditedAddressRef = useRef(false);

  useEffect(() => {
    if (!user?.uid) return;
    listAddresses(user.uid).then((items) => {
      setSavedAddresses(items);
      if (userEditedAddressRef.current) return; // don't clobber what the customer already typed
      const defaultAddr = items.find((item) => item.default) || items[0];
      if (defaultAddr) {
        setSelectedAddressId(defaultAddr.id);
        applyAddressWithCityMode(defaultAddr);
      }
    });
  }, [user]);

  // NEW — load the admin-configured city delivery rates, and keep listening
  // for changes so a rate the admin edits/adds shows up here too.
  useEffect(() => {
    function loadZones() {
      listDeliveryZones()
        .then((list) => setDeliveryZones(list || []))
        .catch((err) => console.error("Could not load delivery charges:", err));
    }
    loadZones();
    window.addEventListener("deliveryzoneschange", loadZones);
    return () => window.removeEventListener("deliveryzoneschange", loadZones);
  }, []);

  // NEW — once the delivery zones are in, double-check whether the address
  // we already loaded (e.g. a saved address restored above) matches one of
  // the configured cities, and switch the City field to the dropdown view
  // if so (it may have started in "other" mode if this ran before the
  // zones had loaded yet).
  useEffect(() => {
    if (deliveryZones.length === 0 || !address.city) return;
    const options = deliveryZones.filter((z) => z.city !== DEFAULT_ZONE_CITY);
    const matches = options.some((z) => z.city.trim().toLowerCase() === address.city.trim().toLowerCase());
    if (matches) setCityMode("select");
  }, [deliveryZones]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch each cart item's seller payment details so the buyer knows where
  // to send money if they don't choose Cash on Delivery.
  useEffect(() => {
    if (items.length === 0) {
      setSellerPaymentInfo([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      items.map(async (item) => {
        const product = await getProduct(item.productId);
        return {
          productId: item.productId,
          productName: item.name,
          ownerEmail: product?.ownerEmail || "",
          sellerPaymentMethod: product?.sellerPaymentMethod || "cod",
          sellerAccountTitle: product?.sellerAccountTitle || "",
          sellerAccountNumber: product?.sellerAccountNumber || "",
          sellerBankName: product?.sellerBankName || "",
        };
      })
    ).then((results) => {
      if (!cancelled) setSellerPaymentInfo(results.filter((r) => r.sellerPaymentMethod !== "cod"));
    });
    return () => { cancelled = true; };
  }, [items]);

  // NEW — the city options shown in the dropdown (the "Other cities"
  // fallback rate itself is never listed as a pickable city).
  const cityOptions = deliveryZones.filter((z) => z.city !== DEFAULT_ZONE_CITY);
  // NEW — delivery charge is now resolved from the selected city instead of
  // a flat store-wide constant. Recalculates the moment the city changes.
  const deliveryCharge = resolveDeliveryCharge(deliveryZones, address.city);
  const total = subtotal + deliveryCharge;

  // NEW — applies a saved/loaded address AND figures out whether its city
  // matches one of the admin's configured cities (dropdown) or not (free
  // text "Other city" box).
  function applyAddressWithCityMode(addr) {
    setAddress({ ...addr });
    const options = deliveryZones.filter((z) => z.city !== DEFAULT_ZONE_CITY);
    const city = (addr?.city || "").trim();
    if (!city) {
      setCityMode("select");
      return;
    }
    const matches = options.some((z) => z.city.trim().toLowerCase() === city.toLowerCase());
    setCityMode(matches ? "select" : "other");
  }

  // NEW — handles picking a value from the City dropdown, including the
  // special "Other city" option which switches to a free-text box.
  function handleCitySelect(value) {
    userEditedAddressRef.current = true;
    if (value === "__other__") {
      setCityMode("other");
      setAddress((a) => ({ ...a, city: "" }));
    } else {
      setCityMode("select");
      setAddress((a) => ({ ...a, city: value }));
    }
  }

  function update(field, val) {
    userEditedAddressRef.current = true;
    setAddress((a) => ({ ...a, [field]: val }));
  }

  async function handlePlaceOrder(e) {
    e.preventDefault();
    setError("");
    if (!address.fullName || !address.phone || !address.city || !address.address) {
      return setError("Please fill in all required address fields.");
    }
    setBusy(true);
    try {
      const finalAddress = { ...address };
      const orderItems = items.map((i) => ({ productId: i.productId, name: i.name, price: i.price, qty: i.qty, image: i.image }));
      const { orderNumber, id } = await placeOrder({
        userId: user.uid,
        customerName: address.fullName,
        customerEmail: user.email,
        items: orderItems,
        address: finalAddress,
        paymentMethod,
        subtotal,
        deliveryCharge,
        discount: 0,
        total,
      });
      clearCart();
      navigate(`/orders/${id}`, { state: { justPlaced: true, orderNumber } });
    } catch (err) {
      setError(err.message || "Could not place order. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAddress() {
    if (!user?.uid) return;
    if (!address.fullName || !address.phone || !address.city || !address.address) {
      return setError("Please complete the delivery address fields before saving.");
    }

    setAddressBusy(true);
    setError("");
    try {
      if (selectedAddressId) {
        await updateAddress(user.uid, selectedAddressId, address);
      } else {
        const id = await addAddress(user.uid, { ...address, default: savedAddresses.length === 0 });
        setSelectedAddressId(id);
      }
      const next = await listAddresses(user.uid);
      setSavedAddresses(next);
      const defaultAddr = next.find((item) => item.default) || next[0];
      if (defaultAddr) {
        setSelectedAddressId(defaultAddr.id);
        applyAddressWithCityMode(defaultAddr);
      }
    } catch (err) {
      setError(err.message || "Could not save address.");
    } finally {
      setAddressBusy(false);
    }
  }

  async function handlePickSavedAddress(addr) {
    setSelectedAddressId(addr.id);
    applyAddressWithCityMode(addr);
  }

  async function handleDeleteSavedAddress(addrId) {
    if (!user?.uid) return;
    await removeAddress(user.uid, addrId);
    const next = await listAddresses(user.uid);
    setSavedAddresses(next);
    if (selectedAddressId === addrId) {
      const defaultAddr = next.find((item) => item.default) || next[0];
      setSelectedAddressId(defaultAddr?.id || "");
      if (defaultAddr) {
        applyAddressWithCityMode(defaultAddr);
      } else {
        setAddress({ fullName: "", phone: "", city: "", area: "", address: "", landmark: "", postalCode: "" });
        setCityMode("select");
      }
    }
  }

  async function handleSetDefault(addrId) {
    if (!user?.uid) return;
    await setDefaultAddress(user.uid, addrId);
    const next = await listAddresses(user.uid);
    setSavedAddresses(next);
    const selected = next.find((item) => item.id === addrId);
    if (selected) {
      setSelectedAddressId(selected.id);
      applyAddressWithCityMode(selected);
    }
  }

  if (items.length === 0) {
    return <div className="container empty-state" style={{ padding: 60 }}>Your cart is empty.</div>;
  }

  return (
    <div className="container checkout-page">
      {/* Responsive styles: desktop keeps the 2-column layout (form + sticky summary),
          tablet narrows the summary column, mobile stacks everything in one column
          with the order summary moved above the form so users see the total first. */}
      <style>{`
        .checkout-page {
          padding: 32px 20px;
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 30px;
          align-items: start;
        }
        .checkout-form-col {
          order: 1;
        }
        .checkout-summary-col {
          order: 2;
          position: sticky;
          top: 20px;
        }
        .checkout-address-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .checkout-address-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .checkout-address-actions .btn-group {
          display: flex;
          gap: 6px;
        }

        /* Tablet: narrower summary column, tighter padding */
        @media (max-width: 1024px) {
          .checkout-page {
            grid-template-columns: 1fr 260px;
            gap: 20px;
            padding: 24px 16px;
          }
        }

        /* Mobile: single column, summary on top, address fields stack */
        @media (max-width: 720px) {
          .checkout-page {
            grid-template-columns: 1fr;
            gap: 16px;
            padding: 16px 12px;
          }
          .checkout-form-col {
            order: 2;
          }
          .checkout-summary-col {
            order: 1;
            position: static;
          }
          .checkout-address-row {
            grid-template-columns: 1fr;
            gap: 0;
          }
          .checkout-address-actions {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
          .checkout-address-actions .btn-group {
            width: 100%;
          }
          .checkout-address-actions .btn-group .btn {
            flex: 1;
          }
          .btn-block {
            font-size: 15px;
            padding: 14px;
          }
        }
      `}</style>

      <div className="checkout-summary-col">
        <div className="card" style={{ padding: 20, height: "fit-content" }}>
          <h3 style={{ fontSize: 16, marginBottom: 16 }}>Order Summary</h3>
          {items.map((i) => (
            <div key={i.productId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 8 }}>
              <span>{i.name} × {i.qty}</span><span>Rs {(i.price * i.qty).toLocaleString()}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--line)", margin: "12px 0", paddingTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
              <span>Product Subtotal</span><span>Rs {subtotal.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
              <span>Delivery Charges</span>
              <span>{address.city.trim() ? `Rs ${deliveryCharge.toLocaleString()}` : "Select a city"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 16, marginTop: 10 }}>
              <span>Grand Total</span><span>Rs {Math.max(0, total).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="checkout-form-col">
        <form onSubmit={handlePlaceOrder}>
          <h1 style={{ fontSize: 24, marginBottom: 20 }}>Checkout</h1>

          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, marginBottom: 14 }}>Delivery Address</h3>

            {savedAddresses.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Saved addresses</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {savedAddresses.map((addr) => (
                    <div key={addr.id} style={{ border: selectedAddressId === addr.id ? "1.5px solid var(--teal)" : "1.5px solid var(--line)", borderRadius: 10, padding: 10 }}>
                      <div className="checkout-address-actions">
                        <button type="button" onClick={() => handlePickSavedAddress(addr)} style={{ textAlign: "left", fontWeight: 700, background: "none", border: 0, padding: 0, color: "var(--ink)" }}>
                          {addr.fullName} · {addr.city}
                          {addr.default && <span style={{ marginLeft: 8, color: "var(--success)", fontSize: 11 }}>Default</span>}
                        </button>
                        <div className="btn-group">
                          {!addr.default && <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleSetDefault(addr.id)}>Set default</button>}
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteSavedAddress(addr.id)}>Delete</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>{addr.address}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="field"><label>Full Name</label><input required value={address.fullName} onChange={(e) => update("fullName", e.target.value)} /></div>
            <div className="field"><label>Phone Number</label><input required value={address.phone} onChange={(e) => update("phone", e.target.value)} /></div>
            <div className="checkout-address-row">
              {/* NEW — City selection drives the delivery charge below.
                  Dropdown lists every city the admin has configured a rate
                  for; "Other city" reveals a free-text box that falls back
                  to the admin's default rate. */}
              <div className="field">
                <label>City</label>
                <select
                  required
                  value={cityMode === "other" ? "__other__" : (address.city || "")}
                  onChange={(e) => handleCitySelect(e.target.value)}
                >
                  <option value="" disabled>Select city</option>
                  {cityOptions.map((z) => (
                    <option key={z.id} value={z.city}>{z.city}</option>
                  ))}
                  <option value="__other__">Other city</option>
                </select>
                {cityMode === "other" && (
                  <input
                    required
                    value={address.city}
                    onChange={(e) => update("city", e.target.value)}
                    placeholder="Type your city name"
                    style={{ marginTop: 8 }}
                  />
                )}
                {address.city.trim() && (
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>
                    Delivery charge for {address.city}: <strong>Rs {deliveryCharge.toLocaleString()}</strong>
                  </div>
                )}
              </div>
              <div className="field"><label>Area</label><input value={address.area} onChange={(e) => update("area", e.target.value)} /></div>
              <div className="field"><label>State</label><input value={address.state || ""} onChange={(e) => update("state", e.target.value)} /></div>
              <div className="field"><label>Email</label><input type="email" value={address.email || ""} onChange={(e) => update("email", e.target.value)} placeholder="e.g., you@example.com" /></div>
            </div>
            <div className="field"><label>Complete Address</label><textarea required rows={2} value={address.address} onChange={(e) => update("address", e.target.value)} /></div>
            <div className="checkout-address-row">
              <div className="field"><label>Landmark (optional)</label><input value={address.landmark} onChange={(e) => update("landmark", e.target.value)} /></div>
              <div className="field"><label>Postal Code</label><input value={address.postalCode || ""} onChange={(e) => update("postalCode", e.target.value)} placeholder="e.g., 75500" /></div>
            </div>

            <button type="button" className="btn btn-outline" disabled={addressBusy} onClick={handleSaveAddress}>
              {addressBusy ? "Saving…" : selectedAddressId ? "Save changes to address" : "Save this address"}
            </button>
          </div>

          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, marginBottom: 14 }}>Payment Method</h3>
            {[
              { id: "cod", label: "Cash on Delivery" },
              { id: "bank_transfer", label: "Bank Transfer" },
              { id: "wallet", label: "Wallet Payment (JazzCash / EasyPaisa)" },
            ].map((m) => (
              <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", opacity: m.disabled ? 0.5 : 1 }}>
                <input type="radio" name="pm" disabled={m.disabled} checked={paymentMethod === m.id} onChange={() => setPaymentMethod(m.id)} />
                {m.label}
              </label>
            ))}

            {/* Seller bank/wallet details — only shown when buyer picks a non-COD method */}
            {paymentMethod !== "cod" && sellerPaymentInfo.length > 0 && (
              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Send payment to
                </div>
                {sellerPaymentInfo.map((s) => (
                  <div key={s.productId} style={{ border: "1.5px solid var(--line)", borderRadius: 10, padding: 12, fontSize: 13.5 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{s.productName}</div>
                    <div style={{ color: "var(--ink-soft)" }}>{PAYMENT_METHOD_LABELS[s.sellerPaymentMethod] || s.sellerPaymentMethod}</div>
                    {s.sellerBankName && <div>Bank: {s.sellerBankName}</div>}
                    {s.sellerAccountTitle && <div>Account Title: {s.sellerAccountTitle}</div>}
                    {s.sellerAccountNumber && <div>Account Number: <strong>{s.sellerAccountNumber}</strong></div>}
                  </div>
                ))}
                <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Please send payment to the seller directly, then place your order below.
                </p>
              </div>
            )}
          </div>

          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-accent btn-block" disabled={busy}>{busy ? "Placing order…" : `Place Order — Rs ${total.toLocaleString()}`}</button>
        </form>
      </div>
    </div>
  );
}