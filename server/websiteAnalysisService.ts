import OpenAI from "openai";
import * as cheerio from "cheerio";
import { storage } from "./storage";
import { promises as dns } from "dns";

interface AnalyzedWebsiteContent {
  businessName: string;
  businessDescription: string;
  mainProducts: string[];
  mainServices: string[];
  keyFeatures: string[];
  targetAudience: string;
  uniqueSellingPoints: string[];
  contactInfo: {
    email?: string;
    phone?: string;
    address?: string;
  };
  businessHours?: string;
  pricingInfo?: string;
  additionalInfo: string;
}

export class WebsiteAnalysisService {
  /**
   * Find important pages to crawl (About, Contact, FAQ, etc.)
   */
  private async findImportantPages(baseUrl: string, homepageHtml: string): Promise<string[]> {
    const $ = cheerio.load(homepageHtml);
    const parsedBase = new URL(baseUrl);
    const baseOrigin = parsedBase.origin;
    const importantPages: Set<string> = new Set();

    // Keywords to look for in links
    const pageKeywords = [
      'about', 'about-us', 'who-we-are', 'our-story', 'company',
      'contact', 'contact-us', 'get-in-touch', 'reach-us',
      'faq', 'faqs', 'help', 'support',
      'services', 'what-we-do',
      'products', 'shop', 'store'
    ];

    // Find all links on the page
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;

      try {
        // Resolve relative URLs
        const absoluteUrl = new URL(href, baseUrl).href;
        const parsedUrl = new URL(absoluteUrl);

        // Only consider links from the same domain
        if (parsedUrl.origin !== baseOrigin) return;

        // Check if URL path contains important keywords
        const path = parsedUrl.pathname.toLowerCase();
        const hasKeyword = pageKeywords.some(keyword => path.includes(keyword));

        if (hasKeyword && importantPages.size < 10) { // Limit to 10 pages
          importantPages.add(absoluteUrl);
        }
      } catch (error) {
        // Skip invalid URLs
      }
    });

    return Array.from(importantPages).slice(0, 5); // Limit to top 5 additional pages
  }

  /**
   * Scrape and analyze a website to extract business information
   * Now includes multi-page crawling for comprehensive analysis
   */
  async analyzeWebsite(websiteUrl: string, businessAccountId: string, openaiApiKey: string): Promise<void> {
    try {
      // Update status to analyzing
      await storage.updateWebsiteAnalysisStatus(businessAccountId, 'analyzing');

      // Step 1: Scrape homepage
      console.log('[Website Analysis] Scraping homepage:', websiteUrl);
      const homepageContent = await this.scrapeWebsite(websiteUrl);

      // Step 2: Find and scrape important pages (About, Contact, FAQ, etc.)
      console.log('[Website Analysis] Finding additional pages...');
      const homepageHtml = await this.fetchPageHtml(websiteUrl);
      const additionalPages = await this.findImportantPages(websiteUrl, homepageHtml);
      
      console.log('[Website Analysis] Found pages to analyze:', additionalPages.length);
      
      let combinedContent = `HOMEPAGE CONTENT:\n${homepageContent}\n\n`;

      // Scrape each additional page
      for (const pageUrl of additionalPages) {
        try {
          console.log('[Website Analysis] Scraping:', pageUrl);
          const pageContent = await this.scrapeWebsite(pageUrl);
          const pageName = new URL(pageUrl).pathname.split('/').filter(p => p).pop() || 'page';
          combinedContent += `\n\n${pageName.toUpperCase()} PAGE CONTENT:\n${pageContent}\n`;
        } catch (error) {
          console.error('[Website Analysis] Error scraping page:', pageUrl, error);
          // Continue with other pages even if one fails
        }
      }

      console.log('[Website Analysis] Total content length:', combinedContent.length);

      // Step 3: Analyze with OpenAI
      const analyzedContent = await this.analyzeWithOpenAI(combinedContent, openaiApiKey);

      // Step 4: Save to database
      await storage.upsertWebsiteAnalysis(businessAccountId, {
        websiteUrl,
        status: 'completed',
        analyzedContent: JSON.stringify(analyzedContent),
      });

      // Step 5: Save analyzed pages history (deduplicated)
      const allAnalyzedPages = [websiteUrl, ...additionalPages];
      const uniquePages = Array.from(new Set(allAnalyzedPages.map(url => url.toLowerCase().replace(/\/$/, ''))));
      
      for (const pageUrl of uniquePages) {
        try {
          await storage.createAnalyzedPage({
            businessAccountId,
            pageUrl,
          });
          console.log('[Website Analysis] Saved analyzed page:', pageUrl);
        } catch (error) {
          console.error('[Website Analysis] Error saving analyzed page:', pageUrl, error);
          // Continue even if saving one page fails
        }
      }
      console.log(`[Website Analysis] Saved ${uniquePages.length} unique pages out of ${allAnalyzedPages.length} total`);

      await storage.updateWebsiteAnalysisStatus(businessAccountId, 'completed');
      console.log('[Website Analysis] Analysis completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('[Website Analysis] Error:', errorMessage);
      await storage.updateWebsiteAnalysisStatus(businessAccountId, 'failed', errorMessage);
      throw error;
    }
  }

  /**
   * Analyze multiple specific pages and optionally merge with existing data
   * @param pageUrls - Array of URLs to analyze
   * @param businessAccountId - Business account ID
   * @param openaiApiKey - OpenAI API key
   * @param appendMode - If true, merge with existing data; if false, replace
   */
  async analyzeWebsitePages(pageUrls: string[], businessAccountId: string, openaiApiKey: string, appendMode: boolean = false): Promise<void> {
    try {
      // Update status to analyzing
      await storage.updateWebsiteAnalysisStatus(businessAccountId, 'analyzing');

      // Step 1: Scrape all provided pages
      console.log('[Website Analysis] Analyzing', pageUrls.length, 'pages in', appendMode ? 'append' : 'replace', 'mode');
      let combinedContent = '';

      for (const pageUrl of pageUrls) {
        try {
          console.log('[Website Analysis] Scraping:', pageUrl);
          const pageContent = await this.scrapeWebsite(pageUrl);
          const pageName = new URL(pageUrl).pathname.split('/').filter(p => p).pop() || 'page';
          combinedContent += `${pageName.toUpperCase()} PAGE (${pageUrl}):\n${pageContent}\n\n`;
        } catch (error) {
          console.error('[Website Analysis] Error scraping page:', pageUrl, error);
          // Continue with other pages even if one fails
        }
      }

      if (!combinedContent.trim()) {
        throw new Error('Failed to scrape any pages');
      }

      console.log('[Website Analysis] Total content length:', combinedContent.length);

      // Step 2: Get existing analysis if in append mode
      let existingData: AnalyzedWebsiteContent | null = null;
      if (appendMode) {
        const analysis = await storage.getWebsiteAnalysis(businessAccountId);
        if (analysis && analysis.analyzedContent) {
          try {
            existingData = JSON.parse(analysis.analyzedContent) as AnalyzedWebsiteContent;
            console.log('[Website Analysis] Found existing data to merge with');
          } catch (error) {
            console.error('[Website Analysis] Error parsing existing data:', error);
          }
        }
      }

      // Step 3: Analyze with OpenAI
      let analyzedContent: AnalyzedWebsiteContent;
      if (existingData && appendMode) {
        // Merge mode: use OpenAI to intelligently combine old and new data
        analyzedContent = await this.mergeAnalysisData(existingData, combinedContent, openaiApiKey);
      } else {
        // Replace mode: just analyze the new content
        analyzedContent = await this.analyzeWithOpenAI(combinedContent, openaiApiKey);
      }

      // Step 4: Save to database
      await storage.upsertWebsiteAnalysis(businessAccountId, {
        websiteUrl: pageUrls[0], // Use the first URL as the main website URL
        status: 'completed',
        analyzedContent: JSON.stringify(analyzedContent),
      });

      // Step 5: Save analyzed pages history (deduplicated)
      const uniquePages = Array.from(new Set(pageUrls.map(url => url.toLowerCase().replace(/\/$/, ''))));
      
      for (const pageUrl of uniquePages) {
        try {
          await storage.createAnalyzedPage({
            businessAccountId,
            pageUrl,
          });
          console.log('[Website Analysis] Saved analyzed page:', pageUrl);
        } catch (error) {
          console.error('[Website Analysis] Error saving analyzed page:', pageUrl, error);
          // Continue even if saving one page fails
        }
      }
      console.log(`[Website Analysis] Saved ${uniquePages.length} unique pages out of ${pageUrls.length} total`);

      await storage.updateWebsiteAnalysisStatus(businessAccountId, 'completed');
      console.log('[Website Analysis] Analysis completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('[Website Analysis] Error:', errorMessage);
      await storage.updateWebsiteAnalysisStatus(businessAccountId, 'failed', errorMessage);
      throw error;
    }
  }

  /**
   * Merge existing analysis data with new website content using AI
   */
  private async mergeAnalysisData(existingData: AnalyzedWebsiteContent, newContent: string, apiKey: string): Promise<AnalyzedWebsiteContent> {
    const openai = new OpenAI({ apiKey });

    const systemPrompt = `You are an expert business analyst specializing in merging and updating business information. Your goal is to combine existing business data with new website content, ensuring no information is lost and new details are added.`;

    const userPrompt = `I have existing business information and new website content. Please merge them intelligently:

EXISTING BUSINESS DATA:
${JSON.stringify(existingData, null, 2)}

NEW WEBSITE CONTENT:
${newContent}

Your task:
1. Keep ALL existing information that is still valid
2. Add ANY new information from the new content
3. Update any information that appears to have changed
4. For arrays (products, services, features, etc.), COMBINE both old and new items, removing duplicates
5. For contact info, keep existing values but add new ones if found
6. For descriptions, expand them with new details if available

Return ONLY valid JSON with this exact structure:

{
  "businessName": "business name (use existing unless clearly different)",
  "businessDescription": "comprehensive description merging both sources",
  "mainProducts": ["ALL products from both old and new data - no duplicates"],
  "mainServices": ["ALL services from both old and new data - no duplicates"],
  "keyFeatures": ["ALL features from both old and new data - no duplicates"],
  "targetAudience": "merged and expanded target audience description",
  "uniqueSellingPoints": ["ALL USPs from both old and new data - no duplicates"],
  "contactInfo": {
    "email": "email (prefer existing, add new if found)",
    "phone": "phone (prefer existing, add new if found)",
    "address": "address (prefer existing, add new if found)"
  },
  "businessHours": "operating hours (prefer new if different, keep existing otherwise)",
  "pricingInfo": "merged pricing information from both sources",
  "additionalInfo": "ALL additional information from both sources combined"
}

CRITICAL: Do NOT remove any existing data. Only add to it and update when necessary.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const result = completion.choices[0].message.content;
    if (!result) {
      throw new Error('OpenAI returned empty response');
    }

    const parsedResult = JSON.parse(result) as AnalyzedWebsiteContent;
    return parsedResult;
  }

  /**
   * Fetch raw HTML for a page (used for link extraction)
   */
  private async fetchPageHtml(url: string): Promise<string> {
    const validatedUrl = await this.validateUrl(url);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(validatedUrl.href, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ChroneyBot/1.0; +https://portal.aichroney.com)',
        },
        signal: controller.signal,
        redirect: 'manual',
      });

      clearTimeout(timeoutId);

      if (response.status >= 300 && response.status < 400) {
        throw new Error('Redirects not supported');
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Quick size check
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
        throw new Error('Content too large');
      }

      const html = await response.text();
      return html.substring(0, 500000); // 500KB limit for HTML
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Check if an IP address is private/internal
   */
  private isPrivateIP(ip: string): boolean {
    // IPv4 private ranges
    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipv4Match = ip.match(ipv4Pattern);
    if (ipv4Match) {
      const [, a, b, c, d] = ipv4Match.map(Number);
      
      // Validate octets are in range 0-255
      if (a > 255 || b > 255 || c > 255 || d > 255) {
        return true; // Invalid IP, treat as private
      }
      
      // Check private ranges
      if (
        a === 0 || // 0.0.0.0/8 (current network)
        a === 10 || // 10.0.0.0/8 (private)
        a === 127 || // 127.0.0.0/8 (loopback)
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 (private)
        (a === 192 && b === 168) || // 192.168.0.0/16 (private)
        (a === 169 && b === 254) || // 169.254.0.0/16 (link-local)
        (a === 192 && b === 0 && c === 2) || // 192.0.2.0/24 (documentation)
        (a === 198 && b === 51 && c === 100) || // 198.51.100.0/24 (documentation)
        (a === 203 && b === 0 && c === 113) || // 203.0.113.0/24 (documentation)
        a >= 224 // 224.0.0.0/4 (multicast) and above
      ) {
        return true;
      }
    }

    // IPv6 private/special ranges
    const ipLower = ip.toLowerCase();
    if (
      ipLower === '::1' || // loopback
      ipLower.startsWith('::ffff:') || // IPv4-mapped
      ipLower.startsWith('fe80:') || // link-local
      ipLower.startsWith('fc') || // unique local fc00::/7
      ipLower.startsWith('fd') || // unique local fd00::/8
      ipLower.startsWith('ff') || // multicast
      ipLower === '::' // unspecified
    ) {
      return true;
    }

    return false;
  }

  /**
   * Validate URL and resolve DNS to prevent SSRF attacks
   */
  private async validateUrl(url: string): Promise<URL> {
    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      throw new Error('Invalid URL format');
    }

    // Only allow http and https protocols
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('Only HTTP and HTTPS protocols are allowed');
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // Block obvious localhost strings
    if (hostname === 'localhost') {
      throw new Error('Access to localhost is not allowed');
    }

    // Block metadata endpoints
    if (hostname.includes('metadata')) {
      throw new Error('Access to metadata endpoints is not allowed');
    }

    // Check if hostname is already an IP address (IPv4 or IPv6)
    if (this.isPrivateIP(hostname) || hostname.includes(':')) {
      // For IPv6 literals, strip brackets
      const cleanHost = hostname.replace(/^\[|\]$/g, '');
      if (this.isPrivateIP(cleanHost)) {
        throw new Error('Access to private IP addresses is not allowed');
      }
    }

    // Resolve DNS to check if domain points to private IP
    try {
      const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
      const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
      
      const allAddresses = [...addresses, ...addresses6];
      
      if (allAddresses.length === 0) {
        throw new Error('Unable to resolve hostname');
      }

      // Check if any resolved IP is private
      for (const addr of allAddresses) {
        if (this.isPrivateIP(addr)) {
          throw new Error('Domain resolves to a private IP address');
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw our validation errors
        if (error.message.includes('not allowed') || error.message.includes('private IP') || error.message.includes('Unable to resolve')) {
          throw error;
        }
      }
      // DNS resolution failed for other reasons
      throw new Error('Unable to resolve hostname. Please check the URL.');
    }

    return parsedUrl;
  }

  /**
   * Scrape website content using fetch and cheerio
   */
  private async scrapeWebsite(url: string): Promise<string> {
    // Validate URL and resolve DNS to prevent SSRF
    const validatedUrl = await this.validateUrl(url);

    // Fetch the website with security controls
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
      const response = await fetch(validatedUrl.href, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ChroneyBot/1.0; +https://portal.aichroney.com)',
        },
        signal: controller.signal,
        redirect: 'manual', // Disable automatic redirects to prevent redirect-based SSRF bypass
      });

      clearTimeout(timeoutId);

      // Handle redirects manually (don't follow them for security)
      if (response.status >= 300 && response.status < 400) {
        throw new Error('Website redirects are not supported. Please provide the final URL.');
      }

      if (!response.ok) {
        // Sanitize error message to avoid leaking internal details
        throw new Error(`Failed to fetch website: HTTP ${response.status}`);
      }

      // Check content type
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('text/html')) {
        throw new Error('Website did not return HTML content');
      }

      // Enforce streaming size limit (5MB) regardless of Content-Length header
      const MAX_SIZE = 5 * 1024 * 1024; // 5MB
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_SIZE) {
        throw new Error('Website content is too large');
      }

      // Read response with streaming size enforcement
      if (!response.body) {
        throw new Error('Response body is not available');
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalSize = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          totalSize += value.length;
          if (totalSize > MAX_SIZE) {
            throw new Error('Website content exceeded size limit during download');
          }

          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      // Combine chunks and decode
      const allChunks = new Uint8Array(totalSize);
      let position = 0;
      for (const chunk of chunks) {
        allChunks.set(chunk, position);
        position += chunk.length;
      }

      const html = new TextDecoder('utf-8').decode(allChunks);
    const $ = cheerio.load(html);

    // Remove script, style, and other non-content elements
    $('script, style, iframe, noscript').remove();

    // Extract different content sections
    const title = $('title').text() || '';
    const metaDescription = $('meta[name="description"]').attr('content') || '';
    const ogDescription = $('meta[property="og:description"]').attr('content') || '';
    
    // Extract main content - try multiple selectors
    let mainContent = '';
    const mainSelectors = ['main', 'article', '[role="main"]', '.content', '#content', '.main', '#main', 'body'];
    for (const selector of mainSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        mainContent = element.text();
        break;
      }
    }

    // Extract header content (often has business info)
    const headerContent = $('header, .header, [role="banner"]').text() || '';

    // Extract footer content (often has contact info, hours)
    const footerContent = $('footer, .footer, [role="contentinfo"]').text() || '';

    // Look for specific business information patterns
    const contactPatterns = $('[class*="contact"], [id*="contact"], [class*="phone"], [class*="email"], [class*="address"]').text() || '';
    const aboutPatterns = $('[class*="about"], [id*="about"], [class*="mission"], [class*="story"]').text() || '';
    const productsPatterns = $('[class*="product"], [id*="product"], [class*="service"], [id*="service"]').text() || '';
    
    // Extract all headings for structure
    const headings = $('h1, h2, h3').map((_, el) => $(el).text().trim()).get().join(' | ');

    // Combine all content with clear sections
    const fullContent = `
      Title: ${title}
      Meta Description: ${metaDescription}
      OG Description: ${ogDescription}
      
      Headings: ${headings}
      
      Header Section:
      ${headerContent}
      
      Main Content:
      ${mainContent}
      
      About/Mission Info:
      ${aboutPatterns}
      
      Products/Services Info:
      ${productsPatterns}
      
      Contact Information:
      ${contactPatterns}
      
      Footer Section:
      ${footerContent}
    `;

      // Clean up whitespace and limit size
      const cleanedContent = fullContent
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 25000); // Increased to 25k chars for more comprehensive extraction

      return cleanedContent;
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Sanitize error messages to prevent information disclosure
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Website request timed out');
        }
        // Re-throw our own validation errors
        if (error.message.includes('not allowed') || error.message.includes('Invalid URL')) {
          throw error;
        }
      }
      // Generic error for network/fetch issues
      throw new Error('Unable to access the website. Please check the URL and try again.');
    }
  }

  /**
   * Analyze scraped content with OpenAI to extract structured information
   */
  private async analyzeWithOpenAI(content: string, apiKey: string): Promise<AnalyzedWebsiteContent> {
    const openai = new OpenAI({ apiKey });

    const systemPrompt = `You are a meticulous business intelligence analyst with expertise in comprehensive data extraction. Your mission is to extract EVERY piece of relevant business information from website content with zero tolerance for omissions.

CORE DIRECTIVES:
1. EXHAUSTIVE EXTRACTION: Find and record EVERY product, service, feature, benefit, certification, award, promotion, pricing detail, and business fact mentioned
2. NO SUMMARIZATION: Do not summarize or group items - list each one individually and specifically
3. COMPLETENESS OVER BREVITY: Include secondary products, minor services, subtle benefits, and niche details
4. THOROUGH SCANNING: Search headers, footers, navigation menus, sidebars, content sections, testimonials, and all page areas
5. EXPLICIT "UNKNOWN": If data genuinely doesn't exist after thorough search, use "unknown" string or empty array - never skip or ignore fields

EXTRACTION STANDARDS:
- Products: List EVERY specific product name, model, variant, bundle, or offering - even if similar
- Services: Capture EVERY service type, tier, add-on, consultation, or support option mentioned
- Features: Document ALL capabilities, benefits, certifications, awards, partnerships, integrations, technologies used
- Contact: Scan footer, header, contact sections, about sections, and embedded links for email, phone, address
- Pricing: Extract ALL pricing tiers, ranges, special offers, discounts, payment plans, free trials
- Additional Info: Include company history, founding year, team size, locations, delivery areas, return policies, warranties, guarantees, sustainability practices, social responsibility, testimonials, case studies, partnerships, media mentions, industry recognitions

You are NOT writing a summary - you are creating a comprehensive database record.`;

    const userPrompt = `TASK: Extract EVERY piece of business information from the website content below. Be exhaustively thorough.

Website Content:
${content}

OUTPUT REQUIREMENTS:
Return ONLY valid JSON with this EXACT structure. Each field MUST be completed with maximum detail:

{
  "businessName": "EXACT official business name (scan logos, headers, titles)",
  
  "businessDescription": "4-6 sentence comprehensive description covering: what they do, who they serve, their mission/vision, what makes them unique, their approach/methodology, and their value proposition. Include concrete details, not generic statements.",
  
  "mainProducts": [
    "Product 1 with specific name/model",
    "Product 2 with specific name/model",
    "Product 3 - list EVERY product mentioned, even if similar",
    "Include product variants, bundles, seasonal items, featured products",
    "Do NOT group products - list each individually",
    "If 20 products exist, list all 20"
  ],
  
  "mainServices": [
    "Service 1 with specific details",
    "Service 2 with specific details",
    "Include ALL service tiers, packages, consultations, support options",
    "List delivery services, installation, maintenance, warranties",
    "Include free services, trial services, premium services",
    "Do NOT skip minor or secondary services"
  ],
  
  "keyFeatures": [
    "Feature 1 (be specific - not just 'quality')",
    "Certification 1 with full name",
    "Award 1 with year if mentioned",
    "Technology/methodology used",
    "Partnership with specific company names",
    "Unique capability or process",
    "Quality standards or compliance (ISO, etc)",
    "Guarantees, warranties, satisfaction promises",
    "Include EVERY benefit, highlight, or advantage mentioned",
    "List integrations, compatibility, technical specs"
  ],
  
  "targetAudience": "Detailed multi-sentence description of WHO they serve: specific demographics (age, gender, income), industries, business types, customer pain points they address, use cases, geographic markets. Be SPECIFIC - not generic.",
  
  "uniqueSellingPoints": [
    "Specific competitive advantage 1",
    "Unique process or methodology",
    "Exclusive partnership or technology",
    "Price advantage or special offer",
    "Speed/convenience benefit with specifics",
    "Quality differentiation with evidence",
    "Special guarantees or policies",
    "Industry-first or innovative approach",
    "List EVERY claim of uniqueness or superiority"
  ],
  
  "contactInfo": {
    "email": "email@example.com (scan footer, contact page, headers, about section)",
    "phone": "+1-xxx-xxx-xxxx (check footer, header, contact section, look for multiple numbers)",
    "address": "Complete physical address including street, city, state, zip, country (footer/contact section)"
  },
  
  "businessHours": "Complete operating hours for each day if mentioned (Mon-Fri 9AM-5PM, etc). Include timezone if stated. If multiple locations, note variations. Use 'unknown' if not found.",
  
  "pricingInfo": "Comprehensive pricing details: ALL price points, tiers (Basic $X, Pro $Y, Enterprise $Z), ranges ($X-$Y), payment plans (monthly/annual), discounts, promotions, free trials, money-back guarantees, price comparisons. Include currency. Use 'unknown' if no pricing found.",
  
  "additionalInfo": "ALL other business information found: founding year, company history, team size, number of locations, geographic coverage, delivery/shipping areas, delivery timeframes, return/refund policies, warranty details, guarantees, customer support channels, social responsibility initiatives, sustainability practices, community involvement, press mentions, media coverage, case studies, client testimonials (summary), industry recognitions, partnerships, future plans, hiring info, research & development. Include EVERYTHING else relevant."
}

CRITICAL VALIDATION CHECKLIST - Before submitting, verify you have:
✓ Listed EVERY product individually (not "various skincare products" but each specific product)
✓ Listed EVERY service individually (not "consulting services" but each type of consulting)
✓ Extracted ALL certifications, awards, partnerships by specific name
✓ Found contact info by checking footer, header, about, contact sections thoroughly
✓ Included ALL pricing details, not just main price points
✓ Documented EVERY unique selling point or competitive claim
✓ Filled additionalInfo with EVERYTHING else found (history, policies, etc)
✓ Used "unknown" for genuinely missing data, not left blank
✓ Provided specific, concrete details - no generic placeholders

EXAMPLES OF GOOD VS BAD EXTRACTION:
❌ BAD: "mainProducts": ["skincare items", "beauty products"]
✅ GOOD: "mainProducts": ["Vitamin C Face Serum 30ml", "Hydrating Night Cream 50ml", "Gentle Foaming Cleanser 150ml", "Rose Water Toner 100ml", "Anti-Aging Eye Cream 15ml"]

❌ BAD: "keyFeatures": ["certified", "eco-friendly"]  
✅ GOOD: "keyFeatures": ["USDA Organic Certified", "Cruelty-Free Certified by Leaping Bunny", "100% Recyclable Packaging", "Carbon-Neutral Shipping", "Dermatologist Tested", "Paraben-Free Formula"]

❌ BAD: "pricingInfo": "varies"
✅ GOOD: "pricingInfo": "Products range from $15-85. Starter Bundle $45 (3 items), Complete Routine $120 (7 items). Subscribe & Save 20% on monthly deliveries. Free shipping on orders over $50. 30-day money-back guarantee."

Remember: You are building a comprehensive database, not writing a summary. Extract EVERYTHING.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const result = completion.choices[0].message.content;
    if (!result) {
      throw new Error('OpenAI returned empty response');
    }

    const parsedResult = JSON.parse(result) as AnalyzedWebsiteContent;
    return parsedResult;
  }

  /**
   * Get the analyzed content for a business account
   */
  async getAnalyzedContent(businessAccountId: string): Promise<AnalyzedWebsiteContent | null> {
    const analysis = await storage.getWebsiteAnalysis(businessAccountId);
    if (!analysis || !analysis.analyzedContent) {
      return null;
    }
    return JSON.parse(analysis.analyzedContent) as AnalyzedWebsiteContent;
  }
}

export const websiteAnalysisService = new WebsiteAnalysisService();
