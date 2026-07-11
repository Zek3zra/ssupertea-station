import {
  customerSupabase,
  ensureCustomerSession,
} from "/js/supabase-config.js";

import {
  OPENSTREETMAP_CONFIG,
} from "/js/openstreetmap-config.js";

const CART_STORAGE_KEY = "ssupertea-cart-v1";
const CUSTOMER_NAME_STORAGE_KEY = "ssupertea-customer-name-v1";
const CUSTOMER_SESSION_TOKEN_STORAGE_KEY =
  "ssupertea-customer-session-token-v1";
const LAST_ORDER_STORAGE_KEY = "ssupertea-last-order-v1";

const MAX_ITEM_QUANTITY = 20;
const MAX_DELIVERY_ADDRESS_LENGTH = 500;
const TOAST_DURATION_MS = 3800;

const TRACKING_STATUS_ORDER = Object.freeze([
  "pending",
  "preparing",
  "dispatched",
  "completed",
]);

const TERMINAL_ORDER_STATUSES = new Set([
  "completed",
  "cancelled",
]);

let leafletLoadPromise = null;

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
  checkout: {
    map: null,
    marker: null,
    shopMarker: null,
    accuracyCircle: null,
    routeLayer: null,
    routeAbortController: null,
    reverseGeocodeAbortController: null,
    routeRequestId: 0,
    reverseGeocodeRequestId: 0,
    leafletReady: false,
    mapVisible: false,
    selectedLocation: null,
    routeOrigin: null,
    routeDistanceMeters: null,
    routeDurationSeconds: null,
    deliveryFee: 0,
    routeReady: false,
    addressResolved: false,
    isLocating: false,
    isSubmitting: false,
  },
  tracking: {
    channel: null,
    orderId: null,
    order: null,
    subscriptionStatus: "idle",
    reconnectTimer: null,
  },
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
  restoreSavedCustomerName();
  restoreOrderTracking();
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
    "checkout-dialog",
    "checkout-form",
    "close-checkout-button",
    "order-type-options",
    "customer-name",
    "pickup-details",
    "delivery-details",
    "address-line1",
    "address-city",
    "address-province",
    "address-landmark",
    "location-address-status",
    "use-current-location-button",
    "toggle-map-button",
    "clear-map-pin-button",
    "delivery-map-panel",
    "map-status",
    "delivery-map",
    "map-instructions",
    "selected-location-card",
    "selected-location-coordinates",
    "open-google-maps-link",
    "route-summary-card",
    "route-status",
    "route-distance",
    "route-duration",
    "route-delivery-fee",
    "delivery-address",
    "delivery-lat",
    "delivery-lng",
    "checkout-summary-list",
    "checkout-summary-count",
    "checkout-items-subtotal",
    "checkout-delivery-fee-row",
    "checkout-delivery-fee",
    "checkout-summary-total",
    "checkout-submit-button",
    "checkout-submit-label",
    "checkout-submit-total",
    "order-confirmation-dialog",
    "confirmation-customer-name",
    "confirmation-order-number",
    "confirmation-status",
    "confirmation-order-type",
    "confirmation-delivery-fee-row",
    "confirmation-delivery-fee",
    "confirmation-total",
    "confirmation-track-button",
    "close-confirmation-button",
    "tracking-dialog",
    "close-tracking-button",
    "refresh-tracking-button",
    "tracking-order-number",
    "tracking-connection-dot",
    "tracking-connection-status",
    "tracking-current-status",
    "tracking-status-message",
    "tracking-timeline",
    "tracking-dispatched-label",
    "tracking-dispatched-copy",
    "tracking-cancelled-card",
    "tracking-created-at",
    "tracking-items",
    "tracking-items-subtotal",
    "tracking-delivery-fee-row",
    "tracking-delivery-fee",
    "tracking-total",
    "tracking-delivery-card",
    "tracking-delivery-address",
    "tracking-route-distance",
    "tracking-route-duration",
    "tracking-google-maps-link",
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

  elements["close-checkout-button"].addEventListener("click", closeCheckoutDialog);
  elements["checkout-form"].addEventListener("submit", handleCheckoutSubmit);
  elements["order-type-options"].addEventListener(
    "change",
    handleOrderTypeChange
  );
  elements["use-current-location-button"].addEventListener(
    "click",
    useCurrentDeliveryLocation
  );

  elements["toggle-map-button"].addEventListener(
    "click",
    toggleDeliveryMap
  );

  elements["clear-map-pin-button"].addEventListener(
    "click",
    clearSelectedDeliveryLocation
  );

  elements["close-confirmation-button"].addEventListener(
    "click",
    closeOrderConfirmation
  );
  elements["confirmation-track-button"].addEventListener(
    "click",
    handleConfirmationTrackRequest
  );

  elements["close-tracking-button"].addEventListener(
    "click",
    closeTrackingDialog
  );

  elements["refresh-tracking-button"].addEventListener(
    "click",
    refreshTrackedOrder
  );

  elements["customize-dialog"].addEventListener("close", () => {
    state.selectedProductId = null;
    syncDialogBodyState();
  });

  elements["customize-dialog"].addEventListener("click", (event) => {
    if (event.target === elements["customize-dialog"]) {
      closeCustomizeDialog();
    }
  });

  elements["checkout-dialog"].addEventListener("close", () => {
    setCheckoutSubmitting(false);
    syncDialogBodyState();
  });

  elements["checkout-dialog"].addEventListener("cancel", (event) => {
    if (state.checkout.isSubmitting) {
      event.preventDefault();
    }
  });

  elements["checkout-dialog"].addEventListener("click", (event) => {
    if (
      event.target === elements["checkout-dialog"] &&
      !state.checkout.isSubmitting
    ) {
      closeCheckoutDialog();
    }
  });

  elements["order-confirmation-dialog"].addEventListener("close", () => {
    syncDialogBodyState();
  });

  elements["order-confirmation-dialog"].addEventListener("click", (event) => {
    if (event.target === elements["order-confirmation-dialog"]) {
      closeOrderConfirmation();
    }
  });

  elements["tracking-dialog"].addEventListener("close", () => {
    syncDialogBodyState();
  });

  elements["tracking-dialog"].addEventListener("click", (event) => {
    if (event.target === elements["tracking-dialog"]) {
      closeTrackingDialog();
    }
  });

  window.addEventListener("scroll", updateScrolledHeader, { passive: true });
  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);
  window.addEventListener("storage", handleStorageSync);
  window.addEventListener("online", handleTrackingOnline);
  window.addEventListener("offline", handleTrackingOffline);

  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      state.tracking.orderId
    ) {
      refreshTrackedOrder();
    }
  });

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
  if (!Array.isArray(state.cart)) {
    state.cart = [];
  }

  const hasItems = state.cart.length > 0;

  setElementHidden(
    elements["cart-empty-state"],
    hasItems
  );

  setElementHidden(
    elements["cart-list"],
    !hasItems
  );

  setElementHidden(
    elements["cart-footer"],
    !hasItems
  );

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

  if (elements["checkout-dialog"]?.open) {
    renderCheckoutSummary();
  }
}

function setElementHidden(element, shouldHide) {
  element.hidden = Boolean(shouldHide);
  element.classList.toggle(
    "is-hidden",
    Boolean(shouldHide)
  );
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

  openCheckoutDialog();
}

