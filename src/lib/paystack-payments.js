import { prisma } from "./prisma";
import { verifyPaystackTransaction } from "./paystack";

export async function verifyAndRecordPaystackPayment(reference) {
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { reference },
  });
  if (!attempt) return { verified: false, reason: "unknown_reference" };
  if (attempt.status === "successful") {
    return { verified: true, orderId: attempt.orderId };
  }
  if (attempt.status !== "pending") return { verified: false, reason: "attempt_not_pending" };

  const transaction = await verifyPaystackTransaction(reference);
  if (transaction.reference !== reference
    || transaction.status !== "success"
    || Number(transaction.amount) !== attempt.amount
    || transaction.currency !== attempt.currency
    || transaction.metadata?.payment_attempt_id !== attempt.id) {
    return { verified: false, reason: "transaction_mismatch" };
  }

  const orderId = await prisma.$transaction(async (database) => {
    const updatedAttempt = await database.paymentAttempt.updateMany({
      where: { id: attempt.id, status: "pending" },
      data: { status: "successful" },
    });
    if (updatedAttempt.count === 0) {
      const currentAttempt = await database.paymentAttempt.findUnique({ where: { id: attempt.id } });
      if (currentAttempt?.status === "successful") return currentAttempt.orderId;
      throw new Error("Paystack payment attempt changed before verification was recorded.");
    }

    if (attempt.orderId) {
      await database.order.updateMany({
        where: { id: attempt.orderId, status: "awaiting_payment" },
        data: { status: "payment_review" },
      });
      return attempt.orderId;
    }

    const checkout = attempt.checkoutData;
    if (!attempt.userId || !checkout || !Array.isArray(checkout.items) || checkout.items.length === 0) {
      throw new Error("Verified payment is missing its checkout details.");
    }

    const order = await database.order.create({
      data: {
        userId: attempt.userId,
        status: "payment_review",
        paymentMethod: "paystack",
        items: checkout.items,
        subtotal: checkout.subtotal,
        shipping: checkout.shipping,
        total: checkout.total,
        customerName: checkout.customerName,
        customerEmail: checkout.customerEmail,
        phone: checkout.phone,
        shippingAddress: checkout.shippingAddress,
      },
    });
    const customer = await database.customerProfile.findUnique({
      where: { id: attempt.userId },
      select: { cart: true },
    });
    if (Array.isArray(customer?.cart)) {
      const purchasedQuantities = new Map(checkout.items.map((item) => [item.product_id, item.quantity]));
      const remainingCart = customer.cart.flatMap((item) => {
        const purchasedQuantity = purchasedQuantities.get(item?.productId) || 0;
        if (!purchasedQuantity || !Number.isInteger(item.quantity)) return [item];
        const quantity = item.quantity - purchasedQuantity;
        purchasedQuantities.delete(item.productId);
        return quantity > 0 ? [{ ...item, quantity }] : [];
      });
      await database.customerProfile.update({
        where: { id: attempt.userId },
        data: { cart: remainingCart },
      });
    }
    await database.paymentAttempt.update({
      where: { id: attempt.id },
      data: { orderId: order.id, checkoutData: null },
    });
    return order.id;
  });

  return { verified: true, orderId };
}
