import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, getAdminSessionUsername, hasValidAdminSession, isAdminAuthConfigured } from "../../lib/admin-auth";
import AdminDashboard from "./admin-dashboard";
import AdminLogin from "./admin-login";
import "./admin.css";

export const metadata = {
  title: "Store Admin | SabbyBestCollection",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const authenticated = await hasValidAdminSession(session);

  return authenticated
    ? <AdminDashboard username={getAdminSessionUsername(session)} />
    : <AdminLogin configured={isAdminAuthConfigured()} />;
}
