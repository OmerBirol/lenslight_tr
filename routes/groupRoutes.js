import express from "express";
import { authenticateToken } from "../middlewares/authMiddleware.js";
import {
  listGroups,
  newGroupForm,
  createGroup,
  getGroupChat,
  sendGroupMessage,
  leaveGroup,
  deleteGroup,
} from "../controllers/groupController.js";

const router = express.Router();

router.get("/groups", authenticateToken, listGroups);
router.get("/groups/new", authenticateToken, newGroupForm);
router.post("/groups", authenticateToken, createGroup);

router.get("/groups/:id", authenticateToken, getGroupChat);
router.post("/groups/:id/messages", authenticateToken, sendGroupMessage);
router.post("/groups/:id/leave", leaveGroup);
router.post("/groups/:id/delete", deleteGroup);
export default router;
