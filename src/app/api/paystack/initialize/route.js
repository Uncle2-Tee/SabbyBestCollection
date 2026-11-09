import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/customer-auth";
import { prisma } from "../../../../lib/prisma";
import { getPaystackCallbackUrl, getPaystackSecretKey, initializePaystackTransaction } from "../../../../lib/paystack";

export const runtime = "nodejs";

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sign in before starting payment." }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid checkout details." }, { status: 400 });
  }
  const { items, customerName, customerEmail, phone, shippingAddress, city } = body || {};
  if (!Array.isArray(items) || items.length < 1 || items.length > 20
    || items.some((item) => !item || typeof item.productId !== "string" || !item.productId.trim() || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)
    || new Set(items.map((item) => item.productId)).size !== items.length
    || typeof customerName !== "string" || customerName.trim().length < 2 || customerName.trim().length > 120
    || typeof customerEmail !== "string" || customerEmail.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())
    || typeof phone !== "string" || phone.trim().length < 7 || phone.trim().length > 30
    || typeof shippingAddress !== "string" || shippingAddress.trim().length < 8 || shippingAddress.trim().length > 1000
    || typeof city !== "string" || city.trim().length < 2 || city.trim().length > 120) {
    return NextResponse.json({ error: "Provide valid cart, contact, and delivery details." }, { status: 400 });
  }

  try {
    getPaystackSecretKey();
  } catch {
    return NextResponse.json({ error: "Paystack is not configured for payments." }, { status: 503 });
  }

  try {
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, price: true, image: true, size: true, category: true },
    });
    const productsById = new Map(products.map((product) => [product.id, product]));
    if (productIds.some((id) => !productsById.has(id))) {
      return NextResponse.json({ error: "One or more cart products are no longer available. Refresh your cart and try again." }, { status: 409 });
    }

    const orderItems = items.map(({ productId, quantity }) => {
      const product = productsById.get(productId);
      const price = Number(product.price);
      return {
        product_id: product.id,
        name: product.name,
        category: product.category,
        size: product.size,
        image: product.image,
        price,
        quantity,
        line_total: Number((price * quantity).toFixed(2)),
      };
    });
    const subtotal = Number(orderItems.reduce((sum, item) => sum + item.line_total, 0).toFixed(2));
    const shipping = subtotal >= 60 ? 0 : 6;
    const total = Number((subtotal + shipping).toFixed(2));
    const amount = Math.round(total * 100);
    if (!Number.isSafeInteger(amount) || amount < 1) {
      return NextResponse.json({ error: "The checkout total is invalid for payment." }, { status: 400 });
    }

    let callbackUrl;
    try {
      callbackUrl = getPaystackCallbackUrl(request.url);
    } catch {
      return NextResponse.json({ error: "Configure PAYSTACK_CALLBACK_URL as the HTTPS /api/paystack/callback URL." }, { status: 503 });
    }

    const attempt = await prisma.paymentAttempt.create({
      data: {
        reference: `sbc_${randomUUID().replaceAll("-", "")}`,
        amount,
        userId: user.id,
        checkoutData: {
          items: orderItems,
          subtotal,
          shipping,
          total,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim().toLowerCase(),
          phone: phone.trim(),
          shippingAddress: `${shippingAddress.trim()}\nCity / town: ${city.trim()}`,
        },
      },
    });
    try {
      const transaction = await initializePaystackTransaction({
        email: customerEmail.trim().toLowerCase(),
        amount,
        reference: attempt.reference,
        callbackUrl,
        metadata: { payment_attempt_id: attempt.id },
      });
      if (transaction.reference !== attempt.reference) {
        throw new Error("Paystack returned a mismatched transaction reference.");
      }
      await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "pending" } });
      return NextResponse.json({ authorizationUrl: transaction.authorizationUrl });
    } catch (error) {
      await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: "failed", checkoutData: null },
      });
      console.error("Could not initialize Paystack checkout:", error);
      return NextResponse.json({ error: "Could not start Paystack checkout. Please try again." }, { status: 502 });
    }
  } catch (error) {
    console.error("Could not prepare Paystack payment:", error);
    return NextResponse.json({ error: "Could not prepare checkout for payment." }, { status: 500 });
  }
}
