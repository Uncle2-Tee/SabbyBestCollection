import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/customer-auth";
import { prisma } from "../../../lib/prisma";

export const runtime = "nodejs";

function orderToApi(order) {
  return {
    id: order.id,
    user_id: order.userId,
    status: order.status,
    payment_method: order.paymentMethod,
    items: order.items,
    subtotal: Number(order.subtotal),
    shipping: Number(order.shipping),
    total: Number(order.total),
    customer_name: order.customerName,
    customer_email: order.customerEmail,
    phone: order.phone,
    shipping_address: order.shippingAddress,
    created_at: order.createdAt.toISOString(),
  };
}

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to view your orders." }, { status: 401 });
  try {
    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ orders: orders.map(orderToApi) });
  } catch (error) {
    console.error("Could not load customer orders:", error);
    return NextResponse.json({ error: "Could not load your orders." }, { status: 503 });
  }
}

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sign in before placing an order." }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid order details." }, { status: 400 });
  }
  const { items, customerName, phone, shippingAddress, city } = body || {};
  if (!Array.isArray(items) || items.length < 1 || items.length > 20
    || items.some((item) => !item || typeof item.productId !== "string" || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)
    || typeof customerName !== "string" || customerName.trim().length < 2 || customerName.trim().length > 120
    || typeof phone !== "string" || phone.trim().length < 7 || phone.trim().length > 30
    || typeof shippingAddress !== "string" || shippingAddress.trim().length < 8
    || typeof city !== "string" || city.trim().length < 2 || city.trim().length > 120) {
    return NextResponse.json({ error: "Provide a valid name, cart, phone number, delivery address, and city or town." }, { status: 400 });
  }

  try {
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, price: true, image: true, size: true, category: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    if (productIds.some((id) => !byId.has(id))) {
      return NextResponse.json({ error: "One or more cart products are no longer available. Refresh your cart and try again." }, { status: 409 });
    }

    const orderItems = items.map(({ productId, quantity }) => {
      const product = byId.get(productId);
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
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        status: "awaiting_payment",
        paymentMethod: "paystack",
        items: orderItems,
        subtotal,
        shipping,
        total: Number((subtotal + shipping).toFixed(2)),
        customerName: customerName.trim(),
        customerEmail: user.email || null,
        phone: phone.trim(),
        shippingAddress: `${shippingAddress.trim()}\nCity / town: ${city.trim()}`,
      },
    });
    return NextResponse.json({ order: orderToApi(order) }, { status: 201 });
  } catch (error) {
    console.error("Could not create customer order:", error);
    return NextResponse.json({ error: "Could not save your order. Please try again." }, { status: 500 });
  }
}
