"use client";

import { useState } from "react";
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminLogin({ configured }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error || "Unable to sign in."); return; }
      router.refresh();
    } catch { setError("Unable to reach the secure sign-in service."); }
    finally { setSubmitting(false); }
  }

  return <main className="atelier-shell">
    <section className="admin-login-layout" aria-labelledby="admin-login-title">
      <div className="atelier-brand brand-mark" aria-label="SabbyBestCollection">
        <span className="brand-word">Sabby</span>
        <span className="brand-tradings">BestCollection</span>
      </div>
      <div className="admin-login-main">
        <div className="admin-login-heading">
          <h1 id="admin-login-title">Welcome admin</h1>
          <p className="atelier-intro">{configured ? "Sign in with your admin credentials to continue." : "Admin access needs to be configured before you can sign in."}</p>
        </div>
        {configured ? <form className="admin-login-form" onSubmit={submit}>
          <label htmlFor="admin-username">Username</label>
          <input id="admin-username" type="text" value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" autoFocus placeholder="e.g. storeadmin" />
          <label htmlFor="admin-password">Password</label>
          <span className="admin-login-password-field">
            <input id="admin-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" placeholder="Enter your admin password" />
            <button type="button" className="admin-login-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
              {showPassword ? <VisibilityOffIcon aria-hidden="true" /> : <VisibilityIcon aria-hidden="true" />}
            </button>
          </span>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" disabled={submitting}>
            <span>{submitting ? "Signing in…" : "Sign in to dashboard"}</span><span aria-hidden="true">→</span>
          </button>
          <p className="admin-login-security">Your session is private and protected.</p>
        </form> : <div className="setup-note">
          <strong>Finish admin setup</strong>
          <p>Set <code>ADMIN_USERNAME</code>, <code>ADMIN_PASSWORD</code>, and a random 32+ character <code>ADMIN_SESSION_SECRET</code> in <code>.env.local</code> for local development, or your hosting provider’s environment for production. Restart the app after changing them.</p>
        </div>}
        <div className="admin-login-footer">
          <Link className="return-link" href="/">← Return to storefront</Link>
        </div>
      </div>
    </section>
  </main>;
}
