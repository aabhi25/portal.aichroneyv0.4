import { Sparkles, Maximize2, Minimize2, Zap, Send, Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ProductCard } from "@/components/ProductCard";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  products?: any[];
}

interface WidgetSettings {
  id: string;
  businessAccountId: string;
  chatColor: string;
  chatColorEnd: string;
  widgetHeaderText: string;
  welcomeMessageType: string;
  welcomeMessage: string;
  buttonStyle: string;
  buttonAnimation: string;
  personality: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: string;
  username: string;
  role: string;
  businessAccountId: string | null;
}

export default function Home() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Fetch widget settings (scoped by businessAccountId via session)
  const { data: settings, isLoading: settingsLoading } = useQuery<WidgetSettings>({
    queryKey: ["/api/widget-settings"],
  });

  // Fetch API key status
  const { data: apiKeyData } = useQuery<{ hasKey: boolean; maskedKey: string | null }>({
    queryKey: ["/api/settings/openai-key"],
  });

  // Use actual settings values (no defaults to prevent flash)
  const chatColor = settings?.chatColor || "#9333ea";
  const chatColorEnd = settings?.chatColorEnd || "#3b82f6";
  const widgetHeaderText = settings?.widgetHeaderText || "Hi Chroney";
  const currency = settings?.currency || "USD";
  
  // Map currency code to symbol
  const currencySymbols: Record<string, string> = {
    USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", INR: "₹", AUD: "A$",
    CAD: "C$", CHF: "CHF", SEK: "kr", NZD: "NZ$", SGD: "S$", HKD: "HK$",
    NOK: "kr", MXN: "$", BRL: "R$", ZAR: "R", KRW: "₩", TRY: "₺",
    RUB: "₽", IDR: "Rp", THB: "฿", MYR: "RM"
  };
  const currencySymbol = currencySymbols[currency] || "$";
  
  // Check if chat is available (API key is configured)
  const isChatAvailable = apiKeyData?.hasKey ?? true;

  // Check chat status and load intro on mount (parallelized for faster loading)
  useEffect(() => {
    const init = async () => {
      // Phase 1: Reset memory on chat open to prevent context pollution
      try {
        await fetch('/api/chat/reset', {
          method: 'POST',
          credentials: 'include'
        });
        console.log('[Chat] Memory reset - starting fresh conversation');
      } catch (error) {
        console.error('[Chat] Failed to reset memory:', error);
      }

      // Run both calls in parallel instead of sequential
      await Promise.all([
        checkStatus(),
        loadIntroMessage()
      ]);
    };
    init();
  }, [isChatAvailable]);

  const loadIntroMessage = async () => {
    // Check if API key is available first
    if (!isChatAvailable) {
      setMessages([{
        id: '1',
        role: 'assistant',
        content: "⚠️ Chroney is currently offline. Please configure your OpenAI API key in Settings to enable the chat functionality.",
        timestamp: new Date()
      }]);
      setIsOnline(false);
      return;
    }

    try {
      const response = await fetch('/api/chat/intro', {
        credentials: 'include'
      });
      
      console.log('Intro API response status:', response.status, response.ok);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Response is not JSON, content-type:', contentType);
        throw new Error('Response is not JSON');
      }
      
      const data = await response.json();
      console.log('Intro API data:', data);
      
      if (data.intro) {
        setMessages([{
          id: '1',
          role: 'assistant',
          content: data.intro,
          timestamp: new Date()
        }]);
      } else {
        // Fallback to default message
        setMessages([{
          id: '1',
          role: 'assistant',
          content: "Sup, human? Chroney reporting for duty 🤖. Tell me what you want—products, FAQs, or capture a lead—I'm here to help!",
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Failed to load intro:', error);
      // Fallback to default message
      setMessages([{
        id: '1',
        role: 'assistant',
        content: "Sup, human? Chroney reporting for duty 🤖. Tell me what you want—products, FAQs, or capture a lead—I'm here to help!",
        timestamp: new Date()
      }]);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const checkStatus = async () => {
    try {
      const response = await fetch('/api/chat/status', {
        credentials: 'include'
      });
      const data = await response.json();
      setIsOnline(data.status === 'online');
    } catch (error) {
      setIsOnline(false);
    }
  };

  // Phase 1: Minimalistic typing indicator
  const getTypingMessage = (query: string): string => {
    return '.....';
  };

  // Phase 2: Word-by-word typing animation for smooth UX (80ms delay)
  const animateTyping = (fullText: string, messageId: string, products?: any[]) => {
    const words = fullText.split(' ');
    let currentIndex = 0;

    // Set initial empty message
    setMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? { ...msg, content: '', products: products || msg.products }
        : msg
    ));

    const typingInterval = setInterval(() => {
      if (currentIndex < words.length) {
        const currentText = words.slice(0, currentIndex + 1).join(' ');
        setMessages(prev => 
          prev.map(msg => 
            msg.id === messageId 
              ? { ...msg, content: currentText, products: products || msg.products }
              : msg
          )
        );
        currentIndex++;
      } else {
        clearInterval(typingInterval);
      }
    }, 80); // 80ms delay between words for smooth animation
  };

  const sendMessage = async () => {
    if (!message.trim() || isLoading || !isChatAvailable) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const userQuery = message.trim();
    setMessage("");
    setIsLoading(true);

    // Add placeholder AI message for streaming with context-aware typing indicator
    const aiMessageId = (Date.now() + 1).toString();
    setStreamingMessageId(aiMessageId);
    const aiMessage: ChatMessage = {
      id: aiMessageId,
      role: 'assistant',
      content: getTypingMessage(userQuery), // Phase 1: Context-aware loading message
      timestamp: new Date()
    };
    setMessages(prev => [...prev, aiMessage]);

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ message: userMessage.content })
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Stream not available');
      }

      let streamedContent = '';
      let productsData: any[] | null = null; // Local variable to avoid async state issues
      let pendingUpdate = false;

      // Batch streaming updates using requestAnimationFrame to reduce re-renders
      const updateStreamingMessage = () => {
        if (pendingUpdate) return;
        pendingUpdate = true;
        
        requestAnimationFrame(() => {
          setMessages(prev => prev.map(msg => 
            msg.id === aiMessageId 
              ? { ...msg, content: streamedContent }
              : msg
          ));
          pendingUpdate = false;
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'content') {
              streamedContent += data.data;
              updateStreamingMessage(); // Batched update
            } else if (data.type === 'products') {
              // Capture product data for special rendering in local variable
              productsData = JSON.parse(data.data);
              console.log('[Chat] Received products data:', productsData);
            } else if (data.type === 'final') {
              // Phase 2: Use word-by-word animation for final response (smooth UX)
              console.log('[Chat] Final message, attaching products and animating:', productsData);
              animateTyping(data.data, aiMessageId, productsData || undefined);
            } else if (data.type === 'error') {
              throw new Error(data.data);
            }
          }
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive"
      });
      
      setMessages(prev => prev.map(msg => 
        msg.id === aiMessageId 
          ? { ...msg, content: "Sorry, I'm having trouble processing that right now. Please try again." }
          : msg
      ));
    } finally {
      setIsLoading(false);
      setStreamingMessageId(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Show loading state while settings are being fetched to prevent flash of default content
  if (settingsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
          <p className="text-sm text-gray-500">Loading chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="container mx-auto p-4 md:p-6 w-full h-full max-w-7xl">
        {/* Minimized State - Compact Header Bar */}
        {!isExpanded && (
          <div className="bg-white rounded-full shadow-lg px-6 py-3 flex items-center justify-between max-w-2xl mx-auto">
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
              >
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">{widgetHeaderText}</h2>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-gray-300'}`}></div>
                  <span>{isOnline ? 'Online' : 'Offline'}</span>
                </div>
              </div>
            </div>
            <Button
              onClick={() => setIsExpanded(true)}
              className="text-white px-6 py-2 rounded-full"
              style={{ 
                background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})`,
              }}
            >
              Chat
            </Button>
          </div>
        )}

        {/* Expanded State - Full Chat Window */}
        {isExpanded && (
          <div className="bg-white rounded-2xl shadow-lg h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
            {/* Chat Header */}
            <div 
              className="p-4 flex items-center justify-between"
              style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
            >
              <div className="flex items-center gap-3">
                <div className="text-white">
                  <h2 className="font-semibold text-lg">{widgetHeaderText}</h2>
                  <div className="flex items-center gap-2 text-sm">
                    <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-gray-300'}`}></div>
                    <span className="opacity-90">{isOnline ? 'Online' : 'Offline'}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={() => setIsExpanded(false)}
                >
                  <Minimize2 className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-white space-y-4">
            {messages.filter(msg => msg.content.trim() !== '' || msg.role === 'user' || msg.id === streamingMessageId).map((msg) => (
              <div key={msg.id} className={`flex gap-3 items-start ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.role === 'assistant' && (
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
                  >
                    <Sparkles className={`w-5 h-5 text-white ${msg.content === '.....' ? 'animate-spin' : ''}`} />
                  </div>
                )}
                <div className={`flex-1 ${msg.role === 'user' ? 'flex flex-col items-end' : ''}`}>
                  <div 
                    className={`${
                      msg.role === 'assistant' 
                        ? 'bg-gray-100 rounded-2xl rounded-tl-sm' 
                        : 'text-white rounded-2xl rounded-tr-sm'
                    } p-4 inline-block max-w-3xl`}
                    style={msg.role === 'user' ? { background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` } : undefined}
                  >
                    {msg.role === 'assistant' && msg.content === '.....' ? (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    ) : (
                      <p className={`${msg.role === 'assistant' ? 'text-gray-900' : 'text-white'} leading-relaxed whitespace-pre-wrap font-['Poppins']`}>
                        {msg.content}
                      </p>
                    )}
                    {msg.products && msg.products.length > 0 && (
                      <div className="mt-4">
                        <ProductCard products={msg.products} currencySymbol={currencySymbol} />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{formatTime(msg.timestamp)}</p>
                </div>
              </div>
            ))}
            
            <div ref={messagesEndRef} />
          </div>

            {/* Chat Input Area */}
            <div className="border-t border-gray-200 p-4 bg-white">
              <div className="flex items-center gap-3">
                <div className="text-purple-600 flex-shrink-0 p-2">
                  <Zap className="w-5 h-5" />
                </div>
                <Input
                  type="text"
                  placeholder={isChatAvailable ? `Ask ${widgetHeaderText} anything... (e.g., 'Show products', 'Find FAQs')` : "Chat offline - Configure API key in Settings"}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isLoading || !isChatAvailable}
                  className="flex-1 h-12 rounded-xl border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                />
                <Button
                  size="icon"
                  onClick={sendMessage}
                  disabled={isLoading || !message.trim() || !isChatAvailable}
                  className="h-12 w-12 rounded-xl shadow-md flex-shrink-0 disabled:opacity-50"
                  style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                  ) : (
                    <Send className="w-5 h-5 text-white" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
