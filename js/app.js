import "/js/supabase-config.js";

const CART_STORAGE_KEY = "ssupertea-cart-v1";
const MAX_ITEM_QUANTITY = 20;
const TOAST_DURATION_MS = 3800;

const MENU_ITEMS = Object.freeze([
  {
    id: "brown-sugar-pearl-milk-tea",
    name: "Brown Sugar Pearl Milk Tea",
    category: "Milk Tea",
    description: "Creamy milk tea with deep brown sugar flavor and chewy pearls.",
    basePrice: 95,
    featured: true,
    pearls: true,
    visual: {
      background: "#F3E8D2",
      top: "#F3DFC2",
      middle: "#C48A58",
      bottom: "#563323",
      rotation: "-2deg",
    },
  },
  {
    id: "strawberry-jasmine-tea",
    name: "Strawberry Jasmine Tea",
    category: "Fruit Tea",
    description: "Bright strawberry flavor blended with fragrant jasmine tea.",
    basePrice: 85,
    featured: true,
    pearls: false,
    visual: {
      background: "#FBE6E2",
      top: "#FFD7CF",
      middle: "#EC8C7C",
      bottom: "#C84D55",
      rotation: "2deg",
    },
  },
  {
    id: "iced-matcha-latte",
    name: "Iced Matcha Latte",
    category: "Matcha",
    description: "Earthy matcha layered with creamy milk and refreshing ice.",
    basePrice: 95,
    featured: true,
    pearls: false,
    visual: {
      background: "#E8F0D8",
      top: "#F4EFD9",
      middle: "#A9C87A",
      bottom: "#5E8C51",
      rotation: "1deg",
    },
  },
  {
    id: "oreo-cheesecake-milk-tea",
    name: "Oreo Cheesecake Milk Tea",
    category: "Specialty",
    description: "Milk tea finished with cookie crumbs and rich cheesecake foam.",
    basePrice: 105,
    featured: false,
    pearls: true,
    visual: {
      background: "#ECE9E5",
      top: "#F1E8D5",
      middle: "#9B816B",
      bottom: "#3E342E",
      rotation: "-1deg",
    },
  },
  {
    id: "wintermelon-milk-tea",
    name: "Wintermelon Milk Tea",
    category: "Milk Tea",
    description: "Smooth milk tea with a mellow, caramel-like wintermelon finish.",
    basePrice: 85,
    featured: false,
    pearls: false,
    visual: {
      background: "#F3EBDD",
      top: "#F4E5C6",
      middle: "#C5A16F",
      bottom: "#80613F",
      rotation: "2deg",
    },
  },
  {
    id: "taro-milk-tea",
    name: "Taro Milk Tea",
    category: "Milk Tea",
    description: "Creamy and lightly sweet taro milk tea with a nutty aroma.",
    basePrice: 90,
    featured: false,
    pearls: false,
    visual: {
      background: "#EFE6F5",
      top: "#F0E7F5",
      middle: "#B9A0CC",
      bottom: "#7D6797",
      rotation: "-2deg",
    },
  },
  {
    id: "classic-milk-tea",
    name: "Classic Milk Tea",
    category: "Milk Tea",
    description: "A balanced house milk tea with a smooth, comforting finish.",
    basePrice: 80,
    featured: false,
    pearls: true,
    visual: {
      background: "#F5EBDD",
      top: "#F4E0BF",
      middle: "#C89462",
      bottom: "#765039",
      rotation: "1deg",
    },
  },
  {
    id: "hokkaido-milk-tea",
    name: "Hokkaido Milk Tea",
    category: "Milk Tea",
    description: "Rich and creamy milk tea with a toasted caramel profile.",
    basePrice: 95,
    featured: false,
    pearls: true,
    visual: {
      background: "#F4E7D4",
      top: "#F7DFBB",
      middle: "#C88755",
      bottom: "#6E432F",
      rotation: "-1deg",
    },
  },
  {
    id: "thai-milk-tea",
    name: "Thai Milk Tea",
    category: "Specialty",
    description: "Bold tea, aromatic spices, and creamy milk over ice.",
    basePrice: 95,
    featured: false,
    pearls: false,
    visual: {
      background: "#FBE8D2",
      top: "#FFE1B7",
      middle: "#E99046",
      bottom: "#B24F27",
      rotation: "2deg",
    },
  },
  {
    id: "mango-fruit-tea",
    name: "Mango Fruit Tea",
    category: "Fruit Tea",
    description: "Juicy mango flavor mixed with light tea for a tropical sip.",
    basePrice: 85,
    featured: false,
    pearls: false,
    visual: {
      background: "#FFF0CF",
      top: "#FFE9A8",
      middle: "#F4C454",
      bottom: "#DE8F2B",
      rotation: "-2deg",
    },
  },
  {
    id: "lychee-fruit-tea",
    name: "Lychee Fruit Tea",
    category: "Fruit Tea",
    description: "Floral lychee sweetness with a clean and refreshing tea base.",
    basePrice: 85,
    featured: false,
    pearls: false,
    visual: {
      background: "#FDEBEF",
      top: "#FFF0F1",
      middle: "#F3B2BD",
      bottom: "#D66F83",
      rotation: "1deg",
    },
  },
  {
    id: "lemon-yakult",
    name: "Lemon Yakult",
    category: "Yakult",
    description: "A tangy lemon and Yakult blend that is bright and refreshing.",
    basePrice: 90,
    featured: false,
    pearls: false,
    visual: {
      background: "#F8F5D8",
      top: "#FFF9D2",
      middle: "#E7E27B",
      bottom: "#B9B444",
      rotation: "-1deg",
    },
  },
]);

