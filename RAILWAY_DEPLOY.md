# Team Diary - Railway Deployment

## Environment Variables

Set these in Railway Dashboard → Variables:

```
NODE_ENV=production
PORT=3000
```

## Database

Railway provides free PostgreSQL. To use it instead of SQLite:

1. Add PostgreSQL plugin in Railway
2. Railway automatically sets `DATABASE_URL`
3. Modify `server.js` to use PostgreSQL

## Deploy Steps

1. Push code to GitHub
2. Go to https://railway.app/dashboard
3. New Project → Deploy from GitHub repo
4. Add environment variables
5. Deploy!
6. Railway will give you a permanent `*.railway.app` URL
