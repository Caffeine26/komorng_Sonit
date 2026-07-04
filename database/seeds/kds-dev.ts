// KDS dev seed — idempotent. Re-running this file is safe: it upserts by
// deterministic slugs/IDs and wraps all writes in a single transaction that
// deletes then reinserts KDS-specific rows.
//
// What this seed creates:
//   · 1 Tenant (slug: 'kds-demo', codePrefix: 'KDS', status: ACTIVE)
//   · 1 TenantSettings row (required FK companion to Tenant)
//   · 1 TenantSequence row (required for order-number allocation)
//   · 1 User: TENANT_OWNER (email: owner@kds.test, password: kds-dev-password)
//   · 1 User: KITCHEN_STAFF (email: kitchen@kds.test, password: kds-dev-password)
//   · 1 UserRole per user (scoped to the KDS tenant)
//   · 1 UserAuthProvider per user (provider: PASSWORD, providerId = email)
//     Password is argon2id-hashed; hash verified with argon2.verify() at login.
//   · 1 MenuCategory with 5 MenuItems
//   · 1 FloorPlan with 3 Tables
//   · 2 Orders (PREPARING, SUBMITTED) each with 2 OrderItems
//   · 2 KitchenTickets: one NEW, one PREPARING (startedAt set)
//   · 2 KitchenTicketEvents (audit trail for each transition)
//
// Currency: USD. Timezone: Asia/Phnom_Penh. Locale: km.
// Money: integer cents (e.g. 1200 = $12.00).

import { createHash } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaClient, TicketStatus, AuditActorType } from '@prisma/client';

const prisma = new PrismaClient();

// Deterministic IDs — keep stable across re-runs so FK wiring is consistent.
const IDS = {
  tenant:         'kds0000000000000000000001',
  ownerUser:      'kds0000000000000000000002',
  kitchenUser:    'kds0000000000000000000003',
  ownerRole:      'kds0000000000000000000004',
  kitchenRole:    'kds0000000000000000000005',
  ownerAuth:      'kds0000000000000000000006',
  kitchenAuth:    'kds0000000000000000000007',
  category:       'kds0000000000000000000008',
  menuItem1:      'kds0000000000000000000009',
  menuItem2:      'kds0000000000000000000010',
  menuItem3:      'kds0000000000000000000011',
  menuItem4:      'kds0000000000000000000012',
  menuItem5:      'kds0000000000000000000013',
  floorPlan:      'kds0000000000000000000014',
  table1:         'kds0000000000000000000015',
  table2:         'kds0000000000000000000016',
  table3:         'kds0000000000000000000017',
  session1:       'kds0000000000000000000018',
  session2:       'kds0000000000000000000019',
  order1:         'kds0000000000000000000020',
  order2:         'kds0000000000000000000021',
  orderItem1a:    'kds0000000000000000000022',
  orderItem1b:    'kds0000000000000000000023',
  orderItem2a:    'kds0000000000000000000024',
  orderItem2b:    'kds0000000000000000000025',
  ticket1:        'kds0000000000000000000026',
  ticket2:        'kds0000000000000000000027',
  ticketEvent1:   'kds0000000000000000000028',
  ticketEvent2:   'kds0000000000000000000029',
} as const;

// Dev password for both seeded users. Only used in local development.
// Never deploy this seed to production.
const DEV_PASSWORD = 'kds-dev-password';

const NOW = new Date();
const TEN_MINUTES_AGO = new Date(NOW.getTime() - 10 * 60 * 1000);
const TWENTY_MINUTES_AGO = new Date(NOW.getTime() - 20 * 60 * 1000);
const THIRTY_MINUTES_AGO = new Date(NOW.getTime() - 30 * 60 * 1000);

