import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { PRIVILEGED_EMAILS, SETTINGS_ADMIN_EMAILS, normalizeEmail } from "../lib/allowedEmails";
import { listProductPermissions, setProductPermission } from "../lib/permissions";
import { listBanners, createBanner, updateBanner, deleteBanner } from "../lib/banners";
import { updateAppConfig, getCachedConfig, normalizeLogoUrl } from "../lib/appConfig";
import { uploadAppLogo, uploadBannerImage, uploadBannerVideo } from "../lib/storage";
import { listUsers, forceLogoutUser } from "../lib/users";

export default function Settings() {
  const { user } = useAuth();
  
  // App Config
  const cachedConfig = getCachedConfig() || {};
  const [appConfig, setAppConfig] = useState(cachedConfig);
  const [appName, setAppName] = useState(cachedConfig.appName || "ShopHub");
  const [appLogo, setAppLogo] = useState(cachedConfig.appLogo || "");
  const [contactEmail, setContactEmail] = useState(cachedConfig.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(cachedConfig.contactPhone || "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [tickerEnabled, setTickerEnabled] = useState(cachedConfig.tickerEnabled || false);
  const [tickerText, setTickerText] = useState(cachedConfig.tickerText || "");
  const [tickerBgColor, setTickerBgColor] = useState(cachedConfig.tickerBgColor || "#123b36");
  const [tickerTextColor, setTickerTextColor] = useState(cachedConfig.tickerTextColor || "#ffffff");
  const [sellButtonText, setSellButtonText] = useState(cachedConfig.sellButtonText || "Sell on Shophub");

  // Seller Permissions
  const [permissions, setPermissions] = useState([]);
  const [users, setUsers] = useState([]);
  const [newSellerEmail, setNewSellerEmail] = useState("");

  // Banners
  const [banners, setBanners] = useState([]);
  // NEW — a banner is either "image" (existing behaviour, default) or
  // "video". Kept as a simple toggle in the create form.
  const [bannerMediaType, setBannerMediaType] = useState("image");
  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerImageUrl, setBannerImageUrl] = useState("");
  const [bannerVideoUrl, setBannerVideoUrl] = useState(""); // NEW
  const [bannerLink, setBannerLink] = useState("/");
  const [bannerActive, setBannerActive] = useState(true);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerVideoUploading, setBannerVideoUploading] = useState(false); // NEW
  // NEW — banner crop/position control. objectPosition is stored as a plain
  // CSS value ("50% 50%") on the banner doc and consumed by Home.jsx's
  // <img style={{ objectPosition }}> so admins can re-center a banner image
  // without re-cropping/re-uploading the file itself.
  const [bannerPosX, setBannerPosX] = useState(50);
  const [bannerPosY, setBannerPosY] = useState(50);

  // Per-banner "edit" panel state for banners that already exist. Lets an
  // admin change the title/link, replace the image or video file, switch
  // an existing banner between image/video, and (for images) re-adjust the
  // crop position — all without deleting and recreating the banner.
  const [editingBannerId, setEditingBannerId] = useState(null);
  const [editMediaType, setEditMediaType] = useState("image");
  const [editTitle, setEditTitle] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editVideoUrl, setEditVideoUrl] = useState("");
  const [editLink, setEditLink] = useState("/");
  const [editPosX, setEditPosX] = useState(50);
  const [editPosY, setEditPosY] = useState(50);
  const [editUploading, setEditUploading] = useState(false);

  // UI State
  const [tab, setTab] = useState("app");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const canManage = !!user && (SETTINGS_ADMIN_EMAILS || []).includes(normalizeEmail(user.email));
  const enabledSellerEmails = new Set([
    ...(PRIVILEGED_EMAILS || []),
    ...permissions.filter((item) => item.granted).map((item) => normalizeEmail(item.email)),
  ]);
  const staffUsers = users.filter((item) => {
    const email = normalizeEmail(item.email);
    return enabledSellerEmails.has(email) || ["admin", "super_admin"].includes(item.role);
  });
  const sellerUsers = users.filter((item) => enabledSellerEmails.has(normalizeEmail(item.email)));

  useEffect(() => {
    if (!canManage) return;
    loadAllSettings();
  }, [canManage]);

  async function loadAllSettings() {
    setLoading(true);
    setError("");
    try {
      // Note: app config is already loaded once by the Navbar on app start
      // (and cached in sessionStorage). Re-fetching it here with a second
      // getDoc() while the notification bell's onSnapshot listener is also
      // starting up is exactly the race condition that triggers Firestore's
      // "INTERNAL ASSERTION FAILED (ID: b815)" SDK bug. Reusing the cache
      // avoids that extra concurrent read entirely.
      const config = getCachedConfig();
      setAppConfig(config || {});
      setAppName(config?.appName || "ShopHub");
      setAppLogo(config?.appLogo || "");
      setContactEmail(config?.contactEmail || "");
      setContactPhone(config?.contactPhone || "");
      setTickerEnabled(config?.tickerEnabled || false);
      setTickerText(config?.tickerText || "");
      setTickerBgColor(config?.tickerBgColor || "#123b36");
      setTickerTextColor(config?.tickerTextColor || "#ffffff");
      setSellButtonText(config?.sellButtonText || "Sell on Shophub");

      // Fetch each section independently — if one fails (e.g. Firestore
      // rules for "users" aren't deployed yet), the other sections still
      // load instead of the whole page going blank.
      const [permsResult, bannersResult, usersResult] = await Promise.allSettled([
        listProductPermissions(),
        listBanners(),
        listUsers(),
      ]);

      if (permsResult.status === "fulfilled") setPermissions(permsResult.value || []);
      if (bannersResult.status === "fulfilled") setBanners(bannersResult.value || []);
      if (usersResult.status === "fulfilled") setUsers(usersResult.value || []);

      const failures = [];
      if (permsResult.status === "rejected") failures.push({ label: "Seller permissions", err: permsResult.reason });
      if (bannersResult.status === "rejected") failures.push({ label: "Banners", err: bannersResult.reason });
      if (usersResult.status === "rejected") failures.push({ label: "Users", err: usersResult.reason });

      if (failures.length > 0) {
        failures.forEach((f) => console.error(`Could not load "${f.label}":`, f.err));
        const isPermissionIssue = failures.some((f) => f.err?.code === "permission-denied");
        setError(
          `Could not load: ${failures.map((f) => f.label).join(", ")}.` +
          (isPermissionIssue
            ? " This looks like a Firestore permissions issue — make sure the latest firestore.rules has been deployed (firebase deploy --only firestore:rules) and that you're signed in with the settings-admin account."
            : "")
        );
      }
    } catch (err) {
      setError("Could not load settings");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (!canManage) {
    return (
      <div className="container empty-state" style={{ padding: 60 }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Access Denied</div>
        <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>
          Only authorized administrators can access settings.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: 60, textAlign: "center" }}>
        <div style={{ fontSize: 24, marginBottom: 10 }}>⏳</div>
        <div>Loading settings...</div>
      </div>
    );
  }

  async function handleSaveAppConfig() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const updates = {
        appName: appName.trim(),
        appLogo: appLogo.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        tickerEnabled: !!tickerEnabled,
        tickerText: tickerText.trim(),
        tickerBgColor: tickerBgColor,
        tickerTextColor: tickerTextColor,
        sellButtonText: sellButtonText.trim() || "Sell on Shophub",
      };
      await updateAppConfig(updates);
      localStorage.setItem("shopName", appName.trim());
      localStorage.setItem("shopLogo", appLogo.trim());
      window.dispatchEvent(new Event("shopNameUpdated"));

      setAppConfig((current) => ({ ...current, ...updates }));
      setSuccess("✓ App settings saved!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message || "Could not save settings");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    setLogoUploading(true);
    setError("");
    setSuccess("");
    try {
      const logoUrl = await uploadAppLogo(file);
      setAppLogo(logoUrl);
      await updateAppConfig({ appLogo: logoUrl });
      localStorage.setItem("shopLogo", logoUrl);
      window.dispatchEvent(new Event("shopNameUpdated"));

      setAppConfig((current) => ({ ...current, appLogo: logoUrl }));
      setSuccess("✓ Logo uploaded and saved!");
    } catch (err) {
      setError(err.message || "Could not upload logo");
    } finally {
      setLogoUploading(false);
      event.target.value = "";
    }
  }

  async function handleAddSeller() {
    setError("");
    setSuccess("");
    if (!newSellerEmail.trim()) return setError("Please enter a seller email.");

    setBusy(true);
    try {
      await setProductPermission(newSellerEmail, true);
      setSuccess(`✓ ${newSellerEmail} can now add products!`);
      setNewSellerEmail("");
      const perms = await listProductPermissions();
      setPermissions(perms || []);
    } catch (err) {
      setError(err.message || "Could not add seller");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleSeller(email, currentGrant) {
    setBusy(true);
    try {
      await setProductPermission(email, !currentGrant);
      setSuccess(`✓ Updated ${email}`);
      const perms = await listProductPermissions();
      setPermissions(perms || []);
    } catch (err) {
      setError(err.message || "Could not update seller");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoteLogout(userId, email) {
    if (!window.confirm(`Force logout user ${email}?`)) return;
    setBusy(true);
    try {
      await forceLogoutUser(userId);
      setSuccess(`✓ ${email} will be signed out on their other device(s) within moments (needs them to be online).`);
    } catch (err) {
      setError(err.message || "Could not logout user");
    } finally {
      setBusy(false);
    }
  }

  async function handleBannerFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      return;
    }
    setBannerUploading(true);
    setError("");
    try {
      let uploadedUrl = "";
      if (typeof uploadBannerImage === "function") {
        uploadedUrl = await uploadBannerImage(file);
      } else {
        uploadedUrl = URL.createObjectURL(file);
      }
      setBannerImageUrl(uploadedUrl);
      setSuccess("✓ Banner image uploaded successfully!");
    } catch (err) {
      setError(err.message || "Could not upload banner image");
    } finally {
      setBannerUploading(false);
      event.target.value = "";
    }
  }

  // NEW — upload flow for the "Video banner" option in the create form.
  // Mirrors handleBannerFileUpload above, just pointed at the video
  // endpoint and validating for a video file instead of an image.
  async function handleBannerVideoFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Please select a valid video file.");
      return;
    }
    setBannerVideoUploading(true);
    setError("");
    try {
      const uploadedUrl = await uploadBannerVideo(file);
      setBannerVideoUrl(uploadedUrl);
      setSuccess("✓ Banner video uploaded successfully!");
    } catch (err) {
      setError(err.message || "Could not upload banner video");
    } finally {
      setBannerVideoUploading(false);
      event.target.value = "";
    }
  }

  async function handleCreateBanner() {
    setError("");
    setSuccess("");
    if (!bannerTitle.trim()) {
      return setError("Title is required");
    }
    if (bannerMediaType === "video" && !bannerVideoUrl.trim()) {
      return setError("Please add a banner video (upload a file or paste a URL)");
    }
    if (bannerMediaType === "image" && !bannerImageUrl.trim()) {
      return setError("Please add a banner image (upload a file or paste a URL)");
    }

    setBusy(true);
    try {
      await createBanner({
        title: bannerTitle.trim(),
        // NEW — "image" or "video"
        mediaType: bannerMediaType,
        imageUrl: bannerMediaType === "image" ? bannerImageUrl.trim() : "",
        videoUrl: bannerMediaType === "video" ? bannerVideoUrl.trim() : "", // NEW
        link: bannerLink || "/",
        active: bannerActive,
        // NEW — saved as a plain CSS object-position value, e.g. "50% 30%"
        objectPosition: `${bannerPosX}% ${bannerPosY}%`,
      });
      setSuccess(bannerMediaType === "video" ? "✓ Video banner created!" : "✓ Banner created!");
      setBannerTitle("");
      setBannerImageUrl("");
      setBannerVideoUrl("");
      setBannerLink("/");
      setBannerActive(true);
      setBannerPosX(50);
      setBannerPosY(50);
      setBannerMediaType("image");
      const bannersList = await listBanners();
      setBanners(bannersList || []);
      window.dispatchEvent(new Event("bannersUpdated"));
    } catch (err) {
      setError(err.message || "Could not create banner");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleBanner(bannerId, active) {
    setBusy(true);
    try {
      await updateBanner(bannerId, { active: !active });
      const bannersList = await listBanners();
      setBanners(bannersList || []);
      window.dispatchEvent(new Event("bannersUpdated"));
      setSuccess("✓ Banner updated!");
    } catch (err) {
      setError(err.message || "Could not update banner");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteBanner(bannerId) {
    if (!window.confirm("Delete this banner?")) return;
    setBusy(true);
    try {
      await deleteBanner(bannerId);
      const bannersList = await listBanners();
      setBanners(bannersList || []);
      window.dispatchEvent(new Event("bannersUpdated"));
      setSuccess("✓ Banner deleted!");
    } catch (err) {
      setError(err.message || "Could not delete banner");
    } finally {
      setBusy(false);
    }
  }

  // NEW — opens the inline edit panel for an existing banner, seeded with
  // its current title/link/media/position so admins can edit, replace the
  // image/video file, or switch its media type entirely.
  function handleStartEditBanner(banner) {
    const [x, y] = (banner.objectPosition || "50% 50%")
      .split(" ")
      .map((v) => parseInt(v, 10) || 50);
    setEditingBannerId(banner.id);
    setEditMediaType(banner.mediaType === "video" ? "video" : "image");
    setEditTitle(banner.title || "");
    setEditImageUrl(banner.imageUrl || "");
    setEditVideoUrl(banner.videoUrl || "");
    setEditLink(banner.link || "/");
    setEditPosX(x);
    setEditPosY(y);
    setError("");
    setSuccess("");
  }

  // NEW — replace an existing banner's image file from within the edit panel.
  async function handleEditImageFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      return;
    }
    setEditUploading(true);
    setError("");
    try {
      const uploadedUrl = await uploadBannerImage(file);
      setEditImageUrl(uploadedUrl);
      setSuccess("✓ New banner image uploaded!");
    } catch (err) {
      setError(err.message || "Could not upload banner image");
    } finally {
      setEditUploading(false);
      event.target.value = "";
    }
  }

  // NEW — replace an existing banner's video file from within the edit panel.
  async function handleEditVideoFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Please select a valid video file.");
      return;
    }
    setEditUploading(true);
    setError("");
    try {
      const uploadedUrl = await uploadBannerVideo(file);
      setEditVideoUrl(uploadedUrl);
      setSuccess("✓ New banner video uploaded!");
    } catch (err) {
      setError(err.message || "Could not upload banner video");
    } finally {
      setEditUploading(false);
      event.target.value = "";
    }
  }

  // NEW — saves every editable field for the banner being edited (title,
  // link, media type, image/video URL, crop position) in one go.
  async function handleSaveBannerEdit(bannerId) {
    setError("");
    if (!editTitle.trim()) return setError("Title is required");
    if (editMediaType === "video" && !editVideoUrl.trim()) {
      return setError("Please add a banner video (upload a file or paste a URL)");
    }
    if (editMediaType === "image" && !editImageUrl.trim()) {
      return setError("Please add a banner image (upload a file or paste a URL)");
    }

    setBusy(true);
    try {
      await updateBanner(bannerId, {
        title: editTitle.trim(),
        mediaType: editMediaType,
        imageUrl: editMediaType === "image" ? editImageUrl.trim() : "",
        videoUrl: editMediaType === "video" ? editVideoUrl.trim() : "",
        link: editLink || "/",
        objectPosition: `${editPosX}% ${editPosY}%`,
      });
      const bannersList = await listBanners();
      setBanners(bannersList || []);
      window.dispatchEvent(new Event("bannersUpdated"));
      setSuccess("✓ Banner updated!");
      setEditingBannerId(null);
    } catch (err) {
      setError(err.message || "Could not update banner");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ padding: "32px 20px", maxWidth: 800 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8, fontWeight: 800 }}>⚙️ Settings</h1>
      <p style={{ color: "var(--ink-soft)", marginBottom: 24 }}>Admin only. Manage your marketplace settings.</p>

      <div className="settings-stats">
        <div className="card settings-stat"><strong>{users.length}</strong><span>Registered users</span></div>
        <div className="card settings-stat">
          <strong>
            {new Set([
              ...users.filter((item) => (PRIVILEGED_EMAILS || []).includes(normalizeEmail(item.email))).map((item) => normalizeEmail(item.email)),
              ...permissions.filter((item) => item.granted).map((item) => normalizeEmail(item.email)),
            ]).size}
          </strong>
          <span>Active sellers</span>
        </div>
        <div className="card settings-stat"><strong>{users.filter((item) => item.blocked).length}</strong><span>Blocked users</span></div>
      </div>

      {/* TAB NAVIGATION */}
      <div style={{ display: "flex", gap: 16, borderBottom: "2px solid var(--line)", marginBottom: 28 }}>
        {["app", "sellers", "banners"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "12px 0",
              borderBottom: tab === t ? "3px solid var(--teal)" : "none",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              color: tab === t ? "var(--teal)" : "var(--ink-soft)",
              background: "none",
              border: "none",
              textTransform: "capitalize",
            }}
          >
            {t === "app" && "🏪 App Settings"}
            {t === "sellers" && "👥 Sellers"}
            {t === "banners" && "🎨 Banners"}
          </button>
        ))}
      </div>

      {/* APP SETTINGS TAB */}
      {tab === "app" && (
        <div style={{ display: "grid", gap: 24 }}>
          <div className="card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>App Branding</h2>
            <div style={{ display: "grid", gap: 14 }}>
              <div className="field">
                <label>App Name</label>
                <input
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="ShopHub"
                  style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }}
                />
              </div>
              <div className="field">
                <label>App Logo URL</label>
                <input
                  value={appLogo}
                  onChange={(e) => setAppLogo(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }}
                />
              </div>
              <label className="btn btn-outline" style={{ width: "fit-content", cursor: "pointer" }}>
                {logoUploading ? "Uploading..." : "Choose logo from device"}
                <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={logoUploading} hidden />
              </label>
              {normalizeLogoUrl && normalizeLogoUrl(appLogo) && (
                <div style={{ textAlign: "center", padding: 12, background: "var(--surface-alt)", borderRadius: 10 }}>
                  <img
                    src={normalizeLogoUrl(appLogo)}
                    alt="Logo"
                    style={{ maxWidth: 150, maxHeight: 60, objectFit: "contain" }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              )}
              <div className="field">
                <label>Contact Email</label>
                <input
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="support@example.com"
                  style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }}
                />
              </div>
              <div className="field">
                <label>Contact Phone</label>
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+92-300-1234567"
                  style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }}
                />
              </div>
              <button className="btn btn-accent" onClick={handleSaveAppConfig} disabled={busy}>
                {busy ? "Saving…" : "💾 Save Settings"}
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>📢 Announcement Ticker</h2>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16 }}>
              A scrolling message shown at the very top of the app (right-to-left), e.g. for sale announcements.
            </p>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14 }}>
                <input type="checkbox" checked={tickerEnabled} onChange={(e) => setTickerEnabled(e.target.checked)} />
                Show announcement ticker
              </label>
              <div className="field">
                <label>Ticker Text</label>
                <input
                  value={tickerText}
                  onChange={(e) => setTickerText(e.target.value)}
                  placeholder="e.g. 🎉 Summer Sale is live! Flat 20% off on all products."
                  style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field">
                  <label>Background Color</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="color" value={tickerBgColor} onChange={(e) => setTickerBgColor(e.target.value)} style={{ width: 48, height: 40, padding: 2, borderRadius: 8, border: "1.5px solid var(--line)", cursor: "pointer" }} />
                    <input value={tickerBgColor} onChange={(e) => setTickerBgColor(e.target.value)} style={{ flex: 1, padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }} />
                  </div>
                </div>
                <div className="field">
                  <label>Text Color</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="color" value={tickerTextColor} onChange={(e) => setTickerTextColor(e.target.value)} style={{ width: 48, height: 40, padding: 2, borderRadius: 8, border: "1.5px solid var(--line)", cursor: "pointer" }} />
                    <input value={tickerTextColor} onChange={(e) => setTickerTextColor(e.target.value)} style={{ flex: 1, padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }} />
                  </div>
                </div>
              </div>
              {tickerText.trim() && (
                <div style={{ borderRadius: 10, overflow: "hidden", background: tickerBgColor, color: tickerTextColor, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>
                  Preview: {tickerText}
                </div>
              )}
              <button className="btn btn-accent" onClick={handleSaveAppConfig} disabled={busy}>
                {busy ? "Saving…" : "💾 Save Settings"}
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>🏷️ "Sell on Shophub" Button</h2>
            <div className="field">
              <label>Button Text</label>
              <input
                value={sellButtonText}
                onChange={(e) => setSellButtonText(e.target.value)}
                placeholder="Sell on Shophub"
                style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }}
              />
            </div>
            <button className="btn btn-accent" onClick={handleSaveAppConfig} disabled={busy} style={{ marginTop: 14 }}>
              {busy ? "Saving…" : "💾 Save Settings"}
            </button>
          </div>
        </div>
      )}

      {/* SELLERS TAB */}
      {tab === "sellers" && (
        <div style={{ display: "grid", gap: 24 }}>
          <div className="card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Add New Seller</h2>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <input
                value={newSellerEmail}
                onChange={(e) => setNewSellerEmail(e.target.value)}
                placeholder="seller@example.com"
                style={{ flex: 1, minWidth: 220, padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }}
              />
              <button className="btn btn-accent" onClick={handleAddSeller} disabled={busy}>
                ✅ Add Seller
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Active Sellers ({enabledSellerEmails.size})</h2>
            {sellerUsers.length === 0 && permissions.length === 0 ? (
              <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>No sellers yet. Add one above.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {sellerUsers.map((seller) => {
                  const email = normalizeEmail(seller.email);
                  const protectedSeller = (PRIVILEGED_EMAILS || []).includes(email);
                  return (
                    <div key={seller.id} className="card" style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#e6f9f7" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{seller.name || "Unnamed seller"}</div>
                        <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>{email}</div>
                      </div>
                      {protectedSeller ? (
                        <span className="staff-role">Admin seller</span>
                      ) : (
                        <button className="btn btn-danger btn-sm" onClick={() => handleToggleSeller(email, true)} disabled={busy}>
                          Remove seller
                        </button>
                      )}
                    </div>
                  );
                })}
                {permissions.filter((permission) => permission.granted && !sellerUsers.some((seller) => normalizeEmail(seller.email) === normalizeEmail(permission.email))).map((permission) => (
                  <div key={permission.id} className="card" style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#e6f9f7" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{permission.email}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>Permission enabled, user has not logged in yet</div>
                    </div>
                    <button className="btn btn-danger btn-sm" onClick={() => handleToggleSeller(permission.email, true)} disabled={busy}>Remove seller</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Sellers & Admins (Live Logged In Users)</h2>
            {staffUsers.length === 0 ? (
              <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>No seller or admin profiles found.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {staffUsers.map((item) => {
                  const email = normalizeEmail(item.email);
                  const isAdminAccount = ["admin", "super_admin"].includes(item.role) || (PRIVILEGED_EMAILS || []).includes(email);
                  const userRole = isAdminAccount ? "Admin" : "Seller";
                  return (
                    <div key={item.id} className="staff-user-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", border: "1px solid var(--line)", borderRadius: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {item.name || "Unnamed user"} <span style={{ fontSize: 12, color: "var(--teal)", fontWeight: 800 }}>({userRole})</span>
                        </div>
                        <div style={{ color: "var(--ink-soft)", fontSize: 12 }}>{email}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="staff-role">{userRole}</span>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRemoteLogout(item.id, email)}
                          disabled={busy}
                          style={{ padding: "6px 10px", fontSize: 12 }}
                        >
                          🚪 Logout
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* BANNERS TAB */}
      {tab === "banners" && (
        <div style={{ display: "grid", gap: 24 }}>
          <div className="card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Create Banner</h2>
            <div style={{ display: "grid", gap: 12 }}>
              {/* NEW — media type toggle. Everything below reacts to this. */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${bannerMediaType === "image" ? "btn-accent" : "btn-outline"}`}
                  onClick={() => setBannerMediaType("image")}
                >
                  🖼️ Image banner
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${bannerMediaType === "video" ? "btn-accent" : "btn-outline"}`}
                  onClick={() => setBannerMediaType("video")}
                >
                  🎥 Video banner
                </button>
              </div>

              <div className="field">
                <label>Banner Title</label>
                <input
                  value={bannerTitle}
                  onChange={(e) => setBannerTitle(e.target.value)}
                  placeholder="e.g., Summer Sale 50% Off"
                  style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }}
                />
              </div>

              {bannerMediaType === "image" ? (
                <>
                  <div className="field">
                    <label>Image URL</label>
                    <input
                      value={bannerImageUrl}
                      onChange={(e) => setBannerImageUrl(e.target.value)}
                      placeholder="https://example.com/banner.jpg"
                      style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <label className="btn btn-outline" style={{ cursor: "pointer", width: "fit-content" }}>
                      {bannerUploading ? "Uploading Image..." : "📁 Add banner from device"}
                      <input type="file" accept="image/*" onChange={handleBannerFileUpload} disabled={bannerUploading} hidden />
                    </label>
                  </div>

                  {bannerImageUrl && (
                    <>
                      <div style={{
                        height: 150, overflow: "hidden", borderRadius: 10, border: "2px solid var(--line)", marginTop: 8,
                      }}>
                        <img
                          src={bannerImageUrl}
                          alt="Banner Preview"
                          style={{
                            width: "100%", height: "100%", objectFit: "cover",
                            objectPosition: `${bannerPosX}% ${bannerPosY}%`,
                          }}
                        />
                      </div>

                      {/* Position/crop adjustment sliders. The preview above
                          updates live as these move, using the exact same
                          objectPosition value that gets saved and later used
                          on the Home page banner. */}
                      <div style={{ display: "grid", gap: 10, padding: 12, background: "var(--surface-alt)", borderRadius: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)" }}>🎯 Adjust image position (crop focus)</div>
                        <div className="field">
                          <label style={{ fontSize: 12 }}>Horizontal position: {bannerPosX}%</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={bannerPosX}
                            onChange={(e) => setBannerPosX(Number(e.target.value))}
                            style={{ width: "100%" }}
                          />
                        </div>
                        <div className="field">
                          <label style={{ fontSize: 12 }}>Vertical position: {bannerPosY}%</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={bannerPosY}
                            onChange={(e) => setBannerPosY(Number(e.target.value))}
                            style={{ width: "100%" }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : (
                // NEW — video banner fields.
                <>
                  <div className="field">
                    <label>Video URL</label>
                    <input
                      value={bannerVideoUrl}
                      onChange={(e) => setBannerVideoUrl(e.target.value)}
                      placeholder="https://example.com/banner.mp4"
                      style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <label className="btn btn-outline" style={{ cursor: "pointer", width: "fit-content" }}>
                      {bannerVideoUploading ? "Uploading Video..." : "📁 Add banner video from device"}
                      <input type="file" accept="video/*" onChange={handleBannerVideoFileUpload} disabled={bannerVideoUploading} hidden />
                    </label>
                  </div>

                  {bannerVideoUrl && (
                    <div style={{
                      height: 150, overflow: "hidden", borderRadius: 10, border: "2px solid var(--line)", marginTop: 8, background: "#000",
                    }}>
                      <video
                        src={bannerVideoUrl}
                        muted
                        loop
                        autoPlay
                        playsInline
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                  )}
                  <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>
                    Tip: keep videos short (5–15s) and lightly compressed so they load fast on mobile data.
                  </p>
                </>
              )}

              <div className="field">
                <label>Link (optional)</label>
                <input
                  value={bannerLink}
                  onChange={(e) => setBannerLink(e.target.value)}
                  placeholder="/category/electronics or /"
                  style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                <input type="checkbox" checked={bannerActive} onChange={(e) => setBannerActive(e.target.checked)} />
                Show immediately on Home page top
              </label>
              <button
                className="btn btn-accent"
                onClick={handleCreateBanner}
                disabled={busy || bannerUploading || bannerVideoUploading}
              >
                {busy ? "Creating…" : bannerMediaType === "video" ? "🎥 Create Video Banner" : "🖼️ Create Banner"}
              </button>
            </div>
          </div>

          {banners.length > 0 && (
            <div className="card" style={{ padding: 22 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Active Banners ({banners.filter((b) => b.active).length})</h2>
              <div style={{ display: "grid", gap: 12 }}>
                {banners.map((b) => (
                  <div key={b.id} className="card" style={{ padding: 12 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", opacity: b.active ? 1 : 0.6 }}>
                      {/* NEW — video banners show a small looping muted
                          preview instead of an <img>. */}
                      {b.mediaType === "video" && b.videoUrl ? (
                        <video
                          src={b.videoUrl}
                          muted
                          loop
                          autoPlay
                          playsInline
                          style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 8, background: "#000" }}
                        />
                      ) : (
                        b.imageUrl && (
                          <img
                            src={b.imageUrl}
                            alt={b.title}
                            style={{
                              width: 80, height: 60, objectFit: "cover", borderRadius: 8,
                              objectPosition: b.objectPosition || "50% 50%",
                            }}
                          />
                        )
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{b.title}</div>
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            background: b.active ? "#e6f9f7" : "#f3f4f6",
                            color: b.active ? "var(--teal)" : "var(--ink-soft)",
                            borderRadius: 999, fontSize: 10, fontWeight: 800, padding: "4px 8px",
                          }}>
                            {b.active ? "LIVE" : "DRAFT"}
                          </span>
                          {/* NEW — media type badge */}
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            background: "#eef2f7", color: "var(--ink-soft)",
                            borderRadius: 999, fontSize: 10, fontWeight: 800, padding: "4px 8px",
                          }}>
                            {b.mediaType === "video" ? "🎥 VIDEO" : "🖼️ IMAGE"}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{b.link || "Home"}</div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleStartEditBanner(b)}
                        disabled={busy}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleToggleBanner(b.id, b.active)}
                        disabled={busy}
                      >
                        {b.active ? "👁️ Hide" : "👁️‍🗨️ Show"}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteBanner(b.id)} disabled={busy}>
                        🗑️
                      </button>
                    </div>

                    {/* NEW — inline edit panel for this existing banner, only
                        shown while this banner is the one being edited. Lets
                        the admin edit title/link, switch image<->video, and
                        replace the actual file. */}
                    {editingBannerId === b.id && (
                      <div style={{ marginTop: 12, display: "grid", gap: 10, padding: 12, background: "var(--surface-alt)", borderRadius: 10 }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            className={`btn btn-sm ${editMediaType === "image" ? "btn-accent" : "btn-outline"}`}
                            onClick={() => setEditMediaType("image")}
                          >
                            🖼️ Image
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm ${editMediaType === "video" ? "btn-accent" : "btn-outline"}`}
                            onClick={() => setEditMediaType("video")}
                          >
                            🎥 Video
                          </button>
                        </div>

                        <div className="field">
                          <label style={{ fontSize: 12 }}>Title</label>
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }}
                          />
                        </div>

                        {editMediaType === "image" ? (
                          <>
                            <div className="field">
                              <label style={{ fontSize: 12 }}>Image URL</label>
                              <input
                                value={editImageUrl}
                                onChange={(e) => setEditImageUrl(e.target.value)}
                                style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }}
                              />
                            </div>
                            <label className="btn btn-outline" style={{ cursor: "pointer", width: "fit-content" }}>
                              {editUploading ? "Uploading..." : "📁 Replace image from device"}
                              <input type="file" accept="image/*" onChange={handleEditImageFileUpload} disabled={editUploading} hidden />
                            </label>
                            {editImageUrl && (
                              <div style={{
                                height: 130, overflow: "hidden", borderRadius: 8, border: "1.5px solid var(--line)",
                              }}>
                                <img
                                  src={editImageUrl}
                                  alt={editTitle}
                                  style={{
                                    width: "100%", height: "100%", objectFit: "cover",
                                    objectPosition: `${editPosX}% ${editPosY}%`,
                                  }}
                                />
                              </div>
                            )}
                            <div className="field">
                              <label style={{ fontSize: 12 }}>Horizontal position: {editPosX}%</label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={editPosX}
                                onChange={(e) => setEditPosX(Number(e.target.value))}
                                style={{ width: "100%" }}
                              />
                            </div>
                            <div className="field">
                              <label style={{ fontSize: 12 }}>Vertical position: {editPosY}%</label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={editPosY}
                                onChange={(e) => setEditPosY(Number(e.target.value))}
                                style={{ width: "100%" }}
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="field">
                              <label style={{ fontSize: 12 }}>Video URL</label>
                              <input
                                value={editVideoUrl}
                                onChange={(e) => setEditVideoUrl(e.target.value)}
                                style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }}
                              />
                            </div>
                            <label className="btn btn-outline" style={{ cursor: "pointer", width: "fit-content" }}>
                              {editUploading ? "Uploading..." : "📁 Replace video from device"}
                              <input type="file" accept="video/*" onChange={handleEditVideoFileUpload} disabled={editUploading} hidden />
                            </label>
                            {editVideoUrl && (
                              <div style={{
                                height: 130, overflow: "hidden", borderRadius: 8, border: "1.5px solid var(--line)", background: "#000",
                              }}>
                                <video
                                  src={editVideoUrl}
                                  muted
                                  loop
                                  autoPlay
                                  playsInline
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              </div>
                            )}
                          </>
                        )}

                        <div className="field">
                          <label style={{ fontSize: 12 }}>Link</label>
                          <input
                            value={editLink}
                            onChange={(e) => setEditLink(e.target.value)}
                            style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)" }}
                          />
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn btn-accent btn-sm" onClick={() => handleSaveBannerEdit(b.id)} disabled={busy || editUploading}>
                            {busy ? "Saving…" : "💾 Save changes"}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditingBannerId(null)} disabled={busy}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ALERTS */}
      {error && <div style={{ background: "#ffe6e6", color: "var(--danger)", padding: 14, borderRadius: 10, marginTop: 16 }}>❌ {error}</div>}
      {success && <div style={{ background: "#e6f9f7", color: "var(--teal)", padding: 14, borderRadius: 10, marginTop: 16 }}>✅ {success}</div>}
    </div>
  );
}