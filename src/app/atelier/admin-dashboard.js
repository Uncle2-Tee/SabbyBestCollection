"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import NotificationsIcon from "@mui/icons-material/NotificationsNone";
import RefreshIcon from "@mui/icons-material/Refresh";
import LockResetIcon from "@mui/icons-material/LockReset";
import CloseIcon from "@mui/icons-material/Close";
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined";
import { defaultProductCaution, defaultProductUsage, productCategories } from "../../lib/catalog";
import { notifyCustomerOrderUpdate } from "../../lib/customer-order-updates";

const money = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", minimumFractionDigits: 2 });
const emptyForm = { name: "", category: "Serums", price: "", size: "", image: "", description: "", cardDescription: "", howToUse: defaultProductUsage, caution: defaultProductCaution };
const orderStatuses = ["awaiting_payment", "payment_review", "processing", "shipped", "delivered", "cancelled"];

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

export default function AdminDashboard({ username }) {
  const greeting = useSyncExternalStore(subscribeToTimeGreeting, timeBasedGreeting, getServerGreeting);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [priceDrafts, setPriceDrafts] = useState({});
  const [featuredDescription, setFeaturedDescription] = useState("");
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
        setFeaturedDescription(saved[0]?.cardDescription ?? saved[0]?.description ?? "");
        setDatabaseReady(true);
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
    const description = form.description.trim() || "A considered beauty essential, made for your daily ritual.";
    const product = { id: `${Date.now()}-${form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: form.name.trim(), category: form.category, price: Number(form.price), size: form.size.trim() || "50 ml", image: form.image, description, cardDescription: form.cardDescription.trim() || description, howToUse: form.howToUse.trim() || defaultProductUsage, caution: form.caution.trim() || defaultProductCaution, badge: "Just added" };
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
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) { setMessage("Image file must be smaller than 5 MB."); return; }
    if (!file.type.startsWith("image/")) { setMessage("File must be an image."); return; }
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { url } = await readApiResponse(await fetch("/api/admin/upload-image", { method: "POST", body: formData }));
      setForm({ ...form, image: url });
      setMessage(`${file.name} uploaded.`);
    } catch (error) { setMessage(error.message); }
    finally { setUploadingImage(false); }
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

  async function saveFeaturedDescription() {
    const featuredId = products[0]?.id;
    if (!featuredId) return;
    try {
      const { product: saved } = await readApiResponse(await fetch("/api/admin/products", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: featuredId, cardDescription: featuredDescription }) }));
      setProducts((current) => current.map((product) => product.id === featuredId ? saved : product));
      setMessage("Featured description updated.");
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
    router.replace("/atelier");
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
    <header className="dashboard-header"><div className="atelier-brand brand-mark" aria-label="SabbyBestCollection"><span className="brand-word">Sabby</span><span className="brand-tradings">BestCollection</span></div><div className="dashboard-header-actions"><span className="secure-status">● Signed in as {username}</span><button type="button" className="dashboard-password-toggle" onClick={togglePasswordPanel} aria-expanded={passwordPanelOpen} aria-controls="admin-password-panel"><LockResetIcon fontSize="small" aria-hidden="true" />Change password</button><button onClick={signOut}>Sign out</button></div></header>
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
            <span className="admin-password-input"><input id="admin-new-password" type={showNewPassword ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="e.g. a unique 12+ character phrase" minLength={12} maxLength={128} required /><button type="button" className="admin-password-visibility" onClick={() => setShowNewPassword((visible) => !visible)} aria-label={showNewPassword ? "Hide new password" : "Show new password"} aria-pressed={showNewPassword}>{showNewPassword ? <VisibilityOffIcon aria-hidden="true" /> : <VisibilityIcon aria-hidden="true" />}</button></span>
          </div>
          <div className="admin-password-field">
            <label htmlFor="admin-confirm-password">Confirm new password</label>
            <span className="admin-password-input"><input id="admin-confirm-password" type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="Re-enter your new password" minLength={12} maxLength={128} required /><button type="button" className="admin-password-visibility" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirmPassword}>{showConfirmPassword ? <VisibilityOffIcon aria-hidden="true" /> : <VisibilityIcon aria-hidden="true" />}</button></span>
          </div>
        </div>
        {passwordFeedback && <p className={`admin-password-feedback ${passwordFeedback.type}`} role={passwordFeedback.type === "error" ? "alert" : "status"}>{passwordFeedback.message}</p>}
        <div className="admin-password-actions"><p>Use 12 to 128 characters. Other admin sessions will be signed out.</p><button type="submit" disabled={passwordSaving}><LockResetIcon fontSize="small" aria-hidden="true" />{passwordSaving ? "Updating…" : "Update password"}</button></div>
      </form>
    </section>}
    <section className="dashboard-heading"><p className="atelier-kicker">Store administration</p><h1>{greeting}</h1><p>Keep your collection polished, current, and ready to shop.</p></section>
    {message && !databaseReady && <p className="database-warning" role="alert">{message} Check DATABASE_URL in your environment and run `npx prisma db push` if the schema has not been applied.</p>}
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
    <section className="dashboard-grid">
      <form className="catalog-form" onSubmit={addProduct}>
        <div className="panel-heading"><div><p className="atelier-kicker">New listing</p><h2>Add a product</h2></div></div>
        <label>Product name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Dew Ritual Essence" /></label>
        <div className="field-row"><label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{productCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Price (GHS)<input required min="0.01" step="0.01" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="36.00" /></label></div>
        <div className="field-row"><label>Size<input value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value })} placeholder="50 ml" /></label><label>Product Image<input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} />{form.image && <span className="upload-status" style={{ fontSize: "0.85em", color: "#666", marginTop: "0.25em", display: "block" }}>✓ Image ready</span>}</label></div>
        <label>Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="A short, inviting description." /></label>
        <label>Home card description<textarea value={form.cardDescription} onChange={(event) => setForm({ ...form, cardDescription: event.target.value })} placeholder="Short copy displayed over the featured product." /></label>
        <label>How to use<textarea value={form.howToUse} onChange={(event) => setForm({ ...form, howToUse: event.target.value })} rows={3} /></label>
        <label>Caution<textarea value={form.caution} onChange={(event) => setForm({ ...form, caution: event.target.value })} rows={3} /></label>
        <button className="publish-button" type="submit" disabled={!databaseReady}>Publish product <span>→</span></button>
      </form>
      <section className="catalog-panel">
        <div className="panel-heading"><div><p className="atelier-kicker">Live catalogue</p><h2>Products</h2></div><span className="product-count">{databaseReady ? `${products.length} live` : "Database unavailable"}</span></div>
        {products[0] && <div className="featured-copy-editor"><label htmlFor="featured-description">Home card description for {products[0].name}</label><textarea id="featured-description" value={featuredDescription} onChange={(event) => setFeaturedDescription(event.target.value)} /><button type="button" onClick={saveFeaturedDescription}>Save description</button></div>}
        <div className="catalog-list">{products.map((product) => <article key={product.id} className="catalog-item">
          <span className="catalog-image" style={{ backgroundImage: `url(${product.image})` }} />
          <div className="catalog-item-details"><h3>{product.name}</h3><p>{product.category} <i>·</i> {product.size}</p></div>
          <div className="catalog-price-editor"><label htmlFor={`price-${product.id}`}>Price (GHS)</label><div><input id={`price-${product.id}`} aria-label={`Price for ${product.name} in Ghana cedis`} type="number" min="0.01" step="0.01" required value={priceDrafts[product.id] ?? String(product.price)} onChange={(event) => setPriceDrafts((current) => ({ ...current, [product.id]: event.target.value }))} /><button type="button" onClick={() => savePrice(product)}>Save price</button></div></div>
          <button className="catalog-remove-button" type="button" onClick={() => deleteProduct(product)} aria-label={`Remove ${product.name}`}>Remove</button>
        </article>)}</div>
      </section>
    </section>
    {message && databaseReady && <div className="admin-toast" role="status">✓ {message}</div>}
  </main>;
}
