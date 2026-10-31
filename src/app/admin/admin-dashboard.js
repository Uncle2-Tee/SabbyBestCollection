"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import NotificationsIcon from "@mui/icons-material/NotificationsNone";
import RefreshIcon from "@mui/icons-material/Refresh";
import LockResetIcon from "@mui/icons-material/LockReset";
import CloseIcon from "@mui/icons-material/Close";
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined";
import { defaultProductCaution, defaultProductUsage, productCategories } from "../../lib/catalog";
import { notifyCustomerOrderUpdate } from "../../lib/customer-order-updates";
import { defaultHomepageImages } from "../../lib/homepage-images";

const money = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", minimumFractionDigits: 2 });
const emptyForm = { name: "", category: "Dresses", price: "", size: "", image: "", description: "", howToUse: defaultProductUsage, caution: defaultProductCaution };
const orderStatuses = ["awaiting_payment", "payment_review", "processing", "shipped", "delivered", "cancelled"];
const homepageImageFields = [
  { key: "heroEditorial", label: "Hero background", description: "Fills the home-page hero behind the text and supporting images." },
  { key: "heroLookbook", label: "Lookbook overlay", description: "The tilted supporting image positioned on the left." },
  { key: "heroDetail", label: "Detail overlay", description: "The tilted supporting image positioned on the right." },
];

function timeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 17) return "Good afternoon.";
  return "Good evening.";
}

function subscribeToTimeGreeting(onChange) {
  const interval = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(interval);
}

function getNotificationPermission() {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function getServerNotificationPermission() {
  return "unsupported";
}

function subscribeToNotificationPermission(onChange) {
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("notificationpermissionchange", onChange);
  return () => {
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("notificationpermissionchange", onChange);
  };
}

function getServerGreeting() {
  return "Welcome admin.";
}

async function readApiResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The request could not be completed.");
  return body;
}

async function uploadImageFile(file) {
  if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error("Image file must be smaller than 5 MB.");
  if (!file.type.startsWith("image/")) throw new Error("File must be an image.");
  const formData = new FormData();
  formData.append("file", file);
  const { url } = await readApiResponse(await fetch("/api/admin/upload-image", { method: "POST", body: formData }));
  return url;
}

