import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Package, HelpCircle, Users, ShieldCheck, LogOut, Contact, Home, Building2, Sparkles, Settings, Brain, BarChart3, MessageSquare } from "lucide-react";

interface User {
  id: string;
  username: string;
  role: string;
  businessAccountId: string | null;
}

interface AppSidebarProps {
  user: User | null;
}

export function AppSidebar({ user }: AppSidebarProps) {
  const [location, setLocation] = useLocation();

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
      // Clear all query cache to prevent cross-tenant data leakage
      queryClient.clear();
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const isSuperAdmin = user?.role === "super_admin";

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-gradient-to-br from-pink-500 via-purple-600 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">AI Chroney</h2>
            <p className="text-xs text-muted-foreground">{user?.username}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {!isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/")}
                    isActive={location === "/"}
                    data-testid="link-home"
                  >
                    <Home className="w-4 h-4" />
                    <span>Home</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/insights")}
                    isActive={location === "/insights"}
                    data-testid="link-insights"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Insights</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/conversations")}
                    isActive={location === "/conversations"}
                    data-testid="link-conversations"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Conversations</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/admin/leads")}
                    isActive={location === "/admin/leads"}
                    data-testid="link-leads"
                  >
                    <Contact className="w-4 h-4" />
                    <span>Leads</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isSuperAdmin ? (
          <SidebarGroup>
            <SidebarGroupLabel>Super Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/super-admin")}
                    isActive={location === "/super-admin"}
                    data-testid="link-super-admin"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Business Accounts</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/super-admin/users")}
                    isActive={location === "/super-admin/users"}
                    data-testid="link-users"
                  >
                    <Users className="w-4 h-4" />
                    <span>Users</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/super-admin/settings")}
                    isActive={location === "/super-admin/settings"}
                    data-testid="link-super-admin-settings"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/train-chroney")}
                    isActive={location === "/train-chroney"}
                    data-testid="link-train-chroney"
                  >
                    <Brain className="w-4 h-4" />
                    <span>Train Chroney</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/admin/products")}
                    isActive={location === "/admin/products"}
                    data-testid="link-products"
                  >
                    <Package className="w-4 h-4" />
                    <span>Products</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/admin/faqs")}
                    isActive={location === "/admin/faqs"}
                    data-testid="link-faqs"
                  >
                    <HelpCircle className="w-4 h-4" />
                    <span>FAQs</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/admin/about")}
                    isActive={location === "/admin/about"}
                    data-testid="link-about"
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Website Scan</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/admin/widget-settings")}
                    isActive={location === "/admin/widget-settings"}
                    data-testid="link-widget-settings"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Widget</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t">
        <SidebarMenu>
          {!isSuperAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setLocation("/admin/settings")}
                isActive={location === "/admin/settings"}
                data-testid="link-settings"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
