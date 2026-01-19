import mongoose from "mongoose";

const groupInviteSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["pending", "accepted", "declined"], default: "pending" },
  },
  { timestamps: true }
);

groupInviteSchema.index({ group: 1, to: 1, status: 1 }, { unique: true });

export default mongoose.models.GroupInvite || mongoose.model("GroupInvite", groupInviteSchema);
