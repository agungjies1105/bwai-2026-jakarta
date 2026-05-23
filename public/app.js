// LuxeBite Gourmet Web Application Client Controller

// Application State Store
const STATE = {
  menu: [],
  cart: [],
  activeCategory: 'all',
  searchQuery: '',
  csrfToken: null,
  activeOrder: null,
  trackingInterval: null
};

// SVG Assets Map (Strict DOM Construction to avoid innerHTML/XSS)
const SVG_ASSETS = {
  'burg-1': (color) => createFoodSvg('burger', color),
  'burg-2': (color) => createFoodSvg('burger-smoked', color),
  'pizz-1': (color) => createFoodSvg('pizza-burrata', color),
  'pizz-2': (color) => createFoodSvg('pizza-garden', color),
  'drik-1': (color) => createFoodSvg('cocktail-rosemary', color),
  'drik-2': (color) => createFoodSvg('elixir-lavender', color),
  'dess-1': (color) => createFoodSvg('cake-matcha', color),
  'dess-2': (color) => createFoodSvg('chocolate-sphere', color)
};

// Initializer / Bootstrapping
window.addEventListener('DOMContentLoaded', async () => {
  setupEventHandlers();
  await initSession();
  await fetchMenu();
});

// Fetch CSRF Token & Session Context
async function initSession() {
  try {
    const res = await fetch('/api/session-init');
    const data = await res.json();
    STATE.csrfToken = data.csrfToken;
  } catch (err) {
    console.error('[Session Error] Failed to initialize CSRF protection:', err);
  }
}

// Fetch Menu Catalog
async function fetchMenu() {
  try {
    const res = await fetch('/api/menu');
    STATE.menu = await res.json();
    renderMenuCatalog();
  } catch (err) {
    console.error('[API Error] Failed to retrieve menu catalog:', err);
    showGridErrorMessage();
  }
}

// Event Handlers Setup
function setupEventHandlers() {
  // Category Filtering
  const filterRow = document.getElementById('category-filter-row');
  if (filterRow) {
    filterRow.addEventListener('click', (e) => {
      const btn = e.target.closest('.category-btn');
      if (!btn) return;
      
      // Update UI selection state
      document.querySelectorAll('.category-btn').forEach((b) => {
        b.className = 'category-btn px-5 py-2.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-300 bg-luxury-card border border-luxury-border text-gray-300 hover:text-white hover:border-luxury-gold/30';
        b.setAttribute('aria-selected', 'false');
      });
      
      btn.className = 'category-btn px-5 py-2.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-300 bg-gradient-to-r from-luxury-gold to-yellow-600 text-black shadow-lg shadow-yellow-500/10';
      btn.setAttribute('aria-selected', 'true');
      
      STATE.activeCategory = btn.dataset.category;
      renderMenuCatalog();
    });
  }

  // Dynamic Search Input
  const searchInput = document.getElementById('menu-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      STATE.searchQuery = e.target.value.toLowerCase().trim();
      renderMenuCatalog();
    });
  }

  // Slide Cart Drawer Open/Close
  const cartTrigger = document.getElementById('cart-trigger-btn');
  const cartClose = document.getElementById('cart-close-btn');
  const cartBackdrop = document.getElementById('cart-drawer-backdrop');
  const cartDrawer = document.getElementById('cart-drawer');

  if (cartTrigger && cartClose && cartBackdrop && cartDrawer) {
    cartTrigger.addEventListener('click', () => {
      cartBackdrop.classList.remove('pointer-events-none', 'opacity-0');
      cartDrawer.classList.remove('translate-x-full');
    });

    const closeCartFn = () => {
      cartBackdrop.classList.add('pointer-events-none', 'opacity-0');
      cartDrawer.classList.add('translate-x-full');
    };

    cartClose.addEventListener('click', closeCartFn);
    cartBackdrop.addEventListener('click', closeCartFn);
  }

  // Open Checkout Modal
  const checkoutTrigger = document.getElementById('checkout-trigger-btn');
  const checkoutClose = document.getElementById('checkout-close-btn');
  const checkoutBackdrop = document.getElementById('checkout-modal-backdrop');
  const checkoutModal = document.getElementById('checkout-modal');

  if (checkoutTrigger && checkoutClose && checkoutBackdrop && checkoutModal) {
    checkoutTrigger.addEventListener('click', () => {
      checkoutBackdrop.classList.remove('pointer-events-none', 'opacity-0');
      checkoutModal.classList.remove('scale-95', 'opacity-0', 'pointer-events-none');
    });

    const closeCheckoutFn = () => {
      checkoutBackdrop.classList.add('pointer-events-none', 'opacity-0');
      checkoutModal.classList.add('scale-95', 'opacity-0', 'pointer-events-none');
    };

    checkoutClose.addEventListener('click', closeCheckoutFn);
    checkoutBackdrop.addEventListener('click', closeCheckoutFn);
  }

  // Form Validations & Card Formatters
  const cardInput = document.getElementById('checkout-card');
  if (cardInput) {
    cardInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      let formatted = '';
      for (let i = 0; i < value.length; i++) {
        if (i > 0 && i % 4 === 0) formatted += ' ';
        formatted += value[i];
      }
      e.target.value = formatted;
    });
  }

  const expiryInput = document.getElementById('checkout-expiry');
  if (expiryInput) {
    expiryInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      if (value.length > 2) {
        e.target.value = value.slice(0, 2) + '/' + value.slice(2, 4);
      } else {
        e.target.value = value;
      }
    });
  }

  // Submit Checkout Transaction
  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', handleCheckoutSubmit);
  }

  // Kitchen Console access toggler
  const toggleKitchen = document.getElementById('toggle-kitchen-btn');
  const kitchenClose = document.getElementById('kitchen-close-btn');
  const kitchenDrawer = document.getElementById('kitchen-console-drawer');

  if (toggleKitchen && kitchenClose && kitchenDrawer) {
    toggleKitchen.addEventListener('click', () => {
      kitchenDrawer.classList.toggle('translate-y-full');
      if (!kitchenDrawer.classList.contains('translate-y-full')) {
        pollKitchenOrders();
      }
    });
    kitchenClose.addEventListener('click', () => {
      kitchenDrawer.classList.add('translate-y-full');
    });
  }
}

