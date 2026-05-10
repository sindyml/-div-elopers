# Azure Static Web Apps Migration Guide

This guide helps you migrate from Azure Web App to Azure Static Web Apps (100% FREE tier).

## Why Azure Static Web Apps?

✅ **FREE tier with generous limits:**
- 100 GB bandwidth per month (vs 165 MB/day on Web App F1)
- No CPU time quotas
- Custom domains included
- Automatic SSL certificates
- Built for static sites + serverless APIs

✅ **Perfect for StokPal:**
- Your frontend is static HTML/CSS/JS
- Your backend uses Azure Functions
- Already configured with `staticwebapp.config.json`

## Step-by-Step Setup

### Step 1: Create Azure Static Web App

1. **Go to Azure Portal:** https://portal.azure.com

2. **Create new resource:**
   - Click "Create a resource"
   - Search for "Static Web App"
   - Click "Create"

3. **Configure the basics:**
   - **Subscription:** Select your subscription
   - **Resource Group:** Use existing `stockpalrg` or create new
   - **Name:** `stockpal-swa` (or any name you prefer)
   - **Plan type:** **Free** (this is what you want!)
   - **Region:** Choose closest to South Africa (e.g., "West Europe" or "East US 2")
   - **Deployment source:** GitHub

4. **Sign in to GitHub:**
   - Click "Sign in with GitHub"
   - Authorize Azure Static Web Apps

5. **Configure deployment:**
   - **Organization:** SindyMl
   - **Repository:** -div-elopers
   - **Branch:** main

6. **Build configuration:**
   - **Build Presets:** Custom
   - **App location:** `/frontend`
   - **Api location:** `/backend/api`
   - **Output location:** `` (leave empty)

7. **Review + Create:**
   - Click "Review + create"
   - Click "Create"

### Step 2: Get the Deployment Token

After creation:

1. Go to your new Static Web App resource
2. Click "Manage deployment token" at the top
3. **Copy the token** (you'll need this for GitHub)

### Step 3: Add GitHub Secret

1. Go to your GitHub repository: https://github.com/SindyMl/-div-elopers

2. Navigate to: **Settings** → **Secrets and variables** → **Actions**

3. Click "New repository secret"

4. Add the secret:
   - **Name:** `AZURE_STATIC_WEB_APPS_API_TOKEN`
   - **Value:** Paste the deployment token from Step 2
   - Click "Add secret"

### Step 4: Configure Environment Variables

In Azure Portal, go to your Static Web App:

1. Click **Configuration** in the left menu

2. Add all your environment variables:
   - `FIREBASE_API_KEY`
   - `FIREBASE_AUTH_DOMAIN`
   - `FIREBASE_DATABASE_URL`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_MESSAGING_SENDER_ID`
   - `FIREBASE_APP_ID`
   - `FIREBASE_MEASUREMENT_ID`
   - `PAYFAST_MERCHANT_ID`
   - `PAYFAST_MERCHANT_KEY`
   - `PAYFAST_PASSPHRASE`
   - `BASE_URL` (will be your new Static Web App URL)
   - `NODE_ENV=production`

3. Click **Save**

### Step 5: Deploy

The workflow has already been updated in this commit!

1. **Push this branch to main** (or merge this PR)
2. Go to **GitHub Actions** tab
3. Watch the deployment run
4. Once complete, your site will be live!

### Step 6: Get Your URL

1. In Azure Portal, go to your Static Web App
2. The URL is shown on the Overview page
3. It will look like: `https://stockpal-swa.azurestaticapps.net`

### Step 7: Clean Up Old Resources (Optional)

Once everything is working:

1. In Azure Portal, find the old `stockpal-app` Web App
2. Delete it to avoid any charges
3. Remove the `AZURE_WEBAPP_PUBLISH_PROFILE` secret from GitHub

## Troubleshooting

### Issue: Deployment fails

**Solution:** Check that:
- The `AZURE_STATIC_WEB_APPS_API_TOKEN` secret is set correctly
- The app/api locations in the workflow match your structure
- Environment variables are set in Azure Portal

### Issue: API functions not working

**Solution:**
- Ensure all environment variables are configured in Azure Static Web Apps
- Check that files in `/backend/api` follow Azure Functions structure
- Each API function should have a `function.json` file

### Issue: Routes not working

**Solution:**
- The `staticwebapp.config.json` is already configured
- Azure Static Web Apps will automatically use it

## Cost Comparison

| Service | Tier | Monthly Cost | Bandwidth | CPU Quota |
|---------|------|--------------|-----------|-----------|
| Azure Web App | F1 Free | $0 | 165 MB/day | 60 min/day |
| Azure Web App | B1 Basic | ~$13 | 1 GB/day | Unlimited |
| **Azure Static Web Apps** | **Free** | **$0** | **100 GB/month** | **N/A** |

## Additional Features

Once on Static Web Apps, you get:
- **Staging environments** for pull requests (automatic preview deployments)
- **Custom domains** with free SSL
- **Built-in authentication** providers (if needed later)
- **Global CDN** for faster performance worldwide

## Support

If you need help:
- Check Azure Static Web Apps docs: https://docs.microsoft.com/azure/static-web-apps/
- GitHub Issues: Create an issue in this repo
- Azure Support: Available in Azure Portal

---

**Ready to deploy?** Just commit this change and push to main!
