import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { CUSTOMER_SESSION_COOKIE, formatCustomerName, getAuthenticatedUser, hashPassword, publicCustomer, verifyPassword } from "../../../../lib/customer-auth";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

export async function PATCH(request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: "Sign in to update your account." }, { status: 401 });

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid account settings." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid account settings." }, { status: 400 });
    }

    const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : undefined;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : undefined;
    const deliveryAddress = typeof body?.deliveryAddress === "string" ? body.deliveryAddress.trim() : undefined;
    const deliveryCity = typeof body?.deliveryCity === "string" ? body.deliveryCity.trim() : undefined;
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    const hasName = Object.hasOwn(body, "fullName");
    const hasEmail = Object.hasOwn(body, "email");
    const hasDeliveryAddress = Object.hasOwn(body, "deliveryAddress");
    const hasDeliveryCity = Object.hasOwn(body, "deliveryCity");
    const hasPassword = Object.hasOwn(body, "newPassword") || Object.hasOwn(body, "currentPassword");

    if ((!hasName && !hasEmail && !hasDeliveryAddress && !hasDeliveryCity && !hasPassword)
      || (hasName && (typeof fullName !== "string" || fullName.length < 2 || fullName.length > 120))
      || (hasEmail && (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
      || (hasDeliveryAddress && (typeof deliveryAddress !== "string" || (deliveryAddress && deliveryAddress.length < 8)))
      || (hasDeliveryCity && (typeof deliveryCity !== "string" || (deliveryCity && deliveryCity.length < 2)))
      || (hasPassword && (!currentPassword || newPassword.length < 8 || newPassword.length > 128))) {
      return NextResponse.json({ error: "Enter a valid name and email. Password changes require your current password and a new password of 8 to 128 characters." }, { status: 400 });
    }

    if (hasPassword && !(await verifyPassword(currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
    }

    const data = { updatedAt: new Date() };
    if (hasName) data.fullName = formatCustomerName(fullName);
    if (hasEmail) data.email = email;
    if (hasDeliveryAddress) data.deliveryAddress = deliveryAddress || null;
    if (hasDeliveryCity) data.deliveryCity = deliveryCity || null;
    if (hasPassword) data.passwordHash = await hashPassword(newPassword);

    const sessionToken = request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
    const currentTokenHash = sessionToken
      ? createHash("sha256").update(sessionToken).digest("hex")
      : "";
    const profile = hasPassword
      ? await prisma.$transaction(async (transaction) => {
        const updated = await transaction.customerProfile.update({ where: { id: user.id }, data });
        await transaction.customerSession.deleteMany({
          where: { userId: user.id, tokenHash: { not: currentTokenHash } },
        });
        return updated;
      })
      : await prisma.customerProfile.update({ where: { id: user.id }, data });

    return NextResponse.json({ user: publicCustomer(profile) });
  } catch (error) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "That email address is already linked to another account." }, { status: 409 });
    }
    console.error("Could not update customer account:", error);
    return NextResponse.json({ error: "Could not update your account. Please try again." }, { status: 500 });
  }
}
