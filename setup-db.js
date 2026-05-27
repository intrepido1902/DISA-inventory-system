// setup-db.js — ejecutar con: node setup-db.js
// Elimina todas las tablas y recrea la base de datos con datos de prueba.

async function main() {
  const { createClient } = await import('@libsql/client');
  const bcryptjs = await import('bcryptjs');
  const bcrypt = bcryptjs.default ?? bcryptjs;

  const db = createClient({ url: 'file:./dev.db' });

  console.log('🗑️  Eliminando tablas existentes...');
  await db.executeMultiple(`
    DROP TABLE IF EXISTS AuditLog;
    DROP TABLE IF EXISTS Movement;
    DROP TABLE IF EXISTS Sale;
    DROP TABLE IF EXISTS Roll;
    DROP TABLE IF EXISTS ImportLot;
    DROP TABLE IF EXISTS Product;
    DROP TABLE IF EXISTS Category;
    DROP TABLE IF EXISTS Client;
    DROP TABLE IF EXISTS User;
  `);

  console.log('📦 Creando tablas...');
  await db.executeMultiple(`
    CREATE TABLE User (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('OWNER','WAREHOUSE')),
      active INTEGER NOT NULL DEFAULT 1,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE Category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE Product (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      categoryId INTEGER NOT NULL,
      color TEXT NOT NULL,
      width INTEGER NOT NULL,
      priceOwner REAL NOT NULL,
      priceB2B REAL NOT NULL,
      priceB2C REAL NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (categoryId) REFERENCES Category(id)
    );

    CREATE TABLE ImportLot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lotNumber TEXT NOT NULL UNIQUE,
      importDate TEXT NOT NULL,
      supplier TEXT NOT NULL DEFAULT 'China',
      notes TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE Roll (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rollNumber TEXT NOT NULL,
      barcode TEXT UNIQUE,
      productId INTEGER NOT NULL,
      lotId INTEGER NOT NULL,
      initialMeters REAL NOT NULL,
      currentMeters REAL NOT NULL,
      location TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DEPLETED','DEFECTIVE','WRITTEN_OFF')),
      isRemnant INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (productId) REFERENCES Product(id),
      FOREIGN KEY (lotId) REFERENCES ImportLot(id)
    );

    CREATE TABLE Client (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('DISTRIBUTOR','DECORATOR')),
      phone TEXT,
      email TEXT,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE Sale (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId INTEGER NOT NULL,
      date TEXT NOT NULL,
      total REAL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (clientId) REFERENCES Client(id)
    );

    CREATE TABLE Movement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('ENTRY','EXIT_FULL','EXIT_PARTIAL','ADJUSTMENT','WRITE_OFF')),
      rollId INTEGER NOT NULL,
      meters REAL NOT NULL,
      userId INTEGER NOT NULL,
      saleId INTEGER,
      notes TEXT,
      barcodeUsed INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (rollId) REFERENCES Roll(id),
      FOREIGN KEY (userId) REFERENCES User(id),
      FOREIGN KEY (saleId) REFERENCES Sale(id)
    );

    CREATE TABLE AuditLog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entityId INTEGER NOT NULL,
      oldData TEXT,
      newData TEXT,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES User(id)
    );
  `);
  console.log('✅ Tablas creadas');

  const now = Date.now();

  // ── USERS ─────────────────────────────────────────────────────────────────
  console.log('👤 Insertando usuarios...');
  const [hash1, hash2, hash3] = await Promise.all([
    bcrypt.hash('admin2026', 10),
    bcrypt.hash('william2026', 10),
    bcrypt.hash('bodega2026', 10),
  ]);

  await db.executeMultiple(`
    INSERT INTO User (email, password, name, role, active, createdAt, updatedAt)
    VALUES ('samir@disa.co', '${hash1}', 'Samir Moya', 'OWNER', 1, ${now}, ${now});

    INSERT INTO User (email, password, name, role, active, createdAt, updatedAt)
    VALUES ('william@disa.co', '${hash2}', 'William López', 'OWNER', 1, ${now}, ${now});

    INSERT INTO User (email, password, name, role, active, createdAt, updatedAt)
    VALUES ('bodega@disa.co', '${hash3}', 'Carlos Pérez', 'WAREHOUSE', 1, ${now}, ${now});
  `);

  // ── CATEGORIES ────────────────────────────────────────────────────────────
  console.log('🏷️  Insertando categorías...');
  await db.executeMultiple(`
    INSERT INTO Category (name) VALUES ('Velo');
    INSERT INTO Category (name) VALUES ('Blackout');
  `);

  const catRows = await db.execute('SELECT id, name FROM Category');
  const veloId = catRows.rows.find(r => r.name === 'Velo').id;
  const blackoutId = catRows.rows.find(r => r.name === 'Blackout').id;

  // ── PRODUCTS ──────────────────────────────────────────────────────────────
  console.log('🧵 Insertando 25 productos...');
  const products = [
    ['Velo Linen',    'VP-001', veloId,    'Blanco',      280, 17000, 21000, 28000],
    ['Velo Linen',    'VP-002', veloId,    'Crema',       280, 17000, 21000, 28000],
    ['Velo Sheer',    'VP-003', veloId,    'Blanco',      260, 15000, 19000, 25000],
    ['Velo Sheer',    'VP-004', veloId,    'Gris',        260, 15000, 19000, 25000],
    ['Velo Organza',  'VP-005', veloId,    'Blanco',      300, 22000, 27000, 35000],
    ['Velo Organza',  'VP-006', veloId,    'Dorado',      300, 23000, 28000, 36000],
    ['Velo Visillo',  'VP-007', veloId,    'Blanco',      280, 16000, 20000, 26000],
    ['Velo Visillo',  'VP-008', veloId,    'Crema',       280, 16000, 20000, 26000],
    ['Velo Regal',    'VP-009', veloId,    'Blanco',      300, 24000, 30000, 38000],
    ['Velo Regal',    'VP-010', veloId,    'Plateado',    300, 25000, 31000, 39000],
    ['Velo Soft',     'VP-011', veloId,    'Blanco',      260, 14000, 17000, 22000],
    ['Velo Soft',     'VP-012', veloId,    'Beige',       260, 14000, 17000, 22000],
    ['Velo Classic',  'VP-013', veloId,    'Blanco',      280, 18000, 22000, 29000],
    ['Velo Classic',  'VP-014', veloId,    'Crema',       280, 18000, 22000, 29000],
    ['Velo Premium',  'VP-015', veloId,    'Blanco',      300, 26000, 32000, 40000],
    ['Velo Natural',  'VP-016', veloId,    'Crema',       260, 15500, 19000, 24000],
    ['Velo Brisa',    'VP-017', veloId,    'Blanco',      280, 16500, 20000, 26000],
    ['Blackout Standard', 'BL-001', blackoutId, 'Blanco',      280, 30000, 37000, 46000],
    ['Blackout Standard', 'BL-002', blackoutId, 'Gris',        280, 30000, 37000, 46000],
    ['Blackout Standard', 'BL-003', blackoutId, 'Negro',       280, 31000, 38000, 47000],
    ['Blackout Premium',  'BL-004', blackoutId, 'Blanco',      300, 40000, 49000, 60000],
    ['Blackout Premium',  'BL-005', blackoutId, 'Gris Oscuro', 300, 42000, 51000, 63000],
    ['Blackout Dimout',   'BL-006', blackoutId, 'Blanco',      280, 35000, 43000, 54000],
    ['Blackout Dimout',   'BL-007', blackoutId, 'Beige',       280, 35000, 43000, 54000],
    ['Blackout Total',    'BL-008', blackoutId, 'Negro',       260, 38000, 46000, 57000],
  ];

  for (const [name, code, categoryId, color, width, priceOwner, priceB2B, priceB2C] of products) {
    await db.execute({
      sql: `INSERT INTO Product (name, code, categoryId, color, width, priceOwner, priceB2B, priceB2C, active, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      args: [name, code, categoryId, color, width, priceOwner, priceB2B, priceB2C, now, now],
    });
  }

  const prodRows = await db.execute('SELECT id, code FROM Product ORDER BY id');
  const productMap = {};
  for (const row of prodRows.rows) productMap[row.code] = row.id;

  // ── IMPORT LOTS ───────────────────────────────────────────────────────────
  console.log('📋 Insertando lotes...');
  await db.executeMultiple(`
    INSERT INTO ImportLot (lotNumber, importDate, supplier, notes, createdAt)
    VALUES ('IMP-2024-001', '2024-03-15', 'China', 'Primer lote 2024 - Guangzhou Textile', ${now});

    INSERT INTO ImportLot (lotNumber, importDate, supplier, notes, createdAt)
    VALUES ('IMP-2024-002', '2024-08-20', 'China', 'Segundo lote 2024 - Shanghai Fabrics Co.', ${now});

    INSERT INTO ImportLot (lotNumber, importDate, supplier, notes, createdAt)
    VALUES ('IMP-2025-001', '2025-02-10', 'China', 'Primer lote 2025 - Guangzhou Textile', ${now});
  `);

  const lotRows = await db.execute('SELECT id, lotNumber FROM ImportLot ORDER BY id');
  const lot1 = lotRows.rows[0].id;
  const lot2 = lotRows.rows[1].id;
  const lot3 = lotRows.rows[2].id;
  const lotPrefix = { [lot1]: '240315', [lot2]: '240820', [lot3]: '250210' };

  // ── ROLLS (~83 rollos) ────────────────────────────────────────────────────
  console.log('🧶 Insertando rollos (~83)...');
  // [code, lotId, suffix, initial, current, location, isRemnant]
  const rollData = [
    ['VP-001', lot1, '001', 150, 150, 'A-01', 0], ['VP-001', lot1, '002', 130, 105, 'A-01', 0],
    ['VP-001', lot2, '003', 160, 160, 'A-02', 0], ['VP-001', lot2, '004', 120,   8, 'A-02', 1],
    ['VP-002', lot1, '005', 140, 140, 'A-03', 0], ['VP-002', lot2, '006', 155,  92, 'A-03', 0],
    ['VP-002', lot3, '007', 170, 170, 'A-04', 0],
    ['VP-003', lot1, '008', 130, 130, 'A-04', 0], ['VP-003', lot1, '009', 145,  78, 'A-05', 0],
    ['VP-003', lot2, '010', 160, 160, 'A-05', 0], ['VP-003', lot3, '011', 110,   5, 'A-06', 1],
    ['VP-004', lot1, '012', 140, 118, 'A-06', 0], ['VP-004', lot2, '013', 150, 150, 'A-07', 0],
    ['VP-004', lot3, '014', 165, 165, 'A-07', 0],
    ['VP-005', lot1, '015', 120, 120, 'A-08', 0], ['VP-005', lot2, '016', 135,  60, 'A-08', 0],
    ['VP-005', lot3, '017', 150, 150, 'A-09', 0],
    ['VP-006', lot1, '018', 130,  95, 'A-09', 0], ['VP-006', lot2, '019', 140, 140, 'A-10', 0],
    ['VP-006', lot3, '020', 125, 125, 'A-10', 0],
    ['VP-007', lot1, '021', 155, 155, 'B-01', 0], ['VP-007', lot1, '022', 130,  45, 'B-01', 0],
    ['VP-007', lot2, '023', 165, 165, 'B-02', 0], ['VP-007', lot3, '024', 145,   7, 'B-02', 1],
    ['VP-008', lot1, '025', 150, 115, 'B-03', 0], ['VP-008', lot2, '026', 140, 140, 'B-03', 0],
    ['VP-008', lot3, '027', 160, 160, 'B-04', 0],
    ['VP-009', lot1, '028', 120, 120, 'B-04', 0], ['VP-009', lot2, '029', 135,  80, 'B-05', 0],
    ['VP-009', lot2, '030', 150, 150, 'B-05', 0], ['VP-009', lot3, '031', 110,   6, 'B-06', 1],
    ['VP-010', lot1, '032', 130,  98, 'B-06', 0], ['VP-010', lot2, '033', 145, 145, 'B-07', 0],
    ['VP-010', lot2, '034', 160, 160, 'B-07', 0], ['VP-010', lot3, '035', 120, 120, 'B-08', 0],
    ['VP-011', lot2, '036', 140, 140, 'B-08', 0], ['VP-011', lot2, '037', 155,  70, 'B-09', 0],
    ['VP-011', lot3, '038', 130, 130, 'B-09', 0],
    ['VP-012', lot2, '039', 135, 110, 'B-10', 0], ['VP-012', lot3, '040', 150, 150, 'B-10', 0],
    ['VP-012', lot3, '041', 145, 145, 'C-01', 0],
    ['VP-013', lot1, '042', 160, 160, 'C-01', 0], ['VP-013', lot2, '043', 130,  55, 'C-02', 0],
    ['VP-013', lot3, '044', 155, 155, 'C-02', 0], ['VP-013', lot3, '045', 140,   9, 'C-03', 1],
    ['VP-014', lot1, '046', 150, 118, 'C-03', 0], ['VP-014', lot2, '047', 135, 135, 'C-04', 0],
    ['VP-014', lot3, '048', 165, 165, 'C-04', 0], ['VP-014', lot3, '049', 120, 120, 'C-05', 0],
    ['VP-015', lot1, '050', 140, 140, 'C-05', 0], ['VP-015', lot1, '051', 155,  88, 'A-11', 0],
    ['VP-015', lot2, '052', 170, 170, 'A-11', 0], ['VP-015', lot3, '053', 130, 130, 'A-12', 0],
    ['VP-015', lot3, '054', 145,   4, 'A-12', 1],
    ['VP-016', lot2, '055', 150, 122, 'A-13', 0], ['VP-016', lot3, '056', 160, 160, 'A-13', 0],
    ['VP-017', lot2, '057', 145,  95, 'A-14', 0], ['VP-017', lot3, '058', 155, 155, 'A-14', 0],
    ['BL-001', lot1, '059', 130, 130, 'A-15', 0], ['BL-001', lot2, '060', 145,  75, 'B-11', 0],
    ['BL-001', lot3, '061', 160, 160, 'B-11', 0], ['BL-001', lot3, '062', 120,   8, 'B-12', 1],
    ['BL-002', lot1, '063', 135, 110, 'B-12', 0], ['BL-002', lot2, '064', 150, 150, 'C-06', 0],
    ['BL-002', lot3, '065', 140, 140, 'C-06', 0],
    ['BL-003', lot2, '066', 125,  88, 'C-07', 0], ['BL-003', lot3, '067', 140, 140, 'C-07', 0],
    ['BL-003', lot3, '068', 155, 155, 'C-08', 0],
    ['BL-004', lot1, '069', 120, 120, 'C-08', 0], ['BL-004', lot2, '070', 135,  62, 'A-01', 0],
    ['BL-004', lot3, '071', 150, 150, 'A-02', 0], ['BL-004', lot3, '072', 110,   6, 'A-03', 1],
    ['BL-005', lot2, '073', 130,  95, 'A-04', 0], ['BL-005', lot3, '074', 145, 145, 'A-05', 0],
    ['BL-005', lot3, '075', 125, 125, 'A-06', 0],
    ['BL-006', lot1, '076', 140, 140, 'A-07', 0], ['BL-006', lot2, '077', 155,  45, 'A-08', 0],
    ['BL-006', lot3, '078', 165, 165, 'A-09', 0], ['BL-006', lot3, '079', 130,   9, 'A-10', 1],
    ['BL-007', lot2, '080', 145, 120, 'B-01', 0], ['BL-007', lot3, '081', 155, 155, 'B-02', 0],
    ['BL-008', lot2, '082', 130,  85, 'B-03', 0], ['BL-008', lot3, '083', 145, 145, 'B-04', 0],
  ];

  for (const [code, lotId, suffix, initial, current, location, isRemnant] of rollData) {
    const productId = productMap[code];
    const rollNumber = `CH-${lotPrefix[lotId]}-${suffix}`;
    const barcode = `DISA-${code}-${suffix}`;
    const status = current === 0 ? 'DEPLETED' : 'ACTIVE';
    await db.execute({
      sql: `INSERT INTO Roll (rollNumber, barcode, productId, lotId, initialMeters, currentMeters, location, status, isRemnant, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [rollNumber, barcode, productId, lotId, initial, current, location, status, isRemnant, now, now],
    });
  }

  // ── CLIENTS ───────────────────────────────────────────────────────────────
  console.log('🏢 Insertando clientes...');
  const clients = [
    ['Textiles del Norte SAS',      'DISTRIBUTOR', '3001234567', 'compras@textilesnorte.co',  'Cliente mayorista Bogotá'],
    ['Casa Decoración Bogotá',      'DECORATOR',   '3109876543', 'info@casadecobogota.co',    'Decoradora estrato 5-6'],
    ['Distribuidora Medellín Telas','DISTRIBUTOR', '3207654321', 'ventas@distmedtelas.co',    'Distribuidor zona Antioquia'],
    ['La Villa Decoradora',         'DECORATOR',   '3156789012', 'lavilla@decoradora.co',     null],
    ['Importaciones Cali Telas',    'DISTRIBUTOR', '3012345678', 'cali@importaciones.co',     'Distribuidor zona Pacífico'],
    ['Diseño Interior Barranquilla','DECORATOR',   '3189012345', 'info@dibq.co',              'Proyectos hoteleros'],
  ];

  for (const [name, type, phone, email, notes] of clients) {
    await db.execute({
      sql: `INSERT INTO Client (name, type, phone, email, notes, active, createdAt) VALUES (?, ?, ?, ?, ?, 1, ?)`,
      args: [name, type, phone, email, notes, now],
    });
  }

  // ── SAMPLE MOVEMENTS (today) ──────────────────────────────────────────────
  console.log('📊 Insertando movimientos de muestra...');
  const rollRows  = await db.execute('SELECT id FROM Roll ORDER BY id LIMIT 6');
  const clientRows = await db.execute('SELECT id FROM Client ORDER BY id LIMIT 3');
  const userRow   = await db.execute('SELECT id FROM User ORDER BY id LIMIT 1');
  const userId    = userRow.rows[0].id;
  const today     = new Date().toISOString().split('T')[0];

  const sampleExits = [
    { rollIdx: 0, clientIdx: 0, meters: 25, type: 'EXIT_PARTIAL', notes: 'Pedido 001' },
    { rollIdx: 1, clientIdx: 1, meters: 40, type: 'EXIT_PARTIAL', notes: 'Pedido 002' },
    { rollIdx: 2, clientIdx: 2, meters: 15, type: 'EXIT_PARTIAL', notes: 'Pedido 003' },
  ];

  for (let i = 0; i < sampleExits.length; i++) {
    const exit = sampleExits[i];
    if (exit.rollIdx >= rollRows.rows.length) continue;
    const rollId = rollRows.rows[exit.rollIdx].id;
    const clientId = clientRows.rows[exit.clientIdx % clientRows.rows.length].id;
    const saleResult = await db.execute({
      sql: `INSERT INTO Sale (clientId, date, total, createdAt) VALUES (?, ?, null, ?)`,
      args: [clientId, today, now - (i * 3600000)],
    });
    await db.execute({
      sql: `INSERT INTO Movement (type, rollId, meters, userId, saleId, notes, barcodeUsed, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      args: [exit.type, rollId, exit.meters, userId, saleResult.lastInsertRowid, exit.notes, now - (i * 3600000)],
    });
  }

  // Entry sample
  const entryRoll = rollRows.rows[0]?.id;
  if (entryRoll) {
    await db.execute({
      sql: `INSERT INTO Movement (type, rollId, meters, userId, saleId, notes, barcodeUsed, createdAt)
            VALUES ('ENTRY', ?, 150, ?, null, 'Recepción lote IMP-2025-001', 0, ?)`,
      args: [entryRoll, userId, now - 86400000],
    });
  }

  console.log('\n✅ Base de datos inicializada correctamente!');
  console.log('\n👤 Usuarios:');
  console.log('   samir@disa.co    / admin2026   → OWNER (Samir Moya)');
  console.log('   william@disa.co  / william2026 → OWNER (William López)');
  console.log('   bodega@disa.co   / bodega2026  → WAREHOUSE (Carlos Pérez)');
  console.log('\n🚀 Ejecuta: npm run dev\n');
}

main().catch(err => {
  console.error('❌ Error durante el setup:', err);
  process.exit(1);
});
