import fetch from 'node-fetch';
import Store from '../models/Store.js';

export interface ProductData {
  id: string;
  name: string;
  url: string;
  imageUrl: string;
  description: string;
  suitableFor: string[];
  keyIngredients: string[];
  variantId: string;
  price: string;
  originalPrice?: string | null | undefined;
  productType?: string;
}

const productCache = new Map<string, { data: ProductData[], timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes

export async function fetchProductsFromShopify(shop: string): Promise<ProductData[]> {
  // 1. Check Cache
  const cached = productCache.get(shop);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`[Cache Hit] Serving products for ${shop}`);
    return cached.data;
  }

  // 2. Get Access Token from DB
  const store = await (Store as any).findOne({ shop });
  if (!store || !store.accessToken) {
    throw new Error(`Store ${shop} not found or missing access token`);
  }

  const SHOPIFY_DOMAIN = shop;
  const ACCESS_TOKEN = store.accessToken;
  const allEdges: any[] = [];
  let hasNextPage = true;
  let endCursor: string | null = null;

  try {
    while (hasNextPage) {
      const query = `
      {
        products(first: 50${endCursor ? `, after: "${endCursor}"` : ''}) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              description
              productType
              handle
              onlineStoreUrl
              featuredImage {
                url
              }
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                    compareAtPrice
                  }
                }
              }
              tags
            }
          }
        }
      }
      `;

      // Use Admin API endpoint
      const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': ACCESS_TOKEN,
        },
        body: JSON.stringify({ query }),
      });

      const json: any = await response.json();

      if (json.errors) {
        console.error(`Shopify Admin API Errors for ${shop}:`, json.errors);
        throw new Error(`Shopify API Error: ${JSON.stringify(json.errors)}`);
      }

      const productsData = json.data?.products;
      if (!productsData) break;

      const pageInfo = productsData.pageInfo || {};
      const edges = productsData.edges || [];

      allEdges.push(...edges);
      hasNextPage = pageInfo.hasNextPage || false;
      endCursor = pageInfo.endCursor || null;
    }

    const products: ProductData[] = allEdges.map((edge: any) => {
      const node = edge.node;
      const variant = node.variants.edges[0]?.node;
      const imageUrl = node.featuredImage?.url || 'https://placehold.co/200x200?text=No+Image';

      return {
        id: node.id,
        name: node.title,
        url: node.onlineStoreUrl || `https://${SHOPIFY_DOMAIN}/products/${node.handle}`,
        imageUrl: imageUrl,
        description: node.description,
        suitableFor: node.tags || [],
        keyIngredients: [],
        variantId: variant?.id,
        price: variant?.price ? `INR ${parseFloat(variant.price).toFixed(2)}` : 'N/A',
        originalPrice: variant?.compareAtPrice ? `INR ${parseFloat(variant.compareAtPrice).toFixed(2)}` : undefined,
        productType: node.productType
      };
    });

    // 3. Update Cache
    productCache.set(shop, { data: products, timestamp: Date.now() });
    console.log(`[Shopify Service] Fetched ${products.length} products for ${shop}`);

    return products;
  } catch (error) {
    console.error(`Failed to fetch products for ${shop}:`, error);
    throw error;
  }
}