// Helpers for clean DOM Generation (Ensures zero innerHTML to block XSS)
function createNode(tag, classes = [], attributes = {}) {
  const el = document.createElement(tag);
  if (classes.length) el.className = classes.join(' ');
  Object.entries(attributes).forEach(([key, val]) => {
    el.setAttribute(key, val);
  });
  return el;
}

// Safely clear children from an element
function clearChildren(element) {
  if (element) {
    element.replaceChildren();
  }
}

// Render Menu Grid Elements
function renderMenuCatalog() {
  const grid = document.getElementById('menu-items-grid');
  if (!grid) return;

  clearChildren(grid);

  // Filter & Search Logic
  const filtered = STATE.menu.filter((item) => {
    const matchesCategory = STATE.activeCategory === 'all' || item.category === STATE.activeCategory;
    const matchesSearch = item.name.toLowerCase().includes(STATE.searchQuery) || 
                          item.description.toLowerCase().includes(STATE.searchQuery);
    return matchesCategory && matchesSearch;
  });

  if (filtered.length === 0) {
    const emptyState = createNode('div', ['col-span-full', 'py-16', 'text-center', 'space-y-4']);
    const emptyText = createNode('p', ['text-sm', 'text-luxury-textMuted']);
    emptyText.textContent = 'No premium dishes match your request. Please try another selection.';
    emptyState.appendChild(emptyText);
    grid.appendChild(emptyState);
    return;
  }

  filtered.forEach((item) => {
    // Outer Card
    const card = createNode('article', [
      'relative', 'bg-luxury-card', 'border', 'border-luxury-border', 'rounded-2xl', 'p-5', 
      'flex', 'flex-col', 'justify-between', 'group', 'hover:border-luxury-gold/40', 
      'hover:shadow-xl', 'hover:shadow-luxury-gold/5', 'transition-all', 'duration-300', 'animate-[fadeIn_0.3s_ease-out]'
    ]);

    // Item Category Badge (Top left overlay)
    const badge = createNode('span', [
      'absolute', 'top-4', 'left-4', 'z-10', 'px-2.5', 'py-0.5', 'rounded-full', 
      'text-[9px]', 'font-bold', 'uppercase', 'tracking-widest', 'border', 'border-white/10', 'bg-black/80', 'text-white'
    ]);
    badge.textContent = item.category;
    card.appendChild(badge);

    // Graphic Representation (Pure vector line Art)
    const graphicContainer = createNode('div', [
      'w-full', 'h-40', 'rounded-xl', 'bg-luxury-dark/45', 'border', 'border-luxury-border/60', 
      'flex', 'items-center', 'justify-center', 'p-4', 'mb-5', 'group-hover:scale-[1.02]', 'transition-transform', 'duration-300'
    ]);
    
    const svgFn = SVG_ASSETS[item.id] || ((col) => createFoodSvg('default', col));
    const itemSvg = svgFn(item.accentColor);
    graphicContainer.appendChild(itemSvg);
    card.appendChild(graphicContainer);

    // Details Content Block
    const details = createNode('div', ['space-y-2', 'mb-6']);
    
    const title = createNode('h3', ['font-serif', 'text-base', 'font-bold', 'text-white', 'group-hover:text-luxury-gold', 'transition-colors']);
    title.textContent = item.name;
    
    const desc = createNode('p', ['text-xs', 'text-luxury-textMuted', 'leading-relaxed', 'line-clamp-2']);
    desc.textContent = item.description;

    details.appendChild(title);
    details.appendChild(desc);
    card.appendChild(details);

    // Purchase Row
    const actionRow = createNode('div', ['flex', 'items-center', 'justify-between']);
    
    const price = createNode('span', ['font-serif', 'text-sm', 'font-bold', 'text-luxury-gold']);
    price.textContent = `$${item.price.toFixed(2)}`;

    const addBtn = createNode('button', [
      'px-4', 'py-2', 'rounded-xl', 'bg-gradient-to-r', 'from-luxury-gold', 'to-yellow-600', 
      'text-black', 'text-xs', 'font-bold', 'hover:opacity-95', 'hover:shadow-md', 'hover:shadow-yellow-500/10', 'transition-all'
    ]);
    addBtn.textContent = 'Add +';
    addBtn.addEventListener('click', () => {
      addToCart(item.id);
    });

    actionRow.appendChild(price);
    actionRow.appendChild(addBtn);
    card.appendChild(actionRow);

    grid.appendChild(card);
  });
}

// Display Grid Fetch Fail Message
function showGridErrorMessage() {
  const grid = document.getElementById('menu-items-grid');
  if (!grid) return;
  clearChildren(grid);
  
  const errBox = createNode('div', ['col-span-full', 'py-16', 'text-center', 'space-y-4']);
  const errMsg = createNode('p', ['text-sm', 'text-red-400']);
  errMsg.textContent = 'Failed to load fine-dining catalogue. Please refresh and check your local context.';
  errBox.appendChild(errMsg);
  grid.appendChild(errBox);
}

// Cart Drawer Manipulation & Reactivity
function addToCart(itemId) {
  const existing = STATE.cart.find((i) => i.id === itemId);
  if (existing) {
    if (existing.quantity < 50) existing.quantity += 1;
  } else {
    STATE.cart.push({
      id: itemId,
      quantity: 1,
      instructions: ''
    });
  }
  updateCartBadge();
  renderCartDrawer();
}

function updateQuantity(itemId, delta) {
  const index = STATE.cart.findIndex((i) => i.id === itemId);
  if (index === -1) return;

  STATE.cart[index].quantity += delta;
  
  if (STATE.cart[index].quantity <= 0) {
    STATE.cart.splice(index, 1);
  } else if (STATE.cart[index].quantity > 50) {
    STATE.cart[index].quantity = 50;
  }

  updateCartBadge();
  renderCartDrawer();
}

function updateInstructions(itemId, val) {
  const item = STATE.cart.find((i) => i.id === itemId);
  if (item) {
    item.instructions = val.substring(0, 150);
  }
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge-count');
  if (!badge) return;

  const totalQty = STATE.cart.reduce((sum, item) => sum + item.quantity, 0);

  if (totalQty > 0) {
    badge.textContent = String(totalQty);
    badge.classList.remove('opacity-0');
  } else {
    badge.textContent = '0';
    badge.classList.add('opacity-0');
  }
}

