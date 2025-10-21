const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    amount: { type: Number, required: true },
    paymentStatus: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Payment = mongoose.model('Payment', paymentSchema);

// ✅ Correct CommonJS export
module.exports = Payment;