function openCheckoutDialog() {
  closeCart();
  renderCheckoutSummary();
  syncCheckoutOrderType();

  if (!elements["checkout-dialog"].open) {
    elements["checkout-dialog"].showModal();
  }

  document.body.classList.add("dialog-open");

  requestAnimationFrame(() => {
    elements["customer-name"].focus();

    window.setTimeout(() => {
      state.checkout.map?.invalidateSize();
    }, 100);
  });
}

function closeCheckoutDialog() {
  if (state.checkout.isSubmitting) {
    return;
  }

  if (elements["checkout-dialog"].open) {
    elements["checkout-dialog"].close();
  }
}

function handleOrderTypeChange() {
  syncCheckoutOrderType();
}

function getSelectedOrderType() {
  const selectedInput = elements["checkout-form"].querySelector(
    'input[name="order-type"]:checked'
  );

  return selectedInput?.value === "delivery" ? "delivery" : "pickup";
}

function syncCheckoutOrderType() {
  const orderType = getSelectedOrderType();
  const isDelivery = orderType === "delivery";

  elements["pickup-details"].hidden = isDelivery;
  elements["delivery-details"].hidden = !isDelivery;

  const requiredDeliveryFields = [
    elements["address-line1"],
    elements["address-city"],
    elements["address-province"],
  ];

  const allDeliveryFields = [
    ...requiredDeliveryFields,
    elements["address-landmark"],
  ];

  allDeliveryFields.forEach((field) => {
    field.disabled = !isDelivery;
  });

  requiredDeliveryFields.forEach((field) => {
    field.required = isDelivery;
  });

  if (!isDelivery) {
    hideDeliveryMap();
  }

  renderCheckoutSummary();
}

function renderCheckoutSummary() {
  const itemsSubtotal = getCartSubtotal();
  const quantity = getCartQuantity();
  const isDelivery =
    getSelectedOrderType() === "delivery";

  const deliveryFee =
    isDelivery &&
    state.checkout.routeReady
      ? state.checkout.deliveryFee
      : 0;

  const total = roundCurrency(
    itemsSubtotal + deliveryFee
  );

  elements["checkout-summary-list"].innerHTML = state.cart
    .map((item) => {
      const itemTotal = roundCurrency(
        item.unitPrice * item.quantity
      );

      const addonLabel =
        item.addons.length > 0
          ? item.addons
              .map((addon) => addon.label)
              .join(", ")
          : "No add-ons";

      return `
        <article class="checkout-summary-item">
          <strong>${item.quantity}× ${escapeHtml(item.name)}</strong>
          <span>${formatCurrency(itemTotal)}</span>
          <p>
            ${escapeHtml(item.size.label)} ·
            ${escapeHtml(item.sugar.label)} sugar ·
            ${escapeHtml(item.ice.label)} ·
            ${escapeHtml(addonLabel)}
          </p>
        </article>
      `;
    })
    .join("");

  elements["checkout-summary-count"].textContent =
    String(quantity);

  elements["checkout-items-subtotal"].textContent =
    formatCurrency(itemsSubtotal);

  setElementHidden(
    elements["checkout-delivery-fee-row"],
    !isDelivery
  );

  elements["checkout-delivery-fee"].textContent =
    state.checkout.routeReady
      ? formatCurrency(deliveryFee)
      : "Waiting for route";

  elements["checkout-summary-total"].textContent =
    formatCurrency(total);

  elements["checkout-submit-total"].textContent =
    formatCurrency(total);

  const deliveryIsReady =
    !isDelivery ||
    (
      state.checkout.routeReady &&
      state.checkout.addressResolved &&
      Boolean(state.checkout.selectedLocation)
    );

  elements["checkout-submit-button"].disabled =
    state.cart.length === 0 ||
    state.checkout.isSubmitting ||
    !deliveryIsReady;
}

async function toggleDeliveryMap() {
  if (state.checkout.mapVisible) {
    hideDeliveryMap();
    return;
  }

  await showDeliveryMap();
}

async function showDeliveryMap() {
  elements["delivery-map-panel"].hidden = false;
  state.checkout.mapVisible = true;
  elements["toggle-map-button"].setAttribute("aria-expanded", "true");
  elements["toggle-map-button"].querySelector("span").textContent = "Hide map";

  try {
    await initializeDeliveryMap();

    window.setTimeout(() => {
      state.checkout.map?.invalidateSize();

      if (state.checkout.selectedLocation) {
        state.checkout.map?.setView(
          [
            state.checkout.selectedLocation.latitude,
            state.checkout.selectedLocation.longitude,
          ],
          OPENSTREETMAP_CONFIG.selectedLocationZoom
        );
      }
    }, 80);
  } catch (error) {
    console.error("OpenStreetMap initialization failed:", error);

    setMapStatus(
      "The map could not load. Check your internet connection and try again.",
      "error"
    );
  }
}

function hideDeliveryMap() {
  elements["delivery-map-panel"].hidden = true;
  state.checkout.mapVisible = false;
  elements["toggle-map-button"].setAttribute("aria-expanded", "false");
  elements["toggle-map-button"].querySelector("span").textContent =
    "Choose location on map";
}

async function initializeDeliveryMap() {
  if (state.checkout.leafletReady && state.checkout.map) {
    window.setTimeout(() => {
      state.checkout.map?.invalidateSize();
    }, 80);

    return state.checkout.map;
  }

  setMapStatus("Loading the OpenStreetMap delivery map…");

  await loadLeafletLibrary();

  const leaflet = window.L;

  if (!leaflet) {
    throw new Error("LEAFLET_UNAVAILABLE");
  }

  const {
    latitude,
    longitude,
    zoom,
  } = OPENSTREETMAP_CONFIG.defaultView;

  const map = leaflet.map(elements["delivery-map"], {
    center: [latitude, longitude],
    zoom,
    minZoom: OPENSTREETMAP_CONFIG.tiles.minimumZoom,
    maxZoom: OPENSTREETMAP_CONFIG.tiles.maximumZoom,
    zoomControl: true,
    attributionControl: true,
    preferCanvas: true,
  });

  leaflet
    .tileLayer(OPENSTREETMAP_CONFIG.tiles.url, {
      minZoom: OPENSTREETMAP_CONFIG.tiles.minimumZoom,
      maxZoom: OPENSTREETMAP_CONFIG.tiles.maximumZoom,
      attribution: OPENSTREETMAP_CONFIG.tiles.attribution,
      updateWhenIdle: true,
      keepBuffer: 2,
    })
    .addTo(map);

  map.on("click", (event) => {
    selectDeliveryLocation(
      event.latlng.lat,
      event.latlng.lng,
      {
        source: "map",
        centerMap: false,
      }
    );
  });

  map.whenReady(() => {
    setMapStatus(
      "Tap the map or use your current location to place the delivery pin."
    );
  });

  state.checkout.map = map;
  state.checkout.leafletReady = true;

  window.setTimeout(() => {
    map.invalidateSize();
  }, 120);

  return map;
}

