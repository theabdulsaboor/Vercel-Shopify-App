const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://store-by-hudaib-riaz.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse request body
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (error) {
    console.error('Error parsing request body:', error.message);
    return res.status(400).json({ error: 'Invalid JSON body', details: error.message });
  }

  const { variantId, quantity, storeDomain, productTitle } = body || {};

  if (!variantId || !quantity || !storeDomain) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

    
  
  
  try {
	  console.log("➡️ Fetching variant:", variantId, "from", storeDomain);
    // Fetch variant to get title and base price
    const variantResponse = await axios.get(
      `https://${storeDomain}/admin/api/2025-04/variants/${variantId}.json`,
      {
        headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN }
      }
    );
console.log("✅ Variant fetch response:", JSON.stringify(variantResponse.data, null, 2));
    const variant = variantResponse.data.variant;
    if (!variant) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    const basePrice = parseFloat(variant.price);
    if (isNaN(basePrice)) {
      return res.status(500).json({ error: 'Invalid variant price' });
    }

    const totalPrice = basePrice * quantity;

    // Fetch product to get title if productTitle is not provided
    let finalTitle = productTitle;
    if (!productTitle) {

      console.log("➡️ Fetching product:", variant.product_id);
		
      const productResponse = await axios.get(
        `https://${storeDomain}/admin/api/2025-04/products/${variant.product_id}.json`,
        {
          headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN }
        }
      );
	        console.log("✅ Product fetch response:", JSON.stringify(productResponse.data, null, 2));

      finalTitle = productResponse.data.product.title || 'Custom Product';
    }

    // Append variant title if it's not 'Default Title'
    const displayTitle = variant.title === 'Default Title' ? finalTitle : `${finalTitle} - ${variant.title}`;

// Create draft order with custom line item
    console.log("➡️ Creating draft order with:", {
      title: `${displayTitle} (Custom Quantity)`,
      price: totalPrice.toFixed(2),
      quantity: 1
    });



    // Create draft order with custom line item
    const draftOrderResponse = await axios.post(
      `https://${storeDomain}/admin/api/2025-04/draft_orders.json`,
      {
        draft_order: {
          line_items: [
            {
              title: `${displayTitle} (Custom Quantity)`,
              price: totalPrice.toFixed(2),
              quantity: 1,
              custom: true
            }
          ],
          applied_discount: null,
          taxes_included: false,
          note: `Custom order with quantity ${quantity}`
        }
      },
      {
        headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN }
      }
    );
    console.log("✅ Draft order response:", JSON.stringify(draftOrderResponse.data, null, 2));

    const draftOrder = draftOrderResponse.data.draft_order;
    const draftOrderId = draftOrder.id;
    const invoiceUrl = draftOrder.invoice_url;

    res.status(200).json({ draftOrderId, invoiceUrl });
  } catch (error) {
    console.error('Error creating draft order:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create draft order', details: error.message });
  }
};