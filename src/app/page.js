"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import CreditCardIcon from "@mui/icons-material/CreditCardOutlined";
import FavoriteIcon from "@mui/icons-material/FavoriteBorder";
import FavoriteRoundedIcon from "@mui/icons-material/Favorite";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import HelpIcon from "@mui/icons-material/HelpOutlineOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LocationIcon from "@mui/icons-material/LocationOnOutlined";
import LogoutIcon from "@mui/icons-material/LogoutOutlined";
import NotificationsIcon from "@mui/icons-material/NotificationsNone";
import PersonIcon from "@mui/icons-material/PersonOutlineOutlined";
import ReceiptIcon from "@mui/icons-material/ReceiptLongOutlined";
import RemoveIcon from "@mui/icons-material/Remove";
import ReplayIcon from "@mui/icons-material/ReplayOutlined";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/SettingsOutlined";
import ShieldIcon from "@mui/icons-material/VerifiedUserOutlined";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBagOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import StarIcon from "@mui/icons-material/StarRounded";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import Image from "next/image";
import { defaultProductCaution, defaultProductUsage, initialProducts, productCategories } from "../lib/catalog";
import { defaultHomepageImages } from "../lib/homepage-images";
import CustomerAccount from "./components/customer-account";
import { publishCustomerSession, subscribeToCustomerSession } from "../lib/customer-session";

const categories = ["All", ...productCategories];
const money = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", minimumFractionDigits: 2 });
const accountSections = [
  { id: "profile", label: "My Profile", icon: "user" },
  { id: "orders", label: "My Orders", icon: "orders" },
  { id: "wishlist", label: "Wishlist", icon: "heart" },
  { id: "cart", label: "Cart", icon: "bag" },
  { id: "addresses", label: "Delivery Addresses", icon: "location" },
  { id: "payments", label: "Payment Methods", icon: "payment" },
  { id: "returns", label: "Returns & Refunds", icon: "returns" },
  { id: "notifications", label: "Notifications", icon: "bell" },
  { id: "settings", label: "Settings", icon: "settings" },
  { id: "support", label: "Help & Support", icon: "help" },
  { id: "logout", label: "Logout", icon: "logout" },
];
const iconComponents = { bag: ShoppingBagIcon, search: SearchIcon, shop: StorefrontOutlinedIcon, arrow: ArrowForwardIcon, close: CloseIcon, plus: AddIcon, minus: RemoveIcon, check: CheckIcon, shield: ShieldIcon, user: PersonIcon, home: HomeRoundedIcon, info: InfoOutlinedIcon, orders: ReceiptIcon, heart: FavoriteIcon, favorite: FavoriteRoundedIcon, star: StarIcon, location: LocationIcon, payment: CreditCardIcon, returns: ReplayIcon, bell: NotificationsIcon, settings: SettingsIcon, help: HelpIcon, logout: LogoutIcon };

function Icon({ name, size = 20 }) {
  const IconComponent = iconComponents[name] || HelpIcon;
  return <IconComponent sx={{ fontSize: size }} aria-hidden="true" focusable="false" />;
}

