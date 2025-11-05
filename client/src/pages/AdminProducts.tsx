import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueries } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Product, type InsertProduct, type Category, type Tag } from "@shared/schema";

interface ProductWithMeta extends Product {
  categories?: Category[];
  tags?: Tag[];
}
import { Button } from "@/components/ui/button";
import CategoryManager from "@/components/admin/CategoryManager";
import TagManager from "@/components/admin/TagManager";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Package, Upload, Check, ShoppingBag, X, FolderTree, Tags as TagsIcon, FileSpreadsheet, ChevronDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WidgetSettings {
  id: string;
  businessAccountId: string;
  currency: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  AED: "د.إ",
  EUR: "€",
  GBP: "£",
  AUD: "A$",
  CAD: "C$",
  CHF: "CHF",
  CNY: "¥",
  JPY: "¥",
  KRW: "₩",
  SGD: "S$",
  HKD: "HK$",
  NZD: "NZ$",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  PLN: "zł",
  BRL: "R$",
  MXN: "$",
  ZAR: "R",
  TRY: "₺",
  RUB: "₽",
};

export default function AdminProducts() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("products");
  
  const [showForm, setShowForm] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageInputMethod, setImageInputMethod] = useState<"upload" | "url">("upload");
  const [formData, setFormData] = useState<Partial<InsertProduct>>({
    name: "",
    description: "",
    price: "0",
    imageUrl: "",
  });
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [relationshipsDialogOpen, setRelationshipsDialogOpen] = useState(false);
  const [productRelationships, setProductRelationships] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Use useQueries to fetch categories and tags for all products in parallel
  const productMetaQueries = useQueries({
    queries: products.map((product) => ({
      queryKey: [`/api/products/${product.id}/meta`],
      queryFn: async () => {
        const [categories, tags] = await Promise.all([
          apiRequest<Category[]>("GET", `/api/products/${product.id}/categories`),
          apiRequest<Tag[]>("GET", `/api/products/${product.id}/tags`)
        ]);
        return { productId: product.id, categories, tags };
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
    })),
  });

  // Combine products with their metadata
  const productsWithMeta: ProductWithMeta[] = useMemo(() => {
    // Check if all queries have finished loading
    const allLoaded = productMetaQueries.every(q => q.isSuccess || q.isError);
    
    if (!allLoaded && productMetaQueries.length > 0) {
      // Still loading, return products without metadata
      return products.map(p => ({ ...p, categories: [], tags: [] }));
    }
    
    return products.map((product, index) => {
      const meta = productMetaQueries[index]?.data;
      return {
        ...product,
        categories: meta?.categories || [],
        tags: meta?.tags || [],
      };
    });
  }, [products, productMetaQueries.map(q => q.dataUpdatedAt).join(',')]);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  const { data: widgetSettings } = useQuery<WidgetSettings>({
    queryKey: ["/api/widget-settings"],
  });

  const currencySymbol = widgetSettings ? CURRENCY_SYMBOLS[widgetSettings.currency] || "$" : "$";

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setDeleteDialogOpen(false);
      setProductToDelete(null);
      toast({
        title: "Product deleted",
        description: "Product has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete product",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      price: "",
      imageUrl: "",
    });
    setEditingProduct(null);
    setSelectedCategoryIds([]);
    setSelectedTagIds([]);
  };

  const handleSubmit = async () => {
    // Prevent double submission
    if (isSubmitting) return;
    
    // Convert empty price string to null for database
    const submitData = {
      ...formData,
      price: formData.price === "" ? null : formData.price
    };
    
    setIsSubmitting(true);
    try {
      let productId: string;
      
      if (editingProduct) {
        await apiRequest("PATCH", `/api/products/${editingProduct.id}`, submitData);
        productId = editingProduct.id;
      } else {
        const result = await apiRequest<Product>("POST", "/api/products", submitData);
        productId = result.id;
      }

      // Update category associations
      await apiRequest("PUT", `/api/products/${productId}/categories`, { categoryIds: selectedCategoryIds });

      // Update tag associations
      await apiRequest("PUT", `/api/products/${productId}/tags`, { tagIds: selectedTagIds });

      // Invalidate product list and all product metadata queries
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      products.forEach(p => {
        queryClient.invalidateQueries({ queryKey: [`/api/products/${p.id}/meta`] });
      });
      
      setShowForm(false);
      resetForm();
      toast({
        title: editingProduct ? "Product updated" : "Product created",
        description: `Product has been ${editingProduct ? "updated" : "created"} successfully.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save product",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description,
      price: product.price || "",
      imageUrl: product.imageUrl || "",
    });

    // Fetch existing category and tag associations
    try {
      const productCategories = await apiRequest<Category[]>("GET", `/api/products/${product.id}/categories`);
      const productTags = await apiRequest<Tag[]>("GET", `/api/products/${product.id}/tags`);
      
      setSelectedCategoryIds(productCategories.map(pc => pc.id));
      setSelectedTagIds(productTags.map(pt => pt.id));
    } catch (error) {
      console.error("Failed to load product associations:", error);
      setSelectedCategoryIds([]);
      setSelectedTagIds([]);
    }

    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    setProductToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (productToDelete) {
      deleteMutation.mutate(productToDelete);
    }
  };

  const handleAddNew = () => {
    resetForm();
    setShowForm(true);
  };

  const handleView = (product: Product) => {
    setViewingProduct(product);
    setViewDialogOpen(true);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      setUploadingImage(true);

      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload-image', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await response.json();
      setFormData(prev => ({ ...prev, imageUrl: data.imageUrl }));

      toast({
        title: "Image uploaded",
        description: "Product image uploaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setUploadingImage(false);
      // Reset the file input
      event.target.value = '';
    }
  };

  const handleRemoveImage = async () => {
    try {
      if (!formData.imageUrl) return;

      const response = await fetch('/api/delete-image', {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl: formData.imageUrl }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete image');
      }

      setFormData(prev => ({ ...prev, imageUrl: '' }));

      toast({
        title: "Image removed",
        description: "Product image has been removed.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove image",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Package className="w-6 h-6 text-purple-600" />
            Product Catalog Management
          </CardTitle>
          <CardDescription>Manage your products, categories, and tags</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="products">
                <ShoppingBag className="w-4 h-4 mr-2" />
                Products
              </TabsTrigger>
              <TabsTrigger value="categories">
                <FolderTree className="w-4 h-4 mr-2" />
                Categories
              </TabsTrigger>
              <TabsTrigger value="tags">
                <TagsIcon className="w-4 h-4 mr-2" />
                Tags
              </TabsTrigger>
            </TabsList>

            <TabsContent value="products" className="mt-6">
              {!showForm && (
                <div className="flex justify-end gap-2 mb-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="outline"
                        disabled={isImporting}
                        className="border-purple-200 dark:border-purple-800"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {isImporting ? "Importing..." : "Import"}
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={async () => {
                          setIsImporting(true);
                          try {
                            const response = await apiRequest("POST", "/api/shopify/import");
                            toast({
                              title: "Success",
                              description: response.message || "Products imported successfully",
                            });
                            queryClient.invalidateQueries({ queryKey: ["/api/products"] });
                          } catch (error: any) {
                            toast({
                              title: "Error",
                              description: error.message || "Failed to import products from Shopify",
                              variant: "destructive",
                            });
                          } finally {
                            setIsImporting(false);
                          }
                        }}
                        disabled={isImporting}
                      >
                        <ShoppingBag className="h-4 w-4 mr-2" />
                        Import from Shopify
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          window.location.href = '/products/import-excel';
                        }}
                      >
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Import from Excel
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button onClick={handleAddNew} data-testid="button-add-product" className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Product
                  </Button>
                </div>
              )}

              {showForm && (
                <Card className="mb-6 border-2 border-purple-200 dark:border-purple-800">
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Package className="w-5 h-5 text-purple-600" />
                      {editingProduct ? "Edit Product" : "Add New Product"}
                    </CardTitle>
                    <CardDescription>
                      {editingProduct ? "Update product information" : "Fill in the details for the new product"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">
                          Product Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Enter product name"
                          data-testid="input-product-name"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="description">
                          Description <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          placeholder="Enter product description"
                          rows={3}
                          data-testid="input-product-description"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="price">Price (optional)</Label>
                        <Input
                          id="price"
                          type="number"
                          step="0.01"
                          value={formData.price || ""}
                          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                          placeholder="0.00"
                          data-testid="input-product-price"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Product Image (optional)</Label>
                        <div className="flex flex-col gap-3">
                          {formData.imageUrl ? (
                            <div className="space-y-3">
                              <div className="relative w-32 h-32 rounded-md border overflow-hidden">
                                <img 
                                  src={formData.imageUrl} 
                                  alt="Product preview"
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'flex';
                                  }}
                                />
                                <div 
                                  className="w-full h-full bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 flex items-center justify-center"
                                  style={{ display: 'none' }}
                                >
                                  <div className="text-center p-4">
                                    <ShoppingBag className="w-12 h-12 text-purple-500 mx-auto mb-2" />
                                    <p className="text-xs text-muted-foreground">Image failed to load</p>
                                  </div>
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleRemoveImage}
                                className="w-fit"
                              >
                                <X className="h-4 w-4 mr-2" />
                                Remove Image
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant={imageInputMethod === "upload" ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setImageInputMethod("upload")}
                                  className="flex-1"
                                >
                                  <Upload className="h-4 w-4 mr-2" />
                                  Upload File
                                </Button>
                                <Button
                                  type="button"
                                  variant={imageInputMethod === "url" ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setImageInputMethod("url")}
                                  className="flex-1"
                                >
                                  Enter URL
                                </Button>
                              </div>
                              
                              {imageInputMethod === "upload" ? (
                                <Input
                                  type="file"
                                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                                  onChange={handleImageUpload}
                                  disabled={uploadingImage}
                                  className="cursor-pointer"
                                />
                              ) : (
                                <div className="space-y-2">
                                  <Input
                                    type="url"
                                    placeholder="https://example.com/image.jpg"
                                    value={formData.imageUrl || ""}
                                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Use direct image URLs (ending in .jpg, .png, etc). Google Drive/Photos sharing links may not work due to security restrictions. Consider uploading the file instead.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {uploadingImage && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                              <span>Processing image...</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {categories.length > 0 && (
                        <div className="grid gap-2">
                          <Label>Categories (optional)</Label>
                          <ScrollArea className="h-[120px] rounded-md border p-4">
                            <div className="space-y-2">
                              {categories.map((category) => (
                                <div key={category.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`category-${category.id}`}
                                    checked={selectedCategoryIds.includes(category.id)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setSelectedCategoryIds([...selectedCategoryIds, category.id]);
                                      } else {
                                        setSelectedCategoryIds(selectedCategoryIds.filter(id => id !== category.id));
                                      }
                                    }}
                                  />
                                  <label
                                    htmlFor={`category-${category.id}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                  >
                                    {category.name}
                                    {category.description && (
                                      <span className="text-xs text-muted-foreground ml-2">
                                        {category.description}
                                      </span>
                                    )}
                                  </label>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                          <p className="text-xs text-muted-foreground">
                            Select categories to organize this product
                          </p>
                        </div>
                      )}

                      {tags.length > 0 && (
                        <div className="grid gap-2">
                          <Label>Tags (optional)</Label>
                          <ScrollArea className="h-[120px] rounded-md border p-4">
                            <div className="flex flex-wrap gap-2">
                              {tags.map((tag) => (
                                <div key={tag.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`tag-${tag.id}`}
                                    checked={selectedTagIds.includes(tag.id)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setSelectedTagIds([...selectedTagIds, tag.id]);
                                      } else {
                                        setSelectedTagIds(selectedTagIds.filter(id => id !== tag.id));
                                      }
                                    }}
                                  />
                                  <label
                                    htmlFor={`tag-${tag.id}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer inline-flex items-center gap-1.5"
                                  >
                                    {tag.color && (
                                      <span
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: tag.color }}
                                      />
                                    )}
                                    {tag.name}
                                  </label>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                          <p className="text-xs text-muted-foreground">
                            Add tags to help customers find this product
                          </p>
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => {
                          setShowForm(false);
                          resetForm();
                        }}>
                          Cancel
                        </Button>
                        <Button
                          onClick={handleSubmit}
                          disabled={!formData.name || !formData.description || isSubmitting}
                          data-testid="button-submit-product"
                          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                        >
                          {isSubmitting ? "Saving..." : editingProduct ? "Update Product" : "Create Product"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-sm text-muted-foreground">Loading products...</p>
              </div>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No products yet. Click "Add Product" to create one.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2 md:mx-0">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 md:w-20">Image</TableHead>
                    <TableHead className="min-w-[120px]">Name</TableHead>
                    <TableHead className="min-w-[200px] hidden sm:table-cell">Description</TableHead>
                    <TableHead className="min-w-[100px] hidden lg:table-cell">Categories</TableHead>
                    <TableHead className="min-w-[100px] hidden lg:table-cell">Tags</TableHead>
                    <TableHead className="min-w-[80px]">Price</TableHead>
                    <TableHead className="text-right min-w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {productsWithMeta.map((product) => (
                  <TableRow 
                    key={product.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleView(product)}
                  >
                    <TableCell>
                      {product.imageUrl ? (
                        <img 
                          src={product.imageUrl} 
                          alt={product.name}
                          className="w-16 h-16 object-cover rounded-md border"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div 
                        className="w-16 h-16 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 rounded-md border border-purple-200 dark:border-purple-800 flex items-center justify-center"
                        style={{ display: product.imageUrl ? 'none' : 'flex' }}
                      >
                        <ShoppingBag className="w-8 h-8 text-purple-500" />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {product.name}
                        {product.source === 'shopify' && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800">
                            <ShoppingBag className="w-3 h-3 mr-1" />
                            Shopify
                          </Badge>
                        )}
                        {product.source === 'manual' && (
                          <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-300 dark:border-gray-800">
                            Manual
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md truncate hidden sm:table-cell">{product.description}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1 max-w-[150px]">
                        {product.categories && product.categories.length > 0 ? (
                          product.categories.map((category) => (
                            <Badge 
                              key={category.id} 
                              variant="outline" 
                              className="text-xs bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800"
                            >
                              <FolderTree className="w-3 h-3 mr-1" />
                              {category.name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1 max-w-[150px]">
                        {product.tags && product.tags.length > 0 ? (
                          product.tags.map((tag) => (
                            <Badge 
                              key={tag.id} 
                              variant="outline" 
                              className="text-xs"
                              style={{
                                backgroundColor: tag.color ? `${tag.color}15` : undefined,
                                borderColor: tag.color || undefined,
                                color: tag.color || undefined
                              }}
                            >
                              <TagsIcon className="w-3 h-3 mr-1" />
                              {tag.name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {product.price ? `${currencySymbol}${product.price}` : "—"}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(product)}
                          data-testid={`button-edit-${product.id}`}
                          className="h-8 w-8 p-0"
                          disabled={product.isEditable === 'false' || product.source === 'shopify'}
                          title={product.source === 'shopify' ? 'Shopify products are read-only. Update them in Shopify and re-import.' : 'Edit product'}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(product.id)}
                          data-testid={`button-delete-${product.id}`}
                          className="h-8 w-8 p-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </div>
          )}
            </TabsContent>

            <TabsContent value="categories" className="mt-6">
              <CategoryManager />
            </TabsContent>

            <TabsContent value="tags" className="mt-6">
              <TagManager />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this product? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Package className="w-5 h-5 text-purple-600" />
              Product Details
            </DialogTitle>
            <DialogDescription>
              Complete information about this product
            </DialogDescription>
          </DialogHeader>
          {viewingProduct && (
            <div className="space-y-6 py-4">
              <div className="flex justify-center">
                {viewingProduct.imageUrl && viewingProduct.imageUrl.trim() !== "" ? (
                  <>
                    <img 
                      src={viewingProduct.imageUrl} 
                      alt={viewingProduct.name}
                      className="w-48 h-48 object-cover rounded-lg border shadow-sm"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                    <div className="w-48 h-48 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 rounded-lg border border-purple-200 dark:border-purple-800 items-center justify-center" style={{ display: 'none' }}>
                      <ShoppingBag className="w-20 h-20 text-purple-500" />
                    </div>
                  </>
                ) : (
                  <div className="w-48 h-48 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 rounded-lg border border-purple-200 dark:border-purple-800 flex items-center justify-center">
                    <ShoppingBag className="w-20 h-20 text-purple-500" />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Product Name</Label>
                <p className="text-base font-medium leading-relaxed">{viewingProduct.name}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Description</Label>
                <p className="text-base text-muted-foreground leading-relaxed whitespace-pre-wrap">{viewingProduct.description}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Price</Label>
                <p className="text-base text-muted-foreground">
                  {viewingProduct.price ? `${currencySymbol}${viewingProduct.price}` : "Price available upon inquiry"}
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
            <Button 
              onClick={() => {
                if (viewingProduct) {
                  setViewDialogOpen(false);
                  handleEdit(viewingProduct);
                }
              }}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
