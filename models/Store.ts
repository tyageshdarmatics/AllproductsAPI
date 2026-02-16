import mongoose from 'mongoose';

const StoreSchema = new mongoose.Schema({
    shop: { type: String, required: true, unique: true },
    accessToken: { type: String, required: true },
    installedAt: { type: Date, default: Date.now }
});

export default mongoose.models.Store || mongoose.model('Store', StoreSchema);
