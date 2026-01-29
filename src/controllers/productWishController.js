const { prisma } = require('../index');
const cloudinary = require('cloudinary').v2;

/**
 * CLIENT: Submit a product wish with image
 */
const submitProductWish = async (req, res) => {
  try {
    const clientId = req.user.userId; // Using userId from auth middleware
    const { description, estimatedPrice, quantity } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Product image is required'
      });
    }

    console.log('📸 Uploading product wish image to Cloudinary...');

    // Upload image to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'ndaje-product-wishes',
          resource_type: 'auto',
          allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp']
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    // Create product wish
    const productWish = await prisma.productWish.create({
      data: {
        clientId,
        imageUrl: result.secure_url,
        description: description || '',
        estimatedPrice: estimatedPrice ? parseFloat(estimatedPrice) : null,
        quantity: quantity ? parseInt(quantity) : 1,
        status: 'PENDING'
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    console.log('✅ Product wish created:', productWish.id);

    // TODO: Send notification to admin
    // await sendAdminNotification('new_product_wish', productWish);

    res.status(201).json({
      success: true,
      message: 'Product wish submitted successfully! Admin will review it soon.',
      data: productWish
    });

  } catch (error) {
    console.error('❌ Submit product wish error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit product wish',
      error: error.message
    });
  }
};

/**
 * CLIENT: Get my product wishes
 */
