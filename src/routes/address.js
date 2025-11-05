const express = require('express');
const { 
  getAddresses, 
  getAddress, 
  createAddress, 
  updateAddress, 
  deleteAddress 
} = require('../controllers/addressController');
const { authenticateToken, requireClient } = require('../middlewares/auth');

const router = express.Router();

// All routes require authentication and client role
router.use(authenticateToken);
router.use(requireClient);

// Address CRUD routes
router.get('/', getAddresses);
router.get('/:id', getAddress);
router.post('/', createAddress);
router.put('/:id', updateAddress);
router.delete('/:id', deleteAddress);

module.exports = router;
