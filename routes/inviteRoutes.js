import express from "express";
import { authenticateToken } from "../middlewares/authMiddleware.js";
import { myInvites, acceptInvite, declineInvite, sendInvite,} from "../controllers/groupInviteController.js";

const router = express.Router();

router.get("/invites", authenticateToken, myInvites);
router.post("/groups/:id/invite", authenticateToken, sendInvite);
router.post("/invites/:inviteId/accept", authenticateToken, acceptInvite);
router.post("/invites/:inviteId/decline", authenticateToken, declineInvite);

export default router;
