const mongoose = require('mongoose');

const iapPurchaseSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        platform: {
            type: String,
            enum: ['ios', 'android'],
            required: true,
            index: true,
        },
        productId: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        inspectionId: {
            type: String,
            trim: true,
        },
        transactionId: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        originalTransactionId: {
            type: String,
            trim: true,
            index: true,
        },
        purchaseDate: {
            type: Date,
            default: Date.now,
        },
        environment: {
            type: String,
            enum: ['Production', 'Sandbox', 'Unknown'],
            default: 'Unknown',
        },
        status: {
            type: String,
            enum: ['verified', 'restored', 'failed'],
            default: 'verified',
            index: true,
        },
        receiptHash: {
            type: String,
            trim: true,
        },
        rawValidation: {
            type: mongoose.Schema.Types.Mixed,
        },
    },
    {
        timestamps: true,
    }
);

iapPurchaseSchema.index({ platform: 1, transactionId: 1 }, { unique: true });
iapPurchaseSchema.index({ userId: 1, productId: 1, status: 1 });

module.exports = mongoose.model('IAPPurchase', iapPurchaseSchema);
