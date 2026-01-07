// api/create-draft-order.js
const axios = require("axios");

module.exports = async (req, res) => {
  // Allow your storefront’s domain — change if different
  res.setHeader("Access-Control-Allow-Origin", "https://printmaketrim.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    // Parse body (handle string or JSON)
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { items } = body;

    // Validate items array
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "No items provided" });

    // Shopify domain
    const shopifyDomain = `${process.env.SHOPIFY_STORE_NAME}.myshopify.com`;

    // Build lineItems for Shopify's DraftOrderCreate mutation
    const lineItems = items.map(i => {
      // Regular item with variant
      if (!i.isCustom) {
        const li = {
          variantId: `gid://shopify/ProductVariant/${i.variantId}`,
          quantity: parseInt(i.quantity, 10)
        };
        // Use priceOverride if price provided (Shopify expects MoneyInput here) :contentReference[oaicite:0]{index=0}
        if (i.price !== null && i.price !== undefined) {
          li.priceOverride = {
            amount: i.price.toFixed(2),
            currencyCode: process.env.SHOPIFY_CURRENCY || "USD"
          };
        }
        return li;
      }

      // Custom item (no variantId)
      return {
        title: i.displayTitle,
        quantity: parseInt(i.quantity, 10),
        custom: true,
        price: i.price.toFixed(2)
      };
    });

    // GraphQL mutation
    const query = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            invoiceUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        lineItems,
        // Optional: apply automatic discounts if available in the store :contentReference[oaicite:1]{index=1}
        acceptAutomaticDiscounts: true
      }
    };

    // Call Shopify GraphQL Admin API
    const graphqlResp = await axios.post(
      `https://${shopifyDomain}/admin/api/2025-10/graphql.json`,
      { query, variables },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN
        }
      }
    );
// Log full Shopify response for debugging
console.log("Full Shopify GraphQL response:", JSON.stringify(graphqlResp.data, null, 2));

// If there are errors at the top level, return them
if (graphqlResp.data.errors) {
  console.error("Shopify GraphQL errors:", graphqlResp.data.errors);
  return res.status(400).json({ error: "Shopify GraphQL errors", details: graphqlResp.data.errors });
}

const result = graphqlResp.data.data?.draftOrderCreate;
if (!result) {
  console.error("Missing draftOrderCreate in Shopify response");
  return res.status(500).json({ error: "Missing draftOrderCreate result from Shopify" });
}


    if (result.userErrors && result.userErrors.length > 0) {
      // Return any userErrors back to client
      return res.status(400).json({ errors: result.userErrors });
    }

    const draftOrder = result.draftOrder;

    // Send success back to frontend
    return res.status(200).json({
      draftOrderId: draftOrder.id,
      invoiceUrl: draftOrder.invoiceUrl
    });
  } catch (error) {
    console.error("Error creating draft order:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Server error",
      details: error.response?.data || error.message
    });
  }
};