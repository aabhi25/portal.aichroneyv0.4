import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Globe, AlertCircle, CheckCircle2, Clock, Sparkles, Edit, Trash2, Save, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface WebsiteAnalysisResponse {
  status: 'not_started' | 'pending' | 'analyzing' | 'completed' | 'failed';
  websiteUrl: string;
  analyzedContent: AnalyzedContent | null;
  errorMessage?: string;
  lastAnalyzedAt?: string;
}

interface AnalyzedContent {
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

interface BusinessAccountInfo {
  name: string;
  description: string;
  website: string;
}

interface AnalyzedPage {
  id: string;
  businessAccountId: string;
  pageUrl: string;
  analyzedAt: string;
  createdAt: string;
}

export default function About() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [additionalPages, setAdditionalPages] = useState<string[]>([]);
  const [newPageUrl, setNewPageUrl] = useState("");
  const [analyzedPages, setAnalyzedPages] = useState<{url: string; analyzed: boolean; analyzedAt?: string}[]>([]);
  const [previousContent, setPreviousContent] = useState<AnalyzedContent | null>(null);
  const [newlyAddedItems, setNewlyAddedItems] = useState<{
    products: Set<string>;
    services: Set<string>;
    features: Set<string>;
    usps: Set<string>;
  }>({
    products: new Set(),
    services: new Set(),
    features: new Set(),
    usps: new Set(),
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState<AnalyzedContent | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);

  // Fetch business account info to get configured website URL
  const { data: accountInfo } = useQuery<BusinessAccountInfo>({
    queryKey: ["/api/about"],
  });

  const { data: analysisData, isLoading, refetch } = useQuery<WebsiteAnalysisResponse>({
    queryKey: ["/api/website-analysis"],
    refetchInterval: (data) => {
      // Poll every 5 seconds if status is pending or analyzing
      if (data?.state?.data?.status === 'pending' || data?.state?.data?.status === 'analyzing') {
        return 5000;
      }
      return false;
    },
  });

  // Fetch analyzed pages history from database
  const { data: analyzedPagesData } = useQuery<AnalyzedPage[]>({
    queryKey: ["/api/analyzed-pages"],
  });

  // Load analyzed pages from database when component mounts
  useEffect(() => {
    if (analyzedPagesData) {
      const pages = analyzedPagesData.map(page => ({
        url: page.pageUrl,
        analyzed: true,
        analyzedAt: page.analyzedAt,
      }));
      setAnalyzedPages(pages);
    }
  }, [analyzedPagesData]);

  // Use the configured website URL from business account
  const websiteUrl = accountInfo?.website || "";

  // Track when analysis completes to detect new items and refetch analyzed pages
  useEffect(() => {
    if (analysisData?.status === 'completed' && analysisData.analyzedContent && previousContent) {
      // Compare and find newly added items
      const newItems = {
        products: new Set<string>(),
        services: new Set<string>(),
        features: new Set<string>(),
        usps: new Set<string>(),
      };

      // Compare products
      analysisData.analyzedContent.mainProducts?.forEach((product: string) => {
        if (!previousContent.mainProducts?.includes(product)) {
          newItems.products.add(product);
        }
      });

      // Compare services
      analysisData.analyzedContent.mainServices?.forEach((service: string) => {
        if (!previousContent.mainServices?.includes(service)) {
          newItems.services.add(service);
        }
      });

      // Compare features
      analysisData.analyzedContent.keyFeatures?.forEach((feature: string) => {
        if (!previousContent.keyFeatures?.includes(feature)) {
          newItems.features.add(feature);
        }
      });

      // Compare USPs
      analysisData.analyzedContent.uniqueSellingPoints?.forEach((usp: string) => {
        if (!previousContent.uniqueSellingPoints?.includes(usp)) {
          newItems.usps.add(usp);
        }
      });

      setNewlyAddedItems(newItems);
      
      // Refetch analyzed pages to get the latest from database with timestamps
      queryClient.invalidateQueries({ queryKey: ["/api/analyzed-pages"] });
    }
  }, [analysisData, previousContent, queryClient]);

  const analyzeMutation = useMutation({
    mutationFn: async (data: { websiteUrl: string; additionalPages?: string[]; analyzeOnlyAdditional?: boolean }) => {
      const response = await fetch("/api/website-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to analyze website");
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/website-analysis"] });
      setAdditionalPages([]);
      toast({
        title: "Analysis Started",
        description: variables.analyzeOnlyAdditional
          ? `Analyzing ${variables.additionalPages?.length || 0} additional pages. Data will be merged with existing analysis...`
          : variables.additionalPages && variables.additionalPages.length > 0 
            ? `Analyzing ${variables.additionalPages.length + 1} pages. This may take a few minutes...`
            : "Your website is being analyzed. This may take a minute...",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (content: AnalyzedContent) => {
      const response = await fetch("/api/website-analysis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ analyzedContent: content }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update analysis");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/website-analysis"] });
      setIsEditing(false);
      setEditedContent(null);
      toast({
        title: "Success",
        description: "Website analysis updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/website-analysis", {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to reset analysis");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/website-analysis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analyzed-pages"] });
      setShowResetDialog(false);
      toast({
        title: "Success",
        description: "Website analysis reset successfully. You can start fresh now.",
      });
    },
    onError: (error) => {
      setShowResetDialog(false);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddPage = () => {
    if (!newPageUrl.trim()) return;
    
    // Validate that the page is from the same domain
    try {
      const baseUrl = new URL(websiteUrl);
      const newUrl = new URL(newPageUrl);
      
      if (baseUrl.hostname !== newUrl.hostname) {
        toast({
          title: "Error",
          description: "Additional pages must be from the same domain as your configured website",
          variant: "destructive",
        });
        return;
      }
      
      if (additionalPages.includes(newPageUrl)) {
        toast({
          title: "Error",
          description: "This page has already been added",
          variant: "destructive",
        });
        return;
      }
      
      setAdditionalPages([...additionalPages, newPageUrl]);
      setNewPageUrl("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
    }
  };

  const handleRemovePage = (index: number) => {
    setAdditionalPages(additionalPages.filter((_, i) => i !== index));
  };

  const handleAnalyze = () => {
    if (!websiteUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a website URL",
        variant: "destructive",
      });
      return;
    }
    // Full analysis - includes main URL
    analyzeMutation.mutate({ 
      websiteUrl, 
      additionalPages: additionalPages.length > 0 ? additionalPages : undefined,
      analyzeOnlyAdditional: false 
    });
  };

  const handleAnalyzeAdditionalOnly = () => {
    if (additionalPages.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one page to analyze",
        variant: "destructive",
      });
      return;
    }
    // Store current content before analysis to track what's new
    if (analysisData?.analyzedContent) {
      setPreviousContent(JSON.parse(JSON.stringify(analysisData.analyzedContent)));
    }
    // Store pages to analyze before clearing
    const pagesToAnalyze = [...additionalPages];
    // Add pages to analyzed list with pending status
    const newPages = pagesToAnalyze.map(url => ({ url, analyzed: false }));
    setAnalyzedPages(prev => [...prev, ...newPages]);
    // Clear the input list
    setAdditionalPages([]);
    // Only analyze additional pages - skip main URL to save time
    analyzeMutation.mutate({ 
      websiteUrl, 
      additionalPages: pagesToAnalyze,
      analyzeOnlyAdditional: true 
    });
  };

  const handleStartEdit = () => {
    if (content) {
      setEditedContent(JSON.parse(JSON.stringify(content)));
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent(null);
  };

  const handleSaveEdit = () => {
    if (editedContent) {
      updateMutation.mutate(editedContent);
    }
  };

  const handleConfirmReset = () => {
    deleteMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const status = analysisData?.status || 'not_started';
  const content = analysisData?.analyzedContent;
  const isProcessing = status === 'pending' || status === 'analyzing';

  // Check if we have any newly added items
  const hasNewItems = newlyAddedItems.products.size > 0 || 
                      newlyAddedItems.services.size > 0 || 
                      newlyAddedItems.features.size > 0 || 
                      newlyAddedItems.usps.size > 0;

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="container mx-auto p-4 md:p-6 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="w-6 h-6 text-purple-600" />
            Website Analysis
          </h1>
          <p className="text-gray-600 mt-2">
            Let Chroney AI analyze your website to understand your business better and provide smarter responses to customers
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="space-y-6">
              {/* Configured Website Info */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-100">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Your Configured Website</p>
                  <p className="font-medium text-gray-900">{websiteUrl || "No website configured"}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Managed by your administrator
                  </p>
                </div>
                <Button
                  onClick={handleAnalyze}
                  disabled={!websiteUrl || analyzeMutation.isPending || isProcessing}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-md"
                  size="lg"
                >
                  {analyzeMutation.isPending || isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Analyze Complete Website
                    </>
                  )}
                </Button>
              </div>

              {/* Status indicators */}
              {status === 'pending' && (
                <Alert className="border-blue-200 bg-blue-50">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    Analysis queued. Please wait...
                  </AlertDescription>
                </Alert>
              )}

              {status === 'analyzing' && (
                <Alert className="border-purple-200 bg-purple-50">
                  <Loader2 className="h-4 w-4 text-purple-600 animate-spin" />
                  <AlertDescription className="text-purple-800">
                    AI is analyzing your website. This may take up to a minute...
                  </AlertDescription>
                </Alert>
              )}

              {status === 'failed' && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {analysisData?.errorMessage || 'Analysis failed. Please try again.'}
                  </AlertDescription>
                </Alert>
              )}

              {status === 'completed' && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Website analyzed successfully! Chroney now has a deeper understanding of your business.
                    {analysisData?.lastAnalyzedAt && (
                      <span className="block text-xs mt-1 text-green-700">
                        Last analyzed: {new Date(analysisData.lastAnalyzedAt).toLocaleString()}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Additional Pages Section - Collapsible */}
              {websiteUrl && status === 'completed' && (
                <div className="border-t pt-6">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">
                      Want More Details?
                    </h3>
                    <p className="text-xs text-gray-600">
                      Add specific pages from your website to extract additional information
                    </p>
                  </div>
                  
                  <div className="flex gap-2 mb-3">
                    <Input
                      value={newPageUrl}
                      onChange={(e) => setNewPageUrl(e.target.value)}
                      placeholder={`For eg. ${websiteUrl}/about`}
                      className="flex-1"
                      disabled={isProcessing}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddPage()}
                    />
                    <Button
                      onClick={handleAddPage}
                      disabled={!newPageUrl.trim() || isProcessing}
                      variant="outline"
                    >
                      Add Page
                    </Button>
                  </div>

                  {additionalPages.length > 0 && (
                    <div className="space-y-3 mb-4">
                      <div className="space-y-2">
                        {additionalPages.map((page, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded border">
                            <span className="flex-1 text-sm truncate">{page}</span>
                            <Button
                              onClick={() => handleRemovePage(index)}
                              variant="ghost"
                              size="sm"
                              disabled={isProcessing}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                      
                      <Button
                        onClick={handleAnalyzeAdditionalOnly}
                        disabled={analyzeMutation.isPending || isProcessing}
                        className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                      >
                        {analyzeMutation.isPending || isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Analyze {additionalPages.length} Additional {additionalPages.length === 1 ? 'Page' : 'Pages'}
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Analyzed Pages List */}
                  {analyzedPages.length > 0 && (
                    <div className="border-t pt-4 mt-4">
                      <h4 className="text-xs font-medium text-gray-700 mb-2">Previously Analyzed Pages</h4>
                      <div className="space-y-1.5 max-h-60 overflow-y-auto">
                        {analyzedPages.map((page, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-xs">
                            <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0 truncate">{page.url}</div>
                            {page.analyzedAt && (
                              <span className="text-gray-500 text-xs">
                                {new Date(page.analyzedAt).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Show analyzed content if available */}
        {content && status === 'completed' && (
          <div className="space-y-6">
            {hasNewItems && (
              <Alert className="border-green-300 bg-green-50">
                <Sparkles className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  ✨ <strong>New items highlighted in green!</strong> Fresh content has been added from your latest analysis. The highlighting will disappear when you refresh the page.
                </AlertDescription>
              </Alert>
            )}
            
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                    Extracted Business Information
                    {hasNewItems && <span className="text-xs bg-green-600 text-white px-2 py-1 rounded-full ml-2">New Items Added</span>}
                  </CardTitle>
                  <div className="flex gap-2">
                    {!isEditing ? (
                      <>
                        <Button
                          onClick={handleStartEdit}
                          variant="outline"
                          size="sm"
                          disabled={updateMutation.isPending}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          onClick={() => setShowResetDialog(true)}
                          variant="outline"
                          size="sm"
                          disabled={deleteMutation.isPending}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Reset
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={handleSaveEdit}
                          size="sm"
                          disabled={updateMutation.isPending}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {updateMutation.isPending ? (
                            <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving...</>
                          ) : (
                            <><Save className="w-4 h-4 mr-1" /> Save</>
                          )}
                        </Button>
                        <Button
                          onClick={handleCancelEdit}
                          variant="outline"
                          size="sm"
                          disabled={updateMutation.isPending}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <CardDescription>
                  This information will be used by Chroney to provide more accurate and context-aware responses to your customers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {isEditing && editedContent ? (
                  <div className="space-y-4">
                    <Alert className="border-amber-200 bg-amber-50">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-amber-800">
                        <strong>Edit Mode:</strong> You can modify the extracted information below. Edit each field individually and click Save when done.
                      </AlertDescription>
                    </Alert>

                    {/* Editable Business Name */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">Business Name</label>
                      <Input
                        value={editedContent.businessName}
                        onChange={(e) => setEditedContent({ ...editedContent, businessName: e.target.value })}
                        placeholder="Enter business name"
                      />
                    </div>

                    {/* Editable Business Description */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">Business Description</label>
                      <Textarea
                        value={editedContent.businessDescription}
                        onChange={(e) => setEditedContent({ ...editedContent, businessDescription: e.target.value })}
                        placeholder="Enter business description"
                        rows={4}
                      />
                    </div>

                    {/* Editable Target Audience */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">Target Audience</label>
                      <Textarea
                        value={editedContent.targetAudience}
                        onChange={(e) => setEditedContent({ ...editedContent, targetAudience: e.target.value })}
                        placeholder="Enter target audience"
                        rows={3}
                      />
                    </div>

                    {/* Editable Products - JSON array */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">Main Products (one per line)</label>
                      <Textarea
                        value={(editedContent.mainProducts || []).join('\n')}
                        onChange={(e) => setEditedContent({ ...editedContent, mainProducts: e.target.value.split('\n').filter(p => p.trim()) })}
                        placeholder="Enter products, one per line"
                        rows={6}
                      />
                    </div>

                    {/* Editable Services */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">Main Services (one per line)</label>
                      <Textarea
                        value={(editedContent.mainServices || []).join('\n')}
                        onChange={(e) => setEditedContent({ ...editedContent, mainServices: e.target.value.split('\n').filter(s => s.trim()) })}
                        placeholder="Enter services, one per line"
                        rows={6}
                      />
                    </div>

                    {/* Editable Features */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">Key Features (one per line)</label>
                      <Textarea
                        value={(editedContent.keyFeatures || []).join('\n')}
                        onChange={(e) => setEditedContent({ ...editedContent, keyFeatures: e.target.value.split('\n').filter(f => f.trim()) })}
                        placeholder="Enter key features, one per line"
                        rows={6}
                      />
                    </div>

                    {/* Editable USPs */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">Unique Selling Points (one per line)</label>
                      <Textarea
                        value={(editedContent.uniqueSellingPoints || []).join('\n')}
                        onChange={(e) => setEditedContent({ ...editedContent, uniqueSellingPoints: e.target.value.split('\n').filter(u => u.trim()) })}
                        placeholder="Enter USPs, one per line"
                        rows={6}
                      />
                    </div>

                    {/* Editable Contact Info */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Contact Information</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Email</label>
                          <Input
                            value={editedContent.contactInfo?.email || ''}
                            onChange={(e) => setEditedContent({ 
                              ...editedContent, 
                              contactInfo: { ...editedContent.contactInfo, email: e.target.value }
                            })}
                            placeholder="Email address"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Phone</label>
                          <Input
                            value={editedContent.contactInfo?.phone || ''}
                            onChange={(e) => setEditedContent({ 
                              ...editedContent, 
                              contactInfo: { ...editedContent.contactInfo, phone: e.target.value }
                            })}
                            placeholder="Phone number"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Address</label>
                          <Input
                            value={editedContent.contactInfo?.address || ''}
                            onChange={(e) => setEditedContent({ 
                              ...editedContent, 
                              contactInfo: { ...editedContent.contactInfo, address: e.target.value }
                            })}
                            placeholder="Physical address"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Editable Business Hours */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">Business Hours</label>
                      <Input
                        value={editedContent.businessHours || ''}
                        onChange={(e) => setEditedContent({ ...editedContent, businessHours: e.target.value })}
                        placeholder="e.g., Mon-Fri 9AM-5PM"
                      />
                    </div>

                    {/* Editable Pricing Info */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">Pricing Information</label>
                      <Textarea
                        value={editedContent.pricingInfo || ''}
                        onChange={(e) => setEditedContent({ ...editedContent, pricingInfo: e.target.value })}
                        placeholder="Enter pricing details"
                        rows={3}
                      />
                    </div>

                    {/* Editable Additional Info */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">Additional Information</label>
                      <Textarea
                        value={editedContent.additionalInfo}
                        onChange={(e) => setEditedContent({ ...editedContent, additionalInfo: e.target.value })}
                        placeholder="Any other relevant information"
                        rows={4}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Business Overview */}
                    {content.businessName && (
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-2">Business Name</h3>
                        <p className="text-gray-700">{content.businessName}</p>
                      </div>
                    )}

                {content.businessDescription && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Business Description</h3>
                    <p className="text-gray-700">{content.businessDescription}</p>
                  </div>
                )}

                {content.targetAudience && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Target Audience</h3>
                    <p className="text-gray-700">{content.targetAudience}</p>
                  </div>
                )}

                {/* Products and Services */}
                {content.mainProducts && content.mainProducts.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Main Products</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      {content.mainProducts.map((product, idx) => (
                        <li 
                          key={idx}
                          className={newlyAddedItems.products.has(product) ? 'bg-green-100 px-2 py-1 rounded' : ''}
                        >
                          {product}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {content.mainServices && content.mainServices.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Main Services</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      {content.mainServices.map((service, idx) => (
                        <li 
                          key={idx}
                          className={newlyAddedItems.services.has(service) ? 'bg-green-100 px-2 py-1 rounded' : ''}
                        >
                          {service}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {content.keyFeatures && content.keyFeatures.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Key Features</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      {content.keyFeatures.map((feature, idx) => (
                        <li 
                          key={idx}
                          className={newlyAddedItems.features.has(feature) ? 'bg-green-100 px-2 py-1 rounded' : ''}
                        >
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {content.uniqueSellingPoints && content.uniqueSellingPoints.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Unique Selling Points</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      {content.uniqueSellingPoints.map((usp, idx) => (
                        <li 
                          key={idx}
                          className={newlyAddedItems.usps.has(usp) ? 'bg-green-100 px-2 py-1 rounded' : ''}
                        >
                          {usp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Contact Information */}
                {(content.contactInfo?.email || content.contactInfo?.phone || content.contactInfo?.address) && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Contact Information</h3>
                    <div className="text-gray-700 space-y-1">
                      {content.contactInfo.email && <p>Email: {content.contactInfo.email}</p>}
                      {content.contactInfo.phone && <p>Phone: {content.contactInfo.phone}</p>}
                      {content.contactInfo.address && <p>Address: {content.contactInfo.address}</p>}
                    </div>
                  </div>
                )}

                {content.businessHours && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Business Hours</h3>
                    <p className="text-gray-700">{content.businessHours}</p>
                  </div>
                )}

                {content.pricingInfo && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Pricing Information</h3>
                    <p className="text-gray-700">{content.pricingInfo}</p>
                  </div>
                )}

                {content.additionalInfo && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Additional Information</h3>
                    <p className="text-gray-700">{content.additionalInfo}</p>
                  </div>
                )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Instructions/Tips */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            How it works
          </h3>
          <ul className="text-sm text-blue-800 space-y-2">
            <li className="flex gap-2">
              <span className="text-blue-600">1.</span>
              <span>AI scans your website and automatically extracts key business information</span>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-600">2.</span>
              <span>Chroney uses this information to provide smarter, context-aware responses to customers</span>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-600">3.</span>
              <span>Re-analyze anytime to update information or add specific pages for more details</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Website Analysis?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all extracted information from your website analysis. You'll need to re-analyze your website from scratch. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReset}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Resetting...</>
              ) : (
                "Reset Analysis"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