// Render slide-out Cart details
function renderCartDrawer() {
  const container = document.getElementById('cart-items-container');
  const checkoutBtn = document.getElementById('checkout-trigger-btn');
  if (!container) return;

  clearChildren(container);

  if (STATE.cart.length === 0) {
    const emptyWrapper = createNode('div', ['h-full', 'flex', 'flex-col', 'justify-center', 'items-center', 'text-center', 'space-y-4', 'py-12']);
    
    // SVG empty cart icon
    const svgEmpty = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEmpty.setAttribute('class', 'w-12 h-12 text-luxury-border/60');
    svgEmpty.setAttribute('fill', 'none');
    svgEmpty.setAttribute('viewBox', '0 0 24 24');
    svgEmpty.setAttribute('stroke', 'currentColor');
    svgEmpty.setAttribute('stroke-width', '1.5');
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z');
    
    svgEmpty.appendChild(path);
    emptyWrapper.appendChild(svgEmpty);

    const emptyText = createNode('p', ['text-sm', 'text-luxury-textMuted']);
    emptyText.textContent = 'Your cart is empty. Choose some fine delicacies.';
    emptyWrapper.appendChild(emptyText);

    container.appendChild(emptyWrapper);
    
    if (checkoutBtn) checkoutBtn.disabled = true;
    calculateTotals(0);
    return;
  }

  if (checkoutBtn) checkoutBtn.disabled = false;
  let runningSubtotal = 0;

  STATE.cart.forEach((cartItem) => {
    const menuItem = STATE.menu.find((m) => m.id === cartItem.id);
    if (!menuItem) return;

    runningSubtotal += menuItem.price * cartItem.quantity;

    // Item Container
    const row = createNode('div', ['border-b', 'border-luxury-border/50', 'pb-5', 'space-y-3', 'animate-[fadeIn_0.2s_ease-out]']);
    
    const detailsRow = createNode('div', ['flex', 'justify-between', 'items-start']);
    
    // Left Info
    const info = createNode('div', ['space-y-1']);
    const title = createNode('p', ['text-sm', 'font-bold', 'text-white']);
    title.textContent = menuItem.name;
    const priceLabel = createNode('p', ['text-xs', 'text-luxury-gold']);
    priceLabel.textContent = `$${menuItem.price.toFixed(2)}`;
    info.appendChild(title);
    info.appendChild(priceLabel);

    // Right Controls
    const controls = createNode('div', ['flex', 'items-center', 'space-x-3.5', 'bg-luxury-dark', 'border', 'border-luxury-border', 'rounded-lg', 'px-2.5', 'py-1']);
    
    const decBtn = createNode('button', ['text-gray-400', 'hover:text-white', 'text-sm', 'font-bold']);
    decBtn.textContent = '−';
    decBtn.addEventListener('click', () => updateQuantity(cartItem.id, -1));

    const qty = createNode('span', ['text-xs', 'font-bold', 'text-white', 'min-w-4', 'text-center']);
    qty.textContent = String(cartItem.quantity);

    const incBtn = createNode('button', ['text-gray-400', 'hover:text-white', 'text-sm', 'font-bold']);
    incBtn.textContent = '+';
    incBtn.addEventListener('click', () => updateQuantity(cartItem.id, 1));

    controls.appendChild(decBtn);
    controls.appendChild(qty);
    controls.appendChild(incBtn);

    detailsRow.appendChild(info);
    detailsRow.appendChild(controls);
    row.appendChild(detailsRow);

    // Chef Instructions Text Area
    const instArea = createNode('textarea', [
      'w-full', 'px-3', 'py-2', 'rounded-lg', 'bg-luxury-dark/40', 'border', 'border-luxury-border/80', 
      'text-[11px]', 'placeholder:text-gray-600', 'focus:outline-none', 'focus:border-luxury-border', 'resize-none'
    ], {
      rows: '1',
      placeholder: "Chef notes (e.g. well-done, allergy)..."
    });
    instArea.value = cartItem.instructions;
    instArea.addEventListener('input', (e) => updateInstructions(cartItem.id, e.target.value));
    row.appendChild(instArea);

    container.appendChild(row);
  });

  calculateTotals(runningSubtotal);
}

// Subtotal, Tax, Delivery Calculations
function calculateTotals(subtotal) {
  const tax = Number((subtotal * 0.10).toFixed(2));
  const delivery = subtotal > 50 || subtotal === 0 ? 0 : 5.00;
  const grandTotal = Number((subtotal + tax + delivery).toFixed(2));

  document.getElementById('cart-subtotal').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('cart-tax').textContent = `$${tax.toFixed(2)}`;
  document.getElementById('cart-delivery').textContent = delivery === 0 ? 'COMPLIMENTARY' : `$${delivery.toFixed(2)}`;
  document.getElementById('cart-total').textContent = `$${grandTotal.toFixed(2)}`;
}

// Validate input fields locally (PII formatting triggers)
function validateCheckoutForm() {
  let isValid = true;

  const fields = {
    name: {
      input: document.getElementById('checkout-name'),
      err: document.getElementById('err-name'),
      test: (v) => v.trim().length >= 2 && v.trim().length <= 64
    },
    phone: {
      input: document.getElementById('checkout-phone'),
      err: document.getElementById('err-phone'),
      test: (v) => /^\+?[0-9\s\-()]{8,20}$/.test(v)
    },
    address: {
      input: document.getElementById('checkout-address'),
      err: document.getElementById('err-address'),
      test: (v) => v.trim().length >= 5 && v.trim().length <= 256
    },
    card: {
      input: document.getElementById('checkout-card'),
      err: document.getElementById('err-card'),
      test: (v) => /^[0-9\s-]{12,19}$/.test(v)
    },
    expiry: {
      input: document.getElementById('checkout-expiry'),
      err: document.getElementById('err-expiry'),
      test: (v) => /^(0[1-9]|1[0-2])\/?([0-9]{2})$/.test(v)
    },
    cvv: {
      input: document.getElementById('checkout-cvv'),
      err: document.getElementById('err-cvv'),
      test: (v) => /^[0-9]{3,4}$/.test(v)
    }
  };

  Object.values(fields).forEach(({ input, err, test }) => {
    if (!input || !err) return;
    
    if (!test(input.value)) {
      input.classList.add('border-red-500');
      input.classList.remove('focus:border-luxury-gold/60');
      err.classList.remove('hidden');
      isValid = false;
    } else {
      input.classList.remove('border-red-500');
      input.classList.add('focus:border-luxury-gold/60');
      err.classList.add('hidden');
    }
  });

  return isValid;
}