function loadLeafletLibrary() {
  if (window.L?.map) {
    return Promise.resolve(window.L);
  }

  if (leafletLoadPromise) {
    return leafletLoadPromise;
  }

  leafletLoadPromise = new Promise((resolve, reject) => {
    const leafletSettings = OPENSTREETMAP_CONFIG.leaflet;

    let stylesheet = document.querySelector(
      'link[data-ssupertea-leaflet="true"]'
    );

    if (!stylesheet) {
      stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = leafletSettings.cssUrl;
      stylesheet.integrity = leafletSettings.cssIntegrity;
      stylesheet.crossOrigin = "anonymous";
      stylesheet.dataset.ssuperteaLeaflet = "true";
      document.head.append(stylesheet);
    }

    let script = document.querySelector(
      'script[data-ssupertea-leaflet="true"]'
    );

    if (script) {
      if (window.L?.map) {
        resolve(window.L);
        return;
      }

      script.addEventListener(
        "load",
        () => resolve(window.L),
        { once: true }
      );

      script.addEventListener(
        "error",
        () => reject(new Error("LEAFLET_LOAD_FAILED")),
        { once: true }
      );

      return;
    }

    script = document.createElement("script");
    script.src = leafletSettings.scriptUrl;
    script.integrity = leafletSettings.scriptIntegrity;
    script.crossOrigin = "anonymous";
    script.defer = true;
    script.dataset.ssuperteaLeaflet = "true";

    script.addEventListener(
      "load",
      () => {
        if (window.L?.map) {
          resolve(window.L);
          return;
        }

        leafletLoadPromise = null;
        reject(new Error("LEAFLET_UNAVAILABLE"));
      },
      { once: true }
    );

    script.addEventListener(
      "error",
      () => {
        leafletLoadPromise = null;
        script.remove();
        reject(new Error("LEAFLET_LOAD_FAILED"));
      },
      { once: true }
    );

    document.head.append(script);
  });

  return leafletLoadPromise;
}

async function useCurrentDeliveryLocation() {
  if (state.checkout.isLocating) {
    return;
  }

  await showDeliveryMap();

  if (!window.isSecureContext) {
    setMapStatus(
      "Current location requires HTTPS or localhost. You can still tap the map to place the pin.",
      "error"
    );

    return;
  }

  if (!("geolocation" in navigator)) {
    setMapStatus(
      "This browser does not provide location access. Tap the map to place the pin manually.",
      "error"
    );

    return;
  }

  try {
    await initializeDeliveryMap();
  } catch (error) {
    console.error("Unable to initialize the map for geolocation:", error);

    setMapStatus(
      "The map is unavailable. Check your connection and try again.",
      "error"
    );

    return;
  }

  state.checkout.isLocating = true;
  elements["use-current-location-button"].disabled = true;
  elements["use-current-location-button"].querySelector("span").textContent =
    "Finding location…";

  setMapStatus(
    "Requesting your device location. Approve the browser permission when asked."
  );

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latitude = Number(position.coords.latitude);
      const longitude = Number(position.coords.longitude);
      const accuracy = Number(position.coords.accuracy);

      selectDeliveryLocation(latitude, longitude, {
        source: "gps",
        centerMap: true,
        accuracy,
      });

      finishLocationRequest();
    },
    (error) => {
      console.warn("Geolocation request failed:", error);

      setMapStatus(
        getGeolocationErrorMessage(error),
        "error"
      );

      finishLocationRequest();
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000,
    }
  );
}

function finishLocationRequest() {
  state.checkout.isLocating = false;
  elements["use-current-location-button"].disabled = false;
  elements["use-current-location-button"].querySelector("span").textContent =
    "Use current location";
}

function getGeolocationErrorMessage(error) {
  if (error?.code === 1) {
    return "Location permission was denied. Tap the map to place the pin manually.";
  }

  if (error?.code === 2) {
    return "Your device could not determine its location. Tap the map to place the pin.";
  }

  if (error?.code === 3) {
    return "Finding your location took too long. Try again or place the pin manually.";
  }

  return "Current location is unavailable. Tap the map to place the pin manually.";
}

function selectDeliveryLocation(
  latitude,
  longitude,
  {
    source = "map",
    centerMap = true,
    accuracy = null,
  } = {}
) {
  const normalizedLatitude = Number(latitude);
  const normalizedLongitude = Number(longitude);

  if (
    !Number.isFinite(normalizedLatitude) ||
    !Number.isFinite(normalizedLongitude) ||
    normalizedLatitude < -90 ||
    normalizedLatitude > 90 ||
    normalizedLongitude < -180 ||
    normalizedLongitude > 180
  ) {
    setMapStatus(
      "The selected coordinates are invalid. Choose another location.",
      "error"
    );

    return;
  }

  const leaflet = window.L;
  const map = state.checkout.map;

  if (!leaflet || !map) {
    setMapStatus(
      "The map is not ready yet. Wait a moment and try again.",
      "error"
    );

    return;
  }

  const location = [
    normalizedLatitude,
    normalizedLongitude,
  ];

  if (!state.checkout.marker) {
    const markerIcon = leaflet.divIcon({
      className: "ssupertea-map-marker-shell",
      html: '<span class="ssupertea-map-marker"><span>S</span></span>',
      iconSize: [42, 50],
      iconAnchor: [21, 46],
    });

    state.checkout.marker = leaflet
      .marker(location, {
        draggable: true,
        keyboard: true,
        autoPan: true,
        icon: markerIcon,
        title: "Ssupertea delivery location",
      })
      .addTo(map);

    state.checkout.marker.on("dragend", (event) => {
      const draggedLocation = event.target.getLatLng();

      selectDeliveryLocation(
        draggedLocation.lat,
        draggedLocation.lng,
        {
          source: "drag",
          centerMap: false,
        }
      );
    });
  } else {
    state.checkout.marker.setLatLng(location);
  }

  if (state.checkout.accuracyCircle) {
    state.checkout.accuracyCircle.remove();
    state.checkout.accuracyCircle = null;
  }

  if (
    source === "gps" &&
    Number.isFinite(Number(accuracy)) &&
    Number(accuracy) > 0
  ) {
    state.checkout.accuracyCircle = leaflet
      .circle(location, {
        radius: Math.min(Number(accuracy), 5000),
        color: "#0e5b3b",
        weight: 1,
        fillColor: "#a7c957",
        fillOpacity: 0.13,
        interactive: false,
      })
      .addTo(map);
  }

  if (centerMap) {
    map.setView(
      location,
      OPENSTREETMAP_CONFIG.selectedLocationZoom,
      {
        animate: true,
      }
    );
  }

  state.checkout.selectedLocation = {
    latitude: normalizedLatitude,
    longitude: normalizedLongitude,
    source,
  };

  elements["delivery-lat"].value = String(normalizedLatitude);
  elements["delivery-lng"].value = String(normalizedLongitude);
  elements["selected-location-coordinates"].textContent =
    formatCoordinates(
      normalizedLatitude,
      normalizedLongitude
    );

  elements["selected-location-card"].hidden = false;
  elements["clear-map-pin-button"].disabled = false;
  elements["open-google-maps-link"].href =
    createGoogleMapsDirectionsLink(
      normalizedLatitude,
      normalizedLongitude
    );

  setMapStatus(
    source === "gps"
      ? "Current location selected. Drag the pin if the exact delivery entrance is different."
      : "Delivery pin selected. Drag it to make the location more accurate.",
    "success"
  );

  requestDeliveryRoute(
    normalizedLatitude,
    normalizedLongitude
  );

  reverseGeocodeDeliveryLocation(
    normalizedLatitude,
    normalizedLongitude
  );
}

function clearSelectedDeliveryLocation() {
  state.checkout.selectedLocation = null;

  if (state.checkout.marker) {
    state.checkout.marker.remove();
    state.checkout.marker = null;
  }

  if (state.checkout.accuracyCircle) {
    state.checkout.accuracyCircle.remove();
    state.checkout.accuracyCircle = null;
  }

  elements["delivery-lat"].value = "";
  elements["delivery-lng"].value = "";
  elements["selected-location-coordinates"].textContent = "";
  elements["selected-location-card"].hidden = true;
  elements["clear-map-pin-button"].disabled = true;
  elements["open-google-maps-link"].href =
    "https://www.google.com/maps/";

  clearDeliveryRoute();
  clearResolvedDeliveryAddress();

  setMapStatus(
    "Tap the map or use your current location to place the delivery pin."
  );

  renderCheckoutSummary();
}

