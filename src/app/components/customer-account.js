"use client";

import { useEffect, useRef, useState } from "react";
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined";
import PersonIcon from "@mui/icons-material/PersonOutlineOutlined";
import ReceiptIcon from "@mui/icons-material/ReceiptLongOutlined";
import FavoriteIcon from "@mui/icons-material/FavoriteBorder";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBagOutlined";
import LocationIcon from "@mui/icons-material/LocationOnOutlined";
import CreditCardIcon from "@mui/icons-material/CreditCardOutlined";
import ReplayIcon from "@mui/icons-material/ReplayOutlined";
import NotificationsIcon from "@mui/icons-material/NotificationsNone";
import SettingsIcon from "@mui/icons-material/SettingsOutlined";
import LockIcon from "@mui/icons-material/LockOutlined";
import HelpIcon from "@mui/icons-material/HelpOutlineOutlined";
import LogoutIcon from "@mui/icons-material/LogoutOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { requestCustomerPasswordReset, resetCustomerPassword, signInCustomer, signOutCustomer, signUpCustomer, startCustomerVerification, verifyCustomerContact } from "../../lib/customer-auth-client";
import { subscribeToCustomerOrderUpdates } from "../../lib/customer-order-updates";
import { whatsappHref } from "../../lib/contact";

const notificationPreferenceKey = (userId) => `sabbybestcollection:order-notifications:${userId}`;

function orderStatusLabel(status) {
  return status.replaceAll("_", " ");
}

const accountSections = [
  { id: "profile", label: "My Profile", icon: PersonIcon },
  { id: "orders", label: "My Orders", icon: ReceiptIcon },
  { id: "wishlist", label: "Wishlist", icon: FavoriteIcon },
  { id: "cart", label: "Cart", icon: ShoppingBagIcon },
  { id: "addresses", label: "Delivery Addresses", icon: LocationIcon },
  { id: "payments", label: "Payment Methods", icon: CreditCardIcon },
  { id: "returns", label: "Returns & Refunds", icon: ReplayIcon },
  { id: "notifications", label: "Notifications", icon: NotificationsIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
  { id: "support", label: "Help & Support", icon: HelpIcon },
  { id: "logout", label: "Logout", icon: LogoutIcon },
];

async function apiJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  return body;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" }).format(new Date(value));
}