// Checkout Submit Controller
async function handleCheckoutSubmit(e) {
  e.preventDefault();

  if (!validateCheckoutForm()) return;

  const submitBtn = document.getElementById('checkout-submit-btn');
  const btnText = document.getElementById('submit-btn-text');
  const spinner = document.getElementById('submit-btn-spinner');

  if (submitBtn && btnText && spinner) {
    submitBtn.disabled = true;
    btnText.textContent = 'Verifying with Vault...';
    spinner.classList.remove('hidden');
  }

  // Build Payload
  const orderPayload = {
    customer: {
      name: document.getElementById('checkout-name').value,
      phone: document.getElementById('checkout-phone').value,
      address: document.getElementById('checkout-address').value,
      cardNumber: document.getElementById('checkout-card').value,
      cardExpiry: document.getElementById('checkout-expiry').value,
      cardCvv: document.getElementById('checkout-cvv').value
    },
    items: STATE.cart.map((cartItem) => {
      const itemDetails = STATE.menu.find((m) => m.id === cartItem.id);
      return {
        id: cartItem.id,
        name: itemDetails.name,
        quantity: cartItem.quantity,
        instructions: cartItem.instructions
      };
    }),
    totals: {
      subtotal: parseFloat(document.getElementById('cart-subtotal').textContent.replace('$', '')),
      tax: parseFloat(document.getElementById('cart-tax').textContent.replace('$', '')),
      total: parseFloat(document.getElementById('cart-total').textContent.replace('$', ''))
    }
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': STATE.csrfToken
      },
      body: JSON.stringify(orderPayload)
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Checkout transaction rejected.');
      resetSubmitButton();
      return;
    }

    // Success transition
    STATE.cart = [];
    updateCartBadge();
    renderCartDrawer();
    
    // Close modal & Backdrop
    document.getElementById('checkout-modal-backdrop').classList.add('pointer-events-none', 'opacity-0');
    document.getElementById('checkout-modal').classList.add('scale-95', 'opacity-0', 'pointer-events-none');
    document.getElementById('cart-drawer-backdrop').classList.add('pointer-events-none', 'opacity-0');
    document.getElementById('cart-drawer').classList.add('translate-x-full');
    
    resetCheckoutForm();
    resetSubmitButton();

    // Load Order Tracking Screen
    loadTrackingScreen(data.orderId);

  } catch (err) {
    console.error('[API Connection Error] Checkout request aborted:', err);
    alert('Connectivity failure. Our chefs could not secure your request.');
    resetSubmitButton();
  }
}

function resetSubmitButton() {
  const submitBtn = document.getElementById('checkout-submit-btn');
  const btnText = document.getElementById('submit-btn-text');
  const spinner = document.getElementById('submit-btn-spinner');
  if (submitBtn && btnText && spinner) {
    submitBtn.disabled = false;
    btnText.textContent = 'Confirm Transaction';
    spinner.classList.add('hidden');
  }
}

function resetCheckoutForm() {
  const form = document.getElementById('checkout-form');
  if (form) form.reset();
}

// Load Tracking View & Setup Polling
function loadTrackingScreen(orderId) {
  // Clear any existing polling
  if (STATE.trackingInterval) {
    clearInterval(STATE.trackingInterval);
  }

  // Switch Views
  document.getElementById('menu-catalog-view').classList.add('hidden');
  const trackView = document.getElementById('order-tracking-view');
  trackView.classList.remove('hidden');

  fetchOrderProgress(orderId);
  
  // Poll order status every 4 seconds
  STATE.trackingInterval = setInterval(() => {
    fetchOrderProgress(orderId);
  }, 4000);
}