function setMapStatus(message, type = "info") {
  const statusElement = elements["map-status"];

  statusElement.textContent = message;
  statusElement.classList.toggle(
    "is-error",
    type === "error"
  );
  statusElement.classList.toggle(
    "is-success",
    type === "success"
  );
}

function formatCoordinates(latitude, longitude) {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function createGoogleMapsDirectionsLink(latitude, longitude) {
  const destination = encodeURIComponent(
    `${latitude.toFixed(6)},${longitude.toFixed(6)}`
  );

  const origin = state.checkout.routeOrigin;

  if (
    origin &&
    Number.isFinite(origin.latitude) &&
    Number.isFinite(origin.longitude)
  ) {
    const encodedOrigin = encodeURIComponent(
      `${origin.latitude.toFixed(6)},${origin.longitude.toFixed(6)}`
    );

    return (
      "https://www.google.com/maps/dir/?api=1" +
      `&origin=${encodedOrigin}` +
      `&destination=${destination}` +
      "&travelmode=driving"
    );
  }

  return (
    "https://www.google.com/maps/dir/?api=1" +
    `&destination=${destination}` +
    "&travelmode=driving"
  );
}

async function requestDeliveryRoute(latitude, longitude) {
  const requestId = ++state.checkout.routeRequestId;

  state.checkout.routeAbortController?.abort();
  state.checkout.routeAbortController = new AbortController();

  setRouteSummary({
    state: "loading",
    status: "Calculating the route from Ssupertea Station…",
  });

  try {
    const response = await fetch(
      OPENSTREETMAP_CONFIG.routing.endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          destination: {
            latitude,
            longitude,
          },
        }),
        signal: state.checkout.routeAbortController.signal,
      }
    );

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const routeError = new Error(
        payload?.message || "ROUTE_REQUEST_FAILED"
      );

      routeError.code = payload?.code || "";
      routeError.status = response.status;
      throw routeError;
    }

    if (requestId !== state.checkout.routeRequestId) {
      return;
    }

    drawDeliveryRoute(payload);

    state.checkout.routeOrigin = {
      latitude: Number(payload.shop?.latitude),
      longitude: Number(payload.shop?.longitude),
    };

    state.checkout.routeDistanceMeters =
      Number(payload.summary?.distance);

    state.checkout.routeDurationSeconds =
      Number(payload.summary?.duration);

    state.checkout.deliveryFee =
      Number(payload.summary?.delivery_fee) || 0;

    state.checkout.routeReady =
      Number.isFinite(
        state.checkout.routeDistanceMeters
      ) &&
      Number.isFinite(
        state.checkout.routeDurationSeconds
      );

    elements["open-google-maps-link"].href =
      createGoogleMapsDirectionsLink(
        latitude,
        longitude
      );

    setRouteSummary({
      state: "success",
      status: `Route from ${payload.shop?.name || "Ssupertea Station"}`,
      distanceMeters: Number(payload.summary?.distance),
      durationSeconds: Number(payload.summary?.duration),
      deliveryFee: Number(payload.summary?.delivery_fee),
    });

    renderCheckoutSummary();
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }

    console.error("OpenRouteService route request failed:", error);

    if (requestId !== state.checkout.routeRequestId) {
      return;
    }

    removeRouteLayers();

    state.checkout.routeDistanceMeters = null;
    state.checkout.routeDurationSeconds = null;
    state.checkout.deliveryFee = 0;
    state.checkout.routeReady = false;

    setRouteSummary({
      state: "error",
      status: getRouteErrorMessage(error),
    });

    renderCheckoutSummary();
  }
}

function drawDeliveryRoute(payload) {
  removeRouteLayers();

  const leaflet = window.L;
  const map = state.checkout.map;
  const feature = payload?.route;

  if (!leaflet || !map || !feature) {
    return;
  }

  state.checkout.routeLayer = leaflet
    .geoJSON(feature, {
      style: {
        color: "#0e5b3b",
        weight: 5,
        opacity: 0.84,
      },
    })
    .addTo(map);

  const shopLatitude = Number(payload.shop?.latitude);
  const shopLongitude = Number(payload.shop?.longitude);

  if (
    Number.isFinite(shopLatitude) &&
    Number.isFinite(shopLongitude)
  ) {
    const shopIcon = leaflet.divIcon({
      className: "ssupertea-shop-marker-shell",
      html: '<span class="ssupertea-shop-marker">SHOP</span>',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    state.checkout.shopMarker = leaflet
      .marker(
        [shopLatitude, shopLongitude],
        {
          icon: shopIcon,
          keyboard: false,
          interactive: false,
        }
      )
      .addTo(map);
  }

  const routeBounds = state.checkout.routeLayer.getBounds();

  if (routeBounds.isValid()) {
    map.fitBounds(routeBounds, {
      padding: [28, 28],
      maxZoom: OPENSTREETMAP_CONFIG.selectedLocationZoom,
    });
  }
}

function removeRouteLayers() {
  if (state.checkout.routeLayer) {
    state.checkout.routeLayer.remove();
    state.checkout.routeLayer = null;
  }

  if (state.checkout.shopMarker) {
    state.checkout.shopMarker.remove();
    state.checkout.shopMarker = null;
  }
}

function clearDeliveryRoute() {
  state.checkout.routeRequestId += 1;
  state.checkout.routeAbortController?.abort();
  state.checkout.routeAbortController = null;
  state.checkout.routeOrigin = null;
  state.checkout.routeDistanceMeters = null;
  state.checkout.routeDurationSeconds = null;
  state.checkout.deliveryFee = 0;
  state.checkout.routeReady = false;

  removeRouteLayers();

  elements["route-summary-card"].hidden = true;
  elements["route-summary-card"].classList.remove(
    "is-loading",
    "is-error"
  );
  elements["route-status"].textContent =
    "Waiting for a delivery pin.";
  elements["route-distance"].textContent = "—";
  elements["route-duration"].textContent = "—";
  elements["route-delivery-fee"].textContent = "—";
}

function setRouteSummary({
  state: routeState,
  status,
  distanceMeters = null,
  durationSeconds = null,
  deliveryFee = null,
}) {
  const card = elements["route-summary-card"];

  card.hidden = false;
  card.classList.toggle(
    "is-loading",
    routeState === "loading"
  );
  card.classList.toggle(
    "is-error",
    routeState === "error"
  );

  elements["route-status"].textContent = status;

  elements["route-distance"].textContent =
    Number.isFinite(distanceMeters)
      ? formatRouteDistance(distanceMeters)
      : "—";

  elements["route-duration"].textContent =
    Number.isFinite(durationSeconds)
      ? formatRouteDuration(durationSeconds)
      : "—";

  elements["route-delivery-fee"].textContent =
    Number.isFinite(deliveryFee)
      ? formatCurrency(deliveryFee)
      : "—";
}

function getRouteErrorMessage(error) {
  if (error?.code === "ORS_NOT_CONFIGURED") {
    return "OpenRouteService is not configured on Vercel yet. The delivery pin and Google Maps button still work.";
  }

  if (error?.code === "ORS_INVALID_KEY") {
    return "The OpenRouteService key in Vercel is invalid or has been revoked.";
  }

  if (error?.code === "ORS_DAILY_QUOTA_REACHED") {
    return "The daily OpenRouteService quota has been reached. Try again after the quota resets.";
  }

  if (
    error?.code === "ORS_RATE_LIMITED" ||
    error?.status === 429
  ) {
    return "The route service is receiving too many requests. Try moving the pin again shortly.";
  }

  if (error?.code === "ORS_TIMEOUT") {
    return "The route calculation timed out. Try again or use the Google Maps button.";
  }

  if (error?.code === "DESTINATION_TOO_FAR") {
    return error.message || "This location is outside the configured delivery range.";
  }

  if (!navigator.onLine) {
    return "Reconnect to calculate distance and estimated travel time.";
  }

  return "The route could not be calculated, but you can still submit the selected delivery pin.";
}

function formatRouteDistance(distanceMeters) {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

function formatRouteDuration(durationSeconds) {
  const totalMinutes = Math.max(
    1,
    Math.round(durationSeconds / 60)
  );

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes > 0
    ? `${hours} hr ${minutes} min`
    : `${hours} hr`;
}

async function reverseGeocodeDeliveryLocation(
  latitude,
  longitude
) {
  const requestId =
    ++state.checkout.reverseGeocodeRequestId;

  state.checkout.reverseGeocodeAbortController?.abort();

  state.checkout.reverseGeocodeAbortController =
    new AbortController();

  state.checkout.addressResolved = false;
  elements["address-city"].value = "";
  elements["address-province"].value = "";
  elements["address-city"].classList.remove("is-autofilled");
  elements["address-province"].classList.remove("is-autofilled");

  setLocationAddressStatus(
    "Finding the city and province from the selected location…",
    "loading"
  );

  renderCheckoutSummary();

  try {
    const response = await fetch(
      "/api/reverse-geocode",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          latitude,
          longitude,
        }),
        signal:
          state.checkout.reverseGeocodeAbortController.signal,
      }
    );

    const payload =
      await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(
        payload?.message ||
        "REVERSE_GEOCODE_FAILED"
      );

      error.code = payload?.code || "";
      throw error;
    }

    if (
      requestId !==
      state.checkout.reverseGeocodeRequestId
    ) {
      return;
    }

    elements["address-city"].value =
      String(payload.city || "").trim();

    elements["address-province"].value =
      String(payload.province || "").trim();

    state.checkout.addressResolved =
      Boolean(
        elements["address-city"].value &&
        elements["address-province"].value
      );

    elements["address-city"].classList.toggle(
      "is-autofilled",
      state.checkout.addressResolved
    );

    elements["address-province"].classList.toggle(
      "is-autofilled",
      state.checkout.addressResolved
    );

    setLocationAddressStatus(
      state.checkout.addressResolved
        ? "City and province were filled automatically. Enter only the house number, purok, and an optional landmark."
        : "The city or province could not be identified.",
      state.checkout.addressResolved
        ? "success"
        : "error"
    );
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }

    console.error(
      "Delivery reverse geocoding failed:",
      error
    );

    state.checkout.addressResolved = false;

    /*
     * Fallback: unlock the fields so checkout is still usable if Pelias
     * does not have enough local address data for the selected point.
     */
    elements["address-city"].readOnly = false;
    elements["address-province"].readOnly = false;

    setLocationAddressStatus(
      "Automatic location lookup failed. Enter the city and province manually.",
      "error"
    );
  } finally {
    renderCheckoutSummary();
  }
}