function ProductCard({ product, onAdd, onPreview, isWishlisted, onToggleWishlist }) {
  return <article className="product-card"><div className="product-card-visual"><button className="product-image" onClick={() => onPreview(product)} aria-label={`View ${product.name}`}><span className="product-photo" style={{ backgroundImage: `url(${product.image})` }} />{product.badge && <span className="product-badge">{product.badge}</span>}<span className="quick-add">Quick view <Icon name="arrow" size={15} /></span></button><button className={`wishlist-toggle${isWishlisted ? " active" : ""}`} onClick={() => onToggleWishlist(product)} aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`} aria-pressed={isWishlisted}><Icon name={isWishlisted ? "favorite" : "heart"} size={19} /></button></div><div className="product-info"><div><p className="eyebrow">{product.category}</p><h3>{product.name}</h3></div><p className="product-price">{money.format(product.price)}</p></div><button className="add-to-cart-button" onClick={() => onAdd(product)}>Add to cart <Icon name="plus" size={16} /></button></article>;
}

function AccountEmptyState({ title, message, action, onAction }) {
  return <div className="account-empty"><p className="eyebrow">Account</p><h2>{title}</h2><p>{message}</p>{action && <button className="account-text-action" onClick={onAction}>{action} <Icon name="arrow" size={15} /></button>}</div>;
}

function PaymentPage({ order, onClose }) {
  return <><button className="modal-backdrop" onClick={onClose} aria-label="Close payment page" /><section className="checkout-modal checkout-dialog payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title">
    <button className="icon-button close-modal" onClick={onClose} aria-label="Close payment page"><Icon name="close" /></button>
    <header className="checkout-heading"><p className="eyebrow">Order {order.id.slice(0, 8).toUpperCase()}</p><h2 id="payment-title">Complete payment</h2></header>
    <div className="payment-order-summary">
      <div className="checkout-summary-heading"><h3>Order summary</h3><span>{order.items.length} {order.items.length === 1 ? "item" : "items"}</span></div>
      <div className="checkout-summary-items">{order.items.map((item) => <article className="checkout-summary-item" key={item.product_id}><span className="checkout-summary-image" style={{ backgroundImage: `url(${item.image})` }} role="img" aria-label={item.name} /><div><h4>{item.name}</h4><p>Qty {item.quantity}</p></div><strong>{money.format(item.line_total)}</strong></article>)}</div>
      <div className="checkout-summary-totals"><p><span>Subtotal</span><b>{money.format(order.subtotal)}</b></p><p><span>Delivery</span><b>{order.shipping ? money.format(order.shipping) : "Complimentary"}</b></p><p className="checkout-summary-total"><span>Total to pay</span><b>{money.format(order.total)}</b></p></div>
    </div>
    <div className="payment-provider-card"><CreditCardIcon aria-hidden="true" /><div><strong>Paystack</strong><span>Secure payment, right here on our site</span></div><span className="payment-coming-soon">Coming soon</span></div>
    <p className="payment-pending-note" role="status">Your order is saved, but payment is not available yet. Paystack will be connected here; you will not be charged until then.</p>
    <button className="primary-button wide payment-submit" type="button" disabled>Pay {money.format(order.total)} with Paystack</button>
    <button className="account-text-action payment-orders-link" type="button" onClick={onClose}>View my orders <Icon name="arrow" size={15} /></button>
  </section></>;
}

function ProductGuideList({ content, numbered = false }) {
  const items = content.split("\n").map((item) => item.replace(/^\s*(?:\d+[.)]\s*|[•*-]\s*)/, "").trim()).filter(Boolean);
  const List = numbered ? "ol" : "ul";
  return <List>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</List>;
}

export default function Home() {
  const [products, setProducts] = useState(initialProducts);
  const [homepageImages, setHomepageImages] = useState(defaultHomepageImages);
  const [cart, setCart] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [catalogSearchOpen, setCatalogSearchOpen] = useState(false);
  const catalogSearchInput = useRef(null);
  const [isCartOpen, setCartOpen] = useState(false);
  const [activeView, setActiveView] = useState("home");
  const [activeAccountSection, setActiveAccountSection] = useState("orders");
  const [mobileAccountSectionOpen, setMobileAccountSectionOpen] = useState(false);
  const [customerSession, setCustomerSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [ordersVersion, setOrdersVersion] = useState(0);
  const [productDetail, setProductDetail] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutPendingAuth, setCheckoutPendingAuth] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [checkoutDetails, setCheckoutDetails] = useState({ customerName: null, phone: "", shippingAddress: "", city: "" });
  const [checkoutError, setCheckoutError] = useState("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [customerStoreOwnerId, setCustomerStoreOwnerId] = useState(null);
  const customerStoreOwnerRef = useRef(customerStoreOwnerId);
  const cartRef = useRef(cart);
  const wishlistRef = useRef(wishlist);
  const customerStoreSaveQueue = useRef(Promise.resolve());

  useEffect(() => {
    cartRef.current = cart;
    wishlistRef.current = wishlist;
    customerStoreOwnerRef.current = customerStoreOwnerId;
  }, [cart, wishlist, customerStoreOwnerId]);
  useEffect(() => {
    const readyTimer = window.setTimeout(() => setLoaded(true), 0);
    return () => window.clearTimeout(readyTimer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/homepage", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load homepage images.");
        if (!body.images || !Object.keys(defaultHomepageImages).every((key) => typeof body.images[key] === "string")) {
          throw new Error("The homepage image settings are invalid.");
        }
        if (!cancelled) setHomepageImages(body.images);
      })
      .catch((error) => {
        if (!cancelled) console.error("Could not load homepage images:", error);
      });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!loaded || !authChecked) return undefined;
    const userId = customerSession?.user?.id;
    if (!userId) {
      if (customerStoreOwnerRef.current) {
        setCart([]);
        setWishlist([]);
        setCustomerStoreOwnerId(null);
      }
      return undefined;
    }
    let cancelled = false;
    fetch("/api/customer/store", {
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load your saved cart and wishlist.");
        return body;
      })
      .then(({ cart: savedCart, wishlist: savedWishlist }) => {
        if (cancelled || !Array.isArray(savedCart) || !Array.isArray(savedWishlist)) return;
        const mergedCart = new Map(cartRef.current.map((item) => [item.id, item]));
        savedCart.forEach((item) => {
          const current = mergedCart.get(item.id);
          mergedCart.set(item.id, { ...current, ...item, quantity: Math.max(current?.quantity || 0, item.quantity) });
        });
        setCart([...mergedCart.values()]);
        setWishlist([...new Set([...wishlistRef.current, ...savedWishlist])]);
        setCustomerStoreOwnerId(userId);
      })
      .catch((error) => {
        if (!cancelled) setToast(error.message || "Could not load your saved cart and wishlist.");
      });
    return () => { cancelled = true; };
  }, [loaded, authChecked, customerSession]);
  useEffect(() => {
    const userId = customerSession?.user?.id;
    if (!loaded || !authChecked || !userId || customerStoreOwnerId !== userId) return undefined;
    const timer = window.setTimeout(() => {
      customerStoreSaveQueue.current = customerStoreSaveQueue.current
        .catch(() => {})
        .then(async () => {
          const response = await fetch("/api/customer/store", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              cart: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
              wishlist,
            }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || "Could not save your cart and wishlist.");
        })
        .catch((error) => setToast(error.message || "Could not save your cart and wishlist."));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [cart, wishlist, loaded, authChecked, customerSession, customerStoreOwnerId]);
  useEffect(() => {
    if (!mobileAccountSectionOpen || !window.matchMedia("(max-width: 760px)").matches) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileAccountSectionOpen]);
  useEffect(() => {
    if (!authChecked) return undefined;
    let cancelled = false;
    let requestInFlight = false;
    let reportedProductsError = false;
    async function refreshProducts() {
      if (cancelled || requestInFlight || document.visibilityState === "hidden") return;
      requestInFlight = true;
      try {
        const response = await fetch("/api/products", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Shared products are unavailable.");
        if (!Array.isArray(body.products)) throw new Error("The product catalogue response is invalid.");
        if (cancelled) return;
        reportedProductsError = false;
        setProducts((current) => JSON.stringify(current) === JSON.stringify(body.products) ? current : body.products);
        const productsById = new Map(body.products.map((product) => [product.id, product]));
        setCart((current) => {
          const updated = current.flatMap((item) => {
            const product = productsById.get(item.id);
            return product ? [{ ...item, ...product, quantity: item.quantity }] : [];
          });
          return JSON.stringify(current) === JSON.stringify(updated) ? current : updated;
        });
      } catch (error) {
        if (!cancelled && !reportedProductsError) {
          reportedProductsError = true;
          console.error("Could not refresh the product catalogue:", error);
          setToast(error.message || "Shared catalogue unavailable; showing sample products.");
        }
      } finally {
        requestInFlight = false;
      }
    }
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void refreshProducts(); };
    void refreshProducts();
    const interval = window.setInterval(refreshWhenVisible, 30000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [authChecked]);
  useEffect(() => {
    let mounted = true;
    let receivedAuthEvent = false;
    fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not check your sign-in session.");
      return body;
    }).then(({ session }) => {
      if (!mounted || receivedAuthEvent) return;
      setCustomerSession(session);
      setAuthChecked(true);
    }).catch((error) => {
      if (!mounted || receivedAuthEvent) return;
      console.error("Could not load the customer session:", error);
      setAuthChecked(true);
    });
    const unsubscribe = subscribeToCustomerSession((session) => {
      receivedAuthEvent = true;
      setCustomerSession(session);
      setAuthChecked(true);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2800); return () => window.clearTimeout(timer); }, [toast]);
  const handleSignInSuccess = useCallback((session) => {
    window.history.replaceState({}, "", "/?view=account");
    setActiveView("account");
    if (checkoutPendingAuth) {
      setCheckoutDetails((current) => ({
        ...current,
        customerName: current.customerName ?? session?.user?.user_metadata?.full_name ?? "",
        phone: current.phone || session?.user?.phone || "",
      }));
      setCheckoutPendingAuth(false);
      setCheckoutError("");
      setShowCheckout(true);
    }
  }, [checkoutPendingAuth]);
  const handleAccountUpdated = useCallback((user) => {
    setCustomerSession((current) => current ? { ...current, user } : current);
  }, []);
  useEffect(() => {
    const validViews = new Set(["home", "shop", "categories", "about", "account", "wishlist"]);
    const syncViewFromUrl = () => {
      const nextView = new URLSearchParams(window.location.search).get("view") || "home";
      setActiveView(validViews.has(nextView) ? nextView : "home");
      setCatalogSearchOpen(false);
      if (nextView === "shop" || nextView === "categories") setActiveCategory("All");
    };
    const timer = window.setTimeout(syncViewFromUrl, 0);
    window.addEventListener("popstate", syncViewFromUrl);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", syncViewFromUrl); };
  }, []);
  useEffect(() => {
    if (catalogSearchOpen) catalogSearchInput.current?.focus();
  }, [catalogSearchOpen]);

  const filteredProducts = useMemo(() => products.filter((product) => { const matchesCategory = activeCategory === "All" || product.category === activeCategory; const term = search.trim().toLowerCase(); return matchesCategory && (!term || `${product.name} ${product.category}`.toLowerCase().includes(term)); }), [products, activeCategory, search]);
  const featuredProduct = products[0] || initialProducts[0];
  const supportingProduct = products[1] || featuredProduct;
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const wishlistProducts = products.filter((product) => wishlist.includes(product.id));
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = subtotal >= 60 || subtotal === 0 ? 0 : 6;
  const addToCart = (product) => { setCart((current) => { const found = current.find((item) => item.id === product.id); return found ? current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { ...product, quantity: 1 }]; }); setToast(`${product.name} added to your cart`); };
  const toggleWishlist = (product) => {
    const isWishlisted = wishlist.includes(product.id);
    setWishlist((current) => isWishlisted ? current.filter((id) => id !== product.id) : [...current, product.id]);
    setToast(isWishlisted ? `${product.name} removed from your wishlist` : `${product.name} saved to your wishlist`);
  };
  const removeFromWishlist = (product) => {
    setWishlist((current) => current.filter((id) => id !== product.id));
    setToast(`${product.name} removed from your wishlist`);
  };
  const updateQuantity = (id, delta) => setCart((current) => current.reduce((next, item) => { if (item.id !== id) return [...next, item]; const quantity = item.quantity + delta; return quantity > 0 ? [...next, { ...item, quantity }] : next; }, []));
  const navigateTo = (view) => {
    const url = view === "home" ? "/" : `/?view=${view}`;
    window.history.pushState({}, "", url);
    setCatalogSearchOpen(false);
    if (view === "shop" || view === "categories") setActiveCategory("All");
    setActiveView(view);
    if (view !== "account") setCheckoutPendingAuth(false);
    if (view !== "account") setMobileAccountSectionOpen(false);
    if (view === "account") window.scrollTo(0, 0);
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openWishlist = () => {
    setActiveAccountSection("wishlist");
    navigateTo("wishlist");
  };
  const selectAccountSection = (sectionId) => {
    if (sectionId === "cart") { setCartOpen(true); return; }
    if (sectionId === "logout") return;
    setActiveAccountSection(sectionId);
    setMobileAccountSectionOpen(true);
  };
  const openCheckout = () => {
    if (!customerSession?.user?.id) {
      setCheckoutPendingAuth(true);
      setCartOpen(false);
      setToast("Sign in or create an account to continue checkout.");
      navigateTo("account");
      return;
    }
    setCheckoutDetails((current) => ({
      ...current,
      customerName: current.customerName ?? customerSession.user.user_metadata?.full_name ?? "",
      phone: current.phone || customerSession.user.phone || "",
    }));
    setCheckoutError("");
    setShowCheckout(true);
  };
  const completeCheckout = async (event) => {
    event.preventDefault();
    if (!customerSession?.user?.id) {
      setShowCheckout(false);
      setCartOpen(false);
      setCheckoutPendingAuth(true);
      setToast("Sign in or create an account to continue checkout.");
      navigateTo("account");
      return;
    }
    setOrderSubmitting(true);
    setCheckoutError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
          customerName: checkoutDetails.customerName ?? customerSession?.user?.user_metadata?.full_name ?? "",
          phone: checkoutDetails.phone,
          shippingAddress: checkoutDetails.shippingAddress,
          city: checkoutDetails.city,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not place the order.");
      setCart([]);
      setShowCheckout(false);
      setCartOpen(false);
      setPaymentOrder(body.order);
      setShowPayment(true);
      setOrdersVersion((version) => version + 1);
      setActiveAccountSection("orders");
      setCheckoutDetails({ customerName: null, phone: "", shippingAddress: "", city: "" });
    } catch (error) {
      setCheckoutError(error.message || "Could not place the order.");
    } finally {
      setOrderSubmitting(false);
    }
  };

  const customerAccount = <CustomerAccount session={customerSession} onSignInSuccess={handleSignInSuccess} onAccountUpdated={handleAccountUpdated} activeSection={activeAccountSection} onSelectSection={selectAccountSection} onBackToSections={() => setMobileAccountSectionOpen(false)} mobileSectionOpen={mobileAccountSectionOpen} wishlistProducts={wishlistProducts} onAddToCart={addToCart} onRemoveFromWishlist={removeFromWishlist} onOpenCart={() => setCartOpen(true)} cartCount={cartCount} refreshKey={ordersVersion} />;

  return <main className={`page-view page-${activeView}${mobileAccountSectionOpen ? " mobile-account-section-open" : ""}`}>
    <header className="site-header"><button className="brand brand-mark" type="button" onClick={() => navigateTo("home")} aria-label="SabbyBestCollection home"><Image src="/sabby-best-collection-logo-transparent.png" alt="" width={80} height={75} priority /></button><nav className="main-nav" aria-label="Main navigation"><button className={activeView === "home" ? "active" : ""} onClick={() => navigateTo("home")}>Home</button><button className={activeView === "shop" ? "active" : ""} onClick={() => navigateTo("shop")}>Shop</button><button className={activeView === "categories" ? "active" : ""} onClick={() => navigateTo("categories")}>Categories</button><button className={activeView === "about" ? "active" : ""} onClick={() => navigateTo("about")}>About</button></nav><div className="header-actions">{(activeView === "shop" || activeView === "categories") && <button className="icon-button catalog-search-toggle" type="button" onClick={() => setCatalogSearchOpen((open) => !open)} aria-label={catalogSearchOpen ? "Close product search" : "Search products"} aria-expanded={catalogSearchOpen}><Icon name="search" size={19} /></button>}<button className="icon-button mobile-wishlist-toggle" onClick={openWishlist} aria-label={`Wishlist, ${wishlistProducts.length} saved items`}><Icon name="heart" /></button><button className="icon-button account-toggle" onClick={() => navigateTo("account")} aria-label="Account"><Icon name="user" /></button><button className="bag-button" onClick={() => setCartOpen(true)} aria-label={`Open cart, ${cartCount} items`}><Icon name="bag" /><b>{cartCount}</b></button></div>{catalogSearchOpen && (activeView === "shop" || activeView === "categories") && <div className="catalog-search-popover"><Icon name="search" size={18} /><input ref={catalogSearchInput} id="catalog-search" type="search" aria-label="Search products by name or category" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" /><button type="button" onClick={() => setCatalogSearchOpen(false)} aria-label="Close product search"><Icon name="close" size={18} /></button></div>}</header>
    <nav className="mobile-bottom-nav" aria-label="Quick navigation"><button className={activeView === "home" ? "active" : ""} onClick={() => navigateTo("home")} aria-current={activeView === "home" ? "page" : undefined}><Icon name="home" size={20} /><span>Home</span></button><button className={activeView === "shop" ? "active" : ""} onClick={() => navigateTo("shop")} aria-current={activeView === "shop" ? "page" : undefined}><Icon name="shop" size={20} /><span>Shop</span></button><button className={activeView === "categories" ? "active" : ""} onClick={() => navigateTo("categories")} aria-current={activeView === "categories" ? "page" : undefined}><Icon name="shop" size={20} /><span>Categories</span></button><button className={activeView === "about" ? "active" : ""} onClick={() => navigateTo("about")} aria-current={activeView === "about" ? "page" : undefined}><Icon name="info" size={20} /><span>About</span></button><button className={activeView === "account" ? "active" : ""} onClick={() => navigateTo("account")} aria-current={activeView === "account" ? "page" : undefined}><Icon name="user" size={20} /><span>Account</span></button></nav>
    {activeView === "account" && customerAccount}
    {activeView === "wishlist" && <section className="account-page wishlist-page">
      <div className="account-section-heading wishlist-heading">
        <div><p className="eyebrow">Saved for later</p><h1>My Wishlist <span aria-hidden="true">♥</span></h1></div>
        <span>{wishlistProducts.length} {wishlistProducts.length === 1 ? "item" : "items"}</span>
      </div>
      {wishlistProducts.length ? <div className="wishlist-grid">
        {wishlistProducts.map((product) => <article className="wishlist-card" key={product.id}>
          <div className="wishlist-card-image" style={{ backgroundImage: `url(${product.image})` }} role="img" aria-label={product.name}>
            <button className="wishlist-remove" onClick={() => removeFromWishlist(product)} aria-label={`Remove ${product.name} from wishlist`}><Icon name="favorite" size={19} /></button>
            {product.badge && <span className="product-badge">{product.badge}</span>}
          </div>
          <div className="wishlist-card-info">
            <p className="eyebrow">{product.category}</p><h3>{product.name}</h3>
            <p className="wishlist-card-price">{money.format(product.price)}{product.originalPrice > product.price && <del>{money.format(product.originalPrice)}</del>}</p>
            <div className="wishlist-product-meta"><span>{product.discountLabel || (product.discountPercent ? `${product.discountPercent}% off` : "No current discount")}</span><span className={product.rating ? "wishlist-rating rated" : "wishlist-rating"}>{product.rating ? <><Icon name="star" size={15} /> {product.rating}</> : "Not rated"}</span></div>
            <button className="add-to-cart-button" onClick={() => addToCart(product)}>Add to cart <Icon name="bag" size={16} /></button>
          </div>
        </article>)}
      </div> : <div className="wishlist-empty">
        <div className="wishlist-empty-icon"><Icon name="heart" size={25} /></div>
        <h3>Your wishlist is empty</h3><p>Save products you love and find them here later.</p>
        <button className="primary-button" onClick={() => navigateTo("shop")}>Continue Shopping <Icon name="arrow" size={17} /></button>
      </div>}
    </section>}
    <section className="hero" id="top"><div className="hero-copy"><p className="hero-tag"></p><h1>Discover<br />Style That<br />Defines You</h1><p className="hero-text">Elevate your style with our curated collection of premium essentials. Thoughtful picks, unmatched quality.</p><div className="hero-actions"><button onClick={() => navigateTo("shop")} className="primary-button">Shop Now </button><button onClick={() => navigateTo("shop")} className="secondary-button"><span aria-hidden="true">▷</span> View Lookbook</button></div><div className="hero-benefits"><span><Icon name="help" size={15} /> 24/7 Support</span></div></div><div className="hero-visual" aria-label="Explore the latest SabbyBestCollection looks"><div className="hero-editorial-image" role="img" aria-label="Model wearing an elegant orange outfit" style={{ backgroundImage: `url("${homepageImages.heroEditorial}")` }} /><div className="hero-lookbook-image" role="img" aria-label="A look from the new collection" style={{ backgroundImage: `url("${homepageImages.heroLookbook}")` }} /><div className="hero-detail-image" role="img" aria-label="A closer look at the latest collection" style={{ backgroundImage: `url("${homepageImages.heroDetail}")` }} /><div className="hero-trending-badge">🔥 Trending</div><div className="hero-discount-badge">-40% OFF</div><article className="hero-rating-card"><span aria-hidden="true">★</span><div><strong>4.9 Rating</strong><small>2k+ Reviews</small></div></article></div></section>
    {(activeView === "shop" || activeView === "categories" || activeView === "about") && <>
      <section className={`shop-section${activeView === "categories" ? " category-shop-section" : ""}`} id="shop">
        <header className="catalog-heading">
          {activeView === "categories" && <>
            <div><h1>Shop by category</h1></div>
            <p>Explore our collection by category to find the products that fit your routine.</p>
          </>}
        </header>
        {activeView === "categories" && <div className="catalog-controls has-category-tabs">
          <div className="category-tabs" role="group" aria-label="Filter products by category">
            {categories.map((category) => {
              return <button key={category} type="button" aria-pressed={activeCategory === category} className={activeCategory === category ? "active" : ""} onClick={() => setActiveCategory(category)}>
                {category}
              </button>;
            })}
          </div>
        </div>
        }
        <div className="product-results-summary" aria-live="polite">
          <span>{filteredProducts.length} {filteredProducts.length === 1 ? "product" : "products"}</span>
          {activeView === "categories" && activeCategory !== "All" && <span>in {activeCategory}</span>}
        </div>
        {filteredProducts.length ? <div className="product-grid">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} onPreview={setProductDetail} isWishlisted={wishlist.includes(product.id)} onToggleWishlist={toggleWishlist} />)}</div> : <div className="empty-state"><p>No products found for that search.</p><button className="text-button" onClick={() => { setSearch(""); setActiveCategory("All"); }}>View all products <Icon name="arrow" size={16} /></button></div>}
      </section>
      {activeView !== "categories" && <section className="newsletter"><p className="eyebrow">A note from SabbyBestCollection</p><h2>Good things, in your inbox.</h2><form onSubmit={(event) => { event.preventDefault(); setToast("Welcome to the SabbyBestCollection list."); event.currentTarget.reset(); }}><input type="email" required placeholder="Your email address" aria-label="Your email address" /><button aria-label="Subscribe"><Icon name="arrow" /></button></form><small>By subscribing, you agree to receive marketing emails. Unsubscribe anytime.</small></section>}
      {activeView === "about" && <section className="about-page">
        <header className="about-intro">
          <p className="eyebrow">About SabbyBestCollection</p>
          <div className="about-intro-content">
            <h1>Good care.<br /><em>Made simple.</em></h1>
            <p>We believe shopping should be simple, convenient, and enjoyable. SabbyBestCollection brings carefully selected fashion, home, and everyday essentials from trusted sellers directly to customers.</p>
          </div>
          <div className="about-intro-footer"><span>Thoughtful finds</span><span>Dependable service</span><span>Everyday essentials</span></div>
        </header>
        <section className="about-mission">
          <p className="eyebrow">Our mission</p>
          <div className="about-mission-copy">
            <h2>Make good products easier to find and easier to enjoy.</h2>
            <p>We aim to connect customers with considered products, dependable service, and a shopping experience that feels clear from discovery to delivery.</p>
          </div>
        </section>
        <section className="about-benefits">
          <div className="about-section-heading">
            <div><p className="eyebrow">The SabbyBestCollection difference</p><h2>Good care, without the guesswork.</h2></div>
            <p>From choosing a product to getting help with an order, we want every step to feel straightforward.</p>
          </div>
          <div className="about-benefit-list">
            <article><span>01</span><div><h3>Considered quality</h3><p>A thoughtful selection of fashion, home, and everyday essentials from trusted sellers.</p></div></article>
            <article><span>02</span><div><h3>Convenient delivery</h3><p>Delivery options designed to help your order reach you promptly.</p></div></article>
            <article><span>03</span><div><h3>Clear payments</h3><p>Choose from the payment options available at checkout.</p></div></article>
            <article><span>04</span><div><h3>Helpful support</h3><p>Reach our team by phone or WhatsApp whenever you need assistance.</p></div></article>
            <article><span>05</span><div><h3>Order guidance</h3><p>Contact us about an order and we’ll help you with the next steps.</p></div></article>
          </div>
        </section>
        <div className="about-details">
          <section className="about-values">
            <div><p className="eyebrow">Our values</p><h2>What guides us</h2></div>
            <ul><li>Quality</li><li>Trust</li><li>Customer satisfaction</li><li>Transparency</li></ul>
          </section>
          <section className="about-contact">
            <div><p className="eyebrow">Contact & location</p><h2>We’re here to help.</h2><p className="about-contact-intro">Questions about a product or order? Get in touch with our team.</p></div>
            <address>
              <p><span>Phone</span><span className="about-contact-pending">Phone details to be provided</span></p>
              <p><span>WhatsApp</span><a className="about-whatsapp-link account-help-whatsapp" href="https://wa.me/233240958153" target="_blank" rel="noreferrer"><WhatsAppIcon aria-hidden="true" /> WhatsApp</a></p>
              <p><span>Email</span><span className="about-contact-pending">Email details to be provided</span></p>
              <p><span>Social media</span><span className="about-contact-pending">Social profiles to be provided</span></p>
              <p><span>Location</span><span>HO</span></p>
            </address>
          </section>
        </div>
      </section>}
    </>}
    {activeView === "account" && <section className="account-page"><header className="account-heading"><div><p className="eyebrow">Customer account</p><h1>Welcome, Elliot</h1><p>Your orders and account preferences, all in one place.</p></div><button className="account-cart-link" onClick={() => setCartOpen(true)}><Icon name="bag" size={17} /> Cart <span>{cartCount}</span></button></header><div className="account-layout"><nav className="account-sidebar" aria-label="Account sections">{accountSections.map((section) => <button key={section.id} className={activeAccountSection === section.id ? "active" : ""} onClick={() => selectAccountSection(section.id)}><Icon name={section.icon} size={18} /><span>{section.label}</span>{section.id === "cart" && cartCount > 0 && <b>{cartCount}</b>}</button>)}</nav><section className="account-content">{activeAccountSection === "orders" && <><div className="account-section-heading"><div><p className="eyebrow">Your account</p><h2>Order history</h2></div><span>0 orders</span></div><article className="account-order"><div className="account-order-top"><div><p className="eyebrow">Delivery status</p><h3>0 items delivered</h3></div><span className="order-status"><i />No deliveries yet</span></div><div className="account-order-summary"><div><span>Order total</span><strong>GH₵0</strong></div><span>Awaiting orders</span></div><button className="account-text-action" onClick={() => navigateTo("shop")}>Browse products <Icon name="arrow" size={15} /></button></article></>}{activeAccountSection === "profile" && <AccountEmptyState title="My Profile" message="Profile details will appear here once customer accounts are connected." />}{activeAccountSection === "wishlist" && <><div className="account-section-heading wishlist-heading"><div><p className="eyebrow">Saved for later</p><h2>My Wishlist <span aria-hidden="true">♥</span></h2></div><span>{wishlistProducts.length} {wishlistProducts.length === 1 ? "item" : "items"}</span></div>{wishlistProducts.length ? <div className="wishlist-grid">{wishlistProducts.map((product) => <article className="wishlist-card" key={product.id}><div className="wishlist-card-image" style={{ backgroundImage: `url(${product.image})` }} role="img" aria-label={product.name}><button className="wishlist-remove" onClick={() => removeFromWishlist(product)} aria-label={`Remove ${product.name} from wishlist`}><Icon name="favorite" size={19} /></button>{product.badge && <span className="product-badge">{product.badge}</span>}</div><div className="wishlist-card-info"><p className="eyebrow">{product.category}</p><h3>{product.name}</h3><p className="wishlist-card-price">{money.format(product.price)}{product.originalPrice > product.price && <del>{money.format(product.originalPrice)}</del>}</p><div className="wishlist-product-meta"><span>{product.discountLabel || (product.discountPercent ? `${product.discountPercent}% off` : "No current discount")}</span><span className={product.rating ? "wishlist-rating rated" : "wishlist-rating"}>{product.rating ? <><Icon name="star" size={15} /> {product.rating}</> : "Not rated"}</span></div><button className="add-to-cart-button" onClick={() => addToCart(product)}>Add to cart <Icon name="bag" size={16} /></button></div></article>)}</div> : <div className="wishlist-empty"><div className="wishlist-empty-icon"><Icon name="heart" size={25} /></div><h3>Your wishlist is empty</h3><p>Save products you love and find them here later.</p><button className="primary-button" onClick={() => navigateTo("shop")}>Continue Shopping <Icon name="arrow" size={17} /></button></div>}</>}{activeAccountSection === "addresses" && <AccountEmptyState title="Delivery Addresses" message="No saved delivery addresses yet." />}{activeAccountSection === "payments" && <AccountEmptyState title="Payment Methods" message="No saved payment methods. Payment details are not stored in this demo." />}{activeAccountSection === "returns" && <div className="account-empty"><p className="eyebrow">Order support</p><h2>Returns & Refunds</h2><p>For help with a return or refund, contact our support team with your order number.</p><a className="account-text-action" href="https://wa.me/233240958153" target="_blank" rel="noreferrer">Contact support <Icon name="arrow" size={15} /></a></div>}{activeAccountSection === "notifications" && <AccountEmptyState title="Notifications" message="You’re all caught up. Account notifications will appear here." />}{activeAccountSection === "settings" && <AccountEmptyState title="Settings" message="Account settings will be available when customer sign-in is connected." />}{activeAccountSection === "support" && <div className="account-empty"><p className="eyebrow">We’re here to help</p><h2>Help & Support</h2><p>For help, message us on WhatsApp.</p><a className="account-text-action" href="https://wa.me/233240958153" target="_blank" rel="noreferrer">Message on WhatsApp <Icon name="arrow" size={15} /></a></div>}</section></div></section>}
    {activeView === "account" && customerSession && mobileAccountSectionOpen && <button className="account-mobile-back" onClick={() => setMobileAccountSectionOpen(false)}>← Back to account sections</button>}
    <footer className="landing-footer"><p>© 2026 SabbyBestCollection</p><p>Made with intention</p></footer>
    {toast && <div className="toast"><span><Icon name="check" size={17} /></span>{toast}</div>}
    {isCartOpen && <><button className="modal-backdrop" onClick={() => setCartOpen(false)} aria-label="Close cart" /><aside className="cart-drawer" aria-modal="true" role="dialog" aria-label="Your shopping cart"><div className="drawer-header"><h2>Your cart <span>({cartCount})</span></h2><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Close cart"><Icon name="close" /></button></div>{cart.length ? <><div className="cart-items">{cart.map((item) => <div className="cart-item" key={item.id}><span className="cart-image" style={{ backgroundImage: `url(${item.image})` }} /><div><p className="eyebrow">{item.category}</p><h3>{item.name}</h3><p>{money.format(item.price)}</p><div className="quantity"><button onClick={() => updateQuantity(item.id, -1)} aria-label={`Decrease ${item.name}`}><Icon name="minus" size={14} /></button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.id, 1)} aria-label={`Increase ${item.name}`}><Icon name="plus" size={14} /></button></div></div><button className="remove-button" onClick={() => updateQuantity(item.id, -item.quantity)}>Remove</button></div>)}</div><div className="cart-summary"><p><span>Subtotal</span><b>{money.format(subtotal)}</b></p><p><span>Shipping</span><b>{shipping ? money.format(shipping) : "Complimentary"}</b></p><p className="total"><span>Total</span><b>{money.format(subtotal + shipping)}</b></p><button className="primary-button wide" onClick={openCheckout}>Secure checkout <Icon name="arrow" size={18} /></button><small><Icon name="shield" size={14} /> Sign in required · payment is completed in checkout</small></div></> : <div className="cart-empty"><div className="empty-bag"><Icon name="bag" size={28} /></div><h3>Your cart is waiting.</h3><p>Add an essential to begin your ritual.</p><button className="primary-button" onClick={() => setCartOpen(false)}>Shop collection <Icon name="arrow" size={18} /></button></div>}</aside></>}
    {productDetail && <><button className="modal-backdrop" onClick={() => setProductDetail(null)} aria-label="Close product details" /><div className="product-modal" role="dialog" aria-modal="true" aria-label={productDetail.name}><button className="icon-button close-modal" onClick={() => setProductDetail(null)} aria-label="Close product details"><Icon name="close" /></button><div className="modal-product-image" style={{ backgroundImage: `url(${productDetail.image})` }} /><div className="modal-product-panel"><div className="modal-product-copy"><p className="eyebrow">{productDetail.category}</p><h2>{productDetail.name}</h2><p className="modal-price">{money.format(productDetail.price)} <span>· {productDetail.size}</span></p><button className="account-text-action product-modal-wishlist" onClick={() => toggleWishlist(productDetail)}><Icon name={wishlist.includes(productDetail.id) ? "favorite" : "heart"} size={17} /> {wishlist.includes(productDetail.id) ? "Saved to wishlist" : "Save to wishlist"}</button><section className="product-guide" aria-label="Product guide"><h3>Product Guide</h3><details open><summary>Product Description</summary><p>{productDetail.description || "Product information is not available yet."}</p></details><details><summary>How to Use</summary><ProductGuideList content={productDetail.howToUse || defaultProductUsage} numbered /></details><details><summary>Caution</summary><ProductGuideList content={productDetail.caution || defaultProductCaution} /></details></section></div><div className="modal-product-actions"><button className="primary-button wide" onClick={() => { addToCart(productDetail); setProductDetail(null); setCartOpen(true); }}>Add to cart <Icon name="bag" size={18} /></button><p className="detail-note"><Icon name="shield" size={17} /> Thoughtfully formulated. Always cruelty-free.</p></div></div></div></>}
    {showCheckout && <><button className="modal-backdrop" onClick={() => setShowCheckout(false)} aria-label="Close checkout" /><section className="checkout-modal checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><button className="icon-button close-modal" onClick={() => setShowCheckout(false)} aria-label="Close checkout"><Icon name="close" /></button><header className="checkout-heading"><p className="eyebrow">SabbyBestCollection</p><h2 id="checkout-title">Checkout</h2></header><div className="checkout-layout"><form className="checkout-form" onSubmit={completeCheckout}><div className="checkout-section-heading"><h3>Delivery details</h3><p>Where should we bring your finds?</p></div><label htmlFor="checkout-name">Full name<input id="checkout-name" required autoComplete="name" maxLength={120} value={checkoutDetails.customerName ?? customerSession?.user?.user_metadata?.full_name ?? ""} onChange={(event) => setCheckoutDetails({ ...checkoutDetails, customerName: event.target.value })} placeholder="Your full name" /></label><label htmlFor="checkout-phone">Phone number<input id="checkout-phone" required autoComplete="tel" type="tel" minLength={7} maxLength={30} value={checkoutDetails.phone} onChange={(event) => setCheckoutDetails({ ...checkoutDetails, phone: event.target.value })} placeholder="e.g. 024 000 0000" /></label><label htmlFor="checkout-address">Delivery address<textarea id="checkout-address" required autoComplete="street-address" minLength={8} maxLength={500} value={checkoutDetails.shippingAddress} onChange={(event) => setCheckoutDetails({ ...checkoutDetails, shippingAddress: event.target.value })} placeholder="House number, street, landmark" /></label><label htmlFor="checkout-city">City / town<input id="checkout-city" required autoComplete="address-level2" minLength={2} maxLength={120} value={checkoutDetails.city} onChange={(event) => setCheckoutDetails({ ...checkoutDetails, city: event.target.value })} placeholder="e.g. Accra" /></label>{checkoutError && <p className="form-error" role="alert">{checkoutError}</p>}<button className="primary-button wide" type="submit" disabled={orderSubmitting}>{orderSubmitting ? "Saving order…" : "Place order"} <Icon name="arrow" size={18} /></button><small><Icon name="shield" size={14} /> Prices and total are confirmed by the server when the order is placed.</small></form><aside className="checkout-summary"><div className="checkout-summary-heading"><h3>Order summary</h3><span>{cartCount} {cartCount === 1 ? "item" : "items"}</span></div><div className="checkout-summary-items">{cart.map((item) => <article className="checkout-summary-item" key={item.id}><span className="checkout-summary-image" style={{ backgroundImage: `url(${item.image})` }} role="img" aria-label={item.name} /><div><h4>{item.name}</h4><p>Qty {item.quantity}</p></div><strong>{money.format(item.price * item.quantity)}</strong></article>)}</div><div className="checkout-summary-totals"><p><span>Subtotal</span><b>{money.format(subtotal)}</b></p><p><span>Delivery</span><b>{shipping ? money.format(shipping) : "Complimentary"}</b></p><p className="checkout-summary-total"><span>Total</span><b>{money.format(subtotal + shipping)}</b></p></div></aside></div></section></>}
    {showPayment && paymentOrder && <PaymentPage order={paymentOrder} onClose={() => { setShowPayment(false); setActiveAccountSection("orders"); navigateTo("account"); }} />}
  </main>;
}