const SIZE_OPTIONS = Object.freeze([
  { id: "medium", label: "Medium", shortLabel: "M", price: 0 },
  { id: "large", label: "Large", shortLabel: "L", price: 15 },
]);

const SUGAR_OPTIONS = Object.freeze([
  { id: "0", label: "0%" },
  { id: "25", label: "25%" },
  { id: "50", label: "50%" },
  { id: "75", label: "75%" },
  { id: "100", label: "100%" },
]);

const ICE_OPTIONS = Object.freeze([
  { id: "no-ice", label: "No ice" },
  { id: "less-ice", label: "Less" },
  { id: "regular-ice", label: "Regular" },
  { id: "extra-ice", label: "Extra" },
]);

const ADDON_OPTIONS = Object.freeze([
  { id: "pearl", label: "Pearl", price: 15 },
  { id: "pudding", label: "Pudding", price: 15 },
  { id: "aloe-vera", label: "Aloe Vera", price: 15 },
  { id: "cheese-foam", label: "Cheese Foam", price: 25 },
]);

const state = {
  activeCategory: "All",
  searchQuery: "",
  selectedProductId: null,
  customizeQuantity: 1,
  installPrompt: null,
  cart: loadCart(),
};

const elements = {};

document.addEventListener("DOMContentLoaded", initializeApp);

function initializeApp() {
  cacheElements();
  renderCategories();
  renderMenu();
  renderCart();
  bindEvents();
  applyShortcutView();
  updateScrolledHeader();
  updateCurrentYear();
}

function cacheElements() {
  const requiredElementIds = [
    "menu-search",
    "category-strip",
    "menu-status",
    "menu-grid",
    "menu-empty-state",
    "reset-menu-button",
    "header-cart-button",
    "header-cart-count",
    "mobile-cart-button",
    "mobile-cart-count",
    "cart-panel",
    "page-overlay",
    "close-cart-button",
    "cart-empty-state",
    "cart-list",
    "cart-footer",
    "browse-menu-button",
    "clear-cart-button",
    "cart-item-total",
    "cart-subtotal",
    "checkout-total",
    "checkout-button",
    "customize-dialog",
    "customize-form",
    "close-customize-button",
    "dialog-drink-visual",
    "dialog-product-category",
    "dialog-product-name",
    "dialog-product-description",
    "size-options",
    "sugar-options",
    "ice-options",
    "addon-options",
    "customize-decrease-button",
    "customize-increase-button",
    "customize-quantity",
    "customized-total",
    "install-button",
    "track-order-button",
    "toast-region",
    "current-year",
  ];

  for (const id of requiredElementIds) {
    const element = document.getElementById(id);

    if (!element) {
      throw new Error(`Required page element #${id} was not found.`);
    }

    elements[id] = element;
  }

  elements.siteHeader = document.querySelector(".site-header");
  elements.mobileNavLinks = [...document.querySelectorAll("[data-nav-view]")];
}

