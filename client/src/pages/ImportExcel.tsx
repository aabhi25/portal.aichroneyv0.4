import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Download, Upload, ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import * as XLSX from 'xlsx';

export default function ImportExcel() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    imported?: number;
    skipped?: number;
    errors?: string[];
  } | null>(null);

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Name': 'Example Product 1',
        'Description': 'This is a sample product description',
        'Price': '99.99',
        'Image': 'https://example.com/image1.jpg',
        'Categories': 'Shoes, Accessories',
        'Tags': 'Summer Collection, Bestseller'
      },
      {
        'Name': 'Example Product 2',
        'Description': 'Another sample product',
        'Price': '149.99',
        'Image': '',
        'Categories': 'Clothing',
        'Tags': 'New Arrival'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

    const columnWidths = [
      { wch: 25 },  // Name
      { wch: 40 },  // Description
      { wch: 10 },  // Price
      { wch: 40 },  // Image
      { wch: 30 },  // Categories
      { wch: 30 }   // Tags
    ];
    worksheet['!cols'] = columnWidths;

    XLSX.writeFile(workbook, 'product_import_template.xlsx');
    
    toast({
      title: "Template Downloaded",
      description: "Excel template has been downloaded. Fill it with your product data and upload.",
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadResult(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/products/import-excel', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import Excel file');
      }

      const result = await response.json();
      setUploadResult({
        success: true,
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors
      });
      
      toast({
        title: "Success",
        description: result.message || "Products imported successfully",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    } catch (error: any) {
      setUploadResult({
        success: false,
        errors: [error.message]
      });
      
      toast({
        title: "Error",
        description: error.message || "Failed to import Excel file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <Button
        variant="ghost"
        onClick={() => setLocation('/admin/products')}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Products
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-purple-600" />
            Import Products from Excel
          </CardTitle>
          <CardDescription>
            Download the template, fill it with your product data, and upload it to import multiple products at once
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
              Step 1: Download Template
            </h3>
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-4">
              Download our Excel template with the correct format and sample data
            </p>
            <Button
              onClick={handleDownloadTemplate}
              variant="outline"
              className="border-blue-300 dark:border-blue-700"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>

          <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900 dark:text-purple-100 mb-2">
              Step 2: Fill Your Data
            </h3>
            <div className="text-sm text-purple-800 dark:text-purple-200 space-y-2">
              <p>Open the downloaded template and fill in your product information:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Name</strong> (required): Product name or title</li>
                <li><strong>Description</strong>: Product description or details</li>
                <li><strong>Price</strong>: Product price (numbers only, no currency symbols)</li>
                <li><strong>Image</strong>: Product image URL (optional)</li>
                <li><strong>Categories</strong> (optional): Comma-separated category names (e.g., "Shoes, Accessories")</li>
                <li><strong>Tags</strong> (optional): Comma-separated tag names (e.g., "Summer Collection, Bestseller")</li>
              </ul>
              <p className="mt-2 text-xs">
                Note: Column names are case-insensitive. You can also use "Product Name" or "Title" for the name column.
              </p>
            </div>
          </div>

          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">
              Step 3: Upload File
            </h3>
            <p className="text-sm text-green-800 dark:text-green-200 mb-4">
              Select your filled Excel file to import products
            </p>
            <div className="flex items-center gap-4">
              <Button
                onClick={() => document.getElementById('file-upload')?.click()}
                disabled={isUploading}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                <Upload className="h-4 w-4 mr-2" />
                {isUploading ? "Uploading..." : "Upload Excel File"}
              </Button>
              <input
                id="file-upload"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <span className="text-sm text-muted-foreground">
                Supports: .xlsx, .xls, .csv
              </span>
            </div>
          </div>

          {uploadResult && (
            <div className={`rounded-lg p-4 ${
              uploadResult.success 
                ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' 
                : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
            }`}>
              <div className="flex items-start gap-3">
                {uploadResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                )}
                <div className="flex-1">
                  <h4 className={`font-semibold mb-2 ${
                    uploadResult.success 
                      ? 'text-green-900 dark:text-green-100' 
                      : 'text-red-900 dark:text-red-100'
                  }`}>
                    {uploadResult.success ? 'Import Successful!' : 'Import Failed'}
                  </h4>
                  {uploadResult.success && (
                    <div className="text-sm text-green-800 dark:text-green-200 space-y-1">
                      <p>✓ {uploadResult.imported} products imported successfully</p>
                      {uploadResult.skipped! > 0 && (
                        <p>⚠ {uploadResult.skipped} rows skipped</p>
                      )}
                    </div>
                  )}
                  {uploadResult.errors && uploadResult.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-red-900 dark:text-red-100 mb-1">
                        Errors:
                      </p>
                      <ul className="text-sm text-red-800 dark:text-red-200 space-y-1">
                        {uploadResult.errors.map((error, idx) => (
                          <li key={idx} className="ml-4">• {error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {uploadResult.success && (
                    <Button
                      onClick={() => setLocation('/admin/products')}
                      variant="outline"
                      className="mt-4 border-green-300 dark:border-green-700"
                    >
                      View Products
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
