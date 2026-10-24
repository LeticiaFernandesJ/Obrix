import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load routes
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);

// Static folders
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Root endpoint
app.get('/api', (req, res) => {
  res.json({ message: 'API is running...' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
