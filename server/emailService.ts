import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email};
}

async function getUncachableResendClient() {
  const {apiKey, fromEmail} = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail
  };
}

export async function sendPasswordResetEmail(to: string, resetToken: string) {
  try {
    const {client, fromEmail} = await getUncachableResendClient();
    
    // Use the frontend URL, not the backend API URL
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : 'http://localhost:5173';
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
    
    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject: 'Reset Your Password - Hi Chroney',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your Password</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 40px 20px;">
                  <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <tr>
                      <td style="padding: 40px 40px 20px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                          <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #9333ea 0%, #db2777 100%); display: flex; align-items: center; justify-content: center;">
                            <span style="color: white; font-size: 20px;">✨</span>
                          </div>
                          <h2 style="margin: 0; font-size: 24px; font-weight: 700; background: linear-gradient(135deg, #9333ea 0%, #3b82f6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                            Hi Chroney
                          </h2>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 0 40px 20px;">
                        <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #111827;">Reset Your Password</h1>
                        <p style="margin: 20px 0 0; font-size: 16px; line-height: 1.6; color: #4b5563;">
                          We received a request to reset your password for your Hi Chroney account. Click the button below to create a new password.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 0 40px 20px;">
                        <a href="${resetUrl}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #9333ea 0%, #db2777 100%); color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(147, 51, 234, 0.3);">
                          Reset Password
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 0 40px 20px;">
                        <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #6b7280;">
                          If the button doesn't work, you can copy and paste this link into your browser:
                        </p>
                        <p style="margin: 10px 0 0; font-size: 14px; word-break: break-all; color: #9333ea;">
                          ${resetUrl}
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 0 40px 30px;">
                        <div style="padding: 16px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px;">
                          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #92400e;">
                            <strong>Important:</strong> This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
                          </p>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 0 40px 40px;">
                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0 0 20px;">
                        <p style="margin: 0; font-size: 14px; color: #9ca3af; text-align: center;">
                          This email was sent by Hi Chroney - AI Business Chatbot Platform
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send password reset email:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
}