// Retrieve Order Progress
async function fetchOrderProgress(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}`);
    if (!res.ok) {
      clearInterval(STATE.trackingInterval);
      return;
    }
    const orderData = await res.json();
    renderOrderTracker(orderData);
  } catch (err) {
    console.error('Error fetching order progress:', err);
  }
}

// Build gorgeous Live Order Tracker layout (Zero innerHTML)
function renderOrderTracker(order) {
  const container = document.getElementById('order-tracking-view');
  if (!container) return;

  clearChildren(container);

  // Outer Wrapper Box
  const outerBox = createNode('div', ['bg-luxury-card', 'border', 'border-luxury-border', 'rounded-3xl', 'p-8', 'space-y-8']);
  
  // Header Row
  const headerRow = createNode('div', ['flex', 'flex-col', 'sm:flex-row', 'sm:items-center', 'justify-between', 'gap-4', 'border-b', 'border-luxury-border/60', 'pb-6']);
  
  const titleBlock = createNode('div', ['space-y-1']);
  const mainTitle = createNode('h2', ['font-serif', 'text-2xl', 'font-bold']);
  mainTitle.textContent = 'Culinary Live Tracking';
  const orderIdSub = createNode('p', ['text-[10px]', 'uppercase', 'tracking-widest', 'text-luxury-gold', 'font-semibold']);
  orderIdSub.textContent = `Order Ref: #${order.id.slice(0, 8)}...`;
  
  titleBlock.appendChild(mainTitle);
  titleBlock.appendChild(orderIdSub);

  const statusBadge = createNode('span', [
    'px-4', 'py-1.5', 'rounded-full', 'text-xs', 'font-bold', 'uppercase', 'tracking-wider', 
    'bg-luxury-gold/15', 'border', 'border-luxury-gold/30', 'text-luxury-gold', 'w-fit'
  ]);
  statusBadge.textContent = order.status;

  headerRow.appendChild(titleBlock);
  headerRow.appendChild(statusBadge);
  outerBox.appendChild(headerRow);

  // Dynamic Timeline Graphics
  const timeline = buildTimeline(order.status);
  outerBox.appendChild(timeline);

  // Customer & Delivery Sanctuary Details
  const detailsGrid = createNode('div', ['grid', 'grid-cols-1', 'sm:grid-cols-2', 'gap-6', 'border-t', 'border-b', 'border-luxury-border/60', 'py-6']);
  
  const leftCol = createNode('div', ['space-y-1.5']);
  const delivTitle = createNode('h4', ['text-[10px]', 'uppercase', 'tracking-wider', 'text-luxury-gold', 'font-bold']);
  delivTitle.textContent = 'Delivery Sanctuary';
  const clientName = createNode('p', ['text-sm', 'font-bold', 'text-white']);
  clientName.textContent = order.customer.name;
  const clientAddr = createNode('p', ['text-xs', 'text-luxury-textMuted', 'leading-relaxed']);
  clientAddr.textContent = order.customer.address;
  leftCol.appendChild(delivTitle);
  leftCol.appendChild(clientName);
  leftCol.appendChild(clientAddr);

  const rightCol = createNode('div', ['space-y-3']);
  const itemsTitle = createNode('h4', ['text-[10px]', 'uppercase', 'tracking-wider', 'text-luxury-gold', 'font-bold']);
  itemsTitle.textContent = 'Selected Delicacies';
  
  const itemsList = createNode('div', ['space-y-2']);
  order.items.forEach((item) => {
    const itemRow = createNode('div', ['flex', 'justify-between', 'text-xs']);
    const itemLabel = createNode('span', ['text-gray-300']);
    itemLabel.textContent = `${item.quantity}x ${item.name}`;
    const itemSum = createNode('span', ['font-bold', 'text-white']);
    itemSum.textContent = `$${(item.price * item.quantity).toFixed(2)}`;
    
    itemRow.appendChild(itemLabel);
    itemRow.appendChild(itemSum);
    itemsList.appendChild(itemRow);
  });
  
  rightCol.appendChild(itemsTitle);
  rightCol.appendChild(itemsList);

  detailsGrid.appendChild(leftCol);
  detailsGrid.appendChild(rightCol);
  outerBox.appendChild(detailsGrid);

  // Order Totals Summary
  const totalsRow = createNode('div', ['flex', 'justify-between', 'items-center']);
  const totalLabel = createNode('span', ['text-xs', 'text-luxury-textMuted']);
  totalLabel.textContent = 'Total Charged';
  const totalVal = createNode('span', ['font-serif', 'text-xl', 'font-bold', 'text-luxury-gold']);
  totalVal.textContent = `$${order.totals.total.toFixed(2)}`;
  
  totalsRow.appendChild(totalLabel);
  totalsRow.appendChild(totalVal);
  outerBox.appendChild(totalsRow);

  // Back Button
  const btnRow = createNode('div', ['pt-4']);
  const backBtn = createNode('button', [
    'w-full', 'py-3.5', 'rounded-xl', 'bg-luxury-card', 'border', 'border-luxury-border', 
    'hover:border-luxury-gold/50', 'text-xs', 'font-bold', 'uppercase', 'tracking-wider', 'transition-all'
  ]);
  backBtn.textContent = 'Return to Menu Catalog';
  backBtn.addEventListener('click', () => {
    if (STATE.trackingInterval) {
      clearInterval(STATE.trackingInterval);
    }
    document.getElementById('order-tracking-view').classList.add('hidden');
    document.getElementById('menu-catalog-view').classList.remove('hidden');
  });
  btnRow.appendChild(backBtn);
  outerBox.appendChild(btnRow);

  container.appendChild(outerBox);
}

// Build graphical order tracking progress bar
function buildTimeline(activeStatus) {
  const steps = [
    { label: 'Created', desc: 'Secure order placed' },
    { label: 'Preparing', desc: 'Crafting in Kitchen' },
    { label: 'On the Way', desc: 'En-route to sanctuary' },
    { label: 'Delivered', desc: 'Arrived & Handed' }
  ];

  const statusWeights = {
    'Created': 0,
    'Preparing': 1,
    'On the Way': 2,
    'Delivered': 3,
    'Cancelled': -1
  };

  const activeWeight = statusWeights[activeStatus] !== undefined ? statusWeights[activeStatus] : 0;

  // Timeline Container
  const wrapper = createNode('div', ['relative', 'py-4']);
  
  // Progress Line track (gray background)
  const lineBg = createNode('div', ['absolute', 'top-9', 'left-4', 'right-4', 'h-1', 'bg-luxury-border', 'rounded-full', '-translate-y-1/2', 'z-0']);
  wrapper.appendChild(lineBg);

  // Active Progress Line highlight (gold gradient width)
  const progressPercent = activeWeight === -1 ? 0 : (activeWeight / 3) * 100;
  const lineHighlight = createNode('div', [
    'absolute', 'top-9', 'left-4', 'h-1', 'bg-gradient-to-r', 'from-luxury-gold', 'to-yellow-600', 
    'rounded-full', '-translate-y-1/2', 'z-0', 'transition-all', 'duration-[1.5s]', 'ease-out'
  ], {
    style: `width: calc(${progressPercent}% - 32px);`
  });
  wrapper.appendChild(lineHighlight);

  // Nodes Row
  const nodesGrid = createNode('div', ['relative', 'grid', 'grid-cols-4', 'z-10']);
  
  steps.forEach((step, idx) => {
    const isCompleted = activeWeight >= idx;
    const isCurrent = activeWeight === idx;

    const nodeWrapper = createNode('div', ['flex', 'flex-col', 'items-center', 'text-center', 'space-y-3.5']);
    
    // Bubble indicator
    let bubbleClasses = ['w-9', 'h-9', 'rounded-full', 'flex', 'items-center', 'justify-center', 'transition-all', 'duration-[0.8s]'];
    if (isCurrent) {
      bubbleClasses.push('bg-luxury-gold', 'text-black', 'gold-glow', 'scale-110');
    } else if (isCompleted) {
      bubbleClasses.push('bg-gradient-to-r', 'from-luxury-gold', 'to-yellow-600', 'text-black');
    } else {
      bubbleClasses.push('bg-luxury-card', 'border', 'border-luxury-border', 'text-gray-500');
    }

    const bubble = createNode('div', bubbleClasses);
    
    // Vector checkmark inside bubble for finished steps, else step number
    if (isCompleted && !isCurrent) {
      const svgCheck = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgCheck.setAttribute('class', 'w-4 h-4');
      svgCheck.setAttribute('fill', 'none');
      svgCheck.setAttribute('viewBox', '0 0 24 24');
      svgCheck.setAttribute('stroke', 'currentColor');
      svgCheck.setAttribute('stroke-width', '3');
      const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      checkPath.setAttribute('stroke-linecap', 'round');
      checkPath.setAttribute('stroke-linejoin', 'round');
      checkPath.setAttribute('d', 'M5 13l4 4L19 7');
      svgCheck.appendChild(checkPath);
      bubble.appendChild(svgCheck);
    } else {
      const numSpan = createNode('span', ['text-xs', 'font-bold']);
      numSpan.textContent = String(idx + 1);
      bubble.appendChild(numSpan);
    }
    
    nodeWrapper.appendChild(bubble);

    // Text descriptions
    const textBlock = createNode('div', ['space-y-0.5']);
    const label = createNode('p', [
      'text-[10px]', 'uppercase', 'tracking-widest', 'font-bold', 
      isCurrent ? 'text-luxury-gold' : (isCompleted ? 'text-white' : 'text-gray-500')
    ]);
    label.textContent = step.label;
    
    const desc = createNode('p', ['text-[9px]', 'text-luxury-textMuted', 'max-w-[100px]', 'mx-auto', 'line-clamp-2']);
    desc.textContent = step.desc;

    textBlock.appendChild(label);
    textBlock.appendChild(desc);
    nodeWrapper.appendChild(textBlock);

    nodesGrid.appendChild(nodeWrapper);
  });

  wrapper.appendChild(nodesGrid);
  
  if (activeStatus === 'Cancelled') {
    const cancelNotice = createNode('div', ['mt-6', 'p-3', 'rounded-xl', 'bg-red-500/10', 'border', 'border-red-500/20', 'text-red-400', 'text-[11px]', 'text-center', 'font-medium']);
    cancelNotice.textContent = 'This culinary order was flagged as Cancelled by the operations manager.';
    wrapper.appendChild(cancelNotice);
  }

  return wrapper;
}

