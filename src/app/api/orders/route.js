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
