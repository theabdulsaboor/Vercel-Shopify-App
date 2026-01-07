// api/create-draft-order.js
const axios = require("axios");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://printmaketrim.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Parse request body
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { variantId, quantity, productTitle } = body || {};

    if (!variantId || !quantity) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["variantId", "quantity"],
      });
    }

    // Always use env store name
    const shopifyDomain = `${process.env.SHOPIFY_STORE_NAME}.myshopify.com`;
    console.log("➡️ Using Shopify domain:", shopifyDomain);

    // STEP 1: Fetch variant
    console.log("➡️ Fetching variant:", variantId);
    const variantResponse = await axios.get(
      `https://${shopifyDomain}/admin/api/2025-04/variants/${variantId}.json`,
      {
        headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN },
      }
    );
    const variant = variantResponse.data.variant;
    if (!variant) {
      return res.status(404).json({ error: "Variant not found" });
    }

    const basePrice = parseFloat(variant.price);
    if (isNaN(basePrice)) {
      return res.status(500).json({ error: "Invalid variant price" });
    }
    const totalPrice = basePrice * quantity;

    // STEP 2: Fetch product title if not provided
    let finalTitle = productTitle;
    if (!productTitle) {
      console.log("➡️ Fetching product:", variant.product_id);
      const productResponse = await axios.get(
        `https://${shopifyDomain}/admin/api/2025-04/products/${variant.product_id}.json`,
        {
          headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN },
        }
      );
      finalTitle = productResponse.data.product.title || "Custom Product";
    }

    // STEP 3: Create display title
    const displayTitle =
      variant.title === "Default Title"
        ? finalTitle
        : `${finalTitle} - ${variant.title}`;

    console.log("➡️ Creating draft order with:", {
      title: `${displayTitle} (Custom Quantity)`,
      price: totalPrice.toFixed(2),
      quantity: 1,
    });

    // STEP 4: Create draft order with custom price
    const payload = {
      draft_order: {
        line_items: [
          {
            title: `${displayTitle} (Custom Quantity)`,
            price: totalPrice.toFixed(2),
            quantity: 1,
            custom: true,
          },
        ],
        taxes_included: false,
        note: `Custom order with quantity ${quantity}`,
      },
    };

    const draftOrderResponse = await axios.post(
      `https://${shopifyDomain}/admin/api/2025-04/draft_orders.json`,
      payload,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const draftOrder = draftOrderResponse.data.draft_order;
    res.status(200).json({
      draftOrderId: draftOrder.id,
      invoiceUrl: draftOrder.invoice_url,
    });
  } catch (error) {
    console.error(
      "❌ Error creating draft order:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      error: "Failed to create draft order",
      details: error.response?.data || error.message,
    });
  }
};