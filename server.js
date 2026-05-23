const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1'; // Strictly listen on localhost for development testing

// Database Configuration
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'orders.json');

// Ensure database directory and file exist safely
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, '[]', 'utf8');
}

// In-memory Database Mutex/Queue to prevent concurrent write file corruption
let dbQueue = Promise.resolve();

function readOrders() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('[Database Error] Failed to read orders:', err);
    return [];
  }
}

function writeOrders(orders) {
  return new Promise((resolve, reject) => {
    dbQueue = dbQueue.then(() => {
      try {
        fs.writeFileSync(DB_PATH, JSON.stringify(orders, null, 2), 'utf8');
        resolve();
      } catch (err) {
        console.error('[Database Error] Failed to write orders:', err);
        reject(err);
      }
    });
  });
}

// In-memory session store (stateless token mapping for CSRF)
const sessions = {};

// Clean up expired sessions periodically (every hour)
setInterval(() => {
  const now = Date.now();
  const ONE_HOUR = 3600000;
  Object.keys(sessions).forEach((sid) => {
    if (now - sessions[sid].createdAt > ONE_HOUR) {
      delete sessions[sid];
    }
  });
}, 3600000);

// Menu Data
const MENU = [
  {
    id: 'burg-1',
    name: 'Truffle Gold Wagyu Burger',
    price: 24.00,
    category: 'burgers',
    description: 'Double Wagyu blend, black truffle aioli, edible 24k gold leaf, aged gruyère, brioche bun.',
    accentColor: '#D4AF37'
  },
  {
    id: 'burg-2',
    name: 'Smoked Ember Brisket Burger',
    price: 18.00,
    category: 'burgers',
    description: 'Smoked brisket-beef blend, maple-glazed bacon, sharp cheddar, ember-charred sweet onions, house glaze.',
    accentColor: '#FF6B35'
  },
  {
    id: 'pizz-1',
    name: 'Burrata & Hot Honey Fig Pizza',
    price: 22.00,
    category: 'pizzas',
    description: 'Fresh burrata, black mission figs, prosciutto di Parma, wild baby arugula, organic wildflower hot honey.',
    accentColor: '#E01E37'
  },
  {
    id: 'pizz-2',
    name: 'Garden Alchemy Pesto Pizza',
    price: 19.00,
    category: 'pizzas',
    description: 'Heirloom cherry tomatoes, fire-roasted garlic, marinated artichoke hearts, wild basil almond pesto.',
    accentColor: '#2EC4B6'
  },
  {
    id: 'drik-1',
    name: 'Smoked Rosemary Old Fashioned',
    price: 14.00,
    category: 'drinks',
    description: 'Premium bourbon, hand-pressed angostura bitters, house smoked rosemary wood chip infusion.',
    accentColor: '#A855F7'
  },
  {
    id: 'drik-2',
    name: 'Lavender Butterfly Pea Elixir',
    price: 8.00,
    category: 'drinks',
    description: 'Organic lavender extract, double-brewed butterfly pea tea, fresh-squeezed organic lemonade.',
    accentColor: '#3B82F6'
  },
  {
    id: 'dess-1',
    name: 'Matcha Molten Lava Fondant',
    price: 12.00,
    category: 'desserts',
    description: 'Uji ceremonial matcha cake, molten Belgian white chocolate center, toasted black sesame gelato.',
    accentColor: '#10B981'
  },
  {
    id: 'dess-2',
    name: 'Warm Salted Caramel Sphere',
    price: 14.00,
    category: 'desserts',
    description: 'Dark single-origin chocolate dome, warm house-salted caramel drizzle, organic vanilla bean cream.',
    accentColor: '#F59E0B'
  }
];

// Middlewares
app.use(express.json());

// Strict Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:;");
  next();
});

// Serve Static Files Safely
app.use(express.static(path.join(__dirname, 'public')));

// Helper to extract specific cookies
function getCookie(req, name) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
    });
  }
  return list[name];
}

// Session & CSRF Token Generation
app.get('/api/session-init', (req, res) => {
  let sessionId = getCookie(req, '__Secure-SessionId');
  let csrfToken;

  if (sessionId && sessions[sessionId]) {
    csrfToken = sessions[sessionId].csrfToken;
  } else {
    sessionId = crypto.randomBytes(24).toString('hex');
    csrfToken = crypto.randomBytes(32).toString('hex');
    sessions[sessionId] = {
      csrfToken,
      createdAt: Date.now()
    };
  }

  // Set hardened, session-bound cookie
  res.cookie('__Secure-SessionId', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/'
  });

  res.json({ csrfToken });
});

// CSRF Protection Middleware for State-Changing Requests
function verifyCSRF(req, res, next) {
  const sessionId = getCookie(req, '__Secure-SessionId');
  const csrfHeader = req.headers['x-csrf-token'];

  if (!sessionId || !sessions[sessionId]) {
    return res.status(403).json({ error: 'Forbidden: Session expired or invalid.' });
  }

  const storedToken = sessions[sessionId].csrfToken;

  if (!csrfHeader || !storedToken || csrfHeader !== storedToken) {
    return res.status(403).json({ error: 'Forbidden: CSRF validation failed.' });
  }

  next();
}

// REST API Routes

// 1. Get Menu Catalog
app.get('/api/menu', (req, res) => {
  res.json(MENU);
});

