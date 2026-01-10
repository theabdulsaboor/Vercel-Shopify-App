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
      // Log each item for debugging
      console.log("Processing item:", JSON.stringify(i, null, 2));
      
      // Normal product variant line
      if (!i.isCustom) {
        const li = {
          variantId: `gid://shopify/ProductVariant/${i.variantId}`,
          quantity: parseInt(i.quantity, 10)
        };

        // ADD: Convert properties to customAttributes format
      if (i.properties && Object.keys(i.properties).length > 0) {
        li.customAttributes = Object.entries(i.properties)
          .filter(([key, value]) => value !== null && value !== undefined && value !== '')
          .map(([key, value]) => ({
            key: key,
            value: String(value)
          }));
      }

        // Only add priceOverride for per-meter products (when price is explicitly provided and > 0)
        // Normal products should NOT have priceOverride - Shopify will use variant's default price
        // Only add priceOverride if:
        // 1. price property exists AND
        // 2. price is not null/undefined AND  
        // 3. price is a valid number AND
        // 4. price is greater than 0
        const priceValue = i.price;
        const hasValidPrice = typeof priceValue !== 'undefined' &&
                              priceValue !== null &&
                              priceValue !== '' &&
                              !isNaN(parseFloat(priceValue)) && 
                              parseFloat(priceValue) > 0;
        
        console.log("Item variantId:", i.variantId, "hasValidPrice:", hasValidPrice, "price value:", priceValue, "hasOwnProperty:", i.hasOwnProperty('price'));
        
        if (hasValidPrice) {
          li.priceOverride = {
            amount: parseFloat(priceValue).toFixed(2), 
            currencyCode: process.env.SHOPIFY_CURRENCY || "PKR"
          };
          console.log("Added priceOverride:", li.priceOverride);
        } else {
          console.log("No priceOverride - using variant's default price (priceValue:", priceValue, ")");
          // Explicitly do NOT add priceOverride - Shopify will use variant's default price
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

      if (i.properties && Object.keys(i.properties).length > 0) {
        customItem.customAttributes = Object.entries(i.properties)
          .filter(([key, value]) => value !== null && value !== undefined && value !== '')
          .map(([key, value]) => ({
            key: key,
            value: String(value)
          }));
      }
    
      return customItem;
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

