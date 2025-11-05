import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Settings, Copy, Check, Sparkles, MessageCircle, Zap, Send } from "lucide-react";

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
  createdAt: string;
  updatedAt: string;
}

export default function WidgetSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [chatColor, setChatColor] = useState("#9333ea");
  const [chatColorEnd, setChatColorEnd] = useState("#3b82f6");
  const [widgetHeaderText, setWidgetHeaderText] = useState("Hi Chroney");
  const [welcomeMessageType, setWelcomeMessageType] = useState("custom");
  const [welcomeMessage, setWelcomeMessage] = useState("Hi! How can I help you today?");
  const [buttonStyle, setButtonStyle] = useState("circular");
  const [buttonAnimation, setButtonAnimation] = useState("bounce");
  const [personality, setPersonality] = useState("friendly");
  const [copied, setCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const { data: settings, isLoading } = useQuery<WidgetSettings>({
    queryKey: ["/api/widget-settings"],
  });

  useEffect(() => {
    if (settings) {
      setChatColor(settings.chatColor);
      setChatColorEnd(settings.chatColorEnd || "#3b82f6");
      setWidgetHeaderText(settings.widgetHeaderText || "Hi Chroney");
      setWelcomeMessageType(settings.welcomeMessageType || "custom");
      setWelcomeMessage(settings.welcomeMessage);
      setButtonStyle(settings.buttonStyle || "circular");
      setButtonAnimation(settings.buttonAnimation || "bounce");
      setPersonality(settings.personality || "friendly");
    }
  }, [settings]);

  // Auto-save effect with debouncing
  useEffect(() => {
    if (!settings) return;
    
    const hasChanges = 
      chatColor !== settings.chatColor ||
      chatColorEnd !== settings.chatColorEnd ||
      widgetHeaderText !== settings.widgetHeaderText ||
      welcomeMessageType !== settings.welcomeMessageType ||
      welcomeMessage !== settings.welcomeMessage ||
      buttonStyle !== settings.buttonStyle ||
      buttonAnimation !== settings.buttonAnimation ||
      personality !== settings.personality;

    if (!hasChanges) {
      setSaveStatus("idle");
      return;
    }
    
    // Debounce: wait 1.5 seconds after last change before saving
    const timeoutId = setTimeout(() => {
      setSaveStatus("saving");
      updateMutation.mutate({ 
        chatColor, 
        chatColorEnd, 
        widgetHeaderText, 
        welcomeMessageType, 
        welcomeMessage, 
        buttonStyle, 
        buttonAnimation, 
        personality
      });
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [settings, chatColor, chatColorEnd, widgetHeaderText, welcomeMessageType, welcomeMessage, buttonStyle, buttonAnimation, personality]);

  const updateMutation = useMutation({
    mutationFn: async (data: { chatColor: string; chatColorEnd: string; widgetHeaderText: string; welcomeMessageType: string; welcomeMessage: string; buttonStyle: string; buttonAnimation: string; personality: string }) => {
      const response = await fetch("/api/widget-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update settings");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all widget-settings queries
      queryClient.invalidateQueries({ 
        queryKey: ["/api/widget-settings"]
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: (error: Error) => {
      setSaveStatus("idle");
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({ chatColor, chatColorEnd, widgetHeaderText, welcomeMessageType, welcomeMessage, buttonStyle, buttonAnimation, personality });
  };

  const hasChanges = settings && (
    chatColor !== settings.chatColor ||
    chatColorEnd !== settings.chatColorEnd ||
    widgetHeaderText !== settings.widgetHeaderText ||
    welcomeMessageType !== settings.welcomeMessageType ||
    welcomeMessage !== settings.welcomeMessage ||
    buttonStyle !== settings.buttonStyle ||
    buttonAnimation !== settings.buttonAnimation ||
    personality !== settings.personality
  );

  // Use production domain for the embed code
  const widgetDomain = 'https://portal.aichroney.com';
  
  // Build minimal config object - only businessAccountId needed!
  // All colors, styles, and settings are automatically fetched from dashboard
  const configObject = {
    businessAccountId: settings?.businessAccountId || 'YOUR_BUSINESS_ID'
  };
  
  // Generate embed code with properly escaped config
  const safeJsonConfig = JSON.stringify(configObject);
  const safeWidgetUrl = JSON.stringify(widgetDomain + '/widget.js');
  
  const embedCode = `<!-- AI Chroney Widget -->
<script>
  (function() {
    var config = ${safeJsonConfig};
    var script = document.createElement('script');
    script.src = ${safeWidgetUrl};
    script.onload = function() {
      if (window.HiChroneyWidget) {
        window.HiChroneyWidget.init(config);
      }
    };
    document.body.appendChild(script);
  })();
</script>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Embed code copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="container mx-auto p-4 md:p-6 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-purple-600" />
            Widget Settings
          </h1>
          <p className="text-gray-600 mt-2">
            Customize your AI Chroney widget appearance and behavior
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Chat Appearance</CardTitle>
              <CardDescription>
                Customize how your chatbot greets your customers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  Welcome Message
                </Label>
                <RadioGroup value={welcomeMessageType} onValueChange={setWelcomeMessageType}>
                  <div className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-gray-50 transition-colors">
                    <RadioGroupItem value="custom" id="custom" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="custom" className="font-medium cursor-pointer">
                        Custom Message
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Write your own personalized welcome message
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-gray-50 transition-colors">
                    <RadioGroupItem value="ai_generated" id="ai_generated" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="ai_generated" className="font-medium cursor-pointer flex items-center gap-1">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        AI-Generated Message
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Let AI create dynamic welcome messages based on your products and company description
                      </p>
                    </div>
                  </div>
                </RadioGroup>

                {welcomeMessageType === "custom" && (
                  <div className="mt-3">
                    <Input
                      id="welcomeMessage"
                      type="text"
                      value={welcomeMessage}
                      onChange={(e) => setWelcomeMessage(e.target.value)}
                      placeholder="Hi! How can I help you today?"
                      maxLength={100}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {welcomeMessage.length}/100 characters
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-4 border-t">
                <Label className="text-sm font-medium">
                  AI Personality
                </Label>
                <p className="text-xs text-gray-500">
                  Choose how Chroney interacts with your customers
                </p>
                <RadioGroup value={personality} onValueChange={setPersonality}>
                  <div className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-gray-50 transition-colors">
                    <RadioGroupItem value="friendly" id="friendly" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="friendly" className="font-medium cursor-pointer">
                        Friendly
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Warm and approachable, like talking to a helpful friend
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-gray-50 transition-colors">
                    <RadioGroupItem value="professional" id="professional" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="professional" className="font-medium cursor-pointer">
                        Professional
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Business-focused and formal communication style
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-gray-50 transition-colors">
                    <RadioGroupItem value="funny" id="funny" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="funny" className="font-medium cursor-pointer">
                        Funny
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Light-hearted with humor and playful responses
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-gray-50 transition-colors">
                    <RadioGroupItem value="polite" id="polite" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="polite" className="font-medium cursor-pointer">
                        Polite
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Respectful and courteous in every interaction
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-gray-50 transition-colors">
                    <RadioGroupItem value="casual" id="casual" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="casual" className="font-medium cursor-pointer">
                        Casual
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Relaxed and conversational, easy-going style
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-purple-600" />
                Widget Preview
              </CardTitle>
              <CardDescription>
                See how your chatbot will look on your website - try different colors!
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Chat Customization Controls */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                {/* Widget Header Text */}
                <div>
                  <Label htmlFor="widgetHeaderText" className="text-sm font-medium">
                    Chat Header Text
                  </Label>
                  <Input
                    id="widgetHeaderText"
                    type="text"
                    value={widgetHeaderText}
                    onChange={(e) => setWidgetHeaderText(e.target.value)}
                    placeholder="Hi Chroney"
                    maxLength={30}
                    className="mt-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {widgetHeaderText.length}/30 characters - This appears at the top of the chat window
                  </p>
                </div>

                {/* Gradient Color Pickers */}
                <div>
                  <Label className="text-sm font-medium">
                    Gradient Colors
                  </Label>
                  
                  {/* Start Color */}
                  <div className="mt-2">
                    <Label htmlFor="chatColor" className="text-xs text-gray-600">
                      Start Color
                    </Label>
                    <div className="flex items-center gap-3 mt-1">
                      <input
                        type="color"
                        id="chatColor"
                        value={chatColor}
                        onChange={(e) => setChatColor(e.target.value)}
                        className="h-10 w-20 rounded border border-gray-300 cursor-pointer"
                      />
                      <Input
                        type="text"
                        value={chatColor}
                        onChange={(e) => setChatColor(e.target.value)}
                        placeholder="#9333ea"
                        className="flex-1"
                        pattern="^#[0-9A-Fa-f]{6}$"
                      />
                    </div>
                  </div>

                  {/* End Color */}
                  <div className="mt-3">
                    <Label htmlFor="chatColorEnd" className="text-xs text-gray-600">
                      End Color
                    </Label>
                    <div className="flex items-center gap-3 mt-1">
                      <input
                        type="color"
                        id="chatColorEnd"
                        value={chatColorEnd}
                        onChange={(e) => setChatColorEnd(e.target.value)}
                        className="h-10 w-20 rounded border border-gray-300 cursor-pointer"
                      />
                      <Input
                        type="text"
                        value={chatColorEnd}
                        onChange={(e) => setChatColorEnd(e.target.value)}
                        placeholder="#3b82f6"
                        className="flex-1"
                        pattern="^#[0-9A-Fa-f]{6}$"
                      />
                    </div>
                  </div>

                  {/* Gradient Preview */}
                  <div className="mt-3 h-8 rounded-lg" style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}></div>
                  <p className="text-xs text-gray-500 mt-1">
                    🎨 Create a beautiful gradient that matches your brand
                  </p>
                </div>

                {/* Button Style Selector */}
                <div>
                  <Label className="text-sm font-medium">
                    Inactive Button Style
                  </Label>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    <button
                      onClick={() => setButtonStyle("circular")}
                      className={`p-3 border-2 rounded-lg transition-all hover:border-purple-400 ${
                        buttonStyle === "circular" ? "border-purple-600 bg-purple-50" : "border-gray-200"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <div 
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                          style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
                        >
                          <MessageCircle className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-medium">Circular</span>
                      </div>
                    </button>
                    
                    <button
                      onClick={() => setButtonStyle("rounded")}
                      className={`p-3 border-2 rounded-lg transition-all hover:border-purple-400 ${
                        buttonStyle === "rounded" ? "border-purple-600 bg-purple-50" : "border-gray-200"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <div 
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                          style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
                        >
                          <MessageCircle className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-medium">Rounded</span>
                      </div>
                    </button>
                    
                    <button
                      onClick={() => setButtonStyle("pill")}
                      className={`p-3 border-2 rounded-lg transition-all hover:border-purple-400 ${
                        buttonStyle === "pill" ? "border-purple-600 bg-purple-50" : "border-gray-200"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <div 
                          className="px-3 py-2 rounded-full flex items-center gap-1 text-white text-xs font-medium"
                          style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>Chat</span>
                        </div>
                        <span className="text-xs font-medium">Pill</span>
                      </div>
                    </button>
                    
                    <button
                      onClick={() => setButtonStyle("minimal")}
                      className={`p-3 border-2 rounded-lg transition-all hover:border-purple-400 ${
                        buttonStyle === "minimal" ? "border-purple-600 bg-purple-50" : "border-gray-200"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <div 
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-white shadow-md"
                          style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
                        >
                          <MessageCircle className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-medium">Minimal</span>
                      </div>
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    💬 Choose how the chat button appears on your website
                  </p>
                </div>

                {/* Animation Selector */}
                <div>
                  <Label className="text-sm font-medium">
                    Button Animation
                  </Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      onClick={() => setButtonAnimation("bounce")}
                      className={`p-3 border-2 rounded-lg transition-all hover:border-purple-400 ${
                        buttonAnimation === "bounce" ? "border-purple-600 bg-purple-50" : "border-gray-200"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <div 
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white animate-bounce"
                          style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
                        >
                          <MessageCircle className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-medium">Bounce</span>
                      </div>
                    </button>
                    
                    <button
                      onClick={() => setButtonAnimation("none")}
                      className={`p-3 border-2 rounded-lg transition-all hover:border-purple-400 ${
                        buttonAnimation === "none" ? "border-purple-600 bg-purple-50" : "border-gray-200"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <div 
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white"
                          style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
                        >
                          <MessageCircle className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-medium">None</span>
                      </div>
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    ✨ Add animation to make your chat button more noticeable
                  </p>
                </div>
              </div>

              {/* Preview Mockup */}
              <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg p-8 min-h-[500px] relative">
                <div className="flex items-end justify-between gap-6 h-full">
                  {/* Inactive State - Floating Button */}
                  <div className="flex-1 flex flex-col items-center justify-end pb-4">
                    <div className="text-center mb-4">
                      <p className="text-xs font-medium text-gray-700 mb-1">Inactive State</p>
                      <p className="text-xs text-gray-500">Floating button on website</p>
                    </div>
                    <div className="relative">
                      {/* Floating Chat Button - Different Styles */}
                      {buttonStyle === "circular" && (
                        <button 
                          className={`w-16 h-16 rounded-full shadow-2xl flex items-center justify-center text-white transition-all hover:scale-105 cursor-pointer ${
                            buttonAnimation === "bounce" ? "animate-bounce" : ""
                          }`}
                          style={{ 
                            background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})`
                          }}
                        >
                          <MessageCircle className="w-8 h-8" />
                        </button>
                      )}
                      
                      {buttonStyle === "rounded" && (
                        <button 
                          className={`w-16 h-16 rounded-2xl shadow-2xl flex items-center justify-center text-white transition-all hover:scale-105 cursor-pointer ${
                            buttonAnimation === "bounce" ? "animate-bounce" : ""
                          }`}
                          style={{ 
                            background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})`
                          }}
                        >
                          <MessageCircle className="w-8 h-8" />
                        </button>
                      )}
                      
                      {buttonStyle === "pill" && (
                        <button 
                          className={`px-6 py-4 rounded-full shadow-2xl flex items-center gap-2 text-white transition-all hover:scale-105 cursor-pointer font-medium ${
                            buttonAnimation === "bounce" ? "animate-bounce" : ""
                          }`}
                          style={{ 
                            background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})`
                          }}
                        >
                          <MessageCircle className="w-6 h-6" />
                          <span>Chat with us</span>
                        </button>
                      )}
                      
                      {buttonStyle === "minimal" && (
                        <button 
                          className={`w-14 h-14 rounded-lg shadow-2xl flex items-center justify-center text-white transition-all hover:scale-105 cursor-pointer ${
                            buttonAnimation === "bounce" ? "animate-bounce" : ""
                          }`}
                          style={{ 
                            background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})`
                          }}
                        >
                          <MessageCircle className="w-7 h-7" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Active State - Chat Window */}
                  <div className="flex-1 flex flex-col items-center justify-end">
                    <div className="text-center mb-4">
                      <p className="text-xs font-medium text-gray-700 mb-1">Active State</p>
                      <p className="text-xs text-gray-500">Opened chat window</p>
                    </div>
                    {/* Mock chat widget */}
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-gray-200 overflow-hidden">
                  {/* Chat header */}
                  <div 
                    className="px-4 py-3 text-white"
                    style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
                  >
                    <h3 className="font-semibold">{widgetHeaderText}</h3>
                    <p className="text-xs flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                      Online
                    </p>
                  </div>

                  {/* Chat messages */}
                  <div className="p-4 space-y-3 bg-gray-50 min-h-[280px]">
                    {/* AI Welcome Message */}
                    <div className="flex gap-2 items-start">
                      <div 
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white"
                        style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
                      >
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm max-w-[85%]">
                          <p className="text-sm text-gray-800">
                            {welcomeMessageType === "ai_generated" 
                              ? "Greetings! 🤖 I'm Chroney, your AI assistant! I can help you explore products, answer FAQs, and capture leads. What can I do for you today?"
                              : welcomeMessage || "Hi! How can I help you today?"}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400 mt-1 block ml-1">Just now</span>
                      </div>
                    </div>

                    {/* Sample user message */}
                    <div className="flex gap-2 items-start justify-end">
                      <div>
                        <div 
                          className="rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm text-white"
                          style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
                        >
                          <p className="text-sm">Tell me about your products</p>
                        </div>
                        <span className="text-xs text-gray-400 mt-1 block text-right mr-1">Just now</span>
                      </div>
                    </div>
                  </div>

                  {/* Chat input */}
                  <div className="p-4 bg-white border-t border-gray-200">
                    <div className="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-3">
                      <Zap className="w-5 h-5 text-gray-400" />
                      <input 
                        type="text" 
                        placeholder="Type a message..." 
                        className="bg-transparent text-sm flex-1 outline-none text-gray-600"
                        disabled
                      />
                      <button 
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white transition-colors"
                        style={{ background: `linear-gradient(to right, ${chatColor}, ${chatColorEnd})` }}
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Website Embed Code</CardTitle>
              <CardDescription>
                Copy and paste this code into your website's HTML to add the AI Chroney widget
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Textarea
                  value={embedCode}
                  readOnly
                  className="font-mono text-xs min-h-[200px] bg-gray-50"
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Add this code before the closing &lt;/body&gt; tag
                </p>
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  className="gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Code
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end pt-4">
            <div className="flex items-center gap-2 text-sm">
              {saveStatus === "saving" && (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                  <span className="text-gray-600">Saving changes...</span>
                </>
              )}
              {saveStatus === "saved" && (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-green-600 font-medium">All changes saved</span>
                </>
              )}
              {saveStatus === "idle" && (
                <span className="text-gray-400 text-xs">Changes auto-save automatically</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
