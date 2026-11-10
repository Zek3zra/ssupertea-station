import { customerSupabase, getVerifiedAccountSession } from "/js/supabase-config.js";
import { catalogIcon, safeImageUrl } from "/js/catalog.js";
import { bindSheetDismiss } from "/js/sheet-dismiss.js";
import { createMenuEditorRepository, menuItemAvailable, createMenuAvailabilityDraft, menuAvailabilityChanges } from "/js/menu-editor-data.js";

const repository = createMenuEditorRepository(customerSupabase, getVerifiedAccountSession);
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const state = { products: [], loaded: false, loading: false, busy: false, userId: null, revision: 0, loadSequence: 0, selectedId: null, newId: null, deleteId: null, availability: null, dirtyForms: new Set() };
const el = {};
const $ = id => document.getElementById(id);
const optionKey = kind => kind === "variants" ? "menu_catalog_variants" : "menu_catalog_addons";
const selectedProduct = () => state.products.find(product => product.id === state.selectedId);
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function status(message, error = false, inDialog = false) {
  const target = inDialog ? el.message : el.status;
  target.textContent = message;
  target.dataset.type = error ? "error" : "success";
}
function setBusy(value) {
  state.busy = value;
  el.dialog.setAttribute("aria-busy", String(value));
  for (const control of el.dialog.querySelectorAll("input,select,textarea,button")) control.disabled = value;
  el.add.disabled = value || state.loading || !state.loaded;
  el.refresh.disabled = value || state.loading;
  for (const control of el.list.querySelectorAll("button")) control.disabled = value;
  $("menu-delete-confirm").disabled = value; $("menu-delete-cancel").disabled = value;
}
function productValues(form) {
  const values = {};
  for (const name of ["name", "category", "description", "icon", "image_url", "variant_label", "sort_order"]) values[name] = form.elements.namedItem(name).value;
  for (const name of ["published", "featured", "customizable"]) values[name] = form.elements.namedItem(name).checked;
  values.active = $("menu-item-available").checked;
  return values;
}
function optionValues(form) {
  return { label: form.elements.namedItem("label").value, price: form.elements.namedItem("price").value, active: form.elements.namedItem("active").checked, sort_order: Number(form.dataset.sortOrder || 0) };
}
function showWorkspace(menu) {
  el.orders.hidden = menu;
  el.manager.hidden = !menu;
  el.menuButton.setAttribute("aria-pressed", String(menu));
  el.ordersButton.setAttribute("aria-pressed", String(!menu));
  if (menu && !state.loaded && !state.loading) loadMenu();
}
async function loadMenu() {
  if (state.busy) return;
  const sequence = ++state.loadSequence, revision = state.revision;
  state.loading = true; el.add.disabled = true; el.refresh.disabled = true;
  status("Loading the menu…");
  try {
    const { products, userId } = await repository.load();
    if (sequence !== state.loadSequence || revision !== state.revision) return;
    state.products = products; state.userId = userId; state.loaded = true;
    renderList();
    status("Menu is up to date.");
  } catch (error) {
    if (revision === state.revision && sequence === state.loadSequence) status(error.message || "The menu could not load. Try Refresh.", true);
  } finally {
    if (sequence === state.loadSequence && revision === state.revision) { state.loading = false; setBusy(false); }
  }
}
function renderList() {
  const query = el.search.value.trim().toLocaleLowerCase("en-PH"), filter = el.filter.value;
  const products = state.products.filter(product =>
    (filter === "deleted" ? Boolean(product.deleted_at) : !product.deleted_at) &&
    (!query || `${product.name} ${product.category}`.toLocaleLowerCase("en-PH").includes(query)) &&
    (filter === "all" || filter === "deleted" || (filter === "hidden" ? product.published === false : menuItemAvailable(product) === (filter === "available")))).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.id).localeCompare(String(b.id)));
  el.count.textContent = `${products.length} of ${state.products.filter(product => filter === "deleted" ? product.deleted_at : !product.deleted_at).length} items`;
  el.list.replaceChildren();
  for (const product of products) {
    const card = element("article", "menu-manager-card"), available = menuItemAvailable(product);
    const icon = element("span", "menu-manager-icon");
    icon.setAttribute("aria-hidden", "true"); icon.innerHTML = catalogIcon(product.icon);
    if (safeImageUrl(product.image_url)) {
      const photo = element("img"); photo.src = safeImageUrl(product.image_url); photo.alt = ""; photo.loading = "lazy";
      photo.addEventListener("error", () => photo.remove()); icon.append(photo);
    }
    const heading = element("div", "menu-manager-card-heading");
    heading.append(element("span", "menu-manager-category", product.category), element("h2", "", product.name));
    const badge = element("span", "menu-availability", product.deleted_at ? "Deleted" : product.published === false ? "Hidden draft" : available ? "Available" : "Unavailable");
    badge.dataset.available = String(available);
    const top = element("div", "menu-manager-card-top"); top.append(icon, heading, badge);
    const variants = (product.menu_catalog_variants || []).filter(option => option.active);
    const prices = variants.map(option => Number(option.price)).filter(Number.isFinite);
    const copy = element("p", "menu-manager-card-price", prices.length ? `${prices.length > 1 ? "From " : ""}${money.format(Math.min(...prices))} · ${variants.length} ${variants.length === 1 ? "price option" : "price options"}` : "Add an available price option to sell this item.");
    const actions = element("div", "menu-manager-card-actions");
    const edit = element("button", "menu-secondary-button", "Edit item"); edit.type = "button"; edit.dataset.editMenuItem = product.id;
    edit.setAttribute("aria-label", `Edit ${product.name}`);
    const toggle = element("button", "menu-availability-toggle", product.active ? "Mark unavailable" : "Make available");
    toggle.type = "button"; toggle.dataset.toggleMenuItem = product.id;
    toggle.setAttribute("aria-label", `${product.active ? "Mark unavailable" : "Make available"}: ${product.name}`);
    const remove = element("button", "menu-text-button menu-delete-button", "Delete"); remove.type = "button"; remove.dataset.deleteMenuItem = product.id; remove.setAttribute("aria-label", `Delete ${product.name}`);
    if (product.deleted_at) {
      const restore = element("button", "menu-secondary-button", "Restore item"); restore.type = "button"; restore.dataset.restoreMenuItem = product.id; actions.append(restore);
    } else actions.append(edit, toggle, remove);
    card.append(top, copy, actions); el.list.append(card);
  }
  if (!products.length) el.list.append(element("p", "menu-manager-empty", "No menu items match these filters."));
  const categories = [...new Set(state.products.map(product => product.category))].sort();
  el.categories.replaceChildren(...categories.map(category => { const option = element("option"); option.value = category; return option; }));
}
function openEditor(product = null) {
  if (state.busy || !state.userId || product?.deleted_at) return;
  state.selectedId = product?.id || null;
  state.newId = product ? null : `item-${crypto.randomUUID()}`;
  state.dirtyForms.clear();
  el.productForm.reset();
  const values = product || { name: "", category: "", description: "", icon: "cup", image_url: "", variant_label: "Serving", active: true, published: true, featured: false, customizable: false, sort_order: state.products.length ? Math.min(2147483647, Math.max(...state.products.map(row => row.sort_order || 0)) + 1) : 0 };
  for (const name of ["name", "category", "description", "icon", "image_url", "variant_label", "sort_order"]) el.productForm.elements.namedItem(name).value = values[name] ?? "";
  for (const name of ["featured", "customizable"]) el.productForm.elements.namedItem(name).checked = values[name] === true;
  state.availability = createMenuAvailabilityDraft(values);
  $("menu-item-available").checked = state.availability.active;
  el.productForm.elements.namedItem("published").checked = values.published !== false;
  showPhotoPreview(values.image_url);
  $("menu-photo-status").textContent = "";
  el.title.textContent = product ? product.name : "Add menu item";
  el.initial.hidden = Boolean(product); el.options.hidden = !product;
  $("menu-item-details").open = !product;
  el.productForm.elements.namedItem("initial_label").value = "Regular";
  el.productForm.elements.namedItem("initial_label").required = !product;
  el.productForm.elements.namedItem("initial_price").required = !product;
  el.save.textContent = product ? "Save item details" : "Create item";
  el.message.textContent = "";
  el.variants.replaceChildren(); el.addons.replaceChildren();
  if (product) for (const kind of ["variants", "addons"]) {
    for (const option of [...(product[optionKey(kind)] || [])].sort((a, b) => a.sort_order - b.sort_order)) appendOptionForm(kind, option);
  }
  refreshAvailability();
  if (!el.dialog.open) el.dialog.showModal();
}
function appendOptionForm(kind, option = null) {
  const product = selectedProduct();
  if (!product) return;
  const form = element("form", "menu-option-form");
  form.dataset.kind = kind; form.dataset.optionId = option?.id || `option-${crypto.randomUUID()}`;
  form.dataset.newOption = String(!option);
  form.dataset.sortOrder = option?.sort_order ?? ((product[optionKey(kind)] || []).reduce((max, row) => Math.max(max, row.sort_order || 0), -1) + 1);
  function input(labelText, name, type, value) {
    const label = element("label", "", labelText), field = element("input"); field.name = name; field.type = type; field.value = value;
    if (type === "number") { field.min = "0"; field.max = "100000"; field.step = "0.01"; field.inputMode = "decimal"; }
    else field.maxLength = 100;
    field.required = true; label.append(field); return label;
  }
  const toggleLabel = element("label", "menu-option-available"), checkbox = element("input");
  checkbox.type = "checkbox"; checkbox.name = "active"; checkbox.checked = option ? option.active : true;
  toggleLabel.append(checkbox, element("span", "menu-option-availability-text", checkbox.checked ? "Available" : "Unavailable"));
  const button = element("button", "menu-secondary-button", option ? "Save" : kind === "variants" ? "Add option" : "Add extra"); button.type = "submit";
  const controls = element("div", "menu-option-controls"); controls.append(toggleLabel, button);
  if (!option) {
    const discard = element("button", "menu-text-button", "Discard"); discard.type = "button";
    discard.addEventListener("click", () => { state.dirtyForms.delete(form); form.remove(); }); controls.append(discard);
  }
  form.append(input(kind === "variants" ? "Size / serving / choice" : "Extra name", "label", "text", option?.label || ""), input("Price (₱)", "price", "number", option?.price ?? ""), controls);
  el[kind].append(form);
  if (!option) { state.dirtyForms.add(form); form.elements.namedItem("label").focus(); }
}
function availabilityPending() {
  const product = selectedProduct();
  return Boolean(product && state.availability && menuAvailabilityChanges(product, state.availability).pending);
}
function refreshAvailability() {
  const active = $("menu-item-available").checked;
  $("menu-item-availability-label").textContent = active ? "Item available" : "Item unavailable";
  $("menu-item-availability-hint").textContent = active ? "Turn off to pause all sizes and extras at once." : "The whole item is paused. Your individual size and extra choices are kept.";
  for (const form of el.options.querySelectorAll(".menu-option-form")) {
    const checked = form.elements.namedItem("active").checked;
    form.querySelector(".menu-option-availability-text").textContent = checked ? "Available" : "Unavailable";
    form.dataset.available = String(checked);
  }
  $("menu-availability-pending").textContent = availabilityPending() ? "Availability changed · tap Done to save." : "Availability changes are saved when you tap Done.";
}
function closeEditor(force = false) {
  if (!force && (state.busy || ((state.dirtyForms.size || availabilityPending()) && !window.confirm("Discard unsaved menu changes?")))) return;
  state.dirtyForms.clear();
  if (el.dialog.open) el.dialog.close();
  state.selectedId = null; state.newId = null; state.availability = null;
}
async function finishEditor() {
  if (state.busy || !state.userId) return;
  const pending = availabilityPending();
  if (state.dirtyForms.size && !window.confirm(pending ? "Save availability changes and discard unsaved price or item-detail edits? Use Save first if you want to keep those edits." : "Discard unsaved price or item-detail edits and close? Use Save first if you want to keep them.")) return;
  if (!pending) { closeEditor(true); return; }
  const product = selectedProduct(), revision = state.revision;
  setBusy(true); status("Saving availability…", false, true);
  try {
    const saved = await repository.saveAvailability(product, state.availability);
    if (revision !== state.revision) return;
    Object.assign(product, saved); renderList(); closeEditor(true);
    status(`${product.name}: availability saved.`);
  } catch (error) {
    if (revision === state.revision) status(error.message || "Availability could not be saved. Your choices are still here; try Done again.", true, true);
  } finally { if (revision === state.revision) setBusy(false); }
}
function showPhotoPreview(value) {
  const preview = $("menu-photo-preview"), url = safeImageUrl(value);
  $("menu-photo-placeholder").textContent = "No photo · the menu uses its icon";
  preview.hidden = !url; $("menu-photo-placeholder").hidden = Boolean(url);
  if (url) preview.src = url; else preview.removeAttribute("src");
  $("menu-photo-remove").hidden = !url;
}
async function uploadPhoto(file) {
  if (!file || state.busy || !state.userId) return;
  const revision = state.revision;
  setBusy(true); $("menu-photo-status").textContent = "Uploading photo…";
  try {
    const url = await repository.uploadPhoto(file);
    if (revision !== state.revision) return;
    el.productForm.elements.namedItem("image_url").value = url;
    state.dirtyForms.add(el.productForm); showPhotoPreview(url);
    $("menu-photo-status").textContent = "Photo uploaded. Save item details to use it on the menu.";
  } catch (error) {
    if (revision === state.revision) $("menu-photo-status").textContent = error.message || "Photo upload failed. Try again.";
  } finally {
    if (revision === state.revision) { $("menu-photo-file").value = ""; setBusy(false); }
  }
}
async function saveForm(form) {
  if (state.busy || !state.userId) return;
  const revision = state.revision;
  setBusy(true); status("Saving…", false, true);
  try {
    if (form === el.productForm) {
      const product = selectedProduct(), values = productValues(form);
      const saved = product ? await repository.saveProduct(product, { ...values, active: product.active }) : await repository.createProduct(state.newId, values, { label: form.elements.namedItem("initial_label").value, price: form.elements.namedItem("initial_price").value });
      if (revision !== state.revision) return;
      if (product) { Object.assign(product, saved); state.dirtyForms.delete(form); el.title.textContent = saved.name; }
      else { state.products.push(saved); setBusy(false); openEditor(saved); }
      renderList(); refreshAvailability(); status("Item details saved.", false, true);
    } else {
      const product = selectedProduct(), kind = form.dataset.kind, options = product[optionKey(kind)] || [];
      const existing = options.find(option => option.id === form.dataset.optionId), input = optionValues(form);
      const saved = existing ? await repository.saveOption(kind, product.id, existing, { ...input, active: existing.active }) : await repository.addOption(kind, product.id, form.dataset.optionId, input);
      if (revision !== state.revision) return;
      if (existing) Object.assign(existing, saved); else { options.push(saved); state.availability[kind][saved.id] = saved.active; }
      product[optionKey(kind)] = options; form.dataset.newOption = "false";
      form.querySelector("button[type=submit]").textContent = "Save";
      form.querySelector(".menu-text-button")?.remove();
      state.dirtyForms.delete(form); renderList(); refreshAvailability(); status("Price option saved.", false, true);
    }
  } catch (error) {
    if (revision === state.revision) status(`${error.message || "Save failed."}${state.newId ? " If a draft was saved, it stays unavailable until its price is ready. Refresh the menu to check it." : ""}`, true, true);
  } finally {
    if (revision === state.revision) setBusy(false);
  }
}
async function toggleAvailability(id) {
  const product = state.products.find(row => row.id === id);
  if (!product || state.busy) return;
  const revision = state.revision;
  setBusy(true);
  try {
    const saved = await repository.saveProduct(product, { ...product, active: !product.active });
    if (revision !== state.revision) return;
    Object.assign(product, saved); renderList(); status(`${product.name} is now ${saved.active ? "available" : "unavailable"}.`);
  } catch (error) { if (revision === state.revision) status(error.message, true); }
  finally { if (revision === state.revision) setBusy(false); }
}
async function deleteOrRestore(restore = false) {
  const product = state.products.find(row => row.id === state.deleteId);
  if (!product || state.busy) return;
  const revision = state.revision;
  setBusy(true);
  try {
    const saved = restore ? await repository.restoreProduct(product) : await repository.deleteProduct(product);
    if (revision !== state.revision) return;
    Object.assign(product, saved); $("menu-delete-dialog").close(); state.deleteId = null;
    renderList(); status(restore ? `${product.name} restored. It remains unavailable until you enable ordering.` : `${product.name} deleted from the menu. Existing orders are kept.`);
  } catch (error) {
    if (revision === state.revision) { $("menu-delete-dialog").close(); state.deleteId = null; status(error.message, true); }
  } finally { if (revision === state.revision) setBusy(false); }
}
function initialize() {
  Object.assign(el, { orders: $("admin-orders-view"), manager: $("menu-manager"), menuButton: $("admin-show-menu"), ordersButton: $("admin-show-orders"), add: $("menu-add-item"), refresh: $("menu-editor-refresh"), search: $("menu-editor-search"), filter: $("menu-editor-filter"), status: $("menu-editor-status"), count: $("menu-editor-count"), list: $("menu-editor-list"), dialog: $("menu-editor-dialog"), title: $("menu-editor-title"), message: $("menu-editor-message"), productForm: $("menu-product-form"), initial: $("menu-initial-price"), options: $("menu-existing-options"), variants: $("menu-variant-rows"), addons: $("menu-addon-rows"), categories: $("menu-category-suggestions"), save: $("menu-save-item") });
  if (!el.manager) return;
  el.menuButton.addEventListener("click", () => showWorkspace(true));
  el.ordersButton.addEventListener("click", () => showWorkspace(false));
  el.add.addEventListener("click", () => openEditor()); el.refresh.addEventListener("click", loadMenu);
  el.search.addEventListener("input", renderList); el.filter.addEventListener("change", renderList);
  $("menu-photo-file").addEventListener("change", event => uploadPhoto(event.target.files[0]));
  $("menu-photo-remove").addEventListener("click", () => {
    el.productForm.elements.namedItem("image_url").value = ""; state.dirtyForms.add(el.productForm); showPhotoPreview("");
    $("menu-photo-status").textContent = "Save item details to remove the photo from this item.";
  });
  el.productForm.elements.namedItem("image_url").addEventListener("change", event => showPhotoPreview(event.target.value));
  $("menu-photo-preview").addEventListener("error", () => {
    $("menu-photo-preview").hidden = true; $("menu-photo-placeholder").hidden = false;
    $("menu-photo-placeholder").textContent = "Photo preview unavailable · check the file or URL";
  });
  el.list.addEventListener("click", event => {
    const edit = event.target.closest("[data-edit-menu-item]"), toggle = event.target.closest("[data-toggle-menu-item]"), remove = event.target.closest("[data-delete-menu-item]"), restore = event.target.closest("[data-restore-menu-item]");
    if (edit) openEditor(state.products.find(product => product.id === edit.dataset.editMenuItem));
    else if (toggle) toggleAvailability(toggle.dataset.toggleMenuItem);
    else if (remove && !state.busy) {
      state.deleteId = remove.dataset.deleteMenuItem;
      const product = state.products.find(row => row.id === state.deleteId);
      $("menu-delete-copy").textContent = `Remove ${product.name} from the customer menu?`;
      $("menu-delete-dialog").showModal(); $("menu-delete-cancel").focus();
    } else if (restore && !state.busy) { state.deleteId = restore.dataset.restoreMenuItem; deleteOrRestore(true); }
  });
  $("menu-delete-cancel").addEventListener("click", () => { $("menu-delete-dialog").close(); state.deleteId = null; });
  $("menu-delete-confirm").addEventListener("click", () => deleteOrRestore(false));
  $("menu-delete-dialog").addEventListener("cancel", event => { if (state.busy) event.preventDefault(); });
  el.dialog.addEventListener("submit", event => { event.preventDefault(); saveForm(event.target); });
  for (const name of ["input", "change"]) el.dialog.addEventListener(name, event => {
    const target = event.target, form = target.closest("form");
    if (target.id === "menu-item-available") {
      state.availability.active = target.checked;
      if (!selectedProduct()) state.dirtyForms.add(el.productForm);
      refreshAvailability(); return;
    }
    if (target.name === "active" && form?.dataset.kind) {
      if (form.dataset.newOption === "false") {
        state.availability[form.dataset.kind][form.dataset.optionId] = target.checked;
        if (form.dataset.kind === "variants" && !Object.values(state.availability.variants).some(Boolean)) {
          state.availability.active = false; $("menu-item-available").checked = false;
        }
      } else state.dirtyForms.add(form);
      refreshAvailability(); return;
    }
    if (form && target.id !== "menu-photo-file") state.dirtyForms.add(form);
  });
  el.dialog.addEventListener("click", event => {
    const add = event.target.closest("[data-add-menu-option]");
    if (add && !state.busy) appendOptionForm(add.dataset.addMenuOption);
    if (event.target !== el.dialog) return;
    const rect = el.dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeEditor();
  });
  el.dialog.addEventListener("cancel", event => { event.preventDefault(); closeEditor(); });
  $("menu-editor-done").addEventListener("click", finishEditor);
  bindSheetDismiss(el.dialog, () => closeEditor());
  function clear() {
    state.revision++; state.loadSequence++; closeEditor(true); $("menu-delete-dialog").close(); state.deleteId = null;
    state.products = []; state.userId = null; state.loaded = false; state.loading = false; state.busy = false;
    el.list.replaceChildren(); el.count.textContent = ""; el.productForm.reset(); el.variants.replaceChildren(); el.addons.replaceChildren();
    el.message.textContent = ""; showPhotoPreview(""); $("menu-photo-status").textContent = ""; el.add.disabled = true; el.refresh.disabled = false;
    status("Sign in with an authorized staff account to edit the menu.");
  }
  customerSupabase.auth?.onAuthStateChange((_event, session) => { if (state.userId && session?.user?.id !== state.userId) clear(); });
  $("staff-signout-button")?.addEventListener("click", clear);
  window.addEventListener("pagehide", clear);
}
document.addEventListener("DOMContentLoaded", initialize);