export default function CustomerAccount({ session, onSignInSuccess, onAccountUpdated, activeSection, onSelectSection, onBackToSections, mobileSectionOpen, wishlistProducts, onAddToCart, onRemoveFromWishlist, onOpenCart, cartCount, refreshKey }) {
  const [authMode, setAuthMode] = useState("signin");
  const [form, setForm] = useState({ identifier: "", username: "", phone: "", password: "", confirmPassword: "", verificationCode: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordOnlyLogin, setPasswordOnlyLogin] = useState(false);
  const [verificationDestination, setVerificationDestination] = useState("");
  const [verificationResendSeconds, setVerificationResendSeconds] = useState(0);
  const [showCurrentAccountPassword, setShowCurrentAccountPassword] = useState(false);
  const [showNewAccountPassword, setShowNewAccountPassword] = useState(false);
  const [showConfirmAccountPassword, setShowConfirmAccountPassword] = useState(false);
  const [orders, setOrders] = useState(null);
  const [ordersError, setOrdersError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState("");
  const authIdentifierRef = useRef(null);
  const [accountSettings, setAccountSettings] = useState({
    fullName: session?.user?.user_metadata?.full_name || "",
    email: session?.user?.email || "",
    deliveryAddress: session?.user?.delivery_address || "",
    deliveryCity: session?.user?.delivery_city || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [profileSaveStatus, setProfileSaveStatus] = useState("");
  const [profileSaveRevision, setProfileSaveRevision] = useState(0);
  const [savedProfile, setSavedProfile] = useState({
    fullName: session?.user?.user_metadata?.full_name || "",
    email: session?.user?.email || "",
  });
  const [deliverySaveStatus, setDeliverySaveStatus] = useState("");
  const profileSaveInFlight = useRef(false);
  const [notificationPermission, setNotificationPermission] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const notificationEnabledRef = useRef(false);
  const orderStatuses = useRef(new Map());
  const initialOrdersLoaded = useRef(false);
  const authSubmitInFlight = useRef(false);

  useEffect(() => {
    if (verificationResendSeconds === 0) return undefined;
    const timer = window.setTimeout(() => {
      setVerificationResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [verificationResendSeconds]);

  useEffect(() => {
    if (!session?.user && authMode === "signin" && !passwordOnlyLogin) {
      authIdentifierRef.current?.focus();
    }
  }, [authMode, passwordOnlyLogin, session]);

  useEffect(() => {
    const user = session?.user;
    if (!user) return;
    const timer = window.setTimeout(() => {
      const permission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
      setNotificationPermission(permission);
      setNotificationsEnabled(permission === "granted"
        && window.localStorage.getItem(notificationPreferenceKey(user.id)) === "true");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [session]);

  useEffect(() => {
    const userId = session?.user?.id;
    const fullName = accountSettings.fullName.trim();
    const email = accountSettings.email.trim().toLowerCase();
    const savedEmail = savedProfile.email || "";
    if (!userId || (fullName === savedProfile.fullName && email === savedEmail)) return undefined;
    const emailIsValid = email
      ? email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      : !savedEmail && Boolean(session?.user?.phone);
    if (fullName.length < 2 || fullName.length > 120 || !emailIsValid) {
      return undefined;
    }

    let cancelled = false;
    let timer;
    async function saveProfile() {
      if (profileSaveInFlight.current) {
        timer = window.setTimeout(saveProfile, 250);
        return;
      }
      profileSaveInFlight.current = true;
      setProfileSaveStatus("Saving profile changes…");
      try {
        const response = await fetch("/api/customer/account", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName, ...(email !== savedEmail ? { email } : {}) }),
        });
        const { user: updatedUser } = await apiJson(response);
        setSavedProfile({ fullName, email });
        onAccountUpdated(updatedUser);
        if (!cancelled) setProfileSaveStatus("Profile changes saved.");
      } catch (error) {
        if (!cancelled) {
          console.error("Could not save customer profile changes:", error);
          setProfileSaveStatus(error.message || "Could not save profile changes. Your edits are still here; try changing a field again.");
        }
      } finally {
        profileSaveInFlight.current = false;
      }
    }

    timer = window.setTimeout(saveProfile, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [accountSettings.fullName, accountSettings.email, session?.user?.id, session?.user?.phone, savedProfile, profileSaveRevision, onAccountUpdated]);

  useEffect(() => {
    const userId = session?.user?.id;
    const deliveryAddress = accountSettings.deliveryAddress.trim();
    const deliveryCity = accountSettings.deliveryCity.trim();
    if (!userId || (deliveryAddress === (session.user.delivery_address || "") && deliveryCity === (session.user.delivery_city || ""))) return undefined;
    if ((deliveryAddress && deliveryAddress.length < 8) || (deliveryCity && deliveryCity.length < 2)) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setDeliverySaveStatus("Saving delivery details…");
      try {
        const response = await fetch("/api/customer/account", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryAddress, deliveryCity }),
        });
        const { user: updatedUser } = await apiJson(response);
        if (!cancelled) {
          onAccountUpdated(updatedUser);
          setDeliverySaveStatus("Delivery details saved.");
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Could not save delivery details:", error);
          setDeliverySaveStatus(error.message || "Could not save delivery details.");
        }
      }
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [accountSettings.deliveryAddress, accountSettings.deliveryCity, session, onAccountUpdated]);

  useEffect(() => {
    notificationEnabledRef.current = notificationsEnabled;
  }, [notificationsEnabled]);

  useEffect(() => {
    if (!session?.user?.id) return undefined;
    let cancelled = false;
    let requestInFlight = false;
    async function refreshOrders() {
      if (cancelled || requestInFlight || document.visibilityState === "hidden") return;
      requestInFlight = true;
      try {
        const { orders: savedOrders } = await apiJson(await fetch("/api/orders", { cache: "no-store" }));
        if (!cancelled) {
          const nextStatuses = new Map(savedOrders.map((order) => [order.id, order.status]));
          if (initialOrdersLoaded.current && notificationEnabledRef.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
            savedOrders.forEach((order) => {
              const previousStatus = orderStatuses.current.get(order.id);
              if (previousStatus !== undefined && previousStatus !== order.status) {
                try {
                  new Notification("Your order has been updated", {
                    body: `Order ${order.id.slice(0, 8).toUpperCase()} is now ${orderStatusLabel(order.status)}.`,
                    tag: `sabbybestcollection-order-${order.id}`,
                  });
                } catch (error) {
                  console.error("Could not show browser order notification:", error);
                }
              }
            });
          }
          orderStatuses.current = nextStatuses;
          initialOrdersLoaded.current = true;
          setOrders(savedOrders);
          setOrdersError("");
        }
      } catch (error) {
        if (error.status === 401) return;
        if (!cancelled) {
          console.error("Could not refresh customer orders:", error);
          setOrdersError(error.message || "Could not load your orders.");
        }
      } finally {
        requestInFlight = false;
      }
    }
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void refreshOrders(); };
    void refreshOrders();
    const interval = window.setInterval(refreshWhenVisible, 30000);
    const unsubscribeFromOrderUpdates = subscribeToCustomerOrderUpdates(refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      initialOrdersLoaded.current = false;
      orderStatuses.current = new Map();
      window.clearInterval(interval);
      unsubscribeFromOrderUpdates();
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [session, refreshKey]);

  async function submitAuth(event) {
    event.preventDefault();
    if (authSubmitInFlight.current) return;
    const currentAuthMode = authMode;
    if (currentAuthMode === "login-verification" && !/^\d{6}$/.test(form.verificationCode.trim())) {
      setMessage("Enter the six-digit verification code.");
      return;
    }
    if ((currentAuthMode === "set-password" || currentAuthMode === "reset") && form.password !== form.confirmPassword) {
      setMessage("Your passwords do not match. Please check and try again.");
      return;
    }
    if (currentAuthMode === "signup" && (!form.username.trim() || !form.phone.trim())) {
      setMessage("Enter a username and phone number to continue.");
      return;
    }
    if (["signin", "recovery", "reset"].includes(currentAuthMode) && !form.identifier.trim()) {
      setMessage(currentAuthMode === "recovery" || currentAuthMode === "reset"
        ? "Enter the email address for your account."
      : "Enter your username or phone number to continue.");
      return;
    }
    authSubmitInFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (currentAuthMode === "recovery") {
        const result = await requestCustomerPasswordReset(form.identifier.trim());
        setVerificationDestination(result.destination);
        setVerificationResendSeconds(60);
        setAuthMode("reset");
        setForm((current) => ({ ...current, verificationCode: "", password: "", confirmPassword: "" }));
        setMessage(result.message);
      } else if (currentAuthMode === "signup") {
        const username = form.username.trim();
        await signUpCustomer({ username, phone: form.phone.trim(), password: form.password });
        setAuthMode("signin");
        setPasswordOnlyLogin(false);
        setForm((current) => ({ ...current, identifier: username, username: "", phone: "", password: "", confirmPassword: "", verificationCode: "" }));
        setMessage("Account created. Log in with your username or phone number.");
      } else if (currentAuthMode === "verify") {
        await verifyCustomerContact(form.identifier.trim(), form.verificationCode.trim());
        setAuthMode("set-password");
        setVerificationResendSeconds(0);
        setForm((current) => ({ ...current, verificationCode: "", password: "", confirmPassword: "" }));
        setMessage("Contact verified. Create a password for your account.");
      } else if (currentAuthMode === "set-password") {
      } else if (currentAuthMode === "reset") {
        await resetCustomerPassword({
          email: form.identifier.trim(),
          code: form.verificationCode.trim(),
          password: form.password,
        });
        setVerificationResendSeconds(0);
        setAuthMode("signin");
        setPasswordOnlyLogin(true);
        setForm((current) => ({ ...current, verificationCode: "", password: "", confirmPassword: "" }));
        setMessage("Your password has been reset. Log in with your new password.");
      } else if (currentAuthMode === "login-verification") {
        const result = await signInCustomer({
          identifier: form.identifier.trim(),
          code: form.verificationCode.trim(),
        });
        onSignInSuccess(result.session);
        setMessage("");
      } else {
        const result = await signInCustomer({
          identifier: form.identifier.trim(),
          password: form.password,
        });
        onSignInSuccess(result.session);
        setMessage("");
      }
    } catch (error) {
      if (currentAuthMode === "signup" && error.existingAccount) {
        setAuthMode("signin");
        setPasswordOnlyLogin(false);
        setForm((current) => ({ ...current, identifier: form.username.trim(), username: "", phone: "", password: "", confirmPassword: "", verificationCode: "" }));
        setMessage("That username or phone number is already in use. Log in instead.");
        return;
      }
      setMessage(error.message || "Could not complete sign-in.");
    } finally {
      authSubmitInFlight.current = false;
      setBusy(false);
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOutCustomer();
    } catch (error) {
      setMessage(error.message || "Could not sign out.");
    } finally {
      setSigningOut(false);
    }
  }

  async function resendVerificationCode() {
    if (busy || verificationResendSeconds > 0) return;
    setBusy(true);
    setMessage("");
    try {
      const result = authMode === "login-verification"
        ? await signInCustomer({ identifier: form.identifier.trim(), password: form.password })
        : authMode === "reset"
        ? await requestCustomerPasswordReset(form.identifier.trim())
        : await startCustomerVerification(form.identifier.trim());
      setVerificationDestination(result.destination);
      setVerificationResendSeconds(result.retryAfterSeconds || 60);
      setMessage(authMode === "reset"
        ? result.message
        : authMode === "login-verification"
          ? result.sent
            ? `We sent another verification code to ${result.destination}.`
            : `A code was recently sent to ${result.destination}. Please wait before requesting another.`
          : `We sent another verification code to ${result.destination}.`);
    } catch (error) {
      setMessage(error.message || "Could not resend the verification code.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    if (!accountSettings.newPassword || !accountSettings.currentPassword) {
      setMessage("Enter your current password and a new password to continue.");
      return;
    }
    if (accountSettings.newPassword !== accountSettings.confirmPassword) {
      setMessage("Your new passwords do not match.");
      return;
    }
    setSettingsBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/customer/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: accountSettings.currentPassword,
          newPassword: accountSettings.newPassword,
        }),
      });
      const { user } = await apiJson(response);
      onAccountUpdated(user);
      setAccountSettings((current) => ({
        ...current,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));
      setMessage("Your password has been changed. Other signed-in sessions have been signed out.");
    } catch (error) {
      setMessage(error.message || "Could not update your account.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function toggleOrderNotifications() {
    setNotificationMessage("");
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      window.localStorage.setItem(notificationPreferenceKey(session.user.id), "false");
      setNotificationMessage("Browser order notifications are turned off.");
      return;
    }
    if (typeof Notification === "undefined") {
      setNotificationMessage("Browser notifications are not supported in this browser.");
      return;
    }
    let permission = Notification.permission;
    if (permission === "default") {
      try {
        permission = await Notification.requestPermission();
      } catch (error) {
        console.error("Could not request browser notification permission:", error);
        setNotificationMessage("Your browser could not request notification permission. Check its site settings and try again.");
        return;
      }
    }
    setNotificationPermission(permission);
    if (permission !== "granted") {
      setNotificationMessage(permission === "denied"
        ? "Notifications are blocked by your browser. Allow them in your browser settings to turn them on."
        : "Browser notification permission was not granted.");
      return;
    }
    setNotificationsEnabled(true);
    window.localStorage.setItem(notificationPreferenceKey(session.user.id), "true");
    setNotificationMessage("You’ll get a browser notification when an order status changes while you’re signed in.");
  }

  if (!session?.user || authMode === "recovery") {
    const currentAuthMode = authMode;
    const isSigningUp = currentAuthMode === "signup";
    const isVerifying = currentAuthMode === "verify";
    const isSettingPassword = currentAuthMode === "set-password";
    const isSigningIn = currentAuthMode === "signin";
    const isPasswordOnlyLogin = isSigningIn && passwordOnlyLogin;
    const isLoginVerification = currentAuthMode === "login-verification";
    const isRecoveringPassword = currentAuthMode === "recovery";
    const isResettingPassword = currentAuthMode === "reset";
    return <section className={`customer-account-root customer-auth-screen${isSigningUp ? " customer-signup-screen" : ""}`}>
      <div className="customer-auth-card">
        <div className="customer-auth-wordmark" aria-label="SabbyBestCollection">
          <span className="customer-auth-monogram">S</span>
          <span className="customer-auth-brand-name">SabbyBestCollection</span>
        </div>
        <h1>{isSigningUp ? "Create your account" : isVerifying ? "Verify your contact" : isLoginVerification ? "Verify your phone" : isSettingPassword ? "Set your password" : isRecoveringPassword ? "Reset your password" : isResettingPassword ? "Choose a new password" : "Welcome Back"}</h1>
        <p className="customer-auth-intro">{isSigningUp
          ? "Choose a username, add your phone number, and create a password."
          : isVerifying
            ? `Enter the six-digit code sent to ${verificationDestination}.`
            : isLoginVerification
              ? `Enter the six-digit code sent to ${verificationDestination} to securely complete your login.`
            : isSettingPassword
              ? "Choose a password to secure your new account."
              : isRecoveringPassword
                ? "Enter the email address linked to your account and we’ll send you a one-time reset code."
                : isResettingPassword
                  ? `Enter the six-digit code sent to ${verificationDestination}, then choose a new password.`
              : "Log in with your username or phone number and password."}</p>
        <form onSubmit={submitAuth} aria-busy={busy}>
          {isSigningUp && <><label htmlFor="customer-username">Username<input id="customer-username" name="username" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="e.g. elliot_gh" required maxLength={30} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label><label htmlFor="customer-phone">Phone number<input id="customer-phone" name="phone" type="tel" autoComplete="tel" placeholder="e.g. +233 24 123 4567" required maxLength={30} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label></>}
          {(isSigningIn && !isPasswordOnlyLogin || isRecoveringPassword) && <label htmlFor="customer-identifier">{isRecoveringPassword ? "Email address" : "Username or phone number"}<input ref={isSigningIn ? authIdentifierRef : undefined} id="customer-identifier" name="identifier" type={isRecoveringPassword ? "email" : "text"} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={isRecoveringPassword ? "you@example.com" : "e.g. elliot_gh or +233 24 123 4567"} required maxLength={254} value={form.identifier} onChange={(event) => setForm({ ...form, identifier: event.target.value })} /></label>}
          {(isPasswordOnlyLogin || isResettingPassword) && <div className="customer-auth-identifier"><span>{form.identifier}</span><button className="account-text-action" type="button" disabled={busy} onClick={() => { setPasswordOnlyLogin(false); setVerificationResendSeconds(0); setAuthMode(isResettingPassword ? "recovery" : "signin"); setMessage(""); setForm((current) => ({ ...current, verificationCode: "", password: "", confirmPassword: "" })); }}>Change</button></div>}
          {isLoginVerification && <div className="customer-auth-identifier"><span>Phone number · {verificationDestination}</span><button className="account-text-action" type="button" disabled={busy} onClick={() => { setAuthMode("signin"); setPasswordOnlyLogin(false); setVerificationResendSeconds(0); setMessage(""); setForm((current) => ({ ...current, password: "", verificationCode: "" })); }}>Change</button></div>}
          {(isVerifying || isLoginVerification || isResettingPassword) && <label htmlFor="customer-verification-code">Verification code<input id="customer-verification-code" name="verificationCode" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" placeholder="6-digit code" required maxLength={6} value={form.verificationCode} onChange={(event) => setForm({ ...form, verificationCode: event.target.value.replace(/\D/g, "").slice(0, 6) })} /></label>}
          {(isSigningUp || isSigningIn || isSettingPassword || isResettingPassword) && <label htmlFor="customer-password">{isResettingPassword ? "New password" : "Password"}
            <span className="customer-password-field">
              <input id="customer-password" name="password" type={showPassword ? "text" : "password"} autoComplete={isSettingPassword || isResettingPassword ? "new-password" : "current-password"} placeholder={isSettingPassword || isResettingPassword ? "Create a password" : "Password"} minLength={8} maxLength={128} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
              <button type="button" className="customer-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <VisibilityOffIcon fontSize="small" aria-hidden="true" /> : <VisibilityIcon fontSize="small" aria-hidden="true" />}</button>
            </span>
          </label>}
          {(isSettingPassword || isResettingPassword) && <>
            <label htmlFor="customer-confirm-password">{isResettingPassword ? "Confirm new password" : "Confirm password"}
              <span className="customer-password-field">
                <input id="customer-confirm-password" name="confirmPassword" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" placeholder="Confirm password" minLength={8} maxLength={128} required value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} />
                <button type="button" className="customer-password-toggle" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirmPassword}>{showConfirmPassword ? <VisibilityOffIcon fontSize="small" aria-hidden="true" /> : <VisibilityIcon fontSize="small" aria-hidden="true" />}</button>
              </span>
            </label>
          </>}
          {isVerifying && <button className="customer-forgot-link" type="button" onClick={() => { setAuthMode("signup"); setMessage(""); setForm((current) => ({ ...current, verificationCode: "" })); }}>Change email or phone</button>}
          {(isVerifying || isLoginVerification || isResettingPassword) && <button className="customer-forgot-link" type="button" onClick={resendVerificationCode} disabled={busy || verificationResendSeconds > 0}>{verificationResendSeconds > 0 ? `Resend code in ${Math.floor(verificationResendSeconds / 60)}:${String(verificationResendSeconds % 60).padStart(2, "0")}` : "Resend code"}</button>}
          {(isSettingPassword || isResettingPassword) && <p className="customer-password-hint">Use at least 8 characters.</p>}
          {message && <p className="customer-account-notice" role="status" aria-live="polite">{message}</p>}
          <button className="primary-button wide" type="submit" disabled={busy}>{busy ? (isSigningUp ? "Creating account…" : isSigningIn ? "Signing in…" : "Please wait…") : isRecoveringPassword ? "Send reset code" : isResettingPassword ? "Reset password" : isSigningUp ? "Create account" : isVerifying ? "Verify code" : isLoginVerification ? "Verify & Log In" : isSettingPassword ? "Create account" : "Log In"}</button>
        </form>
        {isSigningUp || isSigningIn ? <p className="customer-auth-switch">{isSigningUp ? "Already have an account?" : "New to SabbyBestCollection?"}
          <button className="account-text-action" type="button" disabled={busy} onClick={() => { setAuthMode(isSigningUp ? "signin" : "signup"); setPasswordOnlyLogin(false); setMessage(""); setShowPassword(false); setShowConfirmPassword(false); setForm((current) => ({ ...current, password: "", confirmPassword: "", verificationCode: "" })); }}>
            {isSigningUp ? "Log In" : "Sign Up"}
          </button>
        </p> : isSettingPassword && <p className="customer-auth-switch"><button className="account-text-action" type="button" disabled={busy} onClick={() => { setAuthMode("signup"); setMessage(""); setForm((current) => ({ ...current, password: "", confirmPassword: "" })); }}>Use a different email or phone</button></p>}
        {isRecoveringPassword && <p className="customer-auth-switch">Remembered your password? <button className="account-text-action" type="button" disabled={busy} onClick={() => { setAuthMode("signin"); setMessage(""); }}>Log in</button></p>}
        {isResettingPassword && <p className="customer-auth-switch"><button className="account-text-action" type="button" disabled={busy} onClick={() => { setAuthMode("recovery"); setVerificationResendSeconds(0); setMessage(""); setForm((current) => ({ ...current, verificationCode: "", password: "", confirmPassword: "" })); }}>Use a different email address</button></p>}
      </div>
    </section>;
  }

  const accountIdentifier = session.user.username || session.user.phone;
  const fullName = session.user.user_metadata?.full_name || accountIdentifier || "Customer";
  const profileChangesPending = accountSettings.fullName.trim() !== savedProfile.fullName
    || accountSettings.email.trim().toLowerCase() !== (savedProfile.email || "");
  const emailValue = accountSettings.email.trim().toLowerCase();
  const emailIsValid = emailValue
    ? emailValue.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)
    : !savedProfile.email && Boolean(session.user.phone);
  const profileDetailsValid = accountSettings.fullName.trim().length >= 2
    && accountSettings.fullName.trim().length <= 120
    && emailIsValid;
  return <section className="account-page customer-account-root">
    <header className="account-heading"><div><p className="eyebrow">Customer account</p><h1>Welcome, {fullName}</h1><p>{accountIdentifier}</p></div><div className="customer-account-actions"><button className="account-cart-link" type="button" onClick={onOpenCart}>Cart <span>{cartCount}</span></button><button className="account-signout-button" type="button" onClick={signOut} disabled={signingOut}><LogoutIcon sx={{ fontSize: 17 }} aria-hidden="true" /> {signingOut ? "Signing out…" : "Sign out"}</button></div></header>
    <div className="account-layout">
      <nav className="account-sidebar" aria-label="Account sections">
        {accountSections.map(({ id, label, icon: SectionIcon }) => (
          <button key={id} className={`${activeSection === id ? "active" : ""}${id === "logout" ? " account-logout-button" : ""}`} onClick={() => {
            if (id === "logout") signOut();
            else if (id === "cart") onOpenCart();
            else onSelectSection(id);
          }}>
            <SectionIcon sx={{ fontSize: 20 }} aria-hidden="true" />
            <span>{label}</span>
            {id === "wishlist" && wishlistProducts.length > 0 && <b>{wishlistProducts.length}</b>}
            {id === "cart" && cartCount > 0 && <b>{cartCount}</b>}
          </button>
        ))}
      </nav>
      <section className="account-content">
        {mobileSectionOpen && <button className="account-mobile-back" type="button" onClick={onBackToSections}>← Back to account sections</button>}
        {activeSection === "orders" && <section className="customer-orders">
          <div className="account-section-heading"><div><p className="eyebrow">Your account</p><h2>Order history</h2></div><span>{orders?.length ?? 0} {(orders?.length ?? 0) === 1 ? "order" : "orders"}</span></div>
          {orders === null && <p className="customer-account-notice">Loading your orders…</p>}
          {ordersError && <p className="customer-account-notice" role="alert">{ordersError}</p>}
          {!ordersError && orders?.length === 0 && <div className="account-empty"><p className="eyebrow">Orders</p><h2>No orders yet</h2><p>Your placed orders will appear here.</p></div>}
          {(orders || []).map((order) => <article className="customer-order-card" key={order.id}>
            <div className="customer-order-heading"><div><span>Placed {formatDate(order.created_at)}</span><strong>{order.status.replaceAll("_", " ")}</strong></div><b>{new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(Number(order.total))}</b></div>
            <ul>{order.items.map((item) => <li key={`${order.id}-${item.product_id}`}>{item.name} × {item.quantity}</li>)}</ul>
            <p className="customer-order-payment">Mobile Money · Awaiting manual payment verification</p>
          </article>)}
        </section>}
        {activeSection === "wishlist" && <section>
          <div className="account-section-heading wishlist-heading"><div><p className="eyebrow">Saved for later</p><h2>My Wishlist <span aria-hidden="true">♥</span></h2></div><span>{wishlistProducts.length} items</span></div>
          {wishlistProducts.length ? <div className="wishlist-grid">{wishlistProducts.map((product) => <article className="wishlist-card" key={product.id}><div className="wishlist-card-image" style={{ backgroundImage: `url(${product.image})` }} role="img" aria-label={product.name}><button className="wishlist-remove" onClick={() => onRemoveFromWishlist(product)} aria-label={`Remove ${product.name} from wishlist`}>×</button>{product.badge && <span className="product-badge">{product.badge}</span>}</div><div className="wishlist-card-info"><p className="eyebrow">{product.category}</p><h3>{product.name}</h3><p className="wishlist-card-price">{new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(product.price)}</p><button className="add-to-cart-button" onClick={() => onAddToCart(product)}>Add to cart</button></div></article>)}</div> : <div className="wishlist-empty"><h3>Your wishlist is empty</h3><p>Save products you love and find them here later.</p></div>}
        </section>}
        {activeSection === "profile" && <div className="account-empty"><p className="eyebrow">Your details</p><h2>My Profile</h2><p><strong>Name</strong><br />{fullName}</p>{session.user.username && <p><strong>Username</strong><br />{session.user.username}</p>}{session.user.phone && <p><strong>Phone number</strong><br />{session.user.phone}</p>}<p>Your account details are securely managed in the store database.</p></div>}
        {activeSection === "addresses" && <section className="customer-account-tools"><div className="account-section-heading"><div><p className="eyebrow">Delivery details</p><h2>Delivery Addresses</h2></div></div><article className="account-tool-card account-settings-form"><p className="account-tool-muted">These details are saved automatically and can be edited anytime.</p><label htmlFor="account-delivery-address">Delivery address<textarea id="account-delivery-address" autoComplete="street-address" minLength={8} value={accountSettings.deliveryAddress} onChange={(event) => { setDeliverySaveStatus(""); setAccountSettings((current) => ({ ...current, deliveryAddress: event.target.value })); }} placeholder="House number, street, landmark" /></label><label htmlFor="account-delivery-city">City / town<input id="account-delivery-city" autoComplete="address-level2" minLength={2} value={accountSettings.deliveryCity} onChange={(event) => { setDeliverySaveStatus(""); setAccountSettings((current) => ({ ...current, deliveryCity: event.target.value })); }} placeholder="e.g. Accra" /></label><p className="account-profile-save-status" role="status" aria-live="polite">{deliverySaveStatus || "Your saved details will be used at checkout."}</p></article></section>}
        {activeSection === "payments" && <div className="account-empty"><p className="eyebrow">Secure payments</p><h2>Payment Methods</h2><p>Payment is currently handled through Mobile Money at checkout. Payment card details are not stored in your account.</p></div>}
        {activeSection === "returns" && <div className="account-empty account-help-card"><p className="eyebrow">Order support</p><h2>Returns &amp; Refunds</h2><p>For help with a return or refund, contact our support team with your order number.</p><div className="account-help-actions">{whatsappHref ? <a className="account-help-whatsapp" href={whatsappHref} target="_blank" rel="noreferrer"><WhatsAppIcon aria-hidden="true" /> WhatsApp</a> : <span className="account-help-whatsapp contact-unavailable"><WhatsAppIcon aria-hidden="true" /> WhatsApp</span>}</div></div>}
        {activeSection === "notifications" && <section className="customer-account-tools">
          <div className="account-section-heading"><div><p className="eyebrow">Stay in the loop</p><h2>Notifications</h2></div></div>
          <article className="account-tool-card">
            <div className="account-tool-heading"><div><NotificationsIcon aria-hidden="true" /><div><h3>Order status updates</h3><p>See the latest payment, processing, and delivery status for your orders.</p></div></div></div>
            {orders === null && <p className="customer-account-notice">Loading your order updates…</p>}
            {ordersError && <p className="customer-account-notice" role="alert">{ordersError}</p>}
            {!ordersError && orders?.length === 0 && <p className="account-tool-muted">No order updates yet. Updates will appear here after you place an order.</p>}
            {(orders || []).map((order) => <article className="account-notification-item" key={order.id}>
              <span className="account-notification-status"><span aria-hidden="true" />{orderStatusLabel(order.status)}</span>
              <div><strong>Order {order.id.slice(0, 8).toUpperCase()}</strong><p>{formatDate(order.created_at)} · {new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(Number(order.total))}</p></div>
            </article>)}
          </article>
          <article className="account-tool-card account-notification-preference">
            <div className="account-tool-heading"><div><NotificationsIcon aria-hidden="true" /><div><h3>Browser notifications</h3><p>Get an alert when an order’s status changes while this account is open.</p></div></div>
              {notificationPermission === "unsupported"
                ? <span className="account-tool-muted">Not supported</span>
                : <button className="account-preference-toggle" type="button" onClick={toggleOrderNotifications} disabled={notificationPermission === null} aria-pressed={notificationsEnabled}>{notificationsEnabled ? "Turn off" : "Turn on"}</button>}
            </div>
            {notificationPermission === "denied" && <p className="account-tool-muted">Notifications are blocked in your browser. Update your browser’s site permissions to enable them.</p>}
            {notificationMessage && <p className="customer-account-notice" role="status">{notificationMessage}</p>}
            <p className="account-tool-muted">Email and SMS alerts aren’t available yet. Browser notifications are saved for this device.</p>
          </article>
        </section>}
        {activeSection === "settings" && <section className="customer-account-tools">
          <div className="account-section-heading"><div><p className="eyebrow">Profile &amp; security</p><h2>Settings</h2></div></div>
          <article className="account-tool-card account-settings-form">
            <div className="account-tool-heading"><div><PersonIcon aria-hidden="true" /><div><h3>Personal details</h3><p>Update your name and optionally add an email address.</p></div></div></div>
            {session.user.phone && <p className="account-tool-muted">Verified sign-in phone: {session.user.phone}</p>}
            <label htmlFor="account-settings-name">Full name<input id="account-settings-name" autoComplete="name" required minLength={2} maxLength={120} value={accountSettings.fullName} onChange={(event) => { setProfileSaveStatus(""); setAccountSettings({ ...accountSettings, fullName: event.target.value }); }} /></label>
            {session.user.email && <label htmlFor="account-settings-email">Email address<input id="account-settings-email" autoComplete="email" type="email" required maxLength={254} value={accountSettings.email} onChange={(event) => { setProfileSaveStatus(""); setAccountSettings({ ...accountSettings, email: event.target.value }); }} /></label>}
            <p className="account-profile-save-status" role="status" aria-live="polite">{profileChangesPending && !profileDetailsValid ? "Enter a valid name and contact email to save your changes." : profileChangesPending && profileSaveStatus !== "Saving profile changes…" && !profileSaveStatus.startsWith("Could not save") ? "Unsaved profile changes." : profileSaveStatus || "Profile details save automatically as you edit them."}</p>
            {profileSaveStatus.startsWith("Could not save") && <button className="account-text-action" type="button" onClick={() => setProfileSaveRevision((revision) => revision + 1)}>Retry saving profile</button>}
          </article>
          <form className="account-tool-card account-settings-form" onSubmit={changePassword}>
            <div className="account-settings-divider" />
            <div className="account-tool-heading"><div><LockIcon aria-hidden="true" /><div><h3>Change password</h3><p>Leave these fields blank if you don’t want to change your password.</p></div></div></div>
            <label htmlFor="account-current-password">Current password<span className="customer-password-field"><input id="account-current-password" autoComplete="current-password" type={showCurrentAccountPassword ? "text" : "password"} value={accountSettings.currentPassword} onChange={(event) => setAccountSettings({ ...accountSettings, currentPassword: event.target.value })} /><button type="button" className="customer-password-toggle" onClick={() => setShowCurrentAccountPassword((visible) => !visible)} aria-label={showCurrentAccountPassword ? "Hide current password" : "Show current password"} aria-pressed={showCurrentAccountPassword}>{showCurrentAccountPassword ? <VisibilityOffIcon fontSize="small" aria-hidden="true" /> : <VisibilityIcon fontSize="small" aria-hidden="true" />}</button></span></label>
            <div className="account-settings-password-row"><label htmlFor="account-new-password">New password<span className="customer-password-field"><input id="account-new-password" autoComplete="new-password" type={showNewAccountPassword ? "text" : "password"} minLength={8} maxLength={128} value={accountSettings.newPassword} onChange={(event) => setAccountSettings({ ...accountSettings, newPassword: event.target.value })} /><button type="button" className="customer-password-toggle" onClick={() => setShowNewAccountPassword((visible) => !visible)} aria-label={showNewAccountPassword ? "Hide new password" : "Show new password"} aria-pressed={showNewAccountPassword}>{showNewAccountPassword ? <VisibilityOffIcon fontSize="small" aria-hidden="true" /> : <VisibilityIcon fontSize="small" aria-hidden="true" />}</button></span></label><label htmlFor="account-confirm-password">Confirm new password<span className="customer-password-field"><input id="account-confirm-password" autoComplete="new-password" type={showConfirmAccountPassword ? "text" : "password"} minLength={8} maxLength={128} value={accountSettings.confirmPassword} onChange={(event) => setAccountSettings({ ...accountSettings, confirmPassword: event.target.value })} /><button type="button" className="customer-password-toggle" onClick={() => setShowConfirmAccountPassword((visible) => !visible)} aria-label={showConfirmAccountPassword ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirmAccountPassword}>{showConfirmAccountPassword ? <VisibilityOffIcon fontSize="small" aria-hidden="true" /> : <VisibilityIcon fontSize="small" aria-hidden="true" />}</button></span></label></div>
            {message && <p className="customer-account-notice" role="status">{message}</p>}
            <button className="primary-button wide" type="submit" disabled={settingsBusy}>{settingsBusy ? "Changing password…" : "Change password"}</button>
          </form>
          <p className="account-tool-muted account-settings-signout">Sign out of this account from the account header whenever you’re using a shared device.</p>
        </section>}
        {activeSection === "support" && <div className="account-empty account-help-card"><p className="eyebrow">We’re here to help</p><h2>Help &amp; Support</h2><p>Our team is ready to help with your orders and any questions.</p><div className="account-help-actions">{whatsappHref ? <a className="account-help-whatsapp" href={whatsappHref} target="_blank" rel="noreferrer"><WhatsAppIcon aria-hidden="true" /> WhatsApp</a> : <span className="account-help-whatsapp contact-unavailable"><WhatsAppIcon aria-hidden="true" /> WhatsApp</span>}</div></div>}
        {message && <p className="customer-account-notice" role="status">{message}</p>}
      </section>
    </div>
  </section>;
}
