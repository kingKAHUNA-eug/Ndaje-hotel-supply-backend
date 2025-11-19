// controllers/managerController.js
const Quote = require('../models/Quote');

const getPendingQuotes = async (req, res) => {
  try {
    const quotes = await Quote.find({ status: 'pending' })
      .populate('clientId', 'name email phone hotelName')
      .populate('items.productId', 'name unit referencePrice')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: quotes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const priceAndApproveQuote = async (req, res) => {
  const { id } = req.params;
  const { prices } = req.body; // [{ productId: "xxx", finalPrice: 55000 }]

  if (!Array.isArray(prices) || prices.length === 0) {
    return res.status(400).json({ success: false, message: 'Prices array required' });
  }

  try {
    const quote = await Quote.findById(id);
    if (!quote) return res.status(404).json({ success: false, message: 'Quote not found' });
    if (quote.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Quote already processed' });
    }

    let totalAmount = 0;
    quote.items = quote.items.map(item => {
      const priced = prices.find(p => p.productId === item.productId.toString());
      if (!priced) throw new Error(`Price missing for ${item.productId}`);
      const finalPrice = Number(priced.finalPrice);
      totalAmount += finalPrice * item.quantity;
      return { ...item, finalPrice };
    });

    quote.finalPrice = totalAmount;
    quote.status = 'approved';
    quote.approvedBy = req.user.id;
    quote.approvedAt = new Date();
    await quote.save();

    res.json({ success: true, data: quote });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const getMyPricedOrders = async (req, res) => {
  try {
    const orders = await Quote.find({ 
      status: 'approved', 
      approvedBy: req.user.id 
    })
      .populate('clientId', 'name email phone hotelName')
      .sort({ approvedAt: -1 });

    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getPendingQuotes,
  priceAndApproveQuote,
  getMyPricedOrders
};