import { storage } from '../storage';
import { ilike, or } from 'drizzle-orm';

interface ToolExecutionContext {
  businessAccountId: string;
  userId: string;
  conversationId?: string;
}

export class ToolExecutionService {
  static async executeTool(
    toolName: string,
    parameters: any,
    context: ToolExecutionContext
  ) {
    try {
      switch (toolName) {
        case 'get_products':
          return await this.handleGetProducts(parameters, context);
        
        case 'get_faqs':
          return await this.handleGetFaqs(parameters, context);
        
        case 'capture_lead':
          return await this.handleCaptureLead(parameters, context);
        
        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Tool execution failed'
      };
    }
  }

  private static async handleGetProducts(params: any, context: ToolExecutionContext) {
    // Get products filtered by business account at database level
    const businessProducts = await storage.getAllProducts(context.businessAccountId);

    // Fetch categories and tags for ALL products first (needed for search)
    const productsWithMeta = await Promise.all(
      businessProducts.map(async (p) => {
        const [categories, tags] = await Promise.all([
          storage.getProductCategories(p.id),
          storage.getProductTags(p.id)
        ]);

        return {
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          imageUrl: p.imageUrl,
          categories: categories.map(c => ({ id: c.id, name: c.name })),
          tags: tags.map(t => ({ id: t.id, name: t.name, color: t.color }))
        };
      })
    );

    // Apply search if provided - search across name, description, categories, and tags
    let filteredProducts = productsWithMeta;
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filteredProducts = productsWithMeta.filter(p => {
        // Search in name and description
        const matchesNameOrDesc = p.name.toLowerCase().includes(searchLower) ||
          p.description.toLowerCase().includes(searchLower);
        
        // Search in category names
        const matchesCategory = p.categories.some(c => 
          c.name.toLowerCase().includes(searchLower)
        );
        
        // Search in tag names
        const matchesTag = p.tags.some(t => 
          t.name.toLowerCase().includes(searchLower)
        );
        
        return matchesNameOrDesc || matchesCategory || matchesTag;
      });
    }

    // Apply price filters if provided
    if (params.min_price !== undefined || params.max_price !== undefined) {
      filteredProducts = filteredProducts.filter(p => {
        // Skip products without prices when filtering by price
        if (p.price === null || p.price === undefined) {
          return false;
        }
        
        const price = parseFloat(p.price.toString());
        
        // Check minimum price
        if (params.min_price !== undefined && price < params.min_price) {
          return false;
        }
        
        // Check maximum price
        if (params.max_price !== undefined && price > params.max_price) {
          return false;
        }
        
        return true;
      });
    }

    // Apply pagination - max 5 products per request
    const limit = 5;
    const offset = params.offset || 0;
    const totalCount = filteredProducts.length;
    const paginatedProducts = filteredProducts.slice(offset, offset + limit);
    const hasMore = (offset + limit) < totalCount;
    const nextOffset = hasMore ? offset + limit : null;

    return {
      success: true,
      data: paginatedProducts,
      pagination: {
        total: totalCount,
        offset: offset,
        limit: limit,
        hasMore: hasMore,
        nextOffset: nextOffset,
        showing: paginatedProducts.length
      },
      message: paginatedProducts.length > 0 
        ? `Showing ${paginatedProducts.length} of ${totalCount} product(s)` 
        : 'No products found'
    };
  }

  private static async handleGetFaqs(params: any, context: ToolExecutionContext) {
    // Get FAQs filtered by business account at database level
    const businessFaqs = await storage.getAllFaqs(context.businessAccountId);

    // Apply search if provided - use keyword-based matching for better results
    let filteredFaqs = businessFaqs;
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      
      // Extract keywords from search (remove common words)
      const stopWords = ['is', 'are', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from'];
      const searchKeywords = searchLower
        .split(/\s+/)
        .filter((word: string) => word.length > 2 && !stopWords.includes(word));
      
      filteredFaqs = businessFaqs.filter(f => {
        const questionLower = f.question.toLowerCase();
        const answerLower = f.answer.toLowerCase();
        
        // First try exact substring match
        if (questionLower.includes(searchLower) || answerLower.includes(searchLower)) {
          return true;
        }
        
        // Then try keyword matching - at least 50% of keywords must match
        if (searchKeywords.length > 0) {
          const matchCount = searchKeywords.filter((keyword: string) => 
            questionLower.includes(keyword) || answerLower.includes(keyword)
          ).length;
          const matchPercentage = matchCount / searchKeywords.length;
          return matchPercentage >= 0.5; // At least 50% of keywords must match
        }
        
        return false;
      });
    }

    // Apply category filter if provided
    if (params.category) {
      filteredFaqs = filteredFaqs.filter(f => 
        f.category?.toLowerCase() === params.category.toLowerCase()
      );
    }

    console.log('[FAQ Search] Query:', params.search);
    console.log('[FAQ Search] Total business FAQs:', businessFaqs.length);
    console.log('[FAQ Search] Filtered results:', filteredFaqs.length);
    if (filteredFaqs.length > 0) {
      console.log('[FAQ Search] Matched questions:', filteredFaqs.map(f => f.question));
    }

    return {
      success: true,
      data: filteredFaqs.map(f => ({
        question: f.question,
        answer: f.answer,
        category: f.category
      })),
      message: filteredFaqs.length > 0 
        ? `Found ${filteredFaqs.length} FAQ(s)` 
        : 'No FAQs found'
    };
  }

  private static async handleCaptureLead(params: any, context: ToolExecutionContext) {
    const { name, email, phone, message } = params;

    // Validate that at least email OR phone is provided
    if (!email && !phone) {
      return {
        success: false,
        error: 'Either email or phone number is required to capture a lead',
        message: 'I need at least your email address or phone number to help you. Could you please share one of them?'
      };
    }

    const lead = await storage.createLead({
      businessAccountId: context.businessAccountId,
      name: name || null,
      email: email || null,
      phone: phone || null,
      message: message || 'Lead captured via AI chat',
      conversationId: null
    });

    // Update conversation title based on priority: name > phone > email
    if (context.conversationId) {
      let newTitle = 'Anonymous';
      
      if (name && name.trim()) {
        newTitle = name.trim();
      } else if (phone && phone.trim()) {
        newTitle = phone.trim();
      } else if (email && email.trim()) {
        newTitle = email.trim();
      }
      
      try {
        await storage.updateConversationTitle(context.conversationId, context.businessAccountId, newTitle);
        console.log(`[Lead Capture] Updated conversation ${context.conversationId} title to: ${newTitle}`);
      } catch (error) {
        console.error('[Lead Capture] Error updating conversation title:', error);
      }
    }

    // Create personalized thank you message
    const thankYouName = name ? name : 'there';
    return {
      success: true,
      data: { leadId: lead.id },
      message: `Thank you, ${thankYouName}! I've saved your contact information. Someone from our team will reach out to you soon.`
    };
  }
}
