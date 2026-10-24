import express from 'express';
import { registerUser, loginUser } from '../services/authService.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const result = await registerUser(name, email, password);

  if (result.success) {
    res.status(201).json({ message: 'User registered successfully', id: result.id });
  } else {
    res.status(400).json({ message: result.error });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const result = await loginUser(email, password);

  if (result.success) {
    res.status(200).json({ token: result.token, user: result.user });
  } else {
    res.status(401).json({ message: result.error });
  }
});

router.get('/me', verifyToken, (req, res) => {
  // Returns currently logged in user info (decoded from token)
  res.status(200).json({ id: req.userId, role: req.userRole });
});

export default router;
