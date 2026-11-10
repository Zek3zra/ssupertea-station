import { customerSupabase, getVerifiedAccountSession } from "/js/supabase-config.js";
import { catalogIcon } from "/js/catalog.js";
import { bindSheetDismiss } from "/js/sheet-dismiss.js";
import { createMenuEditorRepository, menuItemAvailable } from "/js/menu-editor-data.js";

const repository = createMenuEditorRepository(customerSupabase, getVerifiedAccountSession);
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const state = { products: [], loaded: false, loading: false, busy: false, userId: null, revision: 0, loadSequence: 0, selectedId: null, newId: null, dirtyForms: new Set() };
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
}
function productValues(form) {
  const values = {};
  for (const name of ["name", "category", "description", "icon", "image_url", "variant_label", "sort_order"]) values[name] = form.elements.namedItem(name).value;
  for (const name of ["active", "featured", "customizable"]) values[name] = form.elements.namedItem(name).checked;
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
    (!query || `${product.name} ${product.category}`.toLocaleLowerCase("en-PH").includes(query)) &&
    (filter === "all" || menuItemAvailable(product) === (filter === "available")));
  el.count.textContent = `${products.length} of ${state.products.length} items`;
  el.list.replaceChildren();
  for (const product of products) {
    const card = element("article", "menu-manager-card"), available = menuItemAvailable(product);
    const icon = element("span", "menu-manager-icon");
    icon.setAttribute("aria-hidden", "true"); icon.innerHTML = catalogIcon(product.icon);
    const heading = element("div", "menu-manager-card-heading");
    heading.append(element("span", "menu-manager-category", product.category), element("h2", "", product.name));
    const badge = element("span", "menu-availability", available ? "Available" : "Unavailable");
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
    actions.append(edit, toggle); card.append(top, copy, actions); el.list.append(card);
  }
  if (!products.length) el.list.append(element("p", "menu-manager-empty", "No menu items match these filters."));
  const categories = [...new Set(state.products.map(product => product.category))].sort();
  el.categories.replaceChildren(...categories.map(category => { const option = element("option"); option.value = category; return option; }));
}
function openEditor(product = null) {
  if (state.busy || !state.userId) return;
  state.selectedId = product?.id || null;
  state.newId = product ? null : `item-${crypto.randomUUID()}`;
  state.dirtyForms.clear();
  el.productForm.reset();
  const values = product || { name: "", category: "", description: "", icon: "cup", image_url: "", variant_label: "Serving", active: true, featured: false, customizable: false, sort_order: state.products.length ? Math.min(2147483647, Math.max(...state.products.map(row => row.sort_order || 0)) + 1) : 0 };
  for (const name of ["name", "category", "description", "icon", "image_url", "variant_label", "sort_order"]) el.productForm.elements.namedItem(name).value = values[name] ?? "";
  for (const name of ["active", "featured", "customizable"]) el.productForm.elements.namedItem(name).checked = values[name] === true;
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
  toggleLabel.append(checkbox, document.createTextNode("Available"));
  const button = element("button", "menu-secondary-button", option ? "Save" : kind === "variants" ? "Add option" : "Add extra"); button.type = "submit";
  const controls = element("div", "menu-option-controls"); controls.append(toggleLabel, button);
  if (!option) {
    const discard = element("button", "menu-text-button", "Discard"); discard.type = "button";
    discard.addEventListener("click", () => { state.dirtyForms.delete(form); form.remove(); }); controls.append(discard);
  }
  form.append(input(kind === "variants" ? "Size / serving / choice" : "Extra name", "label", "text", option?.label || ""), input("Price (₱)", "price", "number", option?.price ?? ""), controls);
  el[kind].append(form);
  if (!option) form.elements.namedItem("label").focus();
}
function closeEditor(force = false) {
  if (!force && (state.busy || (state.dirtyForms.size && !window.confirm("Discard unsaved menu changes?")))) return;
  state.dirtyForms.clear();
  if (el.dialog.open) el.dialog.close();
  state.selectedId = null; state.newId = null;
}
async function saveForm(form) {
  if (state.busy || !state.userId) return;
  const revision = state.revision;
  setBusy(true); status("Saving…", false, true);
  try {
    if (form === el.productForm) {
      const product = selectedProduct(), values = productValues(form);
      const saved = product ? await repository.saveProduct(product, values) : await repository.createProduct(state.newId, values, { label: form.elements.namedItem("initial_label").value, price: form.elements.namedItem("initial_price").value });
      if (revision !== state.revision) return;
      if (product) { Object.assign(product, saved); state.dirtyForms.delete(form); el.title.textContent = saved.name; }
      else { state.products.push(saved); setBusy(false); openEditor(saved); }
      renderList(); status("Item details saved.", false, true);
    } else {
      const product = selectedProduct(), kind = form.dataset.kind, options = product[optionKey(kind)] || [];
      const existing = options.find(option => option.id === form.dataset.optionId), input = optionValues(form);
      const saved = existing ? await repository.saveOption(kind, product.id, existing, input) : await repository.addOption(kind, product.id, form.dataset.optionId, input);
      if (revision !== state.revision) return;
      if (existing) Object.assign(existing, saved); else options.push(saved);
      product[optionKey(kind)] = options; form.dataset.newOption = "false";
      form.querySelector("button[type=submit]").textContent = "Save";
      form.querySelector(".menu-text-button")?.remove();
      state.dirtyForms.delete(form); renderList(); status("Price option saved.", false, true);
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
function initialize() {
  Object.assign(el, { orders: $("admin-orders-view"), manager: $("menu-manager"), menuButton: $("admin-show-menu"), ordersButton: $("admin-show-orders"), add: $("menu-add-item"), refresh: $("menu-editor-refresh"), search: $("menu-editor-search"), filter: $("menu-editor-filter"), status: $("menu-editor-status"), count: $("menu-editor-count"), list: $("menu-editor-list"), dialog: $("menu-editor-dialog"), title: $("menu-editor-title"), message: $("menu-editor-message"), productForm: $("menu-product-form"), initial: $("menu-initial-price"), options: $("menu-existing-options"), variants: $("menu-variant-rows"), addons: $("menu-addon-rows"), categories: $("menu-category-suggestions"), save: $("menu-save-item") });
  if (!el.manager) return;
  el.menuButton.addEventListener("click", () => showWorkspace(true));
  el.ordersButton.addEventListener("click", () => showWorkspace(false));
  el.add.addEventListener("click", () => openEditor()); el.refresh.addEventListener("click", loadMenu);
  el.search.addEventListener("input", renderList); el.filter.addEventListener("change", renderList);
  el.list.addEventListener("click", event => {
    const edit = event.target.closest("[data-edit-menu-item]"), toggle = event.target.closest("[data-toggle-menu-item]");
    if (edit) openEditor(state.products.find(product => product.id === edit.dataset.editMenuItem));
    else if (toggle) toggleAvailability(toggle.dataset.toggleMenuItem);
  });
  el.dialog.addEventListener("submit", event => { event.preventDefault(); saveForm(event.target); });
  for (const name of ["input", "change"]) el.dialog.addEventListener(name, event => { const form = event.target.closest("form"); if (form) state.dirtyForms.add(form); });
  el.dialog.addEventListener("click", event => {
    const add = event.target.closest("[data-add-menu-option]");
    if (add && !state.busy) appendOptionForm(add.dataset.addMenuOption);
    if (event.target !== el.dialog) return;
    const rect = el.dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeEditor();
  });
  el.dialog.addEventListener("cancel", event => { event.preventDefault(); closeEditor(); });
  $("menu-editor-done").addEventListener("click", () => closeEditor());
  bindSheetDismiss(el.dialog, () => closeEditor());
  function clear() {
    state.revision++; state.loadSequence++; closeEditor(true);
    state.products = []; state.userId = null; state.loaded = false; state.loading = false; state.busy = false;
    el.list.replaceChildren(); el.count.textContent = ""; el.productForm.reset(); el.variants.replaceChildren(); el.addons.replaceChildren();
    el.message.textContent = ""; el.add.disabled = true; el.refresh.disabled = false;
    status("Sign in with an authorized staff account to edit the menu.");
  }
  customerSupabase.auth?.onAuthStateChange((_event, session) => { if (state.userId && session?.user?.id !== state.userId) clear(); });
  $("staff-signout-button")?.addEventListener("click", clear);
  window.addEventListener("pagehide", clear);
}
document.addEventListener("DOMContentLoaded", initialize);
