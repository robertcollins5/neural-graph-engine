# Neural Graph Engine - Deployment Guide

## Quick Start (30 minutes)

This guide walks you through deploying the Neural Graph Engine to Vercel with a custom domain.

---

## Prerequisites

Before starting, make sure you have:

1. **GitHub Account** - You already have this
2. **Vercel Account** - Free tier at https://vercel.com (likely already connected to your GitHub)
3. **API Keys** - You already have these:
   - Anthropic API Key (Claude)
   - Google Search API Key
   - Google Search Engine ID

---

## Step 1: Push Code to GitHub (5 minutes)

### 1.1 Open Terminal/Command Prompt

Navigate to your project folder:
```bash
cd /home/ubuntu/neural-graph-engine
```

### 1.2 Initialize Git (if not already done)

```bash
git init
```

### 1.3 Add All Files

```bash
git add .
```

### 1.4 Create Initial Commit

```bash
git commit -m "Initial commit: Neural Graph Engine MVP"
```

### 1.5 Add Remote Repository

Replace `YOUR_USERNAME` with your actual GitHub username:

```bash
git remote add origin https://github.com/YOUR_USERNAME/neural-graph-engine.git
```

### 1.6 Push to GitHub

```bash
git branch -M main
git push -u origin main
```

**What this does:** Uploads your code to GitHub so Vercel can access it.

---

## Step 2: Connect to Vercel (5 minutes)

### 2.1 Go to Vercel

Visit https://vercel.com and log in with your GitHub account.

### 2.2 Create New Project

1. Click the **"New Project"** button (top right)
2. Click **"Import Git Repository"**
3. Search for **"neural-graph-engine"**
4. Click **"Import"**

### 2.3 Configure Project

Vercel will show you project settings. You can leave most defaults as-is. Just make sure:
- **Framework Preset:** Select "Other" or let it auto-detect
- **Build Command:** `pnpm run build`
- **Output Directory:** `dist`

Click **"Deploy"** to start the first deployment.

**What this does:** Vercel automatically builds and deploys your app. This takes 2-5 minutes.

---

## Step 3: Add API Keys to Vercel (5 minutes)

### 3.1 Go to Project Settings

1. In Vercel dashboard, click on your **neural-graph-engine** project
2. Click the **"Settings"** tab (top menu)
3. Click **"Environment Variables"** (left sidebar)

### 3.2 Add Environment Variables

Add each of these variables:

**Variable 1: Claude API Key**
- **Name:** `ANTHROPIC_API_KEY`
- **Value:** Your Claude API key (starts with `sk-ant-`)
- Click **"Add"**

**Variable 2: Google Search API Key**
- **Name:** `GOOGLE_SEARCH_API_KEY`
- **Value:** Your Google Search API key (starts with `AIzaSy`)
- Click **"Add"**

**Variable 3: Google Search Engine ID**
- **Name:** `GOOGLE_SEARCH_ENGINE_ID`
- **Value:** Your Search Engine ID (looks like `f149068b784cb4969`)
- Click **"Add"**

### 3.3 Redeploy with New Variables

1. Go back to the **"Deployments"** tab
2. Click the three dots (...) on the latest deployment
3. Click **"Redeploy"**

**What this does:** Restarts your app with the API keys so real relationship discovery works.

---

## Step 4: Configure Custom Domain (5 minutes)

### 4.1 Go to Domain Settings

1. In Vercel project, click **"Settings"**
2. Click **"Domains"** (left sidebar)

### 4.2 Add Custom Domain

1. Type your domain: `demo.signal6.com.au`
2. Click **"Add"**
3. Vercel will show you DNS configuration instructions

### 4.3 Configure DNS

You need to update your domain's DNS settings. The steps depend on where you registered your domain (GoDaddy, Namecheap, etc.):

1. Log in to your domain registrar
2. Find DNS settings
3. Add the DNS records Vercel shows you
4. Wait 24-48 hours for DNS to propagate

**Tip:** You can test if DNS is working by running this in terminal:
```bash
nslookup demo.signal6.com.au
```

---

## Step 5: Test Your Deployment (5 minutes)

