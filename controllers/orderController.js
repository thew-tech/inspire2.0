const Order = require('../models/Order');
const { validationResult } = require('express-validator');

// @desc    Create a new order
// @route   POST /api/orders
// @access  Private
exports.createOrder = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors.array().map((e) => e.msg),
      });
    }

    const { customer, items, notes, paymentMethod } = req.body;

    // Calculate totals
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
    const tax = subtotal * 0.08; // 8% tax
    const total = subtotal + tax;

    const order = new Order({
      customer,
      items,
      totalItems,
      subtotal,
      tax,
      total,
      paymentMethod,
      notes,
      createdBy: req.userId,
    });

    await order.save();

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order,
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating order',
      error: error.message,
    });
  }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private
exports.getOrders = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;

    const query = { createdBy: req.userId };

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const orders = await Order.find(query)
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(query);

    res.status(200).json({
      success: true,
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message,
    });
  }
};

// @desc    Get a single order
// @route   GET /api/orders/:id
// @access  Private
exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('createdBy', 'fullName email')
      .populate('assignedTo', 'fullName email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order',
      error: error.message,
    });
  }
};

// @desc    Update an order
// @route   PUT /api/orders/:id
// @access  Private
exports.updateOrder = async (req, res) => {
  try {
    const { status, paymentStatus, notes, assignedTo, deliveryDate } = req.body;

    const updateData = {
      updatedAt: Date.now(),
    };

    if (status) updateData.status = status;
    if (paymentStatus) updateData.paymentStatus = paymentStatus;
    if (notes !== undefined) updateData.notes = notes;
    if (assignedTo) updateData.assignedTo = assignedTo;
    if (deliveryDate) updateData.deliveryDate = deliveryDate;

    if (status === 'completed') {
      updateData.completedDate = Date.now();
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order updated successfully',
      order,
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating order',
      error: error.message,
    });
  }
};

// @desc    Delete an order
// @route   DELETE /api/orders/:id
// @access  Private
exports.deleteOrder = async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order deleted successfully',
    });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting order',
      error: error.message,
    });
  }
};

// @desc    Get order stats
// @route   GET /api/orders/stats
// @access  Private
exports.getOrderStats = async (req, res) => {
  try {
    const userId = req.userId;

    const stats = await Order.aggregate([
      { $match: { createdBy: userId } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] },
          },
          totalRevenue: { $sum: '$total' },
        },
      },
    ]);

    // Get today's completed orders
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const completedToday = await Order.countDocuments({
      createdBy: userId,
      status: 'completed',
      completedDate: { $gte: today },
    });

    res.status(200).json({
      success: true,
      stats: {
        ...(stats[0] || {
          totalOrders: 0,
          pending: 0,
          completed: 0,
          inProgress: 0,
          totalRevenue: 0,
        }),
        completedToday,
      },
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order stats',
      error: error.message,
    });
  }
};
