import type { Request, Response } from 'express';
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Store from './models/Store.js';
import { fetchProductsFromShopify } from './services/shopifyService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shopify-multi-store';

app.use(express.json());
app.use(express.static('public'));

// 1. Database Connection
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// 2. Store Management API
app.post('/api/stores', async (req: Request, res: Response) => {
    let { shop, accessToken } = req.body;

    if (!shop || !accessToken) {
        return res.status(400).json({ error: 'Shop domain and access token are required' });
    }

    // Sanitization: Remove https:// and trailing slashes, trim spaces
    shop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
    accessToken = accessToken.trim();

    try {
        const store = await (Store as any).findOneAndUpdate(
            { shop },
            { shop, accessToken, installedAt: new Date() },
            { upsert: true, returnDocument: 'after' }
        );
        res.json({ message: 'Store saved successfully', store });
    } catch (error: any) {
        console.error('Save Store Error:', error);
        res.status(500).json({ error: 'Failed to save store', details: error.message });
    }
});

app.get('/api/stores', async (req: Request, res: Response) => {
    try {
        const stores = await (Store as any).find({}, 'shop installedAt');
        res.json(stores);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch stores', details: error.message });
    }
});

// 3. Product Fetch API
app.get('/api/products', async (req: Request, res: Response) => {
    const { shop } = req.query;

    if (!shop || typeof shop !== 'string') {
        return res.status(400).json({ error: 'Shop domain query parameter is required' });
    }

    try {
        const products = await fetchProductsFromShopify(shop);
        res.json({ shop, products });
    } catch (error: any) {
        console.error(`Error fetching products for ${shop}:`, error.message);

        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }

        if (error.message.includes('Invalid API key')) {
            return res.status(401).json({ error: 'Invalid Shopify Admin API Token. Please check your credentials.' });
        }

        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

// 4. Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
