const channelName = "sabbybestcollection-customer-order-updates";

export function notifyCustomerOrderUpdate() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(channelName);
  channel.postMessage({ type: "order-updated" });
  channel.close();
}

export function subscribeToCustomerOrderUpdates(listener) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(channelName);
  channel.onmessage = (event) => {
    if (event.data?.type === "order-updated") listener();
  };
  return () => channel.close();
}
