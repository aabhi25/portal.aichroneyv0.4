# Hi Chroney - AI Business Chatbot Platform

## Overview
Hi Chroney is a multi-tenant AI chatbot platform designed to empower businesses with efficient, intelligent customer engagement and lead generation. It enables SuperAdmins to manage accounts and Business Users to handle products, FAQs, and leads through an AI-powered conversational interface. Key capabilities include dynamic product showcasing, knowledge base Q&A, and automated lead capture, all within a secure, role-based access control system.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is built with React 18, TypeScript, Vite, Shadcn UI (Radix UI), and Tailwind CSS, supporting light/dark modes. The design focuses on conversational clarity with a fixed gradient header, role-based sidebar, and a responsive, centered layout optimized for 768px content width. AI responses are card-based, while user input uses gradient bubbles. The sidebar navigation prioritizes key features: Home, Insights, Conversations, Leads, Admin sections, Train Chroney, Products, FAQs, Website Scan, and Widget.

### Technical Implementations
The backend uses Express.js with Node.js, implementing session-based authentication with httpOnly cookies, bcrypt hashing, and role-based access control. APIs support authentication, SuperAdmin business account management, and CRUD operations for conversations, messages, products, FAQs, and leads, with multi-tenancy enforced by `businessAccountId` filtering.

### Feature Specifications
-   **Multi-Tenant Authentication & Admin Dashboards**: SuperAdmins manage business accounts and users; Business Users manage their products, FAQs, leads, company descriptions, and chatbot training.
-   **Chroney AI Chat**: AI-powered by OpenAI GPT-4.1 nano, featuring rotating intro messages, context-aware typing indicators, tool-based function calling (products, FAQs, lead capture), 15-minute conversation memory, word-by-word streaming animation, and configurable OpenAI API keys per business account. Performance optimizations include business context caching, parallel context loading, and smart tool selection for token and cost savings.
-   **Train Chroney Page**: Business Users train Chroney using natural language instructions, stored per business account.
-   **Settings Page**: Business Users configure currency, OpenAI API keys, and change passwords with security measures.
-   **Forgot Password System**: Email-based password reset using Resend, with secure, single-use tokens.
-   **Widget Settings Page**: Business Users customize chatbot appearance and behavior with live preview and embed code generation.
-   **Product Management**: Supports product image uploads, optional pricing, and intelligent product cataloging with categories, tags, and relationships for AI-driven recommendations.
-   **Conversational AI Architecture**: Orchestrated by `LlamaService`, `ChatService`, `ToolExecutionService`, and `ConversationMemoryService`, incorporating preloaded FAQs and company info with anti-hallucination guardrails. Products are displayed as `ProductCard` components with smart pagination and price filtering.
-   **Proactive Lead Capture**: Chroney detects buying intent and uses the `capture_lead` tool to collect contact information, automatically updating conversation names.
-   **FAQ Drafts Workflow**: AI-generated FAQ suggestions from website URLs can be reviewed, edited, and published.
-   **Insights Dashboard**: Business Users track key metrics, recent activity, and leads. AI-powered conversation analysis provides insights on user interests, sentiment, and engagement, respecting date filters.
-   **Conversations Tab**: Provides a two-panel interface for viewing conversation lists (searchable, filterable) and full message histories, with optimized message aggregation.
-   **Website Analysis**: Replaced "About" page, this feature allows Business Users to scrape and analyze their website content using OpenAI GPT-4o-mini to extract structured business information (name, description, products, services, contact, hours, etc.). Additional pages can be analyzed and intelligently merged. Analyzed content is stored and integrated into Chroney's context. Supports real-time status, error handling, URL validation, and inline editing of extracted data.
-   **Intelligent Product Catalog**: Enhanced product management with categories, tags, and relationship support (cross_sell, similar, complement, bundle) for smarter AI-driven product discovery and recommendations. Features dedicated managers for categories and tags, and updated product forms.
-   **Shopify Integration**: Enables one-click product import from Shopify stores by configuring credentials. Imported products are marked read-only with source tracking to prevent conflicts and ensure Shopify remains the source of truth.
-   **Data Isolation**: All business data is isolated by `businessAccountId` at the database level.

### System Design Choices
-   **Database**: PostgreSQL with Drizzle ORM and Neon serverless driver, enforcing multi-tenancy and UUID primary keys.
-   **Data Validation**: Zod schemas for end-to-end type safety.
-   **State Management**: TanStack Query for server state; local React state for UI.
-   **Security**: bcrypt for password hashing; `httpOnly`, `secure`, `sameSite=strict` session cookies; role-based middleware and database-level filtering.
-   **Multi-Tenant Isolation**: Complete database-level isolation enforced across all storage methods and API routes using `businessAccountId`.
-   **Chat Performance Optimizations**: Implemented through rotating intro messages, context-aware typing indicators, automatic memory reset, word-by-word animation, business context caching, parallel context loading, and smart tool selection for faster responses and cost reduction.

## External Dependencies

-   **AI Services**: OpenAI API (GPT-4.1 nano, GPT-4o-mini).
-   **E-commerce Integration**: Shopify GraphQL Admin API (`@shopify/shopify-api`).
-   **Database Services**: Neon Serverless PostgreSQL.
-   **Email Services**: Resend.
-   **Web Scraping**: cheerio.
-   **File Upload**: multer.
-   **Security Libraries**: `bcrypt`, `cookie-parser`.
-   **UI Component Libraries**: Radix UI.
-   **Styling & Fonts**: Google Fonts, Tailwind CSS, PostCSS.