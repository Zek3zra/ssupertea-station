// Orders retain their checkout contact even when the customer later edits a profile.
export function createOrderContact(phone) {
  const section = document.createElement("div");
  section.className = "staff-order-contact";
  const label = document.createElement("span");
  label.textContent = "Customer mobile";
  section.append(label);
  if (typeof phone === "string" && /^\+639\d{9}$/.test(phone)) {
    const link = document.createElement("a");
    link.href = `tel:${phone}`;
    link.textContent = phone;
    link.setAttribute("aria-label", `Call customer at ${phone}`);
    section.append(link);
  } else {
    const note = document.createElement("span");
    note.textContent = "No contact number recorded";
    section.append(note);
  }
  return section;
}
