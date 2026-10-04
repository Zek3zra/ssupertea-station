// Pure catalog helpers. The live menu and all checkout prices come from Supabase.
export const SUGAR_OPTIONS = Object.freeze([
  { id: "less-sugar", label: "Less sugar" },
  { id: "more-sugar", label: "More sugar" },
  { id: "original-recipe", label: "Original recipe" },
]);

export function getSugarOption(id) {
  const legacy = { "0": "less-sugar", "25": "less-sugar", "50": "original-recipe", "75": "more-sugar", "100": "more-sugar" };
  return SUGAR_OPTIONS.find(option => option.id === (legacy[id] || id)) || null;
}

export function getSugarSummary(sugar) {
  if (!sugar?.label || sugar.id === "standard") return "";
  return SUGAR_OPTIONS.some(option => option.id === sugar.id) ? sugar.label : `${sugar.label} sugar`;
}

const ICON_PATHS = Object.freeze({
  cup: '<path d="M9 3h6l-1 5M6 8h12l-2 13H8L6 8ZM5 8h14M9 17h6"/>',
  coffee: '<path d="M5 9h12v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V9Zm12 1h2a3 3 0 0 1 0 6h-2M8 3v3m4-3v3m4-3v3M3 22h16"/>',
  soda: '<path d="m14 2-2 6M6 8h12l-2 13H8L6 8ZM5 8h14"/><circle cx="10" cy="12" r=".6"/><circle cx="14" cy="15" r=".6"/><path d="M10 18h2"/>',
  shake: '<path d="m15 2-2 5M7 9a5 5 0 0 1 10 0M5 9h14M6 9l2 12h8l2-12M9 16h6"/>',
  sandwich: '<path d="M4 8c-2-1-2-5 1-5h14c3 0 3 4 1 5v12H4V8ZM8 7h8M8 15h8M8 11h8"/>',
  burger: '<path d="M4 10a8 8 0 0 1 16 0H4ZM3 13h18M4 16h16v2a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-2ZM8 7h.1m4-2h.1m4 2h.1"/>',
  fries: '<path d="M5 10h14l-2 11H7L5 10ZM7 10V3h3v7m0 0V2h3v8m0 0V4h3v6m0 0V3h3v7M10 15h4"/>',
  meal: '<circle cx="12" cy="13" r="8"/><circle cx="12" cy="13" r="4"/><path d="M2 3v5m-1-5v5m2-5v5M2 8v13M22 3v18m0-18c-3 2-3 8 0 8"/>',
  noodles: '<path d="M3 13h18a9 9 0 0 1-18 0Zm4 9h10M6 3l12 5M6 6l12 5M8 9v4m4-2v2m4-1v1"/>',
  snack: '<path d="M3 13h18l-3 8H6l-3-8ZM6 10l4-7 5 7M10 11l7-8 3 8"/>',
  pitcher: '<path d="M5 4h10l2 17H5V4Zm10 3h4a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-2M5 4 3 2M8 12h6"/>',
  combo: '<path d="M2 11a5 5 0 0 1 10 0H2ZM2 14h10M3 17h8v3H3v-3ZM15 8h7l-1 13h-5L15 8Zm-1 0h9m-5 0 2-6"/>',
});

export function catalogIcon(kind = "cup") {
  return `<svg class="catalog-icon" aria-hidden="true" viewBox="0 0 24 24">${ICON_PATHS[kind] || ICON_PATHS.cup}</svg>`;
}

export function safeImageUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, "https://catalog.invalid");
    return url.protocol === "https:" ? url.href === `https://catalog.invalid${value}` ? value : url.href : "";
  } catch { return ""; }
}

export function normalizeCatalogProduct(row) {
  const money = value => {
    const number = Number(value);
    if (value == null || !Number.isFinite(number) || number < 0) throw new Error("Invalid catalog price");
    return Math.round(number * 100) / 100;
  };
  const variants = (row.menu_catalog_variants || row.variants || [])
    .filter(option => option.active !== false)
    .sort((a,b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(option => ({ id: option.id, label: option.label, price: money(option.price) }));
  if (!row.id || !row.name || !row.category || !variants.length) throw new Error("Incomplete catalog item");
  return {
    id: row.id, name: row.name, category: row.category,
    description: row.description || "", featured: Boolean(row.featured),
    icon: row.icon || "cup", imageUrl: safeImageUrl(row.image_url),
    customizable: Boolean(row.customizable), variantLabel: row.variant_label || "Size",
    basePrice: Math.min(...variants.map(option => option.price)), variants,
    addons: (row.menu_catalog_addons || row.addons || []).filter(option => option.active !== false)
      .sort((a,b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(option => ({ id: option.id, label: option.label, price: money(option.price) })),
  };
}

export function getSizeOptions(product) { return product?.variants || []; }
export function getAddonOptions(product) { return product?.addons || []; }

export function calculateCatalogPrice(product, selection) {
  const variant = getSizeOptions(product).find(option => option.id === selection.sizeId);
  if (!variant) throw new Error("Unavailable size or serving");
  const ids = [...new Set(selection.addonIds || [])];
  const extras = ids.map(id => getAddonOptions(product).find(option => option.id === id));
  if (extras.some(option => !option)) throw new Error("Unavailable extra");
  return Math.round((variant.price + extras.reduce((sum, option) => sum + option.price, 0)) * 100) / 100;
}
