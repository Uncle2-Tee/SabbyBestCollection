import { prisma } from "./prisma";
import { verifyPaystackTransaction } from "./paystack";

export async function verifyAndRecordPaystackPayment(reference) {
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { reference },
    include: { order: true },
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
    || transaction.currency !== attempt.currency) {
    return { verified: false, reason: "transaction_mismatch" };
  }

  await prisma.$transaction(async (database) => {
    const updatedAttempt = await database.paymentAttempt.updateMany({
      where: { id: attempt.id, status: "pending" },
      data: { status: "successful" },
    });
    if (updatedAttempt.count === 0) {
      const currentAttempt = await database.paymentAttempt.findUnique({ where: { id: attempt.id } });
      if (currentAttempt?.status === "successful") return;
      throw new Error("Paystack payment attempt changed before verification was recorded.");
    }

    await database.order.updateMany({
      where: { id: attempt.orderId, status: "awaiting_payment" },
      data: { status: "payment_review" },
    });
  });

  return { verified: true, orderId: attempt.orderId };
}
