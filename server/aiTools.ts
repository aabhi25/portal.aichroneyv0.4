// Phase 3 Task 10: Smart tool selection for 40-70% token savings
export function selectRelevantTools(userMessage: string): typeof aiTools {
  const lowerMessage = userMessage.toLowerCase();
  const selectedTools = [];
  
  // Tool selection logic based on query analysis
  const hasProductQuery = /product|item|catalog|sell|buy|purchase|price|cost|show me|browse|looking for|search|available|what do you have/i.test(lowerMessage);
  const hasFaqQuery = /how|why|what|when|where|who|can i|do you|is there|policy|return|refund|shipping|warranty|about|information|question|help|faq/i.test(lowerMessage);
  
  // Always include relevant tools based on query
  if (hasProductQuery) {
    selectedTools.push(aiTools[0]); // get_products
  }
  
  if (hasFaqQuery) {
    selectedTools.push(aiTools[1]); // get_faqs
  }
  
  // ALWAYS include capture_lead for proactive lead capture
  // The AI needs this available to capture contact info when users provide it during any conversation
  selectedTools.push(aiTools[2]); // capture_lead (always available)
  
  // If no specific tools match, include get_faqs as fallback (knowledge base)
  if (selectedTools.length === 1) { // Only capture_lead selected so far
    selectedTools.push(aiTools[1]); // get_faqs is our primary knowledge source
  }
  
  const savings = Math.round((1 - selectedTools.length / aiTools.length) * 100);
  console.log(`[Smart Tools] Selected ${selectedTools.length}/${aiTools.length} tools (${savings}% token savings)`);
  
  return selectedTools;
}

export const aiTools = [
  {
    type: 'function',
    function: {
      name: 'get_products',
      description: 'Retrieve the list of products from the business catalog with their categories and tags for smart product discovery. ALWAYS use this tool when users ask about: products, items, catalog, what you sell, best sellers, popular products, top products, product recommendations, available products, product list, or anything related to the product inventory. Each product includes categories and tags that help customers find related items. Call this even if they ask for "best selling" or "popular" items - just retrieve all products and present them. This tool returns a maximum of 5 products at a time. If there are more products, ask the user if they want to see more, and call this tool again with the next offset. Supports price filtering for queries like "products under $50" or "items between $20 and $100".',
      parameters: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Optional search term to filter products by name, description, category name, or tag name. Examples: "summer" will find products with "Summer Collection" tag, "shoes" will find products in Shoes category, "waterproof" will find products with waterproof tag.'
          },
          min_price: {
            type: 'number',
            description: 'Optional minimum price filter (inclusive). Use when customer asks for products "above", "over", or "at least" a certain price.'
          },
          max_price: {
            type: 'number',
            description: 'Optional maximum price filter (inclusive). Use when customer asks for products "under", "below", "less than", or "up to" a certain price.'
          },
          offset: {
            type: 'number',
            description: 'Number of products to skip (for pagination). Start with 0, then 5, 10, 15, etc.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_faqs',
      description: 'CRITICAL: This is the primary knowledge base. ALWAYS check FAQs FIRST before answering ANY customer question (except product listings). Use this tool for ALL informational questions including but not limited to: company information (owner, founder, CEO, about us, history), policies (return, refund, exchange, warranty), shipping (costs, times, methods, free shipping), sizing (guides, measurements, fit), payment (methods accepted, payment plans), store information (locations, hours, contact), product details (care instructions, materials, compatibility), ordering process (how to order, tracking, cancellations), troubleshooting, or ANY question that starts with "who", "what", "when", "where", "why", "how", "do you", "can I", "is there". If the user asks anything that might be in the FAQ, CHECK IT FIRST - do not guess or deflect.',
      parameters: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Optional search term to filter FAQs by question or answer content'
          },
          category: {
            type: 'string',
            description: 'Optional category to filter FAQs'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'capture_lead',
      description: 'IMPORTANT: DO NOT call this tool immediately when customer provides ONLY contact info (email/phone) without a name. CONVERSATIONAL FLOW: (1) When customer provides ONLY contact info (email/phone) WITHOUT name, DO NOT capture yet - instead respond conversationally and politely ask for their name (e.g., "Thanks! And what\'s your name so I can make sure everything is set up perfectly?"). (2) When customer then provides their name in the NEXT message, NOW call this tool with both name AND contact info. (3) If customer ignores or declines to give name in their next message, THEN call this tool with just the contact info - do NOT insist or ask again. (4) If customer provides BOTH name AND contact info in same message, call this tool immediately. REQUIREMENTS: You need at least ONE contact method - either email OR phone number (or both). Name is optional but PREFERRED - always try to ask for it once before capturing.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Customer name (optional - only include if actually provided by customer)'
          },
          email: {
            type: 'string',
            description: 'Customer email address (required if phone is not provided)'
          },
          phone: {
            type: 'string',
            description: 'Customer phone number (required if email is not provided)'
          },
          message: {
            type: 'string',
            description: 'Any additional message or inquiry from the customer (optional)'
          }
        },
        required: []
      }
    }
  }
];
