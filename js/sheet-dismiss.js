// Keep vertical scrolling in the sheet body; only its header/handle starts a dismiss gesture.
export function shouldDismissSwipe({ distanceX, distanceY, elapsedMs }) {
  if (distanceY <= Math.abs(distanceX) * 1.5) return false;
  return distanceY >= 80 || (distanceY >= 42 && distanceY / Math.max(elapsedMs, 1) >= 0.55);
}

export function bindSheetDismiss(sheet, close) {
  let gesture = null;
  let suppressClick = false;
  const resetStyle = () => {
    sheet.style.removeProperty("transform");
    sheet.style.removeProperty("transition");
  };
  sheet.addEventListener("pointerdown", event => {
    suppressClick = false;
    if (event.button !== 0 || !event.isPrimary ||
        !event.target.closest(".sheet-drag-region") ||
        event.target.closest("button, a, input, label, select, textarea")) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, start: event.timeStamp, moved: false };
    sheet.setPointerCapture(event.pointerId);
  });
  sheet.addEventListener("pointermove", event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const x = event.clientX - gesture.x;
    const y = event.clientY - gesture.y;
    if (y > 8 && y > Math.abs(x) * 1.2) gesture.moved = true;
    if (!gesture.moved) return;
    sheet.style.transition = "none";
    sheet.style.transform = `translateY(${Math.max(0, y)}px)`;
    if (event.cancelable) event.preventDefault();
  });
  sheet.addEventListener("pointerup", event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dismiss = gesture.moved && shouldDismissSwipe({
      distanceX: event.clientX - gesture.x, distanceY: event.clientY - gesture.y,
      elapsedMs: event.timeStamp - gesture.start,
    });
    suppressClick = gesture.moved;
    gesture = null;
    if (sheet.hasPointerCapture(event.pointerId)) sheet.releasePointerCapture(event.pointerId);
    resetStyle();
    if (dismiss) { event.preventDefault(); close(); }
  });
  const cancel = () => { gesture = null; resetStyle(); };
  sheet.addEventListener("pointercancel", cancel);
  sheet.addEventListener("lostpointercapture", cancel);
  sheet.addEventListener("close", cancel);
  sheet.addEventListener("click", event => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}
