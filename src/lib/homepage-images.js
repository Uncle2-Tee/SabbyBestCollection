export const defaultHomepageImages = {
  heroEditorial: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=1200&q=88",
  heroLookbook: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=640&q=88",
  heroDetail: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=640&q=88",
};

export function validHomepageImages(images) {
  return Boolean(
    images
    && typeof images === "object"
    && Object.keys(defaultHomepageImages).every((key) => {
      const value = images[key];
      if (typeof value !== "string" || value.length > 2048) return false;
      if (/^\/api\/product-images\?id=[0-9a-f-]{36}$/i.test(value)) return true;
      try {
        const url = new URL(value);
        return ["https:", "http:"].includes(url.protocol) && url.href === value;
      } catch {
        return false;
      }
    }),
  );
}
