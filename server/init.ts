import { storage } from "./storage";
import { hashPassword } from "./auth";

/**
 * Initialize the database with a default superadmin if none exists
 * This runs on server startup to ensure there's always a way to log in
 */
export async function initializeDatabase() {
  try {
    // Check if any superadmin users exist
    const superadmins = await storage.getSuperadmins();
    
    if (superadmins.length === 0) {
      console.log('[INIT] No superadmin found. Creating default superadmin account...');
      
      // Get credentials from environment variables or use defaults
      const username = process.env.SUPERADMIN_USERNAME || 'admin';
      const password = process.env.SUPERADMIN_PASSWORD || 'admin123';
      
      // Hash the password
      const passwordHash = await hashPassword(password);
      
      // Create the superadmin user
      await storage.createUser({
        username,
        passwordHash,
        role: 'super_admin',
        businessAccountId: null,
      });
      
      console.log(`[INIT] ✓ Default superadmin created with username: ${username}`);
      console.log(`[INIT] ⚠️  Please log in and change the password immediately!`);
      
      if (!process.env.SUPERADMIN_USERNAME || !process.env.SUPERADMIN_PASSWORD) {
        console.log('[INIT] ⚠️  Using default credentials. Set SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD environment variables for better security.');
      }
    } else {
      console.log(`[INIT] ✓ Found ${superadmins.length} superadmin account(s)`);
    }
  } catch (error) {
    console.error('[INIT] Error initializing database:', error);
    throw error;
  }
}
