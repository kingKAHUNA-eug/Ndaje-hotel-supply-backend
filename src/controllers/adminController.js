const { z } = require('zod');
const AdminReportService = require('../services/adminReportService');

// Validation schemas
const reportFiltersSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.string().optional()
});

// Generate comprehensive system report
const generateSystemReport = async (req, res) => {
  try {
    const filters = reportFiltersSchema.parse(req.query);
    
    // Convert string dates to Date objects
    if (filters.startDate) {
      filters.startDate = new Date(filters.startDate);
    }
    if (filters.endDate) {
      filters.endDate = new Date(filters.endDate);
    }

    const report = await AdminReportService.generateSystemReport(filters);

    res.json({
      success: true,
      message: 'System report generated successfully',
      data: { report }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }

    console.error('Generate system report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Export report to CSV
const exportReportToCSV = async (req, res) => {
  try {
    const filters = reportFiltersSchema.parse(req.query);
    
    // Convert string dates to Date objects
    if (filters.startDate) {
      filters.startDate = new Date(filters.startDate);
    }
    if (filters.endDate) {
      filters.endDate = new Date(filters.endDate);
    }

    const report = await AdminReportService.generateSystemReport(filters);
    const csvContent = AdminReportService.exportToCSV(report);

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="system-report-${new Date().toISOString().split('T')[0]}.csv"`);
    
    res.send(csvContent);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }

    console.error('Export report to CSV error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get dashboard summary
const getDashboardSummary = async (req, res) => {
  try {
    const filters = reportFiltersSchema.parse(req.query);
    
    // Convert string dates to Date objects
    if (filters.startDate) {
      filters.startDate = new Date(filters.startDate);
    }
    if (filters.endDate) {
      filters.endDate = new Date(filters.endDate);
    }

    const report = await AdminReportService.generateSystemReport(filters);

    // Return only summary data for dashboard
    res.json({
      success: true,
      data: {
        summary: report.summary,
        orderStatistics: report.orderStatistics,
        userStatistics: report.userStatistics,
        paymentStatistics: report.paymentStatistics,
        deliveryStatistics: report.deliveryStatistics
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }

    console.error('Get dashboard summary error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

module.exports = {
  generateSystemReport,
  exportReportToCSV,
  getDashboardSummary
};