function bindEvents() {
  elements["menu-search"].addEventListener("input", handleSearchInput);
  elements["category-strip"].addEventListener("click", handleCategoryClick);
  elements["menu-grid"].addEventListener("click", handleMenuGridClick);
  elements["reset-menu-button"].addEventListener("click", resetMenuFilters);

  elements["header-cart-button"].addEventListener("click", openCart);
  elements["mobile-cart-button"].addEventListener("click", openCart);
  elements["close-cart-button"].addEventListener("click", closeCart);
  elements["page-overlay"].addEventListener("click", closeCart);
  elements["browse-menu-button"].addEventListener("click", handleBrowseMenu);
  elements["clear-cart-button"].addEventListener("click", clearCart);
  elements["cart-list"].addEventListener("click", handleCartListClick);

  elements["close-customize-button"].addEventListener("click", closeCustomizeDialog);
  elements["customize-form"].addEventListener("submit", handleCustomizeSubmit);
  elements["customize-form"].addEventListener("change", updateCustomizeTotal);
  elements["customize-decrease-button"].addEventListener(
    "click",
    () => changeCustomizeQuantity(-1)
  );
  elements["customize-increase-button"].addEventListener(
    "click",
    () => changeCustomizeQuantity(1)
  );

  elements["checkout-button"].addEventListener("click", handleCheckoutRequest);
  elements["track-order-button"].addEventListener("click", handleTrackRequest);
  elements["install-button"].addEventListener("click", handleInstallClick);

  elements["customize-dialog"].addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
    state.selectedProductId = null;
  });

  elements["customize-dialog"].addEventListener("click", (event) => {
    if (event.target === elements["customize-dialog"]) {
      closeCustomizeDialog();
    }
  });

  window.addEventListener("scroll", updateScrolledHeader, { passive: true });
  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);
  window.addEventListener("storage", handleStorageSync);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements["cart-panel"].classList.contains("is-open")) {
      closeCart();
    }
  });
}

function renderCategories() {
  const categories = [
    "All",
    ...new Set(MENU_ITEMS.map((item) => item.category)),
  ];

  elements["category-strip"].innerHTML = categories
    .map(
      (category) => `
        <button
          class="category-button ${category === state.activeCategory ? "is-active" : ""}"
          type="button"
          data-category="${escapeHtml(category)}"
          aria-pressed="${category === state.activeCategory}"
        >
          ${escapeHtml(category)}
        </button>
      `
    )
    .join("");
}

function renderMenu() {
  const normalizedQuery = state.searchQuery.trim().toLocaleLowerCase("en-PH");

  const filteredItems = MENU_ITEMS.filter((item) => {
    const categoryMatches =
      state.activeCategory === "All" || item.category === state.activeCategory;

    const textMatches =
      normalizedQuery.length === 0 ||
      `${item.name} ${item.category} ${item.description}`
        .toLocaleLowerCase("en-PH")
        .includes(normalizedQuery);

    return categoryMatches && textMatches;
  });

  elements["menu-grid"].innerHTML = filteredItems.map(createProductCard).join("");

  const countLabel = filteredItems.length === 1 ? "drink" : "drinks";
  elements["menu-status"].textContent = `${filteredItems.length} ${countLabel} available`;

  const hasResults = filteredItems.length > 0;
  elements["menu-grid"].hidden = !hasResults;
  elements["menu-empty-state"].hidden = hasResults;
}

function createProductCard(product) {
  const visualVariables = getVisualVariables(product);

  return `
    <article class="product-card" data-product-id="${escapeHtml(product.id)}">
      <div class="product-visual" style="${visualVariables}" aria-hidden="true">
        <span class="product-straw"></span>
        <span class="product-lid"></span>
        ${product.pearls ? '<span class="product-pearls"></span>' : ""}
      </div>

      <div class="product-card-content">
        <p class="product-category">${escapeHtml(product.category)}</p>
        <h3>${escapeHtml(product.name)}</h3>
        <p class="product-description">${escapeHtml(product.description)}</p>

        <div class="product-card-footer">
          <p class="product-price">
            ${formatCurrency(product.basePrice)}
            <small>from</small>
          </p>

          <button
            class="customize-button"
            type="button"
            data-action="customize"
            data-product-id="${escapeHtml(product.id)}"
            aria-label="Customize ${escapeHtml(product.name)}"
          >
            Customize
          </button>
        </div>
      </div>
    </article>
  `;
}

function handleSearchInput(event) {
  state.searchQuery = String(event.target.value || "").slice(0, 60);
  renderMenu();
}

function handleCategoryClick(event) {
  const button = event.target.closest("[data-category]");

  if (!button) {
    return;
  }

  const category = button.dataset.category;

  if (!category) {
    return;
  }

  state.activeCategory = category;
  renderCategories();
  renderMenu();
}

