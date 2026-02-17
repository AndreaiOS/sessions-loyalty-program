import test from "node:test";
import assert from "node:assert/strict";

const requiredStringFields = [
  "order_id",
  "venue_id",
  "device_id",
  "currency",
  "payment_status",
  "paid_at",
  "created_at",
  "updated_at",
];

function validateOrderPayload(payload) {
  for (const field of requiredStringFields) {
    if (typeof payload[field] !== "string" || payload[field].length === 0) {
      throw new Error(`invalid_${field}`);
    }
  }

  if (!Number.isFinite(payload.order_total_minor)) {
    throw new Error("invalid_order_total_minor");
  }

  if (!Array.isArray(payload.line_items)) {
    throw new Error("invalid_line_items");
  }
}

test("accepts a valid paid order payload", () => {
  const payload = {
    order_id: "ord_123",
    venue_id: "venue_abc",
    device_id: "kiosk_01",
    order_total_minor: 2599,
    currency: "GBP",
    line_items: [{ sku: "sku_1", quantity: 1, total_minor: 2599 }],
    payment_status: "paid",
    paid_at: "2026-02-17T09:30:00.000Z",
    created_at: "2026-02-17T09:28:00.000Z",
    updated_at: "2026-02-17T09:30:00.000Z",
  };

  assert.doesNotThrow(() => validateOrderPayload(payload));
});

test("rejects payload missing required fields", () => {
  const payload = {
    order_id: "ord_123",
    venue_id: "venue_abc",
    order_total_minor: 2599,
    currency: "GBP",
    line_items: [],
    payment_status: "paid",
    paid_at: "2026-02-17T09:30:00.000Z",
    created_at: "2026-02-17T09:28:00.000Z",
    updated_at: "2026-02-17T09:30:00.000Z",
  };

  assert.throws(() => validateOrderPayload(payload), /invalid_device_id/);
});