// Kitchen Panel Operations Polling
async function pollKitchenOrders() {
  const container = document.getElementById('kitchen-orders-container');
  if (!container) return;

  try {
    const res = await fetch('/api/orders');
    if (!res.ok) {
      clearChildren(container);
      const err = createNode('p', ['text-xs', 'text-red-400', 'text-center']);
      err.textContent = 'Failed to fetch staff log (active session required).';
      container.appendChild(err);
      return;
    }
    
    const orders = await res.json();
    renderKitchenDashboard(orders);

  } catch (err) {
    console.error('Error fetching kitchen orders:', err);
  }
}

// Build Kitchen staff log interface (Zero innerHTML)
function renderKitchenDashboard(orders) {
  const container = document.getElementById('kitchen-orders-container');
  if (!container) return;

  clearChildren(container);

  if (orders.length === 0) {
    const notice = createNode('p', ['text-xs', 'text-luxury-textMuted', 'text-center', 'py-8']);
    notice.textContent = 'Awaiting incoming fine-dining transactions...';
    container.appendChild(notice);
    return;
  }

  orders.slice().reverse().forEach((order) => {
    // Row Box
    const orderBox = createNode('div', ['p-4', 'bg-luxury-dark', 'border', 'border-luxury-border', 'rounded-xl', 'flex', 'flex-col', 'md:flex-row', 'justify-between', 'items-start', 'md:items-center', 'gap-4', 'animate-[fadeIn_0.2s_ease-out]']);
    
    // Left side: customer and details summary
    const leftBlock = createNode('div', ['space-y-1.5']);
    
    const headRow = createNode('div', ['flex', 'items-center', 'space-x-3.5']);
    const clientText = createNode('span', ['text-xs', 'font-bold', 'text-white']);
    clientText.textContent = order.customer.name;
    const refText = createNode('span', ['text-[10px]', 'text-luxury-textMuted']);
    refText.textContent = `Ref: #${order.id.slice(0, 8)}`;
    
    headRow.appendChild(clientText);
    headRow.appendChild(refText);
    leftBlock.appendChild(headRow);

    const itemsSummary = createNode('p', ['text-[11px]', 'text-gray-400']);
    const summaryText = order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ');
    itemsSummary.textContent = summaryText;
    leftBlock.appendChild(itemsSummary);

    // Render special chef notes if present
    const notesArr = order.items.filter((i) => i.instructions);
    if (notesArr.length) {
      const notesBlock = createNode('div', ['text-[9px]', 'text-luxury-gold', 'bg-luxury-gold/5', 'px-2.5', 'py-1', 'rounded-md', 'border', 'border-luxury-gold/10', 'w-fit']);
      notesBlock.textContent = `Notes: ` + notesArr.map((i) => `"${i.instructions}"`).join(' | ');
      leftBlock.appendChild(notesBlock);
    }

    // Right side: controls row
    const rightBlock = createNode('div', ['flex', 'items-center', 'space-x-3.5', 'w-full', 'md:w-fit', 'justify-between', 'md:justify-end']);
    
    const curStatus = createNode('span', [
      'px-2.5', 'py-1', 'rounded-md', 'text-[10px]', 'font-bold', 'uppercase', 
      'border', 'bg-luxury-card', 'text-gray-400', 'border-luxury-border'
    ]);
    curStatus.textContent = order.status;
    rightBlock.appendChild(curStatus);

    const actionsRow = createNode('div', ['flex', 'items-center', 'space-x-2']);
    
    // Select status progression button according to current order state
    if (order.status === 'Created') {
      actionsRow.appendChild(createKitchenButton('Prepare', 'Preparing', order.id));
    } else if (order.status === 'Preparing') {
      actionsRow.appendChild(createKitchenButton('Ship', 'On the Way', order.id));
    } else if (order.status === 'On the Way') {
      actionsRow.appendChild(createKitchenButton('Deliver', 'Delivered', order.id));
    }

    if (order.status !== 'Delivered' && order.status !== 'Cancelled') {
      actionsRow.appendChild(createKitchenButton('Cancel', 'Cancelled', order.id, true));
    }

    rightBlock.appendChild(actionsRow);

    orderBox.appendChild(leftBlock);
    orderBox.appendChild(rightBlock);
    container.appendChild(orderBox);
  });
}