function handleMenuGridClick(event) {
  const customizeButton = event.target.closest('[data-action="customize"]');

  if (!customizeButton) {
    return;
  }

  const productId = customizeButton.dataset.productId;
  openCustomizeDialog(productId);
}

function resetMenuFilters() {
  state.activeCategory = "All";
  state.searchQuery = "";
  elements["menu-search"].value = "";
  renderCategories();
  renderMenu();
  elements["menu-search"].focus();
}

function openCustomizeDialog(productId) {
  const product = getProductById(productId);

  if (!product) {
    showToast({
      type: "error",
      title: "Drink unavailable",
      message: "This menu item could not be loaded.",
    });

    return;
  }

  state.selectedProductId = product.id;
  state.customizeQuantity = 1;

  elements["customize-form"].reset();
  elements["dialog-product-category"].textContent = product.category;
  elements["dialog-product-name"].textContent = product.name;
  elements["dialog-product-description"].textContent = product.description;
  elements["dialog-drink-visual"].setAttribute("style", getVisualVariables(product));

  renderCustomizeOptions();
  updateCustomizeQuantityOutput();
  updateCustomizeTotal();

  document.body.classList.add("dialog-open");
  elements["customize-dialog"].showModal();

  requestAnimationFrame(() => {
    const firstOption = elements["customize-form"].querySelector("input");
    firstOption?.focus();
  });
}

function renderCustomizeOptions() {
  elements["size-options"].innerHTML = SIZE_OPTIONS.map(
    (option, index) => `
      <div class="option-card">
        <input
          id="size-${escapeHtml(option.id)}"
          name="size"
          type="radio"
          value="${escapeHtml(option.id)}"
          ${index === 0 ? "checked" : ""}
          required
        >
        <label for="size-${escapeHtml(option.id)}">
          ${escapeHtml(option.label)}
          <small>${option.price > 0 ? `+${formatCurrency(option.price)}` : "Base price"}</small>
        </label>
      </div>
    `
  ).join("");

  elements["sugar-options"].innerHTML = SUGAR_OPTIONS.map(
    (option) => `
      <div class="option-card">
        <input
          id="sugar-${escapeHtml(option.id)}"
          name="sugar"
          type="radio"
          value="${escapeHtml(option.id)}"
          ${option.id === "50" ? "checked" : ""}
          required
        >
        <label for="sugar-${escapeHtml(option.id)}">${escapeHtml(option.label)}</label>
      </div>
    `
  ).join("");

  elements["ice-options"].innerHTML = ICE_OPTIONS.map(
    (option) => `
      <div class="option-card">
        <input
          id="ice-${escapeHtml(option.id)}"
          name="ice"
          type="radio"
          value="${escapeHtml(option.id)}"
          ${option.id === "regular-ice" ? "checked" : ""}
          required
        >
        <label for="ice-${escapeHtml(option.id)}">${escapeHtml(option.label)}</label>
      </div>
    `
  ).join("");

  elements["addon-options"].innerHTML = ADDON_OPTIONS.map(
    (addon) => `
      <div class="addon-card">
        <input
          id="addon-${escapeHtml(addon.id)}"
          name="addons"
          type="checkbox"
          value="${escapeHtml(addon.id)}"
        >
        <label for="addon-${escapeHtml(addon.id)}">
          <span class="addon-check" aria-hidden="true">✓</span>
          <span class="addon-name">${escapeHtml(addon.label)}</span>
          <span class="addon-price">+${formatCurrency(addon.price)}</span>
        </label>
      </div>
    `
  ).join("");
}

function closeCustomizeDialog() {
  if (elements["customize-dialog"].open) {
    elements["customize-dialog"].close();
  }
}

function changeCustomizeQuantity(delta) {
  state.customizeQuantity = clamp(
    state.customizeQuantity + delta,
    1,
    MAX_ITEM_QUANTITY
  );

  updateCustomizeQuantityOutput();
  updateCustomizeTotal();
}

function updateCustomizeQuantityOutput() {
  elements["customize-quantity"].textContent = String(state.customizeQuantity);
  elements["customize-decrease-button"].disabled = state.customizeQuantity <= 1;
  elements["customize-increase-button"].disabled =
    state.customizeQuantity >= MAX_ITEM_QUANTITY;
}

