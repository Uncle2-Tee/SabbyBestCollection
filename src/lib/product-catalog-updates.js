const channelName = "virtuous-matess-ventures-product-catalog-updates";

export function notifyProductCatalogUpdate() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(channelName);
  channel.postMessage({ type: "catalog-updated" });
  channel.close();
}

export function subscribeToProductCatalogUpdates(listener) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(channelName);
  channel.onmessage = (event) => {
    if (event.data?.type === "catalog-updated") listener();
  };
  return () => channel.close();
}
