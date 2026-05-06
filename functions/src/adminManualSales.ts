import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import {
  db,
  FieldValue,
  Timestamp,
  generateOrderRef,
  type Order,
  type OrderItem,
  type Customer,
  type InventoryItem,
} from "./lib/firestore";
import { requireAdmin } from "./lib/auth";
import { applyCors } from "./lib/cors";
import { getServerProduct } from "./lib/products";

interface ManualSaleBody {
  customer: Customer;
  items: Array<{ productId: string; qty: number }>;
  deliveryFee?: number;
  manualPaymentMethod: string;
  notes?: string;
}

function validateManualSale(
  body: Record<string, unknown>,
): { ok: true; data: ManualSaleBody } | { ok: false; error: string } {
  const { customer, items, manualPaymentMethod, deliveryFee } = body;

  if (!customer || typeof customer !== "object" || Array.isArray(customer)) {
    return { ok: false, error: "customer is required" };
  }
  const c = customer as Record<string, unknown>;
  for (const field of ["firstName", "lastName", "email", "phone", "addressLine1", "city", "province", "postalCode"]) {
    if (typeof c[field] !== "string" || !(c[field] as string).trim()) {
      return { ok: false, error: `customer.${field} is required` };
    }
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "items must be a non-empty array" };
  }
  for (const item of items) {
    if (!item.productId || typeof item.productId !== "string") {
      return { ok: false, error: "each item must have a productId" };
    }
    if (typeof item.qty !== "number" || !Number.isInteger(item.qty) || item.qty <= 0) {
      return { ok: false, error: "each item qty must be a positive integer" };
    }
  }

  if (typeof manualPaymentMethod !== "string" || !manualPaymentMethod.trim()) {
    return { ok: false, error: "manualPaymentMethod is required" };
  }

  if (deliveryFee !== undefined && (typeof deliveryFee !== "number" || deliveryFee < 0)) {
    return { ok: false, error: "deliveryFee must be a non-negative number" };
  }

  return {
    ok: true,
    data: body as unknown as ManualSaleBody,
  };
}

export async function handleManualSale(
  body: ManualSaleBody,
  uid: string,
): Promise<Order & { id: string }> {
  const orderItems: OrderItem[] = [];

  for (const { productId, qty } of body.items) {
    const product = getServerProduct(productId);
    if (!product) throw Object.assign(new Error(`Unknown productId: ${productId}`), { status: 400 });
    orderItems.push({
      productId,
      name: product.name,
      qty,
      unitPrice: product.price,
      lineTotal: product.price * qty,
    });
  }

  const subtotal = orderItems.reduce((s, i) => s + i.lineTotal, 0);
  const deliveryFee = body.deliveryFee ?? 0;
  const total = subtotal + deliveryFee;
  const ref = await generateOrderRef();

  const order: Order = {
    ref,
    status: "paid",
    source: "manual",
    manualPaymentMethod: body.manualPaymentMethod.trim(),
    inventoryApplied: true,
    items: orderItems,
    subtotal,
    shipping: deliveryFee,
    total,
    customer: body.customer,
    yoco: { checkoutId: `manual-${uid}-${Date.now()}` },
    createdAt: Timestamp.now(),
    paidAt: Timestamp.now(),
  };

  const orderRef = db.collection("orders").doc();

  await db.runTransaction(async (tx) => {
    // Decrement inventory for each item
    const invRefs = orderItems.map((item) =>
      db.collection("inventory").doc(item.productId),
    );
    const invSnaps = await Promise.all(invRefs.map((r) => tx.get(r)));

    for (let i = 0; i < orderItems.length; i++) {
      const item = orderItems[i];
      const snap = invSnaps[i];
      if (snap.exists) {
        const inv = snap.data() as InventoryItem;
        const newUnitsSold = (inv.unitsSold ?? 0) + item.qty;
        tx.update(invRefs[i], {
          unitsSold: newUnitsSold,
          currentStock: (inv.openingStock ?? 0) - newUnitsSold,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        tx.set(invRefs[i], {
          productId: item.productId,
          openingStock: 0,
          unitsSold: item.qty,
          currentStock: -item.qty,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    tx.set(orderRef, order);
  });

  logger.info("adminManualSales created", { uid, orderId: orderRef.id, ref });
  return { ...order, id: orderRef.id };
}

export const adminManualSales = onRequest(
  { region: "us-central1", cors: false, invoker: "public" },
  async (req, res) => {
    applyCors(req, res, "POST");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method Not Allowed" }); return; }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const validated = validateManualSale(body);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    try {
      const result = await handleManualSale(validated.data, auth.uid);
      res.status(201).json(result);
    } catch (err) {
      const e = err as { status?: number; message?: string };
      if (e.status === 400) {
        res.status(400).json({ error: e.message });
        return;
      }
      logger.error("adminManualSales error", { err: String(err) });
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    }
  },
);