function updateCustomizeTotal() {
  const product = getProductById(state.selectedProductId);

  if (!product) {
    elements["customized-total"].textContent = formatCurrency(0);
    return;
  }

  const selection = getCustomizeSelection();
  const unitPrice = calculateUnitPrice(product, selection);
  const total = unitPrice * state.customizeQuantity;

  elements["customized-total"].textContent = formatCurrency(total);
}

function getCustomizeSelection() {
  const formData = new FormData(elements["customize-form"]);

  return {
    sizeId: String(formData.get("size") || "medium"),
    sugarId: String(formData.get("sugar") || "50"),
    iceId: String(formData.get("ice") || "regular-ice"),
    addonIds: formData.getAll("addons").map(String),
  };
}

function handleCustomizeSubmit(event) {
  event.preventDefault();

  if (!elements["customize-form"].reportValidity()) {
    return;
  }

  const product = getProductById(state.selectedProductId);

  if (!product) {
    showToast({
      type: "error",
      title: "Unable to add item",
      message: "The selected drink no longer exists.",
    });

    return;
  }

  const selection = getCustomizeSelection();
  const size = SIZE_OPTIONS.find((option) => option.id === selection.sizeId);
  const sugar = SUGAR_OPTIONS.find((option) => option.id === selection.sugarId);
  const ice = ICE_OPTIONS.find((option) => option.id === selection.iceId);
  const addons = selection.addonIds
    .map((addonId) => ADDON_OPTIONS.find((addon) => addon.id === addonId))
    .filter(Boolean);

  if (!size || !sugar || !ice) {
    showToast({
      type: "error",
      title: "Check your options",
      message: "Choose a valid size, sugar level, and ice level.",
    });

    return;
  }

  const unitPrice = calculateUnitPrice(product, selection);
  const cartKey = createCartKey({
    productId: product.id,
    sizeId: size.id,
    sugarId: sugar.id,
    iceId: ice.id,
    addonIds: addons.map((addon) => addon.id),
  });

  const existingItem = state.cart.find((item) => item.cartKey === cartKey);

  if (existingItem) {
    existingItem.quantity = clamp(
      existingItem.quantity + state.customizeQuantity,
      1,
      MAX_ITEM_QUANTITY
    );
  } else {
    state.cart.push({
      cartKey,
      productId: product.id,
      name: product.name,
      category: product.category,
      size: {
        id: size.id,
        label: size.label,
        price: size.price,
      },
      sugar: {
        id: sugar.id,
        label: sugar.label,
      },
      ice: {
        id: ice.id,
        label: ice.label,
      },
      addons: addons.map((addon) => ({
        id: addon.id,
        label: addon.label,
        price: addon.price,
      })),
      unitPrice,
      quantity: state.customizeQuantity,
      visual: product.visual,
    });
  }

  persistCart();
  renderCart();
  closeCustomizeDialog();

  showToast({
    type: "success",
    title: "Added to cart",
    message: `${product.name} is ready in your cart.`,
  });
}

function calculateUnitPrice(product, selection) {
  const size = SIZE_OPTIONS.find((option) => option.id === selection.sizeId);
  const addonTotal = selection.addonIds.reduce((total, addonId) => {
    const addon = ADDON_OPTIONS.find((option) => option.id === addonId);
    return total + (addon?.price || 0);
  }, 0);

  return roundCurrency(product.basePrice + (size?.price || 0) + addonTotal);
}

function createCartKey({ productId, sizeId, sugarId, iceId, addonIds }) {
  const normalizedAddons = [...addonIds].sort().join(",");

  return [productId, sizeId, sugarId, iceId, normalizedAddons].join("|");
}

function renderCart() {
  const hasItems = state.cart.length > 0;

  elements["cart-empty-state"].hidden = hasItems;
  elements["cart-list"].hidden = !hasItems;
  elements["cart-footer"].hidden = !hasItems;

  elements["cart-list"].innerHTML = state.cart.map(createCartItemMarkup).join("");

  const totalQuantity = getCartQuantity();
  const subtotal = getCartSubtotal();

  elements["header-cart-count"].textContent = formatCartCount(totalQuantity);
  elements["mobile-cart-count"].textContent = formatCartCount(totalQuantity);
  elements["header-cart-count"].setAttribute(
    "aria-label",
    `${totalQuantity} ${totalQuantity === 1 ? "item" : "items"}`
  );
  elements["cart-item-total"].textContent = String(totalQuantity);
  elements["cart-subtotal"].textContent = formatCurrency(subtotal);
  elements["checkout-total"].textContent = formatCurrency(subtotal);
  elements["checkout-button"].disabled = !hasItems;
}

