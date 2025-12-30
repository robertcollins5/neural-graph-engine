import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import parseCompaniesRouter from "./routes/parse-companies.js";
import discoverBatchRouter from "./routes/discover-batch.js";
import whoCares from "./routes/who-cares.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // API Routes
  app.use('/api/parse-companies', parseCompaniesRouter);
  app.use('/api/discover-batch', discoverBatchRouter);
  app.use('/api/who-cares', whoCares);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
