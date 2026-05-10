# Deploy StokPal to Vercel (FREE)

This guide shows you how to deploy StokPal to Vercel's free tier - perfect for student projects with no Azure regional restrictions.

## Why Vercel?

✅ **100% FREE for students/personal projects**
✅ **100 GB bandwidth per month** (vs 165 MB/day on Azure Web App F1)
✅ **No regional restrictions** - works worldwide
✅ **Global CDN** - fast everywhere, including South Africa
✅ **Automatic HTTPS** - free SSL certificates
✅ **Perfect for your stack** - static sites + serverless APIs
✅ **No credit card required**
✅ **2-minute setup**

## Step-by-Step Setup

### Step 1: Sign Up for Vercel

1. Go to https://vercel.com
2. Click "Sign Up"
3. Choose "Continue with GitHub"
4. Authorize Vercel to access your GitHub account

### Step 2: Import Your Project

1. After signing in, click "Add New..." → "Project"
2. Find your repository `SindyMl/-div-elopers` in the list
3. Click "Import"

### Step 3: Configure Build Settings

On the import screen:

- **Framework Preset:** Select "Other" (since you're using vanilla JS)
- **Root Directory:** `./` (leave as default)
- **Build Command:** Leave empty (you don't need a build step)
- **Output Directory:** `frontend`
- **Install Command:** Leave empty

Click "Deploy" (we'll add environment variables after first deployment)

### Step 4: Add Environment Variables

After the first deployment completes:

1. Go to your project dashboard on Vercel
2. Click "Settings" → "Environment Variables"
3. Add all your Firebase and PayFast variables:

```
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_DATABASE_URL=https://your_project.firebaseio.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_MEASUREMENT_ID=your_measurement_id
PAYFAST_MERCHANT_ID=10000100
PAYFAST_MERCHANT_KEY=46f0cd694581a
PAYFAST_PASSPHRASE=your_passphrase
NODE_ENV=production
```

4. Click "Save"
5. Go to "Deployments" → Click on latest deployment → "Redeploy"

### Step 5: Configure Serverless Functions (API Routes)

Vercel uses a different structure for serverless functions. Your backend API functions need to be in a `/api` folder at the root.

**Current structure:**
```
/backend/api/getSAData/index.js
/backend/api/getFirebaseConfig/index.js
```

**Vercel structure:**
```
/api/getSAData.js
/api/getFirebaseConfig.js
```

Let me create the Vercel-compatible API functions:

### Step 6: Set Your Custom Domain (Optional)

1. In Vercel dashboard, go to "Settings" → "Domains"
2. Add your custom domain (free with Vercel)
3. Update your DNS settings as instructed
4. Vercel automatically provisions SSL

Your site will be available at:
- **Default:** `stockpal-xyz.vercel.app`
- **Custom:** `yourdomain.com` (if you add one)

### Step 7: Automatic Deployments

Vercel automatically deploys when you push to main branch:
- Every push to `main` = production deployment
- Every pull request = preview deployment

## Vercel API Routes

Vercel expects API functions in `/api` folder at project root. Each file exports a default function:

```javascript
// /api/example.js
module.exports = (req, res) => {
  res.status(200).json({ message: 'Hello from Vercel!' });
};
```

## Configuration File

Create `vercel.json` in your project root:

```json
{
  "version": 2,
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/frontend/$1"
    }
  ]
}
```

## Troubleshooting

### Issue: API routes not working

**Solution:**
- Ensure API files are in `/api` folder at root
- Each file should export a function: `module.exports = (req, res) => { ... }`
- Check Vercel logs in dashboard for errors

### Issue: Static files not loading

**Solution:**
- Verify `frontend` is set as output directory
- Check that paths in HTML don't have `/frontend` prefix
- Clear browser cache

### Issue: Environment variables not working

**Solution:**
- Redeploy after adding environment variables
- Variables are only available at build time and runtime
- Client-side code needs to fetch from API routes

## Cost Comparison

| Platform | Free Tier Bandwidth | Serverless Functions | Restrictions |
|----------|---------------------|---------------------|--------------|
| Azure Web App F1 | 165 MB/day | No | CPU quotas |
| Azure Static Web Apps | 100 GB/month | Yes | Regional (student) |
| **Vercel** | **100 GB/month** | **Yes** | **None** ✅ |
| Netlify | 100 GB/month | Yes | Build minutes |
| Firebase Hosting | 10 GB/month | Yes (paid) | Function limits |

## Features Included Free

✅ Unlimited projects
✅ HTTPS/SSL certificates
✅ Global CDN (edge network)
✅ Automatic deployments from GitHub
✅ Preview deployments for PRs
✅ Analytics (basic)
✅ Custom domains
✅ Serverless functions (100 GB-hours/month)
✅ 100 GB bandwidth/month

## Support Resources

- **Vercel Docs:** https://vercel.com/docs
- **Serverless Functions:** https://vercel.com/docs/concepts/functions/serverless-functions
- **GitHub Integration:** https://vercel.com/docs/concepts/git/vercel-for-github

## Migration from Azure

If you had an Azure deployment:

1. ✅ Deploy to Vercel (follow steps above)
2. ✅ Test everything works on Vercel URL
3. ✅ Update any hardcoded URLs in your app
4. ✅ Delete Azure Web App (to avoid charges)
5. ✅ Remove Azure secrets from GitHub

## Next Steps

1. **Sign up for Vercel** - takes 30 seconds
2. **Import your repo** - automatic setup
3. **Add environment variables** - copy from your .env
4. **Deploy** - live in under 2 minutes!

---

**Ready to deploy?** Go to https://vercel.com and click "Sign Up with GitHub"!

Your StokPal app will be live at `stockpal-xxx.vercel.app` in under 5 minutes! 🚀
