import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, uuid, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Business Accounts table
export const businessAccounts = pgTable("business_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  website: text("website").notNull(), // Mandatory website URL for the business
  description: text("description").default(""),
  openaiApiKey: text("openai_api_key"), // Business-specific OpenAI API key
  status: text("status").notNull().default("active"), // 'active' | 'suspended'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Users table with roles and business account association
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  tempPassword: text("temp_password"), // Temporary password for viewing/copying
  tempPasswordExpiry: timestamp("temp_password_expiry"), // When temp password expires
  mustChangePassword: text("must_change_password").notNull().default("false"), // 'true' | 'false' - Force password change on next login
  role: text("role").notNull(), // 'super_admin' | 'business_user'
  businessAccountId: varchar("business_account_id").references(() => businessAccounts.id, { onDelete: "cascade" }),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Sessions table for authentication
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionToken: text("session_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessAccountId: varchar("business_account_id").references(() => businessAccounts.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New Chat"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessAccountId: varchar("business_account_id").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }),
  imageUrl: text("image_url"),
  source: text("source").notNull().default("manual"), // 'manual' | 'shopify'
  shopifyProductId: text("shopify_product_id"), // Original Shopify product ID
  shopifyLastSyncedAt: timestamp("shopify_last_synced_at"), // When last synced from Shopify
  isEditable: text("is_editable").notNull().default("true"), // 'true' | 'false' - Whether user can edit this product
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const faqs = pgTable("faqs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessAccountId: varchar("business_account_id").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const draftFaqs = pgTable("draft_faqs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessAccountId: varchar("business_account_id").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category"),
  sourceUrl: text("source_url"), // Track which website the FAQ was generated from
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessAccountId: varchar("business_account_id").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  name: text("name"), // Optional - customer may not provide name
  email: text("email"), // Optional - customer may provide only phone
  phone: text("phone"), // Optional - customer may provide only email
  message: text("message"),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const widgetSettings = pgTable("widget_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessAccountId: varchar("business_account_id").notNull().unique().references(() => businessAccounts.id, { onDelete: "cascade" }),
  chatColor: text("chat_color").notNull().default("#9333ea"), // Start color for gradient
  chatColorEnd: text("chat_color_end").notNull().default("#3b82f6"), // End color for gradient
  widgetHeaderText: text("widget_header_text").notNull().default("Hi Chroney"), // Customizable header text
  welcomeMessageType: text("welcome_message_type").notNull().default("custom"), // 'custom' | 'ai_generated'
  welcomeMessage: text("welcome_message").notNull().default("Hi! How can I help you today?"),
  buttonStyle: text("button_style").notNull().default("circular"), // 'circular' | 'rounded' | 'pill' | 'minimal'
  buttonAnimation: text("button_animation").notNull().default("pulse"), // 'pulse' | 'bounce' | 'glow' | 'none'
  personality: text("personality").notNull().default("friendly"), // 'friendly' | 'professional' | 'funny' | 'polite' | 'casual'
  currency: text("currency").notNull().default("USD"),
  customInstructions: text("custom_instructions"), // Natural language instructions for customizing Chroney's behavior
  cachedIntro: text("cached_intro"), // Cached AI-generated intro message to avoid regenerating on every page load
  shopifyStoreUrl: text("shopify_store_url"), // e.g., "mystore.myshopify.com"
  shopifyAccessToken: text("shopify_access_token"), // Private app access token (encrypted)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const websiteAnalysis = pgTable("website_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessAccountId: varchar("business_account_id").notNull().unique().references(() => businessAccounts.id, { onDelete: "cascade" }),
  websiteUrl: text("website_url").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'analyzing' | 'completed' | 'failed'
  analyzedContent: text("analyzed_content"), // Structured JSON with extracted business information
  errorMessage: text("error_message"), // Store error if analysis fails
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const analyzedPages = pgTable("analyzed_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessAccountId: varchar("business_account_id").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  pageUrl: text("page_url").notNull(),
  analyzedAt: timestamp("analyzed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Product Categories - Hierarchical categories for organizing products
export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessAccountId: varchar("business_account_id").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  parentCategoryId: varchar("parent_category_id").references((): any => categories.id, { onDelete: "cascade" }), // Self-referencing for hierarchy
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Product Tags - Flexible labels for products
export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessAccountId: varchar("business_account_id").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").default("#3b82f6"), // Optional color for visual organization
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Junction table: Products <-> Categories (many-to-many)
export const productCategories = pgTable("product_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  categoryId: varchar("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Junction table: Products <-> Tags (many-to-many)
export const productTags = pgTable("product_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Product Relationships - Cross-sell, similar products, bundles, complements
export const productRelationships = pgTable("product_relationships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessAccountId: varchar("business_account_id").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  sourceProductId: varchar("source_product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  targetProductId: varchar("target_product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  relationshipType: text("relationship_type").notNull(), // 'cross_sell' | 'similar' | 'complement' | 'bundle'
  weight: numeric("weight", { precision: 3, scale: 2 }).default("1.00"), // Priority/strength of relationship (0-1)
  notes: text("notes"), // Optional notes about the relationship
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Insert schemas
export const insertBusinessAccountSchema = createInsertSchema(businessAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  tempPassword: true,
  tempPasswordExpiry: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  usedAt: true,
  createdAt: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFaqSchema = createInsertSchema(faqs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDraftFaqSchema = createInsertSchema(draftFaqs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
});

export const insertWidgetSettingsSchema = createInsertSchema(widgetSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWebsiteAnalysisSchema = createInsertSchema(websiteAnalysis).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastAnalyzedAt: true,
});

export const insertAnalyzedPageSchema = createInsertSchema(analyzedPages).omit({
  id: true,
  createdAt: true,
  analyzedAt: true,
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductCategorySchema = createInsertSchema(productCategories).omit({
  id: true,
  createdAt: true,
});

export const insertProductTagSchema = createInsertSchema(productTags).omit({
  id: true,
  createdAt: true,
});

export const insertProductRelationshipSchema = createInsertSchema(productRelationships).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type InsertBusinessAccount = z.infer<typeof insertBusinessAccountSchema>;
export type BusinessAccount = typeof businessAccounts.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export type InsertFaq = z.infer<typeof insertFaqSchema>;
export type Faq = typeof faqs.$inferSelect;

export type InsertDraftFaq = z.infer<typeof insertDraftFaqSchema>;
export type DraftFaq = typeof draftFaqs.$inferSelect;

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

export type InsertWidgetSettings = z.infer<typeof insertWidgetSettingsSchema>;
export type WidgetSettings = typeof widgetSettings.$inferSelect;

export type InsertWebsiteAnalysis = z.infer<typeof insertWebsiteAnalysisSchema>;
export type WebsiteAnalysis = typeof websiteAnalysis.$inferSelect;

export type InsertAnalyzedPage = z.infer<typeof insertAnalyzedPageSchema>;
export type AnalyzedPage = typeof analyzedPages.$inferSelect;

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

export type InsertTag = z.infer<typeof insertTagSchema>;
export type Tag = typeof tags.$inferSelect;

export type InsertProductCategory = z.infer<typeof insertProductCategorySchema>;
export type ProductCategory = typeof productCategories.$inferSelect;

export type InsertProductTag = z.infer<typeof insertProductTagSchema>;
export type ProductTag = typeof productTags.$inferSelect;

export type InsertProductRelationship = z.infer<typeof insertProductRelationshipSchema>;
export type ProductRelationship = typeof productRelationships.$inferSelect;
