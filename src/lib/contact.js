const whatsappNumber = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "").replace(/\D/g, "");

export const whatsappHref = whatsappNumber ? `https://wa.me/${whatsappNumber}` : "";