function clearResolvedDeliveryAddress() {
  state.checkout.reverseGeocodeRequestId += 1;
  state.checkout.reverseGeocodeAbortController?.abort();
  state.checkout.reverseGeocodeAbortController = null;
  state.checkout.addressResolved = false;

  elements["address-city"].value = "";
  elements["address-province"].value = "";
  elements["address-city"].readOnly = true;
  elements["address-province"].readOnly = true;
  elements["address-city"].classList.remove("is-autofilled");
  elements["address-province"].classList.remove("is-autofilled");

  setLocationAddressStatus(
    "Select a map pin or use your current location to fill the city and province."
  );
}

function setLocationAddressStatus(
  message,
  type = "info"
) {
  const status =
    elements["location-address-status"];

  status.textContent = message;
  status.classList.toggle(
    "is-loading",
    type === "loading"
  );
  status.classList.toggle(
    "is-success",
    type === "success"
  );
  status.classList.toggle(
    "is-error",
    type === "error"
  );
}

async function handleCheckoutSubmit(event) {
  event.preventDefault();

  if (state.checkout.isSubmitting) {
    return;
  }

  if (state.cart.length === 0) {
    showToast({
      type: "warning",
      title: "Your cart changed",
      message: "Add at least one drink before placing the order.",
    });

    closeCheckoutDialog();
    return;
  }

  const customerName = normalizeCustomerName(
    elements["customer-name"].value
  );

  if (customerName.length < 2 || customerName.length > 120) {
    elements["customer-name"].setCustomValidity(
      "Enter a name between 2 and 120 characters."
    );
    elements["customer-name"].reportValidity();
    elements["customer-name"].setCustomValidity("");
    return;
  }

  const orderType = getSelectedOrderType();
  let deliveryAddress = null;
  let deliveryLatitude = null;
  let deliveryLongitude = null;

  if (orderType === "delivery") {
    if (!elements["checkout-form"].checkValidity()) {
      elements["checkout-form"].reportValidity();
      return;
    }

    const selectedLocation =
      state.checkout.selectedLocation;

    if (!selectedLocation) {
      setMapStatus(
        "Place the delivery pin on the map before submitting the order.",
        "error"
      );

      elements["delivery-map"].scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      return;
    }

    deliveryAddress = buildDeliveryAddress();
    deliveryLatitude = selectedLocation.latitude;
    deliveryLongitude = selectedLocation.longitude;

    elements["delivery-address"].value =
      deliveryAddress;

    if (
      deliveryAddress.length < 5 ||
      deliveryAddress.length > MAX_DELIVERY_ADDRESS_LENGTH
    ) {
      showToast({
        type: "error",
        title: "Check the delivery address",
        message: "Enter a complete address under 500 characters.",
      });

      return;
    }
  }

  if (!navigator.onLine) {
    showToast({
      type: "error",
      title: "Internet connection required",
      message: "Reconnect before submitting your order.",
    });

    return;
  }

  if (
    orderType === "delivery" &&
    (
      !state.checkout.routeReady ||
      !state.checkout.addressResolved
    )
  ) {
    showToast({
      type: "warning",
      title: "Delivery location is not ready",
      message:
        "Wait for the route, city, and province to finish loading.",
    });

    return;
  }

  setCheckoutSubmitting(true);

  const expectedTotal = roundCurrency(
    getCartSubtotal() +
    (
      orderType === "delivery"
        ? state.checkout.deliveryFee
        : 0
    )
  );

  const clientOrderId = createUuid();

  try {
    const session = await ensureCustomerSession();
    const sessionToken = session?.user?.id;

    if (!sessionToken) {
      throw new Error("CUSTOMER_SESSION_MISSING");
    }

    safeSetLocalStorage(
      CUSTOMER_SESSION_TOKEN_STORAGE_KEY,
      sessionToken
    );

    const orderPayload = {
      id: clientOrderId,
      customer_name: customerName,
      order_type: orderType,
      items: buildDatabaseOrderItems(),
      delivery_address: deliveryAddress,
      delivery_lat: deliveryLatitude,
      delivery_lng: deliveryLongitude,
    };

    const order = await createOrderViaServer(
      orderPayload,
      session.access_token
    );

    safeSetLocalStorage(
      CUSTOMER_NAME_STORAGE_KEY,
      customerName
    );

    saveLastOrderFromDatabaseOrder(
      order,
      sessionToken
    );

    startOrderTracking(order.id);

    state.cart = [];
    persistCart();
    renderCart();

    const serverTotal = Number(order.total_price);

    closeCheckoutDialog();
    showOrderConfirmation(order);

    if (
      Number.isFinite(serverTotal) &&
      roundCurrency(serverTotal) !== roundCurrency(expectedTotal)
    ) {
      showToast({
        type: "info",
        title: "Total updated",
        message: "The database applied the current official menu prices.",
      });
    } else {
      showToast({
        type: "success",
        title: "Order placed",
        message: `Order ${formatOrderNumber(order.id)} was accepted.`,
      });
    }
  } catch (error) {
    console.error("Order submission failed:", error);

    showToast({
      type: "error",
      title: "Order was not submitted",
      message: getOrderSubmissionMessage(error),
      duration: 5200,
    });
  } finally {
    setCheckoutSubmitting(false);
  }
}

