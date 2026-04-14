import { onRequest } from "firebase-functions/v2/https";
import { db, type Order } from "./lib/firestore";

const ALLOWED_ORIGINS = [
  "https://drumsareme.co.za",
  "https://www.drumsareme.co.za",
  "https://drumsareme-website.web.app",
  "http://localhost:3000",
];

export const getOrder = onRequest(
  { region: "us-central1" },
  async (req, res) => {
    const origin = req.get("origin") ?? "";
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "GET") {
      res.status(405).send("Method Not Allowed");
      return;
    }
    const parts = req.path.split("/").filter(Boolean);
    const orderId = parts[parts.length - 1];
    if (!orderId) {
      res.status(400).json({ error: "Missing orderId" });
      return;
    }
    const snap = await db.collection("orders").doc(orderId).get();
    if (!snap.exists) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const order = snap.data() as Order;
    res.status(200).json({
      id: snap.id,
      ref: order.ref,
      status: order.status,
      total: order.total,
      items: order.items.map((i) => ({ name: i.name, qty: i.qty, lineTotal: i.lineTotal })),
    });
  },
);