function createCartItemMarkup(item) {
  const product = getProductById(item.productId);
  const visualSource = product?.visual || item.visual || MENU_ITEMS[0].visual;
  const visualVariables = visualToCssVariables(visualSource);
  const itemTotal = roundCurrency(item.unitPrice * item.quantity);
  const addonText =
    item.addons.length > 0
      ? `Add-ons: ${item.addons.map((addon) => addon.label).join(", ")}`
      : "No add-ons";

  return `
    <article class="cart-item" data-cart-key="${escapeHtml(item.cartKey)}">
      <div class="cart-item-visual" style="${visualVariables}" aria-hidden="true"></div>

      <div class="cart-item-content">
        <div class="cart-item-title-row">
          <h3>${escapeHtml(item.name)}</h3>
          <p class="cart-item-price">${formatCurrency(itemTotal)}</p>
        </div>

        <p class="cart-item-options">
          ${escapeHtml(item.size.label)} · ${escapeHtml(item.sugar.label)} sugar ·
          ${escapeHtml(item.ice.label)}
          <span class="cart-item-addon">${escapeHtml(addonText)}</span>
        </p>

        <div class="cart-item-actions">
          <div class="quantity-control" aria-label="Quantity for ${escapeHtml(item.name)}">
            <button
              type="button"
              data-cart-action="decrease"
              data-cart-key="${escapeHtml(item.cartKey)}"
              aria-label="Decrease ${escapeHtml(item.name)} quantity"
            >
              −
            </button>

            <output aria-live="polite">${item.quantity}</output>

            <button
              type="button"
              data-cart-action="increase"
              data-cart-key="${escapeHtml(item.cartKey)}"
              aria-label="Increase ${escapeHtml(item.name)} quantity"
            >
              +
            </button>
          </div>

          <button
            class="remove-item-button"
            type="button"
            data-cart-action="remove"
            data-cart-key="${escapeHtml(item.cartKey)}"
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  `;
}

function handleCartListClick(event) {
  const actionButton = event.target.closest("[data-cart-action]");

  if (!actionButton) {
    return;
  }

  const { cartAction, cartKey } = actionButton.dataset;

  if (!cartAction || !cartKey) {
    return;
  }

  if (cartAction === "increase") {
    updateCartQuantity(cartKey, 1);
    return;
  }

  if (cartAction === "decrease") {
    updateCartQuantity(cartKey, -1);
    return;
  }

  if (cartAction === "remove") {
    removeCartItem(cartKey);
  }
}

function updateCartQuantity(cartKey, delta) {
  const item = state.cart.find((cartItem) => cartItem.cartKey === cartKey);

  if (!item) {
    return;
  }

  const nextQuantity = item.quantity + delta;

  if (nextQuantity <= 0) {
    removeCartItem(cartKey);
    return;
  }

  item.quantity = clamp(nextQuantity, 1, MAX_ITEM_QUANTITY);

  if (nextQuantity > MAX_ITEM_QUANTITY) {
    showToast({
      type: "info",
      title: "Maximum quantity reached",
      message: `A customized item can have up to ${MAX_ITEM_QUANTITY} drinks.`,
    });
  }

  persistCart();
  renderCart();
}

function removeCartItem(cartKey) {
  const item = state.cart.find((cartItem) => cartItem.cartKey === cartKey);

  if (!item) {
    return;
  }

  state.cart = state.cart.filter((cartItem) => cartItem.cartKey !== cartKey);
  persistCart();
  renderCart();

  showToast({
    type: "info",
    title: "Item removed",
    message: `${item.name} was removed from your cart.`,
  });
}

function clearCart() {
  if (state.cart.length === 0) {
    return;
  }

  const shouldClear = window.confirm("Remove every item from your cart?");

  if (!shouldClear) {
    return;
  }

  state.cart = [];
  persistCart();
  renderCart();

  showToast({
    type: "info",
    title: "Cart cleared",
    message: "All drinks were removed from your cart.",
  });
}

function openCart() {
  elements["cart-panel"].classList.add("is-open");
  elements["cart-panel"].setAttribute("aria-hidden", "false");
  elements["header-cart-button"].setAttribute("aria-expanded", "true");
  elements["page-overlay"].hidden = false;

  requestAnimationFrame(() => {
    elements["page-overlay"].classList.add("is-visible");
  });

  document.body.classList.add("panel-open");
  elements["close-cart-button"].focus();
}

