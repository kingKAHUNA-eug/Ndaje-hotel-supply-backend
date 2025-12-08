// services/cronService.js
const cron = require('node-cron');
const QuoteService = require('./quoteService');

const setupCronJobs = () => {
  // Clean up expired locks every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('Running lock cleanup...');
    try {
      const result = await QuoteService.cleanupExpiredLocks();
      if (result.count > 0) {
        console.log(`Cleaned up ${result.count} expired locks`);
      }
    } catch (error) {
      console.error('Lock cleanup error:', error);
    }
  });

  // Clean up expired approved quotes every day at midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('Running expired quotes cleanup...');
    try {
      const result = await prisma.quote.updateMany({
        where: {
          status: 'APPROVED',
          validUntil: {
            lt: new Date()
          }
        },
        data: {
          status: 'REJECTED',
          sourcingNotes: 'Quote expired'
        }
      });
      if (result.count > 0) {
        console.log(`Updated ${result.count} expired quotes`);
      }
    } catch (error) {
      console.error('Expired quotes cleanup error:', error);
    }
  });
};

module.exports = { setupCronJobs };