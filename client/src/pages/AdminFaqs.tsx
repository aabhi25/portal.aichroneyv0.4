import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Faq, type DraftFaq } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Send, Sparkles, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function AdminFaqs() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("published");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [suggestDialogOpen, setSuggestDialogOpen] = useState(false);
  const [viewDraftDialogOpen, setViewDraftDialogOpen] = useState(false);
  const [viewFaqDialogOpen, setViewFaqDialogOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<Faq | null>(null);
  const [editingDraft, setEditingDraft] = useState<DraftFaq | null>(null);
  const [viewingDraft, setViewingDraft] = useState<DraftFaq | null>(null);
  const [viewingFaq, setViewingFaq] = useState<Faq | null>(null);
  const [faqToDelete, setFaqToDelete] = useState<string | null>(null);
  const [draftToDelete, setDraftToDelete] = useState<string | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [formData, setFormData] = useState({
    question: "",
    answer: "",
    category: "",
  });

  // Fetch published FAQs
  const { data: faqs = [], isLoading } = useQuery<Faq[]>({
    queryKey: ["/api/faqs"],
  });

  // Fetch draft FAQs
  const { data: draftFaqs = [], isLoading: isDraftsLoading } = useQuery<DraftFaq[]>({
    queryKey: ["/api/draft-faqs"],
  });

  // Create FAQ mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/faqs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/faqs"] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "FAQ created",
        description: "FAQ has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create FAQ",
        variant: "destructive",
      });
    },
  });

  // Update FAQ mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PATCH", `/api/faqs/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/faqs"] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "FAQ updated",
        description: "FAQ has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update FAQ",
        variant: "destructive",
      });
    },
  });

  // Delete FAQ mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/faqs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/faqs"] });
      setDeleteDialogOpen(false);
      setFaqToDelete(null);
      toast({
        title: "FAQ deleted",
        description: "FAQ has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete FAQ",
        variant: "destructive",
      });
    },
  });

  // Update draft FAQ mutation
  const updateDraftMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/draft-faqs/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/draft-faqs"] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Draft updated",
        description: "Draft FAQ has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update draft",
        variant: "destructive",
      });
    },
  });

  // Delete draft FAQ mutation
  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/draft-faqs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/draft-faqs"] });
      setDeleteDialogOpen(false);
      setDraftToDelete(null);
      toast({
        title: "Draft deleted",
        description: "Draft FAQ has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete draft",
        variant: "destructive",
      });
    },
  });

  // Publish draft FAQ mutation
  const publishDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("POST", `/api/draft-faqs/${id}/publish`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/draft-faqs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/faqs"] });
      toast({
        title: "FAQ published",
        description: "Draft FAQ has been published successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to publish draft",
        variant: "destructive",
      });
    },
  });

  // Suggest FAQs mutation
  const suggestFaqsMutation = useMutation({
    mutationFn: async (url: string) => {
      return await apiRequest("POST", "/api/suggest-faqs", { websiteUrl: url });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/draft-faqs"] });
      setSuggestDialogOpen(false);
      setWebsiteUrl("");
      setActiveTab("drafts"); // Switch to drafts tab
      toast({
        title: "FAQs generated",
        description: data.message || `${data.count} FAQ drafts have been saved.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate FAQs",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      question: "",
      answer: "",
      category: "",
    });
    setEditingFaq(null);
    setEditingDraft(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (faq: Faq) => {
    setEditingFaq(faq);
    setFormData({
      question: faq.question,
      answer: faq.answer,
      category: faq.category || "",
    });
    setIsDialogOpen(true);
  };

  const openEditDraftDialog = (draft: DraftFaq) => {
    setEditingDraft(draft);
    setFormData({
      question: draft.question,
      answer: draft.answer,
      category: draft.category || "",
    });
    setIsDialogOpen(true);
  };

  const openViewDraftDialog = (draft: DraftFaq) => {
    setViewingDraft(draft);
    setViewDraftDialogOpen(true);
  };

  const openViewFaqDialog = (faq: Faq) => {
    setViewingFaq(faq);
    setViewFaqDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingFaq) {
      updateMutation.mutate({ id: editingFaq.id, data: formData });
    } else if (editingDraft) {
      updateDraftMutation.mutate({ id: editingDraft.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string) => {
    setFaqToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteDraft = (id: string) => {
    setDraftToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (faqToDelete) {
      deleteMutation.mutate(faqToDelete);
    } else if (draftToDelete) {
      deleteDraftMutation.mutate(draftToDelete);
    }
  };

  const handlePublishDraft = (id: string) => {
    publishDraftMutation.mutate(id);
  };

  const handleSuggestFaqs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!websiteUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a website URL",
        variant: "destructive",
      });
      return;
    }
    suggestFaqsMutation.mutate(websiteUrl);
  };

  if (isLoading || isDraftsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-sm text-gray-500">Loading FAQs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              FAQs Management
            </h1>
            <p className="text-gray-500 mt-1">Manage your frequently asked questions</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setSuggestDialogOpen(true)} variant="outline">
              <Sparkles className="mr-2 h-4 w-4" />
              Suggest FAQs
            </Button>
            <Button onClick={openCreateDialog} className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
              <Plus className="mr-2 h-4 w-4" />
              Add FAQ
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="drafts">
              Drafts ({draftFaqs.length})
            </TabsTrigger>
            <TabsTrigger 
              value="published"
            >
              Published ({faqs.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="drafts" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Draft FAQs</CardTitle>
                <CardDescription>
                  Review and edit suggested FAQs before publishing them
                </CardDescription>
              </CardHeader>
              <CardContent>
                {draftFaqs.length === 0 ? (
                  <div className="text-center py-12">
                    <Sparkles className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-gray-500 mb-4">No draft FAQs yet</p>
                    <Button onClick={() => setSuggestDialogOpen(true)} variant="outline">
                      <Sparkles className="mr-2 h-4 w-4" />
                      Suggest FAQs from Website
                    </Button>
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[200px]">Question</TableHead>
                          <TableHead className="min-w-[120px]">Category</TableHead>
                          <TableHead className="min-w-[150px]">Source</TableHead>
                          <TableHead className="text-right min-w-[140px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {draftFaqs.map((draft) => (
                          <TableRow 
                            key={draft.id}
                            className="cursor-pointer hover:bg-gray-50"
                            onClick={() => openViewDraftDialog(draft)}
                          >
                            <TableCell className="font-medium">
                              <div className="max-w-md truncate">{draft.question}</div>
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 whitespace-nowrap">
                                {draft.category || "General"}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">
                              <div className="max-w-xs truncate">{draft.sourceUrl || "Manual"}</div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2 min-w-max">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditDraftDialog(draft);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePublishDraft(draft.id);
                                  }}
                                  disabled={publishDraftMutation.isPending}
                                >
                                  <Send className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteDraft(draft.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="published" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Published FAQs</CardTitle>
                <CardDescription>
                  FAQs that are live and visible to your customers
                </CardDescription>
              </CardHeader>
              <CardContent>
                {faqs.length === 0 ? (
                  <div className="text-center py-12">
                    <Plus className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-gray-500 mb-4">No published FAQs yet</p>
                    <Button onClick={openCreateDialog}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Your First FAQ
                    </Button>
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[200px]">Question</TableHead>
                          <TableHead className="min-w-[120px]">Category</TableHead>
                          <TableHead className="min-w-[120px]">Created</TableHead>
                          <TableHead className="text-right min-w-[110px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {faqs.map((faq) => (
                          <TableRow 
                            key={faq.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => openViewFaqDialog(faq)}
                          >
                            <TableCell className="font-medium">
                              <div className="max-w-md truncate">{faq.question}</div>
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 whitespace-nowrap">
                                {faq.category || "General"}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                              {new Date(faq.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2 min-w-max">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditDialog(faq);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(faq.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add/Edit FAQ Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingFaq ? "Edit FAQ" : editingDraft ? "Edit Draft FAQ" : "Add New FAQ"}
            </DialogTitle>
            <DialogDescription>
              {editingFaq 
                ? "Update the FAQ details"
                : editingDraft 
                ? "Edit the draft FAQ before publishing"
                : "Create a new frequently asked question"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="question">Question *</Label>
                <Input
                  id="question"
                  value={formData.question}
                  onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                  placeholder="What is your question?"
                  required
                />
              </div>
              <div>
                <Label htmlFor="answer">Answer *</Label>
                <Textarea
                  id="answer"
                  value={formData.answer}
                  onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                  placeholder="Provide a detailed answer"
                  rows={6}
                  required
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Shipping, Returns, Support"
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending || updateDraftMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending || updateDraftMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingFaq ? "Update FAQ" : editingDraft ? "Update Draft" : "Create FAQ"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the {faqToDelete ? "FAQ" : "draft FAQ"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Suggest FAQs Dialog */}
      <Dialog open={suggestDialogOpen} onOpenChange={setSuggestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Suggest FAQs from Website
            </DialogTitle>
            <DialogDescription>
              Enter a website URL and AI will analyze it to suggest up to 40 relevant FAQs
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSuggestFaqs}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="websiteUrl">Website URL</Label>
                <Input
                  id="websiteUrl"
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://www.example.com"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  The AI will crawl this website and generate FAQs based on its content
                </p>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSuggestDialogOpen(false);
                  setWebsiteUrl("");
                }}
                disabled={suggestFaqsMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={suggestFaqsMutation.isPending}>
                {suggestFaqsMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {suggestFaqsMutation.isPending ? "Generating..." : "Generate FAQs"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Draft FAQ Detail Dialog */}
      <Dialog open={viewDraftDialogOpen} onOpenChange={setViewDraftDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Draft FAQ Details</DialogTitle>
            <DialogDescription>
              Complete information about this draft FAQ
            </DialogDescription>
          </DialogHeader>
          {viewingDraft && (
            <div className="space-y-6">
              {/* Question */}
              <div>
                <Label className="text-sm font-semibold text-gray-700">Question</Label>
                <p className="mt-2 text-base text-gray-900 bg-gray-50 p-4 rounded-lg border border-gray-200">
                  {viewingDraft.question}
                </p>
              </div>

              {/* Answer */}
              <div>
                <Label className="text-sm font-semibold text-gray-700">Answer</Label>
                <div className="mt-2 text-base text-gray-900 bg-gray-50 p-4 rounded-lg border border-gray-200 whitespace-pre-wrap">
                  {viewingDraft.answer}
                </div>
              </div>

              {/* Category */}
              <div>
                <Label className="text-sm font-semibold text-gray-700">Category</Label>
                <div className="mt-2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                    {viewingDraft.category || "General"}
                  </span>
                </div>
              </div>

              {/* Source URL */}
              {viewingDraft.sourceUrl && (
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Source URL</Label>
                  <a
                    href={viewingDraft.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block text-sm text-blue-600 hover:text-blue-800 hover:underline break-all bg-blue-50 p-3 rounded-lg border border-blue-200"
                  >
                    {viewingDraft.sourceUrl}
                  </a>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  variant="default"
                  onClick={() => {
                    setViewDraftDialogOpen(false);
                    openEditDraftDialog(viewingDraft);
                  }}
                  className="flex-1"
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Draft
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    handlePublishDraft(viewingDraft.id);
                    setViewDraftDialogOpen(false);
                  }}
                  disabled={publishDraftMutation.isPending}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  <Send className="mr-2 h-4 w-4" />
                  Publish to FAQs
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setViewDraftDialogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Published FAQ Detail Dialog */}
      <Dialog open={viewFaqDialogOpen} onOpenChange={setViewFaqDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Published FAQ Details</DialogTitle>
            <DialogDescription>
              Complete information about this published FAQ
            </DialogDescription>
          </DialogHeader>
          {viewingFaq && (
            <div className="space-y-6">
              {/* Question */}
              <div>
                <Label className="text-sm font-semibold text-gray-700">Question</Label>
                <p className="mt-2 text-base text-gray-900 bg-gray-50 p-4 rounded-lg border border-gray-200">
                  {viewingFaq.question}
                </p>
              </div>

              {/* Answer */}
              <div>
                <Label className="text-sm font-semibold text-gray-700">Answer</Label>
                <div className="mt-2 text-base text-gray-900 bg-gray-50 p-4 rounded-lg border border-gray-200 whitespace-pre-wrap">
                  {viewingFaq.answer}
                </div>
              </div>

              {/* Category */}
              <div>
                <Label className="text-sm font-semibold text-gray-700">Category</Label>
                <div className="mt-2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    {viewingFaq.category || "General"}
                  </span>
                </div>
              </div>

              {/* Created Date */}
              <div>
                <Label className="text-sm font-semibold text-gray-700">Created</Label>
                <p className="mt-2 text-sm text-gray-600">
                  {new Date(viewingFaq.createdAt).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  variant="default"
                  onClick={() => {
                    setViewFaqDialogOpen(false);
                    openEditDialog(viewingFaq);
                  }}
                  className="flex-1"
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit FAQ
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleDelete(viewingFaq.id);
                    setViewFaqDialogOpen(false);
                  }}
                  className="flex-1"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete FAQ
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setViewFaqDialogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