### 5.1 Visit Your App

Once DNS is configured, visit: `https://demo.signal6.com.au`

### 5.2 Test Load Sample Alert

1. Click **"Load Sample Alert"**
2. You should see 8 companies with relationships
3. Check that WHO ELSE and WHO CARES panels display correctly

### 5.3 Test Paste Alert Text

1. Click **"Paste Alert Text"**
2. Paste: `Monash IVF ASX:MVF -10.37%`
3. Click **"Parse Companies"**
4. Click **"Analyze Network"**
5. Verify results display

**Note:** With real API keys, you should see more relationships than the demo data.

---

## Troubleshooting Deployment

### Issue: "Build failed" on Vercel

**Solution:**
1. Click on the failed deployment
2. Scroll down to see error details
3. Common fixes:
   - Missing dependencies: Run `pnpm install` locally and commit lock file
   - TypeScript errors: Run `pnpm run check` locally to find issues
   - Environment variables: Make sure all required vars are set in Vercel

### Issue: App loads but shows "No relationships"

**Solution:**
1. Check that API keys are set in Vercel Environment Variables
2. Verify keys are correct (copy-paste from Anthropic/Google consoles)
3. Redeploy to apply new environment variables
4. Check Vercel function logs for API errors

### Issue: Custom domain not working

**Solution:**
1. Verify DNS records are correctly added to your domain registrar
2. Wait 24-48 hours for DNS propagation
3. Test with: `nslookup demo.signal6.com.au`
4. Check Vercel domain configuration for any errors

### Issue: "Cannot find module" errors

**Solution:**
1. Make sure `pnpm-lock.yaml` is committed to Git
2. Run `pnpm install` locally to regenerate lock file
3. Commit and push to GitHub
4. Redeploy on Vercel

---

## Monitoring Your Deployment

### Check Deployment Status

1. Go to Vercel dashboard
2. Click **neural-graph-engine** project
3. **Deployments** tab shows all versions
4. Green checkmark = successful, red X = failed

### View Logs

1. Click on any deployment
2. Scroll down to see build logs
3. Click **"Function Logs"** to see runtime errors

### Monitor Performance

1. Click **"Analytics"** tab
2. See page views, response times, error rates

---

## Making Updates

After deployment, if you make changes:

### 1. Make Changes Locally

Edit files in your project folder.

### 2. Commit and Push

```bash
git add .
git commit -m "Description of changes"
git push
```

### 3. Vercel Automatically Redeploys

Vercel watches your GitHub repository. When you push changes, it automatically:
1. Pulls the new code
2. Builds the app
3. Deploys the new version

No manual action needed!

---

## Rollback to Previous Version

If something breaks:

1. Go to Vercel **Deployments** tab
2. Find the previous working deployment
3. Click the three dots (...)
4. Click **"Promote to Production"**

Your app instantly reverts to the previous version.

---

## Next Steps

Once deployed, you can:

1. **Share the URL** - Send `https://demo.signal6.com.au` to prospects
2. **Monitor usage** - Check Vercel Analytics to see who's using it
3. **Iterate** - Make changes locally, push to GitHub, Vercel auto-deploys
4. **Scale** - Upgrade Vercel plan if you need more API calls or performance

---

## Support

If you get stuck:

1. Check the **Troubleshooting** section above
2. Review the **HANDOVER.md** document for technical details
3. Check Vercel logs for specific error messages
4. Contact Manus AI for assistance

---

## Quick Reference

| Task | Command |
|------|---------|
| Push to GitHub | `git push` |
| Check status | `git status` |
| View recent commits | `git log --oneline` |
| Undo last commit | `git reset --soft HEAD~1` |

---

**Deployment Checklist:**
- [ ] Code pushed to GitHub
- [ ] Vercel project created
- [ ] Environment variables added
- [ ] First deployment successful
- [ ] Custom domain configured
- [ ] DNS propagated (wait 24-48h)
- [ ] Tested with Load Sample Alert
- [ ] Tested with Paste Alert Text
- [ ] Shared URL with team

---

**Status:** Ready for Production  
**Last Updated:** December 30, 2025