export default function AdminDashboard({ username }) {
  const greeting = useSyncExternalStore(subscribeToTimeGreeting, timeBasedGreeting, getServerGreeting);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [nameDrafts, setNameDrafts] = useState({});
  const [priceDrafts, setPriceDrafts] = useState({});
  const [homepageImages, setHomepageImages] = useState(defaultHomepageImages);
  const [homepageImagesSaving, setHomepageImagesSaving] = useState(false);
  const [homepageImageUploading, setHomepageImageUploading] = useState("");
  const [message, setMessage] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState("");
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [orderMessage, setOrderMessage] = useState("");
  const [newOrders, setNewOrders] = useState([]);
  const notificationPermission = useSyncExternalStore(
    subscribeToNotificationPermission,
    getNotificationPermission,
    getServerNotificationPermission,
  );
  const [refreshOrdersKey, setRefreshOrdersKey] = useState(0);
  const [passwordPanelOpen, setPasswordPanelOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState(null);
  const knownOrderIds = useRef(new Set());
  const initialOrdersLoaded = useRef(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/products")
      .then(readApiResponse)
      .then(({ products: saved }) => {
        if (cancelled) return;
        setProducts(saved);
        setDatabaseReady(true);
      })
      .catch((error) => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/homepage")
      .then(readApiResponse)
      .then(({ images }) => {
        if (!cancelled) setHomepageImages(images);
      })
      .catch((error) => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let requestInFlight = false;
    async function loadOrders() {
      if (requestInFlight) return;
      requestInFlight = true;
      setOrdersLoading((loading) => loading || !initialOrdersLoaded.current);
      try {
        const { orders: savedOrders } = await readApiResponse(await fetch("/api/admin/orders", { cache: "no-store" }));
        if (cancelled) return;
        const existingIds = knownOrderIds.current;
        if (initialOrdersLoaded.current) {
          const arrived = savedOrders.filter((order) => !existingIds.has(order.id));
          if (arrived.length) {
            setNewOrders((current) => [...arrived.filter((order) => !current.some((item) => item.id === order.id)), ...current]);
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(arrived.length === 1 ? "New customer order" : `${arrived.length} new customer orders`, {
                body: arrived.slice(0, 3).map((order) => `${order.customer_name} · ${money.format(Number(order.total))}`).join("\n"),
                tag: "sabbybestcollection-new-orders",
              });
            }
          }
        }
        knownOrderIds.current = new Set(savedOrders.map((order) => order.id));
        initialOrdersLoaded.current = true;
        setOrders(savedOrders);
        setOrdersError("");
      } catch (error) {
        if (!cancelled) setOrdersError(error.message || "Could not load orders.");
      } finally {
        requestInFlight = false;
        if (!cancelled) setOrdersLoading(false);
      }
    }
    void loadOrders();
    const interval = window.setInterval(loadOrders, 30_000);
    const onFocus = () => { void loadOrders(); };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshOrdersKey]);

  useEffect(() => {
    if (!orderMessage) return undefined;
    const timer = window.setTimeout(() => setOrderMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [orderMessage]);

  useEffect(() => {
    if (!message || !databaseReady) return;
    const timer = window.setTimeout(() => setMessage(""), 2800);
    return () => window.clearTimeout(timer);
  }, [message, databaseReady]);

  async function addProduct(event) {
    event.preventDefault();
    if (uploadingImage) return;
    if (!databaseReady) return;
    if (!form.image) { setMessage("Upload a product image."); return; }
    const description = form.description.trim() || "A thoughtfully selected piece for everyday style and living.";
    const product = { id: `${Date.now()}-${form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: form.name.trim(), category: form.category, price: Number(form.price), size: form.size.trim() || "One size", image: form.image, description, cardDescription: description, howToUse: form.howToUse.trim() || defaultProductUsage, caution: form.caution.trim() || defaultProductCaution, badge: "Just added" };
    try {
      const { product: saved } = await readApiResponse(await fetch("/api/admin/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product }) }));
      setProducts((current) => [saved, ...current]);
      setForm(emptyForm);
      setMessage(`${saved.name} has been published.`);
    } catch (error) { setMessage(error.message); }
  }

  async function handleImageUpload(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (uploadingImage) return;
    setUploadingImage(true);
    try {
      const url = await uploadImageFile(file);
      setForm({ ...form, image: url });
      setMessage(`${file.name} uploaded.`);
    } catch (error) { setMessage(error.message); }
    finally { setUploadingImage(false); }
  }

  async function handleHomepageImageUpload(key, event) {
    const file = event.currentTarget.files?.[0];
    const input = event.currentTarget;
    if (!file || homepageImageUploading) return;
    setHomepageImageUploading(key);
    try {
      const url = await uploadImageFile(file);
      setHomepageImages((current) => ({ ...current, [key]: url }));
      setMessage(`${file.name} uploaded. Save homepage images to publish it.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      input.value = "";
      setHomepageImageUploading("");
    }
  }

  async function saveHomepageImages() {
    setHomepageImagesSaving(true);
    try {
      const { images } = await readApiResponse(await fetch("/api/admin/homepage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: homepageImages }),
      }));
      setHomepageImages(images);
      setMessage("Homepage images updated.");
    } catch (error) {
      setMessage(error.message || "Could not save homepage images.");
    } finally {
      setHomepageImagesSaving(false);
    }
  }

  async function deleteProduct(product) {
    try {
      await readApiResponse(await fetch(`/api/admin/products?id=${encodeURIComponent(product.id)}`, { method: "DELETE" }));
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setMessage(`${product.name} has been removed.`);
    } catch (error) { setMessage(error.message); }
  }

  async function savePrice(product) {
    const value = priceDrafts[product.id];
    const price = Number(value);
    if (value === undefined || value.trim() === "" || !Number.isFinite(price) || price <= 0) {
      setMessage("Enter a valid price greater than zero.");
      return;
    }
    try {
      const { product: saved } = await readApiResponse(await fetch("/api/admin/products", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: product.id, price }) }));
      setProducts((current) => current.map((item) => item.id === product.id ? saved : item));
      setPriceDrafts((current) => { const next = { ...current }; delete next[product.id]; return next; });
      setMessage(`${product.name} price updated.`);
    } catch (error) { setMessage(error.message); }
  }

  async function saveProductName(product) {
    const name = (nameDrafts[product.id] ?? product.name).trim();
    if (!name) {
      setMessage("Enter a product name.");
      return;
    }
    if (name.length > 200) {
      setMessage("Product names must be 200 characters or fewer.");
      return;
    }
    try {
      const { product: saved } = await readApiResponse(await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id, name }),
      }));
      setProducts((current) => current.map((item) => item.id === product.id ? saved : item));
      setNameDrafts((current) => { const next = { ...current }; delete next[product.id]; return next; });
      setMessage(`${saved.name} name updated.`);
    } catch (error) { setMessage(error.message); }
  }

  async function enableOrderNotifications() {
    if (typeof Notification === "undefined") {
      setOrderMessage("Browser notifications are not supported here. New orders will still appear in this dashboard.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      window.dispatchEvent(new Event("notificationpermissionchange"));
      setOrderMessage(permission === "granted"
        ? "Browser notifications are enabled for new orders."
        : permission === "denied"
          ? "Notifications are blocked in your browser settings. New orders will still appear here."
          : "Notification permission was not granted. New orders will still appear here.");
    } catch (error) {
      console.error("Could not request browser notification permission:", error);
      window.dispatchEvent(new Event("notificationpermissionchange"));
      setOrderMessage("Could not enable browser notifications. New orders will still appear here.");
    }
  }

  async function updateOrderStatus(order, status) {
    const previousStatus = order.status;
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status } : item));
    try {
      const { order: savedOrder } = await readApiResponse(await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, status }),
      }));
      setOrders((current) => current.map((item) => item.id === savedOrder.id ? savedOrder : item));
      notifyCustomerOrderUpdate();
      setOrderMessage(`Order status updated to ${status.replaceAll("_", " ")}.`);
    } catch (error) {
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: previousStatus } : item));
      setOrderMessage(error.message || "Could not update order status.");
    }
  }

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE" });
    router.replace("/admin");
    router.refresh();
  }

  function togglePasswordPanel() {
    const nextOpen = !passwordPanelOpen;
    setPasswordPanelOpen(nextOpen);
    setPasswordFeedback(null);
    if (!nextOpen) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    }
  }

  async function updateAdminPassword(event) {
    event.preventDefault();
    setPasswordFeedback(null);
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: "error", message: "The new passwords do not match." });
      return;
    }

    setPasswordSaving(true);
    try {
      await readApiResponse(await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      }));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setPasswordFeedback({ type: "success", message: "Password updated. Other admin sessions have been signed out." });
    } catch (error) {
      setPasswordFeedback({ type: "error", message: error.message || "Could not update the password." });
    } finally {
      setPasswordSaving(false);
    }
  }

  return <main className="dashboard-shell">
    <header className="dashboard-header"><div className="dashboard-brand-logo"><Image src="/sabby-best-collection-logo-transparent.png" alt="SabbyBestCollection" width={146} height={80} priority /></div><div className="dashboard-header-actions"><span className="secure-status">● Signed in as {username}</span><button type="button" className="dashboard-password-toggle" onClick={togglePasswordPanel} aria-expanded={passwordPanelOpen} aria-controls="admin-password-panel"><LockResetIcon fontSize="small" aria-hidden="true" />Change password</button><button onClick={signOut}>Sign out</button></div></header>
    {passwordPanelOpen && <section className="admin-password-panel" id="admin-password-panel" aria-labelledby="admin-password-heading">
      <div className="admin-password-panel-heading">
        <div><p className="atelier-kicker">Security</p><h2 id="admin-password-heading">Change password</h2></div>
        <button type="button" className="admin-password-close" onClick={togglePasswordPanel} aria-label="Close change password form"><CloseIcon fontSize="small" /></button>
      </div>
      <form className="admin-password-form" onSubmit={updateAdminPassword}>
        <div className="admin-password-fields">
          <div className="admin-password-field">
            <label htmlFor="admin-current-password">Current password</label>
            <span className="admin-password-input"><input id="admin-current-password" type={showCurrentPassword ? "text" : "password"} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your current password" required /><button type="button" className="admin-password-visibility" onClick={() => setShowCurrentPassword((visible) => !visible)} aria-label={showCurrentPassword ? "Hide current password" : "Show current password"} aria-pressed={showCurrentPassword}>{showCurrentPassword ? <VisibilityOffIcon aria-hidden="true" /> : <VisibilityIcon aria-hidden="true" />}</button></span>
          </div>
          <div className="admin-password-field">
            <label htmlFor="admin-new-password">New password</label>
            <span className="admin-password-input"><input id="admin-new-password" type={showNewPassword ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="At least 8 characters" minLength={8} maxLength={128} required /><button type="button" className="admin-password-visibility" onClick={() => setShowNewPassword((visible) => !visible)} aria-label={showNewPassword ? "Hide new password" : "Show new password"} aria-pressed={showNewPassword}>{showNewPassword ? <VisibilityOffIcon aria-hidden="true" /> : <VisibilityIcon aria-hidden="true" />}</button></span>
          </div>
          <div className="admin-password-field">
            <label htmlFor="admin-confirm-password">Confirm new password</label>
            <span className="admin-password-input"><input id="admin-confirm-password" type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="Re-enter your new password" minLength={8} maxLength={128} required /><button type="button" className="admin-password-visibility" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirmPassword}>{showConfirmPassword ? <VisibilityOffIcon aria-hidden="true" /> : <VisibilityIcon aria-hidden="true" />}</button></span>
          </div>
        </div>
        {passwordFeedback && <p className={`admin-password-feedback ${passwordFeedback.type}`} role={passwordFeedback.type === "error" ? "alert" : "status"}>{passwordFeedback.message}</p>}
        <div className="admin-password-actions"><p>Use 8 to 128 characters. Other admin sessions will be signed out.</p><button type="submit" disabled={passwordSaving}><LockResetIcon fontSize="small" aria-hidden="true" />{passwordSaving ? "Updating…" : "Update password"}</button></div>
      </form>
    </section>}
    <section className="dashboard-heading"><p className="atelier-kicker">Store administration</p><h1>{greeting}</h1><p>Keep your collection polished, current, and ready to shop.</p></section>
    {message && !databaseReady && <p className="database-warning" role="alert">{message} Check DATABASE_URL in your environment and run `npx prisma db push` if the schema has not been applied.</p>}
    <section className="dashboard-overview-grid" aria-label="Storefront images and customer activity">
      <section className="homepage-images-panel" aria-labelledby="homepage-images-heading">
        <div className="homepage-images-summary">
          <span><span className="atelier-kicker">Storefront</span><strong id="homepage-images-heading">Home page images</strong></span>
          <span className="homepage-images-summary-note">Manage hero photos</span>
        </div>
        <div className="homepage-images-content">
          <p className="homepage-images-description">Choose the full-bleed hero background and two supporting overlay images. Changes appear on the storefront after you save.</p>
          <div className="homepage-image-grid">{homepageImageFields.map(({ key, label, description }) => (
            <div className="homepage-image-card" key={key}>
              <div className="homepage-image-preview" role="img" aria-label={`${label} preview`} style={{ backgroundImage: `url("${homepageImages[key]}")` }} />
              <div className="homepage-image-details"><strong>{label}</strong><span>{description}</span></div>
              <label className="homepage-image-upload">Choose image<input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" onChange={(event) => handleHomepageImageUpload(key, event)} disabled={!databaseReady || Boolean(homepageImageUploading)} /></label>
            </div>
          ))}</div>
          <button className="homepage-images-save" type="button" onClick={saveHomepageImages} disabled={!databaseReady || homepageImagesSaving || Boolean(homepageImageUploading)}>{homepageImagesSaving ? "Saving…" : "Save home page images"}</button>
        </div>
      </section>
      <section className="orders-panel" aria-labelledby="orders-heading">
      <div className="orders-panel-heading">
        <div><p className="atelier-kicker">Customer activity</p><h2 id="orders-heading">Orders <span className="orders-count">{orders.length}</span></h2><p>New orders are checked every 30 seconds while the dashboard is open.</p></div>
        <div className="orders-toolbar">
          <button type="button" className="admin-refresh-button" onClick={() => setRefreshOrdersKey((key) => key + 1)} disabled={ordersLoading} aria-label="Refresh orders"><RefreshIcon fontSize="small" /> Refresh</button>
          {notificationPermission === "granted"
            ? <span className="notification-enabled"><NotificationsIcon fontSize="small" /> Alerts enabled</span>
            : <button type="button" className="admin-notification-button" onClick={enableOrderNotifications} disabled={notificationPermission === "unsupported"}><NotificationsIcon fontSize="small" /> Enable alerts</button>}
        </div>
      </div>
      {newOrders.length > 0 && <div className="new-orders-alert" role="status"><div><strong>{newOrders.length === 1 ? "New order received" : `${newOrders.length} new orders received`}</strong><span>{newOrders[0].customer_name} · {money.format(Number(newOrders[0].total))}</span></div><button type="button" onClick={() => setNewOrders([])}>Mark as seen</button></div>}
      {orderMessage && <p className="orders-message" role="status">{orderMessage}</p>}
      {ordersError && <p className="database-warning orders-error" role="alert">{ordersError}</p>}
      {ordersLoading && orders.length === 0 && <p className="orders-empty">Loading orders…</p>}
      {!ordersLoading && !ordersError && orders.length === 0 && <p className="orders-empty">No orders yet. New customer orders will appear here automatically.</p>}
      {orders.length > 0 && <div className="admin-orders-list">{orders.map((order) => (
        <article className="admin-order-card" key={order.id}>
          <div className="admin-order-top"><div><p className="admin-order-number">Order #{order.id.slice(0, 8).toUpperCase()}</p><time dateTime={order.created_at}>{new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.created_at))}</time></div><strong className={`admin-order-status status-${order.status}`}>{order.status.replaceAll("_", " ")}</strong></div>
          <div className="admin-order-customer"><strong>{order.customer_name}</strong>{order.customer_email && <a href={`mailto:${order.customer_email}`}>{order.customer_email}</a>}<a href={`tel:${order.phone}`}>{order.phone}</a></div>
          <ul className="admin-order-items">{(Array.isArray(order.items) ? order.items : []).map((item, index) => <li key={`${order.id}-${item.product_id || item.name}-${index}`}><span>{item.name} × {item.quantity}</span><strong>{money.format(Number(item.line_total ?? Number(item.price) * Number(item.quantity)))}</strong></li>)}</ul>
          <div className="admin-order-bottom"><div><span>Delivery address & city / town</span><p>{order.shipping_address}</p><small>Payment: Mobile Money · {money.format(Number(order.total))}</small></div><label>Status<select aria-label={`Update status for order ${order.id.slice(0, 8)}`} value={order.status} onChange={(event) => updateOrderStatus(order, event.target.value)}>{orderStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label></div>
        </article>
      ))}</div>}
      </section>
    </section>
    <section className="dashboard-grid">
      <form className="catalog-form" onSubmit={addProduct}>
        <details className="listing-dropdown">
          <summary className="listing-dropdown-summary">
            <span><span className="atelier-kicker">New listing</span><strong>Add a product</strong></span>
            <span className="listing-dropdown-note">Create a catalogue listing</span>
          </summary>
          <div className="listing-dropdown-content">
            <label>Product name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Dew Ritual Essence" /></label>
            <div className="field-row"><label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{productCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Price (GHS)<input required min="0.01" step="0.01" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="36.00" /></label></div>
            <div className="field-row"><label>Size<input value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value })} placeholder="One size" /></label><label>Product Image<input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} />{form.image && <span className="upload-status" style={{ fontSize: "0.85em", color: "#666", marginTop: "0.25em", display: "block" }}>✓ Image ready</span>}</label></div>
            <label>Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="A short, inviting description." /></label>
            <label>How to use<textarea value={form.howToUse} onChange={(event) => setForm({ ...form, howToUse: event.target.value })} rows={3} /></label>
            <label>Caution<textarea value={form.caution} onChange={(event) => setForm({ ...form, caution: event.target.value })} rows={3} /></label>
            <button className="publish-button" type="submit" disabled={!databaseReady}>Publish product <span>→</span></button>
          </div>
        </details>
      </form>
      <section className="catalog-panel">
        <div className="panel-heading"><div><p className="atelier-kicker">Live catalogue</p><h2>Products</h2></div><span className="product-count">{databaseReady ? `${products.length} live` : "Database unavailable"}</span></div>
        <details className="catalog-dropdown">
          <summary><span>Browse and manage products</span><span className="catalog-dropdown-count">{products.length}</span></summary>
          <div className="catalog-list">{products.map((product) => <article key={product.id} className="catalog-item">
            <div className="catalog-item-overview">
              <span className="catalog-image" style={{ backgroundImage: `url(${product.image})` }} />
              <div className="catalog-item-details"><h3>{product.name}</h3><p>{product.category} <i>·</i> {product.size}</p></div>
              <button className="catalog-remove-button" type="button" onClick={() => deleteProduct(product)} aria-label={`Remove ${product.name}`}>Remove</button>
            </div>
            <div className="catalog-editors">
              <div className="catalog-name-editor"><label htmlFor={`name-${product.id}`}>Product name</label><div><input id={`name-${product.id}`} aria-label={`Name for ${product.name}`} maxLength={200} value={nameDrafts[product.id] ?? product.name} onChange={(event) => setNameDrafts((current) => ({ ...current, [product.id]: event.target.value }))} /><button type="button" onClick={() => saveProductName(product)}>Save name</button></div></div>
              <div className="catalog-price-editor"><label htmlFor={`price-${product.id}`}>Price (GHS)</label><div><input id={`price-${product.id}`} aria-label={`Price for ${product.name} in Ghana cedis`} type="number" min="0.01" step="0.01" required value={priceDrafts[product.id] ?? String(product.price)} onChange={(event) => setPriceDrafts((current) => ({ ...current, [product.id]: event.target.value }))} /><button type="button" onClick={() => savePrice(product)}>Save price</button></div></div>
            </div>
          </article>)}</div>
        </details>
      </section>
    </section>
    {message && databaseReady && <div className="admin-toast" role="status">✓ {message}</div>}
  </main>;
}
