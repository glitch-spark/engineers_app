# Netlify Deployment Guide

## Prerequisites
- A Netlify account
- Your project pushed to a Git repository (GitHub, GitLab, or Bitbucket)

## Step 1: Prepare Your Project

### Environment Variables
You'll need to set these environment variables in Netlify:

```bash
# Required
NEXTAUTH_URL=https://your-site-name.netlify.app
NEXTAUTH_SECRET=your-secret-key-here
MONGODB_URI=your-mongodb-connection-string

# Optional (if using OAuth providers)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Optional (if using Slack integration)
SLACK_WEBHOOK_URL=your-slack-webhook-url
```

### Generate NEXTAUTH_SECRET
Run this command to generate a secure secret:
```bash
openssl rand -base64 32
```

## Step 2: Deploy to Netlify

### Option A: Deploy via Netlify Dashboard
1. Go to [netlify.com](https://netlify.com) and sign in
2. Click **"New site from Git"**
3. Choose your Git provider (GitHub, GitLab, or Bitbucket)
4. Select your repository
5. Configure build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`
6. Click **"Deploy site"**

### Option B: Deploy via Netlify CLI
1. Install Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```

2. Login to Netlify:
   ```bash
   netlify login
   ```

3. Deploy your site:
   ```bash
   netlify deploy --prod
   ```

## Step 3: Configure Environment Variables

1. Go to your site dashboard in Netlify
2. Navigate to **Site settings** → **Environment variables**
3. Add each environment variable from Step 1
4. Click **"Save"**
5. Trigger a new deployment

## Step 4: Update OAuth Provider Settings

If you're using OAuth providers (Google, GitHub, etc.):

1. Go to your OAuth provider's developer console
2. Add your Netlify URL to the authorized redirect URIs:
   ```
   https://your-site-name.netlify.app/api/auth/callback/google
   https://your-site-name.netlify.app/api/auth/callback/github
   ```

## Step 5: Test Your Deployment

1. Visit your Netlify URL
2. Test the authentication flow
3. Verify all features work correctly

## Troubleshooting

### Common Issues:

1. **Build fails**: Check the build logs in Netlify dashboard
2. **Authentication doesn't work**: Verify NEXTAUTH_URL and NEXTAUTH_SECRET are set correctly
3. **Database connection fails**: Ensure MONGODB_URI is correct and accessible
4. **OAuth redirect errors**: Update your OAuth provider settings with the correct callback URLs
5. **"Unexpected end of JSON input" error**: 
   - Check that all environment variables are set correctly
   - Verify MongoDB connection string is accessible from Netlify
   - Check Netlify function logs for detailed error messages
   - Ensure API routes have proper error handling

### Build Logs
If you encounter issues, check the build logs in your Netlify dashboard under **Deploys** → **View deploy log**.

## Support
For more help, refer to:
- [Netlify Next.js documentation](https://docs.netlify.com/integrations/frameworks/nextjs/)
- [NextAuth.js deployment guide](https://next-auth.js.org/configuration/providers)