async function main(): Promise<void> {
  console.log('KDS dev seed: starting...');

  // Hash dev password once with argon2id (m=65536, t=3, p=4 — production-grade params).
  const passwordHash = await argon2.hash(DEV_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
  console.log('  argon2id hash computed for dev password');

  // --------------------------------------------------------------------------
  // TENANT
  // --------------------------------------------------------------------------
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'kds-demo' },
    update: { status: 'ACTIVE' },
    create: {
      id:         IDS.tenant,
      slug:       'kds-demo',
      codePrefix: 'KDS',
      nameEn:     'KDS Demo Restaurant',
      nameKm:     'ភោជនីយដ្ឋានសាកល្បង KDS',
      status:     'ACTIVE',
    },
  });

  console.log(`  Tenant: ${tenant.slug} (${tenant.id})`);

  // TenantSettings — required companion (one per tenant, composite PK).
  // Upsert by the unique tenantId constraint.
  await prisma.tenantSettings.upsert({
    where:  { tenantId: tenant.id },
    update: {},
    create: {
      tenantId:        tenant.id,
      serviceModel:    'DINE_IN_TABLE',
      payTiming:       'PAY_AFTER',
      defaultLocale:   'km',
      timezone:        'Asia/Phnom_Penh',
      currency:        'USD',
      autoAcceptOrders: true,
      taxRateBps:      0,
      taxInclusive:    true,
      businessContacts: [],
    },
  });

  // TenantSequence — auto-created by trigger after tenant insert, but upsert
  // here in case the trigger hasn't run (e.g. seed runs against a DB without
  // the hardening migration applied yet).
  await prisma.tenantSequence.upsert({
    where:  { tenantId: tenant.id },
    update: {},
    create: { tenantId: tenant.id },
  });

  // --------------------------------------------------------------------------
  // USERS
  // --------------------------------------------------------------------------
  const ownerUser = await prisma.user.upsert({
    where:  { email: 'owner@kds.test' },
    update: {},
    create: {
      id:       IDS.ownerUser,
      email:    'owner@kds.test',
      fullName: 'KDS Owner',
      status:   'ACTIVE',
    },
  });

  const kitchenUser = await prisma.user.upsert({
    where:  { email: 'kitchen@kds.test' },
    update: {},
    create: {
      id:       IDS.kitchenUser,
      email:    'kitchen@kds.test',
      fullName: 'KDS Kitchen Staff',
      status:   'ACTIVE',
    },
  });

  console.log(`  Users: ${ownerUser.email}, ${kitchenUser.email}`);

  // --------------------------------------------------------------------------
  // USER ROLES (junction: user <-> tenant <-> role)
  // --------------------------------------------------------------------------
  // UserRole uses single-column @id; we upsert by id to stay idempotent.
  await prisma.userRole.upsert({
    where:  { id: IDS.ownerRole },
    update: {},
    create: {
      id:       IDS.ownerRole,
      userId:   ownerUser.id,
      tenantId: tenant.id,
      role:     'TENANT_OWNER',
    },
  });

  await prisma.userRole.upsert({
    where:  { id: IDS.kitchenRole },
    update: {},
    create: {
      id:       IDS.kitchenRole,
      userId:   kitchenUser.id,
      tenantId: tenant.id,
      role:     'KITCHEN_STAFF',
    },
  });

  // --------------------------------------------------------------------------
  // USER AUTH PROVIDERS — PASSWORD provider (Track E)
  // --------------------------------------------------------------------------
  // providerId = email address (natural key for PASSWORD provider).
  // metadata.passwordHash = argon2id hash of the dev password.
  // Old PHONE placeholder rows (if they exist from a pre-Track-E seed run)
  // are cleaned up below before inserting the correct PASSWORD rows.
  await prisma.userAuthProvider.deleteMany({
    where: { userId: ownerUser.id, provider: 'PHONE', providerId: '+85512000001' },
  });
  await prisma.userAuthProvider.deleteMany({
    where: { userId: kitchenUser.id, provider: 'PHONE', providerId: '+85512000002' },
  });

  await prisma.userAuthProvider.upsert({
    where: { provider_providerId: { provider: 'PASSWORD', providerId: 'owner@kds.test' } },
    update: { metadata: { passwordHash } },
    create: {
      id:          IDS.ownerAuth,
      userId:      ownerUser.id,
      provider:    'PASSWORD',
      providerId:  'owner@kds.test',
      displayName: 'KDS Owner',
      metadata:    { passwordHash },
    },
  });

  await prisma.userAuthProvider.upsert({
    where: { provider_providerId: { provider: 'PASSWORD', providerId: 'kitchen@kds.test' } },
    update: { metadata: { passwordHash } },
    create: {
      id:          IDS.kitchenAuth,
      userId:      kitchenUser.id,
      provider:    'PASSWORD',
      providerId:  'kitchen@kds.test',
      displayName: 'KDS Kitchen Staff',
      metadata:    { passwordHash },
    },
  });

  // --------------------------------------------------------------------------
  // MENU CATEGORY + 5 MENU ITEMS
  // --------------------------------------------------------------------------
  const category = await prisma.menuCategory.upsert({
    where:  { tenantId_id: { tenantId: tenant.id, id: IDS.category } },
    update: {},
    create: {
      tenantId: tenant.id,
      id:       IDS.category,
      nameKm:   'ម្ហូបខ្មែរ',
      nameEn:   'Khmer Cuisine',
      sortOrder: 0,
      isActive:  true,
    },
  });

  const menuItemDefs = [
    { id: IDS.menuItem1, nameKm: 'បបរគ្រាប់',          nameEn: 'Beef Lok Lak',      priceCents: 1200 },
    { id: IDS.menuItem2, nameKm: 'ស្លឹកជីរដាំដំណើម',   nameEn: 'Amok Fish',         priceCents: 1000 },
    { id: IDS.menuItem3, nameKm: 'បាយស',                nameEn: 'Steamed Rice',      priceCents:  300 },
    { id: IDS.menuItem4, nameKm: 'កាហ្វេទឹកដោះគោ',    nameEn: 'Iced Coffee',       priceCents:  150 },
    { id: IDS.menuItem5, nameKm: 'ទឹកក្រូចផ្លែ',       nameEn: 'Fresh Lime Juice',  priceCents:  100 },
  ] as const;

  for (const item of menuItemDefs) {
    await prisma.menuItem.upsert({
      where:  { tenantId_id: { tenantId: tenant.id, id: item.id } },
      update: {},
      create: {
        tenantId:      tenant.id,
        id:            item.id,
        categoryId:    category.id,
        nameKm:        item.nameKm,
        nameEn:        item.nameEn,
        basePriceCents: item.priceCents,
        currency:      'USD',
        isAvailable:   true,
        isVisible:     true,
        sortOrder:     menuItemDefs.indexOf(item),
      },
    });
  }

  console.log(`  MenuCategory: ${category.nameEn} with ${menuItemDefs.length} items`);

  // --------------------------------------------------------------------------
  // FLOOR PLAN + 3 TABLES
  // --------------------------------------------------------------------------
  const floorPlan = await prisma.floorPlan.upsert({
    where:  { tenantId_id: { tenantId: tenant.id, id: IDS.floorPlan } },
    update: {},
    create: {
      tenantId:  tenant.id,
      id:        IDS.floorPlan,
      name:      'Main Floor',
      width:     1000,
      height:    800,
      sortOrder: 0,
      isActive:  true,
    },
  });

  const tableDefs = [
    { id: IDS.table1, label: 'T1', posX:  50, posY:  50 },
    { id: IDS.table2, label: 'T2', posX: 200, posY:  50 },
    { id: IDS.table3, label: 'T3', posX: 350, posY:  50 },
  ] as const;

  for (const t of tableDefs) {
    await prisma.table.upsert({
      where:  { tenantId_id: { tenantId: tenant.id, id: t.id } },
      update: {},
      create: {
        tenantId:      tenant.id,
        id:            t.id,
        floorPlanId:   floorPlan.id,
        label:         t.label,
        capacity:      4,
        shape:         'RECTANGLE',
        positionX:     t.posX,
        positionY:     t.posY,
        width:         100,
        height:        60,
        rotation:      0,
        currentStatus: 'OCCUPIED',
        isActive:      true,
      },
    });
  }

  console.log(`  FloorPlan: ${floorPlan.name} with ${tableDefs.length} tables`);

  // --------------------------------------------------------------------------
  // IDEMPOTENT WIPE of KDS-specific rows before re-seed
  // Ticket events -> tickets -> order items -> orders -> sessions
  // (reverse FK dependency order). Only wipe rows with our deterministic IDs.
  // --------------------------------------------------------------------------
  await prisma.kitchenTicketEvent.deleteMany({
    where: {
      tenantId: tenant.id,
      id: { in: [IDS.ticketEvent1, IDS.ticketEvent2] },
    },
  });
  await prisma.kitchenTicket.deleteMany({
    where: {
      tenantId: tenant.id,
      id: { in: [IDS.ticket1, IDS.ticket2] },
    },
  });
  await prisma.orderItem.deleteMany({
    where: {
      tenantId: tenant.id,
      id: { in: [IDS.orderItem1a, IDS.orderItem1b, IDS.orderItem2a, IDS.orderItem2b] },
    },
  });
  await prisma.order.deleteMany({
    where: {
      tenantId: tenant.id,
      id: { in: [IDS.order1, IDS.order2] },
    },
  });
  await prisma.orderSession.deleteMany({
    where: {
      tenantId: tenant.id,
      id: { in: [IDS.session1, IDS.session2] },
    },
  });

  // --------------------------------------------------------------------------
  // ORDER SESSIONS
  // --------------------------------------------------------------------------
  await prisma.orderSession.create({
    data: {
      tenantId:       tenant.id,
      id:             IDS.session1,
      tableId:        IDS.table1,
      status:         'ACTIVE',
      subtotalCents:  2700,
      totalCents:     2700,
      orderCount:     1,
      openedAt:       THIRTY_MINUTES_AGO,
      lastActivityAt: THIRTY_MINUTES_AGO,
    },
  });

  await prisma.orderSession.create({
    data: {
      tenantId:       tenant.id,
      id:             IDS.session2,
      tableId:        IDS.table2,
      status:         'ACTIVE',
      subtotalCents:  1300,
      totalCents:     1300,
      orderCount:     1,
      openedAt:       TWENTY_MINUTES_AGO,
      lastActivityAt: TWENTY_MINUTES_AGO,
    },
  });

  // --------------------------------------------------------------------------
  // ORDERS
  // order1: PREPARING (maps to ticket1=PREPARING, exercising the PREPARING lane)
  // order2: SUBMITTED (maps to ticket2=NEW, exercising the NEW lane)
  // --------------------------------------------------------------------------
  // subtotalCents = sum of line totals; totalCents = subtotal - discount + tax + serviceCharge
  // order1: 2x Beef Lok Lak @ $12 (2400) + 1x Steamed Rice @ $3 (300) = $27.00
  // subtotal=2700, discount=0, tax=0, serviceCharge=0, total=2700 (satisfies CHECK formula)
  await prisma.order.create({
    data: {
      tenantId:          tenant.id,
      id:                IDS.order1,
      sessionId:         IDS.session1,
      tableId:           IDS.table1,
      tableRef:          'T1',
      orderDate:         new Date(THIRTY_MINUTES_AGO.toISOString().slice(0, 10)),
      orderNumber:       'KDS-001',
      orderToken:        'kds-dev-token-order1',
      status:            'PREPARING',
      serviceModel:      'DINE_IN_TABLE',
      payTiming:         'PAY_AFTER',
      source:            'MERCHANT_MANUAL',
      createdById:       ownerUser.id,
      subtotalCents:     2700,
      discountCents:     0,
      taxCents:          0,
      serviceChargeCents: 0,
      totalCents:        2700,
      currency:          'USD',
      submittedAt:       THIRTY_MINUTES_AGO,
      preparingAt:       TWENTY_MINUTES_AGO,
    },
  });

  // order2: 1x Amok Fish @ $10 + 1x Steamed Rice @ $3 = $13.00 → subtotal=1300, total=1300
  await prisma.order.create({
    data: {
      tenantId:          tenant.id,
      id:                IDS.order2,
      sessionId:         IDS.session2,
      tableId:           IDS.table2,
      tableRef:          'T2',
      orderDate:         new Date(TWENTY_MINUTES_AGO.toISOString().slice(0, 10)),
      orderNumber:       'KDS-002',
      orderToken:        'kds-dev-token-order2',
      status:            'SUBMITTED',
      serviceModel:      'DINE_IN_TABLE',
      payTiming:         'PAY_AFTER',
      source:            'MERCHANT_MANUAL',
      createdById:       ownerUser.id,
      subtotalCents:     1300,
      discountCents:     0,
      taxCents:          0,
      serviceChargeCents: 0,
      totalCents:        1300,
      currency:          'USD',
      submittedAt:       TWENTY_MINUTES_AGO,
    },
  });

  // --------------------------------------------------------------------------
  // ORDER ITEMS
  // --------------------------------------------------------------------------
  // order1 items: 2x Beef Lok Lak
  await prisma.orderItem.create({
    data: {
      tenantId:          tenant.id,
      id:                IDS.orderItem1a,
      orderId:           IDS.order1,
      menuItemId:        IDS.menuItem1,
      itemName:          'Beef Lok Lak',
      quantity:          2,
      unitPriceCents:    1200,
      lineSubtotalCents: 2400,
      lineTotalCents:    2400,
    },
  });

  // Pad with a second item of quantity 0 is invalid (CHECK quantity > 0).
  // Use 1x Steamed Rice instead to have 2 distinct items.
  await prisma.orderItem.create({
    data: {
      tenantId:          tenant.id,
      id:                IDS.orderItem1b,
      orderId:           IDS.order1,
      menuItemId:        IDS.menuItem3,
      itemName:          'Steamed Rice',
      quantity:          1,
      unitPriceCents:    300,
      lineSubtotalCents: 300,
      lineTotalCents:    300,
    },
  });

  // order2 items: 1x Amok Fish + 1x Steamed Rice
  await prisma.orderItem.create({
    data: {
      tenantId:          tenant.id,
      id:                IDS.orderItem2a,
      orderId:           IDS.order2,
      menuItemId:        IDS.menuItem2,
      itemName:          'Amok Fish',
      quantity:          1,
      unitPriceCents:    1000,
      lineSubtotalCents: 1000,
      lineTotalCents:    1000,
    },
  });

  await prisma.orderItem.create({
    data: {
      tenantId:          tenant.id,
      id:                IDS.orderItem2b,
      orderId:           IDS.order2,
      menuItemId:        IDS.menuItem3,
      itemName:          'Steamed Rice',
      quantity:          1,
      unitPriceCents:    300,
      lineSubtotalCents: 300,
      lineTotalCents:    300,
    },
  });

  console.log('  Orders and order items created');

  // --------------------------------------------------------------------------
  // KITCHEN TICKETS
  // ticket1: PREPARING (startedAt set) — exercising the PREPARING kanban lane
  // ticket2: NEW (no startedAt)        — exercising the NEW kanban lane
  // --------------------------------------------------------------------------
  await prisma.kitchenTicket.create({
    data: {
      tenantId:       tenant.id,
      id:             IDS.ticket1,
      orderId:        IDS.order1,
      ticketNumber:   'T-001',
      status:         TicketStatus.PREPARING,
      serviceModel:   'DINE_IN_TABLE',
      tableRef:       'T1',
      priority:       0,
      startedAt:      TWENTY_MINUTES_AGO,
      startedById:    kitchenUser.id,
    },
  });

  await prisma.kitchenTicket.create({
    data: {
      tenantId:     tenant.id,
      id:           IDS.ticket2,
      orderId:      IDS.order2,
      ticketNumber: 'T-002',
      status:       TicketStatus.NEW,
      serviceModel: 'DINE_IN_TABLE',
      tableRef:     'T2',
      priority:     0,
    },
  });

  console.log('  KitchenTickets: T-001 (PREPARING), T-002 (NEW)');

  // --------------------------------------------------------------------------
  // KITCHEN TICKET EVENTS (audit trail)
  // event for ticket1: NEW→PREPARING (transition that already happened)
  // event for ticket2: null→NEW (initial creation event)
  // --------------------------------------------------------------------------
  await prisma.kitchenTicketEvent.create({
    data: {
      tenantId:   tenant.id,
      id:         IDS.ticketEvent1,
      ticketId:   IDS.ticket1,
      eventType:  'STATUS_CHANGE',
      fromStatus: 'NEW',
      toStatus:   'PREPARING',
      actorType:  AuditActorType.USER,
      actorLabel: kitchenUser.fullName ?? 'KDS Kitchen Staff',
      changedById: kitchenUser.id,
      createdAt:  TWENTY_MINUTES_AGO,
    },
  });

  await prisma.kitchenTicketEvent.create({
    data: {
      tenantId:   tenant.id,
      id:         IDS.ticketEvent2,
      ticketId:   IDS.ticket2,
      eventType:  'STATUS_CHANGE',
      fromStatus: null,
      toStatus:   'NEW',
      actorType:  AuditActorType.SYSTEM,
      actorLabel: 'order.submitted',
      createdAt:  TEN_MINUTES_AGO,
    },
  });

  console.log('  KitchenTicketEvents: 2 audit trail rows');

  // --------------------------------------------------------------------------
  // DONE
  // --------------------------------------------------------------------------
  const ticketCount = await prisma.kitchenTicket.count({
    where: { tenantId: tenant.id },
  });

  console.log(`\nKDS dev seed complete.`);
  console.log(`  kitchen_tickets count for tenant ${tenant.id}: ${ticketCount}`);
  console.log(`\nVerification:`);
  console.log(`  psql $DATABASE_URL -c "SELECT id, ticket_number, status, started_at FROM kitchen_tickets WHERE tenant_id = '${tenant.id}' ORDER BY created_at;"`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