// 2. Get Order Details (For Tracking)
app.get('/api/orders/:id', (req, res) => {
  const orderId = req.params.id;
  
  // Basic input check
  if (!/^[a-f0-9\-]+$/i.test(orderId)) {
    return res.status(400).json({ error: 'Invalid order identifier format.' });
  }

  const orders = readOrders();
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  // Sanitized output format (mask sensitive inputs, e.g., masked card is already saved masked)
  res.json({
    id: order.id,
    customer: {
      name: order.customer.name,
      phone: order.customer.phone,
      address: order.customer.address
    },
    items: order.items,
    totals: order.totals,
    status: order.status,
    createdAt: order.createdAt
  });
});

// 3. Get All Orders (Admin Dashboard - only for the active session)
app.get('/api/orders', (req, res) => {
  // Simple validation: check if active session exists
  const sessionId = getCookie(req, '__Secure-SessionId');
  if (!sessionId || !sessions[sessionId]) {
    return res.status(401).json({ error: 'Unauthorized: Session not active.' });
  }

  const orders = readOrders();
  // Return all orders but mask credit cards and format nicely
  const sanitizedOrders = orders.map((o) => ({
    id: o.id,
    customer: {
      name: o.customer.name,
      phone: o.customer.phone,
      address: o.customer.address
    },
    items: o.items,
    totals: o.totals,
    status: o.status,
    createdAt: o.createdAt
  }));

  res.json(sanitizedOrders);
});

// 4. Place New Order
app.post('/api/orders', verifyCSRF, async (req, res) => {
  const { customer, items, totals } = req.body;

  // Rigorous Input Validations
  if (!customer || !items || !totals) {
    return res.status(400).json({ error: 'Missing mandatory order parameters.' });
  }

  const { name, phone, address, cardNumber, cardExpiry, cardCvv } = customer;

  // Basic regex matches
  if (!name || name.trim().length < 2 || name.trim().length > 64) {
    return res.status(400).json({ error: 'Invalid name. Must be 2-64 characters.' });
  }

  // Indon / International phone check
  if (!phone || !/^\+?[0-9\s\-()]{8,20}$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid contact number format.' });
  }

  if (!address || address.trim().length < 5 || address.trim().length > 256) {
    return res.status(400).json({ error: 'Invalid delivery address. Must be 5-256 characters.' });
  }

  // Credit Card Masking & Checking (PII Sanitization)
  if (!cardNumber || !/^[0-9\s-]{12,19}$/.test(cardNumber)) {
    return res.status(400).json({ error: 'Invalid card number.' });
  }
  if (!cardExpiry || !/^(0[1-9]|1[0-2])\/?([0-9]{2})$/.test(cardExpiry)) {
    return res.status(400).json({ error: 'Invalid card expiry.' });
  }
  if (!cardCvv || !/^[0-9]{3,4}$/.test(cardCvv)) {
    return res.status(400).json({ error: 'Invalid CVV code.' });
  }

  // Validate items
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Your cart is empty.' });
  }

  const validatedItems = [];
  let calculatedSubtotal = 0;

  for (const item of items) {
    const menuItem = MENU.find((m) => m.id === item.id);
    if (!menuItem) {
      return res.status(400).json({ error: `Dish not found in menu: ${item.name}` });
    }
    const quantity = parseInt(item.quantity, 10);
    if (isNaN(quantity) || quantity <= 0 || quantity > 50) {
      return res.status(400).json({ error: 'Invalid item quantity.' });
    }

    const customInstructions = item.instructions ? String(item.instructions).substring(0, 150) : '';

    validatedItems.push({
      id: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      quantity,
      instructions: customInstructions
    });

    calculatedSubtotal += menuItem.price * quantity;
  }

  const tax = Number((calculatedSubtotal * 0.1).toFixed(2)); // 10% tax
  const delivery = calculatedSubtotal > 50 ? 0 : 5.00; // Free delivery for orders > $50
  const finalTotal = Number((calculatedSubtotal + tax + delivery).toFixed(2));

  // Mask Credit Card for storage: Keep only last 4 digits
  const cleanCard = cardNumber.replace(/[\s-]/g, '');
  const maskedCard = `****-****-****-${cleanCard.slice(-4)}`;

  const orderId = crypto.randomUUID();
  const newOrder = {
    id: orderId,
    customer: {
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      cardMasked: maskedCard
    },
    items: validatedItems,
    totals: {
      subtotal: calculatedSubtotal,
      tax,
      delivery,
      total: finalTotal
    },
    status: 'Created',
    createdAt: new Date().toISOString()
  };

  try {
    const orders = readOrders();
    orders.push(newOrder);
    await writeOrders(orders);
    res.status(201).json({ success: true, orderId });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error processing the order.' });
  }
});

// 5. Update Order Status (Admin/Kitchen Console)
app.put('/api/orders/:id/status', verifyCSRF, async (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;

  const validStatuses = ['Created', 'Preparing', 'On the Way', 'Delivered', 'Cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status transition value.' });
  }

  // Basic check for order ID
  if (!/^[a-f0-9\-]+$/i.test(orderId)) {
    return res.status(400).json({ error: 'Invalid order identifier.' });
  }

  try {
    const orders = readOrders();
    const orderIndex = orders.findIndex((o) => o.id === orderId);

    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    orders[orderIndex].status = status;
    await writeOrders(orders);

    res.json({ success: true, status: orders[orderIndex].status });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error updating order status.' });
  }
});

// Fallback: Serve UI for all other paths
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Launch server
app.listen(PORT, HOST, () => {
  console.log(`[LuxeBite Server] Operating at http://${HOST}:${PORT}`);
});
