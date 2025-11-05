import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, MessageSquare, Package, Users, TrendingUp, Clock, Calendar, Brain, Lightbulb, Heart, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { useState, useMemo } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
}

interface Conversation {
  id: string;
  createdAt: string;
}

interface Product {
  id: string;
  name: string;
}

interface ConversationAnalysis {
  topicsOfInterest: string[];
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    overall: 'positive' | 'neutral' | 'negative';
  };
  commonPatterns: string[];
  engagementInsights: {
    avgMessagesPerConversation: number;
    totalConversations: number;
    mostActiveTopics: string[];
  };
  summary?: string;
}

type DatePreset = 'all' | 'today' | 'yesterday' | 'last7' | 'last30' | 'custom';

export default function Insights() {
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);

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

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["/api/leads", dateParams],
    queryFn: async () => {
      const response = await fetch(`/api/leads${dateParams}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch leads");
      }
      return response.json();
    },
  });

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

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Fetch AI conversation analysis
  const { data: conversationAnalysis, isLoading: isAnalysisLoading, error: analysisError } = useQuery<ConversationAnalysis>({
    queryKey: ["/api/insights/conversation-analysis", dateParams],
    queryFn: async () => {
      const response = await fetch(`/api/insights/conversation-analysis${dateParams}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch conversation analysis");
      }
      return response.json();
    },
    enabled: conversations.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Calculate insights
  const totalLeads = leads.length;
  const totalConversations = conversations.length;
  const totalProducts = products.length;

  // Leads in last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentLeads = leads.filter(lead => new Date(lead.createdAt) >= sevenDaysAgo).length;

  // Conversations in last 7 days
  const recentConversations = conversations.filter(conv => new Date(conv.createdAt) >= sevenDaysAgo).length;

  // Calculate conversion rate (leads / conversations)
  const conversionRate = totalConversations > 0 
    ? ((totalLeads / totalConversations) * 100).toFixed(1)
    : "0.0";

  const stats = [
    {
      title: "Total Leads",
      value: totalLeads,
      icon: Users,
      description: `${recentLeads} in last 7 days`,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Total Conversations",
      value: totalConversations,
      icon: MessageSquare,
      description: `${recentConversations} in last 7 days`,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Products Listed",
      value: totalProducts,
      icon: Package,
      description: "Active products",
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Conversion Rate",
      value: `${conversionRate}%`,
      icon: TrendingUp,
      description: "Leads per conversation",
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
  ];

  const getDateRangeLabel = () => {
    switch (datePreset) {
      case 'all':
        return 'All Time';
      case 'today':
        return 'Today';
      case 'yesterday':
        return 'Yesterday';
      case 'last7':
        return 'Last 7 Days';
      case 'last30':
        return 'Last 30 Days';
      case 'custom':
        if (fromDate && toDate) {
          return `${format(fromDate, 'MMM d, yyyy')} - ${format(toDate, 'MMM d, yyyy')}`;
        }
        if (fromDate) {
          return `From ${format(fromDate, 'MMM d, yyyy')}`;
        }
        if (toDate) {
          return `Until ${format(toDate, 'MMM d, yyyy')}`;
        }
        return 'Custom Range';
      default:
        return 'All Time';
    }
  };

  return (
    <div className="p-3 md:p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Insights</h1>
        <p className="text-sm text-gray-600">Track your business performance and customer engagement</p>
      </div>

      {/* Date Filter */}
      <Card className="mb-3">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filter by date:</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={datePreset === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDatePreset('all')}
              >
                All Time
              </Button>
              <Button
                variant={datePreset === 'today' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDatePreset('today')}
              >
                Today
              </Button>
              <Button
                variant={datePreset === 'yesterday' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDatePreset('yesterday')}
              >
                Yesterday
              </Button>
              <Button
                variant={datePreset === 'last7' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDatePreset('last7')}
              >
                Last 7 Days
              </Button>
              <Button
                variant={datePreset === 'last30' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDatePreset('last30')}
              >
                Last 30 Days
              </Button>
              
              {/* Custom Date Range */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={datePreset === 'custom' ? 'default' : 'outline'}
                    size="sm"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Custom
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">From Date</label>
                      <CalendarComponent
                        mode="single"
                        selected={fromDate}
                        onSelect={(date) => {
                          setFromDate(date);
                          setDatePreset('custom');
                        }}
                        disabled={(date) => date > new Date()}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">To Date</label>
                      <CalendarComponent
                        mode="single"
                        selected={toDate}
                        onSelect={(date) => {
                          setToDate(date);
                          setDatePreset('custom');
                        }}
                        disabled={(date) => date > new Date()}
                      />
                    </div>
                    {(fromDate || toDate) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setFromDate(undefined);
                          setToDate(undefined);
                          setDatePreset('all');
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {datePreset !== 'all' && (
              <div className="ml-auto text-sm text-gray-600">
                Showing: <span className="font-medium">{getDateRangeLabel()}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-10 h-10 rounded-full ${stat.bgColor} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-0.5">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mb-0.5">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        {/* Recent Leads */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-4 h-4 text-blue-600" />
              Recent Leads
            </CardTitle>
            <CardDescription className="text-xs">Latest leads captured by Chroney</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {leads.length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No leads captured yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {leads.slice(0, 5).map((lead) => (
                  <div key={lead.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                    <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Users className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {lead.name || "Anonymous"}
                      </p>
                      <p className="text-xs text-gray-600 truncate">
                        {lead.email || lead.phone || "No contact info"}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="w-4 h-4 text-purple-600" />
              Performance Summary
            </CardTitle>
            <CardDescription className="text-xs">Key metrics at a glance</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              <div className="p-3 bg-purple-50 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">Engagement Rate</span>
                  <span className="text-xl font-bold text-purple-600">{conversionRate}%</span>
                </div>
                <p className="text-xs text-gray-600">
                  {totalLeads} leads from {totalConversations} conversations
                </p>
              </div>

              <div className="p-3 bg-green-50 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">Weekly Activity</span>
                  <span className="text-xl font-bold text-green-600">{recentConversations}</span>
                </div>
                <p className="text-xs text-gray-600">
                  Conversations in the last 7 days
                </p>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">New Leads</span>
                  <span className="text-xl font-bold text-blue-600">{recentLeads}</span>
                </div>
                <p className="text-xs text-gray-600">
                  Captured in the last 7 days
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Conversation Analysis */}
      {conversations.length > 0 && (
        <Card className="mb-3">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Brain className="w-4 h-4 text-purple-600" />
              AI Conversation Analysis
            </CardTitle>
            <CardDescription className="text-xs">
              Insights powered by AI analyzing your customer conversations
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {isAnalysisLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-3"></div>
                <p className="text-sm text-gray-600">Analyzing conversations with AI...</p>
              </div>
            ) : analysisError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {(analysisError as Error).message}
                </AlertDescription>
              </Alert>
            ) : conversationAnalysis ? (
              <div className="space-y-3">
                {/* Summary */}
                {conversationAnalysis.summary && (
                  <div className="p-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
                    <div className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-gray-800 leading-relaxed">{conversationAnalysis.summary}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {/* Topics of Interest */}
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Lightbulb className="w-4 h-4 text-blue-600" />
                      <h3 className="text-sm font-semibold text-gray-900">Topics of Interest</h3>
                    </div>
                    {conversationAnalysis.topicsOfInterest.length > 0 ? (
                      <div className="space-y-1.5">
                        {conversationAnalysis.topicsOfInterest.map((topic, index) => (
                          <div key={index} className="flex items-center gap-2 bg-white p-1.5 rounded-md">
                            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-blue-600">{index + 1}</span>
                            </div>
                            <span className="text-xs text-gray-800">{topic}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600">No specific topics identified yet.</p>
                    )}
                  </div>

                  {/* Sentiment Analysis */}
                  <div className="p-3 bg-pink-50 rounded-lg">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Heart className="w-4 h-4 text-pink-600" />
                      <h3 className="text-sm font-semibold text-gray-900">User Sentiment</h3>
                    </div>
                    <div className="space-y-1.5">
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-gray-700">😊 Positive</span>
                          <span className="text-xs font-semibold text-green-600">
                            {conversationAnalysis.sentiment.positive}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-green-500 h-1.5 rounded-full"
                            style={{ width: `${conversationAnalysis.sentiment.positive}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-gray-700">😐 Neutral</span>
                          <span className="text-xs font-semibold text-gray-600">
                            {conversationAnalysis.sentiment.neutral}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-gray-500 h-1.5 rounded-full"
                            style={{ width: `${conversationAnalysis.sentiment.neutral}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-gray-700">😞 Negative</span>
                          <span className="text-xs font-semibold text-red-600">
                            {conversationAnalysis.sentiment.negative}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-red-500 h-1.5 rounded-full"
                            style={{ width: `${conversationAnalysis.sentiment.negative}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="mt-2 p-1.5 bg-white rounded-md">
                        <p className="text-xs text-gray-600">
                          Overall: <span className={`font-semibold ${
                            conversationAnalysis.sentiment.overall === 'positive' ? 'text-green-600' :
                            conversationAnalysis.sentiment.overall === 'negative' ? 'text-red-600' :
                            'text-gray-600'
                          }`}>
                            {conversationAnalysis.sentiment.overall.charAt(0).toUpperCase() + 
                             conversationAnalysis.sentiment.overall.slice(1)}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {/* Common Patterns */}
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <div className="flex items-center gap-1.5 mb-2">
                      <MessageSquare className="w-4 h-4 text-purple-600" />
                      <h3 className="text-sm font-semibold text-gray-900">Common Patterns</h3>
                    </div>
                    {conversationAnalysis.commonPatterns.length > 0 ? (
                      <ul className="space-y-1">
                        {conversationAnalysis.commonPatterns.map((pattern, index) => (
                          <li key={index} className="flex items-start gap-1.5 text-xs text-gray-800">
                            <span className="text-purple-600 mt-0.5">•</span>
                            <span>{pattern}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-600">No common patterns detected yet.</p>
                    )}
                  </div>

                  {/* Engagement Insights */}
                  <div className="p-3 bg-orange-50 rounded-lg">
                    <div className="flex items-center gap-1.5 mb-2">
                      <TrendingUp className="w-4 h-4 text-orange-600" />
                      <h3 className="text-sm font-semibold text-gray-900">Engagement Insights</h3>
                    </div>
                    <div className="space-y-2">
                      <div className="bg-white p-2 rounded-md">
                        <p className="text-xs text-gray-600 mb-0.5">Avg Messages per Conversation</p>
                        <p className="text-xl font-bold text-orange-600">
                          {conversationAnalysis.engagementInsights.avgMessagesPerConversation.toFixed(1)}
                        </p>
                      </div>
                      {conversationAnalysis.engagementInsights.mostActiveTopics.length > 0 && (
                        <div className="bg-white p-2 rounded-md">
                          <p className="text-xs text-gray-600 mb-1.5">Most Active Topics</p>
                          <div className="flex flex-wrap gap-1.5">
                            {conversationAnalysis.engagementInsights.mostActiveTopics.map((topic, index) => (
                              <span
                                key={index}
                                className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full"
                              >
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
