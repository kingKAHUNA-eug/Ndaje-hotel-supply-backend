const axios = require('axios');

class GeocodingService {
  /**
   * Geocode an address to get coordinates
   * @param {string} address - Full address string
   * @returns {Object} Coordinates and formatted address
   */
  static async geocodeAddress(address) {
    try {
      // Using OpenStreetMap Nominatim API (free)
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: address,
          format: 'json',
          limit: 1,
          addressdetails: 1
        },
        headers: {
          'User-Agent': 'HotelSupplyApp/1.0'
        }
      });

      if (response.data && response.data.length > 0) {
        const result = response.data[0];
        return {
          latitude: parseFloat(result.lat),
          longitude: parseFloat(result.lon),
          formattedAddress: result.display_name,
          addressComponents: result.address
        };
      }

      throw new Error('Address not found');
    } catch (error) {
      console.error('GeocodingService.geocodeAddress error:', error);
      throw new Error('Failed to geocode address');
    }
  }

  /**
   * Reverse geocode coordinates to get address
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @returns {Object} Address information
   */
  static async reverseGeocode(latitude, longitude) {
    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: {
          lat: latitude,
          lon: longitude,
          format: 'json',
          addressdetails: 1
        },
        headers: {
          'User-Agent': 'HotelSupplyApp/1.0'
        }
      });

      if (response.data) {
        return {
          formattedAddress: response.data.display_name,
          addressComponents: response.data.address
        };
      }

      throw new Error('Location not found');
    } catch (error) {
      console.error('GeocodingService.reverseGeocode error:', error);
      throw new Error('Failed to reverse geocode location');
    }
  }

  /**
   * Calculate distance between two coordinates (in kilometers)
   * @param {number} lat1 - First latitude
   * @param {number} lon1 - First longitude
   * @param {number} lat2 - Second latitude
   * @param {number} lon2 - Second longitude
   * @returns {number} Distance in kilometers
   */
  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Convert degrees to radians
   * @param {number} degrees - Degrees
   * @returns {number} Radians
   */
  static toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Validate coordinates
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @returns {boolean} True if valid
   */
  static validateCoordinates(latitude, longitude) {
    return (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  /**
   * Format address for display
   * @param {Object} addressComponents - Address components from geocoding
   * @returns {string} Formatted address
   */
  static formatAddress(addressComponents) {
    if (!addressComponents) return '';

    const parts = [];
    
    if (addressComponents.house_number) parts.push(addressComponents.house_number);
    if (addressComponents.road) parts.push(addressComponents.road);
    if (addressComponents.suburb) parts.push(addressComponents.suburb);
    if (addressComponents.city) parts.push(addressComponents.city);
    if (addressComponents.state) parts.push(addressComponents.state);
    if (addressComponents.postcode) parts.push(addressComponents.postcode);
    if (addressComponents.country) parts.push(addressComponents.country);

    return parts.join(', ');
  }
}

module.exports = GeocodingService;