function buildDatabaseOrderItems() {
  return state.cart.map((item) => ({
    product_id: item.productId,
    quantity: item.quantity,
    size_id: item.size.id,
    sugar_id: item.sugar.id,
    ice_id: item.ice.id,
    addon_ids: item.addons.map((addon) => addon.id),
  }));
}

function buildDeliveryAddress() {
  const addressLine = normalizeAddressPart(
    elements["address-line1"].value
  );

  const city = normalizeAddressPart(
    elements["address-city"].value
  );

  const province = normalizeAddressPart(
    elements["address-province"].value
  );

  const landmark = normalizeAddressPart(
    elements["address-landmark"].value
  );

  const primaryAddress = [
    addressLine,
    city,
    province,
  ]
    .filter(Boolean)
    .join(", ");

  return landmark
    ? `${primaryAddress} — Landmark: ${landmark}`
    : primaryAddress;
}

function normalizeAddressPart(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

async function createOrderViaServer(
  orderPayload,
  accessToken
) {
  const response = await fetch(
    "/api/create-order",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(orderPayload),
    }
  );

  const payload =
    await response.json().catch(() => ({}));

  if (response.ok && payload?.order) {
    return payload.order;
  }

  const error = new Error(
    payload?.message ||
    "The order server rejected the request."
  );

  error.code = payload?.code || "";
  error.status = response.status;

  throw error;
}