function closeCart() {
  if (!elements["cart-panel"].classList.contains("is-open")) {
    return;
  }

  elements["cart-panel"].classList.remove("is-open");
  elements["cart-panel"].setAttribute("aria-hidden", "true");
  elements["header-cart-button"].setAttribute("aria-expanded", "false");
  elements["page-overlay"].classList.remove("is-visible");
  document.body.classList.remove("panel-open");

  window.setTimeout(() => {
    elements["page-overlay"].hidden = true;
  }, 190);
}

function handleBrowseMenu() {
  closeCart();
  document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
}

function handleCheckoutRequest() {
  if (state.cart.length === 0) {
    showToast({
      type: "warning",
      title: "Your cart is empty",
      message: "Add at least one drink before continuing.",
    });
    return;
  }

  showToast({
    type: "info",
    title: "Cart ready",
    message: "Address selection and secure checkout will be connected in Phase 4.",
  });
}

function handleTrackRequest() {
  showToast({
    type: "info",
    title: "Order tracking",
    message: "Realtime order tracking will be connected after checkout in Phase 5.",
  });
}

function getCartQuantity() {
  return state.cart.reduce((total, item) => total + item.quantity, 0);
}

function getCartSubtotal() {
  return roundCurrency(
    state.cart.reduce(
      (total, item) => total + item.unitPrice * item.quantity,
      0
    )
  );
}

function persistCart() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
  } catch (error) {
    console.error("Unable to save cart:", error);

    showToast({
      type: "error",
      title: "Cart could not be saved",
      message: "Your browser blocked local storage. Keep this page open to avoid losing changes.",
    });
  }
}

function loadCart() {
  try {
    const serializedCart = localStorage.getItem(CART_STORAGE_KEY);

    if (!serializedCart) {
      return [];
    }

    const parsedCart = JSON.parse(serializedCart);

    if (!Array.isArray(parsedCart)) {
      throw new TypeError("Saved cart must be an array.");
    }

    return parsedCart
      .map(normalizeStoredCartItem)
      .filter(Boolean)
      .slice(0, 100);
  } catch (error) {
    console.warn("Saved cart was invalid and has been reset:", error);

    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch {
      // The application can continue with in-memory cart state.
    }

    return [];
  }
}

function normalizeStoredCartItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const product = getProductById(String(item.productId || ""));
  const size = SIZE_OPTIONS.find((option) => option.id === item.size?.id);
  const sugar = SUGAR_OPTIONS.find((option) => option.id === item.sugar?.id);
  const ice = ICE_OPTIONS.find((option) => option.id === item.ice?.id);

  if (!product || !size || !sugar || !ice) {
    return null;
  }

  const addonIds = Array.isArray(item.addons)
    ? item.addons.map((addon) => addon?.id).filter(Boolean)
    : [];

  const addons = addonIds
    .map((addonId) => ADDON_OPTIONS.find((option) => option.id === addonId))
    .filter(Boolean);

  const selection = {
    sizeId: size.id,
    sugarId: sugar.id,
    iceId: ice.id,
    addonIds: addons.map((addon) => addon.id),
  };

  return {
    cartKey: createCartKey({
      productId: product.id,
      ...selection,
    }),
    productId: product.id,
    name: product.name,
    category: product.category,
    size: {
      id: size.id,
      label: size.label,
      price: size.price,
    },
    sugar: {
      id: sugar.id,
      label: sugar.label,
    },
    ice: {
      id: ice.id,
      label: ice.label,
    },
    addons: addons.map((addon) => ({
      id: addon.id,
      label: addon.label,
      price: addon.price,
    })),
    unitPrice: calculateUnitPrice(product, selection),
    quantity: clamp(toSafeInteger(item.quantity, 1), 1, MAX_ITEM_QUANTITY),
    visual: product.visual,
  };
}

function handleStorageSync(event) {
  if (event.key !== CART_STORAGE_KEY) {
    return;
  }

  state.cart = loadCart();
  renderCart();
}

function handleBeforeInstallPrompt(event) {
  event.preventDefault();
  state.installPrompt = event;
  elements["install-button"].hidden = false;
}

async function handleInstallClick() {
  if (!state.installPrompt) {
    return;
  }

  elements["install-button"].disabled = true;

  try {
    await state.installPrompt.prompt();
    const choice = await state.installPrompt.userChoice;

    if (choice.outcome === "accepted") {
      showToast({
        type: "success",
        title: "Installing app",
        message: "Ssupertea Station is being added to your device.",
      });
    }
  } catch (error) {
    console.error("Install prompt failed:", error);

    showToast({
      type: "error",
      title: "Install unavailable",
      message: "The browser could not start the app installation.",
    });
  } finally {
    state.installPrompt = null;
    elements["install-button"].hidden = true;
    elements["install-button"].disabled = false;
  }
}

