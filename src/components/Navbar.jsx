import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { getCachedConfig, getAppConfig, normalizeLogoUrl } from "../lib/appConfig";
import { buildWhatsappLink } from "../lib/whatsapp";
import NotificationBell from "./NotificationBell";

const HELP_WHATSAPP_NUMBER = "03040024727";
const helpPurchasingLink = buildWhatsappLink(HELP_WHATSAPP_NUMBER, "Hi! I need help with purchasing a product.");
const helpSellingLink = buildWhatsappLink(HELP_WHATSAPP_NUMBER, "Hi! I need help with selling a product.");
const contactOwnerLink = buildWhatsappLink(HELP_WHATSAPP_NUMBER, "Hi! I'm interested in selling on Shophub. Can you tell me how to get started?");

export default function Navbar() {
  const { user, profile, isAdmin, canAddProduct, canAccessSettings, logout } = useAuth();
  const { itemCount } = useCart();
  const [term, setTerm] = useState("");
  const [appConfig, setAppConfig] = useState(getCachedConfig());
  const [menuOpen, setMenuOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const navigate = useNavigate();
  const logoSrc = normalizeLogoUrl(appConfig.appLogo);
  // FIX: this is the actual editable label from Settings > "Sell on Shophub"
  // Button. The desktop center button below was hardcoded to appName instead
  // of this, which is why editing the button text in Settings had no effect.
  const sellLabel = appConfig.sellButtonText || "Sell on Shophub";

  useEffect(() => {
    getAppConfig().then(setAppConfig).catch(() => {});
    const refreshConfig = (event) => setAppConfig(event.detail || getCachedConfig());
    window.addEventListener("appconfigchange", refreshConfig);
    return () => window.removeEventListener("appconfigchange", refreshConfig);
  }, []);

  function onSearch(e) {
    e.preventDefault();
    if (term.trim()) navigate(`/search?q=${encodeURIComponent(term.trim())}`);
  }

  return (
    <header style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, zIndex: 40 }}>
      <div className="container" style={{ display: "flex", alignItems: "center", gap: 20, height: 68 }}>
        {/* Logo + name */}
        <Link to="/" className="display navbar-brand" style={{ fontSize: 24, color: "var(--teal)", whiteSpace: "nowrap", fontWeight: 800 }}>
          {logoSrc ? (
            <img
              src={logoSrc}
              alt=""
              className="navbar-logo"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : null}
          <span>{appConfig.appName || "ShopHub"}</span>
        </Link>

        {/* Search bar */}
        <form onSubmit={onSearch} style={{ flex: 1, maxWidth: 480 }}>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search products, brands, categories…"
            style={{ width: "100%", padding: "10px 16px", borderRadius: 999, border: "1.5px solid var(--line)", fontSize: 14 }}
          />
        </form>

        {/* DESKTOP NAV LINKS — everything that used to live ONLY inside the
            left-corner drawer (now removed) and isn't already shown
            elsewhere in this bar (Home = logo, Sell on Shophub = center
            button below, Cart/Profile/Logout = right corner). On laptop
            these show directly here; on mobile/tablet ".desktop-nav" stays
            hidden exactly like it already does for the two groups below —
            same class, same breakpoint, nothing new introduced. The exact
            same links remain reachable on mobile via the existing ☰ menu,
            untouched below. */}
        <div className="desktop-nav" style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Link to="/wishlist" style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", color: "var(--ink)" }}>Wishlist</Link>
          {canAddProduct && <Link to="/sell" style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", color: "var(--ink)" }}>Add Product</Link>}
          {canAccessSettings && <Link to="/settings" style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", color: "var(--ink)" }}>Settings</Link>}
          {isAdmin && <Link to="/admin" style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", color: "var(--ink)" }}>Admin Panel</Link>}
          <a href={helpPurchasingLink} target="_blank" rel="noreferrer" style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", color: "var(--ink)" }}>Help (Buying)</a>
          <a href={helpSellingLink} target="_blank" rel="noreferrer" style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", color: "var(--ink)" }}>Help (Selling)</a>
        </div>

        {/* CENTER: big "Sell on Shophub" — now driven by appConfig.sellButtonText */}
        <div className="desktop-nav" style={{ position: "relative", marginLeft: "auto" }}>
          <button
            type="button"
            onClick={() => setSellOpen((open) => !open)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, fontWeight: 900, color: "var(--teal)", whiteSpace: "nowrap" }}
          >
            {sellLabel}
          </button>
          {sellOpen && (
            <>
              <div onClick={() => setSellOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
              <div style={{
                position: "absolute", top: "40px", left: "50%", transform: "translateX(-50%)", width: "220px",
                backgroundColor: "#fff", borderRadius: "12px", boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                border: "1px solid #f3f4f6", zIndex: 70, overflow: "hidden",
              }}>
                <a href={contactOwnerLink} target="_blank" rel="noreferrer" onClick={() => setSellOpen(false)} style={{ display: "block", padding: "12px 14px", fontSize: 14, fontWeight: 600, color: "#111827" }}>
                  💬 Contact with Owner
                </a>
              </div>
            </>
          )}
        </div>

        {/* Notification bell — kept OUTSIDE the .desktop-nav wrapper (which is
            display:none on mobile) so it stays mounted on every screen size.
            The bell icon itself is hidden on mobile via .navbar-bell-btn CSS
            (mobile already has its own bell in the bottom nav), but this
            component's dropdown panel + the "toggle-notifications-panel"
            listener still work, which is what the mobile bottom-nav bell
            button needs to actually open something. */}
        <NotificationBell />

        {/* RIGHT CORNER: cart icon, profile, logout (red) */}
        <div className="desktop-nav" style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link to="/cart" aria-label="Cart" style={{ position: "relative", fontSize: 22, lineHeight: 1, display: "flex" }}>
            🛒
            {itemCount > 0 && (
              <span style={{
                position: "absolute", top: -8, right: -10, background: "var(--berry)", color: "#fff",
                fontSize: 11, borderRadius: 999, padding: "1px 6px", fontWeight: 800,
              }}>{itemCount}</span>
            )}
          </Link>

          {user ? (
            <>
              <Link to="/profile" aria-label="Profile" style={{ fontSize: 22, lineHeight: 1, display: "flex" }}>
                👤
              </Link>
              <button
                type="button"
                onClick={() => logout()}
                style={{
                  background: "#dc2626", color: "#fff", border: "none", borderRadius: 8,
                  padding: "8px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary btn-sm">Login</Link>
          )}
        </div>

        <div className="mobile-header-actions" style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
          <button
            className="mobile-menu-button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span>{menuOpen ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="mobile-menu">
          <a href={contactOwnerLink} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)} style={{ fontWeight: 800, fontSize: 17 }}>{sellLabel}</a>
          {isAdmin && <Link to="/admin" onClick={() => setMenuOpen(false)}>Admin panel</Link>}
          {canAddProduct && <Link to="/sell" onClick={() => setMenuOpen(false)}>Add product</Link>}
          {user && <Link to="/orders" onClick={() => setMenuOpen(false)}>My orders</Link>}
          <Link to="/wishlist" onClick={() => setMenuOpen(false)}>Wishlist</Link>
          {canAccessSettings && <Link to="/settings" onClick={() => setMenuOpen(false)}>Settings</Link>}
          <Link to="/profile" onClick={() => setMenuOpen(false)}>Profile</Link>
          <Link to="/cart" onClick={() => setMenuOpen(false)}>Cart {itemCount > 0 && `(${itemCount})`}</Link>
          <a href={helpPurchasingLink} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>🛍️ Help with Purchasing</a>
          <a href={helpSellingLink} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>🏷️ Help with Selling</a>
          {user ? <button onClick={() => { setMenuOpen(false); logout(); }}>Logout</button> : <Link to="/login" onClick={() => setMenuOpen(false)}>Login</Link>}
        </div>
      )}
      <nav className="mobile-bottom-nav" aria-label="Primary navigation">
        <Link to="/">
          <span>⌂</span>
          <small>Home</small>
        </Link>
        <button type="button" onClick={() => window.dispatchEvent(new Event("toggle-notifications-panel"))} style={{ background: "none", border: "none" }}>
          <span>🔔</span>
          <small>Notification</small>
        </button>
        <Link to="/profile">
          <span>👤</span>
          <small>Profile</small>
        </Link>
      </nav>
    </header>
  );
}