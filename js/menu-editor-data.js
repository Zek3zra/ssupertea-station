// Staff catalog access uses the signed-in client and the existing Supabase RLS policies.
export const MENU_ICONS = ["cup", "coffee", "soda", "shake", "sandwich", "burger", "fries", "meal", "noodles", "snack", "pitcher", "combo"];
const ITEM_COLUMNS = "id,name,category,description,icon,image_url,featured,customizable,variant_label,active,published,deleted_at,sort_order,updated_at";
const OPTION_COLUMNS = "product_id,id,label,price,active,sort_order,updated_at";
const TABLES = { variants: "menu_catalog_variants", addons: "menu_catalog_addons" };
export const MENU_COLUMNS = `${ITEM_COLUMNS},menu_catalog_variants(${OPTION_COLUMNS}),menu_catalog_addons(${OPTION_COLUMNS})`;

function text(value, label, max, required = true) {
  const result = String(value ?? "").trim();
  if ((required && !result) || result.length > max) throw new Error(`${label} must be ${required ? "1–" : "at most "}${max} characters.`);
  return result;
}
function identifier(value, max = 120) {
  if (!new RegExp(`^[a-z0-9-]{1,${max}}$`).test(value || "")) throw new Error("Invalid menu record.");
  return value;
}
function position(value) {
  const number = Number(value ?? 0);
  if (!Number.isInteger(number) || number < 0 || number > 2147483647) throw new Error("Display order must be a non-negative whole number.");
  return number;
}
export function validateMenuProduct(input) {
  let image = text(input.image_url, "Photo URL", 2000, false);
  if (image) {
    if (/\s/.test(image) || (!/^\/assets\/[^?#]+(?:[?#].*)?$/.test(image) && !/^https:\/\//i.test(image))) throw new Error("Use an HTTPS photo URL or an /assets/ image path.");
    const url = new URL(image, "https://catalog.invalid");
    if (url.protocol !== "https:" || url.username || url.password || (image.startsWith("/") && (url.origin !== "https://catalog.invalid" || !url.pathname.startsWith("/assets/")))) throw new Error("Use a valid, secure photo URL.");
    image = image.startsWith("/") ? `${url.pathname}${url.search}${url.hash}` : url.href;
  }
  if (!MENU_ICONS.includes(input.icon)) throw new Error("Choose a placeholder icon.");
  return {
    name: text(input.name, "Item name", 120), category: text(input.category, "Category", 60),
    description: text(input.description, "Description", 500, false), icon: input.icon, image_url: image || null,
    variant_label: text(input.variant_label || "Serving", "Option heading", 60),
    active: input.active === true, published: input.published !== false, featured: input.featured === true, customizable: input.customizable === true,
    sort_order: position(input.sort_order),
  };
}
export function validateMenuOption(input) {
  const raw = String(input.price ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || Number(raw) > 100000) throw new Error("Price must be between ₱0 and ₱100,000, with up to two decimal places.");
  return { label: text(input.label, "Option name", 100), price: Number(raw), active: input.active === true, sort_order: position(input.sort_order) };
}
export function menuItemAvailable(product) {
  return !product.deleted_at && product.active === true && product.published !== false && Boolean(product.menu_catalog_variants?.some(option => option.active === true));
}
export const MENU_PHOTO_BUCKET = "menu-photos";
export const MENU_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export async function validateMenuPhoto(file) {
  const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  if (!file || !extensions[file.type] || !Number.isFinite(file.size) || file.size <= 0 || file.size > MENU_PHOTO_MAX_BYTES) throw new Error("Choose a JPG, PNG or WebP photo up to 5 MB.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const valid = file.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : file.type === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) :
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!valid) throw new Error("This file is not a valid JPG, PNG or WebP photo.");
  return { extension: extensions[file.type], contentType: file.type };
}
export function createMenuEditorRepository(client, getSession) {
  async function sameAccount(userId) {
    const session = await getSession();
    if (session?.user?.id !== userId || session.user.is_anonymous === true) throw new Error("Your account changed. Reopen Admin before saving.");
  }
  async function manager() {
    const session = await getSession({ forceRefresh: true });
    if (!session?.user?.id || session.user.is_anonymous === true) throw new Error("Sign in with an authorized staff account.");
    const { data, error } = await client.rpc("get_my_staff_permissions");
    if (error || data?.active !== true || data.can_manage_orders !== true) throw new Error("Only authorized store admins can edit the menu.");
    await sameAccount(session.user.id);
    return session.user.id;
  }
  async function result(query) {
    const { data, error } = await query.abortSignal(AbortSignal.timeout(15000));
    if (error) throw Object.assign(new Error(error.message || "The menu could not be saved."), { code: error.code });
    return data;
  }
  async function update(table, values, filters, version, userId) {
    if (!version) throw new Error("Refresh the menu before saving this record.");
    await sameAccount(userId);
    let query = client.from(table).update(values);
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    const data = await result(query.eq("updated_at", version).select(table === "menu_catalog" ? ITEM_COLUMNS : OPTION_COLUMNS).maybeSingle());
    await sameAccount(userId);
    if (!data) throw new Error("This item changed on another device, or access was removed. Refresh before saving.");
    return data;
  }
  async function ensureVariant(productId, option, userId) {
    await sameAccount(userId);
    const existing = await result(client.from(TABLES.variants).select(OPTION_COLUMNS).eq("product_id", productId).eq("id", "regular").maybeSingle());
    if (existing) return update(TABLES.variants, option, { product_id: productId, id: "regular" }, existing.updated_at, userId);
    await sameAccount(userId);
    return result(client.from(TABLES.variants).insert({ ...option, product_id: productId, id: "regular" }).select(OPTION_COLUMNS).single());
  }
  return {
    async uploadPhoto(file) {
      const { extension, contentType } = await validateMenuPhoto(file), userId = await manager();
      const path = `menu/${userId}/${crypto.randomUUID()}.${extension}`;
      await sameAccount(userId);
      const bucket = client.storage.from(MENU_PHOTO_BUCKET);
      const { error } = await bucket.upload(path, file, { contentType, cacheControl: "3600", upsert: false });
      if (error) throw new Error(error.message || "Photo upload failed. Please try again.");
      await sameAccount(userId);
      const publicUrl = bucket.getPublicUrl(path).data?.publicUrl;
      if (!publicUrl) throw new Error("The photo uploaded, but its URL could not be loaded.");
      return publicUrl;
    },
    async load() {
      const userId = await manager();
      // Fetch all pages so the editor does not silently lose entries above the API row cap.
      const products = [];
      for (let start = 0; ; start += 500) {
        await sameAccount(userId);
        const rows = await result(client.from("menu_catalog").select(MENU_COLUMNS).order("sort_order").order("id").range(start, start + 499));
        products.push(...(rows || []));
        if (!rows || rows.length < 500) break;
      }
      await sameAccount(userId);
      return { products, userId };
    },
    async saveProduct(product, input) {
      if (product.deleted_at) throw new Error("Restore this deleted item before editing it.");
      const values = validateMenuProduct(input), userId = await manager();
      identifier(product.id);
      if (values.active) {
        const options = await result(client.from(TABLES.variants).select("id").eq("product_id", product.id).eq("active", true).limit(1));
        if (!options?.length) throw new Error("Add at least one available price option before making this item available.");
      }
      return update("menu_catalog", values, { id: product.id }, product.updated_at, userId);
    },
    async saveOption(kind, productId, option, input) {
      if (!TABLES[kind]) throw new Error("Invalid option type.");
      identifier(productId); identifier(option.id, 80);
      const values = validateMenuOption(input), userId = await manager();
      return update(TABLES[kind], values, { product_id: productId, id: option.id }, option.updated_at, userId);
    },
    async addOption(kind, productId, id, input) {
      if (!TABLES[kind]) throw new Error("Invalid option type.");
      identifier(productId); identifier(id, 80);
      const values = validateMenuOption(input), userId = await manager();
      await sameAccount(userId);
      // A stable draft ID makes retrying a lost insert response safe.
      const existing = await result(client.from(TABLES[kind]).select(OPTION_COLUMNS).eq("product_id", productId).eq("id", id).maybeSingle());
      if (existing) return update(TABLES[kind], values, { product_id: productId, id }, existing.updated_at, userId);
      await sameAccount(userId);
      const saved = await result(client.from(TABLES[kind]).insert({ ...values, id, product_id: productId }).select(OPTION_COLUMNS).single());
      await sameAccount(userId);
      return saved;
    },
    async deleteProduct(product) {
      identifier(product.id);
      const userId = await manager();
      return update("menu_catalog", { deleted_at: new Date().toISOString(), active: false, published: false }, { id: product.id }, product.updated_at, userId);
    },
    async restoreProduct(product) {
      identifier(product.id);
      const userId = await manager();
      // Restoring never silently enables ordering. Staff can make it available later.
      return update("menu_catalog", { deleted_at: null, active: false, published: Boolean(product.menu_catalog_variants?.length) }, { id: product.id }, product.updated_at, userId);
    },
    async createProduct(id, input, initialOption) {
      identifier(id);
      const values = validateMenuProduct(input), option = validateMenuOption({ ...initialOption, active: true, sort_order: 0 });
      const userId = await manager();
      // New products stay unavailable until their initial price has saved successfully.
      let product = await result(client.from("menu_catalog").select(ITEM_COLUMNS).eq("id", id).maybeSingle());
      if (product?.active || product?.published || product?.deleted_at) throw new Error("This item was already created. Refresh the menu to edit it.");
      if (product) product = await update("menu_catalog", { ...values, active: false, published: false }, { id }, product.updated_at, userId);
      else {
        await sameAccount(userId);
        product = await result(client.from("menu_catalog").insert({ ...values, id, active: false, published: false }).select(ITEM_COLUMNS).single());
      }
      const variant = await ensureVariant(id, option, userId);
      const saved = await update("menu_catalog", { active: values.active, published: values.published }, { id }, product.updated_at, userId);
      return { ...saved, menu_catalog_variants: [variant], menu_catalog_addons: [] };
    },
  };
}
