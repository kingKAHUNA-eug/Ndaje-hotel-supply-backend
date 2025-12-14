// routes/driver.js
const express = require('express');
const router = express.Router();
const { authenticateToken, requireDeliveryAgent } = require('../middlewares/auth');
const DriverController = require('../controllers/driverController');

// Protect all driver routes
router.use(authenticateToken);
router.use(requireDeliveryAgent);

// Dashboard endpoints
router.get('/dashboard/deliveries', DriverController.getMyDeliveries);
router.get('/dashboard/stats', DriverController.getDriverStats);

// Delivery actions
router.get('/deliveries/:deliveryId', DriverController.getDeliveryDetails);
router.put('/deliveries/:deliveryId/status', DriverController.updateDeliveryStatus);
router.post('/deliveries/:deliveryId/pickup', DriverController.markAsPickedUp);
router.get('/deliveries/:deliveryId/code', DriverController.getDeliveryCode);

// Location tracking
router.post('/location', DriverController.updateLocation);

module.exports = router;