interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface UserConversation {
  messages: ConversationMessage[];
  lastActivity: Date;
}

export class ConversationMemoryService {
  private conversations: Map<string, UserConversation> = new Map();
  private readonly RETENTION_MINUTES = 15;

  storeMessage(userId: string, role: 'user' | 'assistant', content: string) {
    const conversation = this.conversations.get(userId) || {
      messages: [],
      lastActivity: new Date()
    };

    conversation.messages.push({
      role,
      content,
      timestamp: new Date()
    });

    conversation.lastActivity = new Date();
    this.conversations.set(userId, conversation);

    this.cleanupOldMessages(userId);
  }

  getConversationHistory(userId: string): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    this.cleanupExpiredConversations();
    const conversation = this.conversations.get(userId);
    
    if (!conversation) {
      return [];
    }

    return conversation.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  clearConversation(userId: string) {
    this.conversations.delete(userId);
  }

  private cleanupOldMessages(userId: string) {
    const conversation = this.conversations.get(userId);
    if (!conversation) return;

    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - this.RETENTION_MINUTES);

    conversation.messages = conversation.messages.filter(
      msg => msg.timestamp > cutoffTime
    );

    if (conversation.messages.length === 0) {
      this.conversations.delete(userId);
    }
  }

  private cleanupExpiredConversations() {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - this.RETENTION_MINUTES);

    Array.from(this.conversations.entries()).forEach(([userId, conversation]) => {
      if (conversation.lastActivity < cutoffTime) {
        this.conversations.delete(userId);
      }
    });
  }
}

export const conversationMemory = new ConversationMemoryService();
