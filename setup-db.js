require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function setup() {
  const client = await pool.connect();

  try {
    console.log('Conectando a Supabase...');

    await client.query(`
      DROP TABLE IF EXISTS "AuditLog" CASCADE;
      DROP TABLE IF EXISTS "Movement" CASCADE;
      DROP TABLE IF EXISTS "Sale" CASCADE;
      DROP TABLE IF EXISTS "Roll" CASCADE;
      DROP TABLE IF EXISTS "ImportLot" CASCADE;
      DROP TABLE IF EXISTS "Product" CASCADE;
      DROP TABLE IF EXISTS "Category" CASCADE;
      DROP TABLE IF EXISTS "Client" CASCADE;
      DROP TABLE IF EXISTS "User" CASCADE;
    `);

    await client.query(`
      CREATE TABLE "User" (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('OWNER','ADMIN','WAREHOUSE')),
        active INTEGER NOT NULL DEFAULT 1,
        "createdAt" BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
        "updatedAt" BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
      );

      CREATE TABLE "Category" (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
      );

      CREATE TABLE "Product" (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        "categoryId" INTEGER NOT NULL REFERENCES "Category"(id),
        color TEXT NOT NULL,
        width INTEGER NOT NULL,
        "priceOwner" REAL NOT NULL,
        "priceB2B" REAL NOT NULL,
        "priceB2C" REAL NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        "createdAt" BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
        "updatedAt" BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
      );

      CREATE TABLE "ImportLot" (
        id SERIAL PRIMARY KEY,
        "lotNumber" TEXT UNIQUE NOT NULL,
        "importDate" TEXT NOT NULL,
        supplier TEXT NOT NULL DEFAULT 'China',
        notes TEXT,
        "createdAt" BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
      );

      CREATE TABLE "Roll" (
        id SERIAL PRIMARY KEY,
        "rollNumber" TEXT NOT NULL,
        barcode TEXT UNIQUE,
        "productId" INTEGER NOT NULL REFERENCES "Product"(id),
        "lotId" INTEGER NOT NULL REFERENCES "ImportLot"(id),
        "initialMeters" REAL NOT NULL,
        "currentMeters" REAL NOT NULL,
        location TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DEPLETED','DEFECTIVE','WRITTEN_OFF')),
        "isRemnant" INTEGER NOT NULL DEFAULT 0,
        "createdAt" BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
        "updatedAt" BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
      );

      CREATE TABLE "Client" (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('DISTRIBUTOR','DECORATOR')),
        phone TEXT,
        email TEXT,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        "createdAt" BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
      );

      CREATE TABLE "Sale" (
        id SERIAL PRIMARY KEY,
        "clientId" INTEGER NOT NULL REFERENCES "Client"(id),
        date TEXT NOT NULL,
        total REAL,
        "createdAt" BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
      );

      CREATE TABLE "Movement" (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('ENTRY','EXIT_FULL','EXIT_PARTIAL','ADJUSTMENT','WRITE_OFF')),
        "rollId" INTEGER NOT NULL REFERENCES "Roll"(id),
        meters REAL NOT NULL,
        "userId" INTEGER NOT NULL REFERENCES "User"(id),
        "saleId" INTEGER REFERENCES "Sale"(id),
        notes TEXT,
        "barcodeUsed" INTEGER NOT NULL DEFAULT 0,
        "createdAt" BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
      );

      CREATE TABLE "AuditLog" (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES "User"(id),
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        "entityId" INTEGER NOT NULL,
        "oldData" TEXT,
        "newData" TEXT,
        "createdAt" BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
      );
    `);
    console.log('✓ Tablas creadas');

    const ownerPwd = await bcrypt.hash('admin2026', 10);
    const williamPwd = await bcrypt.hash('william2026', 10);
    const adminPwd = await bcrypt.hash('admin2026', 10);
    const warehousePwd = await bcrypt.hash('bodega2026', 10);

    await client.query(`
      INSERT INTO "User" (email, password, name, role) VALUES
      ($1, $2, 'Samir Moya', 'OWNER'),
      ($3, $4, 'William López', 'OWNER'),
      ($5, $6, 'Ana García', 'ADMIN'),
      ($7, $8, 'Carlos Pérez', 'WAREHOUSE')
    `, [
      'samir@disa.co', ownerPwd,
      'william@disa.co', williamPwd,
      'admin@disa.co', adminPwd,
      'bodega@disa.co', warehousePwd,
    ]);
    console.log('✓ Usuarios creados');

    const catResult = await client.query(`
      INSERT INTO "Category" (name) VALUES ('Velo'), ('Blackout') RETURNING id, name
    `);
    const veloId = catResult.rows.find(r => r.name === 'Velo').id;
    const blackoutId = catResult.rows.find(r => r.name === 'Blackout').id;
    console.log('✓ Categorías creadas');

    const products = [
      ['VP-001','Velo Linen','Blanco',280,veloId,38000,45000,55000],
      ['VP-002','Velo Linen','Crema',280,veloId,38000,45000,55000],
      ['VP-003','Velo Linen','Blanco',300,veloId,40000,48000,58000],
      ['VP-004','Velo Sheer','Blanco',280,veloId,35000,42000,52000],
      ['VP-005','Velo Sheer','Gris',280,veloId,35000,42000,52000],
      ['VP-006','Velo Sheer','Blanco',300,veloId,37000,44000,54000],
      ['VP-007','Velo Organza','Blanco',280,veloId,42000,50000,62000],
      ['VP-008','Velo Organza','Dorado',280,veloId,44000,52000,64000],
      ['VP-009','Velo Visillo','Blanco',300,veloId,33000,40000,50000],
      ['VP-010','Velo Visillo','Crema',300,veloId,33000,40000,50000],
      ['VP-011','Velo Regal','Blanco',280,veloId,39000,46000,56000],
      ['VP-012','Velo Regal','Plateado',280,veloId,40000,47000,57000],
      ['VP-013','Velo Soft','Blanco',260,veloId,31000,38000,48000],
      ['VP-014','Velo Soft','Beige',260,veloId,31000,38000,48000],
      ['VP-015','Velo Classic','Blanco',280,veloId,34000,41000,51000],
      ['VP-016','Velo Classic','Crema',280,veloId,34000,41000,51000],
      ['VP-017','Velo Premium','Blanco',300,veloId,47000,55000,68000],
      ['BL-001','Blackout Standard','Blanco',280,blackoutId,55000,65000,78000],
      ['BL-002','Blackout Standard','Gris',280,blackoutId,55000,65000,78000],
      ['BL-003','Blackout Standard','Negro',280,blackoutId,55000,65000,78000],
      ['BL-004','Blackout Premium','Blanco',300,blackoutId,63000,75000,90000],
      ['BL-005','Blackout Premium','Gris Oscuro',300,blackoutId,63000,75000,90000],
      ['BL-006','Blackout Dimout','Blanco',280,blackoutId,49000,58000,72000],
      ['BL-007','Blackout Dimout','Beige',280,blackoutId,49000,58000,72000],
      ['BL-008','Blackout Total','Negro',300,blackoutId,72000,85000,102000],
    ];

    const productIds = {};
    for (const [code, name, color, width, catId, priceOwner, priceB2B, priceB2C] of products) {
      const r = await client.query(
        `INSERT INTO "Product" (name, code, "categoryId", color, width, "priceOwner", "priceB2B", "priceB2C")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [name, code, catId, color, width, priceOwner, priceB2B, priceB2C]
      );
      productIds[code] = r.rows[0].id;
    }
    console.log('✓ 25 productos creados');

    const lotResult = await client.query(`
      INSERT INTO "ImportLot" ("lotNumber", "importDate", supplier, notes) VALUES
      ('IMP-2024-001','2024-03-15','China','Primera importación 2024'),
      ('IMP-2024-002','2024-08-20','China','Segunda importación 2024'),
      ('IMP-2025-001','2025-02-10','China','Primera importación 2025')
      RETURNING id, "lotNumber"
    `);
    const lots = {};
    lotResult.rows.forEach(r => { lots[r.lotNumber] = r.id; });
    console.log('✓ 3 lotes creados');

    const rollData = [
      ['VP-001','IMP-2025-001',5,50,'A-01'],
      ['VP-002','IMP-2025-001',4,50,'A-02'],
      ['VP-003','IMP-2024-002',3,50,'A-03'],
      ['VP-004','IMP-2025-001',6,50,'A-04'],
      ['VP-005','IMP-2025-001',3,50,'A-05'],
      ['VP-006','IMP-2024-002',4,50,'A-06'],
      ['VP-007','IMP-2025-001',3,45,'B-01'],
      ['VP-008','IMP-2024-002',2,45,'B-02'],
      ['VP-009','IMP-2025-001',5,50,'B-03'],
      ['VP-010','IMP-2024-002',3,50,'B-04'],
      ['VP-011','IMP-2025-001',4,50,'B-05'],
      ['VP-012','IMP-2024-002',2,50,'B-06'],
      ['VP-013','IMP-2025-001',4,50,'C-01'],
      ['VP-014','IMP-2025-001',3,50,'C-02'],
      ['VP-015','IMP-2024-001',5,50,'C-03'],
      ['VP-016','IMP-2024-001',3,50,'C-04'],
      ['VP-017','IMP-2025-001',2,50,'C-05'],
      ['BL-001','IMP-2025-001',6,50,'D-01'],
      ['BL-002','IMP-2025-001',4,50,'D-02'],
      ['BL-003','IMP-2024-002',3,50,'D-03'],
      ['BL-004','IMP-2025-001',4,50,'D-04'],
      ['BL-005','IMP-2025-001',3,50,'D-05'],
      ['BL-006','IMP-2025-001',5,50,'E-01'],
      ['BL-007','IMP-2024-002',3,50,'E-02'],
      ['BL-008','IMP-2025-001',3,50,'E-03'],
    ];

    let rollIdx = 1;
    const rollIds = [];
    for (const [productCode, lotNumber, count, meters, location] of rollData) {
      for (let i = 1; i <= count; i++) {
        const rollNumber = 'R' + String(rollIdx).padStart(4, '0');
        const barcode = 'DISA-' + productCode + '-' + String(rollIdx).padStart(4, '0');
        const currentMeters = (i === 1 && rollIdx % 7 === 0) ? Math.round(meters * 0.6) : meters;
        const isRemnant = currentMeters <= 10 ? 1 : 0;
        const r = await client.query(
          `INSERT INTO "Roll" ("rollNumber", barcode, "productId", "lotId", "initialMeters", "currentMeters", location, "isRemnant")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [rollNumber, barcode, productIds[productCode], lots[lotNumber], meters, currentMeters, location, isRemnant]
        );
        rollIds.push({ id: r.rows[0].id, productCode });
        rollIdx++;
      }
    }
    console.log('✓ ' + (rollIdx - 1) + ' rollos creados');

    const clientResult = await client.query(`
      INSERT INTO "Client" (name, type, phone, email) VALUES
      ('Decoraciones Martínez','DECORATOR','3001234567','martinez@decoraciones.co'),
      ('Textiles del Norte SAS','DISTRIBUTOR','3109876543','compras@textilesnorte.co'),
      ('Interiores & Diseño','DECORATOR','3201112233','info@interiores.co'),
      ('Casa Bonita Ltda','DISTRIBUTOR','3154445566','pedidos@casabonita.co'),
      ('Ana Sofía Decoradora','DECORATOR','3007778899',NULL),
      ('Almacenes Hogar Plus','DISTRIBUTOR','3177654321','hogarplus@gmail.com')
      RETURNING id
    `);
    const clientIds = clientResult.rows.map(r => r.id);
    console.log('✓ 6 clientes creados');

    const userResult = await client.query(`SELECT id FROM "User" WHERE email = 'samir@disa.co'`);
    const userId = userResult.rows[0].id;
    const today = new Date().toISOString().split('T')[0];

    const saleResult = await client.query(
      `INSERT INTO "Sale" ("clientId", date, total) VALUES ($1,$2,$3) RETURNING id`,
      [clientIds[0], today, 135000]
    );
    await client.query(
      `INSERT INTO "Movement" (type, "rollId", meters, "userId", "saleId", notes) VALUES ($1,$2,$3,$4,$5,$6)`,
      ['EXIT_PARTIAL', rollIds[0].id, 3, userId, saleResult.rows[0].id, 'Venta de muestra']
    );

    const saleResult2 = await client.query(
      `INSERT INTO "Sale" ("clientId", date, total) VALUES ($1,$2,$3) RETURNING id`,
      [clientIds[1], today, 225000]
    );
    await client.query(
      `INSERT INTO "Movement" (type, "rollId", meters, "userId", "saleId", notes) VALUES ($1,$2,$3,$4,$5,$6)`,
      ['EXIT_PARTIAL', rollIds[5].id, 5, userId, saleResult2.rows[0].id, 'Venta de muestra']
    );
    console.log('✓ Movimientos de muestra creados');

    console.log('\n✅ Base de datos Supabase lista');
    console.log('================================');
    console.log('CREDENCIALES DE ACCESO:');
    console.log('  OWNER:     samir@disa.co / admin2026');
    console.log('  OWNER:     william@disa.co / william2026');
    console.log('  ADMIN:     admin@disa.co / admin2026');
    console.log('  WAREHOUSE: bodega@disa.co / bodega2026');

  } finally {
    client.release();
    await pool.end();
  }
}

setup().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
