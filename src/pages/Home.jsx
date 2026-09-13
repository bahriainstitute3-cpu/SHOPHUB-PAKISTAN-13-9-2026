import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProducts } from "../lib/products";
import { listCategories } from "../lib/categories";
import { listBanners } from "../lib/banners";
import ProductCard from "../components/ProductCard";
import CategoryIcon, { resolveCategoryIcon } from "../components/CategoryIcon";

export default function Home() {
  const [categories, setCategories] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [newArrivals, setNewArrivals] = useState([]);
  const [banners, setBanners] = useState([]);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Auto-advance the banner carousel every 4 seconds (loops back to the start).
  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setBannerIndex((i) => (i + 1) % banners.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [banners.length]);

  async function loadHomeData() {
    try {
      const [feat, latest] = await Promise.all([
        listProducts({ featured: true, max: 100 }),
        listProducts({ max: 900}),
      ]);
      setFeatured(feat);
      setNewArrivals(latest);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }

    try {
      const [cats, homeBanners] = await Promise.all([listCategories(), listBanners()]);
      setCategories(cats.filter((c) => c.active));
      setBanners(homeBanners.filter((b) => b.active));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadHomeData();

    const onBannersChange = () => {
      loadHomeData();
    };

    window.addEventListener("bannerschange", onBannersChange);
    return () => window.removeEventListener("bannerschange", onBannersChange);
  }, []);

  return (
    <div>
      {banners.length > 0 && (
        <div className="container" style={{ paddingTop: 28 }}>
          <div style={{ position: "relative" }}>
            <div
              className="card"
              style={{
                overflow: "hidden",
                background: "var(--panel, #f5f5f5)", // letterbox area ka background (jab image full na fit ho)
                aspectRatio: "2.35 / 1", // banner hamesha 2.35:1 hi rahega, chahe image ka ratio kuch bhi ho
                maxHeight: 410,          // banner ka size chota rakhne ke liye
                width: "100%",
              }}
            >
              {/* NEW — banners can now be either an image or a video.
                  Video banners autoplay muted + loop + playsInline so they
                  play inline (no fullscreen takeover) and autoplay on both
                  desktop browsers and mobile (iOS Safari requires muted +
                  playsInline for autoplay to work at all). The same
                  "home-banner-img" class is reused for the video so it gets
                  the exact same responsive height rules (including the
                  640px mobile breakpoint) as the image banner. */}
              {banners[bannerIndex % banners.length].mediaType === "video" &&
              banners[bannerIndex % banners.length].videoUrl ? (
                <video
                  key={banners[bannerIndex % banners.length].id}
                  src={banners[bannerIndex % banners.length].videoUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="home-banner-img"
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "block",
                    objectFit: "cover",
                    objectPosition: banners[bannerIndex % banners.length].objectPosition || "50% 50%",
                  }}
                />
              ) : (
                <img
                  key={banners[bannerIndex % banners.length].id}
                  src={banners[bannerIndex % banners.length].imageUrl}
                  alt={banners[bannerIndex % banners.length].title || "Special offer"}
                  loading="lazy"
                  decoding="async"
                  className="home-banner-img"
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "block",
                    objectFit: "cover", // Daraz jaisa -> puri width fill, koi empty space nahi
                    // Respects the crop/position chosen in Settings for this
                    // banner (defaults to dead-center for banners that
                    // haven't had a position set).
                    objectPosition: banners[bannerIndex % banners.length].objectPosition || "50% 50%",
                  }}
                />
              )}
            </div>
            {banners.length > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
                {banners.map((b, i) => (
                  <button
                    key={b.id}
                    type="button"
                    aria-label={`Go to banner ${i + 1}`}
                    onClick={() => setBannerIndex(i)}
                    style={{
                      width: i === bannerIndex % banners.length ? 20 : 8, height: 8, borderRadius: 999,
                      border: "none", padding: 0, cursor: "pointer",
                      background: i === bannerIndex % banners.length ? "var(--teal)" : "var(--line)",
                      transition: "width 0.2s ease",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="container" style={{ padding: "40px 20px" }}>
        {error && <p className="error-text">{error}</p>}


        <section style={{ marginBottom: 44 }}>
          <span className="section-eyebrow">Shop by category</span>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
            gap: 14,
          }}>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 96, borderRadius: "var(--radius)" }} />
            ))}
            {!loading && categories.length === 0 && (
              <p style={{ color: "var(--ink-soft)" }}>No categories yet — add some from the admin panel.</p>
            )}
            {categories.map((c) => (
              <Link key={c.id} to={`/category/${c.id}`} className="card" style={{
                padding: "18px 10px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "var(--bg)", color: "var(--teal)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <CategoryIcon icon={resolveCategoryIcon(c)} size={24} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.name}</div>
              </Link>
            ))}
          </div>
        </section>

        {featured.length > 0 && (
          <section style={{ marginBottom: 44 }}>
            <span className="section-eyebrow">Featured products</span>
            <h2 style={{ fontSize: 22, marginBottom: 16 }}>Handpicked for you</h2>
            <div className="grid-products">
              {featured.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}

        <section>
          <span className="section-eyebrow">Just landed</span>
          <h2 style={{ fontSize: 22, marginBottom: 16 }}>New arrivals</h2>
          {loading && (
            <div className="grid-products">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton" style={{ aspectRatio: "5/1" }} />)}
            </div>
          )}
          {!loading && newArrivals.length === 0 && (
            <div className="empty-state">No products yet. Add your first product from the admin panel.</div>
          )}
          <div className="grid-products">
            {newArrivals.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      </div>
    </div>
  );
}