const express = require('express');
const Order = require('../models/order');
const auth = require('../middlewares/auth');

const orderRouter = express.Router();

// Place order from cart
orderRouter.post('/api/order', auth, async (req, res) => {
  try {
    const { cart, totalPrice, address, paymentMethod, phoneNumber } = req.body;

    let products = [];
    let quantities = [];

    for (let i = 0; i < cart.length; i++) {
      let product = cart[i].product;
      let quantity = cart[i].quantity;

      products.push({
        product: product,
        quantity: quantity,
      });
      quantities.push(quantity);
    }

    let order = new Order({
      products: products,
      totalPrice: totalPrice,
      address: address,
      userId: req.user,
      orderedAt: new Date().getTime(),
      paymentMethod: paymentMethod || 'COD',
      paymentStatus: 'pending',
      phoneNumber: phoneNumber,
    });

    order = await order.save();
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Place direct order (buy now)
orderRouter.post('/api/order-direct', auth, async (req, res) => {
  try {
    const { products, quantities, totalPrice, address, paymentMethod, phoneNumber } = req.body;

    let orderProducts = [];

    for (let i = 0; i < products.length; i++) {
      orderProducts.push({
        product: products[i],
        quantity: quantities[i],
      });
    }

    let order = new Order({
      products: orderProducts,
      totalPrice: totalPrice,
      address: address,
      userId: req.user,
      orderedAt: new Date().getTime(),
      paymentMethod: paymentMethod || 'COD',
      paymentStatus: 'pending',
      phoneNumber: phoneNumber,
    });

    order = await order.save();
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get order by ID
orderRouter.get('/api/orders/:id', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cancel order
orderRouter.post('/api/orders/cancel/:id', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    if (order.userId.toString() !== req.user) {
      return res.status(401).json({ msg: 'User not authorized' });
    }

    order.cancelled = true;
    order.status = 4; // Cancelled status
    await order.save();

    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete order
orderRouter.delete('/api/orders/:id', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    if (order.userId.toString() !== req.user) {
      return res.status(401).json({ msg: 'User not authorized' });
    }

    await Order.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Order deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = orderRouter;
