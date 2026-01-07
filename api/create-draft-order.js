// api/create-draft-order.js
const axios = require("axios");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://printmaketrim.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "No items provided" });

    const shopifyDomain = `${process.env.SHOPIFY_STORE_NAME}.myshopify.com`;

    const lineItems = items.map(i => {
      // Normal product variant line
      if (!i.isCustom) {
        const li = {
          variantId: `gid://shopify/ProductVariant/${i.variantId}`,
          quantity: parseInt(i.quantity, 10)
        };

        // Add priceOverride when price is provided (for per-meter products and custom pricing)
        if (i.price !== null && i.price !== undefined && i.price > 0) {
          li.priceOverride = {
            amount: parseFloat(i.price).toFixed(2), 
            currencyCode: process.env.SHOPIFY_CURRENCY || "PKR"
          };
        }
        return li;
      }

      // Custom item (no Shopify variantId)
      return {
        title: i.displayTitle || `Custom item`,
        quantity: parseInt(i.quantity, 10),
        originalUnitPriceWithCurrency: {
          amount: parseFloat(i.price || 0).toFixed(2),
          currencyCode: process.env.SHOPIFY_CURRENCY || "PKR"
        }
      };
    });

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
        acceptAutomaticDiscounts: true
      }
    };

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

    console.log("Full Shopify GraphQL response:", JSON.stringify(graphqlResp.data, null, 2));

    if (graphqlResp.data.errors) {
      return res.status(400).json({ error: "Shopify GraphQL errors", details: graphqlResp.data.errors });
    }

    const result = graphqlResp.data.data?.draftOrderCreate;
    if (!result) {
      return res.status(500).json({ error: "Missing draftOrderCreate result" });
    }

    if (result.userErrors && result.userErrors.length > 0) {
      return res.status(400).json({ errors: result.userErrors });
    }

    const draftOrder = result.draftOrder;

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