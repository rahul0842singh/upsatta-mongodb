const express = require('express');
const Payment = require('../models/payment');
const router = express.Router();

// Create payment
router.post('/', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    if (!userId || !amount) {
      return res.status(400).json({ error: 'userId and amount are required' });
    }
    const payment = new Payment({ userId, amount });
    await payment.save();
    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update status
router.put('/:id/status', async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    if (typeof paymentStatus !== 'boolean') {
      return res.status(400).json({ error: 'paymentStatus must be boolean' });
    }

    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      { paymentStatus },
      { new: true }
    );

    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all
router.get('/', async (_req, res) => {
  try {
    const payments = await Payment.find().sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; // ✅ Important
