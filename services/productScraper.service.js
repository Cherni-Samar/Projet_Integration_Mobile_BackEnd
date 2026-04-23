const axios = require('axios');
const cheerio = require('cheerio');

class ProductScraperService {
  static async scrapeProduct(url) {
    try {
      console.log(`🔍 [PRODUCT SCRAPER] Scraping: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000
      });

      const html = response.data;
      const $ = cheerio.load(html);

      const product = {
        url: url,
        title: this._extractTitle($),
        description: this._extractDescription($),
        price: this._extractPrice($),
        images: this._extractImages($, url),
        features: this._extractFeatures($),
        category: this._extractCategory($),
        brand: this._extractBrand($),
        scrapedAt: new Date().toISOString()
      };

      console.log(`✅ [PRODUCT SCRAPER] Successfully scraped: ${product.title}`);
      return {
        success: true,
        product: product
      };

    } catch (error) {
      console.error(`❌ [PRODUCT SCRAPER] Error scraping ${url}:`, error.message);
      return {
        success: false,
        error: error.message,
        product: null
      };
    }
  }

  static _extractTitle($) {
    const selectors = [
      'h1',
      '[itemprop="name"]',
      '.product-title',
      '.product-name',
      'meta[property="og:title"]',
      'title'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        const text = selector.includes('meta') 
          ? element.attr('content') 
          : element.text().trim();
        if (text && text.length > 0) {
          return text;
        }
      }
    }

    return 'Product';
  }

  static _extractDescription($) {
    const selectors = [
      '[itemprop="description"]',
      'meta[property="og:description"]',
      'meta[name="description"]',
      '.product-description',
      '.description',
      'p'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        const text = selector.includes('meta') 
          ? element.attr('content') 
          : element.text().trim();
        if (text && text.length > 20) {
          return text.substring(0, 500);
        }
      }
    }

    return '';
  }

  static _extractPrice($) {
    const selectors = [
      '[itemprop="price"]',
      '.price',
      '.product-price',
      '[class*="price"]'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        const text = element.text().trim();
        const priceMatch = text.match(/([\d,]+[.,]?\d*)\s*[€$£¥]/);
        if (priceMatch) {
          const price = priceMatch[0];
          const uniquePrice = price.replace(/(.+?)(€|$|£|¥)\1\2/g, '$1$2');
          return uniquePrice;
        }
        const numberMatch = text.match(/[\d,]+\.?\d*/);
        if (numberMatch) {
          return numberMatch[0];
        }
      }
    }

    return null;
  }

  static _extractImages($, baseUrl) {
    const images = [];
    const selectors = [
      '[itemprop="image"]',
      'meta[property="og:image"]',
      '.product-image img',
      '.product-gallery img',
      'img[class*="product"]'
    ];

    for (const selector of selectors) {
      $(selector).each((i, elem) => {
        let imgUrl = selector.includes('meta') 
          ? $(elem).attr('content') 
          : $(elem).attr('src') || $(elem).attr('data-src');

        if (imgUrl) {
          if (imgUrl.startsWith('//')) {
            imgUrl = 'https:' + imgUrl;
          } else if (imgUrl.startsWith('/')) {
            const urlObj = new URL(baseUrl);
            imgUrl = urlObj.origin + imgUrl;
          } else if (!imgUrl.startsWith('http')) {
            imgUrl = baseUrl + '/' + imgUrl;
          }

          if (!images.includes(imgUrl) && !imgUrl.includes('icon') && !imgUrl.includes('logo')) {
            images.push(imgUrl);
          }
        }
      });

      if (images.length >= 5) break;
    }

    return images;
  }

  static _extractFeatures($) {
    const features = [];
    const selectors = [
      '.features li',
      '.product-features li',
      '[class*="feature"] li',
      'ul li'
    ];

    for (const selector of selectors) {
      $(selector).each((i, elem) => {
        const text = $(elem).text().trim();
        if (text && text.length > 5 && text.length < 200) {
          features.push(text);
        }
      });

      if (features.length >= 5) break;
    }

    return features;
  }

  static _extractCategory($) {
    const selectors = [
      '[itemprop="category"]',
      '.breadcrumb li:last-child',
      '.category',
      'meta[property="product:category"]'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        const text = selector.includes('meta') 
          ? element.attr('content') 
          : element.text().trim();
        if (text && text.length > 0) {
          return text;
        }
      }
    }

    return null;
  }

  static _extractBrand($) {
    const selectors = [
      '[itemprop="brand"]',
      '.brand',
      '.product-brand',
      'meta[property="product:brand"]'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        const text = selector.includes('meta') 
          ? element.attr('content') 
          : element.text().trim();
        if (text && text.length > 0) {
          return text;
        }
      }
    }

    return null;
  }

  static async downloadImage(imageUrl) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      return Buffer.from(response.data);
    } catch (error) {
      console.error(`❌ [PRODUCT SCRAPER] Error downloading image ${imageUrl}:`, error.message);
      throw error;
    }
  }
}

module.exports = ProductScraperService;
