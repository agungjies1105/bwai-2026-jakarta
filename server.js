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
    console.error('[Kesalahan Basis Data] Gagal membaca pesanan:', err);
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
        console.error('[Kesalahan Basis Data] Gagal menyimpan pesanan:', err);
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

// Menu Data (Indonesian)
const MENU = [
  {
    id: 'burg-1',
    name: 'Burger Wagyu Truffle Emas',
    price: 24.00,
    category: 'burger',
    description: 'Campuran daging sapi Wagyu ganda, aioli truffle hitam, daun emas 24k yang dapat dimakan, keju gruyère tua, roti brioche.',
    accentColor: '#D4AF37'
  },
  {
    id: 'burg-2',
    name: 'Burger Sandung Lamur Asap',
    price: 18.00,
    category: 'burger',
    description: 'Campuran daging sapi sandung lamur asap, bacon berlapis maple, cheddar tajam, bawang manis bakar, olesan khas.',
    accentColor: '#FF6B35'
  },
  {
    id: 'pizz-1',
    name: 'Pizza Burrata & Madu Pedas Ara',
    price: 22.00,
    category: 'pizza',
    description: 'Burrata segar, buah ara hitam, prosciutto di Parma, daun arugula liar, madu pedas bunga liar organik.',
    accentColor: '#E01E37'
  },
  {
    id: 'pizz-2',
    name: 'Pizza Pesto Taman Alkimia',
    price: 19.00,
    category: 'pizza',
    description: 'Tomat ceri pusaka, bawang putih panggang, hati artichoke yang direndam, pesto almond basil liar.',
    accentColor: '#2EC4B6'
  },
  {
    id: 'drik-1',
    name: 'Old Fashioned Rosemary Asap',
    price: 14.00,
    category: 'minuman',
    description: 'Bourbon premium, angostura bitters perasan tangan, infus serpihan kayu rosemary asap khas.',
    accentColor: '#A855F7'
  },
  {
    id: 'drik-2',
    name: 'Elixir Lavender Bunga Telang',
    price: 8.00,
    category: 'minuman',
    description: 'Ekstrak lavender organik, teh bunga telang seduh ganda, limun organik peras segar.',
    accentColor: '#3B82F6'
  },
  {
    id: 'dess-1',
    name: 'Fondant Lava Matcha',
    price: 12.00,
    category: 'hidangan penutup',
    description: 'Kue matcha seremonial Uji, lelehan cokelat putih Belgia di tengah, gelato wijen hitam panggang.',
    accentColor: '#10B981'
  },
  {
    id: 'dess-2',
    name: 'Kubah Karamel Asin Hangat',
    price: 14.00,
    category: 'hidangan penutup',
    description: 'Kubah cokelat hitam murni, siraman karamel asin hangat khas, krim kacang vanila organik.',
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
    return res.status(403).json({ error: 'Terlarang: Sesi telah berakhir atau tidak valid.' });
  }

  const storedToken = sessions[sessionId].csrfToken;

  if (!csrfHeader || !storedToken || csrfHeader !== storedToken) {
    return res.status(403).json({ error: 'Terlarang: Validasi CSRF gagal.' });
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
    return res.status(400).json({ error: 'Format pengenal pesanan tidak valid.' });
  }

  const orders = readOrders();
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  // Sanitized output format
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
  const sessionId = getCookie(req, '__Secure-SessionId');
  if (!sessionId || !sessions[sessionId]) {
    return res.status(401).json({ error: 'Tidak Sah: Sesi tidak aktif.' });
  }

  const orders = readOrders();
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

  if (!customer || !items || !totals) {
    return res.status(400).json({ error: 'Parameter pesanan wajib tidak lengkap.' });
  }

  const { name, phone, address, cardNumber, cardExpiry, cardCvv } = customer;

  if (!name || name.trim().length < 2 || name.trim().length > 64) {
    return res.status(400).json({ error: 'Nama tidak valid. Harus 2-64 karakter.' });
  }

  if (!phone || !/^\+?[0-9\s\-()]{8,20}$/.test(phone)) {
    return res.status(400).json({ error: 'Format nomor kontak tidak valid.' });
  }

  if (!address || address.trim().length < 5 || address.trim().length > 256) {
    return res.status(400).json({ error: 'Alamat pengiriman tidak valid. Harus 5-256 karakter.' });
  }

  if (!cardNumber || !/^[0-9\s-]{12,19}$/.test(cardNumber)) {
    return res.status(400).json({ error: 'Nomor kartu tidak valid.' });
  }
  if (!cardExpiry || !/^(0[1-9]|1[0-2])\/?([0-9]{2})$/.test(cardExpiry)) {
    return res.status(400).json({ error: 'Masa berlaku kartu tidak valid.' });
  }
  if (!cardCvv || !/^[0-9]{3,4}$/.test(cardCvv)) {
    return res.status(400).json({ error: 'Kode CVV tidak valid.' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Keranjang belanja Anda kosong.' });
  }

  const validatedItems = [];
  let calculatedSubtotal = 0;

  for (const item of items) {
    const menuItem = MENU.find((m) => m.id === item.id);
    if (!menuItem) {
      return res.status(400).json({ error: `Hidangan tidak ditemukan di menu: ${item.name}` });
    }
    const quantity = parseInt(item.quantity, 10);
    if (isNaN(quantity) || quantity <= 0 || quantity > 50) {
      return res.status(400).json({ error: 'Jumlah item tidak valid.' });
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

  const tax = Number((calculatedSubtotal * 0.1).toFixed(2));
  const delivery = calculatedSubtotal > 50 ? 0 : 5.00;
  const finalTotal = Number((calculatedSubtotal + tax + delivery).toFixed(2));

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
    status: 'Dibuat', // Created -> Dibuat
    createdAt: new Date().toISOString()
  };

  try {
    const orders = readOrders();
    orders.push(newOrder);
    await writeOrders(orders);
    res.status(201).json({ success: true, orderId });
  } catch (err) {
    res.status(500).json({ error: 'Kesalahan server internal saat memproses pesanan.' });
  }
});

// 5. Update Order Status (Admin/Kitchen Console)
app.put('/api/orders/:id/status', verifyCSRF, async (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;

  const validStatuses = ['Dibuat', 'Sedang Disiapkan', 'Dalam Perjalanan', 'Terkirim', 'Dibatalkan'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Nilai transisi status tidak valid.' });
  }

  if (!/^[a-f0-9\-]+$/i.test(orderId)) {
    return res.status(400).json({ error: 'Pengenal pesanan tidak valid.' });
  }

  try {
    const orders = readOrders();
    const orderIndex = orders.findIndex((o) => o.id === orderId);

    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    }

    orders[orderIndex].status = status;
    await writeOrders(orders);

    res.json({ success: true, status: orders[orderIndex].status });
  } catch (err) {
    res.status(500).json({ error: 'Kesalahan server internal saat memperbarui status pesanan.' });
  }
});

// Serve Release Notes
app.get('/release-notes', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'release-notes.html'));
});

// Fallback: Serve UI for all other paths
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Launch server
app.listen(PORT, HOST, () => {
  console.log(`[Server LuxeBite] Beroperasi di http://${HOST}:${PORT}`);
});
