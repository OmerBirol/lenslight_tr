import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["dm", "group"], default: "group" },

    name: { type: String, required: true, trim: true, maxlength: 60 },

    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

conversationSchema.index({ members: 1 });

export default mongoose.models.Conversation ||
  mongoose.model("Conversation", conversationSchema);
