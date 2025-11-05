import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings2, Save, Check, Key, AlertCircle, Lock, ShoppingBag } from "lucide-react";

interface WidgetSettings {
  id: string;
  businessAccountId: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

const CURRENCIES = [
  { value: "INR", label: "Indian Rupee (₹)", symbol: "₹" },
  { value: "USD", label: "US Dollar ($)", symbol: "$" },
  { value: "AED", label: "UAE Dirham (د.إ)", symbol: "د.إ" },
  { value: "EUR", label: "Euro (€)", symbol: "€" },
  { value: "GBP", label: "British Pound (£)", symbol: "£" },
  { value: "AUD", label: "Australian Dollar (A$)", symbol: "A$" },
  { value: "CAD", label: "Canadian Dollar (C$)", symbol: "C$" },
  { value: "CHF", label: "Swiss Franc (CHF)", symbol: "CHF" },
  { value: "CNY", label: "Chinese Yuan (¥)", symbol: "¥" },
  { value: "JPY", label: "Japanese Yen (¥)", symbol: "¥" },
  { value: "KRW", label: "South Korean Won (₩)", symbol: "₩" },
  { value: "SGD", label: "Singapore Dollar (S$)", symbol: "S$" },
  { value: "HKD", label: "Hong Kong Dollar (HK$)", symbol: "HK$" },
  { value: "NZD", label: "New Zealand Dollar (NZ$)", symbol: "NZ$" },
  { value: "SEK", label: "Swedish Krona (kr)", symbol: "kr" },
  { value: "NOK", label: "Norwegian Krone (kr)", symbol: "kr" },
  { value: "DKK", label: "Danish Krone (kr)", symbol: "kr" },
  { value: "PLN", label: "Polish Zloty (zł)", symbol: "zł" },
  { value: "BRL", label: "Brazilian Real (R$)", symbol: "R$" },
  { value: "MXN", label: "Mexican Peso ($)", symbol: "$" },
  { value: "ZAR", label: "South African Rand (R)", symbol: "R" },
  { value: "TRY", label: "Turkish Lira (₺)", symbol: "₺" },
  { value: "RUB", label: "Russian Ruble (₽)", symbol: "₽" },
];

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState("USD");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyError, setApiKeyError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [apiKeySaveStatus, setApiKeySaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  
  // Shopify state
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState("");
  const [shopifyAccessToken, setShopifyAccessToken] = useState("");
  const [shopifyError, setShopifyError] = useState("");
  const [shopifySaveStatus, setShopifySaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const { data: settings, isLoading } = useQuery<WidgetSettings>({
    queryKey: ["/api/widget-settings"],
  });

  const { data: apiKeyData } = useQuery<{ hasKey: boolean; maskedKey: string | null }>({
    queryKey: ["/api/settings/openai-key"],
  });

  const { data: shopifyData } = useQuery<{ storeUrl: string | null; hasToken: boolean; maskedToken: string | null }>({
    queryKey: ["/api/settings/shopify"],
  });

  useEffect(() => {
    if (settings) {
      setCurrency(settings.currency);
    }
  }, [settings]);

  useEffect(() => {
    if (apiKeyData?.maskedKey) {
      setApiKey(apiKeyData.maskedKey);
    }
  }, [apiKeyData]);

  useEffect(() => {
    if (shopifyData) {
      setShopifyStoreUrl(shopifyData.storeUrl || "");
      if (shopifyData.maskedToken) {
        setShopifyAccessToken(shopifyData.maskedToken);
      }
    }
  }, [shopifyData]);

  // Auto-save effect with debouncing for currency
  useEffect(() => {
    if (!settings) return;
    
    const hasChanges = currency !== settings.currency;

    if (!hasChanges) {
      setSaveStatus("idle");
      return;
    }
    
    const timeoutId = setTimeout(() => {
      setSaveStatus("saving");
      updateMutation.mutate({ currency });
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [currency]);


  // Auto-save effect for API key with validation
  useEffect(() => {
    if (!apiKeyData) return;
    
    // Skip if it's the masked key (not changed)
    if (apiKey === apiKeyData.maskedKey) {
      setApiKeySaveStatus("idle");
      return;
    }

    // Skip if empty and no key exists
    if (!apiKey && !apiKeyData.hasKey) {
      setApiKeySaveStatus("idle");
      return;
    }

    // Validate format before saving
    if (apiKey && !apiKey.startsWith('sk-')) {
      setApiKeyError("API key must start with 'sk-'");
      setApiKeySaveStatus("idle");
      return;
    }

    if (apiKey && apiKey.length > 0 && apiKey.length < 20 && !apiKey.includes('...')) {
      setApiKeyError("API key is too short");
      setApiKeySaveStatus("idle");
      return;
    }

    setApiKeyError("");
    
    const timeoutId = setTimeout(() => {
      setApiKeySaveStatus("saving");
      updateApiKeyMutation.mutate({ apiKey });
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [apiKey]);

  const updateMutation = useMutation({
    mutationFn: async (data: { currency: string }) => {
      const response = await fetch("/api/widget-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to update settings");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/widget-settings"] });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
      setSaveStatus("idle");
    },
  });


  const updateApiKeyMutation = useMutation({
    mutationFn: async (data: { apiKey: string }) => {
      const response = await fetch("/api/settings/openai-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update API key");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/openai-key"] });
      setApiKeySaveStatus("saved");
      // Update to masked version
      if (data.maskedKey) {
        setApiKey(data.maskedKey);
      }
      setApiKeyError("");
      setTimeout(() => setApiKeySaveStatus("idle"), 2000);
    },
    onError: (error: any) => {
      setApiKeyError(error.message || "Failed to save API key");
      setApiKeySaveStatus("idle");
    },
  });

  const updateShopifyMutation = useMutation({
    mutationFn: async (data: { storeUrl: string; accessToken: string }) => {
      const response = await fetch("/api/settings/shopify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update Shopify settings");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/shopify"] });
      setShopifySaveStatus("saved");
      if (data.maskedToken) {
        setShopifyAccessToken(data.maskedToken);
      }
      setShopifyError("");
      setTimeout(() => setShopifySaveStatus("idle"), 2000);
      toast({
        title: "Success",
        description: "Shopify credentials saved successfully",
      });
    },
    onError: (error: any) => {
      setShopifyError(error.message || "Failed to save Shopify credentials");
      setShopifySaveStatus("idle");
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await fetch("/api/settings/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to change password");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Password changed successfully",
      });
      // Clear form
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError("");
    },
    onError: (error: any) => {
      setPasswordError(error.message || "Failed to change password");
    },
  });

  const handleShopifySave = () => {
    setShopifyError("");
    
    // Validate inputs
    if (!shopifyStoreUrl && !shopifyAccessToken) {
      // If both are empty, clear the settings
      setShopifySaveStatus("saving");
      updateShopifyMutation.mutate({ storeUrl: "", accessToken: "" });
      return;
    }

    if (!shopifyStoreUrl || !shopifyAccessToken) {
      setShopifyError("Both store URL and access token are required");
      return;
    }

    setShopifySaveStatus("saving");
    updateShopifyMutation.mutate({
      storeUrl: shopifyStoreUrl,
      accessToken: shopifyAccessToken,
    });
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    // Validate inputs
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("All fields are required");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    // Submit password change
    changePasswordMutation.mutate({
      currentPassword,
      newPassword,
    });
  };

  const currencySymbol = CURRENCIES.find(c => c.value === currency)?.symbol || "$";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Settings2 className="w-6 h-6 text-purple-600" />
                Settings
              </CardTitle>
              <CardDescription>
                Manage your account and application settings
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {saveStatus === "saving" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Save className="w-4 h-4 animate-pulse" />
                  <span>Saving...</span>
                </div>
              )}
              {saveStatus === "saved" && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Check className="w-4 h-4" />
                  <span>Saved</span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* OpenAI API Key Section */}
          <div className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Key className="w-5 h-5 text-purple-600" />
                  OpenAI API Key
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Configure your OpenAI API key to enable Chroney chat functionality
                </p>
              </div>
              <div className="flex items-center gap-2">
                {apiKeySaveStatus === "saving" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Save className="w-4 h-4 animate-pulse" />
                    <span>Saving...</span>
                  </div>
                )}
                {apiKeySaveStatus === "saved" && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Check className="w-4 h-4" />
                    <span>Saved</span>
                  </div>
                )}
              </div>
            </div>
            <div className="max-w-md">
              <Label htmlFor="apiKey" className="text-sm font-medium">
                API Key
              </Label>
              <Input
                id="apiKey"
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="mt-2"
              />
              {apiKeyError && (
                <div className="flex items-center gap-2 mt-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>{apiKeyError}</span>
                </div>
              )}
              {!apiKeyError && apiKeyData?.hasKey && (
                <p className="text-xs text-green-600 mt-1">
                  ✓ API key configured
                </p>
              )}
              {!apiKeyError && !apiKeyData?.hasKey && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠ No API key configured - Chroney chat will be offline
                </p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Get your API key from{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:underline"
                >
                  OpenAI Platform
                </a>
              </p>
            </div>
          </div>

          {/* Shopify Integration Section */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-purple-600" />
                  Shopify Integration
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Connect your Shopify store to automatically import products
                </p>
              </div>
              <div className="flex items-center gap-2">
                {shopifySaveStatus === "saving" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Save className="w-4 h-4 animate-pulse" />
                    <span>Saving...</span>
                  </div>
                )}
                {shopifySaveStatus === "saved" && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Check className="w-4 h-4" />
                    <span>Saved</span>
                  </div>
                )}
              </div>
            </div>
            <div className="max-w-md space-y-4">
              <div>
                <Label htmlFor="shopifyStoreUrl" className="text-sm font-medium">
                  Store URL
                </Label>
                <Input
                  id="shopifyStoreUrl"
                  type="text"
                  value={shopifyStoreUrl}
                  onChange={(e) => setShopifyStoreUrl(e.target.value)}
                  placeholder="mystore.myshopify.com"
                  className="mt-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Your Shopify store URL (e.g., mystore.myshopify.com)
                </p>
              </div>
              <div>
                <Label htmlFor="shopifyAccessToken" className="text-sm font-medium">
                  Access Token
                </Label>
                <Input
                  id="shopifyAccessToken"
                  type="text"
                  value={shopifyAccessToken}
                  onChange={(e) => setShopifyAccessToken(e.target.value)}
                  placeholder="shpat_..."
                  className="mt-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Create a private app in your Shopify admin to get an access token
                </p>
              </div>
              {shopifyError && (
                <div className="flex items-center gap-2 mt-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>{shopifyError}</span>
                </div>
              )}
              {!shopifyError && shopifyData?.hasToken && (
                <p className="text-xs text-green-600">
                  ✓ Shopify connected
                </p>
              )}
              <Button 
                onClick={handleShopifySave}
                disabled={shopifySaveStatus === "saving"}
                className="w-full sm:w-auto"
              >
                {shopifySaveStatus === "saving" ? "Saving..." : "Save Shopify Settings"}
              </Button>
              <p className="text-xs text-gray-500">
                After saving, go to the Products page to import your Shopify products.
              </p>
            </div>
          </div>

          {/* Currency Settings Section */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4">Currency Settings</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Select the currency for displaying product prices
            </p>
            <div className="max-w-md">
              <Label htmlFor="currency" className="text-sm font-medium">
                Select Currency
              </Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((curr) => (
                    <SelectItem key={curr.value} value={curr.value}>
                      {curr.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                Selected currency: {currency} ({currencySymbol})
              </p>
            </div>
          </div>

          {/* Password Change Section */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Lock className="w-5 h-5 text-purple-600" />
              Change Password
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Update your password to keep your account secure
            </p>
            <form onSubmit={handlePasswordChange} className="max-w-md space-y-4">
              <div>
                <Label htmlFor="currentPassword" className="text-sm font-medium">
                  Current Password
                </Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="newPassword" className="text-sm font-medium">
                  New Password
                </Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="mt-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Must be at least 8 characters long
                </p>
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm New Password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="mt-2"
                />
              </div>

              {passwordError && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>{passwordError}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={changePasswordMutation.isPending}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              >
                {changePasswordMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Changing Password...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 mr-2" />
                    Change Password
                  </>
                )}
              </Button>
            </form>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
