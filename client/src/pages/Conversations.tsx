import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Calendar, Clock, Search, User, Bot, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

interface Conversation {
  id: string;
  businessAccountId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: string;
}

type DatePreset = 'all' | 'today' | 'yesterday' | 'last7' | 'last30' | 'custom';

export default function Conversations() {
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Memoize date params to prevent unnecessary refetches
  const dateParams = useMemo(() => {
    const params = new URLSearchParams();
    
    if (datePreset === 'all') {
      return '';
    }
    
    let from: Date | undefined;
    let to: Date | undefined;
    
    // Get current date normalized to start of day to prevent constant changes
    const today = startOfDay(new Date());
    
    switch (datePreset) {
      case 'today':
        from = today;
        to = endOfDay(today);
        break;
      case 'yesterday':
        const yesterday = subDays(today, 1);
        from = yesterday;
        to = endOfDay(yesterday);
        break;
      case 'last7':
        from = subDays(today, 7);
        to = endOfDay(today);
        break;
      case 'last30':
        from = subDays(today, 30);
        to = endOfDay(today);
        break;
      case 'custom':
        from = fromDate ? startOfDay(fromDate) : undefined;
        to = toDate ? endOfDay(toDate) : undefined;
        break;
    }
    
    if (from) params.append('fromDate', from.toISOString());
    if (to) params.append('toDate', to.toISOString());
    
    return params.toString() ? `?${params.toString()}` : '';
  }, [datePreset, fromDate, toDate]);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations", dateParams],
    queryFn: async () => {
      const response = await fetch(`/api/conversations${dateParams}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch conversations");
      }
      return response.json();
    },
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/conversations", selectedConversationId, "messages"],
    enabled: !!selectedConversationId,
    queryFn: async () => {
      const response = await fetch(`/api/conversations/${selectedConversationId}/messages`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }
      return response.json();
    },
  });

  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedConversation = conversations.find(c => c.id === selectedConversationId);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return `Today at ${format(date, 'h:mm a')}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${format(date, 'h:mm a')}`;
    } else {
      return format(date, 'MMM d, yyyy h:mm a');
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'MMM d, h:mm a');
  };

  return (
    <div className="flex h-full w-full bg-gray-50">
      {/* Left Panel - Conversations List */}
      <div className="w-full md:w-96 border-r border-gray-200 bg-white flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-gray-900">Conversations</h2>
          </div>
          
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Date Filter */}
        <div className="p-4 border-b border-gray-200 bg-gradient-to-br from-gray-50 to-white">
          <div className="mb-3">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 block">
              Filter by Date
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setDatePreset('all')}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
                  datePreset === 'all'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-200'
                    : 'bg-white text-gray-700 border border-gray-200 hover:border-purple-300 hover:shadow-sm'
                }`}
              >
                All Time
              </button>
              <button
                onClick={() => setDatePreset('today')}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
                  datePreset === 'today'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-200'
                    : 'bg-white text-gray-700 border border-gray-200 hover:border-purple-300 hover:shadow-sm'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setDatePreset('yesterday')}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
                  datePreset === 'yesterday'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-200'
                    : 'bg-white text-gray-700 border border-gray-200 hover:border-purple-300 hover:shadow-sm'
                }`}
              >
                Yesterday
              </button>
              <button
                onClick={() => setDatePreset('last7')}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
                  datePreset === 'last7'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-200'
                    : 'bg-white text-gray-700 border border-gray-200 hover:border-purple-300 hover:shadow-sm'
                }`}
              >
                Last 7 Days
              </button>
              <button
                onClick={() => setDatePreset('last30')}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 col-span-2 ${
                  datePreset === 'last30'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-200'
                    : 'bg-white text-gray-700 border border-gray-200 hover:border-purple-300 hover:shadow-sm'
                }`}
              >
                Last 30 Days
              </button>
            </div>
          </div>

          {/* Custom Range */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`w-full px-3 py-2.5 text-xs font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 ${
                  datePreset === 'custom'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-200'
                    : 'bg-white text-gray-700 border border-gray-200 hover:border-purple-300 hover:shadow-sm'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  {datePreset === 'custom' && (fromDate || toDate)
                    ? `${fromDate ? format(fromDate, 'MMM d') : '...'} - ${toDate ? format(toDate, 'MMM d') : '...'}`
                    : 'Custom Range'}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <div className="bg-gradient-to-br from-gray-50 to-white p-4">
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-1">Custom Date Range</h4>
                  <p className="text-xs text-gray-500">Select start and end dates</p>
                </div>
                
                <div className="space-y-4">
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 block">
                      From Date
                    </label>
                    <CalendarComponent
                      mode="single"
                      selected={fromDate}
                      onSelect={(date) => {
                        setFromDate(date);
                        setDatePreset('custom');
                      }}
                      disabled={(date) => date > new Date()}
                      className="rounded-md"
                    />
                  </div>
                  
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 block">
                      To Date
                    </label>
                    <CalendarComponent
                      mode="single"
                      selected={toDate}
                      onSelect={(date) => {
                        setToDate(date);
                        setDatePreset('custom');
                      }}
                      disabled={(date) => date > new Date()}
                      className="rounded-md"
                    />
                  </div>
                  
                  {(fromDate || toDate) && (
                    <button
                      onClick={() => {
                        setFromDate(undefined);
                        setToDate(undefined);
                        setDatePreset('all');
                      }}
                      className="w-full px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Clear Dates
                    </button>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center">
              <MessageSquare className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">
                {searchQuery ? 'No conversations found' : 'No conversations yet'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => setSelectedConversationId(conversation.id)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedConversationId === conversation.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-sm text-gray-900 truncate">
                          {conversation.title}
                        </h3>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className="truncate">{formatDate(conversation.createdAt)}</span>
                        <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">
                          {conversation.messageCount}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Message View */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedConversation ? (
          <>
            {/* Conversation Header */}
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900">{selectedConversation.title}</h2>
                    <p className="text-xs text-gray-500">{formatDate(selectedConversation.createdAt)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex items-start gap-3 max-w-[85%]">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <Card className="bg-white shadow-sm">
                          <CardContent className="p-4">
                            <div className="prose prose-sm max-w-none">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeHighlight]}
                                components={{
                                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc">{children}</ul>,
                                  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal">{children}</ol>,
                                  li: ({ children }) => <li className="mb-1">{children}</li>,
                                  code: ({ className, children }) => {
                                    const isInline = !className;
                                    return isInline ? (
                                      <code className="px-1.5 py-0.5 bg-gray-100 rounded text-sm">{children}</code>
                                    ) : (
                                      <code className={className}>{children}</code>
                                    );
                                  }
                                }}
                              >
                                {message.content}
                              </ReactMarkdown>
                            </div>
                          </CardContent>
                        </Card>
                        <p className="text-xs text-gray-500 mt-1 ml-1">{formatTime(message.createdAt)}</p>
                      </div>
                    </div>
                  )}
                  
                  {message.role === 'user' && (
                    <div className="flex flex-col items-end max-w-[85%]">
                      <div
                        className="px-4 py-3 rounded-2xl text-white shadow-sm"
                        style={{ background: 'linear-gradient(to right, #8B5CF6, #3B82F6)' }}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 mr-1">{formatTime(message.createdAt)}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-4">
            <div>
              <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select a conversation</h3>
              <p className="text-sm text-gray-500">
                Choose a conversation from the list to view messages
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
