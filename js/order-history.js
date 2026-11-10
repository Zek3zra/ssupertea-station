const STATUS = { pending: "Pending", preparing: "Preparing", dispatched: "On delivery / ready for pickup", completed: "Completed", cancelled: "Cancelled" };
export function describeOrderEvent(event) {
  if (event.event_type === "status_changed") return `${STATUS[event.from_status] || "Previous status"} → ${STATUS[event.to_status] || "Updated"}`;
  return { history_started: "Activity logging started", order_created: "Order placed", order_updated: "Order details updated", rider_assigned: "Rider assigned", rider_reassigned: "Rider reassigned", assignment_updated: "Rider assignment updated" }[event.event_type] || "Order updated";
}
export async function loadOrderHistory(client, orderId) {
  const { data, error } = await client.from("order_events")
    .select("id,event_type,occurred_at,actor_kind,from_status,to_status")
    .eq("order_id", orderId).order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(50)
    .abortSignal(AbortSignal.timeout(10000));
  if (error) throw new Error("Activity could not load. Try Refresh activity.");
  return data || [];
}
export function createOrderHistoryPanel({ client, orderId, isCurrent, document, formatTime }) {
  const section = document.createElement("section"); section.className = "admin-order-history";
  const title = document.createElement("h3"); title.textContent = "Order activity";
  const note = document.createElement("p"); note.textContent = "Latest 50 actions. Older orders show when activity logging began.";
  const list = document.createElement("ol"); list.setAttribute("aria-live", "polite");
  const refresh = document.createElement("button"); refresh.type = "button"; refresh.textContent = "Refresh activity";
  let sequence = 0;
  async function load() {
    const current = ++sequence; refresh.disabled = true; list.textContent = "Loading activity…";
    try {
      const events = await loadOrderHistory(client, orderId);
      if (current !== sequence || !isCurrent()) return;
      list.replaceChildren();
      for (const event of events) {
        const item = document.createElement("li"), action = document.createElement("strong"), detail = document.createElement("span");
        action.textContent = describeOrderEvent(event);
        const actor = { customer: "Customer", staff: "Staff", system: "System" }[event.actor_kind] || "System";
        detail.textContent = `${actor} · ${formatTime(event.occurred_at)}`;
        item.append(action, detail); list.append(item);
      }
      if (!events.length) list.textContent = "No recorded activity yet.";
    } catch (error) { if (current === sequence && isCurrent()) list.textContent = error.message; }
    finally { if (current === sequence && isCurrent()) refresh.disabled = false; }
  }
  refresh.addEventListener("click", load); section.append(title, note, list, refresh); load();
  return section;
}