function handleAppInstalled() {
  state.installPrompt = null;
  elements["install-button"].hidden = true;

  showToast({
    type: "success",
    title: "App installed",
    message: "Ssupertea Station is now available from your home screen.",
  });
}

function applyShortcutView() {
  const requestedView = new URLSearchParams(window.location.search).get("view");

  if (requestedView === "cart") {
    window.setTimeout(openCart, 80);
    return;
  }

  if (requestedView === "menu") {
    window.setTimeout(() => {
      document.getElementById("menu")?.scrollIntoView();
    }, 80);
    return;
  }

  if (requestedView === "tracking") {
    window.setTimeout(handleTrackRequest, 80);
  }
}

function updateScrolledHeader() {
  elements.siteHeader?.classList.toggle("is-scrolled", window.scrollY > 8);

  if (!elements.mobileNavLinks.length) {
    return;
  }

  const menuSection = document.getElementById("menu");
  const menuIsActive =
    menuSection && window.scrollY >= menuSection.offsetTop - window.innerHeight * 0.35;

  elements.mobileNavLinks.forEach((link) => {
    const shouldBeActive =
      (link.dataset.navView === "menu" && menuIsActive) ||
      (link.dataset.navView === "home" && !menuIsActive);

    link.classList.toggle("is-active", shouldBeActive);
  });
}

function updateCurrentYear() {
  elements["current-year"].textContent = String(new Date().getFullYear());
}

function showToast({
  type = "info",
  title = "Notice",
  message = "",
  duration = TOAST_DURATION_MS,
} = {}) {
  const safeType = ["success", "error", "warning", "info"].includes(type)
    ? type
    : "info";

  const iconMap = {
    success: "✓",
    error: "!",
    warning: "!",
    info: "i",
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${safeType}`;
  toast.setAttribute("role", safeType === "error" ? "alert" : "status");

  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${iconMap[safeType]}</span>

    <div class="toast-copy">
      <strong>${escapeHtml(title)}</strong>
      ${message ? `<p>${escapeHtml(message)}</p>` : ""}
    </div>

    <button class="toast-close" type="button" aria-label="Dismiss notification">×</button>
  `;

  const closeButton = toast.querySelector(".toast-close");
  let removalTimer = null;

  const removeToast = () => {
    if (!toast.isConnected || toast.classList.contains("is-leaving")) {
      return;
    }

    window.clearTimeout(removalTimer);
    toast.classList.add("is-leaving");

    window.setTimeout(() => {
      toast.remove();
    }, 175);
  };

  closeButton?.addEventListener("click", removeToast);
  elements["toast-region"].append(toast);

  while (elements["toast-region"].children.length > 4) {
    elements["toast-region"].firstElementChild?.remove();
  }

  removalTimer = window.setTimeout(removeToast, Math.max(1800, duration));
}

function getProductById(productId) {
  return MENU_ITEMS.find((item) => item.id === productId) || null;
}

function getVisualVariables(product) {
  return visualToCssVariables(product.visual);
}

function visualToCssVariables(visual) {
  return [
    `--visual-bg:${sanitizeCssColor(visual.background, "#EEF6D7")}`,
    `--drink-top:${sanitizeCssColor(visual.top, "#E9D8AA")}`,
    `--drink-middle:${sanitizeCssColor(visual.middle, "#BB8455")}`,
    `--drink-bottom:${sanitizeCssColor(visual.bottom, "#573526")}`,
    `--cup-rotation:${sanitizeRotation(visual.rotation)}`,
  ].join(";");
}

function sanitizeCssColor(value, fallback) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(value || "")) ? value : fallback;
}

function sanitizeRotation(value) {
  return /^-?\d{1,2}deg$/.test(String(value || "")) ? value : "0deg";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundCurrency(value));
}

function formatCartCount(value) {
  return value > 99 ? "99+" : String(value);
}

function roundCurrency(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.round((numericValue + Number.EPSILON) * 100) / 100
    : 0;
}

function toSafeInteger(value, fallback = 0) {
  const numericValue = Number(value);

  if (!Number.isSafeInteger(numericValue)) {
    return fallback;
  }

  return numericValue;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
