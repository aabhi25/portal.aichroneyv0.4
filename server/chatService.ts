import { llamaService } from './llamaService';
import { aiTools, selectRelevantTools } from './aiTools';
import { ToolExecutionService } from './services/toolExecutionService';
import { conversationMemory } from './conversationMemory';
import { storage } from './storage';
import { businessContextCache } from './services/businessContextCache';

interface ChatContext {
  userId: string;
  businessAccountId: string;
  personality?: string;
  companyDescription?: string;
  openaiApiKey?: string | null;
  currency?: string;
  currencySymbol?: string;
  customInstructions?: string;
}

// Track active conversation IDs for each user session
const activeConversations = new Map<string, string>();

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class ChatService {
  // Get or create a conversation for the current session
  private async getOrCreateConversation(context: ChatContext): Promise<string> {
    const sessionKey = `${context.userId}_${context.businessAccountId}`;
    
    // Check if we have an active conversation for this session
    let conversationId = activeConversations.get(sessionKey);
    
    if (!conversationId) {
      // Create a new conversation in the database
      const conversation = await storage.createConversation({
        businessAccountId: context.businessAccountId,
        title: 'Anonymous'
      });
      conversationId = conversation.id;
      activeConversations.set(sessionKey, conversationId);
      
      console.log('[Chat] Created new conversation:', conversationId);
    }
    
    return conversationId;
  }

  // Store message in database
  private async storeMessageInDB(conversationId: string, role: 'user' | 'assistant', content: string): Promise<void> {
    try {
      await storage.createMessage({
        conversationId,
        role,
        content
      });
      
      // Update conversation timestamp
      await storage.updateConversationTimestamp(conversationId);
    } catch (error) {
      console.error('[Chat] Error storing message in DB:', error);
    }
  }

  async processMessage(userMessage: string, context: ChatContext): Promise<string> {
    try {
      // Get or create conversation
      const conversationId = await this.getOrCreateConversation(context);
      
      // Get conversation history
      const history = conversationMemory.getConversationHistory(context.userId);
      
      // Store user message in memory and database
      conversationMemory.storeMessage(context.userId, 'user', userMessage);
      await this.storeMessageInDB(conversationId, 'user', userMessage);

      // Build enriched system context with company info and all FAQs
      const systemContext = await this.buildEnrichedContext(context);

      // Phase 3 Task 10: Use smart tool selection for 40-70% token savings
      const relevantTools = selectRelevantTools(userMessage);

      // Get AI response with tool awareness
      const aiResponse = await llamaService.generateToolAwareResponse(
        userMessage,
        relevantTools,
        history,
        systemContext,
        context.personality || 'friendly',
        context.openaiApiKey || undefined
      );

      // Log tool calls for debugging
      console.log('[Chat] User message:', userMessage);
      console.log('[Chat] Tool calls received:', aiResponse.tool_calls ? aiResponse.tool_calls.length : 0);
      if (aiResponse.tool_calls) {
        aiResponse.tool_calls.forEach((tc: any) => {
          console.log('[Chat] Tool:', tc.function.name, 'Args:', tc.function.arguments);
        });
      }

      // Handle tool calls if any
      if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
        return await this.handleToolCalls(aiResponse, context, userMessage, relevantTools);
      }

      // Simple conversational response
      const responseContent = aiResponse.content || 'I apologize, but I could not generate a response.';
      conversationMemory.storeMessage(context.userId, 'assistant', responseContent);
      await this.storeMessageInDB(conversationId, 'assistant', responseContent);
      
      return responseContent;
    } catch (error: any) {
      console.error('Chat service error:', error);
      return "I'm having trouble processing your request right now. Please try again.";
    }
  }

  private async handleToolCalls(
    aiResponse: any,
    context: ChatContext,
    userMessage: string,
    relevantTools: any[]
  ): Promise<string | { response: string; products?: any[] }> {
    // Get conversationId first so we can pass it to tools
    const conversationId = await this.getOrCreateConversation(context);
    
    // Rebuild conversation history to include the latest user message
    const updatedHistory = conversationMemory.getConversationHistory(context.userId);
    
    const messages: any[] = [
      ...updatedHistory,
      { role: 'assistant' as const, content: aiResponse.content || '', tool_calls: aiResponse.tool_calls }
    ];

    // Track products if get_products tool is called
    let products: any[] | undefined;

    // Execute all tool calls
    for (const toolCall of aiResponse.tool_calls) {
      const toolName = toolCall.function.name;
      const toolParams = JSON.parse(toolCall.function.arguments);

      const result = await ToolExecutionService.executeTool(
        toolName,
        toolParams,
        {
          businessAccountId: context.businessAccountId,
          userId: context.userId,
          conversationId: conversationId
        }
      );

      // Capture products if this was a get_products call
      if (toolName === 'get_products' && result.success && result.data) {
        products = result.data;
      }

      // Add tool result to messages
      messages.push({
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });
    }

    // Get final response from AI with tool results (using same relevant tools)
    const finalResponse = await llamaService.continueToolConversation(
      messages,
      relevantTools,
      context.personality || 'friendly',
      context.openaiApiKey || undefined
    );

    const responseContent = finalResponse.content || 'I processed your request.';
    conversationMemory.storeMessage(context.userId, 'assistant', responseContent);
    await this.storeMessageInDB(conversationId, 'assistant', responseContent);
    
    // Return products along with response if products were retrieved
    if (products && products.length > 0) {
      return { response: responseContent, products };
    }
    
    return responseContent;
  }

  async *streamMessage(userMessage: string, context: ChatContext) {
    try {
      // Get or create conversation
      const conversationId = await this.getOrCreateConversation(context);
      
      // Get conversation history
      const history = conversationMemory.getConversationHistory(context.userId);
      
      // Store user message in memory and database
      conversationMemory.storeMessage(context.userId, 'user', userMessage);
      await this.storeMessageInDB(conversationId, 'user', userMessage);

      let fullResponse = '';
      let hasToolCalls = false;
      const toolCalls: any[] = [];
      let bufferedContent: string[] = []; // Buffer content to conditionally stream

      // Build enriched system context with company info and all FAQs
      const systemContext = await this.buildEnrichedContext(context);

      // Phase 3 Task 10: Use smart tool selection for 40-70% token savings
      const relevantTools = selectRelevantTools(userMessage);

      // Stream AI response
      for await (const chunk of llamaService.streamToolAwareResponse(
        userMessage,
        relevantTools,
        history,
        systemContext,
        context.personality || 'friendly',
        context.openaiApiKey || undefined
      )) {
        const delta = chunk.choices[0]?.delta;
        
        // Check for tool calls
        if (delta.tool_calls) {
          hasToolCalls = true;
          for (const toolCall of delta.tool_calls) {
            if (!toolCalls[toolCall.index]) {
              toolCalls[toolCall.index] = {
                id: toolCall.id || '',
                type: 'function',
                function: { name: toolCall.function?.name || '', arguments: '' }
              };
            }
            if (toolCall.function?.arguments) {
              toolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
            }
          }
        }
        
        // Buffer text content instead of streaming immediately
        if (delta.content) {
          fullResponse += delta.content;
          bufferedContent.push(delta.content);
        }
      }

      // If NO tool calls detected, stream the buffered content now
      if (!hasToolCalls) {
        for (const content of bufferedContent) {
          yield { type: 'content', data: content };
        }
      }
      // If tool calls ARE detected, discard buffered content (don't stream the initial text)

      // Log tool calls for debugging
      console.log('[Chat Stream] User message:', userMessage);
      console.log('[Chat Stream] Tool calls detected:', hasToolCalls);
      console.log('[Chat Stream] Tool calls count:', toolCalls.length);
      if (toolCalls.length > 0) {
        toolCalls.forEach((tc: any) => {
          console.log('[Chat Stream] Tool:', tc.function.name, 'Args:', tc.function.arguments);
        });
      }

      // Handle tool calls if any
      if (hasToolCalls && toolCalls.length > 0) {
        yield { type: 'tool_start', data: '' };
        
        const updatedHistory = conversationMemory.getConversationHistory(context.userId);
        const messages: any[] = [
          ...updatedHistory,
          { role: 'assistant', content: fullResponse, tool_calls: toolCalls }
        ];

        // Execute tools
        let productData: any = null;
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          const toolParams = JSON.parse(toolCall.function.arguments);

          console.log('[Chat Stream] Executing tool:', toolName, 'with params:', toolParams);
          const result = await ToolExecutionService.executeTool(
            toolName,
            toolParams,
            {
              businessAccountId: context.businessAccountId,
              userId: context.userId,
              conversationId: conversationId
            }
          );
          console.log('[Chat Stream] Tool result:', toolName, 'returned', JSON.stringify(result).substring(0, 100));

          // Capture product data for special rendering
          if (toolName === 'get_products' && result.success && 'data' in result && result.data) {
            productData = result.data;
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });
        }

        // Send product data for special rendering
        if (productData) {
          yield { type: 'products', data: JSON.stringify(productData) };
        }

        // Get final response (using same relevant tools)
        const finalResponse = await llamaService.continueToolConversation(
          messages, 
          relevantTools,
          context.personality || 'friendly',
          context.openaiApiKey || undefined
        );
        const finalContent = finalResponse.content || '';
        
        conversationMemory.storeMessage(context.userId, 'assistant', finalContent);
        await this.storeMessageInDB(conversationId, 'assistant', finalContent);
        yield { type: 'final', data: finalContent };
      } else {
        // No tool calls, store the response
        console.log('[Chat Stream] WARNING: No tool calls made for question:', userMessage);
        conversationMemory.storeMessage(context.userId, 'assistant', fullResponse);
        await this.storeMessageInDB(conversationId, 'assistant', fullResponse);
      }

      yield { type: 'done', data: '' };
    } catch (error: any) {
      console.error('Chat streaming error:', error);
      yield { type: 'error', data: error.message };
    }
  }

  clearConversation(userId: string, businessAccountId: string) {
    conversationMemory.clearConversation(userId);
    // Clear active conversation tracking to start a new conversation next time
    const sessionKey = `${userId}_${businessAccountId}`;
    activeConversations.delete(sessionKey);
  }

  // Phase 3: Optimized context building with caching (5-minute TTL) and parallel loading
  private async buildEnrichedContext(context: ChatContext): Promise<string> {
    const startTime = Date.now();
    
    // Phase 3 Task 8: Use cache for business context (FAQs, settings, etc.)
    const cacheKey = `business_context_${context.businessAccountId}`;
    
    const businessContext = await businessContextCache.getOrFetch(cacheKey, async () => {
      let enrichedContext = '';

      // Add custom business instructions (highest priority)
      if (context.customInstructions && context.customInstructions.trim()) {
        try {
          // Try to parse as JSON array (new format)
          const instructions = JSON.parse(context.customInstructions);
          if (Array.isArray(instructions) && instructions.length > 0) {
            const formattedInstructions = instructions
              .map((instr: any, index: number) => `${index + 1}. ${instr.text}`)
              .join('\n');
            enrichedContext += `CUSTOM BUSINESS INSTRUCTIONS:\nFollow these specific instructions for this business:\n${formattedInstructions}\n\n`;
          }
        } catch {
          // Fallback to plain text format (legacy)
          enrichedContext += `CUSTOM BUSINESS INSTRUCTIONS:\nFollow these specific instructions for this business:\n${context.customInstructions}\n\n`;
        }
      }

      // Add currency information
      if (context.currency && context.currencySymbol) {
        enrichedContext += `CURRENCY SETTINGS:\nAll prices should be referenced in ${context.currency} (${context.currencySymbol}). When discussing prices, always use ${context.currencySymbol} as the currency symbol.\n\n`;
      }

      // Add company description
      if (context.companyDescription) {
        enrichedContext += `COMPANY INFORMATION:\n${context.companyDescription}\n\n`;
      }

      // Load and add PUBLISHED FAQs ONLY to context (draft_faqs are excluded)
      // FAQs are now filtered at database level by businessAccountId
      try {
        // getAllFaqs() retrieves only FAQs for this specific business account
        const businessFaqs = await storage.getAllFaqs(context.businessAccountId);

        if (businessFaqs.length > 0) {
          enrichedContext += `KNOWLEDGE BASE (FAQs):\nYou have complete knowledge of the following frequently asked questions. Answer these questions directly from your knowledge without mentioning FAQs:\n\n`;
          
          businessFaqs.forEach((faq, index) => {
            enrichedContext += `${index + 1}. Q: ${faq.question}\n   A: ${faq.answer}\n\n`;
          });

          enrichedContext += `IMPORTANT: When customers ask questions related to the above topics, answer directly and naturally from your knowledge. DO NOT mention that you're checking FAQs or looking up information - just provide the answer as if you know it by heart.\n\n`;
        }
      } catch (error) {
        console.error('[Chat Context] Error loading FAQs:', error);
      }

      // Load and add website analysis if available
      try {
        const { websiteAnalysisService } = await import("./websiteAnalysisService");
        const websiteContent = await websiteAnalysisService.getAnalyzedContent(context.businessAccountId);

        if (websiteContent) {
          enrichedContext += `BUSINESS KNOWLEDGE (from website analysis):\n`;
          enrichedContext += `You have comprehensive knowledge about this business extracted from their website.\n\n`;
          
          if (websiteContent.businessName) {
            enrichedContext += `Business Name: ${websiteContent.businessName}\n\n`;
          }
          
          if (websiteContent.businessDescription) {
            enrichedContext += `About: ${websiteContent.businessDescription}\n\n`;
          }
          
          if (websiteContent.targetAudience) {
            enrichedContext += `Target Audience: ${websiteContent.targetAudience}\n\n`;
          }
          
          if (websiteContent.mainProducts && websiteContent.mainProducts.length > 0) {
            enrichedContext += `Main Products:\n${websiteContent.mainProducts.map(p => `- ${p}`).join('\n')}\n\n`;
          }
          
          if (websiteContent.mainServices && websiteContent.mainServices.length > 0) {
            enrichedContext += `Main Services:\n${websiteContent.mainServices.map(s => `- ${s}`).join('\n')}\n\n`;
          }
          
          if (websiteContent.keyFeatures && websiteContent.keyFeatures.length > 0) {
            enrichedContext += `Key Features:\n${websiteContent.keyFeatures.map(f => `- ${f}`).join('\n')}\n\n`;
          }
          
          if (websiteContent.uniqueSellingPoints && websiteContent.uniqueSellingPoints.length > 0) {
            enrichedContext += `Unique Selling Points:\n${websiteContent.uniqueSellingPoints.map(u => `- ${u}`).join('\n')}\n\n`;
          }
          
          if (websiteContent.contactInfo && (websiteContent.contactInfo.email || websiteContent.contactInfo.phone || websiteContent.contactInfo.address)) {
            enrichedContext += `Contact Information:\n`;
            if (websiteContent.contactInfo.email) enrichedContext += `- Email: ${websiteContent.contactInfo.email}\n`;
            if (websiteContent.contactInfo.phone) enrichedContext += `- Phone: ${websiteContent.contactInfo.phone}\n`;
            if (websiteContent.contactInfo.address) enrichedContext += `- Address: ${websiteContent.contactInfo.address}\n`;
            enrichedContext += '\n';
          }
          
          if (websiteContent.businessHours) {
            enrichedContext += `Business Hours: ${websiteContent.businessHours}\n\n`;
          }
          
          if (websiteContent.pricingInfo) {
            enrichedContext += `Pricing: ${websiteContent.pricingInfo}\n\n`;
          }
          
          if (websiteContent.additionalInfo) {
            enrichedContext += `Additional Information: ${websiteContent.additionalInfo}\n\n`;
          }
          
          enrichedContext += `IMPORTANT: Use this website knowledge to provide accurate, context-aware responses about the business. Answer naturally without mentioning that you analyzed their website.\n\n`;
        }
      } catch (error) {
        console.error('[Chat Context] Error loading website analysis:', error);
      }

      return enrichedContext;
    });

    const elapsed = Date.now() - startTime;
    console.log(`[Context Build] Business context loaded in ${elapsed}ms`);
    console.log(`[Context Build] Context length: ${businessContext.length} characters`);
    console.log(`[Context Build] Has FAQs: ${businessContext.includes('KNOWLEDGE BASE')}`);
    console.log(`[Context Build] Has Custom Instructions: ${businessContext.includes('CUSTOM BUSINESS INSTRUCTIONS')}`);

    return businessContext;
  }
}

export const chatService = new ChatService();
