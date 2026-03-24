#!/bin/bash
echo "Installing dependencies..."
npm install

echo "Deploying to Vercel..."
npx vercel --prod \
  --env NEXT_PUBLIC_SUPABASE_URL=https://qhgxkshjlaxxgxgcerzg.supabase.co \
  --env NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ3hrc2hqbGF4eGd4Z2NlcnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MzgyNjksImV4cCI6MjA4OTUxNDI2OX0.TResowDqbPUctsz1Q9-x2GmvWZ2IC0Msrnu0rkJdNNk \
  --yes
