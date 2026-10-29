import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionOptions,
  changeAdminPassword,
  hasValidAdminSession,
} from "../../../../lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request) {
  const cookieStore = await cookies();
  if (!(await hasValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value))) {
    return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  }

  let currentPassword;
  let newPassword;
  try {
    ({ currentPassword, newPassword } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid password change request." }, { status: 400 });
  }

  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return NextResponse.json({ error: "Enter your current and new passwords." }, { status: 400 });
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    return NextResponse.json({ error: "Use a new password between 8 and 128 characters." }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "Choose a password you are not already using." }, { status: 400 });
  }

  try {
    const session = await changeAdminPassword(currentPassword, newPassword);
    if (!session) return NextResponse.json({ error: "Your current password is incorrect." }, { status: 400 });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, session.value, adminSessionOptions);
    return response;
  } catch (error) {
    console.error("Could not update the admin password:", error);
    return NextResponse.json({ error: "Could not update the password right now." }, { status: 503 });
  }
}