const getMyProductWishes = async (req, res) => {
  try {
    const clientId = req.user.userId;
    const { status } = req.query;

    const whereClause = { clientId };
    if (status) whereClause.status = status;

    const wishes = await prisma.productWish.findMany({
      where: whereClause,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            price: true,
            image: true,
            isBookedProduct: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Count by status
    const counts = {
      pending: wishes.filter(w => w.status === 'PENDING').length,
      approved: wishes.filter(w => w.status === 'APPROVED' || w.status === 'IN_DISCUSSION').length,
      booked: wishes.filter(w => w.status === 'PRODUCT_CREATED').length,
      completed: wishes.filter(w => w.status === 'COMPLETED').length
    };

    res.json({
      success: true,
      data: wishes,
      counts
    });

  } catch (error) {
    console.error('❌ Get my product wishes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product wishes',
      error: error.message
    });
  }
};

/**
 * ADMIN: Get all product wishes
 */
const getAllProductWishes = async (req, res) => {
  try {
    const { status } = req.query;

    const whereClause = {};
    if (status) whereClause.status = status;

    const wishes = await prisma.productWish.findMany({
      where: whereClause,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            price: true,
            image: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const stats = {
      total: wishes.length,
      pending: wishes.filter(w => w.status === 'PENDING').length,
      underReview: wishes.filter(w => w.status === 'UNDER_REVIEW').length,
      approved: wishes.filter(w => w.status === 'APPROVED').length,
      rejected: wishes.filter(w => w.status === 'REJECTED').length,
      productsCreated: wishes.filter(w => w.status === 'PRODUCT_CREATED').length
    };

    res.json({
      success: true,
      data: wishes,
      stats
    });

  } catch (error) {
    console.error('❌ Get all product wishes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product wishes',
      error: error.message
    });
  }
};

/**
 * ADMIN: Approve product wish (product can be sourced)
 */
const approveProductWish = async (req, res) => {
  try {
    const { wishId } = req.params;
    const { adminNotes, whatsappNumber } = req.body;

    const wish = await prisma.productWish.findUnique({
      where: { id: wishId },
      include: { client: true }
    });

    if (!wish) {
      return res.status(404).json({
        success: false,
        message: 'Product wish not found'
      });
    }

    // Generate WhatsApp chat URL
    let whatsappUrl = null;
    if (wish.client.phone) {
      const clientPhone = wish.client.phone.replace(/\D/g, ''); // Remove non-digits
      const message = encodeURIComponent(
        `Hello! Regarding your product request #${wishId.slice(-8)}. We can source this product for you. Let's discuss the details.`
      );
      whatsappUrl = `https://wa.me/${clientPhone}?text=${message}`;
    }

    const updatedWish = await prisma.productWish.update({
      where: { id: wishId },
      data: {
        status: 'APPROVED',
        adminResponse: 'APPROVED',
        adminNotes: adminNotes || 'Product can be sourced',
        whatsappChatUrl: whatsappUrl,
        reviewedAt: new Date(),
        approvedAt: new Date()
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    console.log('✅ Product wish approved:', wishId);

    // TODO: Send notification to client
    // await sendClientNotification(wish.clientId, 'product_wish_approved', updatedWish);

    res.json({
      success: true,
      message: 'Product wish approved! Client has been notified.',
      data: updatedWish
    });

  } catch (error) {
    console.error('❌ Approve product wish error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve product wish',
      error: error.message
    });
  }
};

/**
 * ADMIN: Reject product wish
 */
const rejectProductWish = async (req, res) => {
  try {
    const { wishId } = req.params;
    const { reason } = req.body;

    const updatedWish = await prisma.productWish.update({
      where: { id: wishId },
      data: {
        status: 'REJECTED',
        adminResponse: 'REJECTED',
        adminNotes: reason || 'Unable to source this product',
        reviewedAt: new Date()
      }
    });

    console.log('❌ Product wish rejected:', wishId);

    res.json({
      success: true,
      message: 'Product wish rejected',
      data: updatedWish
    });

  } catch (error) {
    console.error('❌ Reject product wish error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject product wish',
      error: error.message
    });
  }
};

/**
 * ADMIN: Create booked product from wish
 */
const createBookedProduct = async (req, res) => {
  try {
    const { wishId } = req.params;
    const { name, sku, price, category, description } = req.body;

    const wish = await prisma.productWish.findUnique({
      where: { id: wishId },
      include: { client: true }
    });

    if (!wish) {
      return res.status(404).json({
        success: false,
        message: 'Product wish not found'
      });
    }

    if (wish.status !== 'APPROVED' && wish.status !== 'IN_DISCUSSION') {
      return res.status(400).json({
        success: false,
        message: 'Product wish must be approved first'
      });
    }

    // Create the product
    const product = await prisma.product.create({
      data: {
        name,
        sku: sku || `BOOKED-${Date.now()}`,
        price: parseFloat(price),
        category: category || 'Booked Products',
        description: description || wish.description || '',
        image: wish.imageUrl,
        isBookedProduct: true,
        bookedForClientId: wish.clientId,
        active: true
      }
    });

    // Update wish with product reference
    const updatedWish = await prisma.productWish.update({
      where: { id: wishId },
      data: {
        status: 'PRODUCT_CREATED',
        productId: product.id
      },
      include: {
        product: true,
        client: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    console.log('✅ Booked product created:', product.id);

    res.status(201).json({
      success: true,
      message: 'Booked product created successfully!',
      data: {
        wish: updatedWish,
        product
      }
    });

  } catch (error) {
    console.error('❌ Create booked product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booked product',
      error: error.message
    });
  }
};

/**
 * CLIENT: Get booked products (products created from my wishes)
 */
const getMyBookedProducts = async (req, res) => {
  try {
    const clientId = req.user.userId;

    const bookedProducts = await prisma.product.findMany({
      where: {
        isBookedProduct: true,
        bookedForClientId: clientId
      },
      include: {
        bookedForWish: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            approvedAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: bookedProducts,
      count: bookedProducts.length
    });

  } catch (error) {
    console.error('❌ Get booked products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booked products',
      error: error.message
    });
  }
};

/**
 * CLIENT: Start WhatsApp conversation (mark as in discussion)
 */
const startWhatsAppDiscussion = async (req, res) => {
  try {
    const { wishId } = req.params;

    const updatedWish = await prisma.productWish.update({
      where: { id: wishId },
      data: {
        status: 'IN_DISCUSSION'
      }
    });

    res.json({
      success: true,
      message: 'Discussion started',
      data: updatedWish
    });

  } catch (error) {
    console.error('❌ Start WhatsApp discussion error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start discussion',
      error: error.message
    });
  }
};

module.exports = {
  submitProductWish,
  getMyProductWishes,
  getAllProductWishes,
  approveProductWish,
  rejectProductWish,
  createBookedProduct,
  getMyBookedProducts,
  startWhatsAppDiscussion
};