function createKitchenButton(label, nextStatus, orderId, isDanger = false) {
  let btnClasses = ['px-3', 'py-1.5', 'rounded-lg', 'text-[10px]', 'font-bold', 'uppercase', 'transition-all'];
  if (isDanger) {
    btnClasses.push('border', 'border-red-500/40', 'bg-red-500/10', 'text-red-400', 'hover:bg-red-500/20');
  } else {
    btnClasses.push('bg-luxury-gold', 'text-black', 'hover:opacity-90');
  }

  const btn = createNode('button', btnClasses);
  btn.textContent = label;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': STATE.csrfToken
        },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        pollKitchenOrders();
      } else {
        const d = await res.json();
        alert(d.error || 'Failed to update order stage.');
      }
    } catch (e) {
      console.error(e);
      alert('Network failure processing kitchen state transition.');
    }
  });

  return btn;
}

// Pure SVG Food Path Generator Helpers (Ensures 0 innerHTML while looking super sharp and elegant)
function createFoodSvg(type, color) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'w-24 h-24 transform group-hover:scale-110 duration-500 transition-transform');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', color);
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  if (type === 'burger') {
    // Upper Bun
    const bunTop = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    bunTop.setAttribute('d', 'M 20 50 A 30 30 0 0 1 80 50 Z');
    bunTop.setAttribute('fill', color + '1A'); // transparent fill
    
    // Burger Patty
    const patty = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    patty.setAttribute('x', '15');
    patty.setAttribute('y', '62');
    patty.setAttribute('width', '70');
    patty.setAttribute('height', '8');
    patty.setAttribute('rx', '4');
    patty.setAttribute('fill', color + '40');

    // Cheese layer
    const cheese = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    cheese.setAttribute('d', 'M 18 56 L 82 56 L 74 62 L 50 62 L 44 59 L 38 62 L 26 62 Z');
    cheese.setAttribute('fill', '#D4AF37');

    // Lower Bun
    const bunBottom = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bunBottom.setAttribute('x', '20');
    bunBottom.setAttribute('y', '74');
    bunBottom.setAttribute('width', '60');
    bunBottom.setAttribute('height', '10');
    bunBottom.setAttribute('rx', '5');
    bunBottom.setAttribute('fill', color + '1A');

    // Sesame seeds on top bun
    const seed1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    seed1.setAttribute('cx', '35'); seed1.setAttribute('cy', '35'); seed1.setAttribute('r', '1'); seed1.setAttribute('fill', '#FFF');
    const seed2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    seed2.setAttribute('cx', '50'); seed2.setAttribute('cy', '28'); seed2.setAttribute('r', '1'); seed2.setAttribute('fill', '#FFF');
    const seed3 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    seed3.setAttribute('cx', '65'); seed3.setAttribute('cy', '38'); seed3.setAttribute('r', '1'); seed3.setAttribute('fill', '#FFF');

    svg.appendChild(bunTop);
    svg.appendChild(cheese);
    svg.appendChild(patty);
    svg.appendChild(bunBottom);
    svg.appendChild(seed1);
    svg.appendChild(seed2);
    svg.appendChild(seed3);

  } else if (type === 'burger-smoked') {
    // Upper Bun with smoke lines
    const bunTop = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    bunTop.setAttribute('d', 'M 20 50 A 30 30 0 0 1 80 50 Z');
    bunTop.setAttribute('fill', color + '1A');

    const patty = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    patty.setAttribute('x', '15'); patty.setAttribute('y', '62'); patty.setAttribute('width', '70'); patty.setAttribute('height', '8'); patty.setAttribute('rx', '4'); patty.setAttribute('fill', color + '40');

    // Cheese
    const cheese = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    cheese.setAttribute('d', 'M 18 56 L 82 56 L 74 62 L 50 62 L 26 62 Z');
    cheese.setAttribute('fill', '#FF6B35');

    // Lower Bun
    const bunBottom = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bunBottom.setAttribute('x', '20'); bunBottom.setAttribute('y', '74'); bunBottom.setAttribute('width', '60'); bunBottom.setAttribute('height', '10'); bunBottom.setAttribute('rx', '5');

    // Smoke Wisps (Elegant paths)
    const smoke1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    smoke1.setAttribute('d', 'M 40 16 Q 35 10 42 5');
    smoke1.setAttribute('stroke-dasharray', '2 2');
    
    const smoke2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    smoke2.setAttribute('d', 'M 50 18 Q 55 11 48 6');
    smoke2.setAttribute('stroke-dasharray', '2 2');

    const smoke3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    smoke3.setAttribute('d', 'M 60 16 Q 55 9 62 4');
    smoke3.setAttribute('stroke-dasharray', '2 2');

    svg.appendChild(bunTop);
    svg.appendChild(cheese);
    svg.appendChild(patty);
    svg.appendChild(bunBottom);
    svg.appendChild(smoke1);
    svg.appendChild(smoke2);
    svg.appendChild(smoke3);

  } else if (type === 'pizza-burrata') {
    // Large circle for dough
    const dough = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dough.setAttribute('cx', '50');
    dough.setAttribute('cy', '50');
    dough.setAttribute('r', '40');
    dough.setAttribute('fill', color + '15');
    
    // Prosciutto curls (paths)
    const prosciutto = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    prosciutto.setAttribute('d', 'M 35 35 Q 40 40 30 45 Q 45 42 40 30');
    prosciutto.setAttribute('fill', '#D4AF37' + '20');

    // Burrata dollops (white/gold drops)
    const dollop1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dollop1.setAttribute('cx', '50'); dollop1.setAttribute('cy', '45'); dollop1.setAttribute('r', '7'); dollop1.setAttribute('fill', '#FFF');
    
    const dollop2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dollop2.setAttribute('cx', '35'); dollop2.setAttribute('cy', '60'); dollop2.setAttribute('r', '6'); dollop2.setAttribute('fill', '#FFF');
    
    const dollop3 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dollop3.setAttribute('cx', '65'); dollop3.setAttribute('cy', '55'); dollop3.setAttribute('r', '6'); dollop3.setAttribute('fill', '#FFF');

    // Honey drop paths
    const honey = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    honey.setAttribute('d', 'M 25 25 C 40 28, 55 15, 75 35 C 70 55, 45 65, 25 75 Z');
    honey.setAttribute('stroke', '#E01E37');
    honey.setAttribute('stroke-dasharray', '4 4');

    svg.appendChild(dough);
    svg.appendChild(prosciutto);
    svg.appendChild(honey);
    svg.appendChild(dollop1);
    svg.appendChild(dollop2);
    svg.appendChild(dollop3);

  } else if (type === 'pizza-garden') {
    const dough = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dough.setAttribute('cx', '50'); dough.setAttribute('cy', '50'); dough.setAttribute('r', '40'); dough.setAttribute('fill', color + '15');

    // Heirloom tomatoes (circles)
    const tom1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    tom1.setAttribute('cx', '42'); tom1.setAttribute('cy', '40'); tom1.setAttribute('r', '5'); tom1.setAttribute('fill', '#2EC4B6');
    const tom2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    tom2.setAttribute('cx', '58'); tom2.setAttribute('cy', '60'); tom2.setAttribute('r', '5'); tom2.setAttribute('fill', '#2EC4B6');

    // Basil leaves (leaves)
    const leaf1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    leaf1.setAttribute('d', 'M 35 55 C 30 65, 42 68, 48 58 Z');
    leaf1.setAttribute('fill', '#2EC4B6' + '30');

    const leaf2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    leaf2.setAttribute('d', 'M 65 35 C 70 25, 58 22, 52 32 Z');
    leaf2.setAttribute('fill', '#2EC4B6' + '30');

    svg.appendChild(dough);
    svg.appendChild(tom1);
    svg.appendChild(tom2);
    svg.appendChild(leaf1);
    svg.appendChild(leaf2);

  } else if (type === 'cocktail-rosemary') {
    // Glass
    const glass = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    glass.setAttribute('d', 'M 30 25 L 70 25 L 68 75 C 68 82, 32 82, 32 75 Z');
    glass.setAttribute('fill', color + '15');

    // Big Ice Cube
    const cube = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    cube.setAttribute('x', '40'); cube.setAttribute('y', '42'); cube.setAttribute('width', '20'); cube.setAttribute('height', '20'); cube.setAttribute('rx', '3'); cube.setAttribute('fill', '#FFF' + '30');

    // Rosemary twig
    const twig = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    twig.setAttribute('x1', '35'); twig.setAttribute('y1', '80'); twig.setAttribute('x2', '65'); twig.setAttribute('y2', '15');
    twig.setAttribute('stroke', '#FFF');

    const leaf1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    leaf1.setAttribute('x1', '50'); leaf1.setAttribute('y1', '50'); leaf1.setAttribute('x2', '60'); leaf1.setAttribute('y2', '45');
    const leaf2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    leaf2.setAttribute('x1', '55'); leaf2.setAttribute('y1', '40'); leaf2.setAttribute('x2', '45'); leaf2.setAttribute('y2', '35');

    svg.appendChild(glass);
    svg.appendChild(cube);
    svg.appendChild(twig);
    svg.appendChild(leaf1);
    svg.appendChild(leaf2);

  } else if (type === 'elixir-lavender') {
    // Tall Highball Glass
    const glass = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    glass.setAttribute('d', 'M 35 15 L 65 15 L 60 85 C 60 88, 40 88, 40 85 Z');
    glass.setAttribute('fill', color + '15');

    // Fluid levels
    const level1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    level1.setAttribute('d', 'M 37 45 L 63 45 L 61 70 C 61 80, 39 80, 39 70 Z');
    level1.setAttribute('fill', color + '40');

    // Straw
    const straw = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    straw.setAttribute('x1', '45'); straw.setAttribute('y1', '90'); straw.setAttribute('x2', '75'); straw.setAttribute('y2', '5');
    straw.setAttribute('stroke', '#FFF');

    // Lemon slice
    const lemon = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    lemon.setAttribute('cx', '65'); lemon.setAttribute('cy', '22'); lemon.setAttribute('r', '9'); lemon.setAttribute('fill', '#F59E0B' + '50');

    svg.appendChild(glass);
    svg.appendChild(level1);
    svg.appendChild(straw);
    svg.appendChild(lemon);

  } else if (type === 'cake-matcha') {
    // Plate
    const plate = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    plate.setAttribute('cx', '50'); plate.setAttribute('cy', '78'); plate.setAttribute('rx', '35'); plate.setAttribute('ry', '8');
    plate.setAttribute('fill', '#FFF' + '1A');

    // Lava cake body
    const cake = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    cake.setAttribute('d', 'M 30 70 C 30 50, 70 50, 70 70 Z');
    cake.setAttribute('fill', color + '30');

    // Molten white chocolate core pouring out
    const core = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    core.setAttribute('d', 'M 48 55 Q 52 50 50 78 Q 45 74 48 55');
    core.setAttribute('fill', '#FFF');

    svg.appendChild(plate);
    svg.appendChild(cake);
    svg.appendChild(core);

  } else if (type === 'chocolate-sphere') {
    // Plate
    const plate = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    plate.setAttribute('cx', '50'); plate.setAttribute('cy', '80'); plate.setAttribute('rx', '32'); plate.setAttribute('ry', '6');
    plate.setAttribute('fill', '#FFF' + '1A');

    // Sphere
    const ball = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ball.setAttribute('cx', '50'); ball.setAttribute('cy', '50'); ball.setAttribute('r', '25');
    ball.setAttribute('fill', color + '1C');

    // Flowing warm caramel spiral
    const spiral = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    spiral.setAttribute('d', 'M 50 25 C 65 30, 65 70, 50 75 C 35 70, 35 30, 50 25');
    spiral.setAttribute('fill', 'none');
    spiral.setAttribute('stroke', '#F59E0B');
    spiral.setAttribute('stroke-width', '1.5');
    spiral.setAttribute('stroke-dasharray', '3 3');

    svg.appendChild(plate);
    svg.appendChild(ball);
    svg.appendChild(spiral);

  } else {
    // Default gourmet plate outline
    const plate = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    plate.setAttribute('cx', '50'); plate.setAttribute('cy', '70'); plate.setAttribute('rx', '35'); plate.setAttribute('ry', '12');
    plate.setAttribute('fill', color + '15');
    svg.appendChild(plate);
  }

  return svg;
}
