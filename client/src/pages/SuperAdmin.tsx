import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, Pencil } from "lucide-react";
import type { BusinessAccount } from "@shared/schema";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Sparkles } from "lucide-react";

export default function SuperAdmin() {
  const [newBusinessName, setNewBusinessName] = useState("");
  const [newBusinessWebsite, setNewBusinessWebsite] = useState("");
  const [isBusinessDialogOpen, setIsBusinessDialogOpen] = useState(false);
  
  const [editingBusiness, setEditingBusiness] = useState<BusinessAccount | null>(null);
  const [editBusinessName, setEditBusinessName] = useState("");
  const [editBusinessWebsite, setEditBusinessWebsite] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const { toast } = useToast();

  // Fetch business accounts
  const { data: businessAccounts = [] } = useQuery<BusinessAccount[]>({
    queryKey: ["/api/business-accounts"],
  });

  // Create business account mutation
  const createBusinessMutation = useMutation({
    mutationFn: async (data: { name: string; website: string }) => {
      return await apiRequest<BusinessAccount>("POST", "/api/business-accounts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-accounts"] });
      setNewBusinessName("");
      setNewBusinessWebsite("");
      setIsBusinessDialogOpen(false);
      toast({
        title: "Success",
        description: "Business account created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create business account",
        variant: "destructive",
      });
    },
  });

  const handleCreateBusiness = (e: React.FormEvent) => {
    e.preventDefault();
    if (newBusinessName.trim() && newBusinessWebsite.trim()) {
      createBusinessMutation.mutate({ 
        name: newBusinessName.trim(),
        website: newBusinessWebsite.trim()
      });
    }
  };

  // Update business account mutation
  const updateBusinessMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; website: string }) => {
      return await apiRequest<BusinessAccount>("PUT", `/api/business-accounts/${data.id}`, {
        name: data.name,
        website: data.website,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-accounts"] });
      setIsEditDialogOpen(false);
      setEditingBusiness(null);
      toast({
        title: "Success",
        description: "Business account updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update business account",
        variant: "destructive",
      });
    },
  });

  const handleEditBusiness = (business: BusinessAccount) => {
    setEditingBusiness(business);
    setEditBusinessName(business.name);
    setEditBusinessWebsite(business.website || "");
    setIsEditDialogOpen(true);
  };

  const handleUpdateBusiness = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBusiness && editBusinessName.trim() && editBusinessWebsite.trim()) {
      updateBusinessMutation.mutate({
        id: editingBusiness.id,
        name: editBusinessName.trim(),
        website: editBusinessWebsite.trim(),
      });
    }
  };


  return (
    <div className="flex flex-col flex-1 h-screen">
      {/* Header */}
      <header className="flex items-center justify-between h-[56px] px-6 bg-gradient-to-r from-red-500 via-purple-600 to-blue-600 shadow-sm">
        <div className="flex items-center gap-3">
          <SidebarTrigger data-testid="button-sidebar-toggle" className="text-white hover:bg-white/10 rounded-md" />
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold text-white leading-tight">AI Chroney</h1>
              <p className="text-[11px] text-white/90 leading-tight mt-0.5">Super Admin Dashboard</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Business Accounts</h2>
              <p className="text-sm text-gray-600 mt-1">
                Manage business accounts and their users
              </p>
            </div>
            <Dialog open={isBusinessDialogOpen} onOpenChange={setIsBusinessDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-sm" data-testid="button-create-business">
                  <Plus className="w-4 h-4 mr-2" />
                  New Business Account
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Business Account</DialogTitle>
                  <DialogDescription>
                    Add a new business account to the platform
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateBusiness} className="space-y-4">
                  <div>
                    <Label htmlFor="businessName">Business Name</Label>
                    <Input
                      id="businessName"
                      placeholder="e.g., Acme Corporation"
                      value={newBusinessName}
                      onChange={(e) => setNewBusinessName(e.target.value)}
                      required
                      data-testid="input-business-name"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="businessWebsite">Website URL</Label>
                    <Input
                      id="businessWebsite"
                      type="url"
                      placeholder="e.g., https://example.com"
                      value={newBusinessWebsite}
                      onChange={(e) => setNewBusinessWebsite(e.target.value)}
                      required
                      data-testid="input-business-website"
                      className="mt-1.5"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">
                      This website will be used to train the AI chatbot
                    </p>
                  </div>
                  <Button type="submit" disabled={createBusinessMutation.isPending} data-testid="button-submit-business" className="w-full">
                    {createBusinessMutation.isPending ? "Creating..." : "Create Business Account"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Edit Business Account Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Business Account</DialogTitle>
                <DialogDescription>
                  Update the business account details
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpdateBusiness} className="space-y-4">
                <div>
                  <Label htmlFor="editBusinessName">Business Name</Label>
                  <Input
                    id="editBusinessName"
                    placeholder="e.g., Acme Corporation"
                    value={editBusinessName}
                    onChange={(e) => setEditBusinessName(e.target.value)}
                    required
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="editBusinessWebsite">Website URL</Label>
                  <Input
                    id="editBusinessWebsite"
                    type="url"
                    placeholder="e.g., https://example.com"
                    value={editBusinessWebsite}
                    onChange={(e) => setEditBusinessWebsite(e.target.value)}
                    required
                    className="mt-1.5"
                  />
                  <p className="text-xs text-gray-500 mt-1.5">
                    This website will be used to train the AI chatbot
                  </p>
                </div>
                <Button type="submit" disabled={updateBusinessMutation.isPending} className="w-full">
                  {updateBusinessMutation.isPending ? "Updating..." : "Update Business Account"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {businessAccounts.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No business accounts yet</h3>
              <p className="text-sm text-gray-600">
                Create your first business account to get started
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold">Business Name</TableHead>
                    <TableHead className="font-semibold">Website</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Created</TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {businessAccounts.map((business) => (
                    <TableRow key={business.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-purple-600" />
                          {business.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {business.website ? (
                          <a 
                            href={business.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-purple-600 hover:underline"
                          >
                            {business.website}
                          </a>
                        ) : (
                          <span className="text-gray-400">No website</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={business.status === "active" ? "default" : "secondary"}>
                          {business.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {new Date(business.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditBusiness(business)}
                          className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                        >
                          <Pencil className="h-4 w-4 mr-1.5" />
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

