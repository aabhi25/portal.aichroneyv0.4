import { Sparkles, Zap, Send, Loader2 } from "lucide-react";
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

export default function EmbedChat() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Generate unique session ID on mount (resets conversation on page refresh)
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  
  // Get businessAccountId from URL params using React state to ensure it reads correctly
  const [businessAccountId, setBusinessAccountId] = useState<string | null>(null);

  useEffect(() => {
    // Get businessAccountId from URL params
    const urlParams = new URLSearchParams(window.location.search);
    let id = urlParams.get('businessAccountId');
    
    // If not in search params, try hash (for client-side routing)
    if (!id && window.location.hash) {
      const hash = window.location.hash;
      if (hash.includes('?')) {
        const hashParams = new URLSearchParams(hash.split('?')[1]);
        id = hashParams.get('businessAccountId');
      }
    }
    
    if (id) {
      setBusinessAccountId(id);
    }
  }, []);

  // Fetch widget settings for this business account
  const { data: settings } = useQuery<WidgetSettings>({
    queryKey: [`/api/widget-settings/public?businessAccountId=${businessAccountId}`],
    enabled: !!businessAccountId,
  });

  // Use actual settings values
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

  // Load intro message on mount
  useEffect(() => {
    if (!businessAccountId) return;
    
    const loadIntro = async () => {
      try {
        const response = await fetch(`/api/chat/widget/intro?businessAccountId=${encodeURIComponent(businessAccountId)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.intro) {
            setMessages([{
              id: '1',
              role: 'assistant',
              content: data.intro,
              timestamp: new Date()
            }]);
            setIsOnline(true);
          }
        }
      } catch (error) {
        console.error('Failed to load intro:', error);
        setIsOnline(false);
      }
    };
    
    loadIntro();
  }, [businessAccountId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Word-by-word typing animation for smooth UX (80ms delay)
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
    if (!message.trim() || isLoading || !businessAccountId) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setMessage("");
    setIsLoading(true);

    // Add placeholder AI message with typing indicator
    const aiMessageId = (Date.now() + 1).toString();
    setStreamingMessageId(aiMessageId);
    setMessages(prev => [...prev, {
      id: aiMessageId,
      role: 'assistant',
      content: '.....',
      timestamp: new Date()
    }]);

    let productsData: any[] | undefined;

    try {
      const response = await fetch('/api/chat/widget/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMessage.content, 
          businessAccountId,
          sessionId: sessionIdRef.current 
        }),
      });

      if (!response.ok) throw new Error('Chat request failed');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No response reader');

      setStreamingMessageId(aiMessageId);
      let streamedContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr === '[DONE]') continue;

            try {
              const data = JSON.parse(jsonStr);
              if (data.type === 'content') {
                streamedContent += data.data;
                setMessages(prev => {
                  const filtered = prev.filter(m => m.id !== aiMessageId);
                  return [...filtered, {
                    id: aiMessageId,
                    role: 'assistant',
                    content: streamedContent,
                    timestamp: new Date(),
                    products: productsData
                  }];
                });
              } else if (data.type === 'products') {
                productsData = JSON.parse(data.data);
              } else if (data.type === 'final') {
                // Use word-by-word animation for final response (smooth UX)
                animateTyping(data.data, aiMessageId, productsData || undefined);
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setStreamingMessageId(null);
    }
  };

  if (!businessAccountId) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <p className="text-gray-600">Missing businessAccountId parameter</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Chat Header */}
      <div 
        className="flex items-center gap-3 p-4 text-white shadow-lg"
        style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
      >
        <Sparkles className="w-6 h-6" />
        <div className="flex-1">
          <h2 className="font-semibold text-lg">{widgetHeaderText}</h2>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-2' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-2 mb-2">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                    style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
                  >
                    <Sparkles className={`w-4 h-4 ${msg.content === '.....' ? 'animate-spin' : ''}`} />
                  </div>
                  <span className="text-xs text-gray-500">{widgetHeaderText}</span>
                </div>
              )}
              <div
                className={`rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
                style={msg.role === 'user' ? { background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` } : {}}
              >
                {msg.role === 'assistant' && msg.content === '.....' ? (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                )}
                {msg.products && msg.products.length > 0 && (
                  <div className="mt-3">
                    <ProductCard products={msg.products} currencySymbol={currencySymbol} />
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-1 px-2">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <div className="border-t border-gray-200 p-4 bg-white">
        <div className="flex items-center gap-3">
          <Input
            type="text"
            placeholder={`Ask ${widgetHeaderText} anything...`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            className="flex-1 h-12 rounded-xl border-gray-300 focus:border-purple-500 focus:ring-purple-500 text-sm placeholder:text-sm"
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={isLoading || !message.trim()}
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
  );
}