function getOrderSubmissionMessage(error) {
  const errorCode =
    String(error?.code || "")
      .toLocaleLowerCase("en-PH");

  const combinedMessage = [
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-PH");

  if (errorCode === "signup_disabled") {
    return (
      "Supabase has “Allow new users to sign up” turned off. " +
      "Anonymous sign-in creates a new Auth user."
    );
  }

  if (
    errorCode === "anonymous_provider_disabled"
  ) {
    return (
      "Supabase Anonymous Sign-ins are turned off."
    );
  }

  if (
    errorCode === "order_api_not_configured"
  ) {
    return (
      "The secure order endpoint is missing one or more Vercel variables. " +
      "Add the Supabase server variables listed in the Phase 5 setup guide."
    );
  }

  if (
    errorCode === "customer_session_invalid" ||
    errorCode === "customer_session_required"
  ) {
    return (
      "Your customer session expired. Refresh the page and place the order again."
    );
  }

  if (
    errorCode === "destination_too_far"
  ) {
    return error.message;
  }

  if (
    errorCode === "ors_rate_limited" ||
    Number(error?.status) === 429
  ) {
    return (
      "The route service is busy. Wait briefly and try again."
    );
  }

  if (
    errorCode === "order_pricing_failed"
  ) {
    return (
      "One of the drinks or add-ons is no longer available. Refresh the menu and try again."
    );
  }

  if (
    errorCode === "order_insert_failed"
  ) {
    return (
      "The database rejected the order. Run the Phase 5 SQL migration and try again."
    );
  }

  if (
    errorCode === "captcha_failed"
  ) {
    return (
      "Supabase CAPTCHA verification failed."
    );
  }

  if (
    errorCode === "over_request_rate_limit"
  ) {
    return (
      "Too many sign-in attempts were made. Wait a few minutes and try again."
    );
  }

  if (
    combinedMessage.includes("failed to fetch") ||
    combinedMessage.includes("network")
  ) {
    return (
      "The order server could not be reached. Check your internet connection and try again."
    );
  }

  return (
    error?.message ||
    "Your cart is still saved. Try submitting the order again."
  );
}

function setCheckoutSubmitting(isSubmitting) {
  state.checkout.isSubmitting = Boolean(isSubmitting);

  elements["checkout-form"].setAttribute(
    "aria-busy",
    String(state.checkout.isSubmitting)
  );

  elements["checkout-submit-button"].disabled =
    state.checkout.isSubmitting || state.cart.length === 0;

  elements["close-checkout-button"].disabled =
    state.checkout.isSubmitting;

  elements["checkout-submit-label"].textContent =
    state.checkout.isSubmitting
      ? "Placing order…"
      : "Place order";
}

function showOrderConfirmation(order) {
  elements["confirmation-customer-name"].textContent =
    String(order.customer_name || "customer");

  elements["confirmation-order-number"].textContent =
    formatOrderNumber(order.id);

  elements["confirmation-status"].textContent =
    String(order.status || "pending");

  elements["confirmation-order-type"].textContent =
    String(order.order_type || "pickup");

  const confirmationDeliveryFee =
    Number(order.delivery_fee) || 0;

  setElementHidden(
    elements["confirmation-delivery-fee-row"],
    order.order_type !== "delivery"
  );

  elements["confirmation-delivery-fee"].textContent =
    formatCurrency(confirmationDeliveryFee);

  elements["confirmation-total"].textContent =
    formatCurrency(Number(order.total_price) || 0);

  if (!elements["order-confirmation-dialog"].open) {
    elements["order-confirmation-dialog"].showModal();
  }

  document.body.classList.add("dialog-open");
}

function closeOrderConfirmation() {
  if (elements["order-confirmation-dialog"].open) {
    elements["order-confirmation-dialog"].close();
  }
}

async function handleTrackRequest() {
  const lastOrder = loadLastOrder();

  if (!lastOrder) {
    showToast({
      type: "info",
      title: "No recent order",
      message:
        "Place an order first, then its live status will appear here.",
    });

    return;
  }

  await openTrackingDialog(lastOrder.orderId);
}

async function handleConfirmationTrackRequest() {
  const lastOrder = loadLastOrder();

  closeOrderConfirmation();

  if (!lastOrder) {
    showToast({
      type: "error",
      title: "Tracking unavailable",
      message:
        "The saved order reference could not be found.",
    });

    return;
  }

  await openTrackingDialog(lastOrder.orderId);
}

async function openTrackingDialog(orderId) {
  if (!orderId) {
    return;
  }

  if (!elements["tracking-dialog"].open) {
    elements["tracking-dialog"].showModal();
  }

  document.body.classList.add("dialog-open");
  setTrackingConnectionStatus(
    navigator.onLine
      ? "connecting"
      : "offline"
  );

  await startOrderTracking(orderId, {
    forceRefresh: true,
  });
}

function closeTrackingDialog() {
  if (elements["tracking-dialog"].open) {
    elements["tracking-dialog"].close();
  }
}

async function restoreOrderTracking() {
  const lastOrder = loadLastOrder();

  if (!lastOrder?.orderId) {
    return;
  }

  await startOrderTracking(lastOrder.orderId, {
    forceRefresh: false,
    silent: true,
  });
}

async function startOrderTracking(
  orderId,
  {
    forceRefresh = true,
    silent = false,
  } = {}
) {
  if (!orderId) {
    return;
  }

  state.tracking.orderId = orderId;

  if (forceRefresh) {
    await refreshTrackedOrder({ silent });
  }

  if (
    state.tracking.channel &&
    state.tracking.channel.topic ===
      `realtime:order:${orderId}`
  ) {
    return;
  }

  await stopTrackingChannel();

  const channel = customerSupabase
    .channel(`order:${orderId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `id=eq.${orderId}`,
      },
      (payload) => {
        if (!payload?.new?.id) {
          return;
        }

        handleTrackedOrderUpdate(payload.new);
      }
    )
    .subscribe((status, error) => {
      state.tracking.subscriptionStatus = status;

      if (status === "SUBSCRIBED") {
        setTrackingConnectionStatus("connected");
        return;
      }

      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT"
      ) {
        console.error(
          "Order tracking subscription error:",
          error
        );

        setTrackingConnectionStatus("error");
        scheduleTrackingReconnect();
        return;
      }

      if (status === "CLOSED") {
        setTrackingConnectionStatus(
          navigator.onLine
            ? "connecting"
            : "offline"
        );
      }
    });

  state.tracking.channel = channel;
}

async function stopTrackingChannel() {
  if (!state.tracking.channel) {
    return;
  }

  const oldChannel = state.tracking.channel;
  state.tracking.channel = null;

  try {
    await customerSupabase.removeChannel(
      oldChannel
    );
  } catch (error) {
    console.warn(
      "Unable to remove old tracking channel:",
      error
    );
  }
}

async function refreshTrackedOrder(
  { silent = false } = {}
) {
  const orderId =
    state.tracking.orderId ||
    loadLastOrder()?.orderId;

  if (!orderId) {
    return;
  }

  state.tracking.orderId = orderId;

  if (!navigator.onLine) {
    setTrackingConnectionStatus("offline");
    return;
  }

  if (!silent) {
    setTrackingConnectionStatus("connecting");
  }

  try {
    const session =
      await ensureCustomerSession();

    const storedOrder = loadLastOrder();

    if (
      storedOrder?.sessionToken &&
      storedOrder.sessionToken !==
        session.user.id
    ) {
      throw new Error(
        "TRACKING_SESSION_MISMATCH"
      );
    }

    const { data, error } =
      await customerSupabase
        .from("orders")
        .select(
          [
            "id",
            "customer_name",
            "order_type",
            "items",
            "items_subtotal",
            "delivery_fee",
            "total_price",
            "status",
            "delivery_address",
            "delivery_lat",
            "delivery_lng",
            "route_distance_m",
            "route_duration_s",
            "customer_session_token",
            "created_at",
          ].join(",")
        )
        .eq("id", orderId)
        .single();

    if (error || !data) {
      const trackingError = new Error(
        error?.message ||
        "ORDER_TRACKING_FETCH_FAILED"
      );

      trackingError.code = error?.code || "";
      throw trackingError;
    }

    state.tracking.order = data;
    saveLastOrderFromDatabaseOrder(
      data,
      session.user.id
    );

    renderTrackingOrder(data);
    setTrackingConnectionStatus("connected");
  } catch (error) {
    console.error(
      "Unable to refresh tracked order:",
      error
    );

    setTrackingConnectionStatus("error");

    if (
      error?.message ===
      "TRACKING_SESSION_MISMATCH"
    ) {
      showToast({
        type: "error",
        title: "Tracking session expired",
        message:
          "This anonymous order belongs to a browser session that is no longer available.",
      });
    } else if (!silent) {
      showToast({
        type: "error",
        title: "Unable to refresh order",
        message:
          "The latest order status could not be loaded.",
      });
    }
  }
}

function handleTrackedOrderUpdate(order) {
  const previousStatus =
    state.tracking.order?.status;

  state.tracking.order = order;

  const storedOrder = loadLastOrder();

  saveLastOrderFromDatabaseOrder(
    order,
    storedOrder?.sessionToken || ""
  );

  renderTrackingOrder(order);

  if (
    previousStatus &&
    previousStatus !== order.status
  ) {
    showToast({
      type:
        order.status === "cancelled"
          ? "error"
          : "success",
      title: "Order status updated",
      message:
        getTrackingStatusMessage(
          order.status,
          order.order_type
        ),
      duration: 5200,
    });
  }

  if (
    TERMINAL_ORDER_STATUSES.has(
      order.status
    )
  ) {
    setTrackingConnectionStatus("connected");
  }
}

function renderTrackingOrder(order) {
  if (!order?.id) {
    return;
  }

  elements["tracking-order-number"].textContent =
    formatOrderNumber(order.id);

  elements["tracking-current-status"].textContent =
    getTrackingStatusLabel(
      order.status,
      order.order_type
    );

  elements["tracking-status-message"].textContent =
    getTrackingStatusMessage(
      order.status,
      order.order_type
    );

  const isCancelled =
    order.status === "cancelled";

  setElementHidden(
    elements["tracking-cancelled-card"],
    !isCancelled
  );

  elements["tracking-timeline"].classList.toggle(
    "is-cancelled",
    isCancelled
  );

  renderTrackingTimeline(order);
  renderTrackingItems(order);

  elements["tracking-created-at"].textContent =
    formatOrderDate(order.created_at);

  elements["tracking-items-subtotal"].textContent =
    formatCurrency(
      Number(order.items_subtotal) ||
      calculateNormalizedItemsSubtotal(
        order.items
      )
    );

  const deliveryFee =
    Number(order.delivery_fee) || 0;

  setElementHidden(
    elements["tracking-delivery-fee-row"],
    order.order_type !== "delivery"
  );

  elements["tracking-delivery-fee"].textContent =
    formatCurrency(deliveryFee);

  elements["tracking-total"].textContent =
    formatCurrency(
      Number(order.total_price) || 0
    );

  renderTrackingDelivery(order);
}

function renderTrackingTimeline(order) {
  const statusIndex =
    TRACKING_STATUS_ORDER.indexOf(
      order.status
    );

  const steps = [
    ...elements["tracking-timeline"]
      .querySelectorAll(
        "[data-tracking-step]"
      ),
  ];

  steps.forEach((step, index) => {
    step.classList.toggle(
      "is-complete",
      statusIndex > index &&
      order.status !== "cancelled"
    );

    step.classList.toggle(
      "is-active",
      statusIndex === index &&
      order.status !== "cancelled"
    );
  });

  const isPickup =
    order.order_type === "pickup";

  elements["tracking-dispatched-label"].textContent =
    isPickup
      ? "Ready for pickup"
      : "Out for delivery";

  elements["tracking-dispatched-copy"].textContent =
    isPickup
      ? "Your order is ready at the shop."
      : "Your order is on the way.";
}

function renderTrackingItems(order) {
  const items = Array.isArray(order.items)
    ? order.items
    : [];

  elements["tracking-items"].innerHTML =
    items.length > 0
      ? items
          .map((item) => {
            const addonText =
              Array.isArray(item.addons) &&
              item.addons.length > 0
                ? item.addons
                    .map(
                      (addon) =>
                        addon.label ||
                        addon.name
                    )
                    .filter(Boolean)
                    .join(", ")
                : "No add-ons";

            return `
              <article class="tracking-item">
                <strong>
                  ${Number(item.quantity) || 1}×
                  ${escapeHtml(item.name || "Drink")}
                </strong>
                <span>
                  ${formatCurrency(
                    Number(item.line_total) ||
                    (
                      Number(item.unit_price) *
                      Number(item.quantity)
                    ) ||
                    0
                  )}
                </span>
                <p>
                  ${escapeHtml(
                    item.size?.label || ""
                  )} ·
                  ${escapeHtml(
                    item.sugar?.label || ""
                  )} sugar ·
                  ${escapeHtml(
                    item.ice?.label || ""
                  )} ·
                  ${escapeHtml(addonText)}
                </p>
              </article>
            `;
          })
          .join("")
      : '<p class="tracking-empty-items">Order items are unavailable.</p>';
}

function renderTrackingDelivery(order) {
  const isDelivery =
    order.order_type === "delivery";

  setElementHidden(
    elements["tracking-delivery-card"],
    !isDelivery
  );

  if (!isDelivery) {
    return;
  }

  elements["tracking-delivery-address"].textContent =
    String(order.delivery_address || "");

  const distance =
    Number(order.route_distance_m);

  const duration =
    Number(order.route_duration_s);

  elements["tracking-route-distance"].textContent =
    Number.isFinite(distance)
      ? formatRouteDistance(distance)
      : "Distance unavailable";

  elements["tracking-route-duration"].textContent =
    Number.isFinite(duration)
      ? formatRouteDuration(duration)
      : "Travel time unavailable";

  const latitude =
    Number(order.delivery_lat);

  const longitude =
    Number(order.delivery_lng);

  elements["tracking-google-maps-link"].href =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
      ? createGoogleMapsDirectionsLink(
          latitude,
          longitude
        )
      : "https://www.google.com/maps/";
}

function setTrackingConnectionStatus(status) {
  const label =
    elements["tracking-connection-status"];

  const dot =
    elements["tracking-connection-dot"];

  dot.classList.remove(
    "is-connected",
    "is-offline",
    "is-error"
  );

  if (status === "connected") {
    label.textContent =
      "Live updates connected";
    dot.classList.add("is-connected");
    return;
  }

  if (status === "offline") {
    label.textContent =
      "Offline — showing the last saved status";
    dot.classList.add("is-offline");
    return;
  }

  if (status === "error") {
    label.textContent =
      "Live updates interrupted — press Refresh";
    dot.classList.add("is-error");
    return;
  }

  label.textContent =
    "Connecting to live updates…";
}

function scheduleTrackingReconnect() {
  window.clearTimeout(
    state.tracking.reconnectTimer
  );

  state.tracking.reconnectTimer =
    window.setTimeout(async () => {
      if (
        !navigator.onLine ||
        !state.tracking.orderId
      ) {
        return;
      }

      await startOrderTracking(
        state.tracking.orderId,
        {
          forceRefresh: true,
          silent: true,
        }
      );
    }, 3500);
}

function handleTrackingOnline() {
  if (!state.tracking.orderId) {
    return;
  }

  setTrackingConnectionStatus("connecting");

  startOrderTracking(
    state.tracking.orderId,
    {
      forceRefresh: true,
      silent: true,
    }
  );
}

function handleTrackingOffline() {
  if (state.tracking.orderId) {
    setTrackingConnectionStatus("offline");
  }
}

function saveLastOrderFromDatabaseOrder(
  order,
  sessionToken
) {
  saveLastOrder({
    orderId: order.id,
    customerName: order.customer_name,
    orderType: order.order_type,
    itemsSubtotal:
      Number(order.items_subtotal) || 0,
    deliveryFee:
      Number(order.delivery_fee) || 0,
    totalPrice:
      Number(order.total_price) || 0,
    status: order.status,
    createdAt: order.created_at,
    deliveryAddress:
      order.delivery_address || null,
    deliveryLat:
      order.delivery_lat ?? null,
    deliveryLng:
      order.delivery_lng ?? null,
    routeDistanceM:
      order.route_distance_m ?? null,
    routeDurationS:
      order.route_duration_s ?? null,
    sessionToken,
  });
}

function saveLastOrder(order) {
  safeSetLocalStorage(
    LAST_ORDER_STORAGE_KEY,
    JSON.stringify(order)
  );
}

function loadLastOrder() {
  try {
    const rawValue =
      localStorage.getItem(
        LAST_ORDER_STORAGE_KEY
      );

    if (!rawValue) {
      return null;
    }

    const parsedValue =
      JSON.parse(rawValue);

    if (
      !parsedValue ||
      typeof parsedValue !== "object" ||
      typeof parsedValue.orderId !== "string"
    ) {
      return null;
    }

    return parsedValue;
  } catch {
    return null;
  }
}

function getTrackingStatusLabel(
  status,
  orderType
) {
  if (
    status === "dispatched" &&
    orderType === "pickup"
  ) {
    return "Ready for pickup";
  }

  const labels = {
    pending: "Order received",
    preparing: "Preparing",
    dispatched: "Out for delivery",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  return labels[status] || "Pending";
}

function getTrackingStatusMessage(
  status,
  orderType
) {
  if (status === "pending") {
    return (
      "Your order has been received and is waiting for staff confirmation."
    );
  }

  if (status === "preparing") {
    return (
      "The Ssupertea team is preparing your drinks."
    );
  }

  if (status === "dispatched") {
    return orderType === "pickup"
      ? "Your order is ready for pickup at Ssupertea Station."
      : "Your order has left the shop and is on the way.";
  }

  if (status === "completed") {
    return (
      "Your order has been completed. Thank you!"
    );
  }

  if (status === "cancelled") {
    return (
      "The shop marked this order as cancelled."
    );
  }

  return "Waiting for the latest order status.";
}

function calculateNormalizedItemsSubtotal(items) {
  if (!Array.isArray(items)) {
    return 0;
  }

  return roundCurrency(
    items.reduce(
      (total, item) =>
        total +
        (
          Number(item?.line_total) ||
          (
            Number(item?.unit_price) *
            Number(item?.quantity)
          ) ||
          0
        ),
      0
    )
  );
}

function formatOrderDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-PH",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(date);
}

function restoreSavedCustomerName() {
  try {
    const savedName = localStorage.getItem(
      CUSTOMER_NAME_STORAGE_KEY
    );

    if (savedName) {
      elements["customer-name"].value =
        normalizeCustomerName(savedName);
    }
  } catch {
    // Checkout remains usable without name persistence.
  }
}

function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`Unable to store ${key}:`, error);
  }
}

function normalizeCustomerName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function formatOrderNumber(orderId) {
  const compactId = String(orderId || "")
    .replace(/[^a-fA-F0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();

  return `SS-${compactId || "00000000"}`;
}

function createUuid() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);

  randomBytes[6] = (randomBytes[6] & 0x0f) | 0x40;
  randomBytes[8] = (randomBytes[8] & 0x3f) | 0x80;

  const hexadecimal = [...randomBytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

  return [
    hexadecimal.slice(0, 8),
    hexadecimal.slice(8, 12),
    hexadecimal.slice(12, 16),
    hexadecimal.slice(16, 20),
    hexadecimal.slice(20),
  ].join("-");
}

function syncDialogBodyState() {
  const anyDialogOpen = Boolean(
    elements["customize-dialog"].open ||
      elements["checkout-dialog"].open ||
      elements["order-confirmation-dialog"].open ||
      elements["tracking-dialog"].open
  );

  document.body.classList.toggle(
    "dialog-open",
    anyDialogOpen
  );
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
