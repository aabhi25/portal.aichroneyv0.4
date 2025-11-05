import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  deleteSession,
  requireAuth,
  requireRole,
  requireBusinessAccount,
} from "./auth";
import { 
  insertProductSchema,
  insertFaqSchema,
  insertLeadSchema,
  insertUserSchema,
  insertCategorySchema,
  insertTagSchema,
  insertProductRelationshipSchema,
} from "@shared/schema";
import { z } from "zod";
import { chatService } from "./chatService";
import { llamaService } from "./llamaService";
import { conversationMemory } from "./conversationMemory";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import fs from "fs";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validation schema for website analysis content update
// All fields are optional and nullable to support legacy data with missing/null values
const updateWebsiteAnalysisSchema = z.object({
  businessName: z.string().optional().nullable().transform(val => val ?? ''),
  businessDescription: z.string().optional().nullable().transform(val => val ?? ''),
  targetAudience: z.string().optional().nullable().transform(val => val ?? ''),
  mainProducts: z.array(z.string()).optional().nullable().transform(val => val ?? []),
  mainServices: z.array(z.string()).optional().nullable().transform(val => val ?? []),
  keyFeatures: z.array(z.string()).optional().nullable().transform(val => val ?? []),
  uniqueSellingPoints: z.array(z.string()).optional().nullable().transform(val => val ?? []),
  contactInfo: z.object({
    email: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
  }).optional().nullable().transform(val => val ?? {}),
  businessHours: z.string().optional().nullable().transform(val => val ?? ''),
  pricingInfo: z.string().optional().nullable().transform(val => val ?? ''),
  additionalInfo: z.string().optional().nullable().transform(val => val ?? ''),
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Widget routes (must be before authentication routes)
  app.get("/widget.js", (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // Don't cache - always fetch fresh
    res.setHeader('Pragma', 'no-cache'); // HTTP 1.0 backward compatibility
    res.setHeader('Expires', '0'); // Proxies
    res.sendFile(path.join(__dirname, '../public/widget.js'));
  });

  // Widget test page route
  app.get("/widget-test.html", (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, '../widget-test.html'));
  });

  app.get("/widget/chat", async (req, res) => {
    const businessAccountId = req.query.businessAccountId as string;
    
    if (!businessAccountId) {
      return res.status(400).send('Missing businessAccountId parameter');
    }

    // Use dynamic host from request, ensuring proper protocol
    const host = req.get('host');
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const embedUrl = `${protocol}://${host}/embed/chat?businessAccountId=${encodeURIComponent(businessAccountId)}`;
    
    console.log('[Widget] Generated embed URL:', embedUrl);
    
    // Serve a simple iframe loader
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hi Chroney Widget</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }
  </style>
</head>
<body>
  <iframe src="${embedUrl}" allow="clipboard-write" sandbox="allow-same-origin allow-scripts allow-forms allow-popups"></iframe>
</body>
</html>`);
  });

  // Widget API routes (no authentication required for public widgets)
  app.post("/api/chat/widget", async (req, res) => {
    try {
      const { message, businessAccountId } = req.body;
      
      if (!message || !businessAccountId) {
        return res.status(400).json({ error: "Message and businessAccountId required" });
      }

      // Use a generic widget user ID based on business account
      const widgetUserId = `widget_${businessAccountId}`;
      
      // Get widget settings and business account info
      const settings = await storage.getWidgetSettings(businessAccountId);
      const businessAccount = await storage.getBusinessAccount(businessAccountId);
      
      if (!businessAccount) {
        return res.status(404).json({ error: "Business account not found" });
      }

      // Get the API key for this business account
      const openaiApiKey = await storage.getBusinessAccountOpenAIKey(businessAccountId);
      
      if (!openaiApiKey) {
        console.warn('[Widget Chat] No OpenAI API key found for business:', businessAccountId);
        return res.status(400).json({ error: "OpenAI API key not configured for this business account" });
      }

      // Process the message
      const result = await chatService.processMessage(message, {
        userId: widgetUserId,
        businessAccountId,
        personality: settings?.personality || 'friendly',
        companyDescription: businessAccount.description || '',
        openaiApiKey,
        currency: settings?.currency || 'USD',
        currencySymbol: settings?.currency === 'USD' ? '$' : '€',
        customInstructions: settings?.customInstructions || undefined,
      });

      // Return both response text and products if available
      if (typeof result === 'string') {
        res.json({ response: result });
      } else if (result && typeof result === 'object') {
        res.json({ 
          response: (result as any).response,
          products: (result as any).products || undefined
        });
      } else {
        res.json({ response: String(result) });
      }
    } catch (error: any) {
      console.error('[Widget Chat] Error:', error);
      res.status(500).json({ error: error.message || "Failed to process message" });
    }
  });

  app.post("/api/chat/widget/stream", async (req, res) => {
    try {
      const { message, businessAccountId, sessionId } = req.body;
      
      if (!message || !businessAccountId) {
        return res.status(400).json({ error: "Message and businessAccountId required" });
      }

      // Use unique session ID for each widget visit (resets on page refresh)
      const widgetUserId = sessionId ? `widget_session_${sessionId}` : `widget_${businessAccountId}`;
      
      // Get widget settings and business account info
      const settings = await storage.getWidgetSettings(businessAccountId);
      const businessAccount = await storage.getBusinessAccount(businessAccountId);
      
      if (!businessAccount) {
        return res.status(404).json({ error: "Business account not found" });
      }

      // Get the API key for this business account
      const openaiApiKey = await storage.getBusinessAccountOpenAIKey(businessAccountId);
      
      if (!openaiApiKey) {
        console.warn('[Widget Stream] No OpenAI API key found for business:', businessAccountId);
        return res.status(400).json({ error: "OpenAI API key not configured for this business account" });
      }

      const personality = settings?.personality || 'friendly';
      const currency = settings?.currency || 'USD';
      const currencySymbols: Record<string, string> = {
        USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", INR: "₹", AUD: "A$",
        CAD: "C$", CHF: "CHF", SEK: "kr", NZD: "NZ$", SGD: "S$", HKD: "HK$",
        NOK: "kr", MXN: "$", BRL: "R$", ZAR: "R", KRW: "₩", TRY: "₺",
        RUB: "₽", IDR: "Rp", THB: "฿", MYR: "RM"
      };
      const currencySymbol = currencySymbols[currency] || "$";

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Stream the response
      for await (const chunk of chatService.streamMessage(message, {
        userId: widgetUserId,
        businessAccountId,
        personality,
        companyDescription: businessAccount.description || '',
        openaiApiKey,
        currency,
        currencySymbol,
        customInstructions: settings?.customInstructions || undefined
      })) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      res.end();
    } catch (error: any) {
      console.error('[Widget Stream] Error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`);
      res.end();
    }
  });

  app.get("/api/chat/widget/intro", async (req, res) => {
    try {
      const { businessAccountId } = req.query;
      
      if (!businessAccountId) {
        return res.status(400).json({ error: "businessAccountId required" });
      }

      const settings = await storage.getWidgetSettings(businessAccountId as string);
      const businessAccount = await storage.getBusinessAccount(businessAccountId as string);
      
      if (!businessAccount) {
        return res.status(404).json({ error: "Business account not found" });
      }

      // Check welcome message type
      if (settings?.welcomeMessageType === 'custom' && settings?.welcomeMessage) {
        return res.json({ intro: settings.welcomeMessage });
      }

      // Generate AI intro if needed and API key is available
      if (businessAccount.openaiApiKey) {
        try {
          const systemContext = businessAccount.description ? 
            `You are representing: ${businessAccount.description}` : 
            '';

          const introResponse = await llamaService.generateToolAwareResponse(
            "Generate a brief, friendly welcome message (1-2 sentences) for a customer visiting our website.",
            [],
            [],
            systemContext,
            settings?.personality || 'friendly',
            businessAccount.openaiApiKey
          );

          const intro = introResponse.content || "Hi! How can I help you today?";
          
          // Cache the intro in widget settings
          if (settings) {
            await storage.upsertWidgetSettings(businessAccountId as string, { cachedIntro: intro });
          }

          return res.json({ intro });
        } catch (error) {
          console.error('[Widget Intro] AI generation failed:', error);
        }
      }

      // Fallback to default message
      res.json({ intro: "Hi! How can I help you today?" });
    } catch (error: any) {
      console.error('[Widget Intro] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }

      // Database authentication
      const user = await storage.getUserByUsername(username);

      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const sessionToken = await createSession(user.id);

      // Update last login
      await storage.updateUserLastLogin(user.id);

      res.cookie("session", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        businessAccountId: user.businessAccountId,
        mustChangePassword: user.mustChangePassword,
        tempPasswordExpiry: user.tempPasswordExpiry,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    try {
      const sessionToken = req.cookies?.session;
      if (sessionToken) {
        await deleteSession(sessionToken);
      }
      res.clearCookie("session");
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    res.json(req.user);
  });

  // Chat endpoint
  app.post("/api/chat", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Message is required" });
      }

      const user = req.user!;
      
      if (!user.businessAccountId) {
        return res.status(403).json({ error: "Business account required" });
      }

      // Fetch personality, currency, and custom instructions from widget settings
      const widgetSettings = await storage.getWidgetSettings(user.businessAccountId);
      const personality = widgetSettings?.personality || 'friendly';
      const currency = widgetSettings?.currency || 'INR';
      const customInstructions = widgetSettings?.customInstructions || '';
      
      // Currency symbol mapping
      const currencySymbols: Record<string, string> = {
        'INR': '₹', 'USD': '$', 'AED': 'د.إ', 'EUR': '€', 'GBP': '£',
        'AUD': 'A$', 'CAD': 'C$', 'CHF': 'CHF', 'CNY': '¥', 'JPY': '¥',
        'KRW': '₩', 'SGD': 'S$', 'HKD': 'HK$', 'NZD': 'NZ$', 'SEK': 'kr',
        'NOK': 'kr', 'DKK': 'kr', 'PLN': 'zł', 'BRL': 'R$', 'MXN': '$',
        'ZAR': 'R', 'TRY': '₺', 'RUB': '₽'
      };
      const currencySymbol = currencySymbols[currency] || '$';
      
      const businessAccount = await storage.getBusinessAccount(user.businessAccountId);
      const companyDescription = businessAccount?.description || '';
      const openaiApiKey = await storage.getBusinessAccountOpenAIKey(user.businessAccountId);

      const response = await chatService.processMessage(message, {
        userId: user.id,
        businessAccountId: user.businessAccountId,
        personality,
        companyDescription,
        openaiApiKey,
        currency,
        currencySymbol,
        customInstructions
      });

      res.json({ 
        success: true,
        response 
      });
    } catch (error: any) {
      console.error('Chat error:', error);
      res.status(500).json({ 
        success: false,
        error: error.message || "Failed to process message" 
      });
    }
  });

  // Chat status endpoint
  app.get("/api/chat/status", requireAuth, async (req, res) => {
    res.json({
      connected: true,
      status: "online"
    });
  });

  // Phase 1: Memory reset endpoint to prevent context pollution
  app.post("/api/chat/reset", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Clear conversation memory for this user
      conversationMemory.clearConversation(userId);
      console.log(`[Chat] Memory reset for user ${userId}`);
      
      res.json({ success: true, message: "Memory cleared" });
    } catch (error: any) {
      console.error('Memory reset error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Helper function for rotating intro messages (Phase 1 optimization)
  const getRandomIntroMessage = () => {
    const introMessages = [
      "Hey there! I'm Chroney, your AI assistant. I can help with products, FAQs, and more. What brings you here today? 🚀",
      "What's up! Chroney here 🎯. I know everything about our products and can answer your questions. How can I help?",
      "Yo! I'm Chroney, your friendly AI sidekick 🤓. Need product info? Have questions? Just ask!",
      "Sup, human? Chroney reporting for duty 🤖. Tell me what you need—products, FAQs, or just browsing—I'm here to help!",
      "Hey hey! Chroney here 🕶️. Think of me as your personal shopping assistant. What can I help you discover today?"
    ];
    
    return introMessages[Math.floor(Math.random() * introMessages.length)];
  };

  // Chat intro message endpoint
  app.get("/api/chat/intro", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      // Get widget settings to check welcome message type
      let settings = await storage.getWidgetSettings(businessAccountId);
      
      // If no settings exist, create default ones
      if (!settings) {
        settings = await storage.upsertWidgetSettings(businessAccountId, {});
      }

      // If custom message type, return the custom welcome message
      if (settings.welcomeMessageType === "custom") {
        console.log(`[Intro API] Using custom welcome message`);
        return res.json({ intro: settings.welcomeMessage });
      }

      // Use rotating intro messages for better performance (Phase 1 optimization)
      const intro = getRandomIntroMessage();
      console.log(`[Intro API] Using rotating intro message: ${intro.substring(0, 50)}...`);
      res.json({ intro });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Chat streaming endpoint
  app.post("/api/chat/stream", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Message is required" });
      }

      const user = req.user!;
      
      if (!user.businessAccountId) {
        return res.status(403).json({ error: "Business account required" });
      }

      // Fetch personality, currency, and custom instructions from widget settings
      const widgetSettings = await storage.getWidgetSettings(user.businessAccountId);
      const personality = widgetSettings?.personality || 'friendly';
      const currency = widgetSettings?.currency || 'INR';
      const customInstructions = widgetSettings?.customInstructions || '';
      
      // Currency symbol mapping
      const currencySymbols: Record<string, string> = {
        'INR': '₹', 'USD': '$', 'AED': 'د.إ', 'EUR': '€', 'GBP': '£',
        'AUD': 'A$', 'CAD': 'C$', 'CHF': 'CHF', 'CNY': '¥', 'JPY': '¥',
        'KRW': '₩', 'SGD': 'S$', 'HKD': 'HK$', 'NZD': 'NZ$', 'SEK': 'kr',
        'NOK': 'kr', 'DKK': 'kr', 'PLN': 'zł', 'BRL': 'R$', 'MXN': '$',
        'ZAR': 'R', 'TRY': '₺', 'RUB': '₽'
      };
      const currencySymbol = currencySymbols[currency] || '$';
      
      const businessAccount = await storage.getBusinessAccount(user.businessAccountId);
      const companyDescription = businessAccount?.description || '';
      const openaiApiKey = await storage.getBusinessAccountOpenAIKey(user.businessAccountId);

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Stream the response
      for await (const chunk of chatService.streamMessage(message, {
        userId: user.id,
        businessAccountId: user.businessAccountId,
        personality,
        companyDescription,
        openaiApiKey,
        currency,
        currencySymbol,
        customInstructions
      })) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      res.end();
    } catch (error: any) {
      console.error('Chat streaming error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`);
      res.end();
    }
  });

  // SuperAdmin: Create business account
  app.post("/api/business-accounts", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const { name, website } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Business name required" });
      }
      if (!website) {
        return res.status(400).json({ error: "Website URL required" });
      }
      
      // Basic URL validation
      try {
        new URL(website);
      } catch {
        return res.status(400).json({ error: "Invalid website URL format" });
      }
      
      const businessAccount = await storage.createBusinessAccount({ name, website, status: "active" });
      res.json(businessAccount);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // SuperAdmin: Get all business accounts
  app.get("/api/business-accounts", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const accounts = await storage.getAllBusinessAccounts();
      res.json(accounts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // SuperAdmin: Update business account
  app.put("/api/business-accounts/:id", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, website } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Business name required" });
      }
      if (!website) {
        return res.status(400).json({ error: "Website URL required" });
      }
      
      // Basic URL validation
      try {
        new URL(website);
      } catch {
        return res.status(400).json({ error: "Invalid website URL format" });
      }
      
      const businessAccount = await storage.updateBusinessAccount(id, { name, website });
      res.json(businessAccount);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // SuperAdmin: Create business user
  app.post("/api/business-accounts/:id/users", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const { username, password } = req.body;
      const businessAccountId = req.params.id;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(username)) {
        return res.status(400).json({ error: "Username must be a valid email address" });
      }

      const passwordHash = await hashPassword(password);
      
      // Set temp password expiry to 30 days from now
      const tempPasswordExpiry = new Date();
      tempPasswordExpiry.setDate(tempPasswordExpiry.getDate() + 30);

      const user = await storage.createUserWithTempPassword({
        username,
        passwordHash,
        tempPassword: password,
        tempPasswordExpiry,
        mustChangePassword: "true",
        role: "business_user",
        businessAccountId,
      });

      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        businessAccountId: user.businessAccountId,
        credentials: {
          username,
          password, // Return plaintext password only on creation
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // SuperAdmin: Get users for a business account
  app.get("/api/business-accounts/:id/users", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const users = await storage.getUsersByBusinessAccount(req.params.id);
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // SuperAdmin: Get all users
  app.get("/api/users", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // SuperAdmin: Get user credentials (temp password)
  app.get("/api/users/:id/credentials", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if temp password has expired
      const isExpired = user.tempPasswordExpiry && new Date(user.tempPasswordExpiry) < new Date();

      res.json({
        username: user.username,
        tempPassword: user.tempPassword,
        tempPasswordExpiry: user.tempPasswordExpiry,
        isExpired,
        hasCredentials: !!user.tempPassword
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // SuperAdmin: Reset user password
  app.post("/api/users/:id/reset-password", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const { password } = req.body;
      const userId = req.params.id;

      if (!password) {
        return res.status(400).json({ error: "Password required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const passwordHash = await hashPassword(password);
      
      // Set temp password expiry to 30 days from now
      const tempPasswordExpiry = new Date();
      tempPasswordExpiry.setDate(tempPasswordExpiry.getDate() + 30);

      // Update password hash AND set temp password
      const updatedUser = await storage.resetUserPassword(userId, passwordHash, password, tempPasswordExpiry);

      res.json({
        success: true,
        credentials: {
          username: updatedUser.username,
          password,
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Change password (for user's own password)
  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!newPassword) {
        return res.status(400).json({ error: "New password required" });
      }

      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Only verify current password if this is NOT a forced password change
      if (user.mustChangePassword !== "true" && currentPassword) {
        // Verify current password for regular password changes
        if (!(await verifyPassword(currentPassword, user.passwordHash))) {
          return res.status(401).json({ error: "Current password is incorrect" });
        }
      }

      // Hash and update new password
      const passwordHash = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, passwordHash);
      
      // Clear temporary password fields and mustChangePassword flag
      await storage.clearTempPassword(user.id);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Forgot password - send reset link via email
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const user = await storage.getUserByUsername(email);
      
      // Always return success to prevent email enumeration attacks
      if (!user) {
        return res.json({ 
          success: true, 
          message: "If an account exists with this email, a password reset link has been sent" 
        });
      }

      // Generate reset token
      const resetToken = randomUUID();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // Token valid for 1 hour

      // Save reset token to database
      await storage.createPasswordResetToken({
        userId: user.id,
        token: resetToken,
        expiresAt,
      });

      // Send email with reset link
      const { sendPasswordResetEmail } = await import("./emailService");
      await sendPasswordResetEmail(user.username, resetToken);

      res.json({ 
        success: true, 
        message: "If an account exists with this email, a password reset link has been sent" 
      });
    } catch (error: any) {
      console.error('Forgot password error:', error);
      res.status(500).json({ error: "An error occurred. Please try again later." });
    }
  });

  // Reset password - verify token and update password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ error: "Token and new password are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters long" });
      }

      // Get reset token from database
      const resetToken = await storage.getPasswordResetToken(token);
      
      if (!resetToken) {
        return res.status(400).json({ error: "Invalid or expired reset link" });
      }

      // Check if token has expired
      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ error: "Reset link has expired. Please request a new one" });
      }

      // Check if token has already been used
      if (resetToken.usedAt) {
        return res.status(400).json({ error: "This reset link has already been used" });
      }

      // Hash new password and update user
      const passwordHash = await hashPassword(newPassword);
      await storage.updateUserPassword(resetToken.userId, passwordHash);
      
      // Clear any temporary password flags
      await storage.clearTempPassword(resetToken.userId);

      // Mark token as used
      await storage.markPasswordResetTokenAsUsed(token);

      res.json({ success: true, message: "Password reset successful. You can now log in with your new password" });
    } catch (error: any) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: "An error occurred. Please try again later." });
    }
  });

  // Chat functionality has been removed

  // Configure multer for local file storage in Portfolio directory
  const portfolioDir = path.join(process.cwd(), "Portfolio");
  
  // Ensure Portfolio directory exists
  if (!fs.existsSync(portfolioDir)) {
    fs.mkdirSync(portfolioDir, { recursive: true });
  }

  const multerStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, portfolioDir);
    },
    filename: (req, file, cb) => {
      // Generate unique filename with original extension
      const uniqueName = `${randomUUID()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });

  const upload = multer({
    storage: multerStorage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      // Accept only image files
      const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'));
      }
    },
  });

  // Configure multer for Excel file uploads (memory storage)
  const excelUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      // Accept Excel and CSV files
      const allowedMimes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv', // .csv
      ];
      const allowedExtensions = ['.xlsx', '.xls', '.csv'];
      const fileExtension = path.extname(file.originalname).toLowerCase();
      
      if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed.'));
      }
    },
  });

  // Upload product image endpoint
  app.post("/api/upload-image", requireAuth, upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const imageUrl = `/portfolio/${req.file.filename}`;
      res.json({ imageUrl });
    } catch (error: any) {
      console.error("Error uploading image:", error);
      res.status(500).json({ error: error.message || "Failed to upload image" });
    }
  });

  // Delete product image endpoint
  app.delete("/api/delete-image", requireAuth, async (req, res) => {
    try {
      const { imageUrl } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ error: "Image URL required" });
      }

      // Extract filename from imageUrl (e.g., "/portfolio/abc-123.jpg" -> "abc-123.jpg")
      const filename = imageUrl.replace('/portfolio/', '');
      
      // Sanitize filename to prevent directory traversal
      const sanitizedFilename = path.basename(filename);
      
      // Ensure filename doesn't start with a dot (hidden files)
      if (sanitizedFilename.startsWith('.')) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const filepath = path.join(portfolioDir, sanitizedFilename);
      
      // Verify the resolved path is within the Portfolio directory
      const normalizedPath = path.normalize(filepath);
      if (!normalizedPath.startsWith(portfolioDir)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Delete file if it exists
      if (fs.existsSync(normalizedPath)) {
        fs.unlinkSync(normalizedPath);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting image:", error);
      res.status(500).json({ error: error.message || "Failed to delete image" });
    }
  });

  // Serve images from Portfolio directory
  app.get("/portfolio/:filename", async (req, res) => {
    try {
      const filename = req.params.filename;
      
      // Sanitize filename to prevent directory traversal
      const sanitizedFilename = path.basename(filename);
      
      // Ensure filename doesn't start with a dot (hidden files)
      if (sanitizedFilename.startsWith('.')) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const filepath = path.join(portfolioDir, sanitizedFilename);
      
      // Verify the resolved path is within the Portfolio directory
      const normalizedPath = path.normalize(filepath);
      if (!normalizedPath.startsWith(portfolioDir)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Check if file exists
      if (!fs.existsSync(normalizedPath)) {
        return res.status(404).json({ error: "Image not found" });
      }

      // Send file with appropriate headers
      res.sendFile(normalizedPath, {
        headers: {
          'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
        }
      });
    } catch (error: any) {
      console.error("Error serving image:", error);
      res.status(500).json({ error: "Failed to serve image" });
    }
  });

  // Helper function to invalidate cached intro when products change
  const invalidateCachedIntro = async (businessAccountId: string) => {
    try {
      await storage.upsertWidgetSettings(businessAccountId, { cachedIntro: null });
    } catch (error) {
      console.error('[Cache] Failed to invalidate cached intro:', error);
    }
  };

  // Product routes
  app.post("/api/products", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      
      const validatedData = insertProductSchema.parse({
        ...req.body,
        businessAccountId
      });
      const product = await storage.createProduct(validatedData);
      
      // Invalidate cached intro since products changed
      await invalidateCachedIntro(businessAccountId);
      
      res.json(product);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/products", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      const products = await storage.getAllProducts(businessAccountId);
      res.json(products);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/products/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      const product = await storage.getProduct(req.params.id, businessAccountId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/products/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      const product = await storage.updateProduct(req.params.id, businessAccountId, req.body);
      
      // Invalidate cached intro since product changed
      await invalidateCachedIntro(businessAccountId);
      
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/products/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      await storage.deleteProduct(req.params.id, businessAccountId);
      
      // Invalidate cached intro since product deleted
      await invalidateCachedIntro(businessAccountId);
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Category routes
  app.post("/api/categories", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      
      const validatedData = insertCategorySchema.parse({
        ...req.body,
        businessAccountId
      });
      const category = await storage.createCategory(validatedData);
      res.json(category);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/categories", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      const categories = await storage.getAllCategories(businessAccountId);
      res.json(categories);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/categories/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      const category = await storage.updateCategory(req.params.id, businessAccountId, req.body);
      res.json(category);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/categories/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      await storage.deleteCategory(req.params.id, businessAccountId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Tag routes
  app.post("/api/tags", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      
      const validatedData = insertTagSchema.parse({
        ...req.body,
        businessAccountId
      });
      const tag = await storage.createTag(validatedData);
      res.json(tag);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/tags", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      const tags = await storage.getAllTags(businessAccountId);
      res.json(tags);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/tags/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      const tag = await storage.updateTag(req.params.id, businessAccountId, req.body);
      res.json(tag);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/tags/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      await storage.deleteTag(req.params.id, businessAccountId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Product-Category assignment routes
  app.post("/api/products/:productId/categories", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const { productId } = req.params;
      const { categoryId } = req.body;
      
      if (!categoryId) {
        return res.status(400).json({ error: "Category ID required" });
      }
      
      const assignment = await storage.assignProductToCategory(productId, categoryId);
      res.json(assignment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/products/:productId/categories", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const { productId } = req.params;
      const categories = await storage.getProductCategories(productId);
      res.json(categories);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/products/:productId/categories/:categoryId", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const { productId, categoryId } = req.params;
      await storage.removeProductFromCategory(productId, categoryId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/products/:productId/categories", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const { productId } = req.params;
      const { categoryIds } = req.body;
      
      if (!Array.isArray(categoryIds)) {
        return res.status(400).json({ error: "categoryIds must be an array" });
      }
      
      // Remove all existing categories
      const existingCategories = await storage.getProductCategories(productId);
      for (const category of existingCategories) {
        await storage.removeProductFromCategory(productId, category.id);
      }
      
      // Add new categories
      for (const categoryId of categoryIds) {
        await storage.assignProductToCategory(productId, categoryId);
      }
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Product-Tag assignment routes
  app.post("/api/products/:productId/tags", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const { productId } = req.params;
      const { tagId } = req.body;
      
      if (!tagId) {
        return res.status(400).json({ error: "Tag ID required" });
      }
      
      const assignment = await storage.assignProductToTag(productId, tagId);
      res.json(assignment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/products/:productId/tags", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const { productId } = req.params;
      const tags = await storage.getProductTags(productId);
      res.json(tags);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/products/:productId/tags/:tagId", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const { productId, tagId } = req.params;
      await storage.removeProductFromTag(productId, tagId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/products/:productId/tags", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const { productId } = req.params;
      const { tagIds } = req.body;
      
      if (!Array.isArray(tagIds)) {
        return res.status(400).json({ error: "tagIds must be an array" });
      }
      
      // Remove all existing tags
      const existingTags = await storage.getProductTags(productId);
      for (const tag of existingTags) {
        await storage.removeProductFromTag(productId, tag.id);
      }
      
      // Add new tags
      for (const tagId of tagIds) {
        await storage.assignProductToTag(productId, tagId);
      }
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Product Relationship routes
  app.post("/api/product-relationships", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      
      const validatedData = insertProductRelationshipSchema.parse({
        ...req.body,
        businessAccountId
      });
      const relationship = await storage.createProductRelationship(validatedData);
      res.json(relationship);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/products/:productId/relationships", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      
      const { productId } = req.params;
      const { type } = req.query;
      
      const relationships = await storage.getProductRelationships(
        productId,
        businessAccountId,
        type as string | undefined
      );
      res.json(relationships);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/products/:productId/related", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      
      const { productId } = req.params;
      const relatedProducts = await storage.getRelatedProducts(productId, businessAccountId);
      res.json(relatedProducts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/product-relationships/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      
      const relationship = await storage.updateProductRelationship(
        req.params.id,
        businessAccountId,
        req.body
      );
      res.json(relationship);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/product-relationships/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      
      await storage.deleteProductRelationship(req.params.id, businessAccountId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // FAQ routes
  app.post("/api/faqs", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      
      const validatedData = insertFaqSchema.parse({
        ...req.body,
        businessAccountId
      });
      const faq = await storage.createFaq(validatedData);
      res.json(faq);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/faqs", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      const faqs = await storage.getAllFaqs(businessAccountId);
      res.json(faqs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/faqs/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      const faq = await storage.getFaq(req.params.id, businessAccountId);
      if (!faq) {
        return res.status(404).json({ error: "FAQ not found" });
      }
      res.json(faq);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/faqs/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      const faq = await storage.updateFaq(req.params.id, businessAccountId, req.body);
      res.json(faq);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/faqs/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      await storage.deleteFaq(req.params.id, businessAccountId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Suggest FAQs from website
  // Security Note: This endpoint implements SSRF protections including URL validation,
  // protocol restrictions, private IP blocking, and redirect disabling. However, it cannot
  // fully prevent DNS-based attacks where a public domain resolves to a private IP.
  // For production use, consider implementing DNS resolution validation or using a
  // third-party web scraping service with built-in security controls.
  app.post("/api/suggest-faqs", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const { websiteUrl } = req.body;
      const businessAccountId = req.user?.businessAccountId;
      
      if (!websiteUrl) {
        return res.status(400).json({ error: "Website URL is required" });
      }
      
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      // Validate URL to prevent SSRF attacks
      let parsedUrl;
      try {
        parsedUrl = new URL(websiteUrl);
      } catch (e) {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return res.status(400).json({ error: "Only HTTP and HTTPS URLs are allowed" });
      }

      // Block private IP ranges and localhost
      const hostname = parsedUrl.hostname.toLowerCase();
      const privateRanges = [
        /^localhost$/i,
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^::1$/,
        /^fc00:/,
        /^fe80:/,
        /^0\.0\.0\.0$/
      ];

      if (privateRanges.some(range => range.test(hostname))) {
        return res.status(400).json({ error: "Access to private or local networks is not allowed" });
      }

      // Block common metadata endpoints
      if (hostname === '169.254.169.254' || hostname.includes('metadata')) {
        return res.status(400).json({ error: "Access to metadata endpoints is not allowed" });
      }

      // Get OpenAI API key for the business
      const openaiApiKey = await storage.getBusinessAccountOpenAIKey(businessAccountId);
      if (!openaiApiKey) {
        return res.status(400).json({ error: "OpenAI API key not configured. Please add your API key in Settings." });
      }

      // Fetch website content with timeout and no redirects
      let websiteContent = '';
      let usedHttpFallback = false;
      
      const attemptFetch = async (url: string, allowRedirects = false) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const response = await fetch(url, {
          signal: controller.signal,
          redirect: allowRedirects ? 'follow' : 'manual', // Allow redirects for HTTP fallback
          headers: {
            'User-Agent': 'Hi-Chroney-FAQ-Bot/1.0'
          }
        });
        
        clearTimeout(timeoutId);
        
        // Reject redirects only if we're not allowing them
        if (!allowRedirects && response.status >= 300 && response.status < 400) {
          throw new Error('Redirects are not allowed for security reasons. Please provide the direct URL.');
        }
        
        if (!response.ok) {
          throw new Error(`Failed to fetch website: ${response.statusText}`);
        }
        
        const html = await response.text();
        
        // Extract text content from HTML (simple approach)
        return html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 50000); // Limit to 50k characters
      };
      
      try {
        // Allow redirects by default - this is standard web behavior
        websiteContent = await attemptFetch(parsedUrl.toString(), true);
      } catch (fetchError: any) {
        console.error("Fetch error details:", fetchError);
        
        // Provide more specific error messages
        if (fetchError.name === 'AbortError') {
          return res.status(408).json({ error: "Website took too long to respond (timeout after 30 seconds). Please try again or use a different URL." });
        }
        
        // Check for SSL/certificate errors
        const errorMsg = fetchError.message || '';
        const causeMsg = fetchError.cause?.message || '';
        
        const hasSSLError = errorMsg.includes('certificate') || causeMsg.includes('certificate') || 
            errorMsg.includes('SSL') || causeMsg.includes('SSL') ||
            errorMsg.includes('self signed') || causeMsg.includes('self signed');
        
        // Try HTTP fallback if HTTPS failed with SSL error
        if (hasSSLError && parsedUrl.protocol === 'https:') {
          try {
            console.log("SSL error detected, attempting HTTP fallback with redirects allowed...");
            const httpUrl = parsedUrl.toString().replace('https://', 'http://');
            websiteContent = await attemptFetch(httpUrl, true); // Allow redirects for HTTP fallback
            usedHttpFallback = true;
            console.log("HTTP fallback successful");
          } catch (httpError: any) {
            console.error("HTTP fallback failed:", httpError);
            
            // Provide helpful suggestion if it's a www mismatch
            let errorMessage = "This website has SSL certificate issues and cannot be accessed.";
            if (parsedUrl.hostname.startsWith('www.')) {
              const withoutWww = parsedUrl.hostname.substring(4);
              errorMessage += ` Try using "${parsedUrl.protocol}//${withoutWww}" instead (without www).`;
            } else {
              errorMessage += ` Try using "www.${parsedUrl.hostname}" instead (with www), or use the HTTP version.`;
            }
            
            return res.status(400).json({ error: errorMessage });
          }
        } else if (hasSSLError) {
          return res.status(400).json({ 
            error: "This website has SSL certificate issues and cannot be accessed securely."
          });
        } else if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND') || 
            errorMsg.includes('ETIMEDOUT') || fetchError.code === 'ECONNREFUSED') {
          return res.status(400).json({ 
            error: "Unable to connect to this website. Please check the URL and try again."
          });
        } else {
          if (fetchError.cause) {
            console.error("Fetch error cause:", fetchError.cause);
          }
          
          return res.status(400).json({ 
            error: `Failed to fetch website: ${errorMsg}. The website may be blocking automated access or have connectivity issues.`
          });
        }
      }

      // Use OpenAI to generate FAQs
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: openaiApiKey });

      const prompt = `Analyze the following website content and generate up to 40 frequently asked questions (FAQs) with detailed answers based on the content.

Website Content:
${websiteContent}

Instructions:
1. Generate FAQs that customers would actually ask about this business
2. Provide clear, helpful answers based on the website content
3. Cover different categories: products/services, pricing, policies, shipping, returns, support, etc.
4. Be specific and accurate - only use information from the website content
5. Format your response as a JSON array with this structure:
[
  {
    "question": "Question text here?",
    "answer": "Detailed answer here",
    "category": "Category name (e.g., Products, Pricing, Shipping, Returns, Support, General)"
  }
]

Generate exactly 40 FAQs if there's enough content, or as many as you can based on the available information (minimum 10).`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert at analyzing website content and creating helpful FAQs for businesses. Always respond with valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: "json_object" }
      });

      const responseText = completion.choices[0].message.content || '{"faqs": []}';
      let suggestedFaqs;
      
      try {
        const parsed = JSON.parse(responseText);
        // Handle both array and object with array responses
        suggestedFaqs = Array.isArray(parsed) ? parsed : (parsed.faqs || []);
      } catch (parseError) {
        return res.status(500).json({ error: "Failed to parse AI response" });
      }

      // Enforce maximum of 40 FAQs
      if (suggestedFaqs.length > 40) {
        suggestedFaqs = suggestedFaqs.slice(0, 40);
      }

      // Auto-save all suggested FAQs to draft_faqs table
      const savedDrafts = [];
      for (const faq of suggestedFaqs) {
        try {
          const draftFaq = await storage.createDraftFaq({
            businessAccountId,
            question: faq.question || '',
            answer: faq.answer || '',
            category: faq.category || 'General',
            sourceUrl: websiteUrl
          });
          savedDrafts.push(draftFaq);
        } catch (saveError) {
          console.error("Error saving draft FAQ:", saveError);
          // Continue saving other FAQs even if one fails
        }
      }

      res.json({ 
        success: true,
        count: savedDrafts.length,
        message: `${savedDrafts.length} FAQ drafts have been saved. You can now review and edit them before publishing.`
      });
    } catch (error: any) {
      console.error("Error suggesting FAQs:", error);
      res.status(500).json({ error: error.message || "Failed to suggest FAQs" });
    }
  });

  // Bulk add FAQs
  app.post("/api/faqs/bulk", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const { faqs } = req.body;
      const businessAccountId = req.user?.businessAccountId;
      
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      if (!faqs || !Array.isArray(faqs) || faqs.length === 0) {
        return res.status(400).json({ error: "FAQs array is required" });
      }

      // Add businessAccountId to each FAQ and insert
      const createdFaqs = [];
      for (const faq of faqs) {
        const faqData = {
          ...faq,
          businessAccountId
        };
        
        const result = insertFaqSchema.safeParse(faqData);
        if (!result.success) {
          continue; // Skip invalid FAQs
        }
        
        const created = await storage.createFaq(result.data);
        createdFaqs.push(created);
      }

      res.json({ 
        success: true,
        count: createdFaqs.length,
        faqs: createdFaqs
      });
    } catch (error: any) {
      console.error("Error bulk adding FAQs:", error);
      res.status(500).json({ error: error.message || "Failed to add FAQs" });
    }
  });

  // Draft FAQ routes
  app.get("/api/draft-faqs", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      const drafts = await storage.getAllDraftFaqs(businessAccountId);
      res.json(drafts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/draft-faqs/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      const { question, answer, category } = req.body;
      const updatedDraft = await storage.updateDraftFaq(req.params.id, businessAccountId, {
        question,
        answer,
        category
      });
      res.json(updatedDraft);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/draft-faqs/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      await storage.deleteDraftFaq(req.params.id, businessAccountId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/draft-faqs/:id/publish", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      const faq = await storage.publishDraftFaq(req.params.id, businessAccountId);
      res.json({ success: true, faq });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Lead routes
  app.post("/api/leads", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      
      const validatedData = insertLeadSchema.parse({
        ...req.body,
        businessAccountId
      });
      const lead = await storage.createLead(validatedData);
      res.json(lead);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/leads", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      
      const { fromDate, toDate } = req.query;
      
      // Get leads filtered by business account at database level
      const leads = await storage.getAllLeads(businessAccountId);
      
      // Filter by date range if provided
      let filteredLeads = leads;
      if (fromDate && typeof fromDate === 'string') {
        const from = new Date(fromDate);
        filteredLeads = filteredLeads.filter(lead => new Date(lead.createdAt) >= from);
      }
      if (toDate && typeof toDate === 'string') {
        const to = new Date(toDate);
        filteredLeads = filteredLeads.filter(lead => new Date(lead.createdAt) <= to);
      }
      
      res.json(filteredLeads);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/leads/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      const lead = await storage.getLead(req.params.id, businessAccountId);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      res.json(lead);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/leads/:id", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      await storage.deleteLead(req.params.id, businessAccountId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Conversations routes
  app.get("/api/conversations", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      
      const { fromDate, toDate } = req.query;
      
      // Get conversations filtered by business account at database level
      const conversations = await storage.getAllConversations(businessAccountId);
      
      // Filter by date range if provided
      let filteredConversations = conversations;
      if (fromDate && typeof fromDate === 'string') {
        const from = new Date(fromDate);
        filteredConversations = filteredConversations.filter(conv => new Date(conv.createdAt) >= from);
      }
      if (toDate && typeof toDate === 'string') {
        const to = new Date(toDate);
        filteredConversations = filteredConversations.filter(conv => new Date(conv.createdAt) <= to);
      }
      
      // Get message counts efficiently for all conversations
      const conversationIds = filteredConversations.map(conv => conv.id);
      const messageCounts = await storage.getMessageCountsForConversations(conversationIds);
      
      const conversationsWithCounts = filteredConversations.map(conv => ({
        ...conv,
        messageCount: messageCounts[conv.id] || 0
      }));
      
      res.json(conversationsWithCounts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/conversations/:id/messages", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }
      
      const conversationId = req.params.id;
      
      // Get messages - getMessagesByConversation now verifies access internally
      const messages = await storage.getMessagesByConversation(conversationId, businessAccountId);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Business Account / About routes
  app.get("/api/about", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      const account = await storage.getBusinessAccount(businessAccountId);
      if (!account) {
        return res.status(404).json({ error: "Business account not found" });
      }

      res.json({ 
        name: account.name,
        description: account.description || "",
        website: account.website || ""
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/about", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      const { description } = req.body;
      if (typeof description !== 'string') {
        return res.status(400).json({ error: "Description must be a string" });
      }

      const account = await storage.updateBusinessAccountDescription(businessAccountId, description);
      res.json({ 
        name: account.name,
        description: account.description || ""
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Website Analysis routes
  app.get("/api/website-analysis", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      const analysis = await storage.getWebsiteAnalysis(businessAccountId);
      if (!analysis) {
        return res.json({ 
          status: 'not_started',
          websiteUrl: '',
          analyzedContent: null 
        });
      }

      res.json({
        status: analysis.status,
        websiteUrl: analysis.websiteUrl,
        analyzedContent: analysis.analyzedContent ? JSON.parse(analysis.analyzedContent) : null,
        errorMessage: analysis.errorMessage,
        lastAnalyzedAt: analysis.lastAnalyzedAt,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/website-analysis", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      const { websiteUrl, additionalPages, analyzeOnlyAdditional } = req.body;
      if (!websiteUrl || typeof websiteUrl !== 'string') {
        return res.status(400).json({ error: "Website URL is required" });
      }

      // Validate additional pages if provided
      let pagesToAnalyze: string[] = [];
      
      if (analyzeOnlyAdditional) {
        // Only analyze additional pages - don't include main URL
        if (!additionalPages || !Array.isArray(additionalPages) || additionalPages.length === 0) {
          return res.status(400).json({ error: "No additional pages provided" });
        }
        pagesToAnalyze = additionalPages;
      } else {
        // Full analysis - include main URL
        pagesToAnalyze = [websiteUrl];
        if (additionalPages && Array.isArray(additionalPages)) {
          pagesToAnalyze.push(...additionalPages);
        }
      }

      // Validate that all pages are from the same domain
      try {
        const baseUrl = new URL(websiteUrl);
        for (const page of pagesToAnalyze) {
          const pageUrl = new URL(page);
          if (pageUrl.hostname !== baseUrl.hostname) {
            return res.status(400).json({ 
              error: "All pages must be from the same domain as the configured website" 
            });
          }
        }
      } catch (error) {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Get business account to retrieve OpenAI API key
      const businessAccount = await storage.getBusinessAccount(businessAccountId);
      if (!businessAccount?.openaiApiKey) {
        return res.status(400).json({ error: "OpenAI API key not configured. Please set it in Settings first." });
      }

      // Import the service here to avoid circular dependencies
      const { websiteAnalysisService } = await import("./websiteAnalysisService");

      // Save initial record
      await storage.upsertWebsiteAnalysis(businessAccountId, {
        websiteUrl,
        status: 'pending',
      });

      // Start analysis asynchronously (don't wait for it)
      // When analyzeOnlyAdditional is true, we always append to existing data
      const shouldAppend = analyzeOnlyAdditional || additionalPages?.length > 0;
      websiteAnalysisService.analyzeWebsitePages(pagesToAnalyze, businessAccountId, businessAccount.openaiApiKey, shouldAppend)
        .catch(error => {
          console.error('[Website Analysis] Error:', error);
        });

      const message = analyzeOnlyAdditional
        ? `Analyzing ${pagesToAnalyze.length} additional ${pagesToAnalyze.length === 1 ? 'page' : 'pages'}. Data will be merged with existing analysis...`
        : pagesToAnalyze.length > 1 
          ? `Website analysis started for ${pagesToAnalyze.length} pages. This may take a few minutes...`
          : 'Website analysis started. This may take a minute...';

      res.json({ 
        status: 'pending',
        message 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update website analysis content (edit extracted data)
  app.patch("/api/website-analysis", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      const { analyzedContent } = req.body;
      if (!analyzedContent) {
        return res.status(400).json({ error: "Analyzed content is required" });
      }

      // Validate the content structure using Zod schema
      const validationResult = updateWebsiteAnalysisSchema.safeParse(analyzedContent);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid content format",
          details: validationResult.error.errors 
        });
      }

      // Get existing analysis
      const existingAnalysis = await storage.getWebsiteAnalysis(businessAccountId);
      if (!existingAnalysis) {
        return res.status(404).json({ error: "No website analysis found to update" });
      }

      // Update only the analyzed content (validated), preserving websiteUrl and status
      await storage.upsertWebsiteAnalysis(businessAccountId, {
        websiteUrl: existingAnalysis.websiteUrl,
        status: 'completed',
        analyzedContent: JSON.stringify(validationResult.data),
      });

      res.json({ 
        success: true,
        message: "Website analysis content updated successfully" 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete/reset website analysis (start fresh)
  app.delete("/api/website-analysis", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      // Delete the website analysis record
      await storage.deleteWebsiteAnalysis(businessAccountId);

      // Also delete all analyzed pages history
      await storage.deleteAnalyzedPages(businessAccountId);

      res.json({ 
        success: true,
        message: "Website analysis reset successfully" 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Analyzed Pages routes
  app.get("/api/analyzed-pages", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      const pages = await storage.getAnalyzedPages(businessAccountId);
      res.json(pages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Widget Settings routes
  // Public endpoint for widget settings (used by embed iframe)
  app.get("/api/widget-settings/public", async (req, res) => {
    try {
      const businessAccountId = req.query.businessAccountId as string;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account ID required" });
      }

      let settings = await storage.getWidgetSettings(businessAccountId);
      
      // If no settings exist, create default ones
      if (!settings) {
        settings = await storage.upsertWidgetSettings(businessAccountId, {});
      }

      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/widget-settings", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      let settings = await storage.getWidgetSettings(businessAccountId);
      
      // If no settings exist, create default ones
      if (!settings) {
        settings = await storage.upsertWidgetSettings(businessAccountId, {});
      }

      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/widget-settings", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      const { chatColor, chatColorEnd, widgetHeaderText, welcomeMessageType, welcomeMessage, buttonStyle, buttonAnimation, personality, currency, customInstructions } = req.body;
      
      const updateData: Partial<{ chatColor: string; chatColorEnd: string; widgetHeaderText: string; welcomeMessageType: string; welcomeMessage: string; buttonStyle: string; buttonAnimation: string; personality: string; currency: string; customInstructions: string; cachedIntro: string | null }> = {};
      
      if (chatColor !== undefined) updateData.chatColor = chatColor;
      if (chatColorEnd !== undefined) updateData.chatColorEnd = chatColorEnd;
      if (widgetHeaderText !== undefined) updateData.widgetHeaderText = widgetHeaderText;
      if (welcomeMessageType !== undefined) updateData.welcomeMessageType = welcomeMessageType;
      if (welcomeMessage !== undefined) updateData.welcomeMessage = welcomeMessage;
      if (buttonStyle !== undefined) updateData.buttonStyle = buttonStyle;
      if (buttonAnimation !== undefined) updateData.buttonAnimation = buttonAnimation;
      if (personality !== undefined) updateData.personality = personality;
      if (currency !== undefined) updateData.currency = currency;
      if (customInstructions !== undefined) updateData.customInstructions = customInstructions;

      // Invalidate cached intro when personality, welcomeMessageType, or customInstructions changes
      // This ensures the intro is regenerated with the new settings
      if (personality !== undefined || welcomeMessageType !== undefined || customInstructions !== undefined) {
        updateData.cachedIntro = null;
        
        // IMPORTANT: Also clear the business context cache so changes take effect immediately
        const { businessContextCache } = await import('./services/businessContextCache');
        const cacheKey = `business_context_${businessAccountId}`;
        businessContextCache.invalidate(cacheKey);
        console.log('[Cache] Cleared business context cache due to settings change');
      }

      const settings = await storage.upsertWidgetSettings(businessAccountId, updateData);
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // OpenAI API Key settings routes
  app.get("/api/settings/openai-key", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      const apiKey = await storage.getBusinessAccountOpenAIKey(businessAccountId);
      
      // Mask the API key for security - only show last 4 characters
      const maskedKey = apiKey 
        ? `sk-...${apiKey.slice(-4)}`
        : null;

      res.json({ 
        hasKey: !!apiKey,
        maskedKey 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/settings/openai-key", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      const { apiKey } = req.body;
      
      // Validate API key format
      if (apiKey && typeof apiKey === 'string') {
        if (!apiKey.startsWith('sk-')) {
          return res.status(400).json({ error: "Invalid OpenAI API key format. Key should start with 'sk-'" });
        }
        if (apiKey.length < 20) {
          return res.status(400).json({ error: "Invalid OpenAI API key format. Key is too short." });
        }
      }

      // Save the API key (or null to remove it)
      const saveKey = apiKey && apiKey.trim() ? apiKey.trim() : null;
      await storage.updateBusinessAccountOpenAIKey(businessAccountId, saveKey as any);

      // Return masked version
      const maskedKey = saveKey 
        ? `sk-...${saveKey.slice(-4)}`
        : null;

      res.json({ 
        success: true,
        hasKey: !!saveKey,
        maskedKey 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Shopify Integration settings routes
  app.get("/api/settings/shopify", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      const credentials = await storage.getShopifyCredentials(businessAccountId);
      
      // Mask the access token for security
      const maskedToken = credentials.accessToken 
        ? `${credentials.accessToken.slice(0, 8)}...${credentials.accessToken.slice(-4)}`
        : null;

      res.json({ 
        storeUrl: credentials.storeUrl,
        hasToken: !!credentials.accessToken,
        maskedToken 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/settings/shopify", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      const { storeUrl, accessToken } = req.body;
      
      // Validate store URL format
      if (storeUrl && typeof storeUrl === 'string') {
        const trimmedUrl = storeUrl.trim().toLowerCase();
        if (!trimmedUrl.endsWith('.myshopify.com')) {
          return res.status(400).json({ 
            error: "Invalid Shopify store URL. It should end with '.myshopify.com'" 
          });
        }
      }

      // Save credentials (or null to remove them)
      const saveUrl = storeUrl && storeUrl.trim() ? storeUrl.trim() : null;
      const saveToken = accessToken && accessToken.trim() ? accessToken.trim() : null;
      
      await storage.updateShopifyCredentials(businessAccountId, saveUrl, saveToken);

      // Return masked version
      const maskedToken = saveToken 
        ? `${saveToken.slice(0, 8)}...${saveToken.slice(-4)}`
        : null;

      res.json({ 
        success: true,
        storeUrl: saveUrl,
        hasToken: !!saveToken,
        maskedToken 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Shopify product import endpoint
  app.post("/api/shopify/import", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      // Get Shopify credentials
      const credentials = await storage.getShopifyCredentials(businessAccountId);
      if (!credentials.storeUrl || !credentials.accessToken) {
        return res.status(400).json({ 
          error: "Shopify credentials not configured. Please add your store URL and access token in Settings first." 
        });
      }

      // Initialize Shopify service
      const { ShopifyService } = await import('./services/shopifyService');
      const shopifyService = new ShopifyService(credentials.storeUrl, credentials.accessToken);

      // Test connection first
      const isConnected = await shopifyService.testConnection();
      if (!isConnected) {
        return res.status(400).json({ 
          error: "Failed to connect to Shopify. Please check your store URL and access token." 
        });
      }

      // Fetch products from Shopify
      const shopifyProducts = await shopifyService.fetchProducts(250);

      // Import products to database
      const importedCount = 0;
      const updatedCount = 0;
      const skippedCount = 0;

      for (const shopifyProduct of shopifyProducts) {
        try {
          // Check if product already exists by Shopify ID
          const existingProducts = await storage.getAllProducts(businessAccountId);
          const existing = existingProducts.find(p => p.shopifyProductId === shopifyProduct.shopifyId);

          if (existing) {
            // Update existing Shopify product
            await storage.updateProduct(existing.id, businessAccountId, {
              name: shopifyProduct.name,
              description: shopifyProduct.description,
              price: shopifyProduct.price || undefined,
              imageUrl: shopifyProduct.imageUrl || undefined,
              shopifyLastSyncedAt: new Date(),
            });
          } else {
            // Create new product
            await storage.createProduct({
              businessAccountId,
              name: shopifyProduct.name,
              description: shopifyProduct.description,
              price: shopifyProduct.price || undefined,
              imageUrl: shopifyProduct.imageUrl || undefined,
              source: 'shopify',
              shopifyProductId: shopifyProduct.shopifyId,
              shopifyLastSyncedAt: new Date(),
              isEditable: 'false',
            });
          }
        } catch (productError) {
          console.error('[Shopify Import] Failed to import product:', productError);
        }
      }

      res.json({ 
        success: true,
        message: `Successfully imported ${shopifyProducts.length} products from Shopify`,
        imported: shopifyProducts.length
      });
    } catch (error: any) {
      console.error('[Shopify Import] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to import products from Shopify' });
    }
  });

  // Excel product import endpoint
  app.post("/api/products/import-excel", requireAuth, requireBusinessAccount, excelUpload.single('file'), async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Import xlsx library
      const XLSX = await import('xlsx');
      
      // Parse the Excel file
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const data = XLSX.utils.sheet_to_json(worksheet) as any[];
      
      if (data.length === 0) {
        return res.status(400).json({ error: "Excel file is empty or invalid format" });
      }

      let importedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];

      for (const row of data) {
        try {
          // Validate required fields (case-insensitive column names)
          const rowData: any = {};
          for (const key in row as any) {
            rowData[key.toLowerCase().trim()] = (row as any)[key];
          }

          const name = rowData['name'] || rowData['product name'] || rowData['title'];
          const description = rowData['description'] || rowData['desc'] || '';
          const price = rowData['price'] || rowData['cost'] || null;
          const imageUrl = rowData['image'] || rowData['image url'] || rowData['imageurl'] || null;
          const categoriesStr = rowData['categories'] || rowData['category'] || '';
          const tagsStr = rowData['tags'] || rowData['tag'] || '';

          if (!name) {
            skippedCount++;
            errors.push(`Row skipped: Missing product name`);
            continue;
          }

          // Create product
          const product = await storage.createProduct({
            businessAccountId,
            name: String(name).trim(),
            description: String(description).trim(),
            price: price ? String(price) : undefined,
            imageUrl: imageUrl ? String(imageUrl).trim() : undefined,
            source: 'manual',
            isEditable: 'true',
          });

          // Handle categories (comma-separated)
          if (categoriesStr && String(categoriesStr).trim()) {
            const categoryNames = String(categoriesStr)
              .split(',')
              .map(c => c.trim())
              .filter(c => c.length > 0);

            for (const categoryName of categoryNames) {
              try {
                // Check if category exists
                const allCategories = await storage.getAllCategories(businessAccountId);
                let category = allCategories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());

                // Create category if it doesn't exist
                if (!category) {
                  category = await storage.createCategory({
                    businessAccountId,
                    name: categoryName,
                  });
                }

                // Associate product with category
                await storage.assignProductToCategory(product.id, category.id);
              } catch (catError) {
                console.error('[Excel Import] Failed to add category:', catError);
              }
            }
          }

          // Handle tags (comma-separated)
          if (tagsStr && String(tagsStr).trim()) {
            const tagNames = String(tagsStr)
              .split(',')
              .map(t => t.trim())
              .filter(t => t.length > 0);

            for (const tagName of tagNames) {
              try {
                // Check if tag exists
                const allTags = await storage.getAllTags(businessAccountId);
                let tag = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());

                // Create tag if it doesn't exist
                if (!tag) {
                  tag = await storage.createTag({
                    businessAccountId,
                    name: tagName,
                  });
                }

                // Associate product with tag
                await storage.assignProductToTag(product.id, tag.id);
              } catch (tagError) {
                console.error('[Excel Import] Failed to add tag:', tagError);
              }
            }
          }

          importedCount++;
        } catch (productError: any) {
          skippedCount++;
          errors.push(`Failed to import row: ${productError.message}`);
          console.error('[Excel Import] Failed to import row:', productError);
        }
      }

      res.json({ 
        success: true,
        message: `Successfully imported ${importedCount} products from Excel${skippedCount > 0 ? `, ${skippedCount} rows skipped` : ''}`,
        imported: importedCount,
        skipped: skippedCount,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined // Return first 10 errors
      });
    } catch (error: any) {
      console.error('[Excel Import] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to import Excel file' });
    }
  });

  // Password change endpoint
  app.post("/api/settings/change-password", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { currentPassword, newPassword } = req.body;

      // Validate inputs
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current password and new password are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters long" });
      }

      // Get user from database
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Verify current password
      const isValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);

      // Update password
      await storage.updateUserPassword(userId, newPasswordHash);

      // Clear temporary password flags if present
      await storage.clearTempPassword(userId);

      res.json({ success: true, message: "Password changed successfully" });
    } catch (error: any) {
      // Don't leak internal error details
      res.status(500).json({ error: "An error occurred while changing your password. Please try again." });
    }
  });

  // AI Conversation Analysis endpoint
  app.get("/api/insights/conversation-analysis", requireAuth, requireBusinessAccount, async (req, res) => {
    try {
      const businessAccountId = req.user?.businessAccountId;
      if (!businessAccountId) {
        return res.status(400).json({ error: "Business account not found" });
      }

      const { fromDate, toDate } = req.query;

      // Get OpenAI API key for the business
      const openaiApiKey = await storage.getBusinessAccountOpenAIKey(businessAccountId);
      if (!openaiApiKey) {
        return res.status(400).json({ 
          error: "OpenAI API key not configured. Please add your API key in Settings to enable AI insights." 
        });
      }

      // Fetch conversations with their messages
      const conversations = await storage.getConversationsByBusinessAccount(
        businessAccountId,
        fromDate as string,
        toDate as string
      );

      if (conversations.length === 0) {
        return res.json({
          topicsOfInterest: [],
          sentiment: {
            positive: 0,
            neutral: 100,
            negative: 0,
            overall: "neutral"
          },
          commonPatterns: [],
          engagementInsights: {
            avgMessagesPerConversation: 0,
            totalConversations: 0,
            mostActiveTopics: []
          }
        });
      }

      // Get messages for all conversations
      const conversationIds = conversations.map(c => c.id);
      const messages = await storage.getMessagesByConversationIds(conversationIds);

      // Prepare conversation data for AI analysis
      const conversationSummaries = conversations.slice(0, 50).map(conv => {
        const convMessages = messages.filter(m => m.conversationId === conv.id);
        return {
          title: conv.title,
          messageCount: convMessages.length,
          messages: convMessages.slice(0, 20).map(m => ({
            role: m.role,
            content: m.content.substring(0, 500) // Limit message length for token efficiency
          }))
        };
      });

      // Use OpenAI to analyze conversations
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: openaiApiKey });

      const prompt = `Analyze these customer conversations and provide insights:

${JSON.stringify(conversationSummaries, null, 2)}

Provide a comprehensive analysis with:
1. Top 5 topics users are most interested in
2. Overall sentiment breakdown (positive, neutral, negative percentages)
3. Common patterns or frequently asked questions
4. Engagement insights (what users care about most)

Format your response as JSON with this structure:
{
  "topicsOfInterest": ["topic 1", "topic 2", "topic 3", "topic 4", "topic 5"],
  "sentiment": {
    "positive": <percentage>,
    "neutral": <percentage>,
    "negative": <percentage>,
    "overall": "positive|neutral|negative"
  },
  "commonPatterns": ["pattern 1", "pattern 2", "pattern 3"],
  "engagementInsights": {
    "avgMessagesPerConversation": <number>,
    "totalConversations": ${conversations.length},
    "mostActiveTopics": ["topic 1", "topic 2", "topic 3"]
  },
  "summary": "Brief 2-3 sentence summary of overall conversation insights"
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert data analyst specializing in customer conversation analysis. Provide insights in valid JSON format only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: "json_object" }
      });

      const analysisText = completion.choices[0].message.content || '{}';
      const analysis = JSON.parse(analysisText);

      res.json(analysis);
    } catch (error: any) {
      console.error("Conversation analysis error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze conversations" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
