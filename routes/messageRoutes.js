import express from "express";
import { getInbox, getChat, sendMessage } from "../controllers/messageController.js";
import * as authMiddleware from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get("/messages", authMiddleware.authenticateToken, getInbox);
router.get("/messages/:userId", authMiddleware.authenticateToken, getChat);
router.post("/messages/:userId", authMiddleware.authenticateToken, sendMessage);

export default router;

